#!/usr/bin/env node

/**
 * ClipZen 激活码验证工具
 * 用于测试激活码是否有效（与 Rust 后端算法一致）
 */

const crypto = require('crypto');

const SECRET_KEY = 'ClipZen_License_Key_2026_Secret_X7k9mP2q';
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Base32 解码 (Crockford 变体)
 */
function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const buffer = [];
  let bits = 0;
  let value = 0;
  
  for (let i = 0; i < clean.length; i++) {
    const val = ALPHABET.indexOf(clean[i]);
    if (val === -1) throw new Error(`Invalid Base32 character: ${clean[i]}`);
    
    value = (value << 5) | val;
    bits += 5;
    
    if (bits >= 8) {
      buffer.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }
  
  return Buffer.from(buffer);
}

/**
 * 验证激活码（24 字符紧凑格式）
 */
function verifyLicenseCode(code) {
  const codeClean = code.replace(/-/g, '').toUpperCase();
  
  if (codeClean.length !== 24) {
    return { success: false, message: '激活码格式错误（应为 24 位，格式：XXXX-XXXX-XXXX-XXXX-XXXX-XXXX）' };
  }
  
  try {
    const decoded = base32Decode(codeClean);
    
    if (decoded.length < 15) {
      return { success: false, message: '激活码数据不完整' };
    }
    
    const payload = decoded.slice(0, 11);
    const storedSignature = decoded.slice(11, 15);
    
    // 验证 HMAC
    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(payload);
    const computedSignature = hmac.digest();
    
    const signatureMatch = computedSignature.slice(0, 4).equals(storedSignature);
    
    if (!signatureMatch) {
      return { success: false, message: '激活码验证失败（签名不匹配）' };
    }
    
    // 解析信息
    const timestamp = decoded.readUInt32LE(0) * 1000; // 转为毫秒
    const licenseTypeCode = decoded[8];
    const deviceSlots = decoded.readUInt16LE(9);
    
    const licenseTypes = {
      1: '标准版',
      2: '家庭版',
      3: '企业版'
    };
    
    const date = new Date(timestamp);
    
    return {
      success: true,
      message: '激活码有效 ✓',
      data: {
        timestamp,
        generatedAt: date.toISOString(),
        licenseType: licenseTypes[licenseTypeCode] || '未知',
        deviceSlots
      }
    };
  } catch (err) {
    return { success: false, message: `验证出错：${err.message}` };
  }
}

// 主程序
const codes = process.argv.slice(2);

if (codes.length === 0) {
  console.log('用法：node verify_license.js <激活码 1> [激活码 2] ...');
  console.log('');
  console.log('示例：');
  console.log('  node verify_license.js WDVW-9RCW-0400-12WG');
  console.log('  node verify_license.js WDVW-9RCW-0400-12WG WNVW-9RCW-0400-0BYQ');
  process.exit(0);
}

console.log('╔══════════════════════════════════════════╗');
console.log('║     ClipZen 激活码验证工具               ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

codes.forEach(code => {
  const result = verifyLicenseCode(code);
  console.log(`激活码：${code}`);
  console.log(`状态：${result.success ? '✓ 有效' : '✗ 无效'}`);
  console.log(`信息：${result.message}`);
  
  if (result.success && result.data) {
    console.log(`  版本：${result.data.licenseType}`);
    console.log(`  设备数：${result.data.deviceSlots}`);
    console.log(`  生成时间：${result.data.generatedAt}`);
  }
  console.log('');
});
