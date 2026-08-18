import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category } from "@/lib/categories";
import type { Database } from "@/types/database";

export type TransactionListClient = Pick<SupabaseClient<Database>, "rpc">;

export type TransactionListRow = {
  id: string;
  transactedOn: string;
  merchantRaw: string;
  merchantNormalized: string;
  category: Category;
  categoryOverridden: boolean;
  amount: number;
  transactionType: Database["public"]["Enums"]["transaction_type"];
};

export type TransactionListSummary = {
  transactionCount: number;
  expenseTotal: number;
  refundTotal: number;
  depositTotal: number;
};

const EMPTY_SUMMARY: TransactionListSummary = {
  transactionCount: 0,
  expenseTotal: 0,
  refundTotal: 0,
  depositTotal: 0,
};

function throwIfRpcError(error: { message?: string } | null): void {
  if (error) {
    throw new Error(error.message ?? "Transaction list RPC failed.");
  }
}

// 인자를 아예 넘기지 않으면 SQL 쪽 `default null` 이 적용된다. RPC 파라미터가
// optional 로 생성되므로 null 을 명시적으로 실어 보낼 수는 없다.
function normalizeSearch(search: string | null | undefined): string | undefined {
  const trimmed = search?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizeCategories(
  categories: Category[] | null | undefined,
): Category[] | undefined {
  return categories && categories.length > 0 ? categories : undefined;
}

export async function fetchTransactionsPage(
  client: TransactionListClient,
  input: {
    userId: string;
    period: string;
    search: string | null;
    categories: Category[] | null;
    limit: number;
    offset: number;
  },
): Promise<TransactionListRow[]> {
  const { data, error } = await client.rpc("get_transactions_page", {
    p_user_id: input.userId,
    p_period: input.period,
    p_search: normalizeSearch(input.search),
    p_categories: normalizeCategories(input.categories),
    p_limit: input.limit,
    p_offset: input.offset,
  });

  throwIfRpcError(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    transactedOn: row.transacted_on,
    merchantRaw: row.merchant_raw,
    merchantNormalized: row.merchant_normalized,
    category: row.category,
    categoryOverridden: row.category_overridden,
    amount: Number(row.amount),
    transactionType: row.transaction_type,
  }));
}

export async function fetchTransactionsSummary(
  client: TransactionListClient,
  input: {
    userId: string;
    period: string;
    search: string | null;
    categories: Category[] | null;
  },
): Promise<TransactionListSummary> {
  const { data, error } = await client.rpc("get_transactions_summary", {
    p_user_id: input.userId,
    p_period: input.period,
    p_search: normalizeSearch(input.search),
    p_categories: normalizeCategories(input.categories),
  });

  throwIfRpcError(error);

  const row = data?.[0];

  if (!row) {
    return EMPTY_SUMMARY;
  }

  return {
    transactionCount: Number(row.transaction_count),
    expenseTotal: Number(row.expense_total),
    refundTotal: Number(row.refund_total),
    depositTotal: Number(row.deposit_total),
  };
}
