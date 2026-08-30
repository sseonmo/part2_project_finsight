import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function mockSupabase(error: unknown = null) {
  const signOut = vi.fn(async () => ({ error }));

  createServerClientMock.mockResolvedValue({ auth: { signOut } });

  return { signOut };
}

describe("POST /api/auth/signout", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("ends the session and points the client at the landing page", async () => {
    const { signOut } = mockSupabase();
    const { POST } = await import("./route");

    const response = await POST();
    const body = (await response.json()) as { redirectTo: string };

    expect(response.status).toBe(200);
    expect(signOut).toHaveBeenCalled();
    expect(body.redirectTo).toBe("/");
  });

  it("reports a failure when the session could not be ended", async () => {
    // 실패했는데 200 을 주면 클라이언트가 랜딩으로 보내고, 미들웨어가 살아 있는
    // 세션을 보고 대시보드로 되돌려 사용자는 아무 일도 안 일어난 것처럼 본다.
    mockSupabase({ message: "sign out failed" });
    const { POST } = await import("./route");

    const response = await POST();

    expect(response.status).toBe(500);
  });
});
