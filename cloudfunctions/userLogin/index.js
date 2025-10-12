// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * userLogin 云函数
 * 核心登录/资料服务
 * 支持检查、更新、注册模式
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const {
    loginMethod = 'check', // check | update | register | wechat
    nickName,
    avatarUrl,
    cloudAvatarFileID, // 兼容旧字段名
    cloudFileID,       // 新字段名
    avatarUpdateTime
  } = event;

  const openid = wxContext.OPENID;
  const unionid = wxContext.UNIONID;

  // 统一云文件ID字段
  const finalCloudFileID = cloudFileID || cloudAvatarFileID || '';

  try {
    // 查询用户是否存在
    const userResult = await db.collection('users')
      .where({ openid })
      .get();

    const userExists = userResult.data && userResult.data.length > 0;
    const existingUser = userExists ? userResult.data[0] : null;

    // 检查模式：判断是否需要补全资料
    if (loginMethod === 'check') {
      if (!userExists) {
        return {
          success: true,
          needsProfile: true,
          message: '需要补全资料'
        };
      }

      // 更新最后登录时间
      await db.collection('users')
        .where({ openid })
        .update({
          data: {
            loginTime: new Date(),
            updateTime: new Date()
          }
        });

      return {
        success: true,
        needsProfile: false,
        data: {
          openid,
          nickName: existingUser.nickName,
          avatarUrl: existingUser.avatarUrl,
          cloudAvatarFileID: existingUser.cloudAvatarFileID || existingUser.cloudFileID,
          role: existingUser.role || 'user',
          vipExpireDate: existingUser.vipExpireDate,
          loginTime: existingUser.loginTime,
          updateTime: new Date()
        }
      };
    }

    // 注册模式或微信登录（新用户）
    if (loginMethod === 'register' || loginMethod === 'wechat') {
      if (userExists) {
        // 用户已存在，执行更新
        const updateData = {
          updateTime: new Date(),
          loginTime: new Date()
        };

        if (nickName !== undefined) updateData.nickName = nickName;
        if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
        if (finalCloudFileID) {
          updateData.cloudAvatarFileID = finalCloudFileID;
          updateData.cloudFileID = finalCloudFileID; // 同时保存两个字段
        }
        if (avatarUpdateTime !== undefined) updateData.avatarUpdateTime = avatarUpdateTime;

        await db.collection('users')
          .where({ openid })
          .update({
            data: updateData
          });

        // 获取更新后的用户信息
        const updatedUserResult = await db.collection('users')
          .where({ openid })
          .get();

        return {
          success: true,
          message: '更新成功',
          data: updatedUserResult.data[0]
        };
      }

      // 新用户，创建记录
      const newUser = {
        openid,
        unionid: unionid || '',
        nickName: nickName || '微信用户',
        avatarUrl: avatarUrl || '',
        cloudAvatarFileID: finalCloudFileID,
        cloudFileID: finalCloudFileID, // 同时保存两个字段
        avatarUpdateTime: avatarUpdateTime || new Date(),
        role: 'user',
        vipExpireDate: null,
        loginTime: new Date(),
        updateTime: new Date(),
        loginMethod: loginMethod
      };

      await db.collection('users').add({
        data: newUser
      });

      return {
        success: true,
        message: '注册成功',
        data: newUser
      };
    }

    // 更新模式：更新用户资料
    if (loginMethod === 'update') {
      if (!userExists) {
        // 用户不存在，创建新用户
        const newUser = {
          openid,
          unionid: unionid || '',
          nickName: nickName || '微信用户',
          avatarUrl: avatarUrl || '',
          cloudAvatarFileID: finalCloudFileID,
          cloudFileID: finalCloudFileID,
          avatarUpdateTime: avatarUpdateTime || new Date(),
          role: 'user',
          vipExpireDate: null,
          loginTime: new Date(),
          updateTime: new Date(),
          loginMethod: 'register'
        };

        await db.collection('users').add({
          data: newUser
        });

        return {
          success: true,
          message: '注册成功',
          data: newUser
        };
      }

      const updateData = {
        updateTime: new Date(),
        loginTime: new Date()
      };

      if (nickName !== undefined) updateData.nickName = nickName;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (finalCloudFileID) {
        updateData.cloudAvatarFileID = finalCloudFileID;
        updateData.cloudFileID = finalCloudFileID;
      }
      if (avatarUpdateTime !== undefined) updateData.avatarUpdateTime = avatarUpdateTime;

      await db.collection('users')
        .where({ openid })
        .update({
          data: updateData
        });

      // 获取更新后的用户信息
      const updatedUserResult = await db.collection('users')
        .where({ openid })
        .get();

      return {
        success: true,
        message: '更新成功',
        data: updatedUserResult.data[0]
      };
    }

    return {
      success: false,
      message: '未知的登录模式'
    };
  } catch (error) {
    console.error('[userLogin] 错误:', error);
    return {
      success: false,
      message: error.message || '登录失败'
    };
  }
};
