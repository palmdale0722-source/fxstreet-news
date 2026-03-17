# FXStreetBridge EA 安装说明

## 概述

`FXStreetBridge.mq4` 是一个 MT4 Expert Advisor，每 15 分钟自动将 28 个 G8 货币对的 M15 K 线数据推送到 FXStreet AI 分析师，让 AI 基于你的真实交易终端数据进行分析。

---

## 安装步骤

### 第一步：获取 API 密钥

登录你的 FXStreet AI 分析师网站，在 AI 分析师页面顶部找到 **MT4 连接状态** 面板，复制显示的 API 密钥。

### 第二步：复制 EA 文件

1. 打开 MT4
2. 点击菜单：**文件 → 打开数据文件夹**
3. 进入 `MQL4/Experts/` 目录
4. 将 `FXStreetBridge.mq4` 复制到该目录

### 第三步：编译 EA

1. 在 MT4 中打开 **MetaEditor**（F4 或工具栏按钮）
2. 在左侧文件树中找到 `FXStreetBridge.mq4`
3. 按 **F7** 编译，确认无错误

### 第四步：配置 WebRequest 权限

1. 在 MT4 中：**工具 → 选项 → 智能交易系统**
2. 勾选 **允许 WebRequest 以下列出的 URL**
3. 点击 **+** 添加你的网站域名，例如：
   ```
   https://your-site.manus.space
   ```
4. 点击确定保存

### 第五步：运行 EA

1. 打开一个 **EURUSD M15** 图表（推荐，但任意图表均可）
2. 在 **导航栏 → 智能交易系统** 中找到 `FXStreetBridge`
3. 将 EA 拖到图表上
4. 在弹出的参数窗口中填写：

| 参数 | 说明 | 示例 |
|------|------|------|
| `ServerURL` | 你的网站地址（不含末尾斜杠） | `https://your-site.manus.space` |
| `ApiKey` | 从网站复制的 API 密钥 | `mt4-bridge-key-xxxxx` |
| `ClientId` | EA 实例标识（多个MT4时区分） | `mt4-main` |
| `PushIntervalMinutes` | 推送间隔（分钟） | `15` |
| `BarsToSend` | 每次推送的K线数量 | `100` |
| `EnableLogging` | 是否输出日志 | `true` |

5. 点击确定，EA 开始运行

### 第六步：验证连接

EA 启动后会立即推送一次数据。在 MT4 的 **专家** 标签页中查看日志，应看到类似：

```
[FXStreetBridge] 初始化完成，服务器: https://...，推送间隔: 15 分钟
[FXStreetBridge] 开始推送 28 个货币对的 M15 数据...
[FXStreetBridge] 推送成功，HTTP状态: 200，响应: {"success":true,"inserted":...}
```

同时，在 FXStreet AI 分析师页面的 **MT4 连接状态** 面板中，状态会变为 **在线**（绿色）。

---

## 常见问题

**Q: EA 报错 "HTTP 请求失败，错误码: 4060"**
A: 需要在 MT4 选项中添加服务器 URL 到白名单（见第四步）。

**Q: 某些货币对没有数据**
A: 你的经纪商可能不提供该货币对，或货币对名称后缀不同（如 `EURUSDm`）。可在 MT4 市场报价窗口确认可用的货币对名称。

**Q: 如何处理经纪商时区偏移？**
A: EA 使用 MT4 服务器时间。大多数经纪商使用 UTC+2（冬令时）或 UTC+3（夏令时）。AI 分析时会以接收到的时间为准，不影响技术分析的相对关系。

**Q: 如何在多台电脑上运行？**
A: 为每台电脑设置不同的 `ClientId`（如 `mt4-home`、`mt4-office`），数据会合并存储。

---

## 数据说明

- 每次推送最多 100 根 M15 K 线（约 25 小时的数据）
- 服务器为每个货币对保留最近 200 根 K 线（约 50 小时）
- AI 分析时会优先使用 MT4 推送的数据，数据缺失时自动降级到 Yahoo Finance
- 推送数据包含：开盘价、最高价、最低价、收盘价、成交量、点差
