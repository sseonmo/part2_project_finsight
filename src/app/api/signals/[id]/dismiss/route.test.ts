import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function createSupabaseMock(input: {
  signal: { id: string } | null;
  profile?: {
    subscription_status: "trialing" | "active" | "canceled";
    trial_started_at: string | null;
    current_period_end: string | null;
  };
}) {
  const profile = input.profile ?? {
    subscription_status: "active",
    trial_started_at: "2026-08-17T00:00:00.000Z",
    current_period_end: null,
  };
  const signalSingle = vi
    .fn()
    .mockResolvedValue({ data: input.signal, error: input.signal ? null : {} });
  const signalEqUser = vi.fn(() => ({ single: signalSingle }));
  const signalEqId = vi.fn(() => ({ eq: signalEqUser }));
  const signalSelect = vi.fn(() => ({ eq: signalEqId }));
  const updateEqUser = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({
        data: input.signal,
        error: input.signal ? null : {},
      }),
    })),
  }));
  const updateEqId = vi.fn(() => ({ eq: updateEqUser }));
  const update = vi.fn(() => ({ eq: updateEqId }));
  const profileSingle = vi
    .fn()
    .mockResolvedValue({ data: profile, error: null });
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: profileSingle,
          })),
        })),
      };
    }

    return {
      select: signalSelect,
      update,
    };
  });

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
  });

  return { signalEqId, signalEqUser, update };
}

describe("POST /api/signals/[id]/dismiss", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects signal ids that do not belong to the current user", async () => {
    const supabase = createSupabaseMock({ signal: null });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "signal-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.signalEqId).toHaveBeenCalledWith("id", "signal-other");
    expect(supabase.signalEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("rejects expired users before writing dismissed_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    const supabase = createSupabaseMock({
      signal: { id: "signal-1" },
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-01T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "signal-1" }),
    });

    expect(response.status).toBe(403);
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("dismisses an owned signal for a writable user", async () => {
    const supabase = createSupabaseMock({ signal: { id: "signal-1" } });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "signal-1" }),
    });

    expect(response.status).toBe(200);
    expect(supabase.update).toHaveBeenCalledWith({
      dismissed_at: expect.any(String),
    });
  });
});
