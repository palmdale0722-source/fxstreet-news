# MT4 自定义指标推送指南：多时间框架完整方案

> 本文档详细说明如何通过 MT4 EA 将自定义指标的计算值按不同时间框架推送到 FXStreet AI 分析师，使 AI 在分析时能够直接引用你的专属指标信号。

---

## 一、整体架构

自定义指标推送的数据流如下：

```
MT4 图表（多个时间框架）
    ↓  iCustom() 读取指标 buffer
EA（FXStreetBridge.mq4）
    ↓  HTTP POST /api/mt4/indicators
服务器（mt4Routes.ts → upsertIndicatorSignal）
    ↓  按 symbol + timeframe + indicatorName 唯一存储
数据库（mt4_indicator_signals 表）
    ↓  getIndicatorSignalsForAgent() 查询
AI 系统 Prompt（注入指标信号 + 解读规则）
    ↓
AI 分析师（结合你的指标给出交易建议）
```

**关键设计原则：** 数据库以 `(symbol, timeframe, indicatorName)` 三元组作为唯一键，每次推送执行 UPSERT（更新或插入），因此每个货币对在每个时间框架下的每个指标始终只保留**最新一条**记录，AI 读取的永远是最新信号。

---

## 二、推送接口规范

### 接口地址

```
POST https://你的域名/api/mt4/indicators
```

### 请求头

| 字段 | 值 |
|------|-----|
| `Content-Type` | `application/json` |
| `X-MT4-API-Key` | 你在 EA 参数中配置的 ApiKey |

### 请求体结构

```json
{
  "clientId": "mt4-client-01",
  "signals": [
    {
      "symbol":        "EURUSD",
      "timeframe":     "M15",
      "indicatorName": "TrendKiller",
      "value1":        "0.0023",
      "value2":        "-0.0011",
      "value3":        null,
      "signal":        "buy",
      "description":   "趋势向上，主线穿越零轴"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `clientId` | string | 是 | EA 实例标识，与 K 线推送保持一致 |
| `signals` | array | 是 | 指标信号数组，可一次推送多条 |
| `symbol` | string | 是 | 货币对，无斜杠大写，如 `EURUSD` |
| `timeframe` | string | 是 | 时间框架，见下方枚举 |
| `indicatorName` | string | 是 | 指标文件名（不含 `.ex4`），如 `TrendKiller` |
| `value1` | string | 否 | 指标主值（buffer 0），建议保留 4-6 位小数 |
| `value2` | string | 否 | 副值或信号线（buffer 1） |
| `value3` | string | 否 | 第三值（buffer 2），可选 |
| `signal` | string | 否 | 信号方向枚举，见下方说明 |
| `description` | string | 否 | 自然语言描述，AI 会直接引用此文本 |

### `timeframe` 枚举值

| 枚举值 | MT4 常量 | 含义 |
|--------|----------|------|
| `M1`  | `PERIOD_M1`  | 1 分钟 |
| `M5`  | `PERIOD_M5`  | 5 分钟 |
| `M15` | `PERIOD_M15` | 15 分钟 |
| `M30` | `PERIOD_M30` | 30 分钟 |
| `H1`  | `PERIOD_H1`  | 1 小时 |
| `H4`  | `PERIOD_H4`  | 4 小时 |
| `D1`  | `PERIOD_D1`  | 日线 |
| `W1`  | `PERIOD_W1`  | 周线 |
| `MN`  | `PERIOD_MN1` | 月线 |

### `signal` 枚举值

| 枚举值 | 含义 |
|--------|------|
| `buy` | 做多信号 |
| `sell` | 做空信号 |
| `neutral` | 中性，无明确方向 |
| `overbought` | 超买，注意回调风险 |
| `oversold` | 超卖，注意反弹机会 |

---

## 三、多时间框架推送方案

### 3.1 核心思路

MT4 的 `iCustom()` 函数支持跨时间框架读取任意指标的 buffer 值，语法为：

```mql4
double value = iCustom(symbol, timeframe, indicatorName, ...params, bufferIndex, barIndex);
```

其中 `timeframe` 可以是任意 `PERIOD_*` 常量，`barIndex = 1` 表示上一根**已完成**的 K 线（避免读取未完成的当前 K 线）。

### 3.2 推送时机设计

多时间框架推送有两种策略，根据你的指标类型选择：

**策略 A：统一定时推送（推荐，简单可靠）**

所有时间框架的指标值在同一个定时器触发时一次性读取并推送。例如每 15 分钟推送一次，包含 M15、H1、H4、D1 各时间框架的最新指标值。

**策略 B：按时间框架分别触发（精确，适合高频指标）**

- M1/M5 指标：每 5 分钟推送
- M15/M30 指标：每 15 分钟推送
- H1/H4 指标：每 1 小时推送
- D1/W1 指标：每 4 小时推送（日线指标每天只需更新几次）

### 3.3 推送频率建议

| 时间框架 | 建议推送间隔 | 原因 |
|----------|-------------|------|
| M1、M5 | 5 分钟 | 短周期变化快，但过于频繁意义不大 |
| M15、M30 | 15 分钟 | 与 K 线推送同步，保持一致性 |
| H1 | 30-60 分钟 | 小时线每小时更新一次 |
| H4 | 1-2 小时 | 4 小时线变化慢，无需频繁推送 |
| D1 | 4-8 小时 | 日线每天更新一次即可 |

---

## 四、在「交易体系」页面配置指标解读规则

推送指标数据后，还需要在网站的**交易体系 → 指标配置**页面告诉 AI 如何解读你的指标。这是让 AI 真正理解你的指标信号的关键步骤。

每个指标需要填写：

- **指标名称**：与 EA 推送的 `indicatorName` 完全一致（不含 `.ex4`）
- **显示名称**：AI 在分析中展示的友好名称，如「趋势杀手」
- **指标类型**：趋势型 / 震荡型 / 成交量型 / 自定义
- **解读规则**：用自然语言描述信号含义，例如：
  - `"value1 > 0 表示上涨趋势，value1 < 0 表示下跌趋势；value1 穿越零轴为趋势转换信号"`
  - `"value1 > 80 为超买，value1 < 20 为超卖；signal=buy 时配合趋势方向入场"`

---

## 五、完整 EA 代码示例

以下是支持多时间框架、多指标推送的完整 EA 代码，可直接替换或扩展现有的 `FXStreetBridge.mq4`。

### 5.1 单指标多时间框架推送示例

```mql4
//+------------------------------------------------------------------+
//| 自定义指标多时间框架推送示例                                         |
//| 将你的指标在 M15、H1、H4、D1 四个时间框架的值一次性推送到 AI 分析师   |
//+------------------------------------------------------------------+

// ── 在 EA 的 PushIndicators() 函数中添加以下代码 ──

void PushIndicators()
{
   // 要推送的时间框架列表
   int timeframes[4] = {PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
   string tfNames[4] = {"M15", "H1", "H4", "D1"};
   
   // 要推送的货币对（可以只推送部分，不必全部28个）
   string symbols[4] = {"EURUSD", "GBPUSD", "USDJPY", "XAUUSD"};
   
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";
   
   bool firstSignal = true;
   
   for(int s = 0; s < ArraySize(symbols); s++)
   {
      string sym = symbols[s];
      if(!SymbolSelect(sym, true)) continue;
      
      for(int t = 0; t < ArraySize(timeframes); t++)
      {
         int    tf     = timeframes[t];
         string tfName = tfNames[t];
         
         // ── 读取你的自定义指标 ──
         // 参数说明：iCustom(symbol, timeframe, "指标文件名", 参数1, 参数2, ..., buffer索引, K线索引)
         // barIndex=1 表示上一根已完成的K线，避免读取未完成的当前K线
         
         double mainValue   = iCustom(sym, tf, "TrendKiller", 14, 0, 1);  // buffer 0, bar 1
         double signalValue = iCustom(sym, tf, "TrendKiller", 14, 1, 1);  // buffer 1, bar 1
         
         // 跳过无效值（指标未加载或数据不足时返回 EMPTY_VALUE）
         if(mainValue == EMPTY_VALUE || mainValue == 0.0) continue;
         
         // 根据指标值判断信号方向
         string signalDir = "neutral";
         string desc = "";
         
         if(mainValue > 0 && mainValue > signalValue)
         {
            signalDir = "buy";
            desc = StringFormat("趋势向上，主线=%.5f 高于信号线=%.5f", mainValue, signalValue);
         }
         else if(mainValue < 0 && mainValue < signalValue)
         {
            signalDir = "sell";
            desc = StringFormat("趋势向下，主线=%.5f 低于信号线=%.5f", mainValue, signalValue);
         }
         else
         {
            desc = StringFormat("趋势不明，主线=%.5f，信号线=%.5f", mainValue, signalValue);
         }
         
         // 拼接 JSON
         if(!firstSignal) json += ",";
         firstSignal = false;
         
         json += "{";
         json += "\"symbol\":\"" + sym + "\",";
         json += "\"timeframe\":\"" + tfName + "\",";
         json += "\"indicatorName\":\"TrendKiller\",";
         json += "\"value1\":\"" + DoubleToString(mainValue, 5) + "\",";
         json += "\"value2\":\"" + DoubleToString(signalValue, 5) + "\",";
         json += "\"signal\":\"" + signalDir + "\",";
         json += "\"description\":\"" + desc + "\"";
         json += "}";
      }
   }
   
   json += "]}";
   
   // 发送到服务器
   SendHttpPost(ServerURL + "/api/mt4/indicators", json);
   
   if(EnableLogging)
      Print("[FXStreetBridge] 指标推送完成");
}
```

### 5.2 多指标同时推送示例

```mql4
//+------------------------------------------------------------------+
//| 多指标推送示例：同时推送趋势指标 + 震荡指标                           |
//+------------------------------------------------------------------+

void PushMultipleIndicators(string sym, int tf, string tfName, bool &firstSignal, string &json)
{
   int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   
   // ── 指标 1：趋势型（TrendKiller）──
   double tk_main   = iCustom(sym, tf, "TrendKiller", 14, 0, 1);
   double tk_signal = iCustom(sym, tf, "TrendKiller", 14, 1, 1);
   
   if(tk_main != EMPTY_VALUE)
   {
      string sig = (tk_main > 0 && tk_main > tk_signal) ? "buy" :
                   (tk_main < 0 && tk_main < tk_signal) ? "sell" : "neutral";
      string desc = StringFormat("[%s %s] TK主线=%.5f 信号线=%.5f", sym, tfName, tk_main, tk_signal);
      
      if(!firstSignal) json += ",";
      firstSignal = false;
      json += BuildSignalJson(sym, tfName, "TrendKiller",
                              DoubleToString(tk_main, 5),
                              DoubleToString(tk_signal, 5),
                              "", sig, desc);
   }
   
   // ── 指标 2：震荡型（MyRSI，自定义 RSI 变种）──
   double rsi_val = iCustom(sym, tf, "MyRSI", 14, 0, 1);
   
   if(rsi_val != EMPTY_VALUE)
   {
      string sig = (rsi_val > 70) ? "overbought" :
                   (rsi_val < 30) ? "oversold"   : "neutral";
      string desc = StringFormat("[%s %s] RSI=%.1f %s",
                                 sym, tfName, rsi_val,
                                 sig == "overbought" ? "超买区域" :
                                 sig == "oversold"   ? "超卖区域" : "中性区域");
      
      if(!firstSignal) json += ",";
      firstSignal = false;
      json += BuildSignalJson(sym, tfName, "MyRSI",
                              DoubleToString(rsi_val, 1),
                              "", "", sig, desc);
   }
   
   // ── 指标 3：均线系统（三均线排列）──
   double ma_fast = iMA(sym, tf, 20, 0, MODE_EMA, PRICE_CLOSE, 1);
   double ma_mid  = iMA(sym, tf, 50, 0, MODE_EMA, PRICE_CLOSE, 1);
   double ma_slow = iMA(sym, tf, 200, 0, MODE_SMA, PRICE_CLOSE, 1);
   double price   = iClose(sym, tf, 1);
   
   if(ma_fast > 0 && ma_mid > 0 && ma_slow > 0)
   {
      string sig = (ma_fast > ma_mid && ma_mid > ma_slow && price > ma_fast) ? "buy" :
                   (ma_fast < ma_mid && ma_mid < ma_slow && price < ma_fast) ? "sell" : "neutral";
      string desc = StringFormat("[%s %s] EMA20=%.%df EMA50=%.%df SMA200=%.%df 价格=%.%df",
                                 sym, tfName,
                                 digits, ma_fast, digits, ma_mid,
                                 digits, ma_slow, digits, price);
      
      if(!firstSignal) json += ",";
      firstSignal = false;
      json += BuildSignalJson(sym, tfName, "MA_System",
                              DoubleToString(ma_fast, digits),
                              DoubleToString(ma_mid, digits),
                              DoubleToString(ma_slow, digits),
                              sig, desc);
   }
}

// ── 辅助函数：构建单条信号 JSON ──
string BuildSignalJson(string sym, string tf, string name,
                       string v1, string v2, string v3,
                       string sig, string desc)
{
   string j = "{";
   j += "\"symbol\":\"" + sym + "\",";
   j += "\"timeframe\":\"" + tf + "\",";
   j += "\"indicatorName\":\"" + name + "\",";
   j += "\"value1\":\"" + v1 + "\",";
   if(StringLen(v2) > 0) j += "\"value2\":\"" + v2 + "\",";
   if(StringLen(v3) > 0) j += "\"value3\":\"" + v3 + "\",";
   j += "\"signal\":\"" + sig + "\",";
   j += "\"description\":\"" + desc + "\"";
   j += "}";
   return j;
}
```

---

## 六、AI 如何使用推送的指标数据

当你向 AI 分析师提问某个货币对时，系统会自动查询该货币对在所有时间框架下的最新指标信号，并注入系统 Prompt。AI 看到的上下文格式如下：

```
【自定义 MT4 指标实时信号】
趋势杀手: value1=0.00234, value2=-0.00110 | 解读规则: value1>0表示上涨趋势，穿越零轴为转换信号
趋势杀手: value1=-0.00089, value2=0.00045 | 解读规则: value1>0表示上涨趋势，穿越零轴为转换信号
```

**注意：** 目前 AI 上下文会展示该货币对所有时间框架的最新 20 条指标记录（按推送时间倒序），但不会自动区分时间框架标签。建议在 `description` 字段中明确包含时间框架信息（如上方示例中的 `[EURUSD H4]`），这样 AI 可以在分析中准确区分不同周期的信号。

---

## 七、常见问题

**Q：iCustom() 返回 EMPTY_VALUE（2147483647）怎么办？**

通常有三种原因：指标文件不在 MT4 的 `MQL4/Indicators/` 目录中；指标参数数量或类型与实际不符；该时间框架的历史数据不足。建议先在图表上手动加载指标确认正常运行后再通过 EA 读取。

**Q：跨时间框架读取时，H4 和 D1 的值是否实时更新？**

MT4 的跨时间框架数据存在缓存机制。当 EA 运行在 M15 图表上时，H4 和 D1 的数据不会在每个 M15 K 线关闭时立即刷新，而是依赖 MT4 内部的数据同步。为确保准确性，建议在 EA 中对高时间框架数据添加 `RefreshRates()` 调用，或将 EA 同时挂载在 H4 图表上。

**Q：能否推送标准内置指标（如 RSI、MACD）的值？**

完全可以。MT4 提供了 `iRSI()`、`iMACD()`、`iBands()` 等内置函数，无需 `iCustom()`。你可以将这些内置指标的值按同样格式推送，让 AI 使用你自己计算的参数版本，而非 Yahoo Finance API 提供的默认参数版本。

**Q：推送失败（HTTP 401）如何处理？**

检查 EA 参数中的 `ApiKey` 是否与服务器环境变量 `MT4_API_KEY` 一致。默认值为 `mt4-bridge-key-change-me`，建议在生产环境中修改为随机字符串并在服务器端同步更新。
