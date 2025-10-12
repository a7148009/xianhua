/**
 * 联系方式智能解析工具
 * 支持识别电话号码和微信号
 */

/**
 * 智能识别并提取文本中的电话号码
 * @param {string} text - 待解析的文本
 * @returns {Array} 电话号码数组
 */
function extractPhoneNumbers(text) {
  if (!text || typeof text !== 'string') return [];

  const phones = [];

  // 匹配模式(按优先级排序)
  const patterns = [
    // 1. 带标识的电话(电话:、电话：、手机:、手机：、联系电话:等)
    /(?:电话|手机|联系电话|联系方式|TEL|Tel|tel|Phone|phone|☎️|📞)[：:]\s*(\d{3,4}[-\s]?\d{7,8}|\d{11})/gi,

    // 2. 固定电话格式: 0xx-xxxxxxxx 或 0xxx-xxxxxxx
    /\b0\d{2,3}[-\s]?\d{7,8}\b/g,

    // 3. 11位手机号(1开头)
    /\b1[3-9]\d{9}\b/g,

    // 4. 带括号的区号: (0xx)xxxxxxxx
    /\(\d{3,4}\)\d{7,8}/g,

    // 5. 带空格或短横线的手机号: 138 0000 0000 或 138-0000-0000
    /\b1[3-9]\d\s?\d{4}\s?\d{4}\b/g,

    // 6. 400/800电话
    /\b[48]00[-\s]?\d{3}[-\s]?\d{4}\b/g
  ];

  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // 获取完整匹配或捕获组
      let phone = match[1] || match[0];
      // 清理电话号码(移除空格、短横线等)
      phone = phone.replace(/[-\s]/g, '');

      // 验证电话号码格式
      if (isValidPhone(phone) && !phones.includes(phone)) {
        phones.push(phone);
      }
    }
  });

  return phones;
}

/**
 * 智能识别并提取文本中的微信号
 * @param {string} text - 待解析的文本
 * @returns {Array} 微信号数组
 */
function extractWeChatIDs(text) {
  if (!text || typeof text !== 'string') return [];

  const wechatIds = [];

  // 匹配模式(按优先级排序)
  const patterns = [
    // 1. 带标识的微信(微信:、微信：、VX:、vx:、WX:、wx:、weixin:等)
    /(?:微信|VX|vx|WX|wx|V信|weixin|WeChat|wechat)[：:号]?\s*([a-zA-Z][a-zA-Z0-9_-]{5,19})/gi,

    // 2. 微信号同手机号的情况
    /(?:微信|VX|vx|WX|wx|V信)[：:号]?\s*(?:同号|手机号|电话号|一致|相同)/gi,

    // 3. 微信号为纯数字的情况(如QQ号转微信)
    /(?:微信|VX|vx|WX|wx|V信)[：:号]?\s*(\d{5,11})/gi,

    // 4. 独立的可能是微信号的字符串(字母开头,6-20位字母数字下划线短横线)
    /\b[a-zA-Z][a-zA-Z0-9_-]{5,19}\b/g
  ];

  patterns.forEach((pattern, index) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // 处理"微信同号"的情况
      if (index === 1) {
        wechatIds.push('SAME_AS_PHONE'); // 特殊标记
        continue;
      }

      // 获取完整匹配或捕获组
      let wechatId = match[1] || match[0];
      wechatId = wechatId.trim();

      // 验证微信号格式(对于pattern[3]的独立字符串,需要更严格的验证)
      if (index === 3) {
        // 排除常见的非微信号关键词
        const excludeWords = ['电话', '手机', '联系', '公司', '地址', '工作', '职位',
                             'phone', 'email', 'address', 'company'];
        if (excludeWords.some(word => wechatId.toLowerCase().includes(word))) {
          continue;
        }
      }

      if (isValidWeChatID(wechatId) && !wechatIds.includes(wechatId)) {
        wechatIds.push(wechatId);
      }
    }
  });

  return wechatIds;
}

/**
 * 验证电话号码格式
 * @param {string} phone - 电话号码
 * @returns {boolean}
 */
function isValidPhone(phone) {
  if (!phone) return false;

  // 11位手机号(1开头)
  if (/^1[3-9]\d{9}$/.test(phone)) return true;

  // 固定电话(3-4位区号 + 7-8位号码)
  if (/^0\d{2,3}\d{7,8}$/.test(phone)) return true;

  // 400/800电话
  if (/^[48]00\d{7}$/.test(phone)) return true;

  return false;
}

/**
 * 验证微信号格式
 * @param {string} wechatId - 微信号
 * @returns {boolean}
 */
function isValidWeChatID(wechatId) {
  if (!wechatId) return false;

  // 微信号规则:
  // 1. 6-20位
  // 2. 字母开头
  // 3. 字母、数字、下划线、短横线
  if (/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(wechatId)) return true;

  // 纯数字微信号(QQ号转微信,5-11位)
  if (/^\d{5,11}$/.test(wechatId)) return true;

  return false;
}

/**
 * 解析内容中的所有联系方式
 * @param {string} content - 待解析的内容
 * @returns {Object} 包含电话和微信的对象
 */
function parseContactInfo(content) {
  if (!content) {
    return {
      phones: [],
      wechats: [],
      hasContact: false
    };
  }

  const phones = extractPhoneNumbers(content);
  let wechats = extractWeChatIDs(content);

  // 处理"微信同号"的情况
  if (wechats.includes('SAME_AS_PHONE') && phones.length > 0) {
    wechats = wechats.filter(w => w !== 'SAME_AS_PHONE');
    // 将手机号添加为微信号
    wechats.push(...phones);
  }

  // 去重
  const uniquePhones = [...new Set(phones)];
  const uniqueWechats = [...new Set(wechats)];

  return {
    phones: uniquePhones,
    wechats: uniqueWechats,
    hasContact: uniquePhones.length > 0 || uniqueWechats.length > 0
  };
}

/**
 * 根据用户权限隐藏联系方式
 * @param {string} contact - 联系方式(电话或微信)
 * @param {string} type - 类型: 'phone' 或 'wechat'
 * @param {boolean} isVipOrAdmin - 是否是VIP或管理员
 * @returns {string} 处理后的联系方式
 */
function maskContact(contact, type, isVipOrAdmin) {
  if (isVipOrAdmin) {
    return contact; // VIP和管理员显示完整信息
  }

  // 普通用户显示星号
  if (type === 'phone') {
    if (contact.length === 11) {
      // 手机号: 显示前3位和后4位
      return contact.substring(0, 3) + '****' + contact.substring(7);
    } else {
      // 固定电话: 显示前3位和后2位
      return contact.substring(0, 3) + '***' + contact.substring(contact.length - 2);
    }
  } else if (type === 'wechat') {
    if (contact.length <= 6) {
      return '***';
    } else if (contact.length <= 10) {
      // 短微信号: 显示前2位和后2位
      return contact.substring(0, 2) + '***' + contact.substring(contact.length - 2);
    } else {
      // 长微信号: 显示前3位和后3位
      return contact.substring(0, 3) + '****' + contact.substring(contact.length - 3);
    }
  }

  return '***';
}

/**
 * 格式化联系方式显示
 * @param {Object} contactInfo - 联系方式信息
 * @param {boolean} isVipOrAdmin - 是否是VIP或管理员
 * @returns {Object} 格式化后的联系方式
 */
function formatContactDisplay(contactInfo, isVipOrAdmin) {
  const { phones, wechats } = contactInfo;

  return {
    phones: phones.map(phone => maskContact(phone, 'phone', isVipOrAdmin)),
    wechats: wechats.map(wechat => maskContact(wechat, 'wechat', isVipOrAdmin)),
    showVipTip: !isVipOrAdmin && (phones.length > 0 || wechats.length > 0)
  };
}

module.exports = {
  extractPhoneNumbers,
  extractWeChatIDs,
  parseContactInfo,
  maskContact,
  formatContactDisplay,
  isValidPhone,
  isValidWeChatID
};
