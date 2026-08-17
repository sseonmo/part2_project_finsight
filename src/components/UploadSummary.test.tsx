import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UploadSummary } from "./UploadSummary";

describe("UploadSummary", () => {
  it("always renders the inserted count even when no new transactions were added", () => {
    render(
      <UploadSummary
        cardLabelMismatchWarning={null}
        summary={{
          duplicateCount: 0,
          insertedCount: 0,
          skippedRows: 0,
          uncategorizedCount: 0,
        }}
      />,
    );

    expect(screen.getByText("새로 추가된 거래 0건")).toBeInTheDocument();
    expect(
      screen.queryByText("중복이라 건너뛴 거래 0건"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("읽지 못한 행 0건")).not.toBeInTheDocument();
  });

  it("renders non-zero completion counts and the card mismatch warning", () => {
    render(
      <UploadSummary
        cardLabelMismatchWarning="이 파일은 '카드 1'로 올린 이전 파일과 형식이 다릅니다."
        summary={{
          duplicateCount: 2,
          insertedCount: 12,
          skippedRows: 1,
          uncategorizedCount: 3,
        }}
      />,
    );

    expect(screen.getByText("새로 추가된 거래 12건")).toBeInTheDocument();
    expect(screen.getByText("중복이라 건너뛴 거래 2건")).toBeInTheDocument();
    expect(screen.getByText("읽지 못한 행 1건")).toBeInTheDocument();
    expect(
      screen.getByText('분류하지 못해 "기타"로 넣은 가맹점 3개'),
    ).toBeInTheDocument();
    expect(screen.getByText(/이 파일은 '카드 1'/)).toBeInTheDocument();
  });
});
