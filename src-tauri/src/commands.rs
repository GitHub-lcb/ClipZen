// Tauri 命令处理模块
// TODO: 实现完整的命令处理

use crate::clipboard::ClipboardManager;
use crate::storage::{ClipboardItem, Storage};
use uuid::Uuid;
use chrono::Utc;

#[tauri::command]
pub fn get_clipboard_history() -> Vec<ClipboardItem> {
    let storage = Storage::new().unwrap_or_default();
    storage.get_all_items().unwrap_or_default()
}

#[tauri::command]
pub fn save_to_history(content: String, item_type: String) -> String {
    let storage = Storage::new().unwrap_or_default();
    let id = Uuid::new_v4().to_string();
    
    let item = ClipboardItem {
        id: id.clone(),
        item_type,
        preview: content.chars().take(100).collect(),
        content,
        pinned: false,
        created_at: Utc::now().timestamp_millis(),
    };

    storage.save_item(&item).unwrap_or_default();
    id
}

#[tauri::command]
pub fn delete_history_item(id: String) -> bool {
    let storage = Storage::new().unwrap_or_default();
    storage.delete_item(&id).is_ok()
}

#[tauri::command]
pub fn toggle_pin_item(id: String) -> bool {
    let storage = Storage::new().unwrap_or_default();
    storage.toggle_pin(&id).is_ok()
}

#[tauri::command]
pub fn copy_to_clipboard(content: String) -> bool {
    let clipboard = ClipboardManager::new();
    clipboard.set_text(&content).is_ok()
}
