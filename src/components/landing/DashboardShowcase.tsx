import type { CSSProperties } from "react";

import { Badge } from "@/components/Badge";
import {
  categoryVar,
  LANDING_DASHBOARD,
  LANDING_INSIGHT_CARDS,
} from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS } from "@/lib/signals/thresholds";

import { Highlight } from "./Highlight";

const FLOATING = LANDING_INSIGHT_CARDS[1];

export function DashboardShowcase() {
  return (
    <div className="landing-dashwrap">
      <div className="landing-dash">
        <div className="landing-dash__bar">
          <span>{LANDING_DASHBOARD.period}</span>
          <Badge variant="neutral">예시</Badge>
        </div>
        <div className="landing-dash__body">
          <div className="landing-dash__left">
            <span className="landing-kpi-label">이 달 지출</span>
            <span className="landing-kpi-value tabular-nums">
              {LANDING_DASHBOARD.total}
            </span>
            <span className="landing-kpi-delta tabular-nums">
              {LANDING_DASHBOARD.delta}
            </span>
            <div
              aria-label="카테고리별 지출 비중"
              className="landing-donut"
              role="img"
            >
              <span className="landing-donut__hole tabular-nums">
                {LANDING_DASHBOARD.donutTotal}
              </span>
            </div>
          </div>
          <div className="landing-dash__right">
            {LANDING_DASHBOARD.bars.map((bar) => (
              <div className="landing-barrow" key={bar.category}>
                <span className="landing-barname">
                  <span
                    className="landing-sigdot"
                    style={{ background: categoryVar(bar.category) }}
                  />
                  {bar.category}
                </span>
                <span className="landing-track">
                  <span
                    className="landing-fill"
                    style={{
                      background: categoryVar(bar.category),
                      width: `${bar.share}%`,
                    }}
                  />
                </span>
                <span className="landing-baramt tabular-nums">
                  {bar.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <article
        className="landing-floatcard landing-acc"
        style={
          {
            "--landing-accent": categoryVar(FLOATING.category),
          } as CSSProperties
        }
      >
        <div className="landing-floatcard__flag">
          <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
            <path
              d="M6 1v7M6 10.5v .5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </svg>
          바꿀 지점 5건 중 1
        </div>
        <div className="landing-floatcard__body">
          <div className="landing-icard__head">
            <span className="landing-icard__type">
              <span
                className="landing-sigdot"
                style={{ background: categoryVar(FLOATING.category) }}
              />
              {SIGNAL_TYPE_LABELS[FLOATING.type]}
            </span>
            <span className="landing-icard__impact tabular-nums">
              {FLOATING.impact}
            </span>
          </div>
          <p className="landing-icard__subject">{FLOATING.subject}</p>
          <p className="landing-icard__text">
            구독료가{" "}
            <Highlight evidence="직전 결제 대비 +30.3%">
              9,900원에서 12,900원
            </Highlight>
            으로 올랐습니다.
          </p>
        </div>
      </article>
    </div>
  );
}
