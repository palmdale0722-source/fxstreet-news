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

## TradingView 新闻流集成
- [ ] 数据库：新增 tradingview_news 表（存储 TradingView 新闻流）
- [ ] 后端：实现 TradingView 新闻流爬虫（标题、发布时间、摘要、链接）
- [ ] 后端：定时任务每小时抓取一次 TradingView 新闻流
- [ ] 后端：tRPC news.getTradingViewNews 接口
- [ ] 前端：删除"专家分析"栏目
- [ ] 前端：修改"FXStreet 新闻"页面，右侧改为显示 TradingView 新闻流

## G8 货币强弱矩阵 LLM 修复
- [x] 问题诊断：用户配置的 LLM API 在处理大型请求时超时（503 Service Unavailable）
- [x] 修改 currencyStrengthService.ts 使用 Manus 内置 LLM API（invokeLLM）
- [x] 修改 generateEconomicSummaries 使用 Manus 内置 LLM API
- [x] 删除不再使用的 callUserLLM 和 normalizeApiUrl 函数
- [x] 测试验证：货币强弱矩阵和刺客精选成功生成


## G8 货币强弱矩阵分组评分优化
- [x] 修改 currencyStrengthService 支持分组评分（按货币列表参数）
- [x] 实现两组评分：第 1 组（USD/EUR/JPY/GBP）、第 2 组（AUD/NZD/CAD/CHF）
- [x] 更新 cronJobs 配置为每 4 小时更新一次
- [x] 错开更新时间：第 1 组在偶数小时（0、4、8、12、16、20），第 2 组在奇数小时（2、6、10、14、18、22）
- [x] 测试分组评分功能
- [x] 测试定时更新機制
- [x] 验证刘客精选正确合并两组数据


## API 切换：从 Manus 内置改回用户自选
- [x] 恢复 currencyStrengthService 使用 callUserLLM（用户自选 API）
- [x] 恢复 generateEconomicSummaries 使用用户自选 API
- [x] 恢复 刘客精选使用用户自选 API
- [x] 测试 API 切换功能
- [x] 验证分组评分和用户 API 兼容性


## API 测试连接功能
- [x] 后端：实现 testApiConnection tRPC 接口
- [x] 前端：在 AI 分析师页面添加"测试连接"按颁
- [x] 前端：昺示测试结果（成功/失败）和错误信息
- [ ] 测试功能验证


## 货币强弱矩阵分离更新（减少 prompt 大小）
- [x] 后端：分离 updateCurrencyDrivers 函数（货币驱动力详情）
- [x] 后端：分离 updateAssassinPicks 函数（刺客精选）
- [x] 后端：分离 updateStrengthRanking 函数（实时强弱排行檜）
- [x] 后端：添加三个 tRPC 接口
- [x] 前端：在 UI 中添加三个独立的更新按颁
- [x] 测试三个部分的独立更新功能

## 修复货币强弱矩阵仅显示 4 个货币的问题
- [x] 后端：在 currencyStrengthService.ts 中添加数据合并逻辑
- [x] 后端：在 currencyStrengthSeparated.ts 中添加数据合并逻辑
- [x] 前端：修改更新流程以确保先更新驱动力，再更新刺客精选和排行榜
- [x] 测试修复效果（需要验证所有 8 个货币都能正常显示）

## 一键刷新按钮和 LLM API 优化
- [x] 前端：在货币强弱矩阵添加一键刷新按钮
- [x] 后端：切换 currencyStrengthService.ts 使用 Manus 自带 LLM API
- [x] 后端：切换 currencyStrengthSeparated.ts 使用 Manus 自带 LLM API
- [x] 后端：修改 cronJobs.ts 中的定时任务频率为每日一次
- [x] 测试一键刷新功能和每日更新机制

## 成本优化 - 关闭 Extended Thinking
- [x] 关闭 LLM API 中的 Extended Thinking 功能（server/_core/llm.ts）
- [x] 预计成本下降 80-90%（从 $4.68/周 降低到 ~$0.50/周）
- [x] 测试修改效果（编译通过，功能正常）


## MT4 传输数据错误修复
- [x] 检查 MT4 EA 代码中的请求配置（URL、API 密钥、请求头）
- [x] 检查后端 /api/mt4/tw 接口实现
- [x] 排查 CORS 和认证问题 - 找到根本原因：AT4_API_KEY 不匹配
- [x] 修复并测试 MT4 数据传输 - 设置 MT4_API_KEY = mt4-bridge-key-change-me，测试成功


## 排行榜更新时间显示和自动监控
- [ ] 数据库：添加更新时间戳到 currencyStrengthCache 表
- [ ] 后端：修改 safeRunStrengthMatrix 记录更新时间
- [ ] 后端：添加 getLastUpdateTime API 接口
- [ ] 前端：在排行榜上显示最后更新时间
- [ ] 前端：添加更新状态指示器（更新中/已完成）
- [ ] 前端：添加自动检查更新状态的机制（每 5 分钟检查一次）
- [ ] 前端：添加手动刷新按钮
- [ ] 测试完整功能


## 交易信号 AI Prompt 可配置化
- [x] 数据库：新增 signal_ai_prompts 表（存储自定义 System Prompt 版本）
- [x] 后端：db.ts 新增 Signal AI Prompt 管理函数
- [ ] 后端：tRPC signalPrompt.getCurrent（获取当前使用的 Prompt）
- [ ] 后端：tRPC signalPrompt.save（保存新的 Prompt 版本）
- [ ] 后端：tRPC signalPrompt.getHistory（获取历史版本列表）
- [ ] 后端：tRPC signalPrompt.rollback（回滚到历史版本）
- [ ] 后端：修改 signalAnalyzer.ts 使用数据库中的自定义 Prompt
- [ ] 前端：新增 /signals/prompt-config 页面
- [ ] 前端：Prompt 编辑器（支持预览、保存、版本对比）
- [ ] 前端：版本历史面板（查看、恢复历史版本）
- [ ] 测试：验证自定义 Prompt 在信号分析中生效

## 全系统自检功能
- [ ] 数据库：新增 system_health_reports 表（存储自检历史报告）
- [ ] 后端：实现 systemHealthCheck 服务（检查 IMAP、AI 分析、数据抓取、数据库等模块）
- [ ] 后端：tRPC system.runHealthCheck（手动触发自检）
- [ ] 后端：tRPC system.getHealthReports（获取历史报告）
- [ ] 后端：cronJobs.ts 添加每周一 09:00（北京时间）自动自检定时任务
- [ ] 后端：自检完成后通过 Manus 通知推送报告摘要
- [ ] 前端：/system-health 页面（手动触发 + 历史报告列表）
- [ ] 前端：导航栏添加「系统自检」入口（管理员可见）

## AI API 配置持久化（服务器端存储）
- [x] 数据库：已有 userApiConfigs 表（存储 API 地址、密鉅、模型名称等）
- [x] 后端：tRPC userApiConfig.get（返回完整配置，包括 apiKey 明文）
- [x] 后端：tRPC userApiConfig.save（保存配置到数据库）
- [x] 前端：Agent 页面登录后从服务器加载 API 配置，保存时同步写入数据库，不再依赖 localStorage

## Bug 修复 - AI 分析师"标的分析"和"自由讨论"按钮无反应
- [x] 根本原因：createAgentSession 使用 $returningId() 导致 500 错误（agentSessions 表无 primaryKey 标注）
- [x] 修复：改用 (result[0] as { insertId: number }).insertId 获取插入 ID


## MT4 推送稳定性改进 - 本地缓存 + 批量上传
- [x] 创建改进版 MT4 EA (FXStreetBridge_v3_LocalCache.mq4)：改为本地 CSV 文件缓存
- [x] 编写 Python 上传脚本 (upload_mt4_data.py)：每 30 分钟读取并批量上传本地缓存
- [x] 后端添加 /api/mt4/batch-upload 接口：处理批量数据上传和入库
- [x] 编写 Windows 任务计划器配置指南 (Windows_Task_Scheduler_Setup.md)
- [x] 编写完整实施指南 (IMPLEMENTATION_GUIDE.md)
- [ ] 在 MT4 中部署新 EA 并测试
- [ ] 在 Windows 电脑上配置 Python 脚本和任务计划器
- [ ] 监控一周的数据完整性和推送稳定性
- [ ] 根据实际情况调整上传频率（可改为 1 小时或其他）
