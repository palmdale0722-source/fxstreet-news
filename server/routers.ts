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
  getRecentTvIdeas,
  getTvIdeasForAgent,
  getTradeJournal,
  createTradeJournalEntry,
  updateTradeJournalEntry,
  deleteTradeJournalEntry,
  getTradingSystem,
  createTradingSystemEntry,
  updateTradingSystemEntry,
  deleteTradingSystemEntry,
  getAllIndicatorConfigs,
  upsertIndicatorConfig,
  deleteIndicatorConfig,
  getActiveTradingSystem,
  getTradeJournalForAgent,
  getIndicatorSignalsForAgent,
  getIndicatorConfigs,
  getUserApiConfig,
  upsertUserApiConfig,
  getSignalAnalysis,
  getImapConfigForDisplay,
  saveImapConfig,
  getActiveImapConfig,
  getTradingConversations,
  createTradingConversation,
  updateTradingConversation,
  deleteTradingConversation,
  getNotifyConfig,
  saveNotifyConfig,
  type SignalStatus,
} from "./db";
import { runFullUpdate } from "./fxService";
import { fetchSignalEmails } from "./imapService";
import { restartImapJobs, safeRunStrengthMatrix } from "./cronJobs";
import { invokeLLM } from "./_core/llm";
import { getForexQuote, formatQuoteForPrompt } from "./forexQuote";
import { getMt4Bars, getMt4ConnectionStatus, formatMt4BarsForPrompt } from "./mt4Service";
import { getCurrencyStrengthCache } from "./db";

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
      const config = await getActiveImapConfig();
      if (!config) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IMAP 邮箱未配置，请先在邮箱设置中配置账号和密码" });
      }
      const result = await fetchSignalEmails(config.email, config.password, 50, {
        host: config.host,
        port: config.port,
        tls: config.tls,
      });
      return { ...result, fetchedAt: new Date() };
    }),

    // 获取当前 IMAP 配置（密码脱敏，仅管理员）
    getImapConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可查看 IMAP 配置" });
      }
      return getImapConfigForDisplay();
    }),

    // 保存 IMAP 配置（仅管理员）
    saveImapConfig: protectedProcedure
      .input(z.object({
        email: z.string().email("请输入有效的邮箱地址"),
        password: z.string().min(1, "密码不能为空"),
        host: z.string().min(1, "服务器地址不能为空").default("imap.163.com"),
        port: z.number().int().min(1).max(65535).default(993),
        tls: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可修改 IMAP 配置" });
        }
        await saveImapConfig(input);
        // 重新启动定时任务以使用新配置
        restartImapJobs();
        return { success: true };
      }),

    // 测试 IMAP 连接（不入库，仅验证连通性）
    testImapConnection: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
        host: z.string().min(1).default("imap.163.com"),
        port: z.number().int().min(1).max(65535).default(993),
        tls: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可测试连接" });
        }
        // 仅拉取最新 1 封测试连通性
        try {
          await fetchSignalEmails(input.email, input.password, 1, {
            host: input.host,
            port: input.port,
            tls: input.tls,
          });
          return { success: true, message: "连接成功！邮箱认证通过" };
        } catch (e: any) {
          return { success: false, message: e.message || "连接失败" };
        }
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
        // 用户自带 API 配置
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().min(256).max(32768).optional().default(4096),
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

        // 3. 获取数据库上下文 + 实时行情 + TradingView 想法 + 个人体系（并行）
        const [newsCtx, { insight, outlooks: outlookList }, forexQuote, mt4BarsData, tvIdeasCtx, tradingSystemItems, tradeHistory, indicatorSignals, indicatorConfigs] = await Promise.all([
          getNewsContextForAgent(20),
          getLatestInsightAndOutlooks(),
          input.pair ? getForexQuote(input.pair) : Promise.resolve(null),
          input.pair ? getMt4Bars(input.pair, 100, "M15") : Promise.resolve([]),
          input.pair ? getTvIdeasForAgent(input.pair, 5) : Promise.resolve([]),
          getActiveTradingSystem(ctx.user.id),
          input.pair ? getTradeJournalForAgent(ctx.user.id, input.pair, 5) : Promise.resolve([]),
          input.pair ? getIndicatorSignalsForAgent(input.pair) : Promise.resolve([]),
          getIndicatorConfigs(),
        ]);

        // 4. 构建系统 Prompt
        const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
        const pairFocus = input.pair || "全局 G8 货币对";

        const newsSection = newsCtx.length > 0
          ? newsCtx.map((n: (typeof newsCtx)[0], i: number) =>
              `${i + 1}. [${n.source}] ${n.title}${n.description ? " - " + n.description.slice(0, 120) : ""} (${new Date(n.publishedAt).toLocaleDateString("zh-CN")})`
            ).join("\n")
          : "暂无新闻数据";

        const outlookSection = outlookList.length > 0
          ? outlookList.map((o: (typeof outlookList)[0]) => `${o.currency}: [${o.sentiment === "bullish" ? "看涨" : o.sentiment === "bearish" ? "看跌" : "中性"}] ${o.outlook.slice(0, 150)}`).join("\n")
          : "暂无展望数据";

        const insightSection = insight
          ? `市场总结: ${insight.summary}\n地缘政治: ${insight.geopolitics || ""}\n能源市场: ${insight.energy || ""}\n汇市表现: ${insight.forex || ""}\n交易建议: ${insight.tradingAdvice || ""}`
          : "暂无洞察数据";

        // 行情数据块：优先使用 MT4 推送数据，降级回 Yahoo Finance
        let quoteSection = "";
        let dataSource = "";
        if (input.pair && mt4BarsData.length > 0) {
          quoteSection = formatMt4BarsForPrompt(input.pair, mt4BarsData);
          dataSource = "MT4 交易终端（实时推送）";
        } else if (forexQuote) {
          quoteSection = formatQuoteForPrompt(forexQuote);
          dataSource = "Yahoo Finance";
        } else if (input.pair) {
          quoteSection = `注意：${input.pair} 实时行情数据暂时无法获取，请基于新闻和展望数据进行分析。`;
        }

        // TradingView 社区想法块
        const tvIdeasSection = tvIdeasCtx.length > 0
          ? tvIdeasCtx.map((idea: (typeof tvIdeasCtx)[0], i: number) =>
              `${i + 1}. [${idea.author || '匿名'}] ${idea.title}${idea.description ? ' - ' + idea.description.slice(0, 150) : ''} (${new Date(idea.publishedAt).toLocaleDateString('zh-CN')}) 来源: ${idea.link}`
            ).join('\n')
          : '';

          // 交易体系知识库块
        const CATEGORY_LABELS: Record<string, string> = {
          philosophy: "交易哲学",
          methodology: "分析方法论",
          entry_rules: "入场规则",
          exit_rules: "出场规则",
          risk_management: "风险管理",
          pairs_preference: "偏好货币对",
          session_preference: "偏好交易时段",
          other: "其他",
        };
        const tradingSystemSection = tradingSystemItems.length > 0
          ? tradingSystemItems.map((item: (typeof tradingSystemItems)[0]) =>
              `[${CATEGORY_LABELS[item.category] || item.category}] ${item.title}: ${item.content}`
            ).join("\n")
          : "";

        // 历史交易记录块
        const tradeHistorySection = tradeHistory.length > 0
          ? tradeHistory.map((t: (typeof tradeHistory)[0]) => {
              const parts = [
                `${t.pair} ${t.direction === 'buy' ? '买入' : '卖出'} 入场:${t.entryPrice}`,
                t.exitPrice ? `出场:${t.exitPrice}` : null,
                t.stopLoss ? `止损:${t.stopLoss}` : null,
                t.takeProfit ? `止盈:${t.takeProfit}` : null,
                t.pnl ? `盈亏:${t.pnl}` : null,
                t.summary ? `理由:${t.summary.slice(0, 100)}` : null,
                t.lesson ? `复盘:${t.lesson.slice(0, 100)}` : null,
              ].filter(Boolean);
              return `(${new Date(t.openTime).toLocaleDateString('zh-CN')}) ${parts.join(' | ')}`;
            }).join("\n")
          : "";

        // 自定义指标信号块
        const indicatorConfigMap = new Map(indicatorConfigs.map((c: (typeof indicatorConfigs)[0]) => [c.indicatorName, c]));
        const indicatorSection = indicatorSignals.length > 0
          ? indicatorSignals.map((sig: (typeof indicatorSignals)[0]) => {
              const config = indicatorConfigMap.get(sig.indicatorName);
              const name = config?.displayName || sig.indicatorName;
              const interpretation = config?.interpretation || "";
              const values = `value1=${sig.value1}${sig.value2 !== null ? `, value2=${sig.value2}` : ''}${sig.value3 !== null ? `, value3=${sig.value3}` : ''}`;
              return `${name}: ${values}${interpretation ? ` | 解读规则: ${interpretation.slice(0, 120)}` : ''}`;
            }).join("\n")
          : "";

        const systemPrompt = `你是一位专业的外汇交易分析师，擅长 G8 货币对的技术分析和基本面分析。今天是 ${today}，当前关注的货币对：${pairFocus}。
${tradingSystemSection ? `
【交易者个人交易体系与方法论（最高优先级，分析时必须遵循）】
${tradingSystemSection}
` : ''}
${indicatorSection ? `【自定义 MT4 指标实时信号】
${indicatorSection}
` : ''}
${tradeHistorySection ? `【该货币对近期历史交易记录（供参考）】
${tradeHistorySection}
` : ''}
${quoteSection ? `【实时行情与技术指标（来自 ${dataSource}）】
${quoteSection}
` : ''}
【最新新闻（近 20 条）】
${newsSection}

【各货币AI展望】
${outlookSection}

【今日市场洞察】
${insightSection}
${tvIdeasSection ? `\n【TradingView 社区分析师观点（最新 ${tvIdeasCtx.length} 条）】\n${tvIdeasSection}\n` : ''}
回答要求：
- 使用中文回答
- 如果交易者有个人交易体系，必须优先按照其交易哲学、方法论和规则进行分析，不要违背其规则
- 如果有自定义指标信号，必须将其纳入分析并按照解读规则说明信号含义
- 如果有历史交易记录，可将当前市场与历史交易进行对比，识别类似模式
- 优先基于实时行情数据中的具体价格和技术指标进行分析，不要使用假设性数字
- 关键点位用具体数字表示（如 1.0850），结合实时数据中的支撑阻力区间
- 分析要有逻辑层次：先判断市场环境，再给出技术分析，最后提出具体操作建议
- 如果用户问的是具体货币对，请给出详细的技术分析和操作计划（含入场、止损、目标位）
- 如果 TradingView 社区有相关分析，可适当参考并注明来源作者`;

        // 5. 调用 LLM
        const llmMessages = [
          { role: "system" as const, content: systemPrompt },
          ...recentHistory.slice(0, -1).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: input.message },
        ];

        // 规范化用户 API URL
        let apiUrl = input.apiUrl.trim().replace(/\/$/, "");
        if (!apiUrl.endsWith("/chat/completions")) {
          if (apiUrl.endsWith("/v1")) {
            apiUrl = apiUrl + "/chat/completions";
          } else if (!apiUrl.includes("/v1")) {
            apiUrl = apiUrl + "/v1/chat/completions";
          } else {
            apiUrl = apiUrl + "/chat/completions";
          }
        }

        let fetchResponse: Response;
        try {
          fetchResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify({
              model: input.model,
              messages: llmMessages,
              temperature: input.temperature,
              max_tokens: input.maxTokens,
            }),
          });
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `无法连接到 AI API：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        if (!fetchResponse.ok) {
          const errText = await fetchResponse.text().catch(() => "");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `AI API 请求失败 (${fetchResponse.status})：${errText.slice(0, 300)}`,
          });
        }
        const responseData = await fetchResponse.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };
        if (responseData.error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `AI API 返回错误：${responseData.error.message || JSON.stringify(responseData.error)}`,
          });
        }
        const rawContent = responseData.choices?.[0]?.message?.content;
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

  // ─── MT4 连接状态路由 ──────────────────────────────────────────────
  mt4: router({
    // 获取 MT4 连接状态（公开）
    getStatus: publicProcedure.query(async () => {
      return await getMt4ConnectionStatus();
    }),
    // 获取 API 密钥（仅登录用户）
    getApiKey: protectedProcedure.query(() => {
      return { apiKey: process.env.MT4_API_KEY || "mt4-bridge-key-change-me" };
    }),
  }),

  // ─── TradingView 交易想法路由
  ideas: router({
    getRecent: publicProcedure
      .input(z.object({
        pair: z.string().optional(),
        limit: z.number().min(1).max(100).default(30),
      }))
      .query(async ({ input }) => {
        return await getRecentTvIdeas(input.limit, input.pair);
      }),
  }),
  // ─── 历史交易记录路由 ──────────────────────────────────────────────────────
  tradeJournal: router({
    list: protectedProcedure
      .input(z.object({ pair: z.string().optional(), limit: z.number().default(50) }))
      .query(async ({ ctx, input }) => {
        return await getTradeJournal(ctx.user.id, input.pair, input.limit);
      }),
    create: protectedProcedure
      .input(z.object({
        pair: z.string(),
        direction: z.enum(["buy", "sell"]),
        entryPrice: z.string(),
        exitPrice: z.string().optional(),
        stopLoss: z.string().optional(),
        takeProfit: z.string().optional(),
        lotSize: z.string().optional(),
        pnl: z.string().optional(),
        openTime: z.date(),
        closeTime: z.date().optional(),
        status: z.enum(["open", "closed", "cancelled"]).default("closed"),
        summary: z.string().optional(),
        lesson: z.string().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createTradeJournalEntry({ ...input, userId: ctx.user.id });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        pair: z.string().optional(),
        direction: z.enum(["buy", "sell"]).optional(),
        entryPrice: z.string().optional(),
        exitPrice: z.string().optional(),
        stopLoss: z.string().optional(),
        takeProfit: z.string().optional(),
        lotSize: z.string().optional(),
        pnl: z.string().optional(),
        openTime: z.date().optional(),
        closeTime: z.date().optional(),
        status: z.enum(["open", "closed", "cancelled"]).optional(),
        summary: z.string().optional(),
        lesson: z.string().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        await updateTradeJournalEntry(id, ctx.user.id, updates);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTradeJournalEntry(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
  // ─── 交易体系知识库路由 ──────────────────────────────────────────────────────
  tradingSystem: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await getTradingSystem(ctx.user.id);
    }),
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["philosophy", "methodology", "entry_rules", "exit_rules", "risk_management", "pairs_preference", "session_preference", "other"]),
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        active: z.boolean().default(true),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await createTradingSystemEntry({ ...input, userId: ctx.user.id });
        return { id };
      }),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.enum(["philosophy", "methodology", "entry_rules", "exit_rules", "risk_management", "pairs_preference", "session_preference", "other"]).optional(),
        title: z.string().min(1).max(255).optional(),
        content: z.string().min(1).optional(),
        active: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        await updateTradingSystemEntry(id, ctx.user.id, updates);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteTradingSystemEntry(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
  // ─── MT4 指标配置路由 ────────────────────────────────────────────────────────────────
  indicatorConfig: router({
    list: protectedProcedure.query(async () => {
      return await getAllIndicatorConfigs();
    }),
    upsert: protectedProcedure
      .input(z.object({
        indicatorName: z.string().min(1).max(128),
        displayName: z.string().min(1).max(128),
        indicatorType: z.enum(["trend", "oscillator", "volume", "custom"]).default("custom"),
        params: z.string().optional(),
        interpretation: z.string().min(1),
        bufferIndex: z.number().default(0),
        active: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => {
        await upsertIndicatorConfig(input);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteIndicatorConfig(input.id);
        return { success: true };
      }),
  }),
  //   // ─── 自定义 AI 对话路由（代理转发用户自定义 API）──────────────────────────────────────
  customAI: router({
    // 代理转发到用户自定义的 OpenAI 兼容 API
    chat: publicProcedure
      .input(z.object({
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        messages: z.array(z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        })),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().min(1).max(32768).optional().default(4096),
      }))
      .mutation(async ({ input }) => {
        // 规范化 API URL：确保以 /chat/completions 结尾
        let apiUrl = input.apiUrl.trim().replace(/\/$/, "");
        if (!apiUrl.endsWith("/chat/completions")) {
          if (apiUrl.endsWith("/v1")) {
            apiUrl = apiUrl + "/chat/completions";
          } else if (!apiUrl.includes("/v1")) {
            apiUrl = apiUrl + "/v1/chat/completions";
          } else {
            apiUrl = apiUrl + "/chat/completions";
          }
        }
        const payload = {
          model: input.model,
          messages: input.messages,
          temperature: input.temperature,
          max_tokens: input.maxTokens,
        };
        let response: Response;
        try {
          response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify(payload),
          });
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `无法连接到 API 服务器：${err instanceof Error ? err.message : String(err)}`,
          });
        }
        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `API 请求失败 (${response.status} ${response.statusText})：${errorText.slice(0, 300)}`,
          });
        }
        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        };
        if (data.error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `API 返回错误：${data.error.message || JSON.stringify(data.error)}`,
          });
        }
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "API 返回了空内容，请检查模型名称是否正确",
          });
        }
        return { content };
      }),
  }),
  // ─── 用户 AI API 配置路由 ─────────────────────────────────────────────────
  userApiConfig: router({
    // 获取当前用户的 API 配置（不返回 apiKey 明文，只返回是否已配置）
    get: protectedProcedure.query(async ({ ctx }) => {
      const config = await getUserApiConfig(ctx.user.id);
      if (!config) return null;
      return {
        apiUrl: config.apiUrl,
        apiKeyMasked: config.apiKey.slice(0, 6) + "****" + config.apiKey.slice(-4),
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        updatedAt: config.updatedAt,
      };
    }),

    // 保存 API 配置（同时同步到 localStorage 的配置会被服务端持久化）
    save: protectedProcedure
      .input(z.object({
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        model: z.string().min(1),
        temperature: z.number().min(0).max(2).optional().default(0.7),
        maxTokens: z.number().min(256).max(32768).optional().default(4096),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertUserApiConfig({
          userId: ctx.user.id,
          apiUrl: input.apiUrl,
          apiKey: input.apiKey,
          model: input.model,
          temperature: String(input.temperature),
          maxTokens: input.maxTokens,
        });
        return { success: true };
      }),

    // 删除 API 配置
    delete: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const { userApiConfigs } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) await db.delete(userApiConfigs).where(eq(userApiConfigs.userId, ctx.user.id));
      return { success: true };
    }),
  }),

  // ─── 信号 AI 分析路由 ──────────────────────────────────────────────────────
  signalAnalysis: router({
    // 获取某条信号的 AI 分析结果
    get: publicProcedure
      .input(z.object({ signalId: z.number() }))
      .query(async ({ input }) => {
        return getSignalAnalysis(input.signalId);
      }),

    // 手动触发对某条信号的 AI 分析（需要登录）
    analyze: protectedProcedure
      .input(z.object({ signalId: z.number() }))
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const { signals } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const { analyzeSignal } = await import("./signalAnalyzer");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
        const rows = await db.select().from(signals).where(eq(signals.id, input.signalId)).limit(1);
        if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "信号不存在" });
        // 删除旧分析（允许重新分析）
        const { signalAnalyses } = await import("../drizzle/schema");
        await db.delete(signalAnalyses).where(eq(signalAnalyses.signalId, input.signalId));
        // 异步触发分析
        analyzeSignal(rows[0]).catch(console.error);
        return { success: true, message: "AI 分析已触发，请稍后刷新查看结果" };
      }),
  }),

  // ─── 管理路由（手动触发更新）──────────────────────────────────────────────
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

   // ─── 推送通知配置路由 ──────────────────────────────────────────────────────
  notifyConfig: router({
    // 获取通知配置（密码脱敏）
    get: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可查看通知配置" });
      }
      const config = await getNotifyConfig();
      if (!config) return null;
      // 密码脱敏：不返回 SMTP 密码和完整 Webhook URL
      return {
        emailEnabled: config.emailEnabled,
        toEmail: config.toEmail ?? "",
        smtpHost: config.smtpHost ?? "",
        smtpPort: config.smtpPort ?? 465,
        smtpSecure: config.smtpSecure ?? true,
        smtpUser: config.smtpUser ?? "",
        smtpPassSet: !!(config.smtpPass),  // 仅告知是否已设置
        feishuEnabled: config.feishuEnabled,
        feishuWebhookUrlSet: !!(config.feishuWebhookUrl),  // 仅告知是否已设置
        feishuWebhookUrlPreview: config.feishuWebhookUrl
          ? config.feishuWebhookUrl.slice(0, 40) + "..."
          : "",
        updatedAt: config.updatedAt,
      };
    }),
    // 保存通知配置
    save: protectedProcedure
      .input(z.object({
        emailEnabled: z.boolean(),
        toEmail: z.string().email("请输入有效的收件邮箱").optional().or(z.literal("")),
        smtpHost: z.string().optional().or(z.literal("")),
        smtpPort: z.number().int().min(1).max(65535).default(465),
        smtpSecure: z.boolean().default(true),
        smtpUser: z.string().optional().or(z.literal("")),
        smtpPass: z.string().optional().or(z.literal("")),  // 空字符串表示不修改
        feishuEnabled: z.boolean(),
        feishuWebhookUrl: z.string().url("请输入有效的 Webhook URL").optional().or(z.literal("")),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可修改通知配置" });
        }
        // 如果密码为空字符串，保留原有密码
        const existing = await getNotifyConfig();
        const smtpPass = input.smtpPass || existing?.smtpPass || undefined;
        const feishuWebhookUrl = input.feishuWebhookUrl || existing?.feishuWebhookUrl || undefined;
        await saveNotifyConfig({
          emailEnabled: input.emailEnabled,
          toEmail: input.toEmail || undefined,
          smtpHost: input.smtpHost || undefined,
          smtpPort: input.smtpPort,
          smtpSecure: input.smtpSecure,
          smtpUser: input.smtpUser || undefined,
          smtpPass: smtpPass || undefined,
          feishuEnabled: input.feishuEnabled,
          feishuWebhookUrl: feishuWebhookUrl || undefined,
        });
        return { success: true };
      }),
    // 测试邮件推送
    testEmail: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可测试推送" });
      }
      const config = await getNotifyConfig();
      if (!config?.smtpHost || !config?.smtpUser || !config?.smtpPass || !config?.toEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请先完整配置 SMTP 信息和收件邮箱" });
      }
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: config.smtpHost,
        port: config.smtpPort ?? 465,
        secure: config.smtpSecure ?? true,
        auth: { user: config.smtpUser, pass: config.smtpPass },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: `"FX 信号助手" <${config.smtpUser}>`,
        to: config.toEmail,
        subject: "【测试】FXStreet 交易信号 AI 推送测试",
        text: "此邮件是 FXStreet 交易信号 AI 分析系统的测试推送。\n如果您收到此邮件，说明邮件推送配置正确。",
        html: `<p>此邮件是 <strong>FXStreet 交易信号 AI 分析系统</strong>的测试推送。</p><p>如果您收到此邮件，说明邮件推送配置正确。</p>`,
      });
      return { success: true };
    }),
    // 测试飞书 Webhook 推送
    testFeishu: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可测试推送" });
      }
      const config = await getNotifyConfig();
      if (!config?.feishuWebhookUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请先配置飞书 Webhook URL" });
      }
      const response = await fetch(config.feishuWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text: "【测试】FXStreet 交易信号 AI 分析系统推送测试成功！" },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `飞书 Webhook 请求失败: ${response.status}` });
      }
      const result = await response.json() as { code?: number; msg?: string };
      if (result.code !== 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `飞书返回错误: ${result.msg}` });
      }
      return { success: true };
    }),
  }),

  // ─── 货币强弱矩阵路由 ──────────────────────────────────────────────────────────
  currencyStrength: router({
    // 获取最新的货币强弱矩阵缓存
    getMatrix: publicProcedure.query(async () => {
      const cache = await getCurrencyStrengthCache();
      if (!cache) return null;
      return {
        matrix: JSON.parse(cache.matrixJson),
        economicSummaries: cache.economicSummariesJson ? JSON.parse(cache.economicSummariesJson) : null,
        generatedAt: cache.generatedAt,
      };
    }),

    // 手动触发重新生成（仅管理员）
    triggerRefresh: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "仅管理员可触发货币强弱矩阵更新" });
      }
      safeRunStrengthMatrix("manual-trpc").catch(console.error);
      return { success: true, message: "货币强弱矩阵生成已触发，请稍后刷新查看结果" };
    }),
  }),

  // ─── 历史对话记录路由 ──────────────────────────────────────────────
  tradingConversation: router({
    // 获取当前用户的所有历史对话
    list: protectedProcedure.query(async ({ ctx }) => {
      return getTradingConversations(ctx.user.id);
    }),

    // 新建历史对话
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(255).default("未命名对话"),
        content: z.string().min(1),
        tags: z.string().max(500).optional(),
        conversationDate: z.string().optional(),  // YYYY-MM-DD
        source: z.string().max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        return createTradingConversation({
          userId: ctx.user.id,
          title: input.title,
          content: input.content,
          tags: input.tags,
          conversationDate: input.conversationDate ? new Date(input.conversationDate) : undefined,
          source: input.source,
        });
      }),

    // 更新历史对话
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        content: z.string().min(1).optional(),
        tags: z.string().max(500).optional(),
        conversationDate: z.string().optional(),
        source: z.string().max(100).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, conversationDate, ...rest } = input;
        await updateTradingConversation(id, ctx.user.id, {
          ...rest,
          conversationDate: conversationDate ? new Date(conversationDate) : undefined,
        });
        return { success: true };
      }),

    // 删除历史对话
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await deleteTradingConversation(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});
export type AppRouter = typeof appRouter;
