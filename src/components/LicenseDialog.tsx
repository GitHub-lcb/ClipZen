import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface LicenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated: () => void;
}

interface LicenseInfo {
  code: string;
  machine_id: string;
  activated_at: number;
  license_type: string;
  device_slots: number;
}

interface ActivationResult {
  success: boolean;
  message: string;
  license_info: LicenseInfo | null;
}

export function LicenseDialog({ isOpen, onClose, onActivated }: LicenseDialogProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  if (!isOpen) return null;

  const formatCode = (value: string) => {
    // 移除所有非字母数字字符
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // 每 4 个字符添加连字符
    const parts = [];
    for (let i = 0; i < cleaned.length && i < 16; i += 4) {
      parts.push(cleaned.slice(i, i + 4));
    }
    return parts.join('-');
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCode(e.target.value);
    setCode(formatted);
    setError('');
  };

  const handleActivate = async () => {
    if (code.length < 19) { // XXXX-XXXX-XXXX-XXXX = 19 chars
      setError('请输入完整的激活码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await invoke<ActivationResult>('activate_license', { code });
      
      if (result.success) {
        setSuccess(true);
        setLicenseInfo(result.license_info);
        setTimeout(() => {
          onActivated();
          handleClose();
        }, 2000);
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError('激活失败：' + err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCode('');
    setError('');
    setSuccess(false);
    setLicenseInfo(null);
    onClose();
  };

  const getLicenseTypeText = (type: string) => {
    switch (type) {
      case 'Standard': return '标准版';
      case 'Family': return '家庭版';
      case 'Enterprise': return '企业版';
      default: return '未知版本';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {success ? '激活成功' : '激活 ClipZen Pro'}
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                激活成功！
              </p>
              {licenseInfo && (
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <p>版本：{getLicenseTypeText(licenseInfo.license_type)}</p>
                  <p>设备数：{licenseInfo.device_slots} 台</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  请输入您的激活码以解锁 ClipZen Pro 功能。
                </p>
                
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    激活码
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={code}
                      onChange={handleCodeChange}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white uppercase tracking-wider"
                      maxLength={19}
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {error && (
                  <div className="mt-3 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Pro 功能包括：
                </h4>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>✓ 加密存储保护</li>
                  <li>✓ 无限历史记录</li>
                  <li>✓ 自定义主题</li>
                  <li>✓ 优先技术支持</li>
                  <li>✓ 终身免费更新</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              disabled={isLoading}
            >
              取消
            </button>
            <button
              onClick={handleActivate}
              disabled={isLoading || code.length < 19}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  激活中...
                </>
              ) : (
                '立即激活'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
