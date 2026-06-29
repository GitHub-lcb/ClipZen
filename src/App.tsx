import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useDeferredValue,
} from "react";
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
import { hasSensitiveInfo, maskSensitiveContent } from "@/lib/sensitive";
import { cn } from "@/lib/utils";

const EMPTY_TAGS: readonly string[] = [];
const EMPTY_ITEM_IDS: ReadonlySet<string> = new Set();

type ProtectedItemAction = "copy" | "detail" | "preview";

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  return (
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
    null
  );
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

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
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
  const [pendingProtectedAction, setPendingProtectedAction] = useState<ProtectedItemAction | null>(null);
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
  const [searchedQuery, setSearchedQuery] = useState("");
  const [globalTags, setGlobalTags] = useState<string[]>([]);
  const {
    items,
    loading,
    error,
    loadingMore,
    totalItems,
    hasMore,
    loadMore,
    copyToClipboard,
    deleteItem,
    togglePin,
    refresh,
    verifyPassword,
  } = useClipboard();
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const activeSearchQuery = searchQuery.trim() ? deferredSearchQuery : searchQuery;
  const isSearching = searchQuery.trim().length > 0;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const searchRequestRef = useRef(0);
  const copiedTimeoutRef = useRef<number | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(50);
  const ITEM_HEIGHT = 120;
  const MAX_VISIBLE_ITEMS = 50;

  const setItemRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      itemRefs.current.set(id, element);
    } else {
      itemRefs.current.delete(id);
    }
  }, []);

  const refreshGlobalTags = useCallback(async () => {
    try {
      const tags = await invoke<string[]>("get_all_tags");
      setGlobalTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  }, []);

  useEffect(() => {
    const loadFeatureSettings = async () => {
      try {
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
        const info = await invoke<LicenseInfo | null>("get_license_info");
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
    void refreshGlobalTags();
  }, [refreshGlobalTags]);

  const allTags = useMemo(() => {
    const tags = new Set(globalTags);
    items.forEach(item => {
      (item.tags ?? EMPTY_TAGS).forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [globalTags, items]);

  // 搜索处理
  const handleSearch = useCallback(async (query: string) => {
    const requestId = ++searchRequestRef.current;
    try {
      const results = await invoke<ClipboardItem[]>("search_clipboard_history", {
        query
      });
      if (requestId === searchRequestRef.current) {
        setSearchedItems(results);
        setSearchedQuery(query);
      }
    } catch (error) {
      console.error("Failed to search:", error);
      if (requestId === searchRequestRef.current) {
        setSearchedItems([]);
        setSearchedQuery(query);
      }
    }
  }, []);

  const handleDataRefresh = useCallback(() => {
    const query = searchQuery.trim();
    void refresh();
    void refreshGlobalTags();

    if (query) {
      void handleSearch(query);
    } else {
      searchRequestRef.current += 1;
      setSearchedItems([]);
      setSearchedQuery("");
    }
  }, [handleSearch, refresh, refreshGlobalTags, searchQuery]);

  // 监听搜索查询变化
  useEffect(() => {
    const query = searchQuery.trim();

    if (!query) {
      searchRequestRef.current += 1;
      setSearchedItems([]);
      setSearchedQuery("");
      return;
    }

    const searchTimer = window.setTimeout(() => {
      handleSearch(query);
    }, 200);

    return () => window.clearTimeout(searchTimer);
  }, [searchQuery, handleSearch]);

  const filteredItems = useMemo(() => {
    const normalizedSearchQuery = activeSearchQuery.trim();
    let result = items;

    if (normalizedSearchQuery) {
      result = searchedQuery === normalizedSearchQuery ? searchedItems : [];
    }

    if (selectedTag) {
      result = result.filter(item => (item.tags ?? EMPTY_TAGS).includes(selectedTag));
    }
    
    const sorted = [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      
      const multiplier = sortOrder === "asc" ? 1 : -1;
      
      switch (sortBy) {
        case "time":
          return (a.created_at - b.created_at) * multiplier;
        case "type": {
          const typeOrder = { image: 0, text: 1, files: 2 };
          const typeDiff = (typeOrder[a.item_type as keyof typeof typeOrder] ?? 1) - 
                          (typeOrder[b.item_type as keyof typeof typeOrder] ?? 1);
          return typeDiff !== 0 ? typeDiff * multiplier : (a.created_at - b.created_at) * -1;
        }
        case "content": {
          const aContent = a.item_type === "image" ? "" : (a.preview || a.content).toLowerCase();
          const bContent = b.item_type === "image" ? "" : (b.preview || b.content).toLowerCase();
          return aContent.localeCompare(bContent, locale) * multiplier;
        }
        case "popularity": {
          const aLastCopy = a.updated_at || a.created_at;
          const bLastCopy = b.updated_at || b.created_at;
          const copyTimeDiff = (aLastCopy - bLastCopy) * multiplier;
          if (copyTimeDiff !== 0) return copyTimeDiff;
          const aCount = a.copy_count || 0;
          const bCount = b.copy_count || 0;
          const countDiff = aCount - bCount;
          return countDiff !== 0 ? countDiff * multiplier : (a.created_at - b.created_at) * -1;
        }
        default:
          return (a.created_at - b.created_at) * -1;
      }
    });
    
    return sorted;
  }, [items, searchedItems, searchedQuery, selectedTag, activeSearchQuery, sortBy, sortOrder, locale]);

  const { pinnedItems, recentItems } = useMemo(() => {
    const pinned: ClipboardItem[] = [];
    const recent: ClipboardItem[] = [];

    for (const item of filteredItems) {
      if (item.pinned) {
        pinned.push(item);
      } else {
        recent.push(item);
      }
    }

    return { pinnedItems: pinned, recentItems: recent };
  }, [filteredItems]);
  const visibleRecentItems = useMemo(
    () => recentItems.slice(startIndex, endIndex),
    [recentItems, startIndex, endIndex]
  );
  const maskedCopyItemIds = useMemo(() => {
    if (!enableMaskedCopy) return EMPTY_ITEM_IDS;

    const ids = new Set<string>();
    for (const item of visibleRecentItems) {
      if (item.item_type === "text" && hasSensitiveInfo(item.content)) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [enableMaskedCopy, visibleRecentItems]);
  const allFilteredItems = filteredItems;
  const statusTotalItems = isSearching ? filteredItems.length : totalItems;

  const scrollToSelectedItem = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= allFilteredItems.length) return;
    const item = allFilteredItems[selectedIndex];
    if (!item) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const element = itemRefs.current.get(item.id);
    if (!element) {
      const recentIndex = selectedIndex - pinnedItems.length;
      if (recentIndex < 0) return;

      const targetTop = recentIndex * ITEM_HEIGHT;
      const targetBottom = targetTop + ITEM_HEIGHT;
      const viewportTop = container.scrollTop;
      const viewportBottom = viewportTop + container.clientHeight;

      if (targetTop < viewportTop) {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else if (targetBottom > viewportBottom) {
        container.scrollTo({
          top: Math.max(0, targetBottom - container.clientHeight),
          behavior: 'smooth',
        });
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (elementRect.top < containerRect.top) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (elementRect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [selectedIndex, allFilteredItems, pinnedItems.length]);

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
    if (!isSearching && scrollTop + containerHeight >= scrollHeight - 200 && hasMore) {
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
  }, [recentItems.length, hasMore, loadMore, isSearching]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    setStartIndex(0);
    setEndIndex(Math.min(recentItems.length, MAX_VISIBLE_ITEMS));
  }, [recentItems.length, activeSearchQuery, selectedTag, sortBy, sortOrder]);

  const showCopiedFeedback = useCallback((id: string) => {
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }

    setCopiedId(id);
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopiedId(null);
      copiedTimeoutRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyWithFeedback = useCallback(async (item: ClipboardItem) => {
    await copyToClipboard(item);
    showCopiedFeedback(item.id);
  }, [copyToClipboard, showCopiedFeedback]);

  const allFilteredItemsRef = useLatestRef(allFilteredItems);
  const selectedIndexRef = useLatestRef(selectedIndex);
  const pinnedItemsLengthRef = useLatestRef(pinnedItems.length);
  const handleCopyWithFeedbackRef = useLatestRef(handleCopyWithFeedback);
  const enablePasswordProtectionRef = useLatestRef(enablePasswordProtection);
  const unlockedItemsRef = useLatestRef(unlockedItems);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (isEditableShortcutTarget(e.target)) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const itemCount = allFilteredItemsRef.current.length;
        setSelectedIndex(prev => (itemCount === 0 ? -1 : Math.min(prev + 1, itemCount - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const itemCount = allFilteredItemsRef.current.length;
        setSelectedIndex(prev => (itemCount === 0 ? -1 : Math.max(prev - 1, 0)));
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        const itemCount = allFilteredItemsRef.current.length;
        setSelectedIndex(
          itemCount === 0 ? -1 : Math.min(pinnedItemsLengthRef.current, itemCount - 1)
        );
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        setSelectedIndex(allFilteredItemsRef.current.length - 1);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ 
            top: scrollContainerRef.current.scrollHeight, 
            behavior: 'smooth' 
          });
        }
        return;
      }
      if (e.key === 'Enter' && selectedIndexRef.current >= 0) {
        e.preventDefault();
        const item = allFilteredItemsRef.current[selectedIndexRef.current];
        if (item) {
          const isLockedProtectedItem =
            enablePasswordProtectionRef.current &&
            item.protected &&
            !unlockedItemsRef.current.has(item.id);

          if (isLockedProtectedItem) {
            setPendingProtectedItem(item);
            setPendingProtectedAction("copy");
            setPasswordDialogMode("verify");
            setPasswordDialogError(undefined);
            setPasswordDialogOpen(true);
          } else {
            handleCopyWithFeedbackRef.current(item);
          }
        }
        return;
      }
      if (e.key === 'Delete' && selectedIndexRef.current >= 0) {
        e.preventDefault();
        const item = allFilteredItemsRef.current[selectedIndexRef.current];
        if (item) setDeleteConfirmId(item.id);
        return;
      }
      if (e.key === 'Escape') {
        const hasTransientUi =
          deleteConfirmId !== null ||
          previewImage !== null ||
          detailItem !== null ||
          settingsOpen ||
          passwordDialogOpen ||
          licenseDialogOpen;

        setDeleteConfirmId(null);
        setPreviewImage(null);
        setSelectedIndex(-1);
        if (detailItem !== null) {
          setDetailItem(null);
          setUnlockedItems(new Set());
        }
        if (settingsOpen) {
          setSettingsOpen(false);
        }
        if (passwordDialogOpen) {
          setPasswordDialogOpen(false);
          setPendingProtectedItem(null);
          setPendingProtectedAction(null);
          setPasswordDialogError(undefined);
        }
        if (licenseDialogOpen) {
          setLicenseDialogOpen(false);
        }
        if (hasTransientUi) {
          return;
        }

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
  }, [
    allFilteredItemsRef,
    deleteConfirmId,
    detailItem,
    enablePasswordProtectionRef,
    handleCopyWithFeedbackRef,
    licenseDialogOpen,
    passwordDialogOpen,
    pinnedItemsLengthRef,
    previewImage,
    selectedIndexRef,
    settingsOpen,
    unlockedItemsRef,
  ]);

  const handleDeleteConfirm = async (id: string) => {
    const deleted = await deleteItem(id);
    if (!deleted) return;

    setSearchedItems(prev => prev.filter(item => item.id !== id));
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

  const runUnlockedItemAction = (item: ClipboardItem, action: ProtectedItemAction) => {
    if (action === "copy") {
      void handleCopyWithFeedback(item);
    } else if (action === "detail") {
      setDetailItem(item);
    } else if (action === "preview") {
      void handleImagePreview(item);
    }
  };

  const handleProtectedItemAction = (item: ClipboardItem, action: ProtectedItemAction) => {
    if (enablePasswordProtection && item.protected && !unlockedItems.has(item.id)) {
      setPendingProtectedItem(item);
      setPendingProtectedAction(action);
      setPasswordDialogMode("verify");
      setPasswordDialogError(undefined);
      setPasswordDialogOpen(true);
    } else {
      runUnlockedItemAction(item, action);
    }
  };

  const handlePasswordConfirm = async (password: string) => {
    const isValid = await verifyPassword(password);
    if (isValid) {
      setPasswordDialogOpen(false);
      if (pendingProtectedItem) {
        setUnlockedItems(prev => new Set(prev).add(pendingProtectedItem.id));
        if (pendingProtectedAction) {
          runUnlockedItemAction(pendingProtectedItem, pendingProtectedAction);
        }
        setPendingProtectedItem(null);
        setPendingProtectedAction(null);
      }
    } else {
      setPasswordDialogError(t('password.incorrect'));
    }
  };

  const handlePasswordCancel = () => {
    setPasswordDialogOpen(false);
    setPendingProtectedItem(null);
    setPendingProtectedAction(null);
    setPasswordDialogError(undefined);
  };

  const handleMaskedCopy = async (item: ClipboardItem) => {
    const maskedContent = maskSensitiveContent(item.content);
    await invoke("copy_to_clipboard", { content: maskedContent });
    showCopiedFeedback(item.id);
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
          {t('common.loading')}
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
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={previewImage}
                  alt={t('image.preview')}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                />
                <Button 
                  variant="secondary"
                  size="icon"
                  className="absolute top-6 right-6"
                  onClick={() => setPreviewImage(null)}
                  aria-label={t('actions.cancel')}
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
                  aria-label={t('sort.title')}
                  aria-expanded={showSortMenu}
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  aria-label={t('settings.title')}
                >
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
              {t(error)}
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
          onRefresh={handleDataRefresh}
          onActivateLicense={() => setLicenseDialogOpen(true)}
          isPro={isPro}
          licenseInfo={licenseInfo}
        />
        
        {detailItem && (
          <ItemDetail
            item={detailItem}
            onClose={() => {
              setDetailItem(null);
              setUnlockedItems(new Set());
            }}
            onUpdate={handleDataRefresh}
            t={t}
            locale={locale}
            enablePasswordProtection={enablePasswordProtection}
            initialUnlocked={unlockedItems.has(detailItem.id)}
            allTags={allTags}
          />
        )}
        
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
                      ref={(el) => setItemRef(item.id, el)}
                      onClick={() => {
                        if (enablePasswordProtection && item.protected) {
                          handleProtectedItemAction(item, "copy");
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
                          {isProtected ? (
                            <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-1 bg-primary/5 p-3">
                              <Lock className="w-4 h-4 text-amber-500" />
                              <span className="text-xs font-medium text-muted-foreground">****</span>
                            </div>
                          ) : (
                            <img
                              src={item.preview}
                              alt={t('image.label')}
                              className="w-full h-full object-cover rounded-xl group-hover:scale-105 transition-transform duration-300"
                            />
                          )}
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
                        aria-label={t(item.pinned ? 'actions.unpin' : 'actions.pin')}
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
                    aria-label={t('keyboard.top')}
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
                    aria-label={t('keyboard.bottom')}
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
              
              {visibleRecentItems.map((item, idx) => {
                const actualIdx = startIndex + idx;
                const globalIdx = pinnedItems.length + actualIdx;
                const isSelected = selectedIndex === globalIdx;
                const showDeleteConfirm = deleteConfirmId === item.id;
                const isProtected = enablePasswordProtection && item.protected && !unlockedItems.has(item.id);
                const showMaskedCopy = !isProtected && maskedCopyItemIds.has(item.id);
                
                return (
                  <motion.div
                    key={item.id}
                    variants={fadeInUp}
                    ref={(el) => setItemRef(item.id, el)}
                    onClick={() => {
                      if (enablePasswordProtection && item.protected) {
                        handleProtectedItemAction(item, "copy");
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
                                {isProtected ? (
                                  <div className="flex h-full w-full items-center justify-center bg-primary/5">
                                    <Lock className="w-5 h-5 text-amber-500" />
                                  </div>
                                ) : (
                                  <img
                                    src={item.preview}
                                    alt={t('image.label')}
                                    className="w-full h-full object-cover"
                                  />
                                )}
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
                                <p className="text-xs mt-1 text-muted-foreground">
                                  {t('files.count', { n: item.content.split('\n').length })}
                                </p>
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
                            <TagManager
                              itemId={item.id}
                              currentTags={item.tags ?? EMPTY_TAGS}
                              onTagsChange={handleDataRefresh}
                              t={t}
                              allTags={allTags}
                            />
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleProtectedItemAction(item, "preview");
                                  }}
                                  aria-label={t('image.preview')}
                                >
                                  <ImageIcon className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('image.preview')}</TooltipContent>
                            </Tooltip>
                          )}
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProtectedItemAction(item, "copy");
                                }}
                                aria-label={t('actions.copy')}
                              >
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
                                  aria-label={t('detail.maskedCopy')}
                                >
                                  <Shield className="w-4 h-4 text-amber-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('detail.maskedCopy')}</TooltipContent>
                            </Tooltip>
                          )}
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProtectedItemAction(item, "detail");
                                }}
                                aria-label={t('detail.title')}
                              >
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
                                aria-label={t(item.pinned ? 'actions.unpin' : 'actions.pin')}
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(item.id); }}
                                  aria-label={t('actions.delete')}
                                >
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
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t('common.loading')}
                  </span>
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
          {t('status.total', { n: statusTotalItems })} |{' '}
          {t('status.showing', { n: filteredItems.length })}
        </motion.div>
        
        <LicenseDialog
          isOpen={licenseDialogOpen}
          onClose={() => setLicenseDialogOpen(false)}
          onActivated={(activatedLicenseInfo) => {
            setIsPro(true);
            if (activatedLicenseInfo) {
              setLicenseInfo(activatedLicenseInfo);
            }
            refresh();
          }}
          t={t}
        />
      </div>
    </TooltipProvider>
  );
}

export default App;
