import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clipboard, Search, Pin, Trash2, Image as ImageIcon, Settings as SettingsIcon, Tag, Database, Check, Clock, Loader2, Info, Lock, Shield, FileText, FolderOpen } from "lucide-react";
import { useClipboard, ClipboardItem } from "./hooks/useClipboard";
import { useI18n } from "./hooks/useI18n";
import { SettingsPanel } from "./components/SettingsPanel";
import { TagManager } from "./components/TagManager";
import { DataManager } from "./components/DataManager";
import { ItemDetail } from "./components/ItemDetail";
import { PasswordDialog } from "./components/PasswordDialog";

const SENSITIVE_PATTERNS = [
  { pattern: /1[3-9]\d{9}/g, type: "phone", label: "手机号" },
  { pattern: /[\w.-]+@[\w.-]+\.\w+/g, type: "email", label: "邮箱" },
  { pattern: /\d{17}[\dXx]/g, type: "idcard", label: "身份证" },
  { pattern: /\b\d{16,19}\b/g, type: "bankcard", label: "银行卡" },
];

interface SensitiveMatch {
  type: string;
  label: string;
  original: string;
  masked: string;
}

function detectSensitive(content: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = [];
  for (const { pattern, type, label } of SENSITIVE_PATTERNS) {
    const found = content.match(pattern);
    if (found) {
      for (const text of found) {
        let masked: string;
        switch (type) {
          case "phone":
            masked = text.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
            break;
          case "email":
            const [local, domain] = text.split("@");
            masked = local.slice(0, 2) + "***@" + domain;
            break;
          case "idcard":
            masked = text.replace(/(\d{4})\d{10}(\d{4})/, "$1**********$2");
            break;
          case "bankcard":
            masked = text.replace(/(\d{4})\d+(\d{4})/, "$1****$2");
            break;
          default:
            masked = "****";
        }
        matches.push({ type, label, original: text, masked });
      }
    }
  }
  return matches;
}

function getMaskedContent(content: string): string {
  const matches = detectSensitive(content);
  return matches.reduce(
    (text, match) => text.replace(match.original, match.masked),
    content
  );
}

function hasSensitiveInfo(content: string): boolean {
  return detectSensitive(content).length > 0;
}

function App() {
  const { t, locale, changeLocale } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ClipboardItem | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordDialogMode, setPasswordDialogMode] = useState<"set" | "verify">("verify");
  const [passwordDialogError, setPasswordDialogError] = useState<string | undefined>();
  const [pendingProtectedItem, setPendingProtectedItem] = useState<ClipboardItem | null>(null);
  const [unlockedItems, setUnlockedItems] = useState<Set<string>>(new Set());
  const [enablePasswordProtection, setEnablePasswordProtection] = useState(false);
  const [enableMaskedCopy, setEnableMaskedCopy] = useState(false);
  const { items, loading, copyToClipboard, deleteItem, togglePin, refresh, verifyPassword } = useClipboard();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const loadFeatureSettings = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const settings = await invoke<{
          enable_password_protection: boolean;
          enable_masked_copy: boolean;
        }>("get_settings");
        setEnablePasswordProtection(settings.enable_password_protection);
        setEnableMaskedCopy(settings.enable_masked_copy);
      } catch (error) {
        console.error("Failed to load feature settings:", error);
      }
    };
    loadFeatureSettings();
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => {
      (item.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedTag) {
      result = result.filter(item => (item.tags || []).includes(selectedTag));
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.item_type === "image" ||
        item.content.toLowerCase().includes(query) ||
        item.preview.toLowerCase().includes(query) ||
        (item.tags || []).some(tag => tag.toLowerCase().includes(query))
      );
    }
    return result;
  }, [items, selectedTag, searchQuery]);

  const pinnedItems = filteredItems.filter(item => item.pinned);
  const recentItems = filteredItems.filter(item => !item.pinned);
  const allFilteredItems = [...pinnedItems, ...recentItems];

  const scrollToSelectedItem = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= allFilteredItems.length) return;
    const item = allFilteredItems[selectedIndex];
    if (!item) return;
    const element = itemRefs.current.get(item.id);
    if (!element || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (elementRect.top < containerRect.top) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (elementRect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [selectedIndex, allFilteredItems]);

  useEffect(() => {
    scrollToSelectedItem();
  }, [selectedIndex, scrollToSelectedItem]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, allFilteredItems.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        const item = allFilteredItems[selectedIndex];
        if (item) handleCopyWithFeedback(item);
        return;
      }
      if (e.key === 'Delete' && selectedIndex >= 0) {
        e.preventDefault();
        const item = allFilteredItems[selectedIndex];
        if (item) setDeleteConfirmId(item.id);
        return;
      }
      if (e.key === 'Escape') {
        setDeleteConfirmId(null);
        setPreviewImage(null);
        setDetailItem(null);
        setSelectedIndex(-1);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allFilteredItems, selectedIndex]);

  const handleCopyWithFeedback = async (item: ClipboardItem) => {
    if (item.item_type === "image" && item.file_path) {
      await copyToClipboard(item.content, "image", item.file_path);
    } else {
      await copyToClipboard(item.content);
    }
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleDeleteConfirm = async (id: string) => {
    await deleteItem(id);
    setDeleteConfirmId(null);
    setSelectedIndex(-1);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minutesAgo', { n: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
    if (diffDays < 7) return t('time.daysAgo', { n: diffDays });
    return date.toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
  };

  const handleImagePreview = (item: ClipboardItem) => {
    if (item.item_type === "image") {
      setPreviewImage(item.content);
    }
  };

  const handleProtectedItemClick = (item: ClipboardItem) => {
    if (unlockedItems.has(item.id)) {
      handleCopyWithFeedback(item);
    } else {
      setPendingProtectedItem(item);
      setPasswordDialogMode("verify");
      setPasswordDialogError(undefined);
      setPasswordDialogOpen(true);
    }
  };

  const handlePasswordConfirm = async (password: string) => {
    const isValid = await verifyPassword(password);
    if (isValid) {
      setPasswordDialogOpen(false);
      if (pendingProtectedItem) {
        setUnlockedItems(prev => new Set(prev).add(pendingProtectedItem.id));
        handleCopyWithFeedback(pendingProtectedItem);
        setPendingProtectedItem(null);
      }
    } else {
      setPasswordDialogError(t('password.incorrect'));
    }
  };

  const handlePasswordCancel = () => {
    setPasswordDialogOpen(false);
    setPendingProtectedItem(null);
    setPasswordDialogError(undefined);
  };

  const handleMaskedCopy = async (item: ClipboardItem) => {
    const maskedContent = getMaskedContent(item.content);
    await copyToClipboard(maskedContent);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getDisplayContent = (item: ClipboardItem): string => {
    if (item.protected && !unlockedItems.has(item.id)) {
      return "****";
    }
    return item.content;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-gray-900 gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <div className="text-gray-500">{t('recent.empty') === '暂无记录' ? '加载中...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      {previewImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded" />
            <button className="absolute top-2 right-2 text-white hover:text-gray-300 text-2xl" onClick={() => setPreviewImage(null)}>×</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={`${t('search.placeholder')} (${t('search.shortcut')})`}
          className="flex-1 bg-transparent outline-none text-gray-700 dark:text-gray-200"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); }}
        />
        <div className="flex items-center gap-1">
          <button onClick={() => setDataManagerOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title={t('dataManager.title')}>
            <Database className="w-4 h-4 text-gray-500" />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors" title={t('settings.title')}>
            <SettingsIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <SettingsPanel 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        t={t} 
        locale={locale} 
        changeLocale={changeLocale}
        onFeatureSettingsChange={(passwordProtection, maskedCopy) => {
          setEnablePasswordProtection(passwordProtection);
          setEnableMaskedCopy(maskedCopy);
        }}
      />
      <DataManager isOpen={dataManagerOpen} onClose={() => setDataManagerOpen(false)} onRefresh={refresh} t={t} />
      {detailItem && <ItemDetail item={detailItem} onClose={() => { setDetailItem(null); setUnlockedItems(new Set()); }} onUpdate={refresh} t={t} enablePasswordProtection={enablePasswordProtection} enableMaskedCopy={enableMaskedCopy} />}
      <PasswordDialog
        isOpen={passwordDialogOpen}
        mode={passwordDialogMode}
        onConfirm={handlePasswordConfirm}
        onCancel={handlePasswordCancel}
        error={passwordDialogError}
        t={t}
      />

      {pinnedItems.length > 0 && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
            <Pin className="w-3 h-3" />
            <span>{t('pinned.title')}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {pinnedItems.map((item, idx) => {
              const isProtected = enablePasswordProtection && item.protected && !unlockedItems.has(item.id);
              return (
                <div
                  key={item.id}
                  ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                  onClick={() => {
                    if (enablePasswordProtection && item.protected) {
                      handleProtectedItemClick(item);
                    } else {
                      handleCopyWithFeedback(item);
                    }
                  }}
                  className={`aspect-square rounded cursor-pointer flex items-center justify-center relative group transition-all ${
                    selectedIndex === idx ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                  }`}
                >
                  {copiedId === item.id && (
                    <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center rounded">
                      <Check className="w-6 h-6 text-green-500" />
                    </div>
                  )}
                  {item.item_type === "image" ? (
                    <img src={item.preview} alt="Image" className="w-full h-full object-cover rounded" />
                  ) : item.item_type === "files" ? (
                    <div className="flex flex-col items-center justify-center w-full h-full">
                      <FolderOpen className="w-6 h-6 text-blue-500" />
                      <span className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate px-1">{item.preview}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {isProtected && (
                        <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-xs text-gray-700 dark:text-gray-200 truncate px-2 text-center">
                        {isProtected ? "****" : item.preview}
                      </span>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); togglePin(item.id); }} className="absolute top-1 right-1 p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pin className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TagFilter allTags={allTags} selectedTag={selectedTag} onSelectTag={setSelectedTag} t={t} />

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clipboard className="w-3 h-3" />
            <span>{t('recent.title')}</span>
          </div>
          <span className="text-xs text-gray-400">{t('keyboard.navigate')} {t('keyboard.copy')} {t('keyboard.delete')}</span>
        </div>
        {recentItems.length === 0 ? (
          <div className="text-center py-12">
            <Clipboard className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">{t('recent.empty')}</p>
            <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">{t('recent.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentItems.map((item, idx) => {
              const globalIdx = pinnedItems.length + idx;
              const isSelected = selectedIndex === globalIdx;
              const showDeleteConfirm = deleteConfirmId === item.id;
              const isProtected = enablePasswordProtection && item.protected && !unlockedItems.has(item.id);
              const showMaskedCopy = enableMaskedCopy && !isProtected && item.item_type === "text" && hasSensitiveInfo(item.content);
              
              return (
                <div
                  key={item.id}
                  ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                  onClick={() => {
                    if (item.item_type === "image") {
                      handleImagePreview(item);
                    } else if (enablePasswordProtection && item.protected) {
                      handleProtectedItemClick(item);
                    } else {
                      handleCopyWithFeedback(item);
                    }
                  }}
                  className={`p-3 border rounded-lg cursor-pointer transition-all ${
                    isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {item.item_type === "image" ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <ImageIcon className="w-4 h-4" />
                          <span>{t('image.label')}</span>
                        </div>
                      ) : item.item_type === "files" ? (
                        <div className="flex items-start gap-2">
                          <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-gray-700 dark:text-gray-200 line-clamp-2">{item.preview}</p>
                            <p className="text-xs text-gray-400 mt-1">{item.content.split('\n').length} 个文件</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {isProtected && (
                            <Lock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          )}
                          <p className="text-sm text-gray-700 dark:text-gray-200 line-clamp-3">{getDisplayContent(item)}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(item.created_at)}</span>
                      </div>
                      <div className="mt-2">
                        <TagManager itemId={item.id} currentTags={item.tags || []} onTagsChange={() => refresh()} t={t} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {copiedId === item.id && (
                        <span className="flex items-center gap-1 text-xs text-green-500 px-2">
                          <Check className="w-3 h-3" />
                          {t('actions.copied')}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyWithFeedback(item); }}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-full transition-colors"
                        title={t('actions.copy')}
                      >
                        <Clipboard className="w-4 h-4" />
                      </button>
                      {showMaskedCopy && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleMaskedCopy(item); }} 
                          className="p-1.5 text-gray-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-500 rounded-full transition-colors" 
                          title={t('detail.maskedCopy')}
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} className="p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 rounded-full transition-colors" title={t('detail.title')}>
                        <Info className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); togglePin(item.id); }} className={`p-1.5 rounded-full transition-colors ${item.pinned ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500'}`} title={t('actions.pin')}>
                        <Pin className="w-4 h-4" />
                      </button>
                      {showDeleteConfirm ? (
                        <div className="flex items-center gap-1">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(item.id); }} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">{t('actions.confirm')}</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600">{t('actions.cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }} className="p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-full transition-colors" title={t('actions.delete')}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 text-center">
        {t('status.total', { n: items.length })} | {t('status.showing', { n: filteredItems.length })}
      </div>
    </div>
  );
}

function TagFilter({ allTags, selectedTag, onSelectTag, t }: { allTags: string[]; selectedTag: string | null; onSelectTag: (tag: string | null) => void; t: (key: string) => string }) {
  if (allTags.length === 0) return null;
  return (
    <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <button onClick={() => onSelectTag(null)} className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${selectedTag === null ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
        {t('tags.all')}
      </button>
      {allTags.slice(0, 10).map(tag => (
        <button key={tag} onClick={() => onSelectTag(tag === selectedTag ? null : tag)} className={`px-2 py-1 text-xs rounded whitespace-nowrap flex items-center gap-1 transition-colors ${tag === selectedTag ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
          <Tag className="w-3 h-3" />
          {tag}
        </button>
      ))}
      {allTags.length > 10 && <span className="text-xs text-gray-400">+{allTags.length - 10}</span>}
    </div>
  );
}

export default App;