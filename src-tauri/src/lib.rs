use tauri::Emitter;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use std::sync::{Arc, Mutex};

mod clipboard;
mod storage;
mod commands;
mod window;
mod settings;

use clipboard::ClipboardManager;
use storage::Storage;
use settings::SettingsManager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

pub fn run() {
    let clipboard = Arc::new(Mutex::new(ClipboardManager::new()));
    let storage = Arc::new(Mutex::new(Storage::new().expect("Failed to init storage")));
    let settings = Arc::new(Mutex::new(SettingsManager::new()));

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
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
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
            commands::set_autostart,
            commands::set_global_password,
            commands::verify_password,
            commands::has_global_password,
            commands::get_image_data,
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
                if text != last_text 
                    && !text.trim().is_empty()
                    && !storage.content_exists(&text).unwrap_or(false) 
                {
                    last_text = text.clone();
                    let _ = storage.save_clipboard_item(&text);
                    let max_items = settings.load().max_history_items;
                    let _ = storage.cleanup_old_items(max_items);
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
                            let preview = format!("data:image/png;base64,{}", crate::storage::base64_encode(&image_data[..image_data.len().min(50000)]));
                            
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
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                file_paths.hash(&mut hasher);
                let hash = hasher.finish();
                
                if last_files_hash != Some(hash) {
                    last_files_hash = Some(hash);
                    
                    let content = file_paths.join("\n");
                    if !storage.content_exists(&content).unwrap_or(false) {
                        let _ = storage.save_files_item(&file_paths);
                        let max_items = settings.load().max_history_items;
                        let _ = storage.cleanup_old_items(max_items);
                        let _ = handle.emit("clipboard-updated", ());
                    }
                }
            }
            crate::clipboard::ClipboardContent::Empty => {}
        }
    }
}