import { afterEach, describe, expect, it, vi } from "vitest";

const checkoutsCreateMock = vi.hoisted(() => vi.fn());
const customerSessionsCreateMock = vi.hoisted(() => vi.fn());
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

vi.mock("server-only", () => ({}));

import {
  createCheckoutSession,
  createCustomerPortalSession,
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
