import { create } from "zustand";

export interface TreeState {
  // State
  expandedNodes: Set<string>;

  // Actions
  setExpandedNodes: (expandedNodes: Set<string>) => void;
  toggleNode: (pointer: string) => void;
  expandAll: (nodePointers: string[]) => void;
  collapseAll: () => void;
  clearTreeState: () => void;
}

export const useTreeStore = create<TreeState>((set) => ({
  // Initial state
  expandedNodes: new Set<string>(),

  // Actions
  setExpandedNodes: (expandedNodes) => set({ expandedNodes }),

  toggleNode: (pointer) =>
    set((state) => {
      const newExpanded = new Set(state.expandedNodes);
      if (newExpanded.has(pointer)) {
        newExpanded.delete(pointer);
      } else {
        newExpanded.add(pointer);
      }
      return { expandedNodes: newExpanded };
    }),

  expandAll: (nodePointers) =>
    set((state) => {
      const newExpanded = new Set(state.expandedNodes);
      nodePointers.forEach(pointer => newExpanded.add(pointer));
      return { expandedNodes: newExpanded };
    }),

  collapseAll: () =>
    set({
      expandedNodes: new Set<string>(),
    }),

  clearTreeState: () =>
    set({
      expandedNodes: new Set<string>(),
    }),
}));
