import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Node, SearchOptions } from "@/shared/types";
import { useTreeOperations } from "./useTreeOperations";
import { CopyIcon } from "@/shared/CopyIcon";
import { highlightText } from "@/shared/highlightUtils";

interface TreeProps {
  node: Node;
  level: number;
  searchQuery?: string;
  searchOptions?: SearchOptions;
}

export function Tree({ node, level, searchQuery, searchOptions }: TreeProps) {
  const { expandedNodes, handleExpand } = useTreeOperations();
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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
        </span>
        <span
          className="node-type"
          style={{ color: getTypeColor(node.value_type) }}
        >
          {node.value_type}
        </span>
        {node.child_count > 0 && (
          <span className="child-count">({node.child_count})</span>
        )}
        <span className="node-preview copyable-item">
          {searchQuery && searchOptions
            ? highlightText(node.preview, searchQuery, searchOptions)
            : node.preview}
          <CopyIcon text={node.preview} title="Copy value" />
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
