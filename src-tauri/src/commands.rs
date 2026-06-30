// Tauri 命令处理模块

use crate::clipboard::{ClipboardManager, ClipboardContent};
use crate::storage::Storage;
use crate::settings::{
    hash_password, sanitize_settings, verify_password_hash, AppSettings, SettingsManager,
};
use crate::license::{LicenseManager, LicenseInfo, LicenseType, ActivationResult};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::State;
use std::sync::{Arc, Mutex};
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn get_clipboard_history(
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    history_result(storage.get_all_items(), &app_settings)
}

#[tauri::command]
pub fn get_clipboard_history_paginated(
    page: u32,
    page_size: u32,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<(Vec<crate::storage::ClipboardItem>, u32), String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    paginated_history_result(storage.get_items_paginated(page, page_size), &app_settings)
}

#[tauri::command]
pub fn get_clipboard_history_sorted(
    sort_by: String,
    sort_order: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    history_result(
        storage.get_items_sorted(&sort_by, &sort_order),
        &app_settings,
    )
}

/// 解密敏感信息
fn decrypt_sensitive_items(items: &mut Vec<crate::storage::ClipboardItem>, settings: &AppSettings) {
    if let Some(encryption_key_str) = &settings.encryption_key {
        if let Ok(encryption_key) = STANDARD.decode(encryption_key_str) {
            for item in items {
                if item.content.starts_with("ENCRYPTED:") {
                    let encrypted_part = item.content.trim_start_matches("ENCRYPTED:");
                    if let Ok(decrypted) = crate::storage::decrypt_data(encrypted_part, &encryption_key) {
                        item.content = decrypted;
                        // 更新预览
                        item.preview = item.content.chars().take(100).collect();
                    }
                }
            }
        }
    }
}

fn filter_items_for_search(
    mut items: Vec<crate::storage::ClipboardItem>,
    query: &str,
    settings: &AppSettings,
) -> Vec<crate::storage::ClipboardItem> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }

    decrypt_sensitive_items(&mut items, settings);

    let query_lower = query.to_lowercase();
    items.into_iter()
        .filter(|item| {
            item.content.to_lowercase().contains(&query_lower)
                || item.preview.to_lowercase().contains(&query_lower)
                || item.tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
        })
        .collect()
}

fn storage_command_result(result: rusqlite::Result<()>) -> Result<(), String> {
    result.map_err(|e| e.to_string())
}

fn clipboard_command_result(result: Result<(), String>) -> Result<(), String> {
    result
}

fn paginated_history_result(
    result: rusqlite::Result<(Vec<crate::storage::ClipboardItem>, u32)>,
    settings: &AppSettings,
) -> Result<(Vec<crate::storage::ClipboardItem>, u32), String> {
    let (mut items, total_count) = result.map_err(|e| e.to_string())?;
    decrypt_sensitive_items(&mut items, settings);
    Ok((items, total_count))
}

fn history_result(
    result: rusqlite::Result<Vec<crate::storage::ClipboardItem>>,
    settings: &AppSettings,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let mut items = result.map_err(|e| e.to_string())?;
    decrypt_sensitive_items(&mut items, settings);
    Ok(items)
}

fn tagged_items_result(
    result: rusqlite::Result<Vec<crate::storage::ClipboardItem>>,
    tag: &str,
    settings: &AppSettings,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let items = history_result(result, settings)?;
    Ok(items
        .into_iter()
        .filter(|item| item.tags.iter().any(|item_tag| item_tag == tag))
        .collect())
}

fn tags_result(result: rusqlite::Result<Vec<String>>) -> Result<Vec<String>, String> {
    result.map_err(|e| e.to_string())
}

fn search_history_result(
    result: rusqlite::Result<Vec<crate::storage::ClipboardItem>>,
    query: &str,
    settings: &AppSettings,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let items = result.map_err(|e| e.to_string())?;
    Ok(filter_items_for_search(items, query, settings))
}

fn clear_history_delete_result(result: rusqlite::Result<()>) -> Result<(), String> {
    result.map_err(|e| e.to_string())
}

fn import_item_result(result: rusqlite::Result<()>) -> Result<(), String> {
    result.map_err(|e| e.to_string())
}

fn save_history_result(result: rusqlite::Result<String>) -> Result<String, String> {
    result.map_err(|e| e.to_string())
}

fn auto_cleanup_result(result: rusqlite::Result<usize>) -> Result<(), String> {
    result.map(|_| ()).map_err(|e| e.to_string())
}

fn autostart_result(result: Result<(), String>) -> Result<(), String> {
    result
}

#[tauri::command]
pub fn save_to_history(
    content: String,
    _item_type: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<String, String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    let processed_content =
        crate::storage::protect_sensitive_content(&content, app_settings.encryption_key.as_deref());
    let content_hash =
        crate::storage::sensitive_content_hash(&content, app_settings.encryption_key.as_deref());
    let max_items = app_settings.max_history_items;
    
    // 检测并加密敏感信息
    if let Some(hash) = content_hash.as_deref() {
        save_history_result(storage.save_clipboard_item_with_hash_and_limit(
            &processed_content,
            Some(hash),
            max_items,
        ))
    } else {
        save_history_result(storage.save_clipboard_item_with_hash_and_limit(
            &processed_content,
            None,
            max_items,
        ))
    }
}

#[tauri::command]
pub fn delete_history_item(id: String, storage: State<Arc<Mutex<Storage>>>) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage_command_result(storage.delete_item(&id))
}

#[tauri::command]
pub fn toggle_pin_item(id: String, storage: State<Arc<Mutex<Storage>>>) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage_command_result(storage.toggle_pin(&id))
}

#[tauri::command]
pub fn toggle_protected(id: String, storage: State<Arc<Mutex<Storage>>>) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage_command_result(storage.toggle_protected(&id))
}

#[tauri::command]
pub fn increment_copy_count(id: String, storage: State<Arc<Mutex<Storage>>>) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage_command_result(storage.increment_copy_count(&id))
}

#[tauri::command]
pub fn copy_to_clipboard(
    content: String,
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
) -> Result<(), String> {
    let clipboard = clipboard.lock().unwrap();
    clipboard_command_result(clipboard.set_text(&content))
}

#[tauri::command]
pub fn copy_masked_content(
    content: String,
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
) -> Result<(), String> {
    let clipboard = clipboard.lock().unwrap();
    clipboard_command_result(clipboard.set_text(&content))
}

/// 获取当前剪贴板内容（自动检测类型）
#[tauri::command]
pub fn get_current_clipboard_content(
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> String {
    let clipboard = clipboard.lock().unwrap();
    let content = clipboard.get_content();
    
    match content {
        ClipboardContent::Text(text) => {
            // 保存文本
            let settings_manager = settings.lock().unwrap();
            let app_settings = settings_manager.load();
            drop(settings_manager);
            let processed_text = crate::storage::protect_sensitive_content(
                &text,
                app_settings.encryption_key.as_deref(),
            );
            let content_hash = crate::storage::sensitive_content_hash(
                &text,
                app_settings.encryption_key.as_deref(),
            );
            let max_items = app_settings.max_history_items;
            let storage = storage.lock().unwrap();
            if let Some(hash) = content_hash.as_deref() {
                storage
                    .save_clipboard_item_with_hash_and_limit(&processed_text, Some(hash), max_items)
                    .ok();
            } else {
                storage
                    .save_clipboard_item_with_hash_and_limit(&processed_text, None, max_items)
                    .ok();
            }
            format!("text:{}", text)
        }
        ClipboardContent::Image(image_data) => {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            image_data.hash(&mut hasher);
            let hash = hasher.finish();
            let hash_str = format!("{:016x}", hash);
            let settings_manager = settings.lock().unwrap();
            let max_items = settings_manager.load().max_history_items;
            drop(settings_manager);
            
            let storage = storage.lock().unwrap();
            
            if storage.hash_exists(&hash_str).unwrap_or(false) {
                let _ = storage.update_item_timestamp_by_hash(&hash_str);
                let _ = storage.cleanup_old_items(max_items);
            } else {
                let images_dir = dirs::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("clipzen")
                    .join("images");
                fs::create_dir_all(&images_dir).ok();
                
                let timestamp = chrono::Utc::now().timestamp_millis();
                let file_path = images_dir.join(format!("{}.png", timestamp));
                
                if fs::write(&file_path, &image_data).is_ok() {
                    let preview = format!("data:image/png;base64,{}", crate::storage::base64_encode(&image_data[..image_data.len().min(5000)]));
                    
                    let _ = storage.save_image_item_with_limit(
                        &image_data,
                        &preview,
                        file_path.to_str().unwrap(),
                        &hash_str,
                        max_items,
                    );
                }
            }
            "image".to_string()
        }
        ClipboardContent::Empty => "empty".to_string(),
        ClipboardContent::Files(_) => "files".to_string(),
    }
}

/// 复制图片到剪贴板（统一入口）
/// 从文件路径读取图片
#[tauri::command]
pub fn copy_image(
    item_id: String,
    storage: State<Arc<Mutex<Storage>>>,
    clipboard: State<Arc<Mutex<ClipboardManager>>>,
) -> Result<(), String> {
    let file_path = {
        let storage_guard = storage.lock().unwrap();
        let item = storage_guard
            .get_item_by_id(&item_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Item not found".to_string())?;

        if item.item_type != "image" {
            return Err("Item is not an image".to_string());
        }

        item.file_path
            .ok_or_else(|| "Image file path not found".to_string())?
    };

    let image_data = fs::read(&file_path)
        .map_err(|_| format!("Failed to read image file: {}", file_path))?;

    let clipboard_guard = clipboard.lock().unwrap();
    clipboard_guard.set_image(&image_data)
}

/// 获取设置
#[tauri::command]
pub fn get_settings(settings: State<Arc<Mutex<SettingsManager>>>) -> AppSettings {
    let settings = settings.lock().unwrap();
    settings.load()
}

fn merge_settings_for_save(
    mut new_settings: AppSettings,
    existing_settings: &AppSettings,
) -> AppSettings {
    if new_settings.global_password.is_none() {
        new_settings.global_password = existing_settings.global_password.clone();
    }
    if new_settings.encryption_key.is_none() {
        new_settings.encryption_key = existing_settings.encryption_key.clone();
    }
    sanitize_settings(new_settings)
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
    let existing_settings = settings.load();
    let new_settings = merge_settings_for_save(new_settings, &existing_settings);
    settings.save(&new_settings)?;
    drop(settings);
    
    autostart_result(handle_autostart(&app, new_settings.start_on_boot))?;
    
    if new_settings.auto_clear_after_days > 0 {
        let storage = storage.lock().unwrap();
        auto_cleanup_result(storage.auto_cleanup(new_settings.auto_clear_after_days))?;
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
        import_item_result(storage.import_item(&item))?;
        count += 1;
    }
    
    Ok(count)
}

fn should_clear_history_item(item: &crate::storage::ClipboardItem, keep_pinned: bool) -> bool {
    if keep_pinned && (item.pinned || !item.tags.is_empty()) {
        return false;
    }
    true
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
        // 保留置顶记录和带标签的记录
        if !should_clear_history_item(&item, keep_pinned) {
            continue;
        }
        clear_history_delete_result(storage.delete_item(&item.id))?;
        deleted += 1;
    }
    
    Ok(deleted)
}

/// 获取所有标签
#[tauri::command]
pub fn get_all_tags(storage: State<Arc<Mutex<Storage>>>) -> Result<Vec<String>, String> {
    let storage = storage.lock().unwrap();
    tags_result(storage.get_all_tags())
}

/// 给记录添加标签
#[tauri::command]
pub fn add_tag_to_item(
    item_id: String,
    tag: String,
    storage: State<Arc<Mutex<Storage>>>,
) -> Result<(), String> {
    let storage = storage.lock().unwrap();
    storage.add_tag_to_item(&item_id, &tag).map_err(|e| e.to_string())?;

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
    storage.remove_tag_from_item(&item_id, &tag).map_err(|e| e.to_string())?;

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
    storage.update_item_content(&item_id, &content).map_err(|e| e.to_string())?;

    Ok(())
}

/// 按标签过滤记录
#[tauri::command]
pub fn get_items_by_tag(
    tag: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    tagged_items_result(storage.get_all_items(), &tag, &app_settings)
}

/// 搜索剪贴板记录
#[tauri::command]
pub fn search_clipboard_history(
    query: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Result<Vec<crate::storage::ClipboardItem>, String> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();

    search_history_result(storage.get_all_items(), &query, &app_settings)
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

/// 按需加载图片数据（用于大图预览，避免一次性传输过大数据）
#[tauri::command]
pub fn get_image_data(file_path: String) -> Result<String, String> {
    let data = fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(format!("data:image/png;base64,{}", crate::storage::base64_encode(&data)))
}

// ============ 许可证/激活相关命令 ============

/// 激活许可证
#[tauri::command]
pub fn activate_license(
    code: String,
    license_manager: State<Arc<Mutex<LicenseManager>>>,
) -> Result<ActivationResult, String> {
    use crate::license::{generate_machine_id, verify_license_code};
    
    let machine_id = generate_machine_id();
    let result = verify_license_code(&code, &machine_id);
    
    if result.success {
        if let Some(ref info) = result.license_info {
            let mut manager = license_manager.lock().unwrap();
            if let Err(e) = manager.save(info) {
                return Ok(ActivationResult {
                    success: false,
                    message: format!("保存许可证失败：{}", e),
                    license_info: None,
                });
            }
        }
    }
    
    Ok(result)
}

/// 获取当前许可证信息
#[tauri::command]
pub fn get_license_info(
    license_manager: State<Arc<Mutex<LicenseManager>>>,
) -> Result<Option<LicenseInfo>, String> {
    let mut manager = license_manager.lock().unwrap();
    Ok(manager.load().cloned())
}

/// 反激活许可证
#[tauri::command]
pub fn deactivate_license(
    license_manager: State<Arc<Mutex<LicenseManager>>>,
) -> Result<(), String> {
    let mut manager = license_manager.lock().unwrap();
    manager.remove().map_err(|e| format!("反激活失败：{}", e))
}

/// 生成许可证码（仅用于管理员/批量生成工具）
#[tauri::command]
pub fn generate_license_codes(
    count: u32,
    license_type: String,
    device_slots: u32,
) -> Result<Vec<String>, String> {
    use crate::license::generate_batch_license_codes;
    
    let ltype = match license_type.as_str() {
        "standard" => LicenseType::Standard,
        "family" => LicenseType::Family,
        "enterprise" => LicenseType::Enterprise,
        _ => LicenseType::Standard,
    };
    
    Ok(generate_batch_license_codes(count as usize, ltype, device_slots))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{encrypt_data, generate_encryption_key, ClipboardItem};

    fn settings_with_key(key: &[u8]) -> AppSettings {
        AppSettings {
            encryption_key: Some(STANDARD.encode(key)),
            ..AppSettings::default()
        }
    }

    fn text_item(id: &str, content: String, preview: String) -> ClipboardItem {
        ClipboardItem {
            id: id.to_string(),
            item_type: "text".to_string(),
            content,
            preview,
            pinned: false,
            protected: false,
            created_at: 1,
            updated_at: None,
            file_path: None,
            tags: Vec::new(),
            copy_count: 0,
        }
    }

    #[test]
    fn search_matches_decrypted_sensitive_content() {
        let key = generate_encryption_key();
        let encrypted = encrypt_data("secret-user@example.com", &key).unwrap();
        let settings = settings_with_key(&key);
        let items = vec![text_item(
            "encrypted",
            format!("ENCRYPTED:{}", encrypted),
            "ENCRYPTED".to_string(),
        )];

        let results = filter_items_for_search(items, "secret-user@example.com", &settings);

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].content, "secret-user@example.com");
    }

    #[test]
    fn search_ignores_blank_queries() {
        let settings = AppSettings::default();
        let items = vec![text_item(
            "plain",
            "ordinary clipboard text".to_string(),
            "ordinary clipboard text".to_string(),
        )];

        let results = filter_items_for_search(items.clone(), "", &settings);

        assert!(results.is_empty());

        let results = filter_items_for_search(items, "   ", &settings);

        assert!(results.is_empty());
    }

    #[test]
    fn clear_history_removes_tagged_items_when_keep_pinned_is_disabled() {
        let mut tagged = text_item("tagged", "content".to_string(), "content".to_string());
        tagged.tags = vec!["work".to_string()];

        assert!(should_clear_history_item(&tagged, false));
    }

    #[test]
    fn clear_history_keeps_pinned_and_tagged_items_when_requested() {
        let mut pinned = text_item("pinned", "content".to_string(), "content".to_string());
        pinned.pinned = true;
        let mut tagged = text_item("tagged", "content".to_string(), "content".to_string());
        tagged.tags = vec!["work".to_string()];
        let plain = text_item("plain", "content".to_string(), "content".to_string());

        assert!(!should_clear_history_item(&pinned, true));
        assert!(!should_clear_history_item(&tagged, true));
        assert!(should_clear_history_item(&plain, true));
    }

    #[test]
    fn storage_command_result_rejects_storage_errors() {
        let result = storage_command_result(Err(rusqlite::Error::QueryReturnedNoRows));

        assert!(result.is_err());
    }

    #[test]
    fn clipboard_command_result_rejects_clipboard_errors() {
        let result = clipboard_command_result(Err("clipboard unavailable".to_string()));

        assert!(result.is_err());
    }

    #[test]
    fn paginated_history_result_rejects_storage_errors() {
        let settings = AppSettings::default();
        let result = paginated_history_result(Err(rusqlite::Error::InvalidQuery), &settings);

        assert!(result.is_err());
    }

    #[test]
    fn history_result_rejects_storage_errors() {
        let settings = AppSettings::default();
        let result = history_result(Err(rusqlite::Error::InvalidQuery), &settings);

        assert!(result.is_err());
    }

    #[test]
    fn tagged_items_result_rejects_storage_errors() {
        let settings = AppSettings::default();
        let result = tagged_items_result(Err(rusqlite::Error::InvalidQuery), "work", &settings);

        assert!(result.is_err());
    }

    #[test]
    fn tagged_items_result_filters_matching_tags() {
        let settings = AppSettings::default();
        let mut work_item = text_item("work-item", "content".to_string(), "content".to_string());
        work_item.tags = vec!["work".to_string()];
        let mut personal_item =
            text_item("personal-item", "content".to_string(), "content".to_string());
        personal_item.tags = vec!["personal".to_string()];

        let result = tagged_items_result(Ok(vec![work_item, personal_item]), "work", &settings)
            .unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "work-item");
    }

    #[test]
    fn tags_result_rejects_storage_errors() {
        let result = tags_result(Err(rusqlite::Error::InvalidQuery));

        assert!(result.is_err());
    }

    #[test]
    fn search_history_result_rejects_storage_errors() {
        let settings = AppSettings::default();
        let result = search_history_result(Err(rusqlite::Error::InvalidQuery), "query", &settings);

        assert!(result.is_err());
    }

    #[test]
    fn clear_history_delete_result_rejects_storage_errors() {
        let result = clear_history_delete_result(Err(rusqlite::Error::QueryReturnedNoRows));

        assert!(result.is_err());
    }

    #[test]
    fn import_item_result_rejects_storage_errors() {
        let result = import_item_result(Err(rusqlite::Error::InvalidQuery));

        assert!(result.is_err());
    }

    #[test]
    fn save_history_result_rejects_storage_errors() {
        let result = save_history_result(Err(rusqlite::Error::InvalidQuery));

        assert!(result.is_err());
    }

    #[test]
    fn auto_cleanup_result_rejects_storage_errors() {
        let result = auto_cleanup_result(Err(rusqlite::Error::InvalidQuery));

        assert!(result.is_err());
    }

    #[test]
    fn autostart_result_rejects_autostart_errors() {
        let result = autostart_result(Err("autostart unavailable".to_string()));

        assert!(result.is_err());
    }

    #[test]
    fn save_settings_preserves_existing_secret_fields_when_omitted() {
        let existing = AppSettings {
            global_password: Some("password-hash".to_string()),
            encryption_key: Some("encryption-key".to_string()),
            ..AppSettings::default()
        };
        let incoming = AppSettings {
            theme: "dark".to_string(),
            global_password: None,
            encryption_key: None,
            ..AppSettings::default()
        };

        let merged = merge_settings_for_save(incoming, &existing);

        assert_eq!(merged.theme, "dark");
        assert_eq!(merged.global_password, Some("password-hash".to_string()));
        assert_eq!(merged.encryption_key, Some("encryption-key".to_string()));
    }

    #[test]
    fn save_settings_clamps_history_limit_before_persisting() {
        let existing = AppSettings::default();
        let too_low = AppSettings {
            max_history_items: 1,
            ..AppSettings::default()
        };
        let too_high = AppSettings {
            max_history_items: 50_000,
            ..AppSettings::default()
        };

        assert_eq!(
            merge_settings_for_save(too_low, &existing).max_history_items,
            100
        );
        assert_eq!(
            merge_settings_for_save(too_high, &existing).max_history_items,
            10_000
        );
    }
}
