"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import type { SubscriptionSummary } from "@/lib/entitlement";

// src/app/api/account/route.ts 가 검증하는 재확인 문구와 같은 값이다.
const DELETE_CONFIRMATION_PHRASE = "계정 삭제";
const DAY_MS = 24 * 60 * 60 * 1000;

type AccountSettingsProps = {
  counts: {
    reports: number;
    signals: number;
    transactions: number;
    uploads: number;
  };
  email: string | null;
  entitlementState: "trialing" | "active" | "expired";
  hasBillingCustomer: boolean;
  joinedAt: Date | null;
  subscription: SubscriptionSummary;
};

function seoulParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function formatDate(date: Date): string {
  const { year, month, day } = seoulParts(date);

  return `${year}.${month}.${day}`;
}

function formatMonthDay(date: Date): string {
  const { month, day } = seoulParts(date);

  return `${Number(month)}월 ${Number(day)}일`;
}

function seoulDayNumber(date: Date): number {
  const { year, month, day } = seoulParts(date);

  return Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS;
}

function remainingSeoulDays(until: Date): number {
  return Math.max(seoulDayNumber(until) - seoulDayNumber(new Date()), 0);
}

function formatCount(value: number, unit: string): string {
  return `${value.toLocaleString("ko-KR")}${unit}`;
}

function SubscriptionStatusBlock({
  subscription,
}: {
  subscription: SubscriptionSummary;
}) {
  if (subscription.kind === "trialing") {
    return (
      <>
        <Badge variant="teal">체험 중</Badge>
        <p className="settings-status__line">
          {formatDate(subscription.endsAt)}까지 체험할 수 있습니다. 남은 기간{" "}
          {remainingSeoulDays(subscription.endsAt)}일
        </p>
      </>
    );
  }

  if (subscription.kind === "subscribed") {
    return (
      <>
        <Badge variant="success">구독 중</Badge>
        <p className="settings-status__line">
          {subscription.renewsAt
            ? `다음 결제일 ${formatDate(subscription.renewsAt)}`
            : "다음 결제일을 확인하는 중입니다."}
        </p>
      </>
    );
  }

  if (subscription.kind === "canceled") {
    return (
      <>
        <Badge variant="yellow">해지 예정</Badge>
        <p className="settings-status__line">
          {formatMonthDay(subscription.accessEndsAt)}까지 이용할 수 있습니다.
        </p>
      </>
    );
  }

  return (
    <>
      <Badge variant="yellow">읽기 전용</Badge>
      <p className="settings-status__line">
        새 업로드와 리포트 생성, 분류 수정이 잠겨 있습니다. 지금까지 만든
        대시보드와 리포트는 계속 볼 수 있습니다.
      </p>
    </>
  );
}

export function AccountSettings({
  counts,
  email,
  entitlementState,
  hasBillingCustomer,
  joinedAt,
  subscription,
}: AccountSettingsProps) {
  const router = useRouter();
  const [phrase, setPhrase] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canDelete = phrase.trim() === DELETE_CONFIRMATION_PHRASE;

  function openPortal() {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await response.json()) as {
        portalUrl?: unknown;
        redirectTo?: unknown;
      };

      if (response.status === 409 && typeof body.redirectTo === "string") {
        router.push(body.redirectTo);
        return;
      }

      if (!response.ok || typeof body.portalUrl !== "string") {
        setErrorMessage("구독 관리 화면을 열지 못했습니다.");
        return;
      }

      window.location.assign(body.portalUrl);
    });
  }

  function deleteAccount() {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/account", {
        body: JSON.stringify({ confirmation: phrase.trim() }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });

      if (!response.ok) {
        setErrorMessage("계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      window.location.assign("/");
    });
  }

  return (
    <div className="settings-page">
      <section className="settings-panel">
        <h2 className="settings-panel__title">계정</h2>
        <dl className="settings-facts">
          <div className="settings-facts__row">
            <dt>이메일</dt>
            <dd>{email ?? "이메일 없음"}</dd>
          </div>
          <div className="settings-facts__row">
            <dt>가입일</dt>
            <dd className="tabular-nums">
              {joinedAt ? formatDate(joinedAt) : "알 수 없음"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="settings-panel">
        <h2 className="settings-panel__title">구독 상태</h2>
        <div className="settings-status">
          <SubscriptionStatusBlock subscription={subscription} />
        </div>
        {entitlementState === "expired" ? (
          <Link className="settings-panel__link" href="/dashboard/billing">
            요금제 보기
          </Link>
        ) : null}
      </section>

      <section className="settings-panel">
        <h2 className="settings-panel__title">구독 관리</h2>
        {hasBillingCustomer ? (
          <>
            <p className="settings-panel__description">
              결제수단 변경과 해지는 Polar 결제 화면에서 진행합니다. 해지해도
              결제 기간이 끝날 때까지는 그대로 이용할 수 있습니다.
            </p>
            <Button
              disabled={isPending}
              onClick={openPortal}
              variant="secondary"
            >
              구독 관리 열기
            </Button>
          </>
        ) : (
          <>
            <p className="settings-panel__description">
              아직 결제한 적이 없어 관리할 구독이 없습니다.
            </p>
            <Link className="settings-panel__link" href="/dashboard/billing">
              요금제 고르기
            </Link>
          </>
        )}
      </section>

      <section className="settings-panel settings-panel--danger">
        <h2 className="settings-panel__title">계정 삭제</h2>
        <p className="settings-panel__description">
          계정을 삭제하면 아래 데이터가 즉시 사라지고 되돌릴 수 없습니다.
        </p>
        <ul className="settings-danger-list">
          <li>거래 {formatCount(counts.transactions, "건")}</li>
          <li>AI 리뷰 신호 {formatCount(counts.signals, "개")}</li>
          <li>월간 리포트 {formatCount(counts.reports, "개")}</li>
          <li>업로드한 원본 CSV 파일 {formatCount(counts.uploads, "개")}</li>
        </ul>
        <label className="settings-confirm" htmlFor="account-delete-confirm">
          삭제하려면 &quot;{DELETE_CONFIRMATION_PHRASE}&quot; 를 입력하세요
        </label>
        <input
          autoComplete="off"
          className="settings-confirm__input"
          id="account-delete-confirm"
          onChange={(event) => setPhrase(event.target.value)}
          type="text"
          value={phrase}
        />
        <Button
          disabled={!canDelete || isPending}
          onClick={deleteAccount}
          variant="danger"
        >
          계정 삭제
        </Button>
        {errorMessage ? (
          <p className="settings-error" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
