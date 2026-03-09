import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useCallback } from "react";

export interface ClipboardItem {
  id: string;
  item_type: string; // "text" | "image" | "file"
  content: string;
  preview: string;
  pinned: boolean;
  created_at: number;
  updated_at?: number;
  file_path?: string;
  tags?: string[];
}

export function useClipboard() {
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载历史记录
  const loadItems = useCallback(async () => {
    try {
      const result = await invoke<ClipboardItem[]>("get_clipboard_history");
      setItems(result);
    } catch (error) {
      console.error("Failed to load clipboard history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 复制到剪贴板
  const copyToClipboard = useCallback(async (content: string, type: string = "text", filePath?: string) => {
    try {
      if (type === "image" && filePath) {
        await invoke("copy_image_to_clipboard", { filePath });
      } else {
        await invoke("copy_to_clipboard", { content });
      }
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, []);

  // 删除记录
  const deleteItem = useCallback(async (id: string) => {
    try {
      await invoke("delete_history_item", { id });
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  }, []);

  // 置顶/取消置顶
  const togglePin = useCallback(async (id: string) => {
    try {
      await invoke("toggle_pin_item", { id });
      setItems(prev =>
        prev.map(item =>
          item.id === id ? { ...item, pinned: !item.pinned } : item
        )
      );
    } catch (error) {
      console.error("Failed to toggle pin:", error);
    }
  }, []);

  // 监听剪贴板更新
  useEffect(() => {
    loadItems();

    const unlisten = listen("clipboard-updated", () => {
      loadItems();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadItems]);

  return {
    items,
    loading,
    copyToClipboard,
    deleteItem,
    togglePin,
    refresh: loadItems,
  };
}
