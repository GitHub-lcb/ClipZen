import { useState, useEffect } from "react";
import { Tag, X, Plus } from "lucide-react";

interface TagManagerProps {
  itemId: string;
  currentTags: string[];
  onTagsChange: (tags: string[]) => void;
  t: (key: string) => string;
}

export function TagManager({ itemId, currentTags, onTagsChange, t }: TagManagerProps) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    loadAllTags();
  }, []);

  const loadAllTags = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const tags = await invoke<string[]>("get_all_tags");
      setAllTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  };

  const addTag = async (tag: string) => {
    if (!tag.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("add_tag_to_item", { itemId, tag: tag.trim() });
      const newTags = [...currentTags, tag.trim()];
      onTagsChange(newTags);
      setNewTag("");
      setShowInput(false);
      loadAllTags();
    } catch (error) {
      console.error("Failed to add tag:", error);
    }
  };

  const removeTag = async (tag: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_tag_from_item", { itemId, tag });
      const newTags = currentTags.filter(t => t !== tag);
      onTagsChange(newTags);
    } catch (error) {
      console.error("Failed to remove tag:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addTag(newTag);
    else if (e.key === 'Escape') { setShowInput(false); setNewTag(""); }
  };

  const availableTags = allTags.filter(t => !currentTags.includes(t));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {currentTags.map(tag => (
        <span 
          key={tag} 
          className="tag flex items-center gap-1.5"
        >
          <Tag className="w-3 h-3" />
          {tag}
          <button 
            onClick={() => removeTag(tag)} 
            className="ml-0.5 hover:opacity-70 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {showInput ? (
        <div className="relative">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (!newTag.trim()) setShowInput(false); }}
            placeholder={t('tags.addTag')}
            className="input-field text-xs w-24 py-1"
            autoFocus
          />
        </div>
      ) : (
        <button 
          onClick={() => setShowInput(true)} 
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full transition-all duration-200 hover:opacity-80"
          style={{ 
            backgroundColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)'
          }}
        >
          <Plus className="w-3 h-3" />
          {t('tags.addTag')}
        </button>
      )}
      {availableTags.length > 0 && (
        <div className="w-full mt-2 flex flex-wrap gap-1.5">
          {availableTags.slice(0, 5).map(tag => (
            <button 
              key={tag} 
              onClick={() => addTag(tag)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-all duration-200 hover:scale-105"
              style={{ 
                backgroundColor: 'var(--color-border)',
                color: 'var(--color-text-secondary)'
              }}
            >
              <Plus className="w-3 h-3" />
              <Tag className="w-3 h-3" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
