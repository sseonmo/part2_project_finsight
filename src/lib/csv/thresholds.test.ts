import { describe, expect, it } from "vitest";

import {
  CSV_FULL_FAILURE_RATE_MAX,
  CSV_MAPPING_SAMPLE_SIZE,
  CSV_SAMPLE_SUCCESS_RATE_MIN,
  SANITY_AMOUNT_ANOMALY_RATE_MAX,
  SANITY_DATE_ANOMALY_RATE_MAX,
  SANITY_LOOKBACK_YEARS,
} from "./thresholds";

describe("csv thresholds", () => {
  it("keeps csv parsing thresholds in the csv layer", () => {
    expect(CSV_MAPPING_SAMPLE_SIZE).toBe(20);
    expect(CSV_SAMPLE_SUCCESS_RATE_MIN).toBe(0.9);
    expect(CSV_FULL_FAILURE_RATE_MAX).toBe(0.2);
    expect(SANITY_DATE_ANOMALY_RATE_MAX).toBe(0.05);
    expect(SANITY_AMOUNT_ANOMALY_RATE_MAX).toBe(0.3);
    expect(SANITY_LOOKBACK_YEARS).toBe(10);
  });

  it("matches the acceptance boundaries exactly", () => {
    expect(0.89).toBeLessThan(CSV_SAMPLE_SUCCESS_RATE_MIN);
    expect(0.9).toBeGreaterThanOrEqual(CSV_SAMPLE_SUCCESS_RATE_MIN);
    expect(0.91).toBeGreaterThanOrEqual(CSV_SAMPLE_SUCCESS_RATE_MIN);

    expect(0.19).toBeLessThanOrEqual(CSV_FULL_FAILURE_RATE_MAX);
    expect(0.2).toBeLessThanOrEqual(CSV_FULL_FAILURE_RATE_MAX);
    expect(0.21).toBeGreaterThan(CSV_FULL_FAILURE_RATE_MAX);

    expect(0.04).toBeLessThanOrEqual(SANITY_DATE_ANOMALY_RATE_MAX);
    expect(0.05).toBeLessThanOrEqual(SANITY_DATE_ANOMALY_RATE_MAX);
    expect(0.06).toBeGreaterThan(SANITY_DATE_ANOMALY_RATE_MAX);

    expect(0.29).toBeLessThanOrEqual(SANITY_AMOUNT_ANOMALY_RATE_MAX);
    expect(0.3).toBeLessThanOrEqual(SANITY_AMOUNT_ANOMALY_RATE_MAX);
    expect(0.31).toBeGreaterThan(SANITY_AMOUNT_ANOMALY_RATE_MAX);
  });
});
