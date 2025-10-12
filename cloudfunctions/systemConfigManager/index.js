// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * systemConfigManager 云函数
 * 系统配置管理：行政区域和信息分类的增删改查
 *
 * 数据库集合: system_config
 * 字段设计:
 * - _id: 自动生成
 * - type: 'area' | 'category' (区域或分类)
 * - city: string (城市名称，仅area类型使用)
 * - name: string (区域名称或分类名称)
 * - code: string (唯一标识符)
 * - order: number (显示排序)
 * - enabled: boolean (是否启用)
 * - createTime: date (创建时间)
 * - updateTime: date (更新时间)
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

    // 需要管理员权限的操作（除了getList和getConfig可以公开访问）
    const adminRequiredActions = ['add', 'update', 'delete', 'updateOrder', 'batchAddAreas', 'batchDeleteByCity', 'setVIPCategory'];
    if (adminRequiredActions.includes(action) && currentUser.role !== 'admin') {
      return {
        success: false,
        message: '需要管理员权限'
      };
    }

    console.log(`[systemConfigManager] 用户 ${currentUserOpenid} (${currentUser.role}) 执行操作: ${action}`);

    // ============ 执行实际操作 ============
    switch (action) {
      case 'getList':
        return await getList(event);

      case 'getConfig':
        return await getConfig(event);

      case 'add':
        return await addConfig(event, currentUserOpenid);

      case 'update':
        return await updateConfig(event, currentUserOpenid);

      case 'delete':
        return await deleteConfig(event, currentUserOpenid);

      case 'updateOrder':
        return await updateOrder(event, currentUserOpenid);

      case 'batchAddAreas':
        return await batchAddAreas(event, currentUserOpenid);

      case 'batchDeleteByCity':
        return await batchDeleteByCity(event, currentUserOpenid);

      case 'setVIPCategory':
        return await setVIPCategory(event, currentUserOpenid);

      case 'getTagsByIds':
        return await getTagsByIds(event);

      default:
        return {
          success: false,
          message: '未知的操作类型: ' + action
        };
    }
  } catch (error) {
    console.error('[systemConfigManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取配置列表
 * @param {Object} event - { type: 'area' | 'category', city?: string }
 */
async function getList(event) {
  const { type, city } = event;

  if (!type) {
    return {
      success: false,
      message: '缺少type参数'
    };
  }

  try {
    // 构建查询条件
    let whereCondition = { type, enabled: true };

    // 如果是区域类型且指定了城市，则筛选该城市
    if (type === 'area' && city) {
      whereCondition.city = city;
    }

    const result = await db.collection('system_config')
      .where(whereCondition)
      .orderBy('order', 'asc')
      .get();

    console.log(`[getList] 获取${type}配置，数量:`, result.data.length);

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('[getList] 错误:', error);
    return {
      success: false,
      message: error.message || '获取配置列表失败',
      data: []
    };
  }
}

/**
 * 获取前端使用的配置（简化格式）
 * @param {Object} event - { type: 'area' | 'category', city?: string }
 */
async function getConfig(event) {
  const listResult = await getList(event);

  if (!listResult.success) {
    return listResult;
  }

  // 只返回name数组，方便前端直接使用
  const names = listResult.data.map(item => item.name);

  return {
    success: true,
    data: names
  };
}

/**
 * 添加配置项
 * @param {Object} event - { type, city?, name, code?, order? }
 */
async function addConfig(event, operatorOpenid) {
  const { type, city, name, code, order } = event;

  if (!type || !name) {
    return {
      success: false,
      message: '缺少必要参数: type 或 name'
    };
  }

  // 验证类型
  if (!['area', 'category', 'tag', 'price_unit'].includes(type)) {
    return {
      success: false,
      message: '无效的类型: ' + type
    };
  }

  try {
    // 检查是否已存在相同名称
    const whereCondition = { type, name };
    if (type === 'area' && city) {
      whereCondition.city = city;
    }

    const existCheck = await db.collection('system_config')
      .where(whereCondition)
      .get();

    if (existCheck.data && existCheck.data.length > 0) {
      return {
        success: false,
        message: '该配置项已存在'
      };
    }

    // 如果没有指定order，则查询当前最大order值
    let finalOrder = order;
    if (!finalOrder) {
      const maxOrderResult = await db.collection('system_config')
        .where({ type })
        .orderBy('order', 'desc')
        .limit(1)
        .get();

      finalOrder = maxOrderResult.data.length > 0
        ? maxOrderResult.data[0].order + 1
        : 1;
    }

    // 生成code（如果未提供）
    const finalCode = code || `${type}_${Date.now()}`;

    // 构建新配置项
    const newConfig = {
      type,
      name,
      code: finalCode,
      order: finalOrder,
      enabled: true,
      createTime: new Date(),
      updateTime: new Date()
    };

    // 如果是区域类型，添加城市字段
    if (type === 'area' && city) {
      newConfig.city = city;
    }

    // 插入数据库
    const addResult = await db.collection('system_config').add({
      data: newConfig
    });

    console.log(`[addConfig] 添加配置成功: ${type} - ${name}, _id: ${addResult._id}`);

    return {
      success: true,
      message: '添加成功',
      data: {
        _id: addResult._id,
        ...newConfig
      }
    };
  } catch (error) {
    console.error('[addConfig] 错误:', error);
    return {
      success: false,
      message: error.message || '添加配置失败'
    };
  }
}

/**
 * 更新配置项
 * @param {Object} event - { _id, name?, order?, enabled? }
 */
async function updateConfig(event, operatorOpenid) {
  const { _id, name, order, enabled } = event;

  if (!_id) {
    return {
      success: false,
      message: '缺少_id参数'
    };
  }

  try {
    // 检查配置是否存在
    const configResult = await db.collection('system_config')
      .doc(_id)
      .get();

    if (!configResult.data) {
      return {
        success: false,
        message: '配置项不存在'
      };
    }

    // 构建更新数据
    const updateData = {
      updateTime: new Date()
    };

    if (name !== undefined) updateData.name = name;
    if (order !== undefined) updateData.order = order;
    if (enabled !== undefined) updateData.enabled = enabled;

    // 更新数据库
    await db.collection('system_config')
      .doc(_id)
      .update({
        data: updateData
      });

    console.log(`[updateConfig] 更新配置成功: _id: ${_id}`);

    return {
      success: true,
      message: '更新成功',
      data: {
        _id,
        ...updateData
      }
    };
  } catch (error) {
    console.error('[updateConfig] 错误:', error);
    return {
      success: false,
      message: error.message || '更新配置失败'
    };
  }
}

/**
 * 删除配置项
 * @param {Object} event - { _id }
 */
async function deleteConfig(event, operatorOpenid) {
  const { _id } = event;

  if (!_id) {
    return {
      success: false,
      message: '缺少_id参数'
    };
  }

  try {
    // 检查配置是否存在
    const configResult = await db.collection('system_config')
      .doc(_id)
      .get();

    if (!configResult.data) {
      return {
        success: false,
        message: '配置项不存在'
      };
    }

    // 删除数据库记录
    await db.collection('system_config')
      .doc(_id)
      .remove();

    console.log(`[deleteConfig] 删除配置成功: _id: ${_id}`);

    return {
      success: true,
      message: '删除成功'
    };
  } catch (error) {
    console.error('[deleteConfig] 错误:', error);
    return {
      success: false,
      message: error.message || '删除配置失败'
    };
  }
}

/**
 * 批量更新排序
 * @param {Object} event - { items: [{ _id, order }] }
 */
async function updateOrder(event, operatorOpenid) {
  const { items } = event;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      success: false,
      message: '缺少items参数或格式错误'
    };
  }

  try {
    // 批量更新
    const promises = items.map(item => {
      return db.collection('system_config')
        .doc(item._id)
        .update({
          data: {
            order: item.order,
            updateTime: new Date()
          }
        });
    });

    await Promise.all(promises);

    console.log(`[updateOrder] 批量更新排序成功，数量: ${items.length}`);

    return {
      success: true,
      message: '排序更新成功'
    };
  } catch (error) {
    console.error('[updateOrder] 错误:', error);
    return {
      success: false,
      message: error.message || '更新排序失败'
    };
  }
}

/**
 * 批量删除指定城市的所有行政区域
 * @param {Object} event - { cities: string[] } 或 { city: string }
 */
async function batchDeleteByCity(event, operatorOpenid) {
  let { cities, city } = event;

  // 兼容单个城市和多个城市
  if (city && !cities) {
    cities = [city];
  }

  if (!cities || !Array.isArray(cities) || cities.length === 0) {
    return {
      success: false,
      message: '缺少必要参数: cities 或 city'
    };
  }

  try {
    console.log(`[batchDeleteByCity] 开始批量删除，城市: ${cities.join(', ')}`);

    let totalDeleted = 0;
    const results = {};

    for (const cityName of cities) {
      // 查询该城市的所有区域
      const areasResult = await db.collection('system_config')
        .where({
          type: 'area',
          city: cityName
        })
        .get();

      const areaIds = areasResult.data.map(item => item._id);
      console.log(`[batchDeleteByCity] ${cityName} 找到 ${areaIds.length} 个区域`);

      if (areaIds.length > 0) {
        // 批量删除
        const deletePromises = areaIds.map(id => {
          return db.collection('system_config').doc(id).remove();
        });

        await Promise.all(deletePromises);
        totalDeleted += areaIds.length;
        results[cityName] = areaIds.length;
      } else {
        results[cityName] = 0;
      }
    }

    console.log(`[batchDeleteByCity] 批量删除成功，总数: ${totalDeleted}`);

    return {
      success: true,
      message: `成功删除 ${totalDeleted} 个区域`,
      data: {
        totalDeleted,
        details: results
      }
    };
  } catch (error) {
    console.error('[batchDeleteByCity] 错误:', error);
    return {
      success: false,
      message: error.message || '批量删除失败'
    };
  }
}

/**
 * 批量添加行政区域
 * @param {Object} event - { city: string, districts: string[] }
 */
async function batchAddAreas(event, operatorOpenid) {
  const { city, districts } = event;

  if (!city || !districts || !Array.isArray(districts) || districts.length === 0) {
    return {
      success: false,
      message: '缺少必要参数: city 或 districts'
    };
  }

  try {
    console.log(`[batchAddAreas] 开始批量添加区域，城市: ${city}, 数量: ${districts.length}`);

    // 查询已存在的区域
    const existingResult = await db.collection('system_config')
      .where({
        type: 'area',
        city: city
      })
      .get();

    const existingNames = new Set(existingResult.data.map(item => item.name));
    console.log(`[batchAddAreas] 已存在的区域数量: ${existingNames.size}`);

    // 过滤掉已存在的区域
    const newDistricts = districts.filter(name => !existingNames.has(name));

    if (newDistricts.length === 0) {
      return {
        success: true,
        message: '所有区域已存在，无需添加',
        data: {
          total: districts.length,
          added: 0,
          skipped: districts.length,
          skippedList: districts
        }
      };
    }

    // 获取当前最大order值
    const maxOrderResult = await db.collection('system_config')
      .where({ type: 'area', city: city })
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    let currentOrder = maxOrderResult.data.length > 0
      ? maxOrderResult.data[0].order
      : 0;

    // 批量插入新区域
    const insertPromises = newDistricts.map((districtName, index) => {
      currentOrder++;
      const newArea = {
        type: 'area',
        city: city,
        name: districtName,
        code: `area_${city}_${districtName}_${Date.now()}_${index}`,
        order: currentOrder,
        enabled: true,
        createTime: new Date(),
        updateTime: new Date()
      };

      return db.collection('system_config').add({
        data: newArea
      });
    });

    await Promise.all(insertPromises);

    console.log(`[batchAddAreas] 批量添加成功，新增数量: ${newDistricts.length}`);

    return {
      success: true,
      message: `成功添加 ${newDistricts.length} 个区域`,
      data: {
        total: districts.length,
        added: newDistricts.length,
        skipped: districts.length - newDistricts.length,
        addedList: newDistricts,
        skippedList: districts.filter(name => existingNames.has(name))
      }
    };
  } catch (error) {
    console.error('[batchAddAreas] 错误:', error);
    return {
      success: false,
      message: error.message || '批量添加区域失败'
    };
  }
}

/**
 * 批量获取标签详情（根据ID数组）
 * @param {Object} event - { tagIds: string[] }
 */
async function getTagsByIds(event) {
  const { tagIds } = event;

  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    return {
      success: true,
      data: []
    };
  }

  try {
    // 批量查询标签
    const result = await db.collection('system_config')
      .where({
        _id: _.in(tagIds),
        type: 'tag',
        enabled: true
      })
      .get();

    console.log(`[getTagsByIds] 查询标签数量: ${result.data.length}`);

    // 返回ID到Name的映射对象，方便前端使用
    const tagMap = {};
    result.data.forEach(tag => {
      tagMap[tag._id] = tag.name;
    });

    return {
      success: true,
      data: result.data,
      tagMap // { tagId: tagName }
    };
  } catch (error) {
    console.error('[getTagsByIds] 错误:', error);
    return {
      success: false,
      message: error.message || '获取标签失败',
      data: []
    };
  }
}

/**
 * 设置VIP分类（只能有一个VIP分类）
 * @param {Object} event - { _id: string }
 */
async function setVIPCategory(event, operatorOpenid) {
  const { _id } = event;

  if (!_id) {
    return {
      success: false,
      message: '缺少_id参数'
    };
  }

  try {
    // 检查要设置的分类是否存在
    const categoryResult = await db.collection('system_config')
      .doc(_id)
      .get();

    if (!categoryResult.data || categoryResult.data.type !== 'category') {
      return {
        success: false,
        message: '分类不存在或类型错误'
      };
    }

    // 先将所有分类的isVIP设置为false
    const allCategories = await db.collection('system_config')
      .where({
        type: 'category'
      })
      .get();

    const clearPromises = allCategories.data.map(cat => {
      return db.collection('system_config')
        .doc(cat._id)
        .update({
          data: {
            isVIP: false,
            updateTime: new Date()
          }
        });
    });

    await Promise.all(clearPromises);

    // 将选中的分类设置为VIP
    await db.collection('system_config')
      .doc(_id)
      .update({
        data: {
          isVIP: true,
          updateTime: new Date()
        }
      });

    console.log(`[setVIPCategory] 设置VIP分类成功: _id=${_id}`);

    return {
      success: true,
      message: '设置成功',
      data: {
        _id,
        name: categoryResult.data.name
      }
    };
  } catch (error) {
    console.error('[setVIPCategory] 错误:', error);
    return {
      success: false,
      message: error.message || '设置VIP分类失败'
    };
  }
}
