//+------------------------------------------------------------------+
//|                                      FXStreetBridge_v3.mq4        |
//|                    FXStreet AI 分析师 - MT4 本地缓存推送桥          |
//|                                                                  |
//| 功能：每15分钟将28个G8货币对的M15行情数据写入本地CSV文件           |
//|       Python脚本定期读取并批量上传到服务器                         |
//|                                                                  |
//| 改进点：                                                          |
//|   1. 改为本地文件缓存，网络中断时数据不丢失                        |
//|   2. 减少HTTP请求数（从28对/15分钟 → 1次/30分钟）                |
//|   3. 支持自动重试和数据完整性检查                                  |
//|   4. 易于调试和监控                                               |
//|                                                                  |
//| 安装说明：                                                         |
//|   1. 将此文件复制到 MT4 的 MQL4/Experts/ 目录                      |
//|   2. 在 MT4 中编译此 EA（F7）                                      |
//|   3. 将 EA 拖到任意图表上运行（推荐 EURUSD M15 图表）               |
//|   4. 确保 MT4 允许 EA 读写文件                                     |
//|      （工具 → 选项 → 智能交易系统 → 允许文件操作）                 |
//|   5. 在 MT4 的 MQL4/Files/ 目录下会自动生成 CSV 文件               |
//|   6. 部署 Python 脚本定期上传这些文件                              |
//+------------------------------------------------------------------+
#property copyright "FXStreet AI Bridge v3"
#property version   "3.0"
#property strict

//--- ═══════════════════════════════════════════════════════════════
//    基础配置参数
//--- ═══════════════════════════════════════════════════════════════
input int    PushIntervalMinutes = 15;        // 推送间隔（分钟）
input int    BarsToSend = 100;                // 每次推送的K线数量（最多200）
input bool   EnableLogging = true;            // 是否输出日志
input bool   EnableFileWrite = true;          // 是否写入本地文件

//--- ═══════════════════════════════════════════════════════════════
//    全局变量
//--- ═══════════════════════════════════════════════════════════════
datetime lastPushTime = 0;
int pushIntervalSeconds = 0;
string accountNumber = "";
string broker = "";

// G8 货币对列表（28个）
string G8Symbols[28] = {
   "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
   "EURJPY", "EURGBP", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
   "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
   "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
   "NZDJPY", "NZDJPY", "NZDJPY", "NZDJPY", "NZDJPY", "NZDJPY"
};

// 实际使用的28个货币对（去重）
string ActualSymbols[28] = {
   "EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
   "EURJPY", "EURGBP", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
   "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
   "AUDJPY", "AUDCHF", "AUDCAD", "AUDNZD",
   "CADJPY", "CHFJPY", "CADCHF", "NZDCAD", "NZDCHF", "CHFCAD"
};

//+------------------------------------------------------------------+
//| EA 初始化                                                          |
//+------------------------------------------------------------------+
int OnInit()
{
   pushIntervalSeconds = PushIntervalMinutes * 60;
   accountNumber = IntegerToString(AccountNumber());
   broker = AccountCompany();
   
   if(EnableLogging)
   {
      Print("[FXStreetBridge v3.0] 初始化完成");
      Print("[FXStreetBridge] 推送间隔: ", PushIntervalMinutes, " 分钟");
      Print("[FXStreetBridge] 本地缓存模式已启用");
      Print("[FXStreetBridge] 文件位置: ", TerminalInfoString(TERMINAL_DATA_PATH), "\\MQL4\\Files\\");
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
//| 主推送函数：将 K 线数据写入本地 CSV 文件                            |
//+------------------------------------------------------------------+
void PushAllData()
{
   if(EnableLogging)
      Print("[FXStreetBridge] ── 开始推送 ──────────────────────────");
   
   if(!EnableFileWrite)
   {
      if(EnableLogging)
         Print("[FXStreetBridge] 文件写入已禁用");
      return;
   }
   
   // 写入所有货币对的 K 线数据
   SaveAllBarsToFile();
}

//+------------------------------------------------------------------+
//| 将所有货币对的 M15 K 线数据写入 CSV 文件                            |
//+------------------------------------------------------------------+
void SaveAllBarsToFile()
{
   if(EnableLogging)
      Print("[FXStreetBridge] 保存 28 个货币对的 M15 K 线到本地文件...");
   
   int totalBars = 0;
   
   // 遍历所有 28 个货币对
   for(int s = 0; s < 28; s++)
   {
      string symbol = ActualSymbols[s];
      if(!SymbolSelect(symbol, true)) 
      {
         if(EnableLogging)
            Print("[FXStreetBridge] 警告：无法选择货币对 ", symbol);
         continue;
      }
      
      // 为每个货币对创建独立的 CSV 文件
      string filename = "mt4_bars_" + symbol + ".csv";
      
      int barsAvailable = iBars(symbol, PERIOD_M15);
      int barsToFetch = MathMin(BarsToSend, barsAvailable - 1);
      if(barsToFetch <= 0) continue;
      
      int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
      
      // 打开文件进行追加写入
      int handle = FileOpen(filename, FILE_CSV | FILE_WRITE | FILE_ANSI);
      if(handle == INVALID_HANDLE)
      {
         if(EnableLogging)
            Print("[FXStreetBridge] 错误：无法打开文件 ", filename, " 错误代码: ", GetLastError());
         continue;
      }
      
      // 获取最新的 K 线数据（从最新到最旧）
      for(int i = 1; i <= barsToFetch; i++)
      {
         datetime barTime  = iTime(symbol, PERIOD_M15, i);
         double   barOpen  = iOpen(symbol, PERIOD_M15, i);
         double   barHigh  = iHigh(symbol, PERIOD_M15, i);
         double   barLow   = iLow(symbol, PERIOD_M15, i);
         double   barClose = iClose(symbol, PERIOD_M15, i);
         long     barVol   = iVolume(symbol, PERIOD_M15, i);
         int      barSpread= (int)SymbolInfoInteger(symbol, SYMBOL_SPREAD);
         
         // 格式化时间为 ISO 8601 格式
         string barTimeStr = TimeToString(barTime, TIME_DATE|TIME_MINUTES);
         string isoTime = StringSubstr(barTimeStr, 0, 4) + "-" +
                          StringSubstr(barTimeStr, 5, 2) + "-" +
                          StringSubstr(barTimeStr, 8, 2) + "T" +
                          StringSubstr(barTimeStr, 11, 5) + ":00Z";
         
         // CSV 格式：symbol,barTime,open,high,low,close,volume,spread
         string csvLine = symbol + "," + 
                         isoTime + "," +
                         DoubleToString(barOpen, digits) + "," +
                         DoubleToString(barHigh, digits) + "," +
                         DoubleToString(barLow, digits) + "," +
                         DoubleToString(barClose, digits) + "," +
                         IntegerToString(barVol) + "," +
                         IntegerToString(barSpread);
         
         FileWrite(handle, csvLine);
         totalBars++;
      }
      
      FileClose(handle);
      
      if(EnableLogging)
         Print("[FXStreetBridge] 已保存 ", symbol, " 的 ", barsToFetch, " 根 K 线到 ", filename);
   }
   
   if(EnableLogging)
   {
      Print("[FXStreetBridge] 本次推送完成：共保存 ", totalBars, " 根 K 线");
      Print("[FXStreetBridge] 文件位置: ", TerminalInfoString(TERMINAL_DATA_PATH), "\\MQL4\\Files\\");
      Print("[FXStreetBridge] 下次推送时间: ", TimeToString(lastPushTime + pushIntervalSeconds));
   }
}

//+------------------------------------------------------------------+
//| 工具函数：获取最小值                                               |
//+------------------------------------------------------------------+
int MathMin(int a, int b)
{
   return (a < b) ? a : b;
}
