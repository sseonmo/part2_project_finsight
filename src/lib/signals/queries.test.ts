import { describe, expect, it, vi } from "vitest";

import {
  fetchCategoryAmountMedians,
  fetchCategoryMonthlyTotals,
  fetchMerchantHistory,
  fetchPeriodTransactions,
  fetchSeenMerchantsBeforePeriod,
  type SignalAggregateClient,
} from "./queries";

function supabaseMock(data: unknown[] = []) {
  const client = {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };

  return client as unknown as SignalAggregateClient & typeof client;
}

describe("signal aggregate query wrappers", () => {
  it("calls the category monthly totals RPC with the user id and periods", async () => {
    const client = supabaseMock([
      {
        period: "2026-03-01",
        category: "식비",
        total_amount: 120_000,
        transaction_count: 4,
      },
    ]);

    await expect(
      fetchCategoryMonthlyTotals(client, {
        userId: "user-1",
        periods: ["2026-02-01", "2026-03-01"],
      }),
    ).resolves.toEqual([
      {
        period: "2026-03-01",
        category: "식비",
        totalAmount: 120_000,
        transactionCount: 4,
      },
    ]);

    expect(client.rpc).toHaveBeenCalledWith("get_category_monthly_totals", {
      p_user_id: "user-1",
      p_periods: ["2026-02-01", "2026-03-01"],
    });
  });

  it("calls the period transactions RPC", async () => {
    const client = supabaseMock([]);

    await fetchPeriodTransactions(client, {
      userId: "user-1",
      period: "2026-03-01",
    });

    expect(client.rpc).toHaveBeenCalledWith("get_period_transactions", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
    });
  });

  it("calls the category amount medians RPC", async () => {
    const client = supabaseMock([]);

    await fetchCategoryAmountMedians(client, {
      userId: "user-1",
      period: "2026-03-01",
    });

    expect(client.rpc).toHaveBeenCalledWith("get_category_amount_medians", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
    });
  });

  it("calls the merchant history RPC", async () => {
    const client = supabaseMock([]);

    await fetchMerchantHistory(client, {
      userId: "user-1",
      untilPeriod: "2026-03-01",
    });

    expect(client.rpc).toHaveBeenCalledWith("get_merchant_history", {
      p_user_id: "user-1",
      p_until_period: "2026-03-01",
    });
  });

  it("calls the seen merchants RPC", async () => {
    const client = supabaseMock([{ merchant_normalized: "STARBUCKS" }]);

    await expect(
      fetchSeenMerchantsBeforePeriod(client, {
        userId: "user-1",
        period: "2026-03-01",
      }),
    ).resolves.toEqual(["STARBUCKS"]);

    expect(client.rpc).toHaveBeenCalledWith("get_seen_merchants_before_period", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
    });
  });

  it("throws RPC errors without hiding them", async () => {
    const error = new Error("rpc failed");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    } as unknown as SignalAggregateClient & {
      rpc: ReturnType<typeof vi.fn>;
    };

    await expect(
      fetchPeriodTransactions(client, {
        userId: "user-1",
        period: "2026-03-01",
      }),
    ).rejects.toThrow("rpc failed");
  });
});
