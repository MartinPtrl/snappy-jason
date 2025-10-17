use std::{fs::{File, OpenOptions}, io::{BufReader, Write}};
use serde_json::Value;
use tauri::{async_runtime::spawn_blocking};
use tokio::sync::Mutex;
use crate::types::common::AppState;
use crate::types::{types::Node, progress_reader::ProgressReader};
use crate::utils::tree::list_children;
use arboard::Clipboard;


#[tauri::command]
pub async fn open_file(path: String, state: tauri::State<'_, Mutex<AppState>>, app_handle: tauri::AppHandle) -> Result<Vec<Node>, String> {
    // obtain a cancellation flag clone to share with background thread
    let mut state = state.lock().await;
    state.file_path = Some(path.clone());

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

    let top = list_children(&root, &String::new(), 0, 100);
    state.doc = Some(root);
    Ok(top)
}

// Load JSON from the system clipboard (expects UTF-8 text containing a JSON value).
// Replaces the currently loaded document (if any) after confirmation on the frontend.
// Returns the top-level nodes (first page) similar to open_file.
#[tauri::command]
pub async fn open_clipboard(state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<Node>, String> {
    let mut cb = Clipboard::new().map_err(|e| format!("Clipboard init failed: {e}"))?;
    let text = cb.get_text().map_err(|e| format!("Failed reading clipboard text: {e}"))?;
    // Parse JSON
    let root: Value = serde_json::from_str(&text)
        .map_err(|e| format!("Clipboard does not contain valid JSON: {e}"))?;
    let top = list_children(&root, &String::new(), 0, 100);
    let mut state = state.lock().await;
    state.doc = Some(root);
    Ok(top)
}

#[tauri::command]
pub async fn cancel_parse(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let state = state.lock().await;
    state.cancel_parse.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn load_children(pointer: String, offset: usize, limit: usize, state: tauri::State<'_, Mutex<AppState>>) -> Result<Vec<Node>, String> {
    let state = state.lock().await;
    let root = state.doc.as_ref().ok_or("No document loaded")?;
    Ok(list_children(root, &pointer, offset, limit))
}

#[tauri::command]
pub async fn open_file_dialog(state: tauri::State<'_, Mutex<AppState>>, app: tauri::AppHandle) -> Result<Option<String>, String> {
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
    let result = rx.await
        .map_err(|_| "Dialog was cancelled or failed".to_string())?;

    if let Some(ref path) = &result {
        let mut state = state.lock().await;
        state.file_path = Some(path.clone());
    }

    Ok(result)
}

// Dummy command: Save the current JSON document to the original file
#[tauri::command]
pub async fn save_file(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut state = state.lock().await;
    let content_arc = state.doc.as_ref().ok_or("No file is loaded")?;
    let content = serde_json::to_string_pretty(content_arc).map_err(|_| "Cannot serialize content")?;

    let path = state.file_path.as_mut().ok_or("No file path available")?;

    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(path)
        .map_err(|_| "Could not save file".to_string())?;

    file.write_all(content.as_bytes()).map_err(|_| "Failed to write file")?;

    Ok(())
}

// Save the current JSON document to a new file (with file picker dialog)
#[tauri::command]
pub async fn save_file_as(app: tauri::AppHandle, state: tauri::State<'_, Mutex<AppState>>) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;
    
    // Get the current document
    let state_guard = state.lock().await;
    let doc = state_guard.doc.as_ref().ok_or("No document loaded")?;
    
    // Create a channel for the dialog result
    let (tx, rx) = oneshot::channel();
    
    // Show save file dialog
    app.dialog()
        .file()
        .add_filter("JSON files", &["json"])
        .set_title("Save JSON File As")
        .set_file_name("document.json")
        .save_file(move |file_path| {
            let result = file_path.map(|p| p.to_string());
            let _ = tx.send(result);
        });
    
    // Wait for the dialog result
    let file_path = rx.await
        .map_err(|_| "Dialog was cancelled or failed".to_string())?;
    
    if let Some(path) = file_path {
        // Serialize the document to pretty JSON
        let content = serde_json::to_string_pretty(&doc)
            .map_err(|e| format!("Failed to serialize JSON: {e}"))?;
        
        // Write to the selected file
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&path)
            .map_err(|e| format!("Failed to create file: {e}"))?;
        
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write file: {e}"))?;
        
        // Update the state with the new file path
        let mut state_guard = state.lock().await;
        state_guard.file_path = Some(path.clone());
        
        Ok(Some(path))
    } else {
        // User cancelled the dialog
        Ok(None)
    }
}

// Dummy command: Copy the current JSON document to clipboard as raw/compact format
#[tauri::command]
pub async fn copy_as_raw(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| format!("Clipboard init failed: {e}"))?;
    let state = state.lock().await;
    let root = state.doc.as_ref().ok_or("No document loaded")?;

    let text = serde_json::to_string(root).map_err(|e| format!("Failed to serialize JSON: {e}"))?;
    cb.set_text(text).map_err(|e| format!("Failed to set clipboard text: {e}"))?;

    Ok(())
}

// Dummy command: Copy the current JSON document to clipboard as pretty-printed format
#[tauri::command]
pub async fn copy_as_pretty(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let mut cb = Clipboard::new().map_err(|e| format!("Clipboard init failed: {e}"))?;
    let state = state.lock().await;
    let root = state.doc.as_ref().ok_or("No document loaded")?;

    let text = serde_json::to_string_pretty(root).map_err(|e| format!("Failed to serialize JSON: {e}"))?;
    cb.set_text(text).map_err(|e| format!("Failed to set clipboard text: {e}"))?;

    Ok(())
}