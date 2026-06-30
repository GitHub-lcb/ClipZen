// 数据存储模块

use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use std::collections::HashSet;
use std::path::PathBuf;
use dirs::data_dir;

// 加密相关导入
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

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

fn clipboard_item_from_row(row: &Row<'_>) -> Result<ClipboardItem> {
    let tags_str: Option<String> = row.get(8)?;
    let tags = parse_tags(tags_str.as_deref());
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
}

fn parse_tags(tags: Option<&str>) -> Vec<String> {
    tags.and_then(|value| serde_json::from_str(value).ok())
        .map(|tags: Vec<String>| {
            let mut seen = HashSet::new();
            tags.into_iter()
                .filter_map(|tag| {
                    let trimmed = tag.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        let tag = trimmed.to_string();
                        if seen.insert(tag.clone()) {
                            Some(tag)
                        } else {
                            None
                        }
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn file_list_content_hash(file_paths: &[String]) -> String {
    let digest = Sha256::digest(normalized_file_paths(file_paths).join("\n").as_bytes());
    format!("files:{:x}", digest)
}

fn normalized_file_paths(file_paths: &[String]) -> Vec<String> {
    let mut sorted_paths = file_paths.to_vec();
    sorted_paths.sort();
    sorted_paths
}

impl Storage {
    pub fn new() -> Result<Self> {
        // 将数据库存储在用户应用数据目录，避免触发 Tauri 文件监控
        let db_path = get_database_path();
        let conn = Connection::open(db_path)?;

        Self::from_connection(conn)
    }

    pub(crate) fn from_connection(conn: Connection) -> Result<Self> {
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
        self.save_clipboard_item_with_hash(content, None)
    }

    pub fn save_clipboard_item_with_hash(
        &self,
        content: &str,
        content_hash: Option<&str>,
    ) -> Result<String> {
        if content.trim().is_empty() {
            return Err(rusqlite::Error::InvalidQuery);
        }

        if let Some(hash) = content_hash {
            if let Some(existing_id) = self.get_item_id_by_hash(hash)? {
                self.update_item_timestamp_by_hash(hash)?;
                return Ok(existing_id);
            }
        } else if let Some(existing_id) = self.get_text_item_id_by_content(content)? {
            self.update_item_timestamp_by_id(&existing_id)?;
            return Ok(existing_id);
        }

        let id = Uuid::new_v4().to_string();
        let preview: String = content.chars().take(100).collect();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id,
                "text",
                content,
                &preview,
                0,
                0,
                Utc::now().timestamp_millis(),
                "",
                "[]",
                content_hash,
            ],
        )?;
        Ok(id)
    }

    pub fn save_clipboard_item_with_hash_and_limit(
        &self,
        content: &str,
        content_hash: Option<&str>,
        max_items: u32,
    ) -> Result<String> {
        let id = self.save_clipboard_item_with_hash(content, content_hash)?;
        self.cleanup_old_items(max_items)?;
        Ok(id)
    }

    /// 清理超出限制的旧记录（保留置顶）
    pub fn cleanup_old_items(&self, max_items: u32) -> Result<usize> {
        // 获取非置顶记录数量
        let count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE pinned = 0",
            [],
            |row| row.get(0)
        )?;
        
        if count <= max_items {
            return Ok(0);
        }
        
        // 删除最旧的非置顶记录
        let delete_count = i64::from(count - max_items);
        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, file_path
             FROM clipboard_items
             WHERE pinned = 0
             ORDER BY created_at ASC
             LIMIT ?1",
        )?;
        let items_to_delete: Vec<(String, String, Option<String>)> = stmt
            .query_map([delete_count], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        for (_, item_type, file_path) in &items_to_delete {
            if item_type == "image" {
                if let Some(path) = file_path {
                    std::fs::remove_file(path).ok();
                }
            }
        }

        let ids = items_to_delete
            .iter()
            .map(|(id, _, _)| id.as_str())
            .collect::<Vec<_>>();

        self.conn.execute(
            &format!(
                "DELETE FROM clipboard_items WHERE id IN ({})",
                vec!["?"; ids.len()].join(", ")
            ),
            rusqlite::params_from_iter(ids),
        )
    }

    /// 保存图片剪贴板
    pub fn save_image_item(&self, _image_data: &[u8], preview_base64: &str, file_path: &str, content_hash: &str) -> Result<String> {
        if let Some(existing_id) = self.get_item_id_by_hash(content_hash)? {
            self.update_item_timestamp_by_hash(content_hash)?;
            let existing_path = self
                .get_item_by_id(&existing_id)?
                .and_then(|item| item.file_path);
            if existing_path.as_deref() != Some(file_path) {
                std::fs::remove_file(file_path).ok();
            }
            return Ok(existing_id);
        }

        let id = Uuid::new_v4().to_string();
        
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            [
                &id,
                "image",
                "", // 不再存储 base64 编码，只存储文件路径
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

    pub fn save_image_item_with_limit(
        &self,
        image_data: &[u8],
        preview_base64: &str,
        file_path: &str,
        content_hash: &str,
        max_items: u32,
    ) -> Result<String> {
        let id = self.save_image_item(image_data, preview_base64, file_path, content_hash)?;
        self.cleanup_old_items(max_items)?;
        Ok(id)
    }

    /// 保存文件路径列表
    pub fn save_files_item(&self, file_paths: &[String]) -> Result<String> {
        if file_paths.is_empty() {
            return Err(rusqlite::Error::InvalidQuery);
        }

        let content = file_paths.join("\n");
        let content_hash = file_list_content_hash(file_paths);
        if let Some(existing_id) = self.get_item_id_by_hash(&content_hash)? {
            self.update_item_timestamp_by_hash(&content_hash)?;
            return Ok(existing_id);
        }

        if let Some(existing_id) = self.get_file_item_id_by_content(&content)? {
            self.update_item_timestamp_by_id(&existing_id)?;
            return Ok(existing_id);
        }

        if let Some(existing_id) = self.get_file_item_id_by_file_set(file_paths)? {
            self.update_item_timestamp_by_id(&existing_id)?;
            return Ok(existing_id);
        }

        let id = Uuid::new_v4().to_string();
        
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
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, content_hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &id,
                "files",
                &content,
                &preview,
                0,
                0,
                Utc::now().timestamp_millis(),
                file_paths.first().map(String::as_str).unwrap_or_default(),
                "[]",
                &content_hash,
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

        let items = stmt.query_map([], clipboard_item_from_row)?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    pub fn get_item_by_id(&self, id: &str) -> Result<Option<ClipboardItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, COALESCE(copy_count, 0)
             FROM clipboard_items
             WHERE id = ?1"
        )?;

        stmt.query_row([id], clipboard_item_from_row).optional()
    }

    pub fn get_all_tags(&self) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT tags FROM clipboard_items WHERE tags IS NOT NULL AND tags != '' AND tags != '[]'"
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, Option<String>>(0))?;
        let mut tags_set = HashSet::new();

        for row in rows {
            for tag in parse_tags(row?.as_deref()) {
                tags_set.insert(tag);
            }
        }

        let mut tags: Vec<String> = tags_set.into_iter().collect();
        tags.sort();
        Ok(tags)
    }

    pub fn get_items_paginated(&self, page: u32, page_size: u32) -> Result<(Vec<ClipboardItem>, u32)> {
        let total_count: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM clipboard_items",
            [],
            |row| row.get(0),
        )?;

        let safe_page = page.max(1);
        let safe_page_size = page_size.clamp(1, 200);
        let offset = u64::from(safe_page - 1) * u64::from(safe_page_size);

        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, COALESCE(copy_count, 0)
             FROM clipboard_items
             ORDER BY pinned DESC, created_at DESC
             LIMIT ?1 OFFSET ?2"
        )?;

        let items = stmt.query_map([i64::from(safe_page_size), offset as i64], clipboard_item_from_row)?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }

        Ok((result, total_count))
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
            ("popularity", "asc") => "ORDER BY pinned DESC, COALESCE(updated_at, created_at) ASC, COALESCE(copy_count, 0) ASC, created_at DESC",
            ("popularity", "desc") => "ORDER BY pinned DESC, COALESCE(updated_at, created_at) DESC, COALESCE(copy_count, 0) DESC, created_at DESC",
            _ => "ORDER BY pinned DESC, created_at DESC",
        };

        let sql = format!(
            "SELECT id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, COALESCE(copy_count, 0) 
             FROM clipboard_items 
             {}", order_clause
        );

        let mut stmt = self.conn.prepare(&sql)?;

        let items = stmt.query_map([], clipboard_item_from_row)?;

        let mut result = Vec::new();
        for item in items {
            result.push(item?);
        }
        Ok(result)
    }

    /// 增加复制次数
    pub fn increment_copy_count(&self, id: &str) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE clipboard_items
             SET copy_count = COALESCE(copy_count, 0) + 1, updated_at = ?1
             WHERE id = ?2",
            params![Utc::now().timestamp_millis(), id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn delete_item(&self, id: &str) -> Result<()> {
        let file_to_delete = self
            .conn
            .query_row(
                "SELECT file_path FROM clipboard_items WHERE id = ?1 AND item_type = 'image'",
                [id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();

        self.conn.execute(
            "DELETE FROM clipboard_items WHERE id = ?1",
            [id],
        )?;

        if let Some(path) = file_to_delete {
            std::fs::remove_file(path).ok();
        }

        Ok(())
    }

    pub fn toggle_pin(&self, id: &str) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE clipboard_items SET pinned = NOT pinned, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().timestamp_millis(), id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn toggle_protected(&self, id: &str) -> Result<()> {
        let updated = self.conn.execute(
            "UPDATE clipboard_items SET protected = NOT protected, updated_at = ?1 WHERE id = ?2",
            params![Utc::now().timestamp_millis(), id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    pub fn add_tag_to_item(&self, id: &str, tag: &str) -> Result<()> {
        let tag = tag.trim();
        if tag.is_empty() {
            return Ok(());
        }

        let Some(mut item) = self.get_item_by_id(id)? else {
            return Ok(());
        };

        if !item.tags.iter().any(|existing| existing == tag) {
            item.tags.push(tag.to_string());
            let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
            self.conn.execute(
                "UPDATE clipboard_items SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                params![tags_json, Utc::now().timestamp_millis(), id],
            )?;
        }

        Ok(())
    }

    pub fn remove_tag_from_item(&self, id: &str, tag: &str) -> Result<()> {
        let tag = tag.trim();
        if tag.is_empty() {
            return Ok(());
        }

        let Some(mut item) = self.get_item_by_id(id)? else {
            return Ok(());
        };

        let original_len = item.tags.len();
        item.tags.retain(|existing| existing != tag);
        if item.tags.len() != original_len {
            let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
            self.conn.execute(
                "UPDATE clipboard_items SET tags = ?1, updated_at = ?2 WHERE id = ?3",
                params![tags_json, Utc::now().timestamp_millis(), id],
            )?;
        }

        Ok(())
    }

    pub fn update_item_content(&self, id: &str, content: &str) -> Result<()> {
        if content.trim().is_empty() {
            return Err(rusqlite::Error::InvalidQuery);
        }

        let preview: String = content.chars().take(100).collect();
        let updated = self.conn.execute(
            "UPDATE clipboard_items
             SET content = ?1, preview = ?2, updated_at = ?3, content_hash = NULL
             WHERE id = ?4",
            params![content, preview, Utc::now().timestamp_millis(), id],
        )?;
        if updated == 0 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        Ok(())
    }

    /// 查找未加密的相同文本记录（用于普通文本去重）
    fn get_text_item_id_by_content(&self, content: &str) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT id FROM clipboard_items
                 WHERE item_type = 'text'
                   AND content = ?1
                   AND content_hash IS NULL
                 LIMIT 1",
                [content],
                |row| row.get(0),
            )
            .optional()
    }

    /// 查找相同文件列表记录（用于文件路径列表去重）
    fn get_file_item_id_by_content(&self, content: &str) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT id FROM clipboard_items
                 WHERE item_type = 'files'
                   AND content = ?1
                 LIMIT 1",
                [content],
                |row| row.get(0),
            )
            .optional()
    }

    fn get_file_item_id_by_file_set(&self, file_paths: &[String]) -> Result<Option<String>> {
        let target_paths = normalized_file_paths(file_paths);
        let mut stmt = self.conn.prepare(
            "SELECT id, content FROM clipboard_items
             WHERE item_type = 'files'
               AND (content_hash IS NULL OR content_hash = '')",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (id, content) = row?;
            let existing_paths = content.lines().map(str::to_string).collect::<Vec<_>>();
            if normalized_file_paths(&existing_paths) == target_paths {
                return Ok(Some(id));
            }
        }

        Ok(None)
    }

    /// 检查哈希是否已存在（用于图片去重）
    pub fn hash_exists(&self, hash: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM clipboard_items WHERE content_hash = ?1"
        )?;
        let count: i32 = stmt.query_row([hash], |row| row.get(0))?;
        Ok(count > 0)
    }

    fn get_item_id_by_hash(&self, hash: &str) -> Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT id FROM clipboard_items WHERE content_hash = ?1 LIMIT 1",
                [hash],
                |row| row.get(0),
            )
            .optional()
    }

    /// 更新已存在记录的时间戳（用于去重时提升到顶部）
    fn update_item_timestamp_by_id(&self, id: &str) -> Result<()> {
        let timestamp = Utc::now().timestamp_millis();
        self.conn.execute(
            "UPDATE clipboard_items SET created_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![timestamp, id],
        )?;
        Ok(())
    }

    pub fn update_item_timestamp_by_hash(&self, hash: &str) -> Result<()> {
        let timestamp = Utc::now().timestamp_millis();
        self.conn.execute(
            "UPDATE clipboard_items SET created_at = ?1, updated_at = ?1 WHERE content_hash = ?2",
            params![timestamp, hash],
        )?;
        Ok(())
    }

    /// 导入单条记录（用于批量导入）
    pub fn import_item(&self, item: &ClipboardItem) -> Result<()> {
        let tags_json = serde_json::to_string(&item.tags).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, copy_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &item.id,
                &item.item_type,
                &item.content,
                &item.preview,
                if item.pinned { 1 } else { 0 },
                if item.protected { 1 } else { 0 },
                item.created_at,
                item.file_path.as_deref().unwrap_or_default(),
                &tags_json,
                item.updated_at,
                item.copy_count,
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
            "SELECT id, item_type, file_path
             FROM clipboard_items
             WHERE created_at < ?1 AND pinned = 0"
        )?;
        let items_to_delete: Vec<(String, String, Option<String>)> = stmt
            .query_map([cutoff_timestamp.to_string()], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        
        // 删除文件
        for (_, item_type, file_path) in &items_to_delete {
            if item_type == "image" {
                if let Some(path) = file_path {
                    std::fs::remove_file(path).ok();
                }
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

/// 检测敏感信息
pub fn contains_sensitive_info(content: &str) -> bool {
    contains_phone_number(content)
        || contains_email(content)
        || contains_id_card(content)
        || contains_bank_card(content)
}

pub fn protect_sensitive_content(content: &str, encryption_key: Option<&str>) -> String {
    if !contains_sensitive_info(content) {
        return content.to_string();
    }

    let Some(encryption_key_str) = encryption_key else {
        return content.to_string();
    };
    let Ok(encryption_key) = STANDARD.decode(encryption_key_str) else {
        return content.to_string();
    };
    let Ok(encrypted) = encrypt_data(content, &encryption_key) else {
        return content.to_string();
    };

    format!("ENCRYPTED:{}", encrypted)
}

pub fn sensitive_content_hash(content: &str, encryption_key: Option<&str>) -> Option<String> {
    if !contains_sensitive_info(content) {
        return None;
    }

    let encryption_key_str = encryption_key?;
    let encryption_key = STANDARD.decode(encryption_key_str).ok()?;
    let mut mac = <HmacSha256 as Mac>::new_from_slice(&encryption_key).ok()?;
    mac.update(content.as_bytes());
    let result = mac.finalize().into_bytes();

    Some(format!("sensitive:{:x}", result))
}

fn contains_phone_number(content: &str) -> bool {
    content.as_bytes().windows(11).any(|window| {
        window[0] == b'1'
            && (b'3'..=b'9').contains(&window[1])
            && window.iter().all(u8::is_ascii_digit)
    })
}

fn contains_email(content: &str) -> bool {
    content.split_whitespace().any(|part| {
        let Some((local, domain)) = part.split_once('@') else {
            return false;
        };
        !local.is_empty()
            && domain.contains('.')
            && domain.split('.').all(|segment| !segment.is_empty())
    })
}

fn contains_id_card(content: &str) -> bool {
    content.as_bytes().windows(18).any(|window| {
        window[..17].iter().all(u8::is_ascii_digit)
            && (window[17].is_ascii_digit() || matches!(window[17], b'X' | b'x'))
    })
}

fn contains_bank_card(content: &str) -> bool {
    let mut run_len = 0;
    for byte in content.bytes() {
        if byte.is_ascii_digit() {
            run_len += 1;
            if (16..=19).contains(&run_len) {
                return true;
            }
        } else {
            run_len = 0;
        }
    }
    false
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

/// 生成加密密钥
pub fn generate_encryption_key() -> Vec<u8> {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let mut key = vec![0u8; 32]; // 256 bits for AES-256
    rng.fill(&mut key[..]);
    key
}

/// 加密数据
pub fn encrypt_data(data: &str, key: &[u8]) -> Result<String, String> {
    use rand::RngCore;

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher.encrypt(nonce, data.as_bytes())
        .map_err(|e| format!("Failed to encrypt: {}", e))?;
    
    let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(payload))
}

/// 解密数据
pub fn decrypt_data(encrypted: &str, key: &[u8]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Failed to create cipher: {}", e))?;

    let payload = STANDARD.decode(encrypted)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    if payload.len() > 12 {
        let (nonce_bytes, ciphertext) = payload.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        if let Ok(plaintext) = cipher.decrypt(nonce, ciphertext) {
            return String::from_utf8(plaintext)
                .map_err(|e| format!("Failed to convert to string: {}", e));
        }
    }

    let legacy_nonce_bytes = [0u8; 12];
    let legacy_nonce = Nonce::from_slice(&legacy_nonce_bytes);
    let plaintext = cipher.decrypt(legacy_nonce, &payload[..])
        .map_err(|e| format!("Failed to decrypt: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| format!("Failed to convert to string: {}", e))
}

#[cfg(test)]
mod tests {
    use super::{
        contains_sensitive_info, decrypt_data, encrypt_data, generate_encryption_key,
        protect_sensitive_content, sensitive_content_hash, Storage,
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use rusqlite::{params, Connection};

    fn memory_storage() -> Storage {
        Storage::from_connection(Connection::open_in_memory().unwrap()).unwrap()
    }

    #[test]
    fn detects_sensitive_phone_email_id_card_and_bank_card() {
        assert!(contains_sensitive_info("联系 13800138000"));
        assert!(contains_sensitive_info("user@example.com"));
        assert!(contains_sensitive_info("11010519491231002X"));
        assert!(contains_sensitive_info("6222021234567890123"));
    }

    #[test]
    fn ignores_regular_clipboard_text() {
        assert!(!contains_sensitive_info("普通剪贴板内容，没有敏感信息"));
    }

    #[test]
    fn encrypt_data_uses_unique_payloads_and_round_trips() {
        let key = generate_encryption_key();
        let first = encrypt_data("secret", &key).unwrap();
        let second = encrypt_data("secret", &key).unwrap();

        assert_ne!(first, second);
        assert_eq!(decrypt_data(&first, &key).unwrap(), "secret");
        assert_eq!(decrypt_data(&second, &key).unwrap(), "secret");
    }

    #[test]
    fn protect_sensitive_content_encrypts_with_configured_key() {
        let key = generate_encryption_key();
        let encoded_key = STANDARD.encode(&key);

        let protected = protect_sensitive_content("contact user@example.com", Some(&encoded_key));

        assert!(protected.starts_with("ENCRYPTED:"));
        let encrypted = protected.trim_start_matches("ENCRYPTED:");
        assert_eq!(decrypt_data(encrypted, &key).unwrap(), "contact user@example.com");
    }

    #[test]
    fn sensitive_content_hash_dedupes_randomized_encryption() {
        let storage = memory_storage();
        let key = generate_encryption_key();
        let encoded_key = STANDARD.encode(&key);
        let content = "contact user@example.com";

        let first = protect_sensitive_content(content, Some(&encoded_key));
        let second = protect_sensitive_content(content, Some(&encoded_key));
        let hash = sensitive_content_hash(content, Some(&encoded_key)).unwrap();

        assert_ne!(first, second);
        storage
            .save_clipboard_item_with_hash(&first, Some(&hash))
            .unwrap();
        assert!(storage.hash_exists(&hash).unwrap());
    }

    #[test]
    fn saving_existing_content_hash_refreshes_instead_of_duplicating() {
        let storage = memory_storage();
        let first_id = storage
            .save_clipboard_item_with_hash("encrypted payload one", Some("same-hash"))
            .unwrap();

        let second_id = storage
            .save_clipboard_item_with_hash("encrypted payload two", Some("same-hash"))
            .unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(second_id, first_id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, "encrypted payload one");
    }

    #[test]
    fn saving_existing_plain_text_refreshes_instead_of_duplicating() {
        let storage = memory_storage();
        let first_id = storage.save_clipboard_item("same text").unwrap();

        let second_id = storage.save_clipboard_item("same text").unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(second_id, first_id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, "same text");
    }

    #[test]
    fn saving_blank_plain_text_is_rejected() {
        let storage = memory_storage();

        assert!(storage.save_clipboard_item("   \n\t").is_err());
        assert!(storage.get_all_items().unwrap().is_empty());
    }

    #[test]
    fn refreshing_existing_plain_text_keeps_updated_at_current() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at)
             VALUES ('existing', 'text', 'same text', 'same text', 0, 0, 1000, '', '[]', 1000)",
            [],
        ).unwrap();

        let id = storage.save_clipboard_item("same text").unwrap();
        let item = storage.get_item_by_id(&id).unwrap().unwrap();

        assert_eq!(id, "existing");
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn saving_existing_file_list_refreshes_instead_of_duplicating() {
        let storage = memory_storage();
        let files = vec![
            "C:\\Users\\clip\\one.txt".to_string(),
            "C:\\Users\\clip\\two.txt".to_string(),
        ];
        let first_id = storage.save_files_item(&files).unwrap();

        let second_id = storage.save_files_item(&files).unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(second_id, first_id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].item_type, "files");
        assert_eq!(items[0].content, files.join("\n"));
    }

    #[test]
    fn saving_empty_file_list_is_rejected() {
        let storage = memory_storage();

        assert!(storage.save_files_item(&[]).is_err());
        assert!(storage.get_all_items().unwrap().is_empty());
    }

    #[test]
    fn saving_same_file_set_in_different_order_refreshes_existing_item() {
        let storage = memory_storage();
        let files = vec![
            "C:\\Users\\clip\\one.txt".to_string(),
            "C:\\Users\\clip\\two.txt".to_string(),
        ];
        let reversed_files = vec![
            "C:\\Users\\clip\\two.txt".to_string(),
            "C:\\Users\\clip\\one.txt".to_string(),
        ];

        let first_id = storage.save_files_item(&files).unwrap();

        let second_id = storage.save_files_item(&reversed_files).unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(second_id, first_id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, files.join("\n"));
    }

    #[test]
    fn saving_same_file_set_in_different_order_refreshes_legacy_item_without_hash() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('legacy-files', 'files', ?1, 'one.txt, two.txt', 0, 0, 1000, ?2, '[]')",
            params![
                "C:\\Users\\clip\\one.txt\nC:\\Users\\clip\\two.txt",
                "C:\\Users\\clip\\one.txt",
            ],
        ).unwrap();
        let reversed_files = vec![
            "C:\\Users\\clip\\two.txt".to_string(),
            "C:\\Users\\clip\\one.txt".to_string(),
        ];

        let saved_id = storage.save_files_item(&reversed_files).unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(saved_id, "legacy-files");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].content, "C:\\Users\\clip\\one.txt\nC:\\Users\\clip\\two.txt");
    }

    #[test]
    fn saving_text_with_limit_prunes_old_unpinned_items() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('old', 'text', 'old', 'old', 0, 0, 1, '', '[]')",
            [],
        ).unwrap();

        let new_id = storage
            .save_clipboard_item_with_hash_and_limit("new", None, 1)
            .unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, new_id);
        assert_eq!(items[0].content, "new");
    }

    #[test]
    fn updates_single_item_tags_and_content_by_id() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("original").unwrap();

        storage.add_tag_to_item(&id, "work").unwrap();
        storage.add_tag_to_item(&id, "work").unwrap();
        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert_eq!(item.tags, vec!["work"]);

        storage.update_item_content(&id, "updated content").unwrap();
        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert_eq!(item.content, "updated content");
        assert_eq!(item.preview, "updated content");
        assert!(item.updated_at.is_some());

        storage.remove_tag_from_item(&id, "work").unwrap();
        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert!(item.tags.is_empty());
    }

    #[test]
    fn adding_tag_refreshes_updated_at() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("tag me").unwrap();

        storage.add_tag_to_item(&id, "work").unwrap();

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert_eq!(item.tags, vec!["work"]);
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn removing_tag_refreshes_updated_at() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('tagged', 'text', 'tagged content', 'tagged content', 0, 0, 1000, '', '[\"work\"]')",
            [],
        ).unwrap();

        storage.remove_tag_from_item("tagged", "work").unwrap();

        let item = storage.get_item_by_id("tagged").unwrap().unwrap();
        assert!(item.tags.is_empty());
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn removing_tag_trims_input() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("tag me").unwrap();
        storage.add_tag_to_item(&id, "work").unwrap();

        storage.remove_tag_from_item(&id, " work ").unwrap();

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert!(item.tags.is_empty());
    }

    #[test]
    fn updating_item_content_clears_stale_content_hash() {
        let storage = memory_storage();
        let id = storage
            .save_clipboard_item_with_hash("encrypted original", Some("old-hash"))
            .unwrap();

        storage.update_item_content(&id, "edited content").unwrap();

        assert!(!storage.hash_exists("old-hash").unwrap());
    }

    #[test]
    fn updating_item_content_rejects_blank_text() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("original").unwrap();

        assert!(storage.update_item_content(&id, "  \n\t").is_err());

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert_eq!(item.content, "original");
        assert_eq!(item.preview, "original");
    }

    #[test]
    fn updating_missing_item_content_returns_error() {
        let storage = memory_storage();

        assert!(storage
            .update_item_content("missing-item", "edited content")
            .is_err());
    }

    #[test]
    fn increment_copy_count_updates_last_copy_time() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("copy me").unwrap();

        storage.increment_copy_count(&id).unwrap();

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert_eq!(item.copy_count, 1);
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn incrementing_missing_item_copy_count_returns_error() {
        let storage = memory_storage();

        assert!(storage.increment_copy_count("missing-item").is_err());
    }

    #[test]
    fn toggling_pin_refreshes_updated_at() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("pin me").unwrap();

        storage.toggle_pin(&id).unwrap();

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert!(item.pinned);
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn toggling_missing_item_pin_returns_error() {
        let storage = memory_storage();

        assert!(storage.toggle_pin("missing-item").is_err());
    }

    #[test]
    fn toggling_protected_refreshes_updated_at() {
        let storage = memory_storage();
        let id = storage.save_clipboard_item("protect me").unwrap();

        storage.toggle_protected(&id).unwrap();

        let item = storage.get_item_by_id(&id).unwrap().unwrap();
        assert!(item.protected);
        assert!(item.updated_at.is_some());
        assert!(item.updated_at.unwrap() >= item.created_at);
    }

    #[test]
    fn toggling_missing_item_protected_returns_error() {
        let storage = memory_storage();

        assert!(storage.toggle_protected("missing-item").is_err());
    }

    #[test]
    fn popularity_sort_matches_recent_copy_order_before_copy_count() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags, updated_at, copy_count)
             VALUES
             ('high-count', 'text', 'high count', 'high count', 0, 0, 1000, '', '[]', 2000, 10),
             ('recent-copy', 'text', 'recent copy', 'recent copy', 0, 0, 900, '', '[]', 3000, 1)",
            [],
        ).unwrap();

        let items = storage.get_items_sorted("popularity", "desc").unwrap();

        assert_eq!(items[0].id, "recent-copy");
        assert_eq!(items[1].id, "high-count");
    }

    #[test]
    fn deleting_image_item_removes_cached_file() {
        let storage = memory_storage();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-delete-image-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("cached-image.png");
        std::fs::write(&image_path, b"image").unwrap();

        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('image', 'image', '', 'image', 0, 0, 1, ?1, '[]')",
            [image_path.to_string_lossy().as_ref()],
        ).unwrap();

        storage.delete_item("image").unwrap();

        assert!(!image_path.exists());
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn auto_cleanup_removes_cached_images_but_preserves_user_files() {
        let storage = memory_storage();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-cleanup-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("cached-image.png");
        let user_file_path = temp_dir.join("user-file.txt");
        std::fs::write(&image_path, b"image").unwrap();
        std::fs::write(&user_file_path, b"user").unwrap();

        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES
             ('image', 'image', '', 'image', 0, 0, 1, ?1, '[]'),
             ('files', 'files', ?2, 'files', 0, 0, 1, ?2, '[]')",
            params![
                image_path.to_string_lossy().as_ref(),
                user_file_path.to_string_lossy().as_ref(),
            ],
        ).unwrap();

        assert_eq!(storage.auto_cleanup(1).unwrap(), 2);

        assert!(!image_path.exists());
        assert!(user_file_path.exists());
        std::fs::remove_file(&user_file_path).ok();
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn limit_cleanup_removes_cached_images_but_preserves_user_files() {
        let storage = memory_storage();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-limit-cleanup-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("cached-image.png");
        let user_file_path = temp_dir.join("user-file.txt");
        std::fs::write(&image_path, b"image").unwrap();
        std::fs::write(&user_file_path, b"user").unwrap();

        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES
             ('image', 'image', '', 'image', 0, 0, 1, ?1, '[]'),
             ('files', 'files', ?2, 'files', 0, 0, 2, ?2, '[]'),
             ('newest', 'text', 'newest', 'newest', 0, 0, 3, '', '[]')",
            params![
                image_path.to_string_lossy().as_ref(),
                user_file_path.to_string_lossy().as_ref(),
            ],
        ).unwrap();

        assert_eq!(storage.cleanup_old_items(1).unwrap(), 2);

        assert!(!image_path.exists());
        assert!(user_file_path.exists());
        std::fs::remove_file(&user_file_path).ok();
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn limit_cleanup_keeps_items_when_limit_is_larger_than_current_count() {
        let storage = memory_storage();
        storage.save_clipboard_item("first").unwrap();
        storage.save_clipboard_item("second").unwrap();

        assert_eq!(storage.cleanup_old_items(u32::MAX).unwrap(), 0);
        assert_eq!(storage.get_all_items().unwrap().len(), 2);
    }

    #[test]
    fn saving_existing_image_hash_refreshes_and_removes_duplicate_file() {
        let storage = memory_storage();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-image-dedupe-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let first_path = temp_dir.join("first.png");
        let duplicate_path = temp_dir.join("duplicate.png");
        std::fs::write(&first_path, b"first").unwrap();
        std::fs::write(&duplicate_path, b"duplicate").unwrap();

        let first_id = storage
            .save_image_item(&[1], "preview one", first_path.to_str().unwrap(), "image-hash")
            .unwrap();
        let second_id = storage
            .save_image_item(&[2], "preview two", duplicate_path.to_str().unwrap(), "image-hash")
            .unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(second_id, first_id);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].file_path.as_deref(), first_path.to_str());
        assert!(first_path.exists());
        assert!(!duplicate_path.exists());
        std::fs::remove_file(&first_path).ok();
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn saving_existing_image_hash_keeps_file_when_path_matches_existing_item() {
        let storage = memory_storage();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-image-dedupe-same-path-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("image.png");
        std::fs::write(&image_path, b"image").unwrap();

        let first_id = storage
            .save_image_item(&[1], "preview one", image_path.to_str().unwrap(), "image-hash")
            .unwrap();
        let second_id = storage
            .save_image_item(&[1], "preview two", image_path.to_str().unwrap(), "image-hash")
            .unwrap();

        assert_eq!(second_id, first_id);
        assert!(image_path.exists());
        std::fs::remove_file(&image_path).ok();
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn saving_image_with_limit_prunes_old_unpinned_items() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items
             (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('old', 'text', 'old', 'old', 0, 0, 1, '', '[]')",
            [],
        ).unwrap();
        let temp_dir = std::env::temp_dir().join(format!(
            "clipzen-image-limit-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let image_path = temp_dir.join("image.png");
        std::fs::write(&image_path, b"image").unwrap();

        let new_id = storage
            .save_image_item_with_limit(
                &[1],
                "preview",
                image_path.to_str().unwrap(),
                "image-hash",
                1,
            )
            .unwrap();
        let items = storage.get_all_items().unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, new_id);
        assert_eq!(items[0].item_type, "image");
        assert!(image_path.exists());
        std::fs::remove_file(&image_path).ok();
        std::fs::remove_dir(&temp_dir).ok();
    }

    #[test]
    fn tagging_image_items_preserves_content_hash() {
        let storage = memory_storage();
        let id = storage
            .save_image_item(&[1, 2, 3], "preview", "image.png", "image-hash")
            .unwrap();

        storage.add_tag_to_item(&id, "image").unwrap();
        assert!(storage.hash_exists("image-hash").unwrap());

        storage.remove_tag_from_item(&id, "image").unwrap();
        assert!(storage.hash_exists("image-hash").unwrap());
    }

    #[test]
    fn legacy_null_tags_read_as_empty_tags() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('legacy', 'text', 'content', 'content', 0, 0, 1, '', NULL)",
            [],
        ).unwrap();

        let item = storage.get_item_by_id("legacy").unwrap().unwrap();
        assert!(item.tags.is_empty());
    }

    #[test]
    fn legacy_blank_tags_are_trimmed_and_ignored_when_read() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('legacy', 'text', 'content', 'content', 0, 0, 1, '', '[\"\", \"  \", \" work \"]')",
            [],
        ).unwrap();

        let item = storage.get_item_by_id("legacy").unwrap().unwrap();

        assert_eq!(item.tags, vec!["work"]);
    }

    #[test]
    fn legacy_duplicate_tags_are_deduped_when_read() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES ('legacy', 'text', 'content', 'content', 0, 0, 1, '', '[\"work\", \" work \", \"clip\", \"work\"]')",
            [],
        ).unwrap();

        let item = storage.get_item_by_id("legacy").unwrap().unwrap();

        assert_eq!(item.tags, vec!["work", "clip"]);
    }

    #[test]
    fn gets_all_tags_without_loading_full_items() {
        let storage = memory_storage();
        storage.conn.execute(
            "INSERT INTO clipboard_items (id, item_type, content, preview, pinned, protected, created_at, file_path, tags)
             VALUES
             ('a', 'text', 'a', 'a', 0, 0, 1, '', '[\"work\",\"clip\"]'),
             ('b', 'text', 'b', 'b', 0, 0, 2, '', '[\"clip\",\"later\"]'),
             ('c', 'text', 'c', 'c', 0, 0, 3, '', NULL),
             ('d', 'text', 'd', 'd', 0, 0, 4, '', 'not json')",
            [],
        ).unwrap();

        assert_eq!(storage.get_all_tags().unwrap(), vec!["clip", "later", "work"]);
    }

    #[test]
    fn pagination_handles_extremely_large_page_numbers_without_overflow() {
        let storage = memory_storage();
        storage.save_clipboard_item("content").unwrap();

        let (items, total_count) = storage.get_items_paginated(u32::MAX, 200).unwrap();

        assert!(items.is_empty());
        assert_eq!(total_count, 1);
    }

    #[test]
    fn import_item_preserves_exported_metadata() {
        let storage = memory_storage();
        let item = super::ClipboardItem {
            id: "imported".to_string(),
            item_type: "text".to_string(),
            content: "content".to_string(),
            preview: "content".to_string(),
            pinned: true,
            protected: true,
            created_at: 100,
            updated_at: Some(200),
            file_path: None,
            tags: vec!["work".to_string()],
            copy_count: 7,
        };

        storage.import_item(&item).unwrap();

        let imported = storage.get_item_by_id("imported").unwrap().unwrap();
        assert_eq!(imported.updated_at, Some(200));
        assert_eq!(imported.copy_count, 7);
    }
}
