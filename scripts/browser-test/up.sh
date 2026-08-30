#!/usr/bin/env bash
# 브라우저 테스트 환경을 준비한다. 여러 번 실행해도 안전하다.
#
#   scripts/browser-test/up.sh
#
# 하는 일: dev 서버·Inngest·ngrok 기동 확인 → Inngest 동기화 → 픽스처와 prelude 를
# ~/.dev-browser/tmp 로 복사 → 세션 쿠키 재발급.
#
# 쿠키는 20~30분이면 끊기므로 테스트 중간에도 이 스크립트를 다시 돌리면 된다.
# 내릴 때는 scripts/browser-test/down.sh 를 쓴다.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$HOME/.dev-browser/tmp"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "✗ .env.local 이 없다. 이대로면 프로덕션 Supabase 를 때린다." >&2
  echo "  docs/BROWSER_TESTING.md 의 '.env.local' 절을 먼저 따라라." >&2
  exit 1
fi

mkdir -p "$TMP"

alive() { curl -s -o /dev/null -m 3 "$1"; }

if ! alive http://localhost:3000/; then
  echo "→ dev 서버를 띄운다"
  nohup npm run dev > /tmp/finsight-dev.log 2>&1 &
  for _ in $(seq 1 30); do alive http://localhost:3000/ && break; sleep 1; done
fi

if ! alive http://localhost:8288/; then
  echo "→ Inngest dev 를 띄운다"
  nohup npx inngest-cli@latest dev -u http://localhost:3000/api/inngest --no-discovery \
    > /tmp/finsight-inngest.log 2>&1 &
  for _ in $(seq 1 30); do alive http://localhost:8288/ && break; sleep 1; done
fi

# Polar 웹훅을 로컬에서 받으려면 터널이 필요하다. `.env.local` 의 NGROK_DOMAIN 은
# ngrok 이 주는 고정 도메인이다 — 고정이라야 Polar 에 등록한 웹훅 URL 이 그대로 산다.
# 결제를 건드리지 않는 시나리오에는 없어도 되므로, 없으면 그냥 넘어간다.
NGROK_DOMAIN=$(grep '^NGROK_DOMAIN=' .env.local 2>/dev/null | cut -d= -f2- || true)
if [ -n "$NGROK_DOMAIN" ]; then
  if ! alive http://127.0.0.1:4040/api/tunnels; then
    echo "→ ngrok 터널을 띄운다 ($NGROK_DOMAIN)"
    nohup ngrok http 3000 --url="$NGROK_DOMAIN" --log=stdout \
      > /tmp/finsight-ngrok.log 2>&1 &
    for _ in $(seq 1 30); do alive http://127.0.0.1:4040/api/tunnels && break; sleep 1; done
  fi
  if ! alive http://127.0.0.1:4040/api/tunnels; then
    echo "✗ ngrok 이 뜨지 않았다. /tmp/finsight-ngrok.log 를 봐라." >&2
    exit 1
  fi
else
  echo "· NGROK_DOMAIN 이 없어 터널을 띄우지 않는다 (결제 시나리오는 못 돌린다)"
fi

MODE=$(curl -s http://localhost:3000/api/inngest | grep -o '"mode":"[a-z]*"' || true)
if [ "$MODE" != '"mode":"dev"' ]; then
  echo "✗ /api/inngest 가 dev 모드가 아니다 ($MODE). 이벤트가 프로덕션 Cloud 로 나간다." >&2
  echo "  .env.local 에 INNGEST_DEV=1 과 INNGEST_BASE_URL=http://127.0.0.1:8288 을 넣어라." >&2
  exit 1
fi

curl -s -X PUT http://localhost:3000/api/inngest > /dev/null
if [ -n "$NGROK_DOMAIN" ]; then
  echo "✓ dev:3000 · inngest:8288 · ngrok:$NGROK_DOMAIN · 앱 동기화"
else
  echo "✓ dev:3000 · inngest:8288 · 앱 동기화"
fi

cp test/fixtures/csv/* "$TMP/"
cp scripts/browser-test/prelude.js "$TMP/"
echo "✓ 픽스처 $(ls -1 test/fixtures/csv | wc -l | tr -d ' ')개를 $TMP 로 복사"

ANON=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2) \
  node scripts/browser-test/make-cookie.mjs > "$TMP/session-cookies.json"
echo "✓ 세션 쿠키 발급"
