import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect } from "react";
import { useFileOperations } from "./useFileOperations";

export function useRestoreLastFileEffect() {
  const { loadFile } = useFileOperations();

  // Auto-load last file on startup
  const restoreLastFile = useCallback(async () => {
    try {
      const filePath = await invoke<string>("load_last_opened_file");
      console.log("📂 Loaded last opened file from config:", filePath);
      if (filePath) {
        console.log("🔄 Restoring last opened file:", filePath);
        await loadFile(filePath);
      }
    } catch (error) {
      console.log("No last opened file found or error:", error);
    }
  }, [loadFile]);

  useEffect(() => {
    restoreLastFile();
  }, [restoreLastFile]);
}
