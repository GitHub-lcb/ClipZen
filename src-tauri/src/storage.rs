// 数据存储模块

use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use std::path::PathBuf;
use dirs::data_dir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: String,
    pub item_type: String, // "text", "image", "file"
    pub content: String,   // 文本内容或图片 base64/文件路径
    pub preview: String,   // 文本预览或图片缩略图 base64
    pub pinned: bool,
    pub created_at: i64,
    pub file_path: Option<String>, // 图片/文件存储路径
    pub tags: Vec<String>,  // 标签列表
}

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn new() -> Result<Self> {
        // 将数据库存储在用户应用数据目录，避免触发 Tauri 文件监控
        let db_path = get_database_path();
        let conn = Connection::open(db_path)?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_items (
                id TEXT PRIMARY KEY,
                item_type TEXT NOT NULL,
                content TEXT NOT NULL,
                preview TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                file_path TEXT,
                tags TEXT
            )",
            [],
        )?;

        // 添加 file_path 列（如果不存在）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN file_path TEXT",
            [],
        ).ok();

        // 添加 tags 列（如果不存在）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN tags TEXT",
            [],
        ).ok();

        Ok(Self { conn })
    }

    /// 保存文本剪贴板
    pub fn save_clipboard_item(&self, content: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let preview = content.chars().take(100).collect();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            [
                &id,
                &"text".to_string(),
                &content.to_string(),
                &preview,
                &0.to_string(),
                &Utc::now().timestamp_millis().to_string(),
                &"".to_string(),
                &"[]".to_string(),
            ],
        )?;
        Ok(id)
    }

    /// 保存图片剪贴板
    pub fn save_image_item(&self, image_data: &[u8], preview_base64: &str, file_path: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            [
                &id,
                &"image".to_string(),
                &base64_encode(image_data),
                preview_base64,
                &0.to_string(),
                &Utc::now().timestamp_millis().to_string(),
                &file_path.to_string(),
                &"[]".to_string(),
            ],
        )?;
        Ok(id)
    }

    #[allow(dead_code)]
    pub fn save_item(&self, item: &ClipboardItem) -> Result<()> {
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            [
                &item.id,
                &item.item_type,
                &item.content,
                &item.preview,
                &(if item.pinned { 1 } else { 0 }).to_string(),
                &item.created_at.to_string(),
                &item.file_path.clone().unwrap_or_default(),
                &tags_json,
            ],
        )?;
        Ok(())
    }

    pub fn get_all_items(&self) -> Result<Vec<ClipboardItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, content, preview, pinned, created_at, file_path, tags 
             FROM clipboard_items 
             ORDER BY created_at DESC"
        )?;

        let items = stmt.query_map([], |row| {
            let tags_str: String = row.get(7)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            
            Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                pinned: row.get::<_, i32>(4)? == 1,
                created_at: row.get(5)?,
                file_path: row.get(6)?,
                tags,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    pub fn delete_item(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM clipboard_items WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    pub fn toggle_pin(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE clipboard_items SET pinned = NOT pinned WHERE id = ?1",
            [id],
        )?;
        Ok(())
    }

    /// 检查内容是否已存在
    pub fn content_exists(&self, content: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM clipboard_items WHERE content = ?1"
        )?;
        let count: i32 = stmt.query_row([content], |row| row.get(0))?;
        Ok(count > 0)
    }

    /// 导入单条记录（用于批量导入）
    pub fn import_item(&self, item: &ClipboardItem) -> Result<()> {
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            [
                &item.id,
                &item.item_type,
                &item.content,
                &item.preview,
                &(if item.pinned { 1 } else { 0 }).to_string(),
                &item.created_at.to_string(),
                &item.file_path.clone().unwrap_or_default(),
                &tags_json,
            ],
        )?;
        Ok(())
    }
}

impl Default for Storage {
    fn default() -> Self {
        Self::new().expect("Failed to initialize storage")
    }
}

/// 获取数据库文件路径
fn get_database_path() -> PathBuf {
    // 优先使用应用数据目录
    if let Some(data_dir) = data_dir() {
        let app_dir = data_dir.join("ClipZen");
        if let Err(e) = std::fs::create_dir_all(&app_dir) {
            eprintln!("Failed to create app directory: {}", e);
            // 如果创建失败，回退到当前目录
            return PathBuf::from("clipzen.db");
        }
        app_dir.join("clipzen.db")
    } else {
        // 如果无法获取应用数据目录，使用当前目录
        PathBuf::from("clipzen.db")
    }
}

/// 简单的 base64 编码（避免额外依赖）
pub fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as usize;
        let b1 = if i + 1 < data.len() { data[i + 1] as usize } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as usize } else { 0 };
        
        result.push(ALPHABET[(b0 >> 2) & 0x3F] as char);
        result.push(ALPHABET[((b0 << 4) | (b1 >> 4)) & 0x3F] as char);
        result.push(if i + 1 < data.len() { ALPHABET[((b1 << 2) | (b2 >> 6)) & 0x3F] as char } else { '=' });
        result.push(if i + 2 < data.len() { ALPHABET[b2 & 0x3F] as char } else { '=' });
        
        i += 3;
    }
    result
}
