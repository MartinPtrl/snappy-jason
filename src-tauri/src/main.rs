// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod state;
use crate::state::AppState;
use serde::Serialize;
use serde_json::Value;
use std::{fs::{File, create_dir_all}, io::BufReader, sync::Arc, path::PathBuf};
use tauri::Manager;

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
fn open_file(path: String, state: tauri::State<'_, AppState>) -> Result<Vec<Node>, String> {
    let f = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);
    // MVP: serde_json; swap to simd-json later
    let root: Value = serde_json::from_reader(reader).map_err(|e| e.to_string())?;
    let arc = Arc::new(root);
    let top = list_children(&arc, "", 0, 100); // Load first 100 top-level children
    *state.doc.write() = Some(arc);
    Ok(top)
}

#[tauri::command]
fn load_children(pointer: String, offset: usize, limit: usize, state: tauri::State<'_, AppState>) -> Result<Vec<Node>, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    Ok(list_children(root, &pointer, offset, limit))
}

#[tauri::command]
fn search(
    query: String, 
    search_keys: bool, 
    search_values: bool, 
    search_paths: bool,
    case_sensitive: bool,
    offset: usize, 
    limit: usize, 
    state: tauri::State<'_, AppState>
) -> Result<SearchResponse, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    
    if query.trim().is_empty() {
        return Ok(SearchResponse {
            results: vec![],
            total_count: 0,
            has_more: false,
        });
    }
    
    let search_query = if case_sensitive { query } else { query.to_lowercase() };
    let mut all_results = Vec::new();
    
    search_recursive(root, "", &search_query, search_keys, search_values, search_paths, case_sensitive, &mut all_results);
    
    let total_count = all_results.len();
    let results: Vec<SearchResult> = all_results
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect();
    
    let has_more = offset + limit < total_count;
    
    Ok(SearchResponse {
        results,
        total_count,
        has_more,
    })
}

fn search_recursive(
    value: &Value,
    current_pointer: &str,
    query: &str,
    search_keys: bool,
    search_values: bool,
    search_paths: bool,
    case_sensitive: bool,
    results: &mut Vec<SearchResult>,
) {
    // Search in the current path if enabled
    if search_paths {
        let path_to_check = if case_sensitive { current_pointer.to_string() } else { current_pointer.to_lowercase() };
        if path_to_check.contains(query) {
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
                    if key_to_check.contains(query) {
                        let node = to_node(current_pointer, Some(key), val);
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
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(key), val);
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
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(key), val);
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
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(key), val);
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
                            search_recursive(val, &new_pointer, query, search_keys, search_values, search_paths, case_sensitive, results);
                        }
                    }
                } else {
                    // If not searching values, still recurse into nested structures
                    match val {
                        Value::Object(_) | Value::Array(_) => {
                            search_recursive(val, &new_pointer, query, search_keys, search_values, search_paths, case_sensitive, results);
                        }
                        _ => {} // Don't recurse into primitives when not searching values
                    }
                }
            }
        }
        Value::Array(arr) => {
            for (index, val) in arr.iter().enumerate() {
                let new_pointer = if current_pointer.is_empty() {
                    format!("/{}", index)
                } else {
                    format!("{}/{}", current_pointer, index)
                };

                // Search in values if it's a primitive value
                if search_values {
                    match val {
                        Value::String(s) => {
                            let value_to_check = if case_sensitive { s.clone() } else { s.to_lowercase() };
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(&index.to_string()), val);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: s.clone(),
                                    context: Some(format!("at index: {}", index)),
                                });
                            }
                        }
                        Value::Number(n) => {
                            let num_str = n.to_string();
                            let value_to_check = if case_sensitive { num_str.clone() } else { num_str.to_lowercase() };
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(&index.to_string()), val);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: num_str,
                                    context: Some(format!("at index: {}", index)),
                                });
                            }
                        }
                        Value::Bool(b) => {
                            let bool_str = b.to_string();
                            let value_to_check = if case_sensitive { bool_str.clone() } else { bool_str.to_lowercase() };
                            if value_to_check.contains(query) {
                                let node = to_node(current_pointer, Some(&index.to_string()), val);
                                results.push(SearchResult {
                                    node,
                                    match_type: "value".to_string(),
                                    match_text: bool_str,
                                    context: Some(format!("at index: {}", index)),
                                });
                            }
                        }
                        _ => {
                            // For objects and arrays, recurse into them
                            search_recursive(val, &new_pointer, query, search_keys, search_values, search_paths, case_sensitive, results);
                        }
                    }
                } else {
                    // If not searching values, still recurse into nested structures
                    match val {
                        Value::Object(_) | Value::Array(_) => {
                            search_recursive(val, &new_pointer, query, search_keys, search_values, search_paths, case_sensitive, results);
                        }
                        _ => {} // Don't recurse into primitives when not searching values
                    }
                }
            }
        }
        _ => {
            // For primitive values at root level, search if enabled
            if search_values {
                match value {
                    Value::String(s) => {
                        let value_to_check = if case_sensitive { s.clone() } else { s.to_lowercase() };
                        if value_to_check.contains(query) {
                            let node = create_node_for_path(value, current_pointer);
                            results.push(SearchResult {
                                node,
                                match_type: "value".to_string(),
                                match_text: s.clone(),
                                context: None,
                            });
                        }
                    }
                    Value::Number(n) => {
                        let num_str = n.to_string();
                        let value_to_check = if case_sensitive { num_str.clone() } else { num_str.to_lowercase() };
                        if value_to_check.contains(query) {
                            let node = create_node_for_path(value, current_pointer);
                            results.push(SearchResult {
                                node,
                                match_type: "value".to_string(),
                                match_text: num_str,
                                context: None,
                            });
                        }
                    }
                    Value::Bool(b) => {
                        let bool_str = b.to_string();
                        let value_to_check = if case_sensitive { bool_str.clone() } else { bool_str.to_lowercase() };
                        if value_to_check.contains(query) {
                            let node = create_node_for_path(value, current_pointer);
                            results.push(SearchResult {
                                node,
                                match_type: "value".to_string(),
                                match_text: bool_str,
                                context: None,
                            });
                        }
                    }
                    _ => {}
                }
            }
        }
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
            .map(|(k, v)| to_node(pointer, Some(k), v))
            .collect(),
        Value::Array(arr) => arr
            .iter()
            .enumerate()
            .skip(offset)
            .take(limit)
            .map(|(i, v)| to_node(pointer, Some(&i.to_string()), v))
            .collect(),
        _ => vec![],
    }
}

fn to_node(parent_ptr: &str, key: Option<&str>, v: &Value) -> Node {
    let (value_type, has_children, child_count, preview) = match v {
        Value::Object(m) => ("object".into(), !m.is_empty(), m.len(), format!("{{…}} {} keys", m.len())),
        Value::Array(a) => ("array".into(), !a.is_empty(), a.len(), format!("[…] {} items", a.len())),
        Value::String(s) => ("string".into(), false, 0, truncate(s, 120)),
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

pub fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_file, 
            load_children, 
            search,
            save_last_opened_file,
            load_last_opened_file,
            clear_last_opened_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}