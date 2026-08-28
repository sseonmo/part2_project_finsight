import type { SentencePart } from "@/lib/landing-samples";

import { Highlight } from "./Highlight";

/** 인사이트 문장은 `landing-samples.ts` 의 `sentence` 조각을 그대로 편다 —
    컴포넌트가 프로즈를 다시 타이핑하면 원본과 조용히 어긋난다. */
export function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <p className="landing-icard__text">
      {parts.map((part, index) =>
        part.kind === "mark" ? (
          <Highlight evidence={part.evidence} key={index}>
            {part.text}
          </Highlight>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}
