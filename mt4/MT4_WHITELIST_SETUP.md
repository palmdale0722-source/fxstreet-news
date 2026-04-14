# MT4 白名单配置指南

## 问题描述

当 MT4 EA 向 Manus 服务器推送数据时，可能会出现以下错误：

```
错误码 4060: 未在 MT4 白名单中添加该域名
错误码 5203: HTTPS 证书不兼容（MT4 WebRequest 与 Cloudflare/Manus 不兼容）
```

## 解决方案

### 步骤 1：打开 MT4 选项

1. 在 MT4 中点击菜单：**工具 → 选项**
2. 或使用快捷键：**Ctrl + O**

### 步骤 2：进入服务器设置

1. 在"选项"窗口中，选择左侧菜单的 **"服务器"** 标签
2. 您会看到一个域名列表

### 步骤 3：添加 Manus 域名到白名单

1. 在域名列表中，找到一个空白行或点击"添加"按钮
2. 输入以下域名：
   ```
   fxstreetnews-cshx67nt.manus.space
   ```
3. 点击"确定"保存

### 步骤 4：重启 MT4

1. 完全关闭 MT4
2. 重新打开 MT4
3. 重新加载 EA

## 关键要点

### ✅ 必须使用 HTTP（不是 HTTPS）

EA 中的 ServerURL 参数必须设置为：
```
http://fxstreetnews-cshx67nt.manus.space
```

**原因**：MT4 的 WebRequest 函数不兼容 Cloudflare/Manus 的 TLS 证书。使用 HTTPS 会导致错误码 5203。

### ✅ API 密钥必须匹配

EA 中的 ApiKey 参数必须与后端的 `MT4_API_KEY` 环境变量一致：
```
ApiKey = "mt4-bridge-key-change-me"
```

### ✅ 确保网络连接

- 确保您的 MT4 客户端能够访问互联网
- 如果使用代理或防火墙，请确保允许访问 `fxstreetnews-cshx67nt.manus.space`

## 测试连接

启动 EA 后，查看 MT4 的"专家"窗口（View → Toolbars → Expert），应该看到类似的日志：

```
[Bridge] V4.4_Fixed 启动，初始化推送中...
[Bridge] 推送成功 → http://fxstreetnews-cshx67nt.manus.space/api/mt4/push | HTTP: 200 | 响应: {"success":true,"inserted":500}
[Bridge] 推送成功 → http://fxstreetnews-cshx67nt.manus.space/api/mt4/indicators | HTTP: 200 | 响应: {"success":true,"inserted":56}
[Bridge] 推送成功 → http://fxstreetnews-cshx67nt.manus.space/api/mt4/tw | HTTP: 200 | 响应: {"success":true,"saved":100}
[Bridge] V4.4_Fixed 初始化完成
```

## 常见问题

### Q: 仍然出现错误码 5203？

**A**: 
1. 确认 ServerURL 使用 `http://` 而不是 `https://`
2. 检查域名是否正确添加到 MT4 白名单
3. 尝试重启 MT4 和 EA
4. 检查防火墙设置

### Q: 错误码 4060 怎么解决？

**A**: 这表示域名未添加到 MT4 白名单。按照上述步骤添加 `fxstreetnews-cshx67nt.manus.space` 到白名单。

### Q: 如何验证 API 密钥是否正确？

**A**: 查看 EA 日志。如果看到 `HTTP: 401` 错误，表示 API 密钥不匹配。确保 EA 中的 `ApiKey` 与后端的 `MT4_API_KEY` 一致。

## 版本信息

- **EA 版本**：FXStreetBridge_V4.4_Fixed
- **更新日期**：2026-04-08
- **支持的 MT4 版本**：MT4 Build 1090+

## 技术细节

### 为什么不能使用 HTTPS？

MT4 的 WebRequest 函数使用的 SSL/TLS 库与现代的 Cloudflare/Manus 证书不兼容。具体原因：

1. MT4 使用的是较旧的 OpenSSL 库
2. Cloudflare 使用的是现代 TLS 1.3 和 ECDSA 证书
3. 两者之间存在兼容性问题，导致握手失败（错误码 5203）

### HTTP 是否安全？

在 Manus 平台上，HTTP 请求会自动通过 Cloudflare 的 SSL/TLS 加密，所以数据传输是安全的。此外，所有请求都包含 API 密钥认证头，确保只有授权的 EA 才能推送数据。

## 需要帮助？

如果问题仍未解决，请检查以下信息：

1. MT4 版本（菜单 → 帮助 → 关于）
2. EA 的完整日志输出
3. 网络连接状态
4. 防火墙/代理设置

然后联系技术支持。
