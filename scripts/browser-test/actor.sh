#!/usr/bin/env bash
# 테스트 유저를 특정 액터 상태로 바꾼다.
#
# U4(체험 만료)·U6(해지, 기간 내)는 앱을 써서는 도달할 수 없다. entitlement 는
# subscription_status 컬럼이 아니라 trial_started_at·current_period_end 로
# 매 요청 계산하므로(USER_FLOW § 상태 머신 2), 그 두 값을 직접 옮겨야 한다.
#
#   scripts/browser-test/actor.sh u4
#
# U1(비로그인)은 DB 상태가 아니다 — 쿠키를 심지 않으면 U1 이다.
# U2(거래 0건)·U7(복귀자)은 권한이 아니라 데이터 상태이므로 reset.sh 와 함께 쓴다.
set -euo pipefail

CONTAINER="${SUPABASE_CONTAINER:-supabase_db_part2_project_finsight}"
EMAIL="${TEST_EMAIL:-e2e-test@finsight.local}"
ACTOR="${1:-}"

case "$ACTOR" in
  u2|u3)  # 체험 중 (남은 6일)
    SET="subscription_status='trialing', trial_started_at=now() - interval '1 day', current_period_end=null" ;;
  u4)     # 체험 만료 — 7일이 지났다
    SET="subscription_status='trialing', trial_started_at=now() - interval '30 days', current_period_end=null" ;;
  u5)     # 구독 중
    SET="subscription_status='active', current_period_end=now() + interval '20 days'" ;;
  u6)     # 해지했지만 결제 기간이 남았다 — 권한은 u5 와 같다
    SET="subscription_status='canceled', current_period_end=now() + interval '10 days'" ;;
  u6x)    # 해지하고 기간도 지났다 — expired
    SET="subscription_status='canceled', current_period_end=now() - interval '1 day'" ;;
  trial-ending)  # 만료 2일 전 예고 배너
    SET="subscription_status='trialing', trial_started_at=now() - interval '6 days', current_period_end=null" ;;
  *)
    echo "사용법: $0 {u2|u3|u4|u5|u6|u6x|trial-ending}" >&2
    exit 2 ;;
esac

docker exec "$CONTAINER" psql -U postgres -d postgres -q -c "
  update public.profiles set $SET
  where user_id = (select id from auth.users where email = '$EMAIL');"

docker exec "$CONTAINER" psql -U postgres -d postgres -c "
  select subscription_status, trial_started_at::date as trial_from,
         current_period_end::date as period_end
  from public.profiles
  where user_id = (select id from auth.users where email = '$EMAIL');"
