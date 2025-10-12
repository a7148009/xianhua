// cloudfunctions/geocodeAddress/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 腾讯地图API密钥
const TENCENT_MAP_KEY = 'ENLBZ-LUUCQ-3SN5D-25WBS-OT3IZ-WPFF4';

/**
 * 地址解析（正向地理编码）
 * 将地址转换为经纬度坐标
 */
exports.main = async (event, context) => {
  const { address } = event;

  if (!address || typeof address !== 'string') {
    return {
      success: false,
      message: '地址参数无效'
    };
  }

  try {
    console.log('[geocodeAddress] 开始解析地址:', address);

    // 调用腾讯地图地理编码API
    const result = await cloud.callFunction({
      name: 'http',
      data: {
        url: 'https://apis.map.qq.com/ws/geocoder/v1/',
        method: 'GET',
        data: {
          address: address,
          key: TENCENT_MAP_KEY
        }
      }
    });

    // 如果云函数不支持直接HTTP请求，使用备用方案
    if (!result || !result.result) {
      console.log('[geocodeAddress] 使用备用方案：直接解析');

      // 这里需要实际调用腾讯地图API
      // 由于云函数环境限制，我们返回提示信息
      return {
        success: false,
        message: '云函数暂不支持HTTP请求，请在小程序端实现',
        needClientSide: true
      };
    }

    const data = result.result.data;
    console.log('[geocodeAddress] 腾讯地图API返回:', data);

    if (data.status === 0 && data.result && data.result.location) {
      const location = data.result.location;

      return {
        success: true,
        data: {
          latitude: location.lat,
          longitude: location.lng,
          title: data.result.title || address,
          address: data.result.address || address,
          address_components: data.result.address_components || null,
          similarity: data.result.similarity || 1,  // 地址匹配度
          deviation: data.result.deviation || 0,    // 误差范围（米）
          reliability: data.result.reliability || 0  // 可靠性（0-10）
        }
      };
    } else {
      return {
        success: false,
        message: data.message || '地址解析失败',
        status: data.status
      };
    }

  } catch (error) {
    console.error('[geocodeAddress] 错误:', error);
    return {
      success: false,
      message: '地址解析失败: ' + error.message,
      needClientSide: true
    };
  }
};
