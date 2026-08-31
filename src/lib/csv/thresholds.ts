export const CSV_MAPPING_SAMPLE_SIZE = 20;
export const CSV_SAMPLE_SUCCESS_RATE_MIN = 0.9;
export const CSV_FULL_FAILURE_RATE_MAX = 0.2;
// type 컬럼을 신뢰하는 최소 인식률. 카드 명세서의 `구분` 은 거래 유형이 아니라
// 결제 방식(리볼빙-일시)만 담기도 하는데, 그 값 하나로 행 전체를 버리면 첫
// 업로드가 통째로 실패한다. 이보다 덜 읽히는 컬럼은 안 읽은 것으로 친다.
export const CSV_TYPE_RECOGNITION_RATE_MIN = 0.5;

export const SANITY_DATE_ANOMALY_RATE_MAX = 0.05;
export const SANITY_AMOUNT_ANOMALY_RATE_MAX = 0.3;
export const SANITY_LOOKBACK_YEARS = 10;
