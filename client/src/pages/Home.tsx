import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  TrendingUp, TrendingDown, Minus, Globe, Zap, BarChart2,
  DollarSign, Clock, ExternalLink, Mail, LogIn, LogOut,
  RefreshCw, AlertTriangle, Lightbulb, CheckCircle2,
  Newspaper, FileText, BrainCircuit, Signal, BookOpen,
  Target, Activity, Shield, ChevronDown, ChevronUp,
  Crosshair, Eye, XCircle, TrendingUp as TrendUp,
  Building2, Database, Layers
} from "lucide-react";
import { Link } from "wouter";
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

// 根据评分返回颜色
function scoreColor(score: number): string {
  if (score >= 2) return "oklch(0.45 0.20 145)";
  if (score >= 1) return "oklch(0.55 0.16 145)";
  if (score >= 0.5) return "oklch(0.62 0.12 145)";
  if (score > -0.5) return "oklch(0.55 0.04 60)";
  if (score > -1) return "oklch(0.62 0.12 25)";
  if (score > -2) return "oklch(0.55 0.16 25)";
  return "oklch(0.45 0.20 25)";
}

function scoreBackground(score: number): string {
  if (score >= 2) return "oklch(0.92 0.08 145)";
  if (score >= 1) return "oklch(0.94 0.06 145)";
  if (score >= 0.5) return "oklch(0.96 0.04 145)";
  if (score > -0.5) return "oklch(0.96 0.015 78)";
  if (score > -1) return "oklch(0.96 0.04 25)";
  if (score > -2) return "oklch(0.94 0.06 25)";
  return "oklch(0.92 0.08 25)";
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
  open, onClose, result,
}: {
  open: boolean; onClose: () => void; result: UpdateResult | null;
}) {
  if (!result) return null;
  const items = [
    { icon: <Newspaper className="w-5 h-5" />, label: "新增新闻", value: result.newsCount, unit: "条", color: "oklch(0.50 0.10 200)", bg: "oklch(0.95 0.04 200)" },
    { icon: <FileText className="w-5 h-5" />, label: "新增分析", value: result.analysisCount, unit: "篇", color: "oklch(0.55 0.15 140)", bg: "oklch(0.95 0.05 140)" },
    { icon: <BrainCircuit className="w-5 h-5" />, label: "市场洞察", value: result.insightGenerated ? "已生成" : "未更新", unit: "", color: result.insightGenerated ? "oklch(0.55 0.15 140)" : "oklch(0.55 0.04 60)", bg: result.insightGenerated ? "oklch(0.95 0.05 140)" : "oklch(0.94 0.02 75)" },
    { icon: <Globe className="w-5 h-5" />, label: "货币展望", value: result.outlooksGenerated, unit: "种货币", color: "oklch(0.60 0.13 60)", bg: "oklch(0.95 0.05 75)" },
  ];
  const totalNew = result.newsCount + result.analysisCount;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4" style={{ background: "linear-gradient(135deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 100%)" }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.60 0.13 60 / 0.30)" }}>
              <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.82 0.14 65)" }} />
            </div>
            <div>
              <DialogTitle className="text-white text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>更新完成</DialogTitle>
              <p className="text-xs" style={{ color: "oklch(0.72 0.04 70)" }}>
                耗时 {result.duration} 秒 · {result.updatedAt.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {items.map((item) => (
              <div key={item.label} className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: item.bg }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${item.color} / 0.15`, color: item.color }}>{item.icon}</div>
                <div>
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="font-bold text-sm text-foreground">{item.value}{item.unit && <span className="text-xs font-normal text-muted-foreground ml-0.5">{item.unit}</span>}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-4 border" style={{ background: "oklch(0.97 0.015 78)", borderColor: "oklch(0.88 0.03 70)" }}>
            <p className="text-sm text-foreground leading-relaxed">
              {totalNew > 0 ? `本次更新共抓取 ${totalNew} 条新内容，` : "本次未发现新文章，"}
              {result.insightGenerated ? "AI 市场洞察已重新生成，" : "市场洞察保持不变，"}
              {result.outlooksGenerated > 0 ? `${result.outlooksGenerated} 种货币展望已更新。` : "货币展望未更新。"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-center">页面数据已自动刷新 · 仅供参考，不构成投资建议</p>
        </div>
        <div className="px-6 pb-5">
          <Button className="w-full" onClick={onClose}><CheckCircle2 className="w-4 h-4 mr-1.5" /> 确认</Button>
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
      await Promise.all([
        utils.news.getRecent.invalidate({ limit: 8 }),
        utils.news.getBySource.invalidate({ limit: 5 }),
        utils.insights.getToday.invalidate(),
        utils.outlooks.getToday.invalidate(),
      ]);
      await Promise.all([
        utils.news.getRecent.refetch({ limit: 8 }),
        utils.news.getBySource.refetch({ limit: 5 }),
        utils.insights.getToday.refetch(),
        utils.outlooks.getToday.refetch(),
      ]);
      setShowResult(true);
    },
    onError: (err) => { toast.error(`更新失败：${err.message}`); },
  });

  if (!user || user.role !== "admin") return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}
        className="gap-1.5 text-xs border-amber-300/60 hover:bg-amber-50" style={{ color: "oklch(0.45 0.10 55)" }}>
        <RefreshCw className={`w-3 h-3 ${updateMutation.isPending ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">{updateMutation.isPending ? "更新中..." : "手动更新"}</span>
      </Button>
      <UpdateResultDialog open={showResult} onClose={() => setShowResult(false)} result={lastResult} />
    </>
  );
}

// ─── 更新进度提示条 ───────────────────────────────────────────────────────────

function UpdateProgressBanner({ isPending }: { isPending: boolean }) {
  if (!isPending) return null;
  return (
    <div className="fixed top-14 left-0 right-0 z-40 flex items-center justify-center gap-2 py-2 text-xs font-medium"
      style={{ background: "oklch(0.60 0.13 60 / 0.92)", color: "oklch(0.99 0.005 80)", backdropFilter: "blur(8px)" }}>
      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      正在抓取最新新闻并生成 AI 分析，请稍候（约 30–60 秒）...
    </div>
  );
}

// ─── 导航栏 ───────────────────────────────────────────────────────────────────

function Navbar({ user, loading, logout, isPendingUpdate }: { user: any; loading: boolean; logout: () => void; isPendingUpdate: boolean; }) {
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
          <Link href="/signals" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
            style={{ background: "oklch(0.60 0.13 60 / 0.15)", color: "oklch(0.82 0.14 65)", border: "1px solid oklch(0.60 0.13 60 / 0.30)" }}>
            <Signal className="w-3.5 h-3.5" />交易信号
          </Link>
          <Link href="/agent" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
            style={{ background: "oklch(0.55 0.15 50 / 0.15)", color: "oklch(0.75 0.15 50)", border: "1px solid oklch(0.55 0.15 50 / 0.30)" }}>
            <BrainCircuit className="w-3.5 h-3.5" />AI 分析师
          </Link>
          <Link href="/ideas" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
            style={{ background: "oklch(0.50 0.15 250 / 0.15)", color: "oklch(0.70 0.15 250)", border: "1px solid oklch(0.50 0.15 250 / 0.30)" }}>
            <TrendingUp className="w-3.5 h-3.5" />交易想法
          </Link>
          <Link href="/my-system" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
            style={{ background: "oklch(0.45 0.15 300 / 0.15)", color: "oklch(0.68 0.15 300)", border: "1px solid oklch(0.45 0.15 300 / 0.30)" }}>
            <BookOpen className="w-3.5 h-3.5" />交易体系
          </Link>
          {loading ? <Skeleton className="h-8 w-20" /> : user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">{user.name || user.email}</span>
              <UpdateButton user={user} />
              <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 text-xs">
                <LogOut className="w-3 h-3" /> 退出
              </Button>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5 text-xs" asChild>
              <a href={getLoginUrl()}><LogIn className="w-3 h-3" /> 登录</a>
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
    <section className="relative overflow-hidden py-12 md:py-16" style={{
      background: "linear-gradient(160deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 50%, oklch(0.20 0.05 40) 100%)"
    }}>
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: "radial-gradient(circle at 25% 25%, oklch(0.80 0.14 65) 0%, transparent 50%), radial-gradient(circle at 75% 75%, oklch(0.70 0.12 60) 0%, transparent 50%)"
      }} />
      <div className="container relative z-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
          style={{ background: "oklch(0.60 0.13 60 / 0.25)", color: "oklch(0.90 0.08 70)", border: "1px solid oklch(0.60 0.13 60 / 0.40)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "oklch(0.75 0.14 65)" }} />
          实时更新 · AI 驱动分析 · 《外汇交易三部曲》方法论
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight"
          style={{ fontFamily: "'Playfair Display', serif", textShadow: "0 2px 20px oklch(0 0 0 / 0.3)" }}>
          G8 货币驱动力分析<br />
          <span style={{ color: "oklch(0.82 0.14 65)" }}>The Assassin's Dashboard</span>
        </h1>
        <p className="text-sm md:text-base max-w-xl mx-auto mb-2" style={{ color: "oklch(0.78 0.04 75)", fontFamily: "'Lora', serif" }}>
          基于逻辑层次分析矩阵，实时追踪 G8 货币强弱驱动力，精准狙击高胜率机会
        </p>
        <p className="text-sm" style={{ color: "oklch(0.60 0.04 70)" }}>{today}</p>
      </div>
    </section>
  );
}

// ─── G8 货币强弱热力排行榜 ────────────────────────────────────────────────────

function CurrencyStrengthHeatmap({ scores }: { scores: any[] }) {
  const sorted = [...scores].sort((a, b) => b.compositeScore - a.compositeScore);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-2 min-w-max">
        {sorted.map((s, idx) => {
          const isTop = idx === 0;
          const isBottom = idx === sorted.length - 1;
          const color = scoreColor(s.compositeScore);
          const bg = scoreBackground(s.compositeScore);
          return (
            <div key={s.currency}
              className="flex flex-col items-center gap-1.5 rounded-xl px-4 py-3 relative"
              style={{ background: bg, border: `1.5px solid ${color}30`, minWidth: "80px" }}>
              {isTop && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "oklch(0.45 0.20 145)", color: "white", fontSize: "9px" }}>最强</div>
              )}
              {isBottom && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "oklch(0.45 0.20 25)", color: "white", fontSize: "9px" }}>最弱</div>
              )}
              <span className="text-xl">{s.flag}</span>
              <span className="font-bold text-sm" style={{ color }}>{s.currency}</span>
              <span className="font-mono text-base font-bold" style={{ color }}>
                {s.compositeScore > 0 ? "+" : ""}{s.compositeScore.toFixed(2)}
              </span>
              <div className="flex items-center gap-0.5 text-xs" style={{ color }}>
                {sentimentIcon(s.sentiment)}
                <span>{sentimentLabel(s.sentiment)}</span>
              </div>
              {/* 三层评分小条 */}
              <div className="w-full space-y-0.5 mt-1">
                {[
                  { label: "顶", score: s.topLayerScore.score, weight: "30%" },
                  { label: "中", score: s.midLayerScore.score, weight: "40%" },
                  { label: "底", score: s.bottomLayerScore.score, weight: "30%" },
                ].map(layer => (
                  <div key={layer.label} className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-4">{layer.label}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.02 70)" }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.abs(layer.score) / 3 * 100}%`,
                        background: layer.score >= 0 ? "oklch(0.55 0.16 145)" : "oklch(0.55 0.16 25)",
                        marginLeft: layer.score < 0 ? "auto" : undefined,
                      }} />
                    </div>
                    <span className="text-xs font-mono w-6 text-right" style={{ color: scoreColor(layer.score), fontSize: "10px" }}>
                      {layer.score > 0 ? "+" : ""}{layer.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 刺客精选详情卡片 ─────────────────────────────────────────────────────────

function AssassinPickCard({ pick }: { pick: any }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = pick.direction === "long";
  const accentColor = isLong ? "oklch(0.45 0.20 145)" : "oklch(0.45 0.20 25)";
  const accentBg = isLong ? "oklch(0.94 0.06 145)" : "oklch(0.94 0.06 25)";

  return (
    <div className="glass-card rounded-xl overflow-hidden border" style={{ borderColor: `${accentColor}30` }}>
      {/* 卡片头部 */}
      <div className="p-4" style={{ background: `linear-gradient(135deg, ${accentBg} 0%, oklch(0.97 0.01 78) 100%)` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: accentColor }}>
              <Crosshair className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-lg" style={{ fontFamily: "'Playfair Display', serif", color: accentColor }}>
                {pick.pair}
              </div>
              <div className="flex items-center gap-2">
                <Badge className="text-xs px-2 py-0.5" style={{ background: accentColor, color: "white" }}>
                  {isLong ? "▲ 做多" : "▼ 做空"}
                </Badge>
                {pick.isHighProbability && (
                  <Badge className="text-xs px-2 py-0.5 animate-pulse" style={{ background: "oklch(0.55 0.20 60)", color: "white" }}>
                    ⚡ 高胜率机会
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" style={{ color: accentColor }}>
              {pick.scoreDiff.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground">强弱差</div>
          </div>
        </div>

        {/* 方向建议 */}
        <div className="rounded-lg p-3 mt-2" style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}25` }}>
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: accentColor }} />
            <p className="text-sm leading-relaxed" style={{ color: accentColor }}>{pick.drivingAnalysis.direction}</p>
          </div>
        </div>
      </div>

      {/* 展开/收起按钮 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium transition-colors hover:bg-muted/50"
        style={{ color: "oklch(0.50 0.06 60)", borderTop: "1px solid oklch(0.90 0.02 70)" }}>
        <span>{expanded ? "收起详细分析" : "展开详细分析"}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* 详细分析 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 逻辑层次拆解 */}
          <div className="rounded-xl p-3.5" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Layers className="w-4 h-4" style={{ color: "oklch(0.50 0.10 200)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.40 0.08 200)" }}>逻辑层次拆解</span>
            </div>
            <div className="space-y-2">
              {[
                { label: "顶层驱动", desc: "地缘与制度", text: pick.logicBreakdown.topLayer, color: "oklch(0.50 0.10 200)", weight: "30%" },
                { label: "中层动力", desc: "央行逻辑", text: pick.logicBreakdown.midLayer, color: "oklch(0.55 0.15 140)", weight: "40%" },
                { label: "底层脉冲", desc: "近期数据", text: pick.logicBreakdown.bottomLayer, color: "oklch(0.60 0.13 60)", weight: "30%" },
              ].map(layer => (
                <div key={layer.label} className="flex gap-2.5">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: layer.color, fontSize: "9px" }}>{layer.weight}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: layer.color }}>{layer.label}
                      <span className="font-normal text-muted-foreground ml-1">({layer.desc})</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{layer.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 驱动分析三问 */}
          <div className="rounded-xl p-3.5" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Activity className="w-4 h-4" style={{ color: "oklch(0.55 0.15 50)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.40 0.12 50)" }}>驱动分析三问</span>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: accentColor, fontSize: "9px" }}>向</div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: accentColor }}>方向</div>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{pick.drivingAnalysis.direction}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: "oklch(0.55 0.12 250)", fontSize: "9px" }}>律</div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: "oklch(0.45 0.12 250)" }}>节奏</div>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{pick.drivingAnalysis.rhythm}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: "oklch(0.50 0.12 25)", fontSize: "9px" }}>废</div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: "oklch(0.45 0.12 25)" }}>失效点</div>
                  <p className="text-xs text-foreground/80 leading-relaxed mt-0.5">{pick.drivingAnalysis.invalidation}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 预期差监控 */}
          <div className="rounded-xl p-3.5" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Eye className="w-4 h-4" style={{ color: "oklch(0.55 0.14 300)" }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "oklch(0.40 0.12 300)" }}>预期差监控</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="rounded-lg p-2.5" style={{ background: "oklch(0.94 0.03 200 / 0.6)", border: "1px solid oklch(0.85 0.05 200)" }}>
                <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.45 0.10 200)" }}>市场预期</div>
                <p className="text-xs text-foreground/80 leading-relaxed">{pick.expectationGap.marketExpectation}</p>
              </div>
              <div className="rounded-lg p-2.5" style={{ background: "oklch(0.94 0.03 60 / 0.6)", border: "1px solid oklch(0.85 0.05 60)" }}>
                <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.45 0.10 60)" }}>实际驱动</div>
                <p className="text-xs text-foreground/80 leading-relaxed">{pick.expectationGap.actualDriving}</p>
              </div>
            </div>
            <div className="rounded-lg p-2.5" style={{ background: "oklch(0.94 0.04 300 / 0.4)", border: "1px solid oklch(0.85 0.06 300)" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.45 0.12 300)" }}>✂ 剪刀差</div>
              <p className="text-xs text-foreground/80 leading-relaxed">{pick.expectationGap.gapDescription}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 货币详情展开卡片 ─────────────────────────────────────────────────────────

function CurrencyDetailCard({ score }: { score: any }) {
  const [expanded, setExpanded] = useState(false);
  const color = scoreColor(score.compositeScore);
  const bg = scoreBackground(score.compositeScore);

  return (
    <div className="glass-card rounded-xl overflow-hidden border" style={{ borderColor: `${color}30` }}>
      <div className="p-4" style={{ background: `linear-gradient(135deg, ${bg} 0%, oklch(0.97 0.01 78) 100%)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{score.flag}</span>
            <div>
              <div className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>{score.currency}</div>
              <div className="text-xs text-muted-foreground">{score.currencyName} · {score.riskLabel}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-xl" style={{ color }}>
              {score.compositeScore > 0 ? "+" : ""}{score.compositeScore.toFixed(2)}
            </div>
            <div className={`flex items-center justify-end gap-1 text-xs ${sentimentClass(score.sentiment)}`}>
              {sentimentIcon(score.sentiment)}{sentimentLabel(score.sentiment)}
            </div>
          </div>
        </div>

        {/* 三层评分条 */}
        <div className="mt-3 space-y-1.5">
          {[
            { label: "顶层（地缘）", score: score.topLayerScore.score, weight: 30, summary: score.topLayerScore.summary },
            { label: "中层（货币政策）", score: score.midLayerScore.score, weight: 40, summary: score.midLayerScore.summary },
            { label: "底层（数据脉冲）", score: score.bottomLayerScore.score, weight: 30, summary: score.bottomLayerScore.summary },
          ].map(layer => (
            <div key={layer.label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-muted-foreground">{layer.label} <span className="opacity-60">×{layer.weight}%</span></span>
                <span className="text-xs font-mono font-semibold" style={{ color: scoreColor(layer.score) }}>
                  {layer.score > 0 ? "+" : ""}{layer.score}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.02 70)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${Math.abs(layer.score) / 3 * 100}%`,
                  background: layer.score >= 0 ? "oklch(0.55 0.16 145)" : "oklch(0.55 0.16 25)",
                  marginLeft: layer.score < 0 ? `${(1 - Math.abs(layer.score) / 3) * 100}%` : undefined,
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium transition-colors hover:bg-muted/50"
        style={{ color: "oklch(0.50 0.06 60)", borderTop: "1px solid oklch(0.90 0.02 70)" }}>
        <span>{expanded ? "收起分析" : "查看驱动分析"}</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 各层关键因素 */}
          {[
            { label: "顶层驱动", data: score.topLayerScore, color: "oklch(0.50 0.10 200)" },
            { label: "中层动力", data: score.midLayerScore, color: "oklch(0.55 0.15 140)" },
            { label: "底层脉冲", data: score.bottomLayerScore, color: "oklch(0.60 0.13 60)" },
          ].map(layer => (
            <div key={layer.label} className="rounded-lg p-3" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
              <div className="text-xs font-semibold mb-1.5" style={{ color: layer.color }}>{layer.label}</div>
              <p className="text-xs text-foreground/80 mb-1.5">{layer.data.summary}</p>
              <div className="flex flex-wrap gap-1">
                {layer.data.keyFactors.map((f: string, i: number) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: `${layer.color}15`, color: layer.color }}>{f}</span>
                ))}
              </div>
            </div>
          ))}

          {/* 驱动三问 */}
          <div className="rounded-lg p-3" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
            <div className="text-xs font-semibold mb-1.5" style={{ color }}>驱动分析三问</div>
            <div className="space-y-1.5">
              <div><span className="text-xs font-medium" style={{ color }}>方向：</span><span className="text-xs text-foreground/80">{score.drivingAnalysis.direction}</span></div>
              <div><span className="text-xs font-medium" style={{ color: "oklch(0.45 0.12 250)" }}>节奏：</span><span className="text-xs text-foreground/80">{score.drivingAnalysis.rhythm}</span></div>
              <div><span className="text-xs font-medium" style={{ color: "oklch(0.45 0.12 25)" }}>失效点：</span><span className="text-xs text-foreground/80">{score.drivingAnalysis.invalidation}</span></div>
            </div>
          </div>

          {/* 预期差 */}
          <div className="rounded-lg p-3" style={{ background: "oklch(0.96 0.015 78)", border: "1px solid oklch(0.88 0.03 70)" }}>
            <div className="text-xs font-semibold mb-1.5" style={{ color: "oklch(0.45 0.12 300)" }}>预期差监控</div>
            <p className="text-xs text-foreground/80">{score.expectationGap.gapDescription}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── G8 货币强弱矩阵主板块 ───────────────────────────────────────────────────

function CurrencyStrengthSection() {
  const { data: strengthData, isLoading } = trpc.currencyStrength.getMatrix.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // 每5分钟检查一次
  });

  if (isLoading) {
    return (
      <section className="py-10">
        <div className="container">
          <SectionTitle icon={<Activity className="w-5 h-5" />} title="G8 货币强弱矩阵" subtitle="逻辑层次分析矩阵 · AI 驱动力建模" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!strengthData || !strengthData.matrix) {
    return (
      <section className="py-10">
        <div className="container">
          <SectionTitle icon={<Activity className="w-5 h-5" />} title="G8 货币强弱矩阵" subtitle="逻辑层次分析矩阵 · AI 驱动力建模" />
          <div className="glass-card rounded-xl p-8 text-center">
            <Activity className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">货币强弱矩阵正在初始化中...</p>
            <p className="text-xs text-muted-foreground">系统将在每小时自动生成最新分析，首次生成约需 2-3 分钟</p>
          </div>
        </div>
      </section>
    );
  }

  const { matrix, economicSummaries } = strengthData;
  const scores: any[] = matrix.scores || [];
  const picks: any[] = matrix.picks || [];
  const generatedAt = strengthData.generatedAt ? new Date(strengthData.generatedAt) : null;

  return (
    <section className="py-10">
      <div className="container space-y-8">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <SectionTitle
            icon={<Activity className="w-5 h-5" />}
            title="G8 货币强弱矩阵"
            subtitle={`逻辑层次分析矩阵 · ${generatedAt ? `更新于 ${timeAgo(generatedAt)}` : "AI 驱动力建模"}`}
          />
          {generatedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              数据有效
            </div>
          )}
        </div>

        {/* 热力排行榜 */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.60 0.13 60 / 0.15)", color: "oklch(0.60 0.13 60)" }}>
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">实时强弱排行榜</div>
              <div className="text-xs text-muted-foreground">综合评分 = 顶层×30% + 中层×40% + 底层×30%，范围 -3 到 +3</div>
            </div>
          </div>
          {scores.length > 0 ? (
            <CurrencyStrengthHeatmap scores={scores} />
          ) : (
            <EmptyState message="评分数据加载中..." />
          )}
        </div>

        {/* 刺客精选 */}
        {picks.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "oklch(0.45 0.20 25 / 0.12)", color: "oklch(0.45 0.20 25)" }}>
                <Crosshair className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground leading-tight">The Assassin's Picks · 刺客精选</h2>
                <p className="text-xs text-muted-foreground">自动匹配强弱差最大的货币对 · 评分差 &gt; 3 标记为高胜率机会</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {picks.map((pick: any) => (
                <AssassinPickCard key={pick.pair} pick={pick} />
              ))}
            </div>
          </div>
        )}

        {/* 各货币详细分析 */}
        {scores.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "oklch(0.50 0.10 200 / 0.12)", color: "oklch(0.50 0.10 200)" }}>
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground leading-tight">货币驱动力详情</h2>
                <p className="text-xs text-muted-foreground">点击各货币卡片展开逻辑层次拆解与驱动分析三问</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...scores].sort((a: any, b: any) => b.compositeScore - a.compositeScore).map((score: any) => (
                <CurrencyDetailCard key={score.currency} score={score} />
              ))}
            </div>
          </div>
        )}
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
    <section className="py-10" style={{ background: "oklch(0.96 0.015 78)" }}>
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
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.60 0.13 60 / 0.15)" }}>
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
              <div className="rounded-xl p-4 border" style={{ background: "oklch(0.95 0.05 80 / 0.6)", borderColor: "oklch(0.80 0.10 65 / 0.5)" }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.60 0.13 60)" }} />
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "oklch(0.45 0.10 55)" }}>交易建议 · 风险提示</div>
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

// ─── 各国经济数据总结卡片 ─────────────────────────────────────────────────────

function EconomicSummaryCard({ summary }: { summary: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{summary.flag}</span>
            <div>
              <div className="font-bold text-sm">{summary.countryName || summary.currency}</div>
              <div className="text-xs text-muted-foreground">{summary.currency}</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">{summary.summary}</p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs font-medium flex items-center gap-1 transition-colors"
          style={{ color: "oklch(0.55 0.12 200)" }}>
          {expanded ? <><ChevronUp className="w-3 h-3" />收起</> : <><ChevronDown className="w-3 h-3" />展开</>}
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-2.5 border-t" style={{ borderColor: "oklch(0.88 0.03 70)" }}>
          <div className="pt-2.5">
            <div className="text-xs font-semibold mb-1.5" style={{ color: "oklch(0.45 0.16 145)" }}>经济亮点</div>
            <div className="space-y-1">
              {summary.keyStrengths?.map((s: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-green-500 text-xs mt-0.5">▲</span>
                  <span className="text-xs text-foreground/80">{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold mb-1.5" style={{ color: "oklch(0.45 0.16 25)" }}>经济隐忧</div>
            <div className="space-y-1">
              {summary.keyWeaknesses?.map((w: string, i: number) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span className="text-red-500 text-xs mt-0.5">▼</span>
                  <span className="text-xs text-foreground/80">{w}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg p-2.5" style={{ background: "oklch(0.95 0.03 60 / 0.6)", border: "1px solid oklch(0.85 0.05 60)" }}>
            <div className="text-xs font-semibold mb-1" style={{ color: "oklch(0.45 0.10 60)" }}>短期展望</div>
            <p className="text-xs text-foreground/80">{summary.outlook}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 新闻与分析板块（重构版：三 Tab） ────────────────────────────────────────

function NewsAndAnalysisSection() {
  const [activeTab, setActiveTab] = useState<"economic" | "centralbank" | "fxstreet">("economic");
  const { data: newsItems, isLoading: newsLoading } = trpc.news.getRecent.useQuery({ limit: 8 });
  const { data: analysisItems, isLoading: analysisLoading } = trpc.news.getBySource.useQuery({ limit: 5 });
  const { data: strengthData, isLoading: strengthLoading } = trpc.currencyStrength.getMatrix.useQuery();

  const economicSummaries: any[] = strengthData?.economicSummaries || [];

  const tabs = [
    { id: "economic" as const, label: "各国经济数据", icon: <Database className="w-3.5 h-3.5" />, desc: "TradingEconomics · AI 分析" },
    { id: "centralbank" as const, label: "央行政策动态", icon: <Building2 className="w-3.5 h-3.5" />, desc: "FXStreet 央行页面" },
    { id: "fxstreet" as const, label: "FXStreet 新闻", icon: <Newspaper className="w-3.5 h-3.5" />, desc: "实时新闻 & 专家分析" },
  ];

  return (
    <section className="py-10" style={{ background: "oklch(0.96 0.015 78)" }}>
      <div className="container">
        <SectionTitle icon={<Globe className="w-5 h-5" />} title="宏观信息中心" subtitle="多源数据聚合 · AI 深度分析" />

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap"
              style={activeTab === tab.id ? {
                background: "oklch(0.60 0.13 60)",
                color: "white",
                boxShadow: "0 2px 8px oklch(0.60 0.13 60 / 0.35)"
              } : {
                background: "white",
                color: "oklch(0.45 0.06 60)",
                border: "1px solid oklch(0.88 0.03 70)"
              }}>
              {tab.icon}
              <span>{tab.label}</span>
              {activeTab === tab.id && <span className="text-xs opacity-80">· {tab.desc}</span>}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        {activeTab === "economic" && (
          <div>
            {strengthLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
              </div>
            ) : economicSummaries.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <Database className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-1">各国经济数据总结正在生成中...</p>
                <p className="text-xs text-muted-foreground">数据来源：TradingEconomics · 每小时由 AI 自动分析更新</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {economicSummaries.map((summary: any) => (
                  <EconomicSummaryCard key={summary.currency} summary={summary} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "centralbank" && (
          <div>
            {strengthLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : (
              <div className="glass-card rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-4 h-4" style={{ color: "oklch(0.55 0.12 250)" }} />
                  <span className="text-sm font-semibold">G8 央行货币政策动态</span>
                  <span className="text-xs text-muted-foreground">· 来自 FXStreet 央行专区</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { name: "美联储 Fed", currency: "USD", flag: "🇺🇸", url: "https://www.fxstreet.com/macroeconomics/central-banks/fed" },
                    { name: "欧洲央行 ECB", currency: "EUR", flag: "🇪🇺", url: "https://www.fxstreet.com/macroeconomics/central-banks/ecb" },
                    { name: "日本央行 BoJ", currency: "JPY", flag: "🇯🇵", url: "https://www.fxstreet.com/macroeconomics/central-banks/boj" },
                    { name: "英国央行 BoE", currency: "GBP", flag: "🇬🇧", url: "https://www.fxstreet.com/macroeconomics/central-banks/boe" },
                    { name: "澳大利亚央行 RBA", currency: "AUD", flag: "🇦🇺", url: "https://www.fxstreet.com/macroeconomics/central-banks/rba" },
                    { name: "新西兰央行 RBNZ", currency: "NZD", flag: "🇳🇿", url: "https://www.fxstreet.com/macroeconomics/central-banks/rbnz" },
                    { name: "加拿大央行 BoC", currency: "CAD", flag: "🇨🇦", url: "https://www.fxstreet.com/macroeconomics/central-banks/boc" },
                    { name: "瑞士央行 SNB", currency: "CHF", flag: "🇨🇭", url: "https://www.fxstreet.com/macroeconomics/central-banks/snb" },
                  ].map(bank => {
                    const score = strengthData?.matrix?.scores?.find((s: any) => s.currency === bank.currency);
                    return (
                      <a key={bank.currency} href={bank.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 rounded-xl border transition-all hover:shadow-md group"
                        style={{ background: "white", borderColor: "oklch(0.88 0.03 70)" }}>
                        <span className="text-lg">{bank.flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">{bank.currency}</div>
                          {score && (
                            <div className="text-xs font-mono" style={{ color: scoreColor(score.compositeScore) }}>
                              {score.compositeScore > 0 ? "+" : ""}{score.compositeScore.toFixed(2)}
                            </div>
                          )}
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </a>
                    );
                  })}
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(0.95 0.03 200 / 0.5)", border: "1px solid oklch(0.85 0.05 200)" }}>
                  <p className="text-xs text-muted-foreground">
                    央行政策数据已集成到 G8 货币强弱矩阵的中层评分（权重 40%）中。点击上方各央行链接可直接查看 FXStreet 最新政策报道。
                    AI 分析师在进行货币对分析时，会自动注入最新央行政策动态作为上下文。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "fxstreet" && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4" style={{ color: "oklch(0.60 0.13 60)" }} />
                <span className="text-sm font-semibold">最新新闻</span>
                <span className="text-xs text-muted-foreground">· 来自 FXStreet</span>
              </div>
              {newsLoading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
              ) : !newsItems?.length ? (
                <EmptyState message="暂无新闻，正在抓取中..." />
              ) : (
                <div className="space-y-2.5">
                  {newsItems.map((item) => (
                    <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                      className="block glass-card rounded-xl p-4 hover:shadow-md transition-all duration-200 group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">{item.title}</p>
                          {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.description}</p>}
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
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: "oklch(0.55 0.15 140)" }} />
                <span className="text-sm font-semibold">专家分析</span>
                <span className="text-xs text-muted-foreground">· 深度解读</span>
              </div>
              {analysisLoading ? (
                <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
              ) : !analysisItems?.length ? (
                <EmptyState message="暂无分析文章..." />
              ) : (
                <div className="space-y-3">
                  {analysisItems.map((item) => (
                    <a key={item.id} href={item.link} target="_blank" rel="noopener noreferrer"
                      className="block glass-card rounded-xl p-4 hover:shadow-md transition-all duration-200 group">
                      <div className="flex items-start gap-3">
                        <div className="w-1 h-full min-h-[3rem] rounded-full flex-shrink-0" style={{ background: "oklch(0.60 0.13 60)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-3">{item.title}</p>
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
    <section className="py-12" style={{ background: "linear-gradient(135deg, oklch(0.22 0.04 55) 0%, oklch(0.28 0.06 60) 100%)" }}>
      <div className="container max-w-2xl text-center">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: "oklch(0.60 0.13 60 / 0.25)" }}>
          <Mail className="w-6 h-6" style={{ color: "oklch(0.82 0.14 65)" }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>订阅每日市场快报</h2>
        <p className="text-sm mb-6" style={{ color: "oklch(0.75 0.04 75)", fontFamily: "'Lora', serif" }}>每日精选外汇市场动态与 AI 分析，直达您的邮箱</p>
        {!user ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm" style={{ color: "oklch(0.70 0.04 75)" }}>请先登录后订阅</p>
            <Button asChild className="gap-2"><a href={getLoginUrl()}><LogIn className="w-4 h-4" /> 立即登录</a></Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-md mx-auto">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="输入您的邮箱地址" required
              className="flex-1 px-4 py-2 rounded-lg text-sm outline-none focus:ring-2"
              style={{ background: "oklch(1 0 0 / 0.12)", border: "1px solid oklch(1 0 0 / 0.20)", color: "white" }} />
            <Button type="submit" disabled={subscribeMutation.isPending} className="gap-1.5 whitespace-nowrap">
              {subscribeMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}订阅
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
          <span>数据：FXStreet · TradingEconomics</span>
          <span>·</span>
          <span>方法论：《外汇交易三部曲》</span>
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
        <CurrencyStrengthSection />
        <InsightSection />
        <NewsAndAnalysisSection />
        <SubscriptionSection user={user} />
      </main>
      <Footer />
    </div>
  );
}
