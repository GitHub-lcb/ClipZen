import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Clipboard, Search, Pin, Trash2, Image as ImageIcon, Settings as SettingsIcon, 
  Check, Clock, Loader2, Info, Lock, Shield, FolderOpen, X, 
  ArrowUpDown, ArrowUp, ArrowDown, ChevronUp, ChevronDown 
} from "lucide-react";
import { useClipboard, ClipboardItem } from "@/hooks/useClipboard";
import { useI18n } from "@/hooks/useI18n";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TagManager } from "@/components/TagManager";
import { ItemDetail } from "@/components/ItemDetail";
import { PasswordDialog } from "@/components/PasswordDialog";
import { LicenseDialog } from "@/components/LicenseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger,
  TooltipProvider 
} from "@/components/ui/tooltip";
import { TagFilter } from "@/components/TagFilter";
import type { LicenseInfo } from "@/components/LicenseDialog";
import { cn } from "@/lib/utils";

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

// 动画配置
const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 }
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.03
    }
  }
};

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
  const [sortBy, setSortBy] = useState<"time" | "type" | "content" | "popularity">("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [searchedItems, setSearchedItems] = useState<ClipboardItem[]>([]);
  const [, setSearchLoading] = useState(false);
  const { items, loading, error, loadingMore, hasMore, loadMore, copyToClipboard, deleteItem, togglePin, refresh, verifyPassword } = useClipboard();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(50);
  const ITEM_HEIGHT = 120;
  const MAX_VISIBLE_ITEMS = 50;

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
    
    const loadLicenseInfo = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const info = await invoke<any>("get_license_info");
        if (info) {
          setIsPro(true);
          setLicenseInfo(info);
        }
      } catch (error) {
        console.error("Failed to load license info:", error);
      }
    };
    
    loadFeatureSettings();
    loadLicenseInfo();
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => {
      (item.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [items]);

  // 搜索处理
  const handleSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    try {
      const results = await invoke<ClipboardItem[]>("search_clipboard_history", {
        query
      });
      setSearchedItems(results);
    } catch (error) {
      console.error("Failed to search:", error);
      setSearchedItems([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // 监听搜索查询变化
  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch(searchQuery);
    } else {
      setSearchedItems([]);
    }
  }, [searchQuery, handleSearch]);

  const filteredItems = useMemo(() => {
    let result = searchQuery.trim() ? searchedItems : items;
    if (selectedTag) {
      result = result.filter(item => (item.tags || []).includes(selectedTag));
    }
    
    const sorted = [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      
      const multiplier = sortOrder === "asc" ? 1 : -1;
      
      switch (sortBy) {
        case "time":
          return (a.created_at - b.created_at) * multiplier;
        case "type":
          const typeOrder = { image: 0, text: 1, files: 2 };
          const typeDiff = (typeOrder[a.item_type as keyof typeof typeOrder] ?? 1) - 
                          (typeOrder[b.item_type as keyof typeof typeOrder] ?? 1);
          return typeDiff !== 0 ? typeDiff * multiplier : (a.created_at - b.created_at) * -1;
        case "content":
          const aContent = a.item_type === "image" ? "" : (a.preview || a.content).toLowerCase();
          const bContent = b.item_type === "image" ? "" : (b.preview || b.content).toLowerCase();
          return aContent.localeCompare(bContent, "zh-CN") * multiplier;
        case "popularity":
          const aLastCopy = a.updated_at || a.created_at;
          const bLastCopy = b.updated_at || b.created_at;
          const copyTimeDiff = bLastCopy - aLastCopy;
          if (copyTimeDiff !== 0) return copyTimeDiff;
          const aCount = a.copy_count || 0;
          const bCount = b.copy_count || 0;
          const countDiff = aCount - bCount;
          return countDiff !== 0 ? countDiff * multiplier : (a.created_at - b.created_at) * -1;
        default:
          return (a.created_at - b.created_at) * -1;
      }
    });
    
    return sorted;
  }, [items, searchedItems, selectedTag, searchQuery, sortBy, sortOrder]);

  const pinnedItems = filteredItems.filter(item => item.pinned);
  const recentItems = filteredItems.filter(item => !item.pinned);
  const allFilteredItems = filteredItems;

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

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollHeight = container.scrollHeight;
    
    // 当滚动到接近底部时，加载更多数据
    if (scrollTop + containerHeight >= scrollHeight - 200 && hasMore) {
      loadMore();
    }
    
    const newStartIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 10);
    const newEndIndex = Math.min(
      recentItems.length,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + 10
    );
    
    const visibleCount = newEndIndex - newStartIndex;
    if (visibleCount > MAX_VISIBLE_ITEMS) {
      const adjustedStart = newStartIndex + Math.floor((visibleCount - MAX_VISIBLE_ITEMS) / 2);
      setStartIndex(adjustedStart);
      setEndIndex(adjustedStart + MAX_VISIBLE_ITEMS);
    } else {
      setStartIndex(newStartIndex);
      setEndIndex(newEndIndex);
    }
  }, [recentItems.length, hasMore, loadMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    handleScroll();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    setStartIndex(0);
    setEndIndex(Math.min(recentItems.length, MAX_VISIBLE_ITEMS));
  }, [recentItems.length, searchQuery, selectedTag, sortBy, sortOrder]);

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
      if (e.key === 'Home') {
        e.preventDefault();
        setSelectedIndex(pinnedItems.length);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setSelectedIndex(allFilteredItems.length - 1);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ 
            top: scrollContainerRef.current.scrollHeight, 
            behavior: 'smooth' 
          });
        }
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
  }, [allFilteredItems, selectedIndex, pinnedItems.length]);

  const handleCopyWithFeedback = async (item: ClipboardItem) => {
    await copyToClipboard(item);
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
    await invoke("copy_to_clipboard", { content: maskedContent });
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
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative"
        >
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <div className="absolute inset-0 w-10 h-10 animate-ping opacity-20">
            <Loader2 className="text-primary" />
          </div>
        </motion.div>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-sm text-muted-foreground"
        >
          {t('recent.empty') === '暂无记录' ? '加载中...' : 'Loading...'}
        </motion.p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background">
        {/* 图片预览模态框 */}
        <AnimatePresence>
          {previewImage && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center z-50 bg-black/75"
              onClick={() => setPreviewImage(null)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative max-w-4xl max-h-[90vh] p-4"
              >
                <img src={previewImage} alt="Preview" className="max-w-full max-h-[85vh] object-contain rounded-lg" />
                <Button 
                  variant="secondary"
                  size="icon"
                  className="absolute top-6 right-6"
                  onClick={() => setPreviewImage(null)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 头部搜索栏 - 毛玻璃效果 */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="glass flex items-center gap-3 px-4 py-3 border-b sticky top-0 z-10"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder={`${t('search.placeholder')} (${t('search.shortcut')})`}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); }}
            />
          </div>
          <div className="flex items-center gap-1 relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setShowSortMenu(!showSortMenu)}
                  className={cn(showSortMenu && "bg-accent")}
                >
                  <ArrowUpDown className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('sort.title')}</TooltipContent>
            </Tooltip>
            
            <AnimatePresence>
              {showSortMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-full mt-1 w-40 rounded-lg shadow-lg border bg-popover z-50"
                >
                  <div className="p-1">
                    {[
                      { key: "time", label: t('sort.time') },
                      { key: "type", label: t('sort.type') },
                      { key: "content", label: t('sort.content') },
                      { key: "popularity", label: t('sort.popularity') },
                    ].map(option => (
                      <Button
                        key={option.key}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "w-full justify-between",
                          sortBy === option.key && "bg-accent text-primary"
                        )}
                        onClick={() => {
                          if (sortBy === option.key) {
                            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setSortBy(option.key as "time" | "type" | "content" | "popularity");
                            setSortOrder("desc");
                          }
                        }}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.key && (
                          sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                        )}
                      </Button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('settings.title')}</TooltipContent>
            </Tooltip>
          </div>
        </motion.div>
        
        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-600 text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

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
          onActivateLicense={() => setLicenseDialogOpen(true)}
          isPro={isPro}
          licenseInfo={licenseInfo}
        />
        
        {detailItem && <ItemDetail item={detailItem} onClose={() => { setDetailItem(null); setUnlockedItems(new Set()); }} onUpdate={refresh} t={t} enablePasswordProtection={enablePasswordProtection} />}
        
        <PasswordDialog
          isOpen={passwordDialogOpen}
          mode={passwordDialogMode}
          onConfirm={handlePasswordConfirm}
          onCancel={handlePasswordCancel}
          error={passwordDialogError}
          t={t}
        />

        {/* 置顶区域 */}
        <AnimatePresence>
          {pinnedItems.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 border-b"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Pin className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{t('pinned.title')}</span>
                </div>
                <div className="h-px flex-1 ml-3 bg-gradient-to-r from-border to-transparent" />
              </div>
              <motion.div 
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-4 gap-3"
              >
                {pinnedItems.map((item, idx) => {
                  const isProtected = enablePasswordProtection && item.protected && !unlockedItems.has(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      variants={fadeInUp}
                      ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                      onClick={() => {
                        if (enablePasswordProtection && item.protected) {
                          handleProtectedItemClick(item);
                        } else {
                          handleCopyWithFeedback(item);
                        }
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "group relative rounded-xl cursor-pointer overflow-hidden border transition-all duration-200",
                        selectedIndex === idx ? "ring-2 ring-primary ring-offset-2" : "hover:border-primary/50"
                      )}
                    >
                      <AnimatePresence>
                        {copiedId === item.id && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center rounded-xl bg-green-500"
                          >
                            <div className="flex flex-col items-center gap-1.5">
                              <Check className="w-7 h-7 text-white" />
                              <span className="text-xs font-medium text-white">{t('actions.copied')}</span>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      {item.item_type === "image" ? (
                        <div className="relative w-full h-full min-h-[80px]">
                          <img 
                            src={item.preview} 
                            alt="Image" 
                            className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-300" 
                          />
                        </div>
                      ) : item.item_type === "files" ? (
                        <div className="flex flex-col items-center justify-center w-full h-full p-3 min-h-[80px]">
                          <FolderOpen className="w-6 h-6 text-primary" />
                          <span className="text-xs mt-1 truncate px-1 text-center text-muted-foreground">
                            {item.preview}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-full h-full p-3 min-h-[80px] bg-primary/5">
                          <div className="flex flex-col items-center gap-1">
                            {isProtected && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                            <span className="text-xs font-medium truncate px-2.5 text-center leading-relaxed max-w-full">
                              {isProtected ? "****" : item.preview}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <Button 
                        variant="secondary"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => { e.stopPropagation(); togglePin(item.id); }}
                      >
                        <Pin className={cn("w-3 h-3", item.pinned && "text-primary")} />
                      </Button>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 标签过滤器 */}
        <TagFilter allTags={allTags} selectedTag={selectedTag} onSelectTag={setSelectedTag} t={t} />

        {/* 主内容区域 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clipboard className="w-3.5 h-3.5" />
              <span>{t('recent.title')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                        setSelectedIndex(pinnedItems.length);
                      }
                    }}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('keyboard.top')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTo({ 
                          top: scrollContainerRef.current.scrollHeight, 
                          behavior: 'smooth' 
                        });
                        setSelectedIndex(allFilteredItems.length - 1);
                      }
                    }}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('keyboard.bottom')}</TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground">
                {t('keyboard.navigate')} {t('keyboard.copy')} {t('keyboard.delete')}
              </span>
            </div>
          </div>
          
          {recentItems.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-16"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center">
                <Clipboard className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('recent.empty')}</p>
              <p className="text-xs mt-1 text-muted-foreground/60">{t('recent.emptyHint')}</p>
            </motion.div>
          ) : (
            <motion.div 
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="space-y-3"
            >
              {startIndex > 0 && <div style={{ height: startIndex * ITEM_HEIGHT }} />}
              
              {recentItems.slice(startIndex, endIndex).map((item, idx) => {
                const actualIdx = startIndex + idx;
                const globalIdx = pinnedItems.length + actualIdx;
                const isSelected = selectedIndex === globalIdx;
                const showDeleteConfirm = deleteConfirmId === item.id;
                const isProtected = enablePasswordProtection && item.protected && !unlockedItems.has(item.id);
                const showMaskedCopy = enableMaskedCopy && !isProtected && item.item_type === "text" && hasSensitiveInfo(item.content);
                
                return (
                  <motion.div
                    key={item.id}
                    variants={fadeInUp}
                    ref={(el) => { if (el) itemRefs.current.set(item.id, el); }}
                    onClick={() => {
                      if (enablePasswordProtection && item.protected) {
                        handleProtectedItemClick(item);
                      } else {
                        handleCopyWithFeedback(item);
                      }
                    }}
                    whileHover={{ scale: 1.005 }}
                    whileTap={{ scale: 0.995 }}
                  >
                    <Card className={cn(
                      "p-4 cursor-pointer transition-all duration-200",
                      isSelected && "ring-2 ring-primary ring-offset-2"
                    )}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {item.item_type === "image" ? (
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border">
                                <img src={item.preview} alt="Image" className="w-full h-full object-cover" />
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(item.created_at)}</span>
                              </div>
                            </div>
                          ) : item.item_type === "files" ? (
                            <div className="flex items-start gap-2">
                              <FolderOpen className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
                              <div>
                                <p className="text-sm line-clamp-2">{item.preview}</p>
                                <p className="text-xs mt-1 text-muted-foreground">{item.content.split('\n').length} 个文件</p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              {isProtected && <Lock className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />}
                              <p className="text-sm line-clamp-3">{getDisplayContent(item)}</p>
                            </div>
                          )}
                          {item.item_type !== "image" && (
                            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span>{formatTime(item.created_at)}</span>
                            </div>
                          )}
                          <div className="mt-3">
                            <TagManager itemId={item.id} currentTags={item.tags || []} onTagsChange={() => refresh()} t={t} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <AnimatePresence>
                            {copiedId === item.id && (
                              <motion.span 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-500/10 text-green-600"
                              >
                                <Check className="w-3 h-3" />
                                {t('actions.copied')}
                              </motion.span>
                            )}
                          </AnimatePresence>
                          
                          {item.item_type === "image" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleImagePreview(item); }}>
                                  <ImageIcon className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('image.preview')}</TooltipContent>
                            </Tooltip>
                          )}
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleCopyWithFeedback(item); }}>
                                <Clipboard className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('actions.copy')}</TooltipContent>
                          </Tooltip>
                          
                          {showMaskedCopy && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="bg-amber-500/10"
                                  onClick={(e) => { e.stopPropagation(); handleMaskedCopy(item); }}
                                >
                                  <Shield className="w-4 h-4 text-amber-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('detail.maskedCopy')}</TooltipContent>
                            </Tooltip>
                          )}
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}>
                                <Info className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('detail.title')}</TooltipContent>
                          </Tooltip>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className={cn(item.pinned && "bg-primary/10 text-primary")}
                                onClick={(e) => { e.stopPropagation(); togglePin(item.id); }}
                              >
                                <Pin className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('actions.pin')}</TooltipContent>
                          </Tooltip>
                          
                          {showDeleteConfirm ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleDeleteConfirm(item.id); }}>
                                {t('actions.confirm')}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}>
                                {t('actions.cancel')}
                              </Button>
                            </div>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('actions.delete')}</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
              
              {endIndex < recentItems.length && <div style={{ height: (recentItems.length - endIndex) * ITEM_HEIGHT }} />}
              
              {/* 加载更多指示器 */}
              {loadingMore && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center py-4"
                >
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>

        {/* 底部状态栏 */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="px-4 py-2 text-xs text-center border-t text-muted-foreground"
        >
          {t('status.total', { n: items.length })} | {t('status.showing', { n: filteredItems.length })}
        </motion.div>
        
        <LicenseDialog
          isOpen={licenseDialogOpen}
          onClose={() => setLicenseDialogOpen(false)}
          onActivated={() => {
            setIsPro(true);
            refresh();
          }}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;