// pages/admin/order-management.js
Page({
  data: {
    pageTitle: '订单管理',
    filterOpenid: '', // 从用户管理页面传入的openid筛选
    filterNickname: '', // 从用户管理页面传入的昵称

    // 统计数据
    stats: {
      totalOrders: 0,
      todayOrders: 0,
      totalRevenue: '0.00'
    },

    // 筛选
    dateFilter: 'all', // all, today, week, month
    searchKeyword: '',

    // 订单列表
    orderList: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,

    // 延长VIP弹窗
    showExtendModal: false,
    selectedOrder: null,
    extendDays: '',

    // 退款弹窗
    showRefundModal: false,
    refundReason: ''
  },

  onLoad(options) {
    console.log('[订单管理] 页面加载', options);

    // 检查是否从用户管理页面跳转过来（带有openid参数）
    if (options.openid) {
      const nickname = options.nickName ? decodeURIComponent(options.nickName) : '该用户';
      this.setData({
        filterOpenid: options.openid,
        filterNickname: nickname,
        pageTitle: `${nickname}的订单`
      });

      wx.setNavigationBarTitle({
        title: `${nickname}的订单`
      });
    }

    // 检查管理员权限
    this.checkAdminPermission();

    // 加载数据
    this.loadOrderStats();
    this.loadOrderList(true);
  },

  /**
   * 检查管理员权限
   */
  checkAdminPermission() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showModal({
        title: '权限不足',
        content: '您没有访问此页面的权限',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  /**
   * 加载订单统计
   */
  async loadOrderStats() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'getOrderStats'
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          stats: {
            totalOrders: result.result.data.total_orders,
            todayOrders: result.result.data.today_orders,
            totalRevenue: result.result.data.total_revenue
          }
        });
      }
    } catch (error) {
      console.error('[订单管理] 加载统计失败:', error);
    }
  },

  /**
   * 加载订单列表
   */
  async loadOrderList(refresh = false) {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const page = refresh ? 1 : this.data.page;

      // 判断是搜索还是普通列表查询
      let requestData = {
        page,
        pageSize: this.data.pageSize
      };

      if (this.data.searchKeyword) {
        // 搜索模式
        requestData.action = 'searchOrders';
        requestData.keyword = this.data.searchKeyword;
      } else {
        // 普通列表模式
        requestData.action = 'getAllOrders';
        requestData.dateFilter = this.data.dateFilter;
      }

      console.log('[订单管理] 请求参数:', requestData);

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: requestData
      });

      console.log('[订单管理] 返回结果:', result.result);

      if (result.result && result.result.success) {
        const newOrders = result.result.data.orders;

        // 如果有openid筛选，过滤订单
        let filteredOrders = newOrders;
        if (this.data.filterOpenid) {
          filteredOrders = newOrders.filter(order => order.openid === this.data.filterOpenid);
        }

        const orderList = refresh ? filteredOrders : [...this.data.orderList, ...filteredOrders];

        this.setData({
          orderList,
          hasMore: result.result.data.page < result.result.data.totalPages,
          page: refresh ? 2 : this.data.page + 1
        });

        console.log('[订单管理] 订单列表已更新，共', orderList.length, '条');
      } else {
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('[订单管理] 加载列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 日期筛选切换
   */
  onDateFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    console.log('[订单管理] 切换筛选:', filter);

    this.setData({
      dateFilter: filter,
      searchKeyword: '', // 切换筛选时清空搜索
      page: 1,
      orderList: [],
      hasMore: true
    });

    this.loadOrderList(true);
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  /**
   * 执行搜索
   */
  onSearch() {
    console.log('[订单管理] 搜索:', this.data.searchKeyword);

    this.setData({
      page: 1,
      orderList: [],
      hasMore: true
    });

    this.loadOrderList(true);
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      page: 1,
      orderList: [],
      hasMore: true
    });

    this.loadOrderList(true);
  },

  /**
   * 查看订单详情
   */
  onOrderDetail(e) {
    const order = e.currentTarget.dataset.order;
    console.log('[订单管理] 查看详情:', order.order_no);

    wx.navigateTo({
      url: `/pages/order-detail/order-detail?order_no=${order.order_no}&from=admin`
    });
  },

  /**
   * 延长VIP
   */
  onExtendVIP(e) {
    const order = e.currentTarget.dataset.order;
    console.log('[订单管理] 延长VIP:', order.order_no);

    this.setData({
      selectedOrder: order,
      extendDays: '',
      showExtendModal: true
    });
  },

  /**
   * 延长天数输入
   */
  onExtendDaysInput(e) {
    this.setData({
      extendDays: e.detail.value
    });
  },

  /**
   * 取消延长
   */
  onCancelExtend() {
    this.setData({
      showExtendModal: false,
      selectedOrder: null,
      extendDays: ''
    });
  },

  /**
   * 确认延长VIP
   */
  async onConfirmExtend() {
    const days = parseInt(this.data.extendDays);

    if (!days || days <= 0) {
      wx.showToast({
        title: '请输入有效的天数',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '处理中...' });

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'extendVIP',
          order_no: this.data.selectedOrder.order_no,
          extend_days: days
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '延长成功',
          icon: 'success'
        });

        // 关闭弹窗
        this.onCancelExtend();

        // 刷新列表
        setTimeout(() => {
          this.loadOrderList(true);
          this.loadOrderStats();
        }, 1500);
      } else {
        wx.showModal({
          title: '延长失败',
          content: result.result?.message || '操作失败',
          showCancel: false
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[订单管理] 延长VIP失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  /**
   * 退款
   */
  onRefund(e) {
    const order = e.currentTarget.dataset.order;
    console.log('[订单管理] 退款:', order.order_no);

    this.setData({
      selectedOrder: order,
      refundReason: '',
      showRefundModal: true
    });
  },

  /**
   * 退款原因输入
   */
  onRefundReasonInput(e) {
    this.setData({
      refundReason: e.detail.value
    });
  },

  /**
   * 取消退款
   */
  onCancelRefund() {
    this.setData({
      showRefundModal: false,
      selectedOrder: null,
      refundReason: ''
    });
  },

  /**
   * 确认退款
   */
  async onConfirmRefund() {
    if (!this.data.refundReason || !this.data.refundReason.trim()) {
      wx.showToast({
        title: '请输入退款原因',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '处理中...' });

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'refundOrder',
          order_no: this.data.selectedOrder.order_no,
          refund_reason: this.data.refundReason
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '退款成功',
          icon: 'success'
        });

        // 关闭弹窗
        this.onCancelRefund();

        // 刷新列表
        setTimeout(() => {
          this.loadOrderList(true);
          this.loadOrderStats();
        }, 1500);
      } else {
        wx.showModal({
          title: '退款失败',
          content: result.result?.message || '操作失败',
          showCancel: false
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[订单管理] 退款失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await Promise.all([
      this.loadOrderStats(),
      this.loadOrderList(true)
    ]);
    wx.stopPullDownRefresh();
  },

  /**
   * 上拉加载更多
   */
  async onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      await this.loadOrderList();
    }
  }
});
