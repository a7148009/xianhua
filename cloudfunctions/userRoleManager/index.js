// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * userRoleManager 云函数
 * 用户角色管理：获取用户列表、统计、设置角色、设置VIP等
 *
 * ⚠️ 安全加固：所有管理功能都需要管理员权限验证
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action } = event;

  try {
    // ============ 权限验证 ============
    const currentUserOpenid = wxContext.OPENID;

    // 验证当前用户是否为管理员
    const adminCheck = await db.collection('users')
      .where({ openid: currentUserOpenid })
      .get();

    if (!adminCheck.data || adminCheck.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      };
    }

    const currentUser = adminCheck.data[0];

    // 需要管理员权限的操作
    const adminRequiredActions = ['getUserList', 'getUserStats', 'setUserRole', 'getUserInfo'];
    if (adminRequiredActions.includes(action) && currentUser.role !== 'admin') {
      return {
        success: false,
        message: '需要管理员权限'
      };
    }

    console.log(`[userRoleManager] 用户 ${currentUserOpenid} (${currentUser.role}) 执行操作: ${action}`);

    // ============ 执行实际操作 ============
    switch (action) {
      case 'getUserList':
        return await getUserList(event);

      case 'getUserStats':
        return await getUserStats();

      case 'setUserRole':
        return await setUserRole(event, currentUserOpenid);

      case 'getUserInfo':
        return await getUserInfo(event);

      default:
        return {
          success: false,
          message: '未知的操作类型: ' + action
        };
    }
  } catch (error) {
    console.error('[userRoleManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取用户列表
 */
async function getUserList(event) {
  const {
    page = 1,
    limit = 20,
    keyword = '',
    roleFilter = ''
  } = event;

  console.log('[getUserList] 请求参数:', { page, limit, keyword, roleFilter });

  try {
    let query = db.collection('users');

    // 构建查询条件
    const conditions = [];

    // 角色筛选
    if (roleFilter && roleFilter !== 'all') {
      console.log('[getUserList] 角色筛选:', roleFilter);

      // 特殊处理VIP筛选：包括role为vip的用户和有有效VIP到期日期的用户
      if (roleFilter === 'vip') {
        const now = new Date();
        conditions.push(_.or([
          { role: 'vip' },
          { role: 'admin', vipExpireDate: _.exists(true) },
          { vipExpireDate: _.gt(now) }
        ]));
        console.log('[getUserList] VIP筛选条件已添加，当前时间:', now);
      } else {
        conditions.push({ role: roleFilter });
      }
    }

    // 关键字搜索
    if (keyword) {
      conditions.push(_.or([
        { nickName: db.RegExp({ regexp: keyword, options: 'i' }) },
        { openid: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]));
    }

    // 合并查询条件
    if (conditions.length > 0) {
      const whereCondition = conditions.length === 1 ? conditions[0] : _.and(conditions);
      query = query.where(whereCondition);
      console.log('[getUserList] 查询条件数量:', conditions.length);
    }

    // 计算总数
    const countResult = await query.count();
    const total = countResult.total;
    console.log('[getUserList] 查询到的总数:', total);

    // 分页查询
    const skip = (page - 1) * limit;
    const result = await query
      .orderBy('loginTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();

    console.log('[getUserList] 返回用户数量:', result.data.length);

    // 处理用户头像URL和确保必要字段存在
    const users = await Promise.all(result.data.map(async (user) => {
      // 如果有云文件ID，获取临时链接
      if (user.cloudAvatarFileID || user.cloudFileID) {
        try {
          const fileID = user.cloudAvatarFileID || user.cloudFileID;
          const tempUrlRes = await cloud.getTempFileURL({
            fileList: [fileID]
          });

          if (tempUrlRes.fileList && tempUrlRes.fileList[0] && tempUrlRes.fileList[0].tempFileURL) {
            user.avatarUrl = tempUrlRes.fileList[0].tempFileURL;
          }
        } catch (error) {
          console.warn('获取头像临时链接失败:', error);
        }
      }

      // 确保必要字段存在（兼容老数据）
      if (!user.loginTime) {
        user.loginTime = null;
      }
      if (!user.vipExpireDate) {
        user.vipExpireDate = null;
      }

      return user;
    }));

    return {
      success: true,
      data: {
        users: users,
        total: total,
        hasMore: skip + users.length < total
      },
      page,
      limit
    };
  } catch (error) {
    console.error('[getUserList] 错误:', error);
    return {
      success: false,
      message: error.message || '获取用户列表失败',
      data: {
        users: [],
        total: 0,
        hasMore: false
      }
    };
  }
}

/**
 * 获取用户统计
 */
async function getUserStats() {
  try {
    const allUsers = await db.collection('users').get();
    const users = allUsers.data;

    const stats = {
      total: users.length,
      adminCount: users.filter(u => u.role === 'admin').length,
      vipCount: users.filter(u => u.role === 'vip' || (u.vipExpireDate && new Date(u.vipExpireDate) > new Date())).length,
      publisherCount: users.filter(u => u.role === 'publisher').length,
      userCount: users.filter(u => !u.role || u.role === 'user').length
    };

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('[getUserStats] 错误:', error);
    return {
      success: false,
      message: error.message || '获取统计失败',
      data: {
        total: 0,
        adminCount: 0,
        vipCount: 0,
        publisherCount: 0,
        userCount: 0
      }
    };
  }
}

/**
 * 设置用户角色
 */
async function setUserRole(event, operatorOpenid) {
  const { targetOpenid, newRole, vipExpireDate } = event;

  if (!targetOpenid || !newRole) {
    return {
      success: false,
      message: '缺少必要参数: targetOpenid 或 newRole'
    };
  }

  // 验证角色值
  const validRoles = ['user', 'publisher', 'admin', 'vip'];
  if (!validRoles.includes(newRole)) {
    return {
      success: false,
      message: '无效的角色值: ' + newRole
    };
  }

  try {
    // 检查目标用户是否存在
    const userResult = await db.collection('users')
      .where({ openid: targetOpenid })
      .get();

    if (!userResult.data || userResult.data.length === 0) {
      return {
        success: false,
        message: '目标用户不存在'
      };
    }

    const targetUser = userResult.data[0];
    const oldRole = targetUser.role || 'user';

    // 管理员保护：防止移除最后一个管理员
    if (oldRole === 'admin' && newRole !== 'admin') {
      const adminCount = await db.collection('users')
        .where({ role: 'admin' })
        .count();

      if (adminCount.total <= 1) {
        return {
          success: false,
          message: '不能移除最后一个管理员'
        };
      }
    }

    // 构建更新数据
    const updateData = {
      role: newRole,
      updateTime: new Date()
    };

    // VIP到期时间处理逻辑：
    // 1. 如果提供了vipExpireDate，则设置或更新VIP到期时间（不管角色是什么）
    // 2. 如果没有提供vipExpireDate，且新角色不是VIP也不是admin，则清空VIP到期时间
    // 3. admin和vip角色可以共存VIP到期时间
    if (vipExpireDate) {
      // 设置或更新VIP到期时间（支持admin+vip共存）
      updateData.vipExpireDate = vipExpireDate;
    } else if (newRole !== 'vip' && newRole !== 'admin') {
      // 只有当新角色既不是VIP也不是admin时，才清空VIP到期时间
      updateData.vipExpireDate = null;
    }

    // 更新角色
    await db.collection('users')
      .where({ openid: targetOpenid })
      .update({
        data: updateData
      });

    // 🔄 同步VIP状态到user_roles集合（确保与支付系统一致）
    if (vipExpireDate) {
      const expireTime = new Date(vipExpireDate);
      const now = new Date();
      const isVIP = expireTime > now;

      try {
        // 查询user_roles是否存在记录
        const roleResult = await db.collection('user_roles')
          .where({ openid: targetOpenid })
          .get();

        if (roleResult.data.length > 0) {
          // 更新已有记录
          await db.collection('user_roles')
            .doc(roleResult.data[0]._id)
            .update({
              data: {
                is_vip: isVIP,
                vip_expire_time: expireTime,
                role: newRole,
                updated_at: new Date()
              }
            });
        } else {
          // 创建新记录
          await db.collection('user_roles').add({
            data: {
              openid: targetOpenid,
              role: newRole,
              is_vip: isVIP,
              vip_expire_time: expireTime,
              created_at: new Date(),
              updated_at: new Date()
            }
          });
        }
        console.log(`[setUserRole] VIP状态已同步到user_roles: is_vip=${isVIP}, expire=${expireTime}`);
      } catch (e) {
        console.warn('[setUserRole] 同步VIP状态到user_roles失败:', e);
      }
    } else if (newRole !== 'vip' && newRole !== 'admin') {
      // 如果清空了VIP，也需要同步到user_roles
      try {
        const roleResult = await db.collection('user_roles')
          .where({ openid: targetOpenid })
          .get();

        if (roleResult.data.length > 0) {
          await db.collection('user_roles')
            .doc(roleResult.data[0]._id)
            .update({
              data: {
                is_vip: false,
                vip_expire_time: null,
                role: newRole,
                updated_at: new Date()
              }
            });
          console.log(`[setUserRole] VIP状态已清空并同步到user_roles`);
        }
      } catch (e) {
        console.warn('[setUserRole] 清空user_roles的VIP状态失败:', e);
      }
    }

    // 记录角色变更日志（用于审计）
    try {
      await db.collection('role_change_logs').add({
        data: {
          operatorOpenid: operatorOpenid,
          targetOpenid: targetOpenid,
          targetNickName: targetUser.nickName || '未知',
          oldRole: oldRole,
          newRole: newRole,
          vipExpireDate: vipExpireDate || updateData.vipExpireDate || null,
          timestamp: new Date()
        }
      });
    } catch (e) {
      console.warn('[setUserRole] 记录角色变更日志失败:', e);
    }

    console.log(`[setUserRole] 角色更新成功: ${targetUser.nickName} (${targetOpenid}) ${oldRole} -> ${newRole}, VIP到期: ${vipExpireDate || '未设置'}`);

    return {
      success: true,
      message: '角色设置成功',
      data: {
        openid: targetOpenid,
        oldRole: oldRole,
        newRole: newRole,
        vipExpireDate: vipExpireDate || updateData.vipExpireDate || null
      }
    };
  } catch (error) {
    console.error('[setUserRole] 错误:', error);
    return {
      success: false,
      message: error.message || '设置角色失败'
    };
  }
}

/**
 * 获取单个用户信息
 */
async function getUserInfo(event) {
  const { targetOpenid } = event;

  if (!targetOpenid) {
    return {
      success: false,
      message: '缺少 targetOpenid 参数'
    };
  }

  try {
    const result = await db.collection('users')
      .where({ openid: targetOpenid })
      .get();

    if (!result.data || result.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      };
    }

    const user = result.data[0];

    // 如果有云文件ID，获取临时链接
    if (user.cloudAvatarFileID || user.cloudFileID) {
      try {
        const fileID = user.cloudAvatarFileID || user.cloudFileID;
        const tempUrlRes = await cloud.getTempFileURL({
          fileList: [fileID]
        });

        if (tempUrlRes.fileList && tempUrlRes.fileList[0] && tempUrlRes.fileList[0].tempFileURL) {
          user.avatarUrl = tempUrlRes.fileList[0].tempFileURL;
        }
      } catch (error) {
        console.warn('获取头像临时链接失败:', error);
      }
    }

    return {
      success: true,
      data: user
    };
  } catch (error) {
    console.error('[getUserInfo] 错误:', error);
    return {
      success: false,
      message: error.message || '获取用户信息失败'
    };
  }
}
