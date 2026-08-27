#!/usr/bin/env bash
# push 전 점검 — 원격 Postgres 스키마가 저장소의 마이그레이션과 같은지 본다.
#
# 이 저장소는 코드만 자동 배포되고(main push → Vercel) 스키마는 수동이다.
# 그 틈에서 마이그레이션이 조용히 밀리는 것을 push 직전에 잡는다.
#
#   scripts/preflight.sh --fast   # 스키마 드리프트만 (PreToolUse hook 이 부른다)
#
# exit 0 = 통과, exit 1 = 막아야 함.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

output=$(npx supabase db push --dry-run 2>&1)
status=$?

if [ "$status" -ne 0 ]; then
  echo "원격 스키마를 확인하지 못했습니다 (supabase db push --dry-run 실패)."
  echo "Supabase 프로젝트가 일시정지됐거나 CLI 가 링크되지 않았을 수 있습니다."
  echo "$output" | tail -5
  exit 1
fi

if printf '%s' "$output" | grep -q '"upToDate":true'; then
  echo "원격 스키마는 최신입니다."
  exit 0
fi

echo "적용되지 않은 마이그레이션이 있습니다:"
printf '%s\n' "$output" | tail -10
exit 1
