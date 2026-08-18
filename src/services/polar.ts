import "server-only";

import { Polar } from "@polar-sh/sdk";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";

export type CheckoutPlan = "monthly" | "yearly";

type PolarServer = "sandbox" | "production";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to call Polar.`);
  }

  return value;
}

function getPolarServer(): PolarServer {
  const value = getRequiredEnv("POLAR_SERVER");

  if (value !== "sandbox" && value !== "production") {
    throw new Error("POLAR_SERVER must be either sandbox or production.");
  }

  return value;
}

function createPolarClient(): Polar {
  return new Polar({
    accessToken: getRequiredEnv("POLAR_ACCESS_TOKEN"),
    server: getPolarServer(),
  });
}

function productIdForPlan(plan: CheckoutPlan): string {
  return plan === "monthly"
    ? getRequiredEnv("POLAR_PRODUCT_ID_MONTHLY")
    : getRequiredEnv("POLAR_PRODUCT_ID_YEARLY");
}

export async function createCheckoutSession(input: {
  plan: CheckoutPlan;
  userId: string;
  customerEmail: string | null;
  successUrl: string;
}): Promise<{ checkoutUrl: string }> {
  const checkout = await createPolarClient().checkouts.create({
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    metadata: { user_id: input.userId },
    products: [productIdForPlan(input.plan)],
    successUrl: input.successUrl,
  });

  return { checkoutUrl: checkout.url };
}

export async function createCustomerPortalSession(input: {
  polarCustomerId: string;
}): Promise<{ portalUrl: string }> {
  const session = await createPolarClient().customerSessions.create({
    customerId: input.polarCustomerId,
  });

  return { portalUrl: session.customerPortalUrl };
}

export type PolarWebhookEvent = ReturnType<typeof validateEvent>;

export type PolarWebhookVerification =
  | { status: "verified"; event: PolarWebhookEvent }
  | { status: "invalid_signature" }
  | { status: "unsupported" };

export function verifyPolarWebhook(input: {
  rawBody: string;
  headers: Record<string, string>;
}): PolarWebhookVerification {
  const secret = getRequiredEnv("POLAR_WEBHOOK_SECRET");

  try {
    return {
      status: "verified",
      event: validateEvent(input.rawBody, input.headers, secret),
    };
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return { status: "invalid_signature" };
    }

    return { status: "unsupported" };
  }
}
