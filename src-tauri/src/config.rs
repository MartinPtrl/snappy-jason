use std::{fs::create_dir_all, path::PathBuf};
use tauri::Manager;

// Get the config file path
fn get_config_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_config_dir()
        .map_err(|e| format!("Failed to get app config dir: {}", e))?;
    
    // Ensure the directory exists
    create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    Ok(app_data_dir.join(".snappy"))
}

#[tauri::command]
pub fn save_last_opened_file(file_path: String, app: tauri::AppHandle) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
    
    std::fs::write(&config_path, file_path)
        .map_err(|e| format!("Failed to save config file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn load_last_opened_file(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_config_file_path(&app)?;
    
    if !config_path.exists() {
        return Err("No config file found".into());
    }
    
    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;
    
    let file_path = content.trim().to_string();
    
    // Check if the file still exists
    if !std::path::Path::new(&file_path).exists() {
        return Err("Last opened file no longer exists".into());
    }
    
    Ok(file_path)
}

#[tauri::command]
pub fn clear_last_opened_file(app: tauri::AppHandle) -> Result<(), String> {
    let config_path = get_config_file_path(&app)?;
    
    if config_path.exists() {
        std::fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove config file: {}", e))?;
    }
    
    Ok(())
}