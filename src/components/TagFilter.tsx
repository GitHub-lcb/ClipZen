import { motion } from "framer-motion";
import { Tag } from "lucide-react";
import { Button } from "./ui/button";

interface TagFilterProps {
  allTags: string[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  t: (key: string) => string;
}

export function TagFilter({ allTags, selectedTag, onSelectTag, t }: TagFilterProps) {
  if (allTags.length === 0) return null;
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-2 px-4 py-2.5 border-b overflow-x-auto whitespace-nowrap"
    >
      <Tag className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
      <Button
        variant={selectedTag === null ? "default" : "secondary"}
        size="sm"
        className="rounded-full flex-shrink-0"
        onClick={() => onSelectTag(null)}
      >
        {t('tags.all')}
      </Button>
      {allTags.map(tag => (
        <Button 
          key={tag} 
          variant={tag === selectedTag ? "default" : "secondary"}
          size="sm"
          className="rounded-full flex-shrink-0"
          onClick={() => onSelectTag(tag === selectedTag ? null : tag)}
        >
          <Tag className="w-3 h-3 mr-1" />
          {tag}
        </Button>
      ))}
    </motion.div>
  );
}