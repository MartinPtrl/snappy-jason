import React from "react";
import "./ProgressBar.css";

export interface ProgressBarProps {
  percent: number; // 0-100
  labelPending?: string; // shown while < 100
  labelDone?: string; // shown at 100
  detail?: string; // optional secondary line (e.g., filename)
  onCancel?: () => void; // optional cancel handler to display a button
}

/**
 * Reusable progress bar with sheen effect and smooth completion.
 * Emits a deterministic layout to avoid reflow during updates.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  labelPending = "⏳ Loading JSON file...",
  labelDone = "✅ Parsed",
  detail,
  onCancel,
}) => {
  const p = Math.min(Math.max(isFinite(percent) ? percent : 0, 0), 100);

  return (
    <div className="progress-wrapper loading-indicator">
      <span className="progress-label">
        {p < 100 ? labelPending : labelDone}
      </span>
      {detail && (
        <span className="progress-detail" title={detail}>
          {detail}
        </span>
      )}
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${p}%` }} />
        {p < 95 && <div className="progress-bar-sheen" />}
      </div>
      <span className="progress-percent">{p.toFixed(1)}%</span>
      {onCancel && p < 100 && (
        <button className="progress-cancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
};

export default ProgressBar;
