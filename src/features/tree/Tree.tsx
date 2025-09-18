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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState<string>("");
  const [editError, setEditError] = useState<string>("");
  const inputRef = useRef<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  >(null);

  const isScalarEditable =
    node.value_type === "string" ||
    node.value_type === "number" ||
    node.value_type === "boolean";
  const isContainer =
    node.value_type === "object" || node.value_type === "array";

  useEffect(() => {
    if (!isEditing) return;
    if (isContainer) {
      setTimeout(() => {
        if (inputRef.current instanceof HTMLTextAreaElement) {
          inputRef.current.focus();
        }
      }, 0);
      return;
    }
    setEditValue(node.preview.replace(/…$/, ""));
    setTimeout(() => {
      if (node.value_type === "boolean") {
        inputRef.current?.focus?.();
      } else if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.focus();
      }
    }, 0);
  }, [isEditing, node.preview, node.value_type, isContainer]);

  const beginEdit = useCallback(
    async (e: React.MouseEvent) => {
      // Scalars: edit inline
      if (isScalarEditable) {
        e.stopPropagation();
        setIsEditing(true);
        return;
      }
      // Containers: fetch full JSON and open textarea
      if (isContainer) {
        e.stopPropagation();
        try {
          const raw = await invoke<string>("get_node_value", {
            pointer: node.pointer,
          });
          // Pretty-print for objects/arrays
          let pretty = raw;
          try {
            pretty = JSON.stringify(JSON.parse(raw), null, 2);
          } catch (_) {}
          setEditValue(pretty);
          setIsEditing(true);
        } catch (err) {
          console.error("Failed to load subtree", err);
        }
      }
    },
    [isScalarEditable, isContainer, node.pointer]
  );

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  // saveEdit moved below loadChildren so it can reference it without temporal dead zone

  // handleKey moved below saveEdit definition

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

  const saveEdit = useCallback(async () => {
    if (isScalarEditable) {
      let valueToSend = editValue;
      if (node.value_type === "boolean") {
        const lower = valueToSend.trim().toLowerCase();
        if (lower !== "true" && lower !== "false") {
          setEditError("Enter true or false");
          return;
        }
        valueToSend = lower; // normalized
      }
      try {
        const updated = await invoke<Node>("set_node_value", {
          pointer: node.pointer,
          newValue: valueToSend,
        });
        (node as any).preview = updated.preview;
        (node as any).value_type = updated.value_type;
        setIsEditing(false);
        setEditError("");
      } catch (err) {
        console.error("Failed to save value", err);
      }
      return;
    }
    if (isContainer) {
      // Validate JSON and ensure same type
      try {
        const parsed = JSON.parse(editValue);
        const parsedIsObject =
          parsed && typeof parsed === "object" && !Array.isArray(parsed);
        const parsedIsArray = Array.isArray(parsed);
        if (node.value_type === "object" && !parsedIsObject) {
          setEditError("Must remain an object");
          return;
        }
        if (node.value_type === "array" && !parsedIsArray) {
          setEditError("Must remain an array");
          return;
        }
      } catch (err: any) {
        setEditError("JSON parse error");
        return;
      }
      try {
        const updated = await invoke<Node>("set_subtree", {
          pointer: node.pointer,
          newJson: editValue,
        });
        (node as any).preview = updated.preview;
        (node as any).child_count = updated.child_count;
        (node as any).has_children = updated.has_children;
        setIsEditing(false);
        setEditError("");
        // If expanded, refresh children list
        if (expandedNodes.has(node.pointer)) {
          loadChildren(node.pointer, 0, false);
        }
      } catch (err) {
        console.error("Failed to save subtree", err);
        setEditError("Save failed");
      }
    }
  }, [
    editValue,
    isScalarEditable,
    isContainer,
    node,
    expandedNodes,
    loadChildren,
  ]);

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
    // Do not auto-load or show children while editing a container (object/array)
    if (isEditing && isContainer) return;
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
    isEditing,
    isContainer,
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

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit]
  );

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

  // Single vs double click management for header
  const singleClickTimer = useRef<number | null>(null);
  const CLICK_DELAY = 180; // ms threshold to distinguish double-click
  const expandStateAtEditRef = useRef<boolean | null>(null);

  const onHeaderClick = useCallback(
    (_e: React.MouseEvent) => {
      console.log("on header click");
      // If editing, ignore row clicks (we'll restore original state on blur)
      if (isEditing) {
        _e.stopPropagation();
        _e.preventDefault();
        return;
      }
      // Start a timer; if a double-click happens, timer will be cleared in onHeaderDoubleClick
      if (singleClickTimer.current) {
        window.clearTimeout(singleClickTimer.current);
        singleClickTimer.current = null;
        return;
      }
      singleClickTimer.current = window.setTimeout(() => {
        handleToggle();
        singleClickTimer.current = null;
      }, CLICK_DELAY);
    },
    [isEditing, handleToggle]
  );

  const onHeaderDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      console.log("on header double click");
      // Prevent pending single-click expand/collapse
      if (singleClickTimer.current) {
        window.clearTimeout(singleClickTimer.current);
        singleClickTimer.current = null;
      }
      // Record current expansion state once when entering edit
      if (expandStateAtEditRef.current === null) {
        expandStateAtEditRef.current = isExpanded;
      }
      // Enter edit mode only when double-clicking on a value-capable area (preview span triggers its own double-click already)
      // Here we allow double click anywhere on the row EXCEPT the expand icon (which stops propagation) to edit scalars/containers.
      beginEdit(e);
    },
    [beginEdit, isExpanded]
  );

  // When editing ends (save or cancel), restore expansion state if it drifted
  // useEffect(() => {
  //   if (!isEditing && expandStateAtEditRef.current !== null) {
  //     const shouldBeExpanded = expandStateAtEditRef.current;
  //     if (shouldBeExpanded !== isExpanded) {
  //       // Toggle to restore desired state
  //       handleToggle();
  //     }
  //     expandStateAtEditRef.current = null;
  //   }
  // }, [isEditing, isExpanded, handleToggle]);

  useEffect(() => {
    return () => {
      if (singleClickTimer.current)
        window.clearTimeout(singleClickTimer.current);
    };
  }, []);

  return (
    <div className="tree-node">
      <div
        className={`node-header ${hasChildren ? "expandable" : ""}`}
        style={{ paddingLeft: "16px", position: "relative" }}
        onClick={onHeaderClick}
        onDoubleClick={onHeaderDoubleClick}
      >
        {isEditing && (
          <div
            className="edit-click-shield"
            onClick={(e) => {
              e.stopPropagation(); /* absorb */
            }}
            onDoubleClick={(e) => {
              e.stopPropagation(); /* already editing */
            }}
            // Allow blur: do NOT prevent pointer events on editor below header; we only cover header area
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              background: "transparent",
              cursor: "default",
            }}
          />
        )}
        {!(isEditing && isContainer) && hasChildren && (
          <span className="expand-icon">{getIcon}</span>
        )}
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
        {node.child_count > 0 && !(isEditing && isContainer) && (
          <span className="child-count">({node.child_count})</span>
        )}
        {(!isEditing || (isEditing && isContainer)) && (
          <span
            className="node-preview copyable-item"
            style={{
              whiteSpace: effectiveShowFull ? "pre-wrap" : "pre",
              wordBreak: effectiveShowFull ? "break-word" : "normal",
              overflowX: effectiveShowFull ? "visible" : undefined,
              display: "inline-block",
              maxWidth: "100%",
              cursor: isScalarEditable || isContainer ? "text" : undefined,
            }}
            onDoubleClick={beginEdit}
          >
            {previewContent}
            <CopyIcon
              text={node.preview}
              title="Copy value"
              pointer={node.pointer}
            />
            {(isScalarEditable || isContainer) && (
              <button
                type="button"
                className="copy-icon edit-icon"
                title="Edit value"
                onClick={(e) => {
                  e.stopPropagation();
                  beginEdit(e as any);
                }}
                style={{ marginLeft: 4 }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </span>
        )}
      </div>
      {isEditing && !isContainer && (
        <div style={{ marginLeft: "36px", marginTop: 2 }}>
          {node.value_type === "boolean" ? (
            <span style={{ display: "inline-flex", flexDirection: "column" }}>
              <input
                ref={inputRef as any}
                type="text"
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  if (editError) setEditError("");
                }}
                onBlur={() => saveEdit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                className={`tree-edit-input tree-edit-transition-enter ${
                  editError ? "edit-error" : ""
                }`}
                size={Math.min(Math.max(editValue.length + 1, 4), 10)}
                spellCheck={false}
                style={{ width: "auto" }}
              />
              {editError && (
                <span
                  className="tree-edit-error-msg"
                  style={{
                    color: "#e74c3c",
                    fontSize: "0.65rem",
                    marginTop: 2,
                  }}
                >
                  {editError}
                </span>
              )}
            </span>
          ) : (
            <input
              ref={inputRef as any}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => saveEdit()}
              onKeyDown={handleKey}
              className="tree-edit-input tree-edit-transition-enter"
              spellCheck={false}
              size={Math.min(Math.max(editValue.length + 1, 4), 80)}
              style={{ width: "auto" }}
            />
          )}
        </div>
      )}
      {isEditing && isContainer && (
        <div style={{ marginLeft: "36px", marginTop: "4px" }}>
          <div
            style={{
              display: "inline-flex",
              flexDirection: "column",
              width: "100%",
              maxWidth: "640px",
            }}
          >
            <textarea
              ref={inputRef as any}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value);
                if (editError) setEditError("");
              }}
              onBlur={() => saveEdit()}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  saveEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              className={`tree-edit-textarea tree-edit-transition-enter ${
                editError ? "edit-error" : ""
              }`}
              rows={Math.min(20, Math.max(6, editValue.split("\n").length))}
              spellCheck={false}
              style={{
                fontFamily: "monospace",
                fontSize: "0.75rem",
                minWidth: "420px",
              }}
            />
            {editError && (
              <span
                className="tree-edit-error-msg"
                style={{ color: "#e74c3c", fontSize: "0.65rem", marginTop: 2 }}
              >
                {editError}
              </span>
            )}
            <span style={{ fontSize: "0.6rem", opacity: 0.6, marginTop: 2 }}>
              Ctrl/⌘+Enter to save · Esc to cancel
            </span>
          </div>
        </div>
      )}
      {isExpanded && !(isEditing && isContainer) && (
        <div className="node-children" style={{ marginLeft: "20px" }}>
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
