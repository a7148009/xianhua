// 初始化系统变量的云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 默认变量配置
const defaultVariables = {
  // 首页相关变量
  home_page_title: '找鲜花信息',
  home_search_placeholder: '搜索鲜花、公司信息',
  home_work_content_label: '鲜花信息',
  home_tab_name: '找鲜花',

  // 详情页相关变量
  detail_page_title: '鲜花信息详情',
  detail_fee_notice: '鲜花配送费用明细公示',
  detail_safety_mode: '鲜花配送费用包括哪些项目？\n配送费用是否包含包装费用？\n订单取消后退款标准是什么？\n鲜花养护服务是否收费？',
  detail_safety_title: '鲜花平台交易保障',
  detail_warning_text: '本平台严禁商家发布虚假鲜花信息、以次充好、虚标价格等违规行为。所有鲜花信息均需真实有效，严禁欺诈消费者。平台承诺对所有交易进行监管，如发现商家违规行为将立即下架并处罚。消费者如遇到商家违规，请立即向平台举报，我们将在24小时内处理并保障您的合法权益。'
};

exports.main = async (event, context) => {
  try {
    console.log('[initVariables] 开始初始化系统变量');

    // 直接尝试查询集合，如果不存在会报错
    let existingRecords;
    try {
      existingRecords = await db.collection('system_variables').count();
    } catch (error) {
      // 集合不存在，尝试创建（注意：小程序端无法创建集合，需要在控制台手动创建）
      console.log('[initVariables] 集合不存在，请在云开发控制台手动创建 system_variables 集合');
      return {
        success: false,
        message: '请先在云开发控制台创建 system_variables 集合',
        needCreateCollection: true
      };
    }

    if (existingRecords.total === 0) {
      // 插入默认变量
      console.log('[initVariables] 插入默认变量');
      await db.collection('system_variables').add({
        data: {
          ...defaultVariables,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      return {
        success: true,
        message: '系统变量初始化成功',
        action: 'created',
        data: defaultVariables
      };
    } else {
      console.log('[initVariables] 变量已存在，跳过初始化');

      // 获取现有数据
      const result = await db.collection('system_variables').get();

      return {
        success: true,
        message: '系统变量已存在',
        action: 'skipped',
        data: result.data[0]
      };
    }
  } catch (error) {
    console.error('[initVariables] 初始化失败:', error);
    return {
      success: false,
      message: error.message || '初始化失败',
      error: error.toString()
    };
  }
};
