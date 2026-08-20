import { describe, expect, it } from "vitest";

import { decideDateFormat, parseDate } from "./date";

describe("csv date", () => {
  it("parses ISO dates at Asia/Seoul midnight", () => {
    const parsed = parseDate("2026-03-04", "YYYY-MM-DD");

    expect(parsed?.toISOString()).toBe("2026-03-03T15:00:00.000Z");
  });

  it("uses the whole file to decide MM/DD/YYYY", () => {
    const dates = [
      ...Array.from({ length: 20 }, () => "03/04/2026"),
      "03/14/2026",
    ];

    expect(decideDateFormat(dates)).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/04/2026", "MM/DD/YYYY")?.toISOString()).toBe(
      "2026-03-03T15:00:00.000Z",
    );
  });

  it("uses the whole file to decide DD/MM/YYYY", () => {
    const dates = [
      ...Array.from({ length: 20 }, () => "03/04/2026"),
      "14/03/2026",
    ];

    expect(decideDateFormat(dates)).toEqual({
      format: "DD/MM/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/04/2026", "DD/MM/YYYY")?.toISOString()).toBe(
      "2026-04-02T15:00:00.000Z",
    );
  });

  it("marks fully ambiguous numeric dates as assumed", () => {
    expect(decideDateFormat(["03/04/2026", "04/05/2026"])).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "assumed-iso",
    });
  });

  it("returns null for impossible dates", () => {
    expect(parseDate("2026-02-30", "YYYY-MM-DD")).toBeNull();
    expect(parseDate("13/04/2026", "MM/DD/YYYY")).toBeNull();
  });

  it("uses MM/DD evidence in files that carry two-digit years", () => {
    expect(decideDateFormat(["03/04/26", "03/14/26"])).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/14/26", "MM/DD/YYYY")?.toISOString()).toBe(
      "2026-03-13T15:00:00.000Z",
    );
  });

});
