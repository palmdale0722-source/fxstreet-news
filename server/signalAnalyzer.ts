/**
 * 交易信号 AI 自动分析服务
 *
 * 每当 IMAP 拉取到新信号后，对所有已配置 API 的用户执行 AI 分析，
 * 将结论存入 signal_analyses 表，并通过 Manus 通知服务推送给用户。
 */
import {
  getAllUsersWithApiConfig,
  getSignalAnalysis,
  saveSignalAnalysis,
  markSignalAnalysisNotified,
  getNewsContextForAgent,
  getLatestInsightAndOutlooks,
  getActiveTradingSystem,
} from "./db";
import { notifyOwner } from "./_core/notification";
import { pushSignalAnalysis } from "./notifyService";
import type { Signal } from "../drizzle/schema";

// ─── 规范化 API URL ────────────────────────────────────────────────────────────
function normalizeApiUrl(url: string): string {
  let apiUrl = url.trim().replace(/\/$/, "");
  if (!apiUrl.endsWith("/chat/completions")) {
    if (apiUrl.endsWith("/v1")) {
      apiUrl = apiUrl + "/chat/completions";
    } else if (!apiUrl.includes("/v1")) {
      apiUrl = apiUrl + "/v1/chat/completions";
    } else {
      apiUrl = apiUrl + "/chat/completions";
    }
  }
  return apiUrl;
}

// ─── 调用用户自带 LLM API ──────────────────────────────────────────────────────
async function callUserLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxTokens = 2048
): Promise<string> {
  const url = normalizeApiUrl(apiUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,  // 决策分析用较低温度，保持稳定
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`AI API 请求失败 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (data.error) {
    throw new Error(`AI API 返回错误: ${data.error.message}`);
  }

  return data.choices?.[0]?.message?.content ?? "";
}

// ─── 构建分析 Prompt ──────────────────────────────────────────────────────────
async function buildAnalysisPrompt(
  signal: Signal,
  userId: number
): Promise<{ systemPrompt: string; userPrompt: string }> {
  // 并行获取市场上下文和用户交易体系
  const [newsCtx, { insight, outlooks }, tradingSystemItems] = await Promise.all([
    getNewsContextForAgent(10),
    getLatestInsightAndOutlooks(),
    getActiveTradingSystem(userId),
  ]);

  // 构建市场背景部分
  const marketSection = insight
    ? `【今日市场洞察】\n${insight.summary}\n外汇：${insight.forex || "暂无"}\n建议：${insight.tradingAdvice || "暂无"}`
    : "【今日市场洞察】暂无数据";

  const outlookSection = outlooks.length > 0
    ? `【货币展望】\n${outlooks.slice(0, 6).map((o: { currency: string; sentiment: string; outlook: string }) => `${o.currency}: ${o.sentiment} - ${o.outlook.slice(0, 100)}`).join("\n")}`
    : "";

  const newsSection = newsCtx
    ? `【最新新闻摘要】\n${newsCtx.slice(0, 800)}`
    : "";

  // 构建用户交易体系部分
  const tradingSystemSection = tradingSystemItems.length > 0
    ? `【用户交易体系与规则】\n${tradingSystemItems.map((item: { category: string; title: string; content: string }) => `[${item.category}] ${item.title}: ${item.content}`).join("\n")}`
    : "";

  const systemPrompt = `你是一位专业的外汇交易分析师。你的任务是分析收到的交易信号邮件，结合当前市场状况和用户的交易体系，给出明确的交易决策建议。

你必须以严格的 JSON 格式返回分析结果，不要包含任何 markdown 代码块，直接输出 JSON 对象：
{
  "decision": "execute" | "watch" | "ignore",
  "confidence": 0-100,
  "summary": "一句话结论（30字以内）",
  "reasoning": "详细分析推理（200字以内）",
  "marketContext": "当前市场背景简述（100字以内）",
  "riskWarning": "主要风险提示（100字以内，如无风险可为空字符串）"
}

决策标准：
- execute（建议执行）：信号方向与市场趋势一致，符合用户交易体系，风险可控
- watch（建议观察）：信号有一定价值但存在不确定因素，建议等待更好入场时机
- ignore（建议忽略）：信号与市场趋势相悖，或不符合用户交易体系，风险过高

${marketSection}

${outlookSection}

${newsSection}

${tradingSystemSection}`;

  const userPrompt = `请分析以下交易信号邮件：

发件人：${signal.fromEmail || "未知"}
主题：${signal.subject}
接收时间：${signal.receivedAt.toISOString()}

邮件正文：
${signal.body.slice(0, 2000)}

请给出你的交易决策分析。`;

  return { systemPrompt, userPrompt };
}

// ─── 解析 AI 返回的 JSON ──────────────────────────────────────────────────────
function parseAnalysisResult(raw: string): {
  decision: "execute" | "watch" | "ignore";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
} | null {
  try {
    // 去除可能的 markdown 代码块
    const cleaned = raw.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    // 验证必要字段
    if (!["execute", "watch", "ignore"].includes(parsed.decision)) return null;
    if (typeof parsed.confidence !== "number") return null;
    if (typeof parsed.summary !== "string") return null;

    return {
      decision: parsed.decision as "execute" | "watch" | "ignore",
      confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
      summary: String(parsed.summary).slice(0, 100),
      reasoning: String(parsed.reasoning || "").slice(0, 1000),
      marketContext: String(parsed.marketContext || "").slice(0, 500),
      riskWarning: String(parsed.riskWarning || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

// ─── 主函数：分析单条信号 ──────────────────────────────────────────────────────
export async function analyzeSignal(signal: Signal): Promise<void> {
  // 获取所有已配置 API 的用户
  const usersWithConfig = await getAllUsersWithApiConfig();
  if (usersWithConfig.length === 0) {
    console.log(`[SignalAnalyzer] No users with API config, skipping signal #${signal.id}`);
    return;
  }

  // 检查是否已分析过（避免重复分析）
  const existing = await getSignalAnalysis(signal.id);
  if (existing) {
    console.log(`[SignalAnalyzer] Signal #${signal.id} already analyzed, skipping`);
    return;
  }

  // 使用第一个配置了 API 的用户来分析（通常是账号所有者）
  const userConfig = usersWithConfig[0];
  const userId = userConfig.userId;

  console.log(`[SignalAnalyzer] Analyzing signal #${signal.id}: "${signal.subject}"`);

  try {
    // 构建 Prompt
    const { systemPrompt, userPrompt } = await buildAnalysisPrompt(signal, userId);

    // 调用 AI
    const rawResult = await callUserLLM(
      userConfig.apiUrl,
      userConfig.apiKey,
      userConfig.model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      2048
    );

    // 解析结果
    const analysis = parseAnalysisResult(rawResult);
    if (!analysis) {
      console.error(`[SignalAnalyzer] Failed to parse AI result for signal #${signal.id}:`, rawResult.slice(0, 200));
      return;
    }

    // 存入数据库
    await saveSignalAnalysis({
      signalId: signal.id,
      decision: analysis.decision,
      confidence: analysis.confidence,
      summary: analysis.summary,
      reasoning: analysis.reasoning,
      marketContext: analysis.marketContext,
      riskWarning: analysis.riskWarning,
      notified: false,
    });

    console.log(`[SignalAnalyzer] Signal #${signal.id} analyzed: ${analysis.decision} (${analysis.confidence}%) - ${analysis.summary}`);

    // 发送通知（仅 execute 和 watch 才通知）
    if (analysis.decision !== "ignore") {
      await sendSignalNotification(signal, analysis);
    }
  } catch (err) {
    console.error(`[SignalAnalyzer] Error analyzing signal #${signal.id}:`, err);
  }
}

// ─── 发送通知 ─────────────────────────────────────────────────────────────────
async function sendSignalNotification(
  signal: Signal,
  analysis: {
    decision: "execute" | "watch" | "ignore";
    confidence: number;
    summary: string;
    reasoning: string;
    marketContext: string;
    riskWarning: string;
  }
): Promise<void> {
  const decisionLabel = analysis.decision === "execute" ? "🟢 建议执行" : "🟡 建议观察";
  const title = `${decisionLabel}｜${signal.subject.slice(0, 50)}`;

  const content = [
    `📊 AI 分析结论：${analysis.summary}`,
    `置信度：${analysis.confidence}%`,
    ``,
    `📝 分析推理：`,
    analysis.reasoning,
    analysis.riskWarning ? `\n⚠️ 风险提示：${analysis.riskWarning}` : "",
    ``,
    `📧 信号来源：${signal.fromEmail || "未知"}`,
    `📅 接收时间：${signal.receivedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ].filter(Boolean).join("\n");

  let notified = false;

  // 1. 尝试通过 Manus 内置通知服务推送（平台内通知）
  try {
    const delivered = await notifyOwner({ title, content });
    if (delivered) {
      notified = true;
      console.log(`[SignalAnalyzer] Manus notification sent for signal #${signal.id}`);
    }
  } catch (err) {
    console.warn(`[SignalAnalyzer] Manus notification error for signal #${signal.id}:`, err);
  }

  // 2. 尝试通过用户配置的邮件/飞书渠道推送（外部通知）
  try {
    if (analysis.decision === "execute" || analysis.decision === "watch") {
      const externalDelivered = await pushSignalAnalysis({
        signal,
        decision: analysis.decision,
        confidence: analysis.confidence,
        summary: analysis.summary,
        reasoning: analysis.reasoning,
        marketContext: analysis.marketContext,
        riskWarning: analysis.riskWarning,
      });
      if (externalDelivered) {
        notified = true;
        console.log(`[SignalAnalyzer] External notification sent for signal #${signal.id}`);
      }
    }
  } catch (err) {
    console.warn(`[SignalAnalyzer] External notification error for signal #${signal.id}:`, err);
  }

  // 3. 标记已通知（只要有任意渠道成功）
  if (notified) {
    await markSignalAnalysisNotified(signal.id);
  } else {
    console.warn(`[SignalAnalyzer] All notification channels failed for signal #${signal.id}`);
  }
}

// ─── 批量分析待处理信号 ────────────────────────────────────────────────────────
// 用于启动时补分析已入库但未分析的信号
export async function analyzeUnprocessedSignals(pendingSignals: Signal[]): Promise<void> {
  if (pendingSignals.length === 0) return;
  console.log(`[SignalAnalyzer] Processing ${pendingSignals.length} unanalyzed signals`);
  for (const signal of pendingSignals) {
    await analyzeSignal(signal);
    // 每条信号分析后等待 1 秒，避免 API 限速
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
