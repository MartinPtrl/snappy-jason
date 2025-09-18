import { create } from "zustand";
import type { Node } from "@shared/types";

export interface FileData {
  id: string; // unique identifier for the file
  fileName: string;
  fullPath: string;
  nodes: Node[];
  loading: boolean;
  error: string;
  parseProgress: number;
}

export interface FileState {
  // State
  files: FileData[];
  
  // Actions
  addFile: (fileData: Omit<FileData, 'id'>) => string; // returns the file ID
  updateFile: (id: string, updates: Partial<FileData>) => void;
  removeFile: (id: string) => void;
  clearAllFiles: () => void;
  getFileById: (id: string) => FileData | undefined;
  findFileByPath: (path: string) => FileData | undefined; // helper to find by path
}

export const useFileStore = create<FileState>((set, get) => ({
  // Initial state
  files: [],

  // Multi-file actions
  addFile: (fileData) => {
    const id = crypto.randomUUID();
    const newFile: FileData = { ...fileData, id };
    set((state) => ({
      files: [...state.files, newFile],
    }));
    return id;
  },

  updateFile: (id, updates) => {
    set((state) => ({
      files: state.files.map(file => 
        file.id === id ? { ...file, ...updates } : file
      ),
    }));
  },

  removeFile: (id) => {
    set((state) => ({
      files: state.files.filter(file => file.id !== id),
    }));
  },

  clearAllFiles: () => {
    set({ files: [] });
  },

  getFileById: (id) => {
    return get().files.find(file => file.id === id);
  },

  findFileByPath: (path) => {
    const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
    return get().files.find(file => 
      file.fullPath.replace(/\\/g, '/').toLowerCase() === normalizedPath
    );
  },
}));
