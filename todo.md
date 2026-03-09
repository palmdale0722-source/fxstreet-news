# FXStreet 外汇资讯平台 TODO

## 数据库 & 后端
- [x] 设计并创建数据库 Schema（news, insights, outlooks, subscriptions）
- [x] 实现 RSS 抓取工具函数（News + Analysis 两种类型）
- [x] 实现 AI 生成市场洞察（summary、geopolitics、energy、forex、assets、tradingAdvice）
- [x] 实现 AI 生成八种货币展望（EUR/USD/JPY/AUD/GBP/NZD/CHF/CAD）
- [x] tRPC 路由：news.getRecent、news.getBySource
- [x] tRPC 路由：insights.getToday
- [x] tRPC 路由：outlooks.getToday
- [x] tRPC 路由：subscription.subscribe
- [x] 定时任务：每小时自动抓取 RSS 并生成 AI 分析
- [x] 手动触发更新接口：/api/admin/trigger-update

## 前端
- [x] 全局样式：琥珀色主题、Playfair Display + Lora + Inter 字体
- [x] 顶部导航栏（Logo、登录/登出按钮）
- [x] Hero 区域（标题、副标题、当前时间）
- [x] 今日市场洞察卡片（AI 生成内容）
- [x] 最新新闻列表（最多 8 条）
- [x] 专家分析列表（最多 5 条）
- [x] 货币展望卡片网格（8 种货币）
- [x] 邮件订阅表单（登录后可用）
- [x] 页脚

## 测试
- [x] 后端 tRPC 路由单元测试
- [x] 验证 RSS 抓取功能
