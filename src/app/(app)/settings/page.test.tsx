import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

type ProfileRow = {
  current_period_end: string | null;
  polar_customer_id: string | null;
  subscription_status: "trialing" | "active" | "canceled";
  trial_started_at: string | null;
};

const COUNTS: Record<string, number> = {
  monthly_reports: 2,
  spending_signals: 9,
  transactions: 412,
  upload_jobs: 3,
};

function mockPage(profile: ProfileRow, entitlementState: "trialing" | "active" | "expired") {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: {
      canRead: true,
      canWrite: entitlementState !== "expired",
      state: entitlementState,
      trialEndsAt: null,
    },
    userId: "user-1",
  });

  const from = vi.fn((table: string) => ({
    select: (_columns: string, options?: { count?: string; head?: boolean }) => {
      if (options?.head) {
        return {
          eq: async () => ({ count: COUNTS[table] ?? 0, error: null }),
        };
      }

      return {
        eq: () => ({
          single: async () => ({ data: profile, error: null }),
        }),
      };
    },
  }));

  const getUser = vi.fn().mockResolvedValue({
    data: { user: { created_at: "2026-08-10T04:00:00.000Z", id: "user-1" } },
    error: null,
  });

  createServerClientMock.mockResolvedValue({ auth: { getUser }, from });

  return { from, getUser };
}

async function renderSettings() {
  render(await Page());
}

describe("/settings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the trial end date while the trial is running", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00.000Z"));
    mockPage(
      {
        current_period_end: null,
        polar_customer_id: null,
        subscription_status: "trialing",
        trial_started_at: "2026-08-16T00:00:00.000Z",
      },
      "trialing",
    );

    await renderSettings();
    vi.useRealTimers();

    expect(screen.getByText(/체험 중/)).toBeInTheDocument();
    expect(screen.getByText(/2026\.08\.23/)).toBeInTheDocument();
  });

  it("shows the next billing date for an active subscription", async () => {
    mockPage(
      {
        current_period_end: "2026-09-17T00:00:00.000Z",
        polar_customer_id: "polar-customer-1",
        subscription_status: "active",
        trial_started_at: "2026-07-01T00:00:00.000Z",
      },
      "active",
    );

    await renderSettings();

    expect(screen.getByText(/다음 결제일/)).toBeInTheDocument();
    expect(screen.getByText(/2026\.09\.17/)).toBeInTheDocument();
  });

  it("tells a canceled-but-still-paid user the date access ends, not that it ended", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00.000Z"));
    mockPage(
      {
        current_period_end: "2026-09-17T00:00:00.000Z",
        polar_customer_id: "polar-customer-1",
        subscription_status: "canceled",
        trial_started_at: "2026-07-01T00:00:00.000Z",
      },
      "active",
    );

    await renderSettings();
    vi.useRealTimers();

    expect(
      screen.getByText("9월 17일까지 이용할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/구독이 종료되었습니다/)).not.toBeInTheDocument();
  });

  it("points an expired user at the pricing screen and says reads stay open", async () => {
    mockPage(
      {
        current_period_end: null,
        polar_customer_id: null,
        subscription_status: "trialing",
        trial_started_at: "2026-07-01T00:00:00.000Z",
      },
      "expired",
    );

    await renderSettings();

    expect(screen.getByText(/읽기 전용/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "요금제 보기" })).toHaveAttribute(
      "href",
      "/dashboard/billing",
    );
  });

  it("offers the Polar portal only to users who have paid", async () => {
    mockPage(
      {
        current_period_end: "2026-09-17T00:00:00.000Z",
        polar_customer_id: "polar-customer-1",
        subscription_status: "active",
        trial_started_at: "2026-07-01T00:00:00.000Z",
      },
      "active",
    );

    await renderSettings();

    expect(
      screen.getByRole("button", { name: "구독 관리 열기" }),
    ).toBeInTheDocument();
  });

  it("spells out what is destroyed, including the original CSV files", async () => {
    mockPage(
      {
        current_period_end: null,
        polar_customer_id: null,
        subscription_status: "trialing",
        trial_started_at: "2026-08-16T00:00:00.000Z",
      },
      "trialing",
    );

    await renderSettings();

    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/업로드한 원본 CSV 파일/)).toBeInTheDocument();
    expect(screen.getByText(/412건/)).toBeInTheDocument();
    expect(screen.getByText(/3개/)).toBeInTheDocument();
  });

  it("requires the confirmation phrase to be typed before deletion is possible", async () => {
    mockPage(
      {
        current_period_end: null,
        polar_customer_id: null,
        subscription_status: "trialing",
        trial_started_at: "2026-08-16T00:00:00.000Z",
      },
      "trialing",
    );

    await renderSettings();

    expect(
      screen.getByLabelText('삭제하려면 "계정 삭제" 를 입력하세요'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "계정 삭제" })).toBeDisabled();
  });

  it("reads the account identity from the session and auth user", async () => {
    const clients = mockPage(
      {
        current_period_end: null,
        polar_customer_id: null,
        subscription_status: "trialing",
        trial_started_at: "2026-08-16T00:00:00.000Z",
      },
      "trialing",
    );

    await renderSettings();

    expect(clients.getUser).toHaveBeenCalled();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("2026.08.10")).toBeInTheDocument();
  });
});
