// pages/admin/partner-management/partner-management.js
Page({
  data: {
    pages: [],
    totalPages: 0,
    activePages: 0,
    totalMembers: 0,
    loading: false
  },

  onLoad() {
    this.loadPages();
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadPages();
  },

  onPullDownRefresh() {
    this.loadPages().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载页面列表
   */
  async loadPages() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageList',
          status: 'active',
          page: 1,
          limit: 100
        }
      });

      if (result.result && result.result.success) {
        const pages = result.result.data;

        // 计算统计数据
        let totalMembers = 0;
        pages.forEach(page => {
          totalMembers += page.member_count || 0;
        });

        this.setData({
          pages: pages,
          totalPages: pages.length,
          activePages: pages.filter(p => p.status === 'active').length,
          totalMembers: totalMembers,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载页面列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 跳转到创建页面
   */
  navigateToCreate() {
    wx.navigateTo({
      url: '/pages/admin/partner-edit/partner-edit'
    });
  },

  /**
   * 查看页面详情
   */
  viewPageDetail(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/partner-detail/partner-detail?pageId=${page._id}`
    });
  },

  /**
   * 编辑页面
   */
  editPage(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/partner-edit/partner-edit?pageId=${page._id}`
    });
  },

  /**
   * 价格管理
   */
  managePrices(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/sort-price-management/sort-price-management?pageId=${page._id}&pageName=${page.page_name}`
    });
  },

  /**
   * 查看统计
   */
  viewStats(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/partner-stats/partner-stats?pageId=${page._id}`
    });
  },

  /**
   * 删除页面
   */
  async deletePage(e) {
    const { page } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除页面"${page.page_name}"吗？\n\n删除前请确保页面没有活跃的成员和文章。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerPageManager',
              data: {
                action: 'deletePage',
                pageId: page._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              this.loadPages();
            } else {
              wx.showModal({
                title: '删除失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('删除页面失败:', error);
            wx.hideLoading();
            wx.showModal({
              title: '删除失败',
              content: error.message || '未知错误',
              showCancel: false
            });
          }
        }
      }
    });
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
});
