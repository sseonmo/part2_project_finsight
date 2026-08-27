"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { Badge } from "@/components/Badge";
import { categoryVar, LANDING_INSIGHT_CARDS } from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS } from "@/lib/signals/thresholds";

import { Sentence } from "./Sentence";

const ROTATE_MS = 4_600;

type Mode = "ai" | "raw";

const MODE_NOTES: Record<Mode, { lead: string; rest: string }> = {
  ai: {
    lead: "AI가 옮긴 문장입니다.",
    rest: " 왼쪽 토글을 누르면 이 문장이 나오기 전, 규칙이 고른 원자료가 그대로 보입니다.",
  },
  raw: {
    lead: "규칙이 고른 원자료입니다.",
    rest: " src/lib/signals/ 의 순수 함수가 임계값으로 판정한 결과 그대로이고, AI는 아직 아무것도 하지 않았습니다.",
  },
};

export function InsightCardStack() {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("ai");
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      setActive((current) => (current + 1) % LANDING_INSIGHT_CARDS.length);
    }, ROTATE_MS);

    return () => {
      clearInterval(timer);
    };
  }, [autoRotate]);

  /** 읽는 중에 카드가 넘어가지 않도록, 한 번 손대면 다시 돌지 않는다. */
  function stopAuto() {
    setAutoRotate(false);
  }

  function selectCard(index: number) {
    stopAuto();
    setActive(index);
  }

  function selectMode(next: Mode) {
    stopAuto();
    setMode(next);
    setFlippedId(null);
  }

  const note = MODE_NOTES[mode];

  return (
    <div>
      <div className="landing-modebar">
        <Badge variant="neutral">예시</Badge>
        <div aria-label="표시 방식" className="landing-seg" role="group">
          <button
            aria-pressed={mode === "raw"}
            className="landing-seg__btn"
            onClick={() => selectMode("raw")}
            type="button"
          >
            규칙이 고른 것
          </button>
          <button
            aria-pressed={mode === "ai"}
            className="landing-seg__btn"
            onClick={() => selectMode("ai")}
            type="button"
          >
            AI가 옮긴 문장
          </button>
        </div>
      </div>

      <div
        className="landing-stack"
        onFocus={stopAuto}
        onMouseEnter={stopAuto}
      >
        {LANDING_INSIGHT_CARDS.map((card, index) => {
          const position =
            (index - active + LANDING_INSIGHT_CARDS.length) %
            LANDING_INSIGHT_CARDS.length;
          const flipped = flippedId === card.id;
          const accent = {
            "--landing-accent": categoryVar(card.category),
          } as CSSProperties;

          return (
            <article
              className={`landing-icard${flipped ? " landing-icard--flipped" : ""}`}
              data-pos={position}
              key={card.id}
            >
              <div className="landing-icard__inner">
                <div
                  className="landing-icard__face landing-icard__face--front landing-acc"
                  inert={flipped}
                  style={accent}
                >
                  <div className="landing-icard__head">
                    <span className="landing-icard__type">
                      <span
                        className="landing-sigdot"
                        style={{ background: categoryVar(card.category) }}
                      />
                      {SIGNAL_TYPE_LABELS[card.type]}
                    </span>
                    <span className="landing-icard__impact tabular-nums">
                      {card.impact}
                    </span>
                  </div>
                  <p className="landing-icard__subject">{card.subject}</p>

                  <div hidden={mode !== "ai"}>
                    <Sentence parts={card.sentence} />
                  </div>

                  <div hidden={mode !== "raw"}>
                    <div className="landing-raw">
                      {card.raw.map((row) => (
                        <div className="landing-raw__row" key={row.key}>
                          <span className="landing-raw__k">{row.key}</span>
                          <span
                            className={`landing-raw__v${row.pass ? " landing-raw__v--pass" : ""}`}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="landing-raw__src">{card.source}</p>
                  </div>

                  <div className="landing-icard__foot">
                    <button
                      className="landing-icard__link"
                      onClick={() => {
                        stopAuto();
                        setFlippedId(card.id);
                      }}
                      type="button"
                    >
                      근거 보기 →
                    </button>
                  </div>
                </div>

                {/* 안 보이는 면은 180도 돌아가 있을 뿐 레이아웃에는 남는다. inert 가 없으면
                    Tab 이 그리로 가서 포커스가 화면 밖으로 사라진다. */}
                <div
                  className="landing-icard__face landing-icard__face--back landing-acc"
                  inert={!flipped}
                  style={accent}
                >
                  <div className="landing-ev__title">
                    <span>{card.evidence.title}</span>
                    <button
                      className="landing-ev__back"
                      onClick={() => setFlippedId(null)}
                      type="button"
                    >
                      ← 돌아가기
                    </button>
                  </div>
                  <div className="landing-ev__list">
                    {card.evidence.rows.map((row) => (
                      <div
                        className="landing-ev__row"
                        key={`${row.date}-${row.merchant}`}
                      >
                        <span>{row.date}</span>
                        <span>{row.merchant}</span>
                        <span>{row.amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="landing-ev__sum">
                    <span>{card.evidence.summaryLabel}</span>
                    <b>{card.evidence.summaryValue}</b>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="landing-dots">
        {LANDING_INSIGHT_CARDS.map((card, index) => (
          <button
            aria-current={index === active}
            aria-label={`예시 ${index + 1}`}
            className="landing-dot"
            key={card.id}
            onClick={() => selectCard(index)}
            type="button"
          />
        ))}
      </div>

      <p className="landing-modenote">
        <b>{note.lead}</b>
        {note.rest}
      </p>
    </div>
  );
}
