import { notFound, redirect } from "next/navigation";

import { ReportGenerateButton } from "@/components/DashboardActions";
import { fetchDashboardSummary } from "@/lib/dashboard/queries";
import {
  resolveReportStats,
  type ReportSnapshot,
} from "@/lib/report/snapshot";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";

export const dynamic = "force-dynamic";

type ReportPageProps = {
  params: Promise<{
    yearMonth: string;
  }>;
};

type ReportRow = {
  generated_at: string;
  generation_started_at: string | null;
  narrative: string;
  total_expense: number | null;
  previous_total_expense: number | null;
  transaction_count: number | null;
};

type ReportSection = {
  heading: string;
  body: string;
};

type ParsedReport =
  | { kind: "empty" }
  | { kind: "sections"; sections: ReportSection[] }
  | { body: string; kind: "fallback" };

function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));

  return month >= 1 && month <= 12;
}

function toPeriod(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  return `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`;
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatSignedCurrency(value: number): string {
  if (value > 0) {
    return `+${formatCurrency(value)}`;
  }

  if (value < 0) {
    return `−${formatCurrency(Math.abs(value))}`;
  }

  return formatCurrency(0);
}

function formatPercent(value: number): string {
  const rounded = Math.round(Math.abs(value) * 100);

  if (value > 0) {
    return `+${rounded}%`;
  }

  if (value < 0) {
    return `−${rounded}%`;
  }

  return "0%";
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Seoul",
  });

  return `${formatter.format(date)}에 생성됨`;
}

function getChange(current: number, previous: number) {
  if (previous <= 0) {
    return null;
  }

  const difference = current - previous;

  return {
    difference,
    ratio: difference / previous,
  };
}

function getChangeClassName(difference: number): string {
  if (difference > 0) {
    return "report-stat__change report-stat__change--increase";
  }

  if (difference < 0) {
    return "report-stat__change report-stat__change--decrease";
  }

  return "report-stat__change";
}

function isReportSection(value: unknown): value is ReportSection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.heading === "string" &&
    candidate.heading.trim().length > 0 &&
    typeof candidate.body === "string" &&
    candidate.body.trim().length > 0
  );
}

function parseReport(narrative: string): ParsedReport {
  const trimmed = narrative.trim();

  if (!trimmed) {
    return { kind: "empty" };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed) && parsed.every(isReportSection)) {
      const sections = parsed.map((section) => ({
        heading: section.heading.trim(),
        body: section.body.trim(),
      }));

      return sections.length > 0
        ? { kind: "sections", sections }
        : { kind: "empty" };
    }

    return { body: trimmed, kind: "fallback" };
  } catch {
    return { body: trimmed, kind: "fallback" };
  }
}

function ReportStats({ stats }: { stats: ReportSnapshot }) {
  const change =
    stats.previousTotalExpense !== null
      ? getChange(stats.totalExpense, stats.previousTotalExpense)
      : null;

  return (
    <section className="report-stats" aria-label="월간 통계">
      <div className="report-stat">
        <span className="report-stat__label">그 달 총지출</span>
        <span className="report-stat__value tabular-nums">
          {formatCurrency(stats.totalExpense)}
        </span>
      </div>
      <div className="report-stat">
        <span className="report-stat__label">전월 대비</span>
        {change ? (
          <span className={getChangeClassName(change.difference)}>
            <span>{formatSignedCurrency(change.difference)}</span>
            <span>{formatPercent(change.ratio)}</span>
          </span>
        ) : (
          <span className="report-stat__empty">
            비교할 지난달 데이터가 없습니다
          </span>
        )}
      </div>
      <div className="report-stat">
        <span className="report-stat__label">거래 건수</span>
        <span className="report-stat__value tabular-nums">
          {stats.transactionCount.toLocaleString("ko-KR")}건
        </span>
      </div>
    </section>
  );
}

function ReportBody({ parsedReport }: { parsedReport: ParsedReport }) {
  if (parsedReport.kind === "empty") {
    return (
      <section className="report-empty">
        <h2 className="report-section-title">아직 리포트가 없습니다</h2>
        <p>
          리포트 만들기를 누르면 지금 저장된 거래와 신호를 기준으로 코칭 문단을
          생성합니다.
        </p>
      </section>
    );
  }

  if (parsedReport.kind === "fallback") {
    return (
      <section className="report-section">
        <h2 className="report-section-title">월간 코칭</h2>
        <p className="report-section__body">{parsedReport.body}</p>
      </section>
    );
  }

  return (
    <section className="report-sections" aria-label="월간 코칭 문단">
      {parsedReport.sections.map((section) => (
        <article className="report-section" key={section.heading}>
          <h2 className="report-section-title">{section.heading}</h2>
          <p className="report-section__body">{section.body}</p>
        </article>
      ))}
    </section>
  );
}

export default async function ReportPage({ params }: ReportPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const { yearMonth } = await params;

  if (!isValidYearMonth(yearMonth)) {
    notFound();
  }

  const period = toPeriod(yearMonth);
  const supabase = await createServerClient();
  const [{ data: report, error }, currentSummary, previousSummary] =
    await Promise.all([
      supabase
        .from("monthly_reports")
        .select(
          "narrative, generated_at, generation_started_at, total_expense, previous_total_expense, transaction_count",
        )
        .eq("user_id", session.userId)
        .eq("month", period)
        .maybeSingle<ReportRow>(),
      fetchDashboardSummary(supabase, {
        userId: session.userId,
        period,
      }),
      fetchDashboardSummary(supabase, {
        userId: session.userId,
        period: previousPeriod(period),
      }),
    ]);

  if (error) {
    throw new Error(error.message);
  }

  const parsedReport = parseReport(report?.narrative ?? "");
  const hasReport = parsedReport.kind !== "empty";
  const isGenerating = Boolean(report?.generation_started_at);
  const { stats, isStale } = resolveReportStats({
    snapshot:
      hasReport &&
      report &&
      typeof report.total_expense === "number" &&
      typeof report.transaction_count === "number"
        ? {
            totalExpense: report.total_expense,
            previousTotalExpense:
              typeof report.previous_total_expense === "number"
                ? report.previous_total_expense
                : null,
            transactionCount: report.transaction_count,
          }
        : null,
    current: currentSummary,
    previous: previousSummary,
  });

  return (
    <div className="report-page">
      <section className="report-hero">
        <div className="report-hero__copy">
          <p className="report-hero__meta">
            {hasReport && report
              ? formatGeneratedAt(report.generated_at)
              : "아직 생성되지 않음"}
          </p>
          <h1 className="report-hero__title">{yearMonth} 월간 리포트</h1>
        </div>
        <ReportGenerateButton
          canWrite={session.entitlement.canWrite}
          hasReport={hasReport}
          yearMonth={yearMonth}
        />
      </section>

      {isGenerating ? (
        <section className="report-generating">
          리포트를 생성하는 중입니다. 완료 여부는 화면을 다시 읽어 확인합니다.
        </section>
      ) : null}

      {isStale ? (
        <p className="report-stale" role="status">
          리포트를 만든 뒤 이 달 거래가 바뀌었습니다. 아래 숫자와 문단은 생성
          시점 기준입니다.
        </p>
      ) : null}

      <ReportStats stats={stats} />
      <ReportBody parsedReport={parsedReport} />
    </div>
  );
}
