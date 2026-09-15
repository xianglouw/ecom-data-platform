#!/bin/sh
# 云端部署启动脚本：先清掉残留的旧服务进程，再前台启动（必须监听 $PORT）
cd "$(dirname "$0")/server" || exit 1
pkill -f "node src/app.js" 2>/dev/null
sleep 1
exec node src/app.js
