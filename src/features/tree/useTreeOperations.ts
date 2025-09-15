import { useCallback } from "react";
import { useTreeStore } from "./treeStore";
import { getValueAtPointer } from "./treeUtils";

export const useTreeOperations = () => {
  const { expandedNodes, jsonData, setJsonData, toggleNode, clearTreeState } =
    useTreeStore();

  // Handle node expansion/collapse
  const handleExpand = useCallback(
    (pointer: string) => {
      toggleNode(pointer);
    },
    [toggleNode]
  );

  // Initialize tree with JSON data for frontend expansion
  const initializeTree = useCallback(
    (data: any) => {
      setJsonData(data);
    },
    [setJsonData]
  );

  // Clear all tree state (for file unload, etc.)
  const clearTree = useCallback(() => {
    clearTreeState();
  }, [clearTreeState]);

  // Get value at specific pointer (for frontend expansion)
  const getValueAtPath = useCallback(
    (pointer: string) => {
      if (!jsonData) return null;
      return getValueAtPointer(jsonData, pointer);
    },
    [jsonData]
  );

  return {
    // State
    expandedNodes,
    jsonData,

    // Actions
    handleExpand,
    initializeTree,
    clearTree,
    getValueAtPath,

    // Raw utilities (for components that need them)
    getValueAtPointer: getValueAtPath,
  };
};
