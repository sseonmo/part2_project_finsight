import { describe, expect, it } from "vitest";

import { initialMappingError } from "./mapping-message";

describe("manual mapping error message", () => {
  it("asks for the first attempt without a retry message", () => {
    expect(
      initialMappingError({ mappingAttemptCount: 0, failedReason: null }),
    ).toBeNull();
  });

  it("shows the column retry message after a generic parsing failure", () => {
    expect(
      initialMappingError({
        mappingAttemptCount: 1,
        failedReason: "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요.",
      }),
    ).toBe("선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요");
  });

  it("keeps a specific reason instead of blaming the date column", () => {
    // 금액 컬럼을 잘못 고른 것인데 "날짜를 읽지 못했습니다" 라고 하면
    // 사용자가 엉뚱한 컬럼을 고치게 된다.
    expect(
      initialMappingError({
        mappingAttemptCount: 2,
        failedReason: "유효한 거래가 없는 파일입니다.",
      }),
    ).toBe("유효한 거래가 없는 파일입니다.");
  });

  it("falls back to the retry message when a retried job has no reason", () => {
    expect(
      initialMappingError({ mappingAttemptCount: 1, failedReason: null }),
    ).toBe("선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요");
  });
});
