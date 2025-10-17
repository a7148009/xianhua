// 云函数：合作页面管理
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 合作页面管理云函数
 * 支持管理员和普通用户的不同操作
 */
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      // 管理员操作
      case 'createPage':
        return await createPage(event);
      case 'updatePage':
        return await updatePage(event);
      case 'deletePage':
        return await deletePage(event);
      case 'getPageStats':
        return await getPageStats(event);

      // 通用操作（管理员和用户都可用）
      case 'getPageList':
        return await getPageList(event);
      case 'getPageDetail':
        return await getPageDetail(event);
      case 'getPageMembers':
        return await getPageMembers(event);
      case 'getMyPages':
        return await getMyPages(event);
      case 'getAllPages':
        return await getAllPages(event);

      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('[partnerPageManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败',
      error: error.toString()
    };
  }
};

/**
 * 创建合作页面（管理员）
 */
async function createPage(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  const {
    pageName,
    pageDesc = '',
    coverImage = '',
    maxMembers = 60,
    enableAutoApprove = false
  } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(userId);

    // 验证必填字段
    if (!pageName || pageName.trim().length === 0) {
      throw new Error('页面名称不能为空');
    }

    if (pageName.length > 50) {
      throw new Error('页面名称不能超过50个字符');
    }

    // 检查页面名称是否重复
    const { total } = await db.collection('partner_pages')
      .where({
        page_name: pageName,
        status: _.neq('deleted')
      })
      .count();

    if (total > 0) {
      throw new Error('该页面名称已存在，请使用其他名称');
    }

    // 创建页面数据
    const now = new Date();
    const pageData = {
      page_name: pageName,
      page_desc: pageDesc,
      cover_image: coverImage,
      status: 'active',
      max_members: maxMembers,
      member_count: 0,
      article_count: 0,
      total_views: 0,
      total_visitors: 0,
      enable_auto_approve: enableAutoApprove,
      creator_id: userId,
      create_time: now,
      update_time: now
    };

    const { _id } = await db.collection('partner_pages').add({
      data: pageData
    });

    return {
      success: true,
      message: '创建合作页面成功',
      data: {
        page_id: _id,
        page_name: pageName
      }
    };
  } catch (error) {
    throw new Error(`创建页面失败: ${error.message}`);
  }
}

/**
 * 更新合作页面（管理员）
 */
async function updatePage(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  const {
    pageId,
    pageName,
    pageDesc,
    coverImage,
    maxMembers,
    enableAutoApprove,
    status
  } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(userId);

    // 验证页面是否存在
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    // 构建更新数据
    const updateData = { update_time: new Date() };

    if (pageName !== undefined) {
      if (pageName.trim().length === 0) {
        throw new Error('页面名称不能为空');
      }
      if (pageName.length > 50) {
        throw new Error('页面名称不能超过50个字符');
      }

      // 检查名称是否重复（排除自己）
      const { total } = await db.collection('partner_pages')
        .where({
          page_name: pageName,
          _id: _.neq(pageId),
          status: _.neq('deleted')
        })
        .count();

      if (total > 0) {
        throw new Error('该页面名称已存在');
      }

      updateData.page_name = pageName;
    }

    if (pageDesc !== undefined) updateData.page_desc = pageDesc;
    if (coverImage !== undefined) updateData.cover_image = coverImage;
    if (maxMembers !== undefined) {
      if (maxMembers < pages[0].member_count) {
        throw new Error('最大成员数不能小于当前成员数');
      }
      updateData.max_members = maxMembers;
    }
    if (enableAutoApprove !== undefined) updateData.enable_auto_approve = enableAutoApprove;
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        throw new Error('状态值无效');
      }
      updateData.status = status;
    }

    await db.collection('partner_pages')
      .where({ _id: pageId })
      .update({ data: updateData });

    return {
      success: true,
      message: '更新页面成功'
    };
  } catch (error) {
    throw new Error(`更新页面失败: ${error.message}`);
  }
}

/**
 * 删除合作页面（管理员，软删除）
 */
async function deletePage(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(userId);

    // 验证页面是否存在
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    if (pages[0].status === 'deleted') {
      throw new Error('页面已被删除');
    }

    // 检查是否有活跃的成员或文章
    const { total: memberCount } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: 'active'
      })
      .count();

    const { total: articleCount } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        status: 'active'
      })
      .count();

    if (memberCount > 0 || articleCount > 0) {
      throw new Error(`无法删除：该页面还有 ${memberCount} 个活跃成员和 ${articleCount} 篇文章`);
    }

    // 软删除
    await db.collection('partner_pages')
      .where({ _id: pageId })
      .update({
        data: {
          status: 'deleted',
          delete_time: new Date(),
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '删除页面成功'
    };
  } catch (error) {
    throw new Error(`删除页面失败: ${error.message}`);
  }
}

/**
 * 获取页面统计数据（管理员）
 */
async function getPageStats(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 验证管理员权限
    await verifyAdminPermission(userId);

    // 获取页面基本信息
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    const page = pages[0];

    // 获取成员统计
    const { total: totalMembers } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: 'active'
      })
      .count();

    const { total: pendingMembers } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: 'pending'
      })
      .count();

    // 获取文章统计
    const { total: partnerArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        publish_type: 'partner',
        status: 'active'
      })
      .count();

    const { total: paidArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        publish_type: 'paid',
        status: 'active'
      })
      .count();

    // 获取文章总览统计
    const $ = db.command.aggregate;
    const articlesAgg = await db.collection('partner_articles')
      .aggregate()
      .match({
        page_id: pageId,
        status: 'active'
      })
      .group({
        _id: null,
        totalViews: $.sum('$view_count'),
        totalShares: $.sum('$share_count'),
        totalLikes: $.sum('$like_count'),
        totalPromotionViews: $.sum('$total_promotion_views'),
        totalPromotionVisitors: $.sum('$total_promotion_visitors')
      })
      .end();

    const articleStats = articlesAgg.list.length > 0 ? articlesAgg.list[0] : {
      totalViews: 0,
      totalShares: 0,
      totalLikes: 0,
      totalPromotionViews: 0,
      totalPromotionVisitors: 0
    };

    // 获取TOP推广者
    const topPromotersAgg = await db.collection('promoter_earnings')
      .aggregate()
      .match({ page_id: pageId })
      .group({
        _id: '$promoter_id',
        totalEarned: $.sum('$total_earned_score'),
        totalViews: $.sum('$total_views'),
        totalVisitors: $.sum('$total_visitors')
      })
      .sort({ totalEarned: -1 })
      .limit(10)
      .end();

    // 获取用户信息
    const promoterIds = topPromotersAgg.list.map(p => p._id);
    let topPromoters = [];

    if (promoterIds.length > 0) {
      const { data: users } = await db.collection('users')
        .where({
          openid: _.in(promoterIds)
        })
        .field({
          openid: true,
          nickName: true,
          avatarUrl: true
        })
        .get();

      const userMap = {};
      users.forEach(user => {
        userMap[user.openid] = user;
      });

      topPromoters = topPromotersAgg.list.map(p => ({
        user_id: p._id,
        nickName: userMap[p._id]?.nickName || '未知用户',
        avatarUrl: userMap[p._id]?.avatarUrl || '',
        total_earned: p.totalEarned,
        total_views: p.totalViews,
        total_visitors: p.totalVisitors
      }));
    }

    return {
      success: true,
      data: {
        page_info: {
          page_id: page._id,
          page_name: page.page_name,
          page_desc: page.page_desc,
          cover_image: page.cover_image,
          status: page.status,
          create_time: page.create_time
        },
        member_stats: {
          total_members: totalMembers,
          pending_members: pendingMembers,
          max_members: page.max_members,
          available_slots: page.max_members - totalMembers
        },
        article_stats: {
          partner_articles: partnerArticles,
          paid_articles: paidArticles,
          total_articles: partnerArticles + paidArticles,
          total_views: articleStats.totalViews,
          total_shares: articleStats.totalShares,
          total_likes: articleStats.totalLikes,
          total_promotion_views: articleStats.totalPromotionViews,
          total_promotion_visitors: articleStats.totalPromotionVisitors
        },
        top_promoters: topPromoters
      }
    };
  } catch (error) {
    throw new Error(`获取页面统计失败: ${error.message}`);
  }
}

/**
 * 获取页面列表（分页）
 */
async function getPageList(event) {
  const { page = 1, limit = 20, status = 'active' } = event;

  try {
    const where = { status };

    const { data: pages } = await db.collection('partner_pages')
      .where(where)
      .orderBy('create_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    const { total } = await db.collection('partner_pages')
      .where(where)
      .count();

    return {
      success: true,
      data: pages,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取页面列表失败: ${error.message}`);
  }
}

/**
 * 获取所有页面（普通用户查看）
 */
async function getAllPages(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { page = 1, limit = 20 } = event;

  try {
    // 获取所有活跃页面
    const { data: pages } = await db.collection('partner_pages')
      .where({ status: 'active' })
      .orderBy('create_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 获取用户加入状态
    if (pages.length > 0) {
      const pageIds = pages.map(p => p._id);
      const { data: memberships } = await db.collection('page_members')
        .where({
          user_id: userId,
          page_id: _.in(pageIds)
        })
        .field({
          page_id: true,
          join_status: true
        })
        .get();

      const membershipMap = {};
      memberships.forEach(m => {
        membershipMap[m.page_id] = m.join_status;
      });

      // 添加加入状态
      pages.forEach(page => {
        page.user_join_status = membershipMap[page._id] || null;
        page.is_joined = membershipMap[page._id] === 'active';
        page.is_pending = membershipMap[page._id] === 'pending';
      });
    }

    const { total } = await db.collection('partner_pages')
      .where({ status: 'active' })
      .count();

    return {
      success: true,
      data: pages,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取所有页面失败: ${error.message}`);
  }
}

/**
 * 获取页面详情
 */
async function getPageDetail(event) {
  const { pageId } = event;

  try {
    const { data: pages } = await db.collection('partner_pages')
      .where({ _id: pageId })
      .get();

    if (pages.length === 0) {
      throw new Error('页面不存在');
    }

    return {
      success: true,
      data: pages[0]
    };
  } catch (error) {
    throw new Error(`获取页面详情失败: ${error.message}`);
  }
}

/**
 * 获取页面成员列表
 */
async function getPageMembers(event) {
  const {
    pageId,
    page = 1,
    limit = 20,
    joinStatus = 'active'
  } = event;

  try {
    // 获取成员列表
    const { data: members } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: joinStatus
      })
      .orderBy('join_status', 'asc')
      .orderBy('approve_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 获取用户信息
    if (members.length > 0) {
      const userIds = members.map(m => m.user_id);
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
      members.forEach(member => {
        member.user_info = userMap[member.user_id] || {
          nickName: '未知用户',
          avatarUrl: ''
        };
      });
    }

    const { total } = await db.collection('page_members')
      .where({
        page_id: pageId,
        join_status: joinStatus
      })
      .count();

    return {
      success: true,
      data: members,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取成员列表失败: ${error.message}`);
  }
}

/**
 * 获取我加入的页面
 */
async function getMyPages(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { page = 1, limit = 20 } = event;

  try {
    // 获取我加入的页面ID列表
    const { data: memberships } = await db.collection('page_members')
      .where({
        user_id: userId,
        join_status: 'active'
      })
      .field({
        page_id: true,
        member_role: true,
        published_count: true,
        join_time: true
      })
      .get();

    if (memberships.length === 0) {
      return {
        success: true,
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          total_pages: 0
        }
      };
    }

    const pageIds = memberships.map(m => m.page_id);
    const membershipMap = {};
    memberships.forEach(m => {
      membershipMap[m.page_id] = {
        role: m.member_role,
        published_count: m.published_count,
        join_time: m.join_time
      };
    });

    // 获取页面详情
    const { data: pages } = await db.collection('partner_pages')
      .where({
        _id: _.in(pageIds),
        status: _.in(['active', 'disabled'])
      })
      .orderBy('create_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 添加成员信息
    pages.forEach(page => {
      const membership = membershipMap[page._id];
      page.my_role = membership.role;
      page.my_published_count = membership.published_count;
      page.my_join_time = membership.join_time;
    });

    return {
      success: true,
      data: pages,
      pagination: {
        page,
        limit,
        total: memberships.length,
        total_pages: Math.ceil(memberships.length / limit)
      }
    };
  } catch (error) {
    throw new Error(`获取我的页面失败: ${error.message}`);
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
