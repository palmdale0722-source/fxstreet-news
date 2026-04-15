import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";

type CheckStatus = "ok" | "warn" | "error";

interface ModuleCheck {
  module: string;
  status: CheckStatus;
  message: string;
  detail?: string;
  lastActivityAt?: string | null;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok") return <CheckCircle className="w-5 h-5 text-green-500" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  return <XCircle className="w-5 h-5 text-red-500" />;
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok") return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">正常</Badge>;
  if (status === "warn") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">警告</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">异常</Badge>;
}

function formatLocalTime(utcStr: string | null | undefined): string {
  if (!utcStr) return "—";
  const d = new Date(utcStr.endsWith("Z") ? utcStr : utcStr + "Z");
  return d.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReportCard({ report, isLatest }: { report: any; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest);

  const okCount = report.checks.filter((c: ModuleCheck) => c.status === "ok").length;
  const warnCount = report.checks.filter((c: ModuleCheck) => c.status === "warn").length;
  const errorCount = report.checks.filter((c: ModuleCheck) => c.status === "error").length;

  return (
    <Card className={`border ${report.overallStatus === "ok" ? "border-green-500/20" : report.overallStatus === "warn" ? "border-yellow-500/20" : "border-red-500/20"}`}>
      <CardHeader
        className="cursor-pointer select-none py-3 px-4"
        onClick={() => setExpanded((v: boolean) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon status={report.overallStatus} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {formatLocalTime(report.runAt)}
                </span>
                {isLatest && <Badge variant="outline" className="text-xs">最新</Badge>}
              </div>
              <div className="flex gap-2 mt-1">
                <span className="text-xs text-green-400">{okCount} 正常</span>
                {warnCount > 0 && <span className="text-xs text-yellow-400">{warnCount} 警告</span>}
                {errorCount > 0 && <span className="text-xs text-red-400">{errorCount} 异常</span>}
                <span className="text-xs text-muted-foreground">· {report.durationMs}ms</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={report.overallStatus} />
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <div className="border-t border-border/50 pt-3 space-y-2">
            {report.checks.map((check: ModuleCheck, i: number) => (
              <div key={i} className={`flex items-start gap-3 p-2 rounded-lg ${
                check.status === "ok" ? "bg-green-500/5" :
                check.status === "warn" ? "bg-yellow-500/5" : "bg-red-500/5"
              }`}>
                <div className="mt-0.5 shrink-0">
                  <StatusIcon status={check.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{check.module}</span>
                    <StatusBadge status={check.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{check.message}</p>
                  {check.detail && (
                    <p className="text-xs text-red-400 mt-1 font-mono break-all">{check.detail}</p>
                  )}
                  {check.lastActivityAt && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      最后活动：{formatLocalTime(check.lastActivityAt)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function SystemHealth() {
  const { data: reports, isLoading, refetch } = trpc.systemHealth.getReports.useQuery();
  const runMutation = trpc.systemHealth.run.useMutation({
    onSuccess: () => {
      setTimeout(() => refetch(), 3000);
    },
  });

  const [runTriggered, setRunTriggered] = useState(false);

  const handleRun = async () => {
    setRunTriggered(true);
    await runMutation.mutateAsync();
    setTimeout(() => setRunTriggered(false), 10000);
  };

  const latestReport = reports?.[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                <ArrowLeft className="w-4 h-4" />
                返回首页
              </Button>
            </Link>
            <div className="w-px h-5 bg-border" />
            <h1 className="font-semibold text-base">系统健康自检</h1>
          </div>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={runMutation.isPending || runTriggered}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 ${runMutation.isPending ? "animate-spin" : ""}`} />
            {runMutation.isPending ? "启动中..." : runTriggered ? "自检进行中..." : "立即自检"}
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* 说明卡片 */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="py-4 px-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">自动自检计划</p>
                <p className="text-sm text-muted-foreground mt-1">
                  系统将在每周一 09:00（北京时间）自动运行全系统自检，并通过 Manus 通知推送报告。
                  您也可以点击右上角"立即自检"手动触发，自检完成后约 10 秒内推送通知。
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>检查范围：</strong>数据库连接、IMAP 邮件拉取、交易信号 AI 分析、RSS 新闻抓取、货币强弱矩阵、TradingView 采集、LLM API 可用性。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 最新状态概览 */}
        {latestReport && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">最新自检状态</h2>
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-green-500/20 bg-green-500/5 text-center py-4">
                <div className="text-2xl font-bold text-green-400">
                  {latestReport.checks.filter((c: ModuleCheck) => c.status === "ok").length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">正常模块</div>
              </Card>
              <Card className="border-yellow-500/20 bg-yellow-500/5 text-center py-4">
                <div className="text-2xl font-bold text-yellow-400">
                  {latestReport.checks.filter((c: ModuleCheck) => c.status === "warn").length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">警告模块</div>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5 text-center py-4">
                <div className="text-2xl font-bold text-red-400">
                  {latestReport.checks.filter((c: ModuleCheck) => c.status === "error").length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">异常模块</div>
              </Card>
            </div>
          </div>
        )}

        {/* 历史报告 */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            历史报告 {reports && `（共 ${reports.length} 条）`}
          </h2>

          {isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              加载中...
            </div>
          )}

          {!isLoading && (!reports || reports.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>暂无自检记录</p>
                <p className="text-sm mt-1">点击右上角"立即自检"运行第一次自检</p>
              </CardContent>
            </Card>
          )}

          {reports && reports.length > 0 && (
            <div className="space-y-3">
              {reports.map((report: any, i: number) => (
                <ReportCard key={report.id} report={report} isLatest={i === 0} />
              ))}
            </div>
          )}
        </div>

        {runTriggered && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="py-4 px-4 flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-400">自检正在进行中...</p>
                <p className="text-sm text-muted-foreground">预计需要 10-30 秒，完成后将推送 Manus 通知，页面将自动刷新。</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
