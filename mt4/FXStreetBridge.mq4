//+------------------------------------------------------------------+
//|                                           FXStreetBridge.mq4     |
//|                         FXStreet AI 分析师 - MT4 数据推送桥         |
//|                                                                  |
//| 功能：每15分钟将28个G8货币对的M15行情数据推送到FXStreet AI分析师      |
//| 安装说明：                                                         |
//|   1. 将此文件复制到 MT4 的 MQL4/Experts/ 目录                      |
//|   2. 在 MT4 中编译（F7）                                           |
//|   3. 将 EA 拖到任意图表上运行（推荐 EURUSD M15 图表）               |
//|   4. 在 EA 参数中填入 ServerURL 和 ApiKey                          |
//|   5. 确保 MT4 允许 EA 发起 HTTP 请求（工具→选项→智能交易系统）       |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "1.0"
#property strict

//--- 输入参数
input string ServerURL  = "https://YOUR_SITE_URL";  // 服务器地址（替换为你的网站域名）
input string ApiKey     = "mt4-bridge-key-change-me"; // API 密钥（与网站后台一致）
input string ClientId   = "mt4-client-01";           // EA 实例标识（多个MT4时区分用）
input int    PushIntervalMinutes = 15;               // 推送间隔（分钟）
input int    BarsToSend = 100;                       // 每次推送的K线数量（最多200）
input bool   EnableLogging = true;                   // 是否输出日志

//--- 28个G8货币对
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

//+------------------------------------------------------------------+
//| EA 初始化                                                          |
//+------------------------------------------------------------------+
int OnInit()
{
   pushIntervalSeconds = PushIntervalMinutes * 60;
   accountNumber = IntegerToString(AccountNumber());
   broker = AccountCompany();
   
   if(EnableLogging)
      Print("[FXStreetBridge] 初始化完成，服务器: ", ServerURL, "，推送间隔: ", PushIntervalMinutes, " 分钟");
   
   // 启动时立即推送一次
   PushAllSymbols();
   lastPushTime = TimeCurrent();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EA 主循环（每个 Tick 触发）                                         |
//+------------------------------------------------------------------+
void OnTick()
{
   datetime currentTime = TimeCurrent();
   
   // 检查是否到达推送时间
   if(currentTime - lastPushTime >= pushIntervalSeconds)
   {
      PushAllSymbols();
      lastPushTime = currentTime;
   }
}

//+------------------------------------------------------------------+
//| 定时器（作为备用触发机制）                                           |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime currentTime = TimeCurrent();
   if(currentTime - lastPushTime >= pushIntervalSeconds)
   {
      PushAllSymbols();
      lastPushTime = currentTime;
   }
}

//+------------------------------------------------------------------+
//| 推送所有货币对的 M15 K 线数据                                        |
//+------------------------------------------------------------------+
void PushAllSymbols()
{
   if(EnableLogging)
      Print("[FXStreetBridge] 开始推送 28 个货币对的 M15 数据...");
   
   // 构建 JSON payload
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
      
      // 检查该货币对是否在市场中可用
      if(!SymbolSelect(symbol, true))
      {
         if(EnableLogging)
            Print("[FXStreetBridge] 跳过不可用货币对: ", symbol);
         continue;
      }
      
      // 获取 M15 K 线数据
      int barsAvailable = iBars(symbol, PERIOD_M15);
      int barsToFetch = MathMin(BarsToSend, barsAvailable - 1); // -1 跳过当前未完成的K线
      
      if(barsToFetch <= 0) continue;
      
      for(int i = barsToFetch; i >= 1; i--)  // 从旧到新，跳过 i=0（未完成K线）
      {
         datetime barTime = iTime(symbol, PERIOD_M15, i);
         double   barOpen = iOpen(symbol, PERIOD_M15, i);
         double   barHigh = iHigh(symbol, PERIOD_M15, i);
         double   barLow  = iLow(symbol, PERIOD_M15, i);
         double   barClose= iClose(symbol, PERIOD_M15, i);
         long     barVol  = iVolume(symbol, PERIOD_M15, i);
         int      barSpread = (int)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
         
         // 获取小数位数，用于格式化价格
         int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
         
         if(!firstBar) json += ",";
         firstBar = false;
         
         // 将 MT4 时间转换为 UTC ISO 8601 格式
         // MT4 服务器时间通常是 UTC+2 或 UTC+3（夏令时），需要根据经纪商调整
         // 这里直接使用服务器时间，后端会按 UTC 存储
         string barTimeStr = TimeToString(barTime, TIME_DATE|TIME_MINUTES);
         // 将 "2024.01.15 10:30" 格式转换为 "2024-01-15T10:30:00Z"
         string isoTime = StringSubstr(barTimeStr, 0, 4) + "-" +
                          StringSubstr(barTimeStr, 5, 2) + "-" +
                          StringSubstr(barTimeStr, 8, 2) + "T" +
                          StringSubstr(barTimeStr, 11, 5) + ":00Z";
         
         json += "{";
         json += "\"symbol\":\"" + symbol + "\",";
         json += "\"barTime\":\"" + isoTime + "\",";
         json += "\"open\":\"" + DoubleToString(barOpen, digits) + "\",";
         json += "\"high\":\"" + DoubleToString(barHigh, digits) + "\",";
         json += "\"low\":\"" + DoubleToString(barLow, digits) + "\",";
         json += "\"close\":\"" + DoubleToString(barClose, digits) + "\",";
         json += "\"volume\":\"" + IntegerToString(barVol) + "\",";
         json += "\"spread\":" + IntegerToString(barSpread);
         json += "}";
         
         totalBars++;
      }
   }
   
   json += "]}";
   
   if(EnableLogging)
      Print("[FXStreetBridge] 准备推送 ", totalBars, " 根K线，JSON大小: ", StringLen(json), " 字节");
   
   // 发送 HTTP POST 请求
   SendHttpPost(ServerURL + "/api/mt4/push", json);
}

//+------------------------------------------------------------------+
//| 发送 HTTP POST 请求                                                |
//+------------------------------------------------------------------+
void SendHttpPost(string url, string body)
{
   char   postData[];
   char   resultData[];
   string resultHeaders;
   
   // 将 JSON 字符串转换为字节数组
   StringToCharArray(body, postData, 0, StringLen(body));
   
   // 设置请求头
   string headers = "Content-Type: application/json\r\n";
   headers += "X-MT4-API-Key: " + ApiKey + "\r\n";
   
   // 发送请求（超时 10 秒）
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
         Print("[FXStreetBridge] HTTP 请求失败，错误码: ", errorCode, 
               "。请检查：1) 服务器地址是否正确 2) MT4是否允许HTTP请求（工具→选项→智能交易系统→允许WebRequest）");
   }
   else
   {
      string response = CharArrayToString(resultData);
      if(EnableLogging)
         Print("[FXStreetBridge] 推送成功，HTTP状态: ", result, "，响应: ", StringSubstr(response, 0, 200));
   }
}

//+------------------------------------------------------------------+
//| EA 卸载                                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(EnableLogging)
      Print("[FXStreetBridge] EA 已卸载，原因: ", reason);
}
//+------------------------------------------------------------------+
