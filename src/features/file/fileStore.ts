import { create } from "zustand";
import type { Node } from "@/shared/types";

export interface FileState {
  // State
  fileName: string;
  loading: boolean;
  error: string;
  nodes: Node[];
  parseProgress: number; // 0-100 percentage of current parse (NaN/undefined if unknown)

  // Actions
  setFileName: (fileName: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setNodes: (nodes: Node[]) => void;
  appendNodes: (nodes: Node[]) => void;
  setParseProgress: (progress: number) => void;
  clearFile: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  // Initial state
  fileName: "",
  loading: false,
  error: "",
  nodes: [],
  parseProgress: 0,

  // Actions
  setFileName: (fileName) => set({ fileName }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setNodes: (nodes) => set({ nodes }),
  appendNodes: (newNodes) =>
    set((state) => ({ nodes: [...state.nodes, ...newNodes] })),
  setParseProgress: (progress) => set({ parseProgress: progress }),
  clearFile: () =>
    set({
      fileName: "",
      loading: false,
      error: "",
      nodes: [],
      parseProgress: 0,
    }),
}));
