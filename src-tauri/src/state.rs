use parking_lot::RwLock;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, atomic::{AtomicBool, AtomicU64}};

pub struct AppState {
    // Multiple documents support - map of file_id to document
    pub docs: RwLock<HashMap<String, Arc<Value>>>,
    // Legacy single document for backward compatibility
    pub doc: RwLock<Option<Arc<Value>>>,
    pub cancel_parse: Arc<AtomicBool>,
    pub active_search_id: AtomicU64,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            docs: RwLock::new(HashMap::new()),
            doc: RwLock::new(None),
            cancel_parse: Arc::new(AtomicBool::new(false)),
            active_search_id: AtomicU64::new(0),
        }
    }
}