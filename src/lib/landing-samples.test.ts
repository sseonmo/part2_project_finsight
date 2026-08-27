import { describe, expect, it } from "vitest";

import { CATEGORY_TOKENS } from "@/lib/categories";
import { SIGNAL_THRESHOLDS, SIGNAL_TYPES } from "@/lib/signals/thresholds";

import {
  categoryVar,
  LANDING_CSV_ROWS,
  LANDING_DASHBOARD,
  LANDING_INSIGHT_CARDS,
  LANDING_SIGNAL_ROWS,
  LANDING_SIGNAL_TILES,
} from "./landing-samples";

describe("landing samples", () => {
  it("covers every signal type exactly once in the tile grid", () => {
    const types = LANDING_SIGNAL_TILES.map((tile) => tile.type);

    expect(types).toHaveLength(SIGNAL_TYPES.length);
    expect(new Set(types)).toEqual(new Set(SIGNAL_TYPES));
  });

  it("derives tile conditions from the real thresholds instead of hardcoding", () => {
    const spike = LANDING_SIGNAL_TILES.find(
      (tile) => tile.type === "category_spike",
    );
    const recurring = LANDING_SIGNAL_TILES.find(
      (tile) => tile.type === "recurring_payment",
    );

    expect(spike?.condition).toContain("50%");
    expect(spike?.condition).toContain("30,000원");
    expect(recurring?.condition).toContain(
      `${SIGNAL_THRESHOLDS.recurring.minIntervalDays}~${SIGNAL_THRESHOLDS.recurring.maxIntervalDays}일`,
    );
    expect(recurring?.condition).toContain(
      `${SIGNAL_THRESHOLDS.recurring.minOccurrences}회`,
    );
  });

  it("shows the threshold comparison of each card as a passing raw row", () => {
    LANDING_INSIGHT_CARDS.forEach((card) => {
      const threshold = card.raw.find((row) => row.key === "threshold");

      expect(threshold?.pass).toBe(true);
      expect(threshold?.value).toContain("✓");
    });
  });

  it("keeps the category spike threshold row in sync with the thresholds file", () => {
    const card = LANDING_INSIGHT_CARDS.find(
      (item) => item.type === "category_spike",
    );
    const threshold = card?.raw.find((row) => row.key === "threshold");

    expect(threshold?.value).toContain("≥ 50%");
    expect(threshold?.value).toContain("≥ 30,000");
  });

  it("marks exactly one number span per insight sentence with its evidence", () => {
    LANDING_INSIGHT_CARDS.forEach((card) => {
      const marks = card.sentence.filter((part) => part.kind === "mark");

      expect(marks).toHaveLength(1);
      marks.forEach((mark) => {
        expect(mark.kind === "mark" && mark.evidence.length).toBeGreaterThan(0);
      });
    });
  });

  it("links every highlighted csv row to a signal row and vice versa", () => {
    const signalIds = new Set(LANDING_SIGNAL_ROWS.map((row) => row.signalId));
    const linkedCsvIds = new Set(
      LANDING_CSV_ROWS.map((row) => row.signalId).filter(Boolean),
    );

    expect(signalIds).toEqual(linkedCsvIds);
    expect(LANDING_CSV_ROWS).toHaveLength(9);
  });

  it("resolves category colors through the shared category tokens", () => {
    expect(categoryVar("카페/간식")).toBe(
      `var(${CATEGORY_TOKENS["카페/간식"]})`,
    );
    LANDING_DASHBOARD.bars.forEach((bar) => {
      expect(CATEGORY_TOKENS[bar.category]).toBeDefined();
      expect(bar.share).toBeGreaterThan(0);
      expect(bar.share).toBeLessThanOrEqual(100);
    });
  });
});
