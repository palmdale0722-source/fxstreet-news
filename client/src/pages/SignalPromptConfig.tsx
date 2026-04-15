import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Check, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function SignalPromptConfig() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 获取当前 Prompt
  const currentPromptQuery = trpc.signalPrompt.getCurrent.useQuery();
  const historyQuery = trpc.signalPrompt.getHistory.useQuery({ limit: 20 });

  // 保存 Prompt
  const savePromptMutation = trpc.signalPrompt.save.useMutation();
  const rollbackMutation = trpc.signalPrompt.rollback.useMutation();

  // 初始化表单
  useEffect(() => {
    if (currentPromptQuery.data) {
      setSystemPrompt(currentPromptQuery.data.systemPrompt);
      setDescription(`v${currentPromptQuery.data.version} (当前激活)`);
    }
  }, [currentPromptQuery.data]);

  const handleSave = async () => {
    if (!systemPrompt.trim()) {
      toast.error("Prompt 内容不能为空");
      return;
    }

    setIsSaving(true);
    try {
      await savePromptMutation.mutateAsync({
        systemPrompt: systemPrompt.trim(),
        description: description || undefined,
      });
      toast.success("Prompt 已保存");
      currentPromptQuery.refetch();
      historyQuery.refetch();
      setDescription("");
    } catch (error) {
      toast.error("保存失败");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRollback = async (version: number) => {
    try {
      await rollbackMutation.mutateAsync({ version });
      toast.success(`已回滚到 v${version}`);
      currentPromptQuery.refetch();
      historyQuery.refetch();
    } catch (error) {
      toast.error("回滚失败");
      console.error(error);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(systemPrompt);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">交易信号 AI Prompt 配置</h1>
        <p className="text-gray-600 mt-2">
          根据实时市场情况手动调整 AI 分析师的 System Prompt
        </p>
      </div>

      {/* 当前 Prompt 编辑区 */}
      <Card>
        <CardHeader>
          <CardTitle>编辑 System Prompt</CardTitle>
          <CardDescription>
            修改 AI 分析师用于分析交易信号的提示词
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>提示</AlertTitle>
            <AlertDescription>
              修改后的 Prompt 将立即生效，用于分析新的交易信号。建议在市场情况发生重大变化时更新。
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">System Prompt</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="输入或粘贴 System Prompt..."
              className="font-mono text-sm h-64"
            />
            <div className="text-xs text-gray-500">
              字数: {systemPrompt.length}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">版本描述（可选）</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：添加市场反转检测、优化置信度计算..."
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !systemPrompt.trim()}
              className="flex-1"
            >
              {isSaving ? "保存中..." : "保存新版本"}
            </Button>
            <Button
              onClick={handleCopy}
              variant="outline"
              className="flex-1"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 版本历史 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>版本历史</CardTitle>
              <CardDescription>
                查看和恢复之前保存的 Prompt 版本
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? "隐藏" : "显示"}
            </Button>
          </div>
        </CardHeader>

        {showHistory && (
          <CardContent>
            {historyQuery.isLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : historyQuery.data && historyQuery.data.length > 0 ? (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {historyQuery.data.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          v{prompt.version}
                        </span>
                        {prompt.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                            <Check className="w-3 h-3" />
                            激活中
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {prompt.description || "无描述"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(prompt.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!prompt.isActive && (
                      <Button
                        onClick={() => handleRollback(prompt.version)}
                        variant="outline"
                        size="sm"
                        className="ml-2"
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        恢复
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                暂无版本历史
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 使用建议 */}
      <Card>
        <CardHeader>
          <CardTitle>使用建议</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <h4 className="font-semibold mb-1">何时更新 Prompt：</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>市场出现重大反转或地缘政治变化</li>
              <li>发现 AI 分析存在系统性错误</li>
              <li>需要调整 AI 的风险偏好或决策标准</li>
              <li>添加新的市场背景信息或约束条件</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Prompt 编写要点：</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>明确告诉 AI 当前的市场背景和趋势</li>
              <li>指定 AI 应该如何处理数据新鲜度问题</li>
              <li>定义清晰的决策标准（execute/watch/ignore）</li>
              <li>添加风险警告和置信度调整规则</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
