import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category } from "@/lib/categories";
import type { Database } from "@/types/database";

export type DashboardAggregateClient = Pick<SupabaseClient<Database>, "rpc">;

export type DashboardSummary = {
  totalExpense: number;
  transactionCount: number;
  refundTotal: number;
  depositTotal: number;
  topCategory: Category | null;
  topCategoryAmount: number;
  activeDays: number;
};

export type DashboardCategoryBreakdown = {
  category: Category;
  totalAmount: number;
  transactionCount: number;
};

export type DashboardMonthlyFlow = {
  period: string;
  totalAmount: number;
};

export type DashboardTopMerchant = {
  merchantNormalized: string;
  totalAmount: number;
  transactionCount: number;
  category: Category;
};

const EMPTY_SUMMARY: DashboardSummary = {
  totalExpense: 0,
  transactionCount: 0,
  refundTotal: 0,
  depositTotal: 0,
  topCategory: null,
  topCategoryAmount: 0,
  activeDays: 0,
};

function throwIfRpcError(error: { message?: string } | null): void {
  if (error) {
    throw new Error(error.message ?? "Dashboard aggregate RPC failed.");
  }
}

export async function fetchDashboardSummary(
  client: DashboardAggregateClient,
  input: { userId: string; period: string; throughDay?: number | null },
): Promise<DashboardSummary> {
  const args: Database["public"]["Functions"]["get_dashboard_summary"]["Args"] = {
    p_user_id: input.userId,
    p_period: input.period,
  };

  if (input.throughDay !== undefined && input.throughDay !== null) {
    args.p_through_day = input.throughDay;
  }

  const { data, error } = await client.rpc("get_dashboard_summary", args);

  throwIfRpcError(error);

  const row = data?.[0];

  if (!row) {
    return EMPTY_SUMMARY;
  }

  return {
    totalExpense: Number(row.total_expense),
    transactionCount: Number(row.transaction_count),
    refundTotal: Number(row.refund_total),
    depositTotal: Number(row.deposit_total),
    topCategory: row.top_category,
    topCategoryAmount: Number(row.top_category_amount),
    activeDays: Number(row.active_days),
  };
}

export async function fetchDashboardCategoryBreakdown(
  client: DashboardAggregateClient,
  input: { userId: string; period: string },
): Promise<DashboardCategoryBreakdown[]> {
  const { data, error } = await client.rpc(
    "get_dashboard_category_breakdown",
    {
      p_user_id: input.userId,
      p_period: input.period,
    },
  );

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    category: row.category,
    totalAmount: Number(row.total_amount),
    transactionCount: Number(row.transaction_count),
  }));
}

export async function fetchDashboardMonthlyFlow(
  client: DashboardAggregateClient,
  input: { userId: string; untilPeriod: string; months: number },
): Promise<DashboardMonthlyFlow[]> {
  const { data, error } = await client.rpc("get_dashboard_monthly_flow", {
    p_user_id: input.userId,
    p_until_period: input.untilPeriod,
    p_months: input.months,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    period: row.period,
    totalAmount: Number(row.total_amount),
  }));
}

export async function fetchDashboardTopMerchants(
  client: DashboardAggregateClient,
  input: { userId: string; period: string; limit: number },
): Promise<DashboardTopMerchant[]> {
  const { data, error } = await client.rpc("get_dashboard_top_merchants", {
    p_user_id: input.userId,
    p_period: input.period,
    p_limit: input.limit,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    merchantNormalized: row.merchant_normalized,
    totalAmount: Number(row.total_amount),
    transactionCount: Number(row.transaction_count),
    category: row.category,
  }));
}
