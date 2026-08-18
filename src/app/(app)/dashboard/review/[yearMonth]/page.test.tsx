import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "./page";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

type SignalRow = {
  dismissed_at: string | null;
  id: string;
  impact: number | null;
  narrative: string | null;
  payload: Record<string, unknown>;
  target_key: string;
  type:
    | "category_spike"
    | "new_merchant_large"
    | "outlier_transaction"
    | "recurring_payment"
    | "recurring_price_up";
};

function mockSession() {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: { canWrite: false, state: "expired" },
    userId: "user-1",
  });
}

function mockSignals(rows: SignalRow[]) {
  const query = {
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  const from = vi.fn(() => ({
    select: vi.fn(() => query),
  }));

  createServerClientMock.mockResolvedValue({ from });

  return { from, query };
}

async function renderReviewPage(input?: {
  searchParams?: Record<string, string>;
  yearMonth?: string;
}) {
  const element = await Page({
    params: Promise.resolve({ yearMonth: input?.yearMonth ?? "2026-03" }),
    searchParams: Promise.resolve(input?.searchParams ?? {}),
  });

  render(element);
}

describe("/dashboard/review/[yearMonth]", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns 404 for invalid yearMonth params", async () => {
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockSession();

    await expect(
      renderReviewPage({ yearMonth: "2026-13" }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("renders every signal for the month without cutting to dashboard top three", async () => {
    mockSession();
    const { from, query } = mockSignals([
      {
        dismissed_at: null,
        id: "signal-1",
        impact: 62_000,
        narrative: "카페·간식이 지난달보다 62,000원 늘었습니다.",
        payload: {
          category: "카페/간식",
          currentTotal: 169_000,
          increaseAmount: 62_000,
          previousTotal: 107_000,
        },
        target_key: "카페/간식",
        type: "category_spike",
      },
      {
        dismissed_at: "2026-03-20T00:00:00.000Z",
        id: "signal-2",
        impact: 120_000,
        narrative: null,
        payload: {
          amount: 120_000,
          category: "쇼핑",
          merchantNormalized: "PAYPAL",
        },
        target_key: "PAYPAL",
        type: "new_merchant_large",
      },
      {
        dismissed_at: null,
        id: "signal-3",
        impact: null,
        narrative: null,
        payload: {
          firstTransactedOn: "2026-01-05",
          intervalDays: [31, 30],
          lastTransactedOn: "2026-03-05",
          latestAmount: 17_000,
          maxAmount: 17_000,
          merchantNormalized: "NETFLIX",
          minAmount: 17_000,
          occurrenceCount: 3,
        },
        target_key: "NETFLIX",
        type: "recurring_payment",
      },
    ]);

    await renderReviewPage();

    expect(from).toHaveBeenCalledWith("spending_signals");
    expect(query.eq).toHaveBeenNthCalledWith(1, "user_id", "user-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "period", "2026-03-01");
    expect(query.order).toHaveBeenCalledWith("impact", {
      ascending: false,
      nullsFirst: false,
    });
    expect(query.limit).not.toHaveBeenCalled();

    expect(screen.getByText("3개")).toBeInTheDocument();
    expect(screen.getByText("182,000원")).toBeInTheDocument();
    expect(screen.getByText("카페·간식이 지난달보다 62,000원 늘었습니다."))
      .toBeInTheDocument();
    expect(screen.getByText("PAYPAL")).toBeInTheDocument();
    expect(screen.getByText("숨김")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "카테고리 급증 카페/간식 상세 보기" }),
    ).toHaveAttribute("href", "/dashboard/review/2026-03/signal-1");
    expect(
      screen.getByText("평소 그 자체라 인사이트 카드에 올리지 않습니다"),
    ).toBeInTheDocument();
    expect(screen.getByText("NETFLIX")).toBeInTheDocument();
    expect(screen.getByText("17,000원")).toBeInTheDocument();
  });

  it("filters by a valid signal type query param", async () => {
    mockSession();
    mockSignals([
      {
        dismissed_at: null,
        id: "signal-1",
        impact: 62_000,
        narrative: "카페·간식이 지난달보다 62,000원 늘었습니다.",
        payload: { category: "카페/간식", increaseAmount: 62_000 },
        target_key: "카페/간식",
        type: "category_spike",
      },
      {
        dismissed_at: null,
        id: "signal-2",
        impact: null,
        narrative: null,
        payload: {
          intervalDays: [31, 30],
          latestAmount: 17_000,
          merchantNormalized: "NETFLIX",
          occurrenceCount: 3,
        },
        target_key: "NETFLIX",
        type: "recurring_payment",
      },
    ]);

    await renderReviewPage({ searchParams: { type: "recurring_payment" } });

    expect(
      screen.queryByText("카페·간식이 지난달보다 62,000원 늘었습니다."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("NETFLIX")).toBeInTheDocument();
  });

  it("renders the no-signal empty state", async () => {
    mockSession();
    mockSignals([]);

    await renderReviewPage();

    expect(
      screen.getByText("이 달에는 지적할 만한 변화가 없었습니다"),
    ).toBeInTheDocument();
  });

  it("keeps outlier-only first-month signals but shows the comparison guidance", async () => {
    mockSession();
    mockSignals([
      {
        dismissed_at: null,
        id: "signal-1",
        impact: 80_000,
        narrative: "단일 결제가 이번 달 지출에서 크게 튀었습니다.",
        payload: {
          amount: 80_000,
          category: "문화/여가",
          merchantNormalized: "YES24",
        },
        target_key: "transaction-1",
        type: "outlier_transaction",
      },
    ]);

    await renderReviewPage();

    expect(
      screen.getByText("다음 달이면 지난달과 비교해 드릴 수 있습니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("단일 결제가 이번 달 지출에서 크게 튀었습니다."),
    ).toBeInTheDocument();
  });
});
