// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * vipManager 云函数
 * 管理VIP会员相关功能：套餐查询、订单创建、支付回调、状态查询等
 */
exports.main = async (event, context) => {
  const { action } = event;

  console.log('[vipManager] 接收请求:', { action, event });

  try {
    switch (action) {
      case 'getPlans':
        return await getPlans(event);
      case 'setPlans':
        return await setPlans(event);
      case 'createOrder':
        return await createOrder(event, context);
      case 'checkVIP':
        return await checkVIP(event);
      case 'getVIPStatus':
        return await getVIPStatus(event);
      default:
        return {
          success: false,
          message: `未知的操作类型: ${action}`
        };
    }
  } catch (error) {
    console.error('[vipManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取VIP套餐配置
 */
async function getPlans(event) {
  try {
    // 从配置表读取VIP套餐
    const result = await db.collection('system_config')
      .where({
        type: 'vip_plan',
        is_active: true
      })
      .orderBy('order', 'asc')
      .get();

    const plans = result.data.map(item => ({
      id: item._id,
      duration: item.name,
      unit: item.unit || '月',
      price: item.price || 0,
      originalPrice: item.original_price || null,
      save: item.save || null,
      badge: item.badge || null,
      months: item.months || 1
    }));

    return {
      success: true,
      data: plans
    };
  } catch (error) {
    console.error('[vipManager] 获取套餐失败:', error);
    return {
      success: false,
      message: '获取套餐失败',
      data: []
    };
  }
}

/**
 * 设置VIP套餐配置（管理员功能）
 */
async function setPlans(event) {
  const { plans } = event;

  if (!Array.isArray(plans)) {
    return {
      success: false,
      message: '套餐数据格式错误'
    };
  }

  try {
    // 批量更新或插入套餐配置
    const promises = plans.map((plan, index) => {
      const data = {
        type: 'vip_plan',
        name: plan.duration,
        unit: plan.unit,
        price: plan.price,
        original_price: plan.originalPrice,
        save: plan.save,
        badge: plan.badge,
        months: plan.months,
        order: index,
        is_active: true,
        updated_at: new Date()
      };

      if (plan.id && plan.id.length > 10) {
        // 更新已有套餐
        return db.collection('system_config')
          .doc(plan.id)
          .update({
            data
          });
      } else {
        // 创建新套餐
        return db.collection('system_config').add({
          data: {
            ...data,
            created_at: new Date()
          }
        });
      }
    });

    await Promise.all(promises);

    return {
      success: true,
      message: '套餐配置更新成功'
    };
  } catch (error) {
    console.error('[vipManager] 设置套餐失败:', error);
    return {
      success: false,
      message: '设置套餐失败'
    };
  }
}

/**
 * 创建支付订单
 */
async function createOrder(event, context) {
  const { openid, planId, planDuration, price } = event;

  if (!openid || !planId || !price) {
    return {
      success: false,
      message: '参数缺失'
    };
  }

  try {
    // 获取支付配置
    const configResult = await db.collection('system_config')
      .where({
        type: 'payment_config'
      })
      .limit(1)
      .get();

    if (configResult.data.length === 0 || !configResult.data[0].enabled) {
      return {
        success: false,
        message: '支付功能未启用，请联系管理员'
      };
    }

    const paymentConfig = configResult.data[0];

    // 生成订单号
    const orderNo = generateOrderNo();

    // 创建订单记录
    const orderData = {
      order_no: orderNo,
      openid: openid,
      plan_id: planId,
      plan_duration: planDuration,
      price: price,
      status: 'pending', // pending/paid/cancelled
      created_at: new Date(),
      updated_at: new Date()
    };

    const orderResult = await db.collection('vip_orders').add({
      data: orderData
    });

    console.log('[vipManager] 订单创建成功:', orderResult._id);

    // 调用微信支付统一下单
    const paymentResult = await cloud.cloudPay.unifiedOrder({
      body: `VIP会员-${planDuration}`,
      outTradeNo: orderNo,
      totalFee: Math.round(price * 100), // 单位：分
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'paymentManager',
      subMchId: paymentConfig.paymentMode === 'service' ? paymentConfig.subMchId : undefined,
      nonceStr: generateNonceStr(),
      tradeType: 'JSAPI',
      openid: openid
    });

    console.log('[vipManager] 微信支付统一下单成功');

    return {
      success: true,
      data: {
        orderId: orderResult._id,
        orderNo: orderNo,
        timeStamp: paymentResult.timeStamp,
        nonceStr: paymentResult.nonceStr,
        package: paymentResult.package,
        signType: paymentResult.signType || 'RSA',
        paySign: paymentResult.paySign
      }
    };
  } catch (error) {
    console.error('[vipManager] 创建订单失败:', error);
    return {
      success: false,
      message: error.message || '创建订单失败',
      error: {
        code: error.errCode,
        message: error.errMsg
      }
    };
  }
}

/**
 * 检查用户VIP状态
 * 🔄 优先检查user_roles集合，兼容users集合的vipExpireDate字段
 */
async function checkVIP(event) {
  const { openid } = event;

  if (!openid) {
    return {
      success: false,
      message: '参数缺失'
    };
  }

  try {
    const now = new Date();
    let isVIP = false;
    let expireTime = null;

    // 1️⃣ 优先检查user_roles集合（支付系统使用）
    const roleResult = await db.collection('user_roles')
      .where({ openid: openid })
      .get();

    if (roleResult.data.length > 0) {
      const userRole = roleResult.data[0];
      expireTime = userRole.vip_expire_time ? new Date(userRole.vip_expire_time) : null;
      isVIP = userRole.is_vip === true && expireTime && expireTime > now;

      console.log('[checkVIP] user_roles检查结果:', { isVIP, expireTime });
    }

    // 2️⃣ 如果user_roles中没有VIP，再检查users集合（管理员手动设置）
    if (!isVIP) {
      const userResult = await db.collection('users')
        .where({ openid: openid })
        .get();

      if (userResult.data.length > 0) {
        const user = userResult.data[0];
        const vipExpireDate = user.vipExpireDate ? new Date(user.vipExpireDate) : null;

        if (vipExpireDate && vipExpireDate > now) {
          isVIP = true;
          expireTime = vipExpireDate;
          console.log('[checkVIP] users集合检查结果: VIP有效', expireTime);

          // 🔄 同步到user_roles集合（确保数据一致性）
          try {
            if (roleResult.data.length > 0) {
              await db.collection('user_roles')
                .doc(roleResult.data[0]._id)
                .update({
                  data: {
                    is_vip: true,
                    vip_expire_time: expireTime,
                    updated_at: new Date()
                  }
                });
            } else {
              await db.collection('user_roles').add({
                data: {
                  openid: openid,
                  role: user.role || 'vip',
                  is_vip: true,
                  vip_expire_time: expireTime,
                  created_at: new Date(),
                  updated_at: new Date()
                }
              });
            }
            console.log('[checkVIP] VIP状态已同步到user_roles');
          } catch (e) {
            console.warn('[checkVIP] 同步VIP状态失败:', e);
          }
        }
      }
    }

    return {
      success: true,
      isVIP: isVIP,
      expireTime: expireTime ? expireTime.toISOString() : null,
      message: isVIP ? 'VIP有效' : 'VIP已过期或未开通'
    };
  } catch (error) {
    console.error('[vipManager] 检查VIP状态失败:', error);
    return {
      success: false,
      message: '检查VIP状态失败'
    };
  }
}

/**
 * 获取用户VIP详细状态
 * 🔄 优先检查user_roles集合，兼容users集合的vipExpireDate字段
 */
async function getVIPStatus(event) {
  const { openid } = event;

  if (!openid) {
    return {
      success: false,
      message: '参数缺失'
    };
  }

  try {
    const now = new Date();
    let isVIP = false;
    let expireTime = null;

    // 1️⃣ 优先检查user_roles集合
    const roleResult = await db.collection('user_roles')
      .where({ openid })
      .get();

    if (roleResult.data.length > 0) {
      const userRole = roleResult.data[0];
      expireTime = userRole.vip_expire_time ? new Date(userRole.vip_expire_time) : null;
      isVIP = userRole.is_vip === true && expireTime && expireTime > now;
    }

    // 2️⃣ 如果user_roles中没有VIP，检查users集合
    if (!isVIP) {
      const userResult = await db.collection('users')
        .where({ openid })
        .get();

      if (userResult.data.length > 0) {
        const user = userResult.data[0];
        const vipExpireDate = user.vipExpireDate ? new Date(user.vipExpireDate) : null;

        if (vipExpireDate && vipExpireDate > now) {
          isVIP = true;
          expireTime = vipExpireDate;
        }
      }
    }

    let remainingDays = 0;
    if (isVIP && expireTime) {
      remainingDays = Math.ceil((expireTime - now) / (1000 * 60 * 60 * 24));
    }

    return {
      success: true,
      data: {
        isVIP,
        expireTime: expireTime ? expireTime.toISOString() : null,
        remainingDays
      }
    };
  } catch (error) {
    console.error('[vipManager] 获取VIP状态失败:', error);
    return {
      success: false,
      message: '获取VIP状态失败'
    };
  }
}

/**
 * 生成订单号
 */
function generateOrderNo() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `VIP${timestamp}${random}`;
}

/**
 * 生成随机字符串
 */
function generateNonceStr() {
  return Math.random().toString(36).substr(2, 15);
}
