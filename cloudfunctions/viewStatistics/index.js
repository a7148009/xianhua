// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 阅读统计云函数
 *
 * 数据库集合: view_statistics
 * 字段设计:
 * - _id: 自动生成
 * - jobId: string (信息ID)
 * - openid: string (用户openid)
 * - viewTime: date (浏览时间)
 * - duration: number (停留时长，秒)
 * - createTime: date (创建时间)
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action, jobId, duration } = event;

  try {
    switch (action) {
      case 'record':
        // 记录浏览
        return await recordView(jobId, wxContext.OPENID, duration);

      case 'getStats':
        // 获取统计数据
        return await getViewStats(jobId);

      default:
        return {
          success: false,
          message: '未知的操作类型'
        };
    }
  } catch (error) {
    console.error('[viewStatistics] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 记录浏览（停留超过3秒才记录）
 */
async function recordView(jobId, openid, duration) {
  if (!jobId) {
    return {
      success: false,
      message: '缺少jobId参数'
    };
  }

  // 只有停留超过3秒才记录
  if (!duration || duration < 3) {
    return {
      success: true,
      message: '停留时间不足，不记录'
    };
  }

  try {
    // 记录浏览数据
    await db.collection('view_statistics').add({
      data: {
        jobId,
        openid,
        viewTime: new Date(),
        duration,
        createTime: new Date()
      }
    });

    console.log(`[recordView] 记录成功: jobId=${jobId}, openid=${openid}, duration=${duration}s`);

    return {
      success: true,
      message: '记录成功'
    };
  } catch (error) {
    console.error('[recordView] 错误:', error);
    return {
      success: false,
      message: error.message || '记录失败'
    };
  }
}

/**
 * 获取浏览统计数据
 */
async function getViewStats(jobId) {
  if (!jobId) {
    return {
      success: false,
      message: '缺少jobId参数'
    };
  }

  try {
    // 获取总阅读量
    const totalResult = await db.collection('view_statistics')
      .where({
        jobId
      })
      .count();

    const totalViews = totalResult.total;

    // 获取今日阅读量
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayResult = await db.collection('view_statistics')
      .where({
        jobId,
        viewTime: db.command.gte(today)
      })
      .count();

    const todayViews = todayResult.total;

    console.log(`[getViewStats] jobId=${jobId}, 总阅读=${totalViews}, 今日阅读=${todayViews}`);

    return {
      success: true,
      data: {
        totalViews,
        todayViews
      }
    };
  } catch (error) {
    console.error('[getViewStats] 错误:', error);
    return {
      success: false,
      message: error.message || '获取统计失败',
      data: {
        totalViews: 0,
        todayViews: 0
      }
    };
  }
}
