import { describe, expect, it } from "vitest";

import { SIGNAL_TYPES } from "./types";

describe("signal types", () => {
  it("contains exactly the five PRD signal types", () => {
    expect(SIGNAL_TYPES).toEqual([
      "category_spike",
      "new_merchant_large",
      "outlier_transaction",
      "recurring_payment",
      "recurring_price_up",
    ]);
  });
});
