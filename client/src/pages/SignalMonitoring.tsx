import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Monitor {
  id: bigint;
  originalSignalId: bigint;
  status: 'active' | 'confirmed' | 'expired' | 'cancelled';
  monitoredPairs: string[];
  confirmationStrategy: any;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}

interface Checkpoint {
  id: bigint;
  pair: string;
  entryPrice: number | null;
  breakoutLevel: number | null;
  confirmationLevel: number | null;
  rsiValue: number | null;
  macdValue: number | null;
  isBreakoutConfirmed: boolean;
  isIndicatorConfirmed: boolean;
  isFinalConfirmed: boolean;
  checkpointTime: string;
  confirmationTime: string | null;
}

interface Alert {
  id: bigint;
  pair: string;
  alertType: string;
  title: string;
  message: string;
  emailSent: boolean;
  pushSent: boolean;
  userAction: string | null;
  createdAt: string;
}

// ─── Signal Monitoring Dashboard ────────────────────────────────────────────

export function SignalMonitoring() {
  const [selectedMonitor, setSelectedMonitor] = useState<bigint | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 获取活跃监控列表
  const { data: monitors, isLoading: monitorsLoading, refetch: refetchMonitors } = 
    trpc.signalMonitoring.getActiveMonitors.useQuery(undefined, {
      refetchInterval: autoRefresh ? 30000 : false,
    });

  // 获取选中监控的详情
  const { data: monitorDetail } = 
    trpc.signalMonitoring.getMonitor.useQuery(
      { monitorId: selectedMonitor! },
      { enabled: !!selectedMonitor }
    );

  // 获取检查点
  const { data: checkpoints } = 
    trpc.signalMonitoring.getCheckpoints.useQuery(
      { monitorId: selectedMonitor! },
      { enabled: !!selectedMonitor, refetchInterval: autoRefresh ? 30000 : false }
    );

  // 获取报警
  const { data: alerts } = 
    trpc.signalMonitoring.getAlerts.useQuery(
      { monitorId: selectedMonitor! },
      { enabled: !!selectedMonitor, refetchInterval: autoRefresh ? 30000 : false }
    );

  // 取消监控
  const { mutate: cancelMonitoring } = trpc.signalMonitoring.cancelMonitoring.useMutation({
    onSuccess: () => {
      refetchMonitors();
      setSelectedMonitor(null);
    },
  });

  // 手动确认
  const { mutate: manualConfirm } = trpc.signalMonitoring.manualConfirm.useMutation({
    onSuccess: () => {
      refetchMonitors();
    },
  });

  // 更新报警状态
  const { mutate: updateAlertAction } = trpc.signalMonitoring.updateAlertAction.useMutation();

  // 自动选择第一个监控
  useEffect(() => {
    if (monitors && monitors.length > 0 && !selectedMonitor) {
      setSelectedMonitor(monitors[0].id);
    }
  }, [monitors, selectedMonitor]);

  if (monitorsLoading) {
    return <div className="p-8 text-center">加载中...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* 标题和控制 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">信号监控确认</h1>
          <p className="text-gray-600 mt-2">监控交易信号，等待价格突破和技术指标二次确认</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '自动刷新中' : '手动刷新'}
          </Button>
          <Button variant="outline" onClick={() => refetchMonitors()}>
            立即刷新
          </Button>
        </div>
      </div>

      {/* 监控列表和详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 监控列表 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>活跃监控</CardTitle>
              <CardDescription>{monitors?.length || 0} 个监控任务</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monitors && monitors.length > 0 ? (
                  monitors.map((monitor) => (
                    <button
                      key={String(monitor.id)}
                      onClick={() => setSelectedMonitor(monitor.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedMonitor === monitor.id
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold">信号 #{String(monitor.originalSignalId)}</div>
                      <div className="text-sm text-gray-600">
                        {monitor.monitoredPairs.join(', ')}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(monitor.createdAt || '').toLocaleString()}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {monitor.monitoredPairs.map((pair) => (
                          <Badge key={pair} variant="outline" className="text-xs">
                            {pair}
                          </Badge>
                        ))}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    暂无活跃监控
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 监控详情 */}
        {selectedMonitor && monitorDetail && (
          <div className="lg:col-span-2 space-y-6">
            {/* 监控信息卡片 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>监控详情</CardTitle>
                    <CardDescription>信号 #{String(monitorDetail.originalSignalId)}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => manualConfirm({ monitorId: selectedMonitor })}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      手动确认
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelMonitoring({ monitorId: selectedMonitor })}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      取消监控
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-600">状态</div>
                    <div className="text-lg font-semibold">
                      <Badge
                        variant={
                          monitorDetail.status === 'confirmed'
                            ? 'default'
                            : monitorDetail.status === 'cancelled'
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {monitorDetail.status === 'monitoring' && '监控中'}
                        {monitorDetail.status === 'confirmed' && '已确认'}
                        {monitorDetail.status === 'expired' && '已过期'}
                        {monitorDetail.status === 'cancelled' && '已取消'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">监控货币对</div>
                    <div className="text-lg font-semibold">
                      {monitorDetail.monitoredPairs.length} 个
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">创建时间</div>
                    <div className="text-sm">
                      {new Date(monitorDetail.createdAt || '').toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">过期时间</div>
                    <div className="text-sm">
                      {new Date(monitorDetail.expiresAt || '').toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 标签页：检查点和报警 */}
            <Tabs defaultValue="checkpoints" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="checkpoints">
                  <Clock className="w-4 h-4 mr-2" />
                  检查点 ({checkpoints?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="alerts">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  报警 ({alerts?.length || 0})
                </TabsTrigger>
              </TabsList>

              {/* 检查点标签页 */}
              <TabsContent value="checkpoints" className="space-y-4">
                {checkpoints && checkpoints.length > 0 ? (
                  checkpoints.map((checkpoint) => (
                    <Card key={String(checkpoint.id)}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{checkpoint.pair}</CardTitle>
                          <div className="flex gap-2">
                            {checkpoint.isBreakoutConfirmed && (
                              <Badge className="bg-green-100 text-green-800">
                                价格确认 ✓
                              </Badge>
                            )}
                            {checkpoint.isIndicatorConfirmed && (
                              <Badge className="bg-blue-100 text-blue-800">
                                指标确认 ✓
                              </Badge>
                            )}
                            {checkpoint.isFinalConfirmed && (
                              <Badge className="bg-purple-100 text-purple-800">
                                最终确认 ✓
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-gray-600">入场价格</div>
                            <div className="text-lg font-semibold">
                              {checkpoint.entryPrice?.toFixed(5) || '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">突破位</div>
                            <div className="text-lg font-semibold">
                              {checkpoint.breakoutLevel?.toFixed(5) || '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">RSI</div>
                            <div className="text-lg font-semibold">
                              {checkpoint.rsiValue?.toFixed(2) || '-'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-600">MACD</div>
                            <div className="text-lg font-semibold">
                              {checkpoint.macdValue?.toFixed(6) || '-'}
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 border-t pt-2">
                          最后检查: {new Date(checkpoint.checkpointTime || '').toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    暂无检查点数据
                  </div>
                )}
              </TabsContent>

              {/* 报警标签页 */}
              <TabsContent value="alerts" className="space-y-4">
                {alerts && alerts.length > 0 ? (
                  alerts.map((alert) => (
                    <Card key={String(alert.id)}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg">{alert.title}</CardTitle>
                            <CardDescription>{alert.pair}</CardDescription>
                          </div>
                          <Badge
                            variant={
                              alert.userAction === 'entered'
                                ? 'default'
                                : alert.userAction === 'ignored'
                                ? 'destructive'
                                : 'outline'
                            }
                          >
                            {alert.userAction === 'acknowledged' && '已确认'}
                            {alert.userAction === 'entered' && '已入场'}
                            {alert.userAction === 'ignored' && '已忽略'}
                            {alert.userAction === 'cancelled' && '已取消'}
                            {!alert.userAction && '待处理'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm">{alert.message}</p>
                        <div className="flex gap-2 text-xs text-gray-500">
                          {alert.emailSent && <span>✓ 邮件已发送</span>}
                          {alert.pushSent && <span>✓ 推送已发送</span>}
                        </div>
                        <div className="flex gap-2 pt-2">
                          {!alert.userAction && (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  updateAlertAction({
                                    alertId: alert.id,
                                    userAction: 'entered',
                                  })
                                }
                                className="bg-green-600 hover:bg-green-700"
                              >
                                已入场
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateAlertAction({
                                    alertId: alert.id,
                                    userAction: 'ignored',
                                  })
                                }
                              >
                                忽略
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    暂无报警记录
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}

export default SignalMonitoring;
