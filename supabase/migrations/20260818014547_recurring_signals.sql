create or replace function public.get_recurring_signals_latest(
  p_user_id uuid
)
returns table (
  id uuid,
  type public.spending_signal_type,
  period date,
  target_key text,
  payload jsonb,
  impact bigint,
  narrative text
)
language sql
stable
as $$
  select distinct on (spending_signals.type, spending_signals.target_key)
    spending_signals.id,
    spending_signals.type,
    spending_signals.period,
    spending_signals.target_key,
    spending_signals.payload,
    spending_signals.impact,
    spending_signals.narrative
  from public.spending_signals
  where spending_signals.user_id = p_user_id
    and spending_signals.type in ('recurring_payment', 'recurring_price_up')
  order by
    spending_signals.type,
    spending_signals.target_key,
    spending_signals.period desc;
$$;
