// 云函数入口文件
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// ⚠️ 安全密钥 - 生产环境应该从环境变量读取
const SECRET_KEY = 'a3f8b2e1c9d4f7a6b8e3c1d9f4a7b2e8c3d1f9a4b7e2c8d3f1a9b4e7c2d8f3a1';

/**
 * getEnvConfig 云函数
 *
 * 功能：为小程序提供安全的环境配置
 * 安全措施：
 * 1. 签名验证 - 防止未授权访问
 * 2. 时间戳验证 - 防止重放攻击
 * 3. 版本检查 - 确保客户端版本兼容
 * 4. 频率限制 - 防止滥用
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  try {
    // ============ 1. 参数验证 ============
    const {
      timestamp,
      signature,
      appVersion,
      action = 'getConfig'
    } = event;

    // 检查必要参数
    if (!timestamp || !signature || !appVersion) {
      return {
        success: false,
        message: '缺少必要参数',
        code: 'MISSING_PARAMS'
      };
    }

    // ============ 2. 时间戳验证（防止重放攻击）============
    const now = Date.now();
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(now - requestTime);

    // 请求必须在5分钟内
    if (timeDiff > 5 * 60 * 1000) {
      console.warn('[getEnvConfig] 请求已过期:', {
        openid: wxContext.OPENID,
        timeDiff: timeDiff
      });
      return {
        success: false,
        message: '请求已过期，请重试',
        code: 'REQUEST_EXPIRED'
      };
    }

    // ============ 3. 签名验证 ============
    const expectedSignature = generateSignature(appVersion, timestamp);

    if (signature !== expectedSignature) {
      console.error('[getEnvConfig] 签名验证失败:', {
        openid: wxContext.OPENID,
        expected: expectedSignature,
        received: signature
      });

      // 记录安全事件
      await logSecurityEvent(wxContext, 'SIGNATURE_MISMATCH', {
        timestamp,
        appVersion
      });

      return {
        success: false,
        message: '签名验证失败',
        code: 'INVALID_SIGNATURE'
      };
    }

    // ============ 4. 版本检查 ============
    const minSupportedVersion = '1.0.0';
    if (!isVersionSupported(appVersion, minSupportedVersion)) {
      return {
        success: false,
        message: '客户端版本过低，请更新小程序',
        code: 'VERSION_TOO_OLD',
        minVersion: minSupportedVersion
      };
    }

    // ============ 5. 频率限制检查 ============
    const rateLimitResult = await checkRateLimit(wxContext.OPENID);
    if (!rateLimitResult.allowed) {
      return {
        success: false,
        message: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: rateLimitResult.retryAfter
      };
    }

    // ============ 6. 返回配置 ============
    const config = getEnvironmentConfig(appVersion);

    // 记录访问日志
    await logConfigAccess(wxContext, appVersion);

    return {
      success: true,
      data: config,
      timestamp: Date.now(),
      // 配置有效期（1小时）
      expiresAt: Date.now() + 60 * 60 * 1000
    };

  } catch (error) {
    console.error('[getEnvConfig] 错误:', error);
    return {
      success: false,
      message: '获取配置失败',
      code: 'INTERNAL_ERROR'
    };
  }
};

/**
 * 生成签名（使用与客户端一致的简化算法）
 * ⚠️ 注意：这里使用简化算法而非真正的HMAC-SHA256
 * 原因：保持与小程序端算法一致（小程序端无法使用原生crypto）
 * 生产环境可以升级为crypto-js库实现真正的HMAC-SHA256
 */
function generateSignature(appVersion, timestamp) {
  const message = `${appVersion}${timestamp}`;
  return simpleHmacSha256(message, SECRET_KEY);
}

/**
 * 简化的HMAC-SHA256实现（与客户端算法完全一致）
 */
function simpleHmacSha256(message, key) {
  let hash = 0;
  const combined = key + message + key;

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }

  // 转换为十六进制（64位）
  return Math.abs(hash).toString(16).padStart(16, '0') +
         (hash ^ 0x5A5A5A5A).toString(16).padStart(16, '0');
}

/**
 * 获取环境配置
 */
function getEnvironmentConfig(appVersion) {
  // ⚠️ 这里返回真实的云环境ID
  // 生产环境应该从环境变量或配置中心读取
  const envId = process.env.CLOUD_ENV_ID || 'cloud1-0gstm235d0aa46bb';

  return {
    // 直接返回明文环境ID（小程序端无法解密AES）
    // 安全性由签名验证、时间戳验证和频率限制保证
    envId: envId,
    // 配置版本（用于客户端缓存管理）
    configVersion: '1.0.0',
    // 其他配置
    features: {
      vipEnabled: true,
      publishEnabled: true,
      subscribeEnabled: true
    }
  };
}

/**
 * 加密环境ID（简单加密，可选）
 */
function encryptEnvId(envId) {
  // 使用Base64编码（简单混淆）
  // 生产环境可以使用更强的加密算法
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(SECRET_KEY.substring(0, 32)),
    Buffer.from(SECRET_KEY.substring(0, 16))
  );

  let encrypted = cipher.update(envId, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return encrypted;
}

/**
 * 解密环境ID（客户端不需要，仅用于测试）
 */
function decryptEnvId(encryptedEnvId) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(SECRET_KEY.substring(0, 32)),
      Buffer.from(SECRET_KEY.substring(0, 16))
    );

    let decrypted = decipher.update(encryptedEnvId, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('解密失败:', error);
    return null;
  }
}

/**
 * 检查版本是否支持
 */
function isVersionSupported(version, minVersion) {
  const v1 = version.split('.').map(Number);
  const v2 = minVersion.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (v1[i] > v2[i]) return true;
    if (v1[i] < v2[i]) return false;
  }
  return true;
}

/**
 * 频率限制检查
 */
async function checkRateLimit(openid) {
  const db = cloud.database();
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  try {
    // 查询5分钟内的访问次数
    const result = await db.collection('config_access_logs')
      .where({
        openid: openid,
        timestamp: db.command.gte(fiveMinutesAgo)
      })
      .count();

    // 每5分钟最多10次请求
    if (result.total >= 10) {
      return {
        allowed: false,
        retryAfter: 300 // 300秒后重试
      };
    }

    return { allowed: true };
  } catch (error) {
    // 如果集合不存在，允许请求
    console.warn('频率限制检查失败:', error.errMsg);
    return { allowed: true };
  }
}

/**
 * 记录配置访问日志
 */
async function logConfigAccess(wxContext, appVersion) {
  const db = cloud.database();

  try {
    await db.collection('config_access_logs').add({
      data: {
        openid: wxContext.OPENID,
        appVersion: appVersion,
        timestamp: Date.now(),
        ip: wxContext.SOURCEIP || 'unknown'
      }
    });
  } catch (error) {
    // 记录失败不影响主流程
    console.warn('记录访问日志失败:', error.errMsg);
  }
}

/**
 * 记录安全事件
 */
async function logSecurityEvent(wxContext, eventType, details) {
  const db = cloud.database();

  try {
    await db.collection('security_logs').add({
      data: {
        type: 'CONFIG_ACCESS',
        eventType: eventType,
        openid: wxContext.OPENID,
        details: details,
        timestamp: new Date(),
        ip: wxContext.SOURCEIP || 'unknown'
      }
    });
  } catch (error) {
    console.warn('记录安全事件失败:', error.errMsg);
  }
}
