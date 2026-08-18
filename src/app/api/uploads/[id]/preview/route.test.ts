import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/services/supabase-service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

function createCsv(rowCount: number): string {
  const rows = Array.from(
    { length: rowCount },
    (_, index) => `2026-03-${String(index + 1).padStart(2, "0")},${index + 1}000,가맹점${index + 1}`,
  );

  return ["승인일,금액,가맹점명", ...rows].join("\n");
}

function createRouteContext(id = "job-1") {
  return {
    params: Promise.resolve({ id }),
  };
}

function createSessionClientMock(
  job: {
    id: string;
    status: string;
    storage_key: string;
    mapping_attempt_count: number;
  } | null,
) {
  const single = vi.fn().mockResolvedValue({
    data: job,
    error: job ? null : {},
  });
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

  return { eqId, eqUser };
}

function createServiceRoleStorageMock(csvText: string) {
  const download = vi.fn().mockResolvedValue({
    data: {
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(csvText).buffer),
    },
    error: null,
  });
  const storageFrom = vi.fn(() => ({ download }));

  createServiceRoleClientMock.mockReturnValue({
    storage: {
      from: storageFrom,
    },
  });

  return { download, storageFrom };
}

describe("GET /api/uploads/[id]/preview", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects job ids not owned by the current user before reading Storage", async () => {
    const session = createSessionClientMock(null);
    const storage = createServiceRoleStorageMock(createCsv(12));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test"),
      createRouteContext("job-other"),
    );

    expect(response.status).toBe(404);
    expect(session.eqId).toHaveBeenCalledWith("id", "job-other");
    expect(session.eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("only previews jobs that are waiting for manual mapping", async () => {
    createSessionClientMock({
      id: "job-1",
      status: "parsing",
      storage_key: "user-1/job-1/server.csv",
      mapping_attempt_count: 1,
    });
    const storage = createServiceRoleStorageMock(createCsv(12));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test"),
      createRouteContext(),
    );

    expect(response.status).toBe(409);
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });

  it("returns the CSV header, at most 10 preview rows, and attempt counts", async () => {
    createSessionClientMock({
      id: "job-1",
      status: "needs_mapping",
      storage_key: "user-1/job-1/server.csv",
      mapping_attempt_count: 2,
    });
    const storage = createServiceRoleStorageMock(createCsv(12));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("https://finsight.test"),
      createRouteContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(storage.storageFrom).toHaveBeenCalledWith("transaction-csv-uploads");
    expect(storage.download).toHaveBeenCalledWith("user-1/job-1/server.csv");
    expect(body).toEqual({
      header: ["승인일", "금액", "가맹점명"],
      mappingAttemptCount: 2,
      remainingAttempts: 1,
      rows: expect.arrayContaining([
        ["2026-03-01", "1000", "가맹점1"],
        ["2026-03-10", "10000", "가맹점10"],
      ]),
    });
    expect(body.rows).toHaveLength(10);
  });
});
