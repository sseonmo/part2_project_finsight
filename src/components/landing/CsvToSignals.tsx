"use client";

import { useState, type CSSProperties } from "react";

import {
  categoryVar,
  LANDING_CSV_ROWS,
  LANDING_SIGNAL_ROWS,
} from "@/lib/landing-samples";

export function CsvToSignals() {
  const [focused, setFocused] = useState("");

  function link(signalId: string) {
    setFocused(signalId);
  }

  return (
    <div
      className="landing-transform"
      data-focus={focused || undefined}
      onMouseLeave={() => setFocused("")}
    >
      <div className="landing-csvbox">
        <span className="landing-csvbox__label">올린 것</span>
        {LANDING_CSV_ROWS.map((row) => (
          <button
            className="landing-csvrow"
            data-sig={row.signalId}
            key={row.text}
            onClick={() => link(row.signalId)}
            onFocus={() => link(row.signalId)}
            onMouseEnter={() => link(row.signalId)}
            type="button"
          >
            {row.text}
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="landing-arrow">
        <svg fill="none" height="24" viewBox="0 0 44 24" width="44">
          <path
            d="M2 12h38m0 0-8-7m8 7-8 7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="landing-outbox">
        {LANDING_SIGNAL_ROWS.map((row) => (
          <button
            className="landing-outrow landing-acc"
            data-sig={row.signalId}
            key={row.signalId}
            onClick={() => link(row.signalId)}
            onFocus={() => link(row.signalId)}
            onMouseEnter={() => link(row.signalId)}
            style={
              { "--landing-accent": categoryVar(row.category) } as CSSProperties
            }
            type="button"
          >
            <span
              className="landing-sigdot"
              style={{ background: categoryVar(row.category) }}
            />
            <span className="landing-outrow__name">{row.name}</span>
            <span className="landing-outrow__amt tabular-nums">
              {row.amount}
            </span>
          </button>
        ))}
        <p className="landing-outmore">외 2건 · 원화 영향도가 큰 순서로</p>
      </div>
    </div>
  );
}
