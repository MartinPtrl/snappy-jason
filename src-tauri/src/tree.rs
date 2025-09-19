use serde_json::Value;
use crate::types::Node;

pub fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max { 
        s.to_string() 
    } else { 
        format!("{}…", &s[..max]) 
    }
}

// JSON Pointer token escape (~0, ~1)
pub fn escape_pointer_token(raw: &str) -> String {
    raw.replace('~', "~0").replace('/', "~1")
}

pub fn to_node_with_truncation(parent_ptr: &str, key: Option<&str>, v: &Value, truncate_limit: Option<usize>) -> Node {
    let (value_type, has_children, child_count, preview) = match v {
        Value::Object(m) => (
            "object".into(),
            !m.is_empty(),
            m.len(),
            if m.is_empty() { 
                format!("{{}} {} keys", m.len()) 
            } else { 
                format!("{{…}} {} keys", m.len()) 
            }
        ),
        Value::Array(a) => (
            "array".into(), 
            !a.is_empty(), 
            a.len(), 
            if a.is_empty() { 
                format!("[] {} items", a.len()) 
            } else { 
                format!("[…] {} items", a.len()) 
            }
        ),
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
    
    Node { 
        pointer, 
        key: key.map(|s| s.to_string()), 
        value_type, 
        has_children, 
        child_count, 
        preview 
    }
}

pub fn create_node_for_path(value: &Value, pointer: &str) -> Node {
    let (value_type, has_children, child_count, preview) = match value {
        Value::Object(m) => (
            "object".into(),
            !m.is_empty(),
            m.len(),
            if m.is_empty() { 
                format!("{{}} {} keys", m.len()) 
            } else { 
                format!("{{…}} {} keys", m.len()) 
            }
        ),
        Value::Array(a) => (
            "array".into(), 
            !a.is_empty(), 
            a.len(), 
            if a.is_empty() { 
                format!("[] {} items", a.len()) 
            } else { 
                format!("[…] {} items", a.len()) 
            }
        ),
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

pub fn list_children(root: &Value, pointer: &str, offset: usize, limit: usize) -> Vec<Node> {
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
pub fn build_node_for_pointer(root: &Value, pointer: &str) -> Result<Node, String> {
    let value = if pointer.is_empty() { 
        root 
    } else { 
        root.pointer(pointer).ok_or("Invalid pointer")? 
    };
    Ok(create_node_for_path(value, pointer))
}