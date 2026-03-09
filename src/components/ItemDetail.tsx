import { useState, useEffect } from "react";
import { X, Edit2, Eye, EyeOff, Tag, Check, RotateCcw } from "lucide-react";
import { TagManager } from "./TagManager";

interface ItemDetailProps {
  item: {
    id: string;
    item_type: string;
    content: string;
    preview: string;
    pinned: boolean;
    created_at: number;
    tags?: string[];
    file_path?: string;
  };
  onClose: () => void;
  onUpdate: () => void;
  t: (key: string) => string;
}

// 敏感信息检测正则
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

export function ItemDetail({ item, onClose, onUpdate, t }: ItemDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [isMasked, setIsMasked] = useState(false);
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>(item.tags || []);

  useEffect(() => {
    // 检测敏感信息
    if (item.item_type === "text") {
      const matches = detectSensitive(item.content);
      setSensitiveMatches(matches);
    }
  }, [item.content, item.item_type]);

  const displayContent = isMasked
    ? sensitiveMatches.reduce(
        (text, match) => text.replace(match.original, match.masked),
        item.content
      )
    : item.content;

  const handleSave = async () => {
    if (editContent === item.content) {
      setIsEditing(false);
      return;
    }
    
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_item_content", { itemId: item.id, content: editContent });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to update content:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(item.content);
    setIsEditing(false);
  };

  const handleTagsChange = (newTags: string[]) => {
    setTags(newTags);
    onUpdate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {t('detail.title')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 敏感信息提示 */}
          {sensitiveMatches.length > 0 && !isEditing && (
            <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  {t('detail.sensitiveDetected')}: {sensitiveMatches.map(m => m.label).join("、")}
                </span>
              </div>
              <button
                onClick={() => setIsMasked(!isMasked)}
                className="flex items-center gap-1 px-3 py-1 text-sm bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/60 transition-colors"
              >
                {isMasked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {isMasked ? t('detail.showOriginal') : t('detail.maskSensitive')}
              </button>
            </div>
          )}

          {/* 内容区域 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('detail.content')}
              </label>
              {!isEditing && item.item_type === "text" && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  {t('detail.edit')}
                </button>
              )}
            </div>
            
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('actions.cancel')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    {saving ? t('detail.saving') : t('detail.save')}
                  </button>
                </div>
              </div>
            ) : item.item_type === "image" ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <img 
                  src={item.content} 
                  alt="Clipboard image" 
                  className="max-w-full max-h-64 mx-auto"
                />
              </div>
            ) : (
              <div className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                <pre className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-all font-mono">
                  {displayContent}
                </pre>
              </div>
            )}
          </div>

          {/* 标签区域 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('detail.tags')}
              </label>
            </div>
            <TagManager
              itemId={item.id}
              currentTags={tags}
              onTagsChange={handleTagsChange}
              t={t}
            />
          </div>

          {/* 元信息 */}
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div>ID: {item.id}</div>
            <div>创建时间: {new Date(item.created_at).toLocaleString()}</div>
            {item.file_path && <div>文件路径: {item.file_path}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}