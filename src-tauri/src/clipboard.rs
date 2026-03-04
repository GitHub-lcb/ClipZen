// 剪贴板监听模块
// TODO: 实现跨平台剪贴板监听

use arboard::Clipboard;
use std::sync::Mutex;

pub struct ClipboardManager {
    clipboard: Mutex<Option<Clipboard>>,
}

impl ClipboardManager {
    pub fn new() -> Self {
        Self {
            clipboard: Mutex::new(Clipboard::new().ok()),
        }
    }

    pub fn get_text(&self) -> Option<String> {
        let mut clip = self.clipboard.lock().unwrap();
        if let Some(ref mut c) = *clip {
            c.get_text().ok()
        } else {
            None
        }
    }

    pub fn set_text(&self, text: &str) -> Result<(), String> {
        let mut clip = self.clipboard.lock().unwrap();
        if let Some(ref mut c) = *clip {
            c.set_text(text).map_err(|e| e.to_string())?;
            Ok(())
        } else {
            Err("Clipboard not available".to_string())
        }
    }
}

impl Default for ClipboardManager {
    fn default() -> Self {
        Self::new()
    }
}
