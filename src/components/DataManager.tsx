import { useState } from "react";
import { Database, Download, Upload, Trash2, X, AlertTriangle } from "lucide-react";

interface DataManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function DataManager({ isOpen, onClose, onRefresh }: DataManagerProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [keepPinned, setKeepPinned] = useState(true);

  const exportData = async () => {
    setExporting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { save } = await import("@tauri-apps/plugin-dialog");
      
      const filePath = await save({
        title: "导出剪贴板历史",
        defaultPath: "clipzen-export.json",
        filters: [{
          name: "JSON",
          extensions: ["json"]
        }]
      });
      
      if (filePath) {
        const count = await invoke<number>("export_history", { filePath });
        setMessage({ type: 'success', text: `已导出 ${count} 条记录` });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to export:", error);
      setMessage({ type: 'error', text: '导出失败' });
    } finally {
      setExporting(false);
    }
  };

  const importData = async () => {
    setImporting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { open } = await import("@tauri-apps/plugin-dialog");
      
      const filePath = await open({
        title: "导入剪贴板历史",
        multiple: false,
        filters: [{
          name: "JSON",
          extensions: ["json"]
        }]
      });
      
      if (filePath) {
        const path = Array.isArray(filePath) ? filePath[0] : filePath;
        const count = await invoke<number>("import_history", { filePath: path });
        setMessage({ type: 'success', text: `已导入 ${count} 条记录` });
        onRefresh();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to import:", error);
      setMessage({ type: 'error', text: '导入失败' });
    } finally {
      setImporting(false);
    }
  };

  const clearData = async () => {
    setClearing(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const count = await invoke<number>("clear_all_history", { keepPinned });
      setMessage({ type: 'success', text: `已删除 ${count} 条记录` });
      onRefresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to clear:", error);
      setMessage({ type: 'error', text: '清空失败' });
    } finally {
      setClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">数据管理</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-4">
          {/* 导出 */}
          <button
            onClick={exportData}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Download className="w-5 h-5 text-blue-500" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">导出数据</p>
              <p className="text-xs text-gray-500">导出剪贴板历史到 JSON 文件</p>
            </div>
            {exporting && <span className="text-xs text-gray-400">导出中...</span>}
          </button>

          {/* 导入 */}
          <button
            onClick={importData}
            disabled={importing}
            className="w-full flex items-center justify-center gap-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Upload className="w-5 h-5 text-green-500" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">导入数据</p>
              <p className="text-xs text-gray-500">从 JSON 文件恢复剪贴板历史</p>
            </div>
            {importing && <span className="text-xs text-gray-400">导入中...</span>}
          </button>

          {/* 清空 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <Trash2 className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">清空数据</p>
                <p className="text-xs text-gray-500">删除所有剪贴板历史记录</p>
              </div>
            </div>
            
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={keepPinned}
                onChange={(e) => setKeepPinned(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">保留置顶记录</span>
            </label>

            <button
              onClick={clearData}
              disabled={clearing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" />
              {clearing ? '清空中...' : '确认清空'}
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className={`p-3 rounded text-sm ${
              message.type === 'success' 
                ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' 
                : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
