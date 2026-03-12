use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs;
use std::path::PathBuf;

type HmacSha256 = Hmac<Sha256>;

// 硬编码的签名密钥（实际部署时应混淆）
const SECRET_KEY: &[u8] = b"ClipZen_License_Key_2026_Secret_X7k9mP2q";

/// 激活码信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub code: String,           // 激活码
    pub machine_id: String,     // 绑定的机器码
    pub activated_at: u64,      // 激活时间戳
    pub license_type: LicenseType,
    pub device_slots: u32,      // 设备槽位数量
}

/// 许可证类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LicenseType {
    Standard,   // 标准版 29.9
    Family,     // 家庭版 49.9
    Enterprise, // 企业版 99
}

/// 激活结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivationResult {
    pub success: bool,
    pub message: String,
    pub license_info: Option<LicenseInfo>,
}

/// 生成机器码（硬件指纹）
pub fn generate_machine_id() -> String {
    let mut hasher = Sha256::new();
    
    // 收集硬件信息
    let cpu_id = get_cpu_id().unwrap_or_else(|| "unknown".to_string());
    let mobo_serial = get_motherboard_serial().unwrap_or_else(|| "unknown".to_string());
    let disk_serial = get_disk_serial().unwrap_or_else(|| "unknown".to_string());
    
    // 组合哈希
    hasher.update(cpu_id.as_bytes());
    hasher.update(mobo_serial.as_bytes());
    hasher.update(disk_serial.as_bytes());
    
    let result = hasher.finalize();
    format!("{:x}", result)[..16].to_string() // 取前 16 字符
}

/// 生成激活码（紧凑格式：24 字符 = 15 字节数据）
/// 结构：timestamp(4) + random(4) + license_type(1) + device_slots(2) + signature(4) = 15 bytes
pub fn generate_license_code(license_type: LicenseType, device_slots: u32) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as u32; // 用秒级时间戳（4 字节够用 136 年）
    
    let random_bytes: [u8; 4] = rand::random();
    
    // 构建 payload: timestamp(4) + random(4) + license_type(1) + device_slots(2) = 11 bytes
    let mut payload = Vec::new();
    payload.extend_from_slice(&timestamp.to_le_bytes());
    payload.extend_from_slice(&random_bytes);
    payload.push(license_type_to_u8(&license_type));
    payload.extend_from_slice(&(device_slots as u16).to_le_bytes());
    
    // 计算 HMAC 签名（截断到 4 字节）
    let mut mac = HmacSha256::new_from_slice(SECRET_KEY).unwrap();
    mac.update(&payload);
    let signature = mac.finalize().into_bytes();
    
    // 组合：payload(11) + signature[0..4](4) = 15 bytes
    let mut data = payload;
    data.extend_from_slice(&signature[..4]);
    
    // Base32 编码 (15 bytes → 24 chars)
    let encoded = base32::encode(base32::Alphabet::Crockford, &data);
    let code = encoded[..24].to_uppercase();
    
    // 格式化为 XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (6 组，24 字符)
    format!("{}-{}-{}-{}-{}-{}", 
        &code[0..4], 
        &code[4..8], 
        &code[8..12], 
        &code[12..16],
        &code[16..20],
        &code[20..24]
    )
}

/// 验证激活码（匹配 24 字符紧凑格式）
pub fn verify_license_code(code: &str, machine_id: &str) -> ActivationResult {
    // 移除连字符
    let code_clean = code.replace("-", "").to_uppercase();
    
    if code_clean.len() != 24 {
        return ActivationResult {
            success: false,
            message: "激活码格式错误（应为 24 位）".to_string(),
            license_info: None,
        };
    }
    
    // Base32 解码
    let decoded = match base32::decode(base32::Alphabet::Crockford, &code_clean) {
        Some(data) => data,
        None => {
            return ActivationResult {
                success: false,
                message: "无效的激活码".to_string(),
                license_info: None,
            };
        }
    };
    
    if decoded.len() < 15 {
        return ActivationResult {
            success: false,
            message: "激活码数据不完整".to_string(),
            license_info: None,
        };
    }
    
    // 提取 payload(11) 和签名 (4)
    let payload = &decoded[..11];
    let stored_signature = &decoded[11..15];
    
    // 验证 HMAC 签名
    let mut mac = HmacSha256::new_from_slice(SECRET_KEY).unwrap();
    mac.update(payload);
    let computed_signature = mac.finalize().into_bytes();
    
    if &computed_signature[..4] != stored_signature {
        return ActivationResult {
            success: false,
            message: "激活码验证失败".to_string(),
            license_info: None,
        };
    }
    
    // 解析 payload
    let timestamp = u32::from_le_bytes(payload[0..4].try_into().unwrap()) as u64;
    let license_type = u8_to_license_type(payload[8]);
    let device_slots = u16::from_le_bytes(payload[9..11].try_into().unwrap()) as u32;
    
    let license_info = LicenseInfo {
        code: code.to_string(),
        machine_id: machine_id.to_string(),
        activated_at: timestamp,
        license_type,
        device_slots,
    };
    
    ActivationResult {
        success: true,
        message: "激活成功".to_string(),
        license_info: Some(license_info),
    }
}

/// 检查激活状态
pub fn check_activation(stored_machine_id: &str, current_machine_id: &str) -> bool {
    // 简单比较机器码（允许一定容错）
    stored_machine_id == current_machine_id
}

fn license_type_to_u8(t: &LicenseType) -> u8 {
    match t {
        LicenseType::Standard => 1,
        LicenseType::Family => 2,
        LicenseType::Enterprise => 3,
    }
}

fn u8_to_license_type(v: u8) -> LicenseType {
    match v {
        1 => LicenseType::Standard,
        2 => LicenseType::Family,
        3 => LicenseType::Enterprise,
        _ => LicenseType::Standard,
    }
}

// ============ 平台相关的硬件信息获取 ============

#[cfg(target_os = "windows")]
fn get_cpu_id() -> Option<String> {
    use std::process::Command;
    let output = Command::new("wmic")
        .args(&["cpu", "get", "ProcessorId"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().nth(1).map(|s| s.trim().to_string())
}

#[cfg(target_os = "windows")]
fn get_motherboard_serial() -> Option<String> {
    use std::process::Command;
    let output = Command::new("wmic")
        .args(&["baseboard", "get", "serialnumber"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().nth(1).map(|s| s.trim().to_string())
}

#[cfg(target_os = "windows")]
fn get_disk_serial() -> Option<String> {
    use std::process::Command;
    let output = Command::new("wmic")
        .args(&["diskdrive", "get", "serialnumber"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().nth(1).map(|s| s.trim().to_string())
}

#[cfg(target_os = "macos")]
fn get_cpu_id() -> Option<String> {
    use std::process::Command;
    let output = Command::new("system_profiler")
        .args(&["SPHardwareDataType"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    // 提取 "Serial Number" 或 "Processor Name"
    for line in stdout.lines() {
        if line.contains("Serial Number") {
            return line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn get_motherboard_serial() -> Option<String> {
    get_cpu_id() // macOS 上主板序列号和系统序列号相同
}

#[cfg(target_os = "macos")]
fn get_disk_serial() -> Option<String> {
    use std::process::Command;
    let output = Command::new("diskutil")
        .args(&["info", "disk0"])
        .output()
        .ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        if line.contains("Device / Media Name") || line.contains("Serial Number") {
            return line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn get_cpu_id() -> Option<String> {
    use std::fs;
    let content = fs::read_to_string("/proc/cpuinfo").ok()?;
    for line in content.lines() {
        if line.starts_with("serial") {
            return line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }
    // 备用方案：使用 hostname 或 machine-id
    fs::read_to_string("/etc/machine-id").ok().map(|s| s.trim().to_string())
}

#[cfg(target_os = "linux")]
fn get_motherboard_serial() -> Option<String> {
    use std::fs;
    // 尝试读取 DMI 信息
    fs::read_to_string("/sys/class/dmi/id/board_serial")
        .ok()
        .map(|s| s.trim().to_string())
}

#[cfg(target_os = "linux")]
fn get_disk_serial() -> Option<String> {
    use std::fs;
    // 尝试读取第一个硬盘的序列号
    fs::read_to_string("/sys/block/sda/serial")
        .or_else(|_| fs::read_to_string("/sys/block/nvme0n1/serial"))
        .ok()
        .map(|s| s.trim().to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn get_cpu_id() -> Option<String> { None }

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn get_motherboard_serial() -> Option<String> { None }

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn get_disk_serial() -> Option<String> { None }

// ============ 测试工具 ============

/// 生成一批测试激活码（用于淘宝自动发货）
pub fn generate_batch_license_codes(count: usize, license_type: LicenseType, device_slots: u32) -> Vec<String> {
    let mut codes = Vec::new();
    for _ in 0..count {
        codes.push(generate_license_code(license_type.clone(), device_slots));
    }
    codes
}

// ============ License Manager ============

/// 许可证管理器（单例，管理本地激活状态）
pub struct LicenseManager {
    license_file: PathBuf,
    cached_info: Option<LicenseInfo>,
}

impl LicenseManager {
    pub fn new() -> Self {
        let license_file = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("ClipZen")
            .join("license.dat");
        
        Self {
            license_file,
            cached_info: None,
        }
    }
    
    /// 加载已保存的许可证
    pub fn load(&mut self) -> Option<&LicenseInfo> {
        if let Some(ref info) = self.cached_info {
            return Some(info);
        }
        
        if let Ok(content) = fs::read_to_string(&self.license_file) {
            if let Ok(info) = serde_json::from_str::<LicenseInfo>(&content) {
                // 验证当前机器码是否匹配
                let current_machine_id = generate_machine_id();
                if check_activation(&info.machine_id, &current_machine_id) {
                    self.cached_info = Some(info);
                    return self.cached_info.as_ref();
                }
            }
        }
        None
    }
    
    /// 保存许可证
    pub fn save(&mut self, info: &LicenseInfo) -> std::io::Result<()> {
        // 确保目录存在
        if let Some(parent) = self.license_file.parent() {
            fs::create_dir_all(parent)?;
        }
        
        let content = serde_json::to_string_pretty(info)?;
        fs::write(&self.license_file, content)?;
        self.cached_info = Some(info.clone());
        Ok(())
    }
    
    /// 删除许可证（反激活）
    pub fn remove(&mut self) -> std::io::Result<()> {
        if self.license_file.exists() {
            fs::remove_file(&self.license_file)?;
        }
        self.cached_info = None;
        Ok(())
    }
    
}

impl Default for LicenseManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_and_verify() {
        let code = generate_license_code(LicenseType::Standard, 1);
        println!("Generated: {}", code);
        
        let machine_id = generate_machine_id();
        let result = verify_license_code(&code, &machine_id);
        
        assert!(result.success);
        assert!(result.license_info.is_some());
    }

    #[test]
    fn test_invalid_code() {
        let result = verify_license_code("INVALID-CODE-HERE", "test_machine");
        assert!(!result.success);
    }
}
