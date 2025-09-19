use serde::Serialize;

#[derive(Serialize)]
pub struct Node {
    pub pointer: String,          // JSON Pointer to this node
    pub key: Option<String>,      // key if object, index if array (as string)
    pub value_type: String,       // "object" | "array" | "string" | "number" | ...
    pub has_children: bool,
    pub child_count: usize,
    pub preview: String,          // short preview for leafs / strings / numbers
}

#[derive(Serialize)]
pub struct SearchResult {
    pub node: Node,
    pub match_type: String,       // "key", "value", "path"
    pub match_text: String,       // the actual matched text
    pub context: Option<String>,  // additional context if needed
}

#[derive(Serialize)]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub total_count: usize,
    pub has_more: bool,
}