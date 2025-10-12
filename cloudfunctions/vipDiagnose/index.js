// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * vipDiagnose 云函数
 * 诊断VIP状态，检查users和user_roles两个集合的数据
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { openid } = event;

  const targetOpenid = openid || wxContext.OPENID;

  console.log('[vipDiagnose] 诊断用户:', targetOpenid);

  try {
    const now = new Date();

    // 1. 检查users集合
    const usersResult = await db.collection('users')
      .where({ openid: targetOpenid })
      .get();

    const userData = usersResult.data.length > 0 ? usersResult.data[0] : null;

    // 2. 检查user_roles集合
    const rolesResult = await db.collection('user_roles')
      .where({ openid: targetOpenid })
      .get();

    const roleData = rolesResult.data.length > 0 ? rolesResult.data[0] : null;

    // 3. 分析结果
    const diagnosis = {
      openid: targetOpenid,
      currentTime: now.toISOString(),

      usersCollection: {
        exists: !!userData,
        role: userData?.role,
        vipExpireDate: userData?.vipExpireDate,
        isVIPValid: userData?.vipExpireDate ? new Date(userData.vipExpireDate) > now : false
      },

      userRolesCollection: {
        exists: !!roleData,
        role: roleData?.role,
        is_vip: roleData?.is_vip,
        vip_expire_time: roleData?.vip_expire_time,
        isVIPValid: roleData?.is_vip && roleData?.vip_expire_time ? new Date(roleData.vip_expire_time) > now : false
      },

      conclusion: ''
    };

    // 4. 生成结论
    if (diagnosis.usersCollection.isVIPValid && !diagnosis.userRolesCollection.isVIPValid) {
      diagnosis.conclusion = '❌ 问题：users集合有VIP，但user_roles集合没有同步';
      diagnosis.suggestion = '需要同步数据到user_roles集合';

      // 自动修复：同步数据
      try {
        const expireTime = new Date(userData.vipExpireDate);

        if (roleData) {
          // 更新已有记录
          await db.collection('user_roles')
            .doc(roleData._id)
            .update({
              data: {
                is_vip: true,
                vip_expire_time: expireTime,
                role: userData.role || 'vip',
                updated_at: now
              }
            });
        } else {
          // 创建新记录
          await db.collection('user_roles').add({
            data: {
              openid: targetOpenid,
              role: userData.role || 'vip',
              is_vip: true,
              vip_expire_time: expireTime,
              created_at: now,
              updated_at: now
            }
          });
        }

        diagnosis.fixed = true;
        diagnosis.conclusion += ' → ✅ 已自动修复';
      } catch (fixError) {
        diagnosis.fixed = false;
        diagnosis.fixError = fixError.message;
        diagnosis.conclusion += ' → ⚠️ 自动修复失败';
      }

    } else if (!diagnosis.usersCollection.isVIPValid && !diagnosis.userRolesCollection.isVIPValid) {
      diagnosis.conclusion = '⚠️ 两个集合都没有有效的VIP记录';
      diagnosis.suggestion = '请在管理员页面重新设置VIP';

    } else if (diagnosis.userRolesCollection.isVIPValid) {
      diagnosis.conclusion = '✅ VIP状态正常';

    } else {
      diagnosis.conclusion = '❓ 未知状态';
    }

    return {
      success: true,
      data: diagnosis
    };

  } catch (error) {
    console.error('[vipDiagnose] 错误:', error);
    return {
      success: false,
      message: error.message,
      error: error
    };
  }
};
