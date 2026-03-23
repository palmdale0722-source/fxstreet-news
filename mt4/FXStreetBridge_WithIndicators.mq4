//+------------------------------------------------------------------+
//|                              FXStreetBridge_WithIndicators.mq4   |
//|                     FXStreet AI 分析师 - 含多时间框架指标推送版      |
//|                                                                  |
//| 功能：                                                            |
//|   1. 每15分钟推送28个G8货币对的M15行情数据（K线）                   |
//|   2. 每15分钟推送自定义指标在 M15/H1/H4/D1 四个时间框架的最新值      |
//|                                                                  |
//| 安装说明：                                                         |
//|   1. 将此文件复制到 MT4 的 MQL4/Experts/ 目录                      |
//|   2. 确保你的自定义指标 .ex4 文件在 MQL4/Indicators/ 目录中         |
//|   3. 在 MT4 中编译（F7）                                           |
//|   4. 将 EA 拖到任意图表上运行（推荐 EURUSD M15 图表）               |
//|   5. 在 EA 参数中填入 ServerURL 和 ApiKey                          |
//|   6. 确保 MT4 允许 EA 发起 HTTP 请求（工具→选项→智能交易系统）       |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge"
#property version   "2.0"
#property strict

//=== 基础配置参数 ===================================================
input string ServerURL           = "https://YOUR_SITE_URL";    // 服务器地址
input string ApiKey              = "mt4-bridge-key-change-me"; // API 密钥
input string ClientId            = "mt4-client-01";            // EA 实例标识
input int    PushIntervalMinutes = 15;                         // 推送间隔（分钟）
input int    BarsToSend          = 100;                        // K线推送数量
input bool   EnableLogging       = true;                       // 是否输出日志

//=== 指标推送配置 ===================================================
// 是否启用各时间框架的指标推送
input bool   PushM15Indicators   = true;   // 推送 M15 时间框架指标
input bool   PushH1Indicators    = true;   // 推送 H1 时间框架指标
input bool   PushH4Indicators    = true;   // 推送 H4 时间框架指标
input bool   PushD1Indicators    = true;   // 推送 D1 时间框架指标

// 自定义指标名称（填写你的 .ex4 文件名，不含扩展名）
// 如果没有某个指标，将对应名称留空即可
input string Indicator1Name      = "TrendKiller";  // 趋势指标名称（留空则不推送）
input int    Indicator1Param1    = 14;             // 指标1参数1（如周期）
input int    Indicator1Param2    = 0;              // 指标1参数2（如模式）
input int    Indicator1Buffer0   = 0;              // 主值 buffer 索引
input int    Indicator1Buffer1   = 1;              // 副值 buffer 索引（-1表示不读取）

input string Indicator2Name      = "";             // 震荡指标名称（留空则不推送）
input int    Indicator2Param1    = 14;
input int    Indicator2Param2    = 0;
input int    Indicator2Buffer0   = 0;
input int    Indicator2Buffer1   = -1;

input string Indicator3Name      = "";             // 第三个指标名称（留空则不推送）
input int    Indicator3Param1    = 14;
input int    Indicator3Param2    = 0;
input int    Indicator3Buffer0   = 0;
input int    Indicator3Buffer1   = -1;

//=== 要推送指标的货币对（可以少于28个，节省推送量）==================
// 建议只推送你重点关注的货币对，减少 HTTP 请求体积
input string IndicatorSymbols    = "EURUSD,GBPUSD,USDJPY,XAUUSD"; // 逗号分隔

//=== 全局变量 =======================================================
string G8Symbols[28] = {
   "EURUSD", "GBPUSD", "USDJPY", "USDCHF",
   "USDCAD", "AUDUSD", "NZDUSD",
   "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
   "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
   "CHFJPY", "CADJPY", "AUDJPY", "NZDJPY",
   "AUDCAD", "AUDCHF", "AUDNZD",
   "CADCHF", "NZDCAD", "NZDCHF"
};

datetime lastPushTime = 0;
int      pushIntervalSeconds;
string   accountNumber;
string   broker;

// 解析后的指标货币对列表
string indicatorSymbolList[];
int    indicatorSymbolCount = 0;

//+------------------------------------------------------------------+
//| EA 初始化                                                          |
//+------------------------------------------------------------------+
int OnInit()
{
   pushIntervalSeconds = PushIntervalMinutes * 60;
   accountNumber = IntegerToString(AccountNumber());
   broker = AccountCompany();
   
   // 解析指标货币对列表
   ParseSymbolList(IndicatorSymbols, indicatorSymbolList, indicatorSymbolCount);
   
   if(EnableLogging)
      Print("[FXStreetBridge v2] 初始化完成，服务器: ", ServerURL,
            "，推送间隔: ", PushIntervalMinutes, " 分钟",
            "，指标货币对: ", indicatorSymbolCount, " 个");
   
   // 启动时立即推送一次
   PushAllData();
   lastPushTime = TimeCurrent();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| EA 主循环                                                          |
//+------------------------------------------------------------------+
void OnTick()
{
   if(TimeCurrent() - lastPushTime >= pushIntervalSeconds)
   {
      PushAllData();
      lastPushTime = TimeCurrent();
   }
}

void OnTimer()
{
   if(TimeCurrent() - lastPushTime >= pushIntervalSeconds)
   {
      PushAllData();
      lastPushTime = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| 主推送函数：先推 K 线，再推指标                                      |
//+------------------------------------------------------------------+
void PushAllData()
{
   PushAllBars();
   
   if(indicatorSymbolCount > 0 &&
      (StringLen(Indicator1Name) > 0 || StringLen(Indicator2Name) > 0 || StringLen(Indicator3Name) > 0))
   {
      PushAllIndicators();
   }
}

//+------------------------------------------------------------------+
//| 推送 K 线数据（与原版相同）                                          |
//+------------------------------------------------------------------+
void PushAllBars()
{
   if(EnableLogging)
      Print("[FXStreetBridge v2] 开始推送 K 线数据...");
   
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"accountNumber\":\"" + accountNumber + "\",";
   json += "\"broker\":\"" + broker + "\",";
   json += "\"timeframe\":\"M15\",";
   json += "\"bars\":[";
   
   bool firstBar = true;
   int  totalBars = 0;
   
   for(int s = 0; s < 28; s++)
   {
      string symbol = G8Symbols[s];
      if(!SymbolSelect(symbol, true)) continue;
      
      int barsAvailable = iBars(symbol, PERIOD_M15);
      int barsToFetch   = MathMin(BarsToSend, barsAvailable - 1);
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
         json += "\"volume\":\""  + IntegerToString(barVol)         + "\",";
         json += "\"spread\":"   + IntegerToString(barSpread);
         json += "}";
         totalBars++;
      }
   }
   
   json += "]}";
   
   if(EnableLogging)
      Print("[FXStreetBridge v2] K 线推送：", totalBars, " 根");
   
   SendHttpPost(ServerURL + "/api/mt4/push", json);
}

//+------------------------------------------------------------------+
//| 推送自定义指标信号（多时间框架）                                      |
//+------------------------------------------------------------------+
void PushAllIndicators()
{
   if(EnableLogging)
      Print("[FXStreetBridge v2] 开始推送指标信号，货币对数: ", indicatorSymbolCount);
   
   // 构建时间框架列表
   int    tfPeriods[4] = {PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};
   string tfNames[4]   = {"M15",      "H1",      "H4",      "D1"};
   bool   tfEnabled[4] = {PushM15Indicators, PushH1Indicators,
                          PushH4Indicators,  PushD1Indicators};
   
   string json = "{";
   json += "\"clientId\":\"" + ClientId + "\",";
   json += "\"signals\":[";
   
   bool firstSignal = true;
   int  totalSignals = 0;
   
   for(int s = 0; s < indicatorSymbolCount; s++)
   {
      string sym = indicatorSymbolList[s];
      if(!SymbolSelect(sym, true)) continue;
      
      int digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      
      for(int t = 0; t < 4; t++)
      {
         if(!tfEnabled[t]) continue;
         
         int    tf     = tfPeriods[t];
         string tfName = tfNames[t];
         
         // ── 指标 1 ──
         if(StringLen(Indicator1Name) > 0)
         {
            AppendIndicator1Signal(sym, tf, tfName, digits,
                                   firstSignal, json, totalSignals);
         }
         
         // ── 指标 2 ──
         if(StringLen(Indicator2Name) > 0)
         {
            AppendIndicator2Signal(sym, tf, tfName, digits,
                                   firstSignal, json, totalSignals);
         }
         
         // ── 指标 3 ──
         if(StringLen(Indicator3Name) > 0)
         {
            AppendIndicator3Signal(sym, tf, tfName, digits,
                                   firstSignal, json, totalSignals);
         }
         
         // ── 内置均线系统（可选，始终推送）──
         // 如果你不需要均线，注释掉下面这行
         AppendMASystemSignal(sym, tf, tfName, digits,
                              firstSignal, json, totalSignals);
      }
   }
   
   json += "]}";
   
   if(EnableLogging)
      Print("[FXStreetBridge v2] 指标推送：", totalSignals, " 条信号");
   
   if(totalSignals > 0)
      SendHttpPost(ServerURL + "/api/mt4/indicators", json);
}

//+------------------------------------------------------------------+
//| 指标1 信号读取与拼接                                                 |
//+------------------------------------------------------------------+
void AppendIndicator1Signal(string sym, int tf, string tfName, int digits,
                             bool &firstSignal, string &json, int &totalSignals)
{
   double v0 = iCustom(sym, tf, Indicator1Name, Indicator1Param1, Indicator1Param2,
                       Indicator1Buffer0, 1);
   
   if(v0 == EMPTY_VALUE || v0 == 0.0) return;
   
   double v1 = (Indicator1Buffer1 >= 0)
               ? iCustom(sym, tf, Indicator1Name, Indicator1Param1, Indicator1Param2,
                         Indicator1Buffer1, 1)
               : EMPTY_VALUE;
   
   // ── 信号判断逻辑（根据你的指标特性修改）──
   // 示例：value1 > 0 为多头，< 0 为空头；穿越零轴为信号
   string sig  = "neutral";
   string desc = "";
   
   if(v0 > 0)
   {
      sig  = (v1 != EMPTY_VALUE && v0 > v1) ? "buy" : "neutral";
      desc = StringFormat("[%s %s] %s 主线=%.5f%s 多头区域",
                          sym, tfName, Indicator1Name, v0,
                          v1 != EMPTY_VALUE ? StringFormat(" 信号线=%.5f", v1) : "");
   }
   else if(v0 < 0)
   {
      sig  = (v1 != EMPTY_VALUE && v0 < v1) ? "sell" : "neutral";
      desc = StringFormat("[%s %s] %s 主线=%.5f%s 空头区域",
                          sym, tfName, Indicator1Name, v0,
                          v1 != EMPTY_VALUE ? StringFormat(" 信号线=%.5f", v1) : "");
   }
   
   if(!firstSignal) json += ",";
   firstSignal = false;
   totalSignals++;
   
   json += "{";
   json += "\"symbol\":\""        + sym           + "\",";
   json += "\"timeframe\":\""     + tfName        + "\",";
   json += "\"indicatorName\":\"" + Indicator1Name+ "\",";
   json += "\"value1\":\""        + DoubleToString(v0, 5) + "\",";
   if(v1 != EMPTY_VALUE)
      json += "\"value2\":\"" + DoubleToString(v1, 5) + "\",";
   json += "\"signal\":\""        + sig           + "\",";
   json += "\"description\":\""   + desc          + "\"";
   json += "}";
}

//+------------------------------------------------------------------+
//| 指标2 信号读取与拼接（震荡型，如 RSI 变种）                            |
//+------------------------------------------------------------------+
void AppendIndicator2Signal(string sym, int tf, string tfName, int digits,
                             bool &firstSignal, string &json, int &totalSignals)
{
   double v0 = iCustom(sym, tf, Indicator2Name, Indicator2Param1, Indicator2Param2,
                       Indicator2Buffer0, 1);
   
   if(v0 == EMPTY_VALUE) return;
   
   // ── 震荡指标信号判断（0-100 范围，修改阈值以适配你的指标）──
   string sig  = "neutral";
   string desc = "";
   
   if(v0 > 70)
   {
      sig  = "overbought";
      desc = StringFormat("[%s %s] %s=%.1f 超买区域（>70），注意回调风险",
                          sym, tfName, Indicator2Name, v0);
   }
   else if(v0 < 30)
   {
      sig  = "oversold";
      desc = StringFormat("[%s %s] %s=%.1f 超卖区域（<30），注意反弹机会",
                          sym, tfName, Indicator2Name, v0);
   }
   else if(v0 > 50)
   {
      sig  = "buy";
      desc = StringFormat("[%s %s] %s=%.1f 偏多区域（50-70）",
                          sym, tfName, Indicator2Name, v0);
   }
   else
   {
      sig  = "sell";
      desc = StringFormat("[%s %s] %s=%.1f 偏空区域（30-50）",
                          sym, tfName, Indicator2Name, v0);
   }
   
   if(!firstSignal) json += ",";
   firstSignal = false;
   totalSignals++;
   
   json += "{";
   json += "\"symbol\":\""        + sym           + "\",";
   json += "\"timeframe\":\""     + tfName        + "\",";
   json += "\"indicatorName\":\"" + Indicator2Name+ "\",";
   json += "\"value1\":\""        + DoubleToString(v0, 2) + "\",";
   json += "\"signal\":\""        + sig           + "\",";
   json += "\"description\":\""   + desc          + "\"";
   json += "}";
}

//+------------------------------------------------------------------+
//| 指标3 信号读取与拼接（通用模板）                                       |
//+------------------------------------------------------------------+
void AppendIndicator3Signal(string sym, int tf, string tfName, int digits,
                             bool &firstSignal, string &json, int &totalSignals)
{
   double v0 = iCustom(sym, tf, Indicator3Name, Indicator3Param1, Indicator3Param2,
                       Indicator3Buffer0, 1);
   
   if(v0 == EMPTY_VALUE) return;
   
   double v1 = (Indicator3Buffer1 >= 0)
               ? iCustom(sym, tf, Indicator3Name, Indicator3Param1, Indicator3Param2,
                         Indicator3Buffer1, 1)
               : EMPTY_VALUE;
   
   // ── 通用信号判断（根据你的指标特性修改）──
   string sig  = "neutral";
   string desc = StringFormat("[%s %s] %s=%.5f%s",
                              sym, tfName, Indicator3Name, v0,
                              v1 != EMPTY_VALUE ? StringFormat(" 信号线=%.5f", v1) : "");
   
   if(!firstSignal) json += ",";
   firstSignal = false;
   totalSignals++;
   
   json += "{";
   json += "\"symbol\":\""        + sym           + "\",";
   json += "\"timeframe\":\""     + tfName        + "\",";
   json += "\"indicatorName\":\"" + Indicator3Name+ "\",";
   json += "\"value1\":\""        + DoubleToString(v0, 5) + "\",";
   if(v1 != EMPTY_VALUE)
      json += "\"value2\":\"" + DoubleToString(v1, 5) + "\",";
   json += "\"signal\":\""        + sig           + "\",";
   json += "\"description\":\""   + desc          + "\"";
   json += "}";
}

//+------------------------------------------------------------------+
//| 内置均线系统信号（EMA20/EMA50/SMA200 三均线排列）                     |
//| 如不需要，在 PushAllIndicators() 中注释掉调用即可                     |
//+------------------------------------------------------------------+
void AppendMASystemSignal(string sym, int tf, string tfName, int digits,
                           bool &firstSignal, string &json, int &totalSignals)
{
   double ema20  = iMA(sym, tf, 20,  0, MODE_EMA, PRICE_CLOSE, 1);
   double ema50  = iMA(sym, tf, 50,  0, MODE_EMA, PRICE_CLOSE, 1);
   double sma200 = iMA(sym, tf, 200, 0, MODE_SMA, PRICE_CLOSE, 1);
   double price  = iClose(sym, tf, 1);
   
   if(ema20 <= 0 || ema50 <= 0 || sma200 <= 0) return;
   
   string sig  = "neutral";
   string align = "";
   
   if(ema20 > ema50 && ema50 > sma200 && price > ema20)
   {
      sig   = "buy";
      align = "多头排列（EMA20>EMA50>SMA200，价格在均线上方）";
   }
   else if(ema20 < ema50 && ema50 < sma200 && price < ema20)
   {
      sig   = "sell";
      align = "空头排列（EMA20<EMA50<SMA200，价格在均线下方）";
   }
   else if(ema20 > ema50 && ema50 < sma200)
   {
      sig   = "neutral";
      align = "均线纠缠，趋势不明（EMA20>EMA50 但低于 SMA200）";
   }
   else
   {
      align = StringFormat("混合排列，EMA20=%.%df EMA50=%.%df SMA200=%.%df",
                           digits, ema20, digits, ema50, digits, sma200);
   }
   
   string desc = StringFormat("[%s %s] 均线系统：%s | 价格=%.%df EMA20=%.%df EMA50=%.%df SMA200=%.%df",
                              sym, tfName, align,
                              digits, price, digits, ema20, digits, ema50, digits, sma200);
   
   if(!firstSignal) json += ",";
   firstSignal = false;
   totalSignals++;
   
   json += "{";
   json += "\"symbol\":\""        + sym         + "\",";
   json += "\"timeframe\":\""     + tfName      + "\",";
   json += "\"indicatorName\":\"MA_System\",";
   json += "\"value1\":\""        + DoubleToString(ema20,  digits) + "\",";
   json += "\"value2\":\""        + DoubleToString(ema50,  digits) + "\",";
   json += "\"value3\":\""        + DoubleToString(sma200, digits) + "\",";
   json += "\"signal\":\""        + sig         + "\",";
   json += "\"description\":\""   + desc        + "\"";
   json += "}";
}

//+------------------------------------------------------------------+
//| 解析逗号分隔的货币对字符串                                            |
//+------------------------------------------------------------------+
void ParseSymbolList(string input, string &outList[], int &outCount)
{
   outCount = 0;
   string temp = input;
   
   // 计算逗号数量以确定数组大小
   int commas = 0;
   for(int i = 0; i < StringLen(temp); i++)
      if(StringGetCharacter(temp, i) == ',') commas++;
   
   ArrayResize(outList, commas + 1);
   
   int start = 0;
   for(int i = 0; i <= StringLen(temp); i++)
   {
      if(i == StringLen(temp) || StringGetCharacter(temp, i) == ',')
      {
         string sym = StringSubstr(temp, start, i - start);
         // 去除空格并转大写
         StringTrimLeft(sym);
         StringTrimRight(sym);
         StringToUpper(sym);
         if(StringLen(sym) > 0)
         {
            outList[outCount] = sym;
            outCount++;
         }
         start = i + 1;
      }
   }
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
         Print("[FXStreetBridge v2] HTTP 请求失败，错误码: ", errorCode,
               "。请检查：1) 服务器地址 2) MT4 是否允许 HTTP 请求（工具→选项→智能交易系统→允许WebRequest）");
   }
   else
   {
      string response = CharArrayToString(resultData);
      if(EnableLogging)
         Print("[FXStreetBridge v2] 推送成功，HTTP状态: ", result,
               "，响应: ", StringSubstr(response, 0, 200));
   }
}

//+------------------------------------------------------------------+
//| EA 卸载                                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if(EnableLogging)
      Print("[FXStreetBridge v2] EA 已卸载，原因: ", reason);
}
//+------------------------------------------------------------------+
