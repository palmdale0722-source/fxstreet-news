/**
 * 统一推送通知服务
 *
 * 支持两种推送渠道：
 * 1. 邮件推送（nodemailer SMTP）
 * 2. 飞书 Webhook 推送
 *
 * 推送配置由用户在「交易体系 → 通知设置」页面配置，存储于 notify_config 表。
 * 当 AI 分析结论为「建议执行」或「建议观察」时自动触发推送。
 */
import nodemailer from "nodemailer";
import { getNotifyConfig } from "./db";
import type { Signal } from "../drizzle/schema";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface SignalNotifyPayload {
  signal: Signal;
  decision: "execute" | "watch";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
}

// ─── 邮件推送 ─────────────────────────────────────────────────────────────────

/**
 * 构建 HTML 格式的邮件正文
 */
function buildEmailHtml(payload: SignalNotifyPayload): string {
  const { signal, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const decisionColor = decision === "execute" ? "#16a34a" : "#d97706";
  const decisionBg = decision === "execute" ? "#f0fdf4" : "#fffbeb";
  const decisionBorder = decision === "execute" ? "#86efac" : "#fde68a";
  const receivedTime = signal.receivedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>交易信号 AI 分析报告</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    
    <!-- 顶部标题栏 -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:24px 32px;">
      <div style="color:#94a3b8;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">FXStreet 交易信号 AI 分析</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${signal.subject.slice(0, 80)}</div>
    </div>

    <!-- AI 决策结论 -->
    <div style="padding:24px 32px 0;">
      <div style="background:${decisionBg};border:1px solid ${decisionBorder};border-radius:10px;padding:20px 24px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:22px;font-weight:800;color:${decisionColor};">${decisionLabel}</span>
          <span style="background:${decisionColor};color:#fff;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;">置信度 ${confidence}%</span>
        </div>
        <div style="color:#374151;font-size:15px;font-weight:500;line-height:1.6;">${summary}</div>
      </div>
    </div>

    <!-- 分析推理 -->
    <div style="padding:20px 32px 0;">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">📝 分析推理</div>
      <div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:3px solid #6366f1;">${reasoning.replace(/\n/g, "<br>")}</div>
    </div>

    ${marketContext ? `
    <!-- 市场背景 -->
    <div style="padding:20px 32px 0;">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">📊 市场背景</div>
      <div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;">${marketContext.replace(/\n/g, "<br>")}</div>
    </div>` : ""}

    ${riskWarning ? `
    <!-- 风险提示 -->
    <div style="padding:20px 32px 0;">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">⚠️ 风险提示</div>
      <div style="color:#92400e;font-size:14px;line-height:1.8;background:#fffbeb;border-radius:8px;padding:16px 20px;border-left:3px solid #f59e0b;">${riskWarning.replace(/\n/g, "<br>")}</div>
    </div>` : ""}

    <!-- 信号来源信息 -->
    <div style="padding:20px 32px;">
      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <div style="display:flex;flex-wrap:wrap;gap:16px;">
          <div style="flex:1;min-width:200px;">
            <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">信号来源</div>
            <div style="font-size:13px;color:#374151;font-weight:500;">${signal.fromEmail || "未知"}</div>
          </div>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">接收时间</div>
            <div style="font-size:13px;color:#374151;font-weight:500;">${receivedTime}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部说明 -->
    <div style="background:#f1f5f9;padding:16px 32px;text-align:center;">
      <div style="color:#94a3b8;font-size:12px;line-height:1.6;">此邮件由 FXStreet 交易信号 AI 分析系统自动发送<br>仅供参考，不构成投资建议，请结合自身判断谨慎操作</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 构建纯文本格式的邮件正文（作为 HTML 的备用）
 */
function buildEmailText(payload: SignalNotifyPayload): string {
  const { signal, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const receivedTime = signal.receivedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const lines = [
    `FXStreet 交易信号 AI 分析报告`,
    `${"=".repeat(40)}`,
    ``,
    `信号主题：${signal.subject}`,
    ``,
    `【AI 决策结论】`,
    `${decisionLabel}  置信度：${confidence}%`,
    `${summary}`,
    ``,
    `【分析推理】`,
    reasoning,
  ];

  if (marketContext) {
    lines.push(``, `【市场背景】`, marketContext);
  }

  if (riskWarning) {
    lines.push(``, `【风险提示】`, `⚠️ ${riskWarning}`);
  }

  lines.push(
    ``,
    `${"─".repeat(40)}`,
    `信号来源：${signal.fromEmail || "未知"}`,
    `接收时间：${receivedTime}`,
    ``,
    `此邮件由 FXStreet 交易信号 AI 分析系统自动发送，仅供参考，不构成投资建议。`
  );

  return lines.join("\n");
}

/**
 * 通过 SMTP 发送邮件通知
 */
async function sendEmailNotification(
  payload: SignalNotifyPayload,
  config: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    toEmail: string;
  }
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
      // 超时设置，避免长时间阻塞
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });

    const decisionLabel = payload.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
    const subject = `[FX信号] ${decisionLabel}｜${payload.signal.subject.slice(0, 50)}`;

    await transporter.sendMail({
      from: `"FX 信号助手" <${config.smtpUser}>`,
      to: config.toEmail,
      subject,
      text: buildEmailText(payload),
      html: buildEmailHtml(payload),
    });

    console.log(`[NotifyService] Email sent to ${config.toEmail} for signal #${payload.signal.id}`);
    return true;
  } catch (err) {
    console.error(`[NotifyService] Email send failed for signal #${payload.signal.id}:`, err);
    return false;
  }
}

// ─── 飞书 Webhook 推送 ────────────────────────────────────────────────────────

/**
 * 构建飞书富文本卡片消息
 * 使用飞书「卡片消息」格式，支持颜色高亮
 */
function buildFeishuCard(payload: SignalNotifyPayload): object {
  const { signal, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const headerColor = decision === "execute" ? "green" : "yellow";
  const receivedTime = signal.receivedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  // 构建正文元素列表
  const elements: object[] = [
    // AI 结论
    {
      tag: "div",
      text: {
        content: `**AI 分析结论：** ${summary}`,
        tag: "lark_md",
      },
    },
    {
      tag: "div",
      text: {
        content: `**置信度：** ${confidence}%`,
        tag: "lark_md",
      },
    },
    { tag: "hr" },
    // 分析推理
    {
      tag: "div",
      text: {
        content: `**📝 分析推理**\n${reasoning}`,
        tag: "lark_md",
      },
    },
  ];

  // 市场背景（可选）
  if (marketContext) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: {
        content: `**📊 市场背景**\n${marketContext}`,
        tag: "lark_md",
      },
    });
  }

  // 风险提示（可选）
  if (riskWarning) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: {
        content: `**⚠️ 风险提示**\n${riskWarning}`,
        tag: "lark_md",
      },
    });
  }

  // 信号来源信息
  elements.push({ tag: "hr" });
  elements.push({
    tag: "note",
    elements: [
      {
        tag: "plain_text",
        content: `信号来源：${signal.fromEmail || "未知"}  |  接收时间：${receivedTime}`,
      },
    ],
  });

  return {
    msg_type: "interactive",
    card: {
      schema: "2.0",
      config: { wide_screen_mode: true },
      header: {
        title: {
          content: `${decisionLabel}｜${signal.subject.slice(0, 60)}`,
          tag: "plain_text",
        },
        template: headerColor,
      },
      elements,
    },
  };
}

/**
 * 通过飞书 Webhook 发送通知
 */
async function sendFeishuNotification(
  payload: SignalNotifyPayload,
  webhookUrl: string
): Promise<boolean> {
  try {
    const body = buildFeishuCard(payload);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[NotifyService] Feishu webhook failed (${response.status}): ${detail.slice(0, 200)}`);
      return false;
    }

    const result = await response.json() as { code?: number; msg?: string };
    if (result.code !== 0) {
      console.error(`[NotifyService] Feishu webhook error: code=${result.code}, msg=${result.msg}`);
      return false;
    }

    console.log(`[NotifyService] Feishu notification sent for signal #${payload.signal.id}`);
    return true;
  } catch (err) {
    console.error(`[NotifyService] Feishu send failed for signal #${payload.signal.id}:`, err);
    return false;
  }
}

// ─── 主推送函数 ───────────────────────────────────────────────────────────────

/**
 * 推送信号分析结果
 * 根据用户在数据库中保存的通知配置，分别尝试邮件和飞书推送
 * 返回是否至少有一个渠道推送成功
 */
export async function pushSignalAnalysis(payload: SignalNotifyPayload): Promise<boolean> {
  // 从数据库读取通知配置
  const config = await getNotifyConfig();
  if (!config) {
    console.log(`[NotifyService] No notify config found, skipping push for signal #${payload.signal.id}`);
    return false;
  }

  let anySuccess = false;

  // 邮件推送
  if (
    config.emailEnabled &&
    config.smtpHost &&
    config.smtpUser &&
    config.smtpPass &&
    config.toEmail
  ) {
    const ok = await sendEmailNotification(payload, {
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort ?? 465,
      smtpSecure: config.smtpSecure ?? true,
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass,
      toEmail: config.toEmail,
    });
    if (ok) anySuccess = true;
  }

  // 飞书 Webhook 推送
  if (config.feishuEnabled && config.feishuWebhookUrl) {
    const ok = await sendFeishuNotification(payload, config.feishuWebhookUrl);
    if (ok) anySuccess = true;
  }

  if (!config.emailEnabled && !config.feishuEnabled) {
    console.log(`[NotifyService] All channels disabled, skipping push for signal #${payload.signal.id}`);
  }

  return anySuccess;
}

// ─── TradingView 交易想法推送 ──────────────────────────────────────────────────

export interface TvIdeaNotifyPayload {
  idea: import("../drizzle/schema").TvIdea;
  decision: "execute" | "watch";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
}

function buildTvIdeaEmailHtml(payload: TvIdeaNotifyPayload): string {
  const { idea, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const decisionColor = decision === "execute" ? "#16a34a" : "#d97706";
  const decisionBg = decision === "execute" ? "#f0fdf4" : "#fffbeb";
  const decisionBorder = decision === "execute" ? "#86efac" : "#fde68a";
  const pairLabel = idea.pair || idea.symbol || "未知品种";
  const publishedTime = idea.publishedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>TradingView 交易想法 AI 分析</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:24px 32px;">
      <div style="color:#94a3b8;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:6px;">TradingView 交易想法 AI 分析</div>
      <div style="display:inline-block;background:#1d4ed8;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:6px;margin-bottom:10px;">${pairLabel}</div>
      <div style="color:#fff;font-size:18px;font-weight:700;line-height:1.4;">${idea.title.slice(0, 80)}</div>
      <div style="color:#94a3b8;font-size:12px;margin-top:8px;">作者：${idea.author || "匿名"} | 发布：${publishedTime}</div>
    </div>
    <div style="padding:24px 32px 0;">
      <div style="background:${decisionBg};border:1px solid ${decisionBorder};border-radius:10px;padding:20px 24px;">
        <div style="margin-bottom:12px;">
          <span style="font-size:20px;font-weight:800;color:${decisionColor};">${decisionLabel}</span>
          <span style="background:${decisionColor};color:#fff;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;margin-left:10px;">置信度 ${confidence}%</span>
        </div>
        <div style="color:#374151;font-size:15px;font-weight:500;line-height:1.6;">${summary}</div>
      </div>
    </div>
    <div style="padding:20px 32px 0;">
      <div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">📝 分析推理</div>
      <div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:3px solid #3b82f6;">${reasoning.replace(/\n/g, "<br>")}</div>
    </div>
    ${marketContext ? `<div style="padding:20px 32px 0;"><div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">📊 市场背景</div><div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;">${marketContext.replace(/\n/g, "<br>")}</div></div>` : ""}
    ${riskWarning ? `<div style="padding:20px 32px 0;"><div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">⚠️ 风险提示</div><div style="color:#92400e;font-size:14px;line-height:1.8;background:#fffbeb;border-radius:8px;padding:16px 20px;border-left:3px solid #f59e0b;">${riskWarning.replace(/\n/g, "<br>")}</div></div>` : ""}
    <div style="padding:20px 32px;">
      <a href="${idea.link}" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">查看 TradingView 原文 →</a>
    </div>
    <div style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <div style="color:#94a3b8;font-size:12px;">此邮件由 FXStreet AI 分析系统自动发送 | 来源：TradingView 社区</div>
      <div style="color:#cbd5e1;font-size:11px;margin-top:4px;">仅供参考，不构成投资建议</div>
    </div>
  </div>
</body>
</html>`;
}

function buildTvIdeaEmailText(payload: TvIdeaNotifyPayload): string {
  const { idea, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "建议执行" : "建议观察";
  const pairLabel = idea.pair || idea.symbol || "未知品种";
  const lines: string[] = [
    `[TradingView 交易想法 AI 分析] ${decisionLabel} | ${pairLabel}`,
    ``,
    `标题：${idea.title}`,
    `作者：${idea.author || "匿名"}`,
    `货币对：${pairLabel}`,
    ``,
    `AI 分析结论：${summary}`,
    `置信度：${confidence}%`,
    ``,
    `分析推理：`,
    reasoning,
  ];
  if (marketContext) lines.push(``, `市场背景：`, marketContext);
  if (riskWarning) lines.push(``, `风险提示：`, riskWarning);
  lines.push(``, `原文链接：${idea.link}`, ``, `此邮件由 FXStreet AI 分析系统自动发送，仅供参考，不构成投资建议。`);
  return lines.join("\n");
}

/**
 * 推送 TradingView 交易想法分析结果（邮件 + 飞书）
 * 返回是否至少有一个渠道推送成功
 */
export async function pushTvIdeaAnalysis(payload: TvIdeaNotifyPayload): Promise<boolean> {
  const config = await getNotifyConfig();
  if (!config) {
    console.log(`[NotifyService] No notify config found, skipping TV idea push #${payload.idea.id}`);
    return false;
  }
  let anySuccess = false;

  // 邮件推送
  if (config.emailEnabled && config.smtpHost && config.smtpUser && config.smtpPass && config.toEmail) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort ?? 465,
        secure: config.smtpSecure ?? true,
        auth: { user: config.smtpUser, pass: config.smtpPass },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      const decisionLabel = payload.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
      const pairLabel = payload.idea.pair || payload.idea.symbol || "未知品种";
      const subject = `[TV想法] ${decisionLabel}｜${pairLabel}｜${payload.idea.title.slice(0, 40)}`;
      await transporter.sendMail({
        from: `"FX 分析助手" <${config.smtpUser}>`,
        to: config.toEmail,
        subject,
        text: buildTvIdeaEmailText(payload),
        html: buildTvIdeaEmailHtml(payload),
      });
      console.log(`[NotifyService] TV idea email sent to ${config.toEmail} for idea #${payload.idea.id}`);
      anySuccess = true;
    } catch (err) {
      console.error(`[NotifyService] TV idea email failed for idea #${payload.idea.id}:`, err);
    }
  }

  // 飞书推送（简洁卡片版）
  if (config.feishuEnabled && config.feishuWebhookUrl) {
    try {
      const decisionLabel = payload.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
      const pairLabel = payload.idea.pair || payload.idea.symbol || "未知品种";
      const headerColor = payload.decision === "execute" ? "green" : "yellow";
      const elements: object[] = [
        { tag: "div", text: { content: `**AI 结论：** ${payload.summary}`, tag: "lark_md" } },
        { tag: "div", text: { content: `**置信度：** ${payload.confidence}%`, tag: "lark_md" } },
        { tag: "hr" },
        { tag: "div", text: { content: `**📝 分析推理**\n${payload.reasoning}`, tag: "lark_md" } },
      ];
      if (payload.riskWarning) {
        elements.push({ tag: "hr" });
        elements.push({ tag: "div", text: { content: `**⚠️ 风险提示**\n${payload.riskWarning}`, tag: "lark_md" } });
      }
      elements.push({ tag: "hr" });
      elements.push({ tag: "action", actions: [{ tag: "button", text: { content: "查看 TradingView 原文", tag: "plain_text" }, url: payload.idea.link, type: "primary" }] });

      const body = {
        msg_type: "interactive",
        card: {
          schema: "2.0",
          config: { wide_screen_mode: true },
          header: {
            title: { content: `${decisionLabel}｜${pairLabel}｜${payload.idea.title.slice(0, 50)}`, tag: "plain_text" },
            template: headerColor,
          },
          elements,
        },
      };
      const resp = await fetch(config.feishuWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) {
        console.log(`[NotifyService] TV idea Feishu notification sent for idea #${payload.idea.id}`);
        anySuccess = true;
      }
    } catch (err) {
      console.error(`[NotifyService] TV idea Feishu failed for idea #${payload.idea.id}:`, err);
    }
  }

  if (!config.emailEnabled && !config.feishuEnabled) {
    console.log(`[NotifyService] All channels disabled, skipping TV idea push #${payload.idea.id}`);
  }
  return anySuccess;
}
