import { z } from "zod";
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
} from "./db";
import { runFullUpdate } from "./fxService";

const getTodayDate = () => new Date().toISOString().slice(0, 10);

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
