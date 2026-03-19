import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Plus, Trash2, Send, Bot, User,
  Settings, ChevronLeft, Loader2, Key, Globe, Cpu,
  Clock, AlertCircle, CheckCircle2, X, BookOpen,
  TrendingUp, Target, BarChart2, Lightbulb, ShieldAlert, ArrowLeftRight,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

// ─── 类型定义 ───────────────────────────────────────────────────────────────
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  isStreaming?: boolean;
};

type Session = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
};

type ApiConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

// ─── 本地存储 Key ────────────────────────────────────────────────────────────
const STORAGE_KEY_SESSIONS = "myai_sessions";
const STORAGE_KEY_CONFIG = "myai_api_config";
const MAX_SESSIONS = 50;
const MAX_MESSAGES_PER_SESSION = 200;

// ─── 默认配置 ────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG: ApiConfig = {
  apiUrl: "",
  apiKey: "",
  model: "gpt-4o",
  systemPrompt: `你是一位专业的外汇交易分析师和交易顾问。你擅长：
- G8 货币对的技术分析和基本面分析
- 识别市场趋势、关键支撑阻力位
- 制定具体的交易计划（入场、止损、目标位）
- 风险管理和仓位管理建议
- 分析经济数据和新闻对汇率的影响

请用中文回答，分析要有逻辑层次，给出具体数字而非模糊描述。`,
  temperature: 0.7,
  maxTokens: 4096,
};

// ─── 快捷提问模板 ────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "趋势分析", template: "请分析当前外汇市场的主要趋势，哪些货币对有明显的趋势方向？" },
  { icon: Target, label: "交易机会", template: "当前市场有哪些值得关注的交易机会？请给出具体的货币对和入场理由。" },
  { icon: BarChart2, label: "技术形态", template: "请帮我分析 EUR/USD 当前的技术形态，有没有突破信号？" },
  { icon: ShieldAlert, label: "风险评估", template: "当前市场最大的风险因素是什么？如何规避？" },
  { icon: ArrowLeftRight, label: "货币强弱", template: "请分析当前 G8 货币的相对强弱排名，哪些货币最强/最弱？" },
  { icon: Lightbulb, label: "交易想法", template: "我想做多 GBP/JPY，请帮我分析这个想法是否合理，并给出具体的操作计划。" },
];

// ─── 工具函数 ────────────────────────────────────────────────────────────────
const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const loadSessions = (): Session[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((s: Session) => ({
      ...s,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      messages: s.messages.map((m: Message) => ({ ...m, createdAt: new Date(m.createdAt) })),
    }));
  } catch {
    return [];
  }
};

const saveSessions = (sessions: Session[]) => {
  try {
    // 只保留最近 MAX_SESSIONS 个会话
    const trimmed = sessions.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(trimmed));
  } catch {
    // localStorage 可能已满，尝试清理旧数据
    try {
      const trimmed = sessions.slice(0, 10);
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }
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

// ─── 设置面板组件 ────────────────────────────────────────────────────────────
function SettingsPanel({
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
    if (!form.apiUrl.trim()) {
      toast.error("请输入 API 地址");
      return;
    }
    if (!form.apiKey.trim()) {
      toast.error("请输入 API Key");
      return;
    }
    if (!form.model.trim()) {
      toast.error("请输入模型名称");
      return;
    }
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
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">API 配置</p>
              <p className="text-xs text-muted-foreground">配置您的自定义 AI 接口</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-4">
          {/* API 地址 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
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
              <Key className="w-3.5 h-3.5 text-blue-600" />
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
              API Key 仅存储在您的浏览器本地，不会上传到服务器
            </p>
          </div>

          {/* 模型名称 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Cpu className="w-3.5 h-3.5 text-blue-600" />
              模型名称 <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="gpt-4o / deepseek-chat / moonshot-v1-8k"
              className="text-sm"
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {["gpt-4o", "gpt-4o-mini", "deepseek-chat", "deepseek-reasoner", "moonshot-v1-8k", "qwen-plus"].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, model: m }))}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    form.model === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border hover:border-blue-400 hover:text-blue-600"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* 系统提示词 */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <BookOpen className="w-3.5 h-3.5 text-blue-600" />
              系统提示词（System Prompt）
            </Label>
            <Textarea
              value={form.systemPrompt}
              onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="定义 AI 的角色和行为..."
              className="text-sm min-h-[120px] resize-none"
              rows={5}
            />
          </div>

          {/* 高级参数 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                Temperature ({form.temperature})
              </Label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={e => setForm(f => ({ ...f, temperature: parseFloat(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-muted-foreground">0=精确 / 2=创意</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                最大 Token 数
              </Label>
              <Input
                type="number"
                min="256"
                max="32768"
                value={form.maxTokens}
                onChange={e => setForm(f => ({ ...f, maxTokens: parseInt(e.target.value) || 4096 }))}
                className="text-sm h-8"
              />
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-2 p-5 pt-0">
          <Button
            onClick={handleSave}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            保存配置
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 主页面组件 ──────────────────────────────────────────────────────────────
export default function MyAI() {
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.customAI.chat.useMutation();

  // 当前会话
  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  // 是否已配置 API
  const isConfigured = config.apiUrl.trim() && config.apiKey.trim() && config.model.trim();

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 保存会话到 localStorage
  const persistSessions = useCallback((newSessions: Session[]) => {
    setSessions(newSessions);
    saveSessions(newSessions);
  }, []);

  // 新建会话
  const handleNewSession = useCallback(() => {
    const newSession: Session = {
      id: generateId(),
      title: "新对话",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const newSessions = [newSession, ...sessions];
    persistSessions(newSessions);
    setActiveSessionId(newSession.id);
    setInputValue("");
  }, [sessions, persistSessions]);

  // 删除会话
  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== sessionId);
    persistSessions(newSessions);
    if (activeSessionId === sessionId) {
      setActiveSessionId(newSessions[0]?.id ?? null);
    }
  }, [sessions, activeSessionId, persistSessions]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || isSending) return;

    if (!isConfigured) {
      setShowSettings(true);
      toast.error("请先配置 API 接口");
      return;
    }

    // 如果没有活跃会话，自动新建
    let sessionId = activeSessionId;
    let currentSessions = sessions;
    if (!sessionId) {
      const newSession: Session = {
        id: generateId(),
        title: msg.slice(0, 25) + (msg.length > 25 ? "..." : ""),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      currentSessions = [newSession, ...sessions];
      persistSessions(currentSessions);
      setActiveSessionId(newSession.id);
      sessionId = newSession.id;
    }

    setInputValue("");
    setIsSending(true);

    // 构建用户消息
    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: msg,
      createdAt: new Date(),
    };
    const streamingMsg: Message = {
      id: generateId(),
      role: "assistant",
      content: "",
      createdAt: new Date(),
      isStreaming: true,
    };

    // 更新会话消息（乐观更新）
    const updateSessionMessages = (newMsgs: Message[]) => {
      const updated = currentSessions.map(s =>
        s.id === sessionId
          ? {
              ...s,
              messages: newMsgs.slice(-MAX_MESSAGES_PER_SESSION),
              updatedAt: new Date(),
              // 如果是第一条消息，自动设置标题
              title: s.messages.length === 0 ? (msg.slice(0, 25) + (msg.length > 25 ? "..." : "")) : s.title,
            }
          : s
      );
      // 将当前会话移到顶部
      const idx = updated.findIndex(s => s.id === sessionId);
      if (idx > 0) {
        const [cur] = updated.splice(idx, 1);
        updated.unshift(cur);
      }
      persistSessions(updated);
      currentSessions = updated;
    };

    // 先显示用户消息和 loading
    const prevMessages = currentSessions.find(s => s.id === sessionId)?.messages ?? [];
    updateSessionMessages([...prevMessages, userMsg, streamingMsg]);

    // 构建发送给 API 的消息历史（不含 streaming 占位符）
    const apiMessages = [
      ...(config.systemPrompt.trim()
        ? [{ role: "system" as const, content: config.systemPrompt }]
        : []),
      ...prevMessages.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: msg },
    ];

    try {
      const result = await chatMutation.mutateAsync({
        apiUrl: config.apiUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: apiMessages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      // 替换 streaming 消息为真实回复
      const assistantMsg: Message = {
        id: generateId(),
        role: "assistant",
        content: result.content,
        createdAt: new Date(),
      };
      const finalMessages = [...prevMessages, userMsg, assistantMsg];
      updateSessionMessages(finalMessages);
    } catch (err: unknown) {
      // 移除 streaming 占位符
      updateSessionMessages([...prevMessages, userMsg]);
      const errMsg = err instanceof Error ? err.message : "请求失败，请检查 API 配置";
      toast.error(errMsg);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, isSending, activeSessionId, sessions, config, isConfigured, persistSessions, chatMutation]);

  // 快捷提问
  const handleQuickPrompt = useCallback((template: string) => {
    setInputValue(template);
    textareaRef.current?.focus();
  }, []);

  // 键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 保存配置
  const handleSaveConfig = (newConfig: ApiConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  // 清空当前会话
  const handleClearSession = () => {
    if (!activeSessionId) return;
    const updated = sessions.map(s =>
      s.id === activeSessionId ? { ...s, messages: [], updatedAt: new Date() } : s
    );
    persistSessions(updated);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── 左侧会话列表 ── */}
      <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-card">
        {/* 顶部 Logo */}
        <div className="p-4 border-b border-border">
          <Link href="/agent">
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity mb-3">
              <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">返回 AI 分析师</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">我的 AI 助手</p>
              <p className="text-xs text-muted-foreground">自定义 API 对话</p>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="p-3 flex gap-2 flex-shrink-0">
          <Button
            onClick={handleNewSession}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            size="sm"
          >
            <Plus className="w-3 h-3" />
            新建对话
          </Button>
          <Button
            onClick={() => setShowSettings(true)}
            variant="outline"
            size="sm"
            className={`px-2.5 ${!isConfigured ? "border-orange-400 text-orange-600 hover:bg-orange-50" : ""}`}
            title="API 配置"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* API 状态提示 */}
        {!isConfigured && (
          <div
            className="mx-3 mb-2 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 cursor-pointer"
            onClick={() => setShowSettings(true)}
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
              <p className="text-xs text-orange-700 dark:text-orange-400 font-medium">未配置 API</p>
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">点击右上角设置按钮配置您的 AI 接口</p>
          </div>
        )}

        {isConfigured && (
          <div className="mx-3 mb-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400 truncate">{config.model}</p>
            </div>
          </div>
        )}

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto px-2 min-h-0">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm px-3">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>还没有对话</p>
              <p className="text-xs mt-1">点击"新建对话"开始</p>
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    activeSessionId === session.id
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{session.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.messages.length} 条消息
                    </p>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部导航链接 */}
        <div className="p-3 border-t border-border flex-shrink-0 space-y-1">
          <Link href="/agent">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
              <Bot className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-xs text-muted-foreground">AI 交易分析师</span>
            </div>
          </Link>
          <Link href="/">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">返回首页</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* ── 右侧对话区 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeSessionId ? (
          /* 欢迎页 */
          <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-8 gap-8">
            <div className="text-center space-y-3 max-w-lg">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mx-auto shadow-lg">
                <Bot className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold font-display">我的 AI 助手</h1>
              <p className="text-muted-foreground leading-relaxed">
                接入您自己的 AI API（支持 OpenAI、DeepSeek、Moonshot、Qwen 等任意兼容接口），与 AI 自由讨论市场行情、交易想法和分析策略。
              </p>
              {!isConfigured && (
                <Button
                  onClick={() => setShowSettings(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  <Settings className="w-4 h-4" />
                  配置 API 接口
                </Button>
              )}
            </div>

            {/* 快捷提问 */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-sm font-medium text-center text-muted-foreground">快捷提问</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {QUICK_PROMPTS.map(({ icon: Icon, label, template }) => (
                  <button
                    key={label}
                    onClick={() => {
                      if (!isConfigured) {
                        setShowSettings(true);
                        toast.error("请先配置 API 接口");
                        return;
                      }
                      handleNewSession();
                      setTimeout(() => {
                        setInputValue(template);
                        textareaRef.current?.focus();
                      }, 100);
                    }}
                    className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                      <Icon className="w-4 h-4 text-blue-700" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{template.slice(0, 20)}...</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 新建对话按钮 */}
            <Button
              onClick={handleNewSession}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-8"
            >
              <Plus className="w-5 h-5" />
              开始新对话
            </Button>
          </div>
        ) : (
          <>
            {/* 对话顶部栏 */}
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm">
              <Bot className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {activeSession?.title || "对话"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isConfigured ? `${config.model}` : "未配置 API"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={handleClearSession}
                    className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="清空对话"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setShowSettings(true)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isConfigured
                      ? "border-border hover:border-blue-400 hover:text-blue-600"
                      : "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-900/20"
                  }`}
                >
                  <Settings className="w-3 h-3" />
                  {isConfigured ? config.model : "配置 API"}
                </button>
              </div>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-16">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">开始对话</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isConfigured ? "输入您的问题或交易想法" : "请先配置 API 接口"}
                    </p>
                  </div>
                  {/* 快捷提问 */}
                  <div className="grid grid-cols-2 gap-2 w-full max-w-md mt-2">
                    {QUICK_PROMPTS.slice(0, 4).map(({ icon: Icon, label, template }) => (
                      <button
                        key={label}
                        onClick={() => handleQuickPrompt(template)}
                        className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all text-left"
                      >
                        <Icon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <span className="text-xs">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-3xl mx-auto">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      {/* 头像 */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === "user"
                          ? "bg-blue-600"
                          : "bg-gradient-to-br from-blue-500 to-blue-700"
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
                            ? "bg-blue-600 text-white rounded-tr-sm"
                            : "bg-card border border-border rounded-tl-sm"
                        }`}>
                          {msg.isStreaming ? (
                            <div className="flex items-center gap-2 text-muted-foreground py-1">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span className="text-sm">AI 正在思考...</span>
                            </div>
                          ) : msg.role === "assistant" ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                              <Streamdown>{msg.content}</Streamdown>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
                          <Clock className="w-3 h-3" />
                          {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
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
                  {QUICK_PROMPTS.map(({ icon: Icon, label, template }) => (
                    <button
                      key={label}
                      onClick={() => handleQuickPrompt(template)}
                      disabled={isSending}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-background hover:border-blue-400 hover:text-blue-700 text-xs whitespace-nowrap transition-all flex-shrink-0 disabled:opacity-50"
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
                    placeholder={isConfigured ? "输入您的问题或交易想法... (Enter 发送，Shift+Enter 换行)" : "请先点击右上角配置 API 接口..."}
                    disabled={isSending}
                    className="flex-1 min-h-[44px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!inputValue.trim() || isSending}
                    className="bg-blue-600 hover:bg-blue-700 text-white h-[44px] px-4 flex-shrink-0"
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

      {/* 设置面板 */}
      {showSettings && (
        <SettingsPanel
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
