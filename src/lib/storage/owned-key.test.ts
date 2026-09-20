import { describe, expect, it } from "vitest";

import { isOwnedStorageKey } from "./owned-key";

describe("isOwnedStorageKey", () => {
  it("accepts a key whose first folder is the owner's user id", () => {
    expect(isOwnedStorageKey("user-1/job-1/server.csv", "user-1")).toBe(true);
  });

  it("rejects a key pointing at another user's folder", () => {
    expect(isOwnedStorageKey("victim/job-9/server.csv", "user-1")).toBe(false);
  });

  it("rejects a first folder that merely starts with the user id", () => {
    expect(isOwnedStorageKey("user-10/job-1/server.csv", "user-1")).toBe(false);
  });

  it("rejects a key with no folder at all", () => {
    expect(isOwnedStorageKey("server.csv", "user-1")).toBe(false);
  });

  it("rejects an empty key", () => {
    expect(isOwnedStorageKey("", "user-1")).toBe(false);
  });
});
