"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/Badge";
import { PillTabs } from "@/components/PillTabs";
import { PricingCard } from "@/components/PricingCard";

const MONTHLY_PRICE_KRW = 4_900;
const YEARLY_PRICE_KRW = 49_000;
const MONTHS_PER_YEAR = 12;
const CHECKOUT_POLL_INTERVAL_MS = 3_000;
const CHECKOUT_POLL_TIMEOUT_MS = 30_000;

const PLAN_OPTIONS = [
  { label: "월간", value: "monthly" },
  { label: "연간", value: "yearly" },
] as const;

const PLAN_FEATURES = [
  "새 명세서 업로드",
  "월간 리포트 생성",
  "가맹점 분류 수정",
] as const;

type CheckoutPlan = "monthly" | "yearly";

type BillingPlansProps = {
  checkoutSuccess: boolean;
  entitlement: {
    state: "trialing" | "active" | "expired";
    trialEndsAt: Date | null;
  };
};

function formatCurrency(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}.${byType.month}.${byType.day}`;
}

function planAmount(plan: CheckoutPlan): string {
  return formatCurrency(plan === "monthly" ? MONTHLY_PRICE_KRW : YEARLY_PRICE_KRW);
}

function statusBadge(entitlement: BillingPlansProps["entitlement"]) {
  if (entitlement.state === "active") {
    return {
      copy: "구독 사용 중",
      variant: "success" as const,
    };
  }

  if (entitlement.state === "trialing" && entitlement.trialEndsAt) {
    return {
      copy: `${formatDate(entitlement.trialEndsAt)}까지 체험 중`,
      variant: "teal" as const,
    };
  }

  return {
    copy: "읽기 전용",
    variant: "yellow" as const,
  };
}

export function BillingPlans({
  checkoutSuccess,
  entitlement,
}: BillingPlansProps) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>("yearly");
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollStartedAtRef = useRef(Date.now());
  const badge = statusBadge(entitlement);
  const savings = MONTHLY_PRICE_KRW * MONTHS_PER_YEAR - YEARLY_PRICE_KRW;
  const isSubscribed = entitlement.state === "active";
  const isPolling = checkoutSuccess && !isSubscribed && !pollTimedOut;

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    const intervalId = window.setInterval(() => {
      router.refresh();

      if (Date.now() - pollStartedAtRef.current >= CHECKOUT_POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        window.clearInterval(intervalId);
      }
    }, CHECKOUT_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPolling, router]);

  function startCheckout(plan: CheckoutPlan) {
    setSelectedPlan(plan);
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/billing/checkout", {
        body: JSON.stringify({ plan }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setErrorMessage("체크아웃을 시작하지 못했습니다.");
        return;
      }

      const body = (await response.json()) as { checkoutUrl?: unknown };

      if (typeof body.checkoutUrl !== "string" || body.checkoutUrl === "") {
        setErrorMessage("체크아웃 주소를 받지 못했습니다.");
        return;
      }

      window.location.assign(body.checkoutUrl);
    });
  }

  return (
    <div className="billing-page">
      <section className="billing-hero">
        <div className="billing-hero__copy">
          <Badge variant={badge.variant}>{badge.copy}</Badge>
          <h2 className="billing-hero__title">요금제</h2>
          <p className="billing-hero__description">
            체험 이후에도 새 업로드와 리포트 생성을 계속 쓰려면 결제가 필요합니다.
          </p>
        </div>
        <PillTabs
          ariaLabel="요금 주기"
          onValueChange={setSelectedPlan}
          options={PLAN_OPTIONS}
          value={selectedPlan}
        />
      </section>

      {checkoutSuccess && isSubscribed ? (
        <p className="billing-return-status" role="status">
          결제가 확인되었습니다.
        </p>
      ) : null}
      {isPolling ? (
        <p className="billing-return-status" role="status">
          결제를 확인하는 중
        </p>
      ) : null}
      {pollTimedOut ? (
        <p className="billing-return-status" role="status">
          곧 반영됩니다. 새로고침해 주세요
        </p>
      ) : null}

      <div className="billing-plan-grid">
        <PricingCard
          amount={planAmount("monthly")}
          ctaDisabled={isPending || isSubscribed}
          ctaLabel="월간으로 결제"
          features={PLAN_FEATURES}
          name="월간"
          onCtaClick={() => startCheckout("monthly")}
          period="1개월"
          selected={selectedPlan === "monthly"}
          variant="standard"
        />
        <PricingCard
          amount={planAmount("yearly")}
          ctaDisabled={isPending || isSubscribed}
          ctaLabel="연간으로 결제"
          features={PLAN_FEATURES}
          name="연간"
          onCtaClick={() => startCheckout("yearly")}
          period="1년"
          selected={selectedPlan === "yearly"}
          variant="featured"
        />
      </div>

      <p className="billing-savings tabular-nums">
        연간 결제는 월간 결제 {MONTHS_PER_YEAR}개월보다 {formatCurrency(savings)}{" "}
        저렴합니다.
      </p>

      {errorMessage ? (
        <p className="billing-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <section className="billing-readonly-panel">
        <h2 className="billing-section-title">결제하지 않으면 어떻게 되나요</h2>
        <div className="billing-readonly-grid">
          <div className="billing-readonly-item">
            <h3>계속 볼 수 있습니다</h3>
            <p>
              기존 대시보드, AI 리뷰, 월간 리포트, 반복 지출 목록은 읽기
              전용으로 열립니다.
            </p>
          </div>
          <div className="billing-readonly-item">
            <h3>쓰기 기능은 멈춥니다</h3>
            <p>
              새 명세서 업로드, 리포트 생성, 가맹점 분류 수정은 결제 전까지
              잠깁니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
