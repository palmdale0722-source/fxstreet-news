//+------------------------------------------------------------------+
//|                                           FXStreetBridge.mq4     |
//|                         FXStreet AI 分析师 - MT4 数据推送桥         |
//|                                                                  |
//| 功能：每15分钟将28个G8货币对的M15行情数据 + 自定义技术指标推送到服务端  |
//|                                                                  |
//| 安装说明：                                                         |
//|   1. 将此文件复制到 MT4 的 MQL4/Experts/ 目录                      |
//|   2. 将你的自定义指标 .ex4 文件放入 MT4 的 MQL4/Indicators/ 目录    |
//|   3. 在 MT4 中编译此 EA（F7）                                      |
//|   4. 将 EA 拖到任意图表上运行（推荐 EURUSD M15 图表）               |
//|   5. 在 EA 参数中填入 ServerURL 和 ApiKey                          |
//|   6. 在参数中填写你的自定义指标文件名（不含 .ex4）                    |
//|   7. 确保 MT4 允许 EA 发起 HTTP 请求                               |
//|      （工具 → 选项 → 智能交易系统 → 允许 WebRequest，添加服务器域名）  |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "2.0"
#property strict

//--- ═══════════════════════════════════════════════════════════════
//    基础连接参数
//--- ═══════════════════════════════════════════════════════════════
input string ServerURL  = "https://YOUR_SITE_URL";    // 服务器地址（替换为你的网站域名）
input string ApiKey     = "mt4-bridge-key-change-me"; // API 密钥（与网站后台一致）
input string ClientId   = "mt4-client-01";            // EA 实例标识（多个MT4时区分用）
input int    PushIntervalMinutes = 15;                // 推送间隔（分钟）
input int    BarsToSend = 100;                        // 每次推送的K线数量（最多200）
input bool   EnableLogging = true;                    // 是否输出日志

//--- ═══════════════════════════════════════════════════════════════
//    自定义指标配置
//    说明：最多支持 5 个自定义指标，每个指标可读取 3 个 Buffer 值
//    IndicatorN_Name  : 指标文件名（不含 .ex4），留空则跳过该指标
//    IndicatorN_Params: 指标参数，多个参数用英文逗号分隔，如 "14,3,3"
//                       留空则使用指标默认参数
//    IndicatorN_Buf0  : 主 Buffer 索引（通常为 0）
//    IndicatorN_Buf1  : 副 Buffer 索引（-1 表示不读取）
//    IndicatorN_Buf2  : 第三 Buffer 索引（-1 表示不读取）
//--- ═══════════════════════════════════════════════════════════════

// ── 指标 1 ──────────────────────────────────────────────────────
input string Indicator1_Name   = "";          // 指标1文件名（如 MyRSI）
input string Indicator1_Params = "";          // 指标1参数（如 14）
input int    Indicator1_Buf0   = 0;           // 指标1 主Buffer索引
input int    Indicator1_Buf1   = -1;          // 指标1 副Buffer索引（-1不读）
input int    Indicator1_Buf2   = -1;          // 指标1 第三Buffer索引（-1不读）

// ── 指标 2 ──────────────────────────────────────────────────────
input string Indicator2_Name   = "";          // 指标2文件名
input string Indicator2_Params = "";          // 指标2参数
input int    Indicator2_Buf0   = 0;
input int    Indicator2_Buf1   = -1;
input int    Indicator2_Buf2   = -1;

// ── 指标 3 ──────────────────────────────────────────════════════
input string Indicator3_Name   = "";          // 指标3文件名
input string Indicator3_Params = "";          // 指标3参数
input int    Indicator3_Buf0   = 0;
input int    Indicator3_Buf1   = -1;
input int    Indicator3_Buf2   = -1;

// ── 指标 4 ──────────────────────────────────────────────────────
input string Indicator4_Name   = "";          // 指标4文件名
input string Indicator4_Params = "";          // 指标4参数
input int    Indicator4_Buf0   = 0;
input int    Indicator4_Buf1   = -1;
input int    Indicator4_Buf2   = -1;

// ── 指标 5 ──────────────────────────────────────────────────────
input string Indicator5_Name   = "";          // 指标5文件名
input string Indicator5_Params = "";          // 指标5参数
input int    Indicator5_Buf0   = 0;
input int    Indicator5_Buf1   = -1;
input int    Indicator5_Buf2   = -1;

//--- ═══════════════════════════════════════════════════════════════
//    28 个 G8 货币对
//--- ═══════════════════════════════════════════════════════════════
string G8Symbols[28] = {
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
   "USDCAD", "AUDUSD", "NZDUSD",
   "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
   "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
   "CHFJPY", "CADJPY", "AUDJPY", "NZDJPY",
   "AUDCAD", "AUDCHF", "AUDNZD",
   "CADCHF", "NZDCAD", "NZDCHF"
};

//--- 全局变量
datetime lastPushTime = 0;
int      pushIntervalSeconds;
string   accountNumber;
string   broker;

// 指标名称数组（运行时从 input 参数填充）
string   IndNames[5];
string   IndParams[5];
int      IndBuf0[5];
int      IndBuf1[5];
int      IndBuf2[5];
int      ActiveIndicatorCount = 0;

//+------------------------------------------------------------------+
//| EA 初始化                                                          |
//+------------------------------------------------------------------+
int OnInit()
{
   pushIntervalSeconds = PushIntervalMinutes * 60;
   accountNumber = IntegerToString(AccountNumber());
   broker = AccountCompany();
   
   // 将 input 参数填充到数组，方便循环处理
   IndNames[0]  = Indicator1_Name;   IndParams[0] = Indicator1_Params;
   IndBuf0[0]   = Indicator1_Buf0;   IndBuf1[0]   = Indicator1_Buf1;   IndBuf2[0] = Indicator1_Buf2;
   
   IndNames[1]  = Indicator2_Name;   IndParams[1] = Indicator2_Params;
   IndBuf0[1]   = Indicator2_Buf0;   IndBuf1[1]   = Indicator2_Buf1;   IndBuf2[1] = Indicator2_Buf2;
   
   IndNames[2]  = Indicator3_Name;   IndParams[2] = Indicator3_Params;
   IndBuf0[2]   = Indicator3_Buf0;   IndBuf1[2]   = Indicator3_Buf1;   IndBuf2[2] = Indicator3_Buf2;
   
   IndNames[3]  = Indicator4_Name;   IndParams[3] = Indicator4_Params;
   IndBuf0[3]   = Indicator4_Buf0;   IndBuf1[3]   = Indicator4_Buf1;   IndBuf2[3] = Indicator4_Buf2;
   
   IndNames[4]  = Indicator5_Name;   IndParams[4] = Indicator5_Params;
   IndBuf0[4]   = Indicator5_Buf0;   IndBuf1[4]   = Indicator5_Buf1;   IndBuf2[4] = Indicator5_Buf2;
   
   // 统计有效指标数量
   ActiveIndicatorCount = 0;
   for(int i = 0; i < 5; i++)
   {
      if(StringLen(StringTrimLeft(StringTrimRight(IndNames[i]))) > 0)
         ActiveIndicatorCount++;
   }
   
   if(EnableLogging)
   {
      Print("[FXStreetBridge v2.0] 初始化完成");
      Print("[FXStreetBridge] 服务器: ", ServerURL);
      Print("[FXStreetBridge] 推送间隔: ", PushIntervalMinutes, " 分钟");
      Print("[FXStreetBridge] 已配置自定义指标: ", ActiveIndicatorCount, " 个");
      for(int i = 0; i < 5; i++)
      {
         string name = StringTrimLeft(StringTrimRight(IndNames[i]));
         if(StringLen(name) > 0)
            Print("[FXStreetBridge] 指标", i+1, ": ", name, 
                  " | 参数: [", IndParams[i], "]",
                  " | Buffer: ", IndBuf0[i],
                  (IndBuf1[i] >= 0 ? (","+IntegerToString(IndBuf1[i])) : ""),
                  (IndBuf2[i] >= 0 ? (","+IntegerToString(IndBuf2[i])) : ""));
      }
   }
   
   // 启动时立即推送一次
   PushAllData();
   lastPushTime = TimeCurrent();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EA 主循环（每个 Tick 触发）                                         |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime currentTime = TimeCurrent();
   if(currentTime - lastPushTime >= pushIntervalSeconds)
   {
      PushAllData();
      lastPushTime = currentTime;
   }
}

//+------------------------------------------------------------------+
//| 定时器（备用触发机制）                                               |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime currentTime = TimeCurrent();
   if(currentTime - lastPushTime >= pushIntervalSeconds)
   {
      PushAllData();
      lastPushTime = currentTime;
   }
}

//+------------------------------------------------------------------+
//| 主推送函数：推送 K 线 + 自定义指标                                   |
//+------------------------------------------------------------------+
void PushAllData()
{
   if(EnableLogging)
      Print("[FXStreetBridge] ── 开始推送 ──────────────────────────");
   
   // 1. 推送 K 线行情数据
   PushAllBars();
   
   // 2. 推送自定义指标数据（如有配置）
   if(ActiveIndicatorCount > 0)
      PushAllIndicators();
   else if(EnableLogging)
      Print("[FXStreetBridge] 未配置自定义指标，跳过指标推送");
}

//+------------------------------------------------------------------+
//| 推送所有货币对的 M15 K 线数据                                        |
//+------------------------------------------------------------------+
void PushAllBars()
{
   if(EnableLogging)
      Print("[FXStreetBridge] 推送 28 个货币对的 M15 K 线...");
   
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"accountNumber\":\"" + accountNumber + "\",";
   json += "\"broker\":\"" + broker + "\",";
   json += "\"timeframe\":\"M15\",";
   json += "\"bars\":[";
   
   bool firstBar = true;
   int totalBars = 0;
   
   for(int s = 0; s < 28; s++)
   {
      string symbol = G8Symbols[s];
      if(!SymbolSelect(symbol, true)) continue;
      
      int barsAvailable = iBars(symbol, PERIOD_M15);
      int barsToFetch = MathMin(BarsToSend, barsAvailable - 1);
      if(barsToFetch <= 0) continue;
      
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      
      for(int i = barsToFetch; i >= 1; i--)
      {
         datetime barTime  = iTime(symbol, PERIOD_M15, i);
         double   barOpen  = iOpen(symbol, PERIOD_M15, i);
         double   barHigh  = iHigh(symbol, PERIOD_M15, i);
         double   barLow   = iLow(symbol, PERIOD_M15, i);
         double   barClose = iClose(symbol, PERIOD_M15, i);
         long     barVol   = iVolume(symbol, PERIOD_M15, i);
         int      barSpread= (int)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
         
         string barTimeStr = TimeToString(barTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(barTimeStr, 0, 4) + "-" +
                          StringSubstr(barTimeStr, 5, 2) + "-" +
                          StringSubstr(barTimeStr, 8, 2) + "T" +
                          StringSubstr(barTimeStr, 11, 5) + ":00Z";
         
         if(!firstBar) json += ",";
         firstBar = false;
         
         json += "{";
         json += "\"symbol\":\"" + symbol + "\",";
         json += "\"barTime\":\"" + isoTime + "\",";
         json += "\"open\":\""   + DoubleToString(barOpen,  digits) + "\",";
         json += "\"high\":\""   + DoubleToString(barHigh,  digits) + "\",";
         json += "\"low\":\""    + DoubleToString(barLow,   digits) + "\",";
         json += "\"close\":\""  + DoubleToString(barClose, digits) + "\",";
         json += "\"volume\":\""  + IntegerToString(barVol) + "\",";
         json += "\"spread\":"   + IntegerToString(barSpread);
         json += "}";
         
         totalBars++;
      }
   }
   
   json += "]}";
   
   if(EnableLogging)
      Print("[FXStreetBridge] K线推送：", totalBars, " 根，JSON大小: ", StringLen(json), " 字节");
   
   SendHttpPost(ServerURL + "/api/mt4/push", json);
}

//+------------------------------------------------------------------+
//| 推送所有货币对的自定义指标数值                                        |
//+------------------------------------------------------------------+
void PushAllIndicators()
{
   if(EnableLogging)
      Print("[FXStreetBridge] 推送自定义指标（", ActiveIndicatorCount, " 个）...");
   
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";
   
   bool firstSignal = true;
   int totalSignals = 0;
   
   for(int s = 0; s < 28; s++)
   {
      string symbol = G8Symbols[s];
      if(!SymbolSelect(symbol, true)) continue;
      
      for(int idx = 0; idx < 5; idx++)
      {
         string indName = StringTrimLeft(StringTrimRight(IndNames[idx]));
         if(StringLen(indName) == 0) continue;
         
         // ── 读取指标值 ────────────────────────────────────────────
         // 使用 iCustom() 调用自定义指标，shift=1（已完成的最新K线）
         double val0 = EMPTY_VALUE;
         double val1 = EMPTY_VALUE;
         double val2 = EMPTY_VALUE;
         
         // 解析参数字符串，支持最多 8 个数值参数
         // 格式示例："14" 或 "14,3,3" 或 "20,2.0,0"
         string paramStr = StringTrimLeft(StringTrimRight(IndParams[idx]));
         double p[8];
         int    paramCount = 0;
         
         if(StringLen(paramStr) > 0)
         {
            string parts[];
            int n = StringSplit(paramStr, ',', parts);
            paramCount = MathMin(n, 8);
            for(int pi = 0; pi < paramCount; pi++)
               p[pi] = StringToDouble(StringTrimLeft(StringTrimRight(parts[pi])));
         }
         
         // 根据参数数量调用 iCustom（MQL4 不支持可变参数，需要分支处理）
         if(paramCount == 0)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, IndBuf2[idx], 1);
         }
         else if(paramCount == 1)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], IndBuf2[idx], 1);
         }
         else if(paramCount == 2)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], IndBuf2[idx], 1);
         }
         else if(paramCount == 3)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], IndBuf2[idx], 1);
         }
         else if(paramCount == 4)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], IndBuf2[idx], 1);
         }
         else if(paramCount == 5)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], IndBuf2[idx], 1);
         }
         else if(paramCount == 6)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], IndBuf2[idx], 1);
         }
         else if(paramCount == 7)
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], IndBuf2[idx], 1);
         }
         else // paramCount == 8
         {
            val0 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], IndBuf0[idx], 1);
            if(IndBuf1[idx] >= 0) val1 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], IndBuf1[idx], 1);
            if(IndBuf2[idx] >= 0) val2 = iCustom(symbol, PERIOD_M15, indName, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], IndBuf2[idx], 1);
         }
         
         // 如果主值无效则跳过
         if(val0 == EMPTY_VALUE || val0 == 0.0 && val1 == EMPTY_VALUE) continue;
         
         // ── 自动判断信号方向 ──────────────────────────────────────
         // 规则：主值 > 副值（信号线）→ buy；主值 < 副值 → sell；否则 neutral
         // 若只有主值：正数 → buy；负数 → sell；接近0 → neutral
         string signalStr = "neutral";
         
         if(val1 != EMPTY_VALUE && val1 != 0.0)
         {
            // 有信号线：主值与信号线的交叉关系
            if(val0 > val1 * 1.001)      signalStr = "buy";
            else if(val0 < val1 * 0.999) signalStr = "sell";
            else                          signalStr = "neutral";
         }
         else
         {
            // 仅主值：根据正负判断
            if(val0 > 0.0001)       signalStr = "buy";
            else if(val0 < -0.0001) signalStr = "sell";
            else                    signalStr = "neutral";
         }
         
         // ── 构建描述文字 ──────────────────────────────────────────
         string desc = indName + " on " + symbol + " M15: val=" + DoubleToString(val0, 6);
         if(val1 != EMPTY_VALUE) desc += ", sig=" + DoubleToString(val1, 6);
         if(val2 != EMPTY_VALUE) desc += ", aux=" + DoubleToString(val2, 6);
         desc += " [" + signalStr + "]";
         
         // ── 拼接 JSON ────────────────────────────────────────────
         if(!firstSignal) json += ",";
         firstSignal = false;
         
         json += "{";
         json += "\"symbol\":\""        + symbol    + "\",";
         json += "\"timeframe\":\"M15\",";
         json += "\"indicatorName\":\"" + indName   + "\",";
         json += "\"value1\":\""        + DoubleToString(val0, 8) + "\"";
         
         if(val1 != EMPTY_VALUE)
            json += ",\"value2\":\"" + DoubleToString(val1, 8) + "\"";
         if(val2 != EMPTY_VALUE)
            json += ",\"value3\":\"" + DoubleToString(val2, 8) + "\"";
         
         json += ",\"signal\":\""      + signalStr + "\"";
         json += ",\"description\":\"" + desc      + "\"";
         json += "}";
         
         totalSignals++;
      }
   }
   
   json += "]}";
   
   if(EnableLogging)
      Print("[FXStreetBridge] 指标推送：", totalSignals, " 条信号，JSON大小: ", StringLen(json), " 字节");
   
   if(totalSignals > 0)
      SendHttpPost(ServerURL + "/api/mt4/indicators", json);
   else if(EnableLogging)
      Print("[FXStreetBridge] 所有指标值均无效（EMPTY_VALUE），跳过指标推送");
}

//+------------------------------------------------------------------+
//| 发送 HTTP POST 请求                                                |
//+------------------------------------------------------------------+
void SendHttpPost(string url, string body)
{
   char   postData[];
   char   resultData[];
   string resultHeaders;
   
   StringToCharArray(body, postData, 0, StringLen(body));
   
   string headers = "Content-Type: application/json\r\n";
   headers += "X-MT4-API-Key: " + ApiKey + "\r\n";
   
   int result = WebRequest(
      "POST",
      url,
      headers,
      10000,
      postData,
      resultData,
      resultHeaders
   );
   
   if(result == -1)
   {
      int errorCode = GetLastError();
      if(EnableLogging)
         Print("[FXStreetBridge] HTTP 请求失败，URL: ", url,
               "，错误码: ", errorCode,
               "。请检查：1) 服务器地址是否正确 2) MT4是否允许HTTP请求");
   }
   else
   {
      string response = CharArrayToString(resultData);
      if(EnableLogging)
         Print("[FXStreetBridge] 推送成功 → ", url, 
               " | HTTP: ", result, 
               " | 响应: ", StringSubstr(response, 0, 150));
   }
}

//+------------------------------------------------------------------+
//| EA 卸载                                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(EnableLogging)
      Print("[FXStreetBridge v2.0] EA 已卸载，原因: ", reason);
}
//+------------------------------------------------------------------+
