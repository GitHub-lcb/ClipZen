import { useState, useEffect, useCallback } from 'react';

// 导入语言文件
import zhCN from '../locales/zh-CN.json';
import enUS from '../locales/en-US.json';

const locales: Record<string, typeof zhCN> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// 获取嵌套对象的值
function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;
  
  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  
  return typeof result === 'string' ? result : path;
}

// 替换占位符
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => 
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}

export function useI18n() {
  const [locale, setLocale] = useState<string>(() => {
    const saved = localStorage.getItem('clipzen-locale');
    if (saved && locales[saved]) return saved;
    const browserLang = navigator.language;
    if (browserLang.startsWith('zh')) return 'zh-CN';
    return 'en-US';
  });

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const messages = locales[locale] || locales['zh-CN'];
    const text = getNestedValue(messages as unknown as Record<string, unknown>, key);
    return interpolate(text, params);
  }, [locale]);

  const changeLocale = useCallback((newLocale: string) => {
    if (locales[newLocale]) {
      setLocale(newLocale);
      localStorage.setItem('clipzen-locale', newLocale);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);

  return {
    locale,
    t,
    changeLocale,
    availableLocales: Object.keys(locales),
  };
}

export const translations = locales;