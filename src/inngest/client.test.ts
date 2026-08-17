import { afterEach, describe, expect, it, vi } from "vitest";

const inngestConstructorMock = vi.hoisted(() =>
  vi.fn(function MockInngest(this: Record<string, unknown>, options: unknown) {
    this.options = options;
  }),
);

vi.mock("inngest", () => ({
  Inngest: inngestConstructorMock,
}));

describe("Inngest client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses a stable app id and lets the SDK read signing and event keys from env", async () => {
    await import("./client");

    expect(inngestConstructorMock).toHaveBeenCalledWith({ id: "finsight" });
  });
});
