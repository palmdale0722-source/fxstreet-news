# FXStreet 开发环境配置说明

## 快速开始

### 1. 克隆代码

```bash
git clone <GitHub 仓库地址>
cd fxstreet-news
pnpm install
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件（此文件已在 `.gitignore` 中，不会提交到 GitHub）：

```bash
cp .env.template .env
# 然后编辑 .env 文件，填入下方提供的值
```

### 3. 环境变量清单

向项目负责人（王前锋）获取以下值：

| 变量名 | 说明 | 是否必须 |
|--------|------|----------|
| `DATABASE_URL` | 共享数据库连接字符串（TiDB Cloud） | **必须** |
| `JWT_SECRET` | 登录 Cookie 签名密钥 | **必须** |
| `BUILT_IN_FORGE_API_KEY` | Manus AI API 密钥（用于 LLM 调用） | **必须**（AI 功能） |
| `VITE_FRONTEND_FORGE_API_KEY` | 前端 AI API 密钥 | **必须**（AI 功能） |
| `MT4_API_KEY` | MT4 数据推送鉴权密钥 | 可选 |
| `IMAP_EMAIL` | 交易信号邮箱 | 可选 |
| `IMAP_PASSWORD` | 交易信号邮箱密码 | 可选 |

以下变量为固定值，直接复制即可：

```env
VITE_APP_ID=cSHx67NTiqWRWuwYCEpu4V
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
BUILT_IN_FORGE_API_URL=https://forge.manus.ai
VITE_FRONTEND_FORGE_API_URL=https://forge.manus.ai
VITE_APP_TITLE=FXStreet 实时外汇资讯网
OWNER_NAME=王前锋
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000` 即可看到网站。

---

## 数据库说明

本项目使用**共享 TiDB Cloud 数据库**，所有开发者连接同一个数据库。

- **优点**：数据实时同步，无需本地初始化数据
- **注意**：请勿在开发时删除或清空生产数据，建议只做读取操作，写入测试数据时注意清理

数据库连接信息请向王前锋获取。

---

## 项目结构

```
client/src/pages/     ← 页面组件
server/routers.ts     ← tRPC 后端路由
drizzle/schema.ts     ← 数据库表结构
server/db.ts          ← 数据库查询函数
mt4/                  ← MT4 EA 文件
```

## 代码提交规范

- 功能分支命名：`feat/功能名称`
- 修复分支命名：`fix/问题描述`
- 提交信息格式：`feat: 新增xxx功能` / `fix: 修复xxx问题`
- 提交前确保 `pnpm test` 全部通过
