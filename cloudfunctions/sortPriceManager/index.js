// 云函数：付费排序价格管理
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 付费排序价格管理云函数
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();

  try {
    switch (action) {
      case 'getPrices':
        return await getPrices(event);
      case 'setSinglePrice':
        return await setSinglePrice(event, wxContext);
      case 'setBatchPrice':
        return await setBatchPrice(event, wxContext);
      case 'getPrice':
        return await getPrice(event);
      case 'initDefaultPrices':
        return await initDefaultPrices(event, wxContext);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (error) {
    console.error('[sortPriceManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败',
      error: error.toString()
    };
  }
};

/**
 * 验证管理员权限
 */
async function verifyAdmin(openid) {
  const { data: users } = await db.collection('users')
    .where({ openid })
    .get();

  if (users.length === 0 || users[0].role !== 'admin') {
    throw new Error('您没有管理员权限');
  }

  return users[0];
}

/**
 * 获取所有排序价格
 */
async function getPrices(event) {
  const { pageId } = event;

  try {
    const { data } = await db.collection('sort_prices')
      .where({ page_id: pageId })
      .orderBy('sort_position', 'asc')
      .get();

    // 如果没有数据，返回默认价格
    if (data.length === 0) {
      const defaultPrices = [];
      for (let i = 1; i <= 60; i++) {
        defaultPrices.push({
          sort_position: i,
          price: getDefaultPrice(i),
          is_available: true
        });
      }
      return {
        success: true,
        data: defaultPrices
      };
    }

    return {
      success: true,
      data: data
    };
  } catch (error) {
    throw new Error(`获取价格列表失败: ${error.message}`);
  }
}

/**
 * 设置单个排序位价格
 */
async function setSinglePrice(event, wxContext) {
  await verifyAdmin(wxContext.OPENID);

  const { pageId, sortPosition, price } = event;

  if (!pageId || !sortPosition || price === undefined) {
    throw new Error('参数不完整');
  }

  if (sortPosition < 1 || sortPosition > 60) {
    throw new Error('排序位范围：1-60');
  }

  if (price < 0) {
    throw new Error('价格不能为负数');
  }

  try {
    // 查找是否已存在
    const { data: existing } = await db.collection('sort_prices')
      .where({
        page_id: pageId,
        sort_position: sortPosition
      })
      .get();

    const now = new Date();

    if (existing.length > 0) {
      // 更新
      await db.collection('sort_prices')
        .doc(existing[0]._id)
        .update({
          data: {
            price: price,
            update_time: now
          }
        });
    } else {
      // 新增
      await db.collection('sort_prices').add({
        data: {
          page_id: pageId,
          sort_position: sortPosition,
          price: price,
          is_available: true,
          create_time: now,
          update_time: now
        }
      });
    }

    return {
      success: true,
      message: `排序位${sortPosition}价格设置成功`
    };
  } catch (error) {
    throw new Error(`设置价格失败: ${error.message}`);
  }
}

/**
 * 批量设置排序位价格
 */
async function setBatchPrice(event, wxContext) {
  await verifyAdmin(wxContext.OPENID);

  const { pageId, startSort, endSort, price } = event;

  if (!pageId || !startSort || !endSort || price === undefined) {
    throw new Error('参数不完整');
  }

  if (startSort < 1 || endSort > 60 || startSort > endSort) {
    throw new Error('排序位范围错误：1-60，且起始位<=结束位');
  }

  if (price < 0) {
    throw new Error('价格不能为负数');
  }

  try {
    const now = new Date();
    let updatedCount = 0;
    let createdCount = 0;

    for (let i = startSort; i <= endSort; i++) {
      // 查找是否已存在
      const { data: existing } = await db.collection('sort_prices')
        .where({
          page_id: pageId,
          sort_position: i
        })
        .get();

      if (existing.length > 0) {
        // 更新
        await db.collection('sort_prices')
          .doc(existing[0]._id)
          .update({
            data: {
              price: price,
              update_time: now
            }
          });
        updatedCount++;
      } else {
        // 新增
        await db.collection('sort_prices').add({
          data: {
            page_id: pageId,
            sort_position: i,
            price: price,
            is_available: true,
            create_time: now,
            update_time: now
          }
        });
        createdCount++;
      }
    }

    return {
      success: true,
      message: `批量设置成功：更新${updatedCount}个，新增${createdCount}个`
    };
  } catch (error) {
    throw new Error(`批量设置失败: ${error.message}`);
  }
}

/**
 * 获取单个排序位价格
 */
async function getPrice(event) {
  const { pageId, sortPosition } = event;

  try {
    const { data } = await db.collection('sort_prices')
      .where({
        page_id: pageId,
        sort_position: sortPosition
      })
      .get();

    if (data.length > 0) {
      return {
        success: true,
        data: {
          sort_position: sortPosition,
          price: data[0].price,
          is_available: data[0].is_available
        }
      };
    } else {
      // 返回默认价格
      return {
        success: true,
        data: {
          sort_position: sortPosition,
          price: getDefaultPrice(sortPosition),
          is_available: true
        }
      };
    }
  } catch (error) {
    throw new Error(`获取价格失败: ${error.message}`);
  }
}

/**
 * 初始化默认价格
 */
async function initDefaultPrices(event, wxContext) {
  try {
    // 验证管理员权限
    await verifyAdmin(wxContext.OPENID);
  } catch (err) {
    console.error('权限验证失败:', err);
    throw new Error(`权限验证失败: ${err.message}`);
  }

  const { pageId } = event;

  if (!pageId) {
    throw new Error('缺少页面ID参数');
  }

  try {
    const now = new Date();
    let count = 0;

    console.log(`开始初始化价格，页面ID: ${pageId}`);

    for (let i = 1; i <= 60; i++) {
      // 检查是否已存在
      const { data: existing } = await db.collection('sort_prices')
        .where({
          page_id: pageId,
          sort_position: i
        })
        .get();

      if (existing.length === 0) {
        const defaultPrice = getDefaultPrice(i);
        console.log(`创建排序位${i}，价格${defaultPrice}`);

        await db.collection('sort_prices').add({
          data: {
            page_id: pageId,
            sort_position: i,
            price: defaultPrice,
            is_available: true,
            create_time: now,
            update_time: now
          }
        });
        count++;
      }
    }

    console.log(`初始化完成，创建了${count}个默认价格`);

    return {
      success: true,
      message: `初始化完成，创建${count}个默认价格`
    };
  } catch (error) {
    console.error('初始化价格失败:', error);
    throw new Error(`初始化失败: ${error.message}`);
  }
}

/**
 * 获取默认价格（梯度定价）
 */
function getDefaultPrice(sortPosition) {
  if (sortPosition >= 1 && sortPosition <= 10) {
    return 150;  // TOP 10: 150元
  } else if (sortPosition >= 11 && sortPosition <= 20) {
    return 100;  // TOP 11-20: 100元
  } else if (sortPosition >= 21 && sortPosition <= 30) {
    return 80;   // TOP 21-30: 80元
  } else if (sortPosition >= 31 && sortPosition <= 40) {
    return 60;   // TOP 31-40: 60元
  } else if (sortPosition >= 41 && sortPosition <= 50) {
    return 50;   // TOP 41-50: 50元
  } else {
    return 30;   // TOP 51-60: 30元
  }
}
