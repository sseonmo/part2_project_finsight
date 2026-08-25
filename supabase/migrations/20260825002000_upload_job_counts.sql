-- 업로드 이력 화면의 "거래 N건" / "신호 N건".
-- 이전에는 사용자의 거래 행을 전부 받아 JS 에서 세었는데, PostgREST 의
-- max_rows(1000) 에 걸려 누적 1,000건이 넘는 순간 오래된 업로드가 "0건" 으로
-- 표시됐다. 같은 행의 inserted_count 는 정상이라 두 숫자가 어긋났다.
create or replace function public.get_upload_job_counts(
  p_user_id uuid
)
returns table (
  upload_job_id uuid,
  transaction_count bigint,
  signal_count bigint
)
language sql
stable
as $$
  with jobs as (
    select upload_jobs.id
    from public.upload_jobs
    where upload_jobs.user_id = p_user_id
  ),
  transaction_counts as (
    select transactions.upload_job_id, count(*) as total
    from public.transactions
    where transactions.user_id = p_user_id
    group by transactions.upload_job_id
  ),
  signal_counts as (
    select spending_signals.upload_job_id, count(*) as total
    from public.spending_signals
    where spending_signals.user_id = p_user_id
    group by spending_signals.upload_job_id
  )
  select
    jobs.id as upload_job_id,
    coalesce(transaction_counts.total, 0) as transaction_count,
    coalesce(signal_counts.total, 0) as signal_count
  from jobs
  left join transaction_counts on transaction_counts.upload_job_id = jobs.id
  left join signal_counts on signal_counts.upload_job_id = jobs.id;
$$;
