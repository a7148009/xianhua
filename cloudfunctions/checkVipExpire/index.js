// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * checkVipExpire 云函数
 * 定时任务：自动降级 VIP 过期用户
 */
exports.main = async (event, context) => {
  try {
    const now = new Date();

    // 查找过期的 VIP 用户
    const expiredUsers = await db.collection('users')
      .where({
        vipExpireDate: db.command.and(
          db.command.neq(null),
          db.command.lt(now)
        )
      })
      .get();

    if (expiredUsers.data.length === 0) {
      return {
        success: true,
        message: '没有过期的 VIP 用户',
        expiredCount: 0
      };
    }

    // 批量降级过期用户
    const updatePromises = expiredUsers.data.map(user =>
      db.collection('users')
        .doc(user._id)
        .update({
          data: {
            vipExpireDate: null,
            updateTime: now
          }
        })
    );

    await Promise.all(updatePromises);

    console.log(`[checkVipExpire] 已降级 ${expiredUsers.data.length} 个过期 VIP 用户`);

    return {
      success: true,
      message: `已降级 ${expiredUsers.data.length} 个过期 VIP 用户`,
      expiredCount: expiredUsers.data.length,
      expiredUsers: expiredUsers.data.map(u => ({
        openid: u.openid,
        nickName: u.nickName,
        vipExpireDate: u.vipExpireDate
      }))
    };
  } catch (error) {
    console.error('[checkVipExpire] 错误:', error);
    return {
      success: false,
      message: error.message || 'VIP 检查失败'
    };
  }
};
