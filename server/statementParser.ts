/**
 * MT4 DetailedStatement.htm 解析器
 * 将 MT4 导出的 HTML 对账单解析为结构化交易记录
 */
import * as cheerio from "cheerio";

export interface ParsedTrade {
  ticket: string;          // MT4 订单号
  openTime: Date;          // 开仓时间
  closeTime: Date | null;  // 平仓时间（未平仓为 null）
  direction: "buy" | "sell";
  lotSize: string;         // 手数
  pair: string;            // 货币对，如 EUR/USD（大写+斜杠）
  entryPrice: string;      // 入场价
  exitPrice: string | null;// 出场价
  stopLoss: string | null; // 止损
  takeProfit: string | null;// 止盈
  commission: string;      // 手续费
  swap: string;            // 隔夜利息
  pnl: string;             // 盈亏（USD）
  status: "closed" | "open";
  ea: string | null;       // EA 名称（从 title 属性提取）
  tags: string;            // 自动生成的标签
}

export interface ParseResult {
  trades: ParsedTrade[];
  summary: {
    accountNumber: string;
    accountName: string;
    currency: string;
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    balance: string;
    equity: string;
    totalNetProfit: string;
    profitFactor: string;
    dateRange: string;
  };
  errors: string[];
}

/**
 * 将 MT4 货币对格式（如 eurusd）转换为标准格式（如 EUR/USD）
 */
function normalizePair(raw: string): string {
  const s = raw.toUpperCase().replace("/", "");
  // 常见 6 位货币对
  const knownPairs: Record<string, string> = {
    EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY",
    USDCHF: "USD/CHF", AUDUSD: "AUD/USD", NZDUSD: "NZD/USD",
    USDCAD: "USD/CAD", EURGBP: "EUR/GBP", EURJPY: "EUR/JPY",
    GBPJPY: "GBP/JPY", AUDJPY: "AUD/JPY", CHFJPY: "CHF/JPY",
    EURAUD: "EUR/AUD", EURCHF: "EUR/CHF", GBPCHF: "GBP/CHF",
    AUDNZD: "AUD/NZD", AUDCAD: "AUD/CAD", NZDCAD: "NZD/CAD",
    NZDCHF: "NZD/CHF", NZDJPY: "NZD/JPY", CADCHF: "CAD/CHF",
    CADJPY: "CAD/JPY", GBPAUD: "GBP/AUD", GBPCAD: "GBP/CAD",
    GBPNZD: "GBP/NZD", EURCAD: "EUR/CAD", EURNZD: "EUR/NZD",
    AUDCHF: "AUD/CHF",
    XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
    USDHKD: "USD/HKD", USDSGD: "USD/SGD", USDMXN: "USD/MXN",
    USDZAR: "USD/ZAR", USDNOK: "USD/NOK", USDSEK: "USD/SEK",
    USDDKK: "USD/DKK",
  };
  if (knownPairs[s]) return knownPairs[s];
  // 未知货币对：尝试 3+3 拆分
  if (s.length === 6) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}

/**
 * 解析 MT4 时间字符串 "2026.03.05 18:15:03" -> Date (UTC)
 */
function parseMt4Date(raw: string): Date | null {
  if (!raw || raw.trim() === "" || raw === "\u00a0") return null;
  // 格式: 2026.03.05 18:15:03
  const match = raw.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * 从 title 属性提取 EA 名称，如 "#23794 TrendKiller/2019-0[tp]" -> "TrendKiller"
 */
function extractEaName(title: string | undefined): string | null {
  if (!title) return null;
  const match = title.match(/#\d+\s+([^/\s]+)/);
  return match ? match[1] : null;
}

/**
 * 自动生成标签
 */
function generateTags(trade: Omit<ParsedTrade, "tags">): string {
  const tags: string[] = [];
  const pnl = parseFloat(trade.pnl);
  if (!isNaN(pnl)) {
    tags.push(pnl >= 0 ? "盈利" : "亏损");
  }
  if (trade.status === "open") tags.push("持仓中");
  if (trade.ea) tags.push(`EA:${trade.ea}`);
  // 判断是否触及止盈/止损
  if (trade.closeTime && trade.exitPrice && trade.takeProfit) {
    const exit = parseFloat(trade.exitPrice);
    const tp = parseFloat(trade.takeProfit);
    if (Math.abs(exit - tp) < 0.00005) tags.push("止盈");
  }
  if (trade.closeTime && trade.exitPrice && trade.stopLoss) {
    const exit = parseFloat(trade.exitPrice);
    const sl = parseFloat(trade.stopLoss);
    if (Math.abs(exit - sl) < 0.00005) tags.push("止损");
  }
  tags.push("MT4导入");
  return tags.join(",");
}

/**
 * 主解析函数
 */
export function parseDetailedStatement(html: string): ParseResult {
  const $ = cheerio.load(html);
  const errors: string[] = [];
  const trades: ParsedTrade[] = [];

  // ── 提取账户信息 ──
  const titleText = $("title").text(); // "Statement: 11068407 - qianfeng wang"
  const titleMatch = titleText.match(/Statement:\s*(\S+)\s*-\s*(.+)/);
  const accountNumber = titleMatch ? titleMatch[1] : "";
  const accountName = titleMatch ? titleMatch[2].trim() : "";

  // 从表格头提取账户信息
  let currency = "USD";
  $("tr").each((_, row) => {
    const text = $(row).text();
    if (text.includes("Currency:")) {
      const m = text.match(/Currency:\s*(\w+)/);
      if (m) currency = m[1];
    }
  });

  // ── 解析汇总数据 ──
  let totalNetProfit = "";
  let profitFactor = "";
  let balance = "";
  let equity = "";
  let totalTrades = 0;

  $("tr").each((_, row) => {
    const text = $(row).text().replace(/\s+/g, " ").trim();
    if (text.includes("Total Net Profit:")) {
      const cells = $(row).find("td");
      cells.each((i, cell) => {
        const t = $(cell).text().trim();
        if (i > 0 && t && !t.includes("Net Profit") && !t.includes("Gross")) {
          if (!totalNetProfit) totalNetProfit = t.replace(/\s/g, "");
        }
      });
    }
    if (text.includes("Profit Factor:")) {
      const cells = $(row).find("td");
      cells.each((i, cell) => {
        const t = $(cell).text().trim();
        if (i > 0 && t && !t.includes("Profit Factor") && !t.includes("Expected")) {
          if (!profitFactor) profitFactor = t.replace(/\s/g, "");
        }
      });
    }
    if (text.includes("Balance:") && !text.includes("Closed")) {
      const cells = $(row).find("td");
      cells.each((i, cell) => {
        const t = $(cell).text().trim().replace(/\s/g, "");
        if (i > 0 && t && !isNaN(parseFloat(t.replace(",", "")))) {
          if (!balance) balance = t;
        }
      });
    }
    if (text.includes("Equity:")) {
      const cells = $(row).find("td");
      cells.each((i, cell) => {
        const t = $(cell).text().trim().replace(/\s/g, "");
        if (i > 0 && t && !isNaN(parseFloat(t.replace(",", "")))) {
          if (!equity) equity = t;
        }
      });
    }
    if (text.includes("Total Trades:")) {
      const cells = $(row).find("td");
      cells.each((i, cell) => {
        const t = $(cell).text().trim().replace(/\s/g, "");
        if (i > 0 && /^\d+$/.test(t)) {
          if (!totalTrades) totalTrades = parseInt(t);
        }
      });
    }
  });

  // ── 解析交易行 ──
  // 交易行特征：第一个 td 有 title 属性（如 "#23794 TrendKiller/2019-0"），且有 14 列
  let closedCount = 0;
  let openCount = 0;
  let inClosedSection = false;
  let inOpenSection = false;

  $("tr").each((rowIdx, row) => {
    const rowText = $(row).text().trim();
    // 检测区段标题
    if (rowText.includes("Closed Transactions:")) { inClosedSection = true; inOpenSection = false; return; }
    if (rowText.includes("Open Trades:")) { inOpenSection = true; inClosedSection = false; return; }
    if (rowText.includes("Working Orders:") || rowText.includes("Summary:")) {
      inClosedSection = false; inOpenSection = false; return;
    }

    const cells = $(row).find("td");
    if (cells.length < 13) return;

    // 第一列 td 必须有 title 属性（订单号行的特征）
    const firstTd = cells.first();
    const titleAttr = firstTd.attr("title");
    if (!titleAttr) return;

    // 提取各列数据
    const ticket = firstTd.text().trim();
    const openTimeRaw = $(cells[1]).text().trim();
    const typeRaw = $(cells[2]).text().trim().toLowerCase();
    const lotSizeRaw = $(cells[3]).text().trim();
    const itemRaw = $(cells[4]).text().trim();
    const entryPriceRaw = $(cells[5]).text().trim();
    const slRaw = $(cells[6]).text().trim();
    const tpRaw = $(cells[7]).text().trim();
    const closeTimeRaw = $(cells[8]).text().trim();
    const exitPriceRaw = $(cells[9]).text().trim();
    const commissionRaw = $(cells[10]).text().trim();
    // cells[11] = taxes (skip)
    const swapRaw = $(cells[12]).text().trim();
    const pnlRaw = cells.length >= 14 ? $(cells[13]).text().trim() : "0";

    // 验证方向
    if (typeRaw !== "buy" && typeRaw !== "sell") return;

    const openTime = parseMt4Date(openTimeRaw);
    if (!openTime) {
      errors.push(`Row ${rowIdx}: 无法解析开仓时间 "${openTimeRaw}"`);
      return;
    }

    const closeTime = parseMt4Date(closeTimeRaw);
    const isOpen = closeTime === null;
    const pair = normalizePair(itemRaw);
    const ea = extractEaName(titleAttr);

    // 清理数值（去掉空格）
    const cleanNum = (s: string) => s.replace(/\s/g, "").replace(",", "");
    const sl = slRaw && slRaw !== "0.00000" && parseFloat(slRaw) !== 0 ? slRaw : null;
    const tp = tpRaw && tpRaw !== "0.00000" && parseFloat(tpRaw) !== 0 ? tpRaw : null;

    const tradeBase: Omit<ParsedTrade, "tags"> = {
      ticket,
      openTime,
      closeTime,
      direction: typeRaw as "buy" | "sell",
      lotSize: cleanNum(lotSizeRaw),
      pair,
      entryPrice: entryPriceRaw,
      exitPrice: isOpen ? null : exitPriceRaw,
      stopLoss: sl,
      takeProfit: tp,
      commission: cleanNum(commissionRaw),
      swap: cleanNum(swapRaw),
      pnl: cleanNum(pnlRaw),
      status: isOpen ? "open" : "closed",
      ea,
    };

    const trade: ParsedTrade = {
      ...tradeBase,
      tags: generateTags(tradeBase),
    };

    trades.push(trade);
    if (isOpen) openCount++; else closedCount++;
  });

  // 计算日期范围
  let dateRange = "";
  if (trades.length > 0) {
    const times = trades.map(t => t.openTime.getTime()).sort((a, b) => a - b);
    const from = new Date(times[0]).toISOString().slice(0, 10);
    const to = new Date(times[times.length - 1]).toISOString().slice(0, 10);
    dateRange = from === to ? from : `${from} ~ ${to}`;
  }

  return {
    trades,
    summary: {
      accountNumber,
      accountName,
      currency,
      totalTrades: totalTrades || trades.length,
      closedTrades: closedCount,
      openTrades: openCount,
      balance,
      equity,
      totalNetProfit,
      profitFactor,
      dateRange,
    },
    errors,
  };
}
