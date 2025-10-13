// pages/order-detail/order-detail.js
Page({
  data: {
    order_no: '',
    order: null,
    loading: true
  },

  onLoad(options) {
    console.log('📋 订单详情页面加载:', options);

    if (options.order_no) {
      this.setData({ order_no: options.order_no });
      this.loadOrderDetail();
    } else {
      wx.showToast({
        title: '缺少订单号',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 加载订单详情
   */
  async loadOrderDetail() {
    try {
      this.setData({ loading: true });

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'getOrderDetail',
          order_no: this.data.order_no
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          order: result.result.data,
          loading: false
        });

        console.log('✅ 订单详情加载成功:', result.result.data);
      } else {
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: result.result?.message || '无法加载订单详情',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      }
    } catch (error) {
      console.error('❌ 加载订单详情失败:', error);
      this.setData({ loading: false });
      wx.showModal({
        title: '加载失败',
        content: '网络错误，请稍后重试',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  /**
   * 复制订单号
   */
  copyOrderNo() {
    if (!this.data.order) return;

    wx.setClipboardData({
      data: this.data.order.order_no,
      success: () => {
        wx.showToast({
          title: '订单号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 复制交易号
   */
  copyTransactionId() {
    if (!this.data.order) return;

    wx.setClipboardData({
      data: this.data.order.transaction_id,
      success: () => {
        wx.showToast({
          title: '交易号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 联系客服
   */
  contactService() {
    wx.makePhoneCall({
      phoneNumber: '400-123-4567',
      success: () => {
        console.log('拨打客服电话成功');
      },
      fail: () => {
        wx.showModal({
          title: '客服电话',
          content: '400-123-4567\n\n工作时间：9:00-18:00\n\n如需咨询订单问题，请提供订单号：' + this.data.order.order_no,
          showCancel: false,
          confirmText: '我知道了'
        });
      }
    });
  },

  /**
   * 返回订单列表
   */
  navigateToOrders() {
    wx.navigateBack();
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新订单详情');
    this.loadOrderDetail();
    wx.stopPullDownRefresh();
  }
});
