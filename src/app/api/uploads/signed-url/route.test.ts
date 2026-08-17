import { afterEach, describe, expect, it, vi } from "vitest";

const createServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/supabase", () => ({
  createServerClient: createServerClientMock,
}));

function jsonRequest(body: unknown): Request {
  return new Request("https://finsight.test/api/uploads/signed-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSupabaseMock(input: {
  user?: { id: string } | null;
  profile?: {
    subscription_status: "trialing" | "active" | "canceled";
    trial_started_at: string;
    current_period_end: string | null;
  };
}) {
  const insertRows: unknown[] = [];
  const createSignedUploadUrl = vi.fn().mockImplementation((path: string) =>
    Promise.resolve({
      data: {
        signedUrl: `https://storage.test/upload?path=${encodeURIComponent(path)}`,
        path,
        token: "signed-token",
      },
      error: null,
    }),
  );
  const singleProfile = vi.fn().mockResolvedValue({
    data:
      input.profile ?? {
        subscription_status: "active",
        trial_started_at: "2026-08-17T00:00:00.000Z",
        current_period_end: null,
      },
    error: null,
  });
  const insert = vi.fn().mockImplementation((row: Record<string, unknown>) => {
    insertRows.push(row);

    return {
      select: () => ({
        single: () => Promise.resolve({ data: row, error: null }),
      }),
    };
  });
  const from = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            single: singleProfile,
          }),
        }),
      };
    }

    return {
      insert,
    };
  });

  createServerClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: input.user ?? { id: "user-1" } },
        error: null,
      }),
    },
    from,
    storage: {
      from: vi.fn(() => ({
        createSignedUploadUrl,
      })),
    },
  });

  return { createSignedUploadUrl, insert, insertRows };
}

describe("POST /api/uploads/signed-url", () => {
  afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("rejects expired users before creating upload jobs or signed URLs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T00:00:00.000Z"));
    const supabase = createSupabaseMock({
      profile: {
        subscription_status: "trialing",
        trial_started_at: "2026-08-01T00:00:00.000Z",
        current_period_end: null,
      },
    });
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        filename: "card.csv",
        contentType: "text/csv",
        size: 1024,
        cardLabel: "카드 1",
      }),
    );

    expect(response.status).toBe(403);
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(supabase.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("requires a non-empty card label because it is part of the dedupe key", async () => {
    createSupabaseMock({});
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        filename: "card.csv",
        contentType: "text/csv",
        size: 1024,
        cardLabel: "  ",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("generates the Storage key filename on the server and keeps the client filename only as metadata", async () => {
    createSupabaseMock({});
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        filename: "../other-user/malicious.csv",
        contentType: "text/csv",
        size: 1024,
        cardLabel: "카드 1",
      }),
    );
    const body = (await response.json()) as {
      jobId: string;
      storageKey: string;
      uploadUrl: string;
      token: string;
    };

    expect(response.status).toBe(201);
    expect(body.storageKey).toMatch(/^user-1\/.+\/.+\.csv$/);
    expect(body.storageKey).not.toContain("malicious.csv");
    expect(body.storageKey).not.toContain("..");
    expect(body.uploadUrl).toContain(encodeURIComponent(body.storageKey));
    expect(body.token).toBe("signed-token");
  });
});
