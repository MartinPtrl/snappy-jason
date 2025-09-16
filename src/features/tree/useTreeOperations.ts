import { useCallback } from "react";
import { useTreeStore } from "./treeStore";

export const useTreeOperations = () => {
  const { expandedNodes, toggleNode, clearTreeState } = useTreeStore();

  // Handle node expansion/collapse
  const handleExpand = useCallback(
    (pointer: string) => {
      toggleNode(pointer);
    },
    [toggleNode]
  );

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
    clearTree,
    getValueAtPath,

    // Raw utilities (for components that need them)
    getValueAtPointer: getValueAtPath,
  };
};
