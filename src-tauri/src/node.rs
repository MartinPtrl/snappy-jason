use std::sync::Arc;
use crate::state::AppState;
use crate::types::Node;
use crate::tree::build_node_for_pointer;

#[tauri::command]
pub fn get_node_value(pointer: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };
    
    let value = if pointer.is_empty() {
        root.as_ref()
    } else {
        root.pointer(&pointer).ok_or("Invalid pointer")?
    };
    
    serde_json::to_string(value).map_err(|e| e.to_string())
}

// Copy the full JSON value of a node (or root if pointer empty) directly to the system clipboard.
// This avoids needing a user-activation constrained browser API and skips transferring large JSON
// blobs back to the frontend only to copy them again.
#[tauri::command]
pub fn copy_node_value(pointer: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    use arboard::Clipboard;
    let guard = state.doc.read();
    let Some(root) = &*guard else { return Err("No document loaded".into()); };

    let value = if pointer.is_empty() { 
        root.as_ref() 
    } else { 
        root.pointer(&pointer).ok_or("Invalid pointer")? 
    };
    let serialized = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let mut cb = Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(serialized).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_node_value(pointer: String, new_value: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    use serde_json::Value as JsonValue;
    // Acquire write lock to allow mutation
    let mut guard = state.doc.write();
    let Some(root_arc) = &mut *guard else { return Err("No document loaded".into()); };

    // We clone the Arc if needed to obtain a mutable reference
    let root_mut: &mut JsonValue = Arc::make_mut(root_arc);

    // Locate target value (immutable first to check type)
    let current_value_opt = if pointer.is_empty() { 
        Some(root_mut as *mut JsonValue) 
    } else { 
        root_mut.pointer_mut(&pointer).map(|v| v as *mut JsonValue) 
    };
    let current_ptr = current_value_opt.ok_or("Invalid pointer")?;
    // Safety: we only use pointer while holding &mut root_mut
    let current_value: &mut JsonValue = unsafe { &mut *current_ptr };

    // Only allow editing primitive scalar types
    match current_value {
        JsonValue::String(s) => {
            // Keep as string directly
            *s = new_value;
        }
        JsonValue::Number(n) => {
            // Parse number; must remain number
            // Accept integer or float
            let trimmed = new_value.trim();
            let parsed_number = if let Ok(i) = trimmed.parse::<i64>() { 
                serde_json::Number::from(i) 
            } else if let Ok(f) = trimmed.parse::<f64>() { 
                serde_json::Number::from_f64(f).ok_or("Invalid number")? 
            } else { 
                return Err("Invalid number literal".into()); 
            };
            *n = parsed_number;
        }
        JsonValue::Bool(b) => {
            let lower = new_value.to_ascii_lowercase();
            let parsed_bool = match lower.as_str() { 
                "true" => true, 
                "false" => false, 
                _ => return Err("Invalid boolean (expected true/false)".into()) 
            };
            *b = parsed_bool;
        }
        JsonValue::Null => {
            return Err("Editing null not supported".into());
        }
        JsonValue::Array(_) | JsonValue::Object(_) => {
            return Err("Editing non-scalar value not supported".into());
        }
    }

    // Build updated node to return
    build_node_for_pointer(root_mut, &pointer)
}

#[tauri::command]
pub fn set_subtree(pointer: String, new_json: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    use serde_json::Value as JsonValue;
    // Parse input JSON first
    let parsed: JsonValue = serde_json::from_str(&new_json).map_err(|e| format!("Parse error: {e}"))?;

    // Must be object or array
    let new_kind = match &parsed {
        JsonValue::Object(_) => "object",
        JsonValue::Array(_) => "array",
        _ => return Err("Edited subtree must be an object or array".into()),
    };

    // Acquire write lock
    let mut guard = state.doc.write();
    let Some(root_arc) = &mut *guard else { return Err("No document loaded".into()); };
    let root_mut: &mut JsonValue = Arc::make_mut(root_arc);

    // Locate current value
    let target_ptr = if pointer.is_empty() { 
        Some(root_mut as *mut JsonValue) 
    } else { 
        root_mut.pointer_mut(&pointer).map(|v| v as *mut JsonValue) 
    };
    let raw_ptr = target_ptr.ok_or("Invalid pointer")?;
    let current: &mut JsonValue = unsafe { &mut *raw_ptr };

    // Ensure same container type
    let existing_kind = match current {
        JsonValue::Object(_) => "object",
        JsonValue::Array(_) => "array",
        _ => return Err("Current value is not an object or array".into()),
    };
    if existing_kind != new_kind { 
        return Err("Type change not allowed (must remain object/array)".into()); 
    }

    // Replace
    *current = parsed;

    build_node_for_pointer(root_mut, &pointer)
}

// Attempt to parse a string node whose content itself is JSON (object/array) and replace it in-place.
// This is useful for APIs that double-encode JSON payloads. We restrict to top-level object/array
// to avoid accidental coercion of primitive-like strings (e.g. numbers, booleans) that a user might
// prefer to keep as literal strings.
#[tauri::command]
pub fn parse_stringified_json(pointer: String, state: tauri::State<'_, AppState>) -> Result<Node, String> {
    use serde_json::Value as JsonValue;
    // Acquire write lock for mutation
    let mut guard = state.doc.write();
    let Some(root_arc) = &mut *guard else { return Err("No document loaded".into()); };
    let root_mut: &mut JsonValue = Arc::make_mut(root_arc);

    // Locate target node (must be string)
    let target_ptr = if pointer.is_empty() { 
        Some(root_mut as *mut JsonValue) 
    } else { 
        root_mut.pointer_mut(&pointer).map(|v| v as *mut JsonValue) 
    };
    let raw_ptr = target_ptr.ok_or("Invalid pointer")?;
    let current: &mut JsonValue = unsafe { &mut *raw_ptr };

    let Some(as_str) = current.as_str() else { 
        return Err("Target node is not a string".into()); 
    };

    // Quick heuristic: trim and must start with { or [ and end with } or ]
    let trimmed = as_str.trim();
    if !( (trimmed.starts_with('{') && trimmed.ends_with('}')) || 
          (trimmed.starts_with('[') && trimmed.ends_with(']')) ) {
        return Err("String does not look like a JSON object/array".into());
    }

    let parsed: JsonValue = serde_json::from_str(trimmed).map_err(|e| format!("Parse error: {e}"))?;
    match parsed {
        JsonValue::Object(_) | JsonValue::Array(_) => {
            *current = parsed; // replace
        }
        _ => return Err("Parsed value is not an object/array".into()),
    }

    build_node_for_pointer(root_mut, &pointer)
}