import { invokeLLM } from "./_core/llm";
import { insertNewsItems, upsertInsight, upsertOutlook, getRecentNews, getAnalysisArticles } from "./db";
import type { InsertNews } from "../drizzle/schema";

const CURRENCIES = ["EUR", "USD", "JPY", "AUD", "GBP", "NZD", "CHF", "CAD"] as const;

const CURRENCY_RISK: Record<string, string> = {
  EUR: "主要货币",
  USD: "避险货币",
  JPY: "避险货币",
  AUD: "风险货币",
  GBP: "主要货币",
  NZD: "风险货币",
  CHF: "避险货币",
  CAD: "商品货币",
};

// ─── RSS 抓取 ─────────────────────────────────────────────────────────────────

async function fetchRSS(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FXNewsBot/1.0)",
      "Accept": "application/rss+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  return res.text();
}

function parseRSSItems(xml: string, source: "News" | "Analysis"): InsertNews[] {
  const items: InsertNews[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractTag(block, "guid");
    const description = extractTag(block, "description");
    const pubDate = extractTag(block, "pubDate");
    const author = extractTag(block, "dc:creator") || extractTag(block, "author");
    if (!title || !link) continue;
    const publishedAt = pubDate ? new Date(pubDate) : new Date();
    if (isNaN(publishedAt.getTime())) continue;
    items.push({ title, link, description, publishedAt, source, author: author || null });
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(regex);
  return m ? m[1].trim() : "";
}

export async function fetchAndStoreNews(): Promise<{ newsCount: number; analysisCount: number }> {
  const newsUrl = "https://www.fxstreet.com/rss/news";
  const analysisUrl = "https://www.fxstreet.com/rss/analysis";
  let newsCount = 0;
  let analysisCount = 0;
  try {
    const newsXml = await fetchRSS(newsUrl);
    const newsItems = parseRSSItems(newsXml, "News");
    newsCount = await insertNewsItems(newsItems);
    console.log(`[FXService] Fetched ${newsItems.length} news, inserted ${newsCount}`);
  } catch (e) {
    console.error("[FXService] News RSS fetch error:", e);
  }
  try {
    const analysisXml = await fetchRSS(analysisUrl);
    const analysisItems = parseRSSItems(analysisXml, "Analysis");
    analysisCount = await insertNewsItems(analysisItems);
    console.log(`[FXService] Fetched ${analysisItems.length} analysis, inserted ${analysisCount}`);
  } catch (e) {
    console.error("[FXService] Analysis RSS fetch error:", e);
  }
  return { newsCount, analysisCount };
}

// ─── AI 市场洞察 ──────────────────────────────────────────────────────────────

export async function generateTodayInsight(date: string): Promise<void> {
  // 获取最新新闻标题作为上下文
  const recentNews = await getRecentNews(15);
  const analysisArticles = await getAnalysisArticles(8);
  const allTitles = [
    ...recentNews.map(n => `[新闻] ${n.title}`),
    ...analysisArticles.map(n => `[分析] ${n.title}`),
  ].join("\n");

  const prompt = `你是一位专业的外汇市场分析师。根据以下最新外汇新闻标题，生成今日（${date}）市场洞察报告。

最新新闻：
${allTitles || "暂无最新新闻，请基于当前市场背景进行分析"}

请严格按照以下JSON格式输出，所有内容用中文，每个字段100-200字：
{
  "summary": "今日市场总体概述",
  "geopolitics": "地缘政治与宏观经济分析",
  "energy": "能源价格（原油、天然气等）走势分析",
  "forex": "主要货币对汇市表现分析",
  "assets": "黄金、股指等其他资产表现",
  "tradingAdvice": "今日交易建议与风险提示"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业外汇市场分析师，输出严格的JSON格式，不要有任何多余文字。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "market_insight",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              geopolitics: { type: "string" },
              energy: { type: "string" },
              forex: { type: "string" },
              assets: { type: "string" },
              tradingAdvice: { type: "string" },
            },
            required: ["summary", "geopolitics", "energy", "forex", "assets", "tradingAdvice"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0]?.message?.content;
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    if (!content) throw new Error("Empty LLM response");
    const parsed = JSON.parse(content);
    await upsertInsight({ date, ...parsed });
    console.log(`[FXService] Insight generated for ${date}`);
  } catch (e) {
    console.error("[FXService] Insight generation error:", e);
    throw e;
  }
}

// ─── AI 货币展望 ──────────────────────────────────────────────────────────────

export async function generateCurrencyOutlooks(date: string): Promise<void> {
  const recentNews = await getRecentNews(20);
  const newsTitles = recentNews.map(n => n.title).join("\n");

  for (const currency of CURRENCIES) {
    try {
      const prompt = `你是专业外汇分析师。根据以下最新外汇新闻，为 ${currency} 生成今日（${date}）展望分析。

最新新闻：
${newsTitles || "暂无最新新闻"}

请严格按照以下JSON格式输出，中文，outlook字段150-250字：
{
  "outlook": "${currency}今日展望分析文字",
  "sentiment": "bullish或bearish或neutral之一",
  "riskLabel": "${CURRENCY_RISK[currency]}"
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "你是专业外汇分析师，输出严格JSON，不要有多余文字。" },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "currency_outlook",
            strict: true,
            schema: {
              type: "object",
              properties: {
                outlook: { type: "string" },
                sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                riskLabel: { type: "string" },
              },
              required: ["outlook", "sentiment", "riskLabel"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = response.choices[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      if (!content) throw new Error("Empty LLM response");
      const parsed = JSON.parse(content);
      await upsertOutlook({
        date,
        currency,
        outlook: parsed.outlook,
        sentiment: parsed.sentiment as "bullish" | "bearish" | "neutral",
        riskLabel: parsed.riskLabel || CURRENCY_RISK[currency],
        sourceLink: `https://www.fxstreet.com/currencies/${currency.toLowerCase()}`,
      });
      console.log(`[FXService] Outlook generated for ${currency}`);
    } catch (e) {
      console.error(`[FXService] Outlook generation error for ${currency}:`, e);
    }
  }
}

// ─── 全量更新 ─────────────────────────────────────────────────────────────────

export async function runFullUpdate(): Promise<{
  newsCount: number;
  analysisCount: number;
  insightGenerated: boolean;
  outlooksGenerated: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[FXService] Starting full update for ${today}`);

  // 1. 抓取 RSS
  const { newsCount, analysisCount } = await fetchAndStoreNews();

  // 2. 生成市场洞察
  let insightGenerated = false;
  try {
    await generateTodayInsight(today);
    insightGenerated = true;
  } catch (e) {
    console.error("[FXService] Failed to generate insight:", e);
  }

  // 3. 生成货币展望
  let outlooksGenerated = 0;
  try {
    await generateCurrencyOutlooks(today);
    outlooksGenerated = CURRENCIES.length;
  } catch (e) {
    console.error("[FXService] Failed to generate outlooks:", e);
  }

  console.log(`[FXService] Full update done: news=${newsCount}, analysis=${analysisCount}, insight=${insightGenerated}, outlooks=${outlooksGenerated}`);
  return { newsCount, analysisCount, insightGenerated, outlooksGenerated };
}
