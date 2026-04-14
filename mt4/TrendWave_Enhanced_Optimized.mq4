#property copyright "TrendWave Enhanced - Optimized"
#property indicator_separate_window
#property indicator_minimum -100.0
#property indicator_maximum 100.0
#property indicator_levelcolor SlateGray
#property indicator_levelstyle 1
#property indicator_buffers 12
#property indicator_color1 Lime
#property indicator_color2 Red
#property indicator_color3 Aqua
#property indicator_color4 Yellow
#property indicator_color5 Aqua
#property indicator_color6 Yellow
#property indicator_color7 clrOrange
#property indicator_color8 clrOrange

//--- plot Strong Buy
#property indicator_label3  "Strong Buy"
#property indicator_type3   DRAW_ARROW
#property indicator_color3  clrAqua
#property indicator_width3  3
//--- plot Strong Sell
#property indicator_label4  "Strong Sell"
#property indicator_type4   DRAW_ARROW
#property indicator_color4  clrYellow
#property indicator_width4  3

extern int WavePeriod = 10;
extern int AvgPeriod = 21;
extern bool SoundAlert = True;
extern bool EmailAlert = True;

// New parameters for KTI and dynamic threshold
extern int KTI_T = 10;
extern int KTI_M = 5;
extern int KTI_N = 10;
extern int ER_Period = 21;
extern int ER_Lookback = 180;
extern double BaseThreshold = 50.0;
extern double DynamicRange = 10.0;

// ★ 优化：添加 ER 缓存数组
double g_er_cache[];
int g_er_cache_size = 0;

double g_ibuf_92[];
double g_ibuf_96[];
double g_ibuf_100[];
double g_ibuf_104[];
double g_ibuf_108[];
double g_ibuf_112[];
double g_ibuf_116[];
double g_ibuf_120[];
double g_ibuf_buy_strong[];
double g_ibuf_sell_strong[];
double g_ibuf_buy_weak[];
double g_ibuf_sell_weak[];
double g_ibuf_buy_threshold[];
double g_ibuf_sell_threshold[];

// 用于控制重复告警和打印的全局变量
datetime last_alert_bar_time = 0;
string last_alert_signature = "";
string last_debug_signature = ""; // 核心：用于防止每秒刷屏的调试锁

int init() {
   IndicatorShortName("TrendWave Enhanced V2 - Optimized");
   SetIndexBuffer(0, g_ibuf_100); SetIndexStyle(0, DRAW_NONE);
   SetIndexBuffer(1, g_ibuf_112); SetIndexStyle(1, DRAW_NONE);
   SetIndexBuffer(2, g_ibuf_104); SetIndexStyle(2, DRAW_NONE);
   SetIndexBuffer(3, g_ibuf_108); SetIndexStyle(3, DRAW_NONE);
   SetIndexBuffer(4, g_ibuf_92);  SetIndexStyle(4, DRAW_LINE, STYLE_SOLID, 1, Lime);
   SetIndexBuffer(5, g_ibuf_96);  SetIndexStyle(5, DRAW_LINE, STYLE_SOLID, 1, Red);
   
   SetIndexBuffer(6, g_ibuf_buy_strong); SetIndexStyle(6, DRAW_ARROW, STYLE_SOLID, 3, Aqua); SetIndexArrow(6, 159);
   SetIndexBuffer(7, g_ibuf_sell_strong); SetIndexStyle(7, DRAW_ARROW, STYLE_SOLID, 3, Yellow); SetIndexArrow(7, 159);
   SetIndexBuffer(8, g_ibuf_buy_weak); SetIndexStyle(8, DRAW_ARROW, STYLE_SOLID, 2, Aqua); SetIndexArrow(8, 9);
   SetIndexBuffer(9, g_ibuf_sell_weak); SetIndexStyle(9, DRAW_ARROW, STYLE_SOLID, 2, Yellow); SetIndexArrow(9, 9);
   
   SetIndexBuffer(10, g_ibuf_buy_threshold); SetIndexStyle(10, DRAW_LINE, STYLE_DOT, 1, clrOrange);
   SetIndexBuffer(11, g_ibuf_sell_threshold); SetIndexStyle(11, DRAW_LINE, STYLE_DOT, 1, clrOrange);
   
   // ★ 优化：初始化 ER 缓存
   ArrayResize(g_er_cache, 1000);
   
   return (0);
}

string PeriodToString(int period) {
   switch(period) {
      case PERIOD_M1:   return "M1"; case PERIOD_M5:   return "M5";
      case PERIOD_M15:  return "M15"; case PERIOD_M30:  return "M30";
      case PERIOD_H1:   return "H1"; case PERIOD_H4:   return "H4";
      case PERIOD_D1:   return "D1"; default:          return "Unknown";
   }
}

double CalculateER(int period, int shift) {
   if(shift + period + 1 >= Bars) return 0;
   double direction = MathAbs(Close[shift] - Close[shift + period]);
   double volatility = 0;
   for(int i = 0; i < period; i++) volatility += MathAbs(Close[shift + i] - Close[shift + i + 1]);
   return (volatility < 0.0001) ? 0 : direction / volatility;
}

// ★ 优化：使用缓存的 ER 值
double CalculateERPercentile(int shift) {
   // 确保缓存足够大
   if(shift >= ArraySize(g_er_cache)) {
      ArrayResize(g_er_cache, shift + 100);
   }
   
   // 如果缓存中没有这个值，计算并缓存
   if(g_er_cache[shift] == 0 && shift > 0) {
      g_er_cache[shift] = CalculateER(ER_Period, shift);
   }
   
   double current_er = g_er_cache[shift];
   double max_er = 0;
   
   // ★ 优化：只遍历已缓存的 ER 值
   int lookback_limit = MathMin(shift + ER_Lookback, Bars - 1);
   for(int i = shift; i < lookback_limit; i++) {
      // 确保缓存中有值
      if(i >= ArraySize(g_er_cache)) {
         ArrayResize(g_er_cache, i + 100);
      }
      if(g_er_cache[i] == 0 && i > 0) {
         g_er_cache[i] = CalculateER(ER_Period, i);
      }
      
      double er = g_er_cache[i];
      if(er > max_er) max_er = er;
   }
   
   return (max_er < 0.0001) ? 0 : current_er / max_er;
}

int start() {
   int li_8 = IndicatorCounted();
   if (li_8 < 0) return (-1);
   if (li_8 > 0) li_8--;
   int li_12 = Bars - li_8;

   // ★ 优化：限制处理的 K 线数量
   // 只处理最近 100 根 K 线，而不是全部历史数据
   int max_bars_to_process = MathMin(li_12, 100);
   
   // 基础 TrendWave 计算 (ESA -> DD -> CI)
   for (int i = max_bars_to_process; i >= 0; i--) g_ibuf_100[i] = iMA(NULL, 0, WavePeriod, 0, MODE_EMA, PRICE_TYPICAL, i);
   for (i = max_bars_to_process; i >= 0; i--) g_ibuf_112[i] = MathAbs((High[i] + Close[i] + Low[i]) / 3.0 - g_ibuf_100[i]);
   for (i = max_bars_to_process; i >= 0; i--) g_ibuf_104[i] = iMAOnArray(g_ibuf_112, 0, WavePeriod, 0, MODE_EMA, i);
   for (i = max_bars_to_process; i >= 0; i--) {
      if (g_ibuf_104[i] > 0.0) g_ibuf_108[i] = ((High[i] + Close[i] + Low[i]) / 3.0 - g_ibuf_100[i]) / (0.015 * g_ibuf_104[i]);
      else g_ibuf_108[i] = 0;
   }
   for (i = max_bars_to_process; i >= 0; i--) g_ibuf_92[i] = iMAOnArray(g_ibuf_108, 0, AvgPeriod, 0, MODE_EMA, i);
   for (i = max_bars_to_process; i >= 0; i--) g_ibuf_96[i] = iMAOnArray(g_ibuf_92, 0, 4, 0, MODE_SMA, i);

   // ★ 优化：增强信号逻辑（只处理最近的 K 线）
   for (i = max_bars_to_process; i >= 0; i--) {
      double er_percentile = CalculateERPercentile(i);
      double buy_threshold = -(BaseThreshold + DynamicRange * er_percentile);
      double sell_threshold = BaseThreshold + DynamicRange * er_percentile;
      
      g_ibuf_buy_threshold[i] = buy_threshold;
      g_ibuf_sell_threshold[i] = sell_threshold;
      
      double kti = iCustom(NULL, 0, "KTI", KTI_T, KTI_M, KTI_N, 0, i);
      datetime bar_time = Time[i];

      g_ibuf_buy_strong[i] = EMPTY_VALUE; g_ibuf_sell_strong[i] = EMPTY_VALUE;
      g_ibuf_buy_weak[i] = EMPTY_VALUE;   g_ibuf_sell_weak[i] = EMPTY_VALUE;

      // --- 买入检测 ---
      if (g_ibuf_92[i] >= g_ibuf_96[i] && g_ibuf_92[i+1] <= g_ibuf_96[i+1] && g_ibuf_92[i] < buy_threshold) {
         string buy_sig_sig = TimeToStr(bar_time) + "|Buy";
         if (i <= 2 && buy_sig_sig != last_debug_signature) {
             Print("TW Buy detected: Bar ", i, " Bull:", DoubleToStr(g_ibuf_92[i], 2), " KTI:", kti);
             last_debug_signature = buy_sig_sig;
         }
         
         if (kti == 0) {
            g_ibuf_buy_strong[i] = g_ibuf_92[i];
            if (i == 1) SendAlert("Strong Buy", bar_time);
         } else if (kti >= 1) {
            g_ibuf_buy_weak[i] = g_ibuf_92[i];
            if (i == 1) SendAlert("Weak Buy", bar_time);
         }
      }

      // --- 卖出检测 ---
      if (g_ibuf_92[i] <= g_ibuf_96[i] && g_ibuf_92[i+1] >= g_ibuf_96[i+1] && g_ibuf_92[i] > sell_threshold) {
         string sell_sig_sig = TimeToStr(bar_time) + "|Sell";
         if (i <= 2 && sell_sig_sig != last_debug_signature) {
             Print("TW Sell detected: Bar ", i, " Bull:", DoubleToStr(g_ibuf_92[i], 2), " KTI:", kti);
             last_debug_signature = sell_sig_sig;
         }

         if (kti == 0) {
            g_ibuf_sell_strong[i] = g_ibuf_96[i];
            if (i == 1) SendAlert("Strong Sell", bar_time);
         } else if (kti >= 1) {
            g_ibuf_sell_weak[i] = g_ibuf_96[i];
            if (i == 1) SendAlert("Weak Sell", bar_time);
         }
      }
   }
   return (0);
}

void SendAlert(string signal_type, datetime bar_time) {
   string signature = Symbol() + "|" + PeriodToString(Period()) + "|" + signal_type + "|" + TimeToStr(bar_time);
   if(signature == last_alert_signature) return;
   
   string alert_message = "[" + PeriodToString(Period()) + "] " + Symbol() + " => " + signal_type;
   if (SoundAlert) Alert(alert_message);
   if (EmailAlert) SendMail("TrendWave Alert", alert_message);
   
   last_alert_signature = signature;
}
