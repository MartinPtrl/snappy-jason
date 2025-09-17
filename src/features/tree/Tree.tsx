import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Node, SearchOptions } from "@shared/types";
import { useTreeOperations } from "./useTreeOperations";
import { CopyIcon, ExpandIcon, highlightText } from "@shared";
interface TreeProps {
  node: Node;
  level: number;
  searchQuery?: string;
  searchOptions?: SearchOptions;
  // Optional external control for showing full preview (used in search results header button)
  externalShowFull?: boolean;
  // If true, suppress rendering the internal toggle button inside the Tree header
  suppressInternalToggle?: boolean;
}

export function Tree({
  node,
  level,
  searchQuery,
  searchOptions,
  externalShowFull,
  suppressInternalToggle,
}: TreeProps) {
  const { expandedNodes, handleExpand } = useTreeOperations();
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [showFull, setShowFull] = useState(false);

  const isExpanded = expandedNodes.has(node.pointer);
  const hasChildren = node.has_children;

  // Force re-render when expanded state changes
  useEffect(() => {
    // This effect ensures the component re-renders when expanded state changes
  }, [isExpanded, expandedNodes]);

  const loadChildren = useCallback(
    async (pointer: string, offset = 0, append = false) => {
      if (loading) return; // Prevent concurrent loads

      setLoading(true);
      try {
        const limit = 100; // Load 100 items at a time

        // Backend expansion
        const result = await invoke<Node[]>("load_children", {
          pointer,
          offset,
          limit,
        });

        if (append) {
          setChildren((prev) => [...prev, ...result]);
        } else {
          setChildren(result);
        }
        setLoadedCount(offset + result.length);
        setHasMore(result.length === limit); // If we got a full batch, there might be more
      } catch (error) {
        console.error("Failed to load children:", error);
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  // Expand all children of this node recursively
  const expandNodeChildren = useCallback(
    async (targetPointer: string) => {
      try {
        // Queue to track nodes that need to be expanded
        const expansionQueue: string[] = [targetPointer];
        const processedNodes = new Set<string>();

        while (expansionQueue.length > 0) {
          const currentPointer = expansionQueue.shift()!;

          // Skip if already processed
          if (processedNodes.has(currentPointer)) {
            continue;
          }
          processedNodes.add(currentPointer);

          // Expand the current node
          handleExpand(currentPointer);
          // Wait for expansion to take effect
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Load children of the current node
          const children = await invoke<Node[]>("load_children", {
            pointer: currentPointer,
            offset: 0,
            limit: 10000,
          });

          // Find all expandable children and add them to the queue
          const expandableChildren = children.filter(
            (child) =>
              (child.value_type === "object" || child.value_type === "array") &&
              child.has_children
          );

          // Add all expandable children to the queue for processing
          for (const child of expandableChildren) {
            if (!processedNodes.has(child.pointer)) {
              expansionQueue.push(child.pointer);
            }
          }
        }
      } catch (error) {
        console.error("Failed to expand node children:", error);
      }
    },
    [handleExpand]
  );

  // Function to get the actual JSON value for copying
  const getActualValue = useCallback(async (): Promise<string> => {
    try {
      return await invoke<string>("get_node_value", { pointer: node.pointer });
    } catch (error) {
      console.error("Failed to get actual value:", error);
      throw error;
    }
  }, [node.pointer]);

  // Function to collapse all children recursively
  const collapseAllChildren = useCallback(
    async (targetPointer: string, excludeRoot = false) => {
      try {
        // Collect all expanded descendants in a breadth-first manner
        const allExpandedNodes: string[] = [];
        const queue: string[] = [targetPointer];
        const visited = new Set<string>();

        while (queue.length > 0) {
          const currentPointer = queue.shift()!;

          if (visited.has(currentPointer)) continue;
          visited.add(currentPointer);

          // Only process if this node is expanded
          if (expandedNodes.has(currentPointer)) {
            // Add to collapse list, but exclude root if requested
            if (!excludeRoot || currentPointer !== targetPointer) {
              allExpandedNodes.push(currentPointer);
            }

            // Load children and add expandable ones to queue
            const childNodes = await invoke<Node[]>("load_children", {
              pointer: currentPointer,
              offset: 0,
              limit: 10000,
            });

            for (const child of childNodes) {
              if (
                (child.value_type === "object" ||
                  child.value_type === "array") &&
                child.has_children &&
                !visited.has(child.pointer)
              ) {
                queue.push(child.pointer);
              }
            }
          }
        }

        // Collapse all nodes (deepest first by reversing the array)
        allExpandedNodes.reverse();
        for (const pointer of allExpandedNodes) {
          handleExpand(pointer); // This toggles, so it will collapse expanded nodes
        }
      } catch (error) {
        console.error("Failed to collapse all children:", error);
      }
    },
    [expandedNodes, handleExpand]
  );

  // Function to toggle between expand all and collapse all
  const handleExpandCollapseAll = useCallback(async () => {
    if (isExpanded) {
      // If node is expanded, collapse all its children first, then collapse the node itself
      await collapseAllChildren(node.pointer, true); // Exclude root from children collapse
      handleExpand(node.pointer); // Then collapse the root node
    } else {
      // If node is collapsed, expand it and all its children
      await expandNodeChildren(node.pointer);
    }
  }, [
    isExpanded,
    collapseAllChildren,
    expandNodeChildren,
    node.pointer,
    handleExpand,
  ]);

  // Load children if this node should be expanded but has no children loaded
  useEffect(() => {
    if (isExpanded && hasChildren && children.length === 0 && !loading) {
      loadChildren(node.pointer, 0, false);
    }
  }, [
    isExpanded,
    hasChildren,
    children.length,
    loading,
    node.pointer,
    loadChildren,
  ]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          loadChildren(node.pointer, loadedCount, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, loading, loadedCount, node.pointer, loadChildren]);

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      if (!isExpanded) {
        // Load children when expanding
        loadChildren(node.pointer, 0, false);
      }
      handleExpand(node.pointer);
    } else {
      // For primitive values, still allow expand/collapse for consistency
      handleExpand(node.pointer);
    }
  }, [
    hasChildren,
    isExpanded,
    handleExpand,
    node.pointer,
    children.length,
    loadChildren,
  ]);

  const getIcon = useMemo(() => {
    if (!hasChildren) return "  ";
    return isExpanded ? "▼ " : "▶ ";
  }, [hasChildren, isExpanded]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "object":
        return "#e67e22";
      case "array":
        return "#9b59b6";
      case "string":
        return "#27ae60";
      case "number":
        return "#3498db";
      case "boolean":
        return "#e74c3c";
      case "null":
        return "#95a5a6";
      default:
        return "#34495e";
    }
  };

  // Compute preview rendering and whether a toggle should be shown
  const effectiveShowFull =
    externalShowFull !== undefined ? externalShowFull : showFull;

  const { previewContent, canTogglePreview } = useMemo(() => {
    // No search context -> just show preview (no toggle)
    if (!(searchQuery && searchOptions)) {
      return { previewContent: node.preview, canTogglePreview: false };
    }

    const raw = node.preview;
    // When explicitly showing full, highlight entire preview
    if (effectiveShowFull) {
      return {
        previewContent: highlightText(raw, searchQuery, searchOptions),
        canTogglePreview: true,
      };
    }

    const q = searchOptions.caseSensitive
      ? searchQuery
      : searchQuery.toLowerCase();
    const hay = searchOptions.caseSensitive ? raw : raw.toLowerCase();
    const idx = hay.indexOf(q);
    if (idx === -1) {
      // No match -> just do normal highlight, no toggle needed
      return {
        previewContent: highlightText(raw, searchQuery, searchOptions),
        canTogglePreview: false,
      };
    }
    // Build a focused snippet around first occurrence
    const CONTEXT = 60; // chars before and after
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(raw.length, idx + q.length + CONTEXT);
    const prefixEllipsis = start > 0 ? "…" : "";
    const suffixEllipsis = end < raw.length ? "…" : "";
    const snippet = prefixEllipsis + raw.slice(start, end) + suffixEllipsis;

    return {
      previewContent: highlightText(snippet, searchQuery, searchOptions),
      canTogglePreview: prefixEllipsis !== "" || suffixEllipsis !== "",
    };
  }, [node.preview, searchQuery, searchOptions, effectiveShowFull]);

  return (
    <div className="tree-node">
      <div
        className={`node-header ${hasChildren ? "expandable" : ""}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleToggle}
      >
        <span className="expand-icon">{getIcon}</span>
        <span className="node-key copyable-item">
          {searchQuery && searchOptions
            ? highlightText(node.key || "root", searchQuery, searchOptions)
            : node.key || "root"}
          <CopyIcon text={node.key || "root"} title="Copy key" />
          {node.child_count > 0 && (
            <ExpandIcon
              onExpand={handleExpandCollapseAll}
              isExpanded={isExpanded}
            />
          )}
        </span>
        {canTogglePreview && !suppressInternalToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowFull((v) => !v);
            }}
            title={showFull ? "Show less" : "Show full"}
            style={{
              marginLeft: 8,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#0a84ff",
              cursor: "pointer",
              fontSize: "0.85em",
            }}
          >
            {showFull ? "Show less" : "Show full"}
          </button>
        )}
        <span
          className="node-type"
          style={{ color: getTypeColor(node.value_type) }}
        >
          {node.value_type}
        </span>
        {node.child_count > 0 && (
          <span className="child-count">({node.child_count})</span>
        )}
        <span
          className="node-preview copyable-item"
          style={{
            whiteSpace: effectiveShowFull ? "pre-wrap" : "pre",
            wordBreak: effectiveShowFull ? "break-word" : "normal",
            overflowX: effectiveShowFull ? "visible" : undefined,
            display: "inline-block",
            maxWidth: "100%",
          }}
        >
          {previewContent}
          <CopyIcon
            text={node.preview}
            title="Copy value"
            getActualValue={
              (node.value_type === "object" || node.value_type === "array") &&
              node.has_children
                ? getActualValue
                : undefined
            }
          />
        </span>
      </div>
      {isExpanded && (
        <div className="node-children">
          {children.map((child, index) => (
            <Tree
              key={`${child.pointer}-${index}`}
              node={child}
              level={level + 1}
              searchQuery={searchQuery}
              searchOptions={searchOptions}
            />
          ))}
          {hasMore && (
            <div
              ref={loadMoreRef}
              className="infinite-scroll-trigger"
              style={{
                height: "1px",
                paddingLeft: `${(level + 1) * 20}px`,
                opacity: 0.5,
              }}
            >
              {loading && (
                <div
                  style={{ fontSize: "12px", color: "#666", padding: "4px 0" }}
                >
                  Loading...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
