// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 默认变量配置
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
  detail_warning_text: '本平台严禁商家发布虚假鲜花信息、以次充好、虚标价格等违规行为。所有鲜花信息均需真实有效，严禁欺诈消费者。平台承诺对所有交易进行监管，如发现商家违规行为将立即下架并处罚。消费者如遇到商家违规，请立即向平台举报，我们将在24小时内处理并保障您的合法权益。',

  // TabBar相关
  more_tab_name: '更多',

  // 公众号相关
  official_account_name: '昆明鲜花信息',
  official_account_desc: '提供昆明地区最新最全的鲜花行业资讯信息',
  official_account_qrcode: '',
  official_account_template_id: ''
};

// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'getAll':
        return await getAllVariables();
      case 'update':
        return await updateVariable(event);
      case 'batchUpdate':
        return await batchUpdateVariables(event);
      case 'reset':
        return await resetVariables();
      default:
        return {
          success: false,
          message: '未知操作类型'
        };
    }
  } catch (error) {
    console.error('云函数执行错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取所有变量
 */
async function getAllVariables() {
  try {
    const { data } = await db.collection('system_variables')
      .limit(1)
      .get();

    // 如果没有数据，创建默认配置
    if (data.length === 0) {
      await db.collection('system_variables').add({
        data: {
          ...defaultVariables,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      return {
        success: true,
        data: defaultVariables
      };
    }

    return {
      success: true,
      data: data[0]
    };
  } catch (error) {
    console.error('获取变量失败:', error);
    return {
      success: false,
      message: '获取变量失败',
      error: error.message
    };
  }
}

/**
 * 更新单个变量
 */
async function updateVariable(event) {
  try {
    const { key, value } = event;

    if (!key || value === undefined) {
      return {
        success: false,
        message: '缺少必要参数'
      };
    }

    // 获取现有配置
    const { data } = await db.collection('system_variables')
      .limit(1)
      .get();

    if (data.length === 0) {
      return {
        success: false,
        message: '配置不存在，请先初始化'
      };
    }

    // 更新变量
    await db.collection('system_variables')
      .doc(data[0]._id)
      .update({
        data: {
          [key]: value,
          updateTime: db.serverDate()
        }
      });

    return {
      success: true,
      message: '更新成功'
    };
  } catch (error) {
    console.error('更新变量失败:', error);
    return {
      success: false,
      message: '更新失败',
      error: error.message
    };
  }
}

/**
 * 批量更新变量
 */
async function batchUpdateVariables(event) {
  try {
    const { variables } = event;

    if (!variables || typeof variables !== 'object') {
      return {
        success: false,
        message: '变量数据格式错误'
      };
    }

    // 获取现有配置
    const { data } = await db.collection('system_variables')
      .limit(1)
      .get();

    if (data.length === 0) {
      return {
        success: false,
        message: '配置不存在，请先初始化'
      };
    }

    // 批量更新
    await db.collection('system_variables')
      .doc(data[0]._id)
      .update({
        data: {
          ...variables,
          updateTime: db.serverDate()
        }
      });

    return {
      success: true,
      message: '批量更新成功'
    };
  } catch (error) {
    console.error('批量更新变量失败:', error);
    return {
      success: false,
      message: '批量更新失败',
      error: error.message
    };
  }
}

/**
 * 重置为默认值
 */
async function resetVariables() {
  try {
    // 获取现有配置
    const { data } = await db.collection('system_variables')
      .limit(1)
      .get();

    if (data.length === 0) {
      // 创建默认配置
      await db.collection('system_variables').add({
        data: {
          ...defaultVariables,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    } else {
      // 重置为默认值
      await db.collection('system_variables')
        .doc(data[0]._id)
        .update({
          data: {
            ...defaultVariables,
            updateTime: db.serverDate()
          }
        });
    }

    return {
      success: true,
      message: '重置成功',
      data: defaultVariables
    };
  } catch (error) {
    console.error('重置变量失败:', error);
    return {
      success: false,
      message: '重置失败',
      error: error.message
    };
  }
}
