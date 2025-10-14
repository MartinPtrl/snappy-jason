use std::{fs::File, io::{BufReader}, sync::Arc};
use serde_json::Value;
use tauri::{async_runtime::spawn_blocking};
use crate::types::common::AppState;
use crate::types::{types::Node, progress_reader::ProgressReader};
use crate::utils::tree::list_children;


#[tauri::command]
pub async fn open_file(path: String, state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<Vec<Node>, String> {
    // obtain a cancellation flag clone to share with background thread
    let cancel_flag = state.cancel_parse.clone();
    // reset cancel flag at the beginning of a new parse
    cancel_flag.store(false, std::sync::atomic::Ordering::SeqCst);
    
    let root = spawn_blocking(move || {
        let f = File::open(&path).map_err(|e| e.to_string())?;
        let metadata = f.metadata().ok();
        let total_bytes = metadata.map(|m| m.len()).unwrap_or(0);

        let progress_reader = ProgressReader {
            inner: f,
            read_bytes: 0,
            total_bytes,
            last_emit: 0,
            app_handle: app_handle,
            path: path,
            cancel: cancel_flag,
        };
        let reader = BufReader::new(progress_reader);
        serde_json::from_reader(reader).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Join error: {e}"))??;

    let arc = Arc::new(root);
    let top = list_children(&arc, &String::new(), 0, 100);
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
    let top = list_children(&arc, &String::new(), 0, 100);
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
    let root = guard.as_ref().ok_or("No document loaded")?;
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
    rx.await
        .map_err(|_| "Dialog was cancelled or failed".to_string())
}