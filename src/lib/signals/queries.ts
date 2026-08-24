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

// PostgREST 는 한 응답에 max_rows 행까지만 싣는다(supabase/config.toml).
// 거래 1건당 1행을 돌려주는 RPC 는 이 값을 넘는 순간 조용히 잘린다.
const RPC_PAGE_SIZE = 1000;

function throwIfRpcError(error: { message?: string } | null): void {
  if (error) {
    throw new Error(error.message ?? "Signal aggregate RPC failed.");
  }
}

/** 페이지가 꽉 차 있는 동안 이어 읽는다. 덜 찬 페이지가 마지막이다. */
async function readAllPages<Row>(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message?: string } | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let offset = 0; ; offset += RPC_PAGE_SIZE) {
    const { data, error } = await readPage(offset, offset + RPC_PAGE_SIZE - 1);

    throwIfRpcError(error);

    const page = data ?? [];
    rows.push(...page);

    if (page.length < RPC_PAGE_SIZE) {
      return rows;
    }
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
  const rows = await readAllPages((from, to) =>
    client
      .rpc("get_merchant_history", {
        p_user_id: input.userId,
        p_until_period: input.untilPeriod,
      })
      .range(from, to),
  );

  return rows.map((row) => ({
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
  const rows = await readAllPages((from, to) =>
    client
      .rpc("get_seen_merchants_before_period", {
        p_user_id: input.userId,
        p_period: input.period,
      })
      .range(from, to),
  );

  return rows.map((row) => row.merchant_normalized);
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
