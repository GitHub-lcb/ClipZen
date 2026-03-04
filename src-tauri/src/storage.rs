// 数据存储模块
// TODO: 实现 SQLite 存储

use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ClipboardItem {
    pub id: String,
    pub item_type: String, // text, image, file
    pub content: String,
    pub preview: String,
    pub pinned: bool,
    pub created_at: i64,
}

pub struct Storage {
    conn: Connection,
}

impl Storage {
    pub fn new() -> Result<Self> {
        let conn = Connection::open("clipzen.db")?;
        
        // 创建表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_items (
                id TEXT PRIMARY KEY,
                item_type TEXT NOT NULL,
                content TEXT NOT NULL,
                preview TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(Self { conn })
    }

    pub fn save_item(&self, item: &ClipboardItem) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO clipboard_items (id, item_type, content, preview, pinned, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            [&item.id, &item.item_type, &item.content, &item.preview, &(if item.pinned { 1 } else { 0 }), &item.created_at.to_string()],
        )?;
        Ok(())
    }

    pub fn get_all_items(&self) -> Result<Vec<ClipboardItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, item_type, content, preview, pinned, created_at 
             FROM clipboard_items 
             ORDER BY created_at DESC"
        )?;

        let items = stmt.query_map([], |row| {
            Ok(ClipboardItem {
                id: row.get(0)?,
                item_type: row.get(1)?,
                content: row.get(2)?,
                preview: row.get(3)?,
                pinned: row.get::<_, i32>(4)? == 1,
                created_at: row.get(5)?,
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
}

impl Default for Storage {
    fn default() -> Self {
        Self::new().expect("Failed to initialize storage")
    }
}
