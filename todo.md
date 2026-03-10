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

## 手动更新功能
- [x] 后端：admin.triggerUpdate 路由返回详细更新结果（新增新闻数、分析数、洞察状态、货币展望数）
- [x] 前端：导航栏添加“手动更新”按钮（仅管理员可见）
- [x] 前端：点击后显示加载状态（旋转图标 + 进度提示）
- [x] 前端：更新完成后弹出结果摘要 Dialog（展示各项更新数量和状态）
- [x] 前端：更新完成后自动刷新页面数据

## 货币展望卡片修复
- [x] 移除货币展望卡片中的“查看详情”链接
- [x] 取消展望文字的 line-clamp 截断，完整展示 AI 分析内容
- [x] 后端生成展望时不再写入 sourceLink 字段（或忽略该字段）

## Bug 修复
- [x] 手动更新后前端新文章未刷新（invalidate 未生效）
