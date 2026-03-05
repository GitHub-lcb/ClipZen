import { useState, useEffect } from "react";
import { Settings, X, Save, RotateCcw } from "lucide-react";

interface AppSettings {
  max_history_items: number;
  auto_clear_after_days: number;
  theme: string;
  language: string;
  start_on_boot: boolean;
  show_in_tray: boolean;
  hotkey_show: string;
  hotkey_copy: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<AppSettings>("get_settings");
      setSettings(result);
      setSavedSettings(result);
    } catch (error) {
      console.error("Failed to load settings:", error);
      setMessage({ type: 'error', text: '加载设置失败' });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_settings", { newSettings: settings });
      setSavedSettings(settings);
      setMessage({ type: 'success', text: '设置已保存' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: 'error', text: '保存设置失败' });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      max_history_items: 1000,
      auto_clear_after_days: 0,
      theme: "system",
      language: "zh-CN",
      start_on_boot: false,
      show_in_tray: true,
      hotkey_show: "Shift+Super+V",
      hotkey_copy: "Super+C",
    });
    setMessage({ type: 'success', text: '已重置为默认值' });
  };

  const hasChanges = () => {
    if (!settings || !savedSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSettings);
  };

  if (!isOpen || !settings) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">设置</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 通用设置 */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 mb-3">通用</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  最大历史记录数
                </label>
                <input
                  type="number"
                  value={settings.max_history_items}
                  onChange={(e) => setSettings({ ...settings, max_history_items: parseInt(e.target.value) || 1000 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  min="100"
                  max="10000"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  自动清理（天数，0=不清理）
                </label>
                <input
                  type="number"
                  value={settings.auto_clear_after_days}
                  onChange={(e) => setSettings({ ...settings, auto_clear_after_days: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  主题
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">暗色</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  语言
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>
          </section>

          {/* 启动设置 */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 mb-3">启动</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.start_on_boot}
                  onChange={(e) => setSettings({ ...settings, start_on_boot: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">开机自动启动</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.show_in_tray}
                  onChange={(e) => setSettings({ ...settings, show_in_tray: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">显示系统托盘图标</span>
              </label>
            </div>
          </section>

          {/* 快捷键设置 */}
          <section>
            <h3 className="text-sm font-medium text-gray-500 mb-3">快捷键</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  显示/隐藏窗口
                </label>
                <input
                  type="text"
                  value={settings.hotkey_show}
                  onChange={(e) => setSettings({ ...settings, hotkey_show: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-mono text-sm"
                  placeholder="Shift+Super+V"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  快速复制
                </label>
                <input
                  type="text"
                  value={settings.hotkey_copy}
                  onChange={(e) => setSettings({ ...settings, hotkey_copy: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-mono text-sm"
                  placeholder="Super+C"
                />
              </div>
            </div>
          </section>

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

        {/* 底部按钮 */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <RotateCcw className="w-4 h-4" />
            重置为默认
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              取消
            </button>
            <button
              onClick={saveSettings}
              disabled={!hasChanges() || saving}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded ${
                hasChanges() && !saving
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
