// 云函数权限验证中间件
// 用于验证用户身份和权限

const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 权限验证中间件类
 */
class AuthMiddleware {

  /**
   * 要求管理员权限
   * @param {Object} wxContext - 微信上下文对象
   * @returns {Object} 返回用户信息
   * @throws {Error} 如果用户不是管理员，抛出错误
   */
  static async requireAdmin(wxContext) {
    const userResult = await db.collection('users')
      .where({ openid: wxContext.OPENID })
      .field({ role: true, nickName: true, _id: false })
      .get();

    if (!userResult.data.length) {
      await this.logUnauthorizedAccess(wxContext, 'admin', '用户不存在');
      throw new Error('用户不存在，请先登录');
    }

    const user = userResult.data[0];

    if (user.role !== 'admin') {
      await this.logUnauthorizedAccess(wxContext, 'admin', `用户角色为 ${user.role}`);
      throw new Error('权限不足：需要管理员权限');
    }

    return user;
  }

  /**
   * 要求发布者或更高权限
   */
  static async requirePublisher(wxContext) {
    const userResult = await db.collection('users')
      .where({ openid: wxContext.OPENID })
      .field({ role: true, nickName: true })
      .get();

    if (!userResult.data.length) {
      await this.logUnauthorizedAccess(wxContext, 'publisher', '用户不存在');
      throw new Error('用户不存在，请先登录');
    }

    const user = userResult.data[0];
    const allowedRoles = ['admin', 'publisher'];

    if (!allowedRoles.includes(user.role)) {
      await this.logUnauthorizedAccess(wxContext, 'publisher', `用户角色为 ${user.role}`);
      throw new Error('权限不足：需要发布者或管理员权限');
    }

    return user;
  }

  /**
   * 要求VIP或更高权限
   */
  static async requireVIP(wxContext) {
    const userResult = await db.collection('users')
      .where({ openid: wxContext.OPENID })
      .get();

    if (!userResult.data.length) {
      await this.logUnauthorizedAccess(wxContext, 'vip', '用户不存在');
      throw new Error('用户不存在，请先登录');
    }

    const user = userResult.data[0];
    const allowedRoles = ['admin', 'publisher', 'vip'];

    // 检查VIP是否过期
    if (user.role === 'vip' && user.vipExpireDate) {
      const vipExpireDate = new Date(user.vipExpireDate);
      if (vipExpireDate < new Date()) {
        await this.logUnauthorizedAccess(wxContext, 'vip', 'VIP已过期');
        throw new Error('VIP已过期，请续费');
      }
    }

    if (!allowedRoles.includes(user.role)) {
      await this.logUnauthorizedAccess(wxContext, 'vip', `用户角色为 ${user.role}`);
      throw new Error('权限不足：需要VIP或更高权限');
    }

    return user;
  }

  /**
   * 验证是否为本人操作
   * @param {Object} wxContext - 微信上下文
   * @param {String} targetOpenid - 目标用户的openid
   */
  static async requireSelf(wxContext, targetOpenid) {
    if (wxContext.OPENID !== targetOpenid) {
      // 检查是否为管理员（管理员可以操作他人数据）
      try {
        await this.requireAdmin(wxContext);
        return true; // 管理员通过验证
      } catch (e) {
        await this.logUnauthorizedAccess(wxContext, 'self', `尝试操作他人数据: ${targetOpenid}`);
        throw new Error('权限不足：只能操作自己的数据');
      }
    }
    return true;
  }

  /**
   * 频率限制
   * @param {Object} wxContext - 微信上下文
   * @param {String} action - 操作名称
   * @param {Number} maxCalls - 最大调用次数
   * @param {Number} windowMs - 时间窗口（毫秒）
   */
  static async rateLimit(wxContext, action, maxCalls = 100, windowMs = 60000) {
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      // 查询时间窗口内的调用次数
      const callsResult = await db.collection('rate_limits')
        .where({
          openid: wxContext.OPENID,
          action: action,
          timestamp: db.command.gte(windowStart)
        })
        .count();

      if (callsResult.total >= maxCalls) {
        await this.logUnauthorizedAccess(wxContext, 'rate_limit', `${action} 超过频率限制`);
        throw new Error(`操作过于频繁，请${Math.ceil(windowMs/1000)}秒后再试`);
      }

      // 记录本次调用
      await db.collection('rate_limits').add({
        data: {
          openid: wxContext.OPENID,
          action: action,
          timestamp: now
        }
      });

      return true;
    } catch (error) {
      // 如果 rate_limits 集合不存在，忽略错误（首次使用）
      if (error.errCode === -1) {
        console.warn('[AuthMiddleware] rate_limits 集合不存在，跳过频率限制');
        return true;
      }
      throw error;
    }
  }

  /**
   * 记录未授权访问
   */
  static async logUnauthorizedAccess(wxContext, requiredRole, reason = '') {
    try {
      await db.collection('security_logs').add({
        data: {
          type: 'unauthorized_access',
          openid: wxContext.OPENID,
          requiredRole: requiredRole,
          reason: reason,
          timestamp: new Date(),
          env: wxContext.ENV,
          sourceIP: wxContext.SOURCEIP || 'unknown'
        }
      });
    } catch (e) {
      // 如果集合不存在，仅记录警告，不影响主流程
      console.warn('[AuthMiddleware] 记录安全日志失败:', e.errMsg);
    }
  }

  /**
   * 记录操作日志
   */
  static async logOperation(wxContext, action, details = {}) {
    try {
      await db.collection('operation_logs').add({
        data: {
          openid: wxContext.OPENID,
          action: action,
          details: details,
          timestamp: new Date(),
          env: wxContext.ENV
        }
      });
    } catch (e) {
      // 如果集合不存在，仅记录警告
      console.warn('[AuthMiddleware] 记录操作日志失败:', e.errMsg);
    }
  }
}

module.exports = AuthMiddleware;
