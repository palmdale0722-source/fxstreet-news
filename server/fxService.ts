import { invokeLLM } from "./_core/llm";
import { insertNewsItems, upsertInsight, upsertOutlook, getRecentNews, getAnalysisArticles, insertTvIdeas } from "./db";
import type { InsertTvIdea } from "../drizzle/schema";
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
    let content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    if (!content) throw new Error("Empty LLM response");
    // 处理模型返回的 markdown 代码块包裹
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
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
      let content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      if (!content) throw new Error("Empty LLM response");
      // 处理模型返回的 markdown 代码块包裹
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(content);
      await upsertOutlook({
        date,
        currency,
        outlook: parsed.outlook,
        sentiment: parsed.sentiment as "bullish" | "bearish" | "neutral",
        riskLabel: parsed.riskLabel || CURRENCY_RISK[currency],
        sourceLink: null,
      });
      console.log(`[FXService] Outlook generated for ${currency}`);
    } catch (e) {
      console.error(`[FXService] Outlook generation error for ${currency}:`, e);
    }
  }
}

// ─── TradingView 交易想法采集 ─────────────────────────────────────────────────

// G8 外汇货币对白名单
const FOREX_SYMBOLS = new Set([
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD",
  "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
  "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
  "CHFJPY", "CADJPY", "AUDJPY", "NZDJPY",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "NZDCAD", "NZDCHF",
]);

// 黄金/白银符号白名单
const METALS_SYMBOLS = new Set([
  "XAUUSD", "XAGUSD", "GOLD", "SILVER", "XAUXAG", "XAUEUR", "XAUGBP",
]);

// 主要股指符号白名单
const INDEX_SYMBOLS = new Set([
  "SPX", "SPX500", "SP500", "US500", "SPY",
  "NDX", "NAS100", "NASDAQ", "US100", "QQQ",
  "DJI", "DJ30", "US30",
  "DAX", "GER40", "GER30",
  "FTSE", "UK100",
  "NI225", "JP225",
  "CAC40", "FRA40",
  "ASX200", "AUS200",
  "HSI", "HK50",
  "VIX", "STOXX50",
]);

// 标题/描述中允许通过的关键词（无明确符号时使用）
const ALLOWED_KEYWORDS = [
  // 外汇
  "forex", "fx ", "currency", "currencies",
  "eur/usd", "gbp/usd", "usd/jpy", "usd/chf", "usd/cad", "aud/usd", "nzd/usd",
  "eur/gbp", "eur/jpy", "gbp/jpy",
  // 黄金白银
  "gold", "xauusd", "xau/usd", "silver", "xagusd", "xag/usd",
  // 股指
  "s&p 500", "s&p500", "nasdaq", "dow jones", "dax", "ftse 100", "nikkei",
  "hang seng", "stock index", "stock indices", "equity index",
];

// 明确排除的关键词（加密货币、个股、原油等）
const BLOCKED_KEYWORDS = [
  // 加密货币
  "bitcoin", "btc", "ethereum", "eth", "crypto", "altcoin", "defi", "nft",
  "binance", "coinbase", "solana", "sol", "xrp", "ripple", "dogecoin", "doge",
  "bnb", "ada", "cardano", "polygon", "matic", "avax", "avalanche", "litecoin",
  "ltc", "shiba", "pepe", "meme coin", "web3", "blockchain token",
  // 原油/大宗商品（非黄金）
  "crude oil", "wti", "brent", "natural gas", "natgas", "lumber", "copper",
  "wheat", "corn", "soybean", "coffee", "cocoa", "sugar", "cotton",
  // 个股
  "apple", "aapl", "tesla", "tsla", "amazon", "amzn", "google", "googl",
  "meta", "nvidia", "nvda", "microsoft", "msft", "netflix", "nflx",
];

function isAllowedIdea(title: string, description: string | null, symbol: string | null): boolean {
  const text = (title + " " + (description || "")).toLowerCase();

  // 先检查明确排除的关键词
  for (const blocked of BLOCKED_KEYWORDS) {
    if (text.includes(blocked)) return false;
  }

  // 如果有明确的符号，按白名单判断
  if (symbol) {
    if (FOREX_SYMBOLS.has(symbol)) return true;
    if (METALS_SYMBOLS.has(symbol)) return true;
    if (INDEX_SYMBOLS.has(symbol)) return true;
    // 有符号但不在任何白名单内，拒绝
    return false;
  }

  // 没有明确符号，用关键词匹配
  for (const kw of ALLOWED_KEYWORDS) {
    if (text.includes(kw)) return true;
  }

  // 无法判断品种，默认拒绝
  return false;
}

// 货币对符号映射：将 TradingView 的 symbol 转为标准格式
const SYMBOL_TO_PAIR: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  USDCAD: "USD/CAD", AUDUSD: "AUD/USD", NZDUSD: "NZD/USD",
  EURGBP: "EUR/GBP", EURJPY: "EUR/JPY", EURCHF: "EUR/CHF", EURCAD: "EUR/CAD",
  EURAUD: "EUR/AUD", EURNZD: "EUR/NZD",
  GBPJPY: "GBP/JPY", GBPCHF: "GBP/CHF", GBPCAD: "GBP/CAD", GBPAUD: "GBP/AUD", GBPNZD: "GBP/NZD",
  CHFJPY: "CHF/JPY", CADJPY: "CAD/JPY", AUDJPY: "AUD/JPY", NZDJPY: "NZD/JPY",
  AUDCAD: "AUD/CAD", AUDCHF: "AUD/CHF", AUDNZD: "AUD/NZD",
  CADCHF: "CAD/CHF", NZDCAD: "NZD/CAD", NZDCHF: "NZD/CHF",
  // 黄金/白银
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
};

function parseTvIdeas(xml: string): InsertTvIdea[] {
  const items: InsertTvIdea[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractTag(block, "guid");
    const guid = extractTag(block, "guid") || link;
    const description = extractTag(block, "description");
    const author = extractTag(block, "dc:creator") || extractTag(block, "author");
    const pubDate = extractTag(block, "pubDate");
    if (!title || !link || !guid) continue;
    const publishedAt = pubDate ? new Date(pubDate) : new Date();
    if (isNaN(publishedAt.getTime())) continue;

    // 提取图表截图 URL
    const imgMatch = block.match(/src=['"]([^'"]*tradingview\.com[^'"]*_mid\.png)['"]/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    // 从标题或内容中提取货币对符号
    let symbol: string | null = null;
    let pair: string | null = null;

    // 先尝试从 hint 属性提取（如 TRADENATION:USDJPY）
    const symbolHint = block.match(/hint=['"][^:'"]+:([A-Z]{3,8})['"]/);
    if (symbolHint) {
      symbol = symbolHint[1];
      pair = SYMBOL_TO_PAIR[symbol] || null;
    }
    // 如果没有，尝试从标题提取6字母外汇符号
    if (!symbol) {
      const titleMatch = title.match(/\b([A-Z]{6})\b/);
      if (titleMatch) {
        const candidate = titleMatch[1];
        if (FOREX_SYMBOLS.has(candidate) || METALS_SYMBOLS.has(candidate)) {
          symbol = candidate;
          pair = SYMBOL_TO_PAIR[symbol] || null;
        }
      }
    }
    // 尝试从标题提取黄金/白银关键词
    if (!symbol) {
      const titleLower = title.toLowerCase();
      if (titleLower.includes("gold") || titleLower.includes("xauusd") || titleLower.includes("xau/usd")) {
        symbol = "XAUUSD";
        pair = "XAU/USD";
      } else if (titleLower.includes("silver") || titleLower.includes("xagusd") || titleLower.includes("xag/usd")) {
        symbol = "XAGUSD";
        pair = "XAG/USD";
      }
    }

    // 过滤：只保留外汇、黄金/白银、股指相关内容
    if (!isAllowedIdea(title, description, symbol)) {
      continue;
    }

    items.push({
      guid,
      title,
      link,
      description: description ? description.slice(0, 500) : null,
      author: author || null,
      symbol,
      pair,
      imageUrl,
      publishedAt,
    });
  }
  return items;
}

export async function fetchAndStoreTvIdeas(): Promise<number> {
  const url = "https://www.tradingview.com/feed/?sort=recent&type=idea&market=forex";
  try {
    const xml = await fetchRSS(url);
    const items = parseTvIdeas(xml);
    const count = await insertTvIdeas(items);
    console.log(`[FXService] TradingView ideas: fetched ${items.length}, inserted ${count}`);
    return count;
  } catch (e) {
    console.error("[FXService] TradingView RSS fetch error:", e);
    return 0;
  }
}

// ─── 全量更新 ─────────────────────────────────────────────────────────────────────────────────

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

  // 2. 采集 TradingView 交易想法
  try {
    await fetchAndStoreTvIdeas();
  } catch (e) {
    console.error("[FXService] TradingView ideas fetch error:", e);
  }

  // 3. 生成市场洞察
  let insightGenerated = false;
  try {
    await generateTodayInsight(today);
    insightGenerated = true;
  } catch (e) {
    console.error("[FXService] Failed to generate insight:", e);
  }

  // 4. 生成货币展望
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
