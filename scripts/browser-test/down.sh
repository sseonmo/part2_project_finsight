#!/usr/bin/env bash
# up.sh 가 띄운 것을 내린다. 여러 번 실행해도 안전하다.
#
#   scripts/browser-test/down.sh
#
# 내리는 것: dev 서버(3000) · Inngest dev(8288) · ngrok(4040).
# 로컬 Supabase 컨테이너는 건드리지 않는다 — 다른 작업도 쓰고, 다시 띄우는 데
# 시간이 걸린다. 지우려면 `npx supabase stop` 을 직접 부른다.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# 포트를 잡고 있는 프로세스를 끈다. 없으면 조용히 넘어간다.
kill_port() {
  local port="$1" label="$2" pids
  pids=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null)
  if [ -z "$pids" ]; then
    echo "· $label 은 떠 있지 않다"
    return
  fi
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null
  for _ in $(seq 1 10); do
    lsof -ti ":$port" -sTCP:LISTEN >/dev/null 2>&1 || break
    sleep 1
  done
  if lsof -ti ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null
    echo "✓ $label 종료 (강제)"
  else
    echo "✓ $label 종료"
  fi
}

kill_port 3000 "dev 서버"
kill_port 8288 "Inngest dev"
kill_port 4040 "ngrok"

# ngrok 은 4040(웹 인터페이스)을 열지 않는 설정도 있으므로 프로세스로 한 번 더 본다.
if pgrep -f "ngrok http" >/dev/null 2>&1; then
  pkill -f "ngrok http" && echo "✓ 남은 ngrok 프로세스 종료"
fi
