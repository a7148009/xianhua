// ⚠️ 安全提示：
// 1. 生产环境的云环境ID从服务端获取，不再硬编码
// 2. 本地缓存配置，减少网络请求
// 3. 开发环境可以使用测试环境ID作为降级方案

const { generateSignature, decryptEnvId } = require('./crypto-helper.js');

const ENV_CONFIG = {
  // 环境ID不再硬编码，由 getCloudEnvId() 动态获取
  CLOUD_ENV_ID: '',
  PROJECT_NAME: '鲜花发布系统',
  PROJECT_VERSION: '1.0.0',
  CLOUD_FUNCTION_ROOT: 'cloudfunctions/',
  CLOUD_FUNCTION_TIMEOUT: 10,
  CLOUD_FUNCTION_MEMORY: 256,
  NODE_ENV: 'production', // 改为生产模式
  isDevelopment: false,
  isProduction: true
};

// 缓存管理
let envIdCache = null;
let cacheExpireTime = 0;
let isFetchingConfig = false;
let fetchPromise = null;

/**
 * 获取云环境ID
 * 优先级：本地缓存 > 服务端获取 > 降级方案
 */
function getCloudEnvId() {
  // 1. 检查内存缓存
  if (envIdCache && Date.now() < cacheExpireTime) {
    return Promise.resolve(envIdCache);
  }

  // 2. 检查本地存储缓存
  try {
    const cachedConfig = wx.getStorageSync('__cloud_config');
    if (cachedConfig && cachedConfig.expiresAt > Date.now()) {
      envIdCache = cachedConfig.envId;
      cacheExpireTime = cachedConfig.expiresAt;
      console.log('[env-config] 使用本地缓存的环境ID');
      return Promise.resolve(envIdCache);
    }
  } catch (e) {
    console.warn('[env-config] 读取本地缓存失败:', e);
  }

  // 3. 从服务端获取（避免并发请求）
  if (isFetchingConfig && fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetchEnvIdFromServer();
  return fetchPromise;
}

/**
 * 从服务端获取环境ID
 */
async function fetchEnvIdFromServer() {
  isFetchingConfig = true;

  try {
    console.log('[env-config] 从服务端获取环境配置...');

    // 准备请求参数
    const timestamp = Date.now().toString();
    const appVersion = ENV_CONFIG.PROJECT_VERSION;

    // 生成签名
    const signature = generateSignature(appVersion, timestamp);

    // 调用云函数获取配置
    const result = await wx.cloud.callFunction({
      name: 'getEnvConfig',
      data: {
        timestamp: timestamp,
        signature: signature,
        appVersion: appVersion,
        action: 'getConfig'
      }
    });

    if (result.errMsg !== 'cloud.callFunction:ok') {
      throw new Error('云函数调用失败: ' + result.errMsg);
    }

    const response = result.result;

    if (!response.success) {
      throw new Error(response.message || '获取配置失败');
    }

    // 解密环境ID（如果加密了）
    let envId = response.data.envId;

    // ⚠️ 云函数返回的envId已经是加密的hex字符串
    // 由于小程序端无法使用Node.js crypto模块进行AES解密
    // 有两种方案：
    // 方案1: 云函数直接返回明文envId（当前使用）
    // 方案2: 引入crypto-js库进行解密

    // 暂时直接使用返回值（云函数需要修改为返回明文或Base64编码）
    // 如果envId看起来像加密数据（很长的hex字符串），尝试解密
    if (envId && envId.length > 50 && /^[0-9a-f]+$/i.test(envId)) {
      // 这是加密数据，需要解密
      console.warn('[env-config] 收到加密的envId，但小程序端暂不支持AES解密');
      console.warn('[env-config] 建议云函数直接返回明文envId或使用crypto-js库');
      // 降级：使用fallback
      throw new Error('无法解密环境ID');
    }

    // 保存到缓存
    envIdCache = envId;
    cacheExpireTime = response.expiresAt || (Date.now() + 60 * 60 * 1000);

    // 保存到本地存储
    try {
      wx.setStorageSync('__cloud_config', {
        envId: envId,
        expiresAt: cacheExpireTime,
        configVersion: response.data.configVersion,
        features: response.data.features,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('[env-config] 保存本地缓存失败:', e);
    }

    console.log('[env-config] ✅ 成功从服务端获取环境配置');
    isFetchingConfig = false;
    fetchPromise = null;

    return envId;

  } catch (error) {
    console.error('[env-config] ❌ 从服务端获取配置失败:', error);

    isFetchingConfig = false;
    fetchPromise = null;

    // 获取配置失败，抛出错误
    throw new Error('无法从服务端获取环境配置: ' + error.message);
  }
}

function getEnvConfig() {
  return ENV_CONFIG;
}

/**
 * 输出环境配置信息（仅开发环境，且不输出敏感信息）
 */
function logEnvConfig() {
  // 仅在开发环境输出日志
  if (ENV_CONFIG.isDevelopment) {
    console.log('=== 环境配置信息 ===');
    // ⚠️ 不再输出云环境ID，避免敏感信息泄露
    console.log('项目名称:', ENV_CONFIG.PROJECT_NAME);
    console.log('项目版本:', ENV_CONFIG.PROJECT_VERSION);
    console.log('运行环境:', ENV_CONFIG.NODE_ENV);
    console.log('==================');
  }
  // 生产环境不输出任何日志
}

module.exports = {
  ENV_CONFIG,
  getCloudEnvId,
  getEnvConfig,
  logEnvConfig
};
