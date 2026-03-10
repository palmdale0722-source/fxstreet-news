/**
 * IMAP 邮件拉取服务
 * 连接 163 邮箱，拉取未读信号邮件并入库
 */
// imap-mkl 是专为解决 163/126 邮箱 Unsafe Login 问题而修改的 node-imap 分支
// 它在登录前自动发送 IMAP ID 命令，符合网易邮箱的安全要求
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const Imap = _require("imap-mkl") as typeof import("imap");
import { simpleParser } from "mailparser";
import { getDb } from "./db";
import { signals } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const IMAP_HOST = "imap.163.com";
const IMAP_PORT = 993;

export interface FetchResult {
  fetched: number;
  inserted: number;
  errors: number;
}

/**
 * 连接 IMAP 并拉取收件箱中的最新邮件
 * @param email 163 邮箱地址
 * @param password 邮箱密码或授权码
 * @param maxMessages 最多拉取多少封（默认50）
 */
export async function fetchSignalEmails(
  email: string,
  password: string,
  maxMessages = 50
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: email,
      password,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 10000,
      // imap-mkl 需要的 ID 信息，用于通过 163 邮箱的安全验证
      // 用 as any 绕过标准 imap 类型定义中没有 id 字段的限制
      ...({ id: { name: "FXStreetSignal", version: "1.0", vendor: "FXStreet" } } as any),
    });

    const result: FetchResult = { fetched: 0, inserted: 0, errors: 0 };

    imap.once("ready", () => {
      imap.openBox("INBOX", false, (err: any, box: any) => {
        if (err) {
          imap.end();
          return reject(new Error(`打开收件箱失败: ${err.message}`));
        }

        const total = box.messages.total;
        if (total === 0) {
          imap.end();
          return resolve(result);
        }

        // 拉取最新的 maxMessages 封
        const start = Math.max(1, total - maxMessages + 1);
        const range = `${start}:${total}`;

        const fetch = imap.seq.fetch(range, {
          bodies: ["HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)", "TEXT"],
          struct: true,
        });

        const parsePromises: Promise<void>[] = [];

        fetch.on("message", (msg: any) => {
          result.fetched++;
          const chunks: Buffer[] = [];
          let headerChunks: Buffer[] = [];

          msg.on("body", (stream: any, info: any) => {
            const buffers: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => buffers.push(chunk));
            stream.once("end", () => {
              if (info.which.startsWith("HEADER")) {
                headerChunks = buffers;
              } else {
                chunks.push(...buffers);
              }
            });
          });

          msg.once("end", () => {
            const p = (async () => {
              try {
                const fullRaw = Buffer.concat([...headerChunks, ...chunks]);
                const parsed = await simpleParser(fullRaw);

                const messageId =
                  parsed.messageId ||
                  `${parsed.date?.getTime()}-${Math.random()}`;
                const subject = parsed.subject || "(无主题)";
                const htmlText = typeof parsed.html === "string"
                  ? parsed.html.replace(/<[^>]+>/g, "")
                  : "";
                let rawBody = parsed.text || htmlText || "";

                // 处理 163 邮箱将正文以 base64 编码返回的情况
                // 判断条件：内容去掉空白和换行后全部是 base64 字符，且长度是 4 的倍数
                const stripped = rawBody.replace(/\s/g, "");
                const isBase64 =
                  stripped.length > 0 &&
                  stripped.length % 4 === 0 &&
                  /^[A-Za-z0-9+/]+=*$/.test(stripped);
                if (isBase64) {
                  try {
                    const decoded = Buffer.from(stripped, "base64").toString("utf8");
                    // 解码后内容应包含可读字符，否则保留原始内容
                    if (/[\x20-\x7E\u4e00-\u9fff]/.test(decoded)) {
                      rawBody = decoded;
                    }
                  } catch {
                    // 解码失败则保留原始内容
                  }
                }
                const body = rawBody;
                const fromEmail =
                  parsed.from?.value?.[0]?.address || "";
                const receivedAt = parsed.date || new Date();

                const db = await getDb();
                if (!db) return;

                // 去重：messageId 唯一
                const existing = await db
                  .select({ id: signals.id })
                  .from(signals)
                  .where(eq(signals.messageId, messageId))
                  .limit(1);

                if (existing.length > 0) return;

                await db.insert(signals).values({
                  messageId,
                  subject,
                  body: body.trim(),
                  fromEmail,
                  receivedAt,
                  status: "pending",
                });
                result.inserted++;
              } catch (e) {
                result.errors++;
                console.error("[IMAP] Parse/insert error:", e);
              }
            })();
            parsePromises.push(p);
          });
        });

        fetch.once("error", (err: any) => {
          console.error("[IMAP] Fetch error:", err);
          result.errors++;
        });

        fetch.once("end", async () => {
          await Promise.all(parsePromises);
          imap.end();
          resolve(result);
        });
      });
    });

    imap.once("error", (err: Error) => {
      reject(new Error(`IMAP 连接失败: ${err.message}`));
    });

    imap.once("end", () => {
      // connection closed
    });

    imap.connect();
  });
}
