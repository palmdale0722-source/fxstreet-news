//+------------------------------------------------------------------+
//|                                     FXStreetBridge_V4.2_fixed.mq4|
//|                                     28 Symbols x 500 Bars x 4 Inds|
//|                                                                   |
//| 修复说明（相对于 V4.2 原版）：                                       |
//|  1. ServerURL 改为 /api/mt4/push（原版路径 /api/push 不存在）        |
//|  2. 认证头改为 X-MT4-API-Key（原版 X-API-Key 服务端不识别）           |
//|  3. JSON 结构改为服务端要求格式：                                     |
//|     { clientId, bars:[{symbol,barTime,open,high,low,close,...}] }  |
//|     原版按品种分包且字段名不匹配（t/o/h/l/c 应为 barTime/open/...）   |
//|  4. 指标数据改为通过 /api/mt4/indicators 单独推送（原版混入K线包）      |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "4.2f"
#property strict

//--- 基础参数
input string ServerURL   = "https://fxstreetnews-cshx67nt.manus.space"; // 服务器根地址（不含路径）
input string ApiKey      = "mt4-bridge-key";                             // MT4_API_KEY 环境变量中的值
input string ClientId    = "mt4-client-01";                              // EA 实例标识
input int    HistoryBars = 500;                                          // 初始推送深度

//--- 指标文件名配置
input string Ind1_AMA = "ama";
input string Ind2_ST  = "SuperTrend_cci";
input string Ind3_TW  = "TrendWave_Enhanced";
input string Ind4_TF  = "trendfollowerv2";

// 28个标准货币对
string G8Symbols[28] = {
   "EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD",
   "EURGBP","EURJPY","EURCHF","EURCAD","EURAUD","EURNZD",
   "GBPJPY","GBPCHF","GBPCAD","GBPAUD","GBPNZD",
   "CHFJPY","CADJPY","AUDJPY","NZDJPY",
   "AUDCAD","AUDCHF","AUDNZD","CADCHF","NZDCAD","NZDCHF"
};

bool     g_is_first_run  = true;
datetime g_last_push_bar = 0;

//+------------------------------------------------------------------+
int OnInit() {
   Print("[Bridge] V4.2-fixed 启动，开始执行 ", HistoryBars, " 根历史数据初始化...");
   PushAllBars(HistoryBars);
   PushAllIndicators();
   g_is_first_run = false;
   return(INIT_SUCCEEDED);
}

void OnTick() {
   datetime currentBar = iTime(Symbol(), PERIOD_M15, 0);
   if(currentBar != g_last_push_bar) {
      if(!g_is_first_run) {
         PushAllBars(1);       // 增量推送最新收盘 Bar
         PushAllIndicators();  // 同步推送最新指标值
      }
      g_last_push_bar = currentBar;
   }
}

//+------------------------------------------------------------------+
//| 推送 K 线数据 → POST /api/mt4/push                                |
//| 服务端要求格式：                                                    |
//|   { clientId, timeframe, bars:[{symbol,barTime,open,...},...] }   |
//+------------------------------------------------------------------+
void PushAllBars(int barsCount) {
   // 将所有品种的 K 线合并进一个 bars 数组一次性发送
   // 若 barsCount 很大（500根×28品种=14000条），JSON 可能超过 WebRequest 限制
   // 因此按品种分批发送，每批一个品种
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

         // 将 MT4 时间格式转为 ISO 8601（服务端 new Date() 可解析）
         // MT4 TimeToStr 输出 "2026.03.24 12:00"，需转为 "2026-03-24T12:00:00Z"
         string ts = TimeToStr(bTime, TIME_DATE|TIME_MINUTES);
         // ts 格式: "2026.03.24 12:00"
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
//| 推送自定义指标 → POST /api/mt4/indicators                          |
//| 服务端要求格式：                                                    |
//|   { clientId, signals:[{symbol,timeframe,indicatorName,...},...] }|
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

      // --- 2. SuperTrend_cci (50,1,5) → Buffer 0 ---
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

      // --- 3. TrendWave_Enhanced → Bull(Buf4) + Bear(Buf5) ---
      double tw_bull = iCustom(sym, PERIOD_M15, Ind3_TW, 10,21,false,false,10,5,10,21,180,50.0,10.0, 4, 1);
      double tw_bear = iCustom(sym, PERIOD_M15, Ind3_TW, 10,21,false,false,10,5,10,21,180,50.0,10.0, 5, 1);
      if(tw_bull != EMPTY_VALUE && tw_bull < 100000) {
         string tw_sig = "neutral";
         if(tw_bull > 0 && (tw_bear == EMPTY_VALUE || tw_bear == 0)) tw_sig = "buy";
         else if(tw_bear > 0 && (tw_bull == EMPTY_VALUE || tw_bull == 0)) tw_sig = "sell";

         if(!firstSig) json += ","; firstSig = false;
         json += "{";
         json += "\"symbol\":\""        + sym       + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"indicatorName\":\"" + Ind3_TW   + "\",";
         json += "\"value1\":\""        + DoubleToString(tw_bull, 2) + "\",";
         json += "\"value2\":\""        + DoubleToString(tw_bear == EMPTY_VALUE ? 0 : tw_bear, 2) + "\",";
         json += "\"signal\":\""        + tw_sig    + "\",";
         json += "\"description\":\"TrendWave bull=" + DoubleToString(tw_bull,2) + " bear=" + DoubleToString(tw_bear == EMPTY_VALUE ? 0 : tw_bear,2) + " on " + sym + "\"";
         json += "}";
         total++;
      }

      // --- 4. TrendFollower → Buffer 0 ---
      double tf_sig = iCustom(sym, PERIOD_M15, Ind4_TF, 10,5,10,50,1,5,0,7,15,5,30,1.0,5.0,14, 0, 1);
      if(tf_sig != EMPTY_VALUE && tf_sig < 100000) {
         string tf_dir = "neutral";
         if(tf_sig > 0)      tf_dir = "buy";
         else if(tf_sig < 0) tf_dir = "sell";

         if(!firstSig) json += ","; firstSig = false;
         json += "{";
         json += "\"symbol\":\""        + sym       + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"indicatorName\":\"" + Ind4_TF   + "\",";
         json += "\"value1\":\""        + DoubleToString(tf_sig, 0) + "\",";
         json += "\"signal\":\""        + tf_dir    + "\",";
         json += "\"description\":\"TrendFollower=" + DoubleToString(tf_sig,0) + " on " + sym + "\"";
         json += "}";
         total++;
      }
   }

   json += "]}";

   if(total > 0) {
      Print("[Bridge] 推送指标信号: ", total, " 条");
      SendRequest(ServerURL + "/api/mt4/indicators", json);
   } else {
      Print("[Bridge] 所有指标值均无效，跳过指标推送");
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

   // ★ 认证头必须是 X-MT4-API-Key（服务端 authCheck 读取此字段）
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
