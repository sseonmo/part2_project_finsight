import { describe, expect, it } from "vitest";

import {
  evaluateEntitlement,
  summarizeSubscription,
  type EntitlementInput,
} from "./entitlement";

const NOW = new Date("2026-08-17T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

type MatrixCase = {
  label: string;
  input: EntitlementInput;
  expected: {
    state: "trialing" | "active" | "expired";
    dashboardRead: boolean;
    newUpload: boolean;
    reportGeneration: boolean;
    categoryEdit: boolean;
    existingReportRead: boolean;
    subscriptionsRead: boolean;
  };
};

describe("evaluateEntitlement", () => {
  const matrixCases: MatrixCase[] = [
    {
      label: "trialing within 7 days",
      input: {
        subscriptionStatus: "trialing",
        trialStartedAt: new Date(NOW.getTime() - DAY_MS),
        currentPeriodEnd: null,
        now: NOW,
      },
      expected: {
        state: "trialing",
        dashboardRead: true,
        newUpload: true,
        reportGeneration: true,
        categoryEdit: true,
        existingReportRead: true,
        subscriptionsRead: true,
      },
    },
    {
      label: "active subscription",
      input: {
        subscriptionStatus: "active",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd: null,
        now: NOW,
      },
      expected: {
        state: "active",
        dashboardRead: true,
        newUpload: true,
        reportGeneration: true,
        categoryEdit: true,
        existingReportRead: true,
        subscriptionsRead: true,
      },
    },
    {
      label: "canceled but still in paid period",
      input: {
        subscriptionStatus: "canceled",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd: new Date(NOW.getTime() + DAY_MS),
        now: NOW,
      },
      expected: {
        state: "active",
        dashboardRead: true,
        newUpload: true,
        reportGeneration: true,
        categoryEdit: true,
        existingReportRead: true,
        subscriptionsRead: true,
      },
    },
    {
      label: "expired trial",
      input: {
        subscriptionStatus: "trialing",
        trialStartedAt: new Date(NOW.getTime() - 8 * DAY_MS),
        currentPeriodEnd: null,
        now: NOW,
      },
      expected: {
        state: "expired",
        dashboardRead: true,
        newUpload: false,
        reportGeneration: false,
        categoryEdit: false,
        existingReportRead: true,
        subscriptionsRead: true,
      },
    },
  ];

  it.each(matrixCases)("matches the USER_FLOW permission matrix: $label", ({ input, expected }) => {
    const entitlement = evaluateEntitlement(input);

    expect({
      state: entitlement.state,
      dashboardRead: entitlement.canRead,
      newUpload: entitlement.canWrite,
      reportGeneration: entitlement.canWrite,
      categoryEdit: entitlement.canWrite,
      existingReportRead: entitlement.canRead,
      subscriptionsRead: entitlement.canRead,
    }).toEqual(expected);
  });

  it("keeps reads open even after a canceled paid period expires", () => {
    const entitlement = evaluateEntitlement({
      subscriptionStatus: "canceled",
      trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
      currentPeriodEnd: new Date(NOW.getTime() - 1),
      now: NOW,
    });

    expect(entitlement).toMatchObject({
      state: "expired",
      canRead: true,
      canWrite: false,
      trialEndsAt: null,
    });
  });

  it("allows trial writes immediately before the 7-day boundary", () => {
    const trialStartedAt = new Date(NOW.getTime() - 7 * DAY_MS + 1);

    expect(
      evaluateEntitlement({
        subscriptionStatus: "trialing",
        trialStartedAt,
        currentPeriodEnd: null,
        now: NOW,
      }),
    ).toMatchObject({
      state: "trialing",
      canRead: true,
      canWrite: true,
      trialEndsAt: new Date(trialStartedAt.getTime() + 7 * DAY_MS),
    });
  });

  it("expires trial writes at and after the 7-day boundary", () => {
    const atBoundary = evaluateEntitlement({
      subscriptionStatus: "trialing",
      trialStartedAt: new Date(NOW.getTime() - 7 * DAY_MS),
      currentPeriodEnd: null,
      now: NOW,
    });
    const afterBoundary = evaluateEntitlement({
      subscriptionStatus: "trialing",
      trialStartedAt: new Date(NOW.getTime() - 7 * DAY_MS - 1),
      currentPeriodEnd: null,
      now: NOW,
    });

    expect(atBoundary).toMatchObject({
      state: "expired",
      canRead: true,
      canWrite: false,
    });
    expect(afterBoundary).toMatchObject({
      state: "expired",
      canRead: true,
      canWrite: false,
    });
  });

  it("allows canceled subscriptions immediately before current_period_end", () => {
    expect(
      evaluateEntitlement({
        subscriptionStatus: "canceled",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd: new Date(NOW.getTime() + 1),
        now: NOW,
      }),
    ).toMatchObject({
      state: "active",
      canRead: true,
      canWrite: true,
    });
  });

  it("expires canceled subscriptions at and after current_period_end", () => {
    const atBoundary = evaluateEntitlement({
      subscriptionStatus: "canceled",
      trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
      currentPeriodEnd: NOW,
      now: NOW,
    });
    const afterBoundary = evaluateEntitlement({
      subscriptionStatus: "canceled",
      trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
      currentPeriodEnd: new Date(NOW.getTime() - 1),
      now: NOW,
    });

    expect(atBoundary).toMatchObject({
      state: "expired",
      canRead: true,
      canWrite: false,
    });
    expect(afterBoundary).toMatchObject({
      state: "expired",
      canRead: true,
      canWrite: false,
    });
  });

  it("defensively expires a trialing profile without trial_started_at", () => {
    expect(
      evaluateEntitlement({
        subscriptionStatus: "trialing",
        trialStartedAt: null,
        currentPeriodEnd: null,
        now: NOW,
      }),
    ).toEqual({
      state: "expired",
      canRead: true,
      canWrite: false,
      trialEndsAt: null,
    });
  });
});

describe("summarizeSubscription", () => {
  it("reports the trial end date while the trial is running", () => {
    const trialStartedAt = new Date(NOW.getTime() - DAY_MS);

    expect(
      summarizeSubscription({
        subscriptionStatus: "trialing",
        trialStartedAt,
        currentPeriodEnd: null,
        now: NOW,
      }),
    ).toEqual({
      kind: "trialing",
      endsAt: new Date(trialStartedAt.getTime() + 7 * DAY_MS),
    });
  });

  it("reports the next billing date for an active subscription", () => {
    const currentPeriodEnd = new Date(NOW.getTime() + 12 * DAY_MS);

    expect(
      summarizeSubscription({
        subscriptionStatus: "active",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd,
        now: NOW,
      }),
    ).toEqual({ kind: "subscribed", renewsAt: currentPeriodEnd });
  });

  it("separates a canceled-but-still-paid period from an active subscription", () => {
    const currentPeriodEnd = new Date(NOW.getTime() + DAY_MS);

    expect(
      summarizeSubscription({
        subscriptionStatus: "canceled",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd,
        now: NOW,
      }),
    ).toEqual({ kind: "canceled", accessEndsAt: currentPeriodEnd });
  });

  it("reports expiry once the canceled period is over", () => {
    expect(
      summarizeSubscription({
        subscriptionStatus: "canceled",
        trialStartedAt: new Date(NOW.getTime() - 20 * DAY_MS),
        currentPeriodEnd: new Date(NOW.getTime() - 1),
        now: NOW,
      }),
    ).toEqual({ kind: "expired" });
  });

  it("reports expiry once the trial is over", () => {
    expect(
      summarizeSubscription({
        subscriptionStatus: "trialing",
        trialStartedAt: new Date(NOW.getTime() - 8 * DAY_MS),
        currentPeriodEnd: null,
        now: NOW,
      }),
    ).toEqual({ kind: "expired" });
  });
});
