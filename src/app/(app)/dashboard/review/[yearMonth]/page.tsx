import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/Badge";
import { getSessionContext } from "@/lib/session";
import {
  SIGNAL_TYPE_LABELS,
  SIGNAL_TYPES,
  type SignalType,
} from "@/lib/signals/thresholds";
import { createServerClient } from "@/services/supabase";
import type { Database, Json } from "@/types/database";

export const dynamic = "force-dynamic";

type ReviewPageProps = {
  params: Promise<{
    yearMonth: string;
  }>;
  searchParams?: Promise<{
    type?: string | string[];
  }>;
};

type SignalRow = Pick<
  Database["public"]["Tables"]["spending_signals"]["Row"],
  | "dismissed_at"
  | "id"
  | "impact"
  | "narrative"
  | "payload"
  | "target_key"
  | "type"
>;

type ReviewSignal = {
  dismissedAt: string | null;
  id: string;
  impact: number | null;
  narrative: string | null;
  payload: Record<string, unknown>;
  targetKey: string;
  type: SignalType;
};

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

function toSearchParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function isSignalType(value: string | null): value is SignalType {
  return SIGNAL_TYPES.includes(value as SignalType);
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

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadNumberList(
  payload: Record<string, unknown>,
  key: string,
): number[] {
  const value = payload[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
}

function formatCurrency(value: number): string {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatIntervalDays(payload: Record<string, unknown>): string {
  const intervals = payloadNumberList(payload, "intervalDays");

  if (intervals.length === 0) {
    return "-";
  }

  const min = Math.min(...intervals);
  const max = Math.max(...intervals);

  return min === max ? `${min}일` : `${min}~${max}일`;
}

function formatMonthCount(payload: Record<string, unknown>): string {
  const occurrenceCount = payloadNumber(payload, "occurrenceCount");

  return occurrenceCount === null ? "-" : `${occurrenceCount}개월`;
}

function signalSubject(signal: ReviewSignal): string {
  return (
    payloadString(signal.payload, "merchantNormalized") ??
    payloadString(signal.payload, "category") ??
    signal.targetKey
  );
}

function signalPayloadAmount(signal: ReviewSignal): number | null {
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

function toReviewSignal(row: SignalRow): ReviewSignal {
  return {
    dismissedAt: row.dismissed_at,
    id: row.id,
    impact: row.impact,
    narrative: row.narrative,
    payload: payloadRecord(row.payload),
    targetKey: row.target_key,
    type: row.type,
  };
}

function typeCounts(signals: readonly ReviewSignal[]): Map<SignalType, number> {
  const counts = new Map<SignalType, number>();

  for (const signal of signals) {
    counts.set(signal.type, (counts.get(signal.type) ?? 0) + 1);
  }

  return counts;
}

function TypeChips({
  activeType,
  counts,
  yearMonth,
}: {
  activeType: SignalType | null;
  counts: Map<SignalType, number>;
  yearMonth: string;
}) {
  return (
    <nav aria-label="신호 타입" className="review-type-chips">
      {SIGNAL_TYPES.map((type) => {
        const count = counts.get(type) ?? 0;
        const isActive = activeType === type;
        const className = [
          "review-type-chip",
          isActive ? "review-type-chip--active" : null,
          count === 0 ? "review-type-chip--disabled" : null,
        ]
          .filter(Boolean)
          .join(" ");
        const content = (
          <>
            <span>{SIGNAL_TYPE_LABELS[type]}</span>
            <span className="tabular-nums">{count.toLocaleString("ko-KR")}</span>
          </>
        );

        if (count === 0) {
          return (
            <span
              aria-disabled="true"
              className={className}
              key={type}
            >
              {content}
            </span>
          );
        }

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={className}
            href={
              isActive
                ? `/dashboard/review/${yearMonth}`
                : `/dashboard/review/${yearMonth}?type=${type}`
            }
            key={type}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

function ReviewSummary({
  impactTotal,
  signalCount,
  yearMonth,
}: {
  impactTotal: number;
  signalCount: number;
  yearMonth: string;
}) {
  return (
    <section className="review-summary-card">
      <div>
        <p className="review-summary-card__label">AI 리뷰</p>
        <h2 className="review-summary-card__title">{yearMonth} 신호</h2>
      </div>
      <div className="review-summary-card__stats">
        <div className="review-summary-stat">
          <span className="review-summary-stat__label">신호</span>
          <span className="review-summary-stat__value tabular-nums">
            {signalCount.toLocaleString("ko-KR")}개
          </span>
        </div>
        <div className="review-summary-stat">
          <span className="review-summary-stat__label">영향도 합계</span>
          <span className="review-summary-stat__value tabular-nums">
            {formatCurrency(impactTotal)}
          </span>
        </div>
      </div>
    </section>
  );
}

function SignalCard({
  signal,
  yearMonth,
}: {
  signal: ReviewSignal;
  yearMonth: string;
}) {
  const label = SIGNAL_TYPE_LABELS[signal.type];
  const subject = signalSubject(signal);
  const amount = signalPayloadAmount(signal);

  return (
    <Link
      aria-label={`${label} ${subject} 상세 보기`}
      className="review-signal-card"
      href={`/dashboard/review/${yearMonth}/${signal.id}`}
    >
      <article>
        <div className="review-signal-card__header">
          <div className="review-signal-card__copy">
            <div className="review-signal-card__meta">
              <span className="review-signal-card__type">{label}</span>
              <span className="review-signal-card__key">{signal.type}</span>
              {signal.dismissedAt ? <Badge variant="neutral">숨김</Badge> : null}
            </div>
            <h3 className="review-signal-card__subject">{subject}</h3>
          </div>
          {amount !== null ? (
            <span className="review-signal-card__amount tabular-nums">
              {formatCurrency(amount)}
            </span>
          ) : null}
        </div>
        {signal.narrative ? (
          <p className="review-signal-card__narrative">{signal.narrative}</p>
        ) : null}
      </article>
    </Link>
  );
}

function RecurringPaymentsSection({
  signals,
}: {
  signals: ReviewSignal[];
}) {
  if (signals.length === 0) {
    return null;
  }

  return (
    <section className="review-panel">
      <div className="review-panel__header">
        <div>
          <h2 className="review-section-title">반복 결제</h2>
          <p className="review-panel__subtitle">
            평소 그 자체라 인사이트 카드에 올리지 않습니다
          </p>
        </div>
        <span className="review-panel__meta tabular-nums">
          {signals.length.toLocaleString("ko-KR")}개
        </span>
      </div>
      <div className="review-recurring-table-wrap">
        <table className="review-recurring-table">
          <thead>
            <tr>
              <th scope="col">가맹점</th>
              <th scope="col">금액</th>
              <th scope="col">주기</th>
              <th scope="col">지속 개월</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => {
              const latestAmount = payloadNumber(signal.payload, "latestAmount");

              return (
                <tr key={signal.id}>
                  <td>{signalSubject(signal)}</td>
                  <td className="tabular-nums">
                    {latestAmount === null ? "-" : formatCurrency(latestAmount)}
                  </td>
                  <td className="tabular-nums">
                    {formatIntervalDays(signal.payload)}
                  </td>
                  <td className="tabular-nums">
                    {formatMonthCount(signal.payload)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ReviewPage({
  params,
  searchParams,
}: ReviewPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const { yearMonth } = await params;

  if (!isValidYearMonth(yearMonth)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const activeTypeCandidate = toSearchParam(resolvedSearchParams?.type);
  const activeType = isSignalType(activeTypeCandidate)
    ? activeTypeCandidate
    : null;
  const period = toPeriod(yearMonth);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("spending_signals")
    .select("id, type, target_key, payload, impact, narrative, dismissed_at")
    .eq("user_id", session.userId)
    .eq("period", period)
    .order("impact", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  const signals = ((data ?? []) as SignalRow[]).map(toReviewSignal);
  const counts = typeCounts(signals);
  const filteredSignals = activeType
    ? signals.filter((signal) => signal.type === activeType)
    : signals;
  const impactSignals = filteredSignals.filter(
    (signal) => signal.impact !== null,
  );
  const nullImpactSignals = filteredSignals.filter(
    (signal) => signal.impact === null,
  );
  const impactTotal = signals.reduce(
    (sum, signal) => sum + (signal.impact ?? 0),
    0,
  );
  const isOutlierOnlyMonth =
    signals.length > 0 &&
    signals.every((signal) => signal.type === "outlier_transaction");

  return (
    <div className="review-page">
      <ReviewSummary
        impactTotal={impactTotal}
        signalCount={signals.length}
        yearMonth={yearMonth}
      />
      <TypeChips activeType={activeType} counts={counts} yearMonth={yearMonth} />

      {signals.length === 0 ? (
        <section className="review-empty">
          이 달에는 지적할 만한 변화가 없었습니다
        </section>
      ) : null}

      {isOutlierOnlyMonth ? (
        <section className="review-first-month-note">
          다음 달이면 지난달과 비교해 드릴 수 있습니다
        </section>
      ) : null}

      {filteredSignals.length === 0 && signals.length > 0 ? (
        <section className="review-empty">선택한 유형의 신호가 없습니다</section>
      ) : null}

      {impactSignals.length > 0 ? (
        <section className="review-signal-list" aria-label="영향도 있는 신호">
          {impactSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} yearMonth={yearMonth} />
          ))}
        </section>
      ) : null}

      <RecurringPaymentsSection signals={nullImpactSignals} />
    </div>
  );
}
