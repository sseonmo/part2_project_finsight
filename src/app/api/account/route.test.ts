import { afterEach, describe, expect, it, vi } from "vitest";

const getSessionContextMock = vi.hoisted(() => vi.fn());
const createServerClientMock = vi.hoisted(() => vi.fn());
const createServiceRoleClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  getSessionContext: getSessionContextMock,
}));

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/services/supabase-service-role", () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

const UPLOAD_BUCKET = "transaction-csv-uploads";

type StorageEntry = { id: string | null; name: string };

function deleteRequest(body: unknown): Request {
  return new Request("https://finsight.test/api/account", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSession(userId = "user-1") {
  getSessionContextMock.mockResolvedValue({
    email: "user@example.com",
    entitlement: {
      canRead: true,
      canWrite: false,
      state: "expired",
      trialEndsAt: new Date("2026-08-10T00:00:00.000Z"),
    },
    userId,
  });
}

function mockClients(options?: {
  listErrorPrefix?: string;
  removeError?: { message: string };
  storageKeys?: string[];
  tree?: Record<string, StorageEntry[]>;
}) {
  const callOrder: string[] = [];

  const list = vi.fn(async (prefix: string) => {
    callOrder.push(`storage.list:${prefix}`);

    if (options?.listErrorPrefix === prefix) {
      return { data: null, error: { message: "list failed" } };
    }

    return { data: options?.tree?.[prefix] ?? [], error: null };
  });

  const remove = vi.fn(async () => {
    callOrder.push("storage.remove");

    return { data: null, error: options?.removeError ?? null };
  });

  const deleteUser = vi.fn(async () => {
    callOrder.push("auth.admin.deleteUser");

    return { data: { user: null }, error: null };
  });

  const eq = vi.fn(async () => ({
    data: (options?.storageKeys ?? []).map((storage_key) => ({ storage_key })),
    error: null,
  }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    callOrder.push(`db.from:${table}`);

    return { select };
  });
  const storageFrom = vi.fn(() => ({ list, remove }));

  createServiceRoleClientMock.mockReturnValue({
    auth: { admin: { deleteUser } },
    from,
    storage: { from: storageFrom },
  });

  const signOut = vi.fn(async () => ({ error: null }));

  createServerClientMock.mockResolvedValue({ auth: { signOut } });

  return { callOrder, deleteUser, eq, from, list, remove, signOut, storageFrom };
}

describe("DELETE /api/account", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    getSessionContextMock.mockResolvedValue(null);
    const clients = mockClients();
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(response.status).toBe(401);
    expect(clients.remove).not.toHaveBeenCalled();
    expect(clients.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes nothing when the confirmation phrase does not match", async () => {
    mockSession();
    const clients = mockClients({ storageKeys: ["user-1/job-1/a.csv"] });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "삭제해줘" }));

    expect(response.status).toBe(400);
    expect(clients.remove).not.toHaveBeenCalled();
    expect(clients.deleteUser).not.toHaveBeenCalled();
  });

  it("removes Storage objects before deleting the auth user", async () => {
    mockSession();
    const clients = mockClients({
      storageKeys: ["user-1/job-1/a.csv"],
      tree: {
        "user-1": [{ id: null, name: "job-1" }],
        "user-1/job-1": [{ id: "file-1", name: "a.csv" }],
      },
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(response.status).toBe(200);
    expect(clients.storageFrom).toHaveBeenCalledWith(UPLOAD_BUCKET);

    const removeIndex = clients.callOrder.indexOf("storage.remove");
    const deleteUserIndex = clients.callOrder.indexOf("auth.admin.deleteUser");

    expect(removeIndex).toBeGreaterThanOrEqual(0);
    expect(deleteUserIndex).toBeGreaterThanOrEqual(0);
    expect(removeIndex).toBeLessThan(deleteUserIndex);
  });

  it("also removes orphan objects that no upload_jobs row points at", async () => {
    mockSession();
    const clients = mockClients({
      storageKeys: ["user-1/job-1/a.csv"],
      tree: {
        "user-1": [
          { id: null, name: "job-1" },
          { id: null, name: "job-orphan" },
        ],
        "user-1/job-1": [{ id: "file-1", name: "a.csv" }],
        "user-1/job-orphan": [{ id: "file-2", name: "orphan.csv" }],
      },
    });
    const { DELETE } = await import("./route");

    await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    const [removedKeys] = clients.remove.mock.calls[0] as unknown as [string[]];

    expect([...removedKeys].sort()).toEqual([
      "user-1/job-1/a.csv",
      "user-1/job-orphan/orphan.csv",
    ]);
  });

  it("stops before deleting the auth user when Storage removal fails", async () => {
    mockSession();
    const clients = mockClients({
      removeError: { message: "remove failed" },
      storageKeys: ["user-1/job-1/a.csv"],
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(response.status).toBe(500);
    expect(clients.deleteUser).not.toHaveBeenCalled();
  });

  it("stops before deleting the auth user when Storage listing fails", async () => {
    mockSession();
    const clients = mockClients({
      listErrorPrefix: "user-1",
      storageKeys: [],
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(response.status).toBe(500);
    expect(clients.remove).not.toHaveBeenCalled();
    expect(clients.deleteUser).not.toHaveBeenCalled();
  });

  it("ignores a userId supplied in the request body", async () => {
    mockSession("user-1");
    const clients = mockClients({
      storageKeys: ["user-1/job-1/a.csv"],
      tree: { "user-1": [] },
    });
    const { DELETE } = await import("./route");

    await DELETE(
      deleteRequest({ confirmation: "계정 삭제", userId: "victim-user" }),
    );

    expect(clients.deleteUser).toHaveBeenCalledWith("user-1");
    expect(clients.eq).toHaveBeenCalledTimes(1);
    expect(clients.list).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ offset: 0 }),
    );
  });

  it("relies on the auth.users cascade instead of per-table deletes", async () => {
    mockSession();
    const clients = mockClients({ storageKeys: [], tree: { "user-1": [] } });
    const { DELETE } = await import("./route");

    await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(clients.from).toHaveBeenCalledTimes(1);
    expect(clients.from).toHaveBeenCalledWith("upload_jobs");
  });

  it("ends the session and points the client at the landing page", async () => {
    mockSession();
    const clients = mockClients({ storageKeys: [], tree: { "user-1": [] } });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));
    const body = (await response.json()) as { redirectTo: string };

    expect(response.status).toBe(200);
    expect(clients.signOut).toHaveBeenCalled();
    expect(body.redirectTo).toBe("/");
  });

  it("does not gate account deletion on entitlement", async () => {
    // expired 사용자도 자기 데이터를 지울 수 있어야 한다 (ADR-005 의 취지).
    mockSession();
    const clients = mockClients({ storageKeys: [], tree: { "user-1": [] } });
    const { DELETE } = await import("./route");

    const response = await DELETE(deleteRequest({ confirmation: "계정 삭제" }));

    expect(response.status).toBe(200);
    expect(clients.deleteUser).toHaveBeenCalledWith("user-1");
  });
});
