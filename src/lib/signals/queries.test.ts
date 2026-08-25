import { describe, expect, it, vi } from "vitest";

import {
  fetchCategoryAmountMedians,
  fetchCategoryMonthlyTotals,
  fetchRecurringSignalsLatest,
  fetchMerchantHistory,
  fetchPeriodTransactions,
  fetchSeenMerchantsBeforePeriod,
  type SignalAggregateClient,
} from "./queries";

function supabaseMock(data: unknown[] = []) {
  const client = {
    rpc: vi.fn(() => {
      const result = Promise.resolve({ data, error: null });

      // 페이지네이션을 쓰는 wrapper 와 그렇지 않은 wrapper 를 모두 받는다.
      return Object.assign(result, { range: () => result });
    }),
  };

  return client as unknown as SignalAggregateClient & typeof client;
}

/** 페이지가 꽉 차 있는 동안 이어 읽는 wrapper 를 위한 mock. */
function pagedRpcMock(pages: unknown[][]) {
  const ranges: [number, number][] = [];
  let pageIndex = 0;
  const client = {
    rpc: vi.fn(() => {
      // 페이지네이션하지 않는 wrapper 는 첫 페이지만 보게 된다.
      const firstPage = Promise.resolve({ data: pages[0], error: null });

      return Object.assign(firstPage, {
        range: (from: number, to: number) => {
          ranges.push([from, to]);

          return Promise.resolve({
            data: pages[pageIndex++] ?? [],
            error: null,
          });
        },
      });
    }),
  } as unknown as SignalAggregateClient;

  return { client, ranges };
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

  it("calls the latest recurring signals RPC and maps snake_case columns", async () => {
    const payload = {
      intervalDays: [31, 30],
      latestAmount: 17_000,
      merchantNormalized: "NETFLIX",
      occurrenceCount: 3,
    };
    const client = supabaseMock([
      {
        id: "signal-recurring",
        impact: null,
        narrative: null,
        payload,
        period: "2026-03-01",
        target_key: "NETFLIX",
        type: "recurring_payment",
      },
    ]);

    await expect(
      fetchRecurringSignalsLatest(client, "user-1"),
    ).resolves.toEqual([
      {
        id: "signal-recurring",
        impact: null,
        narrative: null,
        payload,
        period: "2026-03-01",
        targetKey: "NETFLIX",
        type: "recurring_payment",
      },
    ]);

    expect(client.rpc).toHaveBeenCalledWith("get_recurring_signals_latest", {
      p_user_id: "user-1",
    });
  });

  it("reads every merchant history page when the first page comes back full", async () => {
    // PostgREST 는 한 응답에 max_rows(1000) 만 싣는다. 한 페이지가 꽉 차서
    // 돌아오면 뒤쪽 가맹점이 통째로 잘려 반복 결제 신호가 사라진다.
    const historyRow = (index: number) => ({
      id: `transaction-${index}`,
      period: "2026-03-01",
      transacted_on: "2026-03-04",
      category: "구독" as const,
      amount: 17_000,
      merchant_normalized: `MERCHANT-${String(index).padStart(4, "0")}`,
    });
    const { client, ranges } = pagedRpcMock([
      Array.from({ length: 1000 }, (_, index) => historyRow(index)),
      [historyRow(1000)],
    ]);

    const history = await fetchMerchantHistory(client, {
      userId: "user-1",
      untilPeriod: "2026-03-01",
    });

    expect(history).toHaveLength(1001);
    expect(history.at(-1)?.merchantNormalized).toBe("MERCHANT-1000");
    // 두 번째 페이지가 덜 차 있으므로 세 번째 요청은 없다.
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("reads every seen merchants page when the first page comes back full", async () => {
    // 잘리면 이미 본 가맹점이 "신규"로 판정돼 new_merchant_large 가 오탐한다.
    const merchantRow = (index: number) => ({
      merchant_normalized: `MERCHANT-${String(index).padStart(4, "0")}`,
    });
    const { client, ranges } = pagedRpcMock([
      Array.from({ length: 1000 }, (_, index) => merchantRow(index)),
      [merchantRow(1000)],
    ]);

    const merchants = await fetchSeenMerchantsBeforePeriod(client, {
      userId: "user-1",
      period: "2026-03-01",
    });

    expect(merchants).toHaveLength(1001);
    expect(merchants.at(-1)).toBe("MERCHANT-1000");
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("reads every period transactions page when the first page comes back full", async () => {
    // 한 달 지출이 1,000건을 넘으면 월말 거래가 이상 거래 판정에서 빠진다.
    const transactionRow = (index: number) => ({
      id: `transaction-${index}`,
      period: "2026-03-01",
      transacted_on: "2026-03-28",
      category: "식비" as const,
      amount: 12_000,
      merchant_normalized: `MERCHANT-${index}`,
    });
    const { client, ranges } = pagedRpcMock([
      Array.from({ length: 1000 }, (_, index) => transactionRow(index)),
      [transactionRow(1000)],
    ]);

    const transactions = await fetchPeriodTransactions(client, {
      userId: "user-1",
      period: "2026-03-01",
    });

    expect(transactions).toHaveLength(1001);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws RPC errors without hiding them", async () => {
    const error = new Error("rpc failed");
    const client = {
      rpc: vi.fn(() => {
        const result = Promise.resolve({ data: null, error });

        return Object.assign(result, { range: () => result });
      }),
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
