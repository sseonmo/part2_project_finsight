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
    created_at: string;
    inserted_count: number;
    duplicate_count: number;
    skipped_rows: number;
    uncategorized_count: number;
    card_label_mismatch_warning: string | null;
  } | null,
  profile: {
    subscription_status: "trialing" | "active" | "canceled";
    trial_started_at: string | null;
    current_period_end: string | null;
  } | null = {
    subscription_status: "active",
    trial_started_at: "2026-08-17T00:00:00.000Z",
    current_period_end: null,
  },
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
  const profileSingle = vi.fn().mockResolvedValue({
    data: profile,
    error: profile ? null : {},
  });
  const profileEqUser = vi.fn(() => ({ single: profileSingle }));
  const profileSelect = vi.fn(() => ({ eq: profileEqUser }));
  const from = vi.fn((table: string) =>
    table === "profiles"
      ? { select: profileSelect }
      : { select, delete: deleteFn },
  );

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

  return { eqId, eqUser, deleteEqId, deleteEqUser, profileEqUser, remove };
}

const OWNED_JOB = {
  id: "job-1",
  user_id: "user-1",
  storage_key: "user-1/job-1/server.csv",
  status: "completed",
  created_at: "2026-08-31T10:00:00.000Z",
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

  it("exposes when the job started so the card can count elapsed time", async () => {
    // 경과 시간을 클라이언트 마운트 기준으로 세면 처리 중에 새로고침한 사용자에게
    // "0초 경과"가 뜬다. 기준점은 서버가 가진 created_at 이어야 한다.
    createSupabaseMock(OWNED_JOB);
    const { GET } = await import("./route");

    const response = await GET(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    const body = await response.json();

    expect(body.createdAt).toBe("2026-08-31T10:00:00.000Z");
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

  it("rejects DELETE for expired users before deleting the job", async () => {
    const supabase = createSupabaseMock(OWNED_JOB, {
      subscription_status: "trialing",
      trial_started_at: "2026-08-01T00:00:00.000Z",
      current_period_end: null,
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("https://finsight.test"), {
      params: Promise.resolve({ id: "job-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: "체험 또는 구독이 만료되어 업로드를 삭제할 수 없습니다.",
    });
    expect(supabase.profileEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(supabase.deleteEqId).not.toHaveBeenCalled();
    expect(supabase.remove).not.toHaveBeenCalled();
  });
});
