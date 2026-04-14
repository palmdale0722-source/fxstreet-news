//+------------------------------------------------------------------+
//|                                   FXStreetBridge_V4.5_Optimized.mq4 |
//|                                  28 Symbols x K线 + 4 Indicators  |
//|                                                                   |
//| 优化（V4.5 相对于 V4.4）：                                         |
//|  - ✅ 修复间歇性 5203 错误：合并多货币对数据到单个请求               |
//|    原因：V4.3/V4.4 为每个货币对发送独立请求，导致连接池耗尽          |
//|    优化：将 28 个货币对的数据合并到 1 个请求，减少 96% 的请求数      |
//|  - ✅ 添加请求间延迟：避免并发请求过多                             |
//|  - ✅ 增加超时时间：从 15 秒增加到 30 秒，应对大数据量              |
//|  - ✅ 添加重试机制：请求失败时自动重试（最多 3 次）                 |
//|  - ✅ 分批推送初始数据：不一次性推送 500 根 K 线                    |
//|                                                                   |
//| 保留 V4.4 全部功能：                                               |
//|  - TrendWave Enhanced：M15/H1/H4 三周期推送 → /api/mt4/tw          |
//|  - TrendFollower 信号推送 → /api/mt4/tf                            |
//|  - K 线推送 → /api/mt4/push（已优化为合并推送）                    |
//|  - AMA + SuperTrend 推送 → /api/mt4/indicators（已优化）           |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "4.5_Optimized"
#property strict

//--- 基础参数
input string ServerURL   = "http://fxstreetnews-cshx67nt.manus.space";  // 服务器根地址
input string ApiKey      = "mt4-bridge-key-change-me";                  // MT4_API_KEY
input string ClientId    = "mt4-client-01";                             // EA 实例标识
input int    HistoryBars = 500;                                         // K 线初始推送深度
input int    BatchSize   = 50;                                          // 初始化时每批推送的 K 线数
input int    RequestDelay = 500;                                        // 请求间延迟（毫秒）

//--- 指标文件名配置
input string Ind1_AMA = "ama";
input string Ind2_ST  = "SuperTrend_cci";
input string Ind3_TW  = "TrendWave_Enhanced";
input string Ind4_TF  = "trendfollowerv2";

//--- TrendWave 参数
input int TW_WavePeriod    = 10;
input int TW_AvgPeriod     = 21;
input int TW_KTI_T         = 10;
input int TW_KTI_M         = 5;
input int TW_KTI_N         = 10;
input int TW_ER_Period     = 21;
input int TW_ER_Lookback   = 180;
input double TW_BaseThresh = 50.0;
input double TW_DynRange   = 10.0;
input int TW_HistoryBars   = 100;

//--- TrendFollower 参数
input string TF_KTI_Name   = "KTI";
input int    TF_Kaufman_T  = 10;
input int    TF_Kaufman_M  = 5;
input int    TF_Kaufman_N  = 10;
input string TF_ST_Name    = "SuperTrend_CCI";
input int    TF_Super_CCI  = 50;
input int    TF_Super_ATR  = 5;
input int    TF_LookbackBars     = 7;
input int    TF_MaxBreakoutAge   = 15;
input int    TF_SetupLookbackOff = 5;
input int    TF_MinSignalInt     = 10;
input double TF_DistThreshold   = 1.0;
input double TF_FlatThreshPts   = 5.0;
input int    TF_ATR_Period       = 14;
input int    TF_HistoryBars      = 100;

// 28个标准货币对
string G8Symbols[28] = {
   "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
   "EURGBP","EURJPY","EURCHF","EURCAD","EURAUD","EURNZD",
   "GBPJPY","GBPCHF","GBPCAD","GBPAUD","GBPNZD",
   "CHFJPY","CADJPY","AUDJPY","NZDJPY",
   "AUDCAD","AUDCHF","AUDNZD","CADCHF","NZDCAD","NZDCHF"
};

// 全局状态
bool     g_is_first_run    = true;
datetime g_last_bar_m15    = 0;
datetime g_last_bar_h1     = 0;
datetime g_last_bar_h4     = 0;
int      g_init_batch_idx  = 0;  // 初始化时的批次索引

//+------------------------------------------------------------------+
int OnInit() {
   Print("[Bridge] V4.5_Optimized 启动，初始化推送中...");
   Print("[Bridge] 优化：合并多货币对数据到单个请求，减少 96% 的请求数");
   Print("[Bridge] 优化：添加请求重试机制和延迟控制");

   // 1. K 线历史推送（分批）
   PushAllBarsBatch(HistoryBars, BatchSize);

   // 2. AMA + SuperTrend 推送（合并）
   PushAllIndicatorsMerged();

   // 3. TrendWave 三周期历史推送
   PushTrendWaveBatch(PERIOD_M15, TW_HistoryBars);
   Sleep(RequestDelay);
   PushTrendWaveBatch(PERIOD_H1,  TW_HistoryBars);
   Sleep(RequestDelay);
   PushTrendWaveBatch(PERIOD_H4,  TW_HistoryBars);

   // 4. TrendFollower 历史信号推送
   PushTrendFollowerBatch(TF_HistoryBars);

   g_is_first_run = false;
   Print("[Bridge] V4.5_Optimized 初始化完成");
   return(INIT_SUCCEEDED);
}

void OnTick() {
   // ── M15 周期收盘 ──────────────────────────────────────────────
   datetime barM15 = iTime(Symbol(), PERIOD_M15, 0);
   if(barM15 != g_last_bar_m15 && !g_is_first_run) {
      PushAllBarsBatch(1, 1);
      Sleep(RequestDelay);
      PushAllIndicatorsMerged();
      Sleep(RequestDelay);
      PushTrendWaveBatch(PERIOD_M15, 1);
      Sleep(RequestDelay);
      PushTrendFollowerBatch(1);
      g_last_bar_m15 = barM15;
   }

   // ── H1 周期收盘 ───────────────────────────────────────────────
   datetime barH1 = iTime(Symbol(), PERIOD_H1, 0);
   if(barH1 != g_last_bar_h1 && !g_is_first_run) {
      PushTrendWaveBatch(PERIOD_H1, 1);
      Sleep(RequestDelay);
      g_last_bar_h1 = barH1;
   }

   // ── H4 周期收盘 ───────────────────────────────────────────────
   datetime barH4 = iTime(Symbol(), PERIOD_H4, 0);
   if(barH4 != g_last_bar_h4 && !g_is_first_run) {
      PushTrendWaveBatch(PERIOD_H4, 1);
      Sleep(RequestDelay);
      g_last_bar_h4 = barH4;
   }

   if(g_is_first_run) {
      g_last_bar_m15 = barM15;
      g_last_bar_h1  = barH1;
      g_last_bar_h4  = barH4;
   }
}

//+------------------------------------------------------------------+
//| ★ 优化：合并 K 线数据推送（所有货币对合并为 1 个请求）              |
//+------------------------------------------------------------------+
void PushAllBarsBatch(int barsCount, int batchSize) {
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"timeframe\":\"M15\",";
   json += "\"bars\":[";

   bool firstBar = true;
   int  total    = 0;

   for(int s = 0; s < 28; s++) {
      string sym = G8Symbols[s];
      if(!SymbolSelect(sym, true)) continue;

      int available = iBars(sym, PERIOD_M15);
      int fetch = MathMin(barsCount, available - 1);
      if(fetch <= 0) continue;

      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      for(int i = fetch; i >= 1; i--) {
         datetime bTime = iTime(sym, PERIOD_M15, i);
         if(bTime == 0) continue;

         string ts = TimeToStr(bTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(ts, 0, 4) + "-" +
                          StringSubstr(ts, 5, 2) + "-" +
                          StringSubstr(ts, 8, 2) + "T" +
                          StringSubstr(ts, 11, 5) + ":00Z";

         if(!firstBar) json += ",";
         firstBar = false;

         json += "{";
         json += "\"symbol\":\""  + sym + "\",";
         json += "\"barTime\":\"" + isoTime + "\",";
         json += "\"open\":\""    + DoubleToString(iOpen(sym,  PERIOD_M15, i), digits) + "\",";
         json += "\"high\":\""    + DoubleToString(iHigh(sym,  PERIOD_M15, i), digits) + "\",";
         json += "\"low\":\""     + DoubleToString(iLow(sym,   PERIOD_M15, i), digits) + "\",";
         json += "\"close\":\""   + DoubleToString(iClose(sym, PERIOD_M15, i), digits) + "\",";
         json += "\"volume\":\""  + IntegerToString(iVolume(sym, PERIOD_M15, i)) + "\",";
         json += "\"spread\":"    + IntegerToString((int)SymbolInfoInteger(sym, SYMBOL_SPREAD));
         json += "}";
         total++;

         // 分批发送
         if(total % (batchSize * 28) == 0) {
            json += "]}";
            Print("[Bridge] 推送 K 线: ", total, " 条");
            SendRequestWithRetry(ServerURL + "/api/mt4/push", json, 3);
            Sleep(RequestDelay);
            json = "{\"clientId\":\"" + ClientId + "\",\"timeframe\":\"M15\",\"bars\":[";
            firstBar = true;
            total = 0;
         }
      }
   }

   if(total > 0) {
      json += "]}";
      Print("[Bridge] 推送 K 线: ", total, " 条");
      SendRequestWithRetry(ServerURL + "/api/mt4/push", json, 3);
   }
}

//+------------------------------------------------------------------+
//| ★ 优化：合并 AMA + SuperTrend 推送（所有货币对合并为 1 个请求）     |
//+------------------------------------------------------------------+
void PushAllIndicatorsMerged() {
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";

   bool firstSig = true;
   int  total    = 0;

   for(int s = 0; s < 28; s++) {
      string sym = G8Symbols[s];
      if(!SymbolSelect(sym, true)) continue;

      // --- 1. AMA (9,2,30) → Buffer 0 ---
      double val_ama = iCustom(sym, PERIOD_M15, Ind1_AMA, 9, 2, 30, 2, 2, 0, 1);
      if(val_ama != EMPTY_VALUE && val_ama < 100000) {
         if(!firstSig) json += ","; firstSig = false;
         json += "{";
         json += "\"symbol\":\""        + sym        + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"indicatorName\":\"" + Ind1_AMA   + "\",";
         json += "\"value1\":\""        + DoubleToString(val_ama, 5) + "\",";
         json += "\"signal\":\""        + (val_ama > iClose(sym,PERIOD_M15,1) ? "buy" : "sell") + "\",";
         json += "\"description\":\"AMA=" + DoubleToString(val_ama,5) + " on " + sym + "\"";
         json += "}";
         total++;
      }

      // --- 2. SuperTrend_CCI (50,1,5) → Buffer 0 ---
      double val_st = iCustom(sym, PERIOD_M15, Ind2_ST, 50, 1, 5, 0, 1);
      if(val_st != EMPTY_VALUE && val_st < 100000) {
         if(!firstSig) json += ","; firstSig = false;
         json += "{";
         json += "\"symbol\":\""        + sym       + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"indicatorName\":\"" + Ind2_ST   + "\",";
         json += "\"value1\":\""        + DoubleToString(val_st, 5) + "\",";
         json += "\"signal\":\""        + (iClose(sym,PERIOD_M15,1) > val_st ? "buy" : "sell") + "\",";
         json += "\"description\":\"SuperTrend=" + DoubleToString(val_st,5) + " on " + sym + "\"";
         json += "}";
         total++;
      }
   }

   json += "]}";

   if(total > 0) {
      Print("[Bridge] 推送 AMA+ST 指标: ", total, " 条（1 个合并请求）");
      SendRequestWithRetry(ServerURL + "/api/mt4/indicators", json, 3);
   }
}

//+------------------------------------------------------------------+
//| ★ 优化：TrendWave 分批推送                                        |
//+------------------------------------------------------------------+
void PushTrendWaveBatch(int period, int barsCount) {
   string tfStr;
   if(period == PERIOD_M15)     tfStr = "M15";
   else if(period == PERIOD_H1) tfStr = "H1";
   else if(period == PERIOD_H4) tfStr = "H4";
   else return;

   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"rows\":[";

   bool firstRow = true;
   int  total    = 0;

   for(int s = 0; s < 28; s++) {
      string sym = G8Symbols[s];
      if(!SymbolSelect(sym, true)) continue;

      int available = iBars(sym, period);
      int fetch = MathMin(barsCount, available - 1);
      if(fetch <= 0) continue;

      for(int i = fetch; i >= 1; i--) {
         datetime bTime = iTime(sym, period, i);
         if(bTime == 0) continue;

         double bull = iCustom(sym, period, Ind3_TW,
                               TW_WavePeriod, TW_AvgPeriod,
                               false, false,
                               TW_KTI_T, TW_KTI_M, TW_KTI_N,
                               TW_ER_Period, TW_ER_Lookback,
                               TW_BaseThresh, TW_DynRange,
                               4, i);
         double bear = iCustom(sym, period, Ind3_TW,
                               TW_WavePeriod, TW_AvgPeriod,
                               false, false,
                               TW_KTI_T, TW_KTI_M, TW_KTI_N,
                               TW_ER_Period, TW_ER_Lookback,
                               TW_BaseThresh, TW_DynRange,
                               5, i);
         double threshold = iCustom(sym, period, Ind3_TW,
                                    TW_WavePeriod, TW_AvgPeriod,
                                    false, false,
                                    TW_KTI_T, TW_KTI_M, TW_KTI_N,
                                    TW_ER_Period, TW_ER_Lookback,
                                    TW_BaseThresh, TW_DynRange,
                                    10, i);

         if(bull == EMPTY_VALUE || bear == EMPTY_VALUE) continue;

         string ts = TimeToStr(bTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(ts, 0, 4) + "-" +
                          StringSubstr(ts, 5, 2) + "-" +
                          StringSubstr(ts, 8, 2) + "T" +
                          StringSubstr(ts, 11, 5) + ":00Z";

         if(!firstRow) json += ",";
         firstRow = false;

         json += "{";
         json += "\"symbol\":\""    + sym     + "\",";
         json += "\"timeframe\":\"" + tfStr   + "\",";
         json += "\"barTime\":\""   + isoTime + "\",";
         json += "\"bull\":\""      + DoubleToString(bull, 5) + "\",";
         json += "\"bear\":\""      + DoubleToString(bear, 5) + "\"";
         if(threshold != EMPTY_VALUE && threshold > 0)
            json += ",\"threshold\":\"" + DoubleToString(threshold, 5) + "\"";
         json += "}";
         total++;
      }
   }

   if(total > 0) {
      json += "]}";
      Print("[Bridge] 推送 TrendWave ", tfStr, ": ", total, " 条");
      SendRequestWithRetry(ServerURL + "/api/mt4/tw", json, 3);
   } else {
      Print("[Bridge] TrendWave ", tfStr, " 无有效数据");
   }
}

//+------------------------------------------------------------------+
//| ★ 优化：TrendFollower 分批推送                                    |
//+------------------------------------------------------------------+
void PushTrendFollowerBatch(int barsCount) {
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";

   bool firstSig = true;
   int  total    = 0;

   for(int s = 0; s < 28; s++) {
      string sym = G8Symbols[s];
      if(!SymbolSelect(sym, true)) continue;

      int available = iBars(sym, PERIOD_M15);
      int fetch = MathMin(barsCount, available - 1);
      if(fetch <= 0) continue;

      for(int i = fetch; i >= 1; i--) {
         datetime bTime = iTime(sym, PERIOD_M15, i);
         if(bTime == 0) continue;

         double sig = iCustom(sym, PERIOD_M15, Ind4_TF,
                              TF_KTI_Name, TF_Kaufman_T, TF_Kaufman_M, TF_Kaufman_N,
                              TF_ST_Name, TF_Super_CCI, 0, TF_Super_ATR, 0,
                              TF_LookbackBars, TF_MaxBreakoutAge, TF_SetupLookbackOff,
                              TF_MinSignalInt, TF_DistThreshold, TF_FlatThreshPts, TF_ATR_Period,
                              false, false, false,
                              0, i);

         if(sig == EMPTY_VALUE || sig == 0.0) continue;

         string direction = (sig > 0) ? "buy" : "sell";

         string ts = TimeToStr(bTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(ts, 0, 4) + "-" +
                          StringSubstr(ts, 5, 2) + "-" +
                          StringSubstr(ts, 8, 2) + "T" +
                          StringSubstr(ts, 11, 5) + ":00Z";

         if(!firstSig) json += ",";
         firstSig = false;

         json += "{";
         json += "\"symbol\":\""    + sym       + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"barTime\":\""   + isoTime   + "\",";
         json += "\"signal\":\""    + direction + "\"";
         json += "}";
         total++;
      }
   }

   json += "]}";

   if(total > 0) {
      Print("[Bridge] 推送 TrendFollower 信号: ", total, " 条");
      SendRequestWithRetry(ServerURL + "/api/mt4/tf", json, 3);
   } else {
      Print("[Bridge] TrendFollower 无信号");
   }
}

//+------------------------------------------------------------------+
//| ★ 新增：带重试机制的 HTTP POST 请求（修复间歇性 5203 错误）        |
//+------------------------------------------------------------------+
void SendRequestWithRetry(string url, string body, int maxRetries) {
   for(int attempt = 1; attempt <= maxRetries; attempt++) {
      char   postData[];
      char   resultData[];
      string resultHeaders;

      StringToCharArray(body, postData, 0, StringLen(body));

      string headers = "Content-Type: application/json\r\n";
      headers += "X-MT4-API-Key: " + ApiKey + "\r\n";

      ResetLastError();
      int res = WebRequest("POST", url, headers, 30000, postData, resultData, resultHeaders);

      if(res == -1) {
         int err = GetLastError();
         if(attempt < maxRetries && (err == 5203 || err == 4060)) {
            Print("[Bridge] 请求失败（尝试 ", attempt, "/", maxRetries, "）→ ", url, 
                  " | 错误码: ", err, " | 1 秒后重试...");
            Sleep(1000);
            continue;
         } else {
            Print("[Bridge] 请求失败（最终）→ ", url, " | 错误码: ", err);
            if(err == 5203) {
               Print("[Bridge] ⚠️ 5203 错误：请检查 MT4 白名单设置");
               Print("[Bridge]    工具 → 选项 → 服务器 → 添加 fxstreetnews-cshx67nt.manus.space");
            }
            return;
         }
      } else {
         string resp = CharArrayToString(resultData);
         Print("[Bridge] 推送成功 → ", url, " | HTTP: ", res, " | 响应: ", StringSubstr(resp, 0, 100));
         return;
      }
   }
}
//+------------------------------------------------------------------+
