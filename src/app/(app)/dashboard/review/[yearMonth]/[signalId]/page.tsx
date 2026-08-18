import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Badge } from "@/components/Badge";
import {
  CATEGORIES,
  CATEGORY_TOKENS,
  type Category,
} from "@/lib/categories";
import { getSessionContext } from "@/lib/session";
import {
  SIGNAL_CONDITION_COPY,
  SIGNAL_TYPE_LABELS,
  type SignalType,
} from "@/lib/signals/thresholds";
import { createServerClient } from "@/services/supabase";
import type { Database, Json } from "@/types/database";

export const dynamic = "force-dynamic";

type SignalDetailPageProps = {
  params: Promise<{
    signalId: string;
    yearMonth: string;
  }>;
};

type SignalRow = Pick<
  Database["public"]["Tables"]["spending_signals"]["Row"],
  | "id"
  | "impact"
  | "narrative"
  | "payload"
  | "period"
  | "target_key"
  | "type"
>;

type EvidenceTransactionRow = Pick<
  Database["public"]["Tables"]["transactions"]["Row"],
  | "amount"
  | "category"
  | "id"
  | "merchant_normalized"
  | "merchant_raw"
  | "transacted_on"
>;

type SignalDetail = {
  id: string;
  impact: number | null;
  narrative: string | null;
  payload: Record<string, unknown>;
  period: string;
  targetKey: string;
  type: SignalType;
};

type Metric = {
  label: string;
  value: string | null;
};

const CATEGORY_SET = new Set<string>(CATEGORIES);

function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));

  return month >= 1 && month <= 12;
}

function isValidPeriod(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-01$/.test(value);
}

function toPeriod(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function addMonths(period: string, delta: number): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const totalMonths = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
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

function formatCurrencyValue(value: number | null): string | null {
  return value === null ? null : formatCurrency(value);
}

function formatPercentValue(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  const percent = value * 100;
  const formatted = percent.toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  });

  return `${formatted}%`;
}

function formatMultipleValue(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}배`;
}

function formatAmountRange(payload: Record<string, unknown>): string | null {
  const minAmount = payloadNumber(payload, "minAmount");
  const maxAmount = payloadNumber(payload, "maxAmount");

  if (minAmount === null || maxAmount === null) {
    return null;
  }

  return `${formatCurrency(minAmount)}~${formatCurrency(maxAmount)}`;
}

function formatIntervalDays(payload: Record<string, unknown>): string | null {
  const intervals = payloadNumberList(payload, "intervalDays");

  if (intervals.length === 0) {
    return null;
  }

  return intervals.map((interval) => `${interval}일`).join(", ");
}

function formatCount(value: number | null, suffix: string): string | null {
  return value === null ? null : `${value.toLocaleString("ko-KR")}${suffix}`;
}

function isCategory(value: string | null): value is Category {
  return value !== null && CATEGORY_SET.has(value);
}

function toSignalDetail(row: SignalRow): SignalDetail {
  return {
    id: row.id,
    impact: row.impact,
    narrative: row.narrative,
    payload: payloadRecord(row.payload),
    period: row.period,
    targetKey: row.target_key,
    type: row.type,
  };
}

function signalSubject(signal: SignalDetail): string {
  return (
    payloadString(signal.payload, "merchantNormalized") ??
    payloadString(signal.payload, "category") ??
    signal.targetKey
  );
}

function metricsForSignal(signal: SignalDetail): Metric[] {
  switch (signal.type) {
    case "category_spike":
      return [
        {
          label: "지난달 지출",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "previousTotal"),
          ),
        },
        {
          label: "이번 달 지출",
          value: formatCurrencyValue(payloadNumber(signal.payload, "currentTotal")),
        },
        {
          label: "증가액",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "increaseAmount"),
          ),
        },
        {
          label: "증가율",
          value: formatPercentValue(
            payloadNumber(signal.payload, "increaseRatio"),
          ),
        },
      ];
    case "new_merchant_large":
      return [
        {
          label: "결제액",
          value: formatCurrencyValue(payloadNumber(signal.payload, "amount")),
        },
        {
          label: "카테고리 중앙값",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "medianAmount"),
          ),
        },
        {
          label: "중앙값 대비",
          value: formatMultipleValue(
            payloadNumber(signal.payload, "medianMultiple"),
          ),
        },
      ];
    case "outlier_transaction":
      return [
        {
          label: "결제액",
          value: formatCurrencyValue(payloadNumber(signal.payload, "amount")),
        },
        {
          label: "카테고리 월 지출",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "categoryTotal"),
          ),
        },
        {
          label: "카테고리 내 비중",
          value: formatPercentValue(
            payloadNumber(signal.payload, "shareOfCategory"),
          ),
        },
      ];
    case "recurring_payment":
      return [
        {
          label: "최근 결제액",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "latestAmount"),
          ),
        },
        {
          label: "금액 범위",
          value: formatAmountRange(signal.payload),
        },
        {
          label: "결제 횟수",
          value: formatCount(
            payloadNumber(signal.payload, "occurrenceCount"),
            "회",
          ),
        },
        {
          label: "결제 간격",
          value: formatIntervalDays(signal.payload),
        },
      ];
    case "recurring_price_up":
      return [
        {
          label: "직전 결제액",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "previousAmount"),
          ),
        },
        {
          label: "최근 결제액",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "latestAmount"),
          ),
        },
        {
          label: "인상액",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "increaseAmount"),
          ),
        },
        {
          label: "1년 환산",
          value: formatCurrencyValue(
            payloadNumber(signal.payload, "annualizedImpact"),
          ),
        },
      ];
  }
}

function isHighlightedEvidence(
  signal: SignalDetail,
  transaction: EvidenceTransactionRow,
): boolean {
  switch (signal.type) {
    case "new_merchant_large":
    case "outlier_transaction":
      return transaction.id === payloadString(signal.payload, "transactionId");
    case "recurring_price_up": {
      const previousDate = payloadString(signal.payload, "previousTransactedOn");
      const latestDate = payloadString(signal.payload, "latestTransactedOn");
      const previousAmount = payloadNumber(signal.payload, "previousAmount");
      const latestAmount = payloadNumber(signal.payload, "latestAmount");

      return (
        (transaction.transacted_on === previousDate &&
          transaction.amount === previousAmount) ||
        (transaction.transacted_on === latestDate &&
          transaction.amount === latestAmount)
      );
    }
    case "category_spike":
    case "recurring_payment":
      return false;
  }
}

function evidenceBaseQuery(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return supabase
    .from("transactions")
    .select("id, transacted_on, amount, merchant_raw, merchant_normalized, category")
    .eq("user_id", userId)
    .eq("transaction_type", "expense")
    .eq("category_fallback", false)
    .not("category", "is", null)
    .gt("amount", 0);
}

async function resolveEvidenceQuery(
  query: ReturnType<typeof evidenceBaseQuery>,
): Promise<EvidenceTransactionRow[]> {
  const { data, error } = await query
    .order("transacted_on", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as EvidenceTransactionRow[];
}

async function fetchEvidenceTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
  signal: SignalDetail,
): Promise<EvidenceTransactionRow[]> {
  switch (signal.type) {
    case "category_spike": {
      if (!isCategory(signal.targetKey)) {
        return [];
      }

      const currentPeriodPayload = payloadString(
        signal.payload,
        "currentPeriod",
      );
      const previousPeriodPayload = payloadString(
        signal.payload,
        "previousPeriod",
      );
      const currentPeriod = isValidPeriod(currentPeriodPayload)
        ? currentPeriodPayload
        : signal.period;
      const previousPeriod = isValidPeriod(previousPeriodPayload)
        ? previousPeriodPayload
        : addMonths(signal.period, -1);

      return resolveEvidenceQuery(
        evidenceBaseQuery(supabase, userId)
          .eq("category", signal.targetKey)
          .gte("transacted_on", previousPeriod)
          .lt("transacted_on", addMonths(currentPeriod, 1)),
      );
    }
    case "new_merchant_large":
    case "recurring_payment":
    case "recurring_price_up":
      return resolveEvidenceQuery(
        evidenceBaseQuery(supabase, userId).eq(
          "merchant_normalized",
          signal.targetKey,
        ),
      );
    case "outlier_transaction": {
      const category = payloadString(signal.payload, "category");

      if (!isCategory(category)) {
        return [];
      }

      return resolveEvidenceQuery(
        evidenceBaseQuery(supabase, userId)
          .eq("category", category)
          .gte("transacted_on", signal.period)
          .lt("transacted_on", addMonths(signal.period, 1)),
      );
    }
  }
}

function formatDate(value: string): string {
  return value.replaceAll("-", ".");
}

function MetricsPanel({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="signal-detail-panel">
      <h2 className="signal-detail-section-title">판정 수치</h2>
      <dl className="signal-detail-metrics">
        {metrics.map((metric) => (
          <div className="signal-detail-metric" key={metric.label}>
            <dt>{metric.label}</dt>
            <dd className="tabular-nums">{metric.value ?? ""}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ConditionPanel({ signal }: { signal: SignalDetail }) {
  return (
    <section className="signal-detail-panel signal-detail-condition">
      <h2 className="signal-detail-section-title">왜 이 조건인가</h2>
      <p>{SIGNAL_CONDITION_COPY[signal.type]}</p>
    </section>
  );
}

function CategorySpikeSubtotals({ signal }: { signal: SignalDetail }) {
  if (signal.type !== "category_spike") {
    return null;
  }

  const previousTotal = formatCurrencyValue(
    payloadNumber(signal.payload, "previousTotal"),
  );
  const currentTotal = formatCurrencyValue(
    payloadNumber(signal.payload, "currentTotal"),
  );

  if (previousTotal === null && currentTotal === null) {
    return null;
  }

  return (
    <div className="signal-detail-subtotals">
      <span>
        지난달 소계{" "}
        <strong className="tabular-nums">{previousTotal ?? ""}</strong>
      </span>
      <span>
        이번 달 소계{" "}
        <strong className="tabular-nums">{currentTotal ?? ""}</strong>
      </span>
    </div>
  );
}

function CategoryCell({ category }: { category: Category | null }) {
  if (!category) {
    return null;
  }

  return (
    <span className="signal-detail-category">
      <span
        aria-hidden
        className="signal-detail-category__dot"
        style={{ background: `var(${CATEGORY_TOKENS[category]})` }}
      />
      <span>{category}</span>
    </span>
  );
}

function EvidenceTable({
  signal,
  transactions,
}: {
  signal: SignalDetail;
  transactions: EvidenceTransactionRow[];
}) {
  return (
    <section className="signal-detail-panel">
      <div className="signal-detail-panel__header">
        <div>
          <h2 className="signal-detail-section-title">근거 거래</h2>
          <p className="signal-detail-panel__subtitle">
            신호 탐지에 사용한 거래 조건과 같은 범위입니다.
          </p>
        </div>
        <span className="signal-detail-panel__meta tabular-nums">
          {transactions.length.toLocaleString("ko-KR")}건
        </span>
      </div>
      <CategorySpikeSubtotals signal={signal} />
      {transactions.length === 0 ? (
        <p className="signal-detail-empty">근거 거래가 없습니다.</p>
      ) : (
        <div className="signal-detail-table-wrap">
          <table className="signal-detail-table">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">가맹점</th>
                <th scope="col">카테고리</th>
                <th scope="col">금액</th>
                <th scope="col">근거</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const highlighted = isHighlightedEvidence(signal, transaction);
                const category = isCategory(transaction.category)
                  ? transaction.category
                  : null;

                return (
                  <tr
                    className={
                      highlighted
                        ? "signal-detail-evidence-row--highlighted"
                        : undefined
                    }
                    key={transaction.id}
                  >
                    <td className="signal-detail-table__date tabular-nums">
                      {formatDate(transaction.transacted_on)}
                    </td>
                    <td>
                      <div className="signal-detail-merchant">
                        <span className="signal-detail-merchant__raw">
                          {transaction.merchant_raw}
                        </span>
                        {transaction.merchant_raw !==
                        transaction.merchant_normalized ? (
                          <span className="signal-detail-merchant__normalized">
                            {transaction.merchant_normalized}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <CategoryCell category={category} />
                    </td>
                    <td className="signal-detail-table__amount tabular-nums">
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td>{highlighted ? <Badge variant="teal">증거</Badge> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function SignalDetailPage({
  params,
}: SignalDetailPageProps) {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const { signalId, yearMonth } = await params;

  if (!isValidYearMonth(yearMonth)) {
    notFound();
  }

  const period = toPeriod(yearMonth);
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("spending_signals")
    .select("id, type, target_key, payload, impact, narrative, period")
    .eq("id", signalId)
    .eq("user_id", session.userId)
    .eq("period", period)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    notFound();
  }

  const signal = toSignalDetail(data as SignalRow);
  const transactions = await fetchEvidenceTransactions(
    supabase,
    session.userId,
    signal,
  );

  return (
    <div className="signal-detail-page">
      <div className="signal-detail-back">
        <Link href={`/dashboard/review/${yearMonth}`}>AI 리뷰로 돌아가기</Link>
      </div>
      <section className="signal-detail-hero">
        <div className="signal-detail-hero__meta">
          <span>{SIGNAL_TYPE_LABELS[signal.type]}</span>
          <span className="signal-detail-hero__key">{signal.type}</span>
        </div>
        <h1>{signalSubject(signal)}</h1>
        {signal.narrative ? (
          <p className="signal-detail-narrative">{signal.narrative}</p>
        ) : null}
      </section>
      <MetricsPanel metrics={metricsForSignal(signal)} />
      <ConditionPanel signal={signal} />
      <EvidenceTable signal={signal} transactions={transactions} />
    </div>
  );
}
