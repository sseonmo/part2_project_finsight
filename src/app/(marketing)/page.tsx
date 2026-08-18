"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { PricingCard } from "@/components/PricingCard";
import { createBrowserClient } from "@/services/supabase";

const MONTHLY_PRICE_KRW = 4_900;
const YEARLY_PRICE_KRW = 49_000;
const MONTHS_PER_YEAR = 12;

const PLAN_FEATURES = [
  "새 명세서 업로드",
  "월간 리포트 생성",
  "가맹점 분류 수정",
] as const;

const CSV_REASONS = [
  {
    body: "은행·카드사 아이디와 비밀번호를 넘길 일이 없습니다. 카드사에서 내려받은 CSV 파일 하나면 됩니다.",
    title: "계정을 맡기지 않습니다",
  },
  {
    body: "연동해 둔 계좌가 뒤에서 계속 읽히지 않습니다. 올린 파일에 든 거래만 들어갑니다.",
    title: "올린 것만 들어갑니다",
  },
  {
    body: "원본 파일은 업로드 이력에서 언제든 지울 수 있고, 계정을 삭제하면 함께 사라집니다.",
    title: "지우는 것도 본인이 합니다",
  },
] as const;

const FLOW_STEPS = [
  {
    body: "카드사에서 내려받은 파일을 그대로 올립니다. 컬럼 이름이 카드사마다 달라도 자동으로 읽습니다.",
    title: "CSV 올리기",
  },
  {
    body: "가맹점을 카테고리 10종으로 나눕니다. 분류를 고치면 같은 가맹점의 다른 거래도 함께 바뀝니다.",
    title: "자동 분류",
  },
  {
    body: "지출 급증·튀는 결제·구독료 인상 같은 신호를 찾아 문장으로 알려줍니다.",
    title: "지적 받기",
  },
] as const;

const SAMPLE_SENTENCES = [
  {
    signal: "카테고리 지출 급증",
    text: "카페·간식이 지난달보다 62,000원(+58%) 늘었습니다.",
  },
  {
    signal: "구독료 인상",
    text: "스트리밍 구독료가 9,900원에서 12,900원으로 올랐습니다. 이대로면 1년에 36,000원을 더 내게 됩니다.",
  },
  {
    signal: "튀는 단일 결제",
    text: "문화·여가 결제 한 건이 180,000원으로 그 달 문화·여가 지출의 44%를 차지했습니다.",
  },
] as const;

function formatCurrency(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getBrowserOrigin(): string {
  return window.location.origin === "null"
    ? "http://localhost:3000"
    : window.location.origin;
}

function buildCallbackUrl(redirectTo: string | null): string {
  const callbackUrl = new URL("/auth/callback", getBrowserOrigin());
  const safeRedirectTo = safeRedirectPath(redirectTo);

  if (safeRedirectTo) {
    callbackUrl.searchParams.set("redirectTo", safeRedirectTo);
  }

  return callbackUrl.toString();
}

function MarketingContent() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const authError = searchParams.get("authError");
  const savings = MONTHLY_PRICE_KRW * MONTHS_PER_YEAR - YEARLY_PRICE_KRW;

  async function startGoogleOAuth() {
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildCallbackUrl(searchParams.get("redirectTo")),
        },
      });

      if (error) {
        setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-wordmark">finsight</span>
        <Button onClick={startGoogleOAuth} size="sm">
          구글로 시작하기
        </Button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <h1 className="landing-hero__title">
            카드 명세서 CSV를 올리면 지출을 분류하고 바꿀 지점을 짚어 드립니다
          </h1>
          <p className="landing-hero__description">
            매달 내려받는 명세서 파일 하나로 카테고리별 지출, 지난달과의 비교,
            그리고 행동을 바꿀 수 있는 지적 5종을 받습니다.
          </p>
          {authError ? (
            <p className="landing-alert" role="alert">
              {authError}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="landing-alert" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <div className="landing-hero__actions">
            <Button onClick={startGoogleOAuth} size="lg">
              구글로 시작하기
            </Button>
            <p className="landing-hero__note">7일 무료 체험, 카드 등록 없이</p>
          </div>
        </section>

        <section className="landing-section">
          <h2 className="landing-section__title">
            왜 계좌를 연동하지 않나
          </h2>
          <p className="landing-section__lead">
            연동하지 못해서가 아니라 연동하지 않기로 했습니다. 가계부 하나를
            쓰려고 금융 계정 전체를 넘길 이유가 없습니다.
          </p>
          <ul aria-label="CSV를 쓰는 이유" className="landing-reason-list">
            {CSV_REASONS.map((reason) => (
              <li className="landing-reason" key={reason.title}>
                <h3 className="landing-reason__title">{reason.title}</h3>
                <p className="landing-reason__body">{reason.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section">
          <h2 className="landing-section__title">세 단계로 끝납니다</h2>
          <ol aria-label="이용 흐름" className="landing-flow-list">
            {FLOW_STEPS.map((step, index) => (
              <li className="landing-flow" key={step.title}>
                <span className="landing-flow__index tabular-nums">
                  {index + 1}
                </span>
                <h3 className="landing-flow__title">{step.title}</h3>
                <p className="landing-flow__body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section">
          <h2 className="landing-section__title">이런 문장을 받게 됩니다</h2>
          <p className="landing-section__lead">
            아래 세 문장은 실제 사용자 데이터가 아니라 예시 문장입니다. 실제
            화면의 금액은 올린 거래에서 직접 집계한 값이고, AI는 그 숫자를
            문장으로 옮기기만 합니다.
          </p>
          <ul aria-label="예시 문장" className="landing-sample-list">
            {SAMPLE_SENTENCES.map((sample) => (
              <li className="landing-sample" key={sample.signal}>
                <div className="landing-sample__header">
                  <Badge variant="neutral">예시</Badge>
                  <span className="landing-sample__signal">
                    {sample.signal}
                  </span>
                </div>
                <p className="landing-sample__text">{sample.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section" id="pricing">
          <h2 className="landing-section__title">요금제</h2>
          <p className="landing-section__lead">
            7일 체험이 끝난 뒤에도 체험 중 만든 대시보드·리뷰·리포트는 계속
            볼 수 있습니다. 결제하면 새 업로드와 리포트 생성이 다시 열립니다.
          </p>
          <div className="landing-plan-grid">
            <PricingCard
              amount={formatCurrency(MONTHLY_PRICE_KRW)}
              ctaLabel="구글로 시작하기"
              features={PLAN_FEATURES}
              name="월간"
              onCtaClick={startGoogleOAuth}
              period="1개월"
              variant="standard"
            />
            <PricingCard
              amount={formatCurrency(YEARLY_PRICE_KRW)}
              ctaLabel="구글로 시작하기"
              features={PLAN_FEATURES}
              name="연간"
              onCtaClick={startGoogleOAuth}
              period="1년"
              variant="featured"
            />
          </div>
          <p className="landing-plan-note tabular-nums">
            연간 결제는 월간 결제 {MONTHS_PER_YEAR}개월보다{" "}
            {formatCurrency(savings)} 저렴합니다. 결제는 로그인한 뒤
            대시보드에서 진행합니다.
          </p>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="landing-wordmark">finsight</span>
        <p className="landing-footer__note">
          CSV 거래내역을 올려 쓰는 개인 가계부입니다. 계좌를 연동하지 않습니다.
        </p>
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MarketingContent />
    </Suspense>
  );
}
