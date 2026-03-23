import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Plus, Trash2, Send, Bot, User,
  TrendingUp, TrendingDown, ChevronLeft, Loader2, BarChart2, ArrowLeftRight,
  Lightbulb, ShieldAlert, Target, Clock, Wifi, WifiOff,
  Settings, Key, Globe, Cpu, AlertCircle, CheckCircle2, X, BookOpen,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

// ─── API 配置类型 ────────────────────────────────────────────────────────────
type ApiConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

const STORAGE_KEY_CONFIG = "agent_api_config";

const DEFAULT_CONFIG: ApiConfig = {
  apiUrl: "",
  apiKey: "",
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 4096,
};

const loadConfig = (): ApiConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

const saveConfig = (config: ApiConfig) => {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
};

// ─── API 配置面板组件 ─────────────────────────────────────────────────────────
function ApiSettingsPanel({
  config,
  onSave,
  onClose,
}: {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ApiConfig>(config);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    if (!form.apiUrl.trim()) { toast.error("请输入 API 地址"); return; }
    if (!form.apiKey.trim()) { toast.error("请输入 API Key"); return; }
    if (!form.model.trim()) { toast.error("请输入模型名称"); return; }
    onSave(form);
    toast.success("API 配置已保存");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">AI 接口配置</p>
              <p className="text-xs text-muted-foreground">配置您自己的 OpenAI 兼容 API</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-4">
          {/* API 地址 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Globe className="w-3.5 h-3.5 text-amber-600" />
              API 地址 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.apiUrl}
              onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
              placeholder="https://api.openai.com  或  https://api.deepseek.com"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              支持 OpenAI 兼容的 API，如 DeepSeek、Moonshot、Qwen 等。只需填写 Base URL，无需加 /v1/chat/completions
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Key className="w-3.5 h-3.5 text-amber-600" />
              API Key <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="text-sm pr-16"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
              >
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              API Key 会加密存储在服务器，用于交易信号自动分析通知功能
            </p>
          </div>

          {/* 模型名称 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Cpu className="w-3.5 h-3.5 text-amber-600" />
              模型名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="gpt-4o / deepseek-chat / moonshot-v1-8k"
              className="text-sm"
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {["gpt-4o", "gpt-4o-mini", "deepseek-chat", "deepseek-reasoner", "moonshot-v1-8k", "qwen-plus", "claude-3-5-sonnet-20241022"].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, model: m }))}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    form.model === m
                      ? "bg-amber-600 text-white border-amber-600"
                      : "border-border hover:border-amber-400 hover:text-amber-600"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 高级参数 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Temperature ({form.temperature})
              </Label>
              <input
                type="range" min="0" max="2" step="0.1"
                value={form.temperature}
                onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-amber-600"
              />
              <p className="text-xs text-muted-foreground">0=精确 / 2=创意</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">最大 Token 数</Label>
              <Input
                type="number" min="256" max="32768"
                value={form.maxTokens}
                onChange={e => setForm(f => ({ ...f, maxTokens: parseInt(e.target.value) || 4096 }))}
                className="text-sm"
              />
            </div>
          </div>

          {/* 说明 */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <div className="flex items-start gap-2">
              <BookOpen className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                AI 分析师会自动将实时 MT4 行情、新闻、货币展望、自定义指标信号、您的交易体系和历史记录注入到每次对话中，无需手动粘贴。
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-5 pt-0">
          <Button onClick={handleSave} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white">
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            保存配置
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">取消</Button>
        </div>
      </div>
    </div>
  );
}

// ─── 实时价格标签组件 ─────────────────────────────────────────────────────────
function ChatHeader({
  sessionTitle,
  selectedPair,
  showPairSelector,
  setShowPairSelector,
  apiConfig,
  onOpenSettings,
}: {
  sessionTitle: string;
  selectedPair: string;
  showPairSelector: boolean;
  setShowPairSelector: (v: boolean) => void;
  apiConfig: ApiConfig;
  onOpenSettings: () => void;
}) {
  const { data: quote, isLoading: quoteLoading } = trpc.agent.getQuote.useQuery(
    { pair: selectedPair },
    { refetchInterval: 30000, staleTime: 25000 }
  );
  const { data: mt4Statuses } = trpc.mt4.getStatus.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const mt4Online = mt4Statuses && mt4Statuses.length > 0 && mt4Statuses.some((s: { isOnline: boolean }) => s.isOnline);
  const mt4LastPush = mt4Statuses && mt4Statuses.length > 0
    ? mt4Statuses.reduce((latest: Date | null, s: { lastPushedAt: Date }) => {
        const t = new Date(s.lastPushedAt);
        return !latest || t > latest ? t : latest;
      }, null as Date | null)
    : null;

  const isConfigured = apiConfig.apiUrl.trim() && apiConfig.apiKey.trim() && apiConfig.model.trim();
  const isUp = quote && quote.change >= 0;
  const priceColor = quoteLoading ? "text-muted-foreground" : isUp ? "text-emerald-600" : "text-red-500";

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Bot className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{sessionTitle}</p>
          <p className="text-xs text-muted-foreground">基于实时行情和市场数据</p>
        </div>
      </div>

      {/* 实时价格 */}
      {quote && (
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60">
            {isUp ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
            <span className="font-mono font-semibold text-foreground">{quote.currentPrice.toFixed(5)}</span>
            <span className={`font-mono ${priceColor}`}>
              {isUp ? "+" : ""}{quote.changePct.toFixed(3)}%
            </span>
          </div>
          <div className="text-muted-foreground text-xs">
            <span>H: {quote.dayHigh.toFixed(5)}</span>
            <span className="mx-1">·</span>
            <span>L: {quote.dayLow.toFixed(5)}</span>
          </div>
        </div>
      )}
      {quoteLoading && (
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>加载行情...</span>
        </div>
      )}

      {/* MT4 连接状态 */}
      <div className="hidden md:flex items-center gap-1.5 text-xs">
        {mt4Online ? (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <Wifi className="w-3 h-3" />
            <span className="font-medium">MT4</span>
            {mt4LastPush && (
              <span className="text-emerald-600/70">{Math.floor((Date.now() - new Date(mt4LastPush).getTime()) / 60000)}m前</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 text-muted-foreground border border-border">
            <WifiOff className="w-3 h-3" />
            <span>MT4未连接</span>
          </div>
        )}
      </div>

      {/* API 配置状态按钮 */}
      <button
        onClick={onOpenSettings}
        className={`hidden md:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
          isConfigured
            ? "border-border hover:border-amber-400 hover:text-amber-600 text-muted-foreground"
            : "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-900/20 animate-pulse"
        }`}
      >
        <Settings className="w-3 h-3" />
        {isConfigured ? apiConfig.model : "配置 API"}
      </button>

      {/* 货币对切换 */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:block">关注：</span>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowPairSelector(!showPairSelector); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-100 transition-colors"
          >
            <ArrowLeftRight className="w-3 h-3" />
            {selectedPair}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── G8 货币对完整列表 ────────────────────────────────────────────────────────
const G8_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "USD/CAD", "AUD/USD", "NZD/USD",
  "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/CAD", "EUR/AUD", "EUR/NZD",
  "GBP/JPY", "GBP/CHF", "GBP/CAD", "GBP/AUD", "GBP/NZD",
  "CHF/JPY", "CAD/JPY", "AUD/JPY", "NZD/JPY",
  "AUD/CAD", "AUD/CHF", "AUD/NZD",
  "CAD/CHF", "NZD/CAD", "NZD/CHF",
];

// ─── 快捷提问模板 ─────────────────────────────────────────────────────────────
const QUICK_QUESTIONS = [
  { icon: TrendingUp, label: "趋势方向", template: (pair: string) => `${pair} 当前处于什么趋势？多周期趋势是否一致？` },
  { icon: Target, label: "关键点位", template: (pair: string) => `${pair} 当前关键支撑位和阻力位在哪里？请给出具体价格。` },
  { icon: ArrowLeftRight, label: "入场建议", template: (pair: string) => `${pair} 现在有没有合适的入场机会？请给出具体的入场区间、止损和目标位。` },
  { icon: ShieldAlert, label: "风险评估", template: (pair: string) => `${pair} 当前最大的风险因素是什么？风险收益比如何？` },
  { icon: BarChart2, label: "技术形态", template: (pair: string) => `${pair} 图表上有什么明显的技术形态？是否有突破信号？` },
  { icon: Lightbulb, label: "市场情绪", template: (pair: string) => `结合最新新闻和市场数据，${pair} 当前市场情绪如何？` },
];

type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: Date;
  isStreaming?: boolean;
};

type Session = {
  id: number;
  title: string;
  pair: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── 主页面组件 ───────────────────────────────────────────────────────────────
export default function Agent() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [isSending, setIsSending] = useState(false);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => loadConfig());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const isApiConfigured = !!(apiConfig.apiUrl.trim() && apiConfig.apiKey.trim() && apiConfig.model.trim());

  const { data: sessions = [], isLoading: sessionsLoading } = trpc.agent.getSessions.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: dbMessages = [] } = trpc.agent.getMessages.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );

  const pendingMessageRef = useRef<string | null>(null);

  const newSessionMutation = trpc.agent.newSession.useMutation({
    onSuccess: (session) => {
      utils.agent.getSessions.invalidate();
      if (session) {
        setActiveSessionId(session.id);
        setMessages([]);
        if (pendingMessageRef.current) {
          const msg = pendingMessageRef.current;
          pendingMessageRef.current = null;
          setIsSending(true);
          setMessages([
            { role: "user", content: msg },
            { role: "assistant", content: "", isStreaming: true },
          ]);
          chatMutation.mutate({
            sessionId: session.id,
            message: msg,
            pair: session.pair || selectedPair,
            apiUrl: apiConfig.apiUrl,
            apiKey: apiConfig.apiKey,
            model: apiConfig.model,
            temperature: apiConfig.temperature,
            maxTokens: apiConfig.maxTokens,
          });
        }
      }
    },
  });

  const deleteSessionMutation = trpc.agent.deleteSession.useMutation({
    onSuccess: () => {
      utils.agent.getSessions.invalidate();
      setActiveSessionId(null);
      setMessages([]);
    },
  });

  const chatMutation = trpc.agent.chat.useMutation({
    onSuccess: (data) => {
      setMessages(prev => {
        const withoutStreaming = prev.filter(m => !m.isStreaming);
        return [...withoutStreaming, { role: "assistant", content: data.content }];
      });
      utils.agent.getSessions.invalidate();
      setIsSending(false);
    },
    onError: (err) => {
      setMessages(prev => prev.filter(m => !m.isStreaming));
      toast.error("AI 回复失败：" + err.message);
      setIsSending(false);
    },
  });

  // 同步数据库消息到本地状态
  useEffect(() => {
    if (dbMessages.length > 0) {
      setMessages(dbMessages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
      })));
    } else if (activeSessionId) {
      setMessages([]);
    }
  }, [dbMessages, activeSessionId]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleNewSession = useCallback(() => {
    newSessionMutation.mutate({ pair: selectedPair });
  }, [selectedPair]);

  const handleSend = useCallback(() => {
    const msg = inputValue.trim();
    if (!msg || !activeSessionId || isSending) return;

    if (!isApiConfigured) {
      setShowSettings(true);
      toast.error("请先配置 AI API 接口");
      return;
    }

    setInputValue("");
    setIsSending(true);

    setMessages(prev => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "", isStreaming: true },
    ]);

    chatMutation.mutate({
      sessionId: activeSessionId,
      message: msg,
      pair: selectedPair,
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      temperature: apiConfig.temperature,
      maxTokens: apiConfig.maxTokens,
    });
  }, [inputValue, activeSessionId, isSending, selectedPair, apiConfig, isApiConfigured]);

  const handleQuickQuestion = useCallback((template: (pair: string) => string) => {
    const question = template(selectedPair);
    setInputValue(question);
    textareaRef.current?.focus();
  }, [selectedPair]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const saveApiConfigMutation = trpc.userApiConfig.save.useMutation({
    onSuccess: () => {
      console.log("[Agent] API config synced to database for auto signal analysis");
    },
    onError: (err) => {
      console.warn("[Agent] Failed to sync API config to database:", err.message);
    },
  });

  const handleSaveConfig = (newConfig: ApiConfig) => {
    setApiConfig(newConfig);
    saveConfig(newConfig);
    // 同步写入数据库，供后台信号自动分析使用
    if (newConfig.apiUrl.trim() && newConfig.apiKey.trim() && newConfig.model.trim()) {
      saveApiConfigMutation.mutate({
        apiUrl: newConfig.apiUrl,
        apiKey: newConfig.apiKey,
        model: newConfig.model,
        temperature: newConfig.temperature,
        maxTokens: newConfig.maxTokens,
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
            <Bot className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold font-display">AI 交易分析师</h2>
          <p className="text-muted-foreground max-w-sm">请登录后使用 AI 分析师，获取专业的 G8 货币对交易分析和建议。</p>
        </div>
        <div className="flex gap-3">
          <a href={getLoginUrl()}>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white">登录使用</Button>
          </a>
          <Link href="/">
            <Button variant="outline">返回首页</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── 左侧会话列表 ── */}
      <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card">
        {/* 顶部 Logo */}
        <div className="p-4 border-b border-border">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity mb-3">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">返回首页</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">AI 交易分析师</p>
              <p className="text-xs text-muted-foreground">G8 货币对专家</p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="p-3 flex gap-2 flex-shrink-0">
          <Button
            onClick={handleNewSession}
            disabled={newSessionMutation.isPending}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            size="sm"
          >
            {newSessionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            新建对话
          </Button>
          <Button
            onClick={() => setShowSettings(true)}
            variant="outline"
            size="sm"
            className={`px-2.5 ${!isApiConfigured ? "border-orange-400 text-orange-600 hover:bg-orange-50" : ""}`}
            title="API 配置"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* API 状态提示 */}
        {!isApiConfigured ? (
          <div
            className="mx-3 mb-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 cursor-pointer"
            onClick={() => setShowSettings(true)}
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
              <p className="text-xs text-orange-700 dark:text-orange-400 font-medium">未配置 AI 接口</p>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">点击右上角设置按钮配置您的 AI API</p>
          </div>
        ) : (
          <div className="mx-3 mb-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 truncate">{apiConfig.model}</p>
            </div>
          </div>
        )}

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-2 min-h-0">
          {sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm px-3">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>还没有对话</p>
              <p className="text-xs mt-1">点击"新建对话"开始分析</p>
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {(sessions as Session[]).map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    activeSessionId === session.id
                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    if (session.pair) setSelectedPair(session.pair);
                  }}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{session.title}</p>
                    {session.pair && (
                      <p className="text-xs text-muted-foreground">{session.pair}</p>
                    )}
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSessionMutation.mutate({ sessionId: session.id });
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部用户信息 */}
        <div className="p-3 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-amber-700" />
            </div>
            <p className="text-xs text-muted-foreground truncate">{user?.name || user?.email || "用户"}</p>
          </div>
        </div>
      </aside>

      {/* ── 右侧对话区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeSessionId ? (
          /* 欢迎页 */
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 gap-8">
            <div className="text-center space-y-3 max-w-lg">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mx-auto shadow-lg">
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold font-display">AI 交易分析师</h1>
              <p className="text-muted-foreground leading-relaxed">
                接入您自己的 AI API，自动注入实时 MT4 行情、FXStreet 新闻、货币展望、自定义指标信号和您的交易体系，获取专业的 G8 货币对分析建议。
              </p>
              {!isApiConfigured && (
                <Button
                  onClick={() => setShowSettings(true)}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
                >
                  <Settings className="w-4 h-4" />
                  配置 AI 接口
                </Button>
              )}
            </div>

            {/* 货币对选择 */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">选择关注的货币对，开始分析</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {G8_PAIRS.map(pair => (
                  <button
                    key={pair}
                    onClick={() => setSelectedPair(pair)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedPair === pair
                        ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                        : "bg-card border-border hover:border-amber-400 hover:text-amber-700"
                    }`}
                  >
                    {pair}
                  </button>
                ))}
              </div>
            </div>

            {/* 快捷提问 */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">快捷分析</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {QUICK_QUESTIONS.map(({ icon: Icon, label, template }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (!isApiConfigured) {
                        setShowSettings(true);
                        toast.error("请先配置 AI API 接口");
                        return;
                      }
                      const question = template(selectedPair);
                      pendingMessageRef.current = question;
                      newSessionMutation.mutate({ pair: selectedPair });
                    }}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50 transition-colors">
                      <Icon className="w-4 h-4 text-amber-700" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{selectedPair}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* 对话顶部栏 */}
            <ChatHeader
              sessionTitle={(sessions as Session[]).find(s => s.id === activeSessionId)?.title || "AI 分析师"}
              selectedPair={selectedPair}
              showPairSelector={showPairSelector}
              setShowPairSelector={setShowPairSelector}
              apiConfig={apiConfig}
              onOpenSettings={() => setShowSettings(true)}
            />

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">开始对话</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isApiConfigured
                        ? `向 AI 分析师提问关于 ${selectedPair} 的任何问题`
                        : "请先点击右上角配置 AI API 接口"}
                    </p>
                  </div>
                  {/* 快捷提问 */}
                  <div className="grid grid-cols-2 gap-2 w-full max-w-md mt-2">
                    {QUICK_QUESTIONS.map(({ icon: Icon, label, template }) => (
                      <button
                        key={label}
                        onClick={() => handleQuickQuestion(template)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all text-left"
                      >
                        <Icon className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <span className="text-xs">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-3xl mx-auto">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      {/* 头像 */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "user"
                          ? "bg-amber-600"
                          : "bg-gradient-to-br from-amber-500 to-amber-700"
                      }`}>
                        {msg.role === "user"
                          ? <User className="w-4 h-4 text-white" />
                          : <Bot className="w-4 h-4 text-white" />
                        }
                      </div>
                      {/* 消息气泡 */}
                      <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "bg-amber-600 text-white rounded-tr-sm"
                            : "bg-card border border-border rounded-tl-sm"
                        }`}>
                          {msg.isStreaming ? (
                            <div className="flex items-center gap-2 text-muted-foreground py-1">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm">AI 分析师正在思考...</span>
                            </div>
                          ) : msg.role === "assistant" ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                              <Streamdown>{msg.content}</Streamdown>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        {msg.createdAt && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
                            <Clock className="w-3 h-3" />
                            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* 输入区 */}
            <div className="border-t border-border bg-card/50 p-4 flex-shrink-0">
              <div className="max-w-3xl mx-auto space-y-2">
                {/* 快捷提问按钮 */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {QUICK_QUESTIONS.map(({ icon: Icon, label, template }) => (
                    <button
                      key={label}
                      onClick={() => handleQuickQuestion(template)}
                      disabled={isSending}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background hover:border-amber-400 hover:text-amber-700 text-xs whitespace-nowrap transition-all flex-shrink-0 disabled:opacity-50"
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
                {/* 输入框 */}
                <div className="flex gap-2 items-end">
                  <Textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      isApiConfigured
                        ? `向 AI 分析师提问关于 ${selectedPair} 的问题... (Enter 发送，Shift+Enter 换行)`
                        : "请先点击右上角⚙️配置 AI API 接口..."
                    }
                    disabled={isSending}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isSending}
                    className="bg-amber-600 hover:bg-amber-700 text-white h-[44px] px-4 flex-shrink-0"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  AI 分析仅供参考，不构成投资建议。外汇交易存在风险，请谨慎决策。
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 货币对选择器弹出层 */}
      {showPairSelector && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPairSelector(false)} />
          <div
            className="fixed z-50 bg-card border border-border rounded-xl shadow-xl p-3 w-72"
            style={{ top: 60, right: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">选择货币对</p>
            <div className="grid grid-cols-4 gap-1.5 max-h-64 overflow-y-auto">
              {G8_PAIRS.map(pair => (
                <button
                  key={pair}
                  onClick={() => { setSelectedPair(pair); setShowPairSelector(false); }}
                  className={`px-1.5 py-1 rounded text-xs font-medium transition-all ${
                    selectedPair === pair
                      ? "bg-amber-600 text-white"
                      : "hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700"
                  }`}
                >
                  {pair}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* API 配置面板 */}
      {showSettings && (
        <ApiSettingsPanel
          config={apiConfig}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
