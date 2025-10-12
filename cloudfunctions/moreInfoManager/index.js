// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 云函数入口函数
exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'getList':
        return await getMoreInfoList(event);
      case 'getDetail':
        return await getMoreInfoDetail(event);
      case 'add':
        return await addMoreInfo(event);
      case 'update':
        return await updateMoreInfo(event);
      case 'delete':
        return await deleteMoreInfo(event);
      default:
        return {
          success: false,
          message: '未知操作类型'
        };
    }
  } catch (error) {
    console.error('云函数执行错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取更多信息列表
 */
async function getMoreInfoList(event) {
  try {
    const { page = 1, limit = 50 } = event;

    // 查询数据
    const { data } = await db.collection('more_info')
      .where({
        isVisible: true  // 只显示可见的信息
      })
      .orderBy('sortOrder', 'asc')  // 按排序值升序
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    // 获取总数
    const { total } = await db.collection('more_info')
      .where({
        isVisible: true
      })
      .count();

    return {
      success: true,
      data: data,
      total: total,
      page: page,
      limit: limit
    };
  } catch (error) {
    console.error('获取列表失败:', error);
    return {
      success: false,
      message: '获取列表失败'
    };
  }
}

/**
 * 获取信息详情
 */
async function getMoreInfoDetail(event) {
  try {
    const { id } = event;

    if (!id) {
      return {
        success: false,
        message: '缺少信息ID'
      };
    }

    const { data } = await db.collection('more_info')
      .doc(id)
      .get();

    if (!data) {
      return {
        success: false,
        message: '信息不存在'
      };
    }

    return {
      success: true,
      data: data
    };
  } catch (error) {
    console.error('获取详情失败:', error);
    return {
      success: false,
      message: '获取详情失败'
    };
  }
}

/**
 * 添加新信息(管理员功能)
 */
async function addMoreInfo(event) {
  try {
    const { sortOrder, title, content, publishTime } = event;
    const wxContext = cloud.getWXContext();

    // 验证必填字段
    if (!sortOrder || !title || !content) {
      return {
        success: false,
        message: '请填写完整信息'
      };
    }

    // 验证排序值范围
    if (sortOrder < 1 || sortOrder > 5000) {
      return {
        success: false,
        message: '排序值必须在1-5000之间'
      };
    }

    // 检查排序值是否已存在
    const { data: existing } = await db.collection('more_info')
      .where({
        sortOrder: sortOrder
      })
      .get();

    if (existing.length > 0) {
      return {
        success: false,
        message: `排序值${sortOrder}已被使用,请使用其他值`
      };
    }

    // 添加数据
    const result = await db.collection('more_info').add({
      data: {
        sortOrder: parseInt(sortOrder),
        title: title,
        content: content,
        publishTime: publishTime || db.serverDate(), // 发布时间
        isVisible: true,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        createBy: wxContext.OPENID
      }
    });

    return {
      success: true,
      message: '添加成功',
      id: result._id
    };
  } catch (error) {
    console.error('添加失败:', error);
    return {
      success: false,
      message: `添加失败: ${error.message || error.errMsg || JSON.stringify(error)}`,
      error: error.toString()
    };
  }
}

/**
 * 更新信息(管理员功能)
 */
async function updateMoreInfo(event) {
  try {
    const { id, sortOrder, title, content, publishTime, isVisible } = event;

    if (!id) {
      return {
        success: false,
        message: '缺少信息ID'
      };
    }

    const updateData = {
      updateTime: db.serverDate()
    };

    if (sortOrder !== undefined) {
      // 验证排序值范围
      if (sortOrder < 1 || sortOrder > 5000) {
        return {
          success: false,
          message: '排序值必须在1-5000之间'
        };
      }

      // 检查排序值是否被其他记录使用
      const { data: existing } = await db.collection('more_info')
        .where({
          sortOrder: sortOrder,
          _id: _.neq(id)
        })
        .get();

      if (existing.length > 0) {
        return {
          success: false,
          message: `排序值${sortOrder}已被使用,请使用其他值`
        };
      }

      updateData.sortOrder = parseInt(sortOrder);
    }

    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (publishTime !== undefined) updateData.publishTime = publishTime;
    if (isVisible !== undefined) updateData.isVisible = isVisible;

    await db.collection('more_info')
      .doc(id)
      .update({
        data: updateData
      });

    return {
      success: true,
      message: '更新成功'
    };
  } catch (error) {
    console.error('更新失败:', error);
    return {
      success: false,
      message: '更新失败'
    };
  }
}

/**
 * 删除信息(管理员功能)
 */
async function deleteMoreInfo(event) {
  try {
    const { id } = event;

    if (!id) {
      return {
        success: false,
        message: '缺少信息ID'
      };
    }

    // 软删除:设置为不可见
    await db.collection('more_info')
      .doc(id)
      .update({
        data: {
          isVisible: false,
          deleteTime: db.serverDate()
        }
      });

    return {
      success: true,
      message: '删除成功'
    };
  } catch (error) {
    console.error('删除失败:', error);
    return {
      success: false,
      message: '删除失败'
    };
  }
}
