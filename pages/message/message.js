Page({
  data: {
    infoList: [],
    loading: false,
    hasMore: true,
    currentPage: 1,
    totalCount: 0
  },

  onLoad() {
    // 加载数据
    this.loadMoreInfo();
  },

  onShow() {
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  /**
   * 加载更多信息列表
   */
  async loadMoreInfo(refresh = false) {
    if (this.data.loading) return;
    if (!refresh && !this.data.hasMore) return;

    this.setData({ loading: true });

    try {
      if (refresh) {
        this.setData({
          currentPage: 1,
          infoList: [],
          hasMore: true
        });
      }

      const result = await wx.cloud.callFunction({
        name: 'moreInfoManager',
        data: {
          action: 'getList',
          page: this.data.currentPage,
          limit: 50
        }
      });

      if (result.result && result.result.success) {
        const newList = result.result.data || [];

        const updatedList = refresh
          ? newList
          : [...this.data.infoList, ...newList];

        this.setData({
          infoList: updatedList,
          totalCount: result.result.total || 0,
          hasMore: updatedList.length < result.result.total,
          currentPage: this.data.currentPage + 1
        });
      } else {
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.loadMoreInfo(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    this.loadMoreInfo();
  }
});
