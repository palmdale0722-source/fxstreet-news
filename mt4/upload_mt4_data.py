#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MT4 数据上传脚本 v1.0
功能：定期读取 MT4 本地 CSV 文件，批量上传到服务器
部署：在 Windows 任务计划器中设置每 30 分钟执行一次

配置说明：
1. 修改下面的配置参数（MT4_DATA_DIR, SERVER_URL, API_KEY）
2. 将脚本保存到 C:\mt4_uploader\ 目录
3. 在 Windows 任务计划器中创建定时任务
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
from pathlib import Path
import requests
from typing import List, Dict, Optional

# ═══════════════════════════════════════════════════════════════
# 配置参数（根据实际情况修改）
# ═══════════════════════════════════════════════════════════════

# MT4 数据文件目录（通常在 MT4 的 MQL4/Files/ 目录下）
# 例如：C:\Users\YourUser\AppData\Roaming\MetaQuotes\Terminal\....\MQL4\Files
MT4_DATA_DIR = r"C:\Users\YourUser\AppData\Roaming\MetaQuotes\Terminal\XXXXXXXX\MQL4\Files"

# 服务器配置
SERVER_URL = "https://your-domain.com"  # 替换为你的网站域名
API_KEY = "mt4-bridge-key-change-me"    # 替换为实际的 API 密钥

# 日志配置
LOG_DIR = r"C:\mt4_uploader\logs"
LOG_FILE = os.path.join(LOG_DIR, "mt4_upload.log")

# 上传配置
MAX_RETRIES = 3              # 最大重试次数
RETRY_DELAY = 5              # 重试延迟（秒）
REQUEST_TIMEOUT = 30         # 请求超时（秒）
MAX_FILE_SIZE = 10 * 1024 * 1024  # 最大文件大小（10MB）

# ═══════════════════════════════════════════════════════════════
# 日志设置
# ═══════════════════════════════════════════════════════════════

def setup_logging():
    """设置日志"""
    os.makedirs(LOG_DIR, exist_ok=True)
    
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    return logging.getLogger(__name__)

logger = setup_logging()

# ═══════════════════════════════════════════════════════════════
# 核心函数
# ═══════════════════════════════════════════════════════════════

def validate_csv_line(line: str) -> bool:
    """验证 CSV 行格式"""
    try:
        parts = line.strip().split(',')
        if len(parts) != 8:
            return False
        
        # 验证数值字段
        symbol = parts[0]
        barTime = parts[1]
        open_price = float(parts[2])
        high_price = float(parts[3])
        low_price = float(parts[4])
        close_price = float(parts[5])
        volume = int(parts[6])
        spread = int(parts[7])
        
        # 基本验证
        if high_price < low_price or high_price < open_price or high_price < close_price:
            return False
        if low_price > open_price or low_price > close_price:
            return False
        
        return True
    except (ValueError, IndexError):
        return False

def read_csv_file(file_path: str) -> List[str]:
    """读取 CSV 文件，返回有效的行列表"""
    valid_lines = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                
                if validate_csv_line(line):
                    valid_lines.append(line)
                else:
                    logger.warning(f"无效的 CSV 行 ({file_path}:{line_num}): {line[:50]}")
    
    except Exception as e:
        logger.error(f"读取文件失败 ({file_path}): {e}")
        return []
    
    return valid_lines

def upload_batch(symbol: str, bars: List[str]) -> bool:
    """上传一批数据到服务器"""
    if not bars:
        return True
    
    url = f"{SERVER_URL}/api/mt4/batch-upload"
    
    payload = {
        "symbol": symbol,
        "bars": bars,
        "timestamp": datetime.now().isoformat(),
        "count": len(bars)
    }
    
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    for attempt in range(MAX_RETRIES):
        try:
            logger.info(f"上传 {symbol}: {len(bars)} 条记录 (尝试 {attempt + 1}/{MAX_RETRIES})")
            
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=REQUEST_TIMEOUT
            )
            
            if response.status_code == 200:
                logger.info(f"✓ {symbol} 上传成功 ({len(bars)} 条)")
                return True
            else:
                logger.warning(f"✗ {symbol} 上传失败: HTTP {response.status_code}")
                logger.debug(f"  响应: {response.text[:200]}")
                
                # 某些错误可以重试
                if response.status_code >= 500 and attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY * (attempt + 1))
                    continue
                else:
                    return False
        
        except requests.exceptions.Timeout:
            logger.warning(f"✗ {symbol} 请求超时 (尝试 {attempt + 1}/{MAX_RETRIES})")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            return False
        
        except requests.exceptions.ConnectionError as e:
            logger.warning(f"✗ {symbol} 连接失败: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            return False
        
        except Exception as e:
            logger.error(f"✗ {symbol} 上传异常: {e}")
            return False
    
    return False

def process_mt4_files():
    """处理所有 MT4 CSV 文件"""
    if not os.path.exists(MT4_DATA_DIR):
        logger.error(f"MT4 数据目录不存在: {MT4_DATA_DIR}")
        return False
    
    logger.info("=" * 60)
    logger.info("开始处理 MT4 数据文件")
    logger.info(f"数据目录: {MT4_DATA_DIR}")
    
    # 查找所有 mt4_bars_*.csv 文件
    csv_files = list(Path(MT4_DATA_DIR).glob("mt4_bars_*.csv"))
    
    if not csv_files:
        logger.info("未找到任何 MT4 数据文件")
        return True
    
    logger.info(f"找到 {len(csv_files)} 个数据文件")
    
    total_uploaded = 0
    total_failed = 0
    
    for csv_file in sorted(csv_files):
        file_size = os.path.getsize(csv_file)
        
        # 检查文件大小
        if file_size > MAX_FILE_SIZE:
            logger.warning(f"文件过大 ({csv_file.name}): {file_size / 1024 / 1024:.2f}MB，跳过")
            continue
        
        # 提取货币对名称
        symbol = csv_file.stem.replace("mt4_bars_", "")
        
        # 读取 CSV 文件
        bars = read_csv_file(str(csv_file))
        
        if not bars:
            logger.info(f"跳过空文件: {csv_file.name}")
            continue
        
        # 上传数据
        success = upload_batch(symbol, bars)
        
        if success:
            # 上传成功，清空文件
            try:
                with open(csv_file, 'w', encoding='utf-8') as f:
                    f.write("")  # 清空文件
                logger.info(f"已清空文件: {csv_file.name}")
                total_uploaded += len(bars)
            except Exception as e:
                logger.error(f"清空文件失败 ({csv_file.name}): {e}")
        else:
            logger.warning(f"上传失败，保留文件: {csv_file.name}")
            total_failed += len(bars)
    
    logger.info("=" * 60)
    logger.info(f"处理完成: 上传 {total_uploaded} 条，失败 {total_failed} 条")
    logger.info("=" * 60)
    
    return total_failed == 0

def main():
    """主函数"""
    try:
        logger.info("MT4 数据上传脚本启动")
        
        # 检查配置
        if "your-domain.com" in SERVER_URL or "mt4-bridge-key-change-me" == API_KEY:
            logger.error("错误：请先修改配置参数（SERVER_URL, API_KEY）")
            return False
        
        if not os.path.exists(MT4_DATA_DIR):
            logger.error(f"错误：MT4 数据目录不存在，请修改 MT4_DATA_DIR: {MT4_DATA_DIR}")
            return False
        
        # 处理文件
        success = process_mt4_files()
        
        return success
    
    except Exception as e:
        logger.error(f"脚本异常: {e}", exc_info=True)
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
