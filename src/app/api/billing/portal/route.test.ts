import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const createCustomerPortalSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/services/polar", () => ({
  createCustomerPortalSession: createCustomerPortalSessionMock,
}));

function mockSession(userId = "session-user") {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: {
      canRead: true,
      canWrite: true,
      state: "active",
      trialEndsAt: null,
    },
    userId,
  });
}

function mockProfile(profile: { polar_customer_id: string | null } | null) {
  const single = vi.fn().mockResolvedValue({
    data: profile,
    error: profile ? null : { message: "not found" },
  });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  createServerClientMock.mockResolvedValue({ from });

  return { eq, from, select, single };
}

describe("POST /api/billing/portal", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated users", async () => {
    getSessionContextMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST();

    expect(response.status).toBe(401);
    expect(createCustomerPortalSessionMock).not.toHaveBeenCalled();
  });

  it("sends users who never paid to the pricing screen", async () => {
    mockSession();
    mockProfile({ polar_customer_id: null });
    const { POST } = await import("./route");

    const response = await POST();
    const body = (await response.json()) as { redirectTo?: string };

    expect(response.status).toBe(409);
    expect(body.redirectTo).toBe("/dashboard/billing");
    expect(createCustomerPortalSessionMock).not.toHaveBeenCalled();
  });

  it("opens the Polar portal for the session user's customer id", async () => {
    mockSession("user-1");
    const client = mockProfile({ polar_customer_id: "polar-customer-1" });
    createCustomerPortalSessionMock.mockResolvedValue({
      portalUrl: "https://polar.test/portal/session",
    });
    const { POST } = await import("./route");

    const response = await POST();
    const body = (await response.json()) as { portalUrl: string };

    expect(response.status).toBe(200);
    expect(body.portalUrl).toBe("https://polar.test/portal/session");
    expect(client.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(createCustomerPortalSessionMock).toHaveBeenCalledWith({
      polarCustomerId: "polar-customer-1",
    });
  });

  it("never writes the subscription status itself", async () => {
    mockSession();
    const client = mockProfile({ polar_customer_id: "polar-customer-1" });
    createCustomerPortalSessionMock.mockResolvedValue({
      portalUrl: "https://polar.test/portal/session",
    });
    const { POST } = await import("./route");

    await POST();

    // 해지는 Polar 포털에서 일어나고 결과는 서명 검증을 통과한 웹훅으로만 돌아온다.
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.select).toHaveBeenCalledWith("polar_customer_id");
  });
});
