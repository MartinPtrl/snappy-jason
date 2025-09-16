import React from "react";

interface ExpandIconProps {
  onExpand: () => void;
  isExpanded: boolean;
  className?: string;
  title?: string;
}

export function ExpandIcon({
  onExpand,
  isExpanded,
  className = "",
  title,
}: ExpandIconProps) {
  const handleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    onExpand();
  };

  const defaultTitle = isExpanded ? "Collapse all children" : "Expand all children";

  return (
    <button
      className={`expand-icon-btn ${className}`}
      onClick={handleExpand}
      title={title || defaultTitle}
      type="button"
    >
      {isExpanded ? (
        // Minus icon for expanded state
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 6H11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Plus icon for collapsed state
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 1V11M1 6H11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}