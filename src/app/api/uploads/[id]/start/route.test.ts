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

function createSupabaseMock(job: { id: string; status: string } | null) {
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
  const from = vi.fn(() => ({ select, update }));

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
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects job ids that do not belong to the current user", async () => {
    const supabase = createSupabaseMock(null);
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.eqId).toHaveBeenCalledWith("id", "job-other");
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("emits the upload event for a pending owned job", async () => {
    createSupabaseMock({ id: "job-1", status: "pending" });
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
    createSupabaseMock({ id: "job-1", status: "categorizing" });
    const { POST } = await import("./route");

    const response = await POST(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
