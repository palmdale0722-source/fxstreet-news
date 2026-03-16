import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare, Plus, Trash2, Send, Bot, User,
  TrendingUp, ChevronLeft, Loader2, BarChart2, ArrowLeftRight,
  Lightbulb, ShieldAlert, Target, Clock
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

// G8 货币对完整列表（28 对）
const G8_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "USD/CAD", "AUD/USD", "NZD/USD",
  "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/CAD", "EUR/AUD", "EUR/NZD",
  "GBP/JPY", "GBP/CHF", "GBP/CAD", "GBP/AUD", "GBP/NZD",
  "CHF/JPY", "CAD/JPY", "AUD/JPY", "NZD/JPY",
  "AUD/CAD", "AUD/CHF", "AUD/NZD",
  "CAD/CHF", "NZD/CAD", "NZD/CHF",
];

// 快捷提问模板
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

export default function Agent() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedPair, setSelectedPair] = useState<string>("EUR/USD");
  const [isSending, setIsSending] = useState(false);
  const [showPairSelector, setShowPairSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const { data: sessions = [], isLoading: sessionsLoading } = trpc.agent.getSessions.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: dbMessages = [] } = trpc.agent.getMessages.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );

  // 待发送的消息（新建会话后自动发送）
  const pendingMessageRef = useRef<string | null>(null);

  const newSessionMutation = trpc.agent.newSession.useMutation({
    onSuccess: (session) => {
      utils.agent.getSessions.invalidate();
      if (session) {
        setActiveSessionId(session.id);
        setMessages([]);
        // 如果有待发送的消息，在会话建立后立即发送
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

    setInputValue("");
    setIsSending(true);

    // 立即显示用户消息和 loading
    setMessages(prev => [
      ...prev,
      { role: "user", content: msg },
      { role: "assistant", content: "", isStreaming: true },
    ]);

    chatMutation.mutate({
      sessionId: activeSessionId,
      message: msg,
      pair: selectedPair,
    });
  }, [inputValue, activeSessionId, isSending, selectedPair]);

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

        {/* 新建对话按钮 */}
          <div className="p-3 flex-shrink-0">
          <Button
            onClick={handleNewSession}
            disabled={newSessionMutation.isPending}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
            size="sm"
          >
            {newSessionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            新建对话
          </Button>
        </div>

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
                  onClick={() => setActiveSessionId(session.id)}
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
                基于实时 FXStreet 新闻、AI 市场洞察和货币展望数据，为您提供专业的 G8 货币对技术分析、关键点位和交易建议。
              </p>
            </div>

            {/* 货币对选择 */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">选择关注的货币对，开始分析</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {G8_PAIRS.slice(0, 7).map(pair => (
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
              <button
                onClick={() => setShowPairSelector(!showPairSelector)}
                className="text-xs text-amber-600 hover:underline w-full text-center"
              >
                {showPairSelector ? "收起" : "显示全部 28 个货币对 ▾"}
              </button>
              {showPairSelector && (
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {G8_PAIRS.slice(7).map(pair => (
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
              )}
            </div>

            {/* 快捷提问 */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">快捷分析</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {QUICK_QUESTIONS.map(({ icon: Icon, label, template }) => (
                  <button
                    key={label}
                    onClick={() => {
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
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Bot className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {(sessions as Session[]).find(s => s.id === activeSessionId)?.title || "AI 分析师"}
                  </p>
                  <p className="text-xs text-muted-foreground">基于实时新闻和市场数据</p>
                </div>
              </div>

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

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">开始对话</p>
                    <p className="text-sm text-muted-foreground mt-1">向 AI 分析师提问关于 {selectedPair} 的任何问题</p>
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
                    placeholder={`向 AI 分析师提问关于 ${selectedPair} 的问题... (Enter 发送，Shift+Enter 换行)`}
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

      {/* 货币对选择器弹出层（portal 式 fixed 定位） */}
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
    </div>
  );
}
