import React from "react";
import type { SearchOptions } from "./types";

// Utility function to highlight search matches in text
export function highlightText(
  text: string,
  query: string,
  searchOptions: SearchOptions
): React.ReactNode {
  if (!query.trim()) {
    return text;
  }

  try {
    let regex: RegExp;
    
    if (searchOptions.regex) {
      // Use the user's regex pattern
      const flags = searchOptions.caseSensitive ? 'g' : 'gi';
      regex = new RegExp(query, flags);
    } else if (searchOptions.wholeWord) {
      // Create word boundary regex
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = searchOptions.caseSensitive ? 'g' : 'gi';
      regex = new RegExp(`\\b${escapedQuery}\\b`, flags);
    } else {
      // Simple substring match
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = searchOptions.caseSensitive ? 'g' : 'gi';
      regex = new RegExp(escapedQuery, flags);
    }

    // Use a more reliable approach to highlight text
    let lastIndex = 0;
    const result: React.ReactNode[] = [];
    let match;
    let matchIndex = 0;
    let hasMatches = false;

    // Reset regex lastIndex to ensure we start from the beginning
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      hasMatches = true;
      
      // Add text before the match
      if (match.index > lastIndex) {
        result.push(text.substring(lastIndex, match.index));
      }
      
      // Add the highlighted match
      result.push(
        <span key={matchIndex++} className="highlight">
          {match[0]}
        </span>
      );
      
      lastIndex = match.index + match[0].length;
      
      // Prevent infinite loop with zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    // Add remaining text after the last match
    if (lastIndex < text.length) {
      result.push(text.substring(lastIndex));
    }

    return hasMatches ? result : text;
  } catch (error) {
    // If regex is invalid, return original text
    return text;
  }
}