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
  getSignals: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1,
        messageId: "<test-msg-001@163.com>",
        subject: "BUY EURUSD @ 1.0850",
        body: "BUY EURUSD @ 1.0850\nSL: 1.0800\nTP: 1.0920",
        fromEmail: "signal@broker.com",
        receivedAt: new Date("2026-03-10T08:00:00Z"),
        status: "pending",
        createdAt: new Date(),
      },
    ],
    total: 1,
  }),
  updateSignalStatus: vi.fn().mockResolvedValue(undefined),
  getSignalNotes: vi.fn().mockResolvedValue([
    {
      id: 1,
      signalId: 1,
      userId: 1,
      userName: "Test User",
      content: "已按信号入场",
      updatedAt: new Date(),
      createdAt: new Date(),
    },
  ]),
  upsertSignalNote: vi.fn().mockResolvedValue(undefined),
  getAgentSessions: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      title: "EUR/USD 分析",
      pair: "EUR/USD",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  createAgentSession: vi.fn().mockResolvedValue({
    id: 2,
    userId: 1,
    title: "GBP/USD 分析",
    pair: "GBP/USD",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  deleteAgentSession: vi.fn().mockResolvedValue(undefined),
  getAgentMessages: vi.fn().mockResolvedValue([]),
  saveAgentMessage: vi.fn().mockResolvedValue(undefined),
  updateAgentSessionTitle: vi.fn().mockResolvedValue(undefined),
  getNewsContextForAgent: vi.fn().mockResolvedValue([]),
  getLatestInsightAndOutlooks: vi.fn().mockResolvedValue({ insight: null, outlooks: [] }),
}));

// Mock imapService
vi.mock("./imapService", () => ({
  fetchSignalEmails: vi.fn().mockResolvedValue({ fetched: 5, inserted: 2, errors: 0 }),
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
    // 验证新增的 duration 和 updatedAt 字段
    expect(typeof result.duration).toBe("string");
    expect(result.updatedAt).toBeInstanceOf(Date);
  });
});

describe("signals routes", () => {
  it("signals.list returns paginated signals", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.signals.list({ page: 1, pageSize: 20 });
    expect(result.items.length).toBe(1);
    expect(result.total).toBe(1);
    expect(result.items[0].subject).toBe("BUY EURUSD @ 1.0850");
  });

  it("signals.list filters by status", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.signals.list({ status: "pending" });
    expect(result).toBeDefined();
  });

  it("signals.updateStatus requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.signals.updateStatus({ id: 1, status: "executed" })
    ).rejects.toThrow();
  });

  it("signals.updateStatus works for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.signals.updateStatus({ id: 1, status: "executed" });
    expect(result.success).toBe(true);
  });

  it("signals.getNotes returns notes for a signal", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.signals.getNotes({ signalId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].content).toBe("已按信号入场");
  });

  it("signals.upsertNote requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.signals.upsertNote({ signalId: 1, content: "测试备注" })
    ).rejects.toThrow();
  });

  it("signals.upsertNote works for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.signals.upsertNote({ signalId: 1, content: "已按信号入场，止损设置正确" });
    expect(result.success).toBe(true);
  });

  it("signals.fetchNow requires admin role", async () => {
    const caller = appRouter.createCaller(createAuthContext("user"));
    await expect(caller.signals.fetchNow()).rejects.toThrow();
  });

  it("signals.fetchNow works for admin", async () => {
    process.env.IMAP_EMAIL = "test@163.com";
    process.env.IMAP_PASSWORD = "testpassword";
    const caller = appRouter.createCaller(createAuthContext("admin"));
    const result = await caller.signals.fetchNow();
    expect(result.fetched).toBe(5);
    expect(result.inserted).toBe(2);
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });
});

describe("agent routes", () => {
  it("agent.getSessions requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.agent.getSessions()).rejects.toThrow();
  });

  it("agent.getSessions returns sessions for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.agent.getSessions();
    expect(Array.isArray(result)).toBe(true);
  });

  it("agent.newSession requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.agent.newSession({ pair: "EUR/USD" })).rejects.toThrow();
  });

  it("agent.newSession creates session for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.agent.newSession({ pair: "GBP/USD" });
    expect(result).toBeDefined();
  });

  it("agent.deleteSession requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.agent.deleteSession({ sessionId: 1 })).rejects.toThrow();
  });

  it("agent.deleteSession works for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.agent.deleteSession({ sessionId: 1 });
    expect(result.success).toBe(true);
  });

  it("agent.getMessages requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.agent.getMessages({ sessionId: 1 })).rejects.toThrow();
  });

  it("agent.getMessages returns messages for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.agent.getMessages({ sessionId: 1 });
    expect(Array.isArray(result)).toBe(true);
  });
});
