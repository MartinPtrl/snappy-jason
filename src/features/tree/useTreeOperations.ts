import { useCallback } from "react";
import { useTreeStore } from "./treeStore";

export const useTreeOperations = () => {
  const { expandedNodes, toggleNode, expandAll, collapseAll, clearTreeState } = useTreeStore();

  // Handle node expansion/collapse
  const handleExpand = useCallback(
    (pointer: string) => {
      toggleNode(pointer);
    },
    [toggleNode]
  );

  // Expand all nodes with given pointers
  const handleExpandAll = useCallback(
    (nodePointers: string[]) => {
      expandAll(nodePointers);
    },
    [expandAll]
  );

  // Collapse all nodes
  const handleCollapseAll = useCallback(() => {
    collapseAll();
  }, [collapseAll]);

  // Clear all tree state (for file unload, etc.)
  const clearTree = useCallback(() => {
    clearTreeState();
  }, [clearTreeState]);

  // Get value at specific pointer (for frontend expansion)
  const getValueAtPath = useCallback(() => {
    return null;
  }, []);

  return {
    // State
    expandedNodes,

    // Actions
    handleExpand,
    handleExpandAll,
    handleCollapseAll,
    clearTree,
    getValueAtPath,

    // Raw utilities (for components that need them)
    getValueAtPointer: getValueAtPath,
  };
};
