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
    pub protected: bool,   // 是否受密码保护
    pub created_at: i64,
    pub updated_at: Option<i64>, // 最后更新时间
    pub file_path: Option<String>, // 图片/文件存储路径
    pub tags: Vec<String>,  // 标签列表
    pub copy_count: i32,    // 复制次数（热度）
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

        // 添加 updated_at 列（如果不存在）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN updated_at INTEGER",
            [],
        ).ok();

        // 添加 protected 列（如果不存在）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN protected INTEGER NOT NULL DEFAULT 0",
            [],
        ).ok();

        // 添加 content_hash 列（用于去重）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN content_hash TEXT",
            [],
        ).ok();

        // 创建哈希索引以加速查询
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_content_hash ON clipboard_items(content_hash)",
            [],
        ).ok();

        // 添加 copy_count 列（用于热度排序）
        conn.execute(
            "ALTER TABLE clipboard_items ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0",
            [],
        ).ok();

        Ok(Self { conn })
    }

    /// 保存文本剪贴板
    pub fn save_clipboard_item(&self, content: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let preview = content.chars().take(100).collect();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &id,
                &"text".to_string(),
                &content.to_string(),
                &preview,
                &0.to_string(),
                &0.to_string(),
                &Utc::now().timestamp_millis().to_string(),
                &"".to_string(),
                &"[]".to_string(),
            ],
        )?;
        Ok(id)
    }

    /// 清理超出限制的旧记录（保留置顶）
    pub fn cleanup_old_items(&self, max_items: u32) -> Result<usize> {
        // 获取非置顶记录数量
        let count: i32 = self.conn.query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE pinned = 0",
            [],
            |row| row.get(0)
        )?;
        
        if count <= max_items as i32 {
            return Ok(0);
        }
        
        // 删除最旧的非置顶记录
        let delete_count = count - max_items as i32;
        self.conn.execute(
            "DELETE FROM clipboard_items WHERE id IN (
                SELECT id FROM clipboard_items WHERE pinned = 0 
                ORDER BY created_at ASC LIMIT ?1
            )",
            [delete_count],
        )
    }

    /// 保存图片剪贴板
    pub fn save_image_item(&self, image_data: &[u8], preview_base64: &str, file_path: &str, content_hash: &str) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            [
                &id,
                "image",
                &base64_encode(image_data),
                preview_base64,
                &0.to_string(),
                &0.to_string(),
                &Utc::now().timestamp_millis().to_string(),
                file_path,
                "[]",
                content_hash,
            ],
        )?;
        Ok(id)
    }

    /// 保存文件路径列表
    pub fn save_files_item(&self, file_paths: &[String]) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let content = file_paths.join("\n");
        
        // 生成预览：显示文件名列表
        let preview: String = file_paths
            .iter()
            .take(3)
            .map(|p| {
                std::path::Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.clone())
            })
            .collect::<Vec<_>>()
            .join(", ");
        let preview = if file_paths.len() > 3 {
            format!("{}... ({} 个文件)", preview, file_paths.len())
        } else {
            preview
        };
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &id,
                &"files".to_string(),
                &content,
                &preview,
                &0.to_string(),
                &0.to_string(),
                &Utc::now().timestamp_millis().to_string(),
                &file_paths.first().cloned().unwrap_or_default(),
                &"[]".to_string(),
            ],
        )?;
        Ok(id)
    }

    #[allow(dead_code)]
    pub fn save_item(&self, item: &ClipboardItem) -> Result<()> {
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        let updated_at = item.updated_at.map(|t| t.to_string()).unwrap_or_default();
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            [
                &item.id,
                &item.item_type,
                &item.content,
                &item.preview,
                &(if item.pinned { 1 } else { 0 }).to_string(),
                &(if item.protected { 1 } else { 0 }).to_string(),
                &item.created_at.to_string(),
                &item.file_path.clone().unwrap_or_default(),
                &tags_json,
                &updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_all_items(&self) -> Result<Vec<ClipboardItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, COALESCE(copy_count, 0) 
             FROM clipboard_items 
             ORDER BY pinned DESC, created_at DESC"
        )?;

        let items = stmt.query_map([], |row| {
            let tags_str: String = row.get(8)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            let updated_at: Option<i64> = row.get(9).ok();
            
            Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                pinned: row.get::<_, i32>(4)? == 1,
                protected: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                file_path: row.get(7)?,
                updated_at,
                tags,
                copy_count: row.get(10)?,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    /// 获取排序后的记录
    pub fn get_items_sorted(&self, sort_by: &str, sort_order: &str) -> Result<Vec<ClipboardItem>> {
        let order_clause = match (sort_by, sort_order) {
            ("time", "asc") => "ORDER BY pinned DESC, created_at ASC",
            ("time", "desc") => "ORDER BY pinned DESC, created_at DESC",
            ("type", "asc") => "ORDER BY pinned DESC, item_type ASC, created_at DESC",
            ("type", "desc") => "ORDER BY pinned DESC, item_type DESC, created_at DESC",
            ("content", "asc") => "ORDER BY pinned DESC, preview ASC, created_at DESC",
            ("content", "desc") => "ORDER BY pinned DESC, preview DESC, created_at DESC",
            ("popularity", "asc") => "ORDER BY pinned DESC, COALESCE(copy_count, 0) ASC, created_at DESC",
            ("popularity", "desc") => "ORDER BY pinned DESC, COALESCE(copy_count, 0) DESC, created_at DESC",
            _ => "ORDER BY pinned DESC, created_at DESC",
        };

        let sql = format!(
            "SELECT id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, COALESCE(copy_count, 0) 
             FROM clipboard_items 
             {}", order_clause
        );

        let mut stmt = self.conn.prepare(&sql)?;

        let items = stmt.query_map([], |row| {
            let tags_str: String = row.get(8)?;
            let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
            let updated_at: Option<i64> = row.get(9).ok();
            
            Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                pinned: row.get::<_, i32>(4)? == 1,
                protected: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                file_path: row.get(7)?,
                updated_at,
                tags,
                copy_count: row.get(10)?,
            })
        })?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    /// 增加复制次数
    pub fn increment_copy_count(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE clipboard_items SET copy_count = COALESCE(copy_count, 0) + 1 WHERE id = ?1",
            [id],
        )?;
        Ok(())
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

    pub fn toggle_protected(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE clipboard_items SET protected = NOT protected WHERE id = ?1",
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

    /// 检查哈希是否已存在（用于图片去重）
    pub fn hash_exists(&self, hash: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM clipboard_items WHERE content_hash = ?1"
        )?;
        let count: i32 = stmt.query_row([hash], |row| row.get(0))?;
        Ok(count > 0)
    }

    /// 更新已存在记录的时间戳（用于去重时提升到顶部）
    pub fn update_item_timestamp_by_hash(&self, hash: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE clipboard_items SET created_at = ?1 WHERE content_hash = ?2",
            [Utc::now().timestamp_millis().to_string(), hash.to_string()],
        )?;
        Ok(())
    }

    /// 导入单条记录（用于批量导入）
    pub fn import_item(&self, item: &ClipboardItem) -> Result<()> {
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            [
                &item.id,
                &item.item_type,
                &item.content,
                &item.preview,
                &(if item.pinned { 1 } else { 0 }).to_string(),
                &(if item.protected { 1 } else { 0 }).to_string(),
                &item.created_at.to_string(),
                &item.file_path.clone().unwrap_or_default(),
                &tags_json,
            ],
        )?;
        Ok(())
    }

    /// 自动清理过期记录
    pub fn auto_cleanup(&self, days: u32) -> Result<usize> {
        if days == 0 {
            return Ok(0);
        }
        
        let cutoff_timestamp = Utc::now().timestamp_millis() - (days as i64 * 24 * 60 * 60 * 1000);
        
        // 先获取要删除的记录（用于删除文件）
        let mut stmt = self.conn.prepare(
            "SELECT id, file_path FROM clipboard_items WHERE created_at < ?1 AND pinned = 0"
        )?;
        let items_to_delete: Vec<(String, Option<String>)> = stmt
            .query_map([cutoff_timestamp.to_string()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        
        // 删除文件
        for (_, file_path) in &items_to_delete {
            if let Some(path) = file_path {
                std::fs::remove_file(path).ok();
            }
        }
        
        // 删除数据库记录
        let deleted = self.conn.execute(
            "DELETE FROM clipboard_items WHERE created_at < ?1 AND pinned = 0",
            [cutoff_timestamp.to_string()],
        )?;
        
        Ok(deleted)
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

/// 简单的 base64 解码
pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    const DECODE_TABLE: [i8; 128] = [
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
        -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 62, -1, -1, -1, 63,
        52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1,
        -1,  0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14,
        15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, -1, -1, -1, -1, -1,
        -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
        41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, -1, -1, -1, -1, -1,
    ];
    
    let input = input.trim_end_matches('=');
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;
    
    for c in input.chars() {
        let val = if c.is_ascii() { DECODE_TABLE[c as usize] } else { -1 };
        if val < 0 {
            return Err("Invalid base64 character".to_string());
        }
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            result.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    
    Ok(result)
}
