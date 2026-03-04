# 🛠️ ClipZen 开发环境配置指南

**最后更新：** 2026-03-04

---

## 📋 前置要求

| 工具 | 版本 | 用途 |
|-----|------|------|
| Node.js | 18+ | 前端开发 |
| Rust | 1.70+ | Tauri 后端 |
| Git | 最新 | 版本控制 |

---

## 🚀 快速开始

### 1. 安装 Node.js

**macOS:**
```bash
brew install node
```

**Windows:**
- 下载安装：https://nodejs.org
- 选择 LTS 版本

**Linux:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**验证：**
```bash
node -v  # v18.x 或更高
npm -v
```

---

### 2. 安装 Rust

**所有平台：**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**安装后：**
```bash
source $HOME/.cargo/env
rustc --version  # rustc 1.70.0 或更高
```

**Windows 额外步骤：**
- 安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- 选择 "C++ build tools"

---

### 3. 安装 Tauri 依赖

**macOS:**
```bash
xcode-select --install
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libxdo-dev \
    libssl-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

**Linux (Fedora):**
```bash
sudo dnf install -y webkit2gtk4.1-devel \
    openssl-devel \
    curl \
    wget \
    file \
    libxdo-devel \
    libappindicator-gtk3-devel \
    librsvg2-devel
```

---

### 4. 克隆项目

```bash
git clone https://github.com/lcb/ClipZen.git
cd ClipZen
```

---

### 5. 安装依赖

```bash
# 安装前端依赖
npm install

# 或使用 pnpm / yarn
pnpm install
# yarn install
```

---

### 6. 运行开发模式

```bash
npm run tauri dev
```

**首次运行会：**
- 下载 Tauri CLI
- 编译 Rust 后端（可能需要几分钟）
- 启动 Vite 开发服务器
- 打开应用窗口

---

## 📁 项目结构

```
ClipZen/
├── src/                    # 前端代码
│   ├── components/         # React 组件
│   ├── hooks/              # 自定义 Hooks
│   ├── stores/             # Zustand 状态管理
│   ├── styles/             # Tailwind 样式
│   ├── App.tsx             # 主应用组件
│   └── main.tsx            # 入口文件
├── src-tauri/              # Rust 后端
│   ├── src/
│   │   ├── main.rs         # Rust 入口
│   │   ├── clipboard.rs    # 剪贴板监听
│   │   ├── storage.rs      # 数据存储
│   │   └── commands.rs     # Tauri 命令
│   ├── Cargo.toml          # Rust 依赖配置
│   ├── tauri.conf.json     # Tauri 配置
│   └── icons/              # 应用图标
├── public/                 # 静态资源
├── package.json            # 前端依赖
├── tsconfig.json           # TypeScript 配置
├── tailwind.config.js      # Tailwind 配置
├── vite.config.ts          # Vite 配置
└── README.md               # 项目说明
```

---

## 🔧 常用命令

```bash
# 开发模式
npm run tauri dev

# 构建发布版
npm run tauri build

# 构建并打包
npm run tauri build -- --bundles all

# 检查代码
npm run lint

# 格式化代码
npm run format

# 运行测试
npm run test
```

---

## 🐛 常见问题

### 问题 1：`cargo not found`

**解决：**
```bash
source $HOME/.cargo/env
```

或在 `~/.bashrc` / `~/.zshrc` 添加：
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

---

### 问题 2：Tauri 依赖安装失败

**解决：**
```bash
# 清理 npm 缓存
npm cache clean --force

# 删除 node_modules
rm -rf node_modules

# 重新安装
npm install
```

---

### 问题 3：Linux 下缺少 WebKitGTK

**解决：** 参考上方 "安装 Tauri 依赖" 部分的 Linux 命令

---

### 问题 4：Windows 下 Rust 编译失败

**解决：**
- 确保安装了 Visual Studio Build Tools
- 选择 "C++ build tools" 和 "Windows 10/11 SDK"

---

## 📚 学习资源

### Tauri
- [官方文档](https://tauri.app)
- [Tauri v2 指南](https://v2.tauri.app)
- [示例项目](https://github.com/tauri-apps/tauri/tree/dev/examples)

### Rust
- [Rust 编程语言](https://doc.rust-lang.org/book/)
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/)

### React + TypeScript
- [React 官方文档](https://react.dev)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)

---

## 🎯 下一步

1. ✅ 完成环境配置
2. ✅ 运行 Hello World
3. 📝 阅读 `prototype.md` 了解产品设计
4. 📝 阅读 `tech-stack.md` 了解技术选型
5. 🚀 开始开发！

---

**遇到问题？** [提交 Issue](https://github.com/lcb/ClipZen/issues)
