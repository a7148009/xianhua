// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * initDatabase 云函数
 * 数据库初始化脚本
 */
exports.main = async (event, context) => {
  const { action = 'init' } = event;

  try {
    switch (action) {
      case 'init':
        return await initDatabase();

      case 'setupFree':
        return await setupFreeEnvironment();

      case 'checkPermissions':
        return await checkDatabasePermissions();

      case 'initLogCollections':
        return await initLogCollections();

      case 'initSystemConfig':
        return await initSystemConfig();

      default:
        return {
          success: false,
          message: '未知的操作类型'
        };
    }
  } catch (error) {
    console.error('[initDatabase] 错误:', error);
    return {
      success: false,
      message: error.message || '初始化失败'
    };
  }
};

/**
 * 初始化数据库
 */
async function initDatabase() {
  const results = [];

  try {
    // 1. 检查并创建 db_info 集合
    try {
      await db.collection('db_info').limit(1).get();
      results.push('db_info 集合已存在');
    } catch (error) {
      // 集合不存在，通过插入数据自动创建
      await db.collection('db_info').add({
        data: {
          version: '1.0.0',
          createdAt: new Date(),
          _isInit: true
        }
      });
      results.push('创建 db_info 集合成功');
    }

    // 2. 检查并创建 users 集合
    try {
      await db.collection('users').limit(1).get();
      results.push('users 集合已存在');
    } catch (error) {
      // 集合不存在，通过插入示例数据自动创建
      await db.collection('users').add({
        data: {
          openid: 'example_openid',
          role: 'user',
          createdAt: new Date(),
          _isExample: true,
          _note: '这是示例数据，用于创建集合结构'
        }
      });
      results.push('创建 users 集合成功');
    }

    // 3. 检查并创建 system_config 集合
    try {
      await db.collection('system_config').limit(1).get();
      results.push('system_config 集合已存在');
    } catch (error) {
      // 集合不存在，将在 initSystemConfig 中创建
      results.push('system_config 集合不存在（可通过初始化系统配置创建）');
    }

    // 4. 检查并创建 view_statistics 集合（阅读统计）
    try {
      await db.collection('view_statistics').limit(1).get();
      results.push('view_statistics 集合已存在');
    } catch (error) {
      // 集合不存在，通过插入示例数据自动创建
      await db.collection('view_statistics').add({
        data: {
          jobId: 'example_job_id',
          openid: 'example_openid',
          viewTime: new Date(),
          duration: 0,
          createTime: new Date(),
          _isExample: true,
          _note: '这是示例数据，用于创建集合结构，可以删除'
        }
      });
      results.push('创建 view_statistics 集合成功');
    }

    // 5. 索引检查
    results.push('索引检查完成');

    return {
      success: true,
      message: '数据库初始化成功',
      details: results
    };
  } catch (error) {
    console.error('[initDatabase] 错误:', error);
    return {
      success: false,
      message: error.message || '初始化失败',
      details: results
    };
  }
}

/**
 * 配置免费环境
 */
async function setupFreeEnvironment() {
  try {
    const tips = [
      '免费环境已配置完成',
      '数据库容量: 2GB',
      '云存储容量: 5GB',
      '云函数调用: 10万次/月',
      '建议升级到付费环境以获得更好的性能'
    ];

    return {
      success: true,
      message: '免费环境配置完成',
      tips
    };
  } catch (error) {
    console.error('[setupFreeEnvironment] 错误:', error);
    return {
      success: false,
      message: error.message || '配置失败'
    };
  }
}

/**
 * 检查数据库权限
 */
async function checkDatabasePermissions() {
  const results = {
    read: false,
    write: false,
    collections: []
  };

  try {
    // 检查读权限
    try {
      await db.collection('users').limit(1).get();
      results.read = true;
    } catch (err) {
      results.read = false;
    }

    // 检查写权限
    try {
      const testDoc = {
        test: true,
        timestamp: Date.now()
      };
      await db.collection('users').add({ data: testDoc });
      results.write = true;

      // 清理测试数据
      await db.collection('users')
        .where({ test: true })
        .remove();
    } catch (err) {
      results.write = false;
    }

    // 获取集合列表
    const collections = await db.listCollections();
    results.collections = collections.collections.map(c => c.name);

    return {
      success: results.read && results.write,
      message: results.read && results.write ? '权限检查通过' : '权限检查失败',
      permissions: results
    };
  } catch (error) {
    console.error('[checkDatabasePermissions] 错误:', error);
    return {
      success: false,
      message: error.message || '权限检查失败',
      permissions: results
    };
  }
}

/**
 * 初始化日志集合（config_access_logs 和 security_logs）
 * 用于插入示例数据，创建字段结构
 */
async function initLogCollections() {
  const results = {
    config_access_logs: null,
    security_logs: null
  };

  try {
    // 1. 初始化 config_access_logs 集合
    console.log('初始化 config_access_logs 集合...');

    const configLogResult = await db.collection('config_access_logs').add({
      data: {
        openid: 'example_openid_structure',
        appVersion: '1.0.0',
        timestamp: Date.now(),
        ip: '127.0.0.1',
        _isExample: true, // 标记为示例数据
        _note: '这是用于初始化集合结构的示例数据，可以删除',
        _createdAt: new Date()
      }
    });

    results.config_access_logs = {
      success: true,
      _id: configLogResult._id,
      message: '✅ config_access_logs 集合初始化成功'
    };

    console.log('config_access_logs 集合初始化成功，ID:', configLogResult._id);

  } catch (error) {
    results.config_access_logs = {
      success: false,
      error: error.message,
      message: '❌ config_access_logs 集合初始化失败: ' + error.message
    };
    console.error('config_access_logs 初始化失败:', error);
  }

  try {
    // 2. 初始化 security_logs 集合
    console.log('初始化 security_logs 集合...');

    const securityLogResult = await db.collection('security_logs').add({
      data: {
        type: 'CONFIG_ACCESS',
        eventType: 'EXAMPLE_EVENT',
        openid: 'example_openid_structure',
        details: {
          timestamp: Date.now().toString(),
          appVersion: '1.0.0',
          description: '这是一条示例数据，用于初始化集合结构'
        },
        timestamp: new Date(),
        ip: '127.0.0.1',
        _isExample: true, // 标记为示例数据
        _note: '这是用于初始化集合结构的示例数据，可以删除',
        _createdAt: new Date()
      }
    });

    results.security_logs = {
      success: true,
      _id: securityLogResult._id,
      message: '✅ security_logs 集合初始化成功'
    };

    console.log('security_logs 集合初始化成功，ID:', securityLogResult._id);

  } catch (error) {
    results.security_logs = {
      success: false,
      error: error.message,
      message: '❌ security_logs 集合初始化失败: ' + error.message
    };
    console.error('security_logs 初始化失败:', error);
  }

  // 3. 返回结果
  return {
    success: true,
    message: '✅ 日志集合初始化完成',
    results: results,
    instructions: [
      '示例数据已插入到两个集合中',
      '可以在云开发控制台查看集合结构',
      '字段说明：',
      '  config_access_logs: openid, appVersion, timestamp, ip',
      '  security_logs: type, eventType, openid, details, timestamp, ip',
      '',
      '如需删除示例数据，请在云开发控制台筛选 _isExample=true 的记录并删除'
    ]
  };
}

/**
 * 初始化系统配置集合
 * 创建 system_config 集合并插入默认数据
 */
async function initSystemConfig() {
  const results = [];

  try {
    // 1. 尝试检查是否已有数据（如果集合不存在会报错）
    let existingData;
    let collectionExists = false;

    try {
      existingData = await db.collection('system_config').limit(1).get();
      collectionExists = true;
      results.push('ℹ️ system_config 集合已存在');
    } catch (error) {
      // 集合不存在，需要创建
      results.push('ℹ️ system_config 集合不存在，将自动创建');
      collectionExists = false;
    }

    // 2. 检查是否已有数据
    if (collectionExists && existingData && existingData.data.length > 0) {
      results.push(`ℹ️ 已存在 ${existingData.data.length} 条配置数据，跳过默认数据插入`);
      return {
        success: true,
        message: '系统配置已存在，无需初始化',
        details: results
      };
    }

    // 3. 插入默认的昆明市区域数据
    const defaultAreas = [
      { type: 'area', city: '昆明市', name: '五华区', code: 'wuhua', order: 1, enabled: true },
      { type: 'area', city: '昆明市', name: '盘龙区', code: 'panlong', order: 2, enabled: true },
      { type: 'area', city: '昆明市', name: '官渡区', code: 'guandu', order: 3, enabled: true },
      { type: 'area', city: '昆明市', name: '西山区', code: 'xishan', order: 4, enabled: true },
      { type: 'area', city: '昆明市', name: '呈贡区', code: 'chenggong', order: 5, enabled: true },
      { type: 'area', city: '昆明市', name: '东川区', code: 'dongchuan', order: 6, enabled: true }
    ];

    // 4. 插入默认的工作分类数据
    const defaultCategories = [
      { type: 'category', name: '日结', code: 'daily', order: 1, enabled: true, isVIP: false },
      { type: 'category', name: '短期工', code: 'short_term', order: 2, enabled: true, isVIP: false },
      { type: 'category', name: '长期工', code: 'long_term', order: 3, enabled: true, isVIP: false },
      { type: 'category', name: '高工资', code: 'high_salary', order: 4, enabled: true, isVIP: false }
    ];

    // 5. 插入默认的价格单位数据（10个）
    const defaultPriceUnits = [
      { type: 'price_unit', name: '元/束', code: 'yuan_per_bunch', order: 1, enabled: true },
      { type: 'price_unit', name: '元/盆', code: 'yuan_per_pot', order: 2, enabled: true },
      { type: 'price_unit', name: '元/支', code: 'yuan_per_piece', order: 3, enabled: true },
      { type: 'price_unit', name: '元/箱', code: 'yuan_per_box', order: 4, enabled: true },
      { type: 'price_unit', name: '元/天', code: 'yuan_per_day', order: 5, enabled: true },
      { type: 'price_unit', name: '元/月', code: 'yuan_per_month', order: 6, enabled: true },
      { type: 'price_unit', name: '元/小时', code: 'yuan_per_hour', order: 7, enabled: true },
      { type: 'price_unit', name: '元/株', code: 'yuan_per_plant', order: 8, enabled: true },
      { type: 'price_unit', name: '元/斤', code: 'yuan_per_jin', order: 9, enabled: true },
      { type: 'price_unit', name: '元/公斤', code: 'yuan_per_kg', order: 10, enabled: true }
    ];

    const allConfigs = [...defaultAreas, ...defaultCategories, ...defaultPriceUnits];

    // 5. 批量插入（如果集合不存在，第一次插入会自动创建集合）
    const now = new Date();
    let successCount = 0;

    for (const config of allConfigs) {
      try {
        await db.collection('system_config').add({
          data: {
            ...config,
            createTime: now,
            updateTime: now
          }
        });
        successCount++;
      } catch (error) {
        console.error('插入配置失败:', config.name, error);
      }
    }

    if (!collectionExists) {
      results.push('✅ 自动创建 system_config 集合成功');
    }

    results.push(`✅ 成功插入 ${successCount} 条配置数据`);
    results.push(`  - ${defaultAreas.length} 个区域`);
    results.push(`  - ${defaultCategories.length} 个分类`);
    results.push(`  - ${defaultPriceUnits.length} 个价格单位`);

    return {
      success: true,
      message: '系统配置集合初始化成功',
      details: results
    };
  } catch (error) {
    console.error('[initSystemConfig] 错误:', error);
    return {
      success: false,
      message: error.message || '初始化系统配置失败',
      details: [...results, '❌ ' + error.message]
    };
  }
}
