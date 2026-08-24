#!/usr/bin/env bash
# 테스트 유저의 데이터를 지운다. 어디까지 지울지는 인자로 고른다.
#
#   reset.sh jobs     실패·대기 job 만 정리 (대시보드 카드를 비운다)
#   reset.sh data     거래·신호·리포트·업로드 전부. 계정과 전역 캐시는 남긴다 → U2 상태
#   reset.sh cache    이 유저의 CSV 형식 fingerprint 만. 컬럼 매핑을 다시 추론하게 한다
#
# 전역 캐시(merchant_categories)는 어느 모드에서도 지우지 않는다. 사용자 데이터가
# 아니고, 지우면 이후 업로드마다 LLM 분류 비용이 다시 든다.
set -euo pipefail

CONTAINER="${SUPABASE_CONTAINER:-supabase_db_part2_project_finsight}"
EMAIL="${TEST_EMAIL:-e2e-test@finsight.local}"
MODE="${1:-}"
UID_SQL="(select id from auth.users where email = '$EMAIL')"

run() { docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "$1"; }

case "$MODE" in
  jobs)
    run "delete from public.upload_jobs
         where user_id = $UID_SQL and status in ('failed','pending');" ;;
  data)
    run "delete from public.upload_jobs where user_id = $UID_SQL;"
    run "delete from public.spending_signals where user_id = $UID_SQL;"
    run "delete from public.monthly_reports where user_id = $UID_SQL;"
    run "delete from public.user_category_overrides where user_id = $UID_SQL;"
    run "delete from public.csv_format_fingerprints where user_id = $UID_SQL;" ;;
  cache)
    run "delete from public.csv_format_fingerprints where user_id = $UID_SQL;" ;;
  *)
    echo "사용법: $0 {jobs|data|cache}" >&2
    exit 2 ;;
esac

docker exec "$CONTAINER" psql -U postgres -d postgres -c "
  select
    (select count(*) from public.upload_jobs   where user_id = $UID_SQL) as jobs,
    (select count(*) from public.transactions  where user_id = $UID_SQL) as txns,
    (select count(*) from public.spending_signals where user_id = $UID_SQL) as signals,
    (select count(*) from public.monthly_reports  where user_id = $UID_SQL) as reports,
    (select count(*) from public.merchant_categories) as global_cache;"
