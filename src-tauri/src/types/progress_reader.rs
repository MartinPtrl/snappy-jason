use std::{io::Read, sync::Arc};

use tauri::Emitter;

// Progress reader for tracking file loading progress
pub struct ProgressReader<R: Read> {
    pub inner: R,
    pub read_bytes: u64,
    pub total_bytes: u64,
    pub last_emit: u64,
    pub app_handle: tauri::AppHandle,
    pub path: String,
    pub cancel: Arc<std::sync::atomic::AtomicBool>,
}

impl<R: Read> Read for ProgressReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        // if canceled, stop reading
        if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
            return Ok(0);
        }
        let n = self.inner.read(buf)?;
        self.read_bytes += n as u64;
        if self.read_bytes - self.last_emit >= 1024 * 1024 || n == 0 {
            let percent = if self.total_bytes > 0 { 
                self.read_bytes as f64 / self.total_bytes as f64 * 100.0 
            } else { 
                0.0 
            };
            let _ = self.app_handle.emit("parse_progress", serde_json::json!({
                "path": self.path,
                "readBytes": self.read_bytes,
                "totalBytes": self.total_bytes,
                "percent": percent,
                "done": n == 0,
                "canceled": self.cancel.load(std::sync::atomic::Ordering::SeqCst),
            }));
            self.last_emit = self.read_bytes;
        }
        Ok(n)
    }
}