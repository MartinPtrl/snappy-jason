use serde_json::Value;
use tauri::{async_runtime::spawn_blocking, Emitter};
use crate::state::AppState;
use crate::types::{SearchResult, SearchResponse};
use crate::tree::{text_matches, to_node_with_truncation, create_node_for_path, escape_pointer_token};

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

// Streaming search: emits incremental batches so UI can render partial results.
// Events:
//  - "search_batch" { id, batch: [SearchResult], total_so_far, elapsed_ms }
//  - "search_done" { id, total, elapsed_ms }
#[tauri::command]
pub async fn search_stream(
    query: String,
    search_keys: bool,
    search_values: bool,
    search_paths: bool,
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>
) -> Result<u64, String> {
    let root_arc = {
        let guard = state.doc.read();
        let Some(root) = &*guard else { return Err("No document loaded".into()); };
        root.clone()
    };
    if query.trim().is_empty() { return Err("Empty query".into()); }

    let case_sensitive_flag = case_sensitive;
    let query_norm = if case_sensitive_flag { query.clone() } else { query.to_lowercase() };
    let re_opt = if regex { regex::Regex::new(&query).ok() } else { None };
    let batch_size: usize = 10; // default batch size

    let id = state.active_search_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let handle_clone = app_handle.clone();

    spawn_blocking(move || {
        let mut stack: Vec<(&Value, String)> = vec![(root_arc.as_ref(), String::from(""))];
        let mut total_so_far: usize = 0;
        let start_instant = std::time::Instant::now();
        let mut batch: Vec<SearchResult> = Vec::with_capacity(batch_size);

        while let Some((value, pointer)) = stack.pop() {
            // path match
            if search_paths {
                let path_check = if case_sensitive_flag { pointer.clone() } else { pointer.to_lowercase() };
                let path_match = if let Some(re) = &re_opt { 
                    re.is_match(&path_check) 
                } else if whole_word { 
                    path_check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                } else { 
                    path_check.contains(&query_norm) 
                };
                if path_match {
                    batch.push(SearchResult {
                        node: create_node_for_path(value, &pointer),
                        match_type: "path".into(),
                        match_text: pointer.clone(),
                        context: None,
                    });
                }
            }
            match value {
                Value::Object(map) => {
                    for (k, v) in map.iter() {
                        if search_keys {
                            let key_check = if case_sensitive_flag { k.to_string() } else { k.to_lowercase() };
                            let key_match = if let Some(re) = &re_opt { 
                                re.is_match(&key_check) 
                            } else if whole_word { 
                                key_check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                            } else { 
                                key_check.contains(&query_norm) 
                            };
                            if key_match {
                                batch.push(SearchResult {
                                    node: to_node_with_truncation(&pointer, Some(k), v, None),
                                    match_type: "key".into(),
                                    match_text: k.clone(),
                                    context: None,
                                });
                            }
                        }
                        if search_values {
                            match v {
                                Value::String(s) => {
                                    let check = if case_sensitive_flag { s.clone() } else { s.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match {
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(k), v, None), 
                                            match_type: "value".into(), 
                                            match_text: s.clone(), 
                                            context: Some(format!("in key: {}", k)) 
                                        });
                                    }
                                }
                                Value::Number(n) => {
                                    let num_str = n.to_string();
                                    let check = if case_sensitive_flag { num_str.clone() } else { num_str.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match { 
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(k), v, None), 
                                            match_type: "value".into(), 
                                            match_text: num_str, 
                                            context: Some(format!("in key: {}", k)) 
                                        }); 
                                    }
                                }
                                Value::Bool(b) => {
                                    let bool_str = b.to_string();
                                    let check = if case_sensitive_flag { bool_str.clone() } else { bool_str.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match { 
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(k), v, None), 
                                            match_type: "value".into(), 
                                            match_text: bool_str, 
                                            context: Some(format!("in key: {}", k)) 
                                        }); 
                                    }
                                }
                                _ => {}
                            }
                        }
                        if matches!(v, Value::Object(_) | Value::Array(_)) {
                            let child_pointer = if pointer.is_empty() { 
                                format!("/{}", escape_pointer_token(k)) 
                            } else { 
                                format!("{}/{}", pointer, escape_pointer_token(k)) 
                            };
                            stack.push((v, child_pointer));
                        }
                        if batch.len() >= batch_size {
                            total_so_far += batch.len();
                            let _ = handle_clone.emit("search_batch", serde_json::json!({ 
                                "id": id, 
                                "batch": batch, 
                                "total_so_far": total_so_far, 
                                "elapsed_ms": start_instant.elapsed().as_millis() 
                            }));
                            batch = Vec::with_capacity(batch_size);
                        }
                    }
                }
                Value::Array(arr) => {
                    for (idx, item) in arr.iter().enumerate() {
                        if search_values {
                            match item {
                                Value::String(s) => {
                                    let check = if case_sensitive_flag { s.clone() } else { s.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match { 
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(&idx.to_string()), item, None), 
                                            match_type: "value".into(), 
                                            match_text: s.clone(), 
                                            context: Some(format!("in index: {}", idx)) 
                                        }); 
                                    }
                                }
                                Value::Number(n) => {
                                    let num_str = n.to_string();
                                    let check = if case_sensitive_flag { num_str.clone() } else { num_str.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match { 
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(&idx.to_string()), item, None), 
                                            match_type: "value".into(), 
                                            match_text: num_str, 
                                            context: Some(format!("in index: {}", idx)) 
                                        }); 
                                    }
                                }
                                Value::Bool(b) => {
                                    let bool_str = b.to_string();
                                    let check = if case_sensitive_flag { bool_str.clone() } else { bool_str.to_lowercase() };
                                    let is_match = if let Some(re) = &re_opt { 
                                        re.is_match(&check) 
                                    } else if whole_word { 
                                        check.split(|c: char| !c.is_alphanumeric()).any(|w| w == query_norm) 
                                    } else { 
                                        check.contains(&query_norm) 
                                    };
                                    if is_match { 
                                        batch.push(SearchResult { 
                                            node: to_node_with_truncation(&pointer, Some(&idx.to_string()), item, None), 
                                            match_type: "value".into(), 
                                            match_text: bool_str, 
                                            context: Some(format!("in index: {}", idx)) 
                                        }); 
                                    }
                                }
                                _ => {}
                            }
                        }
                        if matches!(item, Value::Object(_) | Value::Array(_)) {
                            let child_pointer = format!("{}/{}", pointer, idx);
                            stack.push((item, child_pointer));
                        }
                        if batch.len() >= batch_size {
                            total_so_far += batch.len();
                            let _ = handle_clone.emit("search_batch", serde_json::json!({ 
                                "id": id, 
                                "batch": batch, 
                                "total_so_far": total_so_far, 
                                "elapsed_ms": start_instant.elapsed().as_millis() 
                            }));
                            batch = Vec::with_capacity(batch_size);
                        }
                    }
                }
                _ => {}
            }
        }
        if !batch.is_empty() {
            total_so_far += batch.len();
            let _ = handle_clone.emit("search_batch", serde_json::json!({ 
                "id": id, 
                "batch": batch, 
                "total_so_far": total_so_far, 
                "elapsed_ms": start_instant.elapsed().as_millis() 
            }));
        }
        let _ = handle_clone.emit("search_done", serde_json::json!({ 
            "id": id, 
            "total": total_so_far, 
            "elapsed_ms": start_instant.elapsed().as_millis() 
        }));
    });

    Ok(id)
}

pub fn search_recursive(
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
        let path_to_check = if case_sensitive { 
            current_pointer.to_string() 
        } else { 
            current_pointer.to_lowercase() 
        };
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
                    let key_to_check = if case_sensitive { 
                        key.to_string() 
                    } else { 
                        key.to_lowercase() 
                    };
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
                            let value_to_check = if case_sensitive { 
                                s.clone() 
                            } else { 
                                s.to_lowercase() 
                            };
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
                            let value_to_check = if case_sensitive { 
                                num_str.clone() 
                            } else { 
                                num_str.to_lowercase() 
                            };
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
                            let value_to_check = if case_sensitive { 
                                bool_str.clone() 
                            } else { 
                                bool_str.to_lowercase() 
                            };
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