import { redirect } from "next/navigation";

import { Badge } from "@/components/Badge";
import { getSessionContext } from "@/lib/session";
import {
  fetchRecurringSignalsLatest,
  type RecurringSignalLatest,
} from "@/lib/signals/queries";
import { SIGNAL_CONDITION_COPY } from "@/lib/signals/thresholds";
import { createServerClient } from "@/services/supabase";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type PayloadRecord = Record<string, unknown>;

type MergedRecurringSignal = {
  payment: RecurringSignalLatest | null;
  priceUp: RecurringSignalLatest | null;
  targetKey: string;
};

function payloadRecord(payload: Json): PayloadRecord {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as PayloadRecord;
  }

  return {};
}

function payloadNumber(payload: PayloadRecord, key: string): number | null {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function payloadString(payload: PayloadRecord, key: string): string | null {
  const value = payload[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadIntervalDays(payload: PayloadRecord): number[] {
  const value = payload.intervalDays;

  if (typeof value === "number" && Number.isFinite(value)) {
    return [value];
  }

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

function formatSignedCurrency(value: number): string {
  return `+${formatCurrency(value)}`;
}

function formatDate(value: string): string {
  return value.replaceAll("-", ".");
}

function formatInterval(payload: PayloadRecord): string {
  const intervals = payloadIntervalDays(payload);

  if (intervals.length === 0) {
    return "-";
  }

  const min = Math.min(...intervals);
  const max = Math.max(...intervals);
  const interval = min === max ? `${min}` : `${min}~${max}`;

  return `약 ${interval}일마다`;
}

function formatAmountRange(payload: PayloadRecord): string | null {
  const minAmount = payloadNumber(payload, "minAmount");
  const maxAmount = payloadNumber(payload, "maxAmount");

  if (minAmount === null || maxAmount === null || minAmount === maxAmount) {
    return null;
  }

  return `${formatCurrency(minAmount)}~${formatCurrency(maxAmount)}`;
}

function formatOccurrence(payload: PayloadRecord): string {
  const occurrenceCount = payloadNumber(payload, "occurrenceCount");

  return occurrenceCount === null ? "-" : `${occurrenceCount}회`;
}

function formatDateRange(payload: PayloadRecord): string {
  const first =
    payloadString(payload, "firstTransactedOn") ??
    payloadString(payload, "previousTransactedOn");
  const last =
    payloadString(payload, "lastTransactedOn") ??
    payloadString(payload, "latestTransactedOn");

  if (!first || !last) {
    return "-";
  }

  return `${formatDate(first)} ~ ${formatDate(last)}`;
}

function mergeRecurringSignals(
  signals: readonly RecurringSignalLatest[],
): MergedRecurringSignal[] {
  const groups = new Map<string, MergedRecurringSignal>();

  for (const signal of signals) {
    const existing = groups.get(signal.targetKey) ?? {
      payment: null,
      priceUp: null,
      targetKey: signal.targetKey,
    };

    if (signal.type === "recurring_payment") {
      existing.payment = signal;
    } else {
      existing.priceUp = signal;
    }

    groups.set(signal.targetKey, existing);
  }

  return [...groups.values()].sort(
    (left, right) => latestAmount(right) - latestAmount(left),
  );
}

function primaryPayload(group: MergedRecurringSignal): PayloadRecord {
  return payloadRecord((group.payment ?? group.priceUp)?.payload ?? null);
}

function priceUpPayload(group: MergedRecurringSignal): PayloadRecord {
  return payloadRecord(group.priceUp?.payload ?? null);
}

function merchantName(group: MergedRecurringSignal): string {
  const paymentPayload = payloadRecord(group.payment?.payload ?? null);
  const increasePayload = priceUpPayload(group);

  return (
    payloadString(paymentPayload, "merchantNormalized") ??
    payloadString(increasePayload, "merchantNormalized") ??
    group.targetKey
  );
}

function latestAmount(group: MergedRecurringSignal): number {
  const paymentAmount = payloadNumber(primaryPayload(group), "latestAmount");
  const increaseAmount = payloadNumber(priceUpPayload(group), "latestAmount");

  return paymentAmount ?? increaseAmount ?? 0;
}

function narrative(group: MergedRecurringSignal): string | null {
  return group.priceUp?.narrative ?? group.payment?.narrative ?? null;
}

function PriceUpSummary({ group }: { group: MergedRecurringSignal }) {
  const payload = priceUpPayload(group);
  const previousAmount = payloadNumber(payload, "previousAmount");
  const latestIncreaseAmount = payloadNumber(payload, "latestAmount");
  const annualizedImpact = payloadNumber(payload, "annualizedImpact");

  if (
    previousAmount === null ||
    latestIncreaseAmount === null ||
    annualizedImpact === null
  ) {
    return null;
  }

  return (
    <div className="subscriptions-price-up">
      <span className="subscriptions-price-up__amounts tabular-nums">
        {formatCurrency(previousAmount)} → {formatCurrency(latestIncreaseAmount)}
      </span>
      <span className="subscriptions-price-up__impact tabular-nums">
        연 {formatSignedCurrency(annualizedImpact)}
      </span>
    </div>
  );
}

function SubscriptionsTable({
  groups,
}: {
  groups: readonly MergedRecurringSignal[];
}) {
  return (
    <div className="subscriptions-table-wrap">
      <table className="subscriptions-table">
        <thead>
          <tr>
            <th scope="col">가맹점</th>
            <th scope="col">금액</th>
            <th scope="col">주기</th>
            <th scope="col">지속 기간</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const payload = primaryPayload(group);
            const amount = latestAmount(group);
            const amountRange = formatAmountRange(payload);
            const rowNarrative = narrative(group);

            return (
              <tr key={group.targetKey}>
                <td>
                  <div className="subscriptions-merchant">
                    <div className="subscriptions-merchant__header">
                      <span className="subscriptions-merchant__name">
                        {merchantName(group)}
                      </span>
                      {group.priceUp ? <Badge variant="yellow">인상</Badge> : null}
                    </div>
                    {rowNarrative ? (
                      <p className="subscriptions-merchant__narrative">
                        {rowNarrative}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="subscriptions-table__amount tabular-nums">
                  <span>{amount > 0 ? formatCurrency(amount) : "-"}</span>
                  {amountRange ? (
                    <span className="subscriptions-table__secondary">
                      {amountRange}
                    </span>
                  ) : null}
                  <PriceUpSummary group={group} />
                </td>
                <td className="subscriptions-table__interval tabular-nums">
                  {formatInterval(payload)}
                </td>
                <td className="subscriptions-table__duration tabular-nums">
                  <span>{formatOccurrence(payload)}</span>
                  <span className="subscriptions-table__secondary">
                    {formatDateRange(payload)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function SubscriptionsPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/");
  }

  const supabase = await createServerClient();
  const signals = await fetchRecurringSignalsLatest(supabase, session.userId);
  const groups = mergeRecurringSignals(signals);

  return (
    <div className="subscriptions-page">
      <section className="subscriptions-panel">
        <div className="subscriptions-panel__header">
          <div>
            <h2 className="dashboard-section-title">반복 지출</h2>
            <p className="dashboard-panel__subtitle">
              매달 비슷한 금액으로 반복된 결제와 최근 인상 내역을 봅니다.
            </p>
          </div>
          <div className="subscriptions-panel__meta">
            <span className="tabular-nums">
              {groups.length.toLocaleString("ko-KR")}개
            </span>
            <span>최근 결제 금액 높은 순</span>
          </div>
        </div>

        {groups.length === 0 ? (
          <section className="subscriptions-empty">
            <h3>아직 반복 지출로 볼 만한 결제가 없습니다</h3>
            <p>{SIGNAL_CONDITION_COPY.recurring_payment}</p>
          </section>
        ) : (
          <SubscriptionsTable groups={groups} />
        )}
      </section>
    </div>
  );
}
