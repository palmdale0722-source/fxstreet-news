/**
 * 数据抓取服务
 *
 * 负责抓取以下数据源：
 * 1. TradingEconomics - G8 国家经济指标
 * 2. FXStreet - 8大央行货币政策新闻
 * 3. FXStreet - 新闻/分析 RSS（已有，此处提供统一接口）
 */

// ─── 国家配置 ─────────────────────────────────────────────────────────────────

export const COUNTRY_CONFIG = [
  { country: "united-states", currency: "USD", name: "美国", centralBank: "fed" },
  { country: "euro-area",     currency: "EUR", name: "欧元区", centralBank: "ecb" },
  { country: "japan",         currency: "JPY", name: "日本", centralBank: "boj" },
  { country: "united-kingdom",currency: "GBP", name: "英国", centralBank: "boe" },
  { country: "australia",     currency: "AUD", name: "澳大利亚", centralBank: "rba" },
  { country: "new-zealand",   currency: "NZD", name: "新西兰", centralBank: "rbnz" },
  { country: "canada",        currency: "CAD", name: "加拿大", centralBank: "boc" },
  { country: "switzerland",   currency: "CHF", name: "瑞士", centralBank: "snb" },
] as const;

export type CountryCurrency = (typeof COUNTRY_CONFIG)[number]["currency"];

// ─── 经济指标类型 ─────────────────────────────────────────────────────────────

export interface EconomicIndicator {
  name: string;
  last: string;
  previous: string;
  unit: string;
  date?: string;
}

export interface CountryEconomicData {
  currency: string;
  country: string;
  countryName: string;
  indicators: EconomicIndicator[];
  fetchedAt: Date;
}

// ─── 央行新闻类型 ─────────────────────────────────────────────────────────────

export interface CentralBankNewsItem {
  title: string;
  link: string;
  description: string;
  publishedAt: Date;
  centralBank: string;
  currency: string;
}

// ─── TradingEconomics 经济指标抓取 ────────────────────────────────────────────

// 重点关注的指标（用于 AI 分析的核心数据）
const KEY_INDICATORS = [
  "GDP Growth Rate",
  "GDP Annual Growth Rate",
  "Unemployment Rate",
  "Non Farm Payrolls",
  "Inflation Rate",
  "Inflation Rate MoM",
  "Interest Rate",
  "Balance of Trade",
  "Current Account",
  "Manufacturing PMI",
  "Services PMI",
  "Composite PMI",
  "Consumer Confidence",
  "Retail Sales MoM",
  "Business Confidence",
  "Core Inflation Rate",
  "Producer Prices",
  "Wage Growth",
  "Employment Change",
  "Claimant Count Change",
  "Business Inventories",
  "Government Debt to GDP",
  "Government Budget",
];

function extractIndicatorsFromHtml(html: string): EconomicIndicator[] {
  const indicators: EconomicIndicator[] = [];

  // 匹配表格行：<tr>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];

    // 提取所有 td 内容
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      // 去除 HTML 标签，保留纯文本
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      cells.push(text);
    }

    // 有效数据行至少有 3 列（名称、最新值、前值）
    if (cells.length >= 3 && cells[0] && cells[1]) {
      const name = cells[0].trim();
      const last = cells[1].trim();
      const previous = cells[2]?.trim() || "";
      const unit = cells[5]?.trim() || cells[4]?.trim() || "";
      const date = cells[cells.length - 1]?.trim() || "";

      // 过滤掉无效行（名称太长或包含特殊字符）
      if (name.length > 2 && name.length < 80 && !name.includes("<") && last !== "") {
        indicators.push({ name, last, previous, unit, date });
      }
    }
  }

  return indicators;
}

export async function fetchCountryEconomicData(
  countrySlug: string,
  currency: string,
  countryName: string
): Promise<CountryEconomicData> {
  const url = `https://tradingeconomics.com/${countrySlug}/indicators`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const html = await res.text();
    const allIndicators = extractIndicatorsFromHtml(html);

    // 优先返回关键指标，其次是其他指标（最多30个）
    const keyOnes = allIndicators.filter(ind =>
      KEY_INDICATORS.some(key => ind.name.toLowerCase().includes(key.toLowerCase()))
    );
    const others = allIndicators.filter(ind =>
      !KEY_INDICATORS.some(key => ind.name.toLowerCase().includes(key.toLowerCase()))
    );

    const indicators = [...keyOnes, ...others].slice(0, 30);

    console.log(`[DataScraper] ${countryName}: fetched ${allIndicators.length} indicators, keeping ${indicators.length}`);

    return {
      currency,
      country: countrySlug,
      countryName,
      indicators,
      fetchedAt: new Date(),
    };
  } catch (e) {
    console.error(`[DataScraper] Failed to fetch ${countryName} indicators:`, e);
    return {
      currency,
      country: countrySlug,
      countryName,
      indicators: [],
      fetchedAt: new Date(),
    };
  }
}

export async function fetchAllCountriesEconomicData(): Promise<CountryEconomicData[]> {
  const results: CountryEconomicData[] = [];

  for (const cfg of COUNTRY_CONFIG) {
    const data = await fetchCountryEconomicData(cfg.country, cfg.currency, cfg.name);
    results.push(data);
    // 避免请求过于频繁
    await new Promise(r => setTimeout(r, 1500));
  }

  return results;
}

// ─── FXStreet 央行新闻抓取 ────────────────────────────────────────────────────

function parseFxStreetArticles(html: string, centralBank: string, currency: string): CentralBankNewsItem[] {
  const articles: CentralBankNewsItem[] = [];

  // 提取文章链接和标题
  const articleRegex = /<h[23][^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = articleRegex.exec(html)) !== null) {
    const link = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();

    if (!title || title.length < 10) continue;
    if (!link.includes("fxstreet.com")) continue;

    // 尝试提取发布时间
    const timeRegex = new RegExp(`${link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,500}?<time[^>]+datetime="([^"]+)"`, 'i');
    const timeMatch = timeRegex.exec(html);
    const publishedAt = timeMatch ? new Date(timeMatch[1]) : new Date();

    articles.push({
      title,
      link,
      description: "",
      publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      centralBank,
      currency,
    });
  }

  return articles.slice(0, 10); // 每个央行最多10条
}

export async function fetchCentralBankNews(
  centralBank: string,
  currency: string
): Promise<CentralBankNewsItem[]> {
  const url = `https://www.fxstreet.com/macroeconomics/central-banks/${centralBank}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }

    const html = await res.text();

    // 使用更精确的方式提取文章列表
    const articles: CentralBankNewsItem[] = [];

    // 匹配 article 标签或 h2/h3/h4 中的链接
    const linkRegex = /<(?:article|h[234])[^>]*>[\s\S]*?<a[^>]+href="(https:\/\/www\.fxstreet\.com\/news\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const link = match[1];
      const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (!title || title.length < 10 || title.length > 300) continue;

      articles.push({
        title,
        link,
        description: "",
        publishedAt: new Date(),
        centralBank,
        currency,
      });
    }

    // 如果上面没找到，用更宽泛的方式
    if (articles.length === 0) {
      const fallbackRegex = /<a[^>]+href="(https:\/\/www\.fxstreet\.com\/news\/[^"]+)"[^>]*>([\s\S]{10,200}?)<\/a>/gi;
      while ((match = fallbackRegex.exec(html)) !== null) {
        const link = match[1];
        const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (!title || title.length < 10) continue;
        articles.push({
          title,
          link,
          description: "",
          publishedAt: new Date(),
          centralBank,
          currency,
        });
        if (articles.length >= 10) break;
      }
    }

    console.log(`[DataScraper] ${centralBank.toUpperCase()}: fetched ${articles.length} articles`);
    return articles.slice(0, 10);
  } catch (e) {
    console.error(`[DataScraper] Failed to fetch ${centralBank} news:`, e);
    return [];
  }
}

export async function fetchAllCentralBankNews(): Promise<CentralBankNewsItem[]> {
  const allNews: CentralBankNewsItem[] = [];

  for (const cfg of COUNTRY_CONFIG) {
    const news = await fetchCentralBankNews(cfg.centralBank, cfg.currency);
    allNews.push(...news);
    await new Promise(r => setTimeout(r, 1000));
  }

  return allNews;
}

// ─── 格式化经济数据为 AI Prompt ────────────────────────────────────────────────

export function formatEconomicDataForPrompt(data: CountryEconomicData[]): string {
  if (!data || data.length === 0) return "暂无经济数据";

  return data.map(country => {
    if (country.indicators.length === 0) {
      return `【${country.countryName}（${country.currency}）】\n暂无数据`;
    }

    const keyData = country.indicators.slice(0, 15).map(ind => {
      const change = ind.last !== ind.previous && ind.previous
        ? ` (前值: ${ind.previous})`
        : "";
      return `  - ${ind.name}: ${ind.last}${ind.unit ? " " + ind.unit : ""}${change}`;
    }).join("\n");

    return `【${country.countryName}（${country.currency}）】\n${keyData}`;
  }).join("\n\n");
}

export function formatCentralBankNewsForPrompt(news: CentralBankNewsItem[]): string {
  if (!news || news.length === 0) return "暂无央行新闻";

  // 按央行分组
  const grouped: Record<string, CentralBankNewsItem[]> = {};
  for (const item of news) {
    const key = item.centralBank.toUpperCase();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  return Object.entries(grouped).map(([bank, items]) => {
    const currency = items[0]?.currency || "";
    const headlines = items.slice(0, 5).map(item => `  - ${item.title}`).join("\n");
    return `【${bank}（${currency}）】\n${headlines}`;
  }).join("\n\n");
}
