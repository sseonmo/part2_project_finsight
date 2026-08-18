import { afterEach, describe, expect, it, vi } from "vitest";

const checkoutsCreateMock = vi.hoisted(() => vi.fn());
const customerSessionsCreateMock = vi.hoisted(() => vi.fn());
const validateEventMock = vi.hoisted(() => vi.fn());
const WebhookVerificationErrorMock = vi.hoisted(
  () =>
    class WebhookVerificationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "WebhookVerificationError";
      }
    },
);
const polarConstructorMock = vi.hoisted(() =>
  vi.fn(() => ({
    checkouts: {
      create: checkoutsCreateMock,
    },
    customerSessions: {
      create: customerSessionsCreateMock,
    },
  })),
);

vi.mock("@polar-sh/sdk", () => ({
  Polar: polarConstructorMock,
}));

vi.mock("@polar-sh/sdk/webhooks", () => ({
  validateEvent: validateEventMock,
  WebhookVerificationError: WebhookVerificationErrorMock,
}));

vi.mock("server-only", () => ({}));

import {
  createCheckoutSession,
  createCustomerPortalSession,
  verifyPolarWebhook,
} from "./polar";

function stubPolarEnv() {
  vi.stubEnv("POLAR_ACCESS_TOKEN", "polar-token");
  vi.stubEnv("POLAR_PRODUCT_ID_MONTHLY", "product-monthly");
  vi.stubEnv("POLAR_PRODUCT_ID_YEARLY", "product-yearly");
  vi.stubEnv("POLAR_SERVER", "sandbox");
}

describe("Polar service wrapper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("creates checkout sessions with the selected product and user_id metadata", async () => {
    stubPolarEnv();
    checkoutsCreateMock.mockResolvedValue({
      url: "https://polar.test/checkout/session",
    });

    await expect(
      createCheckoutSession({
        customerEmail: "user@example.com",
        plan: "yearly",
        successUrl: "https://finsight.test/dashboard/billing?checkout=success",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      checkoutUrl: "https://polar.test/checkout/session",
    });

    expect(polarConstructorMock).toHaveBeenCalledWith({
      accessToken: "polar-token",
      server: "sandbox",
    });
    expect(checkoutsCreateMock).toHaveBeenCalledWith({
      customerEmail: "user@example.com",
      metadata: { user_id: "user-1" },
      products: ["product-yearly"],
      successUrl: "https://finsight.test/dashboard/billing?checkout=success",
    });
  });

  it("omits customerEmail when the session has no email", async () => {
    stubPolarEnv();
    checkoutsCreateMock.mockResolvedValue({
      url: "https://polar.test/checkout/session",
    });

    await createCheckoutSession({
      customerEmail: null,
      plan: "monthly",
      successUrl: "https://finsight.test/dashboard/billing?checkout=success",
      userId: "user-1",
    });

    expect(checkoutsCreateMock).toHaveBeenCalledWith({
      metadata: { user_id: "user-1" },
      products: ["product-monthly"],
      successUrl: "https://finsight.test/dashboard/billing?checkout=success",
    });
  });

  it("creates customer portal sessions from the stored Polar customer id", async () => {
    stubPolarEnv();
    customerSessionsCreateMock.mockResolvedValue({
      customerPortalUrl: "https://polar.test/customer-portal/session",
    });

    await expect(
      createCustomerPortalSession({ polarCustomerId: "cus_123" }),
    ).resolves.toEqual({
      portalUrl: "https://polar.test/customer-portal/session",
    });

    expect(customerSessionsCreateMock).toHaveBeenCalledWith({
      customerId: "cus_123",
    });
  });
});

describe("Polar webhook verification", () => {
  const rawBody = '{"type":"subscription.active"}';
  const headers = {
    "webhook-id": "evt_1",
    "webhook-signature": "v1,signature",
    "webhook-timestamp": "1786000000",
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns the parsed event for a valid signature", () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
    const event = { type: "subscription.active" };
    validateEventMock.mockReturnValue(event);

    expect(verifyPolarWebhook({ headers, rawBody })).toEqual({
      status: "verified",
      event,
    });
    expect(validateEventMock).toHaveBeenCalledWith(
      rawBody,
      headers,
      "whsec_test",
    );
  });

  it("reports an invalid signature instead of throwing", () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
    validateEventMock.mockImplementation(() => {
      throw new WebhookVerificationErrorMock("No matching signature found");
    });

    expect(verifyPolarWebhook({ headers, rawBody })).toEqual({
      status: "invalid_signature",
    });
  });

  it("reports payloads the SDK cannot parse as unsupported", () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "whsec_test");
    validateEventMock.mockImplementation(() => {
      throw new Error("Unknown event type: something.new");
    });

    expect(verifyPolarWebhook({ headers, rawBody })).toEqual({
      status: "unsupported",
    });
  });

  it("requires POLAR_WEBHOOK_SECRET", () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "");

    expect(() => verifyPolarWebhook({ headers, rawBody })).toThrow(
      /POLAR_WEBHOOK_SECRET/,
    );
  });
});
