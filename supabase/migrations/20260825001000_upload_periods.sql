-- 업로드가 포함하는 달 목록. 워커가 거래 행을 전부 받아 TS 에서 Set 으로
-- 줄이던 것을 대체한다 — 그 조회는 PostgREST 의 max_rows(1000) 에 잘려
-- 1,000행이 넘는 업로드에서 뒷 달이 목록에서 빠지고, 그 달의 신호가
-- 아예 생성되지 않은 채 job 이 completed 로 끝났다.
create or replace function public.get_upload_periods(
  p_upload_job_id uuid
)
returns table (
  period date
)
language sql
stable
as $$
  select distinct date_trunc('month', transactions.transacted_on)::date as period
  from public.transactions
  where transactions.upload_job_id = p_upload_job_id
  order by period;
$$;
