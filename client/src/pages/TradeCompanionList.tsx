import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Bot,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  ChevronRight,
} from "lucide-react";

const STATUS_CONFIG = {
  watching: { label: "观察中", icon: Activity, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  active: { label: "持仓中", icon: Activity, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
  closed: { label: "已复盘", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10 border-green-400/30" },
  cancelled: { label: "已取消", icon: XCircle, color: "text-gray-400", bg: "bg-gray-400/10 border-gray-400/30" },
};

function formatDate(ts: string | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts as string).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TradeCompanionList() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"all" | "watching" | "active" | "closed" | "cancelled">("all");

  const { data: companions, isLoading } = trpc.tradeCompanion.list.useQuery(
    { limit: 50, offset: 0 },
    { enabled: isAuthenticated }
  );

  const filtered = companions
    ? statusFilter === "all"
      ? companions
      : companions.filter((c: any) => c.status === statusFilter)
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-sm">交易伴飞</span>
            {companions && (
              <Badge variant="outline" className="text-xs ml-1">
                {companions.length} 条记录
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => navigate("/trade-companion/new")}
            className="gap-1.5 h-8 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            新建伴飞
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Status filter */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {(["all", "watching", "active", "closed", "cancelled"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                statusFilter === s
                  ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                  : "border-border text-muted-foreground hover:border-amber-500/30"
              }`}
            >
              {s === "all" ? "全部" : STATUS_CONFIG[s].label}
              {s !== "all" && companions && (
                <span className="ml-1 opacity-60">
                  {companions.filter((c: any) => c.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            <Activity className="w-4 h-4 mr-2 animate-pulse" />
            加载中...
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bot className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm mb-2">
              {statusFilter === "all" ? "还没有交易伴飞记录" : `没有${STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.label}的记录`}
            </p>
            <p className="text-muted-foreground/60 text-xs mb-6">
              开始一笔交易，让 AI 全程陪伴分析
            </p>
            <Button size="sm" onClick={() => navigate("/trade-companion/new")} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              新建第一笔伴飞
            </Button>
          </div>
        )}

        {/* List */}
        {!isLoading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((c: any) => {
              const statusCfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active;
              const StatusIcon = statusCfg.icon;
              const isUp = c.direction === "buy";
              return (
                <Card
                  key={c.id}
                  className="cursor-pointer hover:border-amber-500/40 transition-all hover:shadow-md hover:shadow-amber-500/5"
                  onClick={() => navigate(`/trade-companion/${c.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Direction icon */}
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isUp ? "bg-green-400/10" : "bg-red-400/10"
                      }`}>
                        {isUp
                          ? <TrendingUp className="w-4 h-4 text-green-400" />
                          : <TrendingDown className="w-4 h-4 text-red-400" />
                        }
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{c.symbol}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${isUp ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}
                          >
                            {isUp ? "买入" : "卖出"}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">@ {c.entryPrice}</span>
                          {c.stopLoss && (
                            <span className="text-xs text-muted-foreground">
                              SL <span className="font-mono text-red-400/80">{c.stopLoss}</span>
                            </span>
                          )}
                          {c.takeProfit && (
                            <span className="text-xs text-muted-foreground">
                              TP <span className="font-mono text-green-400/80">{c.takeProfit}</span>
                            </span>
                          )}
                        </div>

                        {/* Trade rationale */}
                        {c.tradeRationale && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                            {c.tradeRationale}
                          </p>
                        )}

                        {/* Footer row */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Status badge */}
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusCfg.label}
                          </span>

                          {/* PnL if closed */}
                          {c.status === "closed" && c.pnlPips && (
                            <span className={`text-xs font-mono font-medium ${
                              parseFloat(c.pnlPips) >= 0 ? "text-green-400" : "text-red-400"
                            }`}>
                              {parseFloat(c.pnlPips) >= 0 ? "+" : ""}{c.pnlPips} pips
                              {c.pnlPercent && ` (${c.pnlPercent}%)`}
                            </span>
                          )}

                          {/* Scenarios indicator */}
                          {c.scenarios_json && (
                            <span className="text-xs text-amber-400/70 flex items-center gap-1">
                              <Activity className="w-3 h-3" />
                              已生成情景规划
                            </span>
                          )}

                          {/* Time */}
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1 ml-auto">
                            <Clock className="w-3 h-3" />
                            {formatDate(c.created_at)}
                          </span>
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
