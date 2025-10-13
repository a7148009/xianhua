// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * deleteFlowerInfo 云函数
 * 删除指定的鲜花信息（管理员专用）
 */
exports.main = async (event, context) => {
  const { hash_id } = event;

  console.log('[deleteFlowerInfo] 删除信息请求:', { hash_id });

  // 参数验证
  if (!hash_id) {
    return {
      success: false,
      message: '缺少必要参数：hash_id'
    };
  }

  try {
    // 获取调用者的 openid
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;

    console.log('[deleteFlowerInfo] 调用者 openid:', openid);

    // 验证管理员权限
    const userResult = await db.collection('users').where({
      openid: openid
    }).get();

    if (!userResult.data || userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      };
    }

    const user = userResult.data[0];
    if (user.role !== 'admin') {
      console.log('[deleteFlowerInfo] 权限不足，用户角色:', user.role);
      return {
        success: false,
        message: '权限不足：仅管理员可以删除信息'
      };
    }

    console.log('[deleteFlowerInfo] 管理员权限验证通过');

    // 查询要删除的信息是否存在
    const itemResult = await db.collection('db_info').where({
      hash_id: hash_id
    }).get();

    if (!itemResult.data || itemResult.data.length === 0) {
      return {
        success: false,
        message: '信息不存在或已被删除'
      };
    }

    const item = itemResult.data[0];
    console.log('[deleteFlowerInfo] 找到要删除的信息:', {
      _id: item._id,
      title: item.title,
      hash_id: item.hash_id
    });

    // 执行删除操作（物理删除）
    const deleteResult = await db.collection('db_info').doc(item._id).remove();

    console.log('[deleteFlowerInfo] 删除结果:', deleteResult);

    if (deleteResult.stats && deleteResult.stats.removed > 0) {
      return {
        success: true,
        message: '删除成功',
        data: {
          hash_id: hash_id,
          title: item.title
        }
      };
    } else {
      return {
        success: false,
        message: '删除失败，请重试'
      };
    }

  } catch (error) {
    console.error('[deleteFlowerInfo] 删除失败:', error);
    return {
      success: false,
      message: error.message || '删除失败，系统错误'
    };
  }
};
