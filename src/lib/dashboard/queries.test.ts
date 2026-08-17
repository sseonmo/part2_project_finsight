import { describe, expect, it, vi } from "vitest";

import {
  fetchDashboardCategoryBreakdown,
  fetchDashboardMonthlyFlow,
  fetchDashboardSummary,
  fetchDashboardTopMerchants,
  type DashboardAggregateClient,
} from "./queries";

function supabaseMock(data: unknown[] = []) {
  const client = {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
  };

  return client as unknown as DashboardAggregateClient & typeof client;
}

describe("dashboard aggregate query wrappers", () => {
  it("calls the summary RPC with the period and optional through day", async () => {
    const client = supabaseMock([
      {
        total_expense: 245_000,
        transaction_count: 12,
        refund_total: 15_000,
        deposit_total: 80_000,
        top_category: "식비",
        top_category_amount: 120_000,
        active_days: 9,
      },
    ]);

    await expect(
      fetchDashboardSummary(client, {
        userId: "user-1",
        period: "2026-03-01",
        throughDay: 18,
      }),
    ).resolves.toEqual({
      totalExpense: 245_000,
      transactionCount: 12,
      refundTotal: 15_000,
      depositTotal: 80_000,
      topCategory: "식비",
      topCategoryAmount: 120_000,
      activeDays: 9,
    });

    expect(client.rpc).toHaveBeenCalledWith("get_dashboard_summary", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
      p_through_day: 18,
    });
  });

  it("returns an empty summary when the RPC has no row", async () => {
    const client = supabaseMock([]);

    await expect(
      fetchDashboardSummary(client, {
        userId: "user-1",
        period: "2026-03-01",
      }),
    ).resolves.toEqual({
      totalExpense: 0,
      transactionCount: 0,
      refundTotal: 0,
      depositTotal: 0,
      topCategory: null,
      topCategoryAmount: 0,
      activeDays: 0,
    });
  });

  it("calls the category breakdown RPC", async () => {
    const client = supabaseMock([
      {
        category: "기타",
        total_amount: 50_000,
        transaction_count: 3,
      },
    ]);

    await expect(
      fetchDashboardCategoryBreakdown(client, {
        userId: "user-1",
        period: "2026-03-01",
      }),
    ).resolves.toEqual([
      {
        category: "기타",
        totalAmount: 50_000,
        transactionCount: 3,
      },
    ]);

    expect(client.rpc).toHaveBeenCalledWith(
      "get_dashboard_category_breakdown",
      {
        p_user_id: "user-1",
        p_period: "2026-03-01",
      },
    );
  });

  it("calls the monthly flow RPC", async () => {
    const client = supabaseMock([
      { period: "2026-02-01", total_amount: 0 },
      { period: "2026-03-01", total_amount: 210_000 },
    ]);

    await expect(
      fetchDashboardMonthlyFlow(client, {
        userId: "user-1",
        untilPeriod: "2026-03-01",
        months: 6,
      }),
    ).resolves.toEqual([
      { period: "2026-02-01", totalAmount: 0 },
      { period: "2026-03-01", totalAmount: 210_000 },
    ]);

    expect(client.rpc).toHaveBeenCalledWith("get_dashboard_monthly_flow", {
      p_user_id: "user-1",
      p_until_period: "2026-03-01",
      p_months: 6,
    });
  });

  it("calls the top merchants RPC", async () => {
    const client = supabaseMock([
      {
        merchant_normalized: "STARBUCKS",
        total_amount: 42_000,
        transaction_count: 6,
        category: "카페/간식",
      },
    ]);

    await expect(
      fetchDashboardTopMerchants(client, {
        userId: "user-1",
        period: "2026-03-01",
        limit: 5,
      }),
    ).resolves.toEqual([
      {
        merchantNormalized: "STARBUCKS",
        totalAmount: 42_000,
        transactionCount: 6,
        category: "카페/간식",
      },
    ]);

    expect(client.rpc).toHaveBeenCalledWith("get_dashboard_top_merchants", {
      p_user_id: "user-1",
      p_period: "2026-03-01",
      p_limit: 5,
    });
  });

  it("throws RPC errors without hiding them", async () => {
    const error = new Error("dashboard rpc failed");
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error }),
    } as unknown as DashboardAggregateClient & {
      rpc: ReturnType<typeof vi.fn>;
    };

    await expect(
      fetchDashboardMonthlyFlow(client, {
        userId: "user-1",
        untilPeriod: "2026-03-01",
        months: 6,
      }),
    ).rejects.toThrow("dashboard rpc failed");
  });
});
