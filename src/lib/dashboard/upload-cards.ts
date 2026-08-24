/**
 * 대시보드 상단 진행률 카드에 어떤 업로드 job 을 남길지 정한다.
 *
 * `failed` 를 조회에서 빼면 새로고침하는 순간 실패 사유와 "다시 시도" 버튼이
 * 사라진다(S14·S6). 그렇다고 전부 남기면 카드가 무한히 쌓이므로, 실패는
 * 최근 것만 카드로 보여주고 그 뒤로는 업로드 이력이 사유를 맡는다.
 */
export const DASHBOARD_UPLOAD_STATUSES = [
  "pending",
  "parsing",
  "categorizing",
  "needs_mapping",
  "failed",
] as const;

const IN_PROGRESS_STATUSES = new Set<string>([
  "pending",
  "parsing",
  "categorizing",
  "needs_mapping",
]);

/** 카드가 무한히 쌓이지 않도록 한 번에 조회할 job 수를 묶는다. */
export const DASHBOARD_UPLOAD_CARD_LIMIT = 20;

export const FAILED_CARD_VISIBLE_MS = 24 * 60 * 60 * 1000;

export function selectDashboardUploadCards<
  T extends { status: string; created_at: string },
>(rows: readonly T[], now: Date): T[] {
  return rows.filter((row) => {
    if (IN_PROGRESS_STATUSES.has(row.status)) {
      return true;
    }

    if (row.status !== "failed") {
      return false;
    }

    const createdAt = new Date(row.created_at).getTime();

    return now.getTime() - createdAt <= FAILED_CARD_VISIBLE_MS;
  });
}
