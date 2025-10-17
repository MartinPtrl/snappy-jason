use serde_json::Value;
use std::sync::{Arc, atomic::AtomicBool};

pub struct AppState {
    pub doc: Option<Value>,
    pub file_path: Option<String>,
    pub cancel_parse: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            doc: None,
            file_path: None,
            cancel_parse: Arc::new(AtomicBool::new(false)),
        }
    }
}
