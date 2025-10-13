// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * vipOrderManager 云函数
 * VIP订单管理系统
 *
 * 支持的操作:
 * - createOrder: 创建VIP订单（支付成功后调用）
 * - getMyOrders: 获取当前用户的订单列表
 * - getOrderDetail: 获取订单详情
 * - getAllOrders: 获取所有订单（管理员）
 * - searchOrders: 搜索订单（管理员）
 * - refundOrder: 退款订单（管理员）
 * - extendVIP: 延长VIP（管理员）
 * - getOrderStats: 获取订单统计（管理员）
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'createOrder':
        return await createOrder(event, openid);
      case 'getMyOrders':
        return await getMyOrders(event, openid);
      case 'getOrderDetail':
        return await getOrderDetail(event, openid);
      case 'getAllOrders':
        return await getAllOrders(event, openid);
      case 'searchOrders':
        return await searchOrders(event, openid);
      case 'refundOrder':
        return await refundOrder(event, openid);
      case 'extendVIP':
        return await extendVIP(event, openid);
      case 'getOrderStats':
        return await getOrderStats(event, openid);
      default:
        return {
          success: false,
          message: '未知操作'
        };
    }
  } catch (error) {
    console.error('[vipOrderManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 生成订单号
 * 格式: VIP + 8位日期(YYYYMMDD) + 6位序号
 * 例如: VIP20251013000001
 */
async function generateOrderNo() {
  const now = new Date();
  const dateStr = formatDate(now, 'YYYYMMDD');

  // 查询今天已有的订单，获取最大序号
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const result = await db.collection('vip_orders')
    .where({
      create_time: _.gte(todayStart).and(_.lt(todayEnd))
    })
    .field({ order_no: true })
    .get();

  // 提取序号并找到最大值
  const numbers = result.data
    .map(order => {
      const match = order.order_no.match(/VIP\d{8}(\d{6})$/);
      return match ? parseInt(match[1]) : 0;
    })
    .filter(n => n > 0);

  const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  const sequence = String(nextNum).padStart(6, '0');

  return `VIP${dateStr}${sequence}`;
}

/**
 * 创建VIP订单
 * 在用户支付成功后调用此函数创建订单记录
 */
async function createOrder(event, openid) {
  const {
    transaction_id,    // 微信支付交易号
    amount,            // 支付金额（分）
    vip_duration,      // VIP时长（天）
    nickname,          // 用户昵称
    avatar_url         // 用户头像
  } = event;

  // 参数验证
  if (!transaction_id || !amount || !vip_duration) {
    return {
      success: false,
      message: '缺少必要参数'
    };
  }

  // 检查交易号是否已存在（防止重复创建）
  const existingOrder = await db.collection('vip_orders')
    .where({ transaction_id })
    .count();

  if (existingOrder.total > 0) {
    return {
      success: false,
      message: '订单已存在，请勿重复创建'
    };
  }

  // 生成订单号
  const order_no = await generateOrderNo();

  // 获取用户当前VIP信息
  const userResult = await db.collection('users')
    .where({ openid })
    .get();

  let vip_start_date = new Date();
  let vip_end_date = new Date();

  if (userResult.data.length > 0) {
    const user = userResult.data[0];
    // 如果用户已有VIP且未过期，从到期日期开始计算
    if (user.vip_end_date && new Date(user.vip_end_date) > new Date()) {
      vip_start_date = new Date(user.vip_end_date);
    }
  }

  // 计算VIP结束日期
  vip_end_date = new Date(vip_start_date.getTime() + vip_duration * 24 * 60 * 60 * 1000);

  // 创建订单记录
  const orderData = {
    order_no,
    openid,
    nickname: nickname || '',
    avatar_url: avatar_url || '',
    transaction_id,
    amount,
    vip_duration,
    vip_start_date: vip_start_date,
    vip_end_date: vip_end_date,
    status: 'paid',
    create_time: new Date(),
    pay_time: new Date(),
    refund_time: null,
    refund_reason: '',
    admin_note: ''
  };

  const addResult = await db.collection('vip_orders').add({
    data: orderData
  });

  if (!addResult._id) {
    return {
      success: false,
      message: '订单创建失败'
    };
  }

  // 更新用户VIP信息
  await db.collection('users')
    .where({ openid })
    .update({
      data: {
        is_vip: true,
        vip_end_date: vip_end_date,
        update_time: new Date()
      }
    });

  return {
    success: true,
    message: '订单创建成功',
    data: {
      order_no,
      _id: addResult._id,
      vip_end_date
    }
  };
}

/**
 * 获取我的订单列表
 */
async function getMyOrders(event, openid) {
  const { status, page = 1, pageSize = 20 } = event;

  // 构建查询条件
  const where = { openid };
  if (status && status !== 'all') {
    if (status === 'paid') {
      where.status = 'paid';
      where.vip_end_date = _.gte(new Date()); // 未过期
    } else if (status === 'expired') {
      where.status = 'paid';
      where.vip_end_date = _.lt(new Date()); // 已过期
    } else if (status === 'refunded') {
      where.status = 'refunded';
    }
  }

  // 查询订单列表
  const skip = (page - 1) * pageSize;
  const result = await db.collection('vip_orders')
    .where(where)
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 查询总数
  const countResult = await db.collection('vip_orders')
    .where(where)
    .count();

  // 格式化订单数据
  const orders = result.data.map(order => ({
    ...order,
    amount_yuan: (order.amount / 100).toFixed(2), // 转换为元
    pay_time_str: formatTime(order.pay_time),
    vip_start_date_str: formatDate(order.vip_start_date, 'YYYY-MM-DD'),
    vip_end_date_str: formatDate(order.vip_end_date, 'YYYY-MM-DD'),
    is_expired: new Date(order.vip_end_date) < new Date(),
    status_text: getStatusText(order.status, order.vip_end_date)
  }));

  return {
    success: true,
    data: {
      orders,
      total: countResult.total,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize)
    }
  };
}

/**
 * 获取订单详情
 */
async function getOrderDetail(event, openid) {
  const { order_no } = event;

  if (!order_no) {
    return {
      success: false,
      message: '缺少订单号'
    };
  }

  // 查询订单
  const result = await db.collection('vip_orders')
    .where({ order_no })
    .get();

  if (result.data.length === 0) {
    return {
      success: false,
      message: '订单不存在'
    };
  }

  const order = result.data[0];

  // 非管理员只能查看自己的订单
  // 检查管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin && order.openid !== openid) {
    return {
      success: false,
      message: '无权查看此订单'
    };
  }

  // 格式化订单数据
  const formattedOrder = {
    ...order,
    amount_yuan: (order.amount / 100).toFixed(2),
    pay_time_str: formatTime(order.pay_time),
    create_time_str: formatTime(order.create_time),
    vip_start_date_str: formatDate(order.vip_start_date, 'YYYY-MM-DD HH:mm'),
    vip_end_date_str: formatDate(order.vip_end_date, 'YYYY-MM-DD HH:mm'),
    refund_time_str: order.refund_time ? formatTime(order.refund_time) : '',
    is_expired: new Date(order.vip_end_date) < new Date(),
    status_text: getStatusText(order.status, order.vip_end_date)
  };

  return {
    success: true,
    data: formattedOrder
  };
}

/**
 * 获取所有订单（管理员）
 */
async function getAllOrders(event, openid) {
  // 验证管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限访问'
    };
  }

  const { dateFilter = 'all', page = 1, pageSize = 20 } = event;

  // 构建时间过滤条件
  let where = {};
  const now = new Date();

  if (dateFilter === 'today') {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    where.create_time = _.gte(todayStart).and(_.lt(todayEnd));
  } else if (dateFilter === 'week') {
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    where.create_time = _.gte(weekStart);
  } else if (dateFilter === 'month') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    where.create_time = _.gte(monthStart);
  }

  // 查询订单列表
  const skip = (page - 1) * pageSize;
  const result = await db.collection('vip_orders')
    .where(where)
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 查询总数
  const countResult = await db.collection('vip_orders')
    .where(where)
    .count();

  // 格式化订单数据
  const orders = result.data.map(order => ({
    ...order,
    amount_yuan: (order.amount / 100).toFixed(2),
    pay_time_str: formatTime(order.pay_time),
    vip_start_date_str: formatDate(order.vip_start_date, 'YYYY-MM-DD'),
    vip_end_date_str: formatDate(order.vip_end_date, 'YYYY-MM-DD'),
    is_expired: new Date(order.vip_end_date) < new Date(),
    status_text: getStatusText(order.status, order.vip_end_date)
  }));

  return {
    success: true,
    data: {
      orders,
      total: countResult.total,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize)
    }
  };
}

/**
 * 搜索订单（管理员）
 */
async function searchOrders(event, openid) {
  // 验证管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限访问'
    };
  }

  const { keyword, page = 1, pageSize = 20 } = event;

  if (!keyword || !keyword.trim()) {
    return {
      success: false,
      message: '请输入搜索关键词'
    };
  }

  // 构建查询条件（搜索订单号、昵称、openid）
  const where = _.or([
    { order_no: db.RegExp({ regexp: keyword, options: 'i' }) },
    { nickname: db.RegExp({ regexp: keyword, options: 'i' }) },
    { openid: keyword }
  ]);

  // 查询订单列表
  const skip = (page - 1) * pageSize;
  const result = await db.collection('vip_orders')
    .where(where)
    .orderBy('create_time', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();

  // 查询总数
  const countResult = await db.collection('vip_orders')
    .where(where)
    .count();

  // 格式化订单数据
  const orders = result.data.map(order => ({
    ...order,
    amount_yuan: (order.amount / 100).toFixed(2),
    pay_time_str: formatTime(order.pay_time),
    vip_start_date_str: formatDate(order.vip_start_date, 'YYYY-MM-DD'),
    vip_end_date_str: formatDate(order.vip_end_date, 'YYYY-MM-DD'),
    is_expired: new Date(order.vip_end_date) < new Date(),
    status_text: getStatusText(order.status, order.vip_end_date)
  }));

  return {
    success: true,
    data: {
      orders,
      total: countResult.total,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize)
    }
  };
}

/**
 * 退款订单（管理员）
 */
async function refundOrder(event, openid) {
  // 验证管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限操作'
    };
  }

  const { order_no, refund_reason } = event;

  if (!order_no) {
    return {
      success: false,
      message: '缺少订单号'
    };
  }

  // 查询订单
  const orderResult = await db.collection('vip_orders')
    .where({ order_no })
    .get();

  if (orderResult.data.length === 0) {
    return {
      success: false,
      message: '订单不存在'
    };
  }

  const order = orderResult.data[0];

  // 检查订单状态
  if (order.status === 'refunded') {
    return {
      success: false,
      message: '订单已退款，请勿重复操作'
    };
  }

  // 更新订单状态
  await db.collection('vip_orders')
    .where({ order_no })
    .update({
      data: {
        status: 'refunded',
        refund_time: new Date(),
        refund_reason: refund_reason || '管理员退款'
      }
    });

  // 更新用户VIP状态（取消VIP）
  await db.collection('users')
    .where({ openid: order.openid })
    .update({
      data: {
        is_vip: false,
        vip_end_date: null,
        update_time: new Date()
      }
    });

  return {
    success: true,
    message: '退款成功'
  };
}

/**
 * 延长VIP（管理员）
 */
async function extendVIP(event, openid) {
  // 验证管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限操作'
    };
  }

  const { order_no, extend_days } = event;

  if (!order_no || !extend_days) {
    return {
      success: false,
      message: '缺少必要参数'
    };
  }

  if (extend_days <= 0) {
    return {
      success: false,
      message: '延长天数必须大于0'
    };
  }

  // 查询订单
  const orderResult = await db.collection('vip_orders')
    .where({ order_no })
    .get();

  if (orderResult.data.length === 0) {
    return {
      success: false,
      message: '订单不存在'
    };
  }

  const order = orderResult.data[0];

  // 检查订单状态
  if (order.status === 'refunded') {
    return {
      success: false,
      message: '已退款订单无法延长VIP'
    };
  }

  // 计算新的到期时间
  const oldEndDate = new Date(order.vip_end_date);
  const newEndDate = new Date(oldEndDate.getTime() + extend_days * 24 * 60 * 60 * 1000);

  // 更新订单
  await db.collection('vip_orders')
    .where({ order_no })
    .update({
      data: {
        vip_end_date: newEndDate,
        vip_duration: order.vip_duration + extend_days,
        admin_note: `${order.admin_note}\n[${formatDate(new Date(), 'YYYY-MM-DD HH:mm')}] 延长${extend_days}天`
      }
    });

  // 更新用户VIP信息
  await db.collection('users')
    .where({ openid: order.openid })
    .update({
      data: {
        is_vip: true,
        vip_end_date: newEndDate,
        update_time: new Date()
      }
    });

  return {
    success: true,
    message: `VIP已延长${extend_days}天`,
    data: {
      old_end_date: formatDate(oldEndDate, 'YYYY-MM-DD HH:mm'),
      new_end_date: formatDate(newEndDate, 'YYYY-MM-DD HH:mm')
    }
  };
}

/**
 * 获取订单统计（管理员）
 */
async function getOrderStats(event, openid) {
  // 验证管理员权限
  const isAdmin = await checkAdminPermission(openid);
  if (!isAdmin) {
    return {
      success: false,
      message: '无权限访问'
    };
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // 查询总订单数
  const totalResult = await db.collection('vip_orders')
    .where({ status: 'paid' })
    .count();

  // 查询今日订单数
  const todayResult = await db.collection('vip_orders')
    .where({
      status: 'paid',
      create_time: _.gte(todayStart).and(_.lt(todayEnd))
    })
    .count();

  // 查询总收入（已支付订单）
  const revenueResult = await db.collection('vip_orders')
    .where({ status: 'paid' })
    .get();

  const totalRevenue = revenueResult.data.reduce((sum, order) => sum + order.amount, 0);

  // 查询今日收入
  const todayRevenueResult = await db.collection('vip_orders')
    .where({
      status: 'paid',
      create_time: _.gte(todayStart).and(_.lt(todayEnd))
    })
    .get();

  const todayRevenue = todayRevenueResult.data.reduce((sum, order) => sum + order.amount, 0);

  return {
    success: true,
    data: {
      total_orders: totalResult.total,
      today_orders: todayResult.total,
      total_revenue: (totalRevenue / 100).toFixed(2),
      today_revenue: (todayRevenue / 100).toFixed(2),
      total_revenue_yuan: totalRevenue / 100,
      today_revenue_yuan: todayRevenue / 100
    }
  };
}

/**
 * 检查管理员权限
 */
async function checkAdminPermission(openid) {
  try {
    const result = await db.collection('users')
      .where({ openid })
      .get();

    if (result.data.length === 0) {
      return false;
    }

    const user = result.data[0];
    // 兼容两种管理员标识方式：role === 'admin' 或 is_admin === true
    return user.role === 'admin' || user.is_admin === true;
  } catch (error) {
    console.error('[checkAdminPermission] 错误:', error);
    return false;
  }
}

/**
 * 获取状态文本
 */
function getStatusText(status, vip_end_date) {
  if (status === 'refunded') {
    return '已退款';
  }

  if (status === 'paid') {
    if (new Date(vip_end_date) < new Date()) {
      return '已过期';
    }
    return '使用中';
  }

  return '未知状态';
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
    return formatDate(date, 'YYYY-MM-DD HH:mm');
  }
}

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {String} format - 格式字符串，如 'YYYY-MM-DD', 'YYYYMMDD', 'YYYY-MM-DD HH:mm'
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';

  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
}
