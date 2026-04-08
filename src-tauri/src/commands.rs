// Tauri 命令处理模块

use crate::clipboard::{ClipboardManager, ClipboardContent};
use crate::storage::{Storage, encrypt_data, decrypt_data};
use crate::settings::{SettingsManager, AppSettings, hash_password, verify_password_hash};
use crate::license::{LicenseManager, LicenseInfo, LicenseType, ActivationResult};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use tauri::State;
use std::sync::{Arc, Mutex};
use std::fs;
use std::path::PathBuf;

#[tauri::command]
pub fn get_clipboard_history(storage: State<Arc<Mutex<Storage>>>, settings: State<Arc<Mutex<SettingsManager>>>) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    let mut items = storage.get_all_items().unwrap_or_default();
    decrypt_sensitive_items(&mut items, &app_settings);
    items
}

#[tauri::command]
pub fn get_clipboard_history_paginated(
    page: u32,
    page_size: u32,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> (Vec<crate::storage::ClipboardItem>, u32) {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    let all_items = storage.get_all_items().unwrap_or_default();
    let total_count = all_items.len() as u32;
    
    // 计算分页
    let start = (page - 1) * page_size;
    let end = start + page_size;
    let paginated_items: Vec<_> = all_items.into_iter()
        .skip(start as usize)
        .take(page_size as usize)
        .collect();
    
    let mut items = paginated_items;
    decrypt_sensitive_items(&mut items, &app_settings);
    
    (items, total_count)
}

#[tauri::command]
pub fn get_clipboard_history_sorted(
    sort_by: String,
    sort_order: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    let mut items = storage.get_items_sorted(&sort_by, &sort_order).unwrap_or_default();
    decrypt_sensitive_items(&mut items, &app_settings);
    items
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

#[tauri::command]
pub fn save_to_history(
    content: String,
    _item_type: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> String {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    let mut processed_content = content;
    
    // 检测并加密敏感信息
    if crate::storage::contains_sensitive_info(&content) {
        if let Some(encryption_key_str) = &app_settings.encryption_key {
            if let Ok(encryption_key) = STANDARD.decode(encryption_key_str) {
                if let Ok(encrypted) = crate::storage::encrypt_data(&content, &encryption_key) {
                    processed_content = format!("ENCRYPTED:{}", encrypted);
                }
            }
        }
    }
    
    storage.save_clipboard_item(&processed_content).unwrap_or_default()
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
pub fn increment_copy_count(id: String, storage: State<Arc<Mutex<Storage>>>) -> bool {
    let storage = storage.lock().unwrap();
    storage.increment_copy_count(&id).is_ok()
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
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut hasher = DefaultHasher::new();
            image_data.hash(&mut hasher);
            let hash = hasher.finish();
            let hash_str = format!("{:016x}", hash);
            
            let storage = storage.lock().unwrap();
            
            if storage.hash_exists(&hash_str).unwrap_or(false) {
                let _ = storage.update_item_timestamp_by_hash(&hash_str);
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
                    
                    let _ = storage.save_image_item(&image_data, &preview, file_path.to_str().unwrap(), &hash_str);
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
    let storage_guard = storage.lock().unwrap();
    let items = storage_guard.get_all_items().map_err(|e| e.to_string())?;
    let item = items.iter().find(|i| i.id == item_id)
        .ok_or_else(|| "Item not found".to_string())?;
    
    if item.item_type != "image" {
        return Err("Item is not an image".to_string());
    }
    
    let image_data: Vec<u8>;
    
    if let Some(ref file_path) = item.file_path {
        if let Ok(data) = fs::read(file_path) {
            image_data = data;
        } else {
            return Err(format!("Failed to read image file: {}", file_path));
        }
    } else {
        return Err("Image file path not found".to_string());
    }
    
    let clipboard_guard = clipboard.lock().unwrap();
    clipboard_guard.set_image(&image_data)
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
        // 保留置顶记录和带标签的记录
        if keep_pinned && item.pinned {
            continue;
        }
        if !item.tags.is_empty() {
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
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    if let Ok(mut items) = storage.get_all_items() {
        decrypt_sensitive_items(&mut items, &app_settings);
        items.into_iter().filter(|i| i.tags.contains(&tag)).collect()
    } else {
        Vec::new()
    }
}

/// 搜索剪贴板记录
#[tauri::command]
pub fn search_clipboard_history(
    query: String,
    storage: State<Arc<Mutex<Storage>>>,
    settings: State<Arc<Mutex<SettingsManager>>>,
) -> Vec<crate::storage::ClipboardItem> {
    let storage = storage.lock().unwrap();
    let settings_manager = settings.lock().unwrap();
    let app_settings = settings_manager.load();
    
    if let Ok(mut items) = storage.get_all_items() {
        let query_lower = query.to_lowercase();
        let mut filtered_items: Vec<_> = items.into_iter()
            .filter(|item| {
                item.item_type == "image" ||
                item.content.to_lowercase().contains(&query_lower) ||
                item.preview.to_lowercase().contains(&query_lower) ||
                item.tags.iter().any(|tag| tag.to_lowercase().contains(&query_lower))
            })
            .collect();
        
        decrypt_sensitive_items(&mut filtered_items, &app_settings);
        filtered_items
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
