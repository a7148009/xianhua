// pages/my-orders/my-orders.js
Page({
  data: {
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'paid', label: '已支付' },
      { key: 'expired', label: '已过期' }
    ],
    currentTab: 'all',
    orders: [],
    loading: true,
    page: 1,
    pageSize: 20,
    hasMore: true
  },

  onLoad(options) {
    console.log('📋 我的订单页面加载');
    this.loadOrders();
  },

  /**
   * 加载订单列表
   */
  async loadOrders(isLoadMore = false) {
    try {
      if (!isLoadMore) {
        this.setData({ loading: true });
      }

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'getMyOrders',
          status: this.data.currentTab,
          page: this.data.page,
          pageSize: this.data.pageSize
        }
      });

      if (result.result && result.result.success) {
        const { orders, totalPages } = result.result.data;

        if (isLoadMore) {
          // 加载更多：追加到列表
          this.setData({
            orders: [...this.data.orders, ...orders],
            hasMore: this.data.page < totalPages,
            loading: false
          });
        } else {
          // 首次加载或切换tab：替换列表
          this.setData({
            orders,
            hasMore: this.data.page < totalPages,
            loading: false
          });
        }

        console.log('✅ 订单列表加载成功:', orders.length);
      } else {
        this.setData({ loading: false });
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载订单列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 切换标签
   */
  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    if (key === this.data.currentTab) return;

    console.log('🔄 切换标签:', key);
    this.setData({
      currentTab: key,
      page: 1,
      orders: [],
      hasMore: true
    });

    this.loadOrders();
  },

  /**
   * 查看订单详情
   */
  viewOrderDetail(e) {
    const { orderNo } = e.currentTarget.dataset;
    console.log('👁️ 查看订单详情:', orderNo);

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?order_no=${orderNo}`
    });
  },

  /**
   * 导航到购买VIP页面
   */
  navigateToBuyVIP() {
    wx.showToast({
      title: '购买VIP功能开发中',
      icon: 'none'
    });
  },

  /**
   * 加载更多
   */
  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;

    console.log('📄 加载更多订单');
    this.setData({
      page: this.data.page + 1
    });

    this.loadOrders(true);
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新订单列表');
    this.setData({
      page: 1,
      orders: [],
      hasMore: true
    });

    this.loadOrders();
    wx.stopPullDownRefresh();
  }
});
