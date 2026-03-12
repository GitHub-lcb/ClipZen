import { useState, useEffect } from "react";
import { Settings, X, Save, RotateCcw, Monitor, Moon, Sun, Globe, Rocket, Database, Download, Upload, Trash2, Loader2 } from "lucide-react";

interface AppSettings {
  max_history_items: number;
  auto_clear_after_days: number;
  theme: string;
  language: string;
  start_on_boot: boolean;
  show_in_tray: boolean;
  hotkey_show: string;
  hotkey_copy: string;
  enable_password_protection: boolean;
  enable_masked_copy: boolean;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
  changeLocale: (locale: string) => void;
  onFeatureSettingsChange?: (enablePasswordProtection: boolean, enableMaskedCopy: boolean) => void;
  onRefresh?: () => void;
  onActivateLicense?: () => void;
  isPro?: boolean;
  licenseInfo?: any;
}

export function SettingsPanel({ isOpen, onClose, t, locale, changeLocale, onFeatureSettingsChange, onRefresh, onActivateLicense, isPro, licenseInfo }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [keepPinned, setKeepPinned] = useState(true);

  useEffect(() => {
    if (isOpen) loadSettings();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const loadSettings = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<AppSettings>("get_settings");
      setSettings(result);
      setSavedSettings(result);
    } catch (error) {
      console.error("Failed to load settings:", error);
      setMessage({ type: 'error', text: t('settings.loadFailed') });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_settings", { newSettings: settings });
      setSavedSettings(settings);
      
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      if (settings.theme === "system") {
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        root.classList.add(systemDark ? "dark" : "light");
      } else {
        root.classList.add(settings.theme);
      }
      
      if (onFeatureSettingsChange) {
        onFeatureSettingsChange(settings.enable_password_protection, settings.enable_masked_copy);
      }
      
      setMessage({ type: 'success', text: t('settings.saved') });
      changeLocale(settings.language);
      setTimeout(() => { setMessage(null); onClose(); }, 1500);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: 'error', text: t('settings.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setSettings({
      max_history_items: 1000,
      auto_clear_after_days: 0,
      theme: "system",
      language: locale,
      start_on_boot: false,
      show_in_tray: true,
      hotkey_show: "Shift+Super+V",
      hotkey_copy: "Super+C",
      enable_password_protection: false,
      enable_masked_copy: false,
    });
    setMessage({ type: 'success', text: 'Reset to defaults' });
  };

  const hasChanges = () => {
    if (!settings || !savedSettings) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSettings);
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { save } = await import("@tauri-apps/plugin-dialog");
      
      const filePath = await save({
        title: t('dataManager.export'),
        defaultPath: "clipzen-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
      
      if (filePath) {
        const count = await invoke<number>("export_history", { filePath });
        setMessage({ type: 'success', text: t('dataManager.exportSuccess', { n: count }) });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to export:", error);
      setMessage({ type: 'error', text: 'Export failed' });
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
        title: t('dataManager.import'),
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }]
      });
      
      if (filePath) {
        const path = Array.isArray(filePath) ? filePath[0] : filePath;
        const count = await invoke<number>("import_history", { filePath: path });
        setMessage({ type: 'success', text: t('dataManager.importSuccess', { n: count }) });
        if (onRefresh) onRefresh();
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error("Failed to import:", error);
      setMessage({ type: 'error', text: 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const clearData = async () => {
    setClearing(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const count = await invoke<number>("clear_all_history", { keepPinned });
      setMessage({ type: 'success', text: t('dataManager.clearSuccess', { n: count }) });
      if (onRefresh) onRefresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to clear:", error);
      setMessage({ type: 'error', text: t('dataManager.clearFailed') });
    } finally {
      setClearing(false);
    }
  };

  if (!isOpen || !settings) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in p-2"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div 
        className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in"
        style={{ 
          backgroundColor: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div 
          className="flex items-center justify-between px-4 py-3 border-b transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="p-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--color-primary-light)' }}
            >
              <Settings className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('settings.title')}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="btn-icon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Pro 激活状态 */}
          <section>
            <div 
              className="rounded-xl p-4 border transition-colors duration-200"
              style={{ 
                backgroundColor: isPro ? 'var(--color-primary-light)' : 'var(--color-bg-secondary)',
                borderColor: isPro ? 'var(--color-primary)' : 'var(--color-border)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div 
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: isPro ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    <svg className="w-4 h-4" style={{ color: isPro ? 'white' : 'var(--color-text-muted)' }} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {isPro ? 'ClipZen Pro' : '升级到 Pro'}
                    </h3>
                    {isPro && licenseInfo && (
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {licenseInfo.license_type === 'Standard' ? '标准版' : licenseInfo.license_type === 'Family' ? '家庭版' : '企业版'}
                      </p>
                    )}
                  </div>
                </div>
                {!isPro && (
                  <button
                    onClick={onActivateLicense}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'white'
                    }}
                  >
                    激活
                  </button>
                )}
              </div>
              {!isPro && (
                <ul className="text-xs space-y-1" style={{ color: 'var(--color-text-muted)' }}>
                  <li>✓ 加密存储保护</li>
                  <li>✓ 无限历史记录</li>
                  <li>✓ 自定义主题</li>
                  <li>✓ 终身免费更新</li>
                </ul>
              )}
              {isPro && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
                  感谢您的支持！您已激活 Pro 版本。
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                {t('settings.general')}
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <label 
                  className="block text-xs mb-1.5" 
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('settings.maxHistoryItems')}
                </label>
                <input 
                  type="number" 
                  value={settings.max_history_items} 
                  onChange={(e) => setSettings({ ...settings, max_history_items: parseInt(e.target.value) || 1000 })} 
                  className="input-field text-sm"
                  min="100" 
                  max="10000" 
                />
              </div>
              <div>
                <label 
                  className="block text-xs mb-1.5" 
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('settings.theme')}
                </label>
                <div className="flex gap-1.5">
                  {[
                    { value: 'system', icon: Monitor },
                    { value: 'light', icon: Sun },
                    { value: 'dark', icon: Moon }
                  ].map(({ value, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setSettings({ ...settings, theme: value })}
                      className={`
                        flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium
                        transition-all duration-200
                        ${settings.theme === value 
                          ? 'btn-primary' 
                          : 'btn-secondary'
                        }
                      `}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label 
                  className="block text-xs mb-1.5" 
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {t('settings.language')}
                </label>
                <select 
                  value={settings.language} 
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })} 
                  className="input-field text-sm"
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                {t('settings.startup')}
              </h3>
            </div>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.start_on_boot} 
                  onChange={(e) => setSettings({ ...settings, start_on_boot: e.target.checked })} 
                  className="w-4 h-4 rounded mt-0.5"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text)' }}>
                  {t('settings.startOnBoot')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.show_in_tray} 
                  onChange={(e) => setSettings({ ...settings, show_in_tray: e.target.checked })} 
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span className="text-xs" style={{ color: 'var(--color-text)' }}>
                  {t('settings.showInTray')}
                </span>
              </label>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                {t('dataManager.title')}
              </h3>
            </div>
            <div className="space-y-2">
              <button 
                onClick={exportData} 
                disabled={exporting} 
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 text-xs disabled:opacity-50"
                style={{ 
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <Download className="w-4 h-4" style={{ color: 'var(--color-info)' }} />
                <span style={{ color: 'var(--color-text)' }}>{t('dataManager.export')}</span>
                {exporting && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" style={{ color: 'var(--color-primary)' }} />}
              </button>
              <button 
                onClick={importData} 
                disabled={importing} 
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 text-xs disabled:opacity-50"
                style={{ 
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <Upload className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
                <span style={{ color: 'var(--color-text)' }}>{t('dataManager.import')}</span>
                {importing && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" style={{ color: 'var(--color-primary)' }} />}
              </button>
              <div className="flex items-center gap-2 pt-1">
                <button 
                  onClick={clearData} 
                  disabled={clearing} 
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-200 disabled:opacity-50"
                  style={{ 
                    backgroundColor: 'var(--color-error)',
                    color: 'white'
                  }}
                >
                  {clearing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  {t('dataManager.clear')}
                </button>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={keepPinned} 
                    onChange={(e) => setKeepPinned(e.target.checked)} 
                    className="w-3.5 h-3.5 rounded"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {t('dataManager.keepPinned')}
                  </span>
                </label>
              </div>
            </div>
          </section>

          {message && (
            <div 
              className={`p-3 rounded-lg text-xs animate-slide-up ${
                message.type === 'success' ? 'badge-success' : 'badge-error'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div 
          className="flex items-center justify-between px-4 py-3 border-t transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button 
            onClick={resetToDefaults} 
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors duration-200 hover:opacity-80"
            style={{ 
              backgroundColor: 'var(--color-border)',
              color: 'var(--color-text-secondary)'
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('settings.reset')}
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose} 
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {t('actions.cancel')}
            </button>
            <button 
              onClick={saveSettings} 
              disabled={!hasChanges() || saving}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? t('settings.saving') : t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
