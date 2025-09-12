import { create } from "zustand";
import type { Node } from "@/shared/types";

export interface FileState {
  // State
  fileName: string;
  loading: boolean;
  error: string;
  nodes: Node[];

  // Actions
  setFileName: (fileName: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setNodes: (nodes: Node[]) => void;
  appendNodes: (nodes: Node[]) => void;
  clearFile: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  // Initial state
  fileName: "",
  loading: false,
  error: "",
  nodes: [],

  // Actions
  setFileName: (fileName) => set({ fileName }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setNodes: (nodes) => set({ nodes }),
  appendNodes: (newNodes) =>
    set((state) => ({ nodes: [...state.nodes, ...newNodes] })),
  clearFile: () =>
    set({
      fileName: "",
      loading: false,
      error: "",
      nodes: [],
    }),
}));
