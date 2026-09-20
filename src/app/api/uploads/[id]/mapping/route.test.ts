import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/services/supabase-service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: inngestSendMock,
  },
}));

function mappingRequest(body: unknown): Request {
  return new Request("https://finsight.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(
  job: {
    id: string;
    status: string;
    mapping_attempt_count: number;
  } | null,
) {
  const updatePayloads: unknown[] = [];
  const update = vi.fn().mockImplementation((payload: unknown) => {
    updatePayloads.push(payload);

    return {
      eq: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: job ? { ...job, ...(payload as object) } : null,
                error: job ? null : {},
              }),
          }),
        }),
      }),
    };
  });
  const single = vi.fn().mockResolvedValue({ data: job, error: job ? null : {} });
  const eqUser = vi.fn(() => ({ single }));
  const eqId = vi.fn(() => ({ eq: eqUser }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select }));

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from,
  });

  // upload_jobs 의 상태·시도 횟수는 service role 로만 쓴다. 사용자 자격증명으로
  // 쓸 수 있으면 mapping_attempt_count 를 0 으로 되돌려 3회 상한을 무력화하고
  // 분류 LLM 을 반복 재실행시킬 수 있다.
  const serviceFrom = vi.fn(() => ({ update }));

  createServiceRoleClientMock.mockReturnValue({ from: serviceFrom });

  return { eqId, eqUser, updatePayloads, serviceFrom };
}

const VALID_MAPPING = {
  date: "승인일",
  amount: "금액",
  merchant: "가맹점명",
  type: "상태",
};

describe("POST /api/uploads/[id]/mapping", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects job ids not owned by the current user", async () => {
    const supabase = createSupabaseMock(null);
    const { POST } = await import("./route");

    const response = await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-other" }),
    });

    expect(response.status).toBe(404);
    expect(supabase.eqId).toHaveBeenCalledWith("id", "job-other");
    expect(supabase.eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("only accepts jobs that are waiting for manual mapping", async () => {
    createSupabaseMock({
      id: "job-1",
      status: "parsing",
      mapping_attempt_count: 0,
    });
    const { POST } = await import("./route");

    const response = await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(409);
    expect(inngestSendMock).not.toHaveBeenCalled();
  });

  it("stores the manual mapping attempt and resumes the worker from mapping confirmation", async () => {
    const supabase = createSupabaseMock({
      id: "job-1",
      status: "needs_mapping",
      mapping_attempt_count: 1,
    });
    inngestSendMock.mockResolvedValue({});
    const { POST } = await import("./route");

    const response = await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(202);
    expect(supabase.updatePayloads[0]).toMatchObject({
      status: "parsing",
      mapping_attempt_count: 2,
      mapping: VALID_MAPPING,
    });
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "csv.mapping_confirmed",
      data: {
        uploadId: "job-1",
        userId: "user-1",
        mapping: VALID_MAPPING,
      },
    });
  });

  it("writes the state transition with the service role, not the caller's credentials", async () => {
    const supabase = createSupabaseMock({
      id: "job-1",
      status: "needs_mapping",
      mapping_attempt_count: 1,
    });
    inngestSendMock.mockResolvedValue({});
    const { POST } = await import("./route");

    await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(createServiceRoleClientMock).toHaveBeenCalled();
    expect(supabase.serviceFrom).toHaveBeenCalledWith("upload_jobs");
  });

  it("rolls the job back to needs_mapping when the event cannot be sent", async () => {
    const supabase = createSupabaseMock({
      id: "job-1",
      status: "needs_mapping",
      mapping_attempt_count: 1,
    });
    inngestSendMock.mockRejectedValue(new Error("inngest down"));
    const { POST } = await import("./route");

    const response = await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(500);
    expect(supabase.updatePayloads.at(-1)).toMatchObject({
      status: "needs_mapping",
      failed_reason: "수동 매핑 처리를 시작하지 못했습니다.",
    });
  });

  it("fails the job once the manual mapping attempt cap has been reached", async () => {
    const supabase = createSupabaseMock({
      id: "job-1",
      status: "needs_mapping",
      mapping_attempt_count: 3,
    });
    const { POST } = await import("./route");

    const response = await POST(mappingRequest({ mapping: VALID_MAPPING }), {
      params: Promise.resolve({ id: "job-1" }),
    });

    expect(response.status).toBe(422);
    expect(supabase.updatePayloads[0]).toMatchObject({
      status: "failed",
      failed_reason: "이 파일은 읽을 수 없습니다.",
    });
    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});
