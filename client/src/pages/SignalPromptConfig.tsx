import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Copy, RotateCcw, Save } from "lucide-react";

export default function SignalPromptConfig() {
  const [promptContent, setPromptContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [activeTab, setActiveTab] = useState("editor");

  // 获取当前 Prompt
  const { data: currentPrompt, isLoading: isLoadingCurrent } = trpc.signalPrompt.getCurrent.useQuery();

  // 获取历史版本
  const { data: history, isLoading: isLoadingHistory, refetch: refetchHistory } = trpc.signalPrompt.getHistory.useQuery();

  // 保存 Prompt
  const saveMutation = trpc.signalPrompt.save.useMutation({
    onSuccess: (data) => {
      setSaveMessage("✅ Prompt 已保存成功");
      setTimeout(() => setSaveMessage(""), 3000);
      refetchHistory();
    },
    onError: (error) => {
      setSaveMessage(`❌ 保存失败: ${error.message}`);
    },
  });

  // 回滚 Prompt
  const rollbackMutation = trpc.signalPrompt.rollback.useMutation({
    onSuccess: () => {
      setSaveMessage("✅ 已回滚到该版本");
      setTimeout(() => setSaveMessage(""), 3000);
      refetchHistory();
    },
    onError: (error) => {
      setSaveMessage(`❌ 回滚失败: ${error.message}`);
    },
  });

  // 初始化编辑器内容
  useEffect(() => {
    if (currentPrompt?.systemPrompt) {
      setPromptContent(currentPrompt.systemPrompt);
    }
  }, [currentPrompt]);

  const handleSave = async () => {
    if (!promptContent.trim()) {
      setSaveMessage("❌ Prompt 内容不能为空");
      return;
    }
    setIsSaving(true);
    try {
      await saveMutation.mutateAsync({ content: promptContent });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = (versionId: number) => {
    rollbackMutation.mutate({ versionId });
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(promptContent);
    setSaveMessage("✅ 已复制到剪贴板");
    setTimeout(() => setSaveMessage(""), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* 页面头部 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">交易信号 AI Prompt 配置</h1>
          <p className="text-muted-foreground">
            自定义 AI 分析师的 System Prompt，根据市场情况灵活调整分析策略
          </p>
        </div>

        {/* 状态消息 */}
        {saveMessage && (
          <Alert className="mb-6" variant={saveMessage.includes("✅") ? "default" : "destructive"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{saveMessage}</AlertDescription>
          </Alert>
        )}

        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="editor">编辑 Prompt</TabsTrigger>
            <TabsTrigger value="history">版本历史</TabsTrigger>
          </TabsList>

          {/* 编辑标签页 */}
          <TabsContent value="editor" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Prompt 编辑器</CardTitle>
                <CardDescription>
                  编辑 AI 分析师的 System Prompt。保存后将立即应用到新的交易信号分析中。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 编辑区域 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Prompt 内容</label>
                  <textarea
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                    placeholder="输入 System Prompt..."
                    className="w-full h-96 p-4 border border-border rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="text-xs text-muted-foreground">
                    字数: {promptContent.length} / 5000
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || !promptContent.trim()}
                    className="flex-1"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? "保存中..." : "保存新版本"}
                  </Button>
                  <Button
                    onClick={handleCopyPrompt}
                    variant="outline"
                    className="flex-1"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    复制内容
                  </Button>
                </div>

                {/* 当前版本信息 */}
                {currentPrompt && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>当前版本:</strong> v{currentPrompt.version} | 
                      <strong className="ml-2">创建时间:</strong> {new Date(currentPrompt.createdAt).toLocaleString()}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 版本历史标签页 */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>版本历史</CardTitle>
                <CardDescription>
                  查看所有保存过的 Prompt 版本，点击"恢复"可回滚到该版本
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHistory ? (
                  <div className="text-center py-8 text-muted-foreground">加载中...</div>
                ) : history && history.length > 0 ? (
                  <div className="space-y-3">
                    {history.map((version) => (
                      <div
                        key={version.id}
                        className={`p-4 border rounded-lg ${
                          version.isActive ? "bg-primary/5 border-primary" : "bg-background"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold">版本 {version.version}</span>
                              {version.isActive && (
                                <span className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                                  当前版本
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mb-2">
                              创建时间: {new Date(version.createdAt).toLocaleString()}
                            </div>
                            <div className="text-sm bg-muted p-3 rounded max-h-24 overflow-y-auto font-mono">
                              {version.systemPrompt.substring(0, 200)}...
                            </div>
                          </div>
                          {!version.isActive && (
                            <Button
                              onClick={() => handleRollback(version.version)}
                              variant="outline"
                              size="sm"
                              disabled={rollbackMutation.isPending}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" />
                              恢复
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无版本历史
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 使用说明 */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">💡 使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>
              • <strong>System Prompt</strong> 是 AI 分析师的核心指令，定义了它如何分析交易信号
            </p>
            <p>
              • 修改 Prompt 后点击"保存新版本"，新的分析将使用新版本的 Prompt
            </p>
            <p>
              • 所有版本都会被保存，您可以随时回滚到之前的版本
            </p>
            <p>
              • 建议在市场环境变化时（如波动率上升、趋势反转等）调整 Prompt 以适应新的市场条件
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
