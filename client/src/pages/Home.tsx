import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Minus, Globe, Zap, BarChart2,
  DollarSign, Clock, ExternalLink, Mail, LogIn, LogOut,
  RefreshCw, AlertTriangle, Lightbulb, CheckCircle2,
  Newspaper, FileText, BrainCircuit, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function timeAgo(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.floor(hrs / 24)}天前`;
}

function sentimentIcon(s: string) {
  if (s === "bullish") return <TrendingUp className="w-3.5 h-3.5" />;
  if (s === "bearish") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function sentimentLabel(s: string) {
  if (s === "bullish") return "看涨";
  if (s === "bearish") return "看跌";
  return "中性";
}

function sentimentClass(s: string) {
  if (s === "bullish") return "sentiment-bullish";
  if (s === "bearish") return "sentiment-bearish";
  return "sentiment-neutral";
}

// ─── 更新结果摘要弹窗 ─────────────────────────────────────────────────────────

type UpdateResult = {
  newsCount: number;
  analysisCount: number;
  insightGenerated: boolean;
  outlooksGenerated: number;
  duration: string;
  updatedAt: Date;
};

function UpdateResultDialog({
  open,
  onClose,
  result,
}: {
  open: boolean;
  onClose: () => void;
  result: UpdateResult | null;
}) {
  if (!result) return null;

  const items = [
    {
      icon: <Newspaper className="w-5 h-5" />,
      label: "新增新闻",
      value: result.newsCount,
      unit: "条",
      color: "oklch(0.50 0.10 200)",
      bg: "oklch(0.95 0.04 200)",
    },
    {
      icon: <FileText className="w-5 h-5" />,
      label: "新增分析",
      value: result.analysisCount,
      unit: "篇",
      color: "oklch(0.55 0.15 140)",
      bg: "oklch(0.95 0.05 140)",
    },
    {
      icon: <BrainCircuit className="w-5 h-5" />,
      label: "市场洞察",
      value: result.insightGenerated ? "已生成" : "未更新",
      unit: "",
      color: result.insightGenerated ? "oklch(0.55 0.15 140)" : "oklch(0.55 0.04 60)",
      bg: result.insightGenerated ? "oklch(0.95 0.05 140)" : "oklch(0.94 0.02 75)",
    },
    {
      icon: <Globe className="w-5 h-5" />,
      label: "货币展望",
      value: result.outlooksGenerated,
      unit: "种货币",
      color: "oklch(0.60 0.13 60)",
      bg: "oklch(0.95 0.05 75)",
    },
  ];

  const totalNew = result.newsCount + result.analysisCount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* 顶部标题区 */}
        <div className="px-6 pt-6 pb-4" style={{
          background: "linear-gradient(135deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 100%)"
        }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "oklch(0.60 0.13 60 / 0.30)" }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.82 0.14 65)" }} />
            </div>
            <div>
              <DialogTitle className="text-white text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                更新完成
              </DialogTitle>
              <p className="text-xs" style={{ color: "oklch(0.72 0.04 70)" }}>
                耗时 {result.duration} 秒 · {result.updatedAt.toLocaleString("zh-CN", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                })}
              </p>
            </div>
          </div>
        </div>

        {/* 数据摘要 */}
        <div className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-xl p-3.5 flex items-center gap-3"
                style={{ background: item.bg }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${item.color} / 0.15`, color: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="font-bold text-sm text-foreground">
                    {item.value}{item.unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{item.unit}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 总结文字 */}
          <div className="rounded-xl p-4 border" style={{
            background: "oklch(0.97 0.015 78)",
            borderColor: "oklch(0.88 0.03 70)"
          }}>
            <p className="text-sm text-foreground leading-relaxed">
              {totalNew > 0
                ? `本次更新共抓取 <strong>${totalNew} 条</strong>新内容（${result.newsCount} 条新闻 + ${result.analysisCount} 篇分析），`
                : "本次未发现新文章（数据库已是最新），"}
              {result.insightGenerated
                ? "AI 市场洞察已重新生成，"
                : "市场洞察保持不变，"}
              {result.outlooksGenerated > 0
                ? `${result.outlooksGenerated} 种货币展望已更新。`
                : "货币展望未更新。"}
            </p>
          </div>

          {/* 风险提示 */}
          <p className="text-xs text-muted-foreground text-center">
            页面数据已自动刷新 · 仅供参考，不构成投资建议
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 pb-5">
          <Button className="w-full" onClick={onClose}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> 确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── 手动更新按钮 ─────────────────────────────────────────────────────────────

function UpdateButton({ user }: { user: any }) {
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<UpdateResult | null>(null);
  const utils = trpc.useUtils();

  const updateMutation = trpc.admin.triggerUpdate.useMutation({
    onSuccess: async (data) => {
      setLastResult(data as UpdateResult);
      setShowResult(true);
      // 刷新所有相关数据
      await Promise.all([
        utils.news.getRecent.invalidate(),
        utils.news.getBySource.invalidate(),
        utils.insights.getToday.invalidate(),
        utils.outlooks.getToday.invalidate(),
      ]);
    },
    onError: (err) => {
      toast.error(`更新失败：${err.message}`);
    },
  });

  if (!user || user.role !== "admin") return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => updateMutation.mutate()}
        disabled={updateMutation.isPending}
        className="gap-1.5 text-xs border-amber-300/60 hover:bg-amber-50"
        style={{ color: "oklch(0.45 0.10 55)" }}
        title="手动触发RSS抓取和AI分析更新"
      >
        <RefreshCw className={`w-3 h-3 ${updateMutation.isPending ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">
          {updateMutation.isPending ? "更新中..." : "手动更新"}
        </span>
      </Button>

      <UpdateResultDialog
        open={showResult}
        onClose={() => setShowResult(false)}
        result={lastResult}
      />
    </>
  );
}

// ─── 更新进度提示条 ───────────────────────────────────────────────────────────

function UpdateProgressBanner({ isPending }: { isPending: boolean }) {
  if (!isPending) return null;
  return (
    <div className="fixed top-14 left-0 right-0 z-40 flex items-center justify-center gap-2 py-2 text-xs font-medium"
      style={{
        background: "oklch(0.60 0.13 60 / 0.92)",
        color: "oklch(0.99 0.005 80)",
        backdropFilter: "blur(8px)",
      }}>
      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      正在抓取最新新闻并生成 AI 分析，请稍候（约 30–60 秒）...
    </div>
  );
}

// ─── 导航栏 ───────────────────────────────────────────────────────────────────

function Navbar({
  user, loading, logout, isPendingUpdate
}: {
  user: any; loading: boolean; logout: () => void; isPendingUpdate: boolean;
}) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 glass-card">
      <div className="container flex items-center justify-between h-14">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.60 0.13 60)" }}>
            <BarChart2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              FX<span style={{ color: "oklch(0.60 0.13 60)" }}>Street</span>
            </span>
            <span className="text-xs text-muted-foreground ml-1.5 hidden sm:inline">外汇资讯与AI分析</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {now.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">{user.name || user.email}</span>
              {/* 手动更新按钮（仅管理员可见） */}
              <UpdateButton user={user} />
              <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 text-xs">
                <LogOut className="w-3 h-3" /> 退出
              </Button>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5 text-xs" asChild>
              <a href={getLoginUrl()}>
                <LogIn className="w-3 h-3" /> 登录
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero 区域 ────────────────────────────────────────────────────────────────

function HeroSection() {
  const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  return (
    <section className="relative overflow-hidden py-14 md:py-20" style={{
      background: "linear-gradient(160deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 50%, oklch(0.20 0.05 40) 100%)"
    }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: "radial-gradient(circle at 25% 25%, oklch(0.80 0.14 65) 0%, transparent 50%), radial-gradient(circle at 75% 75%, oklch(0.70 0.12 60) 0%, transparent 50%)"
      }} />
      <div className="container relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5"
          style={{ background: "oklch(0.60 0.13 60 / 0.25)", color: "oklch(0.90 0.08 70)", border: "1px solid oklch(0.60 0.13 60 / 0.40)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.75 0.14 65)" }} />
          实时更新 · AI 驱动分析
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 leading-tight"
          style={{ fontFamily: "'Playfair Display', serif", textShadow: "0 2px 20px oklch(0 0 0 / 0.3)" }}>
          外汇市场资讯<br />
          <span style={{ color: "oklch(0.82 0.14 65)" }}>AI 深度分析</span>
        </h1>
        <p className="text-base md:text-lg max-w-xl mx-auto mb-2" style={{ color: "oklch(0.78 0.04 75)", fontFamily: "'Lora', serif" }}>
          实时追踪 FXStreet 全球外汇新闻，AI 生成市场洞察与货币展望
        </p>
        <p className="text-sm" style={{ color: "oklch(0.60 0.04 70)" }}>{today}</p>
      </div>
    </section>
  );
}

// ─── 今日市场洞察 ─────────────────────────────────────────────────────────────

function InsightSection() {
  const { data: insight, isLoading } = trpc.insights.getToday.useQuery();

  const sections = [
    { key: "geopolitics", label: "地缘政治", icon: <Globe className="w-4 h-4" />, color: "oklch(0.50 0.10 200)" },
    { key: "energy", label: "能源价格", icon: <Zap className="w-4 h-4" />, color: "oklch(0.55 0.14 30)" },
    { key: "forex", label: "汇市表现", icon: <DollarSign className="w-4 h-4" />, color: "oklch(0.60 0.13 60)" },
    { key: "assets", label: "其他资产", icon: <BarChart2 className="w-4 h-4" />, color: "oklch(0.55 0.15 140)" },
  ] as const;

  return (
    <section className="py-10">
      <div className="container">
        <SectionTitle icon={<Lightbulb className="w-5 h-5" />} title="今日市场洞察" subtitle="AI 生成 · 每小时更新" />
        {isLoading ? (
          <div className="grid gap-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
            </div>
          </div>
        ) : !insight ? (
          <EmptyState message="今日洞察正在生成中，请稍后刷新..." />
        ) : (
          <div className="space-y-4">
            <div className="glass-card rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "oklch(0.60 0.13 60 / 0.15)" }}>
                  <BarChart2 className="w-4 h-4" style={{ color: "oklch(0.60 0.13 60)" }} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">市场总结</div>
                  <p className="text-sm leading-relaxed text-foreground">{insight.summary}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {sections.map(({ key, label, icon, color }) => {
                const text = insight[key as keyof typeof insight] as string;
                return (
                  <div key={key} className="glass-card rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `color-mix(in oklch, ${color} 12%, transparent)`, color }}>
                        {icon}
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-foreground/85">{text || "暂无数据"}</p>
                  </div>
                );
              })}
            </div>
            {insight.tradingAdvice && (
              <div className="rounded-xl p-4 border" style={{
                background: "oklch(0.95 0.05 80 / 0.6)",
                borderColor: "oklch(0.80 0.10 65 / 0.5)"
              }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.60 0.13 60)" }} />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "oklch(0.45 0.10 55)" }}>
                      交易建议 · 风险提示
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.35 0.06 55)" }}>{insight.tradingAdvice}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 新闻与分析 ───────────────────────────────────────────────────────────────

function NewsAndAnalysisSection() {
  const { data: newsItems, isLoading: newsLoading } = trpc.news.getRecent.useQuery({ limit: 8 });
  const { data: analysisItems, isLoading: analysisLoading } = trpc.news.getBySource.useQuery({ limit: 5 });

  return (
    <section className="py-10" style={{ background: "oklch(0.96 0.015 78)" }}>
      <div className="container">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <SectionTitle icon={<Clock className="w-5 h-5" />} title="最新新闻" subtitle="来自 FXStreet" />
            {newsLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : !newsItems?.length ? (
              <EmptyState message="暂无新闻，正在抓取中..." />
            ) : (
              <div className="space-y-2.5">
                {newsItems.map((item) => (
                  <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                    className="block glass-card rounded-xl p-4 hover:shadow-md transition-all duration-200 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-muted-foreground">{timeAgo(item.publishedAt)}</span>
                          {item.author && <span className="text-xs text-muted-foreground">· {item.author}</span>}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="lg:col-span-2">
            <SectionTitle icon={<TrendingUp className="w-5 h-5" />} title="专家分析" subtitle="深度解读" />
            {analysisLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : !analysisItems?.length ? (
              <EmptyState message="暂无分析文章..." />
            ) : (
              <div className="space-y-3">
                {analysisItems.map((item) => (
                  <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                    className="block glass-card rounded-xl p-4 hover:shadow-md transition-all duration-200 group">
                    <div className="flex items-start gap-3">
                      <div className="w-1 h-full min-h-[3rem] rounded-full flex-shrink-0"
                        style={{ background: "oklch(0.60 0.13 60)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-3">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">分析</Badge>
                          <span className="text-xs text-muted-foreground">{timeAgo(item.publishedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 货币展望 ─────────────────────────────────────────────────────────────────

function OutlooksSection() {
  const { data: outlooks, isLoading } = trpc.outlooks.getToday.useQuery();

  const currencyFlags: Record<string, string> = {
    EUR: "🇪🇺", USD: "🇺🇸", JPY: "🇯🇵", AUD: "🇦🇺",
    GBP: "🇬🇧", NZD: "🇳🇿", CHF: "🇨🇭", CAD: "🇨🇦",
  };

  return (
    <section className="py-10">
      <div className="container">
        <SectionTitle icon={<Globe className="w-5 h-5" />} title="主要货币展望" subtitle="AI 生成 · 今日分析" />
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : !outlooks?.length ? (
          <EmptyState message="货币展望正在生成中，请稍后刷新..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {outlooks.map((item) => (
              <div key={item.id} className="glass-card rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{currencyFlags[item.currency] || "💱"}</span>
                    <div>
                      <div className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
                        {item.currency}
                      </div>
                      {item.riskLabel && (
                        <div className="text-xs text-muted-foreground">{item.riskLabel}</div>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sentimentClass(item.sentiment)}`}>
                    {sentimentIcon(item.sentiment)}
                    {sentimentLabel(item.sentiment)}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-foreground/80 flex-1 line-clamp-5">
                  {item.outlook}
                </p>
                {item.sourceLink && (
                  <a href={item.sourceLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline mt-auto">
                    <ExternalLink className="w-3 h-3" /> 查看详情
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 邮件订阅 ─────────────────────────────────────────────────────────────────

function SubscriptionSection({ user }: { user: any }) {
  const [email, setEmail] = useState(user?.email || "");
  const subscribeMutation = trpc.subscription.subscribe.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.message);
    },
    onError: () => toast.error("订阅失败，请稍后重试"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    subscribeMutation.mutate({ email });
  };

  return (
    <section className="py-12" style={{
      background: "linear-gradient(135deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 100%)"
    }}>
      <div className="container max-w-2xl text-center">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "oklch(0.60 0.13 60 / 0.25)" }}>
          <Mail className="w-6 h-6" style={{ color: "oklch(0.82 0.14 65)" }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          订阅每日市场快报
        </h2>
        <p className="text-sm mb-6" style={{ color: "oklch(0.75 0.04 75)", fontFamily: "'Lora', serif" }}>
          每日精选外汇市场动态与 AI 分析，直达您的邮箱
        </p>
        {!user ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm" style={{ color: "oklch(0.70 0.04 75)" }}>请先登录后订阅</p>
            <Button asChild className="gap-2">
              <a href={getLoginUrl()}>
                <LogIn className="w-4 h-4" /> 立即登录
              </a>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="输入您的邮箱地址"
              required
              className="flex-1 px-4 py-2 rounded-lg text-sm outline-none focus:ring-2"
              style={{
                background: "oklch(1 0 0 / 0.12)",
                border: "1px solid oklch(1 0 0 / 0.20)",
                color: "white",
              }}
            />
            <Button type="submit" disabled={subscribeMutation.isPending} className="gap-1.5 whitespace-nowrap">
              {subscribeMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              订阅
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

// ─── 页脚 ─────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border py-6">
      <div className="container flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5" style={{ color: "oklch(0.60 0.13 60)" }} />
          <span style={{ fontFamily: "'Playfair Display', serif" }}>FXStreet 外汇资讯与AI分析平台</span>
        </div>
        <div className="flex items-center gap-4">
          <span>数据来源：FXStreet RSS</span>
          <span>·</span>
          <span>AI 分析：每小时更新</span>
          <span>·</span>
          <span>仅供参考，不构成投资建议</span>
        </div>
      </div>
    </footer>
  );
}

// ─── 通用组件 ─────────────────────────────────────────────────────────────────

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "oklch(0.60 0.13 60 / 0.12)", color: "oklch(0.60 0.13 60)" }}>
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
      {message}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, loading, logout } = useAuth();
  const [isPendingUpdate, setIsPendingUpdate] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} loading={loading} logout={logout} isPendingUpdate={isPendingUpdate} />
      <UpdateProgressBanner isPending={isPendingUpdate} />
      <main className="flex-1">
        <HeroSection />
        <InsightSection />
        <NewsAndAnalysisSection />
        <OutlooksSection />
        <SubscriptionSection user={user} />
      </main>
      <Footer />
    </div>
  );
}
