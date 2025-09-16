// Core JSON node representation
export interface Node {
  pointer: string;
  key?: string;
  value_type: string;
  has_children: boolean;
  child_count: number;
  preview: string;
}

// Search-related types
export interface SearchResult {
  node: Node;
  match_type: string;
  match_text: string;
  context?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total_count: number;
  has_more: boolean;
}

export interface SearchOptions {
  searchKeys: boolean;
  searchValues: boolean;
  searchPaths: boolean;
  caseSensitive: boolean;
  regex: boolean;
}

// Tree component props
export interface TreeNodeProps {
  node: Node;
  level: number;
  onExpand: (pointer: string) => void;
  expandedNodes: Set<string>;
  children?: Node[];
  getValueAtPointer?: (data: any, pointer: string) => any;
  hasMore?: boolean;
  loading?: boolean;
  loadMoreRef?: React.RefObject<HTMLDivElement | null>;
}
