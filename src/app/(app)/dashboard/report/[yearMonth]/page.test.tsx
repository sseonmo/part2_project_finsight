import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "./page";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const fetchDashboardSummaryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/lib/dashboard/queries", () => ({
  fetchDashboardSummary: fetchDashboardSummaryMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
  useRouter: () => ({ refresh: refreshMock }),
}));

type ReportRow = {
  generated_at: string;
  generation_started_at: string | null;
  narrative: string;
};

function mockSession(input?: { canWrite?: boolean; state?: string }) {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: {
      canWrite: input?.canWrite ?? true,
      state: input?.state ?? "active",
    },
    userId: "user-1",
  });
}

function mockReport(row: ReportRow | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqMonth = vi.fn(() => ({ maybeSingle }));
  const eqUser = vi.fn(() => ({ eq: eqMonth }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: eqUser })),
  }));

  createServerClientMock.mockResolvedValue({ from });

  return { eqMonth, eqUser, from };
}

function mockSummaries(input?: { previousCount?: number; previousTotal?: number }) {
  fetchDashboardSummaryMock
    .mockResolvedValueOnce({
      totalExpense: 520_000,
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
}

async function renderReportPage(yearMonth = "2026-03") {
  const element = await Page({
    params: Promise.resolve({ yearMonth }),
  });

  render(element);
}

describe("/dashboard/report/[yearMonth]", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders an existing report for expired users but disables regeneration", async () => {
    mockSession({ canWrite: false, state: "expired" });
    mockSummaries();
    const report = mockReport({
      generated_at: "2026-03-12T00:00:00.000Z",
      generation_started_at: null,
      narrative: JSON.stringify([
        { heading: "이번 달 요약", body: "SQL 집계값으로 만든 문단입니다." },
        { heading: "다음 행동", body: "리포트 문장은 기본 이스케이프로 렌더합니다." },
      ]),
    });

    await renderReportPage();

    expect(report.from).toHaveBeenCalledWith("monthly_reports");
    expect(report.eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(report.eqMonth).toHaveBeenCalledWith("month", "2026-03-01");
    expect(screen.getByRole("heading", { name: "2026-03 월간 리포트" }))
      .toBeInTheDocument();
    expect(screen.getByText("3월 12일에 생성됨")).toBeInTheDocument();
    expect(screen.getByText("520,000원")).toBeInTheDocument();
    expect(screen.getByText("+120,000원")).toBeInTheDocument();
    expect(screen.getByText("+30%")).toBeInTheDocument();
    expect(screen.getByText("42건")).toBeInTheDocument();
    expect(screen.getByText("이번 달 요약")).toBeInTheDocument();
    expect(screen.getByText("SQL 집계값으로 만든 문단입니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 만들기" })).toBeDisabled();
    expect(
      screen.getByText("체험 또는 구독이 만료되어 리포트를 다시 만들 수 없습니다."),
    ).toBeInTheDocument();
  });

  it("shows the empty report state and no previous-month comparison message", async () => {
    mockSession();
    mockSummaries({ previousCount: 0, previousTotal: 0 });
    mockReport({
      generated_at: "2026-03-12T00:00:00.000Z",
      generation_started_at: null,
      narrative: "",
    });

    await renderReportPage();

    expect(screen.getByText("아직 생성되지 않음")).toBeInTheDocument();
    expect(screen.getByText("비교할 지난달 데이터가 없습니다")).toBeInTheDocument();
    expect(screen.getByText("아직 리포트가 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "리포트 만들기" })).toBeEnabled();
  });

  it("returns 404 for invalid yearMonth params", async () => {
    notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockSession();

    await expect(renderReportPage("2026-13")).rejects.toThrow("NEXT_NOT_FOUND");

    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});
