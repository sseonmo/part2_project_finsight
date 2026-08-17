export type UploadSummaryCounts = {
  insertedCount: number;
  duplicateCount: number;
  skippedRows: number;
  uncategorizedCount: number;
};

type UploadSummaryProps = {
  cardLabelMismatchWarning: string | null;
  summary: UploadSummaryCounts;
};

export function UploadSummary({
  cardLabelMismatchWarning,
  summary,
}: UploadSummaryProps) {
  const items = [
    `새로 추가된 거래 ${summary.insertedCount.toLocaleString("ko-KR")}건`,
  ];

  if (summary.duplicateCount > 0) {
    items.push(
      `중복이라 건너뛴 거래 ${summary.duplicateCount.toLocaleString("ko-KR")}건`,
    );
  }

  if (summary.skippedRows > 0) {
    items.push(`읽지 못한 행 ${summary.skippedRows.toLocaleString("ko-KR")}건`);
  }

  if (summary.uncategorizedCount > 0) {
    items.push(
      `분류하지 못해 "기타"로 넣은 가맹점 ${summary.uncategorizedCount.toLocaleString("ko-KR")}개`,
    );
  }

  return (
    <div className="upload-summary">
      <ul className="upload-summary__list">
        {items.map((item) => (
          <li className="upload-summary__item" key={item}>
            {item}
          </li>
        ))}
      </ul>
      {cardLabelMismatchWarning ? (
        <p className="upload-summary__warning">{cardLabelMismatchWarning}</p>
      ) : null}
    </div>
  );
}
