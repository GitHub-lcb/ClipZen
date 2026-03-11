import { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, AlertCircle } from "lucide-react";

interface PasswordDialogProps {
  isOpen: boolean;
  mode: "set" | "verify";
  onConfirm: (password: string) => void;
  onCancel: () => void;
  error?: string;
  t: (key: string) => string;
}

export function PasswordDialog({
  isOpen,
  mode,
  onConfirm,
  onCancel,
  error,
  t,
}: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setLocalError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (!password.trim()) {
      setLocalError(t("password.errorEmpty"));
      return;
    }

    if (mode === "set") {
      if (password !== confirmPassword) {
        setLocalError(t("password.errorMismatch"));
        return;
      }
      if (password.length < 4) {
        setLocalError(t("password.errorTooShort"));
        return;
      }
    }

    onConfirm(password);
  };

  const handleCancel = () => {
    setPassword("");
    setConfirmPassword("");
    setLocalError("");
    onCancel();
  };

  const displayError = error || localError;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4 animate-fade-in"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={handleCancel}
    >
      <div
        className="rounded-2xl shadow-xl max-w-md w-full overflow-hidden animate-scale-in"
        style={{ 
          backgroundColor: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="flex items-center gap-3 px-6 py-4 border-b transition-colors duration-200"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div 
            className="p-2 rounded-lg"
            style={{ backgroundColor: 'var(--color-primary-light)' }}
          >
            <Lock className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
          </div>
          <h3 
            className="text-lg font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {mode === "set" ? t("password.setTitle") : t("password.verifyTitle")}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {mode === "set" && (
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t("password.setHint")}
            </p>
          )}

          <div>
            <label 
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--color-text)' }}
            >
              {mode === "set" ? t("password.newPassword") : t("password.password")}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pr-10"
                placeholder={t("password.placeholder")}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors duration-200"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {mode === "set" && (
            <div>
              <label 
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--color-text)' }}
              >
                {t("password.confirmPassword")}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder={t("password.confirmPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 transition-colors duration-200"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {displayError && (
            <div 
              className="p-4 rounded-xl flex items-start gap-3 animate-slide-up"
              style={{ 
                backgroundColor: 'var(--color-error-light)',
              }}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-error)' }} />
              <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                {displayError}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              className="btn-primary"
            >
              {t("actions.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
