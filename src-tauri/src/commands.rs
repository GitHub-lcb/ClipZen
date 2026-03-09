// Tauri 命令处理模块

use crate::clipboard::{ClipboardManager, ClipboardContent};
use crate::storage::Storage;
use crate::settings::{SettingsManager, AppSettings, hash_password, verify_password_hash};
use tauri::State;
use std::sync::{Arc, Mutex};
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn get_clipboard_history(storage: State<Arc<Mutex<Storage>>>) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    storage.get_all_items().unwrap_or_default()
}

#[tauri::command]
pub fn save_to_history(
    content: String,
    _item_type: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> String {
    let storage = storage.lock().unwrap();
    storage.save_clipboard_item(&content).unwrap_or_default()
}

#[tauri::command]
pub fn delete_history_item(id: String, storage: State<Arc<Mutex<Storage>>>) -> bool {
    let storage = storage.lock().unwrap();
    // 如果是图片，删除文件
    if let Ok(item) = storage.get_all_items() {
        if let Some(found) = item.iter().find(|i| i.id == id) {
            if found.item_type == "image" {
                if let Some(path) = &found.file_path {
                    fs::remove_file(path).ok();
                }
            }
        }
    }
    storage.delete_item(&id).is_ok()
}

#[tauri::command]
pub fn toggle_pin_item(id: String, storage: State<Arc<Mutex<Storage>>>) -> bool {
    let storage = storage.lock().unwrap();
    storage.toggle_pin(&id).is_ok()
}

#[tauri::command]
pub fn toggle_protected(id: String, storage: State<Arc<Mutex<Storage>>>) -> bool {
    let storage = storage.lock().unwrap();
    storage.toggle_protected(&id).is_ok()
}

#[tauri::command]
pub fn copy_to_clipboard(content: String, clipboard: State<Arc<Mutex<ClipboardManager>>>) -> bool {
    let clipboard = clipboard.lock().unwrap();
    clipboard.set_text(&content).is_ok()
}

#[tauri::command]
pub fn copy_masked_content(content: String, clipboard: State<Arc<Mutex<ClipboardManager>>>) -> bool {
    let clipboard = clipboard.lock().unwrap();
    clipboard.set_text(&content).is_ok()
}

/// 获取当前剪贴板内容（自动检测类型）
#[tauri::command]
pub fn get_current_clipboard_content(
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
    storage: State<Arc<Mutex<Storage>>>,
) -> String {
    let clipboard = clipboard.lock().unwrap();
    let content = clipboard.get_content();
    
    match content {
        ClipboardContent::Text(text) => {
            // 保存文本
            let storage = storage.lock().unwrap();
            storage.save_clipboard_item(&text).ok();
            format!("text:{}", text)
        }
        ClipboardContent::Image(image_data) => {
            // 保存图片到文件
            let images_dir = dirs::data_local_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("clipzen")
                .join("images");
            fs::create_dir_all(&images_dir).ok();
            
            let timestamp = chrono::Utc::now().timestamp_millis();
            let file_path = images_dir.join(format!("{}.png", timestamp));
            
            if fs::write(&file_path, &image_data).is_ok() {
                // 生成缩略图（简化版：用原图）
                let preview = format!("data:image/png;base64,{}", crate::storage::base64_encode(&image_data[..image_data.len().min(5000)]));
                
                let storage = storage.lock().unwrap();
                storage.save_image_item(&image_data, &preview, file_path.to_str().unwrap()).ok();
            }
            "image".to_string()
        }
        ClipboardContent::Empty => "empty".to_string(),
    }
}

/// 复制图片到剪贴板
#[tauri::command]
pub fn copy_image_to_clipboard(
    file_path: String,
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
) -> bool {
    let clipboard = clipboard.lock().unwrap();
    if let Ok(image_data) = fs::read(&file_path) {
        clipboard.set_image(&image_data).is_ok()
    } else {
        false
    }
}

/// 获取设置
#[tauri::command]
pub fn get_settings(settings: State<Arc<Mutex<SettingsManager>>>) -> AppSettings {
    let settings = settings.lock().unwrap();
    settings.load()
}

/// 保存设置
#[tauri::command]
pub fn save_settings(
    new_settings: AppSettings,
    settings: State<Arc<Mutex<SettingsManager>>>,
    storage: State<Arc<Mutex<Storage>>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let settings = settings.lock().unwrap();
    settings.save(&new_settings)?;
    drop(settings);
    
    if let Err(e) = handle_autostart(&app, new_settings.start_on_boot) {
        eprintln!("Warning: Failed to set autostart: {}", e);
    }
    
    if new_settings.auto_clear_after_days > 0 {
        let storage = storage.lock().unwrap();
        if let Err(e) = storage.auto_cleanup(new_settings.auto_clear_after_days) {
            eprintln!("Warning: Failed to cleanup: {}", e);
        }
    }
    
    Ok(())
}

fn handle_autostart(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        manager.disable()
            .map_err(|e| format!("Failed to disable autostart: {}", e))?;
    }
    Ok(())
}

/// 导出剪贴板历史到 JSON 文件
#[tauri::command]
pub fn export_history(
    file_path: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<usize, String> {
    let storage = storage.lock().unwrap();
    let items = storage.get_all_items().map_err(|e| format!("Failed to get items: {}", e))?;
    
    let json = serde_json::to_string_pretty(&items)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    
    let path = PathBuf::from(&file_path);
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write file {}: {}", path.display(), e))?;
    
    Ok(items.len())
}

/// 从 JSON 文件导入剪贴板历史
#[tauri::command]
pub fn import_history(
    file_path: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<usize, String> {
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    let items: Vec<crate::storage::ClipboardItem> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    let storage = storage.lock().unwrap();
    let mut count = 0;
    
    for item in items {
        let _ = storage.import_item(&item);
        count += 1;
    }
    
    Ok(count)
}

/// 清空所有剪贴板历史
#[tauri::command]
pub fn clear_all_history(
    keep_pinned: bool,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<usize, String> {
    let storage = storage.lock().unwrap();
    let items = storage.get_all_items().map_err(|e| e.to_string())?;
    
    let mut deleted = 0;
    for item in items {
        if keep_pinned && item.pinned {
            continue;
        }
        // 删除文件（如果是图片）
        if item.item_type == "image" {
            if let Some(path) = &item.file_path {
                fs::remove_file(path).ok();
            }
        }
        let _ = storage.delete_item(&item.id);
        deleted += 1;
    }
    
    Ok(deleted)
}

/// 获取所有标签
#[tauri::command]
pub fn get_all_tags(storage: State<Arc<Mutex<Storage>>>) -> Vec<String> {
    let storage = storage.lock().unwrap();
    if let Ok(items) = storage.get_all_items() {
        let mut tags_set = std::collections::HashSet::new();
        for item in items {
            for tag in item.tags {
                tags_set.insert(tag);
            }
        }
        let mut tags: Vec<String> = tags_set.into_iter().collect();
        tags.sort();
        tags
    } else {
        Vec::new()
    }
}

/// 给记录添加标签
#[tauri::command]
pub fn add_tag_to_item(
    item_id: String,
    tag: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    let items = storage.get_all_items().map_err(|e| e.to_string())?;
    
    if let Some(mut item) = items.into_iter().find(|i| i.id == item_id) {
        if !item.tags.contains(&tag) {
            item.tags.push(tag);
        }
        storage.save_item(&item).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 从记录移除标签
#[tauri::command]
pub fn remove_tag_from_item(
    item_id: String,
    tag: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    let items = storage.get_all_items().map_err(|e| e.to_string())?;
    
    if let Some(mut item) = items.into_iter().find(|i| i.id == item_id) {
        item.tags.retain(|t| *t != tag);
        storage.save_item(&item).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 更新记录内容
#[tauri::command]
pub fn update_item_content(
    item_id: String,
    content: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    let items = storage.get_all_items().map_err(|e| e.to_string())?;
    
    if let Some(mut item) = items.into_iter().find(|i| i.id == item_id) {
        item.content = content.clone();
        // 更新预览（取前100字符）
        item.preview = content.chars().take(100).collect();
        item.updated_at = Some(chrono::Utc::now().timestamp_millis());
        storage.save_item(&item).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 按标签过滤记录
#[tauri::command]
pub fn get_items_by_tag(
    tag: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    if let Ok(items) = storage.get_all_items() {
        items.into_iter().filter(|i| i.tags.contains(&tag)).collect()
    } else {
        Vec::new()
    }
}

/// 设置开机自启
#[tauri::command]
pub fn set_autostart(
    enabled: bool,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    
    let manager = app.autolaunch();
    if enabled {
        manager.enable()
            .map_err(|e| format!("Failed to enable autostart: {}", e))?;
    } else {
        manager.disable()
            .map_err(|e| format!("Failed to disable autostart: {}", e))?;
    }
    
    Ok(())
}

#[allow(dead_code)]
#[tauri::command]
pub fn start_clipboard_monitor() -> String {
    "Monitor started".to_string()
}

#[tauri::command]
pub fn set_global_password(
    password: String,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<(), String> {
    let settings_manager = settings.lock().unwrap();
    let mut app_settings = settings_manager.load();
    
    let hashed = hash_password(&password);
    app_settings.global_password = Some(hashed);
    
    settings_manager.save(&app_settings)?;
    
    Ok(())
}

#[tauri::command]
pub fn verify_password(
    password: String,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> bool {
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    if let Some(stored_hash) = &app_settings.global_password {
        verify_password_hash(&password, stored_hash)
    } else {
        false
    }
}

#[tauri::command]
pub fn has_global_password(
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> bool {
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    app_settings.global_password.is_some()
}
