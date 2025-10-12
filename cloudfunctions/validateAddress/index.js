// cloudfunctions/validateAddress/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 从地址中智能提取城市和区域信息
 * @param {string} address - 完整地址
 * @returns {object} - { city, district }
 */
function extractCityAndDistrict(address) {
  console.log('[validateAddress] 开始解析地址:', address);

  // 规范化地址（去除空格、全角转半角）
  address = address.replace(/\s+/g, '').replace(/[\uff00-\uffff]/g, (c) => {
    return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
  });

  // 常见城市列表（可以根据实际情况扩展）
  const cityPatterns = [
    { names: ['昆明市', '昆明', 'kunming', 'km'], standard: '昆明市' },
    { names: ['北京市', '北京', 'beijing', 'bj'], standard: '北京市' },
    { names: ['上海市', '上海', 'shanghai', 'sh'], standard: '上海市' },
    { names: ['广州市', '广州', 'guangzhou', 'gz'], standard: '广州市' },
    { names: ['深圳市', '深圳', 'shenzhen', 'sz'], standard: '深圳市' },
    { names: ['成都市', '成都', 'chengdu', 'cd'], standard: '成都市' },
    { names: ['重庆市', '重庆', 'chongqing', 'cq'], standard: '重庆市' },
    { names: ['杭州市', '杭州', 'hangzhou', 'hz'], standard: '杭州市' },
    { names: ['西安市', '西安', 'xian', 'xa'], standard: '西安市' },
    { names: ['武汉市', '武汉', 'wuhan', 'wh'], standard: '武汉市' }
  ];

  // 提取城市（支持多种表达方式）
  let city = '';
  const addressLower = address.toLowerCase();

  for (const cityPattern of cityPatterns) {
    for (const name of cityPattern.names) {
      if (address.includes(name) || addressLower.includes(name.toLowerCase())) {
        city = cityPattern.standard;
        break;
      }
    }
    if (city) break;
  }

  // 提取区域（支持多种格式）
  let district = '';

  // 方法1: 标准格式（带区/县/市后缀）
  const standardDistrictMatch = address.match(/([\u4e00-\u9fa5]{2,}(?:区|县|市辖区))/);
  if (standardDistrictMatch) {
    district = standardDistrictMatch[1];
  }

  // 方法2: 特殊区域（新区、开发区、度假区等）
  if (!district) {
    const specialDistrictMatch = address.match(/([\u4e00-\u9fa5]{2,}(?:新区|开发区|高新区|经开区|度假区|工业区|保税区))/);
    if (specialDistrictMatch) {
      district = specialDistrictMatch[1];
    }
  }

  // 方法3: 不带后缀的区域名（如：官渡、五华、盘龙等）
  // 昆明市常见区域关键词
  if (!district && city === '昆明市') {
    const kmDistricts = [
      '五华', '盘龙', '官渡', '西山', '东川',
      '呈贡', '晋宁', '富民', '宜良', '石林',
      '嵩明', '禄劝', '寻甸', '安宁',
      '滇池度假', '滇池旅游度假', '经开', '高新'
    ];

    for (const districtName of kmDistricts) {
      if (address.includes(districtName)) {
        // 自动补全后缀
        if (districtName === '滇池度假' || districtName === '滇池旅游度假') {
          district = '滇池度假区';
        } else if (districtName === '经开') {
          district = '经开区';
        } else if (districtName === '高新') {
          district = '高新区';
        } else if (!districtName.endsWith('区') && !districtName.endsWith('县') && !districtName.endsWith('市')) {
          district = districtName + '区';
        } else {
          district = districtName;
        }
        break;
      }
    }
  }

  console.log('[validateAddress] 提取结果 - 城市:', city, '区域:', district);

  return { city, district };
}

/**
 * 智能匹配区域
 * @param {string} inputDistrict - 用户输入的区域名称
 * @param {object} configArea - 配置的区域对象
 * @returns {boolean} - 是否匹配
 */
function matchDistrict(inputDistrict, configArea) {
  if (!inputDistrict || !configArea) return false;

  // 清理输入的区域名称（去除区/县/市后缀）
  const cleanInput = inputDistrict
    .replace(/市辖区|区|县|市/g, '')
    .replace(/\s+/g, '')
    .trim();

  // 清理配置区域名称
  const cleanConfigName = configArea.name
    .replace(/市辖区|区|县|市/g, '')
    .replace(/\s+/g, '')
    .trim();

  // 方法1: 精确匹配
  if (configArea.name === inputDistrict ||
      cleanConfigName === cleanInput ||
      configArea.name === cleanInput + '区' ||
      configArea.name === cleanInput + '县') {
    return true;
  }

  // 方法2: 从code字段提取区域名
  if (configArea.code && configArea.code.includes('_')) {
    const codeParts = configArea.code.split('_');
    if (codeParts.length >= 3) {
      const codeDistrictName = codeParts[2];
      const cleanCodeName = codeDistrictName.replace(/市辖区|区|县|市/g, '').trim();

      if (codeDistrictName === inputDistrict ||
          cleanCodeName === cleanInput ||
          codeDistrictName.includes(cleanInput) ||
          cleanInput.includes(cleanCodeName)) {
        return true;
      }
    }
  }

  // 方法3: 模糊匹配（支持部分匹配）
  if (cleanConfigName.includes(cleanInput) || cleanInput.includes(cleanConfigName)) {
    return true;
  }

  // 方法4: 特殊区域别名匹配
  const aliasMap = {
    '滇池度假': ['滇池', '度假区', '滇池旅游', '滇池度假区'],
    '经开': ['经济开发', '经济开发区', '经开区'],
    '高新': ['高新技术', '高新区', '高新技术开发区']
  };

  for (const [key, aliases] of Object.entries(aliasMap)) {
    if (cleanInput.includes(key) || aliases.some(alias => cleanInput.includes(alias))) {
      if (cleanConfigName.includes(key) || aliases.some(alias => configArea.name.includes(alias))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 验证地址是否在运营范围内
 * @param {object} event - { address: string }
 * @returns {object} - { success, valid, city, district, matchedArea, message }
 */
async function validateAddress(event) {
  const { address } = event;

  if (!address || typeof address !== 'string') {
    return {
      success: false,
      message: '地址参数无效'
    };
  }

  try {
    // 1. 从地址中提取城市和区域
    const { city, district } = extractCityAndDistrict(address);

    if (!city) {
      return {
        success: true,
        valid: false,
        message: '无法识别城市，请检查输入的地址'
      };
    }

    if (!district) {
      return {
        success: true,
        valid: false,
        message: '无法识别区域，请检查输入的地址'
      };
    }

    // 2. 查询该城市下的所有运营区域
    const areaResult = await db.collection('system_config')
      .where({
        type: 'area',
        city: city,
        enabled: true
      })
      .get();

    console.log('[validateAddress] 查询到的运营区域:', areaResult.data.length, '个');

    if (areaResult.data.length === 0) {
      return {
        success: true,
        valid: false,
        city: city,
        district: district,
        message: `当前城市"${city}"暂未开通服务`
      };
    }

    // 3. 智能匹配区域
    let matchedArea = null;
    for (const configArea of areaResult.data) {
      if (matchDistrict(district, configArea)) {
        matchedArea = configArea;
        console.log('[validateAddress] 匹配到区域:', configArea.name);
        break;
      }
    }

    if (!matchedArea) {
      // 获取所有可用区域名称
      const availableAreas = areaResult.data.map(a => a.name).join('、');

      return {
        success: true,
        valid: false,
        city: city,
        district: district,
        message: `当前选择的"${district}"暂未开通服务，当前${city}已开通区域：${availableAreas}`
      };
    }

    // 4. 验证通过
    return {
      success: true,
      valid: true,
      city: city,
      district: district,
      matchedArea: {
        _id: matchedArea._id,
        name: matchedArea.name,
        code: matchedArea.code
      },
      message: '地址验证通过'
    };

  } catch (error) {
    console.error('[validateAddress] 错误:', error);
    return {
      success: false,
      message: '验证地址时发生错误: ' + error.message
    };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  console.log('[validateAddress] 云函数调用，参数:', event);

  return await validateAddress(event);
};
