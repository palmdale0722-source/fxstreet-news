/**
 * TradingView 新闻流爬虫服务
 * 定期从 TradingView 新闻流抓取外汇相关新闻
 */
import * as cheerio from "cheerio";
import { getDb } from "./db";
import { tradingviewNews } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const TRADINGVIEW_NEWS_URL = "https://www.tradingview.com/news-flow/?market=forex&market_country=au,us,ca,de,jp,eu,nz,ch";

interface TradingViewNewsItem {
  title: string;
  link: string;
  description?: string;
  publishedAt: Date;
}

/**
 * 从 TradingView 新闻流页面抓取新闻
 */
export async function fetchTradingViewNews(): Promise<TradingViewNewsItem[]> {
  try {
    console.log("[TradingViewNews] Fetching news from:", TRADINGVIEW_NEWS_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(TRADINGVIEW_NEWS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.tradingview.com/",
      },
      signal: controller.signal,
    });
    


    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    
    const newsItems: TradingViewNewsItem[] = [];

    // TradingView 新闻流的 DOM 结构可能会变化，这里使用通用选择器
    // 查找所有新闻卡片（通常是 article 或具有特定类名的 div）
    const newsElements = $("article, [data-testid*='news'], .news-item, .item");
    
    console.log(`[TradingViewNews] Found ${newsElements.length} potential news elements`);

    newsElements.each((index, element) => {
      try {
        // 提取标题
        const titleEl = $(element).find("h2, h3, [data-testid*='title'], .title");
        const title = titleEl.text().trim();
        
        if (!title) return; // 跳过没有标题的元素

        // 提取链接
        const linkEl = $(element).find("a[href]").first();
        let link = linkEl.attr("href") || "";
        
        // 如果是相对链接，转换为绝对链接
        if (link && !link.startsWith("http")) {
          link = new URL(link, "https://www.tradingview.com").href;
        }

        if (!link) return; // 跳过没有链接的元素

        // 提取摘要/描述
        const descEl = $(element).find("p, .description, [data-testid*='description']").first();
        const description = descEl.text().trim();

        // 提取发布时间
        const timeEl = $(element).find("time, [data-testid*='time'], .time");
        let publishedAt = new Date();
        
        const timeAttr = timeEl.attr("datetime");
        if (timeAttr) {
          const parsedTime = new Date(timeAttr);
          if (!isNaN(parsedTime.getTime())) {
            publishedAt = parsedTime;
          }
        } else {
          // 尝试从文本中解析时间（如 "2 hours ago"）
          const timeText = timeEl.text().trim();
          publishedAt = parseRelativeTime(timeText) || publishedAt;
        }

        newsItems.push({
          title,
          link,
          description: description || undefined,
          publishedAt,
        });
      } catch (error) {
        console.warn(`[TradingViewNews] Error parsing news element ${index}:`, error);
      }
    });

    console.log(`[TradingViewNews] Extracted ${newsItems.length} news items`);
    return newsItems;
  } catch (error) {
    console.error("[TradingViewNews] Fetch error:", error);
    throw error;
  }
}

/**
 * 解析相对时间字符串（如 "2 hours ago"）
 */
function parseRelativeTime(timeStr: string): Date | null {
  if (!timeStr) return null;

  const now = new Date();
  const match = timeStr.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/i);
  
  if (!match) return null;

  const [, amount, unit] = match;
  const num = parseInt(amount, 10);
  
  switch (unit.toLowerCase()) {
    case "minute":
      return new Date(now.getTime() - num * 60 * 1000);
    case "hour":
      return new Date(now.getTime() - num * 60 * 60 * 1000);
    case "day":
      return new Date(now.getTime() - num * 24 * 60 * 60 * 1000);
    case "week":
      return new Date(now.getTime() - num * 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getTime() - num * 30 * 24 * 60 * 60 * 1000);
    case "year":
      return new Date(now.getTime() - num * 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

/**
 * 保存 TradingView 新闻到数据库
 */
export async function saveTradingViewNews(items: TradingViewNewsItem[]): Promise<{ inserted: number; skipped: number }> {
  const db = await getDb();
  if (!db) {
    console.warn("[TradingViewNews] Database not available");
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      // 检查是否已存在
      const existing = await db.select().from(tradingviewNews)
        .where(eq(tradingviewNews.link, item.link))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // 插入新闻
      await db.insert(tradingviewNews).values({
        title: item.title,
        link: item.link,
        description: item.description,
        publishedAt: item.publishedAt,
        source: "TradingView",
        createdAt: new Date(),
      });

      inserted++;
    } catch (error) {
      console.error(`[TradingViewNews] Error saving news "${item.title}":`, error);
    }
  }

  console.log(`[TradingViewNews] Saved: ${inserted} inserted, ${skipped} skipped`);
  return { inserted, skipped };
}

/**
 * 获取最近的 TradingView 新闻
 */
export async function getRecentTradingViewNews(limit = 10) {
  const db = await getDb();
  if (!db) return [];

  try {
    return await db.select().from(tradingviewNews)
      .orderBy((t) => t.publishedAt)
      .limit(limit);
  } catch (error) {
    console.error("[TradingViewNews] Error fetching recent news:", error);
    return [];
  }
}

/**
 * 定期抓取 TradingView 新闻的主函数
 */
export async function safeRunTradingViewNewsFetch(trigger: string) {
  try {
    console.log(`[TradingViewNews] Starting fetch (trigger: ${trigger})...`);
    const items = await fetchTradingViewNews();
    
    if (items.length === 0) {
      console.log("[TradingViewNews] No news items found");
      return { fetched: 0, inserted: 0, skipped: 0 };
    }

    const result = await saveTradingViewNews(items);
    console.log(`[TradingViewNews] Fetch complete: fetched=${items.length}, ${result.inserted} inserted, ${result.skipped} skipped`);
    
    return { fetched: items.length, ...result };
  } catch (error) {
    console.error(`[TradingViewNews] Fetch failed (${trigger}):`, error);
    return { fetched: 0, inserted: 0, skipped: 0, error: String(error) };
  }
}
