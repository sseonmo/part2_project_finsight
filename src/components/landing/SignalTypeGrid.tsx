import type { CSSProperties, ReactNode } from "react";

import { LANDING_SIGNAL_TILES } from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS, type SignalType } from "@/lib/signals/thresholds";

const TILE_ACCENTS: Record<SignalType, string> = {
  category_spike: "var(--cat-cafe-snack)",
  new_merchant_large: "var(--cat-shopping)",
  outlier_transaction: "var(--cat-culture-leisure)",
  recurring_payment: "var(--cat-grocery)",
  recurring_price_up: "var(--cat-housing-telecom)",
};

const TILE_ICONS: Record<SignalType, ReactNode> = {
  category_spike: (
    <path
      d="M2 12l3.5-4 3 2.5L14 4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  ),
  new_merchant_large: (
    <path
      d="M8 3.5v9M3.5 8h9"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  ),
  outlier_transaction: (
    <>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <circle cx="8" cy="10.8" fill="currentColor" r="0.8" />
    </>
  ),
  recurring_payment: (
    <>
      <path
        d="M13 7A5 5 0 1 0 12 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M13 3.5V7h-3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </>
  ),
  recurring_price_up: (
    <path
      d="M8 13V3m0 0L4 7m4-4 4 4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  ),
};

function TileIcon({ type }: { type: SignalType }) {
  const accent = TILE_ACCENTS[type];

  return (
    <span
      aria-hidden="true"
      className="landing-sig__icon"
      style={{
        background: `color-mix(in srgb, ${accent} 16%, transparent)`,
        color: accent,
      }}
    >
      <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
        {TILE_ICONS[type]}
      </svg>
    </span>
  );
}

export function SignalTypeGrid() {
  const [lead, ...rest] = LANDING_SIGNAL_TILES;

  return (
    <ul aria-label="잡는 지적 5종" className="landing-sig-grid">
      <li
        className="landing-sig landing-sig--lead landing-acc landing-lift"
        style={
          { "--landing-accent": TILE_ACCENTS[lead.type] } as CSSProperties
        }
      >
        <TileIcon type={lead.type} />
        <span>
          <p className="landing-sig__name">{SIGNAL_TYPE_LABELS[lead.type]}</p>
          <p className="landing-sig__cond">{lead.condition}</p>
        </span>
        <span className="landing-sig__amt tabular-nums">연 36,000원</span>
      </li>

      {rest.map((tile) => (
        <li
          className="landing-sig landing-acc landing-lift"
          key={tile.type}
          style={
            { "--landing-accent": TILE_ACCENTS[tile.type] } as CSSProperties
          }
        >
          <TileIcon type={tile.type} />
          <p className="landing-sig__name">{SIGNAL_TYPE_LABELS[tile.type]}</p>
          <p className="landing-sig__cond">{tile.condition}</p>
        </li>
      ))}

      <li className="landing-sig landing-sig--muted">
        <span>
          <p className="landing-sig__name">매달 영향도 순으로</p>
          <p className="landing-sig__cond">
            걸린 것이 없으면 없다고 적습니다. 없는 지적을 지어내지 않습니다.
          </p>
        </span>
      </li>
    </ul>
  );
}
