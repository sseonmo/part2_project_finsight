create or replace function public.get_category_monthly_totals(
  p_user_id uuid,
  p_periods date[]
)
returns table (
  period date,
  category public.transaction_category,
  total_amount bigint,
  transaction_count bigint
)
language sql
stable
as $$
  select
    date_trunc('month', transactions.transacted_on)::date as period,
    transactions.category as category,
    sum(transactions.amount)::bigint as total_amount,
    count(*)::bigint as transaction_count
  from public.transactions
  where transactions.user_id = p_user_id
    and transactions.transaction_type = 'expense'
    and transactions.category_fallback = false
    and transactions.amount > 0
    and transactions.category is not null
    and date_trunc('month', transactions.transacted_on)::date = any(p_periods)
  group by period, transactions.category
  order by period, transactions.category;
$$;

create or replace function public.get_period_transactions(
  p_user_id uuid,
  p_period date
)
returns table (
  id uuid,
  period date,
  transacted_on date,
  category public.transaction_category,
  amount bigint,
  merchant_normalized text
)
language sql
stable
as $$
  select
    transactions.id,
    date_trunc('month', transactions.transacted_on)::date as period,
    transactions.transacted_on,
    transactions.category,
    transactions.amount,
    transactions.merchant_normalized
  from public.transactions
  where transactions.user_id = p_user_id
    and transactions.transaction_type = 'expense'
    and transactions.category_fallback = false
    and transactions.amount > 0
    and transactions.category is not null
    and transactions.transacted_on >= p_period
    and transactions.transacted_on < (p_period + interval '1 month')
  order by transactions.transacted_on, transactions.id;
$$;

create or replace function public.get_category_amount_medians(
  p_user_id uuid,
  p_period date
)
returns table (
  period date,
  category public.transaction_category,
  median_amount numeric
)
language sql
stable
as $$
  select
    p_period as period,
    transactions.category,
    percentile_cont(0.5) within group (order by transactions.amount)::numeric
      as median_amount
  from public.transactions
  where transactions.user_id = p_user_id
    and transactions.transaction_type = 'expense'
    and transactions.category_fallback = false
    and transactions.amount > 0
    and transactions.category is not null
    and transactions.transacted_on >= p_period
    and transactions.transacted_on < (p_period + interval '1 month')
  group by transactions.category
  order by transactions.category;
$$;

create or replace function public.get_merchant_history(
  p_user_id uuid,
  p_until_period date
)
returns table (
  id uuid,
  period date,
  transacted_on date,
  category public.transaction_category,
  amount bigint,
  merchant_normalized text
)
language sql
stable
as $$
  select
    transactions.id,
    date_trunc('month', transactions.transacted_on)::date as period,
    transactions.transacted_on,
    transactions.category,
    transactions.amount,
    transactions.merchant_normalized
  from public.transactions
  where transactions.user_id = p_user_id
    and transactions.transaction_type = 'expense'
    and transactions.category_fallback = false
    and transactions.amount > 0
    and transactions.category is not null
    and transactions.transacted_on < (p_until_period + interval '1 month')
  order by transactions.merchant_normalized, transactions.transacted_on, transactions.id;
$$;

create or replace function public.get_seen_merchants_before_period(
  p_user_id uuid,
  p_period date
)
returns table (
  merchant_normalized text
)
language sql
stable
as $$
  select distinct transactions.merchant_normalized
  from public.transactions
  where transactions.user_id = p_user_id
    and transactions.transaction_type = 'expense'
    and transactions.category_fallback = false
    and transactions.amount > 0
    and transactions.category is not null
    and transactions.transacted_on < p_period
  order by transactions.merchant_normalized;
$$;
