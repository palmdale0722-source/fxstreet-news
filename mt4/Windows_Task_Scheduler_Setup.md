# Windows 任务计划器配置指南

## 目标
在 Windows 任务计划器中配置定时任务，每 30 分钟自动执行 Python 上传脚本。

---

## 前置准备

### 1. 安装 Python 和依赖

```bash
# 确保已安装 Python 3.7+
python --version

# 安装 requests 库
pip install requests
```

### 2. 准备脚本文件

1. 将 `upload_mt4_data.py` 保存到 `C:\mt4_uploader\` 目录
2. 修改脚本中的配置参数：
   ```python
   MT4_DATA_DIR = r"C:\Users\YourUser\AppData\Roaming\MetaQuotes\Terminal\XXXXXXXX\MQL4\Files"
   SERVER_URL = "https://your-domain.com"
   API_KEY = "mt4-bridge-key-change-me"
   ```

3. 创建日志目录：
   ```bash
   mkdir C:\mt4_uploader\logs
   ```

### 3. 测试脚本

在命令行运行脚本测试是否正常：
```bash
cd C:\mt4_uploader
python upload_mt4_data.py
```

应该看到类似的输出：
```
[2026-04-20 10:30:45] INFO - MT4 数据上传脚本启动
[2026-04-20 10:30:45] INFO - ============================================================
[2026-04-20 10:30:45] INFO - 开始处理 MT4 数据文件
[2026-04-20 10:30:45] INFO - 数据目录: C:\Users\...
```

---

## 配置任务计划器

### 方法一：使用 GUI（推荐新手）

#### 步骤 1：打开任务计划器
1. 按 `Win + R` 打开运行对话框
2. 输入 `taskschd.msc` 并按 Enter
3. 任务计划库窗口打开

#### 步骤 2：创建基本任务
1. 在右侧操作窗格中，点击 **"创建基本任务..."**
2. 输入任务名称：`MT4 数据上传`
3. 输入描述：`每 30 分钟上传 MT4 本地缓存数据到服务器`
4. 点击 **下一步**

#### 步骤 3：设置触发器
1. 选择 **"定期"**
2. 选择 **"每 30 分钟"**
3. 点击 **下一步**

#### 步骤 4：设置操作
1. 选择 **"启动程序"**
2. 在 **"程序或脚本"** 中输入：
   ```
   C:\Users\YourUser\AppData\Local\Programs\Python\Python311\python.exe
   ```
   （根据实际 Python 安装路径修改）

3. 在 **"添加参数"** 中输入：
   ```
   C:\mt4_uploader\upload_mt4_data.py
   ```

4. 在 **"起始位置"** 中输入：
   ```
   C:\mt4_uploader
   ```

5. 点击 **下一步**

#### 步骤 5：完成设置
1. 勾选 **"当任务最后一次运行后，如果它仍在运行，强制停止它"**
2. 勾选 **"如果任务已在运行，请勿启动新实例"**
3. 点击 **完成**

---

### 方法二：使用 PowerShell 脚本（推荐高级用户）

创建文件 `C:\mt4_uploader\create_task.ps1`：

```powershell
# 以管理员身份运行此脚本

$TaskName = "MT4 数据上传"
$PythonPath = "C:\Users\YourUser\AppData\Local\Programs\Python\Python311\python.exe"
$ScriptPath = "C:\mt4_uploader\upload_mt4_data.py"
$WorkDir = "C:\mt4_uploader"

# 创建触发器（每 30 分钟）
$Trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -Once -At (Get-Date)

# 创建操作
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument $ScriptPath -WorkingDirectory $WorkDir

# 创建设置
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

# 注册任务
Register-ScheduledTask -TaskName $TaskName -Trigger $Trigger -Action $Action -Settings $Settings -Description "每 30 分钟上传 MT4 本地缓存数据到服务器" -Force

Write-Host "任务创建成功！"
```

运行方式：
```bash
# 以管理员身份打开 PowerShell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
C:\mt4_uploader\create_task.ps1
```

---

## 验证任务

### 检查任务是否创建成功

1. 打开任务计划器
2. 在左侧导航树中找到 **"任务计划库"**
3. 搜索 **"MT4 数据上传"** 任务
4. 右键点击任务，选择 **"属性"** 检查配置

### 手动运行任务

1. 在任务计划器中找到 **"MT4 数据上传"** 任务
2. 右键点击，选择 **"运行"**
3. 检查日志文件 `C:\mt4_uploader\logs\mt4_upload.log`

### 查看日志

```bash
# 在命令行查看最新日志
type C:\mt4_uploader\logs\mt4_upload.log | tail -20

# 或使用 PowerShell
Get-Content C:\mt4_uploader\logs\mt4_upload.log -Tail 20
```

---

## 常见问题

### Q1: 任务创建后没有执行？

**A:** 检查以下几点：
1. Python 路径是否正确（运行 `where python` 确认）
2. 脚本是否有执行权限
3. 检查日志文件是否有错误信息
4. 确保 MT4 数据目录配置正确

### Q2: 脚本执行失败，提示"找不到模块"？

**A:** 需要安装 requests 库：
```bash
pip install requests
```

或者使用完整路径安装：
```bash
C:\Users\YourUser\AppData\Local\Programs\Python\Python311\Scripts\pip install requests
```

### Q3: 如何修改执行频率（例如改为 1 小时）？

**A:** 在任务计划器中：
1. 右键点击任务，选择 **"属性"**
2. 点击 **"触发器"** 标签
3. 选择触发器，点击 **"编辑"**
4. 修改 **"重复任务间隔"** 为 1 小时
5. 点击 **"确定"**

### Q4: 如何禁用或删除任务？

**A:** 在任务计划器中：
1. 右键点击任务
2. 选择 **"禁用"** 或 **"删除"**

---

## 监控和维护

### 定期检查日志

```bash
# 查看最近 100 行日志
Get-Content C:\mt4_uploader\logs\mt4_upload.log -Tail 100

# 按日期查看日志
Get-Content C:\mt4_uploader\logs\mt4_upload.log | Select-String "2026-04-20"
```

### 设置日志轮转

为了防止日志文件过大，可以在脚本中添加日志轮转逻辑（已在脚本中实现）。

### 监控任务执行历史

1. 打开任务计划器
2. 选择任务
3. 在底部窗格中查看 **"历史"** 标签
4. 检查最近的执行记录和状态

---

## 故障排查

### 查看详细错误信息

如果任务执行失败，查看 Windows 事件查看器：
1. 按 `Win + R` 打开运行对话框
2. 输入 `eventvwr.msc`
3. 导航到 **"Windows 日志"** → **"系统"**
4. 搜索相关错误

### 测试网络连接

```bash
# 测试服务器是否可达
ping your-domain.com

# 测试 HTTPS 连接
curl -I https://your-domain.com/api/mt4/batch-upload
```

---

## 完成后的验证

1. ✅ 任务已在任务计划器中创建
2. ✅ 任务每 30 分钟自动执行
3. ✅ 日志文件正常记录执行情况
4. ✅ MT4 本地 CSV 文件被正确上传和清空
5. ✅ 服务器接收到数据并入库

---

## 下一步

完成任务计划器配置后：
1. 在后端添加 `/api/mt4/batch-upload` 接口
2. 测试数据上传和入库流程
3. 监控一周的数据完整性
4. 根据需要调整上传频率
