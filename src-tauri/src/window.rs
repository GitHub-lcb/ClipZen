// 窗口管理模块

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

/// 获取主窗口
#[allow(dead_code)]
pub fn get_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

/// 切换窗口显示/隐藏
pub fn toggle_window_visibility<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// 显示窗口
#[allow(dead_code)]
pub fn show_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 隐藏窗口
#[allow(dead_code)]
pub fn hide_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_main_window(app) {
        let _ = window.hide();
    }
}
