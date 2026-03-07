import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// 应用主题
function applyTheme(theme: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  
  if (theme === "system") {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(systemDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
}

// 初始化主题
async function initTheme() {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const settings = await invoke<{ theme: string }>("get_settings");
    applyTheme(settings.theme);
    
    // 监听系统主题变化
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (settings.theme === "system") {
        applyTheme("system");
      }
    });
  } catch (error) {
    console.error("Failed to load theme:", error);
    applyTheme("system");
  }
}

initTheme().then(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
