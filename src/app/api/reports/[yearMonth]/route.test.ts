import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());
const describeMonthlyReportMock = vi.hoisted(() => vi.fn());
const fetchDashboardSummaryMock = vi.hoisted(() => vi.fn());
const fetchDashboardCategoryBreakdownMock = vi.hoisted(() => vi.fn());
const fetchDashboardTopMerchantsMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/services/openai", () => ({
  describeMonthlyReport: describeMonthlyReportMock,
}));

vi.mock("@/lib/dashboard/queries", () => ({
  fetchDashboardSummary: fetchDashboardSummaryMock,
  fetchDashboardCategoryBreakdown: fetchDashboardCategoryBreakdownMock,
  fetchDashboardTopMerchants: fetchDashboardTopMerchantsMock,
}));

type ProfileRow = {
  subscription_status: "trialing" | "active" | "canceled";
  trial_started_at: string | null;
  current_period_end: string | null;
};

type SignalRow = {
  type: "category_spike" | "outlier_transaction";
  payload: Record<string, unknown>;
  impact: number | null;
};

const ACTIVE_PROFILE: ProfileRow = {
  subscription_status: "active",
  trial_started_at: "2026-08-17T00:00:00.000Z",
  current_period_end: null,
};

function createSupabaseMock(input?: {
  claim?: boolean;
  profile?: ProfileRow;
  signals?: SignalRow[];
}) {
  const monthlyReportUpdate = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }));
  const signalOrder = vi.fn().mockResolvedValue({
    data:
      input?.signals ??
      [
        {
          type: "category_spike",
          payload: { category: "식비", increaseAmount: 62_000 },
          impact: 62_000,
        },
      ],
    error: null,
  });
  const signalEqPeriod = vi.fn(() => ({ order: signalOrder }));
  const signalEqUser = vi.fn(() => ({ eq: signalEqPeriod }));
  const profileSingle = vi.fn().mockResolvedValue({
    data: input?.profile ?? ACTIVE_PROFILE,
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: profileSingle,
          })),
        })),
      };
    }

    if (table === "spending_signals") {
      return {
        select: vi.fn(() => ({
          eq: signalEqUser,
        })),
      };
    }

    if (table === "monthly_reports") {
      return {
        update: monthlyReportUpdate,
      };
    }

    return {};
  });
  const rpc = vi.fn().mockResolvedValue({
    data: input?.claim ?? true,
    error: null,
  });

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
    rpc,
  });

  return { from, monthlyReportUpdate, rpc, signalEqPeriod, signalEqUser };
}

function mockDashboardFacts(input?: {
  currentTotal?: number;
  previousCount?: number;
  previousTotal?: number;
}) {
  fetchDashboardSummaryMock
    .mockResolvedValueOnce({
      totalExpense: input?.currentTotal ?? 520_000,
      transactionCount: 42,
      refundTotal: 0,
      depositTotal: 0,
      topCategory: "식비",
      topCategoryAmount: 210_000,
      activeDays: 12,
    })
    .mockResolvedValueOnce({
      totalExpense: input?.previousTotal ?? 400_000,
      transactionCount: input?.previousCount ?? 35,
      refundTotal: 0,
      depositTotal: 0,
      topCategory: "식비",
      topCategoryAmount: 180_000,
      activeDays: 10,
    });
  fetchDashboardCategoryBreakdownMock.mockResolvedValue([
    { category: "식비", totalAmount: 210_000, transactionCount: 14 },
  ]);
  fetchDashboardTopMerchantsMock.mockResolvedValue([
    {
      merchantNormalized: "스타벅스",
      totalAmount: 55_000,
      transactionCount: 5,
      category: "카페/간식",
    },
  ]);
}

describe("POST /api/reports/[yearMonth]", () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rejects expired users before claiming report generation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    const supabase = createSupabaseMock({
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-01T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ yearMonth: "2026-03" }),
    });

    expect(response.status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(describeMonthlyReportMock).not.toHaveBeenCalled();
  });

  it("returns 409 and skips OpenAI when generation is already claimed", async () => {
    const supabase = createSupabaseMock({ claim: false });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ yearMonth: "2026-03" }),
    });

    expect(response.status).toBe(409);
    expect(supabase.rpc).toHaveBeenCalledWith("claim_monthly_report_generation", {
      p_user_id: "user-1",
      p_month: "2026-03-01",
      p_stale_after: "5 minutes",
    });
    expect(describeMonthlyReportMock).not.toHaveBeenCalled();
  });

  it("stores generated sections and clears generation_started_at on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    const supabase = createSupabaseMock();
    mockDashboardFacts();
    describeMonthlyReportMock.mockResolvedValue([
      { heading: "요약", body: "이번 달 지출을 요약했습니다." },
      { heading: "다음 행동", body: "큰 결제의 근거를 확인하세요." },
    ]);
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ yearMonth: "2026-03" }),
    });

    expect(response.status).toBe(200);
    expect(fetchDashboardSummaryMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { userId: "user-1", period: "2026-03-01" },
    );
    expect(fetchDashboardSummaryMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { userId: "user-1", period: "2026-02-01" },
    );
    expect(describeMonthlyReportMock).toHaveBeenCalledTimes(1);
    expect(describeMonthlyReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        month: "2026-03",
        totalExpense: 520_000,
        previousTotalExpense: 400_000,
        transactionCount: 42,
      }),
    );
    expect(supabase.monthlyReportUpdate).toHaveBeenCalledWith({
      narrative: JSON.stringify([
        { heading: "요약", body: "이번 달 지출을 요약했습니다." },
        { heading: "다음 행동", body: "큰 결제의 근거를 확인하세요." },
      ]),
      generated_at: "2026-08-18T12:00:00.000Z",
      generation_started_at: null,
      // 문단이 쓴 숫자를 함께 남겨야 상단 통계가 문단과 같은 시점을 보여준다.
      total_expense: 520_000,
      previous_total_expense: 400_000,
      transaction_count: 42,
    });
  });

  it("clears generation_started_at when generation fails", async () => {
    const supabase = createSupabaseMock();
    mockDashboardFacts();
    describeMonthlyReportMock.mockRejectedValue(new Error("OpenAI unavailable"));
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ yearMonth: "2026-03" }),
    });

    expect(response.status).toBe(500);
    expect(supabase.monthlyReportUpdate).toHaveBeenCalledWith({
      generation_started_at: null,
    });
  });
});
