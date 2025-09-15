import type { TreeNodeProps } from "@/shared/types";

export function TreeNode({
  node,
  level,
  onExpand,
  expandedNodes,
  children,
  jsonData,
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
        <span className="expand-icon">{getIcon()}</span>
        <span className="node-key">{node.key || "root"}</span>
        <span
          className="node-type"
          style={{ color: getTypeColor(node.value_type) }}
        >
          {node.value_type}
        </span>
        {node.child_count > 0 && (
          <span className="child-count">({node.child_count})</span>
        )}
        <span className="node-preview">{node.preview}</span>
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
              jsonData={jsonData}
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
