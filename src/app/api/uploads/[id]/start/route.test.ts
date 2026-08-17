import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: inngestSendMock,
  },
}));

function createSupabaseMock(input: {
  job: { id: string; status: string } | null;
  profile?: {
    subscription_status: "trialing" | "active" | "canceled";
    trial_started_at: string | null;
    current_period_end: string | null;
  };
}) {
  const { job } = input;
  const profile = input.profile ?? {
    subscription_status: "active",
    trial_started_at: "2026-08-17T00:00:00.000Z",
    current_period_end: null,
  };
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: job, error: null }),
        })),
      })),
    })),
  }));
  const single = vi.fn().mockResolvedValue({ data: job, error: job ? null : {} });
  const eqUser = vi.fn(() => ({ single }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));
  const profileSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
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

    return { select, update };
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

  return { eqId, eqUser, update };
}

describe("POST /api/uploads/[id]/start", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects job ids that do not belong to the current user", async () => {
    const supabase = createSupabaseMock({ job: null });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.eqId).toHaveBeenCalledWith("id", "job-other");
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("rejects expired users before starting an owned pending job", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    const supabase = createSupabaseMock({
      job: { id: "job-1", status: "pending" },
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-01T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(403);
    expect(supabase.update).not.toHaveBeenCalled();
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("emits the upload event for a pending owned job", async () => {
    createSupabaseMock({ job: { id: "job-1", status: "pending" } });
    inngestSendMock.mockResolvedValue({});
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(202);
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "csv.upload_requested",
      data: { uploadId: "job-1", userId: "user-1" },
    });
  });

  it("does not re-kick jobs that are already in progress", async () => {
    createSupabaseMock({ job: { id: "job-1", status: "categorizing" } });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
