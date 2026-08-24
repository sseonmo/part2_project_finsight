import { describe, expect, it } from "vitest";

import {
  DASHBOARD_UPLOAD_STATUSES,
  FAILED_CARD_VISIBLE_MS,
  selectDashboardUploadCards,
} from "./upload-cards";

const NOW = new Date("2026-08-24T09:00:00.000Z");

function job(input: {
  id: string;
  status: string;
  minutesAgo?: number;
}): { id: string; status: string; created_at: string } {
  return {
    id: input.id,
    status: input.status,
    created_at: new Date(NOW.getTime() - (input.minutesAgo ?? 0) * 60_000).toISOString(),
  };
}

describe("dashboard upload cards", () => {
  it("queries failed jobs alongside the in-progress statuses", () => {
    // S14 는 실패 사유와 "다시 시도" 를 요구한다. 조회에서 빠지면
    // 새로고침하는 순간 그 버튼에 도달할 수 없다.
    expect(DASHBOARD_UPLOAD_STATUSES).toContain("failed");
  });

  it("keeps every in-progress job regardless of age", () => {
    const rows = [
      job({ id: "a", status: "pending", minutesAgo: 60 * 48 }),
      job({ id: "b", status: "parsing", minutesAgo: 5 }),
      job({ id: "c", status: "categorizing", minutesAgo: 60 * 24 }),
      job({ id: "d", status: "needs_mapping", minutesAgo: 60 * 72 }),
    ];

    expect(selectDashboardUploadCards(rows, NOW).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("keeps a failed job while it is still recent", () => {
    const rows = [job({ id: "a", status: "failed", minutesAgo: 30 })];

    expect(selectDashboardUploadCards(rows, NOW).map((row) => row.id)).toEqual(["a"]);
  });

  it("drops a failed job once it is older than the visible window", () => {
    // 오래된 실패까지 남기면 대시보드에 카드가 무한히 쌓인다. 그때부터는
    // 업로드 이력이 사유를 보여주는 자리다.
    const rows = [
      job({ id: "old", status: "failed", minutesAgo: FAILED_CARD_VISIBLE_MS / 60_000 + 1 }),
      job({ id: "fresh", status: "failed", minutesAgo: 10 }),
    ];

    expect(selectDashboardUploadCards(rows, NOW).map((row) => row.id)).toEqual(["fresh"]);
  });

  it("drops completed jobs even when they are recent", () => {
    const rows = [job({ id: "done", status: "completed", minutesAgo: 1 })];

    expect(selectDashboardUploadCards(rows, NOW)).toEqual([]);
  });
});
