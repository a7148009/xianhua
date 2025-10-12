// cloudfunctions/getDistricts/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 腾讯地图API密钥
const TENCENT_MAP_KEY = 'ENLBZ-LUUCQ-3SN5D-25WBS-OT3IZ-WPFF4';

/**
 * 获取行政区划数据
 * @param {Object} event
 * @param {number} event.latitude - 纬度
 * @param {number} event.longitude - 经度
 * @returns {Object} - { success, city, districts: string[] }
 */
exports.main = async (event, context) => {
  const { latitude, longitude } = event;

  if (!latitude || !longitude) {
    return {
      success: false,
      message: '缺少必要参数：经纬度'
    };
  }

  try {
    console.log('[getDistricts] 开始处理，经纬度:', { latitude, longitude });

    // 步骤1：通过逆地理编码获取城市和adcode
    const geocodeUrl = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${TENCENT_MAP_KEY}`;
    const geocodeResponse = await axios.get(geocodeUrl);

    console.log('[getDistricts] 逆地理编码返回:', JSON.stringify(geocodeResponse.data));

    if (geocodeResponse.data.status !== 0 || !geocodeResponse.data.result) {
      return {
        success: false,
        message: '获取城市信息失败: ' + (geocodeResponse.data.message || '未知错误')
      };
    }

    const addressComponent = geocodeResponse.data.result.address_component;
    const adInfo = geocodeResponse.data.result.ad_info;
    const city = addressComponent.city;
    const cityCode = adInfo.city_code; // 城市代码

    console.log('[getDistricts] 获取到城市:', city, 'city_code:', cityCode, 'adcode:', addressComponent.adcode);

    if (!city) {
      return {
        success: false,
        message: '无法获取城市信息'
      };
    }

    // 步骤2：使用district/v1/search接口搜索该城市
    const searchUrl = `https://apis.map.qq.com/ws/district/v1/search?keyword=${encodeURIComponent(city)}&key=${TENCENT_MAP_KEY}`;
    const searchResponse = await axios.get(searchUrl);

    console.log('[getDistricts] search API返回:', JSON.stringify(searchResponse.data));

    if (searchResponse.data.status !== 0 || !searchResponse.data.result) {
      return {
        success: false,
        message: '搜索城市失败: ' + (searchResponse.data.message || '未知错误')
      };
    }

    // 从搜索结果中找到匹配的城市
    const cityResult = searchResponse.data.result[0].find(item => item.fullname === city || item.name === city);

    if (!cityResult || !cityResult.id) {
      return {
        success: false,
        message: `未找到城市"${city}"的ID`
      };
    }

    const cityId = cityResult.id;
    console.log('[getDistricts] 找到城市ID:', cityId);

    // 步骤3：使用district/v1/getchildren接口获取该城市的下级区域
    const childrenUrl = `https://apis.map.qq.com/ws/district/v1/getchildren?id=${cityId}&key=${TENCENT_MAP_KEY}`;
    const childrenResponse = await axios.get(childrenUrl);

    console.log('[getDistricts] getchildren API返回:', JSON.stringify(childrenResponse.data));

    if (childrenResponse.data.status !== 0 || !childrenResponse.data.result) {
      return {
        success: false,
        message: '获取下级区域失败: ' + (childrenResponse.data.message || '未知错误')
      };
    }

    const children = childrenResponse.data.result[0] || [];
    const districts = children.map(district => district.fullname || district.name);

    console.log(`[getDistricts] 成功获取 ${city} 的 ${districts.length} 个下级区域:`, districts);

    return {
      success: true,
      data: {
        city: city,
        districts: districts,
        count: districts.length
      }
    };

  } catch (error) {
    console.error('[getDistricts] 错误:', error);
    console.error('[getDistricts] 错误详情:', error.response?.data || error.message);
    return {
      success: false,
      message: '获取行政区划失败: ' + (error.response?.data?.message || error.message)
    };
  }
};
