import { useState } from "react";
import { Database, Download, Upload, Trash2, X, AlertTriangle, Check, Loader2 } from "lucide-react";

interface DataManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function DataManager({ isOpen, onClose, onRefresh, t }: DataManagerProps) {
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
        onRefresh();
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
      onRefresh();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to clear:", error);
      setMessage({ type: 'error', text: t('dataManager.clearFailed') });
    } finally {
      setClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div 
        className="rounded-2xl w-full max-w-md overflow-hidden animate-scale-in"
        style={{ 
          backgroundColor: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div 
          className="flex items-center justify-between px-6 py-4 border-b transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-primary-light)' }}
            >
              <Database className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h2 
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {t('dataManager.title')}
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="btn-icon"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <button 
            onClick={exportData} 
            disabled={exporting} 
            className="w-full flex items-center justify-center gap-4 p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            style={{ 
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-info-light)' }}
            >
              <Download className="w-5 h-5" style={{ color: 'var(--color-info)' }} />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t('dataManager.export')}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('dataManager.exportHint')}
              </p>
            </div>
            {exporting && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />}
          </button>

          <button 
            onClick={importData} 
            disabled={importing} 
            className="w-full flex items-center justify-center gap-4 p-4 rounded-xl border transition-all duration-200 hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            style={{ 
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-success-light)' }}
            >
              <Upload className="w-5 h-5" style={{ color: 'var(--color-success)' }} />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {t('dataManager.import')}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t('dataManager.importHint')}
              </p>
            </div>
            {importing && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />}
          </button>

          <div 
            className="rounded-xl p-4 border"
            style={{ 
              backgroundColor: 'var(--color-error-light)',
              borderColor: 'transparent'
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div 
                className="p-2 rounded-lg"
                style={{ backgroundColor: 'var(--color-bg-card)' }}
              >
                <Trash2 className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--color-error)' }}>
                  {t('dataManager.clear')}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {t('dataManager.clearHint')}
                </p>
              </div>
            </div>
            
            <label className="flex items-center gap-3 mb-4 cursor-pointer">
              <input 
                type="checkbox" 
                checked={keepPinned} 
                onChange={(e) => setKeepPinned(e.target.checked)} 
                className="w-5 h-5 rounded"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span className="text-sm" style={{ color: 'var(--color-text)' }}>
                {t('dataManager.keepPinned')}
              </span>
            </label>

            <button 
              onClick={clearData} 
              disabled={clearing} 
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              style={{ 
                backgroundColor: 'var(--color-error)',
                color: 'white'
              }}
            >
              {clearing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {clearing ? t('dataManager.clearing') : t('actions.confirm')}
            </button>
          </div>

          {message && (
            <div 
              className={`p-4 rounded-lg text-sm flex items-center gap-2 animate-slide-up ${
                message.type === 'success' ? 'badge-success' : 'badge-error'
              }`}
            >
              {message.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
