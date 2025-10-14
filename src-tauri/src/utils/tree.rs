use serde_json::Value;
use crate::types::types::{Node, ValueType};

fn truncate(s: &String, max: usize) -> String {
    if s.len() <= max { 
        s.to_string() 
    } else { 
        format!("{}…", &s[..max]) 
    }
}

/// JSON Pointer token escape (~0, ~1)
pub fn escape_pointer_token(raw: &str) -> String {
    raw.replace('~', "~0").replace('/', "~1")
}

/// ValueType, Child Count, Preview
struct NodeProperties(ValueType, usize, String);

impl NodeProperties {
    fn to_node(self, pointer: String, key: String) -> Node {

        let NodeProperties(value_type, child_count, preview) = self;
        Node { 
            pointer: pointer, 
            key: key, 
            value_type: value_type, 
            has_children: child_count > 0, 
            child_count: child_count, 
            preview: preview
        }
    }
}

fn get_node_properties(value: &Value) -> NodeProperties {
    match value {
        Value::Object(m) => NodeProperties(
            ValueType::Object,
            m.len(),
            if m.is_empty() { 
                format!("{{}} {} keys", m.len()) 
            } else { 
                format!("{{…}} {} keys", m.len()) 
            }
        ),
        Value::Array(a) => NodeProperties(
            ValueType::Array, 
            a.len(), 
            if a.is_empty() { 
                format!("[] {} items", a.len()) 
            } else { 
                format!("[…] {} items", a.len()) 
            }
        ),
        Value::String(s) => NodeProperties(ValueType::String, 0, truncate(s, 80)),
        Value::Number(n) => NodeProperties(ValueType::Number, 0, n.to_string()),
        Value::Bool(b) => NodeProperties(ValueType::Boolean, 0, b.to_string()),
        Value::Null => NodeProperties(ValueType::Null, 0, "null".into()),
    }
}

pub fn to_node_with_truncation(parent_ptr: &str, key: &String, v: &Value) -> Node {
    let properties = get_node_properties(v);

    let pointer = format!("{}/{}", parent_ptr, escape_pointer_token(key));

    properties.to_node(
        pointer, 
        key.to_string()
    )
}

pub fn create_node_for_path(value: &Value, pointer: &String) -> Node {
    let properties = get_node_properties(value);
    
    // Extract key from pointer
    let key = get_last_key_in_pointer(pointer);
    
    properties.to_node(
        pointer.clone(),
        key.to_string()
    )
}

pub fn list_children(root: &Value, pointer: &String, offset: usize, limit: usize) -> Vec<Node> {
    let target = root.pointer(pointer).unwrap_or(root);
    match target {
        Value::Object(map) => map
            .iter()
            .skip(offset)
            .take(limit)
            .map(|(k, v)| to_node_with_truncation(pointer, k, v))
            .collect(),
        Value::Array(arr) => arr
            .iter()
            .enumerate()
            .skip(offset)
            .take(limit)
            .map(|(i, v)| to_node_with_truncation(pointer, &i.to_string(), v))
            .collect(),
        _ => vec![],
    }
}

pub fn text_matches(text: &str, query: &str, re: Option<&regex::Regex>, whole_word: bool) -> bool {
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

// Helper to rebuild a Node for a specific pointer after mutation
pub fn build_node_for_pointer(root: &Value, pointer: &String) -> Result<Node, String> {
    let value = use_pointer(root, pointer)?;
    Ok(create_node_for_path(value, pointer))
}

/// Returns a reference to the value at the given JSON Pointer, or an error if the pointer is invalid.
pub fn use_pointer<'a>(root: &'a Value, pointer: &String) -> Result<&'a Value, String> {
    root.pointer(pointer)
        .ok_or_else(|| format!("Invalid pointer: {}", pointer).into())
}

/// Returns a mutable reference to the value at the given JSON Pointer, or an error if the pointer is invalid.
pub fn use_pointer_mut<'a>(root: &'a mut Value, pointer: &String) -> Result<&'a mut Value, String> {
    root.pointer_mut(pointer)
        .ok_or_else(|| format!("Invalid pointer: {}", pointer).into())
}

/// Returns the last token in a JSON Pointer (after the last '/'), or an empty string if the pointer is empty.
pub fn get_last_key_in_pointer(pointer: &String) -> String {
    if pointer.is_empty() {
        String::new()
    } else {
        pointer.split('/').last().unwrap_or_default().to_string()
    }
}