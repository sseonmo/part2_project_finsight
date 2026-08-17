create or replace function public.get_dashboard_summary(
  p_user_id uuid,
  p_period date,
  p_through_day integer default null
)
returns table (
  total_expense bigint,
  transaction_count bigint,
  refund_total bigint,
  deposit_total bigint,
  top_category public.transaction_category,
  top_category_amount bigint,
  active_days integer
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select
      p_period::date as period_start,
      (p_period + interval '1 month')::date as period_end
  ),
  month_transactions as (
    select
      transactions.transacted_on,
      transactions.amount,
      transactions.transaction_type,
      coalesce(
        user_category_overrides.category,
        transactions.category,
        '기타'::public.transaction_category
      ) as effective_category
    from public.transactions
    left join public.user_category_overrides
      on user_category_overrides.user_id = transactions.user_id
     and user_category_overrides.merchant_normalized = transactions.merchant_normalized
    cross join bounds
    where transactions.user_id = p_user_id
      and transactions.transacted_on >= bounds.period_start
      and transactions.transacted_on < bounds.period_end
      and (
        p_through_day is null
        or extract(day from transactions.transacted_on)::integer <= p_through_day
      )
  ),
  expense_transactions as (
    select *
    from month_transactions
    where transaction_type = 'expense'
  ),
  top_expense_category as (
    select
      effective_category as category,
      sum(amount)::bigint as total_amount
    from expense_transactions
    group by effective_category
    order by total_amount desc, effective_category
    limit 1
  )
  select
    coalesce((select sum(amount)::bigint from expense_transactions), 0::bigint)
      as total_expense,
    coalesce((select count(*)::bigint from expense_transactions), 0::bigint)
      as transaction_count,
    coalesce((
      select sum(amount)::bigint
      from month_transactions
      where transaction_type = 'refund'
    ), 0::bigint) as refund_total,
    coalesce((
      select sum(amount)::bigint
      from month_transactions
      where transaction_type = 'deposit'
    ), 0::bigint) as deposit_total,
    (select category from top_expense_category) as top_category,
    coalesce((
      select total_amount
      from top_expense_category
    ), 0::bigint) as top_category_amount,
    coalesce((
      select count(distinct transacted_on)::integer
      from expense_transactions
    ), 0) as active_days;
$$;

create or replace function public.get_dashboard_category_breakdown(
  p_user_id uuid,
  p_period date
)
returns table (
  category public.transaction_category,
  total_amount bigint,
  transaction_count bigint
)
language sql
stable
set search_path = ''
as $$
  with categorized_expenses as (
    select
      coalesce(
        user_category_overrides.category,
        transactions.category,
        '기타'::public.transaction_category
      ) as effective_category,
      transactions.amount
    from public.transactions
    left join public.user_category_overrides
      on user_category_overrides.user_id = transactions.user_id
     and user_category_overrides.merchant_normalized = transactions.merchant_normalized
    where transactions.user_id = p_user_id
      and transactions.transaction_type = 'expense'
      and transactions.transacted_on >= p_period
      and transactions.transacted_on < (p_period + interval '1 month')
  )
  select
    effective_category as category,
    sum(amount)::bigint as total_amount,
    count(*)::bigint as transaction_count
  from categorized_expenses
  group by effective_category
  order by total_amount desc, transaction_count desc, effective_category;
$$;

create or replace function public.get_dashboard_monthly_flow(
  p_user_id uuid,
  p_until_period date,
  p_months integer
)
returns table (
  period date,
  total_amount bigint
)
language sql
stable
set search_path = ''
as $$
  with month_series as (
    select generate_series(
      date_trunc('month', p_until_period)::date
        - ((greatest(p_months, 1) - 1) * interval '1 month'),
      date_trunc('month', p_until_period)::date,
      interval '1 month'
    )::date as period
  ),
  expense_totals as (
    select
      date_trunc('month', transactions.transacted_on)::date as period,
      sum(transactions.amount)::bigint as total_amount
    from public.transactions
    where transactions.user_id = p_user_id
      and transactions.transaction_type = 'expense'
      and transactions.transacted_on >= (
        date_trunc('month', p_until_period)::date
          - ((greatest(p_months, 1) - 1) * interval '1 month')
      )
      and transactions.transacted_on < (
        date_trunc('month', p_until_period)::date + interval '1 month'
      )
    group by period
  )
  select
    month_series.period,
    coalesce(expense_totals.total_amount, 0::bigint) as total_amount
  from month_series
  left join expense_totals
    on expense_totals.period = month_series.period
  order by month_series.period;
$$;

create or replace function public.get_dashboard_top_merchants(
  p_user_id uuid,
  p_period date,
  p_limit integer
)
returns table (
  merchant_normalized text,
  total_amount bigint,
  transaction_count bigint,
  category public.transaction_category
)
language sql
stable
set search_path = ''
as $$
  with categorized_expenses as (
    select
      transactions.merchant_normalized,
      transactions.amount,
      coalesce(
        user_category_overrides.category,
        transactions.category,
        '기타'::public.transaction_category
      ) as effective_category
    from public.transactions
    left join public.user_category_overrides
      on user_category_overrides.user_id = transactions.user_id
     and user_category_overrides.merchant_normalized = transactions.merchant_normalized
    where transactions.user_id = p_user_id
      and transactions.transaction_type = 'expense'
      and transactions.transacted_on >= p_period
      and transactions.transacted_on < (p_period + interval '1 month')
  ),
  merchant_totals as (
    select
      merchant_normalized,
      sum(amount)::bigint as total_amount,
      count(*)::bigint as transaction_count
    from categorized_expenses
    group by merchant_normalized
  ),
  merchant_category_totals as (
    select
      merchant_normalized,
      effective_category,
      sum(amount)::bigint as category_amount
    from categorized_expenses
    group by merchant_normalized, effective_category
  ),
  merchant_primary_categories as (
    select distinct on (merchant_normalized)
      merchant_normalized,
      effective_category as category
    from merchant_category_totals
    order by merchant_normalized, category_amount desc, effective_category
  )
  select
    merchant_totals.merchant_normalized,
    merchant_totals.total_amount,
    merchant_totals.transaction_count,
    merchant_primary_categories.category
  from merchant_totals
  join merchant_primary_categories
    on merchant_primary_categories.merchant_normalized =
      merchant_totals.merchant_normalized
  order by
    merchant_totals.total_amount desc,
    merchant_totals.transaction_count desc,
    merchant_totals.merchant_normalized
  limit greatest(p_limit, 0);
$$;
