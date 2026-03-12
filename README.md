# 📋 ClipZen (小安剪贴板)

> 快、稳、简单、隐私、离线 —— 你的本地剪贴板管家

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/lcb/ClipZen)
[![Built with](https://img.shields.io/badge/built%20with-Tauri-24C8DC.svg)](https://tauri.app)

---

## ✨ 特性

- 🚀 **极速启动** — <100ms，从按键到显示
- 🔒 **隐私优先** — 纯本地存储，无云同步，无数据上传
- 🎯 **简单易用** — 3 个快捷键搞定一切
- 💾 **离线可用** — 无需网络，随时可用
- 🎨 **现代设计** — 简洁界面，暗色/浅色模式
- 📦 **小巧轻量** — <10MB，内存占用 <50MB

---

## 🎯 核心功能

| 功能 | 说明 |
|-----|------|
| **剪贴板历史** | 自动记录文本、图片、文件 |
| **快速搜索** | 全文搜索 + 类型过滤 + 标签 |
| **常用置顶** | 收藏常用片段，快速访问 |
| **全局快捷键** | 一键呼出，不打断工作流 |
| **加密存储** | 可选密码加密，保护敏感信息 |

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|-------|------|
| `Cmd/Ctrl + Shift + V` | 呼出/隐藏主界面 |
| `Cmd/Ctrl + F` | 聚焦搜索框 |
| `↑ / ↓` | 上下选择 |
| `Enter` | 复制选中项 |
| `Cmd/Ctrl + Enter` | 复制并粘贴 |
| `Delete` | 删除选中项 |
| `Cmd/Ctrl + D` | 置顶/取消置顶 |
| `Esc` | 关闭窗口 |

---

## 🛠️ 技术栈

```
Frontend: React 18 + TypeScript + Tailwind CSS
Backend:  Rust + Tauri v2
Database: SQLite
Build:    Vite + Tauri CLI
```

---

## 📦 开发指南

### 环境要求

- Node.js 18+
- Rust 1.70+
- npm / pnpm / yarn

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/lcb/ClipZen.git
cd ClipZen

# 安装前端依赖
npm install

# 安装 Rust 依赖（首次）
cd src-tauri
cargo build
cd ..
```

### 开发模式

```bash
npm run tauri dev
```

### 构建发布

```bash
# Windows
npm run tauri build

# macOS
npm run tauri build

# Linux
npm run tauri build
```

---

## 📅 开发路线图

- [x] **v0.1.0** — MVP（剪贴板历史 + 搜索）✅
- [x] **v0.2.0** — 置顶功能 + 标签 ✅
- [x] **v0.3.0** — 加密存储 + 设置界面 ✅
- [x] **v0.4.0** — 激活码系统 + Pro 版本 ✅
- [ ] **v1.0.0** — 正式发布
- [ ] **v1.1.0** — 云同步 (付费功能)
- [ ] **v1.2.0** — 主题商店

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [Tauri](https://tauri.app) — 跨平台桌面框架
- [arboard](https://github.com/1Password/arboard) — Rust 剪贴板库
- [lucide](https://lucide.dev) — 图标库

---

## 💎 Pro 版本

ClipZen 提供免费版和 Pro 版本：

| 功能 | 免费版 | Pro 版 |
|-----|--------|--------|
| 剪贴板记录 | ✓ | ✓ |
| 全文搜索 | ✓ | ✓ |
| 图片/文件支持 | ✓ | ✓ |
| 加密保护 | ✗ | ✓ |
| 无限历史 | 7 天 | ✓ |
| 自定义主题 | ✗ | ✓ |
| 终身更新 | ✗ | ✓ |
| 价格 | 免费 | ¥29.9 |

**购买方式：** [淘宝店铺](待添加)

---

**官网：** [clipzen.app](https://clipzen.app) (待上线)

**反馈：** [提交 Issue](https://github.com/lcb/ClipZen/issues)

**社群：** [QQ 群](待添加)
