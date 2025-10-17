// 云函数：合作文章管理（核心云函数）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 合作文章管理云函数
 */
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      // 查询相关
      case 'getList':
        return await getArticleList(event);
      case 'getListWithDefaultSort':
        return await getArticlesWithDefaultSort(event);
      case 'getListWithPromotionSort':
        return await getArticlesWithPromotionSort(event);
      case 'getDetail':
        return await getArticleDetail(event);
      case 'getMyArticles':
        return await getMyArticles(event);
      case 'getAvailableSorts':
        return await getAvailableSorts(event);

      // 发布相关
      case 'publish':
        return await publishArticle(event);
      case 'createArticle':
        return await createArticle(event);
      case 'update':
        return await updateArticle(event);
      case 'delete':
        return await deleteArticle(event);
      case 'deleteArticle':
        return await deleteArticle(event);

      // 排序相关
      case 'checkSortAvailable':
        return await checkSortAvailable(event);
      case 'getAvailableSortPositions':
        return await getAvailableSortPositions(event);
      case 'updateSortPosition':
        return await updateSortPosition(event);
      case 'getSortPoolStats':
        return await getSortPoolStats(event);
      case 'reorder':
        return await reorderArticle(event);

      // 互动相关
      case 'getArticleDetail':
        return await getArticleDetail(event);
      case 'increaseViewCount':
        return await increaseViewCount(event);
      case 'likeArticle':
        return await likeArticle(event);
      case 'shareArticle':
        return await shareArticle(event);

      // 审核相关
      case 'getPendingArticles':
        return await getPendingArticles(event);
      case 'getArticleById':
        return await getArticleById(event);
      case 'approveArticle':
        return await approveArticle(event);
      case 'rejectArticle':
        return await rejectArticle(event);

      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('[partnerArticleManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败',
      error: error.toString()
    };
  }
};

/**
 * 获取文章列表（默认排序）
 * 使用动态压缩排序：根据 default_sort 计算 actual_sort
 */
async function getArticlesWithDefaultSort(event) {
  const { pageId, page = 1, limit = 20 } = event;

  try {
    // 查询有效文章（积分充足）
    const { data: articles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        status: 'active',
        is_visible: true,
        is_score_sufficient: true
      })
      .orderBy('default_sort', 'asc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 动态计算压缩排序位
    // display_sort 显示虚拟排序位 (default_sort)
    // actual_sort 显示压缩后的实际排序位（从1开始连续）
    articles.forEach((article, index) => {
      article.display_sort = article.default_sort;  // 显示用户选择的虚拟排序位
      article.actual_sort = (page - 1) * limit + index + 1;  // 压缩后的实际排序位
    });

    return {
      success: true,
      data: articles,
      sort_type: 'default',
      page,
      limit
    };
  } catch (error) {
    throw new Error(`获取文章列表失败: ${error.message}`);
  }
}

/**
 * 获取文章列表（推广排序）
 */
async function getArticlesWithPromotionSort(event) {
  const wxContext = cloud.getWXContext();
  let { pageId, promoterId, page = 1, limit = 100 } = event;

  // 如果没有传入 promoterId，使用云函数调用者的 OPENID
  if (!promoterId) {
    promoterId = wxContext.OPENID;
    console.log(`[getArticlesWithPromotionSort] promoterId 为空，使用调用者 OPENID: ${promoterId}`);
  }

  try {
    // 1. 查询推广者自己的文章（包含所有未删除的文章，含被拒绝的）
    // 注意：被拒绝的文章 status='rejected'，所以需要查询所有非deleted状态
    const { data: myArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        user_id: promoterId,
        publish_type: 'partner',  // 只查询合作发布的文章
        status: _.in(['pending', 'active', 'rejected'])  // 明确列出所有要显示的状态
      })
      .orderBy('create_time', 'desc')
      .get();

    console.log(`[getArticlesWithPromotionSort] pageId: ${pageId}, promoterId: ${promoterId}`);
    console.log(`[getArticlesWithPromotionSort] 推广者自己的文章数量: ${myArticles.length}`);

    // 输出详细的文章状态信息用于调试
    myArticles.forEach((article, index) => {
      console.log(`  [${index + 1}] ${article.title} | status: ${article.status} | review: ${article.review_status || '无'} | visible: ${article.is_visible}`);
    });

    // 为自己的文章补充 review_status
    myArticles.forEach(article => {
      if (!article.review_status) {
        if (article.status === 'pending') {
          article.review_status = 'pending';
        } else if (article.status === 'rejected') {
          article.review_status = 'rejected';
        } else if (article.status === 'active') {
          article.review_status = 'approved';
        } else {
          article.review_status = 'pending';
        }
      }
    });

    // 2. 查询其他人的文章（只显示审核通过的）
    const { data: othersArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        user_id: _.neq(promoterId),
        status: 'active',
        is_visible: true,
        is_score_sufficient: true
      })
      .orderBy('default_sort', 'asc')
      .get();

    // 3. 合并并计算虚拟排序
    const allArticles = [...myArticles, ...othersArticles];
    allArticles.forEach((article, index) => {
      article.display_sort = index + 1;
      article.is_promoted = article.user_id === promoterId;
    });

    // 4. 分页
    const startIndex = (page - 1) * limit;
    const paginatedArticles = allArticles.slice(startIndex, startIndex + limit);

    return {
      success: true,
      data: paginatedArticles,
      sort_type: 'promotion',
      promoter_id: promoterId,
      my_articles_count: myArticles.length,
      others_articles_count: othersArticles.length,
      total: allArticles.length,
      page,
      limit
    };
  } catch (error) {
    throw new Error(`获取推广排序列表失败: ${error.message}`);
  }
}

/**
 * 获取文章详情
 */
async function getArticleDetail(event) {
  const { hashId } = event;

  try {
    const { data: articles } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    return {
      success: true,
      data: articles[0]
    };
  } catch (error) {
    throw new Error(`获取文章详情失败: ${error.message}`);
  }
}

/**
 * 获取我的文章列表（显示所有未删除的文章）
 */
async function getMyArticles(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId, page = 1, limit = 20 } = event;

  try {
    const where = {
      user_id: userId,
      status: _.neq('deleted')  // 只排除已删除的文章，显示所有其他状态
    };

    if (pageId) {
      where.page_id = pageId;
    }

    const { data: articles } = await db.collection('partner_articles')
      .where(where)
      .orderBy('create_time', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    console.log(`[getMyArticles] userId: ${userId}, 查询到 ${articles.length} 篇文章`);

    // 为没有 review_status 的老数据设置默认值
    articles.forEach(article => {
      if (!article.review_status) {
        // 根据 status 推断 review_status
        if (article.status === 'pending') {
          article.review_status = 'pending';
        } else if (article.status === 'rejected') {
          article.review_status = 'rejected';
        } else if (article.status === 'active') {
          article.review_status = 'approved';
        } else {
          article.review_status = 'pending'; // 默认待审核
        }
      }
    });

    return {
      success: true,
      data: articles,
      page,
      limit
    };
  } catch (error) {
    throw new Error(`获取我的文章失败: ${error.message}`);
  }
}

/**
 * 获取可用的付费排序位置（61-1000）
 */
async function getAvailableSorts(event) {
  const { pageId } = event;

  try {
    // 查询已占用的付费排序位（61-1000）
    const { data: paidArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        actual_sort: _.gte(61),
        status: 'active'
      })
      .field({ actual_sort: true })
      .get();

    const usedSorts = new Set(paidArticles.map(a => a.actual_sort));
    const availableSorts = [];

    // 返回前50个可用位置（61-110）
    for (let i = 61; i <= 110; i++) {
      if (!usedSorts.has(i)) {
        availableSorts.push(i);
      }
      if (availableSorts.length >= 50) break;
    }

    return {
      success: true,
      data: {
        available_sorts: availableSorts,
        price_per_position: 50,
        total_available: availableSorts.length
      }
    };
  } catch (error) {
    throw new Error(`获取可用排序位失败: ${error.message}`);
  }
}

/**
 * 创建文章（简化版，适配前端调用）
 */
async function createArticle(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  const {
    pageId,
    publishType,
    title,
    content,
    images = [],
    contactPhone = '',
    contactWechat = '',
    customSort = null,
    payAmount = 0
  } = event;

  try {
    // 1. 验证权限
    if (publishType === 'partner') {
      const { total } = await db.collection('page_members')
        .where({
          page_id: pageId,
          user_id: userId,
          join_status: 'active'
        })
        .count();

      if (total === 0) {
        throw new Error('您不是该页面的成员，无法发布Partner文章');
      }
    } else if (publishType === 'paid') {
      // 验证VIP状态
      const { data: users } = await db.collection('users')
        .where({ openid: userId })
        .get();

      if (users.length === 0 || users[0].vip_status !== 'active') {
        throw new Error('付费发布功能仅对VIP用户开放');
      }
    }

    // 2. 生成Hash ID
    const hashId = await generateArticleHashId(pageId, userId);

    // 3. 分配排序位
    const sortInfo = await assignArticleSort(pageId, userId, publishType, customSort);

    // 4. 创建文章数据
    const now = new Date();
    const articleData = {
      hash_id: hashId,
      page_id: pageId,
      user_id: userId,
      title,
      content,
      images,
      contact_phone: contactPhone,
      contact_wechat: contactWechat,
      location: null,
      publish_type: publishType,
      is_paid: publishType === 'paid',
      paid_amount: payAmount || sortInfo.suggested_price || 0,
      default_sort: sortInfo.default_sort,
      promotion_sort: sortInfo.promotion_sort,
      actual_sort: sortInfo.actual_sort,
      group_type: sortInfo.group_type,
      audit_status: publishType === 'partner' ? 'pending' : 'approved',
      review_status: publishType === 'partner' ? 'pending' : 'approved',
      promotion_score: publishType === 'partner' ? 100 : 0,
      is_score_sufficient: publishType === 'partner',
      total_promotion_views: 0,
      total_promotion_visitors: 0,
      view_count: 0,
      share_count: 0,
      like_count: 0,
      status: publishType === 'partner' ? 'pending' : 'active',
      is_visible: publishType === 'partner' ? false : true,
      expire_at: publishType === 'paid' ?
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
      publish_time: now,
      create_time: now,
      update_time: now
    };

    // 如果是付费模式，创建订单
    let orderId = null;
    if (publishType === 'paid') {
      articleData.status = 'pending'; // 待支付状态
      articleData.is_visible = false; // 支付前不可见

      // 创建支付订单
      const orderResult = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'create',
          orderType: 'article_publish',
          amount: articleData.paid_amount,
          relatedId: hashId,
          description: `付费发布文章 - 排序位${sortInfo.actual_sort}`
        }
      });

      if (orderResult.result && orderResult.result.success) {
        orderId = orderResult.result.data.order_id;
        articleData.order_id = orderId;
      }
    }

    const { _id } = await db.collection('partner_articles').add({
      data: articleData
    });

    // 5. 初始化统计数据
    await initArticleStatistics(hashId, pageId, userId);

    // 6. 更新成员统计（仅Partner模式）
    if (publishType === 'partner') {
      await db.collection('page_members')
        .where({
          page_id: pageId,
          user_id: userId
        })
        .update({
          data: {
            published_count: _.inc(1),
            update_time: now
          }
        });
    }

    return {
      success: true,
      message: publishType === 'partner' ? '发布成功' : '文章已创建，请完成支付',
      data: {
        _id,
        hash_id: hashId,
        default_sort: sortInfo.default_sort,
        promotion_sort: sortInfo.promotion_sort,
        initial_score: articleData.promotion_score,
        order_id: orderId,
        publish_type: publishType
      }
    };
  } catch (error) {
    throw new Error(`创建文章失败: ${error.message}`);
  }
}

/**
 * 发布文章（核心逻辑）
 */
async function publishArticle(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  const {
    pageId,
    title,
    content,
    images = [],
    contactPhone = '',
    contactWechat = '',
    location = null,
    publishType = 'partner',
    preferredSort = null
  } = event;

  try {
    // 1. 验证权限
    if (publishType === 'partner') {
      const { total } = await db.collection('page_members')
        .where({
          page_id: pageId,
          user_id: userId,
          join_status: 'active'
        })
        .count();

      if (total === 0) {
        throw new Error('您不是该页面的成员，无法发布Partner文章');
      }
    }

    // 2. 生成Hash ID
    const hashId = await generateArticleHashId(pageId, userId);

    // 3. 分配排序位
    const sortInfo = await assignArticleSort(pageId, userId, publishType, preferredSort);

    // 4. 创建文章数据
    const now = new Date();
    const articleData = {
      hash_id: hashId,
      page_id: pageId,
      user_id: userId,
      title,
      content,
      images,
      contact_phone: contactPhone,
      contact_wechat: contactWechat,
      location,
      publish_type: publishType,
      is_paid: publishType === 'paid',
      paid_amount: sortInfo.suggested_price || 0,
      default_sort: sortInfo.default_sort,
      promotion_sort: sortInfo.promotion_sort,
      actual_sort: sortInfo.actual_sort,
      group_type: sortInfo.group_type,
      audit_status: 'approved',  // 暂时自动通过
      promotion_score: publishType === 'partner' ? 100 : 0,
      is_score_sufficient: publishType === 'partner',
      total_promotion_views: 0,
      total_promotion_visitors: 0,
      view_count: 0,
      share_count: 0,
      like_count: 0,
      status: 'active',
      is_visible: true,
      expire_at: publishType === 'paid' ?
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
      publish_time: now,
      create_time: now,
      update_time: now
    };

    const { _id } = await db.collection('partner_articles').add({
      data: articleData
    });

    // 5. 初始化统计数据
    await initArticleStatistics(hashId, pageId, userId);

    // 6. 更新成员统计
    if (publishType === 'partner') {
      await db.collection('page_members')
        .where({
          page_id: pageId,
          user_id: userId
        })
        .update({
          data: {
            published_count: _.inc(1),
            update_time: now
          }
        });
    }

    return {
      success: true,
      message: '发布成功',
      data: {
        id: _id,
        hash_id: hashId,
        default_sort: sortInfo.default_sort,
        promotion_sort: sortInfo.promotion_sort,
        initial_score: articleData.promotion_score
      }
    };
  } catch (error) {
    throw new Error(`发布文章失败: ${error.message}`);
  }
}

/**
 * 更新文章
 */
async function updateArticle(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  const {
    hashId,
    title,
    content,
    images,
    contactPhone,
    contactWechat,
    location
  } = event;

  try {
    // 验证权限
    const { data: articles } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    if (articles[0].user_id !== userId) {
      throw new Error('您没有权限修改此文章');
    }

    // 更新数据
    const updateData = { update_time: new Date() };
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (images) updateData.images = images;
    if (contactPhone !== undefined) updateData.contact_phone = contactPhone;
    if (contactWechat !== undefined) updateData.contact_wechat = contactWechat;
    if (location) updateData.location = location;

    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({ data: updateData });

    return {
      success: true,
      message: '更新成功'
    };
  } catch (error) {
    throw new Error(`更新文章失败: ${error.message}`);
  }
}

/**
 * 删除文章
 */
async function deleteArticle(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { hashId } = event;

  try {
    // 验证权限
    const { data: articles } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    if (articles[0].user_id !== userId) {
      throw new Error('您没有权限删除此文章');
    }

    // 软删除
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          status: 'deleted',
          is_visible: false,
          delete_time: new Date(),
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '删除成功'
    };
  } catch (error) {
    throw new Error(`删除文章失败: ${error.message}`);
  }
}

/**
 * 检查排序位是否可用
 */
async function checkSortAvailable(event) {
  const { pageId, sortPosition } = event;

  try {
    const { total } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        actual_sort: sortPosition,
        status: 'active'
      })
      .count();

    return {
      success: true,
      available: total === 0,
      sort_position: sortPosition
    };
  } catch (error) {
    throw new Error(`检查排序位失败: ${error.message}`);
  }
}

/**
 * 辅助函数：生成文章Hash ID
 */
async function generateArticleHashId(pageId, userId) {
  const maxRetries = 5;

  for (let i = 0; i < maxRetries; i++) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const source = `${pageId}-${userId}-${timestamp}-${random}`;

    const hash = crypto.createHash('sha256')
      .update(source)
      .digest('hex');

    const hashId = hash.substring(0, 8).toUpperCase();

    const { total } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .count();

    if (total === 0) {
      return hashId;
    }

    // 延迟后重试
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error('生成Hash ID失败，请重试');
}

/**
 * 辅助函数：分配排序位
 */
async function assignArticleSort(pageId, userId, publishType, preferredSort = null) {
  // 1. 分配默认排序位
  const defaultSort = await assignDefaultSort(pageId, publishType, preferredSort);

  // 2. 分配推广排序位
  const promotionSort = await assignPromotionSort(pageId, userId);

  return {
    default_sort: defaultSort.sort,
    promotion_sort: promotionSort,
    actual_sort: defaultSort.sort,
    group_type: publishType,
    suggested_price: defaultSort.price
  };
}

/**
 * 分配默认排序位（1-60独占模式，合作发布和付费发布共享）
 */
async function assignDefaultSort(pageId, publishType, preferredSort = null) {
  console.log(`[assignDefaultSort] pageId: ${pageId}, publishType: ${publishType}, preferredSort: ${preferredSort}`);

  // 1. 如果指定了排序位，验证并使用指定位置
  if (preferredSort !== null) {
    if (preferredSort < 1 || preferredSort > 60) {
      throw new Error('排序位必须在1-60之间');
    }

    // 检查该排序位是否被占用
    const { data: occupiedArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        actual_sort: preferredSort,
        status: _.in(['pending', 'active', 'rejected'])
      })
      .get();

    if (occupiedArticles.length > 0) {
      throw new Error(`排序位 ${preferredSort} 已被占用`);
    }

    const price = publishType === 'paid' ? calculatePrice(preferredSort) : 0;
    console.log(`[assignDefaultSort] 使用指定排序位: ${preferredSort}, 价格: ${price}`);
    return { sort: preferredSort, price };
  }

  // 2. 自动分配：查询所有已占用的排序位（1-60）
  const { data: allArticles } = await db.collection('partner_articles')
    .where({
      page_id: pageId,
      status: _.in(['pending', 'active', 'rejected'])
    })
    .field({ actual_sort: true, default_sort: true })
    .get();

  console.log(`[assignDefaultSort] 查询到 ${allArticles.length} 篇文章占用排序位`);

  // 统计已占用的排序位
  const usedSorts = new Set();
  allArticles.forEach(article => {
    const sortPos = article.actual_sort || article.default_sort;
    if (sortPos >= 1 && sortPos <= 60) {
      usedSorts.add(sortPos);
    }
  });

  console.log(`[assignDefaultSort] 已占用排序位数量: ${usedSorts.size}/60`);

  // 3. 从1-60中找到第一个可用的排序位
  for (let i = 1; i <= 60; i++) {
    if (!usedSorts.has(i)) {
      const price = publishType === 'paid' ? calculatePrice(i) : 0;
      console.log(`[assignDefaultSort] ✅ 自动分配排序位: ${i}, 价格: ${price}`);
      return { sort: i, price };
    }
  }

  // 4. 如果1-60都被占用，抛出错误
  throw new Error('排序位已满（1-60位全部被占用）');
}

/**
 * 分配推广排序位
 */
async function assignPromotionSort(pageId, userId) {
  const { total } = await db.collection('partner_articles')
    .where({
      page_id: pageId,
      user_id: userId,
      status: 'active'
    })
    .count();

  return total + 1;
}

/**
 * 计算付费价格
 */
function calculatePrice(sortPosition) {
  const basePrice = 50;

  if (sortPosition >= 1 && sortPosition <= 10) {
    return basePrice + 100;
  } else if (sortPosition >= 11 && sortPosition <= 30) {
    return basePrice + 50;
  } else if (sortPosition >= 31 && sortPosition <= 60) {
    return basePrice + 20;
  } else {
    return basePrice;
  }
}

/**
 * 初始化文章统计数据
 */
async function initArticleStatistics(hashId, pageId, ownerId) {
  try {
    await db.collection('article_statistics').add({
      data: {
        article_hash_id: hashId,
        page_id: pageId,
        owner_id: ownerId,
        promotion_stats: {
          own_promotion_views: 0,
          own_promotion_visitors: 0,
          own_promotion_clicks: 0,
          share_count: 0,
          read_complete_count: 0,
          like_count: 0,
          comment_count: 0
        },
        display_stats: {
          default_page_views: 0,
          others_promotion_views: 0,
          own_promotion_views: 0,
          top_10_views: 0,
          top_30_views: 0,
          top_60_views: 0,
          normal_views: 0
        },
        quality_metrics: {
          avg_read_duration: 0,
          completion_rate: 0,
          share_rate: 0,
          like_rate: 0,
          bounce_rate: 0
        },
        score_summary: {
          total_earned: 0,
          total_cost: 0,
          current_score: 100,
          daily_maintenance_cost: 5,
          last_update_time: new Date()
        },
        create_time: new Date(),
        update_time: new Date()
      }
    });
  } catch (error) {
    console.error('初始化统计数据失败:', error);
  }
}

/**
 * 通用列表查询（兼容旧接口）
 */
async function getArticleList(event) {
  // 判断是否有promoterId，决定使用哪种排序
  if (event.promoterId) {
    return await getArticlesWithPromotionSort(event);
  } else {
    return await getArticlesWithDefaultSort(event);
  }
}

/**
 * 调整排序
 */
async function reorderArticle(event) {
  const { hashId, newSort } = event;
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  try {
    // 检查权限（管理员）
    const { data: user } = await db.collection('users')
      .where({ openid: userId })
      .get();

    if (!user || user[0].role !== 'admin') {
      throw new Error('您没有权限调整排序');
    }

    // 更新排序
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          actual_sort: newSort,
          default_sort: newSort,
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '排序调整成功'
    };
  } catch (error) {
    throw new Error(`调整排序失败: ${error.message}`);
  }
}

/**
 * 增加浏览量
 */
async function increaseViewCount(event) {
  const { hashId } = event;

  try {
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          view_count: _.inc(1),
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '浏览量已增加'
    };
  } catch (error) {
    console.error('增加浏览量失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 点赞文章
 */
async function likeArticle(event) {
  const { hashId } = event;
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;

  try {
    // 检查是否是文章所有者
    const { data: articles } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    if (articles[0].user_id === userId) {
      throw new Error('不能给自己点赞');
    }

    // 增加点赞数
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          like_count: _.inc(1),
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '点赞成功'
    };
  } catch (error) {
    throw new Error(`点赞失败: ${error.message}`);
  }
}

/**
 * 分享文章（记录分享次数）
 */
async function shareArticle(event) {
  const { hashId } = event;

  try {
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          share_count: _.inc(1),
          update_time: new Date()
        }
      });

    return {
      success: true,
      message: '分享记录成功'
    };
  } catch (error) {
    console.error('记录分享失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 获取合作文章列表（显示所有未删除的合作文章）
 */
async function getPendingArticles(event) {
  const { pageId } = event;

  try {
    // 查询所有未删除的合作文章
    const { data: articles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        publish_type: 'partner',       // 只查询合作发布的文章
        status: _.neq('deleted')       // 排除已删除的文章
      })
      .orderBy('create_time', 'desc')
      .get();

    console.log(`[getPendingArticles] pageId: ${pageId}, 查询到 ${articles.length} 篇文章`);

    // 为没有 review_status 的老数据设置默认值
    articles.forEach(article => {
      if (!article.review_status) {
        // 根据 status 推断 review_status
        if (article.status === 'pending') {
          article.review_status = 'pending';
        } else if (article.status === 'rejected') {
          article.review_status = 'rejected';
        } else if (article.status === 'active') {
          article.review_status = 'approved';
        } else {
          article.review_status = 'pending'; // 默认待审核
        }
      }
    });

    // 获取作者信息并刷新头像
    await enrichUsersWithAvatar(articles, 'user_id', 'author_info');

    return {
      success: true,
      data: articles
    };
  } catch (error) {
    console.error('获取合作文章列表失败:', error);
    throw new Error(`获取合作文章列表失败: ${error.message}`);
  }
}

/**
 * 根据ID获取文章详情
 */
async function getArticleById(event) {
  const { articleId } = event;

  try {
    const { data: articles } = await db.collection('partner_articles')
      .where({ _id: articleId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    // 获取作者信息并刷新头像
    await enrichUsersWithAvatar([articles[0]], 'user_id', 'author_info');

    return {
      success: true,
      data: articles[0]
    };
  } catch (error) {
    throw new Error(`获取文章详情失败: ${error.message}`);
  }
}

/**
 * 通过审核
 */
async function approveArticle(event) {
  const { articleId } = event;

  try {
    const now = new Date();

    await db.collection('partner_articles')
      .where({ _id: articleId })
      .update({
        data: {
          review_status: 'approved',
          is_visible: true,
          status: 'active',
          audit_status: 'approved',
          approve_time: now,
          update_time: now
        }
      });

    return {
      success: true,
      message: '审核通过'
    };
  } catch (error) {
    throw new Error(`审核通过失败: ${error.message}`);
  }
}

/**
 * 拒绝审核
 */
async function rejectArticle(event) {
  const { articleId, rejectReason = '管理员拒绝' } = event;

  try {
    const now = new Date();

    await db.collection('partner_articles')
      .where({ _id: articleId })
      .update({
        data: {
          review_status: 'rejected',
          is_visible: false,
          status: 'rejected',
          reject_reason: rejectReason,
          reject_time: now,
          update_time: now
        }
      });

    return {
      success: true,
      message: '已拒绝'
    };
  } catch (error) {
    throw new Error(`拒绝审核失败: ${error.message}`);
  }
}

/**
 * 通用辅助函数：为数据列表填充用户信息并刷新云存储头像
 * @param {Array} dataList - 需要填充用户信息的数据列表
 * @param {String} userIdField - 用户ID字段名，如 'user_id'
 * @param {String} targetField - 目标字段名，如 'author_info' 或 'user_info'
 */
async function enrichUsersWithAvatar(dataList, userIdField, targetField) {
  if (!dataList || dataList.length === 0) {
    return;
  }

  try {
    // 获取所有用户ID
    const userIds = [...new Set(dataList.map(item => item[userIdField]))];

    // 查询用户信息
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

    // 创建用户信息映射
    const userMap = {};
    users.forEach(user => {
      userMap[user.openid] = {
        nickName: user.nickName || '未知用户',
        avatarUrl: user.avatarUrl || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
      };
    });

    // 合并用户信息到数据列表
    dataList.forEach(item => {
      item[targetField] = userMap[item[userIdField]] || {
        nickName: '未知用户',
        avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
      };
    });

  } catch (error) {
    console.error('填充用户信息失败:', error);
    // 失败时使用默认信息
    dataList.forEach(item => {
      item[targetField] = {
        nickName: '未知用户',
        avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'
      };
    });
  }
}

/**
 * 获取可用的排序位列表（1-60独占模式）
 * 合作发布和付费发布都从1-60选择
 */
async function getAvailableSortPositions(event) {
  const { pageId, range = '1-60' } = event;

  try {
    console.log(`[getAvailableSortPositions] pageId: ${pageId}, range: ${range}`);

    // 查询该页面所有已占用的排序位（status不是deleted的文章）
    const { data: occupiedArticles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        status: _.in(['pending', 'active', 'rejected'])  // 排除已删除的
      })
      .field({ actual_sort: true, default_sort: true, title: true, user_id: true, publish_type: true })
      .get();

    console.log(`[getAvailableSortPositions] 查询到 ${occupiedArticles.length} 篇文章占用排序位`);

    // 统计已占用的排序位
    const occupiedPositions = new Set();
    occupiedArticles.forEach(article => {
      const sortPos = article.actual_sort || article.default_sort;
      if (sortPos >= 1 && sortPos <= 60) {
        occupiedPositions.add(sortPos);
      }
    });

    // 生成可用排序位列表（1-60）
    const availablePositions = [];
    for (let i = 1; i <= 60; i++) {
      if (!occupiedPositions.has(i)) {
        availablePositions.push(i);
      }
    }

    console.log(`[getAvailableSortPositions] 可用排序位数量: ${availablePositions.length}/60`);

    return {
      success: true,
      data: {
        available_positions: availablePositions,
        occupied_count: occupiedPositions.size,
        total_positions: 60,
        available_count: availablePositions.length
      }
    };
  } catch (error) {
    console.error('[getAvailableSortPositions] 错误:', error);
    throw new Error(`获取可用排序位失败: ${error.message}`);
  }
}

/**
 * 更新文章排序位（合作者编辑自己的，管理员编辑任何人的）
 */
async function updateSortPosition(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { hashId, newPosition } = event;

  try {
    console.log(`[updateSortPosition] userId: ${userId}, hashId: ${hashId}, newPosition: ${newPosition}`);

    // 1. 验证排序位范围
    if (newPosition < 1 || newPosition > 60) {
      throw new Error('排序位必须在1-60之间');
    }

    // 2. 查询文章
    const { data: articles } = await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .get();

    if (articles.length === 0) {
      throw new Error('文章不存在');
    }

    const article = articles[0];

    // 3. 检查权限
    const { data: users } = await db.collection('users')
      .where({ openid: userId })
      .get();

    const isAdmin = users.length > 0 && users[0].role === 'admin';
    const isOwner = article.user_id === userId;

    if (!isAdmin && !isOwner) {
      throw new Error('您没有权限编辑此文章的排序位');
    }

    // 4. 检查目标排序位是否被占用
    const { data: occupiedArticles } = await db.collection('partner_articles')
      .where({
        page_id: article.page_id,
        _id: _.neq(article._id),  // 排除当前文章
        status: _.in(['pending', 'active', 'rejected']),  // 只查询有效文章
        actual_sort: newPosition
      })
      .get();

    if (occupiedArticles.length > 0) {
      throw new Error(`排序位 ${newPosition} 已被占用`);
    }

    // 5. 更新排序位
    await db.collection('partner_articles')
      .where({ hash_id: hashId })
      .update({
        data: {
          actual_sort: newPosition,
          default_sort: newPosition,
          update_time: new Date()
        }
      });

    console.log(`[updateSortPosition] ✅ 排序位更新成功: ${article.actual_sort} → ${newPosition}`);

    return {
      success: true,
      message: '排序位更新成功',
      data: {
        hash_id: hashId,
        old_position: article.actual_sort || article.default_sort,
        new_position: newPosition
      }
    };
  } catch (error) {
    console.error('[updateSortPosition] 错误:', error);
    throw new Error(`更新排序位失败: ${error.message}`);
  }
}

/**
 * 获取排序位池统计信息（管理员专用）
 */
async function getSortPoolStats(event) {
  const wxContext = cloud.getWXContext();
  const userId = wxContext.OPENID;
  const { pageId } = event;

  try {
    // 验证管理员权限
    const { data: users } = await db.collection('users')
      .where({ openid: userId })
      .get();

    if (users.length === 0 || users[0].role !== 'admin') {
      throw new Error('需要管理员权限');
    }

    console.log(`[getSortPoolStats] pageId: ${pageId}`);

    // 查询所有有效文章的排序位
    const { data: articles } = await db.collection('partner_articles')
      .where({
        page_id: pageId,
        status: _.in(['pending', 'active', 'rejected'])
      })
      .field({
        actual_sort: true,
        default_sort: true,
        title: true,
        publish_type: true,
        status: true,
        review_status: true,
        user_id: true
      })
      .get();

    // 统计1-60的排序位占用情况
    const positionMap = {};  // position -> article info
    const occupiedPositions = new Set();

    articles.forEach(article => {
      const pos = article.actual_sort || article.default_sort;
      if (pos >= 1 && pos <= 60) {
        occupiedPositions.add(pos);
        positionMap[pos] = {
          title: article.title,
          publish_type: article.publish_type,
          status: article.status,
          review_status: article.review_status || 'unknown'
        };
      }
    });

    // 生成空置排序位列表
    const vacantPositions = [];
    for (let i = 1; i <= 60; i++) {
      if (!occupiedPositions.has(i)) {
        vacantPositions.push(i);
      }
    }

    // 按发布类型统计
    const partnerCount = articles.filter(a => a.publish_type === 'partner').length;
    const paidCount = articles.filter(a => a.publish_type === 'paid').length;

    return {
      success: true,
      data: {
        total_positions: 60,
        occupied_count: occupiedPositions.size,
        vacant_count: vacantPositions.length,
        vacant_positions: vacantPositions,
        position_map: positionMap,
        statistics: {
          partner_articles: partnerCount,
          paid_articles: paidCount,
          total_articles: articles.length
        }
      }
    };
  } catch (error) {
    console.error('[getSortPoolStats] 错误:', error);
    throw new Error(`获取排序位统计失败: ${error.message}`);
  }
}
