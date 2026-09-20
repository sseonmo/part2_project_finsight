-- upload_jobs.status·mapping_attempt_count 는 업로드 파이프라인의 상태 머신이고,
-- transactions.category 는 분류 결과다. 기존 정책은 user_id 만 검사해서, 로그인한
-- 사용자가 PATCH /rest/v1/upload_jobs 로 status 를 'needs_mapping' 으로,
-- mapping_attempt_count 를 0 으로 되돌릴 수 있었다. 그러면
--
--   1. /api/uploads/:id/mapping 의 3회 상한이 방금 덮인 값을 보므로 무력화되고
--   2. 워커의 completed 가드는 라우트가 이벤트 발행 전에 status 를 덮어써서 안 걸리고
--   3. 재실행 경로의 분류 루프는 merchant_categories 캐시를 조회하지 않으므로
--      category 가 null 인 거래가 전량 LLM 으로 간다
--
-- 즉 결제하지 않는 만료 사용자가 분류 LLM 호출을 무제한 유발할 수 있었다.
-- ADR-005 가 "쓰기를 막으면 무수익 사용자의 LLM 비용이 0이 된다"고 한 전제가
-- 그대로 무너진다.
--
-- 이 컬럼을 쓰는 곳은 전부 서버다 — 라우트 핸들러(/api/uploads/:id/start,
-- /api/uploads/:id/mapping)와 워커(src/inngest/process-upload.ts)가 service role
-- 로 쓰고, 소유권은 각 쿼리의 .eq("user_id", ...) 가 확인한다. 사용자 권한으로
-- 쓰는 곳은 없다.
drop policy if exists upload_jobs_update_own on public.upload_jobs;
drop policy if exists transactions_update_own on public.transactions;
drop policy if exists transactions_delete_own on public.transactions;

revoke update on public.upload_jobs from anon, authenticated;
revoke update, delete on public.transactions from anon, authenticated;

-- 남기는 것:
--   upload_jobs SELECT/INSERT/DELETE — 업로드 목록·상세 조회와 업로드 삭제.
--     삭제는 transactions 를 on delete cascade 로 함께 지우므로 거래에 별도
--     DELETE 권한이 필요 없다.
--   transactions SELECT/INSERT — 조회 화면. INSERT 는 워커만 쓰지만 회수할 이유가
--     없어 정책을 그대로 둔다.
