/**
 * 统一推送通知服务（简化版）
 *
 * 推送渠道：
 * 1. 邮件推送（nodemailer，使用 IMAP 邮箱的 SMTP 配置，固定发送到 3178903@qq.com）
 *
 * 无需用户配置，直接使用环境变量中的 IMAP 邮箱账号作为发件人。
 * Manus 内部通知由 signalAnalyzer / tvIdeaAnalyzer 直接调用 notifyOwner()。
 */
import nodemailer from "nodemailer";
// import type { Signal, TvIdea } from "../drizzle/schema"; // 类型不存在

// ─── 固定配置 ─────────────────────────────────────────────────────────────────

const TO_EMAIL = "3178903@qq.com";

/**
 * 获取发件人 SMTP 配置（使用 163 IMAP 邮箱）
 */
function getSmtpConfig() {
  const user = process.env.IMAP_EMAIL;
  const pass = process.env.IMAP_PASSWORD;
  if (!user || !pass) {
    console.warn("[NotifyService] IMAP_EMAIL or IMAP_PASSWORD not set, email push disabled");
    return null;
  }
  return {
    host: "smtp.163.com",
    port: 465,
    secure: true,
    user,
    pass,
  };
}

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface SignalNotifyPayload {
  signal: { id: number; subject: string; fromEmail?: string; receivedAt?: string }; // TODO: 使用正式的 signals 类型
  decision: "execute" | "watch";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
}

export interface TvIdeaNotifyPayload {
  idea: { id: number; title: string; link: string; author?: string; pair?: string; symbol?: string; publishedAt?: string | Date }; // TODO: 使用正式的 tvIdeas 类型
  decision: "execute" | "watch";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
}

// ─── 邮件 HTML 构建 ───────────────────────────────────────────────────────────

function buildEmailHtml(payload: SignalNotifyPayload): string {
  const { signal, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const decisionColor = decision === "execute" ? "#16a34a" : "#d97706";
  const decisionBg = decision === "execute" ? "#f0fdf4" : "#fffbeb";
  const decisionBorder = decision === "execute" ? "#86efac" : "#fde68a";
  const receivedTime = String(signal.receivedAt || '').replace("T", " ").slice(0, 19) + " UTC";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>交易信号 AI 分析报告</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:24px 32px;">
      <div style="color:#94a3b8;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">FXStreet 交易信号 AI 分析</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.3;">${signal.subject.slice(0, 80)}</div>
    </div>
    <div style="padding:24px 32px 0;">
      <div style="background:${decisionBg};border:1px solid ${decisionBorder};border-radius:10px;padding:20px 24px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:22px;font-weight:800;color:${decisionColor};">${decisionLabel}</span>
          <span style="background:${decisionColor};color:#fff;font-size:12px;font-weight:600;padding:2px 10px;border-radius:999px;">置信度 ${confidence}%</span>
        </div>
        <div style="color:#374151;font-size:15px;font-weight:500;line-height:1.6;">${summary}</div>
      </div>
    </div>
    <div style="padding:20px 32px 0;">
      <div style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">📝 分析推理</div>
      <div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;border-left:3px solid #6366f1;">${reasoning.replace(/\n/g, "<br>")}</div>
    </div>
    ${marketContext ? `<div style="padding:20px 32px 0;"><div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">📊 市场背景</div><div style="color:#374151;font-size:14px;line-height:1.8;background:#f8fafc;border-radius:8px;padding:16px 20px;">${marketContext.replace(/\n/g, "<br>")}</div></div>` : ""}
    ${riskWarning ? `<div style="padding:20px 32px 0;"><div style="font-size:13px;font-weight:600;color:#64748b;margin-bottom:10px;">⚠️ 风险提示</div><div style="color:#92400e;font-size:14px;line-height:1.8;background:#fffbeb;border-radius:8px;padding:16px 20px;border-left:3px solid #f59e0b;">${riskWarning.replace(/\n/g, "<br>")}</div></div>` : ""}
    <div style="padding:20px 32px;">
      <div style="border-top:1px solid #e2e8f0;padding-top:20px;">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">信号来源：${signal.fromEmail || "未知"}</div>
        <div style="font-size:12px;color:#94a3b8;">接收时间：${receivedTime}</div>
      </div>
    </div>
    <div style="background:#f1f5f9;padding:16px 32px;text-align:center;">
      <div style="color:#94a3b8;font-size:12px;line-height:1.6;">此邮件由 FXStreet 交易信号 AI 分析系统自动发送<br>仅供参考，不构成投资建议，请结合自身判断谨慎操作</div>
    </div>
  </div>
</body>
</html>`;
}

function buildTvIdeaEmailHtml(payload: TvIdeaNotifyPayload): string {
  const { idea, decision, confidence, summary, reasoning, marketContext, riskWarning } = payload;
  const decisionLabel = decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const decisionColor = decision === "execute" ? "#16a34a" : "#d97706";
  const decisionBg = decision === "execute" ? "#f0fdf4" : "#fffbeb";
  const decisionBorder = decision === "execute" ? "#86efac" : "#fde68a";
  const pairLabel = idea.pair || idea.symbol || "未知品种";
  const publishedTime = (typeof idea.publishedAt === 'string' ? idea.publishedAt : idea.publishedAt?.toISOString() || '').replace("T", " ").slice(0, 16) + " UTC";

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
    <div style="background:#f1f5f9;padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <div style="color:#94a3b8;font-size:12px;">此邮件由 FXStreet AI 分析系统自动发送 | 来源：TradingView 社区</div>
      <div style="color:#cbd5e1;font-size:11px;margin-top:4px;">仅供参考，不构成投资建议</div>
    </div>
  </div>
</body>
</html>`;
}

// ─── 主推送函数 ───────────────────────────────────────────────────────────────

/**
 * 推送交易信号分析结果（邮件到 3178903@qq.com）
 */
export async function pushSignalAnalysis(payload: SignalNotifyPayload): Promise<boolean> {
  const smtp = getSmtpConfig();
  if (!smtp) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });

    const decisionLabel = payload.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
    const subject = `[FX信号] ${decisionLabel}｜${payload.signal.subject.slice(0, 50)}`;

    await transporter.sendMail({
      from: `"FX 信号助手" <${smtp.user}>`,
      to: TO_EMAIL,
      subject,
      html: buildEmailHtml(payload),
    });

    console.log(`[NotifyService] Signal email sent to ${TO_EMAIL} for signal #${payload.signal.id}`);
    return true;
  } catch (err) {
    console.error(`[NotifyService] Signal email failed for signal #${payload.signal.id}:`, err);
    return false;
  }
}

/**
 * 推送 TradingView 交易想法分析结果（邮件到 3178903@qq.com）
 */
export async function pushTvIdeaAnalysis(payload: TvIdeaNotifyPayload): Promise<boolean> {
  const smtp = getSmtpConfig();
  if (!smtp) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });

    const decisionLabel = payload.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
    const pairLabel = payload.idea.pair || payload.idea.symbol || "未知品种";
    const subject = `[TV想法] ${decisionLabel}｜${pairLabel}｜${payload.idea.title.slice(0, 40)}`;

    await transporter.sendMail({
      from: `"FX 分析助手" <${smtp.user}>`,
      to: TO_EMAIL,
      subject,
      html: buildTvIdeaEmailHtml(payload),
    });

    console.log(`[NotifyService] TV idea email sent to ${TO_EMAIL} for idea #${payload.idea.id}`);
    return true;
  } catch (err) {
    console.error(`[NotifyService] TV idea email failed for idea #${payload.idea.id}:`, err);
    return false;
  }
}
