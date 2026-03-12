// 剪贴板监听模块

use arboard::Clipboard;
use std::sync::Mutex;
use std::path::Path;

#[derive(Debug, Clone)]
pub enum ClipboardContent {
    Text(String),
    Image(Vec<u8>), // PNG 格式字节
    Files(Vec<String>), // 文件路径列表
    Empty,
}

pub struct ClipboardManager {
    clipboard: Mutex<Option<Clipboard>>,
}

impl ClipboardManager {
    pub fn new() -> Self {
        Self {
            clipboard: Mutex::new(Clipboard::new().ok()),
        }
    }

    #[allow(dead_code)]
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
            c.set_text(text).map_err(|e| e.to_string())
        } else {
            Err("Clipboard not available".to_string())
        }
    }

    /// 检测文本是否是文件路径（可能是多个路径，每行一个）
    fn detect_file_paths(text: &str) -> Option<Vec<String>> {
        let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.is_empty() {
            return None;
        }
        
        let mut paths: Vec<String> = Vec::new();
        for line in lines {
            let trimmed = line.trim();
            // 检测是否是文件路径
            let path = Path::new(trimmed);
            if path.exists() && (trimmed.starts_with('/') || trimmed.starts_with('~') || 
                (trimmed.len() > 2 && trimmed.chars().nth(1) == Some(':'))) { // Unix 或 Windows 路径
                paths.push(trimmed.to_string());
            }
        }
        
        if !paths.is_empty() {
            Some(paths)
        } else {
            None
        }
    }

    /// 获取剪贴板内容（自动检测类型）
    pub fn get_content(&self) -> ClipboardContent {
        let mut clip = self.clipboard.lock().unwrap();
        if let Some(ref mut c) = *clip {
            // 先尝试获取图片
            if let Ok(image) = c.get_image() {
                // 转换为 PNG 格式
                use image::codecs::png::PngEncoder;
                use image::ImageEncoder;
                use image::ColorType;
                let mut png_data = Vec::new();
                let encoder = PngEncoder::new(&mut png_data);
                let _ = encoder.write_image(
                    &image.bytes,
                    image.width as u32,
                    image.height as u32,
                    ColorType::Rgba8,
                );
                return ClipboardContent::Image(png_data);
            }
            // 再尝试获取文本
            if let Ok(text) = c.get_text() {
                // 检测是否是文件路径
                if let Some(paths) = Self::detect_file_paths(&text) {
                    return ClipboardContent::Files(paths);
                }
                return ClipboardContent::Text(text);
            }
        }
        ClipboardContent::Empty
    }

    /// 设置图片到剪贴板
    pub fn set_image(&self, image_data: &[u8]) -> Result<(), String> {
        let mut clip = self.clipboard.lock().unwrap();
        if let Some(ref mut c) = *clip {
            let img = image::load_from_memory(image_data)
                .map_err(|e| format!("Failed to load image: {}", e))?;
            let rgba = img.to_rgba8();
            let (width, height) = rgba.dimensions();
            
            let arboard_image = arboard::ImageData {
                width: width as usize,
                height: height as usize,
                bytes: rgba.to_vec().into(),
            };
            
            c.set_image(arboard_image).map_err(|e| e.to_string())
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
