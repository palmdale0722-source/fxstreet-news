import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  getRecentNews,
  getAnalysisArticles,
  getTodayInsight,
  getTodayOutlooks,
  addSubscription,
  getSignals,
  updateSignalStatus,
  getSignalNotes,
  upsertSignalNote,
  getAgentSessions,
  createAgentSession,
  deleteAgentSession,
  getAgentMessages,
  saveAgentMessage,
  updateAgentSessionTitle,
  getNewsContextForAgent,
  getLatestInsightAndOutlooks,
  type SignalStatus,
} from "./db";
import { runFullUpdate } from "./fxService";
import { fetchSignalEmails } from "./imapService";
import { invokeLLM } from "./_core/llm";
import { getForexQuote, formatQuoteForPrompt } from "./forexQuote";

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const SIGNAL_STATUS_VALUES = ["pending", "executed", "ignored", "watching"] as const;

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── 新闻路由 ───────────────────────────────────────────────────────────────
  news: router({
    getRecent: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(20).optional() }).optional())
      .query(async ({ input }) => {
        return getRecentNews(input?.limit ?? 8);
      }),

    getBySource: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(20).optional() }))
      .query(async ({ input }) => {
        return getAnalysisArticles(input?.limit ?? 5);
      }),
  }),

  // ─── 市场洞察路由 ────────────────────────────────────────────────────────────
  insights: router({
    getToday: publicProcedure.query(async () => {
      return getTodayInsight(getTodayDate());
    }),
  }),

  // ─── 货币展望路由 ────────────────────────────────────────────────────────────
  outlooks: router({
    getToday: publicProcedure.query(async () => {
      return getTodayOutlooks(getTodayDate());
    }),
  }),

  // ─── 订阅路由 ────────────────────────────────────────────────────────────────
  subscription: router({
    subscribe: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        return addSubscription({
          email: input.email,
          userId: ctx.user.id,
          active: true,
        });
      }),
  }),

  // ─── 交易信号路由 ────────────────────────────────────────────────────────────
  signals: router({
    // 获取信号列表（支持状态筛选和分页）
    list: publicProcedure
      .input(z.object({
        status: z.enum(SIGNAL_STATUS_VALUES).optional(),
        page: z.number().min(1).optional(),
        pageSize: z.number().min(1).max(50).optional(),
      }).optional())
      .query(async ({ input }) => {
        return getSignals({
          status: input?.status as SignalStatus | undefined,
          page: input?.page ?? 1,
          pageSize: input?.pageSize ?? 20,
        });
      }),

    // 更新信号状态（需要登录）
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(SIGNAL_STATUS_VALUES),
      }))
      .mutation(async ({ input }) => {
        await updateSignalStatus(input.id, input.status as SignalStatus);
        return { success: true };
      }),

    // 获取某条信号的所有备注
    getNotes: publicProcedure
      .input(z.object({ signalId: z.number() }))
      .query(async ({ input }) => {
        return getSignalNotes(input.signalId);
      }),

    // 新增/更新备注（需要登录）
    upsertNote: protectedProcedure
      .input(z.object({
        signalId: z.number(),
        content: z.string().min(1).max(2000),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertSignalNote({
          signalId: input.signalId,
          userId: ctx.user.id,
          userName: ctx.user.name || ctx.user.email || "匿名用户",
          content: input.content,
        });
        return { success: true };
      }),

    // 手动立即拉取邮件（仅管理员）
    fetchNow: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可手动拉取邮件" });
      }
      const email = process.env.IMAP_EMAIL;
      const password = process.env.IMAP_PASSWORD;
      if (!email || !password) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IMAP 邮箱未配置，请先设置 IMAP_EMAIL 和 IMAP_PASSWORD" });
      }
      const result = await fetchSignalEmails(email, password);
      return { ...result, fetchedAt: new Date() };
    }),
  }),

  //  // ─── AI Agent 路由 ─────────────────────────────────────────────────────────────────
  agent: router({
    // 获取当前用户的所有会话
    getSessions: protectedProcedure.query(async ({ ctx }) => {
      return getAgentSessions(ctx.user.id);
    }),

    // 新建会话
    newSession: protectedProcedure
      .input(z.object({ pair: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const title = input.pair ? `${input.pair} 分析` : "新对话";
        return createAgentSession({ userId: ctx.user.id, title, pair: input.pair });
      }),

    // 删除会话
    deleteSession: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteAgentSession(input.sessionId, ctx.user.id);
        return { success: true };
      }),

    // 获取某个会话的历史消息
    getMessages: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        return getAgentMessages(input.sessionId);
      }),

    // 获取实时行情（供前端展示价格标签）
    getQuote: publicProcedure
      .input(z.object({ pair: z.string() }))
      .query(async ({ input }) => {
        const quote = await getForexQuote(input.pair);
        if (!quote) return null;
        return {
          pair: quote.pair,
          currentPrice: quote.currentPrice,
          change: quote.change,
          changePct: quote.changePct,
          dayHigh: quote.dayHigh,
          dayLow: quote.dayLow,
          open: quote.open,
          previousClose: quote.previousClose,
          trend: quote.indicators.trend,
          rsi14: quote.indicators.rsi14,
          fetchedAt: quote.fetchedAt,
        };
      }),

    // 核心：流式对话（返回完整回复，同时存入数据库）
    chat: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
        message: z.string().min(1).max(2000),
        pair: z.string().optional(),  // 当前关注的货币对
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. 存入用户消息
        await saveAgentMessage({
          sessionId: input.sessionId,
          role: "user",
          content: input.message,
        });

        // 2. 获取历史对话（最多 10 轪）
        const history = await getAgentMessages(input.sessionId);
        const recentHistory = history.slice(-10);

        // 3. 获取数据库上下文 + 实时行情（并行）
        const [newsCtx, { insight, outlooks: outlookList }, forexQuote] = await Promise.all([
          getNewsContextForAgent(20),
          getLatestInsightAndOutlooks(),
          input.pair ? getForexQuote(input.pair) : Promise.resolve(null),
        ]);

        // 4. 构建系统 Prompt
        const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
        const pairFocus = input.pair || "全局 G8 货币对";

        const newsSection = newsCtx.length > 0
          ? newsCtx.map((n, i) =>
              `${i + 1}. [${n.source}] ${n.title}${n.description ? " - " + n.description.slice(0, 120) : ""} (${new Date(n.publishedAt).toLocaleDateString("zh-CN")})`
            ).join("\n")
          : "暂无新闻数据";

        const outlookSection = outlookList.length > 0
          ? outlookList.map(o => `${o.currency}: [${o.sentiment === "bullish" ? "看涨" : o.sentiment === "bearish" ? "看跌" : "中性"}] ${o.outlook.slice(0, 150)}`).join("\n")
          : "暂无展望数据";

        const insightSection = insight
          ? `市场总结: ${insight.summary}\n地缘政治: ${insight.geopolitics || ""}\n能源市场: ${insight.energy || ""}\n汇市表现: ${insight.forex || ""}\n交易建议: ${insight.tradingAdvice || ""}`
          : "暂无洞察数据";

        // 实时行情数据块
        const quoteSection = forexQuote
          ? formatQuoteForPrompt(forexQuote)
          : input.pair
            ? `注意：${input.pair} 实时行情数据暂时无法获取，请基于新闻和展望数据进行分析。`
            : "";

        const systemPrompt = `你是一位专业的外汇交易分析师，擅长 G8 货币对的技术分析和基本面分析。今天是 ${today}，当前关注的货币对：${pairFocus}。

你的分析能力包括：
- 趋势分析：多周期趋势判断（日线、周线、月线）
- 关键点位：支撑位、阻力位、目标位、止损位
- 技术指标：RSI、MACD、布林带、均线系统、波浪理论、斐波常用比例
- 入场时机：具体的入场区间、止损设置和目标位
- 风险评估：风险收益比、仓位管理建议
- 市场情绪：基于新闻和展望的情绪分析

${quoteSection ? `【实时行情与技术指标（来自 Yahoo Finance）】\n${quoteSection}\n\n` : ""}当前数据库最新市场信息：

【最新新闻（近 20 条）】
${newsSection}

【各货币AI展望】
${outlookSection}

【今日市场洞察】
${insightSection}

回答要求：
- 使用中文回答
- 优先基于上方实时行情数据中的具体价格和技术指标进行分析，不要使用假设性数字
- 关键点位用具体数字表示（如 1.0850），结合实时数据中的支撑阻力区间
- 分析要有逻辑层次：先判断市场环境，再给出技术分析，最后提出具体操作建议
- 如果用户问的是具体货币对，请给出详细的技术分析和操作计划（含入场、止损、目标位）`;

        // 5. 调用 LLM
        const llmMessages = [
          { role: "system" as const, content: systemPrompt },
          ...recentHistory.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: input.message },
        ];

        const response = await invokeLLM({ messages: llmMessages });
        const rawContent = response.choices[0]?.message?.content;
        const assistantContent: string = typeof rawContent === "string" ? rawContent : (rawContent ? JSON.stringify(rawContent) : "暂无回复");

        // 6. 存入 AI 回复
        await saveAgentMessage({
          sessionId: input.sessionId,
          role: "assistant",
          content: assistantContent,
        });

        // 7. 如果是第一条消息，自动更新会话标题
        if (history.length <= 1) {
          const shortTitle = input.pair
            ? `${input.pair} - ${input.message.slice(0, 20)}`
            : input.message.slice(0, 25);
          await updateAgentSessionTitle(input.sessionId, shortTitle + (shortTitle.length >= 25 ? "..." : ""));
        }

        return { content: assistantContent };
      }),
  }),

  // ─── 管理路由（手动触发更新）────────────────────────────────────────────
  admin: router({
    triggerUpdate: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("仅管理员可触发更新");
      }
      const startTime = Date.now();
      const result = await runFullUpdate();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      return {
        ...result,
        duration,
        updatedAt: new Date(),
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
