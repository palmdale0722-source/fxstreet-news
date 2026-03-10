/**
 * 全量历史邮件导入脚本（优化版：批量 INSERT IGNORE）
 * 用法: node scripts/import-all-emails.mjs
 */
import { createRequire } from "module";
import mysql from "mysql2/promise";
import { simpleParser } from "mailparser";
import dotenv from "dotenv";
dotenv.config();

const _require = createRequire(import.meta.url);
const Imap = _require("imap-mkl");

function decodeBody(rawBody) {
  const stripped = rawBody.replace(/\s/g, "");
  const isBase64 =
    stripped.length > 0 &&
    stripped.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+=*$/.test(stripped);
  if (isBase64) {
    try {
      const decoded = Buffer.from(stripped, "base64").toString("utf8");
      if (/[\x20-\x7E\u4e00-\u9fff]/.test(decoded)) return decoded;
    } catch {}
  }
  return rawBody;
}

function fetchBatch(imap, start, end) {
  return new Promise((resolve, reject) => {
    const results = [];
    const fetch = imap.seq.fetch(`${start}:${end}`, {
      bodies: ["HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)", "TEXT"],
      struct: true,
    });
    const parsePromises = [];

    fetch.on("message", (msg) => {
      const chunks = [];
      const headerChunks = [];
      msg.on("body", (stream, info) => {
        const buffers = [];
        stream.on("data", (chunk) => buffers.push(chunk));
        stream.once("end", () => {
          if (info.which.startsWith("HEADER")) headerChunks.push(...buffers);
          else chunks.push(...buffers);
        });
      });
      msg.once("end", () => {
        const p = (async () => {
          try {
            const fullRaw = Buffer.concat([...headerChunks, ...chunks]);
            const parsed = await simpleParser(fullRaw);
            const messageId = parsed.messageId || `${parsed.date?.getTime()}-${Math.random()}`;
            const subject = parsed.subject || "(无主题)";
            const htmlText = typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, "") : "";
            let rawBody = parsed.text || htmlText || "";
            rawBody = decodeBody(rawBody);
            const fromEmail = parsed.from?.value?.[0]?.address || "";
            const receivedAt = parsed.date || new Date();
            results.push({ messageId, subject, body: rawBody.trim(), fromEmail, receivedAt });
          } catch {}
        })();
        parsePromises.push(p);
      });
    });

    fetch.once("error", reject);
    fetch.once("end", async () => {
      await Promise.all(parsePromises);
      resolve(results);
    });
  });
}

async function main() {
  // 直接用 mysql2 连接，使用 INSERT IGNORE 批量写入
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const imap = new Imap({
    user: process.env.IMAP_EMAIL,
    password: process.env.IMAP_PASSWORD,
    host: "imap.163.com",
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    connTimeout: 30000,
    authTimeout: 15000,
    id: { name: "FXStreetSignal", version: "1.0", vendor: "FXStreet" },
  });

  await new Promise((resolve, reject) => {
    imap.once("ready", resolve);
    imap.once("error", reject);
    imap.connect();
  });

  const box = await new Promise((resolve, reject) => {
    imap.openBox("INBOX", false, (err, b) => (err ? reject(err) : resolve(b)));
  });

  const total = box.messages.total;
  console.log(`收件箱共 ${total} 封邮件，开始分批拉取...`);

  const BATCH_SIZE = 100;
  let allItems = [];

  for (let start = 1; start <= total; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, total);
    process.stdout.write(`\r拉取 ${end}/${total}...`);
    try {
      const items = await fetchBatch(imap, start, end);
      allItems.push(...items);
    } catch (e) {
      console.error(`\n批次 ${start}-${end} 失败:`, e.message);
    }
  }

  imap.end();
  console.log(`\n拉取完成，共 ${allItems.length} 封，开始批量写入数据库...`);

  // 批量 INSERT IGNORE（每次100条）
  let inserted = 0;
  const INSERT_BATCH = 100;
  for (let i = 0; i < allItems.length; i += INSERT_BATCH) {
    const batch = allItems.slice(i, i + INSERT_BATCH);
    const values = batch.map(item => [
      item.messageId,
      item.subject,
      item.body,
      item.fromEmail,
      item.receivedAt,
      "pending",
    ]);
    try {
      const [result] = await conn.query(
        `INSERT IGNORE INTO signals (messageId, subject, body, fromEmail, receivedAt, status) VALUES ?`,
        [values]
      );
      inserted += result.affectedRows;
      process.stdout.write(`\r写入 ${Math.min(i + INSERT_BATCH, allItems.length)}/${allItems.length}...`);
    } catch (e) {
      console.error(`\n写入批次 ${i}-${i + INSERT_BATCH} 失败:`, e.message);
    }
  }

  await conn.end();
  const skipped = allItems.length - inserted;
  console.log(`\n全部完成！inserted=${inserted}, skipped(重复)=${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
