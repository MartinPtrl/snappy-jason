
use serde_json::Value;
use tauri::{async_runtime::spawn_blocking, Emitter};
use tokio::sync::Mutex;
use crate::types::{common::AppState, types::{MatchType, SearchResponse, SearchResult}};
use crate::utils::tree::{text_matches, to_node_with_truncation, create_node_for_path, escape_pointer_token};

#[tauri::command]
pub async fn search(
    query: String,
    search_keys: bool,
    search_values: bool,
    search_paths: bool,
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
    offset: usize,
    limit: usize,
    state: tauri::State<'_, Mutex<AppState>>
) -> Result<SearchResponse, String> {
    // Limit scope of read guard so it's dropped before await (RwLock guard is not Send)
    let guard = state.lock().await;
    let root = guard.doc.as_ref().ok_or("No document loaded")?;
    let root_arc = root.clone();
    drop(guard);

    if query.trim().is_empty() {
        return Ok(SearchResponse { results: vec![], total_count: 0, has_more: false });
    }

    let search_query_owned = check_case_sensitivity(&query, case_sensitive);

    // Offload CPU intensive traversal
    let (all_results, total_count) = spawn_blocking(move || {
        let re = if regex { regex::Regex::new(&query).ok() } else { None };
        let mut collected = Vec::new();
        search_recursive(
            &root_arc,
            &String::new(),
            &search_query_owned,
            re.as_ref(),
            search_keys,
            search_values,
            search_paths,
            case_sensitive,
            whole_word,
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

pub fn search_recursive(
    value: &Value,
    current_pointer: &String,
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
        if let Some(result) = search_path(value, current_pointer, case_sensitive, query, re, whole_word) {
            results.push(result);
        }
    }

    match value {
        Value::Object(map) => {
            for (key, val) in map.iter() {
                let new_pointer = next_pointer(key, current_pointer);

                match val {

                    // Search in keys if enabled
                    _ if search_keys => {
                        if let Some(result) = search_key(current_pointer, query, re, case_sensitive, whole_word, key, val) {
                            results.push(result);
                        }
                    }

                    // Search in values if it's a primitive value
                    _ if search_values => {
                        if let Some(result) = search_value(current_pointer, query, re, case_sensitive, whole_word, key, val) {
                            results.push(result);
                        }
                    },

                    // Recurse into nested structures even if not searching values
                    Value::Array(_) | Value::Object(_) => {
                        search_recursive(val, &new_pointer, query, re, search_keys, search_values, search_paths, case_sensitive, whole_word, results);
                    },
                    _ => {} // Do nothing for primitives if not searching values
                }
            }
        }
        Value::Array(arr) => {
            arr.iter().enumerate().for_each(|(index, item)|{
                let new_pointer = next_pointer(&index.to_string(), current_pointer);
                search_recursive(item, &new_pointer, query, re, search_keys, search_values, search_paths, case_sensitive, whole_word, results);
            });
        }
        // Primitives are handled inside object/array iteration for values
        _ => {}
    }
}

fn search_value(current_pointer: &String, query: &str, re: Option<&regex::Regex>, case_sensitive: bool, whole_word: bool, key: &String, val: &Value) -> Option<SearchResult> {
    let value_to_check = check_case_sensitivity(&val.to_string(), case_sensitive);

    let matches = text_matches(&value_to_check, query, re, whole_word);
    if matches {
        let node = to_node_with_truncation(current_pointer, key, val);
        Some(SearchResult {
            node,
            match_type: MatchType::Value,
            match_text: val.to_string(),
            context: Some(format!("in key: {}", key)),
        });
    }

    None
}

fn search_key(current_pointer: &String, query: &str, re: Option<&regex::Regex>, case_sensitive: bool, whole_word: bool, key: &String, val: &Value) -> Option<SearchResult> {
    let key_to_check = check_case_sensitivity(key, case_sensitive);
    let matches = text_matches(&key_to_check, query, re, whole_word);
    if matches {
        let node = to_node_with_truncation(current_pointer, key, val);
        return Some(SearchResult {
            node,
            match_type: MatchType::Key,
            match_text: key.clone(),
            context: None,
        });
    }
    None
}


fn search_path(value: &Value, current_pointer: &String, case_sensitive: bool, query: &str, re: Option<&regex::Regex>, whole_word: bool) -> Option<SearchResult> {
    let path_to_check = check_case_sensitivity(current_pointer, case_sensitive);
    let matches = text_matches(&path_to_check, query, re, whole_word);
    if matches {
        let node = create_node_for_path(value, current_pointer);
        return Some(SearchResult {
            node,
            match_type: MatchType::Path,
            match_text: current_pointer.to_string(),
            context: None,
        });
    }

    None
}

/// Moves the pointer to the next token by appending the escaped key.
fn next_pointer(key: &String, current_pointer: &String) -> String {
    if current_pointer.is_empty() {
        format!("/{}", escape_pointer_token(key))
    } else {
        format!("{}/{}", current_pointer, escape_pointer_token(key))
    }
}

/// Checks if the query should be case sensitive, and returns the appropriately cased string.
fn check_case_sensitivity(text: &String, case_sensitive: bool) -> String {
    if case_sensitive {
        text.to_string()
    } else {
        text.to_lowercase()
    }
}