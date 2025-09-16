import React, { useState } from "react";

interface CopyIconProps {
  text: string;
  className?: string;
  title?: string;
}

export function CopyIcon({ text, className = "", title = "Copy to clipboard" }: CopyIconProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000); // Reset after 1 second
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      className={`copy-icon ${className} ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      title={title}
      type="button"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20,6 9,17 4,12"></polyline>
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="m5,15 L5,5 a2,2 0 0,1 2,-2 l10,0"></path>
        </svg>
      )}
    </button>
  );
}