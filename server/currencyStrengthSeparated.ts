/**
 * G8 货币强弱矩阵 - 分离更新函数
 * 
 * 将货币强弱矩阵的三个部分分离出来，每部分有独立的 LLM 调用：
 * 1. updateCurrencyDrivers - 货币驱动力详情（货币强弱评分）
 * 2. updateAssassinPicks - 刺客精选（强弱差最大的货币对）
 * 3. updateStrengthRanking - 实时强弱排行榜（简化版排名）
 */

import { invokeLLM } from "./_core/llm";
import { callUserLLM, type CurrencyStrengthScore } from "./currencyStrengthService";
import {
  fetchAllCountriesEconomicData,
  fetchAllCentralBankNews,
  formatEconomicDataForPrompt,
  formatCentralBankNewsForPrompt,
  type CountryEconomicData,
  type CentralBankNewsItem,
} from "./dataScraperService";
import { getRecentNews, getAnalysisArticles } from "./db";

// ─── 1. 货币驱动力详情更新 ────────────────────────────────────────────────────

export async function updateCurrencyDrivers(currencyGroup?: string[]): Promise<CurrencyStrengthScore[]> {
  console.log("[CurrencyDrivers] Starting drivers update...");

  // 并行抓取数据
  const [economicData, centralBankNews, recentNews, analysisArticles] = await Promise.all([
    fetchAllCountriesEconomicData().catch(e => {
      console.error("[CurrencyDrivers] Economic data fetch failed:", e);
      return [] as CountryEconomicData[];
    }),
    fetchAllCentralBankNews().catch(e => {
      console.error("[CurrencyDrivers] Central bank news fetch failed:", e);
      return [] as CentralBankNewsItem[];
    }),
    getRecentNews(15).catch(() => []),
    getAnalysisArticles(8).catch(() => []),
  ]);

  const fxstreetNewsText = recentNews.map(n => `- ${n.title}`).join("\n");
  const analysisText = analysisArticles.map(n => `- ${n.title}`).join("\n");

  // 构建 prompt（仅包含货币驱动力评分）
  const prompt = buildDriversPrompt(
    economicData,
    centralBankNews,
    fxstreetNewsText,
    analysisText,
    currencyGroup
  );

  try {
    // 使用 Manus 自带 LLM API
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是专业外汇基本面分析师，精通《外汇交易三部曲》的逻辑层次分析矩阵方法。请严格按照 JSON 格式输出货币强弱评分，不要有任何多余文字。" },
        { role: "user", content: prompt }
      ]
    });

    const responseText = typeof response.choices?.[0]?.message?.content === 'string'
      ? response.choices[0].message.content
      : "";

    let scores = parseDriversResponse(responseText);
    console.log(`[CurrencyDrivers] Generated scores for ${scores.length} currencies`);
    
    // 如果是分组更新，需要从数据库读取已有数据并合并
    if (currencyGroup && currencyGroup.length < 8) {
      console.log("[CurrencyDrivers] Merging with existing cache data...");
      try {
        const { getCurrencyStrengthCache } = await import("./db");
        const cache = await getCurrencyStrengthCache();
        if (cache && cache.matrixJson) {
          const existingMatrix = JSON.parse(cache.matrixJson);
          const existingScores = existingMatrix.scores || [];
          
          // 合并：用新数据替换对应货币，保留其他货币
          const updatedCurrencies = new Set(scores.map(s => s.currency));
          const mergedScores = [
            ...scores,
            ...existingScores.filter((s: CurrencyStrengthScore) => !updatedCurrencies.has(s.currency))
          ];
          scores = mergedScores;
          console.log(`[CurrencyDrivers] Merged scores: now have ${scores.length} currencies`);
        }
      } catch (e) {
        console.error("[CurrencyDrivers] Failed to merge with cache:", e);
        // 继续执行，不中断流程
      }
    }
    
    return scores;
  } catch (e) {
    console.error("[CurrencyDrivers] Update failed:", e);
    throw e;
  }
}

function buildDriversPrompt(
  economicData: CountryEconomicData[],
  centralBankNews: CentralBankNewsItem[],
  fxstreetNews: string,
  analysisArticles: string,
  currencyGroup?: string[]
): string {
  const economicDataText = formatEconomicDataForPrompt(economicData);
  const centralBankText = formatCentralBankNewsForPrompt(centralBankNews);

  return `你是一位专业的外汇基本面分析师，精通《外汇交易三部曲》中的"逻辑层次分析矩阵"方法。

请基于以下多源数据，对以下货币进行实时驱动力建模评分：${currencyGroup ? currencyGroup.join(", ") : "USD, EUR, JPY, GBP, AUD, NZD, CAD, CHF"}。

## 数据源

### 1. 各国经济指标（来自 TradingEconomics）
${economicDataText.slice(0, 3000)}

### 2. 央行货币政策动态（来自 FXStreet）
${centralBankText.slice(0, 2000)}

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
      }
    }
  ]
}`;
}

function parseDriversResponse(content: string): CurrencyStrengthScore[] {
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
  }>;

  const CURRENCY_META: Record<string, { name: string; flag: string; riskLabel: string }> = {
    USD: { name: "美元", flag: "🇺🇸", riskLabel: "避险货币" },
    EUR: { name: "欧元", flag: "🇪🇺", riskLabel: "主要货币" },
    JPY: { name: "日元", flag: "🇯🇵", riskLabel: "避险货币" },
    GBP: { name: "英镑", flag: "🇬🇧", riskLabel: "主要货币" },
    AUD: { name: "澳元", flag: "🇦🇺", riskLabel: "商品货币" },
    NZD: { name: "纽元", flag: "🇳🇿", riskLabel: "商品货币" },
    CAD: { name: "加元", flag: "🇨🇦", riskLabel: "商品货币" },
    CHF: { name: "瑞郎", flag: "🇨🇭", riskLabel: "避险货币" },
  };

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
        score: c.topLayer.score,
        summary: c.topLayer.summary,
        keyFactors: c.topLayer.keyFactors,
      },
      midLayerScore: {
        score: c.midLayer.score,
        summary: c.midLayer.summary,
        keyFactors: c.midLayer.keyFactors,
      },
      bottomLayerScore: {
        score: c.bottomLayer.score,
        summary: c.bottomLayer.summary,
        keyFactors: c.bottomLayer.keyFactors,
      },
      compositeScore: roundedComposite,
      sentiment,
      riskLabel: meta.riskLabel,
      drivingAnalysis: {
        direction: "",
        rhythm: "",
        invalidation: "",
      },
      expectationGap: {
        marketExpectation: "",
        actualDriving: "",
        gapDescription: "",
      },
      generatedAt: new Date(),
    };
  });
}

// ─── 2. 刺客精选更新 ────────────────────────────────────────────────────────

export interface AssassinPick {
  pair: string;
  baseCurrency: string;
  quoteCurrency: string;
  scoreDiff: number;
  isHighProbability: boolean;
  direction: "long" | "short";
  logicBreakdown: {
    topLayer: string;
    midLayer: string;
    bottomLayer: string;
  };
  drivingAnalysis: {
    direction: string;
    rhythm: string;
    invalidation: string;
  };
  expectationGap: {
    marketExpectation: string;
    actualDriving: string;
    gapDescription: string;
  };
  generatedAt: Date;
}

export async function updateAssassinPicks(scores: CurrencyStrengthScore[]): Promise<AssassinPick[]> {
  console.log("[AssassinPicks] Starting picks update...");

  // 并行抓取数据
  const [economicData, centralBankNews] = await Promise.all([
    fetchAllCountriesEconomicData().catch(() => [] as CountryEconomicData[]),
    fetchAllCentralBankNews().catch(() => [] as CentralBankNewsItem[]),
  ]);

  const prompt = buildAssassinPicksPrompt(scores, economicData, centralBankNews);

  try {
    const response = await callUserLLM(
      prompt,
      "你是专业外汇基本面分析师，精通刺客原则——只狙击强弱差最大的货币对。请严格按照 JSON 格式输出，不要有任何多余文字。"
    );

    const responseText = typeof response.choices?.[0]?.message?.content === 'string'
      ? response.choices[0].message.content
      : "";

    const picks = parseAssassinPicksResponse(responseText, scores);
    console.log(`[AssassinPicks] Generated ${picks.length} picks`);
    return picks;
  } catch (e) {
    console.error("[AssassinPicks] Update failed:", e);
    throw e;
  }
}

function buildAssassinPicksPrompt(
  scores: CurrencyStrengthScore[],
  economicData: CountryEconomicData[],
  centralBankNews: CentralBankNewsItem[]
): string {
  const economicDataText = formatEconomicDataForPrompt(economicData);
  const centralBankText = formatCentralBankNewsForPrompt(centralBankNews);

  // 计算强弱差
  const scoreMap = new Map(scores.map(s => [s.currency, s.compositeScore]));
  const pairs: Array<{ pair: string; diff: number }> = [];
  
  for (const base of scores) {
    for (const quote of scores) {
      if (base.currency !== quote.currency) {
        const diff = Math.abs(base.compositeScore - quote.compositeScore);
        pairs.push({ pair: `${base.currency}/${quote.currency}`, diff });
      }
    }
  }
  
  pairs.sort((a, b) => b.diff - a.diff);
  const topPairs = pairs.slice(0, 3).map(p => p.pair).join(", ");

  return `你是专业外汇基本面分析师，精通刺客原则——只狙击强弱差最大的货币对。

基于以下货币强弱评分数据：
${JSON.stringify(scores.map(s => ({
  currency: s.currency,
  score: s.compositeScore,
  sentiment: s.sentiment,
})), null, 2)}

请为强弱差最大的 **前3个货币对** 生成详细的"刺客精选"分析。

**刺客原则**：当强弱差（综合评分差的绝对值）> 3 时，标记为"高胜率机会"。

## 背景数据

### 经济指标
${economicDataText.slice(0, 2000)}

### 央行政策
${centralBankText.slice(0, 1500)}

---

每个货币对的分析必须包含三个固定板块：

1. **[逻辑层次拆解]**：顶层驱动、中层动力、底层脉冲
2. **[驱动分析三问]**：方向、节奏、失效点
3. **[预期差监控]**：市场预期、实际驱动、剪刀差

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

function parseAssassinPicksResponse(content: string, scores: CurrencyStrengthScore[]): AssassinPick[] {
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
    direction: string;
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
    direction: p.direction as "long" | "short",
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

// ─── 3. 实时强弱排行榜更新 ────────────────────────────────────────────────────

export interface StrengthRanking {
  currency: string;
  currencyName: string;
  flag: string;
  score: number;
  rank: number;
  sentiment: "bullish" | "bearish" | "neutral";
  generatedAt: Date;
}

export async function updateStrengthRanking(scores: CurrencyStrengthScore[]): Promise<StrengthRanking[]> {
  console.log("[StrengthRanking] Updating ranking...");

  // 排序并生成排行榜
  const ranked = scores
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((score, index) => ({
      currency: score.currency,
      currencyName: score.currencyName,
      flag: score.flag,
      score: score.compositeScore,
      rank: index + 1,
      sentiment: score.sentiment,
      generatedAt: new Date(),
    }));

  console.log("[StrengthRanking] Ranking updated");
  return ranked;
}
