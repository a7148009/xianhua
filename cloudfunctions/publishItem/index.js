// cloudfunctions/publishItem/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * 生成 hash_id (8位随机字符串)
 */
function generateHashId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let hashId = '';
  for (let i = 0; i < 8; i++) {
    hashId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hashId;
}

/**
 * 检查 hash_id 是否已存在
 */
async function isHashIdExists(hashId) {
  const result = await db.collection('db_info').where({
    hash_id: hashId
  }).count();

  return result.total > 0;
}

/**
 * 生成唯一的 hash_id
 */
async function generateUniqueHashId() {
  let hashId = generateHashId();
  let attempts = 0;
  const maxAttempts = 10;

  while (await isHashIdExists(hashId) && attempts < maxAttempts) {
    hashId = generateHashId();
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('无法生成唯一的 hash_id');
  }

  return hashId;
}

/**
 * 验证必填字段
 */
function validateData(data) {
  const required = [
    'title',
    'category_ids',
    'area_id',
    'price_min',
    'price_max',
    'price_unit_id',
    'description',
    'company_name',
    'contact_name',
    'contact_phone',
    'contact_wechat'
  ];

  for (const field of required) {
    if (!data[field]) {
      return { valid: false, message: `缺少必填字段: ${field}` };
    }
  }

  // 验证分类至少选择1个，最多3个
  if (!Array.isArray(data.category_ids) || data.category_ids.length === 0) {
    return { valid: false, message: '请至少选择一个分类' };
  }
  if (data.category_ids.length > 3) {
    return { valid: false, message: '最多选择3个分类' };
  }

  // 验证标签最多10个
  if (data.tag_ids && Array.isArray(data.tag_ids) && data.tag_ids.length > 10) {
    return { valid: false, message: '最多选择10个标签' };
  }

  // 验证价格
  if (parseInt(data.price_min) > parseInt(data.price_max)) {
    return { valid: false, message: '最低价不能大于最高价' };
  }

  // 验证手机号
  if (!/^1[3-9]\d{9}$/.test(data.contact_phone)) {
    return { valid: false, message: '请输入正确的手机号' };
  }

  return { valid: true };
}

/**
 * 创建信息
 */
async function createItem(event, openid) {
  const { data } = event;

  // 验证数据
  const validation = validateData(data);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.message
    };
  }

  try {
    // 生成唯一的 hash_id
    const hashId = await generateUniqueHashId();

    // 构建插入数据
    const insertData = {
      hash_id: hashId,
      title: data.title,
      description: data.description, // 数组格式
      price_min: parseInt(data.price_min),
      price_max: parseInt(data.price_max),
      price_unit_id: data.price_unit_id,
      category_ids: data.category_ids,
      area_id: data.area_id,
      tag_ids: data.tag_ids || [],
      company_name: data.company_name,
      company_address: data.company_address || '',
      company_logo: data.company_logo || '',
      images: data.images || [],
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      contact_wechat: data.contact_wechat || '',
      longitude: data.longitude || null,
      latitude: data.latitude || null,

      // 访问权限字段：free-免费用户可看, vip-仅VIP用户可看
      access_level: data.access_level || 'free',

      // 系统字段
      status: 'active',
      view_count: 0,
      is_hot: false,
      is_active: true,
      publisher_openid: openid,
      created_at: new Date(),
      updated_at: new Date()
    };

    // 插入数据库
    const result = await db.collection('db_info').add({
      data: insertData
    });

    console.log('✅ 信息发布成功:', result);

    return {
      success: true,
      message: '发布成功',
      data: {
        _id: result._id,
        hash_id: hashId
      }
    };
  } catch (error) {
    console.error('❌ 创建信息失败:', error);
    return {
      success: false,
      message: '发布失败: ' + error.message
    };
  }
}

/**
 * 更新信息
 */
async function updateItem(event, openid) {
  const { hash_id, data } = event;

  if (!hash_id) {
    return {
      success: false,
      message: '缺少 hash_id'
    };
  }

  // 验证数据
  const validation = validateData(data);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.message
    };
  }

  try {
    // 查询原记录,验证权限
    const itemResult = await db.collection('db_info').where({
      hash_id: hash_id
    }).get();

    if (itemResult.data.length === 0) {
      return {
        success: false,
        message: '信息不存在'
      };
    }

    const item = itemResult.data[0];

    // 验证是否是发布者本人
    if (item.publisher_openid !== openid) {
      return {
        success: false,
        message: '无权修改此信息'
      };
    }

    // 构建更新数据
    const updateData = {
      title: data.title,
      description: data.description,
      price_min: parseInt(data.price_min),
      price_max: parseInt(data.price_max),
      price_unit_id: data.price_unit_id,
      category_ids: data.category_ids,
      area_id: data.area_id,
      tag_ids: data.tag_ids || [],
      company_name: data.company_name,
      company_address: data.company_address || '',
      company_logo: data.company_logo || '',
      images: data.images || [],
      contact_name: data.contact_name,
      contact_phone: data.contact_phone,
      contact_wechat: data.contact_wechat || '',
      longitude: data.longitude || null,
      latitude: data.latitude || null,

      // 访问权限字段：free-免费用户可看, vip-仅VIP用户可看
      access_level: data.access_level || 'free',

      // 更新时间
      updated_at: new Date()
    };

    // 更新数据库
    const result = await db.collection('db_info').where({
      hash_id: hash_id
    }).update({
      data: updateData
    });

    console.log('✅ 信息更新成功:', result);

    return {
      success: true,
      message: '保存成功',
      data: {
        updated: result.stats.updated
      }
    };
  } catch (error) {
    console.error('❌ 更新信息失败:', error);
    return {
      success: false,
      message: '保存失败: ' + error.message
    };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  console.log('📝 publishItem 云函数调用:', { action, openid: OPENID });

  // 验证用户登录
  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    };
  }

  try {
    switch (action) {
      case 'create':
        return await createItem(event, OPENID);

      case 'update':
        return await updateItem(event, OPENID);

      default:
        return {
          success: false,
          message: '无效的操作类型'
        };
    }
  } catch (error) {
    console.error('❌ publishItem 云函数执行失败:', error);
    return {
      success: false,
      message: '操作失败: ' + error.message
    };
  }
};
