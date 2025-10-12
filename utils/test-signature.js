/**
 * 签名测试工具
 * 用于验证客户端和服务端签名算法是否一致
 *
 * 使用方法：
 * 1. 在小程序控制台运行此脚本
 * 2. 对比输出的签名是否匹配
 */

const { generateSignature } = require('./crypto-helper.js');

/**
 * 测试签名生成
 */
function testSignature() {
  console.log('========== 签名测试 ==========');

  const appVersion = '1.0.0';
  const timestamp = Date.now().toString();

  console.log('测试参数:');
  console.log('  appVersion:', appVersion);
  console.log('  timestamp:', timestamp);
  console.log('');

  const signature = generateSignature(appVersion, timestamp);

  console.log('生成的签名:', signature);
  console.log('签名长度:', signature.length, '字符');
  console.log('');

  // 测试云函数调用
  console.log('========== 测试云函数调用 ==========');

  wx.cloud.callFunction({
    name: 'getEnvConfig',
    data: {
      timestamp: timestamp,
      signature: signature,
      appVersion: appVersion,
      action: 'getConfig'
    },
    success: (res) => {
      console.log('✅ 云函数调用成功');
      console.log('返回结果:', res.result);

      if (res.result.success) {
        console.log('');
        console.log('========== 配置信息 ==========');
        console.log('环境ID:', res.result.data.envId);
        console.log('配置版本:', res.result.data.configVersion);
        console.log('功能开关:', res.result.data.features);
        console.log('过期时间:', new Date(res.result.expiresAt).toLocaleString());
      } else {
        console.error('❌ 获取配置失败:', res.result.message);
        console.error('错误代码:', res.result.code);
      }
    },
    fail: (err) => {
      console.error('❌ 云函数调用失败');
      console.error('错误信息:', err);
    }
  });
}

/**
 * 测试不同时间戳的签名
 */
function testMultipleSignatures() {
  console.log('========== 多次签名测试 ==========');

  const appVersion = '1.0.0';

  for (let i = 0; i < 3; i++) {
    const timestamp = (Date.now() + i * 1000).toString();
    const signature = generateSignature(appVersion, timestamp);

    console.log(`测试 ${i + 1}:`);
    console.log('  timestamp:', timestamp);
    console.log('  signature:', signature);
    console.log('');
  }
}

/**
 * 测试缓存机制
 */
function testCache() {
  console.log('========== 缓存测试 ==========');

  const cache = wx.getStorageSync('__cloud_config');

  if (cache) {
    console.log('✅ 找到缓存');
    console.log('缓存内容:');
    console.log('  envId:', cache.envId);
    console.log('  configVersion:', cache.configVersion);
    console.log('  过期时间:', new Date(cache.expiresAt).toLocaleString());
    console.log('  是否过期:', Date.now() > cache.expiresAt ? '是' : '否');
    console.log('  features:', cache.features);
  } else {
    console.log('❌ 未找到缓存');
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  wx.removeStorageSync('__cloud_config');
  console.log('✅ 缓存已清除');
  console.log('请重启小程序以重新获取配置');
}

// 导出测试函数
module.exports = {
  testSignature,
  testMultipleSignatures,
  testCache,
  clearCache
};

// 如果在控制台直接运行，执行测试
if (typeof window !== 'undefined') {
  console.log('签名测试工具已加载');
  console.log('可用函数:');
  console.log('  testSignature() - 测试签名生成和云函数调用');
  console.log('  testMultipleSignatures() - 测试多个签名');
  console.log('  testCache() - 查看缓存状态');
  console.log('  clearCache() - 清除缓存');
}
