import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import type {
  CategoryAmountMedian,
  CategoryMonthlyTotal,
  SignalType,
  SignalTransaction,
} from "./types";

export type SignalAggregateClient = Pick<SupabaseClient<Database>, "rpc">;
type RecurringSignalType = Extract<
  SignalType,
  "recurring_payment" | "recurring_price_up"
>;

export type RecurringSignalLatest = {
  id: string;
  type: RecurringSignalType;
  period: string;
  targetKey: string;
  payload: Database["public"]["Functions"]["get_recurring_signals_latest"]["Returns"][number]["payload"];
  impact: number | null;
  narrative: string | null;
};

function throwIfRpcError(error: { message?: string } | null): void {
  if (error) {
    throw new Error(error.message ?? "Signal aggregate RPC failed.");
  }
}

export async function fetchCategoryMonthlyTotals(
  client: SignalAggregateClient,
  input: { userId: string; periods: readonly string[] },
): Promise<CategoryMonthlyTotal[]> {
  const { data, error } = await client.rpc("get_category_monthly_totals", {
    p_user_id: input.userId,
    p_periods: [...input.periods],
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    period: row.period,
    category: row.category,
    totalAmount: Number(row.total_amount),
    transactionCount: Number(row.transaction_count),
  }));
}

export async function fetchPeriodTransactions(
  client: SignalAggregateClient,
  input: { userId: string; period: string },
): Promise<SignalTransaction[]> {
  const { data, error } = await client.rpc("get_period_transactions", {
    p_user_id: input.userId,
    p_period: input.period,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    period: row.period,
    transactedOn: row.transacted_on,
    amount: Number(row.amount),
    category: row.category,
    merchantNormalized: row.merchant_normalized,
    categoryFallback: false,
  }));
}

export async function fetchCategoryAmountMedians(
  client: SignalAggregateClient,
  input: { userId: string; period: string },
): Promise<CategoryAmountMedian[]> {
  const { data, error } = await client.rpc("get_category_amount_medians", {
    p_user_id: input.userId,
    p_period: input.period,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    period: row.period,
    category: row.category,
    medianAmount: Number(row.median_amount),
  }));
}

export async function fetchMerchantHistory(
  client: SignalAggregateClient,
  input: { userId: string; untilPeriod: string },
): Promise<SignalTransaction[]> {
  const { data, error } = await client.rpc("get_merchant_history", {
    p_user_id: input.userId,
    p_until_period: input.untilPeriod,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    period: row.period,
    transactedOn: row.transacted_on,
    amount: Number(row.amount),
    category: row.category,
    merchantNormalized: row.merchant_normalized,
    categoryFallback: false,
  }));
}

export async function fetchSeenMerchantsBeforePeriod(
  client: SignalAggregateClient,
  input: { userId: string; period: string },
): Promise<string[]> {
  const { data, error } = await client.rpc("get_seen_merchants_before_period", {
    p_user_id: input.userId,
    p_period: input.period,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => row.merchant_normalized);
}

export async function fetchRecurringSignalsLatest(
  client: SignalAggregateClient,
  userId: string,
): Promise<RecurringSignalLatest[]> {
  const { data, error } = await client.rpc("get_recurring_signals_latest", {
    p_user_id: userId,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    impact: row.impact === null ? null : Number(row.impact),
    narrative: row.narrative,
    payload: row.payload,
    period: row.period,
    targetKey: row.target_key,
    type: row.type as RecurringSignalType,
  }));
}
