/**
 * 系统变量管理工具
 */

// 变量缓存
let variablesCache = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

// 默认变量值（作为降级方案）
const defaultVariables = {
  // 首页相关
  home_page_title: '找鲜花信息',
  home_search_placeholder: '搜索鲜花、公司信息',
  home_work_content_label: '鲜花信息',
  home_tab_name: '找鲜花',

  // 详情页相关
  detail_page_title: '鲜花信息详情',
  detail_fee_notice: '鲜花配送费用明细公示',
  detail_safety_mode: '鲜花配送费用包括哪些项目？\n配送费用是否包含包装费用？\n订单取消后退款标准是什么？\n鲜花养护服务是否收费？',
  detail_safety_title: '鲜花平台交易保障',
  detail_warning_text: '本平台严禁商家发布虚假鲜花信息、以次充好、虚标价格等违规行为。所有鲜花信息均需真实有效，严禁欺诈消费者。平台承诺对所有交易进行监管，如发现商家违规行为将立即下架并处罚。消费者如遇到商家违规，请立即向平台举报，我们将在24小时内处理并保障您的合法权益。'
};

/**
 * 获取所有变量
 */
async function getAllVariables(forceRefresh = false) {
  const now = Date.now();

  // 如果缓存有效且不强制刷新，返回缓存
  if (!forceRefresh && variablesCache && (now - cacheTime) < CACHE_DURATION) {
    return variablesCache;
  }

  try {
    const result = await wx.cloud.callFunction({
      name: 'variableManager',
      data: {
        action: 'getAll'
      }
    });

    if (result.result && result.result.success) {
      variablesCache = result.result.data;
      cacheTime = now;

      // 保存到本地存储（作为离线降级）
      wx.setStorageSync('system_variables', variablesCache);

      return variablesCache;
    } else {
      // 云函数失败，尝试使用本地缓存
      const localCache = wx.getStorageSync('system_variables');
      if (localCache) {
        variablesCache = localCache;
        return variablesCache;
      }

      // 都失败了，使用默认值
      return defaultVariables;
    }
  } catch (error) {
    console.error('获取变量失败:', error);

    // 尝试使用本地缓存
    const localCache = wx.getStorageSync('system_variables');
    if (localCache) {
      variablesCache = localCache;
      return variablesCache;
    }

    // 使用默认值
    return defaultVariables;
  }
}

/**
 * 获取单个变量
 */
async function getVariable(key, defaultValue = '') {
  const variables = await getAllVariables();
  return variables[key] || defaultValue || defaultVariables[key] || '';
}

/**
 * 清除缓存
 */
function clearCache() {
  variablesCache = null;
  cacheTime = 0;
}

/**
 * 更新单个变量（管理员功能）
 */
async function updateVariable(key, value) {
  try {
    const result = await wx.cloud.callFunction({
      name: 'variableManager',
      data: {
        action: 'update',
        key: key,
        value: value
      }
    });

    if (result.result && result.result.success) {
      // 清除缓存，下次会重新获取
      clearCache();
      return { success: true };
    } else {
      return {
        success: false,
        message: result.result?.message || '更新失败'
      };
    }
  } catch (error) {
    console.error('更新变量失败:', error);
    return {
      success: false,
      message: error.message || '更新失败'
    };
  }
}

/**
 * 批量更新变量（管理员功能）
 */
async function batchUpdateVariables(variables) {
  try {
    const result = await wx.cloud.callFunction({
      name: 'variableManager',
      data: {
        action: 'batchUpdate',
        variables: variables
      }
    });

    if (result.result && result.result.success) {
      // 清除缓存
      clearCache();
      return { success: true };
    } else {
      return {
        success: false,
        message: result.result?.message || '批量更新失败'
      };
    }
  } catch (error) {
    console.error('批量更新变量失败:', error);
    return {
      success: false,
      message: error.message || '批量更新失败'
    };
  }
}

/**
 * 重置为默认值（管理员功能）
 */
async function resetVariables() {
  try {
    const result = await wx.cloud.callFunction({
      name: 'variableManager',
      data: {
        action: 'reset'
      }
    });

    if (result.result && result.result.success) {
      // 清除缓存
      clearCache();
      return {
        success: true,
        data: result.result.data
      };
    } else {
      return {
        success: false,
        message: result.result?.message || '重置失败'
      };
    }
  } catch (error) {
    console.error('重置变量失败:', error);
    return {
      success: false,
      message: error.message || '重置失败'
    };
  }
}

module.exports = {
  getAllVariables,
  getVariable,
  updateVariable,
  batchUpdateVariables,
  resetVariables,
  clearCache,
  defaultVariables
};
