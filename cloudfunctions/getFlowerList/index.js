// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * getFlowerList 云函数
 * 分页、筛选、排序职位/花卉信息
 *
 * 升级说明：
 * - 支持ID引用：categories/location字段存储的是system_config的custom_id（固定业务ID）
 * - 使用聚合查询：通过lookup自动关联获取最新名称
 * - 向后兼容：同时支持旧数据（名称字符串、_id）和新数据（custom_id）
 * - ✨ 固定ID方案（序号式）：使用custom_id代替_id进行绑定，删除重建也保持数据一致性
 *   - 格式：area_001, cat_01, tag_001, unit_01
 *   - 优势：序号永不改变，不受名称变化影响
 */
exports.main = async (event, context) => {
  const {
    page = 1,
    limit = 10,
    type = '',
    areaCode = '',
    keyword = '',
    sortBy = 'updated_at',  // 改为使用updated_at字段
    sortOrder = 'desc',
    // 新增：后端筛选参数
    city = '',              // 城市筛选（如：'昆明市'）
    userLatitude = null,    // 用户纬度（用于距离计算和排序）
    userLongitude = null,   // 用户经度（用于距离计算和排序）
    maxDistance = null      // 最大距离（单位：公里）
  } = event;

  console.log('[getFlowerList] 接收参数:', {
    page, limit, type, areaCode, keyword, sortBy, sortOrder,
    city, userLatitude, userLongitude, maxDistance
  });

  try {
    // 构建基础查询条件
    const where = { is_active: true };

    // 分类筛选 - 支持ID或名称（向后兼容）
    if (type && type !== 'all') {
      // 同时匹配 category_ids（新数据，ID数组）和 categories（旧数据，名称数组）
      where.$or = [
        { category_ids: type },  // 新数据：ID数组中包含该ID
        { categories: type }     // 旧数据：名称数组中包含该名称
      ];
      console.log('[getFlowerList] 添加分类筛选:', type);
    }

    // 地区筛选 - 支持ID或名称（向后兼容）
    if (areaCode && areaCode !== 'all') {
      const areaConditions = [
        { area_id: areaCode },  // 新数据：区域ID
        { location: db.RegExp({ regexp: areaCode, options: 'i' }) }  // 旧数据：地址包含该名称
      ];

      if (where.$or) {
        // 如果已经有$or条件（分类筛选），需要合并
        where.$and = [
          { $or: where.$or },
          { $or: areaConditions }
        ];
        delete where.$or;
      } else {
        where.$or = areaConditions;
      }
      console.log('[getFlowerList] 添加地区筛选:', areaCode);
    }

    // 关键字搜索
    if (keyword) {
      const keywordConditions = [
        { title: db.RegExp({ regexp: keyword, options: 'i' }) },
        { description: db.RegExp({ regexp: keyword, options: 'i' }) },
        { company_name: db.RegExp({ regexp: keyword, options: 'i' }) }
      ];

      if (where.$or) {
        // 如果已经有$or条件，需要合并
        where.$and = where.$and || [];
        where.$and.push({ $or: where.$or }, { $or: keywordConditions });
        delete where.$or;
      } else if (where.$and) {
        where.$and.push({ $or: keywordConditions });
      } else {
        where.$or = keywordConditions;
      }
      console.log('[getFlowerList] 添加关键字搜索:', keyword);
    }

    // 城市筛选（新增）
    if (city) {
      const cityConditions = [
        { company_address: db.RegExp({ regexp: city, options: 'i' }) },
        { city: db.RegExp({ regexp: city, options: 'i' }) },
        { location: db.RegExp({ regexp: city, options: 'i' }) }
      ];

      if (where.$or) {
        where.$and = where.$and || [];
        where.$and.push({ $or: where.$or }, { $or: cityConditions });
        delete where.$or;
      } else if (where.$and) {
        where.$and.push({ $or: cityConditions });
      } else {
        where.$or = cityConditions;
      }
      console.log('[getFlowerList] 添加城市筛选:', city);
    }

    console.log('[getFlowerList] 最终查询条件:', JSON.stringify(where));

    // 判断是否需要地理位置查询
    const useGeoQuery = (userLatitude && userLongitude) || maxDistance;

    // 使用聚合查询获取数据并关联system_config
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    // 构建聚合管道
    let aggregatePipeline = db.collection('db_info').aggregate();

    // 第一步：基础筛选
    aggregatePipeline = aggregatePipeline.match(where);

    // 第二步：如果有地理位置查询，不在聚合管道中计算距离
    // 改为在后端代码中计算（MongoDB聚合管道的数学运算符有限制）
    if (useGeoQuery) {
      console.log('[getFlowerList] 启用地理位置查询，用户位置:', { userLatitude, userLongitude, maxDistance });
      // 注意：距离计算将在查询结果返回后，在JavaScript中进行
    }

    // 第三步：排序
    // 如果是地理位置排序，暂时使用updated_at排序，稍后在内存中按距离排序
    if (useGeoQuery && (sortBy === 'nearby' || sortBy === 'distance')) {
      aggregatePipeline = aggregatePipeline.sort({ updated_at: -1 });
      console.log('[getFlowerList] 地理位置查询：先按updated_at排序，稍后按距离排序');
    } else {
      aggregatePipeline = aggregatePipeline.sort({ [sortBy]: sortDirection });
      console.log('[getFlowerList] 使用常规排序:', sortBy, sortDirection);
    }

    // 第四步：分页（如果有距离筛选，需要多取一些数据，因为筛选会在内存中进行）
    const fetchLimit = (useGeoQuery && maxDistance) ? limit * 5 : limit;  // 多取5倍数据用于距离筛选
    aggregatePipeline = aggregatePipeline.skip(skip).limit(fetchLimit)
      // 关联分类信息（支持多分类）- 使用custom_id
      .lookup({
        from: 'system_config',
        let: { categoryIds: '$category_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$categoryIds', null] },
                  {
                    $or: [
                      { $in: ['$custom_id', { $ifNull: ['$$categoryIds', []] }] },  // 新数据：使用custom_id
                      { $in: ['$_id', { $ifNull: ['$$categoryIds', []] }] }        // 旧数据：兼容_id
                    ]
                  }
                ]
              }
            }
          },
          {
            $project: { name: 1, custom_id: 1, _id: 0 }
          }
        ],
        as: 'categoryDetails'
      })
      // 关联区域信息 - 使用custom_id
      .lookup({
        from: 'system_config',
        let: { areaId: '$area_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$areaId', null] },
                  {
                    $or: [
                      { $eq: ['$custom_id', '$$areaId'] },  // 新数据：使用custom_id
                      { $eq: ['$_id', '$$areaId'] }         // 旧数据：兼容_id
                    ]
                  }
                ]
              }
            }
          },
          {
            $project: { name: 1, custom_id: 1, _id: 0 }
          }
        ],
        as: 'areaDetails'
      })
      // 关联标签信息（支持多标签）- 使用custom_id
      .lookup({
        from: 'system_config',
        let: { tagIds: '$tag_ids' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$tagIds', null] },
                  {
                    $or: [
                      { $in: ['$custom_id', { $ifNull: ['$$tagIds', []] }] },  // 新数据：使用custom_id
                      { $in: ['$_id', { $ifNull: ['$$tagIds', []] }] }         // 旧数据：兼容_id
                    ]
                  }
                ]
              }
            }
          },
          {
            $project: { name: 1, order: 1, custom_id: 1, _id: 0 }
          },
          {
            $sort: { order: 1 }
          }
        ],
        as: 'tagDetails'
      })
      // 关联价格单位信息 - 使用custom_id
      .lookup({
        from: 'system_config',
        let: { priceUnitId: '$price_unit_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $ne: ['$$priceUnitId', null] },
                  {
                    $or: [
                      { $eq: ['$custom_id', '$$priceUnitId'] },  // 新数据：使用custom_id
                      { $eq: ['$_id', '$$priceUnitId'] }         // 旧数据：兼容_id
                    ]
                  }
                ]
              }
            }
          },
          {
            $project: { name: 1, custom_id: 1, _id: 0 }
          }
        ],
        as: 'priceUnitDetails'
      });

    // 执行聚合查询
    const aggregateResult = await aggregatePipeline.end();

    console.log('[getFlowerList] 聚合查询返回数据条数:', aggregateResult.list.length);

    // 如果有地理位置查询，在JavaScript中计算距离
    let processedList = aggregateResult.list;
    if (useGeoQuery) {
      console.log('[getFlowerList] 在JavaScript中计算距离');
      processedList = processedList.map(item => {
        const distance = calculateDistance(
          userLatitude,
          userLongitude,
          item.latitude || 25.040609,
          item.longitude || 102.712251
        );
        return {
          ...item,
          distance: distance
        };
      });

      // 如果有距离筛选，进行过滤
      if (maxDistance) {
        const maxDist = parseFloat(maxDistance);
        processedList = processedList.filter(item => item.distance <= maxDist);
        console.log(`[getFlowerList] 距离筛选后剩余: ${processedList.length} 条`);
      }

      // 如果是地理位置排序，按距离排序
      if (sortBy === 'nearby' || sortBy === 'distance') {
        processedList.sort((a, b) => a.distance - b.distance);
        console.log('[getFlowerList] 按距离排序完成（从近到远）');
      }

      // 限制返回数量
      processedList = processedList.slice(0, limit);
    }

    // 计算总数（简化处理）
    let total = 0;
    if (useGeoQuery && maxDistance) {
      // 距离筛选的total使用processedList的长度（近似值）
      total = processedList.length;
      console.log('[getFlowerList] 距离筛选后总数（近似）:', total);
    } else {
      // 没有距离筛选，使用简单查询计算总数
      const countResult = await db.collection('db_info')
        .where(where)
        .count();
      total = countResult.total;
      console.log('[getFlowerList] 查询到总数:', total);
    }

    // 处理和格式化数据（使用processedList而不是aggregateResult.list）
    const items = processedList.map(item => {
      // 提取分类名称（优先使用关联查询的结果，否则使用原有的categories字段）
      let categories = [];
      if (item.categoryDetails && item.categoryDetails.length > 0) {
        categories = item.categoryDetails.map(c => c.name);
      } else if (Array.isArray(item.categories)) {
        categories = item.categories;
      }

      // 提取区域名称（优先使用关联查询的结果）
      let areaName = '';
      if (item.areaDetails && item.areaDetails.length > 0) {
        areaName = item.areaDetails[0].name;
      }

      // 提取标签信息（优先使用关联查询的结果，否则使用原有的tags字段）
      let tags = [];
      let tagNames = [];
      if (item.tagDetails && item.tagDetails.length > 0) {
        // 新数据：从关联查询获取最新标签名（使用custom_id）
        tags = item.tagDetails.map(t => ({ _id: t.custom_id || t._id, name: t.name }));
        tagNames = item.tagDetails.map(t => t.name);
      } else if (Array.isArray(item.tags)) {
        // 旧数据：直接使用标签名数组
        tagNames = item.tags;
        tags = item.tags.map(name => ({ name }));
      }

      // 提取价格单位信息（优先使用关联查询的结果）
      let priceUnit = '元/束'; // 默认单位
      let priceUnitId = null;
      if (item.priceUnitDetails && item.priceUnitDetails.length > 0) {
        // 新数据：从关联查询获取最新价格单位名（使用custom_id）
        priceUnit = item.priceUnitDetails[0].name;
        priceUnitId = item.priceUnitDetails[0].custom_id || item.priceUnitDetails[0]._id;
      }

      // 动态构建完整地址（不再依赖 location 字段）
      let displayLocation = '';
      if (areaName && categories.length > 0) {
        // 格式：城市.区域.分类1.分类2
        displayLocation = `昆明.${areaName}.${categories.join('.')}`;
      } else if (areaName) {
        // 只有区域
        displayLocation = `昆明.${areaName}`;
      } else {
        // 降级：使用原 location 字段（兼容未迁移数据）
        displayLocation = item.location || '昆明';
      }

      // 格式化距离文本
      let distanceText = '';
      if (item.distance !== undefined && item.distance !== null) {
        const dist = item.distance;
        if (dist < 1) {
          distanceText = `${Math.round(dist * 1000)}m`;
        } else {
          distanceText = `${dist.toFixed(1)}km`;
        }
      }

      return {
        ...item,
        // 统一使用categories数组（向前端提供）
        categories: categories,
        // 使用动态生成的地址（完全实时更新）
        location: displayLocation,
        // 单独提供区域名称（用于列表页简短显示）
        area: areaName || (item.location ? item.location.split('.')[1] : ''),
        // 保持描述字段为数组格式（不做任何转换）
        description: Array.isArray(item.description) ? item.description : (item.description ? [String(item.description)] : []),
        // 标签数组（包含ID和名称的对象数组）
        tags: tags,
        // 标签名数组（用于向后兼容）
        tagNames: tagNames,
        // 价格单位
        priceUnit: priceUnit,
        priceUnitId: priceUnitId,
        // 格式化薪资（带单位）
        salary: formatSalaryWithUnit(item.price_min, item.price_max, priceUnit),
        // 格式化时间 - 使用updated_at字段
        postTime: formatTime(item.updated_at || item.post_time || item.created_at),
        viewCount: item.view_count || 0,
        // 距离信息（如果有地理位置查询）
        distance: item.distance,
        distanceText: distanceText,
        // 移除临时的关联字段
        categoryDetails: undefined,
        areaDetails: undefined,
        tagDetails: undefined,
        priceUnitDetails: undefined
      };
    });

    return {
      success: true,
      data: items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total
    };
  } catch (error) {
    console.error('[getFlowerList] 错误:', error);
    return {
      success: false,
      message: error.message || '获取列表失败',
      data: [],
      total: 0
    };
  }
};

/**
 * 清洗文本字段
 */
function cleanText(text) {
  if (!text) return '';
  return String(text).trim();
}

/**
 * 格式化薪资（带单位）
 */
function formatSalaryWithUnit(min, max, unit = '元/束') {
  if (!min && !max) return '面议';
  if (min && max) return `${min}-${max}${unit}`;
  if (min) return `${min}${unit}起`;
  if (max) return `${max}${unit}以内`;
  return '面议';
}

/**
 * 格式化薪资（旧版本，保留兼容）
 */
function formatSalary(min, max) {
  return formatSalaryWithUnit(min, max, '元');
}

/**
 * 格式化时间
 */
function formatTime(timestamp) {
  if (!timestamp) return '';

  // 处理多种时间格式
  let date;
  if (typeof timestamp === 'string') {
    // 处理字符串格式："2025-10-08 20:21:36" 或 "2025-10-08，20:21:36"
    const cleanTimestamp = timestamp.replace(/，/g, ' ').trim();
    date = new Date(cleanTimestamp);
  } else if (typeof timestamp === 'number') {
    // 处理时间戳
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    console.warn('[formatTime] 无效的时间格式:', timestamp);
    return '';
  }

  const now = new Date();
  const diff = now - date;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 0) {
    // 未来时间（可能时区问题），显示为"刚刚"
    return '刚刚';
  } else if (diff < minute) {
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

/**
 * 计算两点之间的距离（Haversine公式）
 * @param {number} lat1 纬度1
 * @param {number} lon1 经度1
 * @param {number} lat2 纬度2
 * @param {number} lon2 经度2
 * @returns {number} 距离（公里）
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径（公里）

  const toRad = (degrees) => degrees * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}
