import { useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useFileStore } from "./fileStore";
import type { Node } from "@shared/types";

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
    setParseProgress,
    clearFile,
    parseProgress,
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
  const latestRequestIdRef = useRef(0);
  // Separate in-flight flag for pagination to avoid blocking when initial file load finished
  const loadingMoreRef = useRef(false);

  const loadFile = useCallback(
    async (
      path: string,
      options?: {
        onSuccess?: (nodes: Node[]) => void;
        onError?: (error: string) => void;
      }
    ) => {
      setLoading(true);
      setParseProgress(0);
      setError("");
      // Set a provisional filename early so UI can display it during parsing
      setFileName(path.split("/").pop() || path);

      const currentId = ++latestRequestIdRef.current;

      // Listen for progress events specific to this path
      const unlistenPromise = listen("parse_progress", (event) => {
        const payload: any = event.payload;
        if (!payload || typeof payload !== "object") return;
        if (payload.path !== path) return; // ignore other files' progress
        if (latestRequestIdRef.current !== currentId) return; // stale request
        if (payload.canceled) {
          // Let cancel handler manage state; just ignore further updates
          return;
        }
        if (typeof payload.percent === "number") {
          setParseProgress(payload.percent);
        }
      });

      try {
        const result = await invoke<Node[]>("open_file", { path });

        // Ignore stale results if a newer request started during await
        if (latestRequestIdRef.current !== currentId) {
          console.warn("Ignored stale file load result for", path);
          return;
        }

        setNodes(result);
        setFileName(path.split("/").pop() || path);
        await saveLastOpenedFile(path);
        options?.onSuccess?.(result);
      } catch (error) {
        if (latestRequestIdRef.current !== currentId) {
          return; // error from stale request; silently drop
        }
        console.error("Failed to load file:", error);
        const errorMessage = `Failed to load file: ${error}`;
        setError(errorMessage);
        setNodes([]);
        setFileName("");
        options?.onError?.(errorMessage);
      }
      // Finally section outside catch for shared cleanup
      if (latestRequestIdRef.current === currentId) {
        // If parse finished naturally and not canceled, ensure progress shows 100
        if (parseProgress < 100) {
          setParseProgress(100);
        }
        // Delay clearing loading very slightly to allow bar to visually reach 100%
        setTimeout(() => {
          if (latestRequestIdRef.current === currentId) {
            setLoading(false);
          }
        }, 120);
      }
      try {
        const unlisten = await unlistenPromise;
        unlisten();
      } catch (_) {
        /* ignore */
      }
    },
    []
  );

  // Load JSON from clipboard (Rust side parses clipboard content)
  const loadClipboard = useCallback(
    async (options?: {
      onSuccess?: (nodes: Node[]) => void;
      onError?: (error: string) => void;
    }) => {
      setLoading(true);
      setParseProgress(0);
      setError("");
      setFileName("[Clipboard]");
      // Invalidate any file parsing request
      latestRequestIdRef.current++;
      try {
        const result = await invoke<Node[]>("open_clipboard");
        setNodes(result);
        setFileName("[Clipboard]");
        // When loading from clipboard we clear persisted last opened file path
        await clearLastOpenedFile();
        options?.onSuccess?.(result);
      } catch (error) {
        console.error("Failed to load clipboard JSON:", error);
        const msg = `Failed to load clipboard JSON: ${error}`;
        setError(msg);
        setNodes([]);
        setFileName("");
        options?.onError?.(msg);
      } finally {
        // Show instant completion
        setParseProgress(100);
        setTimeout(() => setLoading(false), 50);
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

  const openFileDialog = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>("open_file_dialog");
      if (filePath) {
        console.log("📂 Selected file from dialog:", filePath);
        loadFile(filePath);
      } else {
        console.log("📂 File dialog cancelled");
      }
    } catch (error) {
      console.error("Failed to open file dialog:", error);
      setError("Failed to open file dialog");
    }
  }, [loadFile, setError]);

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

  // Cancel current loading/parsing
  const cancelLoad = useCallback(async () => {
    try {
      await invoke("cancel_parse");
    } catch (e) {
      console.warn("cancel_parse failed or unavailable:", e);
    }
    // Invalidate the in-flight request so its eventual result/error is ignored
    latestRequestIdRef.current++;
    // Reset UI state; do not persist last opened file on cancel
    setLoading(false);
    setParseProgress(0);
    setError("");
    setNodes([]);
    setFileName("");
  }, []);

  // Load more nodes for pagination (root level)
  const loadMoreNodes = useCallback(
    async (offset: number = 0, limit: number = 100): Promise<Node[]> => {
      if (loadingMoreRef.current) {
        return [];
      }
      loadingMoreRef.current = true;
      try {
        const result = await invoke<Node[]>("load_children", {
          pointer: "",
          offset,
          limit,
        });
        if (offset === 0) {
          setNodes(result);
        } else if (result.length) {
          appendNodes(result);
        }
        return result;
      } catch (error) {
        const errorMessage = `Failed to load more nodes at offset ${offset}: ${error}`;
        console.error(errorMessage);
        setError(errorMessage);
        return [];
      } finally {
        loadingMoreRef.current = false;
      }
    },
    [setNodes, appendNodes, setError]
  );

  return {
    // State
    fileName,
    loading,
    error,
    nodes,
    // progress
    // (Consumers can show an indeterminate bar if still 0 after e.g. 300ms, until first event arrives.)
    parseProgress,

    // Actions
    loadFile,
    loadClipboard,
    loadLastOpenedFile,
    openFileDialog,
    unloadFile,
    cancelLoad,
    loadMoreNodes,

    // Config operations (exposed for advanced usage)
    saveLastOpenedFile,
    clearLastOpenedFile,
  };
};
