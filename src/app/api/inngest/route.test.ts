import { afterEach, describe, expect, it, vi } from "vitest";

const serveMock = vi.hoisted(() =>
  vi.fn(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
    PUT: vi.fn(),
  })),
);

vi.mock("inngest/next", () => ({
  serve: serveMock,
}));

vi.mock("@/inngest/client", () => ({
  inngest: { id: "client" },
}));

vi.mock("@/inngest/process-upload", () => ({
  processUpload: { id: "process-upload" },
}));

describe("/api/inngest", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("serves registered functions through the Inngest SDK route handler", async () => {
    const route = await import("./route");

    expect(route.runtime).toBe("nodejs");
    expect(route.maxDuration).toBeGreaterThanOrEqual(60);
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.PUT).toBe("function");
    expect(serveMock).toHaveBeenCalledWith({
      client: { id: "client" },
      functions: [{ id: "process-upload" }],
    });
  });
});
