// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod state;
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::{fs::{File, create_dir_all}, io::{BufReader, Read}, sync::Arc, path::PathBuf};
use tauri::{Manager, async_runtime::spawn_blocking, Emitter};

fn to_node_with_truncation(parent_ptr: &str, key: Option<&str>, v: &Value, truncate_limit: Option<usize>) -> Node {
    let (value_type, has_children, child_count, preview) = match v {
        Value::Object(m) => ("object".into(), !m.is_empty(), m.len(), format!("{{…}} {} keys", m.len())),
        Value::Array(a) => ("array".into(), !a.is_empty(), a.len(), format!("[…] {} items", a.len())),
        Value::String(s) => ("string".into(), false, 0, 
            if let Some(limit) = truncate_limit {
                truncate(s, limit)
            } else {
                s.to_string()
            }
        ),
        Value::Number(n) => ("number".into(), false, 0, n.to_string()),
        Value::Bool(b) => ("boolean".into(), false, 0, b.to_string()),
        Value::Null => ("null".into(), false, 0, "null".into()),
    };
    let pointer = if let Some(k) = key {
        format!("{}/{}", parent_ptr, escape_pointer_token(k))
    } else {
        parent_ptr.to_string()
    };
    Node { pointer, key: key.map(|s| s.to_string()), value_type, has_children, child_count, preview }
}

#[derive(Serialize)]
struct Node {
    pointer: String,          // JSON Pointer to this node
    key: Option<String>,      // key if object, index if array (as string)
    value_type: String,       // "object" | "array" | "string" | "number" | ...
    has_children: bool,
    child_count: usize,
    preview: String,          // short preview for leafs / strings / numbers
}

#[derive(Serialize)]
struct SearchResult {
    node: Node,
    match_type: String,       // "key", "value", "path"
    match_text: String,       // the actual matched text
    context: Option<String>,  // additional context if needed
}

#[derive(Serialize)]
struct SearchResponse {
    results: Vec<SearchResult>,
    total_count: usize,
    has_more: bool,
}

#[tauri::command]
async fn open_file(path: String, state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<Vec<Node>, String> {
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
                    let percent = if self.total_bytes > 0 { self.read_bytes as f64 / self.total_bytes as f64 * 100.0 } else { 0.0 };
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

#[tauri::command]
fn cancel_parse(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.cancel_parse.store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn load_children(pointer: String, offset: usize, limit: usize, state: tauri::State<'_, AppState>) -> Result<Vec<Node>, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    Ok(list_children(root, &pointer, offset, limit))
}

#[tauri::command]
async fn search(
    query: String,
    search_keys: bool,
    search_values: bool,
    search_paths: bool,
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
    offset: usize,
    limit: usize,
    state: tauri::State<'_, AppState>
) -> Result<SearchResponse, String> {
    // Limit scope of read guard so it's dropped before await (RwLock guard is not Send)
    let root_arc = {
        let guard = state.doc.read();
        let Some(root) = &*guard else { return Err("No document loaded".into()); };
        root.clone()
    }; // guard dropped here

    if query.trim().is_empty() {
        return Ok(SearchResponse { results: vec![], total_count: 0, has_more: false });
    }

    let search_query_owned = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let regex_enable = regex;
    let whole_word_flag = whole_word;
    let case_sensitive_flag = case_sensitive;
    let search_keys_flag = search_keys;
    let search_values_flag = search_values;
    let search_paths_flag = search_paths;
    let query_clone_for_regex = query.clone();

    // Offload CPU intensive traversal
    let (all_results, total_count) = spawn_blocking(move || {
        let re = if regex_enable { regex::Regex::new(&query_clone_for_regex).ok() } else { None };
        let mut collected = Vec::new();
        search_recursive(
            &root_arc,
            "",
            &search_query_owned,
            re.as_ref(),
            search_keys_flag,
            search_values_flag,
            search_paths_flag,
            case_sensitive_flag,
            whole_word_flag,
            &mut collected,
        );
        let total = collected.len();
        (collected, total)
    })
    .await
    .map_err(|e| format!("Join error: {e}"))?;

    let results: Vec<SearchResult> = all_results
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();
    let has_more = offset + limit < total_count;

    Ok(SearchResponse { results, total_count, has_more })
}

fn text_matches(text: &str, query: &str, re: Option<&regex::Regex>, whole_word: bool) -> bool {
    if let Some(re) = re {
        // If regex is enabled, use regex matching
        re.is_match(text)
    } else if whole_word {
        // For whole word matching without regex, we need to check word boundaries
        // Note: text and query should already be case-normalized if needed
        text.split(|c: char| !c.is_alphanumeric())
            .any(|word| word == query)
    } else {
        // Regular substring search
        // Note: text and query should already be case-normalized if needed
        text.contains(query)
    }
}

fn search_recursive(
    value: &Value,
    current_pointer: &str,
    query: &str,
    re: Option<&regex::Regex>,
    search_keys: bool,
    search_values: bool,
    search_paths: bool,
    case_sensitive: bool,
    whole_word: bool,
    results: &mut Vec<SearchResult>,
) {
    // Search in the current path if enabled
    if search_paths {
        let path_to_check = if case_sensitive { current_pointer.to_string() } else { current_pointer.to_lowercase() };
        let matches = text_matches(&path_to_check, query, re, whole_word);
        if matches {
            let node = create_node_for_path(value, current_pointer);
            results.push(SearchResult {
                node,
                match_type: "path".to_string(),
                match_text: current_pointer.to_string(),
                context: None,
            });
        }
    }

    match value {
        Value::Object(map) => {
            for (key, val) in map.iter() {
                let new_pointer = if current_pointer.is_empty() {
                    format!("/{}", escape_pointer_token(key))
                } else {
                    format!("{}/{}", current_pointer, escape_pointer_token(key))
                };

                // Search in keys if enabled
                if search_keys {
                    let key_to_check = if case_sensitive { key.to_string() } else { key.to_lowercase() };
                    let matches = text_matches(&key_to_check, query, re, whole_word);
                    if matches {
                        let node = to_node_with_truncation(current_pointer, Some(key), val, None);
                        results.push(SearchResult {
                            node,
                            match_type: "key".to_string(),
                            match_text: key.clone(),
                            context: None,
                        });
                    }
                }

                // Search in values if it's a primitive value
                if search_values {
                    match val {
                        Value::String(s) => {
                            let value_to_check = if case_sensitive { s.clone() } else { s.to_lowercase() };
                            let matches = text_matches(&value_to_check, query, re, whole_word);
                            if matches {
                                let node = to_node_with_truncation(current_pointer, Some(key), val, None);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: s.clone(),
                                    context: Some(format!("in key: {}", key)),
                                });
                            }
                        }
                        Value::Number(n) => {
                            let num_str = n.to_string();
                            let value_to_check = if case_sensitive { num_str.clone() } else { num_str.to_lowercase() };
                            let matches = text_matches(&value_to_check, query, re, whole_word);
                            if matches {
                                let node = to_node_with_truncation(current_pointer, Some(key), val, None);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: num_str,
                                    context: Some(format!("in key: {}", key)),
                                });
                            }
                        }
                        Value::Bool(b) => {
                            let bool_str = b.to_string();
                            let value_to_check = if case_sensitive { bool_str.clone() } else { bool_str.to_lowercase() };
                            let matches = text_matches(&value_to_check, query, re, whole_word);
                            if matches {
                                let node = to_node_with_truncation(current_pointer, Some(key), val, None);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: bool_str,
                                    context: Some(format!("in key: {}", key)),
                                });
                            }
                        }
                        _ => {
                            // For objects and arrays, recurse into them
                            search_recursive(val, &new_pointer, query, re, search_keys, search_values, search_paths, case_sensitive, whole_word, results);
                        }
                    }
                } else {
                    // If not searching values, still recurse into nested structures
                    match val {
                        Value::Object(_) | Value::Array(_) => {
                            search_recursive(val, &new_pointer, query, re, search_keys, search_values, search_paths, case_sensitive, whole_word, results);
                        }
                        _ => {} // Don't recurse into primitives when not searching values
                    }
                }
            }
        }
        Value::Array(arr) => {
            for (index, item) in arr.iter().enumerate() {
                let new_pointer = format!("{}/{}", current_pointer, index);
                search_recursive(item, &new_pointer, query, re, search_keys, search_values, search_paths, case_sensitive, whole_word, results);
            }
        }
        // Primitives are handled inside object/array iteration for values
        _ => {}
    }
}

fn create_node_for_path(value: &Value, pointer: &str) -> Node {
    let (value_type, has_children, child_count, preview) = match value {
        Value::Object(m) => ("object".into(), !m.is_empty(), m.len(), format!("{{…}} {} keys", m.len())),
        Value::Array(a) => ("array".into(), !a.is_empty(), a.len(), format!("[…] {} items", a.len())),
        Value::String(s) => ("string".into(), false, 0, truncate(s, 120)),
        Value::Number(n) => ("number".into(), false, 0, n.to_string()),
        Value::Bool(b) => ("boolean".into(), false, 0, b.to_string()),
        Value::Null => ("null".into(), false, 0, "null".into()),
    };
    
    // Extract key from pointer
    let key = if pointer.is_empty() {
        None
    } else {
        pointer.split('/').last().map(|s| s.to_string())
    };
    
    Node { 
        pointer: pointer.to_string(), 
        key, 
        value_type, 
        has_children, 
        child_count, 
        preview 
    }
}

fn list_children(root: &Value, pointer: &str, offset: usize, limit: usize) -> Vec<Node> {
    let target = root.pointer(pointer).unwrap_or(root);
    match target {
        Value::Object(map) => map
            .iter()
            .skip(offset)
            .take(limit)
            .map(|(k, v)| to_node_with_truncation(pointer, Some(k), v, None))
            .collect(),
        Value::Array(arr) => arr
            .iter()
            .enumerate()
            .skip(offset)
            .take(limit)
            .map(|(i, v)| to_node_with_truncation(pointer, Some(&i.to_string()), v, None))
            .collect(),
        _ => vec![],
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { s.to_string() } else { format!("{}…", &s[..max]) }
}

// JSON Pointer token escape (~0, ~1)
fn escape_pointer_token(raw: &str) -> String {
    raw.replace('~', "~0").replace('/', "~1")
}

// Get the config file path
fn get_config_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    
    // Ensure the directory exists
    create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    Ok(app_data_dir.join(".snappy"))
}

#[tauri::command]
fn save_last_opened_file(file_path: String, app: tauri::AppHandle) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
    
    std::fs::write(&config_path, file_path)
        .map_err(|e| format!("Failed to save config file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_last_opened_file(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_config_file_path(&app)?;
    
    if !config_path.exists() {
        return Err("No config file found".into());
    }
    
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    
    let file_path = content.trim().to_string();
    
    // Check if the file still exists
    if !std::path::Path::new(&file_path).exists() {
        return Err("Last opened file no longer exists".into());
    }
    
    Ok(file_path)
}

#[tauri::command]
fn clear_last_opened_file(app: tauri::AppHandle) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
    
    if config_path.exists() {
        std::fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove config file: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
fn get_node_value(pointer: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    
    let value = if pointer.is_empty() {
        root.as_ref()
    } else {
        root.pointer(&pointer).ok_or("Invalid pointer")?
    };
    
    serde_json::to_string(value).map_err(|e| e.to_string())
}

pub fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_file, 
            load_children, 
            search,
            cancel_parse,
            save_last_opened_file,
            load_last_opened_file,
            clear_last_opened_file,
            get_node_value
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}