//+------------------------------------------------------------------+
//|                                          FXStreetBridge_V4.3.mq4 |
//|                                  28 Symbols x K线 + 4 Indicators  |
//|                                                                   |
//| 新增（V4.3 相对于 V4.2_fixed）：                                    |
//|  - TrendWave Enhanced：M15/H1/H4 三周期 Bull/Bear/Threshold 时间   |
//|    序列推送 → /api/mt4/tw                                          |
//|    各周期仅在对应 K 线收盘时推送，减少 CPU 压力                       |
//|    初始化时推送 100 根历史，之后每次增量推送最新 1 根                  |
//|  - TrendFollower：M15 SignalBuffer 历史信号推送 → /api/mt4/tf       |
//|    只推非 0 值（buy/sell），跳过 0                                   |
//|    初始化时推送 100 根历史，之后每次增量推送最新 1 根                  |
//|                                                                   |
//| 保留不变：                                                          |
//|  - K 线推送 → /api/mt4/push                                        |
//|  - AMA + SuperTrend 推送 → /api/mt4/indicators                    |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "4.3"
#property strict

//--- 基础参数
input string ServerURL   = "https://fxstreetnews-cshx67nt.manus.space"; // 服务器根地址（不含路径）
input string ApiKey      = "mt4-bridge-key";                             // MT4_API_KEY 环境变量中的值
input string ClientId    = "mt4-client-01";                              // EA 实例标识
input int    HistoryBars = 500;                                          // K 线初始推送深度

//--- 指标文件名配置
input string Ind1_AMA = "ama";
input string Ind2_ST  = "SuperTrend_CCI";
input string Ind3_TW  = "TrendWave_Enhanced";
input string Ind4_TF  = "Trend_Follower_Optimized";

//--- TrendWave 参数（与指标源码默认值一致）
input int TW_WavePeriod    = 10;
input int TW_AvgPeriod     = 21;
input int TW_KTI_T         = 10;
input int TW_KTI_M         = 5;
input int TW_KTI_N         = 10;
input int TW_ER_Period     = 21;
input int TW_ER_Lookback   = 180;
input double TW_BaseThresh = 50.0;
input double TW_DynRange   = 10.0;
input int TW_HistoryBars   = 100;   // TrendWave 历史推送深度

//--- TrendFollower 参数（与指标源码默认值一致）
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
input int    TF_HistoryBars      = 100;  // TrendFollower 历史推送深度

// 28个标准货币对
string G8Symbols[28] = {
   "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
   "EURGBP","EURJPY","EURCHF","EURCAD","EURAUD","EURNZD",
   "GBPJPY","GBPCHF","GBPCAD","GBPAUD","GBPNZD",
   "CHFJPY","CADJPY","AUDJPY","NZDJPY",
   "AUDCAD","AUDCHF","AUDNZD","CADCHF","NZDCAD","NZDCHF"
};

// 各周期最后推送时间（用于判断是否需要增量推送）
bool     g_is_first_run    = true;
datetime g_last_bar_m15    = 0;   // K线 + AMA + ST + TW_M15 + TF
datetime g_last_bar_h1     = 0;   // TW_H1
datetime g_last_bar_h4     = 0;   // TW_H4

//+------------------------------------------------------------------+
int OnInit() {
   Print("[Bridge] V4.3 启动，初始化推送中...");

   // 1. K 线历史推送
   PushAllBars(HistoryBars);

   // 2. AMA + SuperTrend 推送（当前值）
   PushAllIndicators();

   // 3. TrendWave 三周期历史推送
   PushTrendWave(PERIOD_M15, TW_HistoryBars);
   PushTrendWave(PERIOD_H1,  TW_HistoryBars);
   PushTrendWave(PERIOD_H4,  TW_HistoryBars);

   // 4. TrendFollower 历史信号推送
   PushTrendFollower(TF_HistoryBars);

   g_is_first_run = false;
   Print("[Bridge] V4.3 初始化完成");
   return(INIT_SUCCEEDED);
}

void OnTick() {
   // ── M15 周期收盘 ──────────────────────────────────────────────
   datetime barM15 = iTime(Symbol(), PERIOD_M15, 0);
   if(barM15 != g_last_bar_m15 && !g_is_first_run) {
      PushAllBars(1);
      PushAllIndicators();
      PushTrendWave(PERIOD_M15, 1);
      PushTrendFollower(1);
      g_last_bar_m15 = barM15;
   }

   // ── H1 周期收盘 ───────────────────────────────────────────────
   datetime barH1 = iTime(Symbol(), PERIOD_H1, 0);
   if(barH1 != g_last_bar_h1 && !g_is_first_run) {
      PushTrendWave(PERIOD_H1, 1);
      g_last_bar_h1 = barH1;
   }

   // ── H4 周期收盘 ───────────────────────────────────────────────
   datetime barH4 = iTime(Symbol(), PERIOD_H4, 0);
   if(barH4 != g_last_bar_h4 && !g_is_first_run) {
      PushTrendWave(PERIOD_H4, 1);
      g_last_bar_h4 = barH4;
   }

   // 初始化时记录当前 Bar 时间，避免 OnInit 后立即触发增量推送
   if(g_is_first_run) {
      g_last_bar_m15 = barM15;
      g_last_bar_h1  = barH1;
      g_last_bar_h4  = barH4;
   }
}

//+------------------------------------------------------------------+
//| ★ 保留不变：推送 K 线数据 → POST /api/mt4/push                    |
//+------------------------------------------------------------------+
void PushAllBars(int barsCount) {
   for(int s = 0; s < 28; s++) {
      string sym = G8Symbols[s];
      if(!SymbolSelect(sym, true)) continue;

      int available = iBars(sym, PERIOD_M15);
      int fetch = MathMin(barsCount, available - 1);
      if(fetch <= 0) continue;

      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      string json = "{";
      json += "\"clientId\":\"" + ClientId + "\",";
      json += "\"timeframe\":\"M15\",";
      json += "\"bars\":[";

      bool firstBar = true;
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
      }

      json += "]}";
      SendRequest(ServerURL + "/api/mt4/push", json);
   }
}

//+------------------------------------------------------------------+
//| ★ 保留不变：推送 AMA + SuperTrend → POST /api/mt4/indicators      |
//+------------------------------------------------------------------+
void PushAllIndicators() {
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
      Print("[Bridge] 推送 AMA+ST 指标: ", total, " 条");
      SendRequest(ServerURL + "/api/mt4/indicators", json);
   }
}

//+------------------------------------------------------------------+
//| 新增：推送 TrendWave Bull/Bear/Threshold → POST /api/mt4/tw       |
//| period: PERIOD_M15 / PERIOD_H1 / PERIOD_H4                       |
//| barsCount: 推送最近 N 根 K 线的数值（初始化 100，增量 1）            |
//+------------------------------------------------------------------+
void PushTrendWave(int period, int barsCount) {
   string tfStr;
   if(period == PERIOD_M15)     tfStr = "M15";
   else if(period == PERIOD_H1) tfStr = "H1";
   else if(period == PERIOD_H4) tfStr = "H4";
   else return;

   // 构建大 JSON，所有品种合并为一个 rows 数组
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

         // TrendWave Buffer 4 = Bull, Buffer 5 = Bear, Buffer 10 = sell_threshold（正值即为阈值）
         double bull = iCustom(sym, period, Ind3_TW,
                               TW_WavePeriod, TW_AvgPeriod,
                               false, false,          // SoundAlert, EmailAlert
                               TW_KTI_T, TW_KTI_M, TW_KTI_N,
                               TW_ER_Period, TW_ER_Lookback,
                               TW_BaseThresh, TW_DynRange,
                               4, i);                 // Buffer 4 = Bull
         double bear = iCustom(sym, period, Ind3_TW,
                               TW_WavePeriod, TW_AvgPeriod,
                               false, false,
                               TW_KTI_T, TW_KTI_M, TW_KTI_N,
                               TW_ER_Period, TW_ER_Lookback,
                               TW_BaseThresh, TW_DynRange,
                               5, i);                 // Buffer 5 = Bear
         double thresh = iCustom(sym, period, Ind3_TW,
                               TW_WavePeriod, TW_AvgPeriod,
                               false, false,
                               TW_KTI_T, TW_KTI_M, TW_KTI_N,
                               TW_ER_Period, TW_ER_Lookback,
                               TW_BaseThresh, TW_DynRange,
                               10, i);                // Buffer 10 = sell_threshold（正值）

         // 过滤无效值
         if(bull == EMPTY_VALUE || MathAbs(bull) > 1000) continue;
         if(bear == EMPTY_VALUE || MathAbs(bear) > 1000) continue;

         string ts = TimeToStr(bTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(ts, 0, 4) + "-" +
                          StringSubstr(ts, 5, 2) + "-" +
                          StringSubstr(ts, 8, 2) + "T" +
                          StringSubstr(ts, 11, 5) + ":00Z";

         if(!firstRow) json += ",";
         firstRow = false;

         json += "{";
         json += "\"symbol\":\""    + sym    + "\",";
         json += "\"timeframe\":\"" + tfStr  + "\",";
         json += "\"barTime\":\""   + isoTime + "\",";
         json += "\"bull\":\""      + DoubleToString(bull, 4)   + "\",";
         json += "\"bear\":\""      + DoubleToString(bear, 4)   + "\",";
         json += "\"threshold\":\"" + DoubleToString(thresh == EMPTY_VALUE ? TW_BaseThresh : thresh, 4) + "\"";
         json += "}";
         total++;

         // 每 500 条发送一次，防止 JSON 过大
         if(total % 500 == 0) {
            json += "]}";
            SendRequest(ServerURL + "/api/mt4/tw", json);
            // 重置 JSON
            json = "{";
            json += "\"clientId\":\"" + ClientId + "\",";
            json += "\"rows\":[";
            firstRow = true;
         }
      }
   }

   json += "]}";

   if(total % 500 != 0 && total > 0) {
      Print("[Bridge] 推送 TrendWave ", tfStr, ": ", total % 500, " 条");
      SendRequest(ServerURL + "/api/mt4/tw", json);
   } else if(total == 0) {
      Print("[Bridge] TrendWave ", tfStr, " 无有效数据，跳过推送");
   }
}

//+------------------------------------------------------------------+
//| 新增：推送 TrendFollower 信号 → POST /api/mt4/tf                  |
//| 只推 SignalBuffer != 0 的 Bar（buy=1.0, sell=-1.0）               |
//+------------------------------------------------------------------+
void PushTrendFollower(int barsCount) {
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

         // TrendFollower Buffer 0 = SignalBuffer (1.0 / -1.0 / 0.0)
         double sig = iCustom(sym, PERIOD_M15, Ind4_TF,
                              // KaufmanSettings
                              TF_KTI_Name, TF_Kaufman_T, TF_Kaufman_M, TF_Kaufman_N,
                              // SupertrendSettings
                              TF_ST_Name, TF_Super_CCI, 0 /*PRICE_TYPICAL*/, TF_Super_ATR, 0 /*ST_ValueBuffer*/,
                              // FilterSettings
                              TF_LookbackBars, TF_MaxBreakoutAge, TF_SetupLookbackOff,
                              TF_MinSignalInt, TF_DistThreshold, TF_FlatThreshPts, TF_ATR_Period,
                              // NotificationSettings
                              false, false, false,
                              // Buffer index
                              0, i);

         // 只推非 0 信号
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
      SendRequest(ServerURL + "/api/mt4/tf", json);
   } else {
      Print("[Bridge] TrendFollower 无信号，跳过推送");
   }
}

//+------------------------------------------------------------------+
//| 发送 HTTP POST 请求                                               |
//+------------------------------------------------------------------+
void SendRequest(string url, string body) {
   char   postData[];
   char   resultData[];
   string resultHeaders;

   StringToCharArray(body, postData, 0, StringLen(body));

   string headers = "Content-Type: application/json\r\n";
   headers += "X-MT4-API-Key: " + ApiKey + "\r\n";

   ResetLastError();
   int res = WebRequest("POST", url, headers, 15000, postData, resultData, resultHeaders);

   if(res == -1) {
      int err = GetLastError();
      Print("[Bridge] 请求失败 → ", url, " | 错误码: ", err,
            (err == 4060 ? " (未在MT4白名单中添加该域名)" : ""));
   } else {
      string resp = CharArrayToString(resultData);
      Print("[Bridge] 推送成功 → ", url, " | HTTP: ", res, " | 响应: ", StringSubstr(resp, 0, 120));
   }
}
//+------------------------------------------------------------------+
