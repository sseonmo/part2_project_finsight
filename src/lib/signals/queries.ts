import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category } from "@/lib/categories";
import type { Database } from "@/types/database";

import type {
  CategoryAmountMedian,
  CategoryMonthlyTotal,
  SignalTransaction,
} from "./types";

export type SignalAggregateClient = Pick<SupabaseClient<Database>, "rpc">;

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
