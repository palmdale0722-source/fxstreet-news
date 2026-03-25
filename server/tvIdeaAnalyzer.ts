/**
 * TradingView 交易想法 AI 自动分析服务
 *
 * 每小时由 cronJobs 触发，对最近新增的交易想法进行 AI 分析。
 * 对于「建议执行」和「建议观察」的想法，通过 Manus 内部通知推送给用户。
 */
import {
  getAllUsersWithApiConfig,
  getTvIdeaAnalysis,
  saveTvIdeaAnalysis,
  markTvIdeaAnalysisNotified,
  getUnanalyzedTvIdeas,
  getNewsContextForAgent,
  getLatestInsightAndOutlooks,
  getActiveTradingSystem,
} from "./db";
import { notifyOwner } from "./_core/notification";
import type { TvIdea } from "../drizzle/schema";

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
  maxTokens = 1024
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
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
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
async function buildIdeaAnalysisPrompt(
  idea: TvIdea,
  userId: number
): Promise<{ systemPrompt: string; userPrompt: string }> {
  // 并行获取市场上下文和用户交易体系
  const [newsCtx, { insight, outlooks }, tradingSystemItems] = await Promise.all([
    getNewsContextForAgent(8),
    getLatestInsightAndOutlooks(),
    getActiveTradingSystem(userId),
  ]);

  // 构建市场背景部分
  const marketSection = insight
    ? `【今日市场洞察】\n${insight.summary}\n外汇：${insight.forex || "暂无"}\n建议：${insight.tradingAdvice || "暂无"}`
    : "【今日市场洞察】暂无数据";

  const outlookSection = outlooks.length > 0
    ? `【货币展望】\n${outlooks.slice(0, 6).map((o: { currency: string; sentiment: string; outlook: string }) =>
        `${o.currency}: ${o.sentiment} - ${o.outlook.slice(0, 80)}`
      ).join("\n")}`
    : "";

  const newsSection = newsCtx.length > 0
    ? `【最新新闻摘要】\n${newsCtx.slice(0, 5).map((n: { title: string; description: string | null }) =>
        `- ${n.title}${n.description ? ": " + n.description.slice(0, 80) : ""}`
      ).join("\n")}`
    : "";

  // 构建用户交易体系部分
  const tradingSystemSection = tradingSystemItems.length > 0
    ? `【用户交易体系与规则】\n${tradingSystemItems.map((item: { category: string; title: string; content: string }) =>
        `[${item.category}] ${item.title}: ${item.content}`
      ).join("\n")}`
    : "";

  const systemPrompt = `你是一位专业的外汇交易分析师。你的任务是评估来自 TradingView 社区的交易想法，结合当前市场状况和用户的交易体系，判断该想法是否值得关注或执行。

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
- execute（建议执行）：交易方向与当前市场趋势一致，分析逻辑清晰，符合用户交易体系，风险可控
- watch（建议观察）：想法有一定价值但存在不确定因素，建议关注等待确认信号
- ignore（建议忽略）：分析方向与市场趋势相悖，逻辑薄弱，或不符合用户交易体系

${marketSection}
${outlookSection}
${newsSection}
${tradingSystemSection}`;

  const pairInfo = idea.pair ? `货币对：${idea.pair}` : (idea.symbol ? `品种：${idea.symbol}` : "品种：未知");
  const userPrompt = `请评估以下 TradingView 交易想法：

标题：${idea.title}
${pairInfo}
作者：${idea.author || "匿名"}
发布时间：${idea.publishedAt.toISOString().replace("T", " ").slice(0, 16)} UTC
文章摘要：${idea.description || "（无摘要）"}
原文链接：${idea.link}

请根据以上信息，结合市场背景和用户交易体系，给出你的分析结论。`;

  return { systemPrompt, userPrompt };
}

// ─── 解析 AI 返回结果 ─────────────────────────────────────────────────────────
function parseAnalysisResult(raw: string): {
  decision: "execute" | "watch" | "ignore";
  confidence: number;
  summary: string;
  reasoning: string;
  marketContext: string;
  riskWarning: string;
} | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned);
    if (!["execute", "watch", "ignore"].includes(parsed.decision)) return null;
    return {
      decision: parsed.decision as "execute" | "watch" | "ignore",
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
      summary: String(parsed.summary || "").slice(0, 200),
      reasoning: String(parsed.reasoning || "").slice(0, 1000),
      marketContext: String(parsed.marketContext || "").slice(0, 500),
      riskWarning: String(parsed.riskWarning || "").slice(0, 500),
    };
  } catch {
    return null;
  }
}

// ─── 分析单条交易想法 ─────────────────────────────────────────────────────────
export async function analyzeTvIdea(idea: TvIdea): Promise<void> {
  // 检查是否已分析过
  const existing = await getTvIdeaAnalysis(idea.id);
  if (existing) {
    console.log(`[TvIdeaAnalyzer] Idea #${idea.id} already analyzed, skipping`);
    return;
  }

  // 获取所有已配置 API 的用户
  const usersWithConfig = await getAllUsersWithApiConfig();
  if (usersWithConfig.length === 0) {
    console.log(`[TvIdeaAnalyzer] No users with API config, skipping idea #${idea.id}`);
    return;
  }

  const userConfig = usersWithConfig[0];
  const userId = userConfig.userId;

  console.log(`[TvIdeaAnalyzer] Analyzing idea #${idea.id}: "${idea.title.slice(0, 60)}"`);

  try {
    // 构建 Prompt
    const { systemPrompt, userPrompt } = await buildIdeaAnalysisPrompt(idea, userId);

    // 调用 AI
    const rawResult = await callUserLLM(
      userConfig.apiUrl,
      userConfig.apiKey,
      userConfig.model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      1024
    );

    // 解析结果
    const analysis = parseAnalysisResult(rawResult);
    if (!analysis) {
      console.error(`[TvIdeaAnalyzer] Failed to parse AI result for idea #${idea.id}:`, rawResult.slice(0, 200));
      return;
    }

    // 存入数据库
    await saveTvIdeaAnalysis({
      tvIdeaId: idea.id,
      decision: analysis.decision,
      confidence: analysis.confidence,
      summary: analysis.summary,
      reasoning: analysis.reasoning,
      marketContext: analysis.marketContext,
      riskWarning: analysis.riskWarning,
      notified: false,
    });

    console.log(`[TvIdeaAnalyzer] Idea #${idea.id} analyzed: ${analysis.decision} (${analysis.confidence}%) - ${analysis.summary}`);

    // 仅对 execute 和 watch 发送通知
    if (analysis.decision !== "ignore") {
      await sendTvIdeaNotification(idea, analysis);
    }
  } catch (err) {
    console.error(`[TvIdeaAnalyzer] Error analyzing idea #${idea.id}:`, err);
  }
}

// ─── 发送通知（仅 Manus 内部通知）────────────────────────────────────────────
async function sendTvIdeaNotification(
  idea: TvIdea,
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
  const pairLabel = idea.pair || idea.symbol || "未知品种";

  const title = `[TV想法] ${decisionLabel}｜${pairLabel}`;
  const content = [
    `📰 ${idea.title.slice(0, 80)}`,
    `作者：${idea.author || "匿名"}`,
    ``,
    `📊 AI 分析结论：${analysis.summary}`,
    `置信度：${analysis.confidence}%`,
    ``,
    `📝 分析推理：`,
    analysis.reasoning,
    analysis.riskWarning ? `\n⚠️ 风险提示：${analysis.riskWarning}` : "",
    ``,
    `🔗 原文：${idea.link}`,
  ].filter(Boolean).join("\n");

  try {
    const delivered = await notifyOwner({ title, content });
    if (delivered) {
      await markTvIdeaAnalysisNotified(idea.id);
      console.log(`[TvIdeaAnalyzer] Manus notification sent for idea #${idea.id}`);
    } else {
      console.warn(`[TvIdeaAnalyzer] Manus notification failed for idea #${idea.id}`);
    }
  } catch (err) {
    console.warn(`[TvIdeaAnalyzer] Manus notification error for idea #${idea.id}:`, err);
  }
}

// ─── 批量分析新增交易想法（供 cronJobs 调用）────────────────────────────────
/**
 * 分析最近 sinceHours 小时内新增的、尚未分析的交易想法
 * 每条分析间隔 1.5 秒，避免 API 限速
 */
export async function analyzeNewTvIdeas(sinceHours = 2): Promise<{ analyzed: number; notified: number }> {
  const ideas = await getUnanalyzedTvIdeas(sinceHours, 20);
  if (ideas.length === 0) {
    console.log(`[TvIdeaAnalyzer] No new unanalyzed ideas in the last ${sinceHours}h`);
    return { analyzed: 0, notified: 0 };
  }

  console.log(`[TvIdeaAnalyzer] Found ${ideas.length} new ideas to analyze`);
  let analyzed = 0;
  let notified = 0;

  for (const idea of ideas) {
    try {
      // 分析前先检查是否有 execute/watch 结论（用于统计通知数）
      await analyzeTvIdea(idea);
      analyzed++;

      // 检查分析结果，统计通知数
      const result = await getTvIdeaAnalysis(idea.id);
      if (result && result.notified && result.decision !== "ignore") {
        notified++;
      }
    } catch (err) {
      console.error(`[TvIdeaAnalyzer] Failed to analyze idea #${idea.id}:`, err);
    }
    // 每条分析后等待 1.5 秒，避免 API 限速
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log(`[TvIdeaAnalyzer] Batch complete: analyzed=${analyzed}, notified=${notified}`);
  return { analyzed, notified };
}
