#!/usr/bin/env node

/**
 * ClipZen 淘宝主图生成器
 * 使用 sharp 库生成 800x800 主图
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'main-images');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 创建 SVG 主图
async function createCoverImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1E3A8A"/>
                <stop offset="50%" style="stop-color:#3B82F6"/>
                <stop offset="100%" style="stop-color:#60A5FA"/>
            </linearGradient>
        </defs>
        
        <!-- 背景 -->
        <rect width="800" height="800" fill="url(#bg1)"/>
        
        <!-- 装饰圆圈 -->
        <circle cx="700" cy="100" r="150" fill="rgba(255,255,255,0.1)"/>
        <circle cx="100" cy="700" r="200" fill="rgba(255,255,255,0.08)"/>
        
        <!-- 中央图标区域 -->
        <rect x="250" y="200" width="300" height="300" rx="40" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>
        
        <!-- 剪贴板图标 -->
        <rect x="340" y="260" width="120" height="180" rx="15" fill="#fff"/>
        <rect x="370" y="240" width="60" height="40" rx="8" fill="#fff"/>
        <rect x="355" y="280" width="90" height="8" rx="4" fill="#3B82F6"/>
        <rect x="355" y="300" width="90" height="8" rx="4" fill="#E5E7EB"/>
        <rect x="355" y="320" width="70" height="8" rx="4" fill="#E5E7EB"/>
        
        <!-- 标题 -->
        <text x="400" y="580" text-anchor="middle" fill="#fff" font-size="52" font-weight="bold" font-family="sans-serif">小安剪贴板 Pro</text>
        
        <!-- 副标题 -->
        <text x="400" y="640" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-size="28" font-family="sans-serif">一键呼出 · 极速复制 · 隐私安全</text>
        
        <!-- 平台标识 -->
        <text x="400" y="700" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="sans-serif">Windows · macOS · Linux</text>
        
        <!-- 价格标签 -->
        <circle cx="680" cy="680" r="80" fill="#F59E0B"/>
        <text x="680" y="690" text-anchor="middle" fill="#fff" font-size="36" font-weight="bold" font-family="sans-serif">¥29.9</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-01-cover.png'));
    
    console.log('✓ 主图 1 已生成：main-01-cover.png');
}

async function createFeaturesImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#0F172A"/>
                <stop offset="100%" style="stop-color:#1E293B"/>
            </linearGradient>
        </defs>
        
        <rect width="800" height="800" fill="url(#bg2)"/>
        
        <!-- 标题 -->
        <text x="400" y="100" text-anchor="middle" fill="#fff" font-size="48" font-weight="bold" font-family="sans-serif">✨ 核心功能</text>
        
        <!-- 功能列表背景 -->
        <rect x="100" y="150" width="600" height="550" rx="20" fill="rgba(255,255,255,0.05)"/>
        
        <!-- 功能项 1 -->
        <circle cx="180" cy="230" r="45" fill="#3B82F6"/>
        <text x="180" y="240" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">📋</text>
        <text x="260" y="238" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">剪贴板历史记录，不再丢失重要内容</text>
        
        <!-- 功能项 2 -->
        <circle cx="180" cy="330" r="45" fill="#8B5CF6"/>
        <text x="180" y="340" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">🔍</text>
        <text x="260" y="338" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">全文搜索，快速定位</text>
        
        <!-- 功能项 3 -->
        <circle cx="180" cy="430" r="45" fill="#EC4899"/>
        <text x="180" y="440" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">📁</text>
        <text x="260" y="438" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">图片/文本/文件，全支持</text>
        
        <!-- 功能项 4 -->
        <circle cx="180" cy="530" r="45" fill="#10B981"/>
        <text x="180" y="540" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">🔐</text>
        <text x="260" y="538" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">加密保护，隐私安全</text>
        
        <!-- 功能项 5 -->
        <circle cx="180" cy="630" r="45" fill="#F59E0B"/>
        <text x="180" y="640" text-anchor="middle" fill="#fff" font-size="28" font-family="sans-serif">⚡</text>
        <text x="260" y="638" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">自动记录，无需手动保存</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-02-features.png'));
    
    console.log('✓ 主图 2 已生成：main-02-features.png');
}

async function createEfficiencyImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg3" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#134E4A"/>
                <stop offset="100%" style="stop-color:#0D9488"/>
            </linearGradient>
        </defs>
        
        <rect width="800" height="800" fill="url(#bg3)"/>
        
        <!-- 标题 -->
        <text x="400" y="120" text-anchor="middle" fill="#fff" font-size="56" font-weight="bold" font-family="sans-serif">🚀 效率翻倍</text>
        
        <!-- 快捷键展示 -->
        <rect x="200" y="180" width="400" height="120" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="400" y="260" text-anchor="middle" fill="#fff" font-size="32" font-weight="bold" font-family="monospace">Ctrl + Shift + V</text>
        
        <!-- 效率提升点 -->
        <text x="220" y="380" text-anchor="start" fill="#10B981" font-size="26" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="270" y="380" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">一键呼出，不打断工作流</text>
        
        <text x="220" y="450" text-anchor="start" fill="#10B981" font-size="26" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="270" y="450" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">自动记录，无需手动保存</text>
        
        <text x="220" y="520" text-anchor="start" fill="#10B981" font-size="26" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="270" y="520" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">置顶常用，快速访问</text>
        
        <text x="220" y="590" text-anchor="start" fill="#10B981" font-size="26" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="270" y="590" text-anchor="start" fill="#fff" font-size="24" font-family="sans-serif">标签分类，井井有条</text>
        
        <!-- 底部强调 -->
        <text x="400" y="700" text-anchor="middle" fill="#FCD34D" font-size="32" font-weight="bold" font-family="sans-serif">每天节省 30 分钟！</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-03-efficiency.png'));
    
    console.log('✓ 主图 3 已生成：main-03-efficiency.png');
}

async function createPrivacyImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="bg4" cx="50%" cy="50%" r="50%">
                <stop offset="0%" style="stop-color:#1E1B4B"/>
                <stop offset="100%" style="stop-color:#312E81"/>
            </radialGradient>
        </defs>
        
        <rect width="800" height="800" fill="url(#bg4)"/>
        
        <!-- 标题 -->
        <text x="400" y="120" text-anchor="middle" fill="#fff" font-size="56" font-weight="bold" font-family="sans-serif">🔒 隐私至上</text>
        
        <!-- 锁图标背景 -->
        <circle cx="400" cy="300" r="120" fill="#818CF8"/>
        
        <!-- 锁图标 -->
        <rect x="340" y="260" width="120" height="100" rx="15" fill="#1E1B4B"/>
        <rect x="370" y="220" width="60" height="60" rx="10" fill="#1E1B4B"/>
        <circle cx="400" cy="310" r="20" fill="#818CF8"/>
        
        <!-- 安全特性 -->
        <text x="220" y="480" text-anchor="start" fill="#A5B4FC" font-size="24" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="260" y="480" text-anchor="start" fill="#fff" font-size="22" font-family="sans-serif">100% 本地存储，不上传云端</text>
        
        <text x="220" y="535" text-anchor="start" fill="#A5B4FC" font-size="24" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="260" y="535" text-anchor="start" fill="#fff" font-size="22" font-family="sans-serif">可选密码加密</text>
        
        <text x="220" y="590" text-anchor="start" fill="#A5B4FC" font-size="24" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="260" y="590" text-anchor="start" fill="#fff" font-size="22" font-family="sans-serif">开源可审计</text>
        
        <text x="220" y="645" text-anchor="start" fill="#A5B4FC" font-size="24" font-weight="bold" font-family="sans-serif">✓</text>
        <text x="260" y="645" text-anchor="start" fill="#fff" font-size="22" font-family="sans-serif">离线也能用</text>
        
        <!-- 底部标语 -->
        <text x="400" y="740" text-anchor="middle" fill="#C7D2FE" font-size="20" font-family="sans-serif">您的数据，只属于您</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-04-privacy.png'));
    
    console.log('✓ 主图 4 已生成：main-04-privacy.png');
}

async function createPricingImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg5" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#7C2D12"/>
                <stop offset="100%" style="stop-color:#EA580C"/>
            </linearGradient>
        </defs>
        
        <rect width="800" height="800" fill="url(#bg5)"/>
        
        <!-- 标题 -->
        <text x="400" y="90" text-anchor="middle" fill="#fff" font-size="48" font-weight="bold" font-family="sans-serif">📊 版本对比</text>
        
        <!-- 免费版 -->
        <rect x="80" y="150" width="280" height="280" rx="20" fill="rgba(255,255,255,0.1)"/>
        <text x="220" y="200" text-anchor="middle" fill="#fff" font-size="28" font-weight="bold" font-family="sans-serif">免费版</text>
        <text x="220" y="250" text-anchor="middle" fill="#fff" font-size="36" font-weight="bold" font-family="sans-serif">¥0</text>
        
        <text x="120" y="310" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 基础记录</text>
        <text x="120" y="345" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 搜索功能</text>
        <text x="120" y="380" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 7 天历史</text>
        
        <!-- Pro 版 (高亮) -->
        <rect x="440" y="150" width="280" height="280" rx="20" fill="rgba(255,255,255,0.25)" stroke="#FCD34D" stroke-width="4"/>
        <text x="580" y="200" text-anchor="middle" fill="#FCD34D" font-size="28" font-weight="bold" font-family="sans-serif">Pro 版</text>
        <text x="580" y="250" text-anchor="middle" fill="#fff" font-size="42" font-weight="bold" font-family="sans-serif">¥29.9</text>
        <text x="580" y="280" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="16" font-family="sans-serif">一次买断</text>
        
        <text x="480" y="325" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 加密保护</text>
        <text x="480" y="360" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 无限历史</text>
        <text x="480" y="395" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 自定义主题</text>
        <text x="480" y="430" text-anchor="start" fill="#fff" font-size="18" font-family="sans-serif">✓ 终身更新</text>
        
        <!-- 底部强调 -->
        <text x="400" y="510" text-anchor="middle" fill="#FCD34D" font-size="28" font-weight="bold" font-family="sans-serif">性价比之选！</text>
        
        <text x="400" y="560" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="20" font-family="sans-serif">家庭版 ¥49.9 (3 台设备)</text>
        <text x="400" y="595" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="20" font-family="sans-serif">企业版 ¥99 (5 台设备)</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-05-pricing.png'));
    
    console.log('✓ 主图 5 已生成：main-05-pricing.png');
}

async function createScenariosImage() {
    const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bg6" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#4C1D95"/>
                <stop offset="100%" style="stop-color:#7C3AED"/>
            </linearGradient>
        </defs>
        
        <rect width="800" height="800" fill="url(#bg6)"/>
        
        <!-- 标题 -->
        <text x="400" y="90" text-anchor="middle" fill="#fff" font-size="48" font-weight="bold" font-family="sans-serif">🎯 谁需要它？</text>
        
        <!-- 场景 1 - 程序员 -->
        <rect x="80" y="150" width="300" height="260" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="230" y="220" text-anchor="middle" fill="#fff" font-size="48" font-family="sans-serif">💻</text>
        <text x="230" y="270" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="sans-serif">程序员</text>
        <text x="230" y="305" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="sans-serif">代码片段、API 密钥管理</text>
        
        <!-- 场景 2 - 文字工作者 -->
        <rect x="420" y="150" width="300" height="260" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="570" y="220" text-anchor="middle" fill="#fff" font-size="48" font-family="sans-serif">📝</text>
        <text x="570" y="270" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="sans-serif">文字工作者</text>
        <text x="570" y="305" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="sans-serif">素材收集、多段组合</text>
        
        <!-- 场景 3 - 设计师 -->
        <rect x="80" y="450" width="300" height="260" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="230" y="520" text-anchor="middle" fill="#fff" font-size="48" font-family="sans-serif">🎨</text>
        <text x="230" y="570" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="sans-serif">设计师</text>
        <text x="230" y="605" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="sans-serif">截图素材、颜色代码</text>
        
        <!-- 场景 4 - 办公人士 -->
        <rect x="420" y="450" width="300" height="260" rx="20" fill="rgba(255,255,255,0.15)"/>
        <text x="570" y="520" text-anchor="middle" fill="#fff" font-size="48" font-family="sans-serif">📊</text>
        <text x="570" y="570" text-anchor="middle" fill="#fff" font-size="26" font-weight="bold" font-family="sans-serif">办公人士</text>
        <text x="570" y="605" text-anchor="middle" fill="rgba(255,255,255,0.8)" font-size="18" font-family="sans-serif">报表数据、快速填写</text>
        
        <!-- 底部标语 -->
        <text x="400" y="760" text-anchor="middle" fill="#C4B5FD" font-size="22" font-family="sans-serif">提升效率的必备工具</text>
    </svg>
    `;
    
    await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(OUTPUT_DIR, 'main-06-scenarios.png'));
    
    console.log('✓ 主图 6 已生成：main-06-scenarios.png');
}

async function main() {
    console.log('🦞 开始生成 ClipZen 淘宝主图...\n');
    
    await createCoverImage();
    await createFeaturesImage();
    await createEfficiencyImage();
    await createPrivacyImage();
    await createPricingImage();
    await createScenariosImage();
    
    console.log('\n✅ 所有主图已生成完成！');
    console.log(`📁 输出目录：${OUTPUT_DIR}`);
    console.log('\n生成的文件:');
    console.log('  - main-01-cover.png (产品封面)');
    console.log('  - main-02-features.png (核心功能)');
    console.log('  - main-03-efficiency.png (效率提升)');
    console.log('  - main-04-privacy.png (隐私安全)');
    console.log('  - main-05-pricing.png (版本对比)');
    console.log('  - main-06-scenarios.png (应用场景)');
}

main().catch(console.error);
