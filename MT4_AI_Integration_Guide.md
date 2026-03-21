# FXStreet 项目 MT4 数据与 AI 分析师模块改造指南

本文档详细分析了 `fxstreet-news` 项目中 MT4 数据接入、自定义指标推送以及 AI 分析师模块的代码结构和数据流转机制，并为您提供后续改造的入口指南。

## 一、 整体架构与数据流

项目目前已经实现了一套完整的“MT4 -> 服务端 -> AI 分析师”的数据闭环。

### 1. 核心链路
1. **MT4 EA 端**：通过 `FXStreetBridge.mq4` 脚本，定时（默认每 15 分钟）获取图表上的 K 线数据和自定义指标数据，并通过 HTTP POST 请求推送到服务端。
2. **服务端接收**：Express 路由（`server/mt4Routes.ts`）接收数据，进行 API Key 鉴权后，将数据存入数据库（TiDB）。
3. **AI 分析师调用**：用户在前端发起提问时，tRPC 路由（`server/routers.ts`）会从数据库中拉取最新的 MT4 行情数据、自定义指标信号、新闻、用户交易体系等上下文，拼装成 System Prompt，发送给 LLM（大语言模型）进行分析。

## 二、 核心模块代码位置及解析

### 1. MT4 EA 推送端
- **文件路径**：`mt4/FXStreetBridge.mq4`
- **当前实现**：
  - 目前的 EA 主要实现了 **M15 K线数据**（开高低收、成交量、点差）的推送。
  - **改造点**：如果您想推送**自定义指标**，需要在这个文件中新增逻辑，使用 `iCustom()` 函数读取您的指标数据，并构建符合 `/api/mt4/indicators` 接口格式的 JSON 进行推送。

### 2. 服务端接收路由
- **文件路径**：`server/mt4Routes.ts`
- **核心接口**：
  - `POST /api/mt4/push`：接收基础 K 线数据。
  - `POST /api/mt4/indicators`：接收自定义指标信号。
- **数据结构**（指标推送）：
  ```json
  {
    "clientId": "mt4-client-01",
    "signals": [{
      "symbol": "EURUSD",
      "timeframe": "M15",
      "indicatorName": "YourIndicatorName",
      "value1": "0.85",
      "value2": "0.42",
      "signal": "buy",
      "description": "RSI 超卖且金叉"
    }]
  }
  ```

### 3. 数据库 Schema
- **文件路径**：`drizzle/schema.ts`
- **相关表**：
  - `mt4Bars`：存储 K 线数据。
  - `mt4IndicatorSignals`：存储 EA 推送过来的实时指标信号值。
  - `mt4IndicatorConfigs`：存储用户在前端配置的指标“解读规则”（AI 分析时会用到）。

### 4. AI 分析师 Prompt 构建
- **文件路径**：`server/routers.ts` (第 226-400 行，`agent.chat` 路由)
- **当前实现**：
  在发起 LLM 请求前，系统会并行查询各种上下文数据：
  ```typescript
  const [newsCtx, { insight, outlooks }, forexQuote, mt4BarsData, tvIdeasCtx, tradingSystemItems, tradeHistory, indicatorSignals, indicatorConfigs] = await Promise.all([...]);
  ```
  然后将这些数据拼装到 `systemPrompt` 中：
  ```typescript
  ${indicatorSection ? `【自定义 MT4 指标实时信号】
  ${indicatorSection}
  ` : ''}
  ```
- **解读规则的结合**：代码会将 `mt4IndicatorSignals`（实时推送的值）与 `mt4IndicatorConfigs`（用户配置的解读规则）结合，告诉 AI 这个指标的数值代表什么意义。

### 5. 前端配置页面
- **文件路径**：`client/src/pages/MySystem.tsx`
- **当前实现**：在“交易体系 -> MT4 指标配置”标签页，用户可以添加指标名称，并用自然语言填写“信号解读规则”（例如：*“当 value1 > 0 时表示上升趋势，< 0 表示下降趋势”*）。

---

## 三、 改造实战指南

如果您想接入自己的自定义指标并让 AI 分析师使用，请按照以下步骤进行：

### 第一步：在前端配置指标解读规则
1. 登录系统，进入 **“交易体系”** (My System) 页面。
2. 切换到 **“MT4 指标配置”** 标签页。
3. 点击“添加指标”，填写信息：
   - **指标文件名**：必须与您 MT4 中 `.ex4` 文件的名称完全一致（不含后缀）。
   - **信号解读规则**：用清晰的自然语言告诉 AI 如何看这个指标。例如：*“该指标是趋势指标，value1 是主线，value2 是信号线。当 value1 上穿 value2 且值大于 0 时，是强烈的买入信号。”*

### 第二步：修改 MT4 EA 脚本 (`FXStreetBridge.mq4`)
您需要修改现有的 EA，让它不仅推送 K 线，还推送您的指标数据。

在 `PushAllSymbols()` 函数中或新建一个函数，添加如下逻辑示例：

```mql4
// 示例：获取自定义指标数据并推送到 /api/mt4/indicators
void PushCustomIndicators() {
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";
   
   // 假设我们要获取 EURUSD 的指标
   string symbol = "EURUSD";
   
   // 使用 iCustom 获取指标值
   // 假设您的指标名为 "MyTrendIndicator.ex4"
   double val1 = iCustom(symbol, PERIOD_M15, "MyTrendIndicator", 0, 1); // buffer 0, 倒数第1根K线
   double val2 = iCustom(symbol, PERIOD_M15, "MyTrendIndicator", 1, 1); // buffer 1
   
   // 简单的本地信号判断（可选，也可以全交由 AI 判断）
   string signalType = "neutral";
   if(val1 > val2) signalType = "buy";
   else if(val1 < val2) signalType = "sell";
   
   json += "{";
   json += "\"symbol\":\"" + symbol + "\",";
   json += "\"timeframe\":\"M15\",";
   json += "\"indicatorName\":\"MyTrendIndicator\","; // 必须与前端配置一致
   json += "\"value1\":\"" + DoubleToString(val1, 4) + "\",";
   json += "\"value2\":\"" + DoubleToString(val2, 4) + "\",";
   json += "\"signal\":\"" + signalType + "\"";
   json += "}";
   
   json += "]}";
   
   // 发送到指标接口
   SendHttpPost(ServerURL + "/api/mt4/indicators", json);
}
```

### 第三步：验证数据流转
1. 确保 EA 运行并成功发起 HTTP 请求。
2. 在服务端日志中查看是否打印了 `[MT4] Received X indicator signals from ...`。
3. 在前端进入 **“AI 分析师”** 页面，选择对应的货币对，向 AI 提问：“根据当前的自定义指标，你有什么建议？”
4. 观察 AI 的回复，它应该会明确引用您在前端配置的解读规则以及 EA 推送的最新数值进行分析。

## 四、 进阶改造建议

如果您需要对 AI 分析师的 Prompt 逻辑进行深度定制，可以修改 `server/routers.ts` 中的 `agent.chat` 路由。

**定位代码**：
```typescript
// server/routers.ts 约 340 行
const systemPrompt = `你是一位专业的外汇交易分析师...
${tradingSystemSection ? `【交易者个人交易体系与方法论】...` : ''}
${indicatorSection ? `【自定义 MT4 指标实时信号】...` : ''}
...`
```

您可以在这里调整各个模块的权重。例如，如果您希望 AI **绝对服从**某个自定义指标的买卖信号，可以在 Prompt 中加入强制性指令：“当【自定义 MT4 指标实时信号】中出现 buy 信号时，你的最终建议必须是做多”。
