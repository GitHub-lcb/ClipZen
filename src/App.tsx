import { useState, useMemo } from "react";
import { Clipboard, Search, Pin, Trash2, Image as ImageIcon, Settings as SettingsIcon, Tag, Database } from "lucide-react";
import { useClipboard, ClipboardItem } from "./hooks/useClipboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { TagManager } from "./components/TagManager";
import { DataManager } from "./components/DataManager";

function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const { items, loading, copyToClipboard, deleteItem, togglePin, refresh } = useClipboard();

  // 获取所有标签
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    items.forEach(item => {
      (item.tags || []).forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [items]);

  // 搜索和标签过滤
  const filteredItems = useMemo(() => {
    let result = items;
    
    // 标签过滤
    if (selectedTag) {
      result = result.filter(item => 
        (item.tags || []).includes(selectedTag)
      );
    }
    
    // 搜索过滤
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

  const handleItemClick = async (item: ClipboardItem) => {
    if (item.item_type === "image") {
      // 图片：复制到剪贴板
      if (item.file_path) {
        await copyToClipboard(item.content, "image", item.file_path);
      }
    } else {
      // 文本：复制到剪贴板
      await copyToClipboard(item.content);
    }
  };

  const handleImagePreview = (item: ClipboardItem) => {
    if (item.item_type === "image") {
      setPreviewImage(item.content);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-900">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      {/* 图片预览弹窗 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <img src={previewImage} alt="预览" className="max-w-full max-h-[85vh] object-contain rounded" />
            <button 
              className="absolute top-2 right-2 text-white hover:text-gray-300 text-2xl"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* 搜索栏 + 按钮组 */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700">
        <Search className="w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="搜索剪贴板历史..."
          className="flex-1 bg-transparent outline-none text-gray-700 dark:text-gray-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => setDataManagerOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="数据管理"
          >
            <Database className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            title="设置"
          >
            <SettingsIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      
      {/* 数据管理 */}
      <DataManager 
        isOpen={dataManagerOpen} 
        onClose={() => setDataManagerOpen(false)} 
        onRefresh={refresh} 
      />

      {/* 置顶区域 */}
      {pinnedItems.length > 0 && (
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
            <Pin className="w-3 h-3" />
            <span>常用片段</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {pinnedItems.map(item => (
              <div
                key={item.id}
                onClick={() => item.item_type === "image" ? handleImagePreview(item) : handleItemClick(item)}
                className="aspect-square bg-blue-50 dark:bg-blue-900/20 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 flex items-center justify-center relative group"
              >
                {item.item_type === "image" ? (
                  <img src={item.preview} alt="图片" className="w-full h-full object-cover rounded" />
                ) : (
                  <span className="text-xs text-gray-700 dark:text-gray-200 truncate px-2 text-center">{item.preview}</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePin(item.id); }}
                  className="absolute top-1 right-1 p-1 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100"
                >
                  <Pin className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 标签过滤栏 */}
      <TagFilter 
        allTags={allTags} 
        selectedTag={selectedTag} 
        onSelectTag={setSelectedTag} 
      />

      {/* 历史记录列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
          <Clipboard className="w-3 h-3" />
          <span>最近记录</span>
        </div>
        {recentItems.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            暂无记录，复制点内容试试
          </div>
        ) : (
          <div className="space-y-2">
            {recentItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                onPreview={handleImagePreview}
                onCopy={() => handleItemClick(item)}
                onPin={() => togglePin(item.id)}
                onDelete={() => deleteItem(item.id)}
                onTagsUpdated={refresh}
              />
            ))}
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      <div className="p-2 text-xs text-gray-400 border-t border-gray-200 dark:border-gray-700 text-center">
        共 {items.length} 条记录 | 已显示 {filteredItems.length} 条
      </div>
    </div>
  );
}

// 标签过滤组件
function TagFilter({ 
  allTags, 
  selectedTag, 
  onSelectTag 
}: { 
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
      
      {/* 全部标签 */}
      <button
        onClick={() => onSelectTag(null)}
        className={`px-2 py-1 text-xs rounded whitespace-nowrap ${
          selectedTag === null
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        全部
      </button>
      
      {/* 标签列表 */}
      {allTags.map(tag => (
        <button
          key={tag}
          onClick={() => onSelectTag(tag === selectedTag ? null : tag)}
          className={`px-2 py-1 text-xs rounded whitespace-nowrap flex items-center gap-1 ${
            tag === selectedTag
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <Tag className="w-3 h-3" />
          {tag}
        </button>
      ))}
    </div>
  );
}

// 项目卡片组件
function ItemCard({ 
  item, 
  onPreview, 
  onCopy, 
  onPin, 
  onDelete,
  onTagsUpdated
}: { 
  item: ClipboardItem;
  onPreview: (item: ClipboardItem) => void;
  onCopy: () => void;
  onPin: () => void;
  onDelete: () => void;
  onTagsUpdated: () => void;
}) {
  const [tags, setTags] = useState<string[]>(item.tags || []);

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags);
    onTagsUpdated();
  };

  return (
    <div
      className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-md transition-all"
      onClick={() => item.item_type === "image" ? onPreview(item) : onCopy()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {item.item_type === "image" ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <ImageIcon className="w-4 h-4" />
              <span>图片</span>
            </div>
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-200 line-clamp-3">{item.content}</p>
          )}
          
          {/* 标签区域 - 始终显示 */}
          <div className="mt-2">
            <TagManager 
              itemId={item.id} 
              currentTags={tags} 
              onTagsChange={handleTagsChange} 
            />
          </div>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className={`p-1.5 rounded-full transition-colors ${
              item.pinned 
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500' 
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-blue-500'
            }`}
            title="置顶"
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-full transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
