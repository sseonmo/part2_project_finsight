import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createCheckoutSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/polar", () => ({
  createCheckoutSession: createCheckoutSessionMock,
}));

function jsonRequest(body: unknown): Request {
  return new Request("https://finsight.test/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSession(input?: {
  email?: string | null;
  entitlementState?: "trialing" | "active" | "expired";
}) {
  getSessionContextMock.mockResolvedValue({
    email: input?.email ?? "user@example.com",
    entitlement: {
      canRead: true,
      canWrite: input?.entitlementState !== "expired",
      state: input?.entitlementState ?? "trialing",
      trialEndsAt: new Date("2026-08-24T00:00:00.000Z"),
    },
    userId: "session-user",
  });
}

describe("POST /api/billing/checkout", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated users", async () => {
    getSessionContextMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ plan: "monthly" }));

    expect(response.status).toBe(401);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("rejects invalid plans before creating checkout", async () => {
    mockSession();
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ plan: "weekly" }));

    expect(response.status).toBe(400);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("passes the server session user id to the checkout service for metadata", async () => {
    mockSession({ email: "billing@example.com" });
    createCheckoutSessionMock.mockResolvedValue({
      checkoutUrl: "https://polar.test/checkout/session",
    });
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ plan: "yearly" }));
    const body = (await response.json()) as { checkoutUrl: string };

    expect(response.status).toBe(200);
    expect(body.checkoutUrl).toBe("https://polar.test/checkout/session");
    expect(createCheckoutSessionMock).toHaveBeenCalledWith({
      customerEmail: "billing@example.com",
      plan: "yearly",
      successUrl: "https://finsight.test/dashboard/billing?checkout=success",
      userId: "session-user",
    });
  });

  it("ignores userId and successUrl from the request body", async () => {
    mockSession();
    createCheckoutSessionMock.mockResolvedValue({
      checkoutUrl: "https://polar.test/checkout/session",
    });
    const { POST } = await import("./route");

    await POST(
      jsonRequest({
        plan: "monthly",
        successUrl: "https://evil.test/phish",
        userId: "attacker-user",
      }),
    );

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: "https://finsight.test/dashboard/billing?checkout=success",
        userId: "session-user",
      }),
    );
  });

  it("does not create a new checkout for users already entitled as active", async () => {
    mockSession({ entitlementState: "active" });
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ plan: "monthly" }));

    expect(response.status).toBe(409);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
