"use client";

import { useId } from "react";
import type { ReactNode } from "react";

type HighlightProps = {
  children: ReactNode;
  evidence: string;
};

/** 문장 안의 금액·비율. 숫자가 어디서 나왔는지를 툴팁으로 붙여 둔다 —
    이 제품에서 숫자는 전부 집계 결과이고, 그걸 보여줄 수 있어야 한다. */
export function Highlight({ children, evidence }: HighlightProps) {
  const tipId = useId();

  return (
    <span className="landing-hl" aria-describedby={tipId} tabIndex={0}>
      {children}
      <span className="landing-hl__tip" id={tipId} role="tooltip">
        {evidence}
      </span>
    </span>
  );
}
