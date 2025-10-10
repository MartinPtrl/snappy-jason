use std::sync::Arc;
use serde_json::Value;
use crate::types::types::{Node, ValueType};
use crate::types::common::AppState;
use crate::utils::tree::{build_node_for_pointer, use_pointer, use_pointer_mut};

#[tauri::command]
pub fn get_node_value(pointer: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state.doc.read();
    let root = guard.as_ref().ok_or("No document loaded")?;
    let value = use_pointer(root, &pointer)?;
    
    serde_json::to_string(value).map_err(|e| e.to_string())
}

// Copy the full JSON value of a node (or root if pointer empty) directly to the system clipboard.
// This avoids needing a user-activation constrained browser API and skips transferring large JSON
// blobs back to the frontend only to copy them again.
#[tauri::command]
pub fn copy_node_value(pointer: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    use arboard::Clipboard;

    let guard = state.doc.read();
    let root = guard.as_ref().ok_or("No document loaded")?;

    let value = use_pointer(root, &pointer)?;
    
    let serialized = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(serialized).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_node_value(pointer: String, new_value: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    // Acquire write lock to allow mutation
    let mut guard = state.doc.write();
    let root_arc = guard.as_mut().ok_or("No document loaded")?;

    // We clone the Arc if needed to obtain a mutable reference
    let root_mut = Arc::make_mut(root_arc);
    let current_value = use_pointer_mut(root_mut, &pointer)?; 

    // Only allow editing primitive scalar types
    match current_value {
        Value::String(s) => {
            // Keep as string directly
            *s = new_value;
        }
        Value::Number(n) => {
            // Parse number; must remain number
            // Accept integer or float
            let parsed_number = parse_json_number(&new_value)?;

            *n = parsed_number;
        }
        Value::Bool(b) => {
            let parsed_bool = new_value.parse::<bool>()
                .map_err(|_| "Invalid boolean (expected true/false)")?;
            *b = parsed_bool;
        }
        Value::Null => {
            return Err("Editing null not supported".into());
        }
        Value::Array(_) | Value::Object(_) => {
            return Err("Editing non-scalar value not supported".into());
        }
    }

    // Build updated node to return
    build_node_for_pointer(root_mut, &pointer)
}


/// Parses a string into a serde_json::Number, trying integer first then float.
fn parse_json_number(new_value: &String) -> Result<serde_json::Number, String> {
    let trimmed = new_value.trim();

    let try_parse_i64 = 
        || trimmed.parse::<i64>()
            .ok()
            .map(serde_json::Number::from);

    let try_parse_f64 = 
        || trimmed.parse::<f64>()
            .ok()
            .and_then(serde_json::Number::from_f64);


    try_parse_i64()
        .or_else(try_parse_f64)
        .ok_or("Invalid Number".into())
}

#[tauri::command]
pub fn set_subtree(pointer: String, new_json: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    // Parse input JSON first
    let parsed = serde_json::from_str(&new_json).map_err(|e| format!("Parse error: {e}"))?;
    // Must be object or array
    let new_kind = get_container_type(&parsed)
        .ok_or("Edited subtree must be an object or array")?;

    // Acquire write lock
    let mut guard = state.doc.write();
    let root_arc = guard.as_mut().ok_or("No document loaded")?;
    let root_mut = Arc::make_mut(root_arc);

    let current_value = use_pointer_mut(root_mut, &pointer)?; 

    // Ensure same container type
    let existing_kind = get_container_type(current_value)
        .ok_or("Current value is not an object or array")?;
    
    if existing_kind != new_kind { 
        return Err("Type change not allowed (must remain object/array)".into()); 
    }

    // Replace
    *current_value = parsed;

    build_node_for_pointer(root_mut, &pointer)
}

// Attempt to parse a string node whose content itself is JSON (object/array) and replace it in-place.
// This is useful for APIs that double-encode JSON payloads. We restrict to top-level object/array
// to avoid accidental coercion of primitive-like strings (e.g. numbers, booleans) that a user might
// prefer to keep as literal strings.
#[tauri::command]
pub fn parse_stringified_json(pointer: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    // Acquire write lock for mutation
    let mut guard = state.doc.write();
    let root_arc = guard.as_mut().ok_or("No document loaded")?;
    let root_mut= Arc::make_mut(root_arc);
    let current_value = use_pointer_mut(root_mut, &pointer)?; 

    let as_str = current_value.as_str().ok_or("Target node is not a string")?;
    let parsed: Value = serde_json::from_str(as_str.trim()).map_err(|e| format!("Parse error: {e}"))?;

    match parsed {
        Value::Object(_) | Value::Array(_) => {
            *current_value = parsed; // replace
        }
        _ => return Err("Parsed value is not an object/array".into()),
    }

    build_node_for_pointer(root_mut, &pointer)
}

fn get_container_type(value: &Value) -> Option<ValueType> {
    match value {
        Value::Object(_) => Some(ValueType::Object),
        Value::Array(_) => Some(ValueType::Array),
        _ => None,
    }
}