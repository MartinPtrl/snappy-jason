// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Module declarations
mod types;
mod commands;
mod utils;

// Import the app state
use crate::types::common::AppState;

// Import command functions from modules
use commands::file::{open_file, open_clipboard, cancel_parse, load_children, open_file_dialog, save_file, save_file_as, copy_as_raw, copy_as_pretty};
use commands::search::search;
use commands::node::{get_node_value, copy_node_value, set_node_value, set_subtree, parse_stringified_json};
use commands::config::{save_last_opened_file, load_last_opened_file, clear_last_opened_file};
use tauri::Manager;
use tokio::sync::Mutex;

pub fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
            let window = app.get_webview_window("main").unwrap();
            window.open_devtools();
            window.close_devtools();
            }
            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            open_file, 
            load_children, 
            search,
            cancel_parse,
            save_last_opened_file,
            load_last_opened_file,
            clear_last_opened_file,
            get_node_value,
            copy_node_value,
            parse_stringified_json,
            open_clipboard,
            set_node_value,
            set_subtree,
            open_file_dialog,
            save_file,
            save_file_as,
            copy_as_raw,
            copy_as_pretty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
