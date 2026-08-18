alter table public.monthly_reports
  add column generation_started_at timestamptz;

create or replace function public.claim_monthly_report_generation(
  p_user_id uuid,
  p_month date,
  p_stale_after interval
)
returns boolean
language sql
volatile
set search_path = ''
as $$
  with claimed as (
    insert into public.monthly_reports (
      user_id,
      month,
      narrative,
      generation_started_at
    )
    values (
      p_user_id,
      p_month,
      '',
      now()
    )
    on conflict (user_id, month) do update
      set generation_started_at = now()
      where public.monthly_reports.generation_started_at is null
        or public.monthly_reports.generation_started_at < now() - p_stale_after
    returning true
  )
  select coalesce((select true from claimed limit 1), false);
$$;
