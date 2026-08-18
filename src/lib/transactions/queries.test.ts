import { describe, expect, it, vi } from "vitest";

import {
  fetchTransactionsPage,
  fetchTransactionsSummary,
  type TransactionListClient,
} from "./queries";

function supabaseMock(data: unknown[] = []) {
  const client = {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };

  return client as unknown as TransactionListClient & typeof client;
}

describe("transaction list query wrappers", () => {
  it("calls the transaction page RPC with URL-derived filters", async () => {
    const client = supabaseMock([
      {
        id: "transaction-1",
        transacted_on: "2026-03-18",
        merchant_raw: "스타벅스 강남점",
        merchant_normalized: "스타벅스",
        category: "카페/간식",
        category_overridden: true,
        amount: 5100,
        transaction_type: "expense",
      },
    ]);

    await expect(
      fetchTransactionsPage(client, {
        userId: "user-1",
        period: "2026-03-01",
        search: "스타벅스",
        categories: ["카페/간식"],
        limit: 20,
        offset: 40,
      }),
    ).resolves.toEqual([
      {
        id: "transaction-1",
        transactedOn: "2026-03-18",
        merchantRaw: "스타벅스 강남점",
        merchantNormalized: "스타벅스",
        category: "카페/간식",
        categoryOverridden: true,
        amount: 5100,
        transactionType: "expense",
      },
    ]);

    expect(client.rpc).toHaveBeenCalledWith("get_transactions_page", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
      p_search: "스타벅스",
      p_categories: ["카페/간식"],
      p_limit: 20,
      p_offset: 40,
    });
  });

  it("normalizes empty search and category filters to omitted RPC args", async () => {
    const client = supabaseMock([]);

    await fetchTransactionsPage(client, {
      userId: "user-1",
      period: "2026-03-01",
      search: "   ",
      categories: [],
      limit: 20,
      offset: 0,
    });

    expect(client.rpc).toHaveBeenCalledWith("get_transactions_page", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
      p_search: undefined,
      p_categories: undefined,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("returns summary totals without combining refunds into expenses", async () => {
    const client = supabaseMock([
      {
        transaction_count: 12,
        expense_total: 300000,
        refund_total: 150000,
        deposit_total: 50000,
      },
    ]);

    await expect(
      fetchTransactionsSummary(client, {
        userId: "user-1",
        period: "2026-03-01",
        search: null,
        categories: null,
      }),
    ).resolves.toEqual({
      transactionCount: 12,
      expenseTotal: 300000,
      refundTotal: 150000,
      depositTotal: 50000,
    });

    expect(client.rpc).toHaveBeenCalledWith("get_transactions_summary", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
      p_search: undefined,
      p_categories: undefined,
    });
  });

  it("throws RPC errors without hiding them", async () => {
    const error = new Error("transaction rpc failed");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    } as unknown as TransactionListClient & {
      rpc: ReturnType<typeof vi.fn>;
    };

    await expect(
      fetchTransactionsSummary(client, {
        userId: "user-1",
        period: "2026-03-01",
        search: null,
        categories: null,
      }),
    ).rejects.toThrow("transaction rpc failed");
  });
});
