create or replace function public.get_transaction_months(p_user_id uuid)
returns table (
  period date,
  transaction_count bigint
)
language sql
stable
set search_path = ''
as $$
  select
    date_trunc('month', transactions.transacted_on)::date as period,
    count(*)::bigint as transaction_count
  from public.transactions
  where transactions.user_id = p_user_id
  group by period
  order by period desc;
$$;
