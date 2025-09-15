import { create } from "zustand";

export interface TreeState {
  // State
  expandedNodes: Set<string>;
  jsonData: any | null;

  // Actions
  setExpandedNodes: (expandedNodes: Set<string>) => void;
  setJsonData: (jsonData: any | null) => void;
  toggleNode: (pointer: string) => void;
  clearTreeState: () => void;
}

export const useTreeStore = create<TreeState>((set) => ({
  // Initial state
  expandedNodes: new Set<string>(),
  jsonData: null,

  // Actions
  setExpandedNodes: (expandedNodes) => set({ expandedNodes }),
  setJsonData: (jsonData) => set({ jsonData }),

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

  clearTreeState: () =>
    set({
      expandedNodes: new Set<string>(),
      jsonData: null,
    }),
}));
