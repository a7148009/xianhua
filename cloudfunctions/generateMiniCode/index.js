// 云函数：生成小程序码
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 生成小程序码云函数
 * 支持无限制小程序码、普通小程序码、URL Link
 */
exports.main = async (event, context) => {
  const { action = 'getUnlimited' } = event;

  try {
    switch (action) {
      case 'getUnlimited':
        return await generateUnlimitedCode(event);
      case 'getUrlLink':
        return await generateUrlLink(event);
      case 'getQRCode':
        return await generateQRCode(event);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('[generateMiniCode] 错误:', error);
    return {
      success: false,
      message: error.message || '生成失败',
      error: error.toString()
    };
  }
};

/**
 * 生成无限制小程序码（推荐）
 * 参数通过scene传递，最多32个字符
 */
async function generateUnlimitedCode(event) {
  const {
    scene,              // 场景值，如：t=XK7M9P&p=pageId
    page = 'pages/index/index',  // 落地页路径
    width = 430,        // 二维码宽度（最小280，最大1280）
    autoColor = false,  // 自动配置线条颜色
    lineColor = { r: 0, g: 0, b: 0 },  // 线条颜色
    isHyaline = true    // 是否透明底色
  } = event;

  try {
    console.log('[generateUnlimitedCode] 生成参数:', { scene, page, width });

    if (!scene) {
      throw new Error('scene参数不能为空');
    }

    if (scene.length > 32) {
      throw new Error('scene参数不能超过32个字符');
    }

    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: scene,
      page: page,
      width: width,
      autoColor: autoColor,
      lineColor: lineColor,
      isHyaline: isHyaline
    });

    console.log('[generateUnlimitedCode] ✅ 生成成功');

    // 返回Buffer数据
    return {
      success: true,
      contentType: result.contentType,
      buffer: result.buffer,
      message: '小程序码生成成功'
    };
  } catch (error) {
    console.error('[generateUnlimitedCode] ❌ 生成失败:', error);
    throw new Error(`生成无限制小程序码失败: ${error.message}`);
  }
}

/**
 * 生成普通小程序码
 * 适合固定路径，最多10万个
 */
async function generateQRCode(event) {
  const {
    path,               // 完整路径，如：pages/index/index?id=123
    width = 430
  } = event;

  try {
    console.log('[generateQRCode] 生成参数:', { path, width });

    if (!path) {
      throw new Error('path参数不能为空');
    }

    const result = await cloud.openapi.wxacode.get({
      path: path,
      width: width
    });

    console.log('[generateQRCode] ✅ 生成成功');

    return {
      success: true,
      contentType: result.contentType,
      buffer: result.buffer,
      message: '小程序码生成成功'
    };
  } catch (error) {
    console.error('[generateQRCode] ❌ 生成失败:', error);
    throw new Error(`生成小程序码失败: ${error.message}`);
  }
}

/**
 * 生成URL Link（短链接）
 * 可以在微信外打开小程序
 */
async function generateUrlLink(event) {
  const {
    path = 'pages/index/index',
    query = '',
    expireType = 1,     // 0-永久有效 1-失效时间
    expireInterval = 30, // 天数（最多180天）
    envVersion = 'release'  // release-正式版 trial-体验版 develop-开发版
  } = event;

  try {
    console.log('[generateUrlLink] 生成参数:', { path, query, expireInterval });

    const result = await cloud.openapi.urllink.generate({
      path: path,
      query: query,
      expire_type: expireType,
      expire_interval: expireInterval,
      env_version: envVersion
    });

    console.log('[generateUrlLink] ✅ 生成成功:', result.url_link);

    return {
      success: true,
      url_link: result.url_link,  // https://wxaurl.cn/xxx
      message: 'URL Link生成成功'
    };
  } catch (error) {
    console.error('[generateUrlLink] ❌ 生成失败:', error);
    throw new Error(`生成URL Link失败: ${error.message}`);
  }
}
