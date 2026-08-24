/**
 * 매핑을 다시 물을 때 화면 맨 위에 띄우는 안내다.
 *
 * 일반 파싱 실패는 어느 컬럼이 문제였는지 알 수 없으므로 S10 의 문구를 쓴다.
 * 반대로 sanity 가 남긴 구체적인 사유(금액을 읽지 못했다 등)는 그대로 보여준다 —
 * 금액 컬럼을 잘못 고른 사람에게 "날짜를 읽지 못했습니다" 라고 하면 엉뚱한
 * 컬럼을 고치게 된다.
 */
export const GENERIC_MAPPING_FAILURE_REASON =
  "거래를 읽지 못했습니다. 컬럼을 다시 골라주세요.";

export const MAPPING_RETRY_MESSAGE =
  "선택한 컬럼으로 날짜를 읽지 못했습니다. 다른 컬럼을 골라주세요";

export function initialMappingError(job: {
  mappingAttemptCount: number;
  failedReason: string | null;
}): string | null {
  if (job.mappingAttemptCount <= 0) {
    return job.failedReason;
  }

  if (!job.failedReason || job.failedReason === GENERIC_MAPPING_FAILURE_REASON) {
    return MAPPING_RETRY_MESSAGE;
  }

  return job.failedReason;
}
