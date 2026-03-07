use tauri::Emitter;
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
        .manage(clipboard)
        .manage(storage)
        .manage(settings)
        .invoke_handler(tauri::generate_handler![
            commands::get_clipboard_history,
            commands::save_to_history,
            commands::delete_history_item,
            commands::toggle_pin_item,
            commands::copy_to_clipboard,
            commands::get_current_clipboard_content,
            commands::copy_image_to_clipboard,
            commands::get_settings,
            commands::save_settings,
            commands::export_history,
            commands::import_history,
            commands::clear_all_history,
            commands::get_all_tags,
            commands::add_tag_to_item,
            commands::remove_tag_from_item,
            commands::get_items_by_tag,
            commands::set_autostart,
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClipZen");
}

// 剪贴板监听循环
fn start_clipboard_listener<R: tauri::Runtime>(handle: tauri::AppHandle<R>) {
    let clipboard = ClipboardManager::new();
    let storage = Storage::new().expect("Failed to init storage");
    let settings = SettingsManager::new();
    let mut last_content = String::new();

    loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        
        if let Some(content) = clipboard.get_text() {
            // 检查：不是空内容、与上次不同、且数据库中不存在
            if content != last_content 
                && !content.trim().is_empty()
                && !storage.content_exists(&content).unwrap_or(false) 
            {
                last_content = content.clone();
                
                // 保存到存储
                let _ = storage.save_clipboard_item(&content);
                
                // 清理超出限制的旧记录
                let max_items = settings.load().max_history_items;
                let _ = storage.cleanup_old_items(max_items);
                
                // 通知前端更新
                let _ = handle.emit("clipboard-updated", ());
            }
        }
    }
}
