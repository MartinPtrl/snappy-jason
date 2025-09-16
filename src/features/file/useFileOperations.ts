import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFileStore } from "./fileStore";
import type { Node } from "@/shared/types";

export const useFileOperations = () => {
  const {
    fileName,
    loading,
    error,
    nodes,
    setFileName,
    setLoading,
    setError,
    setNodes,
    appendNodes,
    clearFile,
  } = useFileStore();

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

  // File operations
  const loadFile = useCallback(
    async (
      path: string,
      options?: {
        onSuccess?: (nodes: Node[]) => void;
        onError?: (error: string) => void;
      }
    ) => {
      setLoading(true);
      setError("");

      try {
        const result = await invoke<Node[]>("open_file", { path });
        setNodes(result);
        setFileName(path.split("/").pop() || path);

        // Save the file path to config file for next app startup
        await saveLastOpenedFile(path);

        // Call success callback
        options?.onSuccess?.(result);
      } catch (error) {
        console.error("Failed to load file:", error);
        const errorMessage = `Failed to load file: ${error}`;
        setError(errorMessage);
        setNodes([]);
        setFileName("");

        // Call error callback
        options?.onError?.(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    []
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
          loadFile(filePath, options);
        }
      } catch (error) {
        console.log("No last opened file found or error:", error);
      }
    },
    []
  );

  const unloadFile = useCallback(
    async (onComplete?: () => void) => {
      clearFile();

      // Clear the saved file path from config file
      await clearLastOpenedFile();

      // Call completion callback for additional cleanup
      onComplete?.();
    },
    [clearFile]
  );

  // Load more nodes for pagination (root level)
  const loadMoreNodes = useCallback(
    async (offset: number = 0, limit: number = 100): Promise<Node[]> => {
      if (loading) {
        console.warn(
          "File operation already in progress, skipping loadMoreNodes"
        );
        return [];
      }

      try {
        const result = await invoke<Node[]>("load_children", {
          pointer: "",
          offset,
          limit,
        });

        if (offset === 0) {
          setNodes(result);
        } else {
          appendNodes(result);
        }

        return result;
      } catch (error) {
        const errorMessage = `Failed to load more nodes at offset ${offset}: ${error}`;
        console.error(errorMessage);
        setError(errorMessage);
        return [];
      }
    },
    [loading, setNodes, appendNodes, setError]
  );

  return {
    // State
    fileName,
    loading,
    error,
    nodes,

    // Actions
    loadFile,
    loadLastOpenedFile,
    unloadFile,
    loadMoreNodes,

    // Config operations (exposed for advanced usage)
    saveLastOpenedFile,
    clearLastOpenedFile,
  };
};
