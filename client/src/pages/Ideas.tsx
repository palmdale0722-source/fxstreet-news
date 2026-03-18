import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Clock, User, ChevronLeft, RefreshCw } from "lucide-react";

const G8_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
  "USD/CAD", "AUD/USD", "NZD/USD",
  "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/CAD",
  "EUR/AUD", "EUR/NZD",
  "GBP/JPY", "GBP/CHF", "GBP/CAD", "GBP/AUD", "GBP/NZD",
  "CHF/JPY", "CAD/JPY", "AUD/JPY", "NZD/JPY",
  "AUD/CAD", "AUD/CHF", "AUD/NZD",
  "CAD/CHF", "NZD/CAD", "NZD/CHF",
];

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

export default function Ideas() {
  const [selectedPair, setSelectedPair] = useState<string | undefined>(undefined);

  const { data: ideas, isLoading, refetch } = trpc.ideas.getRecent.useQuery(
    { pair: selectedPair, limit: 50 },
    { refetchInterval: 5 * 60 * 1000 }
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1 text-gray-500 hover:text-gray-800">
                <ChevronLeft className="w-4 h-4" />
                返回
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-bold text-gray-900">TradingView 交易想法</h1>
            </div>
            <Badge variant="secondary" className="text-xs">
              来自 TradingView 社区
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1 text-gray-500"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* 货币对筛选器 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">按货币对筛选</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedPair(undefined)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                !selectedPair
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              全部
            </button>
            {G8_PAIRS.map((pair) => (
              <button
                key={pair}
                onClick={() => setSelectedPair(selectedPair === pair ? undefined : pair)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedPair === pair
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {pair}
              </button>
            ))}
          </div>
        </div>

        {/* 文章列表 */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-40 bg-gray-100 rounded-lg mb-3" />
                <div className="h-4 bg-gray-100 rounded mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : !ideas || ideas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">
              {selectedPair ? `暂无 ${selectedPair} 的交易想法` : "暂无交易想法数据"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              数据将在下次定时任务运行时自动采集
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              共 <span className="font-semibold text-gray-700">{ideas.length}</span> 条
              {selectedPair && <span>（筛选：{selectedPair}）</span>}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ideas.map((idea) => (
                <a
                  key={idea.id}
                  href={idea.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all group block"
                >
                  {/* 图表截图 */}
                  {idea.imageUrl ? (
                    <div className="relative h-40 overflow-hidden bg-gray-100">
                      <img
                        src={idea.imageUrl}
                        alt={idea.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {idea.pair && (
                        <div className="absolute top-2 left-2">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-md shadow">
                            {idea.pair}
                          </span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="bg-black/60 text-white p-1 rounded">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-20 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-center">
                      {idea.pair && (
                        <span className="text-2xl font-bold text-blue-400 opacity-50">{idea.pair}</span>
                      )}
                    </div>
                  )}

                  {/* 文章内容 */}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {idea.title}
                    </h3>
                    {idea.description && (
                      <p className="text-gray-500 text-xs leading-relaxed line-clamp-2 mb-3">
                        {idea.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="font-medium text-gray-600">{idea.author || "匿名"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(new Date(idea.publishedAt))}</span>
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}

        {/* 来源声明 */}
        <div className="mt-8 text-center text-xs text-gray-400">
          交易想法来自{" "}
          <a
            href="https://www.tradingview.com/markets/currencies/ideas/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            TradingView
          </a>
          {" "}社区，仅供参考，不构成投资建议。
        </div>
      </div>
    </div>
  );
}
