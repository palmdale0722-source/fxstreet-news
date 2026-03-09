import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// Mock db module
vi.mock("./db", () => ({
  getRecentNews: vi.fn().mockResolvedValue([
    {
      id: 1,
      title: "EUR/USD tests support at 1.15",
      link: "https://www.fxstreet.com/news/test",
      description: "Euro under pressure",
      publishedAt: new Date("2026-03-09T10:00:00Z"),
      source: "News",
      author: "John Doe",
      createdAt: new Date(),
    },
  ]),
  getAnalysisArticles: vi.fn().mockResolvedValue([
    {
      id: 2,
      title: "USD outlook: Dollar strengthens on safe-haven demand",
      link: "https://www.fxstreet.com/analysis/test",
      description: "Analysis of USD",
      publishedAt: new Date("2026-03-09T09:00:00Z"),
      source: "Analysis",
      author: "Jane Smith",
      createdAt: new Date(),
    },
  ]),
  getTodayInsight: vi.fn().mockResolvedValue({
    id: 1,
    date: "2026-03-09",
    summary: "Markets under pressure from Middle East tensions",
    geopolitics: "Geopolitical risks elevated",
    energy: "Oil prices surge",
    forex: "USD strengthens",
    assets: "Gold falls",
    tradingAdvice: "Exercise caution",
    generatedAt: new Date(),
  }),
  getTodayOutlooks: vi.fn().mockResolvedValue([
    {
      id: 1,
      date: "2026-03-09",
      currency: "EUR",
      outlook: "Euro faces downside pressure",
      sentiment: "bearish",
      riskLabel: "主要货币",
      sourceLink: "https://www.fxstreet.com/currencies/eur",
      generatedAt: new Date(),
    },
  ]),
  addSubscription: vi.fn().mockResolvedValue({ success: true, message: "订阅成功！" }),
}));

// Mock fxService
vi.mock("./fxService", () => ({
  runFullUpdate: vi.fn().mockResolvedValue({
    newsCount: 10,
    analysisCount: 3,
    insightGenerated: true,
    outlooksGenerated: 8,
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("auth routes", () => {
  it("auth.me returns null for unauthenticated user", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("test@example.com");
  });

  it("auth.logout clears session cookie", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

describe("news routes", () => {
  it("news.getRecent returns news items", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.news.getRecent({ limit: 8 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].source).toBe("News");
  });

  it("news.getBySource returns analysis items", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.news.getBySource({ limit: 5 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].source).toBe("Analysis");
  });
});

describe("insights routes", () => {
  it("insights.getToday returns today's insight", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.insights.getToday();
    expect(result).not.toBeNull();
    expect(result?.date).toBe("2026-03-09");
    expect(result?.summary).toBeTruthy();
  });
});

describe("outlooks routes", () => {
  it("outlooks.getToday returns currency outlooks", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.outlooks.getToday();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].currency).toBe("EUR");
    expect(["bullish", "bearish", "neutral"]).toContain(result[0].sentiment);
  });
});

describe("subscription routes", () => {
  it("subscription.subscribe requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.subscription.subscribe({ email: "test@example.com" })
    ).rejects.toThrow();
  });

  it("subscription.subscribe works for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.subscription.subscribe({ email: "test@example.com" });
    expect(result.success).toBe(true);
  });
});

describe("admin routes", () => {
  it("admin.triggerUpdate requires admin role", async () => {
    const caller = appRouter.createCaller(createAuthContext("user"));
    await expect(caller.admin.triggerUpdate()).rejects.toThrow("仅管理员可触发更新");
  });

  it("admin.triggerUpdate works for admin", async () => {
    const caller = appRouter.createCaller(createAuthContext("admin"));
    const result = await caller.admin.triggerUpdate();
    expect(result.insightGenerated).toBe(true);
    expect(result.outlooksGenerated).toBe(8);
  });
});
