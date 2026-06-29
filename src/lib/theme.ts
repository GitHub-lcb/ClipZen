const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

let activeTheme = 'system';
let removeSystemThemeListener: (() => void) | null = null;

export function applyTheme(theme: string) {
  activeTheme = theme;

  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const systemDark = window.matchMedia(SYSTEM_THEME_QUERY).matches;
    root.classList.add(systemDark ? 'dark' : 'light');
    return;
  }

  root.classList.add(theme);
}

export function startSystemThemeListener() {
  if (removeSystemThemeListener) return;

  const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  const handleSystemThemeChange = () => {
    if (activeTheme === 'system') {
      applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handleSystemThemeChange);
  removeSystemThemeListener = () => {
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
    removeSystemThemeListener = null;
  };
}
