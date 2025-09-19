use std::{fs::File, io::{BufReader, Read}, sync::Arc};
use serde_json::Value;
use tauri::{async_runtime::spawn_blocking, Emitter};
use crate::state::AppState;
use crate::types::Node;
use crate::tree::list_children;

// Progress reader for tracking file loading progress
struct ProgressReader<R: Read> {
    inner: R,
    read_bytes: u64,
    total_bytes: u64,
    last_emit: u64,
    app_handle: tauri::AppHandle,
    path: String,
    cancel: Arc<std::sync::atomic::AtomicBool>,
}

impl<R: Read> Read for ProgressReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // if canceled, stop reading
        if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok(0);
        }
        let n = self.inner.read(buf)?;
        self.read_bytes += n as u64;
        if self.read_bytes - self.last_emit >= 1024 * 1024 || n == 0 {
            let percent = if self.total_bytes > 0 { 
                self.read_bytes as f64 / self.total_bytes as f64 * 100.0 
            } else { 
                0.0 
            };
            let _ = self.app_handle.emit("parse_progress", serde_json::json!({
                "path": self.path,
                "readBytes": self.read_bytes,
                "totalBytes": self.total_bytes,
                "percent": percent,
                "done": n == 0,
                "canceled": self.cancel.load(std::sync::atomic::Ordering::SeqCst),
            }));
            self.last_emit = self.read_bytes;
        }
        Ok(n)
    }
}

#[tauri::command]
pub async fn open_file(path: String, state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<Vec<Node>, String> {
    let path_clone = path.clone();
    let handle_clone = app_handle.clone();
    // obtain a cancellation flag clone to share with background thread
    let cancel_flag = state.cancel_parse.clone();
    // reset cancel flag at the beginning of a new parse
    cancel_flag.store(false, std::sync::atomic::Ordering::SeqCst);
    
    let root: Value = spawn_blocking(move || {
        let f = File::open(&path_clone).map_err(|e| e.to_string())?;
        let metadata = f.metadata().ok();
        let total_bytes = metadata.map(|m| m.len()).unwrap_or(0);

        let progress_reader = ProgressReader {
            inner: f,
            read_bytes: 0,
            total_bytes,
            last_emit: 0,
            app_handle: handle_clone,
            path: path_clone,
            cancel: cancel_flag,
        };
        let reader = BufReader::new(progress_reader);
        serde_json::from_reader(reader).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Join error: {e}"))??;

    let arc = Arc::new(root);
    let top = list_children(&arc, "", 0, 100);
    *state.doc.write() = Some(arc);
    Ok(top)
}

// Load JSON from the system clipboard (expects UTF-8 text containing a JSON value).
// Replaces the currently loaded document (if any) after confirmation on the frontend.
// Returns the top-level nodes (first page) similar to open_file.
#[tauri::command]
pub fn open_clipboard(state: tauri::State<'_, AppState>) -> Result<Vec<Node>, String> {
    use arboard::Clipboard;
    let mut cb = Clipboard::new().map_err(|e| format!("Clipboard init failed: {e}"))?;
    let text = cb.get_text().map_err(|e| format!("Failed reading clipboard text: {e}"))?;
    // Parse JSON
    let root: Value = serde_json::from_str(&text)
        .map_err(|e| format!("Clipboard does not contain valid JSON: {e}"))?;
    let arc = Arc::new(root);
    let top = list_children(&arc, "", 0, 100);
    *state.doc.write() = Some(arc);
    Ok(top)
}

#[tauri::command]
pub fn cancel_parse(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.cancel_parse.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn load_children(pointer: String, offset: usize, limit: usize, state: tauri::State<'_, AppState>) -> Result<Vec<Node>, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    Ok(list_children(root, &pointer, offset, limit))
}

#[tauri::command]
pub async fn open_file_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;
    
    let (tx, rx) = oneshot::channel();
    
    // Use the app's dialog interface
    app.dialog()
        .file()
        .add_filter("JSON files", &["json"])
        .set_title("Open JSON File")
        .pick_file(move |file_path| {
            let result = file_path.map(|p| p.to_string());
            let _ = tx.send(result);
        });
    
    // Wait for the dialog result
    match rx.await {
        Ok(result) => Ok(result),
        Err(_) => Err("Dialog was cancelled or failed".to_string()),
    }
}