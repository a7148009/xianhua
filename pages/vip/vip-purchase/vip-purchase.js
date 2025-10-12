// pages/vip/vip-purchase/vip-purchase.js
const cloudAPI = require('../../../api/cloud-api.js');

Page({
  data: {
    // VIP特权列表
    privileges: [
      {
        icon: '🌟',
        title: '查看VIP专属鲜花信息',
        description: '优先查看高端优质鲜花资源，获取更多商机'
      },
      {
        icon: '📞',
        title: '获取VIP商家联系方式',
        description: '直接拨打电话联系商家，无需等待'
      },
      {
        icon: '🎯',
        title: '优先查看高端鲜花资源',
        description: '第一时间获取最新最优质的鲜花信息'
      },
      {
        icon: '👨‍💼',
        title: '专属客服一对一服务',
        description: '遇到问题随时咨询，专业客服快速响应'
      },
      {
        icon: '💎',
        title: '每日推荐精选信息',
        description: '根据您的需求智能推荐合适的鲜花信息'
      }
    ],

    // VIP套餐列表（从云端配置加载）
    plans: [],

    // 当前选中的套餐ID
    selectedPlan: '',

    // 当前选中套餐的价格
    selectedPlanPrice: 0,

    // 用户信息
    userInfo: null
  },

  async onLoad() {
    console.log('[vip-purchase] 页面加载');

    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.openid) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录后再购买VIP',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
            wx.navigateTo({
              url: '/pages/profile/profile'
            });
          } else {
            wx.navigateBack();
          }
        }
      });
      return;
    }

    this.setData({ userInfo });

    // 加载VIP套餐配置
    await this.loadVIPPlans();
  },

  /**
   * 加载VIP套餐配置
   */
  async loadVIPPlans() {
    try {
      wx.showLoading({ title: '加载中...' });

      // 调用云函数获取VIP套餐配置
      const result = await wx.cloud.callFunction({
        name: 'vipManager',
        data: {
          action: 'getPlans'
        }
      });

      if (result.result && result.result.success) {
        const plans = result.result.data || [];

        // 如果没有配置，使用默认套餐
        if (plans.length === 0) {
          plans.push(
            {
              id: '1month',
              duration: '1个月',
              unit: '月',
              price: 29.9,
              originalPrice: null,
              save: null,
              badge: null
            },
            {
              id: '3months',
              duration: '3个月',
              unit: '3个月',
              price: 79.9,
              originalPrice: 89.7,
              save: 9.8,
              badge: '推荐'
            },
            {
              id: '6months',
              duration: '6个月',
              unit: '6个月',
              price: 149.9,
              originalPrice: 179.4,
              save: 29.5,
              badge: '超值'
            },
            {
              id: '1year',
              duration: '1年',
              unit: '年',
              price: 269.9,
              originalPrice: 358.8,
              save: 88.9,
              badge: '最划算'
            }
          );
        }

        // 默认选中第二个套餐（推荐套餐）
        const defaultPlan = plans[1] || plans[0];
        this.setData({
          plans,
          selectedPlan: defaultPlan.id,
          selectedPlanPrice: defaultPlan.price
        });

        console.log('[vip-purchase] VIP套餐加载成功:', plans);
      } else {
        throw new Error(result.result?.message || '加载套餐失败');
      }
    } catch (error) {
      console.error('[vip-purchase] 加载VIP套餐失败:', error);
      wx.showToast({
        title: '加载套餐失败',
        icon: 'none'
      });

      // 使用默认套餐
      const defaultPlans = [
        {
          id: '1month',
          duration: '1个月',
          unit: '月',
          price: 29.9,
          originalPrice: null,
          save: null,
          badge: null
        },
        {
          id: '3months',
          duration: '3个月',
          unit: '3个月',
          price: 79.9,
          originalPrice: 89.7,
          save: 9.8,
          badge: '推荐'
        },
        {
          id: '6months',
          duration: '6个月',
          unit: '6个月',
          price: 149.9,
          originalPrice: 179.4,
          save: 29.5,
          badge: '超值'
        },
        {
          id: '1year',
          duration: '1年',
          unit: '年',
          price: 269.9,
          originalPrice: 358.8,
          save: 88.9,
          badge: '最划算'
        }
      ];

      this.setData({
        plans: defaultPlans,
        selectedPlan: '3months',
        selectedPlanPrice: 79.9
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 选择套餐
   */
  onSelectPlan(e) {
    const planId = e.currentTarget.dataset.id;
    const selectedPlan = this.data.plans.find(p => p.id === planId);

    if (selectedPlan) {
      this.setData({
        selectedPlan: planId,
        selectedPlanPrice: selectedPlan.price
      });
      console.log('[vip-purchase] 选择套餐:', selectedPlan);
    }
  },

  /**
   * 购买VIP
   */
  async onPurchase() {
    if (!this.data.selectedPlan) {
      wx.showToast({
        title: '请选择套餐',
        icon: 'none'
      });
      return;
    }

    const selectedPlan = this.data.plans.find(p => p.id === this.data.selectedPlan);
    if (!selectedPlan) {
      wx.showToast({
        title: '套餐信息错误',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '正在创建订单...' });

      // 调用云函数创建支付订单
      const result = await wx.cloud.callFunction({
        name: 'vipManager',
        data: {
          action: 'createOrder',
          openid: this.data.userInfo.openid,
          planId: selectedPlan.id,
          planDuration: selectedPlan.duration,
          price: selectedPlan.price
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const paymentData = result.result.data;

        // 调用微信支付
        wx.requestPayment({
          timeStamp: paymentData.timeStamp,
          nonceStr: paymentData.nonceStr,
          package: paymentData.package,
          signType: 'RSA',
          paySign: paymentData.paySign,
          success: (res) => {
            console.log('[vip-purchase] 支付成功:', res);
            wx.showModal({
              title: '支付成功',
              content: 'VIP会员已开通，立即生效！',
              showCancel: false,
              success: () => {
                // 返回上一页
                wx.navigateBack();
              }
            });
          },
          fail: (error) => {
            console.error('[vip-purchase] 支付失败:', error);
            if (error.errMsg.includes('cancel')) {
              wx.showToast({
                title: '已取消支付',
                icon: 'none'
              });
            } else {
              wx.showToast({
                title: '支付失败',
                icon: 'none'
              });
            }
          }
        });
      } else {
        throw new Error(result.result?.message || '创建订单失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[vip-purchase] 购买VIP失败:', error);
      wx.showToast({
        title: error.message || '购买失败',
        icon: 'none'
      });
    }
  }
});
