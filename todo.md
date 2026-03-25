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

## Bug 修复 - AI 分析师货币对按钮
- [x] 修复：除 EUR/USD 外其他货币对按鈕无法点击的问题（重构 newSession onSuccess 回调，将下拉菜单改为 fixed 定位）

## 实时外汇行情接入
- [x] 后端：构建 getForexQuote(pair) 函数，通过 Yahoo Finance API 获取实时 OHLC 行情
- [x] 后端：计算技术指标（RSI14、SMA20/50/200、MACD、布林带、ATR14）并注入 AI Prompt
- [x] 后端：更新 agent.chat 路由，在系统 Prompt 中注入实时行情数据
- [x] 前端：对话界面顶部展示实时价格标签（当前价、涨跌幅、日内高低点，每30s自动刷新）
- [x] 后端：新增 agent.getQuote tRPC 接口供前端查询实时价格

## MT4 数据推送桥
- [x] 数据库：新增 mt4_bars 表和 mt4_status 表
- [x] 后端：创建 mt4Service.ts，实现数据存储和技术指标计算（SMA/RSI）
- [x] 后端：创建 mt4Routes.ts，接收 EA 推送的 HTTP POST 请求（含 API 密钥鉴权）
- [x] 后端：更新 agent.chat，优先使用 MT4 数据，降级回 Yahoo Finance
- [x] 前端：对话界面顶部显示 MT4 连接状态指示器（在线/离线、最后推送时间）
- [x] MQL4 EA：编写 FXStreetBridge.mq4，28对、M15、每15分钟推送、含 API 密钥鉴权
- [x] 安装说明：mt4/README.md 详细安装步骤

## TradingView 交易想法采集
- [x] 数据库：新增 tv_ideas 表（存储 TradingView 交易想法）
- [x] 后端：实现 TradingView RSS 采集函数（解析货币对、作者、图表图片）
- [x] 后端：定时任务每小时采集一次 TradingView 外汇交易想法
- [x] 后端：tRPC ideas.getRecent 接口（支持货币对筛选）
- [x] 后端：AI 分析师上下文注入相关货币对的 TradingView 社区观点（最新 5 条）
- [x] 前端：导航栏添加“交易想法”入口
- [x] 前端：/ideas 页面，展示 TradingView 交易想法列表（含图表缩略图、作者、货币对标签）
- [x] 前端：支持按货币对筛选

## TradingView 交易想法过滤
- [x] 后端：采集时过滤无关品种，只保留外汇、黄金（XAU/XAG）、股指相关内容（白名单+黑名单双重过滤）
- [x] 数据库：清理已入库的无关条目（删除加密货币、个股、原油等）

## AI 分析师强化 - 个人专属交易顾问
- [x] 数据库：新增 mt4_indicator_signals 表（自定义指标信号）
- [x] 数据库：新增 trade_journal 表（历史交易记录）
- [x] 数据库：新增 trading_system 表（交易思想与体系知识库）
- [x] 数据库：新增 mt4_indicator_configs 表（指标配置管理）
- [x] 后端：更新 mt4Routes.ts，新增 /api/mt4/indicator-signal 自定义指标信号接收接口
- [x] 后端：新增 tRPC indicatorConfig 路由（增删改查）
- [x] 后端：新增 tRPC tradeJournal 路由（增删改查）
- [x] 后端：新增 tRPC tradingSystem 路由（增删改查）
- [x] 前端：新增 /my-system 「交易体系」管理页面（交易体系、历史交易记录、指标配置三个标签页）
- [x] 后端：更新 AI 分析师系统 Prompt，注入交易体系、自定义指标信号、历史交易记录全部上下文
- [x] 前端：导航栏添加「交易体系」入口

## IMAP 邮箱设置（交易信号页面）
- [ ] 数据库：新增 imap_config 表（存储邮箱账号、密码、服务器、端口等配置）
- [ ] 后端：tRPC signals.getImapConfig（获取当前配置，密码脱敏）
- [ ] 后端：tRPC signals.saveImapConfig（保存配置，写入数据库并更新运行时）
- [ ] 后端：tRPC signals.testImapConnection（测试连接，不入库，仅验证连通性）
- [ ] 后端：cronJobs.ts 优先从数据库读取 IMAP 配置，降级到环境变量
- [ ] 前端：交易信号页面顶部新增「邮箱设置」按钮（仅管理员可见）
- [ ] 前端：邮箱设置 Dialog（邮箱地址、密码/授权码、IMAP 服务器、端口、TLS）
- [ ] 前端：「测试连接」按钮，实时显示连接结果
- [ ] 前端：保存后自动触发一次邮件拉取

## Bug 修复 - AI 自动分析未触发
- [x] Agent.tsx API 配置保存只写 localStorage，未同步到数据库，导致 signalAnalyzer 无法获取配置

## AI 分析师自由讨论模式
- [x] Agent 页面新增「自由讨论」模式，不绑定具体货币对标的
- [x] 自由讨论模式下 system prompt 聚焦交易体系/市场行情/复盘，不强调特定标的
- [x] 会话列表区分「标的分析」和「自由讨论」两种类型
- [x] 后端 agent.newSession 支持 pair=undefined 创建自由讨论会话

## 交易体系 - 历史对话板块
- [x] TradingSystem 页面新增「历史对话」 Tab
- [x] 支持手动输入/粘贴历史对话内容（标题 + 正文）
- [x] 支持查看、编辑、删除历史对话记录
- [x] 数据库新增 trading_conversations 表
- [ ] AI 分析师上下文注入历史对话摘要（待后续完善）
## 交易信号自动推送通知
- [x] 数据库：新增 notify_config 表（存储邮件/飞书推送配置，全局单条记录）
- [x] 后端：新增 server/notifyService.ts 统一推送服务（邮件 + 飞书 Webhook）
  - [x] 邮件推送：nodemailer SMTP，发送 HTML 格式分析报告邮件
  - [x] 飞书推送：Webhook 发送富文本卡片消息（绿色/黄色标题区分决策）
- [x] 后端：db.ts 新增 getNotifyConfig / saveNotifyConfig 函数
- [x] 后端：routers.ts 新增 notifyConfig 路由
  - [x] notifyConfig.get（获取配置，密码脱敏）
  - [x] notifyConfig.save（保存配置，空密码保留原值）
  - [x] notifyConfig.testEmail（发送测试邮件）
  - [x] notifyConfig.testFeishu（发送飞书测试消息）
- [x] 后端：signalAnalyzer.ts 集成外部推送，分析完成后同时调用 Manus 通知 + 邮件/飞书推送
  - [x] 任意渠道成功即标记 notified=true
  - [x] 仅 execute / watch 决策触发推送，ignore 不推送
- [x] 前端：MySystem.tsx 新增「通知设置」Tab
  - [x] 邮件推送开关 + SMTP 配置（服务器/端口/SSL/账号/密码）
  - [x] 飞书 Webhook 推送开关 + URL 配置
  - [x] 测试按钮（发送测试邮件 / 飞书测试消息）
  - [x] 密码字段显示/隐藏切换
  - [x] 保存时空密码不覆盖原有密码
- [x] 依赖：package.json 新增 nodemailer + @types/nodemailer

## 通知机制简化
- [ ] notifyService.ts 移除 notify_config 数据库依赖，硬编码收件人 3178903@qq.com
- [ ] notifyService.ts 使用 IMAP 邮箱（IMAP_EMAIL/IMAP_PASSWORD 环境变量）的 SMTP 配置发送邮件
- [ ] signalAnalyzer.ts 和 tvIdeaAnalyzer.ts 直接调用简化后的推送函数
- [ ] 移除「交易体系」中的「通知设置」Tab（不再需要配置界面）
- [ ] 保留 Manus 内部通知（notifyOwner）作为主要通知渠道
