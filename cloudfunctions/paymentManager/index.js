// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

/**
 * paymentManager 云函数
 * 管理微信支付配置和订单处理
 */
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();

  console.log('[paymentManager] 接收请求:', { action, event });

  try {
    switch (action) {
      case 'getConfig':
        return await getConfig();
      case 'setConfig':
        return await setConfig(event);
      case 'createTestOrder':
        return await createTestOrder(event, wxContext);
      default:
        return {
          success: false,
          message: `未知的操作类型: ${action}`
        };
    }
  } catch (error) {
    console.error('[paymentManager] 错误:', error);
    return {
      success: false,
      message: error.message || '操作失败'
    };
  }
};

/**
 * 获取支付配置
 */
async function getConfig() {
  try {
    const result = await db.collection('system_config')
      .where({
        type: 'payment_config'
      })
      .limit(1)
      .get();

    if (result.data.length > 0) {
      const config = result.data[0];
      return {
        success: true,
        data: {
          mchId: config.mchId || '',
          subMchId: config.subMchId || '',
          apiKey: config.apiKey || '',
          certSerialNo: config.certSerialNo || '',
          paymentMode: config.paymentMode || 'normal',
          environment: config.environment || 'sandbox',
          enabled: config.enabled || false
        }
      };
    } else {
      return {
        success: true,
        data: {
          mchId: '',
          subMchId: '',
          apiKey: '',
          certSerialNo: '',
          paymentMode: 'normal',
          environment: 'sandbox',
          enabled: false
        }
      };
    }
  } catch (error) {
    console.error('[paymentManager] 获取支付配置失败:', error);
    return {
      success: false,
      message: '获取支付配置失败'
    };
  }
}

/**
 * 设置支付配置
 */
async function setConfig(event) {
  const { config } = event;

  if (!config) {
    return {
      success: false,
      message: '配置数据缺失'
    };
  }

  try {
    // 查找是否已存在配置
    const result = await db.collection('system_config')
      .where({
        type: 'payment_config'
      })
      .limit(1)
      .get();

    const configData = {
      type: 'payment_config',
      mchId: config.mchId,
      subMchId: config.subMchId,
      apiKey: config.apiKey,
      certSerialNo: config.certSerialNo,
      paymentMode: config.paymentMode,
      environment: config.environment,
      enabled: config.enabled,
      updated_at: new Date()
    };

    if (result.data.length > 0) {
      // 更新已有配置
      await db.collection('system_config')
        .doc(result.data[0]._id)
        .update({
          data: configData
        });
    } else {
      // 创建新配置
      await db.collection('system_config').add({
        data: {
          ...configData,
          created_at: new Date()
        }
      });
    }

    return {
      success: true,
      message: '支付配置保存成功'
    };
  } catch (error) {
    console.error('[paymentManager] 保存支付配置失败:', error);
    return {
      success: false,
      message: '保存支付配置失败'
    };
  }
}

/**
 * 创建测试订单
 */
async function createTestOrder(event, wxContext) {
  const { openid } = event;

  if (!openid) {
    return {
      success: false,
      message: '用户openid缺失'
    };
  }

  try {
    // 获取支付配置
    const configResult = await getConfig();
    if (!configResult.success || !configResult.data.enabled) {
      return {
        success: false,
        message: '支付功能未启用'
      };
    }

    const paymentConfig = configResult.data;

    // 生成订单号
    const orderNo = `TEST${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    // 创建订单记录
    const orderData = {
      order_no: orderNo,
      openid: openid,
      type: 'test',
      description: '测试订单',
      price: 0.01,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    };

    const orderAddResult = await db.collection('payment_orders').add({
      data: orderData
    });

    console.log('[paymentManager] 订单创建成功:', orderNo);
    console.log('[paymentManager] 支付配置:', {
      mchId: paymentConfig.mchId,
      paymentMode: paymentConfig.paymentMode,
      environment: paymentConfig.environment
    });

    // 调用微信支付统一下单
    try {
      const paymentResult = await cloud.cloudPay.unifiedOrder({
        body: '测试订单',
        outTradeNo: orderNo,
        totalFee: 1, // 单位：分，0.01元
        envId: cloud.DYNAMIC_CURRENT_ENV,
        functionName: 'paymentManager',
        subMchId: paymentConfig.paymentMode === 'service' ? paymentConfig.subMchId : undefined,
        nonceStr: generateNonceStr(),
        tradeType: 'JSAPI',
        openid: openid
      });

      console.log('[paymentManager] 统一下单成功:', paymentResult);

      // 验证返回数据
      if (!paymentResult || !paymentResult.timeStamp) {
        throw new Error('支付参数不完整，请检查商户配置');
      }

      return {
        success: true,
        data: {
          orderId: orderAddResult._id,
          orderNo: orderNo,
          timeStamp: paymentResult.timeStamp,
          nonceStr: paymentResult.nonceStr,
          package: paymentResult.package,
          signType: paymentResult.signType || 'RSA',
          paySign: paymentResult.paySign
        }
      };
    } catch (payError) {
      console.error('[paymentManager] 微信支付统一下单失败:', payError);

      // 返回详细错误信息
      let errorMsg = '调用微信支付失败';
      if (payError.errCode === -1) {
        errorMsg = '系统错误，请检查：\n1. 商户号是否正确\n2. API密钥是否正确\n3. 小程序APPID是否已关联商户号';
      } else if (payError.errMsg) {
        errorMsg = payError.errMsg;
      }

      return {
        success: false,
        message: errorMsg,
        error: {
          code: payError.errCode,
          message: payError.errMsg,
          detail: payError
        }
      };
    }
  } catch (error) {
    console.error('[paymentManager] 创建测试订单失败:', error);
    return {
      success: false,
      message: error.message || '创建测试订单失败',
      error: {
        message: error.message,
        stack: error.stack
      }
    };
  }
}

/**
 * 生成随机字符串
 */
function generateNonceStr() {
  return Math.random().toString(36).substr(2, 15);
}

/**
 * 支付回调处理
 */
exports.payCallback = async (event, context) => {
  console.log('[paymentManager] 支付回调:', event);

  try {
    const { outTradeNo, resultCode, totalFee } = event;

    if (resultCode === 'SUCCESS') {
      // 更新订单状态
      await db.collection('payment_orders')
        .where({
          order_no: outTradeNo
        })
        .update({
          data: {
            status: 'paid',
            paid_at: new Date(),
            updated_at: new Date()
          }
        });

      // 如果是VIP订单，更新用户VIP状态
      if (outTradeNo.startsWith('VIP')) {
        const orderResult = await db.collection('vip_orders')
          .where({
            order_no: outTradeNo
          })
          .get();

        if (orderResult.data.length > 0) {
          const order = orderResult.data[0];

          // 获取套餐信息
          const planResult = await db.collection('system_config')
            .doc(order.plan_id)
            .get();

          if (planResult.data) {
            const plan = planResult.data;
            const months = plan.months || 1;

            // 计算VIP到期时间
            const now = new Date();
            const expireTime = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);

            // 更新用户VIP状态
            const userRoleResult = await db.collection('user_roles')
              .where({
                openid: order.openid
              })
              .get();

            if (userRoleResult.data.length > 0) {
              // 更新已有记录
              await db.collection('user_roles')
                .doc(userRoleResult.data[0]._id)
                .update({
                  data: {
                    is_vip: true,
                    vip_expire_time: expireTime,
                    updated_at: new Date()
                  }
                });
            } else {
              // 创建新记录
              await db.collection('user_roles').add({
                data: {
                  openid: order.openid,
                  role: 'vip',
                  is_vip: true,
                  vip_expire_time: expireTime,
                  created_at: new Date(),
                  updated_at: new Date()
                }
              });
            }

            // 更新VIP订单状态
            await db.collection('vip_orders')
              .where({
                order_no: outTradeNo
              })
              .update({
                data: {
                  status: 'paid',
                  paid_at: new Date(),
                  updated_at: new Date()
                }
              });
          }
        }
      }

      return {
        errcode: 0,
        errmsg: 'success'
      };
    } else {
      console.error('[paymentManager] 支付失败:', event);
      return {
        errcode: -1,
        errmsg: 'payment failed'
      };
    }
  } catch (error) {
    console.error('[paymentManager] 支付回调处理失败:', error);
    return {
      errcode: -1,
      errmsg: error.message
    };
  }
};
