import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIGNAL_CONDITION_COPY } from "@/lib/signals/thresholds";

import Page from "./page";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

type RecurringSignalRow = {
  id: string;
  impact: number | null;
  narrative: string | null;
  payload: Record<string, unknown>;
  period: string;
  target_key: string;
  type: "recurring_payment" | "recurring_price_up";
};

function mockSession() {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: { canWrite: false, state: "expired" },
    userId: "user-1",
  });
}

function mockRecurringSignals(rows: RecurringSignalRow[]) {
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });

  createServerClientMock.mockResolvedValue({ rpc });

  return { rpc };
}

async function renderSubscriptionsPage() {
  const element = await Page();

  render(element);
}

describe("/dashboard/subscriptions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders for expired users and merges payment and price-up signals by target key", async () => {
    mockSession();
    const { rpc } = mockRecurringSignals([
      {
        id: "signal-netflix-payment",
        impact: null,
        narrative: null,
        payload: {
          firstTransactedOn: "2026-01-05",
          intervalDays: [31, 30],
          lastTransactedOn: "2026-03-05",
          latestAmount: 17_000,
          maxAmount: 17_000,
          merchantNormalized: "NETFLIX",
          minAmount: 16_000,
          occurrenceCount: 3,
        },
        period: "2026-03-01",
        target_key: "NETFLIX",
        type: "recurring_payment",
      },
      {
        id: "signal-netflix-price-up",
        impact: 36_000,
        narrative: "넷플릭스 구독료가 올랐습니다.",
        payload: {
          annualizedImpact: 36_000,
          latestAmount: 17_000,
          merchantNormalized: "NETFLIX",
          previousAmount: 14_000,
        },
        period: "2026-03-01",
        target_key: "NETFLIX",
        type: "recurring_price_up",
      },
      {
        id: "signal-adobe-payment",
        impact: null,
        narrative: null,
        payload: {
          firstTransactedOn: "2026-01-11",
          intervalDays: [30, 30],
          lastTransactedOn: "2026-04-11",
          latestAmount: 33_000,
          maxAmount: 33_000,
          merchantNormalized: "ADOBE",
          minAmount: 33_000,
          occurrenceCount: 4,
        },
        period: "2026-03-01",
        target_key: "ADOBE",
        type: "recurring_payment",
      },
    ]);

    await renderSubscriptionsPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_recurring_signals_latest", {
      p_user_id: "user-1",
    });
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getAllByText("NETFLIX")).toHaveLength(1);
    expect(screen.getByText("ADOBE")).toBeInTheDocument();
    expect(screen.getByText("최근 결제 금액 높은 순")).toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    expect(rows[1]?.textContent).toContain("ADOBE");
    expect(rows[2]?.textContent).toContain("NETFLIX");

    expect(screen.getByText("17,000원")).toBeInTheDocument();
    expect(screen.getByText("16,000원~17,000원")).toBeInTheDocument();
    expect(screen.getByText("약 30~31일마다")).toBeInTheDocument();
    expect(screen.getByText("3회")).toBeInTheDocument();
    expect(screen.getByText("2026.01.05 ~ 2026.03.05")).toBeInTheDocument();
    expect(screen.getByText("14,000원 → 17,000원")).toBeInTheDocument();

    const annualizedImpact = screen.getByText("연 +36,000원");
    expect(annualizedImpact).toBeInTheDocument();
    expect(annualizedImpact).toHaveClass("subscriptions-price-up__impact");
    expect(screen.getByText("넷플릭스 구독료가 올랐습니다.")).toBeInTheDocument();
  });

  it("falls back to target_key and explains the recurring detection condition when empty", async () => {
    mockSession();
    mockRecurringSignals([]);

    await renderSubscriptionsPage();

    expect(
      screen.getByText("아직 반복 지출로 볼 만한 결제가 없습니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(SIGNAL_CONDITION_COPY.recurring_payment),
    ).toBeInTheDocument();
  });
});
