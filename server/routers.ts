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
  type SignalStatus,
} from "./db";
import { runFullUpdate } from "./fxService";
import { fetchSignalEmails } from "./imapService";

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

  // ─── 管理路由（手动触发更新）────────────────────────────────────────────────
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
