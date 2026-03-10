import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw,
  Mail,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
  LogIn,
  BarChart2,
  ArrowLeft,
} from "lucide-react";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

// ─── 状态配置 ─────────────────────────────────────────────────────────────────
type SignalStatus = "pending" | "executed" | "ignored" | "watching";

const STATUS_CONFIG: Record<SignalStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:  { label: "待处理", color: "oklch(0.55 0.14 55)",  bg: "oklch(0.95 0.04 75)",  icon: <AlertCircle className="w-3.5 h-3.5" /> },
  executed: { label: "已执行", color: "oklch(0.50 0.14 145)", bg: "oklch(0.95 0.04 145)", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ignored:  { label: "已忽略", color: "oklch(0.55 0.05 250)", bg: "oklch(0.95 0.02 250)", icon: <XCircle className="w-3.5 h-3.5" /> },
  watching: { label: "观察中", color: "oklch(0.55 0.14 270)", bg: "oklch(0.95 0.04 270)", icon: <Eye className="w-3.5 h-3.5" /> },
};

const STATUS_FILTERS: Array<{ value: SignalStatus | "all"; label: string }> = [
  { value: "all",      label: "全部" },
  { value: "pending",  label: "待处理" },
  { value: "executed", label: "已执行" },
  { value: "watching", label: "观察中" },
  { value: "ignored",  label: "已忽略" },
];

// ─── 状态徽章 ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SignalStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── 状态选择器 ───────────────────────────────────────────────────────────────
function StatusSelector({ current, signalId, onUpdated }: {
  current: SignalStatus;
  signalId: number;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const updateMutation = trpc.signals.updateStatus.useMutation({
    onSuccess: () => { onUpdated(); setOpen(false); },
    onError: (e) => toast.error(`状态更新失败：${e.message}`),
  });

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <StatusBadge status={current} />
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-xl border border-border shadow-lg overflow-hidden"
          style={{ background: "var(--background)", minWidth: "120px" }}>
          {(Object.keys(STATUS_CONFIG) as SignalStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => updateMutation.mutate({ id: signalId, status: s })}
              disabled={updateMutation.isPending}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
            >
              <StatusBadge status={s} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 备注区域 ─────────────────────────────────────────────────────────────────
function NotesSection({ signalId, isLoggedIn }: { signalId: number; isLoggedIn: boolean }) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");

  const { data: notes, refetch } = trpc.signals.getNotes.useQuery({ signalId });
  const upsertMutation = trpc.signals.upsertNote.useMutation({
    onSuccess: () => {
      toast.success("备注已保存");
      setEditMode(false);
      setDraft("");
      refetch();
    },
    onError: (e) => toast.error(`保存失败：${e.message}`),
  });

  const handleSave = () => {
    if (!draft.trim()) return;
    upsertMutation.mutate({ signalId, content: draft.trim() });
  };

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquare className="w-4 h-4" style={{ color: "oklch(0.60 0.13 60)" }} />
          处理备注
          {notes && notes.length > 0 && (
            <span className="text-xs text-muted-foreground ml-1">({notes.length} 条)</span>
          )}
        </span>
        {isLoggedIn && !editMode && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setEditMode(true)}>
            <MessageSquare className="w-3 h-3" />
            添加备注
          </Button>
        )}
      </div>

      {/* 编辑区 */}
      {editMode && (
        <div className="mb-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入您的处理意见、分析或操作记录..."
            className="text-sm resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => { setEditMode(false); setDraft(""); }}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1"
              onClick={handleSave}
              disabled={!draft.trim() || upsertMutation.isPending}>
              {upsertMutation.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              保存
            </Button>
          </div>
        </div>
      )}

      {/* 备注列表 */}
      {notes && notes.length > 0 ? (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg p-3 text-sm"
              style={{ background: "oklch(0.97 0.015 78)", border: "1px solid oklch(0.90 0.02 70)" }}>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {note.userName || "匿名用户"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(note.updatedAt).toLocaleString("zh-CN", {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : !editMode ? (
        <p className="text-sm text-muted-foreground italic">
          {isLoggedIn ? "暂无备注，点击[添加备注]填写处理意见" : "登录后可添加备注"}
        </p>
      ) : null}
    </div>
  );
}

// ─── 单条信号卡片 ─────────────────────────────────────────────────────────────
function SignalCard({ signal, isLoggedIn, onStatusUpdated }: {
  signal: {
    id: number;
    subject: string;
    body: string;
    fromEmail: string | null;
    receivedAt: Date;
    status: SignalStatus;
  };
  isLoggedIn: boolean;
  onStatusUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 正文预览（前200字）
  const preview = signal.body.length > 200 ? signal.body.slice(0, 200) + "..." : signal.body;
  const needsExpand = signal.body.length > 200;

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden transition-shadow hover:shadow-md"
      style={{ background: "var(--card)" }}>
      {/* 卡片头部 */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm leading-snug mb-1 truncate"
              style={{ fontFamily: "'Lora', serif" }}>
              {signal.subject}
            </h3>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {signal.fromEmail && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {signal.fromEmail}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(signal.receivedAt).toLocaleString("zh-CN", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit"
                })}
              </span>
            </div>
          </div>
          {/* 状态标签（登录后可切换） */}
          {isLoggedIn ? (
            <StatusSelector
              current={signal.status}
              signalId={signal.id}
              onUpdated={onStatusUpdated}
            />
          ) : (
            <StatusBadge status={signal.status} />
          )}
        </div>

        {/* 正文 */}
        <div className="mt-3 rounded-lg p-3 text-sm font-mono leading-relaxed"
          style={{ background: "oklch(0.97 0.01 70)", color: "oklch(0.30 0.04 55)" }}>
          <pre className="whitespace-pre-wrap break-words text-xs">
            {expanded ? signal.body : preview}
          </pre>
          {needsExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 flex items-center gap-1 text-xs font-sans font-medium hover:opacity-80 transition-opacity"
              style={{ color: "oklch(0.55 0.13 60)" }}>
              {expanded ? (
                <><ChevronUp className="w-3.5 h-3.5" /> 收起</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> 展开全文</>
              )}
            </button>
          )}
        </div>

        {/* 备注区 */}
        <NotesSection signalId={signal.id} isLoggedIn={isLoggedIn} />
      </div>
    </div>
  );
}

// ─── 手动拉取按钮 ─────────────────────────────────────────────────────────────
function FetchButton({ onFetched }: { onFetched: () => void }) {
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<{ fetched: number; inserted: number; errors: number } | null>(null);

  const fetchMutation = trpc.signals.fetchNow.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setShowResult(true);
      onFetched();
    },
    onError: (e) => toast.error(`拉取失败：${e.message}`),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => fetchMutation.mutate()}
        disabled={fetchMutation.isPending}
        className="gap-1.5 text-xs"
        style={{ borderColor: "oklch(0.75 0.08 60)", color: "oklch(0.45 0.10 55)" }}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
        {fetchMutation.isPending ? "拉取中..." : "立即拉取邮件"}
      </Button>

      <Dialog open={showResult} onOpenChange={setShowResult}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.55 0.14 145)" }} />
              邮件拉取完成
            </DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "扫描邮件", value: result.fetched, unit: "封" },
                  { label: "新增信号", value: result.inserted, unit: "条" },
                  { label: "处理错误", value: result.errors, unit: "个" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg p-3 text-center"
                    style={{ background: "oklch(0.96 0.015 78)" }}>
                    <div className="text-xl font-bold text-foreground">{item.value}</div>
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground text-xs text-center">
                {result.inserted > 0 ? `成功导入 ${result.inserted} 条新信号` : "未发现新信号（已是最新）"}
              </p>
            </div>
          )}
          <Button className="w-full" onClick={() => setShowResult(false)}>确认</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function Signals() {
  const { user, isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState<SignalStatus | "all">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const queryInput = useMemo(() => ({
    status: statusFilter === "all" ? undefined : statusFilter,
    page,
    pageSize: PAGE_SIZE,
  }), [statusFilter, page]);

  const { data, isLoading, refetch } = trpc.signals.list.useQuery(queryInput);

  const handleFilterChange = (f: SignalStatus | "all") => {
    setStatusFilter(f);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 border-b border-border/60"
        style={{ background: "oklch(0.18 0.04 55 / 0.95)", backdropFilter: "blur(12px)" }}>
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              返回首页
            </Link>
            <span className="text-muted-foreground/40">|</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "oklch(0.60 0.13 60)" }}>
                <Mail className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                交易信号
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user?.role === "admin" && (
              <FetchButton onFetched={() => refetch()} />
            )}
            {!isAuthenticated && (
              <Button size="sm" className="gap-1.5 text-xs" asChild>
                <a href={getLoginUrl()}>
                  <LogIn className="w-3 h-3" /> 登录后可操作
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        {/* 页面标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-1"
            style={{ fontFamily: "'Playfair Display', serif" }}>
            交易信号管理
          </h1>
          <p className="text-sm text-muted-foreground">
            来自 163 邮箱的交易终端信号，每 5 分钟自动同步一次
            {data && <span className="ml-2 font-medium" style={{ color: "oklch(0.60 0.13 60)" }}>共 {data.total} 条</span>}
          </p>
        </div>

        {/* 状态筛选栏 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value as SignalStatus | "all")}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-all"
              style={statusFilter === f.value ? {
                background: "oklch(0.60 0.13 60)",
                color: "white",
              } : {
                background: "oklch(0.94 0.02 70)",
                color: "oklch(0.45 0.06 60)",
              }}
            >
              {f.label}
              {f.value !== "all" && data && (
                <span className="ml-1 opacity-70 text-xs">
                  {/* 只在全量数据中显示，此处省略 */}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 信号列表 */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "oklch(0.94 0.03 70)" }}>
              <Mail className="w-8 h-8" style={{ color: "oklch(0.70 0.08 60)" }} />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-2">暂无信号</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {statusFilter === "all"
                ? "还没有收到任何交易信号。请确认已配置 163 邮箱，并等待定时任务自动拉取。"
                : `当前筛选条件下没有信号，试试切换到"全部"查看。`}
            </p>
            {isAuthenticated && user?.role === "admin" && (
              <div className="mt-4">
                <FetchButton onFetched={() => refetch()} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {data.items.map((signal) => (
              <SignalCard
                key={signal.id}
                signal={signal as any}
                isLoggedIn={isAuthenticated}
                onStatusUpdated={() => refetch()}
              />
            ))}

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="border-t border-border py-4">
        <div className="container text-center text-xs text-muted-foreground">
          交易信号来自 163 邮箱自动同步 · 每 5 分钟更新一次 · 仅供参考，不构成投资建议
        </div>
      </footer>
    </div>
  );
}
