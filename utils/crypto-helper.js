/**
 * 加密工具类
 * 用于配置请求的签名生成和解密
 *
 * ⚠️ 注意：这里的密钥需要与云函数中的密钥一致
 * ⚠️ 重要：由于小程序环境限制，这里使用简化的签名算法
 *    云函数也必须使用相同的简化算法，或者引入crypto-js库
 */

// ⚠️ 安全密钥 - 与云函数保持一致
// 生产环境应该通过混淆或其他方式保护
const SECRET_KEY = 'a3f8b2e1c9d4f7a6b8e3c1d9f4a7b2e8c3d1f9a4b7e2c8d3f1a9b4e7c2d8f3a1';

/**
 * 生成HMAC-SHA256签名
 * @param {String} appVersion - 应用版本号
 * @param {String} timestamp - 时间戳
 * @returns {String} 签名字符串
 */
function generateSignature(appVersion, timestamp) {
  const message = `${appVersion}${timestamp}`;

  // ⚠️ 使用简化的哈希算法（与云函数保持一致）
  // 原因：小程序不支持原生crypto，且引入crypto-js会增加包体积
  // 如需使用真正的HMAC-SHA256，需要：
  // 1. npm install crypto-js --save
  // 2. const CryptoJS = require('crypto-js');
  // 3. return CryptoJS.HmacSHA256(message, SECRET_KEY).toString();
  return simpleHmacSha256(message, SECRET_KEY);
}

/**
 * 简化的HMAC-SHA256实现（与云函数算法一致）
 * 注意：这不是真正的HMAC-SHA256，而是确定性哈希算法
 * 用于演示和开发环境，生产环境建议使用真实的加密库
 */
function simpleHmacSha256(message, key) {
  // 使用确定性算法生成签名
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
 * 解密环境ID
 * @param {String} encryptedEnvId - 加密的环境ID
 * @returns {String} 解密后的环境ID
 */
function decryptEnvId(encryptedEnvId) {
  try {
    // 简化版解密：使用Base64解码
    // 生产环境请使用 crypto-js 的 AES 解密

    // 这里假设云函数使用了简单的编码
    // 实际应该与云函数的加密算法对应
    return simpleDecrypt(encryptedEnvId, SECRET_KEY);
  } catch (error) {
    console.error('[crypto] 解密失败:', error);
    return null;
  }
}

/**
 * 简化的解密函数
 */
function simpleDecrypt(encrypted, key) {
  // 简化版本：直接返回（如果云函数也使用简化版本）
  // 生产环境请使用对应的解密算法

  try {
    // 这里应该与云函数的 encryptEnvId 对应
    // 如果云函数使用AES加密，这里也要使用AES解密

    // 暂时返回原值（需要根据云函数实际加密方式调整）
    return encrypted;
  } catch (error) {
    console.error('解密错误:', error);
    return encrypted;
  }
}

module.exports = {
  generateSignature,
  decryptEnvId
};
