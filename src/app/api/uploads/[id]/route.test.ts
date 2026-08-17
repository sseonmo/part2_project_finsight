import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function createSupabaseMock(
  job: {
    id: string;
    user_id: string;
    storage_key: string;
    status: string;
    inserted_count: number;
    duplicate_count: number;
    skipped_rows: number;
    uncategorized_count: number;
    card_label_mismatch_warning: string | null;
  } | null,
) {
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const deleteEqUser = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: job, error: null }),
    })),
  }));
  const deleteEqId = vi.fn(() => ({ eq: deleteEqUser }));
  const deleteFn = vi.fn(() => ({ eq: deleteEqId }));
  const single = vi.fn().mockResolvedValue({ data: job, error: job ? null : {} });
  const eqUser = vi.fn(() => ({ single }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select, delete: deleteFn }));

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
    storage: {
      from: vi.fn(() => ({ remove })),
    },
  });

  return { eqId, eqUser, deleteEqId, deleteEqUser, remove };
}

const OWNED_JOB = {
  id: "job-1",
  user_id: "user-1",
  storage_key: "user-1/job-1/server.csv",
  status: "completed",
  inserted_count: 0,
  duplicate_count: 10,
  skipped_rows: 2,
  uncategorized_count: 1,
  card_label_mismatch_warning: "카드 형식이 다릅니다.",
};

describe("/api/uploads/[id]", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects GET for job ids not owned by the current user", async () => {
    const supabase = createSupabaseMock(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.eqId).toHaveBeenCalledWith("id", "job-other");
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns polling-safe status and completion summary fields", async () => {
    createSupabaseMock(OWNED_JOB);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: "job-1",
      status: "completed",
      summary: {
        insertedCount: 0,
        duplicateCount: 10,
        skippedRows: 2,
        uncategorizedCount: 1,
      },
      cardLabelMismatchWarning: "카드 형식이 다릅니다.",
    });
  });

  it("rejects DELETE for job ids not owned by the current user", async () => {
    const supabase = createSupabaseMock(null);
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.remove).not.toHaveBeenCalled();
  });

  it("deletes both the database job and the original Storage object", async () => {
    const supabase = createSupabaseMock(OWNED_JOB);
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(204);
    expect(supabase.deleteEqId).toHaveBeenCalledWith("id", "job-1");
    expect(supabase.deleteEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.remove).toHaveBeenCalledWith(["user-1/job-1/server.csv"]);
  });
});
