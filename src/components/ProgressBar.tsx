import type { JSX } from "react";

export function ProgressBar(props: {
  value: number;
  label: string;
}): JSX.Element {
  const value = Math.min(100, Math.max(0, Math.round(props.value)));

  return (
    <div className="progress-bar">
      <div className="progress-bar__header">
        <span className="progress-bar__label">{props.label}</span>
        <span className="progress-bar__value">{value}%</span>
      </div>
      <div
        aria-label={props.label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={value}
        className="progress-bar__track"
        role="progressbar"
      >
        <div
          className="progress-bar__fill"
          data-testid="progress-bar-fill"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
