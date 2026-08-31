import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Badge } from "@/components/Badge";
import {
  InsightDismissButton,
  OpenUploadButton,
} from "@/components/DashboardActions";
import { DashboardUploads } from "@/components/DashboardUploads";
import type { UploadJobSnapshot } from "@/components/UploadProgressCard";
import { CATEGORY_TOKENS } from "@/lib/categories";
import {
  fetchDashboardCategoryBreakdown,
  fetchDashboardMonthlyFlow,
  fetchDashboardSummary,
  fetchDashboardTopMerchants,
  type DashboardCategoryBreakdown,
  type DashboardMonthlyFlow,
  type DashboardSummary,
  type DashboardTopMerchant,
} from "@/lib/dashboard/queries";
import {
  DASHBOARD_UPLOAD_CARD_LIMIT,
  DASHBOARD_UPLOAD_STATUSES,
  selectDashboardUploadCards,
} from "@/lib/dashboard/upload-cards";
import { getSessionContext } from "@/lib/session";
import { createServerClient } from "@/services/supabase";
import type { Database, Json } from "@/types/database";

export const dynamic = "force-dynamic";

type UploadCardRow = {
  id: string;
  created_at: string;
  status: UploadJobSnapshot["status"];
  failed_reason: string | null;
  inserted_count: number;
  duplicate_count: number;
  skipped_rows: number;
  uncategorized_count: number;
  card_label_mismatch_warning: string | null;
};

type DashboardPageProps = {
  searchParams?: Promise<{
    month?: string | string[];
  }>;
};

type TransactionMonthOption = {
  period: string;
  transactionCount: number;
  yearMonth: string;
};

type DashboardInsight = {
  id: string;
  type: Database["public"]["Enums"]["spending_signal_type"];
  targetKey: string;
  payload: Record<string, unknown>;
  narrative: string | null;
};

const INSIGHT_TYPE_LABELS: Record<DashboardInsight["type"], string> = {
  category_spike: "카테고리 급증",
  new_merchant_large: "큰 첫 결제",
  outlier_transaction: "튀는 결제",
  recurring_payment: "반복 결제",
  recurring_price_up: "구독료 인상",
};

function toUploadJobSnapshot(row: UploadCardRow): UploadJobSnapshot {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    failedReason: row.failed_reason,
    summary: {
      insertedCount: row.inserted_count,
      duplicateCount: row.duplicate_count,
      skippedRows: row.skipped_rows,
      uncategorizedCount: row.uncategorized_count,
    },
    cardLabelMismatchWarning: row.card_label_mismatch_warning,
  };
}

function toYearMonth(period: string): string {
  return period.slice(0, 7);
}

function toPeriod(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function normalizeYearMonth(value: string | string[] | undefined): string | null {
  const month = Array.isArray(value) ? value[0] : value;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const monthNumber = Number(month.slice(5, 7));

  return monthNumber >= 1 && monthNumber <= 12 ? month : null;
}

function previousPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  return `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`;
}

function getSeoulDayOfMonth(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      timeZone: "Asia/Seoul",
    }).format(new Date()),
  );
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatCompactKrw(value: number): string {
  if (value >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  }

  return formatCurrency(value);
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

function formatSignedCurrency(value: number): string {
  if (value > 0) {
    return `+${formatCurrency(value)}`;
  }

  if (value < 0) {
    return `−${formatCurrency(Math.abs(value))}`;
  }

  return formatCurrency(0);
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
    return "dashboard-change dashboard-change--increase";
  }

  if (difference < 0) {
    return "dashboard-change dashboard-change--decrease";
  }

  return "dashboard-change";
}

function payloadRecord(payload: Json): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return {};
}

function payloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function signalDisplayAmount(signal: DashboardInsight): number | null {
  switch (signal.type) {
    case "category_spike":
      return payloadNumber(signal.payload, "increaseAmount");
    case "new_merchant_large":
    case "outlier_transaction":
      return payloadNumber(signal.payload, "amount");
    case "recurring_price_up":
      return payloadNumber(signal.payload, "annualizedImpact");
    case "recurring_payment":
      return null;
  }
}

function signalSubject(signal: DashboardInsight): string {
  const merchant = signal.payload.merchantNormalized;
  const category = signal.payload.category;

  if (typeof merchant === "string") {
    return merchant;
  }

  if (typeof category === "string") {
    return category;
  }

  return signal.targetKey;
}

async function getCardLabels(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("upload_jobs")
    .select("card_label")
    .eq("user_id", userId);

  return Array.from(
    new Set((data ?? []).map((row) => row.card_label).filter(Boolean)),
  ).sort((first, second) => first.localeCompare(second, "ko-KR"));
}

async function getDashboardUploadJobs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UploadJobSnapshot[]> {
  const { data } = await supabase
    .from("upload_jobs")
    .select(
      "id, created_at, status, failed_reason, inserted_count, duplicate_count, skipped_rows, uncategorized_count, card_label_mismatch_warning",
    )
    .eq("user_id", userId)
    .in("status", [...DASHBOARD_UPLOAD_STATUSES])
    .order("created_at", { ascending: false })
    .limit(DASHBOARD_UPLOAD_CARD_LIMIT);

  return selectDashboardUploadCards((data ?? []) as UploadCardRow[], new Date()).map(
    toUploadJobSnapshot,
  );
}

async function getTransactionMonths(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<TransactionMonthOption[]> {
  const { data } = await supabase.rpc("get_transaction_months", {
    p_user_id: userId,
  });

  return (data ?? []).map((row) => ({
    period: row.period,
    transactionCount: Number(row.transaction_count),
    yearMonth: toYearMonth(row.period),
  }));
}

async function getDashboardInsights(
  supabase: SupabaseClient<Database>,
  input: { userId: string; period: string },
): Promise<DashboardInsight[]> {
  const { data } = await supabase
    .from("spending_signals")
    .select("id, type, target_key, payload, narrative")
    .eq("user_id", input.userId)
    .eq("period", input.period)
    .not("impact", "is", null)
    .is("dismissed_at", null)
    .order("impact", { ascending: false })
    .limit(3);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    targetKey: row.target_key,
    payload: payloadRecord(row.payload),
    narrative: row.narrative,
  }));
}

function KpiCard(props: {
  label: string;
  value: string;
  detail?: string;
  change?: ReturnType<typeof getChange>;
}) {
  return (
    <section className="dashboard-kpi-card">
      <p className="dashboard-kpi-card__label">{props.label}</p>
      <p className="dashboard-kpi-card__value tabular-nums">{props.value}</p>
      {props.change ? (
        <p className={getChangeClassName(props.change.difference)}>
          <span>{formatSignedCurrency(props.change.difference)}</span>
          <span>{formatPercent(props.change.ratio)}</span>
        </p>
      ) : null}
      {props.detail ? (
        <p className="dashboard-kpi-card__detail">{props.detail}</p>
      ) : null}
    </section>
  );
}

function DashboardEmptyState({ canWrite }: { canWrite: boolean }) {
  return (
    <section className="dashboard-empty">
      <Badge variant="teal">7일 무료 체험</Badge>
      <h2 className="dashboard-empty__title">첫 명세서를 올려 지출 흐름을 봅니다</h2>
      <div className="dashboard-empty__actions">
        {canWrite ? (
          <OpenUploadButton size="lg">명세서 올리기</OpenUploadButton>
        ) : (
          <Link
            className="finsight-button finsight-button--yellow finsight-button--lg"
            href="/dashboard/billing"
          >
            결제하고 계속 쓰기
          </Link>
        )}
        {canWrite ? (
          <Link
            className="finsight-button finsight-button--secondary finsight-button--lg"
            href="/dashboard/billing"
          >
            요금제 보기
          </Link>
        ) : null}
      </div>
      <div className="dashboard-empty__steps" aria-label="시작 단계">
        {[
          ["1", "카드사에서 CSV 저장"],
          ["2", "카드 이름 확인"],
          ["3", "월별 대시보드 확인"],
        ].map(([index, label]) => (
          <div className="dashboard-empty__step" key={index}>
            <span className="dashboard-empty__step-index">{index}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-empty__examples" aria-label="예시 인사이트">
        {[
          "카페·간식이 지난달보다 62,000원 늘었습니다",
          "처음 보는 가맹점에서 큰 결제가 있었습니다",
          "구독료 인상분이 1년에 36,000원입니다",
        ].map((example) => (
          <p className="dashboard-empty__example" key={example}>
            {example}
          </p>
        ))}
      </div>
    </section>
  );
}

function SelectedMonthEmptyState({
  canWrite,
  yearMonth,
}: {
  canWrite: boolean;
  yearMonth: string;
}) {
  return (
    <section className="dashboard-panel dashboard-month-empty">
      <div>
        <h2 className="dashboard-section-title">이 달에는 거래가 없습니다</h2>
        <p className="dashboard-panel__subtitle">
          {yearMonth} 명세서를 올리면 이 화면에 지출이 채워집니다.
        </p>
      </div>
      {canWrite ? (
        <OpenUploadButton size="md">명세서 올리기</OpenUploadButton>
      ) : (
        <Link
          className="finsight-button finsight-button--yellow finsight-button--md"
          href="/dashboard/billing"
        >
          결제하고 계속 쓰기
        </Link>
      )}
    </section>
  );
}

function CategoryBreakdownPanel({
  breakdown,
  totalExpense,
}: {
  breakdown: DashboardCategoryBreakdown[];
  totalExpense: number;
}) {
  const maxAmount = Math.max(...breakdown.map((item) => item.totalAmount), 1);
  const radius = 44;
  const center = 60;
  const strokeWidth = 18;
  const outerRadius = radius + strokeWidth / 2;
  const innerRadius = radius - strokeWidth / 2;
  let cumulativeRatio = 0;

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel__header">
        <div>
          <h2 className="dashboard-section-title">카테고리별 지출</h2>
          <p className="dashboard-panel__subtitle">금액순으로 정렬했습니다.</p>
        </div>
        <span className="dashboard-panel__meta tabular-nums">
          {breakdown.length.toLocaleString("ko-KR")}개
        </span>
      </div>

      <div className="dashboard-category-layout">
        <svg
          aria-label="카테고리별 지출 비율"
          className="dashboard-donut"
          viewBox="0 0 120 120"
        >
          <circle
            className="dashboard-donut__track"
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            strokeWidth={strokeWidth}
          />
          {breakdown.map((item) => {
            const ratio = item.totalAmount / totalExpense;
            const dash = 2 * Math.PI * radius * ratio;
            const gap = 2 * Math.PI * radius - dash;
            const offset = -2 * Math.PI * radius * cumulativeRatio;
            cumulativeRatio += ratio;

            return (
              <circle
                cx={center}
                cy={center}
                fill="none"
                key={item.category}
                r={radius}
                stroke={`var(${CATEGORY_TOKENS[item.category]})`}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={offset}
                strokeWidth={strokeWidth}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
          })}
          {breakdown.length > 1
            ? breakdown.map((item, index) => {
                const ratioBefore =
                  breakdown
                    .slice(0, index)
                    .reduce((sum, current) => sum + current.totalAmount, 0) /
                  totalExpense;
                const angle = ratioBefore * Math.PI * 2 - Math.PI / 2;
                const x1 = center + Math.cos(angle) * innerRadius;
                const y1 = center + Math.sin(angle) * innerRadius;
                const x2 = center + Math.cos(angle) * outerRadius;
                const y2 = center + Math.sin(angle) * outerRadius;

                return (
                  <line
                    key={`${item.category}-separator`}
                    stroke="var(--canvas)"
                    strokeWidth="1"
                    x1={x1}
                    x2={x2}
                    y1={y1}
                    y2={y2}
                  />
                );
              })
            : null}
          <text className="dashboard-donut__amount" x="60" y="56">
            {formatCompactKrw(totalExpense)}
          </text>
          <text className="dashboard-donut__label" x="60" y="72">
            이번 달
          </text>
        </svg>

        <div className="dashboard-category-list">
          {breakdown.map((item) => {
            const percent = (item.totalAmount / totalExpense) * 100;
            const width = (item.totalAmount / maxAmount) * 100;

            return (
              <div className="dashboard-category-row" key={item.category}>
                <div className="dashboard-category-row__top">
                  <span
                    aria-hidden
                    className="dashboard-category-row__dot"
                    style={{
                      background: `var(${CATEGORY_TOKENS[item.category]})`,
                    }}
                  />
                  <span className="dashboard-category-row__name">
                    {item.category}
                  </span>
                  <span className="dashboard-category-row__amount tabular-nums">
                    {formatCurrency(item.totalAmount)}
                  </span>
                </div>
                <div className="dashboard-category-row__bar">
                  <span
                    className="dashboard-category-row__fill"
                    style={{
                      background: `var(${CATEGORY_TOKENS[item.category]})`,
                      width: `${width}%`,
                    }}
                  />
                </div>
                <p className="dashboard-category-row__meta tabular-nums">
                  {Math.round(percent)}% ·{" "}
                  {item.transactionCount.toLocaleString("ko-KR")}건
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MonthlyFlowPanel({ flow }: { flow: DashboardMonthlyFlow[] }) {
  const maxAmount = Math.max(...flow.map((item) => item.totalAmount), 1);

  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel__header">
        <div>
          <h2 className="dashboard-section-title">6개월 지출 흐름</h2>
          <p className="dashboard-panel__subtitle">월별 지출 합계입니다.</p>
        </div>
      </div>
      <div className="dashboard-flow">
        {flow.map((item) => {
          const yearMonth = toYearMonth(item.period);
          const height = Math.max(6, (item.totalAmount / maxAmount) * 100);

          return (
            <Link
              className="dashboard-flow__item"
              href={`/dashboard?month=${yearMonth}`}
              key={item.period}
            >
              <span className="dashboard-flow__bar-track">
                <span
                  className="dashboard-flow__bar"
                  style={{ height: `${height}%` }}
                />
              </span>
              <span className="dashboard-flow__amount tabular-nums">
                {formatCompactKrw(item.totalAmount)}
              </span>
              <span className="dashboard-flow__label">{yearMonth.slice(5)}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function TopMerchantsPanel({
  merchants,
}: {
  merchants: DashboardTopMerchant[];
}) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel__header">
        <div>
          <h2 className="dashboard-section-title">가맹점 상위</h2>
          <p className="dashboard-panel__subtitle">이번 달 지출 기준입니다.</p>
        </div>
      </div>
      <div className="dashboard-merchant-list">
        {merchants.map((merchant) => (
          <div className="dashboard-merchant-row" key={merchant.merchantNormalized}>
            <span
              aria-hidden
              className="dashboard-merchant-row__dot"
              style={{
                background: `var(${CATEGORY_TOKENS[merchant.category]})`,
              }}
            />
            <div className="dashboard-merchant-row__copy">
              <span className="dashboard-merchant-row__name">
                {merchant.merchantNormalized}
              </span>
              <span className="dashboard-merchant-row__meta">
                {merchant.category} ·{" "}
                {merchant.transactionCount.toLocaleString("ko-KR")}건
              </span>
            </div>
            <span className="dashboard-merchant-row__amount tabular-nums">
              {formatCurrency(merchant.totalAmount)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SamePointComparisonPanel({
  current,
  previous,
}: {
  current: DashboardSummary;
  previous: DashboardSummary;
}) {
  const change = getChange(current.totalExpense, previous.totalExpense);

  return (
    <section className="dashboard-panel">
      <h2 className="dashboard-section-title">같은 시점 비교</h2>
      {change ? (
        <div className="dashboard-comparison">
          <p className={getChangeClassName(change.difference)}>
            <span>{formatSignedCurrency(change.difference)}</span>
            <span>{formatPercent(change.ratio)}</span>
          </p>
          <p className="dashboard-panel__subtitle">
            지난달 같은 시점보다 지출이{" "}
            {change.difference > 0
              ? "늘었습니다."
              : change.difference < 0
                ? "줄었습니다."
                : "같습니다."}
          </p>
        </div>
      ) : (
        <p className="dashboard-panel__subtitle">
          비교할 지난달 데이터가 없습니다
        </p>
      )}
    </section>
  );
}

function InsightsPanel({
  hasPreviousExpense,
  insights,
  yearMonth,
}: {
  hasPreviousExpense: boolean;
  insights: DashboardInsight[];
  yearMonth: string;
}) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel__header">
        <div>
          <h2 className="dashboard-section-title">인사이트 카드</h2>
          <p className="dashboard-panel__subtitle">
            영향도 있는 신호 상위 3개입니다.
          </p>
        </div>
        <Link className="dashboard-panel__link" href={`/dashboard/review/${yearMonth}`}>
          전체 리뷰
        </Link>
      </div>

      {insights.length > 0 ? (
        <div className="dashboard-insight-list">
          {insights.map((insight) => {
            const displayAmount = signalDisplayAmount(insight);

            return (
              <article className="dashboard-insight-card" key={insight.id}>
                <div className="dashboard-insight-card__header">
                  <div>
                    <p className="dashboard-insight-card__type">
                      {INSIGHT_TYPE_LABELS[insight.type]}
                    </p>
                    <h3 className="dashboard-insight-card__subject">
                      {signalSubject(insight)}
                    </h3>
                  </div>
                  {displayAmount !== null ? (
                    <span className="dashboard-insight-card__amount tabular-nums">
                      {formatCurrency(displayAmount)}
                    </span>
                  ) : null}
                </div>
                {insight.narrative ? (
                  <p className="dashboard-insight-card__narrative">
                    {insight.narrative}
                  </p>
                ) : null}
                <div className="dashboard-insight-card__actions">
                  <Link
                    className="finsight-button finsight-button--secondary finsight-button--sm"
                    href={`/dashboard/review/${yearMonth}/${insight.id}`}
                  >
                    근거 보기
                  </Link>
                  <InsightDismissButton signalId={insight.id} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="dashboard-insight-empty">
          {hasPreviousExpense
            ? "아직 표시할 인사이트가 없습니다."
            : "다음 달이면 지난달과 비교해 드릴 수 있습니다"}
        </p>
      )}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const supabase = await createServerClient();
  const resolvedSearchParams = await searchParams;
  const [cardLabels, initialJobs, transactionMonths] = await Promise.all([
    getCardLabels(supabase, session.userId),
    getDashboardUploadJobs(supabase, session.userId),
    getTransactionMonths(supabase, session.userId),
  ]);
  const selectedYearMonth =
    normalizeYearMonth(resolvedSearchParams?.month) ??
    transactionMonths[0]?.yearMonth ??
    null;
  const selectedPeriod = selectedYearMonth ? toPeriod(selectedYearMonth) : null;

  if (!selectedYearMonth || !selectedPeriod || transactionMonths.length === 0) {
    return (
      <div className="dashboard-page">
        <DashboardUploads cardLabels={cardLabels} initialJobs={initialJobs} />
        <DashboardEmptyState canWrite={session.entitlement.canWrite} />
      </div>
    );
  }

  const previous = previousPeriod(selectedPeriod);
  const throughDay = getSeoulDayOfMonth();
  const [
    currentSummary,
    previousSummary,
    currentThroughSummary,
    previousThroughSummary,
    categoryBreakdown,
    monthlyFlow,
    topMerchants,
    insights,
  ] = await Promise.all([
    fetchDashboardSummary(supabase, {
      userId: session.userId,
      period: selectedPeriod,
    }),
    fetchDashboardSummary(supabase, {
      userId: session.userId,
      period: previous,
    }),
    fetchDashboardSummary(supabase, {
      userId: session.userId,
      period: selectedPeriod,
      throughDay,
    }),
    fetchDashboardSummary(supabase, {
      userId: session.userId,
      period: previous,
      throughDay,
    }),
    fetchDashboardCategoryBreakdown(supabase, {
      userId: session.userId,
      period: selectedPeriod,
    }),
    fetchDashboardMonthlyFlow(supabase, {
      userId: session.userId,
      untilPeriod: selectedPeriod,
      months: 6,
    }),
    fetchDashboardTopMerchants(supabase, {
      userId: session.userId,
      period: selectedPeriod,
      limit: 5,
    }),
    getDashboardInsights(supabase, {
      userId: session.userId,
      period: selectedPeriod,
    }),
  ]);

  if (currentSummary.transactionCount === 0) {
    return (
      <div className="dashboard-page">
        <DashboardUploads cardLabels={cardLabels} initialJobs={initialJobs} />
        <SelectedMonthEmptyState
          canWrite={session.entitlement.canWrite}
          yearMonth={selectedYearMonth}
        />
      </div>
    );
  }

  const totalChange = getChange(
    currentSummary.totalExpense,
    previousSummary.totalExpense,
  );
  const averageDailyExpense =
    currentSummary.activeDays > 0
      ? currentSummary.totalExpense / currentSummary.activeDays
      : 0;
  const refundDepositDetail = [
    currentSummary.refundTotal > 0
      ? `환불 ${formatCurrency(currentSummary.refundTotal)}`
      : null,
    currentSummary.depositTotal > 0
      ? `입금 ${formatCurrency(currentSummary.depositTotal)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="dashboard-page">
      <DashboardUploads cardLabels={cardLabels} initialJobs={initialJobs} />
      <section className="dashboard-kpi-grid" aria-label="월 지출 요약">
        <KpiCard
          change={totalChange}
          detail={
            totalChange ? refundDepositDetail || undefined : "비교할 지난달 데이터가 없습니다"
          }
          label="이번 달 총지출"
          value={formatCurrency(currentSummary.totalExpense)}
        />
        <KpiCard
          detail={`${currentSummary.activeDays.toLocaleString("ko-KR")}일에 지출`}
          label="거래 건수"
          value={`${currentSummary.transactionCount.toLocaleString("ko-KR")}건`}
        />
        <KpiCard
          detail="지출이 있었던 날 기준"
          label="하루 평균 지출"
          value={formatCurrency(averageDailyExpense)}
        />
        <KpiCard
          detail={
            currentSummary.topCategory
              ? formatCurrency(currentSummary.topCategoryAmount)
              : "분류된 지출 없음"
          }
          label="가장 많이 쓴 카테고리"
          value={currentSummary.topCategory ?? "기타"}
        />
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-grid__column">
          <CategoryBreakdownPanel
            breakdown={categoryBreakdown}
            totalExpense={currentSummary.totalExpense}
          />
          <MonthlyFlowPanel flow={monthlyFlow} />
          <TopMerchantsPanel merchants={topMerchants} />
        </div>
        <div className="dashboard-grid__column">
          <SamePointComparisonPanel
            current={currentThroughSummary}
            previous={previousThroughSummary}
          />
          <InsightsPanel
            hasPreviousExpense={previousSummary.transactionCount > 0}
            insights={insights}
            yearMonth={selectedYearMonth}
          />
        </div>
      </div>
    </div>
  );
}
