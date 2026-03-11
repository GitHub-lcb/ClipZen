import { useState, useEffect } from "react";
import { X, Edit2, Eye, EyeOff, Tag, Check, RotateCcw, Lock, Unlock, Copy, Shield, Info, Calendar } from "lucide-react";
import { TagManager } from "./TagManager";
import { PasswordDialog } from "./PasswordDialog";

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
  enableMaskedCopy?: boolean;
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

export function ItemDetail({ item, onClose, onUpdate, t, enablePasswordProtection = false, enableMaskedCopy = false }: ItemDetailProps) {
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
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleToggleProtected = async () => {
    if (!hasGlobalPwd) {
      setPasswordDialogMode("set");
      setPasswordDialogOpen(true);
      setPendingAction("toggle");
      return;
    }
    if (isProtected) {
      setPasswordDialogMode("verify");
      setPasswordDialogOpen(true);
      setPendingAction("toggle");
    } else {
      await executeToggleProtected();
    }
  };

  const executeToggleProtected = async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("toggle_protected", { id: item.id });
    setIsProtected(!isProtected);
    setShowProtectedContent(false);
    onUpdate();
  };

  const handleShowProtectedContent = () => {
    if (!showProtectedContent) {
      setPasswordDialogMode("verify");
      setPasswordDialogOpen(true);
      setPendingAction("show");
    } else {
      setShowProtectedContent(false);
    }
  };

  const handlePasswordConfirm = async (password: string) => {
    const { invoke } = await import("@tauri-apps/api/core");
    
    if (passwordDialogMode === "set") {
      await invoke("set_global_password", { password });
      setHasGlobalPwd(true);
      setPasswordDialogOpen(false);
      setPasswordDialogError("");
      if (pendingAction === "toggle") {
        await executeToggleProtected();
      }
      setPendingAction(null);
    } else {
      const isValid = await invoke<boolean>("verify_password", { password });
      if (isValid) {
        setPasswordDialogOpen(false);
        setPasswordDialogError("");
        if (pendingAction === "toggle") {
          await executeToggleProtected();
        } else if (pendingAction === "show") {
          setShowProtectedContent(true);
        }
        setPendingAction(null);
      } else {
        setPasswordDialogError(t("password.errorIncorrect"));
      }
    }
  };

  const handlePasswordCancel = () => {
    setPasswordDialogOpen(false);
    setPasswordDialogError("");
    setPendingAction(null);
  };

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
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div 
        className="rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col animate-scale-in"
        style={{ 
          backgroundColor: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="flex items-center justify-between px-6 py-4 border-b transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: 'var(--color-primary-light)' }}
            >
              <Info className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h3 
              className="text-lg font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {t('detail.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {enablePasswordProtection && (
            <div 
              className="flex items-center justify-between p-4 rounded-xl border transition-colors duration-200"
              style={{ 
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div className="flex items-center gap-3">
                {isProtected ? (
                  <Lock className="w-5 h-5" style={{ color: 'var(--color-error)' }} />
                ) : (
                  <Unlock className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
                )}
                <div>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                    {t('detail.passwordProtection')}
                  </span>
                  {isProtected && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      内容已加密保护
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={handleToggleProtected}
                className={`
                  relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200
                  ${isProtected 
                    ? 'bg-red-500' 
                    : 'bg-gray-200 dark:bg-gray-600'
                  }
                `}
                style={!isProtected ? { backgroundColor: 'var(--color-border)' } : undefined}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200
                    ${isProtected ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>
          )}

          {enableMaskedCopy && sensitiveMatches.length > 0 && !isEditing && (
            <div 
              className="p-4 rounded-xl border animate-slide-up"
              style={{ 
                backgroundColor: 'var(--color-warning-light)',
                borderColor: 'transparent'
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4" style={{ color: 'var(--color-warning)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--color-warning)' }}>
                  {t('detail.sensitiveDetected')}: {sensitiveMatches.map(m => m.label).join("、")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
                  {t('detail.copyOptions')}:
                </span>
                <button
                  onClick={async () => {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("copy_to_clipboard", { content: item.content });
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--color-bg-card)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <Copy className="w-4 h-4" />
                  {t('detail.copyOriginal')}
                </button>
                <button
                  onClick={handleCopyMasked}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 hover:opacity-90"
                  style={{ 
                    backgroundColor: 'var(--color-warning)',
                    color: 'white'
                  }}
                >
                  <Copy className="w-4 h-4" />
                  {copySuccess ? t('detail.copied') : t('detail.copyMasked')}
                </button>
                <button
                  onClick={() => setIsMasked(!isMasked)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-200"
                  style={{ 
                    backgroundColor: 'var(--color-border)',
                    color: 'var(--color-text-secondary)'
                  }}
                >
                  {isMasked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  {isMasked ? t('detail.showOriginal') : t('detail.maskSensitive')}
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                {t('detail.content')}
              </label>
              <div className="flex items-center gap-2">
                {enablePasswordProtection && isProtected && !isEditing && (
                  <button
                    onClick={handleShowProtectedContent}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 btn-secondary"
                  >
                    {showProtectedContent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showProtectedContent ? t('detail.hideContent') : t('detail.showContent')}
                  </button>
                )}
                {!isEditing && item.item_type === "text" && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors duration-200 btn-secondary"
                  >
                    <Edit2 className="w-4 h-4" />
                    {t('detail.edit')}
                  </button>
                )}
              </div>
            </div>
            
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="input-field h-48 resize-none font-mono text-sm"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleCancel}
                    className="btn-secondary flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('actions.cancel')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center gap-1.5"
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
              <div 
                className="rounded-xl overflow-hidden border"
                style={{ 
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-bg)'
                }}
              >
                <img 
                  src={imageData || item.content} 
                  alt="Clipboard image" 
                  className="max-w-full max-h-64 mx-auto"
                />
              </div>
            ) : (
              <div 
                className="p-4 rounded-xl border"
                style={{ 
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <pre 
                  className="text-sm whitespace-pre-wrap break-all font-mono"
                  style={{ color: 'var(--color-text)' }}
                >
                  {enablePasswordProtection && isProtected && !showProtectedContent ? "****" : displayContent}
                </pre>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              <label className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
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

          <div 
            className="pt-4 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <Calendar className="w-3.5 h-3.5" />
              <span>创建于 {new Date(item.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <PasswordDialog
        isOpen={passwordDialogOpen}
        mode={passwordDialogMode}
        onConfirm={handlePasswordConfirm}
        onCancel={handlePasswordCancel}
        error={passwordDialogError}
        t={t}
      />
    </div>
  );
}
