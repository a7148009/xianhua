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
 * - _id: 自动生成（云数据库内部ID）
 * - custom_id: string (固定业务ID，删除重建也保持不变)
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
 *
 * ✨ 固定ID方案（序号式）：
 * - custom_id 是真正的业务ID，用于数据绑定
 * - 格式：类型前缀_序号（如：area_001, cat_01, tag_001, unit_01）
 * - 删除重建时可以指定相同的 custom_id 保持数据一致性
 * - 如果不指定 custom_id，系统自动生成下一个序号
 * - 序号位数：area(3位), category(2位), tag(3位), price_unit(2位)
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
 * 生成序号式custom_id
 * @param {string} type - 配置类型
 * @returns {string} - 格式如：area_001, cat_01, tag_001, unit_01
 */
async function generateSequenceId(type) {
  try {
    // 查询该类型的所有数据
    const result = await db.collection('system_config')
      .where({ type })
      .field({ custom_id: true })
      .get();

    // 提取所有已存在的序号
    const numbers = result.data
      .map(item => {
        if (!item.custom_id) return 0;
        // 匹配最后的数字序号（如：area_001 -> 1, cat_01 -> 1）
        const match = item.custom_id.match(/_(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(n => n > 0);

    // 计算下一个序号
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;

    // 根据类型决定补零位数
    const paddingMap = {
      'area': 3,        // 001-999
      'category': 2,    // 01-99
      'tag': 3,         // 001-999
      'price_unit': 2   // 01-99
    };

    const padding = paddingMap[type] || 3;
    const sequence = String(nextNum).padStart(padding, '0');

    // 类型前缀映射
    const prefixMap = {
      'area': 'area',
      'category': 'cat',
      'tag': 'tag',
      'price_unit': 'unit'
    };

    const prefix = prefixMap[type] || type;

    const customId = `${prefix}_${sequence}`;
    console.log(`[generateSequenceId] 生成序号ID: type=${type}, customId=${customId}`);

    return customId;
  } catch (error) {
    console.error('[generateSequenceId] 错误:', error);
    // 如果生成失败，返回带时间戳的兜底方案
    return `${type}_${Date.now()}`;
  }
}

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

    // 为每条数据确保有custom_id（兼容旧数据）
    const dataWithCustomId = result.data.map(item => {
      if (!item.custom_id) {
        // 如果旧数据没有custom_id，使用_id作为临时方案
        item.custom_id = item._id;
      }
      return item;
    });

    return {
      success: true,
      data: dataWithCustomId
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
 * @param {Object} event - { type, city?, name, code?, order?, custom_id? }
 */
async function addConfig(event, operatorOpenid) {
  const { type, city, name, code, order, custom_id } = event;

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
    // 检查是否已存在相同custom_id（如果指定了custom_id）
    if (custom_id) {
      const customIdCheck = await db.collection('system_config')
        .where({ custom_id })
        .get();

      if (customIdCheck.data && customIdCheck.data.length > 0) {
        return {
          success: false,
          message: `custom_id "${custom_id}" 已存在，请使用其他ID或留空自动生成`
        };
      }
    }

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

    // 生成custom_id（如果未提供）
    // 使用序号式ID：area_001, cat_01, tag_001, unit_01
    let finalCustomId = custom_id;
    if (!finalCustomId) {
      finalCustomId = await generateSequenceId(type);
    }

    // 构建新配置项
    const newConfig = {
      custom_id: finalCustomId,  // ✨ 固定业务ID（序号式）
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

    console.log(`[addConfig] 添加配置成功: ${type} - ${name}, custom_id: ${finalCustomId}, _id: ${addResult._id}`);

    return {
      success: true,
      message: '添加成功',
      data: {
        _id: addResult._id,
        custom_id: finalCustomId,
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

    // 批量插入新区域（使用序号式custom_id）
    const insertPromises = [];
    for (let i = 0; i < newDistricts.length; i++) {
      const districtName = newDistricts[i];
      currentOrder++;

      // 为每个区域生成序号式custom_id
      const customId = await generateSequenceId('area');

      const newArea = {
        custom_id: customId,  // ✨ 固定业务ID（序号式）
        type: 'area',
        city: city,
        name: districtName,
        code: `area_${city}_${districtName}_${Date.now()}_${i}`,
        order: currentOrder,
        enabled: true,
        createTime: new Date(),
        updateTime: new Date()
      };

      insertPromises.push(
        db.collection('system_config').add({
          data: newArea
        })
      );
    }

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
