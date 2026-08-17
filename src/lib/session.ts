import "server-only";

import { cache } from "react";

import {
  evaluateEntitlement,
  type Entitlement,
  type SubscriptionStatus,
} from "@/lib/entitlement";
import { createServerClient } from "@/services/supabase";

export type SessionContext = {
  userId: string;
  email: string | null;
  entitlement: Entitlement;
};

type ProfileEntitlementFields = {
  subscription_status: SubscriptionStatus;
  trial_started_at: string | null;
  current_period_end: string | null;
};

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

export const getSessionContext: () => Promise<SessionContext | null> = cache(
  async () => {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, trial_started_at, current_period_end")
      .eq("user_id", user.id)
      .single<ProfileEntitlementFields>();

    if (!profile) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email ?? null,
      entitlement: evaluateEntitlement({
        subscriptionStatus: profile.subscription_status,
        trialStartedAt: parseDate(profile.trial_started_at),
        currentPeriodEnd: parseDate(profile.current_period_end),
        now: new Date(),
      }),
    };
  },
);
