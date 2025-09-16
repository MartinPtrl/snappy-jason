import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TreeNodeProps, Node } from "@/shared/types";

interface TreeNodeContainerProps extends Omit<TreeNodeProps, "children"> {
  TreeNodeComponent: React.ComponentType<TreeNodeProps>;
}

export function TreeNodeContainer({
  node,
  level,
  onExpand,
  expandedNodes,
  getValueAtPointer,
  TreeNodeComponent,
}: TreeNodeContainerProps) {
  const [children, setChildren] = useState<Node[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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
    [getValueAtPointer, loading]
  );

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

  const handleExpand = useCallback(
    async (pointer: string) => {
      if (expandedNodes.has(pointer)) {
        // Collapse - remove from expanded set
        onExpand(pointer);
        return;
      }

      // Expand - load children if needed
      if (node.pointer === pointer && children.length === 0) {
        await loadChildren(pointer, 0, false);
      }
      onExpand(pointer);
    },
    [node.pointer, children.length, loadChildren, onExpand]
  );

  return (
    <TreeNodeComponent
      node={node}
      level={level}
      onExpand={handleExpand}
      expandedNodes={expandedNodes}
      children={loading ? [] : children}
      getValueAtPointer={getValueAtPointer}
      loadMoreRef={loadMoreRef}
      hasMore={hasMore}
      loading={loading}
    />
  );
}
