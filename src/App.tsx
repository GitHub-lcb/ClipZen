import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Clipboard, Search, Pin, Trash2, Image as ImageIcon, Settings as SettingsIcon, Tag, Check, Clock, Loader2, Info, Lock, Shield, FolderOpen, X } from "lucide-react";
import { useClipboard, ClipboardItem } from "./hooks/useClipboard";
import { useI18n } from "./hooks/useI18n";
import { SettingsPanel } from "./components/SettingsPanel";
import { TagManager } from "./components/TagManager";
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
    const handleKeyDown = async (e: KeyboardEvent) => {
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
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().minimize();
        } catch (err) {
          console.error('Failed to minimize window:', err);
        }
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

  const handleImagePreview = async (item: ClipboardItem) => {
    if (item.item_type === "image") {
      if (item.file_path) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const imageData = await invoke<string>("get_image_data", { filePath: item.file_path });
          setPreviewImage(imageData);
        } catch (error) {
          console.error("Failed to load image:", error);
          setPreviewImage(item.content);
        }
      } else {
        setPreviewImage(item.content);
      }
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
      <div className="flex flex-col items-center justify-center h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="relative">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--color-primary)' }} />
          <div className="absolute inset-0 w-10 h-10 animate-ping opacity-20" style={{ color: 'var(--color-primary)' }}>
            <Loader2 />
          </div>
        </div>
        <div className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {t('recent.empty') === '暂无记录' ? '加载中...' : 'Loading...'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
      {previewImage && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 animate-fade-in"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4 animate-scale-in">
            <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <button 
              className="absolute top-6 right-6 p-2 rounded-lg transition-all duration-200 hover:scale-110"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'white' }}
              onClick={() => setPreviewImage(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div 
        className="flex items-center gap-3 px-4 py-3 border-b transition-colors duration-200"
        style={{ 
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-bg-card)'
        }}
      >
        <div className="relative flex-1">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-200"
            style={{ color: 'var(--color-text-muted)' }}
          />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={`${t('search.placeholder')} (${t('search.shortcut')})`}
            className="w-full pl-10 pr-4 py-2 rounded-lg border outline-none transition-all duration-200"
            style={{ 
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)'
            }}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); }}
          />
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setSettingsOpen(true)} 
            className="btn-icon"
            title={t('settings.title')}
          >
            <SettingsIcon className="w-4 h-4" />
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
        onRefresh={refresh}
      />
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
        <div 
          className="p-4 border-b transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div 
                className="p-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--color-primary-light)' }}
              >
                <Pin className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              </div>
              <span 
                className="text-sm font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {t('pinned.title')}
              </span>
            </div>
            <div 
              className="h-px flex-1 ml-3"
              style={{ 
                background: `linear-gradient(to right, var(--color-border), transparent)`
              }} 
            />
          </div>
          <div className="grid grid-cols-4 gap-3">
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
                  className={`
                    group relative rounded-xl cursor-pointer overflow-hidden 
                    transition-all duration-200 ease-out
                    ${selectedIndex === idx 
                      ? 'ring-2 ring-offset-2 scale-[1.02]' 
                      : 'hover:scale-[1.02]'
                    }
                  `}
                  style={{ 
                    backgroundColor: item.item_type === "image" ? 'var(--color-bg-card)' : 'var(--color-primary-light)',
                    borderColor: 'var(--color-border)',
                    borderWidth: '1px',
                    boxShadow: selectedIndex === idx ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    ['--tw-ring-offset-color' as string]: 'var(--color-bg)'
                  } as React.CSSProperties}
                >
                  {copiedId === item.id && (
                    <div 
                      className="absolute inset-0 flex items-center justify-center rounded-xl animate-scale-in"
                      style={{ 
                        backgroundColor: 'var(--color-success)',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <Check className="w-7 h-7 text-white" />
                        <span className="text-xs font-medium text-white">{t('actions.copied')}</span>
                      </div>
                    </div>
                  )}
                  {item.item_type === "image" ? (
                    <div className="relative w-full h-full">
                      <img 
                        src={item.preview} 
                        alt="Image" 
                        className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-300" 
                      />
                      <div 
                        className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        style={{ 
                          background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)'
                        }}
                      >
                        <span className="text-xs text-white font-medium">{t('image.clickToCopy')}</span>
                      </div>
                    </div>
                  ) : item.item_type === "files" ? (
                    <div 
                      className="flex flex-col items-center justify-center w-full h-full p-3" 
                      title={item.preview}
                    >
                      <FolderOpen className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                      <span 
                        className="text-xs mt-1 truncate px-1 text-center"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {item.preview}
                      </span>
                    </div>
                  ) : (
                    <div 
                      className="flex items-center justify-center w-full h-full p-3" 
                      title={isProtected ? "受保护的内容" : item.content}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {isProtected && (
                          <Lock className="w-3.5 h-3.5" style={{ color: 'var(--color-warning)' }} />
                        )}
                        <span 
                          className="text-xs font-medium truncate px-2.5 text-center leading-relaxed max-w-full"
                          style={{ color: 'var(--color-text)' }}
                        >
                          {isProtected ? "****" : item.preview}
                        </span>
                      </div>
                    </div>
                  )}
                  <button 
                    onClick={(e) => { e.stopPropagation(); togglePin(item.id); }} 
                    className="absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-200 hover:scale-110 z-10"
                    style={{ 
                      backgroundColor: 'var(--color-bg-card)',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <Pin 
                      className="w-3.5 h-3.5" 
                      style={{ 
                        color: item.pinned ? 'var(--color-primary)' : 'var(--color-text-muted)'
                      }} 
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TagFilter allTags={allTags} selectedTag={selectedTag} onSelectTag={setSelectedTag} t={t} />

      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-y-auto p-4"
      >
        <div 
          className="flex items-center justify-between mb-3"
        >
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <Clipboard className="w-3.5 h-3.5" />
            <span>{t('recent.title')}</span>
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {t('keyboard.navigate')} {t('keyboard.copy')} {t('keyboard.delete')}
          </span>
        </div>
        {recentItems.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div 
              className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-border)' }}
            >
              <Clipboard className="w-8 h-8" style={{ color: 'var(--color-text-muted)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('recent.empty')}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{t('recent.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
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
                    if (enablePasswordProtection && item.protected) {
                      handleProtectedItemClick(item);
                    } else {
                      handleCopyWithFeedback(item);
                    }
                  }}
                  className={`
                    p-4 rounded-xl cursor-pointer transition-all duration-200
                    ${isSelected 
                      ? 'ring-2 ring-offset-2 scale-[1.01]' 
                      : 'hover:shadow-md'
                    }
                  `}
                  style={{ 
                    backgroundColor: 'var(--color-bg-card)',
                    borderColor: 'var(--color-border)',
                    borderWidth: '1px',
                    boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                    ['--tw-ring-offset-color' as string]: 'var(--color-bg)'
                  } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {item.item_type === "image" ? (
                        <div className="flex items-start gap-3">
                          <div 
                            className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:ring-2"
                            style={{ 
                              borderColor: 'var(--color-border)',
                              borderWidth: '1px'
                            }}
                            onClick={(e) => { e.stopPropagation(); handleCopyWithFeedback(item); }}
                          >
                            <img 
                              src={item.preview} 
                              alt="Image preview" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                              <ImageIcon className="w-4 h-4" />
                              <span>{t('image.label')}</span>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('image.clickToCopy')}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleImagePreview(item); }}
                            className="btn-icon"
                            title={t('image.preview')}
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : item.item_type === "files" ? (
                        <div className="flex items-start gap-2">
                          <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
                          <div>
                            <p className="text-sm line-clamp-2" style={{ color: 'var(--color-text)' }}>{item.preview}</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{item.content.split('\n').length} 个文件</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          {isProtected && (
                            <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-warning)' }} />
                          )}
                          <p className="text-sm line-clamp-3" style={{ color: 'var(--color-text)' }}>{getDisplayContent(item)}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(item.created_at)}</span>
                      </div>
                      <div className="mt-3">
                        <TagManager itemId={item.id} currentTags={item.tags || []} onTagsChange={() => refresh()} t={t} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {copiedId === item.id && (
                        <span 
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg animate-scale-in"
                          style={{ 
                            backgroundColor: 'var(--color-success-light)',
                            color: 'var(--color-success)'
                          }}
                        >
                          <Check className="w-3 h-3" />
                          {t('actions.copied')}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyWithFeedback(item); }}
                        className="btn-icon"
                        title={t('actions.copy')}
                      >
                        <Clipboard className="w-4 h-4" />
                      </button>
                      {showMaskedCopy && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleMaskedCopy(item); }} 
                          className="btn-icon"
                          style={{ 
                            backgroundColor: 'var(--color-warning-light)'
                          }}
                          title={t('detail.maskedCopy')}
                        >
                          <Shield className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} 
                        className="btn-icon" 
                        title={t('detail.title')}
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); togglePin(item.id); }} 
                        className="btn-icon"
                        style={{ 
                          backgroundColor: item.pinned ? 'var(--color-primary-light)' : undefined,
                          color: item.pinned ? 'var(--color-primary)' : undefined
                        }}
                        title={t('actions.pin')}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                      {showDeleteConfirm ? (
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(item.id); }} 
                            className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:opacity-90"
                            style={{ 
                              backgroundColor: 'var(--color-error)',
                              color: 'white'
                            }}
                          >
                            {t('actions.confirm')}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} 
                            className="btn-secondary text-xs px-3 py-1.5"
                          >
                            {t('actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }} 
                          className="btn-icon"
                          title={t('actions.delete')}
                        >
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

      <div 
        className="px-4 py-2 text-xs text-center border-t transition-colors duration-200"
        style={{ 
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)'
        }}
      >
        {t('status.total', { n: items.length })} | {t('status.showing', { n: filteredItems.length })}
      </div>
    </div>
  );
}

function TagFilter({ allTags, selectedTag, onSelectTag, t }: { allTags: string[]; selectedTag: string | null; onSelectTag: (tag: string | null) => void; t: (key: string) => string }) {
  if (allTags.length === 0) return null;
  return (
    <div 
      className="flex items-center gap-2 px-4 py-2.5 border-b overflow-x-auto transition-colors duration-200"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <Tag className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-text-muted)' }} />
      <button 
        onClick={() => onSelectTag(null)} 
        className={`
          px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-all duration-200
          ${selectedTag === null ? 'btn-primary' : 'btn-secondary'}
        `}
      >
        {t('tags.all')}
      </button>
      {allTags.slice(0, 10).map(tag => (
        <button 
          key={tag} 
          onClick={() => onSelectTag(tag === selectedTag ? null : tag)} 
          className={`
            px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap flex items-center gap-1 transition-all duration-200
            ${tag === selectedTag ? 'btn-primary' : 'btn-secondary'}
          `}
        >
          <Tag className="w-3 h-3" />
          {tag}
        </button>
      ))}
      {allTags.length > 10 && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>+{allTags.length - 10}</span>}
    </div>
  );
}

export default App;
