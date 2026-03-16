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

## 交易信号模块
- [x] 数据库：新增 signals 表（id, subject, body, fromEmail, receivedAt, status, createdAt）
- [x] 数据库：新增 signal_notes 表（id, signalId, userId, content, updatedAt）
- [x] 后端：IMAP 服务，连接 163 邮箱拉取新邮件并入库（imap.163.com:993）
- [x] 后端：定时任务每5分钟拉取一次新邮件
- [x] 后端：tRPC signals.list（分页、状态筛选）
- [x] 后端：tRPC signals.updateStatus（更新信号状态：pending/executed/ignored/watching）
- [x] 后端：tRPC signals.upsertNote（新增/更新备注，记录操作人和时间）
- [x] 后端：tRPC signals.fetchNow（手动触发立即拉取）
- [x] 前端：导航栏添加“交易信号”入口
- [x] 前端：/signals 页面，展示信号列表（主题、正文、时间、状态标签）
- [x] 前端：状态筛选栏（全部/待处理/已执行/已忽略/观察中）
- [x] 前端：每条信号可展开查看完整正文
- [x] 前端：备注编辑区（多人协作，显示最后修改人和时间）
- [x] 前端：手动拉取按钮（管理员可见）
- [x] 配置 163 邮箱 IMAP 密鑰（IMAP_EMAIL + IMAP_PASSWORD）

## Bug 修复 - 邮件正文乱码
- [x] 修复 imapService.ts 中邮件正文 Base64 解码问题
- [x] 清理数据库中已入库的乱码信号数据

## Bug 排查 - 新闻停止更新
- [x] 检查服务器日志，确认 RSS 抓取是否报错
- [x] 检查数据库最新新闻时间，确认最后一次成功更新时间
- [x] 修复新闻停止更新的根本原因

## AI 交易分析 Agent 页面
- [x] 数据库：新增 agent_sessions 表（会话）和 agent_messages 表（对话历史）
- [x] 后端：构建系统 Prompt，注入历史新闻、货币展望、市场洞察作为上下文
- [x] 后端：tRPC agent.chat 路由（支持多轮对话）
- [x] 后端：tRPC agent.getSessions / agent.getMessages / agent.newSession / agent.deleteSession
- [x] 前端：/agent 页面，左侧会话列表，右侧对话区
- [x] 前端：货币对快捷选择器（G8 全部 28 个货币对）
- [x] 前端：Markdown 渲染 AI 回复
- [x] 前端：技术分析快捷提问按鈕（趋势方向/关键点位/入场建议/风险评估/技术形态/市场情绪）
- [x] 前端：导航栏添加“AI 分析师”入口
- [x] 测试：新增 agent 路由 Vitest 单元测试（8 个测试用例）
