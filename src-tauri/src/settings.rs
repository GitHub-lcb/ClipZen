// 设置模块

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub max_history_items: u32,      // 最大历史记录数
    pub auto_clear_after_days: u32,  // 自动清理天数（0=不清理）
    pub theme: String,               // "light", "dark", "system"
    pub language: String,            // "zh-CN", "en-US"
    pub start_on_boot: bool,         // 开机自启
    pub show_in_tray: bool,          // 显示系统托盘
    pub hotkey_show: String,         // 显示/隐藏快捷键
    pub hotkey_copy: String,         // 复制快捷键
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            max_history_items: 1000,
            auto_clear_after_days: 0,
            theme: "system".to_string(),
            language: "zh-CN".to_string(),
            start_on_boot: false,
            show_in_tray: true,
            hotkey_show: "Shift+Super+V".to_string(),
            hotkey_copy: "Super+C".to_string(),
        }
    }
}

pub struct SettingsManager {
    config_path: PathBuf,
}

impl SettingsManager {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clipzen");
        fs::create_dir_all(&config_dir).ok();
        
        let config_path = config_dir.join("settings.json");
        Self { config_path }
    }

    pub fn load(&self) -> AppSettings {
        if let Ok(content) = fs::read_to_string(&self.config_path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppSettings::default()
        }
    }

    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        
        fs::write(&self.config_path, content)
            .map_err(|e| format!("Failed to write settings: {}", e))?;
        
        Ok(())
    }

    pub fn get_config_path(&self) -> String {
        self.config_path.to_str().unwrap_or("").to_string()
    }
}

impl Default for SettingsManager {
    fn default() -> Self {
        Self::new()
    }
}
