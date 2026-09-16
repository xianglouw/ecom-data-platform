#!/bin/zsh
# 一键启动：构建前端 + 以「脱离终端会话」方式拉起后端（默认 http://127.0.0.1:8800）
# 用法：
#   ./start.sh          # 正常启动（若已在运行则先停掉旧的）
#   ./start.sh stop     # 停止服务
#   ./start.sh status   # 查看状态
DIR="$(cd "$(dirname "$0")" && pwd)"
export NO_PROXY='*'
PID_FILE="$DIR/server/server.pid"
LOG_FILE="$DIR/server/server.log"

stop_server() {
  if [ -f "$PID_FILE" ]; then
    local pid=$(cat "$PID_FILE")
    if ps -p "$pid" > /dev/null 2>&1; then
      kill "$pid" 2>/dev/null && echo "已停止旧服务 (pid $pid)"
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi
  # 兜底：清掉占用 8800 的残留进程
  local stale=$(lsof -ti tcp:8800 2>/dev/null)
  [ -n "$stale" ] && kill $stale 2>/dev/null && echo "已清理端口占用进程"
}

if [ "$1" = "stop" ]; then stop_server; exit 0; fi
if [ "$1" = "status" ]; then
  if [ -f "$PID_FILE" ] && ps -p "$(cat "$PID_FILE")" > /dev/null 2>&1; then
    echo "运行中 (pid $(cat "$PID_FILE")) -> http://127.0.0.1:8800"
  else
    echo "未运行"
  fi
  exit 0
fi

stop_server

# 前端：无依赖则安装，然后构建
cd "$DIR/admin"
if [ ! -d node_modules ]; then npm install --no-audit --no-fund --cache /tmp/npm-cache-ecom; fi
npx vite build || { echo "前端构建失败"; exit 1; }
# 同步到 server/public（后端静态目录，也是云端发布时随包上传的目录）
rm -rf "$DIR/server/public" && cp -R dist "$DIR/server/public"

# 后端：无依赖则安装
cd "$DIR/server"
if [ ! -d node_modules ]; then npm install --no-audit --no-fund --cache /tmp/npm-cache-ecom; fi
# 数据库：默认「空库起步」，不内置任何演示数据（平台只呈现你上传的表）。
# 需要演示数据时改为：SEED_DEMO=1 ./start.sh

# 后台启动：nohup + disown 让进程脱离当前 shell 会话，
# 关闭终端或脚本结束后服务依然存活。
# （此前用 /usr/bin/python3 的 subprocess 方案，在本机会因 Xcode 许可未同意而失败，
#   故改为纯 shell 方式，零外部依赖。）
nohup "$(command -v node)" src/app.js >> "$LOG_FILE" 2>&1 &
PID=$!
disown
echo $PID > "$PID_FILE"
echo "服务已启动 pid $PID"

sleep 2
if curl -s --noproxy '*' -o /dev/null -w "%{http_code}" http://127.0.0.1:8800/ | grep -q 200; then
  echo "✅ 已就绪 -> http://127.0.0.1:8800  (点「先逛逛演示账号」可直接体验)"
else
  echo "❌ 启动异常，请查看日志: $LOG_FILE"
fi
