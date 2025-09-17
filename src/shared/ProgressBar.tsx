import React from "react";
import "./ProgressBar.css";

export interface ProgressBarProps {
  percent: number; // 0-100
  labelPending?: string; // shown while < 100
  labelDone?: string; // shown at 100
  showPercent?: boolean; // default true
  width?: number; // px width of bar (default 260)
  height?: number; // px height (default 10)
  className?: string; // optional class wrapper
}

/**
 * Reusable progress bar with sheen effect and smooth completion.
 * Emits a deterministic layout to avoid reflow during updates.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  labelPending = "⏳ Loading JSON file...",
  labelDone = "✅ Parsed",
  showPercent = true,
  width = 260,
  height = 10,
  className = "loading-indicator",
}) => {
  const p = Math.min(Math.max(isFinite(percent) ? percent : 0, 0), 100);

  return (
    <div className={`progress-wrapper ${className || ""}`.trim()}>
      <span className="progress-label">
        {p < 100 ? labelPending : labelDone}
      </span>
      <div className="progress-bar-container" style={{ width, height }}>
        <div className="progress-bar-fill" style={{ width: `${p}%` }} />
        {p < 95 && <div className="progress-bar-sheen" />}
      </div>
      {showPercent && <span className="progress-percent">{p.toFixed(1)}%</span>}
    </div>
  );
};

export default ProgressBar;
