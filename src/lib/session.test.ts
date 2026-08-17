import { afterEach, describe, expect, it, vi } from "vitest";

const cacheMock = vi.hoisted(() =>
  vi.fn(<Args extends unknown[], Result>(fn: (...args: Args) => Result) => {
    let cached = false;
    let value: Result;

    return (...args: Args) => {
      if (!cached) {
        cached = true;
        value = fn(...args);
      }

      return value;
    };
  }),
);
const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("react", () => ({
  cache: cacheMock,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function mockSupabaseClient({
  profile,
  user,
}: {
  profile:
    | {
        subscription_status: "trialing" | "active" | "canceled";
        trial_started_at: string | null;
        current_period_end: string | null;
      }
    | null;
  user: { id: string; email?: string | null } | null;
}) {
  const single = vi.fn().mockResolvedValue({ data: profile, error: null });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn().mockResolvedValue({
    data: { user },
    error: null,
  });

  createServerClientMock.mockResolvedValue({
    auth: { getUser },
    from,
  });

  return { eq, from, getUser, select, single };
}

describe("getSessionContext", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("is exported through React cache", async () => {
    mockSupabaseClient({
      user: null,
      profile: null,
    });

    await import("./session");

    expect(cacheMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no authenticated user", async () => {
    const client = mockSupabaseClient({
      user: null,
      profile: null,
    });
    const { getSessionContext } = await import("./session");

    await expect(getSessionContext()).resolves.toBeNull();

    expect(client.getUser).toHaveBeenCalledTimes(1);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("returns null when the authenticated user has no profile", async () => {
    const client = mockSupabaseClient({
      user: { id: "user-1", email: "user@example.com" },
      profile: null,
    });
    const { getSessionContext } = await import("./session");

    await expect(getSessionContext()).resolves.toBeNull();

    expect(client.from).toHaveBeenCalledWith("profiles");
    expect(client.select).toHaveBeenCalledWith(
      "subscription_status, trial_started_at, current_period_end",
    );
    expect(client.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("evaluates entitlement from the profile without direct status gating", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    mockSupabaseClient({
      user: { id: "user-1", email: "user@example.com" },
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-16T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { getSessionContext } = await import("./session");

    await expect(getSessionContext()).resolves.toEqual({
      userId: "user-1",
      email: "user@example.com",
      entitlement: {
        state: "trialing",
        canRead: true,
        canWrite: true,
        trialEndsAt: new Date("2026-08-23T00:00:00.000Z"),
      },
    });
  });

  it("caches Supabase reads within a request", async () => {
    const client = mockSupabaseClient({
      user: { id: "user-1", email: null },
      profile: {
        subscription_status: "active",
        trial_started_at: "2026-08-10T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { getSessionContext } = await import("./session");

    const first = await getSessionContext();
    const second = await getSessionContext();

    expect(second).toBe(first);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(client.getUser).toHaveBeenCalledTimes(1);
    expect(client.single).toHaveBeenCalledTimes(1);
  });
});
