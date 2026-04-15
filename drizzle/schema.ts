import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, mysqlEnum, text, timestamp, varchar, index, longtext, date, boolean, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const agentMessages = mysqlTable("agent_messages", {
	id: int().autoincrement().notNull(),
	sessionId: int().notNull(),
	role: mysqlEnum(['user','assistant']).notNull(),
	content: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const agentSessions = mysqlTable("agent_sessions", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	title: varchar({ length: 255 }).default('新对话').notNull(),
	pair: varchar({ length: 20 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const currencyStrengthCache = mysqlTable("currency_strength_cache", {
	id: int().autoincrement().notNull(),
	matrixJson: text().notNull(),
	economicSummariesJson: text(),
	generatedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const customAiMessages = mysqlTable("custom_ai_messages", {
	id: int().autoincrement().notNull(),
	sessionId: int().notNull(),
	role: varchar({ length: 20 }).notNull(),
	content: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const customAiSessions = mysqlTable("custom_ai_sessions", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	title: varchar({ length: 255 }).default('新对话').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const imapConfig = mysqlTable("imap_config", {
	id: int().autoincrement().notNull(),
	email: varchar({ length: 320 }).notNull(),
	password: text().notNull(),
	host: varchar({ length: 255 }).default('imap.163.com').notNull(),
	port: int().default(993).notNull(),
	tls: tinyint().default(1).notNull(),
	active: tinyint().default(1).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const insights = mysqlTable("insights", {
	id: int().autoincrement().notNull(),
	date: varchar({ length: 10 }).notNull(),
	summary: text().notNull(),
	geopolitics: text(),
	energy: text(),
	forex: text(),
	assets: text(),
	tradingAdvice: text(),
	generatedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("insights_date_unique").on(table.date),
]);

export const mt4Bars = mysqlTable("mt4_bars", {
	id: int().autoincrement().notNull(),
	symbol: varchar({ length: 20 }).notNull(),
	timeframe: varchar({ length: 10 }).default('M15').notNull(),
	barTime: timestamp({ mode: 'string' }).notNull(),
	open: text().notNull(),
	high: text().notNull(),
	low: text().notNull(),
	close: text().notNull(),
	volume: varchar({ length: 32 }).default('0').notNull(),
	spread: int().default(0),
	pushedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_symbol_bartime").on(table.symbol, table.barTime),
]);

export const mt4IndicatorConfigs = mysqlTable("mt4_indicator_configs", {
	id: int().autoincrement().notNull(),
	indicatorName: varchar({ length: 128 }).notNull(),
	displayName: varchar({ length: 128 }).notNull(),
	indicatorType: mysqlEnum(['trend','oscillator','volume','custom']).default('custom'),
	params: text(),
	interpretation: text().notNull(),
	bufferIndex: int().default(0),
	active: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("mt4_indicator_configs_indicatorName_unique").on(table.indicatorName),
]);

export const mt4IndicatorSignals = mysqlTable("mt4_indicator_signals", {
	id: int().autoincrement().notNull(),
	symbol: varchar({ length: 20 }).notNull(),
	timeframe: varchar({ length: 10 }).notNull(),
	indicatorName: varchar({ length: 128 }).notNull(),
	value1: text(),
	value2: text(),
	value3: text(),
	signal: mysqlEnum(['buy','sell','neutral','overbought','oversold']).default('neutral'),
	description: text(),
	pushedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const mt4Status = mysqlTable("mt4_status", {
	id: int().autoincrement().notNull(),
	clientId: varchar({ length: 64 }).notNull(),
	accountNumber: varchar({ length: 64 }),
	broker: varchar({ length: 128 }),
	symbolsCount: int().default(0),
	lastPushedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("mt4_status_clientId_unique").on(table.clientId),
]);

export const mt4TfSignals = mysqlTable("mt4_tf_signals", {
	id: int().autoincrement().notNull(),
	symbol: varchar({ length: 16 }).notNull(),
	timeframe: varchar({ length: 8 }).notNull(),
	barTime: timestamp({ mode: 'string' }).notNull(),
	signal: mysqlEnum(['buy','sell']).notNull(),
	pushedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("uq_tf_symbol_tf_bar").on(table.symbol, table.timeframe, table.barTime),
]);

export const mt4TwValues = mysqlTable("mt4_tw_values", {
	id: int().autoincrement().notNull(),
	symbol: varchar({ length: 16 }).notNull(),
	timeframe: varchar({ length: 8 }).notNull(),
	barTime: timestamp({ mode: 'string' }).notNull(),
	bull: varchar({ length: 24 }).notNull(),
	bear: varchar({ length: 24 }).notNull(),
	threshold: varchar({ length: 24 }),
	pushedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("uq_tw_symbol_tf_bar").on(table.symbol, table.timeframe, table.barTime),
]);

export const news = mysqlTable("news", {
	id: int().autoincrement().notNull(),
	title: text().notNull(),
	link: varchar({ length: 1024 }).notNull(),
	description: text(),
	publishedAt: timestamp({ mode: 'string' }).notNull(),
	source: mysqlEnum(['News','Analysis']).default('News').notNull(),
	author: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("news_link_unique").on(table.link),
]);

export const notifyConfig = mysqlTable("notify_config", {
	id: int().autoincrement().notNull(),
	emailEnabled: tinyint().default(0).notNull(),
	toEmail: varchar({ length: 320 }),
	smtpHost: varchar({ length: 255 }),
	smtpPort: int().default(465),
	smtpSecure: tinyint().default(1),
	smtpUser: varchar({ length: 320 }),
	smtpPass: varchar({ length: 512 }),
	feishuEnabled: tinyint().default(0).notNull(),
	feishuWebhookUrl: varchar({ length: 1024 }),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const outlooks = mysqlTable("outlooks", {
	id: int().autoincrement().notNull(),
	date: varchar({ length: 10 }).notNull(),
	currency: varchar({ length: 10 }).notNull(),
	outlook: text().notNull(),
	sentiment: mysqlEnum(['bullish','bearish','neutral']).default('neutral').notNull(),
	riskLabel: varchar({ length: 50 }),
	sourceLink: varchar({ length: 1024 }),
	generatedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const signalAnalyses = mysqlTable("signal_analyses", {
	id: int().autoincrement().notNull(),
	signalId: int().notNull(),
	decision: mysqlEnum(['execute','watch','ignore']).notNull(),
	confidence: int().default(50).notNull(),
	summary: text().notNull(),
	reasoning: text().notNull(),
	marketContext: text(),
	riskWarning: text(),
	analyzedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	notified: tinyint().default(0).notNull(),
},
(table) => [
	index("signalId_unique").on(table.signalId),
]);

export const signalNotes = mysqlTable("signal_notes", {
	id: int().autoincrement().notNull(),
	signalId: int().notNull(),
	userId: int().notNull(),
	userName: varchar({ length: 255 }),
	content: text().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const signals = mysqlTable("signals", {
	id: int().autoincrement().notNull(),
	messageId: varchar({ length: 512 }).notNull(),
	subject: varchar({ length: 512 }).notNull(),
	body: text().notNull(),
	fromEmail: varchar({ length: 320 }),
	receivedAt: timestamp({ mode: 'string' }).notNull(),
	status: mysqlEnum(['pending','executed','ignored','watching']).default('pending').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("signals_messageId_unique").on(table.messageId),
]);

export const subscriptions = mysqlTable("subscriptions", {
	id: int().autoincrement().notNull(),
	email: varchar({ length: 320 }).notNull(),
	userId: int(),
	active: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("subscriptions_email_unique").on(table.email),
]);

export const tradeJournal = mysqlTable("trade_journal", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	pair: varchar({ length: 20 }).notNull(),
	direction: mysqlEnum(['buy','sell']).notNull(),
	entryPrice: text().notNull(),
	exitPrice: text(),
	stopLoss: text(),
	takeProfit: text(),
	lotSize: text(),
	pnl: text(),
	openTime: timestamp({ mode: 'string' }).notNull(),
	closeTime: timestamp({ mode: 'string' }),
	status: mysqlEnum(['open','closed','cancelled']).default('closed').notNull(),
	summary: text(),
	lesson: text(),
	tags: varchar({ length: 512 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const tradingConversations = mysqlTable("trading_conversations", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	title: varchar({ length: 255 }).default('未命名对话').notNull(),
	content: longtext().notNull(),
	tags: varchar({ length: 500 }),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	conversationDate: date({ mode: 'string' }),
	source: varchar({ length: 100 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_userId").on(table.userId),
	index("idx_conversationDate").on(table.conversationDate),
]);

export const tradingSystem = mysqlTable("trading_system", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	category: mysqlEnum(['philosophy','methodology','entry_rules','exit_rules','risk_management','pairs_preference','session_preference','other']).notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	active: tinyint().default(1).notNull(),
	sortOrder: int().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const tvIdeaAnalyses = mysqlTable("tv_idea_analyses", {
	id: int().autoincrement().notNull(),
	tvIdeaId: int().notNull(),
	decision: mysqlEnum(['execute','watch','ignore']).notNull(),
	confidence: int().notNull(),
	summary: varchar({ length: 200 }),
	reasoning: text(),
	marketContext: text(),
	riskWarning: text(),
	notified: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("tvIdeaId").on(table.tvIdeaId),
]);

export const tvIdeas = mysqlTable("tv_ideas", {
	id: int().autoincrement().notNull(),
	guid: varchar({ length: 512 }).notNull(),
	title: text().notNull(),
	link: varchar({ length: 1024 }).notNull(),
	description: text(),
	author: varchar({ length: 255 }),
	symbol: varchar({ length: 30 }),
	pair: varchar({ length: 20 }),
	imageUrl: varchar({ length: 1024 }),
	publishedAt: timestamp({ mode: 'string' }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("tv_ideas_guid_unique").on(table.guid),
]);

export const userApiConfigs = mysqlTable("user_api_configs", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	apiUrl: varchar({ length: 512 }).notNull(),
	apiKey: varchar({ length: 512 }).notNull(),
	model: varchar({ length: 128 }).default('gpt-4o').notNull(),
	temperature: varchar({ length: 16 }).default('0.7'),
	maxTokens: int().default(4096),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("userId_unique").on(table.userId),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);

// 交易信号 AI Prompt 配置表
export const signalAiPrompts = mysqlTable("signal_ai_prompts", {
	id: int().autoincrement().notNull(),
	version: int().notNull(),
	systemPrompt: text().notNull(),
	isActive: boolean().default(false).notNull(),
	description: text(),
	createdBy: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("signal_ai_prompts_id").on(table.id),
]);

export type SignalAiPrompt = typeof signalAiPrompts.$inferSelect;
export type InsertSignalAiPrompt = typeof signalAiPrompts.$inferInsert;
