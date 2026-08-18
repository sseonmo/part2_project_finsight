export type SubscriptionStatus = "trialing" | "active" | "canceled";

export type EntitlementInput = {
  subscriptionStatus: SubscriptionStatus;
  trialStartedAt: Date | null;
  currentPeriodEnd: Date | null;
  now: Date;
};

export type Entitlement = {
  state: "trialing" | "active" | "expired";
  canRead: boolean;
  canWrite: boolean;
  trialEndsAt: Date | null;
};

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function addTrialDuration(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TRIAL_DURATION_MS);
}

function entitlement(
  state: Entitlement["state"],
  canWrite: boolean,
  trialEndsAt: Date | null,
): Entitlement {
  return {
    state,
    canRead: true,
    canWrite,
    trialEndsAt,
  };
}

export function evaluateEntitlement(input: EntitlementInput): Entitlement {
  switch (input.subscriptionStatus) {
    case "trialing": {
      if (!input.trialStartedAt) {
        return entitlement("expired", false, null);
      }

      const trialEndsAt = addTrialDuration(input.trialStartedAt);

      return trialEndsAt.getTime() > input.now.getTime()
        ? entitlement("trialing", true, trialEndsAt)
        : entitlement("expired", false, trialEndsAt);
    }
    case "active":
      return entitlement("active", true, null);
    case "canceled":
      return input.currentPeriodEnd &&
        input.currentPeriodEnd.getTime() > input.now.getTime()
        ? entitlement("active", true, null)
        : entitlement("expired", false, null);
  }
}

export type SubscriptionSummary =
  | { kind: "trialing"; endsAt: Date }
  | { kind: "subscribed"; renewsAt: Date | null }
  | { kind: "canceled"; accessEndsAt: Date }
  | { kind: "expired" };

// 화면 문구를 위해 "구독 중"과 "해지했지만 기간이 남음"을 나눈다.
// entitlement.state 는 둘 다 active 라 구분이 없고, 상태 문자열 비교는 이 파일 밖으로 나가지 않는다.
export function summarizeSubscription(
  input: EntitlementInput,
): SubscriptionSummary {
  const { state, trialEndsAt } = evaluateEntitlement(input);

  if (state === "expired") {
    return { kind: "expired" };
  }

  if (state === "trialing" && trialEndsAt) {
    return { kind: "trialing", endsAt: trialEndsAt };
  }

  if (input.subscriptionStatus === "canceled" && input.currentPeriodEnd) {
    return { kind: "canceled", accessEndsAt: input.currentPeriodEnd };
  }

  return { kind: "subscribed", renewsAt: input.currentPeriodEnd };
}
