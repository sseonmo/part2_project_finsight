# db-advisor 확인된 예외

advisor 가 경고하지만 의도된 설계인 항목. 키 규칙은 SKILL.md "발견 키" 를 따른다.
더 이상 매칭되지 않는 줄은 보고서에 "낡은 예외"로 표시되니 그때 지운다.

| 키 | 이유 | 날짜 |
|---|---|---|
| `rls_enabled_no_policy:public.processed_webhook_events` | 결제 웹훅 멱등 테이블 — service role 전용이라 정책을 두지 않는다. `supabase/rls.test.ts` 가 강제 | 2026-09-29 |
