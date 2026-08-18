import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIGNAL_CONDITION_COPY } from "@/lib/signals/thresholds";

import NotFoundPage from "./not-found";
import Page from "./page";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const useParamsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
  useParams: useParamsMock,
}));

type SignalType =
  | "category_spike"
  | "new_merchant_large"
  | "outlier_transaction"
  | "recurring_payment"
  | "recurring_price_up";

type SignalRow = {
  id: string;
  impact: number | null;
  narrative: string | null;
  payload: Record<string, unknown>;
  period: string;
  target_key: string;
  type: SignalType;
};

type TransactionRow = {
  amount: number;
  category: string;
  id: string;
  merchant_normalized: string;
  merchant_raw: string;
  transacted_on: string;
};

type QueryCall = {
  args: unknown[];
  method: string;
};

type MockQuery<T> = {
  calls: QueryCall[];
  query: {
    eq: ReturnType<typeof vi.fn>;
    gt: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lt: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    then: Promise<{ data: T; error: null }>["then"];
  };
};

function createQuery<T>(data: T): MockQuery<T> {
  const calls: QueryCall[] = [];
  const result = Promise.resolve({ data, error: null });
  const query = {
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "eq" });
      return query;
    }),
    gt: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "gt" });
      return query;
    }),
    gte: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "gte" });
      return query;
    }),
    lt: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "lt" });
      return query;
    }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    not: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "not" });
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: "order" });
      return query;
    }),
    select: vi.fn(() => query),
    then: result.then.bind(result),
  };

  return { calls, query };
}

function mockSession() {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: { canWrite: false, state: "expired" },
    userId: "user-1",
  });
}

function mockSignalDetail(input: {
  signal: SignalRow | null;
  transactions?: TransactionRow[];
}) {
  const signalQuery = createQuery(input.signal);
  const transactionQuery = createQuery(input.transactions ?? []);
  const from = vi.fn((table: string) => {
    if (table === "spending_signals") {
      return signalQuery.query;
    }

    if (table === "transactions") {
      return transactionQuery.query;
    }

    throw new Error(`Unexpected table ${table}`);
  });

  createServerClientMock.mockResolvedValue({ from });

  return { from, signalQuery, transactionQuery };
}

async function renderSignalDetail(input?: {
  signalId?: string;
  yearMonth?: string;
}) {
  const element = await Page({
    params: Promise.resolve({
      signalId: input?.signalId ?? "signal-1",
      yearMonth: input?.yearMonth ?? "2026-03",
    }),
  });

  render(element);
}

function expectCall(
  calls: readonly QueryCall[],
  method: string,
  ...args: unknown[]
) {
  expect(calls).toContainEqual({ args, method });
}

function metricValue(label: string): string | null | undefined {
  const metric = screen.getByText(label).closest(".signal-detail-metric");

  return metric?.querySelector("dd")?.textContent;
}

const baseTransaction: TransactionRow = {
  amount: 10_000,
  category: "카페/간식",
  id: "tx-1",
  merchant_normalized: "STARBUCKS",
  merchant_raw: "스타벅스",
  transacted_on: "2026-03-04",
};

describe("/dashboard/review/[yearMonth]/[signalId]", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders category spike details from payload and queries eligible evidence transactions", async () => {
    mockSession();
    const { signalQuery, transactionQuery } = mockSignalDetail({
      signal: {
        id: "signal-1",
        impact: 62_000,
        narrative: "카페·간식이 지난달보다 62,000원 늘었습니다.",
        payload: {
          category: "카페/간식",
          currentPeriod: "2026-03-01",
          currentTotal: 169_000,
          increaseAmount: 62_000,
          increaseRatio: 0.58,
          previousPeriod: "2026-02-01",
          previousTotal: 107_000,
        },
        period: "2026-03-01",
        target_key: "카페/간식",
        type: "category_spike",
      },
      transactions: [
        {
          ...baseTransaction,
          amount: 32_000,
          id: "tx-previous",
          transacted_on: "2026-02-12",
        },
        {
          ...baseTransaction,
          amount: 51_000,
          id: "tx-current",
          transacted_on: "2026-03-12",
        },
      ],
    });

    await renderSignalDetail();

    expectCall(signalQuery.calls, "eq", "id", "signal-1");
    expectCall(signalQuery.calls, "eq", "user_id", "user-1");
    expectCall(signalQuery.calls, "eq", "period", "2026-03-01");

    expect(screen.getByText("카페·간식이 지난달보다 62,000원 늘었습니다."))
      .toBeInTheDocument();
    expect(metricValue("지난달 지출")).toBe("107,000원");
    expect(metricValue("이번 달 지출")).toBe("169,000원");
    expect(metricValue("증가액")).toBe("62,000원");
    expect(metricValue("증가율")).toBe("58%");
    expect(
      screen.getByText(SIGNAL_CONDITION_COPY.category_spike),
    ).toBeInTheDocument();
    expect(screen.getAllByText("스타벅스")).toHaveLength(2);
    expect(screen.queryByText("증거")).not.toBeInTheDocument();

    expectCall(transactionQuery.calls, "eq", "user_id", "user-1");
    expectCall(transactionQuery.calls, "eq", "transaction_type", "expense");
    expectCall(transactionQuery.calls, "eq", "category_fallback", false);
    expectCall(transactionQuery.calls, "not", "category", "is", null);
    expectCall(transactionQuery.calls, "gt", "amount", 0);
    expectCall(transactionQuery.calls, "eq", "category", "카페/간식");
    expectCall(transactionQuery.calls, "gte", "transacted_on", "2026-02-01");
    expectCall(transactionQuery.calls, "lt", "transacted_on", "2026-04-01");
  });

  it.each([
    {
      expectedCalls: [["eq", "merchant_normalized", "PAYPAL"]],
      expectedEvidenceCount: 1,
      highlightedRows: 1,
      signal: {
        id: "signal-new",
        impact: 120_000,
        narrative: null,
        payload: {
          amount: 120_000,
          category: "쇼핑",
          medianAmount: 30_000,
          merchantNormalized: "PAYPAL",
          transactionId: "tx-new",
        },
        period: "2026-03-01",
        target_key: "PAYPAL",
        type: "new_merchant_large" as const,
      },
      transactions: [
        {
          ...baseTransaction,
          amount: 120_000,
          category: "쇼핑",
          id: "tx-new",
          merchant_normalized: "PAYPAL",
          merchant_raw: "PAYPAL",
        },
      ],
    },
    {
      expectedCalls: [
        ["eq", "category", "쇼핑"],
        ["gte", "transacted_on", "2026-03-01"],
        ["lt", "transacted_on", "2026-04-01"],
      ],
      expectedEvidenceCount: 2,
      highlightedRows: 1,
      signal: {
        id: "signal-outlier",
        impact: 80_000,
        narrative: "쇼핑 결제 하나가 월 지출에서 크게 튀었습니다.",
        payload: {
          amount: 80_000,
          category: "쇼핑",
          categoryTotal: 180_000,
          shareOfCategory: 0.44,
          transactionId: "tx-outlier",
        },
        period: "2026-03-01",
        target_key: "tx-outlier",
        type: "outlier_transaction" as const,
      },
      transactions: [
        {
          ...baseTransaction,
          amount: 80_000,
          category: "쇼핑",
          id: "tx-outlier",
          merchant_raw: "무신사",
        },
        {
          ...baseTransaction,
          amount: 40_000,
          category: "쇼핑",
          id: "tx-shopping",
          merchant_raw: "29CM",
        },
      ],
    },
    {
      expectedCalls: [["eq", "merchant_normalized", "NETFLIX"]],
      expectedEvidenceCount: 3,
      highlightedRows: 0,
      signal: {
        id: "signal-recurring",
        impact: null,
        narrative: null,
        payload: {
          intervalDays: [31, 30],
          latestAmount: 17_000,
          maxAmount: 17_000,
          merchantNormalized: "NETFLIX",
          minAmount: 17_000,
          occurrenceCount: 3,
        },
        period: "2026-03-01",
        target_key: "NETFLIX",
        type: "recurring_payment" as const,
      },
      transactions: [
        {
          ...baseTransaction,
          amount: 17_000,
          id: "tx-r1",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-01-05",
        },
        {
          ...baseTransaction,
          amount: 17_000,
          id: "tx-r2",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-02-05",
        },
        {
          ...baseTransaction,
          amount: 17_000,
          id: "tx-r3",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-03-07",
        },
      ],
    },
    {
      expectedCalls: [["eq", "merchant_normalized", "NETFLIX"]],
      expectedEvidenceCount: 3,
      highlightedRows: 2,
      signal: {
        id: "signal-price-up",
        impact: 36_000,
        narrative: "넷플릭스 구독료가 9,900원에서 12,900원으로 올랐습니다.",
        payload: {
          annualizedImpact: 36_000,
          increaseAmount: 3_000,
          latestAmount: 12_900,
          latestTransactedOn: "2026-03-05",
          merchantNormalized: "NETFLIX",
          previousAmount: 9_900,
          previousTransactedOn: "2026-02-05",
        },
        period: "2026-03-01",
        target_key: "NETFLIX",
        type: "recurring_price_up" as const,
      },
      transactions: [
        {
          ...baseTransaction,
          amount: 9_900,
          id: "tx-p1",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-01-05",
        },
        {
          ...baseTransaction,
          amount: 9_900,
          id: "tx-p2",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-02-05",
        },
        {
          ...baseTransaction,
          amount: 12_900,
          id: "tx-p3",
          merchant_normalized: "NETFLIX",
          merchant_raw: "넷플릭스",
          transacted_on: "2026-03-05",
        },
      ],
    },
  ])(
    "uses the correct evidence query and highlights for $signal.type",
    async ({ expectedCalls, expectedEvidenceCount, highlightedRows, signal, transactions }) => {
      mockSession();
      const { transactionQuery } = mockSignalDetail({
        signal,
        transactions,
      });

      await renderSignalDetail({ signalId: signal.id });

      for (const expectedCall of expectedCalls) {
        expectCall(
          transactionQuery.calls,
          expectedCall[0] as string,
          ...expectedCall.slice(1),
        );
      }

      expectCall(transactionQuery.calls, "eq", "transaction_type", "expense");
      expectCall(transactionQuery.calls, "eq", "category_fallback", false);
      expectCall(transactionQuery.calls, "not", "category", "is", null);
      expectCall(transactionQuery.calls, "gt", "amount", 0);
      expect(screen.getAllByRole("row")).toHaveLength(expectedEvidenceCount + 1);

      if (highlightedRows === 0) {
        expect(screen.queryByText("증거")).not.toBeInTheDocument();
      } else {
        expect(screen.getAllByText("증거")).toHaveLength(highlightedRows);
      }
    },
  );

  it("leaves missing payload metric values empty instead of filling or deriving them", async () => {
    mockSession();
    mockSignalDetail({
      signal: {
        id: "signal-new",
        impact: 120_000,
        narrative: null,
        payload: {
          amount: 120_000,
          category: "쇼핑",
          merchantNormalized: "PAYPAL",
          transactionId: "tx-new",
        },
        period: "2026-03-01",
        target_key: "PAYPAL",
        type: "new_merchant_large",
      },
      transactions: [],
    });

    await renderSignalDetail({ signalId: "signal-new" });

    expect(metricValue("결제액")).toBe("120,000원");
    expect(metricValue("카테고리 중앙값")).toBe("");
    expect(metricValue("중앙값 대비")).toBe("");
    expect(screen.queryByText("0원")).not.toBeInTheDocument();
    expect(screen.queryByText("0배")).not.toBeInTheDocument();
  });

  it("returns 404 when no owned signal exists for the URL month", async () => {
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockSession();
    const { from, signalQuery } = mockSignalDetail({ signal: null });

    await expect(
      renderSignalDetail({ signalId: "missing-signal" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expectCall(signalQuery.calls, "eq", "id", "missing-signal");
    expectCall(signalQuery.calls, "eq", "user_id", "user-1");
    expectCall(signalQuery.calls, "eq", "period", "2026-03-01");
    expect(from).not.toHaveBeenCalledWith("transactions");
  });

  it("renders a route 404 body with a link back to the month review", () => {
    useParamsMock.mockReturnValue({ yearMonth: "2026-03" });

    render(<NotFoundPage />);

    expect(screen.getByText("이 신호를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "리뷰로 돌아가기" })).toHaveAttribute(
      "href",
      "/dashboard/review/2026-03",
    );
  });
});
