use parking_lot::RwLock;
use serde_json::Value;
use std::sync::Arc;

pub struct AppState {
  pub doc: RwLock<Option<Arc<Value>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            doc: RwLock::new(None),
        }
    }
}