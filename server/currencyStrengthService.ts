/**
 * G8 货币强弱评分矩阵服务
 *
 * 基于《外汇交易三部曲》的"逻辑层次分析矩阵"，对 G8 货币进行实时驱动力建模评分。
 *
 * 评分体系：
 *   - 顶层（地缘与制度）：权重 30%  → score_top    ∈ [-3, +3]
 *   - 中层（货币政策/利差）：权重 40% → score_mid    ∈ [-3, +3]
 *   - 底层（具体数据脉冲）：权重 30%  → score_bottom ∈ [-3, +3]
 *   - 综合评分 = score_top*0.3 + score_mid*0.4 + score_bottom*0.3  ∈ [-3, +3]
 */

import { invokeLLM } from "./_core/llm";
import {
  fetchAllCountriesEconomicData,
  fetchAllCentralBankNews,
  formatEconomicDataForPrompt,
  formatCentralBankNewsForPrompt,
  type CountryEconomicData,
  type CentralBankNewsItem,
} from "./dataScraperService";
import { getRecentNews, getAnalysisArticles, getAllUsersWithApiConfig } from "./db";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface LayerScore {
  score: number;           // -3 到 +3
  summary: string;         // 该层驱动的简要说明
  keyFactors: string[];    // 关键因素列表
}

export interface DrivingAnalysis {
  direction: string;       // 多空建议（如"偏多，建议做多 USD"）
  rhythm: string;          // 节奏（"慢趋势" 或 "快波动"）
  invalidation: string;    // 失效点（什么事件会让逻辑作废）
}

export interface ExpectationGap {
  marketExpectation: string;  // 市场普遍预期
  actualDriving: string;      // 实际驱动力
  gapDescription: string;     // 剪刀差描述
}

export interface CurrencyStrengthScore {
  currency: string;
  currencyName: string;
  flag: string;
  // 三层评分
  topLayerScore: LayerScore;    // 顶层：地缘与制度
  midLayerScore: LayerScore;    // 中层：货币政策/利差
  bottomLayerScore: LayerScore; // 底层：具体数据脉冲
  // 综合评分
  compositeScore: number;       // 加权综合评分 [-3, +3]
  sentiment: "bullish" | "bearish" | "neutral";
  riskLabel: string;
  // 详细分析
  drivingAnalysis: DrivingAnalysis;
  expectationGap: ExpectationGap;
  // 元数据
  generatedAt: Date;
}

export interface AssassinPick {
  pair: string;           // 货币对，如 "USD/JPY"
  baseCurrency: string;   // 强势货币
  quoteCurrency: string;  // 弱势货币
  scoreDiff: number;      // 评分差（绝对值）
  isHighProbability: boolean; // 评分差 > 3 时标记为高胜率
  direction: "long" | "short"; // 建议方向
  // 详细分析（三个固定板块）
  logicBreakdown: {
    topLayer: string;     // 顶层驱动
    midLayer: string;     // 中层动力
    bottomLayer: string;  // 底层脉冲
  };
  drivingAnalysis: DrivingAnalysis;
  expectationGap: ExpectationGap;
  generatedAt: Date;
}

export interface CurrencyStrengthMatrix {
  scores: CurrencyStrengthScore[];
  picks: AssassinPick[];
  generatedAt: Date;
  dataSource: {
    economicDataFetched: boolean;
    centralBankNewsFetched: boolean;
    fxstreetNewsFetched: boolean;
  };
}

// ─── 货币元数据 ───────────────────────────────────────────────────────────────

const CURRENCY_META: Record<string, { name: string; flag: string; riskLabel: string }> = {
  USD: { name: "美元", flag: "🇺🇸", riskLabel: "避险货币" },
  EUR: { name: "欧元", flag: "🇪🇺", riskLabel: "主要货币" },
  JPY: { name: "日元", flag: "🇯🇵", riskLabel: "避险货币" },
  GBP: { name: "英镑", flag: "🇬🇧", riskLabel: "主要货币" },
  AUD: { name: "澳元", flag: "🇦🇺", riskLabel: "风险货币" },
  NZD: { name: "纽元", flag: "🇳🇿", riskLabel: "风险货币" },
  CAD: { name: "加元", flag: "🇨🇦", riskLabel: "商品货币" },
  CHF: { name: "瑞郎", flag: "🇨🇭", riskLabel: "避险货币" },
};

const G8_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CAD", "CHF"] as const;

function buildCurrencyStrengthPrompt(
  economicData: CountryEconomicData[],
  centralBankNews: CentralBankNewsItem[],
  fxstreetNews: string,
  analysisArticles: string,
  currencyGroup?: string[] // 可选：指定要评分的货币列表
): string {
  const economicDataText = formatEconomicDataForPrompt(economicData);
  const centralBankText = formatCentralBankNewsForPrompt(centralBankNews);

  return `你是一位专业的外汇基本面分析师，精通《外汇交易三部曲》中的"逻辑层次分析矩阵"方法。

请基于以下多源数据，对以下货币进行实时驱动力建模评分：${currencyGroup ? currencyGroup.join(", ") : "USD, EUR, JPY, GBP, AUD, NZD, CAD, CHF"}。

## 数据源

### 1. 各国经济指标（来自 TradingEconomics）
${economicDataText}

### 2. 央行货币政策动态（来自 FXStreet）
${centralBankText}

### 3. FXStreet 最新新闻
${fxstreetNews}

### 4. FXStreet 分析文章
${analysisArticles}

---

## 评分体系说明

对每个货币进行三层评分，每层分数范围 -3 到 +3：

**顶层（地缘与制度）权重 30%**：
- +3: 极强避险需求流入 / 政治稳定 / 制度优势显著
- +1~+2: 轻微避险偏好 / 政治稳定
- 0: 中性
- -1~-2: 轻微地缘风险 / 政治不确定性
- -3: 严重地缘危机 / 政治动荡 / 制度风险

**中层（货币政策/利差）权重 40%**（核心层）：
- +3: 明确鹰派，加息周期，利差优势显著
- +1~+2: 偏鹰派，维持高利率，利差有支撑
- 0: 中性，观望
- -1~-2: 偏鸽派，降息预期，利差收窄
- -3: 明确鸽派，降息周期，利差劣势显著

**底层（具体数据脉冲）权重 30%**：
- +3: 多项核心数据大幅好于预期（非农、PMI、通胀等）
- +1~+2: 数据偏强，部分好于预期
- 0: 数据符合预期，无明显脉冲
- -1~-2: 数据偏弱，部分差于预期
- -3: 多项核心数据大幅差于预期

---

## 输出要求

请严格按照以下 JSON 格式输出，不要有任何多余文字：

{
  "currencies": [
    {
      "currency": "USD",
      "topLayer": {
        "score": 1.5,
        "summary": "顶层驱动简要说明（50字以内）",
        "keyFactors": ["因素1", "因素2", "因素3"]
      },
      "midLayer": {
        "score": 2.0,
        "summary": "中层驱动简要说明（50字以内）",
        "keyFactors": ["因素1", "因素2", "因素3"]
      },
      "bottomLayer": {
        "score": 0.5,
        "summary": "底层驱动简要说明（50字以内）",
        "keyFactors": ["因素1", "因素2"]
      },
      "drivingAnalysis": {
        "direction": "偏多，建议做多USD（100字以内）",
        "rhythm": "慢趋势（解释原因，50字以内）",
        "invalidation": "若非农大幅低于预期或Fed意外鸽派转向，逻辑作废（100字以内）"
      },
      "expectationGap": {
        "marketExpectation": "市场普遍预期Fed今年降息2次（50字以内）",
        "actualDriving": "实际通胀粘性强，降息时间表可能推迟（50字以内）",
        "gapDescription": "市场定价偏鸽，实际驱动偏鹰，存在正向剪刀差（80字以内）"
      }
    }
  ]
}

注意：
1. 所有 score 字段必须是 -3 到 +3 之间的数字（可以有小数，如 1.5, -2.0）
2. 必须包含指定的所有货币${currencyGroup ? "（" + currencyGroup.join(", ") + "）" : "（USD, EUR, JPY, GBP, AUD, NZD, CAD, CHF）"}
3. 所有文字内容使用中文
4. 严格基于提供的数据进行分析，不要凭空捏造`;
}

// ─── 构建刺客精选 Prompt ──────────────────────────────────────────────────────

function buildAssassinPicksPrompt(
  scores: CurrencyStrengthScore[],
  economicData: CountryEconomicData[],
  centralBankNews: CentralBankNewsItem[]
): string {
  // 排序：从强到弱
  const sorted = [...scores].sort((a, b) => b.compositeScore - a.compositeScore);
  const scoreList = sorted.map(s =>
    `${s.flag} ${s.currency}: ${s.compositeScore.toFixed(2)}分 (顶层${s.topLayerScore.score} + 中层${s.midLayerScore.score} + 底层${s.bottomLayerScore.score})`
  ).join("\n");

  // 找出强弱差最大的货币对
  const pairs: Array<{ base: string; quote: string; diff: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[i].compositeScore - sorted[j].compositeScore;
      if (diff > 0) {
        pairs.push({ base: sorted[i].currency, quote: sorted[j].currency, diff });
      }
    }
  }
  pairs.sort((a, b) => b.diff - a.diff);
  const topPairs = pairs.slice(0, 5);

  const pairList = topPairs.map(p =>
    `${p.base}/${p.quote}: 强弱差 ${p.diff.toFixed(2)}`
  ).join("\n");

  const economicDataText = formatEconomicDataForPrompt(economicData);
  const centralBankText = formatCentralBankNewsForPrompt(centralBankNews);

  return `你是一位专业的外汇基本面分析师，精通"刺客原则"——只狙击强弱差最大、逻辑最清晰的货币对。

## 当前 G8 货币强弱评分
${scoreList}

## 强弱差最大的候选货币对
${pairList}

## 参考数据
### 经济指标
${economicDataText.slice(0, 3000)}

### 央行政策动态
${centralBankText.slice(0, 2000)}

---

## 任务

请为强弱差最大的 **前3个货币对** 生成详细的"刺客精选"分析。

**刺客原则**：当强弱差（综合评分差的绝对值）> 3 时，标记为"高胜率机会"。

每个货币对的分析必须包含三个固定板块：

1. **[逻辑层次拆解]**：
   - 顶层驱动（大环境）：当前最重要的地缘/制度因素
   - 中层动力（央行逻辑）：两国央行政策分化的核心逻辑
   - 底层脉冲（近期数据）：最近影响走势的具体数据

2. **[驱动分析三问]**：
   - 方向：基于强弱差给出的多空建议
   - 节奏：是"慢趋势"（基本面驱动，周/月级别）还是"快波动"（预期差导致，日/小时级别）
   - 失效点：明确什么基本面事件发生会导致该驱动逻辑作废

3. **[预期差监控]**：
   - 当前市场普遍预期值
   - 实际驱动力方向
   - 两者之间的"剪刀差"描述

请严格按照以下 JSON 格式输出：

{
  "picks": [
    {
      "pair": "USD/JPY",
      "baseCurrency": "USD",
      "quoteCurrency": "JPY",
      "scoreDiff": 3.5,
      "isHighProbability": true,
      "direction": "long",
      "logicBreakdown": {
        "topLayer": "顶层驱动描述（100字以内）",
        "midLayer": "中层动力描述（100字以内）",
        "bottomLayer": "底层脉冲描述（100字以内）"
      },
      "drivingAnalysis": {
        "direction": "做多USD/JPY，目标区间XXX-XXX（100字以内）",
        "rhythm": "慢趋势，由政策分化驱动（50字以内）",
        "invalidation": "若日本CPI大幅超预期或BoJ意外加息，逻辑作废（100字以内）"
      },
      "expectationGap": {
        "marketExpectation": "市场预期描述（50字以内）",
        "actualDriving": "实际驱动力描述（50字以内）",
        "gapDescription": "剪刀差描述（80字以内）"
      }
    }
  ]
}

注意：
1. 必须包含 3 个货币对
2. 所有文字使用中文
3. direction 字段只能是 "long" 或 "short"
4. isHighProbability 当 scoreDiff > 3 时为 true，否则为 false`;
}

// ─── 解析 AI 返回的评分数据 ───────────────────────────────────────────────────

function parseScoreResponse(content: string): CurrencyStrengthScore[] {
  // 清理 markdown 代码块
  const cleaned = content
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  const currencies = parsed.currencies as Array<{
    currency: string;
    topLayer: { score: number; summary: string; keyFactors: string[] };
    midLayer: { score: number; summary: string; keyFactors: string[] };
    bottomLayer: { score: number; summary: string; keyFactors: string[] };
    drivingAnalysis: { direction: string; rhythm: string; invalidation: string };
    expectationGap: { marketExpectation: string; actualDriving: string; gapDescription: string };
  }>;

  return currencies.map(c => {
    const meta = CURRENCY_META[c.currency] || { name: c.currency, flag: "💱", riskLabel: "主要货币" };
    const composite = c.topLayer.score * 0.3 + c.midLayer.score * 0.4 + c.bottomLayer.score * 0.3;
    const roundedComposite = Math.round(composite * 100) / 100;

    let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
    if (roundedComposite > 0.5) sentiment = "bullish";
    else if (roundedComposite < -0.5) sentiment = "bearish";

    return {
      currency: c.currency,
      currencyName: meta.name,
      flag: meta.flag,
      topLayerScore: {
        score: Math.max(-3, Math.min(3, c.topLayer.score)),
        summary: c.topLayer.summary,
        keyFactors: c.topLayer.keyFactors || [],
      },
      midLayerScore: {
        score: Math.max(-3, Math.min(3, c.midLayer.score)),
        summary: c.midLayer.summary,
        keyFactors: c.midLayer.keyFactors || [],
      },
      bottomLayerScore: {
        score: Math.max(-3, Math.min(3, c.bottomLayer.score)),
        summary: c.bottomLayer.summary,
        keyFactors: c.bottomLayer.keyFactors || [],
      },
      compositeScore: Math.max(-3, Math.min(3, roundedComposite)),
      sentiment,
      riskLabel: meta.riskLabel,
      drivingAnalysis: {
        direction: c.drivingAnalysis.direction,
        rhythm: c.drivingAnalysis.rhythm,
        invalidation: c.drivingAnalysis.invalidation,
      },
      expectationGap: {
        marketExpectation: c.expectationGap.marketExpectation,
        actualDriving: c.expectationGap.actualDriving,
        gapDescription: c.expectationGap.gapDescription,
      },
      generatedAt: new Date(),
    } as CurrencyStrengthScore;
  });
}

function parsePicksResponse(content: string, scores: CurrencyStrengthScore[]): AssassinPick[] {
  const cleaned = content
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  const picks = parsed.picks as Array<{
    pair: string;
    baseCurrency: string;
    quoteCurrency: string;
    scoreDiff: number;
    isHighProbability: boolean;
    direction: "long" | "short";
    logicBreakdown: { topLayer: string; midLayer: string; bottomLayer: string };
    drivingAnalysis: { direction: string; rhythm: string; invalidation: string };
    expectationGap: { marketExpectation: string; actualDriving: string; gapDescription: string };
  }>;

  return picks.map(p => ({
    pair: p.pair,
    baseCurrency: p.baseCurrency,
    quoteCurrency: p.quoteCurrency,
    scoreDiff: p.scoreDiff,
    isHighProbability: p.scoreDiff > 3,
    direction: p.direction,
    logicBreakdown: {
      topLayer: p.logicBreakdown.topLayer,
      midLayer: p.logicBreakdown.midLayer,
      bottomLayer: p.logicBreakdown.bottomLayer,
    },
    drivingAnalysis: {
      direction: p.drivingAnalysis.direction,
      rhythm: p.drivingAnalysis.rhythm,
      invalidation: p.drivingAnalysis.invalidation,
    },
    expectationGap: {
      marketExpectation: p.expectationGap.marketExpectation,
      actualDriving: p.expectationGap.actualDriving,
      gapDescription: p.expectationGap.gapDescription,
    },
    generatedAt: new Date(),
  }));
}

// ─── 主函数：生成完整货币强弱矩阵 ────────────────────────────────────────────

export async function generateCurrencyStrengthMatrix(currencyGroup?: string[]): Promise<CurrencyStrengthMatrix> {
  console.log("[CurrencyStrength] Starting matrix generation...");

  // 1. 使用 Manus 内置 LLM API
  console.log(`[CurrencyStrength] Using Manus built-in LLM API`);

  // 2. 并行抓取所有数据
  console.log("[CurrencyStrength] Fetching data sources...");
  const [economicData, centralBankNews, recentNews, analysisArticles] = await Promise.all([
    fetchAllCountriesEconomicData().catch(e => {
      console.error("[CurrencyStrength] Economic data fetch failed:", e);
      return [] as CountryEconomicData[];
    }),
    fetchAllCentralBankNews().catch(e => {
      console.error("[CurrencyStrength] Central bank news fetch failed:", e);
      return [] as CentralBankNewsItem[];
    }),
    getRecentNews(20).catch(() => []),
    getAnalysisArticles(10).catch(() => []),
  ]);

  const fxstreetNewsText = recentNews.map(n => `- ${n.title}`).join("\n");
  const analysisText = analysisArticles.map(n => `- ${n.title}`).join("\n");

  console.log(`[CurrencyStrength] Data fetched: ${economicData.length} countries, ${centralBankNews.length} CB news, ${recentNews.length} FX news`);

  // 3. AI 生成货币强弱评分（支持分组）
  console.log("[CurrencyStrength] Generating currency strength scores...");
  if (currencyGroup) {
    console.log(`[CurrencyStrength] Evaluating currency group: ${currencyGroup.join(", ")}`);
  }
  const scorePrompt = buildCurrencyStrengthPrompt(economicData, centralBankNews, fxstreetNewsText, analysisText, currencyGroup);

  let scores: CurrencyStrengthScore[] = [];
  try {
    // 使用用户自选 API
    const scoreResponse = await callUserLLM(scorePrompt, "你是专业外汇基本面分析师，精通《外汇交易三部曲》的逻辑层次分析矩阵方法。请严格按照 JSON 格式输出，不要有任何多余文字。");
    const responseText = typeof scoreResponse.choices?.[0]?.message?.content === 'string' 
      ? scoreResponse.choices[0].message.content 
      : "";
    scores = parseScoreResponse(responseText);
    console.log(`[CurrencyStrength] Generated scores for ${scores.length} currencies`);
  } catch (e) {
    console.error("[CurrencyStrength] Score generation failed:", e);
    throw e;
  }

  // 4. AI 生成刺客精选
  console.log("[CurrencyStrength] Generating assassin picks...");
  let picks: AssassinPick[] = [];
  try {
    const picksPrompt = buildAssassinPicksPrompt(scores, economicData, centralBankNews);
    // 使用用户自选 API
    const picksResponse = await callUserLLM(picksPrompt, "你是专业外汇基本面分析师，精通刘客原则——只狙击强弱差最大的货币寸。请严格按照 JSON 格式输出，不要有任何多余文字。");
    const responseText = typeof picksResponse.choices?.[0]?.message?.content === 'string' 
      ? picksResponse.choices[0].message.content 
      : "";
    picks = parsePicksResponse(responseText, scores);
    console.log(`[CurrencyStrength] Generated ${picks.length} assassin picks`);
  } catch (e) {
    console.error("[CurrencyStrength] Picks generation failed:", e);
    // picks 失败不影响主流程
  }

  return {
    scores,
    picks,
    generatedAt: new Date(),
    dataSource: {
      economicDataFetched: economicData.length > 0,
      centralBankNewsFetched: centralBankNews.length > 0,
      fxstreetNewsFetched: recentNews.length > 0,
    },
  };
}

// ─── 生成各国经济数据 AI 总结 ─────────────────────────────────────────────────

export interface CountryEconomicSummary {
  currency: string;
  countryName: string;
  flag: string;
  summary: string;        // 经济状况总结（200字以内）
  keyStrengths: string[]; // 经济亮点
  keyWeaknesses: string[]; // 经济隐忧
  outlook: string;        // 短期展望
  generatedAt: Date;
}

export async function generateEconomicSummaries(
  economicData: CountryEconomicData[]
): Promise<CountryEconomicSummary[]> {

  const dataText = formatEconomicDataForPrompt(economicData);

  const prompt = `你是专业宏观经济分析师。请基于以下各国经济指标数据，为每个国家/地区生成简洁的经济状况总结。

## 经济指标数据
${dataText}

请严格按照以下 JSON 格式输出：

{
  "summaries": [
    {
      "currency": "USD",
      "summary": "美国经济总体状况描述（150字以内）",
      "keyStrengths": ["亮点1（20字以内）", "亮点2（20字以内）", "亮点3（20字以内）"],
      "keyWeaknesses": ["隐忧1（20字以内）", "隐忧2（20字以内）"],
      "outlook": "短期展望（80字以内）"
    }
  ]
}

注意：
1. 必须包含全部 8 个货币：USD, EUR, JPY, GBP, AUD, NZD, CAD, CHF
2. 所有文字使用中文
3. 严格基于提供的数据进行分析`;

  try {
    // 使用用户自选 API
    const response = await callUserLLM(prompt, "你是专业宏观经济分析师，输出严格的JSON格式，不要有任何多余文字。");

    const responseText = typeof response.choices?.[0]?.message?.content === 'string' 
      ? response.choices[0].message.content 
      : "";
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return parsed.summaries.map((s: any) => ({
      currency: s.currency,
      countryName: CURRENCY_META[s.currency]?.name || s.currency,
      flag: CURRENCY_META[s.currency]?.flag || "💱",
      summary: s.summary,
      keyStrengths: s.keyStrengths || [],
      keyWeaknesses: s.keyWeaknesses || [],
      outlook: s.outlook,
      generatedAt: new Date(),
    }));
  } catch (e) {
    console.error("[CurrencyStrength] Economic summaries generation failed:", e);
    throw e;
  }
}

// ─── 用户自选 API 调用函数 ────────────────────────────────────────────────────

async function callUserLLM(userPrompt: string, systemPrompt: string): Promise<any> {
  try {
    // 获取第一个用户的 API 配置
    const users = await getAllUsersWithApiConfig();
    if (!users || users.length === 0) {
      throw new Error("未找到用户 AI API 配置，请先在 AI 分析师页面配置 API");
    }

    const userConfig = users[0];
    const apiUrl = normalizeApiUrl(userConfig.apiUrl);
    const apiKey = userConfig.apiKey;
    const model = userConfig.model;

    console.log(`[CurrencyStrength] Using user API: ${apiUrl}, model: ${model}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (e) {
    console.error("[CurrencyStrength] User API call failed:", e);
    throw e;
  }
}

function normalizeApiUrl(url: string): string {
  return url.replace(/\/$/, "");
}

// 导出分离更新函数使用的函数
export { callUserLLM };
