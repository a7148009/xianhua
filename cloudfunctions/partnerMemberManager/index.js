// 云函数：合作页面成员管理
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 合作页面成员管理云函数
 * 处理成员申请、审核、移除等操作
 */
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      // 用户操作
      case 'applyToJoin':
        return await applyToJoin(event);
      case 'cancelApplication':
        return await cancelApplication(event);
      case 'quitPage':
        return await quitPage(event);

      // 管理员操作
      case 'approveApplication':
        return await approveApplication(event);
      case 'rejectApplication':
        return await rejectApplication(event);
      case 'removeMember':
        return await removeMember(event);
      case 'updateMemberRole':
        return await updateMemberRole(event);

      // 查询操作
      case 'getMyApplications':
        return await getMyApplications(event);
      case 'getPendingApplications':
        return await getPendingApplications(event);
      case 'getMemberInfo':
        return await getMemberInfo(event);

      // 推广链接操作（新版Token方式）
      case 'generatePromotionToken':
        return await generatePromotionToken(event);
      case 'validatePromotionToken':
        return await validatePromotionToken(event);
      case 'recordPromotionVisit':
        return await recordPromotionVisit(event);
      case 'getPromotionStats':
        return await getPromotionStats(event);

      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('[partnerMemberManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败',
      error: error.toString()
    };
  }
};

/**
 * 申请加入合作页面
 */
async function applyToJoin(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId, applyReason = '' } = event;

  try {
    // 检查页面是否存在且活跃
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    const page = pages[0];

    if (page.status !== 'active') {
      throw new Error('该页面当前不接受申请');
    }

    // 检查是否已经是成员或已申请
    const { data: existingMemberships } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: _.in(['active', 'pending'])
      })
      .get();

    if (existingMemberships.length > 0) {
      const status = existingMemberships[0].join_status;
      if (status === 'active') {
        throw new Error('您已经是该页面的成员');
      } else if (status === 'pending') {
        throw new Error('您已提交申请，请等待审核');
      }
    }

    // 检查成员数量是否已满
    if (page.member_count >= page.max_members) {
      throw new Error('该页面成员已满，无法加入');
    }

    // 创建申请记录
    const now = new Date();
    const applicationData = {
      page_id: pageId,
      user_id: userId,
      member_role: 'member',
      join_status: page.enable_auto_approve ? 'active' : 'pending',
      apply_reason: applyReason,
      apply_time: now,
      published_count: 0,
      create_time: now,
      update_time: now
    };

    // 如果自动审核，设置审核时间
    if (page.enable_auto_approve) {
      applicationData.approve_time = now;
      applicationData.approve_by = 'system';
    }

    await db.collection('page_members').add({
      data: applicationData
    });

    // 如果自动审核通过，更新页面成员数
    if (page.enable_auto_approve) {
      await db.collection('partner_pages')
        .where({ _id: pageId })
        .update({
          data: {
            member_count: _.inc(1),
            update_time: now
          }
        });
    }

    return {
      success: true,
      message: page.enable_auto_approve ? '加入成功' : '申请已提交，请等待审核',
      data: {
        join_status: applicationData.join_status,
        auto_approved: page.enable_auto_approve
      }
    };
  } catch (error) {
    throw new Error(`申请加入失败: ${error.message}`);
  }
}

/**
 * 取消申请
 */
async function cancelApplication(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 检查申请是否存在
    const { data: applications } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .get();

    if (applications.length === 0) {
      throw new Error('没有待审核的申请');
    }

    // 删除申请记录
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .remove();

    return {
      success: true,
      message: '已取消申请'
    };
  } catch (error) {
    throw new Error(`取消申请失败: ${error.message}`);
  }
}

/**
 * 退出页面
 */
async function quitPage(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 检查成员身份
    const { data: memberships } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'active'
      })
      .get();

    if (memberships.length === 0) {
      throw new Error('您不是该页面的成员');
    }

    // 检查是否有未处理的文章
    const { total: activeArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        user_id: userId,
        status: 'active'
      })
      .count();

    if (activeArticles > 0) {
      throw new Error(`您还有 ${activeArticles} 篇活跃文章，请先处理这些文章后再退出`);
    }

    // 更新成员状态
    const now = new Date();
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId
      })
      .update({
        data: {
          join_status: 'quit',
          quit_time: now,
          update_time: now
        }
      });

    // 更新页面成员数
    await db.collection('partner_pages')
      .where({ _id: pageId })
      .update({
        data: {
          member_count: _.inc(-1),
          update_time: now
        }
      });

    return {
      success: true,
      message: '已退出页面'
    };
  } catch (error) {
    throw new Error(`退出页面失败: ${error.message}`);
  }
}

/**
 * 审核通过申请（管理员）
 */
async function approveApplication(event) {
  const wxContext = cloud.getWXContext();
  const adminId = wxContext.OPENID;
  const { pageId, userId } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(adminId);

    // 检查申请是否存在
    const { data: applications } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .get();

    if (applications.length === 0) {
      throw new Error('申请不存在或已被处理');
    }

    // 检查页面成员数是否已满
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    const page = pages[0];
    if (page.member_count >= page.max_members) {
      throw new Error('页面成员已满，无法批准申请');
    }

    // 更新申请状态
    const now = new Date();
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .update({
        data: {
          join_status: 'active',
          approve_time: now,
          approve_by: adminId,
          update_time: now
        }
      });

    // 更新页面成员数
    await db.collection('partner_pages')
      .where({ _id: pageId })
      .update({
        data: {
          member_count: _.inc(1),
          update_time: now
        }
      });

    return {
      success: true,
      message: '已批准申请'
    };
  } catch (error) {
    throw new Error(`批准申请失败: ${error.message}`);
  }
}

/**
 * 拒绝申请（管理员）
 */
async function rejectApplication(event) {
  const wxContext = cloud.getWXContext();
  const adminId = wxContext.OPENID;
  const { pageId, userId, rejectReason = '' } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(adminId);

    // 检查申请是否存在
    const { data: applications } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .get();

    if (applications.length === 0) {
      throw new Error('申请不存在或已被处理');
    }

    // 更新申请状态
    const now = new Date();
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'pending'
      })
      .update({
        data: {
          join_status: 'rejected',
          reject_reason: rejectReason,
          reject_time: now,
          reject_by: adminId,
          update_time: now
        }
      });

    return {
      success: true,
      message: '已拒绝申请'
    };
  } catch (error) {
    throw new Error(`拒绝申请失败: ${error.message}`);
  }
}

/**
 * 移除成员（管理员）
 */
async function removeMember(event) {
  const wxContext = cloud.getWXContext();
  const adminId = wxContext.OPENID;
  const { pageId, userId, removeReason = '' } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(adminId);

    // 检查成员是否存在
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'active'
      })
      .get();

    if (members.length === 0) {
      throw new Error('成员不存在');
    }

    // 检查该成员是否有活跃文章
    const { total: activeArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        user_id: userId,
        status: 'active'
      })
      .count();

    if (activeArticles > 0) {
      throw new Error(`该成员还有 ${activeArticles} 篇活跃文章，请先处理这些文章`);
    }

    // 更新成员状态
    const now = new Date();
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId
      })
      .update({
        data: {
          join_status: 'removed',
          remove_reason: removeReason,
          remove_time: now,
          remove_by: adminId,
          update_time: now
        }
      });

    // 更新页面成员数
    await db.collection('partner_pages')
      .where({ _id: pageId })
      .update({
        data: {
          member_count: _.inc(-1),
          update_time: now
        }
      });

    return {
      success: true,
      message: '已移除成员'
    };
  } catch (error) {
    throw new Error(`移除成员失败: ${error.message}`);
  }
}

/**
 * 更新成员角色（管理员）
 */
async function updateMemberRole(event) {
  const wxContext = cloud.getWXContext();
  const adminId = wxContext.OPENID;
  const { pageId, userId, newRole } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(adminId);

    // 验证角色值
    if (!['member', 'moderator'].includes(newRole)) {
      throw new Error('角色值无效');
    }

    // 检查成员是否存在
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'active'
      })
      .get();

    if (members.length === 0) {
      throw new Error('成员不存在');
    }

    // 更新角色
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId
      })
      .update({
        data: {
          member_role: newRole,
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '已更新成员角色'
    };
  } catch (error) {
    throw new Error(`更新角色失败: ${error.message}`);
  }
}

/**
 * 获取我的申请记录
 */
async function getMyApplications(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { page = 1, limit = 20 } = event;

  try {
    // 获取申请记录
    const { data: applications } = await db.collection('page_members')
      .where({
        user_id: userId,
        join_status: _.in(['pending', 'rejected'])
      })
      .orderBy('apply_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 获取页面信息
    if (applications.length > 0) {
      const pageIds = applications.map(a => a.page_id);
      const { data: pages } = await db.collection('partner_pages')
        .where({
          _id: _.in(pageIds)
        })
        .field({
          _id: true,
          page_name: true,
          cover_image: true,
          status: true
        })
        .get();

      const pageMap = {};
      pages.forEach(page => {
        pageMap[page._id] = page;
      });

      // 合并页面信息
      applications.forEach(app => {
        app.page_info = pageMap[app.page_id] || null;
      });
    }

    const { total } = await db.collection('page_members')
      .where({
        user_id: userId,
        join_status: _.in(['pending', 'rejected'])
      })
      .count();

    return {
      success: true,
      data: applications,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取申请记录失败: ${error.message}`);
  }
}

/**
 * 获取待审核申请列表（管理员）
 */
async function getPendingApplications(event) {
  const wxContext = cloud.getWXContext();
  const adminId = wxContext.OPENID;
  const { pageId, page = 1, limit = 20 } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(adminId);

    // 获取待审核申请
    const { data: applications } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: 'pending'
      })
      .orderBy('apply_time', 'asc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 获取用户信息
    if (applications.length > 0) {
      const userIds = applications.map(a => a.user_id);
      const { data: users } = await db.collection('users')
        .where({
          openid: _.in(userIds)
        })
        .field({
          openid: true,
          nickName: true,
          avatarUrl: true,
          cloudAvatarFileID: true,
          cloudFileID: true
        })
        .get();

      // 刷新云存储头像的临时URL
      const fileIDsToRefresh = [];
      const fileIDMap = {};
      users.forEach(user => {
        const fileID = user.cloudAvatarFileID || user.cloudFileID;
        if (fileID && fileID.startsWith('cloud://')) {
          fileIDsToRefresh.push(fileID);
          fileIDMap[fileID] = user.openid;
        }
      });

      // 批量获取临时URL
      if (fileIDsToRefresh.length > 0) {
        try {
          const result = await cloud.getTempFileURL({
            fileList: fileIDsToRefresh
          });

          if (result.fileList) {
            result.fileList.forEach(file => {
              if (file.tempFileURL) {
                const openid = fileIDMap[file.fileID];
                const user = users.find(u => u.openid === openid);
                if (user) {
                  user.avatarUrl = file.tempFileURL;
                }
              }
            });
          }
        } catch (error) {
          console.error('刷新头像URL失败:', error);
          // 继续使用原有的avatarUrl
        }
      }

      const userMap = {};
      users.forEach(user => {
        userMap[user.openid] = user;
      });

      // 合并用户信息
      applications.forEach(app => {
        app.user_info = userMap[app.user_id] || {
          nickName: '未知用户',
          avatarUrl: ''
        };
      });
    }

    const { total } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: 'pending'
      })
      .count();

    return {
      success: true,
      data: applications,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取待审核申请失败: ${error.message}`);
  }
}

/**
 * 获取成员信息
 */
async function getMemberInfo(event) {
  const wxContext = cloud.getWXContext();
  let { pageId, userId } = event;

  console.log('[getMemberInfo] ========== 开始查询成员信息 ==========');
  console.log('[getMemberInfo] 传入的 pageId:', pageId);
  console.log('[getMemberInfo] 传入的 userId:', userId);
  console.log('[getMemberInfo] 云函数调用者 OPENID:', wxContext.OPENID);

  try {
    // 如果 userId 为空，使用云函数上下文中的 OPENID
    if (!userId) {
      console.log('[getMemberInfo] ⚠️ userId 为空，使用云函数调用者的 OPENID');
      userId = wxContext.OPENID;
    }

    console.log('[getMemberInfo] 最终使用的 userId:', userId);
    console.log('[getMemberInfo] 最终使用的 pageId:', pageId);
    console.log('[getMemberInfo] userId 类型:', typeof userId);
    console.log('[getMemberInfo] pageId 类型:', typeof pageId);

    // 验证必要参数
    if (!pageId) {
      console.log('[getMemberInfo] ❌ pageId 为空');
      return {
        success: false,
        data: null,
        is_member: false,
        message: 'pageId 参数不能为空'
      };
    }

    if (!userId) {
      console.log('[getMemberInfo] ❌ userId 为空（云函数调用者 OPENID 也为空）');
      return {
        success: false,
        data: null,
        is_member: false,
        message: '无法获取用户身份'
      };
    }

    // 查询所有成员记录（可能有多条：旧的quit记录和新的active记录）
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId
      })
      .get();

    console.log('[getMemberInfo] 数据库查询结果 - 找到记录数:', members.length);

    if (members.length > 1) {
      console.log('[getMemberInfo] ⚠️ 发现多条成员记录，输出所有记录:');
      members.forEach((m, index) => {
        console.log(`  记录 ${index + 1}:`, {
          _id: m._id,
          join_status: m.join_status,
          create_time: m.create_time,
          update_time: m.update_time
        });
      });
    }

    if (members.length === 0) {
      console.log('[getMemberInfo] ❌ 未找到成员记录，返回非成员');
      return {
        success: true,
        data: null,
        is_member: false,
        message: '未找到成员记录'
      };
    }

    // 优先选择 active 状态的记录，如果没有则选择最新的记录
    let member;
    const activeMember = members.find(m => m.join_status === 'active');
    if (activeMember) {
      member = activeMember;
      console.log('[getMemberInfo] ✅ 找到 active 状态的记录');
    } else {
      // 按更新时间排序，取最新的
      members.sort((a, b) => {
        const timeA = new Date(a.update_time || a.create_time).getTime();
        const timeB = new Date(b.update_time || b.create_time).getTime();
        return timeB - timeA;
      });
      member = members[0];
      console.log('[getMemberInfo] ⚠️ 未找到 active 记录，使用最新的记录');
    }

    console.log('[getMemberInfo] 最终选择的成员记录:');
    console.log('  _id:', member._id);
    console.log('  page_id:', member.page_id);
    console.log('  user_id:', member.user_id);
    console.log('  join_status:', member.join_status);
    console.log('  member_role:', member.member_role);
    console.log('  apply_time:', member.apply_time);

    // 获取用户信息
    const { data: users } = await db.collection('users')
      .where({ openid: userId })
      .field({
        openid: true,
        nickName: true,
        avatarUrl: true
      })
      .get();

    // 填充用户信息
    member.user_info = users.length > 0 ? users[0] : {
      nickName: '未知用户',
      avatarUrl: ''
    };

    // 判断是否是有效成员：
    // 1. join_status 为 'active' (正常成员)
    // 2. 或者虽然已退出/被移除，但有已发布的文章 (历史成员)
    let isMember = member.join_status === 'active';
    console.log('[getMemberInfo] join_status:', member.join_status);
    console.log('[getMemberInfo] 初步判断 is_member:', isMember);

    // 如果不是活跃成员，检查是否有文章
    if (!isMember && ['quit', 'removed'].includes(member.join_status)) {
      console.log('[getMemberInfo] 非活跃成员，检查是否有已发布文章...');

      const { total: articleCount } = await db.collection('partner_articles')
        .where({
          page_id: pageId,
          user_id: userId,
          publish_type: 'partner',
          status: _.neq('deleted')  // 任何未删除的文章
        })
        .count();

      console.log('[getMemberInfo] 找到文章数量:', articleCount);

      if (articleCount > 0) {
        isMember = true;
        console.log('[getMemberInfo] ✅ 虽然已退出/被移除，但有文章，视为成员');
      }
    }

    console.log('[getMemberInfo] 最终 is_member 判断结果:', isMember);
    console.log('[getMemberInfo] ========== 成员信息查询完成 ==========');

    return {
      success: true,
      data: member,
      is_member: isMember,
      message: isMember ?
        (member.join_status === 'active' ? '是活跃成员' : '有文章的历史成员') :
        `成员状态: ${member.join_status}`
    };
  } catch (error) {
    console.error('[getMemberInfo] ❌ 查询失败:', error);
    throw new Error(`获取成员信息失败: ${error.message}`);
  }
}

/**
 * 辅助函数：验证管理员权限
 */
async function verifyAdminPermission(userId) {
  const { data: users } = await db.collection('users')
    .where({ openid: userId })
    .get();

  if (users.length === 0 || users[0].role !== 'admin') {
    throw new Error('您没有管理员权限');
  }

  return true;
}

/**
 * 生成推广Token（新版安全方式）
 */
async function generatePromotionToken(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    console.log(`[generatePromotionToken] 用户 ${userId} 为页面 ${pageId} 生成推广Token`);

    // 1. 验证用户是否是页面成员
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'active'
      })
      .get();

    if (members.length === 0) {
      throw new Error('您不是该页面的成员，无法生成推广链接');
    }

    // 2. 检查是否已有有效的token（24小时内生成的）
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { data: existingTokens } = await db.collection('promotion_tokens')
      .where({
        page_id: pageId,
        promoter_id: userId,
        is_active: true,
        create_time: _.gte(oneDayAgo)
      })
      .orderBy('create_time', 'desc')
      .limit(1)
      .get();

    // 如果有24小时内的token，直接返回
    if (existingTokens.length > 0) {
      console.log(`[generatePromotionToken] 复用已有Token: ${existingTokens[0].token}`);
      return {
        success: true,
        message: '获取推广Token成功',
        data: {
          token: existingTokens[0].token,
          create_time: existingTokens[0].create_time,
          is_reused: true
        }
      };
    }

    // 3. 生成新的6位随机Token
    const token = generateRandomToken(6);
    const now = new Date();
    const expireTime = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30天过期

    // 4. 存入数据库
    await db.collection('promotion_tokens').add({
      data: {
        token: token,
        page_id: pageId,
        promoter_id: userId,
        create_time: now,
        expire_time: expireTime,
        use_count: 0,
        last_use_time: null,
        is_active: true
      }
    });

    // 5. 更新成员的推广链接生成次数
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId
      })
      .update({
        data: {
          promotion_link_generation_count: _.inc(1),
          last_promotion_link_generation_time: now,
          update_time: now
        }
      });

    console.log(`[generatePromotionToken] ✅ 生成新Token成功: ${token}`);

    return {
      success: true,
      message: '生成推广Token成功',
      data: {
        token: token,
        create_time: now,
        expire_time: expireTime,
        is_reused: false
      }
    };
  } catch (error) {
    console.error('[generatePromotionToken] 错误:', error);
    throw new Error(`生成推广Token失败: ${error.message}`);
  }
}

/**
 * 验证推广Token并返回推广者ID
 */
async function validatePromotionToken(event) {
  const { token, pageId } = event;

  try {
    console.log(`[validatePromotionToken] 验证Token: ${token}, 页面: ${pageId}`);

    if (!token || !pageId) {
      throw new Error('参数缺失');
    }

    // 查询Token记录
    const { data: tokens } = await db.collection('promotion_tokens')
      .where({
        token: token,
        page_id: pageId,
        is_active: true
      })
      .get();

    if (tokens.length === 0) {
      console.log(`[validatePromotionToken] ❌ Token不存在或已失效`);
      return {
        success: false,
        message: 'Token无效',
        data: null
      };
    }

    const tokenData = tokens[0];

    // 检查是否过期
    if (new Date() > new Date(tokenData.expire_time)) {
      console.log(`[validatePromotionToken] ❌ Token已过期`);

      // 将token设置为失效
      await db.collection('promotion_tokens')
        .where({ _id: tokenData._id })
        .update({
          data: {
            is_active: false,
            update_time: new Date()
          }
        });

      return {
        success: false,
        message: 'Token已过期',
        data: null
      };
    }

    // 更新使用次数和最后使用时间
    const now = new Date();
    await db.collection('promotion_tokens')
      .where({ _id: tokenData._id })
      .update({
        data: {
          use_count: _.inc(1),
          last_use_time: now,
          update_time: now
        }
      });

    console.log(`[validatePromotionToken] ✅ Token验证成功，推广者: ${tokenData.promoter_id}`);

    return {
      success: true,
      message: 'Token有效',
      data: {
        promoter_id: tokenData.promoter_id,
        page_id: tokenData.page_id
      }
    };
  } catch (error) {
    console.error('[validatePromotionToken] 错误:', error);
    throw new Error(`验证Token失败: ${error.message}`);
  }
}

/**
 * 辅助函数：生成随机Token
 */
function generateRandomToken(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的字符 I,O,0,1
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * 记录推广访问
 */
async function recordPromotionVisit(event) {
  const wxContext = cloud.getWXContext();
  const visitorId = wxContext.OPENID;
  const { pageId, promoterId } = event;

  try {
    console.log(`[recordPromotionVisit] 访问记录 - 页面: ${pageId}, 推广者: ${promoterId}, 访客: ${visitorId}`);

    // 检查是否是推广者自己访问（不记录）
    if (visitorId === promoterId) {
      console.log('[recordPromotionVisit] 推广者自己访问，不记录');
      return {
        success: true,
        message: '推广者自己访问，不记录'
      };
    }

    const now = new Date();

    // 记录到推广访问记录表
    await db.collection('promotion_visits').add({
      data: {
        page_id: pageId,
        promoter_id: promoterId,
        visitor_id: visitorId,
        visit_time: now,
        create_time: now
      }
    });

    // 更新成员的推广访问统计
    await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: promoterId,
        join_status: 'active'
      })
      .update({
        data: {
          promotion_visit_count: _.inc(1),
          last_promotion_visit_time: now,
          update_time: now
        }
      });

    console.log('[recordPromotionVisit] ✅ 推广访问记录成功');

    return {
      success: true,
      message: '推广访问记录成功'
    };
  } catch (error) {
    console.error('[recordPromotionVisit] 错误:', error);
    throw new Error(`记录推广访问失败: ${error.message}`);
  }
}

/**
 * 获取推广统计数据
 */
async function getPromotionStats(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 获取成员信息
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        user_id: userId,
        join_status: 'active'
      })
      .get();

    if (members.length === 0) {
      throw new Error('您不是该页面的成员');
    }

    const member = members[0];

    // 获取推广访问记录
    const { data: visits } = await db.collection('promotion_visits')
      .where({
        page_id: pageId,
        promoter_id: userId
      })
      .orderBy('visit_time', 'desc')
      .limit(100)
      .get();

    // 统计数据
    const stats = {
      link_generation_count: member.promotion_link_generation_count || 0,
      visit_count: member.promotion_visit_count || 0,
      last_generation_time: member.last_promotion_link_generation_time || null,
      last_visit_time: member.last_promotion_visit_time || null,
      recent_visits: visits
    };

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('[getPromotionStats] 错误:', error);
    throw new Error(`获取推广统计失败: ${error.message}`);
  }
}
