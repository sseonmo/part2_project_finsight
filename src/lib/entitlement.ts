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
