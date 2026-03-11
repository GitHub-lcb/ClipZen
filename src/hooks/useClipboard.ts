import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useCallback } from "react";

export interface ClipboardItem {
  id: string;
  item_type: string; // "text" | "image" | "file"
  content: string;
  preview: string;
  pinned: boolean;
  protected?: boolean;
  created_at: number;
  updated_at?: number;
  file_path?: string;
  tags?: string[];
  copy_count?: number;
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
  const copyToClipboard = useCallback(async (item: ClipboardItem) => {
    try {
      if (item.item_type === "image") {
        await invoke("copy_image", { itemId: item.id });
      } else {
        await invoke("copy_to_clipboard", { content: item.content });
      }
      // 增加复制次数
      await invoke("increment_copy_count", { id: item.id });
    } catch (error) {
      console.error("Failed to copy:", error);
      throw error;
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

  // 切换密码保护状态
  const toggleProtected = useCallback(async (id: string) => {
    try {
      await invoke("toggle_protected", { id });
      setItems(prev =>
        prev.map(item =>
          item.id === id ? { ...item, protected: !item.protected } : item
        )
      );
    } catch (error) {
      console.error("Failed to toggle protected:", error);
    }
  }, []);

  // 复制脱敏内容
  const copyMasked = useCallback(async (content: string) => {
    try {
      await invoke("copy_masked_content", { content });
    } catch (error) {
      console.error("Failed to copy masked content:", error);
    }
  }, []);

  // 验证密码
  const verifyPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      const result = await invoke<boolean>("verify_password", { password });
      return result;
    } catch (error) {
      console.error("Failed to verify password:", error);
      return false;
    }
  }, []);

  // 检查是否已设置全局密码
  const hasGlobalPassword = useCallback(async (): Promise<boolean> => {
    try {
      const result = await invoke<boolean>("has_global_password");
      return result;
    } catch (error) {
      console.error("Failed to check global password:", error);
      return false;
    }
  }, []);

  // 设置全局密码
  const setGlobalPassword = useCallback(async (password: string): Promise<boolean> => {
    try {
      await invoke("set_global_password", { password });
      return true;
    } catch (error) {
      console.error("Failed to set global password:", error);
      return false;
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
    toggleProtected,
    copyMasked,
    verifyPassword,
    hasGlobalPassword,
    setGlobalPassword,
    refresh: loadItems,
  };
}
