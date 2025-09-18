import { useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useFileStore } from "./fileStore";
import type { Node } from "@shared/types";

export const useFileOperations = () => {
  const {
    // Multi-file operations
    files,
    addFile,
    updateFile,
    removeFile,
    clearAllFiles,
    getFileById,
    findFileByPath,
  } = useFileStore();

  // Track in-flight file loading requests to prevent duplicates
  const loadingFiles = useRef<Set<string>>(new Set());

  // Config operations
  const saveLastOpenedFile = useCallback(async (filePath: string) => {
    try {
      await invoke("save_last_opened_file", { filePath });
      console.log("💾 Saved last opened file to config:", filePath);
    } catch (error) {
      console.error("Failed to save last opened file:", error);
    }
  }, []);

  const clearLastOpenedFile = useCallback(async () => {
    try {
      await invoke("clear_last_opened_file");
      console.log("🗑️ Cleared last opened file from config");
    } catch (error) {
      console.error("Failed to clear last opened file:", error);
    }
  }, []);

  // Multi-file operations
  const loadFileMulti = useCallback(
    async (
      path: string,
      options?: {
        onSuccess?: (nodes: Node[], fileId: string) => void;
        onError?: (error: string, fileId: string) => void;
      }
    ) => {
      console.log(`🔄 loadFileMulti called with path: ${path}`);
      console.log(`📁 Current files:`, files.map(f => ({ id: f.id, path: f.fullPath })));
      
      // Normalize path for consistent comparison
      const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
      
      // Check if this file is already being loaded
      if (loadingFiles.current.has(normalizedPath)) {
        console.log(`⏳ ALREADY LOADING: File is already being loaded: ${path}`);
        return Promise.resolve(""); // Return empty string for in-flight request
      }
      
      // Check if file with this path already exists using store method
      const existingFile = findFileByPath(path);
      if (existingFile) {
        console.log(`❌ DUPLICATE DETECTED: File already loaded: ${path} (ID: ${existingFile.id})`);
        console.log(`Existing path: ${existingFile.fullPath}, New path: ${path}`);
        // Return the existing file ID and call success callback
        options?.onSuccess?.(existingFile.nodes, existingFile.id);
        return existingFile.id;
      }

      console.log(`✅ NEW FILE: Adding new file: ${path}`);
      
      // Mark this file as being loaded
      loadingFiles.current.add(normalizedPath);

      const fileId = addFile({
        fileName: path.split("/").pop() || path,
        fullPath: path,
        nodes: [],
        loading: true,
        error: "",
        parseProgress: 0,
      });

      // Listen for progress events specific to this file
      const unlistenPromise = listen("parse_progress", (event) => {
        const payload: any = event.payload;
        if (!payload || typeof payload !== "object") return;
        if (payload.fileId !== fileId) return; // ignore other files' progress
        if (payload.canceled) {
          return;
        }
        if (typeof payload.percent === "number") {
          updateFile(fileId, { parseProgress: payload.percent });
        }
      });

      try {
        const result = await invoke<Node[]>("open_file_multi", { path, fileId });
        
        updateFile(fileId, {
          nodes: result,
          loading: false,
          fileName: path.split("/").pop() || path,
        });
        
        options?.onSuccess?.(result, fileId);
        return fileId;
      } catch (error) {
        updateFile(fileId, {
          error: error as string,
          loading: false,
        });
        options?.onError?.(error as string, fileId);
        throw error;
      } finally {
        const unlisten = await unlistenPromise;
        unlisten();
        // Remove from loading set when done
        loadingFiles.current.delete(normalizedPath);
      }
    },
    [findFileByPath, addFile, updateFile, loadingFiles]
  );

  const loadLastOpenedFile = useCallback(
    async (options?: {
      onSuccess?: (nodes: Node[]) => void;
      onError?: (error: string) => void;
    }) => {
      try {
        const filePath = await invoke<string>("load_last_opened_file");
        console.log("📂 Loaded last opened file from config:", filePath);
        if (filePath) {
          // Use multi-file system instead of legacy loadFile
          await loadFileMulti(filePath, {
            onSuccess: (nodes: Node[], fileId: string) => {
              console.log(`Last opened file loaded with ID: ${fileId}`);
              options?.onSuccess?.(nodes);
            },
            onError: (error: string, _fileId: string) => {
              console.error("Last opened file load error:", error);
              options?.onError?.(error);
            },
          });
        }
      } catch (error) {
        console.log("No last opened file found or error:", error);
      }
    },
    [loadFileMulti]
  );

  const removeFileMulti = useCallback(
    async (fileId: string) => {
      try {
        // Get the file info before removing to clear from loading set
        const fileData = getFileById(fileId);
        if (fileData) {
          const normalizedPath = fileData.fullPath.replace(/\\/g, '/').toLowerCase();
          loadingFiles.current.delete(normalizedPath);
          console.log(`🗑️ Removed file from loading tracking: ${normalizedPath}`);
        }
        
        await invoke("remove_file_multi", { fileId });
        removeFile(fileId);
      } catch (error) {
        console.error("Failed to remove file:", error);
      }
    },
    [removeFile, getFileById, loadingFiles]
  );

  const loadMoreNodesMulti = useCallback(
    async (fileId: string, offset: number = 0, limit: number = 100): Promise<Node[]> => {
      try {
        const result = await invoke<Node[]>("load_children_multi", {
          fileId,
          pointer: "",
          offset,
          limit,
        });
        
        if (offset === 0) {
          updateFile(fileId, { nodes: result });
        } else if (result.length) {
          const fileData = getFileById(fileId);
          if (fileData) {
            updateFile(fileId, { nodes: [...fileData.nodes, ...result] });
          }
        }
        return result;
      } catch (error) {
        const errorMessage = `Failed to load more nodes for file ${fileId} at offset ${offset}: ${error}`;
        console.error(errorMessage);
        const fileData = getFileById(fileId);
        if (fileData) {
          updateFile(fileId, { error: errorMessage });
        }
        return [];
      }
    },
    [updateFile, getFileById]
  );

  return {
    // Multi-file state
    files,

    // Multi-file operations
    loadFileMulti,
    loadLastOpenedFile,
    removeFileMulti,
    loadMoreNodesMulti,
    clearAllFiles: () => {
      // Clear the store
      clearAllFiles();
      // Also clear the loading files tracking
      loadingFiles.current.clear();
      console.log("🗑️ Cleared all files and loading tracking");
    },
    getFileById,

    // Config operations (exposed for advanced usage)
    saveLastOpenedFile,
    clearLastOpenedFile,
  };
};
