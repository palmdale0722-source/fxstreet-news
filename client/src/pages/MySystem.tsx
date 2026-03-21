/**
 * 交易体系管理页面 /my-system
 * 包含三个标签页：
 * 1. 交易体系知识库 - 记录交易哲学、方法论、入场/出场规则、风险管理等
 * 2. 历史交易记录 - 记录每笔交易的入场理由、复盘总结
 * 3. MT4 指标配置 - 配置自定义指标的解读规则
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BookOpen, TrendingUp, TrendingDown, Settings2, Plus, Pencil, Trash2,
  ChevronLeft, CheckCircle, XCircle, BarChart2, BrainCircuit, ArrowUpRight,
  ArrowDownRight, Clock, Tag, DollarSign, Activity, Lightbulb, LogIn,
  Upload, FileText, AlertCircle, CheckCircle2
} from "lucide-react";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

type TradingSystemCategory =
  | "philosophy" | "methodology" | "entry_rules" | "exit_rules"
  | "risk_management" | "pairs_preference" | "session_preference" | "other";

const CATEGORY_LABELS: Record<TradingSystemCategory, string> = {
  philosophy: "交易哲学",
  methodology: "分析方法论",
  entry_rules: "入场规则",
  exit_rules: "出场规则",
  risk_management: "风险管理",
  pairs_preference: "偏好货币对",
  session_preference: "偏好交易时段",
  other: "其他",
};

const CATEGORY_COLORS: Record<TradingSystemCategory, string> = {
  philosophy: "oklch(0.55 0.15 280)",
  methodology: "oklch(0.50 0.15 220)",
  entry_rules: "oklch(0.50 0.15 140)",
  exit_rules: "oklch(0.55 0.15 30)",
  risk_management: "oklch(0.55 0.15 10)",
  pairs_preference: "oklch(0.50 0.15 60)",
  session_preference: "oklch(0.50 0.15 190)",
  other: "oklch(0.50 0.05 0)",
};

const G8_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "AUD/USD", "USD/CAD", "NZD/USD", "EUR/GBP",
  "EUR/JPY", "GBP/JPY", "EUR/AUD", "EUR/CAD",
  "EUR/CHF", "EUR/NZD", "GBP/AUD", "GBP/CAD",
  "GBP/CHF", "GBP/NZD", "AUD/JPY", "CAD/JPY",
  "CHF/JPY", "NZD/JPY", "AUD/CAD", "AUD/CHF",
  "AUD/NZD", "CAD/CHF", "NZD/CAD", "NZD/CHF",
];

// ─── 交易体系知识库标签页 ─────────────────────────────────────────────────────

function TradingSystemTab() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.tradingSystem.list.useQuery();
  const [editItem, setEditItem] = useState<{
    id?: number; category: TradingSystemCategory; title: string; content: string; active: boolean;
  } | null>(null);

  const createMutation = trpc.tradingSystem.create.useMutation({
    onSuccess: () => { utils.tradingSystem.list.invalidate(); setEditItem(null); toast.success("已添加"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.tradingSystem.update.useMutation({
    onSuccess: () => { utils.tradingSystem.list.invalidate(); setEditItem(null); toast.success("已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.tradingSystem.delete.useMutation({
    onSuccess: () => { utils.tradingSystem.list.invalidate(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!editItem) return;
    if (!editItem.title.trim() || !editItem.content.trim()) {
      toast.error("标题和内容不能为空");
      return;
    }
    if (editItem.id) {
      updateMutation.mutate({ id: editItem.id, ...editItem });
    } else {
      createMutation.mutate({ ...editItem, sortOrder: 0 });
    }
  };

  const grouped = (items ?? []).reduce((acc, item) => {
    const cat = item.category as TradingSystemCategory;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<TradingSystemCategory, typeof items>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">交易体系知识库</h2>
          <p className="text-sm text-muted-foreground mt-0.5">记录你的交易哲学、方法论和规则，AI 分析师将优先参考这些内容</p>
        </div>
        <Button
          size="sm"
          onClick={() => setEditItem({ category: "philosophy", title: "", content: "", active: true })}
          className="gap-1.5"
          style={{ background: "oklch(0.55 0.15 280)", color: "white" }}
        >
          <Plus className="w-4 h-4" /> 添加条目
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !items || items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border">
          <Lightbulb className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">还没有任何交易体系条目</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击「添加条目」开始记录你的交易思想</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(Object.keys(CATEGORY_LABELS) as TradingSystemCategory[]).map(cat => {
            const catItems = grouped[cat];
            if (!catItems || catItems.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[cat] }} />
                  <span className="text-sm font-semibold text-foreground">{CATEGORY_LABELS[cat]}</span>
                  <span className="text-xs text-muted-foreground">({catItems.length})</span>
                </div>
                <div className="space-y-2">
                  {catItems.map(item => (
                    <div key={item!.id} className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors"
                      style={{ background: "oklch(0.98 0.005 280 / 0.5)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-foreground">{item!.title}</span>
                            {!item!.active && (
                              <Badge variant="secondary" className="text-xs">已停用</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{item!.content}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => setEditItem({ id: item!.id, category: item!.category as TradingSystemCategory, title: item!.title, content: item!.content, active: item!.active })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => { if (confirm("确认删除此条目？")) deleteMutation.mutate({ id: item!.id }); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 编辑/新增弹窗 */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? "编辑条目" : "添加条目"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">分类</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABELS) as TradingSystemCategory[]).map(cat => (
                    <button key={cat}
                      onClick={() => setEditItem({ ...editItem, category: cat })}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                      style={{
                        background: editItem.category === cat ? CATEGORY_COLORS[cat] : "transparent",
                        color: editItem.category === cat ? "white" : "oklch(0.45 0.05 0)",
                        borderColor: editItem.category === cat ? CATEGORY_COLORS[cat] : "oklch(0.85 0.02 0)",
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">标题</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="例如：趋势跟随核心原则"
                  value={editItem.title}
                  onChange={e => setEditItem({ ...editItem, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">内容</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={6}
                  placeholder="详细描述你的交易规则、方法或思想..."
                  value={editItem.content}
                  onChange={e => setEditItem({ ...editItem, content: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="active-check" checked={editItem.active}
                  onChange={e => setEditItem({ ...editItem, active: e.target.checked })}
                  className="rounded" />
                <label htmlFor="active-check" className="text-sm text-foreground">激活（注入 AI 分析师上下文）</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>取消</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 历史交易记录标签页 ───────────────────────────────────────────────────────

type TradeEntry = {
  id?: number;
  pair: string;
  direction: "buy" | "sell";
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  lotSize: string;
  pnl: string;
  openTime: Date;
  closeTime?: Date;
  status: "open" | "closed" | "cancelled";
  summary: string;
  lesson: string;
  tags: string;
};

const emptyTrade = (): TradeEntry => ({
  pair: "EUR/USD",
  direction: "buy",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  takeProfit: "",
  lotSize: "",
  pnl: "",
  openTime: new Date(),
  status: "closed",
  summary: "",
  lesson: "",
  tags: "",
});

// ─── MT4 对账单导入弹窗 ─────────────────────────────────────────────────────
type ImportStep = "idle" | "previewing" | "importing" | "done";
type ImportSummary = {
  accountNumber: string;
  accountName: string;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  balance: string;
  totalNetProfit: string;
  profitFactor: string;
  dateRange: string;
};
type ImportResult = {
  inserted: number;
  skipped: number;
  overwritten: number;
  total: number;
  summary: ImportSummary;
  parseErrors: string[];
  message: string;
};
type PreviewTrade = {
  ticket: string;
  pair: string;
  direction: string;
  lotSize: string;
  openTime: string;
  closeTime: string | null;
  entryPrice: string;
  exitPrice: string | null;
  pnl: string;
  status: string;
  ea: string | null;
};

function StatementImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<ImportStep>("idle");
  const [htmlContent, setHtmlContent] = useState("");
  const [mode, setMode] = useState<"skip" | "overwrite">("skip");
  const [previewData, setPreviewData] = useState<{ total: number; preview: PreviewTrade[]; summary: ImportSummary } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const reset = () => {
    setStep("idle");
    setHtmlContent("");
    setPreviewData(null);
    setResult(null);
    setError("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setHtmlContent(text);
      setError("");
    };
    reader.readAsText(file, "utf-8");
  };

  const handlePreview = async () => {
    if (!htmlContent) { setError("请先选择文件"); return; }
    setStep("previewing");
    setError("");
    try {
      const resp = await fetch("/api/statement/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ html: htmlContent }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || "预览失败"); setStep("idle"); return; }
      setPreviewData(data);
      setStep("idle");
    } catch (err) {
      setError("网络错误，请重试");
      setStep("idle");
    }
  };

  const handleImport = async () => {
    if (!htmlContent) { setError("请先选择文件"); return; }
    setStep("importing");
    setError("");
    try {
      const resp = await fetch("/api/statement/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ html: htmlContent, mode }),
      });
      const data = await resp.json();
      if (!data.success) { setError(data.message || "导入失败"); setStep("idle"); return; }
      setResult(data);
      setStep("done");
      onImported();
    } catch (err) {
      setError("网络错误，请重试");
      setStep("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" /> 导入 MT4 对账单
          </DialogTitle>
        </DialogHeader>

        {step === "done" && result ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">{result.message}</span>
            </div>
            <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg p-3" style={{ background: "oklch(0.95 0.05 140)" }}>
                  <div className="text-2xl font-bold" style={{ color: "oklch(0.45 0.15 140)" }}>{result.inserted}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">新增</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(0.95 0.03 0)" }}>
                  <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">跳过（已存在）</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: "oklch(0.95 0.05 220)" }}>
                  <div className="text-2xl font-bold" style={{ color: "oklch(0.45 0.15 220)" }}>{result.overwritten}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">覆盖更新</div>
                </div>
              </div>
              {result.summary && (
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                  <div>账户：{result.summary.accountName} ({result.summary.accountNumber})</div>
                  <div>净利润：{result.summary.totalNetProfit} | 盈利因子：{result.summary.profitFactor} | 日期范围：{result.summary.dateRange}</div>
                </div>
              )}
            </div>
            {result.parseErrors.length > 0 && (
              <div className="rounded-lg p-3 text-xs" style={{ background: "oklch(0.97 0.03 30)" }}>
                <div className="font-medium text-orange-700 mb-1">解析警告（{result.parseErrors.length} 条）</div>
                <div className="text-orange-600 space-y-0.5 max-h-24 overflow-y-auto">
                  {result.parseErrors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {result.parseErrors.length > 5 && <div>...还有 {result.parseErrors.length - 5} 条</div>}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { reset(); onClose(); }}>完成</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 文件选择 */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">选择对账单文件</label>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-ring transition-colors">
                <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">选择 MT4 导出的 <code className="bg-muted px-1 rounded">DetailedStatement.htm</code> 文件</p>
                <input
                  type="file"
                  accept=".htm,.html"
                  onChange={handleFileChange}
                  className="hidden"
                  id="statement-file-input"
                />
                <label htmlFor="statement-file-input">
                  <Button variant="outline" size="sm" asChild>
                    <span className="cursor-pointer">选择文件</span>
                  </Button>
                </label>
                {htmlContent && (
                  <p className="text-xs text-green-600 mt-2 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 文件已加载（{Math.round(htmlContent.length / 1024)} KB）
                  </p>
                )}
              </div>
            </div>

            {/* 重复处理模式 */}
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">重复订单处理方式</label>
              <div className="flex gap-2">
                {(["skip", "overwrite"] as const).map(m => (
                  <button key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 py-2 px-3 rounded-lg text-sm border transition-all"
                    style={{
                      background: mode === m ? "oklch(0.50 0.15 220)" : "transparent",
                      color: mode === m ? "white" : "oklch(0.45 0.05 0)",
                      borderColor: mode === m ? "oklch(0.50 0.15 220)" : "oklch(0.85 0.02 0)",
                    }}
                  >
                    {m === "skip" ? "跳过已存在" : "覆盖更新"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {mode === "skip" ? "已导入过的订单（相同 Ticket 号）将被跳过" : "已导入过的订单将用新数据覆盖"}
              </p>
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 rounded-lg p-3" style={{ background: "oklch(0.97 0.03 10)" }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* 预览结果 */}
            {previewData && (
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">解析预览</span>
                  <span className="text-xs text-muted-foreground">共 {previewData.total} 条交易记录</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>账户：{previewData.summary.accountName} ({previewData.summary.accountNumber})</div>
                  <div>净利润：{previewData.summary.totalNetProfit} | 盈利因子：{previewData.summary.profitFactor} | 日期：{previewData.summary.dateRange}</div>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {previewData.preview.map((t) => (
                    <div key={t.ticket} className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                      <span className="font-medium w-20 flex-shrink-0">{t.pair}</span>
                      <span style={{ color: t.direction === "buy" ? "oklch(0.50 0.15 140)" : "oklch(0.55 0.15 10)" }}>
                        {t.direction === "buy" ? "▲ 买" : "▼ 卖"}
                      </span>
                      <span className="text-muted-foreground">{t.lotSize}手</span>
                      <span className="text-muted-foreground">{new Date(t.openTime).toLocaleDateString("zh-CN")}</span>
                      <span className={parseFloat(t.pnl) >= 0 ? "text-green-600 ml-auto" : "text-red-500 ml-auto"}>
                        {parseFloat(t.pnl) > 0 ? "+" : ""}{t.pnl}
                      </span>
                    </div>
                  ))}
                  {previewData.total > 10 && (
                    <div className="text-xs text-muted-foreground text-center pt-1">...还有 {previewData.total - 10} 条</div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { reset(); onClose(); }}>取消</Button>
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={!htmlContent || step === "previewing"}
              >
                {step === "previewing" ? "解析中..." : "预览解析结果"}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!htmlContent || step === "importing"}
                style={{ background: "oklch(0.50 0.15 140)", color: "white" }}
              >
                {step === "importing" ? "导入中..." : "确认导入"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TradeJournalTab() {
  const utils = trpc.useUtils();
  const [filterPair, setFilterPair] = useState<string | undefined>(undefined);
  const { data: trades, isLoading } = trpc.tradeJournal.list.useQuery({ pair: filterPair, limit: 100 });
  const [editTrade, setEditTrade] = useState<TradeEntry | null>(null);
  const [showImport, setShowImport] = useState(false);

  const createMutation = trpc.tradeJournal.create.useMutation({
    onSuccess: () => { utils.tradeJournal.list.invalidate(); setEditTrade(null); toast.success("交易记录已添加"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.tradeJournal.update.useMutation({
    onSuccess: () => { utils.tradeJournal.list.invalidate(); setEditTrade(null); toast.success("已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.tradeJournal.delete.useMutation({
    onSuccess: () => { utils.tradeJournal.list.invalidate(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!editTrade) return;
    if (!editTrade.entryPrice.trim()) { toast.error("入场价格不能为空"); return; }
    const payload = {
      ...editTrade,
      exitPrice: editTrade.exitPrice || undefined,
      stopLoss: editTrade.stopLoss || undefined,
      takeProfit: editTrade.takeProfit || undefined,
      lotSize: editTrade.lotSize || undefined,
      pnl: editTrade.pnl || undefined,
      closeTime: editTrade.closeTime || undefined,
      summary: editTrade.summary || undefined,
      lesson: editTrade.lesson || undefined,
      tags: editTrade.tags || undefined,
    };
    if (editTrade.id) {
      updateMutation.mutate({ id: editTrade.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const pnlColor = (pnl: string | null) => {
    if (!pnl) return "text-muted-foreground";
    const n = parseFloat(pnl);
    if (n > 0) return "text-green-600";
    if (n < 0) return "text-red-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">历史交易记录</h2>
          <p className="text-sm text-muted-foreground mt-0.5">记录每笔交易的入场理由和复盘总结，AI 分析师将参考你的交易历史</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> 导入对账单
          </Button>
          <Button size="sm" onClick={() => setEditTrade(emptyTrade())} className="gap-1.5"
            style={{ background: "oklch(0.50 0.15 140)", color: "white" }}>
            <Plus className="w-4 h-4" /> 添加交易
          </Button>
        </div>
      </div>

      {/* 货币对筛选 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterPair(undefined)}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-all border"
          style={{
            background: !filterPair ? "oklch(0.50 0.15 140)" : "transparent",
            color: !filterPair ? "white" : "oklch(0.45 0.05 0)",
            borderColor: !filterPair ? "oklch(0.50 0.15 140)" : "oklch(0.85 0.02 0)",
          }}
        >全部</button>
        {G8_PAIRS.slice(0, 14).map(p => (
          <button key={p}
            onClick={() => setFilterPair(p === filterPair ? undefined : p)}
            className="px-3 py-1 rounded-lg text-xs font-medium transition-all border"
            style={{
              background: filterPair === p ? "oklch(0.50 0.15 140)" : "transparent",
              color: filterPair === p ? "white" : "oklch(0.45 0.05 0)",
              borderColor: filterPair === p ? "oklch(0.50 0.15 140)" : "oklch(0.85 0.02 0)",
            }}
          >{p}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : !trades || trades.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">还没有交易记录</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击「添加交易」开始记录你的交易历史</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map(trade => (
            <div key={trade.id} className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-bold text-sm text-foreground">{trade.pair}</span>
                    <Badge variant="outline" className="text-xs gap-1"
                      style={{
                        color: trade.direction === "buy" ? "oklch(0.50 0.15 140)" : "oklch(0.55 0.15 10)",
                        borderColor: trade.direction === "buy" ? "oklch(0.50 0.15 140)" : "oklch(0.55 0.15 10)",
                      }}>
                      {trade.direction === "buy" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {trade.direction === "buy" ? "买入" : "卖出"}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">{trade.status === "open" ? "持仓中" : trade.status === "closed" ? "已平仓" : "已取消"}</Badge>
                    {trade.pnl && (
                      <span className={`text-xs font-bold ${pnlColor(trade.pnl)}`}>
                        {parseFloat(trade.pnl) > 0 ? "+" : ""}{trade.pnl}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                    <span>入场 <span className="text-foreground font-medium">{trade.entryPrice}</span></span>
                    {trade.exitPrice && <span>出场 <span className="text-foreground font-medium">{trade.exitPrice}</span></span>}
                    {trade.stopLoss && <span>止损 <span className="text-red-500 font-medium">{trade.stopLoss}</span></span>}
                    {trade.takeProfit && <span>止盈 <span className="text-green-600 font-medium">{trade.takeProfit}</span></span>}
                    {trade.lotSize && <span>手数 <span className="text-foreground font-medium">{trade.lotSize}</span></span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(trade.openTime).toLocaleDateString("zh-CN")}</span>
                  </div>
                  {trade.summary && <p className="text-xs text-muted-foreground line-clamp-2">{trade.summary}</p>}
                  {trade.tags && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {trade.tags.split(",").map(tag => tag.trim()).filter(Boolean).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-md text-xs"
                          style={{ background: "oklch(0.92 0.03 200)", color: "oklch(0.45 0.08 200)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => setEditTrade({
                      id: trade.id,
                      pair: trade.pair,
                      direction: trade.direction,
                      entryPrice: trade.entryPrice,
                      exitPrice: trade.exitPrice ?? "",
                      stopLoss: trade.stopLoss ?? "",
                      takeProfit: trade.takeProfit ?? "",
                      lotSize: trade.lotSize ?? "",
                      pnl: trade.pnl ?? "",
                      openTime: new Date(trade.openTime),
                      closeTime: trade.closeTime ? new Date(trade.closeTime) : undefined,
                      status: trade.status,
                      summary: trade.summary ?? "",
                      lesson: trade.lesson ?? "",
                      tags: trade.tags ?? "",
                    })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("确认删除此交易记录？")) deleteMutation.mutate({ id: trade.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MT4 对账单导入弹窗 */}
      <StatementImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => utils.tradeJournal.list.invalidate()}
      />

      {/* 编辑/新增弹窗 */}
      <Dialog open={!!editTrade} onOpenChange={(o) => { if (!o) setEditTrade(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTrade?.id ? "编辑交易记录" : "添加交易记录"}</DialogTitle>
          </DialogHeader>
          {editTrade && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">货币对</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editTrade.pair}
                    onChange={e => setEditTrade({ ...editTrade, pair: e.target.value })}
                  >
                    {G8_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">方向</label>
                  <div className="flex gap-2">
                    {(["buy", "sell"] as const).map(d => (
                      <button key={d}
                        onClick={() => setEditTrade({ ...editTrade, direction: d })}
                        className="flex-1 py-2 rounded-lg text-sm font-medium border transition-all"
                        style={{
                          background: editTrade.direction === d ? (d === "buy" ? "oklch(0.50 0.15 140)" : "oklch(0.55 0.15 10)") : "transparent",
                          color: editTrade.direction === d ? "white" : "oklch(0.45 0.05 0)",
                          borderColor: editTrade.direction === d ? (d === "buy" ? "oklch(0.50 0.15 140)" : "oklch(0.55 0.15 10)") : "oklch(0.85 0.02 0)",
                        }}
                      >{d === "buy" ? "买入 (Buy)" : "卖出 (Sell)"}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: "entryPrice", label: "入场价格 *" },
                  { key: "exitPrice", label: "出场价格" },
                  { key: "stopLoss", label: "止损价格" },
                  { key: "takeProfit", label: "止盈价格" },
                  { key: "lotSize", label: "手数" },
                  { key: "pnl", label: "盈亏（点数/金额）" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">{label}</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={key === "entryPrice" ? "例如：1.08520" : ""}
                      value={editTrade[key as keyof TradeEntry] as string ?? ""}
                      onChange={e => setEditTrade({ ...editTrade, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">开仓时间</label>
                  <input type="datetime-local"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editTrade.openTime.toISOString().slice(0, 16)}
                    onChange={e => setEditTrade({ ...editTrade, openTime: new Date(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">状态</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editTrade.status}
                    onChange={e => setEditTrade({ ...editTrade, status: e.target.value as "open" | "closed" | "cancelled" })}
                  >
                    <option value="closed">已平仓</option>
                    <option value="open">持仓中</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">入场理由 / 市场背景</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="为什么入场？当时的技术形态、基本面背景是什么？"
                  value={editTrade.summary}
                  onChange={e => setEditTrade({ ...editTrade, summary: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">复盘总结 / 经验教训</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={3}
                  placeholder="这笔交易的经验教训是什么？下次如何改进？"
                  value={editTrade.lesson}
                  onChange={e => setEditTrade({ ...editTrade, lesson: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">标签（逗号分隔）</label>
                <input
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="例如：趋势跟随,突破,盈利"
                  value={editTrade.tags}
                  onChange={e => setEditTrade({ ...editTrade, tags: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTrade(null)}>取消</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MT4 指标配置标签页 ───────────────────────────────────────────────────────

function IndicatorConfigTab() {
  const utils = trpc.useUtils();
  const { data: configs, isLoading } = trpc.indicatorConfig.list.useQuery();
  const [editConfig, setEditConfig] = useState<{
    id?: number;
    indicatorName: string;
    displayName: string;
    indicatorType: "trend" | "oscillator" | "volume" | "custom";
    params: string;
    interpretation: string;
    bufferIndex: number;
    active: boolean;
  } | null>(null);

  const upsertMutation = trpc.indicatorConfig.upsert.useMutation({
    onSuccess: () => { utils.indicatorConfig.list.invalidate(); setEditConfig(null); toast.success("指标配置已保存"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.indicatorConfig.delete.useMutation({
    onSuccess: () => { utils.indicatorConfig.list.invalidate(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  const TYPE_LABELS = { trend: "趋势类", oscillator: "震荡类", volume: "成交量类", custom: "自定义" };
  const TYPE_COLORS = {
    trend: "oklch(0.50 0.15 140)",
    oscillator: "oklch(0.55 0.15 280)",
    volume: "oklch(0.50 0.15 220)",
    custom: "oklch(0.50 0.05 0)",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">MT4 自定义指标配置</h2>
          <p className="text-sm text-muted-foreground mt-0.5">配置你的 MQL4 自定义指标，告诉 AI 如何解读每个指标的信号</p>
        </div>
        <Button size="sm"
          onClick={() => setEditConfig({ indicatorName: "", displayName: "", indicatorType: "trend", params: "", interpretation: "", bufferIndex: 0, active: true })}
          className="gap-1.5"
          style={{ background: "oklch(0.50 0.15 220)", color: "white" }}>
          <Plus className="w-4 h-4" /> 添加指标
        </Button>
      </div>

      {/* EA 配置提示 */}
      <div className="rounded-xl border border-border/60 p-4"
        style={{ background: "oklch(0.97 0.02 220 / 0.5)" }}>
        <p className="text-sm text-foreground font-medium mb-1">如何让 MT4 EA 推送自定义指标？</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          在 EA 的 <code className="px-1 py-0.5 rounded bg-muted text-xs">OnTimer()</code> 函数中，使用 <code className="px-1 py-0.5 rounded bg-muted text-xs">iCustom()</code> 读取指标值，
          然后通过 <code className="px-1 py-0.5 rounded bg-muted text-xs">POST /api/mt4/indicators</code> 接口推送到本站。
          指标名称需与此处配置的 <strong>指标文件名</strong> 完全一致（不含 .ex4 后缀）。
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !configs || configs.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-border">
          <Settings2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground text-sm">还没有配置任何自定义指标</p>
          <p className="text-xs text-muted-foreground/60 mt-1">点击「添加指标」配置你的 MQL4 自定义指标</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(config => (
            <div key={config.id} className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-foreground">{config.displayName}</span>
                    <Badge variant="outline" className="text-xs"
                      style={{ color: TYPE_COLORS[config.indicatorType ?? "custom"], borderColor: TYPE_COLORS[config.indicatorType ?? "custom"] }}>
                      {TYPE_LABELS[config.indicatorType ?? "custom"]}
                    </Badge>
                    {!config.active && <Badge variant="secondary" className="text-xs">已停用</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">
                    文件名：<code className="px-1 py-0.5 rounded bg-muted">{config.indicatorName}.ex4</code>
                    {config.bufferIndex !== null && config.bufferIndex !== undefined && (
                      <span className="ml-2">Buffer: {config.bufferIndex}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{config.interpretation}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                    onClick={() => setEditConfig({
                      id: config.id,
                      indicatorName: config.indicatorName,
                      displayName: config.displayName,
                      indicatorType: (config.indicatorType ?? "custom") as "trend" | "oscillator" | "volume" | "custom",
                      params: config.params ?? "",
                      interpretation: config.interpretation,
                      bufferIndex: config.bufferIndex ?? 0,
                      active: config.active,
                    })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("确认删除此指标配置？")) deleteMutation.mutate({ id: config.id }); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Dialog open={!!editConfig} onOpenChange={(o) => { if (!o) setEditConfig(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editConfig?.id ? "编辑指标配置" : "添加指标配置"}</DialogTitle>
          </DialogHeader>
          {editConfig && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">指标文件名（不含.ex4）</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="例如：MyTrendIndicator"
                    value={editConfig.indicatorName}
                    onChange={e => setEditConfig({ ...editConfig, indicatorName: e.target.value })}
                    disabled={!!editConfig.id}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">显示名称</label>
                  <input
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="例如：自定义趋势指标"
                    value={editConfig.displayName}
                    onChange={e => setEditConfig({ ...editConfig, displayName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">指标类型</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editConfig.indicatorType}
                    onChange={e => setEditConfig({ ...editConfig, indicatorType: e.target.value as "trend" | "oscillator" | "volume" | "custom" })}
                  >
                    <option value="trend">趋势类</option>
                    <option value="oscillator">震荡类</option>
                    <option value="volume">成交量类</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">主要 Buffer 索引</label>
                  <input type="number" min={0} max={7}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editConfig.bufferIndex}
                    onChange={e => setEditConfig({ ...editConfig, bufferIndex: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">信号解读规则</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  rows={4}
                  placeholder="例如：当 value1 > 0 时表示上升趋势，< 0 表示下降趋势；当 value2 > value1 时发出买入信号..."
                  value={editConfig.interpretation}
                  onChange={e => setEditConfig({ ...editConfig, interpretation: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ind-active" checked={editConfig.active}
                  onChange={e => setEditConfig({ ...editConfig, active: e.target.checked })}
                  className="rounded" />
                <label htmlFor="ind-active" className="text-sm text-foreground">激活（AI 分析时读取此指标数据）</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConfig(null)}>取消</Button>
            <Button onClick={() => {
              if (!editConfig) return;
              if (!editConfig.indicatorName.trim() || !editConfig.displayName.trim() || !editConfig.interpretation.trim()) {
                toast.error("请填写所有必填字段");
                return;
              }
              upsertMutation.mutate(editConfig);
            }} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: "system", label: "交易体系", icon: BookOpen },
  { id: "journal", label: "历史交易", icon: Activity },
  { id: "indicators", label: "MT4 指标配置", icon: Settings2 },
] as const;

type TabId = typeof TABS[number]["id"];

export default function MySystem() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("system");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <BookOpen className="w-12 h-12 text-muted-foreground opacity-40" />
        <p className="text-muted-foreground">请登录后使用交易体系管理功能</p>
        <Button asChild>
          <a href={getLoginUrl()}><LogIn className="w-4 h-4 mr-2" />登录</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.97 0.005 280)" }}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <BarChart2 className="w-4 h-4" />
              <span className="text-sm">FXStreet</span>
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" style={{ color: "oklch(0.68 0.15 300)" }} />
              <span className="font-semibold text-sm text-foreground">我的交易体系</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/agent">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <BrainCircuit className="w-3.5 h-3.5" />
                AI 分析师
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container py-6 max-w-4xl">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            我的交易体系
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            在这里记录你的交易思想、历史交易和自定义指标配置，AI 分析师将基于这些内容为你提供个性化分析
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 border border-border/60"
          style={{ background: "oklch(0.95 0.01 280)" }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeTab === tab.id ? "white" : "transparent",
                  color: activeTab === tab.id ? "oklch(0.25 0.05 280)" : "oklch(0.55 0.05 280)",
                  boxShadow: activeTab === tab.id ? "0 1px 4px oklch(0.50 0.10 280 / 0.15)" : "none",
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* 标签页内容 */}
        <div className="bg-background rounded-2xl border border-border/60 p-6">
          {activeTab === "system" && <TradingSystemTab />}
          {activeTab === "journal" && <TradeJournalTab />}
          {activeTab === "indicators" && <IndicatorConfigTab />}
        </div>
      </div>
    </div>
  );
}
