// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * getFlowerDetail 云函数
 * 按 hash_id 返回完整职位详情
 *
 * 升级说明：
 * - 支持ID引用：使用聚合查询关联system_config
 * - 自动获取最新名称：分类和区域名称实时从system_config获取
 * - 向后兼容：同时支持旧数据（名称字符串）和新数据（ID）
 */
exports.main = async (event, context) => {
  const { hash_id } = event;

  if (!hash_id) {
    return {
      success: false,
      message: '缺少 hash_id 参数'
    };
  }

  try {
    // 使用聚合查询，关联system_config获取最新名称
    const aggregateResult = await db.collection('db_info')
      .aggregate()
      .match({ hash_id })
      // 关联分类信息（支持多分类）
      .lookup({
        from: 'system_config',
        let: { categoryIds: '$category_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$categoryIds', null] },
                  { $in: ['$_id', { $ifNull: ['$$categoryIds', []] }] }
                ]
              }
            }
          },
          {
            $project: { name: 1, _id: 0 }
          }
        ],
        as: 'categoryDetails'
      })
      // 关联区域信息
      .lookup({
        from: 'system_config',
        let: { areaId: '$area_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$areaId', null] },
                  { $eq: ['$_id', '$$areaId'] }
                ]
              }
            }
          },
          {
            $project: { name: 1, _id: 0 }
          }
        ],
        as: 'areaDetails'
      })
      // 关联标签信息（支持多标签）
      .lookup({
        from: 'system_config',
        let: { tagIds: '$tag_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$tagIds', null] },
                  { $in: ['$_id', { $ifNull: ['$$tagIds', []] }] }
                ]
              }
            }
          },
          {
            $project: { name: 1, _id: 1 }
          }
        ],
        as: 'tagDetails'
      })
      // 关联价格单位信息
      .lookup({
        from: 'system_config',
        let: { priceUnitId: '$price_unit_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$priceUnitId', null] },
                  { $eq: ['$_id', '$$priceUnitId'] }
                ]
              }
            }
          },
          {
            $project: { name: 1, _id: 0 }
          }
        ],
        as: 'priceUnitDetails'
      })
      .end();

    if (!aggregateResult.list || aggregateResult.list.length === 0) {
      return {
        success: false,
        message: '未找到该职位信息'
      };
    }

    const item = aggregateResult.list[0];

    // 提取分类名称（优先使用关联查询的结果，否则使用原有的categories字段）
    let categories = [];
    if (item.categoryDetails && item.categoryDetails.length > 0) {
      categories = item.categoryDetails.map(c => c.name);
    } else if (Array.isArray(item.categories)) {
      categories = item.categories;
    } else if (item.category) {
      categories = [item.category];
    }

    // 提取区域名称（优先使用关联查询的结果）
    let areaName = '';
    if (item.areaDetails && item.areaDetails.length > 0) {
      areaName = item.areaDetails[0].name;
    } else if (item.area) {
      areaName = item.area;
    }

    // 提取标签数据（关联查询结果，包含_id和name）
    let tags = [];
    if (item.tagDetails && item.tagDetails.length > 0) {
      tags = item.tagDetails.map(t => ({ _id: t._id, name: t.name }));
    } else if (Array.isArray(item.tags)) {
      // 兼容旧数据：字符串数组
      tags = item.tags.map(tag => {
        if (typeof tag === 'object' && tag.name) {
          return { _id: tag._id, name: tag.name };
        } else if (typeof tag === 'string') {
          return { name: tag };
        }
        return { name: '标签' };
      });
    }

    // 提取价格单位名称
    let priceUnit = '';
    if (item.priceUnitDetails && item.priceUnitDetails.length > 0) {
      priceUnit = item.priceUnitDetails[0].name;
    }

    // 动态构建完整地址（不再依赖 location 字段）
    let displayLocation = '';
    if (areaName && categories.length > 0) {
      // 格式：城市·区域·分类1·分类2
      displayLocation = `昆明·${areaName}·${categories.join('·')}`;
    } else if (areaName) {
      // 只有区域
      displayLocation = `昆明·${areaName}`;
    } else {
      // 降级：使用原 location 字段（兼容未迁移数据）
      displayLocation = item.location || '昆明';
    }

    // 补充默认字段
    const detail = {
      ...item,
      description: item.description || '',
      tags: tags, // 使用关联查询得到的标签数据（包含_id和name）
      categories: categories, // 使用关联查询得到的最新分类名称
      area: areaName, // 返回区域名称
      view_count: item.view_count || 0,
      company_name: item.company_name || '',
      company_address: item.company_address || '',
      contact_name: item.contact_name || '',
      contact_phone: item.contact_phone || '',
      contact_wechat: item.contact_wechat || '',
      location: displayLocation, // 使用动态生成的地址（完全实时更新）
      price_min: item.price_min || 0,
      price_max: item.price_max || 0,
      price_unit: priceUnit, // 价格单位名称
      is_hot: item.is_hot || false,
      is_active: item.is_active !== false,
      post_time: item.post_time || Date.now(),
      // 格式化薪资（包含价格单位）
      salary: formatSalary(item.price_min, item.price_max, priceUnit),
      // 格式化时间
      postTime: formatTime(item.post_time),
      // 移除临时的关联字段
      categoryDetails: undefined,
      areaDetails: undefined,
      tagDetails: undefined,
      priceUnitDetails: undefined
    };

    return {
      success: true,
      data: detail
    };
  } catch (error) {
    console.error('[getFlowerDetail] 错误:', error);
    return {
      success: false,
      message: error.message || '获取详情失败'
    };
  }
};

/**
 * 格式化薪资
 */
function formatSalary(min, max, priceUnit) {
  const unit = priceUnit || '元';

  if (!min && !max) return '面议';
  if (min && max) return `${min}-${max}${unit}`;
  if (min) return `${min}${unit}起`;
  if (max) return `${max}${unit}以内`;
  return '面议';
}

/**
 * 格式化时间
 */
function formatTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return Math.floor(diff / minute) + '分钟前';
  } else if (diff < day) {
    return Math.floor(diff / hour) + '小时前';
  } else if (diff < 7 * day) {
    return Math.floor(diff / day) + '天前';
  } else {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${d}`;
  }
}
