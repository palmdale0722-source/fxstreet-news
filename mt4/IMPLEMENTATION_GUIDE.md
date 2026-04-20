# MT4 本地缓存 + 批量上传方案 - 完整实施指南

## 概述

本方案将 MT4 数据推送从**直接 HTTP 推送**改为**本地缓存 + 定期批量上传**，大幅提高数据推送的稳定性和可靠性。

| 对比项 | 旧方案 | 新方案 |
|--------|--------|--------|
| **推送方式** | 直接 HTTP POST | 本地 CSV 缓存 + 批量上传 |
| **稳定性** | 低（网络抖动丢失） | 高（本地缓存保护） |
| **HTTP 请求数** | 28 对/15 分钟 | 1 次/30 分钟 |
| **数据延迟** | 实时 | ~30 分钟 |
| **自动重试** | 无 | 有（最多 3 次） |
| **调试难度** | 中等 | 低（可查看本地文件） |

---

## 实施步骤

### 第一步：更新 MT4 EA 代码

#### 1.1 备份旧 EA
```bash
# 在 MT4 的 MQL4/Experts/ 目录中
# 将 FXStreetBridge.mq4 重命名为 FXStreetBridge_v2_backup.mq4
```

#### 1.2 部署新 EA
1. 将 `FXStreetBridge_v3_LocalCache.mq4` 复制到 `MT4\MQL4\Experts\` 目录
2. 在 MT4 中打开 MetaEditor（F7）
3. 打开 `FXStreetBridge_v3_LocalCache.mq4` 并编译
4. 关闭旧 EA（从图表上删除）
5. 将新 EA 拖到 EURUSD M15 图表上运行

#### 1.3 验证 EA 运行
1. 打开 MT4 的 **"日志"** 窗口（View → Toolbars → Experts）
2. 应该看到类似的日志：
   ```
   [FXStreetBridge v3.0] 初始化完成
   [FXStreetBridge] 推送间隔: 15 分钟
   [FXStreetBridge] 本地缓存模式已启用
   [FXStreetBridge] 文件位置: C:\Users\...\AppData\Roaming\MetaQuotes\Terminal\...\MQL4\Files\
   ```

#### 1.4 检查本地文件
1. 打开 MT4 的 **Files** 目录（通常在 `C:\Users\YourUser\AppData\Roaming\MetaQuotes\Terminal\XXXXX\MQL4\Files\`）
2. 应该看到 28 个 CSV 文件：
   ```
   mt4_bars_EURUSD.csv
   mt4_bars_GBPUSD.csv
   mt4_bars_AUDUSD.csv
   ...
   ```
3. 每个文件包含 CSV 格式的 K 线数据：
   ```
   EURUSD,2026-04-20T10:15:00Z,1.08500,1.08600,1.08400,1.08550,12345,2
   EURUSD,2026-04-20T10:30:00Z,1.08550,1.08700,1.08500,1.08650,15678,2
   ```

---

### 第二步：部署 Python 上传脚本

#### 2.1 环境准备

**在 Windows 电脑上执行：**

```bash
# 1. 确保已安装 Python 3.7+
python --version

# 2. 安装 requests 库
pip install requests

# 3. 创建脚本目录
mkdir C:\mt4_uploader
mkdir C:\mt4_uploader\logs
```

#### 2.2 配置脚本

1. 将 `upload_mt4_data.py` 复制到 `C:\mt4_uploader\` 目录
2. 编辑脚本，修改以下配置参数：

```python
# MT4 数据文件目录（重要！）
# 查看方法：在 MT4 中按 Ctrl+Shift+D 打开数据目录，然后导航到 MQL4/Files/
MT4_DATA_DIR = r"C:\Users\YourUser\AppData\Roaming\MetaQuotes\Terminal\XXXXXXXX\MQL4\Files"

# 服务器配置
SERVER_URL = "https://your-domain.com"      # 替换为你的网站域名
API_KEY = "mt4-bridge-key-change-me"        # 替换为实际的 API 密钥（与后端一致）
```

#### 2.3 测试脚本

```bash
# 在命令行运行脚本测试
cd C:\mt4_uploader
python upload_mt4_data.py
```

**预期输出：**
```
[2026-04-20 10:30:45] INFO - MT4 数据上传脚本启动
[2026-04-20 10:30:45] INFO - ============================================================
[2026-04-20 10:30:45] INFO - 开始处理 MT4 数据文件
[2026-04-20 10:30:45] INFO - 数据目录: C:\Users\...
[2026-04-20 10:30:45] INFO - 找到 28 个数据文件
[2026-04-20 10:30:46] INFO - 上传 EURUSD: 100 条记录 (尝试 1/3)
[2026-04-20 10:30:47] INFO - ✓ EURUSD 上传成功 (100 条)
...
[2026-04-20 10:31:15] INFO - 处理完成: 上传 2800 条，失败 0 条
```

---

### 第三步：配置 Windows 任务计划器

#### 3.1 使用 GUI 配置（推荐）

详见 `Windows_Task_Scheduler_Setup.md` 文件中的"方法一"。

**快速步骤：**
1. 按 `Win + R` 打开运行对话框
2. 输入 `taskschd.msc` 打开任务计划器
3. 点击 **"创建基本任务"**
4. 名称：`MT4 数据上传`
5. 触发器：**"定期"** → **"每 30 分钟"**
6. 操作：**"启动程序"**
   - 程序：`C:\Users\YourUser\AppData\Local\Programs\Python\Python311\python.exe`
   - 参数：`C:\mt4_uploader\upload_mt4_data.py`
   - 起始位置：`C:\mt4_uploader`
7. 完成

#### 3.2 使用 PowerShell 配置（高级）

详见 `Windows_Task_Scheduler_Setup.md` 文件中的"方法二"。

---

### 第四步：验证后端接口

#### 4.1 检查接口是否已部署

```bash
# 在服务器上测试接口
curl -X POST https://your-domain.com/api/mt4/batch-upload \
  -H "X-API-Key: mt4-bridge-key-change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "EURUSD",
    "bars": [
      "EURUSD,2026-04-20T10:15:00Z,1.08500,1.08600,1.08400,1.08550,12345,2"
    ],
    "timestamp": "2026-04-20T10:30:00Z",
    "count": 1
  }'
```

**预期响应：**
```json
{
  "success": true,
  "inserted": 1,
  "symbols": ["EURUSD"],
  "timestamp": "2026-04-20T10:30:00Z"
}
```

#### 4.2 检查数据库

```sql
-- 查询最新的 MT4 K 线数据
SELECT * FROM mt4_bars 
WHERE symbol = 'EURUSD' 
ORDER BY barTime DESC 
LIMIT 10;
```

---

## 完整工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                    MT4 EA (每 15 分钟)                        │
│  FXStreetBridge_v3_LocalCache.mq4                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              本地 CSV 文件缓存 (MT4/Files/)                   │
│  mt4_bars_EURUSD.csv                                         │
│  mt4_bars_GBPUSD.csv                                         │
│  ... (28 个文件)                                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ (每 30 分钟)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            Python 上传脚本 (Windows 任务计划器)               │
│  upload_mt4_data.py                                          │
│  - 读取本地 CSV 文件                                         │
│  - 验证数据格式                                              │
│  - 批量上传到服务器                                          │
│  - 自动重试 (最多 3 次)                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            后端接口 (/api/mt4/batch-upload)                  │
│  - 鉴权 (X-API-Key)                                          │
│  - 解析 CSV 数据                                             │
│  - 入库到 mt4_bars 表                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    数据库 (MySQL)                             │
│  mt4_bars 表                                                 │
│  - 存储 K 线数据                                             │
│  - 供 AI 分析师使用                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 监控和维护

### 日志查看

```bash
# 查看最新 50 行日志
Get-Content C:\mt4_uploader\logs\mt4_upload.log -Tail 50

# 查看特定日期的日志
Get-Content C:\mt4_uploader\logs\mt4_upload.log | Select-String "2026-04-20"

# 查看上传失败的日志
Get-Content C:\mt4_uploader\logs\mt4_upload.log | Select-String "✗"
```

### 任务执行历史

1. 打开任务计划器
2. 选择 **"MT4 数据上传"** 任务
3. 在底部窗格中查看 **"历史"** 标签
4. 检查最近的执行记录和状态

### 数据完整性检查

```sql
-- 检查最新的数据时间
SELECT symbol, MAX(barTime) as latest_time, COUNT(*) as total_bars
FROM mt4_bars
GROUP BY symbol
ORDER BY latest_time DESC;

-- 检查数据缺口（超过 30 分钟未更新）
SELECT symbol, MAX(barTime) as latest_time
FROM mt4_bars
GROUP BY symbol
HAVING MAX(barTime) < DATE_SUB(NOW(), INTERVAL 30 MINUTE);
```

---

## 故障排查

### 问题 1：Python 脚本无法找到 MT4 数据目录

**症状：** 日志显示 "MT4 数据目录不存在"

**解决方案：**
1. 确认 MT4 数据目录路径正确
2. 在 MT4 中按 `Ctrl+Shift+D` 打开数据目录
3. 导航到 `MQL4/Files/` 目录
4. 复制完整路径到脚本中

### 问题 2：上传失败，显示 "Invalid API key"

**症状：** 日志显示 "✗ EURUSD 上传失败: HTTP 401"

**解决方案：**
1. 检查脚本中的 `API_KEY` 是否与后端一致
2. 检查后端的 `MT4_API_KEY` 环境变量
3. 确保请求头使用 `X-API-Key`（不是 `X-MT4-API-Key`）

### 问题 3：任务计划器中任务不执行

**症状：** 任务已创建但从未运行

**解决方案：**
1. 检查任务的触发器设置
2. 右键点击任务，选择 **"运行"** 手动测试
3. 在 Windows 事件查看器中查看错误日志
4. 确保 Python 路径正确

### 问题 4：上传成功但数据未入库

**症状：** 日志显示上传成功，但数据库中没有新数据

**解决方案：**
1. 检查后端日志：`tail -f /home/ubuntu/fxstreet-news/.manus-logs/devserver.log`
2. 查看数据库中的最新数据：`SELECT * FROM mt4_bars ORDER BY barTime DESC LIMIT 5;`
3. 检查是否有 SQL 错误
4. 验证数据格式是否正确

---

## 性能优化

### 1. 调整上传频率

如果网络稳定，可以改为 1 小时上传一次：
```bash
# 在任务计划器中修改触发器为 60 分钟
```

### 2. 限制文件大小

如果 CSV 文件过大（>10MB），脚本会自动跳过。可以在脚本中调整：
```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # 改为 50MB
```

### 3. 批量清理旧数据

```sql
-- 删除 30 天前的数据
DELETE FROM mt4_bars 
WHERE barTime < DATE_SUB(NOW(), INTERVAL 30 DAY);
```

---

## 回滚方案

如果需要回到旧方案（直接 HTTP 推送）：

1. 在 MT4 中删除新 EA
2. 将旧 EA (`FXStreetBridge_v2_backup.mq4`) 重新编译并运行
3. 在任务计划器中禁用 Python 上传任务
4. 后端会自动继续处理 `/api/mt4/push` 请求

---

## 下一步

1. ✅ 部署新 MT4 EA
2. ✅ 配置 Python 上传脚本
3. ✅ 设置 Windows 任务计划器
4. ✅ 验证后端接口
5. ⏳ 监控一周的数据完整性
6. ⏳ 根据需要调整上传频率
7. ⏳ 清理历史数据

---

## 技术支持

如有问题，请检查：
1. MT4 日志（View → Toolbars → Experts）
2. Python 脚本日志（`C:\mt4_uploader\logs\mt4_upload.log`）
3. 后端服务器日志（`.manus-logs/devserver.log`）
4. 数据库查询结果
