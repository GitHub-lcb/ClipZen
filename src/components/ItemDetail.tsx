import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, Edit2, Eye, EyeOff, Check, RotateCcw, 
  Lock, Unlock, Copy, Shield, Info, Calendar 
} from "lucide-react";
import { TagManager } from "./TagManager";
import { PasswordDialog } from "./PasswordDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ItemDetailProps {
  item: {
    id: string;
    item_type: string;
    content: string;
    preview: string;
    pinned: boolean;
    protected?: boolean;
    created_at: number;
    tags?: string[];
    file_path?: string;
  };
  onClose: () => void;
  onUpdate: () => void;
  t: (key: string) => string;
  enablePasswordProtection?: boolean;
}

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

export function ItemDetail({ 
  item, onClose, onUpdate, t, 
  enablePasswordProtection = false
}: ItemDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [isMasked, setIsMasked] = useState(false);
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>(item.tags || []);
  const [isProtected, setIsProtected] = useState(item.protected || false);
  const [showProtectedContent, setShowProtectedContent] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordDialogMode, setPasswordDialogMode] = useState<"set" | "verify">("set");
  const [passwordDialogError, setPasswordDialogError] = useState("");
  const [pendingAction, setPendingAction] = useState<"toggle" | "show" | null>(null);
  const [hasGlobalPwd, setHasGlobalPwd] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);

  useEffect(() => {
    if (item.item_type === "image" && item.file_path) {
      const loadImage = async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const data = await invoke<string>("get_image_data", { filePath: item.file_path });
          setImageData(data);
        } catch (error) {
          console.error("Failed to load image:", error);
          setImageData(item.content);
        }
      };
      loadImage();
    }
  }, [item.id, item.file_path, item.item_type]);

  useEffect(() => {
    if (item.item_type === "text") {
      const matches = detectSensitive(item.content);
      setSensitiveMatches(matches);
    }
    setIsProtected(item.protected || false);
    setShowProtectedContent(false);
  }, [item.content, item.item_type, item.protected]);

  useEffect(() => {
    const checkGlobalPassword = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<boolean>("has_global_password");
      setHasGlobalPwd(result);
    };
    checkGlobalPassword();
  }, []);

  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  const displayContent = isMasked
    ? sensitiveMatches.reduce(
        (text, match) => text.replace(match.original, match.masked),
        item.content
      )
    : item.content;

  const getMaskedContentForCopy = () => {
    return sensitiveMatches.reduce(
      (text, match) => text.replace(match.original, match.masked),
      item.content
    );
  };

  const handleCopyMasked = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const maskedContent = getMaskedContentForCopy();
    await invoke("copy_masked_content", { content: maskedContent });
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  const handleCopyOriginal = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("copy_to_clipboard", { content: item.content });
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 1500);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("update_content", { id: item.id, newContent: editContent });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(item.content);
    setIsEditing(false);
  };

  const handleToggleProtected = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toggle_protected", { id: item.id });
    setIsProtected(!isProtected);
    onUpdate();
  };

  const handlePasswordConfirm = async (password: string) => {
    const { invoke } = await import("@tauri-apps/api/core");
    const isValid = await invoke<boolean>("verify_password", { password });
    
    if (isValid) {
      setPasswordDialogOpen(false);
      setPasswordDialogError("");
      
      if (pendingAction === "toggle") {
        await handleToggleProtected();
      } else if (pendingAction === "show") {
        setShowProtectedContent(true);
      }
      setPendingAction(null);
    } else {
      setPasswordDialogError(t('password.incorrect'));
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 p-2"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col bg-card shadow-lg"
        >
          {/* Header */}
          <div className="glass flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Info className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-base font-semibold">{t('detail.title')}</h2>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Time Info */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{formatTime(item.created_at)}</span>
            </motion.div>

            {/* Image Preview */}
            {item.item_type === "image" && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="overflow-hidden">
                  <img 
                    src={imageData || item.content} 
                    alt="Preview" 
                    className="w-full max-h-64 object-contain"
                  />
                </Card>
              </motion.div>
            )}

            {/* Content */}
            {item.item_type !== "image" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">{t('detail.content')}</h3>
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      {sensitiveMatches.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setIsMasked(!isMasked)}
                        >
                          {isMasked ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                          {isMasked ? t('detail.showOriginal') : t('detail.maskSensitive')}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        {t('detail.edit')}
                      </Button>
                    </div>
                  )}
                </div>
                
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-32 rounded-lg border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                        {t('actions.cancel')}
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                        {saving ? <RotateCcw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                        {t('detail.save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Card className="p-3">
                    <p className="text-sm whitespace-pre-wrap break-all">
                      {isProtected && !showProtectedContent ? "****" : displayContent}
                    </p>
                  </Card>
                )}
              </motion.div>
            )}

            {/* Sensitive Info Warning */}
            {sensitiveMatches.length > 0 && !isEditing && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-amber-600">{t('detail.sensitiveDetected')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {sensitiveMatches.map((match, idx) => (
                    <span 
                      key={idx}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-600"
                    >
                      {match.label}
                    </span>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Copy Options */}
            {!isEditing && item.item_type === "text" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h3 className="text-sm font-medium mb-2">{t('detail.copyOptions')}</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={handleCopyOriginal}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    {t('detail.copyOriginal')}
                  </Button>
                  {sensitiveMatches.length > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={handleCopyMasked}
                    >
                      <Shield className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                      {t('detail.maskedCopy')}
                    </Button>
                  )}
                </div>
                <AnimatePresence>
                  {copySuccess && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs text-green-600 mt-2"
                    >
                      <Check className="w-3 h-3 inline mr-1" />
                      {t('detail.copied')}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Password Protection */}
            {enablePasswordProtection && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <h3 className="text-sm font-medium mb-2">{t('detail.passwordProtection')}</h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant={isProtected ? "default" : "outline"}
                    size="sm"
                    onClick={async () => {
                      if (isProtected) {
                        await handleToggleProtected();
                      } else if (hasGlobalPwd) {
                        await handleToggleProtected();
                      } else {
                        setPasswordDialogMode("set");
                        setPasswordDialogOpen(true);
                      }
                    }}
                  >
                    {isProtected ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Unlock className="w-3.5 h-3.5 mr-1.5" />}
                    {isProtected ? t('detail.removeProtection') : t('detail.passwordProtection')}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Tags */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="text-sm font-medium mb-2">{t('detail.tags')}</h3>
              <TagManager 
                itemId={item.id} 
                currentTags={tags} 
                onTagsChange={(newTags) => {
                  setTags(newTags);
                  onUpdate();
                }} 
                t={t} 
              />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      <PasswordDialog
        isOpen={passwordDialogOpen}
        mode={passwordDialogMode}
        onConfirm={handlePasswordConfirm}
        onCancel={() => {
          setPasswordDialogOpen(false);
          setPendingAction(null);
          setPasswordDialogError("");
        }}
        error={passwordDialogError}
        t={t}
      />
    </AnimatePresence>
  );
}