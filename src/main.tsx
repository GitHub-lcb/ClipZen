import React from 'react';
import ReactDOM from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import App from './App';
import { applyTheme, startSystemThemeListener } from './lib/theme';
import './styles/index.css';

async function initTheme() {
  try {
    const settings = await invoke<{ theme: string }>('get_settings');
    applyTheme(settings.theme);
  } catch (error) {
    console.error('Failed to load theme:', error);
    applyTheme('system');
  }

  startSystemThemeListener();
}

initTheme().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
