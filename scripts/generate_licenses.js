#!/usr/bin/env node

/**
 * ClipZen 激活码批量生成工具
 * 用于淘宝自动发货
 * 
 * 使用方法:
 *   node generate_licenses.js [count] [type] [slots]
 *   
 * 参数:
 *   count - 生成数量 (默认 100)
 *   type  - 许可证类型：standard|family|enterprise (默认 standard)
 *   slots - 设备槽位数量 (默认 1)
 * 
 * 输出: licenses_YYYYMMDD_HHMMSS.csv
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const SECRET_KEY = 'ClipZen_License_Key_2026_Secret_X7k9mP2q';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32 (去掉易混淆字符)

// 许可证类型映射
const LICENSE_TYPES = {
  standard: { code: 1, name: '标准版', slots: 1, price: '29.9 元' },
  family: { code: 2, name: '家庭版', slots: 3, price: '49.9 元' },
  enterprise: { code: 3, name: '企业版', slots: 5, price: '99 元' }
};

/**
 * Base32 编码 (Crockford 变体)
 */
function base32Encode(buffer) {
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 0x1F];
      bits -= 5;
    }
  }
  
  if (bits > 0) {
    result += ALPHABET[(value << (5 - bits)) & 0x1F];
  }
  
  return result;
}

/**
 * 生成激活码（紧凑格式：24 字符 = 15 字节数据）
 */
function generateLicenseCode(licenseType, deviceSlots) {
  // 用秒级时间戳（4 字节）
  const timestamp = Math.floor(Date.now() / 1000);
  const randomBytes = crypto.randomBytes(4);
  
  // 构建 payload: timestamp(4) + random(4) + license_type(1) + device_slots(2) = 11 bytes
  const payload = Buffer.alloc(11);
  
  // timestamp (4 bytes, little-endian)
  payload.writeUInt32LE(timestamp, 0);
  
  // random (4 bytes)
  randomBytes.copy(payload, 4);
  
  // license type (1 byte)
  payload[8] = licenseType;
  
  // device slots (2 bytes, little-endian)
  payload.writeUInt16LE(deviceSlots, 9);
  
  // 计算 HMAC-SHA256 签名（截断到 4 字节）
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(payload);
  const signature = hmac.digest();
  
  // 组合：payload(11) + signature[0..4](4) = 15 bytes
  const data = Buffer.concat([payload, signature.slice(0, 4)]);
  
  // Base32 编码 (15 bytes → 24 chars)
  const encoded = base32Encode(data).toUpperCase();
  const code = encoded.slice(0, 24);
  
  // 格式化为 XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (6 组，24 字符)
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}-${code.slice(16, 20)}-${code.slice(20, 24)}`;
}

/**
 * 批量生成激活码
 */
function generateBatch(count, type, slots) {
  const licenseType = LICENSE_TYPES[type];
  if (!licenseType) {
    console.error(`错误：未知的许可证类型 "${type}"`);
    console.error('可用类型：standard, family, enterprise');
    process.exit(1);
  }
  
  const codes = [];
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  
  console.log(`正在生成 ${count} 个 ${licenseType.name} 激活码...`);
  console.log(`设备槽位：${slots}`);
  console.log(`建议售价：${licenseType.price}`);
  console.log('');
  
  for (let i = 0; i < count; i++) {
    const code = generateLicenseCode(licenseType.code, parseInt(slots));
    codes.push({
      id: i + 1,
      code: code,
      type: licenseType.name,
      slots: slots,
      generated_at: new Date().toISOString()
    });
    
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`\r已生成：${i + 1}/${count}`);
    }
  }
  
  console.log(`\r已生成：${count}/${count} ✓`);
  
  // 生成 CSV 文件
  const csvHeader = 'ID,激活码，类型，设备数，生成时间';
  const csvRows = codes.map(c => 
    `${c.id},${c.code},${c.type},${c.slots},${c.generated_at}`
  );
  const csvContent = [csvHeader, ...csvRows].join('\n');
  
  const filename = `licenses_${timestamp}_${type}.csv`;
  const filepath = path.join(__dirname, filename);
  fs.writeFileSync(filepath, csvContent);
  
  console.log(`\n文件已保存：${filepath}`);
  console.log(`\n前 10 个激活码预览:`);
  codes.slice(0, 10).forEach(c => {
    console.log(`  ${c.id}. ${c.code}`);
  });
  
  if (count > 10) {
    console.log(`  ... 还有 ${count - 10} 个，请查看 CSV 文件`);
  }
  
  return codes;
}

// 主程序
const args = process.argv.slice(2);
const count = parseInt(args[0]) || 100;
const type = args[1] || 'standard';
const slots = args[2] || LICENSE_TYPES[type].slots;

console.log('╔══════════════════════════════════════════╗');
console.log('║     ClipZen 激活码批量生成工具           ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

generateBatch(count, type, slots);
