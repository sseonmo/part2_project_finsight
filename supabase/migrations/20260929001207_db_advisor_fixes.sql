-- db-advisor 가 고른 수정 (2026-09-29). 권한 범위는 바뀌지 않는다.
-- 롤백은 각 섹션의 before: 로 새 forward 마이그레이션을 쓴다.

-- [auth_rls_initplan] public.* 정책 23개 — auth.uid() 를 행마다가 아니라 쿼리당 한 번 계산
-- before: 모든 정책이 (user_id = auth.uid()). profiles_insert_own 만 체험 조건이 붙는다(아래 원문).
-- alter policy 는 식만 바꾼다. 이름·명령·대상 역할은 그대로이고 drop 되는 순간이 없다.

alter policy csv_format_fingerprints_select_own on public.csv_format_fingerprints
  using (user_id = (select auth.uid()));
alter policy csv_format_fingerprints_insert_own on public.csv_format_fingerprints
  with check (user_id = (select auth.uid()));
alter policy csv_format_fingerprints_update_own on public.csv_format_fingerprints
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy csv_format_fingerprints_delete_own on public.csv_format_fingerprints
  using (user_id = (select auth.uid()));

alter policy monthly_reports_select_own on public.monthly_reports
  using (user_id = (select auth.uid()));
alter policy monthly_reports_insert_own on public.monthly_reports
  with check (user_id = (select auth.uid()));
alter policy monthly_reports_update_own on public.monthly_reports
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy monthly_reports_delete_own on public.monthly_reports
  using (user_id = (select auth.uid()));

alter policy spending_signals_select_own on public.spending_signals
  using (user_id = (select auth.uid()));
alter policy spending_signals_insert_own on public.spending_signals
  with check (user_id = (select auth.uid()));
alter policy spending_signals_update_own on public.spending_signals
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy spending_signals_delete_own on public.spending_signals
  using (user_id = (select auth.uid()));

alter policy user_category_overrides_select_own on public.user_category_overrides
  using (user_id = (select auth.uid()));
alter policy user_category_overrides_insert_own on public.user_category_overrides
  with check (user_id = (select auth.uid()));
alter policy user_category_overrides_update_own on public.user_category_overrides
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy user_category_overrides_delete_own on public.user_category_overrides
  using (user_id = (select auth.uid()));

alter policy upload_jobs_select_own on public.upload_jobs
  using (user_id = (select auth.uid()));
alter policy upload_jobs_insert_own on public.upload_jobs
  with check (user_id = (select auth.uid()));
alter policy upload_jobs_delete_own on public.upload_jobs
  using (user_id = (select auth.uid()));

alter policy transactions_select_own on public.transactions
  using (user_id = (select auth.uid()));
alter policy transactions_insert_own on public.transactions
  with check (user_id = (select auth.uid()));

alter policy profiles_select_own on public.profiles
  using (user_id = (select auth.uid()));
-- before: with check ((user_id = auth.uid()) AND (subscription_status = 'trialing'::subscription_status)
--   AND (polar_customer_id IS NULL) AND (current_period_end IS NULL)
--   AND (trial_started_at <= (now() + '00:01:00'::interval)))
alter policy profiles_insert_own on public.profiles
  with check (
    user_id = (select auth.uid())
    and subscription_status = 'trialing'::subscription_status
    and polar_customer_id is null
    and current_period_end is null
    and trial_started_at <= (now() + '00:01:00'::interval)
  );

-- [function_search_path_mutable] public RPC 8개 — search_path 를 빈 값으로 고정
-- before: search_path 미설정(proconfig 없음). 롤백은 alter function ... reset search_path.
-- 본문은 전부 public. 으로 한정돼 있고 나머지는 pg_catalog 함수라 빈 경로로도 동작한다.
-- 감수: SET 절이 붙은 SQL 함수는 플래너가 인라인하지 않는다(이 규모에선 무시할 수준).

alter function public.get_category_amount_medians(uuid, date) set search_path = '';
alter function public.get_category_monthly_totals(uuid, date[]) set search_path = '';
alter function public.get_merchant_history(uuid, date) set search_path = '';
alter function public.get_period_transactions(uuid, date) set search_path = '';
alter function public.get_recurring_signals_latest(uuid) set search_path = '';
alter function public.get_seen_merchants_before_period(uuid, date) set search_path = '';
alter function public.get_upload_job_counts(uuid) set search_path = '';
alter function public.get_upload_periods(uuid) set search_path = '';

-- [unindexed_foreign_keys] upload_job_id 외래키 2개에 인덱스
-- before: 인덱스 없음. 롤백은 drop index.

create index transactions_upload_job_id_idx on public.transactions (upload_job_id);
create index spending_signals_upload_job_id_idx on public.spending_signals (upload_job_id);
