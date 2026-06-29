use tauri::Emitter;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use std::sync::{Arc, Mutex};

mod clipboard;
mod storage;
mod commands;
mod window;
mod settings;
mod license;

use clipboard::ClipboardManager;
use storage::Storage;
use settings::SettingsManager;
use license::LicenseManager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub fn run() {
    let clipboard = Arc::new(Mutex::new(ClipboardManager::new()));
    let storage = Arc::new(Mutex::new(Storage::new().expect("Failed to init storage")));
    let settings = Arc::new(Mutex::new(SettingsManager::new()));
    let license = Arc::new(Mutex::new(LicenseManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(clipboard.clone())
        .manage(storage.clone())
        .manage(settings.clone())
        .manage(license.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::get_clipboard_history_paginated,
            commands::get_clipboard_history_sorted,
            commands::save_to_history,
            commands::delete_history_item,
            commands::toggle_pin_item,
            commands::toggle_protected,
            commands::increment_copy_count,
            commands::copy_to_clipboard,
            commands::copy_masked_content,
            commands::get_current_clipboard_content,
            commands::copy_image,
            commands::get_settings,
            commands::save_settings,
            commands::export_history,
            commands::import_history,
            commands::clear_all_history,
            commands::get_all_tags,
            commands::add_tag_to_item,
            commands::remove_tag_from_item,
            commands::update_item_content,
            commands::get_items_by_tag,
            commands::search_clipboard_history,
            commands::set_autostart,
            commands::set_global_password,
            commands::verify_password,
            commands::has_global_password,
            commands::get_image_data,
            commands::activate_license,
            commands::get_license_info,
            commands::deactivate_license,
            commands::generate_license_codes,
        ])
        .setup(|app| {
            // 启动剪贴板监听
            let clipboard_handle = app.handle().clone();
            std::thread::spawn(move || {
                start_clipboard_listener(clipboard_handle);
            });

            // 注册全局快捷键 - 显示/隐藏窗口
            use tauri_plugin_global_shortcut::{Shortcut, Modifiers, ShortcutState};
            
            #[cfg(target_os = "macos")]
            let shortcut = Shortcut::new(Some(Modifiers::SHIFT | Modifiers::SUPER), tauri_plugin_global_shortcut::Code::KeyV);
            
            #[cfg(not(target_os = "macos"))]
            let shortcut = Shortcut::new(Some(Modifiers::SHIFT | Modifiers::CONTROL), tauri_plugin_global_shortcut::Code::KeyV);

            let app_handle = app.handle().clone();
            let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    window::toggle_window_visibility(&app_handle);
                }
            });

            // 创建系统托盘
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>).unwrap();
            let hide_item = MenuItem::with_id(app, "hide", "隐藏窗口", true, None::<&str>).unwrap();
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>).unwrap();
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>).unwrap();
            
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &settings_item, &quit_item]).unwrap();
            
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            window::show_window(app);
                        }
                        "hide" => {
                            window::hide_window(app);
                        }
                        "settings" => {
                            window::show_window(app);
                            let _ = app.emit("open-settings", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)
                .unwrap();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipZen");
}

// 剪贴板监听循环
fn start_clipboard_listener<R: tauri::Runtime>(handle: tauri::AppHandle<R>) {
    use std::fs;
    use std::path::PathBuf;
    
    let clipboard = ClipboardManager::new();
    let storage = Storage::new().expect("Failed to init storage");
    let settings = SettingsManager::new();
    let mut last_text = String::new();
    let mut last_image_hash: Option<u64> = None;
    let mut last_files_hash: Option<u64> = None;

    loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        // 获取剪贴板内容（自动检测类型）
        let content = clipboard.get_content();
        
        match content {
            crate::clipboard::ClipboardContent::Text(text) => {
                let app_settings = settings.load();
                if save_detected_text_item(&storage, &app_settings, &text, &mut last_text) {
                    let _ = handle.emit("clipboard-updated", ());
                }
            }
            crate::clipboard::ClipboardContent::Image(image_data) => {
                // 计算图片哈希以检测重复
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                image_data.hash(&mut hasher);
                let hash = hasher.finish();
                let hash_str = format!("{:016x}", hash);
                
                if last_image_hash != Some(hash) {
                    last_image_hash = Some(hash);
                    
                    // 检查数据库中是否已存在相同图片
                    if storage.hash_exists(&hash_str).unwrap_or(false) {
                        // 已存在，更新时间戳提升到顶部
                        let _ = storage.update_item_timestamp_by_hash(&hash_str);
                        let _ = handle.emit("clipboard-updated", ());
                    } else {
                        // 不存在，保存新图片
                        let images_dir = dirs::data_local_dir()
                            .unwrap_or_else(|| PathBuf::from("."))
                            .join("ClipZen")
                            .join("images");
                        fs::create_dir_all(&images_dir).ok();
                        
                        let timestamp = chrono::Utc::now().timestamp_millis();
                        let file_path = images_dir.join(format!("{}.png", timestamp));
                        
                        if fs::write(&file_path, &image_data).is_ok() {
                            // 生成更小的预览图，减少内存使用
                            let preview = format!("data:image/png;base64,{}", crate::storage::base64_encode(&image_data[..image_data.len().min(5000)]));
                            
                            let _ = storage.save_image_item(&image_data, &preview, file_path.to_str().unwrap(), &hash_str);
                            let max_items = settings.load().max_history_items;
                            let _ = storage.cleanup_old_items(max_items);
                            let _ = handle.emit("clipboard-updated", ());
                        }
                    }
                }
            }
            crate::clipboard::ClipboardContent::Files(file_paths) => {
                // 计算文件列表哈希以检测重复
                let app_settings = settings.load();
                if save_detected_files_item(
                    &storage,
                    &app_settings,
                    &file_paths,
                    &mut last_files_hash,
                ) {
                    let _ = handle.emit("clipboard-updated", ());
                }
            }
            crate::clipboard::ClipboardContent::Empty => {}
        }
    }
}

fn save_detected_text_item(
    storage: &Storage,
    app_settings: &settings::AppSettings,
    text: &str,
    last_text: &mut String,
) -> bool {
    if text == last_text || text.trim().is_empty() {
        return false;
    }

    let processed_text = crate::storage::protect_sensitive_content(
        text,
        app_settings.encryption_key.as_deref(),
    );
    let content_hash = crate::storage::sensitive_content_hash(
        text,
        app_settings.encryption_key.as_deref(),
    );

    if let Some(hash) = content_hash.as_deref() {
        if storage
            .save_clipboard_item_with_hash(&processed_text, Some(hash))
            .is_err()
        {
            return false;
        }
    } else {
        if storage.save_clipboard_item(&processed_text).is_err() {
            return false;
        }
    }

    *last_text = text.to_string();
    let _ = storage.cleanup_old_items(app_settings.max_history_items);
    true
}

fn save_detected_files_item(
    storage: &Storage,
    app_settings: &settings::AppSettings,
    file_paths: &[String],
    last_files_hash: &mut Option<u64>,
) -> bool {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    file_paths.hash(&mut hasher);
    let hash = hasher.finish();

    if *last_files_hash == Some(hash) {
        return false;
    }

    if storage.save_files_item(file_paths).is_err() {
        return false;
    }

    *last_files_hash = Some(hash);
    let _ = storage.cleanup_old_items(app_settings.max_history_items);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn memory_storage() -> Storage {
        Storage::from_connection(Connection::open_in_memory().unwrap()).unwrap()
    }

    #[test]
    fn listener_text_save_refreshes_existing_item_after_other_clipboard_content() {
        let storage = memory_storage();
        let settings = settings::AppSettings::default();
        let mut last_text = String::new();

        assert!(save_detected_text_item(
            &storage,
            &settings,
            "repeat me",
            &mut last_text
        ));

        last_text = "other clipboard content".to_string();

        assert!(save_detected_text_item(
            &storage,
            &settings,
            "repeat me",
            &mut last_text
        ));
        let items = storage.get_all_items().unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, "repeat me");
    }

    #[test]
    fn listener_files_save_refreshes_existing_item_after_other_clipboard_content() {
        let storage = memory_storage();
        let settings = settings::AppSettings::default();
        let files = vec![
            "C:\\Users\\clip\\one.txt".to_string(),
            "C:\\Users\\clip\\two.txt".to_string(),
        ];
        let other_files = vec!["C:\\Users\\clip\\other.txt".to_string()];
        let mut last_files_hash = None;

        assert!(save_detected_files_item(
            &storage,
            &settings,
            &files,
            &mut last_files_hash
        ));
        assert!(save_detected_files_item(
            &storage,
            &settings,
            &other_files,
            &mut last_files_hash
        ));

        assert!(save_detected_files_item(
            &storage,
            &settings,
            &files,
            &mut last_files_hash
        ));
        let items = storage.get_all_items().unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].content, files.join("\n"));
    }
}
