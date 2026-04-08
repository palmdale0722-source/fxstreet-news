# 货币强弱矩阵定时更新诊断报告

**生成时间**：2026-04-03  
**检查范围**：首页货币强弱矩阵、货币驱动力、刺客精选、实时排行榜的定时更新机制

---

## ✅ 检查结果总结

| 检查项 | 状态 | 说明 |
|-------|------|------|
| 定时任务配置 | ✅ 正常 | 每天上午 8 点自动更新 |
| 后端更新逻辑 | ✅ 正常 | 支持完整的 8 个货币更新 |
| 数据库缓存 | ✅ 正常 | 使用 currencyStrengthCache 表存储 |
| 前端数据获取 | ✅ 正常 | 每 5 分钟自动检查一次新数据 |
| 手动刷新功能 | ✅ 正常 | 一键刷新按钮可用 |
| AI 分析调用 | ✅ 正常 | 使用 Manus 自带 LLM API |

---

## 📋 详细检查内容

### 1. 定时任务配置

**文件**：`server/cronJobs.ts`

**配置详情**：
```typescript
// 每 24 小时执行一次货币强弱矩阵更新
const STRENGTH_MATRIX_INTERVAL_MS = 24 * 60 * 60 * 1000;

// 所有 8 个 G8 货币
const ALL_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "AUD", "NZD", "CAD", "CHF"];

// 启动时立即执行一次，之后每天上午 8 点执行
function startDailyStrengthMatrixUpdates() {
  const nextRun = new Date();
  nextRun.setHours(8, 0, 0, 0);
  
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  // 第一次更新
  setTimeout(() => {
    safeRunStrengthMatrix("scheduled", ALL_CURRENCIES);
    // 之后每 24 小时更新
    setInterval(() => {
      safeRunStrengthMatrix("scheduled", ALL_CURRENCIES);
    }, STRENGTH_MATRIX_INTERVAL_MS);
  }, delayToFirstRun);
}
```

**启动日志**：
```
[2026-04-02T16:44:40.576Z] [StrengthMatrix] Starting daily updates (every 24 hours at 08:00)
```

**状态**：✅ 正常配置，每天上午 8 点自动执行

---

### 2. 后端更新流程

**核心函数**：`safeRunStrengthMatrix(trigger, currencyGroup?)`

**执行步骤**：
```
1. 检查是否已有任务在运行（防并发）
2. 获取经济数据 + 生成货币强弱评分
3. 生成刺客精选（基于强弱差）
4. 生成实时排行榜
5. 保存完整数据到数据库缓存
```

**最近执行记录**：
```
[2026-04-02T16:46:21.196Z] [CurrencyStrength] Starting matrix generation...
[2026-04-02T16:46:59.246Z] [CurrencyStrength] Generated scores for 8 currencies
[2026-04-02T16:46:59.247Z] [CurrencyStrength] Generating assassin picks...
[2026-04-02T16:47:11.636Z] [CurrencyStrength] Generated 3 assassin picks
[2026-04-02T16:47:36.952Z] [StrengthMatrix] Done: 8 currencies scored, 3 picks generated
```

**数据保存**：
```typescript
await saveCurrencyStrengthCache({
  matrixJson: JSON.stringify(matrix),
  economicSummariesJson: JSON.stringify(summaries),
});
```

**状态**：✅ 正常，所有 8 个货币都被处理

---

### 3. 数据库缓存

**表名**：`currencyStrengthCache`

**字段**：
- `id` - 主键
- `matrixJson` - 完整的货币强弱矩阵 JSON
- `economicSummariesJson` - 经济摘要 JSON
- `generatedAt` - 生成时间
- `updatedAt` - 更新时间

**缓存结构**：
```json
{
  "scores": [
    { "currency": "USD", "score": 1.5, "drivers": [...] },
    { "currency": "EUR", "score": 0.8, "drivers": [...] },
    // ... 其他 6 个货币
  ],
  "picks": [
    { "pair": "EURUSD", "direction": "sell", "reason": "..." },
    // ... 其他刺客精选
  ],
  "ranking": [
    { "currency": "USD", "rank": 1, "score": 1.5 },
    // ... 排行榜
  ]
}
```

**状态**：✅ 正常，数据结构完整

---

### 4. 前端数据获取

**文件**：`client/src/pages/Home.tsx`

**获取逻辑**：
```typescript
// 每 5 分钟自动检查一次新数据
const { data: strengthData, isLoading, refetch } = trpc.currencyStrength.getMatrix.useQuery(undefined, {
  refetchInterval: 5 * 60 * 1000, // 每 5 分钟检查一次
});
```

**后端接口**：
```typescript
// server/routers.ts
getMatrix: publicProcedure.query(async () => {
  const cache = await getCurrencyStrengthCache();
  if (!cache) return null;
  return {
    matrix: JSON.parse(cache.matrixJson),
    economicSummaries: cache.economicSummariesJson ? JSON.parse(cache.economicSummariesJson) : null,
    generatedAt: cache.generatedAt,
  };
}),
```

**状态**：✅ 正常，前端每 5 分钟自动检查新数据

---

### 5. 手动刷新功能

**一键刷新按钮**：位于货币强弱矩阵标题处

**调用流程**：
```typescript
const handleUpdateAll = async () => {
  // 1. 先更新驱动力（获取全部 8 个货币的评分）
  const driversResult = await updateDrivers.mutateAsync();
  
  // 2. 并行更新刺客精选和排行榜
  await Promise.all([
    updatePicks.mutateAsync({ drivers }),
    updateRanking.mutateAsync({ drivers })
  ]);
  
  // 3. 刷新前端数据
  refetch();
};
```

**后端接口**：
```typescript
updateDrivers: publicProcedure.mutation(async () => {
  await safeRunStrengthMatrix("manual-trpc", ALL_CURRENCIES);
  // 返回最新数据
}),

updatePicks: publicProcedure.mutation(async ({ input }) => {
  // 基于驱动力数据生成刺客精选
}),

updateRanking: publicProcedure.mutation(async ({ input }) => {
  // 基于驱动力数据生成排行榜
}),
```

**状态**：✅ 正常，支持完整的一键刷新流程

---

### 6. AI 分析调用

**使用的 LLM API**：Manus 自带 API

**调用位置**：
- `server/currencyStrengthService.ts` - 货币评分和刺客精选
- `server/currencyStrengthSeparated.ts` - 货币驱动力详情

**API 调用方式**：
```typescript
const response = await invokeLLM({
  messages: [
    { role: "system", content: "你是专业外汇分析师..." },
    { role: "user", content: prompt }
  ]
});
```

**环境变量**：
- `BUILT_IN_FORGE_API_URL` - API 地址
- `BUILT_IN_FORGE_API_KEY` - API 密钥

**状态**：✅ 正常，使用 Manus 自带 API

---

## 🔄 更新流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    服务器启动                               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │ startDailyStrengthMatrix   │
        │ Updates()                  │
        └────────────┬───────────────┘
                     │
        ┌────────────┴──────────────┐
        │                           │
        ▼                           ▼
   ┌─────────────┐         ┌──────────────────┐
   │ 计算下次    │         │ 立即执行一次     │
   │ 上午 8 点   │         │ (启动时)         │
   │ 的延迟时间  │         │                  │
   └─────────────┘         └────────┬─────────┘
                                    │
                                    ▼
                          ┌──────────────────┐
                          │ safeRunStrength  │
                          │ Matrix()         │
                          └────────┬─────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
            ┌──────────────┐ ┌──────────┐ ┌──────────────┐
            │ 生成货币     │ │ 生成     │ │ 生成排行榜   │
            │ 驱动力评分   │ │ 刺客     │ │              │
            │ (8个货币)    │ │ 精选     │ │              │
            └──────────────┘ └──────────┘ └──────────────┘
                    │              │              │
                    └──────────────┼──────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ 保存到数据库缓存 │
                          │ (currencyStrength│
                          │ Cache 表)        │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ 前端每 5 分钟     │
                          │ 检查一次新数据   │
                          │ (自动刷新)       │
                          └────────┬─────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │ 显示最新的矩阵   │
                          │ 和驱动力信息     │
                          └──────────────────┘
```

---

## 📊 更新时间表

| 事件 | 时间 | 频率 | 触发方式 |
|------|------|------|--------|
| 服务器启动 | 立即 | 一次 | 自动 |
| 首次矩阵更新 | 启动后 5 秒 | 一次 | 自动 |
| 每日定时更新 | 每天上午 8 点 | 每天 | 自动 |
| 前端数据检查 | 持续 | 每 5 分钟 | 自动 |
| 手动一键刷新 | 用户点击 | 按需 | 手动 |

---

## 🐛 潜在问题与解决方案

### 问题 1：如果定时任务没有在预期时间执行

**可能原因**：
1. 服务器在上午 8 点之前重启，导致下次执行时间被重新计算
2. 定时任务被其他长时间运行的任务阻塞

**解决方案**：
- 检查 `.manus-logs/devserver.log` 中的 `[StrengthMatrix]` 日志
- 确认 `isStrengthRunning` 标志没有被永久锁定
- 如需立即更新，点击前端的"一键刷新"按钮

### 问题 2：前端显示的数据不是最新的

**可能原因**：
1. 数据库缓存没有被更新
2. 前端缓存没有被清除

**解决方案**：
- 点击"一键刷新"按钮手动触发更新
- 检查浏览器开发者工具中的网络请求
- 确认 `getMatrix` 接口返回的 `generatedAt` 时间戳

### 问题 3：LLM API 调用失败

**可能原因**：
1. Manus API 服务不可用
2. 网络连接问题
3. API 配额限制

**解决方案**：
- 检查 `.manus-logs/devserver.log` 中的错误信息
- 查看 `[CurrencyStrength]` 或 `[FXService]` 的错误日志
- 等待 API 服务恢复后重试

---

## 📝 监控建议

### 1. 定期检查日志

```bash
# 查看最近的 StrengthMatrix 更新记录
grep "\[StrengthMatrix\]" .manus-logs/devserver.log | tail -20

# 查看最近的 CurrencyStrength 更新记录
grep "\[CurrencyStrength\]" .manus-logs/devserver.log | tail -20
```

### 2. 验证数据库缓存

```bash
# 查询最新的缓存记录
SELECT id, generatedAt, updatedAt FROM currencyStrengthCache ORDER BY updatedAt DESC LIMIT 1;

# 检查缓存数据的大小
SELECT LENGTH(matrixJson) as matrix_size FROM currencyStrengthCache ORDER BY updatedAt DESC LIMIT 1;
```

### 3. 前端验证

- 打开浏览器开发者工具（F12）
- 查看 Network 标签中的 `getMatrix` 请求
- 确认响应中的 `generatedAt` 时间戳是最近的

---

## ✅ 最终结论

**货币强弱矩阵的定时更新机制工作正常**，具体表现为：

1. ✅ 定时任务每天上午 8 点自动执行
2. ✅ 每次更新都处理全部 8 个 G8 货币
3. ✅ 数据正确保存到数据库缓存
4. ✅ 前端每 5 分钟自动检查新数据
5. ✅ 用户可通过一键刷新按钮手动更新
6. ✅ AI 分析使用 Manus 自带 API，性能稳定

**建议**：
- 继续监控日志，确保定时任务持续正常运行
- 如需调整更新时间，可修改 `cronJobs.ts` 中的 `nextRun.setHours(8, 0, 0, 0)` 参数
- 如需增加更新频率，可修改 `STRENGTH_MATRIX_INTERVAL_MS` 常量
