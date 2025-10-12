// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * increaseViewCount 云函数
 * 增加职位浏览量
 */
exports.main = async (event, context) => {
  const { hash_id } = event;

  if (!hash_id) {
    return {
      success: false,
      message: '缺少 hash_id 参数'
    };
  }

  try {
    const result = await db.collection('db_info')
      .where({ hash_id })
      .update({
        data: {
          view_count: db.command.inc(1)
        }
      });

    return {
      success: result.stats.updated > 0,
      message: result.stats.updated > 0 ? '浏览量已更新' : '未找到该职位'
    };
  } catch (error) {
    console.error('[increaseViewCount] 错误:', error);
    return {
      success: false,
      message: error.message || '更新浏览量失败'
    };
  }
};
