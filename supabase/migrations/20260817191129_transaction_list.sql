create or replace function public.get_transactions_page(
  p_user_id uuid,
  p_period date,
  p_search text default null,
  p_categories public.transaction_category[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  transacted_on date,
  merchant_raw text,
  merchant_normalized text,
  category public.transaction_category,
  category_overridden boolean,
  amount bigint,
  transaction_type public.transaction_type
)
language sql
stable
set search_path = ''
as $$
  with month_transactions as (
    select
      transactions.id,
      transactions.transacted_on,
      transactions.merchant_raw,
      transactions.merchant_normalized,
      coalesce(
        user_category_overrides.category,
        transactions.category,
        '기타'::public.transaction_category
      ) as effective_category,
      (user_category_overrides.category is not null) as category_overridden,
      transactions.amount,
      transactions.transaction_type
    from public.transactions
    left join public.user_category_overrides
      on user_category_overrides.user_id = transactions.user_id
     and user_category_overrides.merchant_normalized =
      transactions.merchant_normalized
    where transactions.user_id = p_user_id
      and transactions.transacted_on >= p_period
      and transactions.transacted_on < (p_period + interval '1 month')
      and (
        nullif(btrim(p_search), '') is null
        or transactions.merchant_raw ilike ('%' || p_search || '%')
        or transactions.merchant_normalized ilike ('%' || p_search || '%')
      )
  ),
  filtered_transactions as (
    select *
    from month_transactions
    where (
        p_categories is null
        or cardinality(p_categories) = 0
        or effective_category = any(p_categories)
      )
  )
  select
    filtered_transactions.id,
    filtered_transactions.transacted_on,
    filtered_transactions.merchant_raw,
    filtered_transactions.merchant_normalized,
    filtered_transactions.effective_category as category,
    filtered_transactions.category_overridden,
    filtered_transactions.amount,
    filtered_transactions.transaction_type
  from filtered_transactions
  order by
    transacted_on desc,
    id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

create or replace function public.get_transactions_summary(
  p_user_id uuid,
  p_period date,
  p_search text default null,
  p_categories public.transaction_category[] default null
)
returns table (
  transaction_count bigint,
  expense_total bigint,
  refund_total bigint,
  deposit_total bigint
)
language sql
stable
set search_path = ''
as $$
  with month_transactions as (
    select
      transactions.merchant_raw,
      transactions.merchant_normalized,
      coalesce(
        user_category_overrides.category,
        transactions.category,
        '기타'::public.transaction_category
      ) as effective_category,
      transactions.amount,
      transactions.transaction_type
    from public.transactions
    left join public.user_category_overrides
      on user_category_overrides.user_id = transactions.user_id
     and user_category_overrides.merchant_normalized =
      transactions.merchant_normalized
    where transactions.user_id = p_user_id
      and transactions.transacted_on >= p_period
      and transactions.transacted_on < (p_period + interval '1 month')
      and (
        nullif(btrim(p_search), '') is null
        or transactions.merchant_raw ilike ('%' || p_search || '%')
        or transactions.merchant_normalized ilike ('%' || p_search || '%')
      )
  ),
  filtered_transactions as (
    select *
    from month_transactions
    where (
        p_categories is null
        or cardinality(p_categories) = 0
        or effective_category = any(p_categories)
      )
  )
  select
    count(*)::bigint as transaction_count,
    coalesce(
      sum(amount) filter (where transaction_type = 'expense'),
      0
    )::bigint as expense_total,
    coalesce(
      sum(amount) filter (where transaction_type = 'refund'),
      0
    )::bigint as refund_total,
    coalesce(
      sum(amount) filter (where transaction_type = 'deposit'),
      0
    )::bigint as deposit_total
  from filtered_transactions;
$$;
