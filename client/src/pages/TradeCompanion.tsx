import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CandlestickChart } from "@/components/CandlestickChart";
import { ArrowLeft, TrendingUp, TrendingDown, Bot, BookOpen, BarChart2, Send, Loader2, AlertTriangle, CheckCircle2, MinusCircle, ChevronRight } from "lucide-react";
import { Streamdown } from "streamdown";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ApiConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

interface Scenario {
  title: string;
  probability: string;
  description: string;
  keyLevels: Record<string, string>;
  action: string;
  trigger: string;
}

interface Scenarios {
  optimistic: Scenario;
  neutral: Scenario;
  pessimistic: Scenario;
  summary: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── G8 Currency Pairs ───────────────────────────────────────────────────────

const G8_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "NZD/USD",
  "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/CAD", "EUR/AUD", "EUR/NZD",
  "GBP/JPY", "GBP/CHF", "GBP/CAD", "GBP/AUD", "GBP/NZD",
  "AUD/JPY", "AUD/CHF", "AUD/CAD", "AUD/NZD",
  "NZD/JPY", "NZD/CHF", "NZD/CAD",
  "CAD/JPY", "CAD/CHF", "CHF/JPY",
];

const loadApiConfig = (): ApiConfig => {
  try {
    const stored = localStorage.getItem("agent_api_config");
    if (stored) return JSON.parse(stored);
  } catch {}
  return { apiUrl: "", apiKey: "", model: "" };
};

// ─── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, type }: { scenario: Scenario; type: "optimistic" | "neutral" | "pessimistic" }) {
  const config = {
    optimistic: { label: "乐观", icon: TrendingUp, color: "text-green-400", bg: "bg-green-400/10 border-green-400/30" },
    neutral: { label: "中性", icon: MinusCircle, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
    pessimistic: { label: "悲观", icon: TrendingDown, color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  }[type];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-4 ${config.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`font-semibold text-sm ${config.color}`}>{config.label}情景</span>
        <Badge variant="outline" className="text-xs ml-auto">{scenario.probability}</Badge>
      </div>
      <h4 className="font-medium text-sm mb-2">{scenario.title}</h4>
      <p className="text-xs text-muted-foreground mb-3">{scenario.description}</p>
      <div className="space-y-1 text-xs">
        {Object.entries(scenario.keyLevels).map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-muted-foreground">{k === "target" ? "目标" : k === "support" ? "支撑" : k === "stopLoss" ? "止损" : k === "resistance" ? "阻力" : k}</span>
            <span className="font-mono font-medium">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-current/20">
        <p className="text-xs font-medium mb-1">操作建议</p>
        <p className="text-xs text-muted-foreground">{scenario.action}</p>
        <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">触发条件：</span>{scenario.trigger}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TradeCompanionProps {
  companionId?: number;
  initialSymbol?: string;
  initialDirection?: "buy" | "sell";
  initialEntryPrice?: string;
  signalId?: number;
}

export function TradeCompanion({ companionId: initialCompanionId, initialSymbol, initialDirection, initialEntryPrice, signalId: signalIdProp }: TradeCompanionProps) {
  const [, navigate] = useLocation();
  // Read signalId from URL search params if not passed as prop
  const urlSignalId = (() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const params = new URLSearchParams(search);
    const v = params.get('signalId');
    return v ? parseInt(v) : undefined;
  })();
  const signalId = signalIdProp ?? urlSignalId;
  const { isAuthenticated } = useAuth();
  const [apiConfig] = useState<ApiConfig>(loadApiConfig);

  // Form state (for new companion)
  const [symbol, setSymbol] = useState(initialSymbol || "EUR/USD");
  const [direction, setDirection] = useState<"buy" | "sell">(initialDirection || "buy");
  const [entryPrice, setEntryPrice] = useState(initialEntryPrice || "");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [tradeRationale, setTradeRationale] = useState("");

  // Companion state
  const [companionId, setCompanionId] = useState<number | null>(initialCompanionId ?? null);
  const [activeTab, setActiveTab] = useState("chart");

  // Scenarios state
  const [scenarios, setScenarios] = useState<Scenarios | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenariosError, setScenariosError] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Review state
  const [exitPrice, setExitPrice] = useState("");
  const [exitRationale, setExitRationale] = useState("");
  const [lessonsLearned, setLessonsLearned] = useState("");
  const [pnlPips, setPnlPips] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);

  const utils = trpc.useUtils();

  // Load existing companion
  const { data: companion, isLoading: companionLoading } = trpc.tradeCompanion.get.useQuery(
    { id: companionId! },
    { enabled: !!companionId }
  );

  // Load chat messages
  const { data: dbMessages = [] } = trpc.tradeCompanion.getMessages.useQuery(
    { id: companionId! },
    { enabled: !!companionId }
  );

  // Sync chat messages from DB
  useEffect(() => {
    if (dbMessages.length > 0) {
      setChatMessages(dbMessages.map(m => ({ role: m.role, content: m.content })));
    }
  }, [dbMessages]);

  // Sync scenarios from companion
  useEffect(() => {
    if (companion?.scenariosJson) {
      try {
        setScenarios(JSON.parse(companion.scenariosJson));
      } catch {}
    }
    if (companion) {
      setSymbol(companion.symbol);
      setDirection(companion.direction);
      setEntryPrice(companion.entryPrice);
      setStopLoss(companion.stopLoss || "");
      setTakeProfit(companion.takeProfit || "");
      setTradeRationale(companion.tradeRationale || "");
      if (companion.exitPrice) {
        setExitPrice(companion.exitPrice);
        setReviewDone(true);
      }
    }
  }, [companion]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const createMutation = trpc.tradeCompanion.create.useMutation({
    onSuccess: (data) => {
      setCompanionId(data.id);
      setActiveTab("chart");
    },
  });

  const reviewMutation = trpc.tradeCompanion.review.useMutation({
    onSuccess: () => {
      setReviewDone(true);
      utils.tradeCompanion.get.invalidate({ id: companionId! });
    },
  });

  const isApiConfigured = !!(apiConfig.apiUrl && apiConfig.apiKey && apiConfig.model);

  // Calculate P&L automatically
  const calcPnl = () => {
    if (!entryPrice || !exitPrice) return;
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    if (isNaN(entry) || isNaN(exit)) return;
    const pipSize = symbol.includes("JPY") ? 0.01 : 0.0001;
    const pips = direction === "buy" ? (exit - entry) / pipSize : (entry - exit) / pipSize;
    setPnlPips(pips.toFixed(1));
  };

  const handleCreate = () => {
    if (!entryPrice || !symbol) return;
    createMutation.mutate({
      symbol,
      direction,
      entryPrice,
      stopLoss: stopLoss || undefined,
      takeProfit: takeProfit || undefined,
      tradeRationale: tradeRationale || undefined,
      signalId: signalId,
    });
  };

  const handleGenerateScenarios = async () => {
    if (!companionId || !isApiConfigured) return;
    setScenariosLoading(true);
    setScenariosError(null);
    try {
      const result = await utils.client.tradeCompanion.generateScenarios.mutate({
        id: companionId,
        apiUrl: apiConfig.apiUrl,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
      });
      setScenarios(result.scenarios);
    } catch (err: any) {
      setScenariosError(err.message || "情景规划生成失败");
    } finally {
      setScenariosLoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !companionId || !isApiConfigured || chatSending) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatSending(true);
    try {
      const result = await utils.client.tradeCompanion.chat.mutate({
        id: companionId,
        message: userMsg,
        apiUrl: apiConfig.apiUrl,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
      });
      setChatMessages(prev => [...prev, { role: "assistant", content: result.content }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `错误：${err.message}` }]);
    } finally {
      setChatSending(false);
    }
  };

  const handleReview = async () => {
    if (!companionId || !exitPrice) return;
    setReviewSubmitting(true);
    try {
      await reviewMutation.mutateAsync({
        id: companionId,
        exitPrice,
        exitRationale: exitRationale || undefined,
        lessonsLearned: lessonsLearned || undefined,
        pnlPips: pnlPips || undefined,
      });
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ─── New Companion Form ───────────────────────────────────────────────────

  if (!companionId) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate("/signals")} className="mb-6 gap-2">
            <ArrowLeft className="w-4 h-4" /> 返回交易信号
          </Button>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1">开始交易伴飞</h1>
            <p className="text-muted-foreground text-sm">填写交易信息，AI 将全程陪伴分析这笔交易</p>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">货币对</label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {G8_PAIRS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">方向</label>
                  <div className="flex gap-2">
                    <Button
                      variant={direction === "buy" ? "default" : "outline"}
                      className={`flex-1 gap-2 ${direction === "buy" ? "bg-green-600 hover:bg-green-700" : ""}`}
                      onClick={() => setDirection("buy")}
                    >
                      <TrendingUp className="w-4 h-4" /> 买入
                    </Button>
                    <Button
                      variant={direction === "sell" ? "default" : "outline"}
                      className={`flex-1 gap-2 ${direction === "sell" ? "bg-red-600 hover:bg-red-700" : ""}`}
                      onClick={() => setDirection("sell")}
                    >
                      <TrendingDown className="w-4 h-4" /> 卖出
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">入场价格 *</label>
                  <Input
                    placeholder="如 1.08500"
                    value={entryPrice}
                    onChange={e => setEntryPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">止损价格</label>
                  <Input
                    placeholder="可选"
                    value={stopLoss}
                    onChange={e => setStopLoss(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">止盈价格</label>
                  <Input
                    placeholder="可选"
                    value={takeProfit}
                    onChange={e => setTakeProfit(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">交易依据</label>
                <Textarea
                  placeholder="描述你的入场理由、技术形态、基本面依据等..."
                  value={tradeRationale}
                  onChange={e => setTradeRationale(e.target.value)}
                  rows={4}
                />
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleCreate}
                disabled={!entryPrice || createMutation.isPending}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                开始交易伴飞
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Main Companion Page ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/signals")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> 返回
          </Button>
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">{symbol}</span>
            <Badge variant={direction === "buy" ? "default" : "destructive"} className={direction === "buy" ? "bg-green-600" : ""}>
              {direction === "buy" ? "买入" : "卖出"}
            </Badge>
            <span className="text-muted-foreground text-sm font-mono">@ {entryPrice}</span>
            {stopLoss && <span className="text-red-400 text-xs font-mono">SL {stopLoss}</span>}
            {takeProfit && <span className="text-green-400 text-xs font-mono">TP {takeProfit}</span>}
          </div>
          {companion?.status === "closed" && (
            <Badge variant="outline" className="ml-auto text-muted-foreground">已平仓</Badge>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="chart" className="gap-2">
              <BarChart2 className="w-4 h-4" /> K 线图
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="gap-2">
              <AlertTriangle className="w-4 h-4" /> 情景规划
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2">
              <Bot className="w-4 h-4" /> AI 对话
            </TabsTrigger>
            <TabsTrigger value="review" className="gap-2">
              <BookOpen className="w-4 h-4" /> 复盘记录
              {reviewDone && <CheckCircle2 className="w-3 h-3 text-green-400" />}
            </TabsTrigger>
          </TabsList>

          {/* ── K 线图 ── */}
          <TabsContent value="chart">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">实时 K 线图</CardTitle>
              </CardHeader>
              <CardContent>
                <CandlestickChart
                  symbol={symbol}
                  entryPrice={parseFloat(entryPrice) || undefined}
                  stopLoss={stopLoss ? parseFloat(stopLoss) : undefined}
                  takeProfit={takeProfit ? parseFloat(takeProfit) : undefined}
                  direction={direction}
                  height={480}
                />
                {tradeRationale && (
                  <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="font-medium text-muted-foreground">交易依据：</span>
                    {tradeRationale}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── 情景规划 ── */}
          <TabsContent value="scenarios">
            <div className="space-y-4">
              {!isApiConfigured && (
                <div className="p-4 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-sm text-yellow-400">
                  请先在 AI 分析师页面配置 API 设置，才能生成情景规划。
                </div>
              )}

              {!scenarios && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">尚未生成情景规划</p>
                    <Button
                      onClick={handleGenerateScenarios}
                      disabled={!isApiConfigured || scenariosLoading}
                      className="gap-2"
                    >
                      {scenariosLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                      {scenariosLoading ? "AI 分析中..." : "生成情景规划"}
                    </Button>
                    {scenariosError && (
                      <p className="text-red-400 text-sm mt-3">{scenariosError}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {scenarios && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">情景规划分析</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateScenarios}
                      disabled={scenariosLoading}
                      className="gap-2"
                    >
                      {scenariosLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      重新生成
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <ScenarioCard scenario={scenarios.optimistic} type="optimistic" />
                    <ScenarioCard scenario={scenarios.neutral} type="neutral" />
                    <ScenarioCard scenario={scenarios.pessimistic} type="pessimistic" />
                  </div>

                  {scenarios.summary && (
                    <Card>
                      <CardContent className="py-4">
                        <p className="text-sm font-medium mb-1 text-muted-foreground">综合判断</p>
                        <p className="text-sm">{scenarios.summary}</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* ── AI 对话 ── */}
          <TabsContent value="chat">
            <div className="flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}>
              {!isApiConfigured && (
                <div className="p-4 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-sm text-yellow-400 mb-4">
                  请先在 AI 分析师页面配置 API 设置，才能使用 AI 对话。
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Bot className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p className="text-sm">AI 分析师已准备好，可以开始对话</p>
                    <p className="text-xs mt-1">AI 已了解你的交易信息，可以直接提问</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <Streamdown>{msg.content}</Streamdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                {chatSending && (
                  <div className="flex justify-start">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mr-2 mt-1">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="询问 AI 分析师关于这笔交易的任何问题..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  rows={2}
                  className="resize-none"
                  disabled={!isApiConfigured || chatSending}
                />
                <Button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || !isApiConfigured || chatSending}
                  size="icon"
                  className="h-auto"
                >
                  {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── 复盘记录 ── */}
          <TabsContent value="review">
            <div className="max-w-2xl space-y-6">
              {reviewDone && companion?.status === "closed" ? (
                <Card className="border-green-400/30 bg-green-400/5">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3 mb-4">
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                      <h3 className="font-semibold text-green-400">复盘已完成</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">出场价格</p>
                        <p className="font-mono font-medium">{companion.exitPrice}</p>
                      </div>
                      {companion.pnlPips && (
                        <div>
                          <p className="text-muted-foreground">盈亏（Pips）</p>
                          <p className={`font-mono font-medium ${parseFloat(companion.pnlPips) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {parseFloat(companion.pnlPips) >= 0 ? "+" : ""}{companion.pnlPips} pips
                          </p>
                        </div>
                      )}
                    </div>
                    {companion.exitRationale && (
                      <div className="mt-4">
                        <p className="text-muted-foreground text-sm mb-1">出场依据</p>
                        <p className="text-sm">{companion.exitRationale}</p>
                      </div>
                    )}
                    {companion.lessonsLearned && (
                      <div className="mt-4">
                        <p className="text-muted-foreground text-sm mb-1">经验教训</p>
                        <p className="text-sm">{companion.lessonsLearned}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">记录出场信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">出场价格 *</label>
                        <Input
                          placeholder="如 1.09200"
                          value={exitPrice}
                          onChange={e => {
                            setExitPrice(e.target.value);
                          }}
                          onBlur={calcPnl}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">盈亏（Pips）</label>
                        <Input
                          placeholder="自动计算"
                          value={pnlPips}
                          onChange={e => setPnlPips(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* P&L Preview */}
                    {entryPrice && exitPrice && pnlPips && (
                      <div className={`p-3 rounded-lg text-sm font-medium ${parseFloat(pnlPips) >= 0 ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
                        {parseFloat(pnlPips) >= 0 ? "盈利" : "亏损"} {Math.abs(parseFloat(pnlPips)).toFixed(1)} pips
                        {" "}（入场 {entryPrice} → 出场 {exitPrice}）
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-sm font-medium">出场依据</label>
                      <Textarea
                        placeholder="为什么在这个价位出场？"
                        value={exitRationale}
                        onChange={e => setExitRationale(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">经验教训</label>
                      <Textarea
                        placeholder="这笔交易有哪些值得记录的经验或教训？"
                        value={lessonsLearned}
                        onChange={e => setLessonsLearned(e.target.value)}
                        rows={4}
                      />
                    </div>

                    <Button
                      className="w-full gap-2"
                      onClick={handleReview}
                      disabled={!exitPrice || reviewSubmitting}
                    >
                      {reviewSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      完成复盘
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
