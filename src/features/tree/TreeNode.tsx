import type { TreeNodeProps } from "@shared/types";

export function TreeNode({
  node,
  level,
  onExpand,
  expandedNodes,
  children,
  getValueAtPointer,
  hasMore,
  loading,
  loadMoreRef,
}: TreeNodeProps) {
  const isExpanded = expandedNodes.has(node.pointer);
  const hasChildren = node.has_children;

  const handleToggle = () => {
    if (hasChildren) {
      onExpand(node.pointer);
    }
  };

  const getIcon = () => {
    if (!hasChildren) return "  ";
    return isExpanded ? "▼ " : "▶ ";
  };

  const renderValue = () => {
    if (hasChildren) {
      return <span className="node-preview">{node.preview}</span>;
    }
  };

  return (
    <div className="tree-node">
      <div
        className={`node-header ${hasChildren ? "expandable" : ""}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleToggle}
      >
        <span className="expand-icon">{getIcon()}</span>
        <span className="node-key">{node.key || "root"}: </span>
        {hasChildren ? (
          <>
            {node.child_count > 0 && (
              <span className="child-count">({node.child_count})</span>
            )}
            <span className="node-preview">{node.preview}</span>
          </>
        ) : (
          renderValue()
        )}
      </div>
      {isExpanded && children && (
        <div className="node-children">
          {children.map((child, index) => (
            <TreeNode
              key={`${child.pointer}-${index}`}
              node={child}
              level={level + 1}
              onExpand={onExpand}
              expandedNodes={expandedNodes}
              getValueAtPointer={getValueAtPointer}
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
