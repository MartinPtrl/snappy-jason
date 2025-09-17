use parking_lot::RwLock;
use serde_json::Value;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};

pub struct AppState {
  pub doc: RwLock<Option<Arc<Value>>>,
    pub cancel_parse: Arc<AtomicBool>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            doc: RwLock::new(None),
            cancel_parse: Arc::new(AtomicBool::new(false)),
        }
    }
}