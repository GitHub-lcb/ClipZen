import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <AnimatePresence>
        {currentTags.map(tag => (
          <motion.span 
            key={tag}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary"
          >
            <Tag className="w-3 h-3" />
            {tag}
            <button 
              onClick={() => removeTag(tag)} 
              className="ml-0.5 hover:opacity-70 transition-opacity rounded-full hover:bg-primary/20 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      
      <AnimatePresence mode="wait">
        {showInput ? (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
          >
            <Input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => { if (!newTag.trim()) setShowInput(false); }}
              placeholder={t('tags.addTag')}
              className="h-7 text-xs w-24"
              autoFocus
            />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowInput(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('tags.addTag')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      
      {availableTags.length > 0 && (
        <div className="w-full mt-2 flex flex-wrap gap-1.5">
          {availableTags.slice(0, 5).map(tag => (
            <motion.button 
              key={tag}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => addTag(tag)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Plus className="w-3 h-3" />
              <Tag className="w-3 h-3" />
              {tag}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}