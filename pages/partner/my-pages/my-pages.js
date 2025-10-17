// pages/partner/my-pages/my-pages.js
Page({
  data: {
    pages: [],
    totalArticles: 0,
    loading: false
  },

  onLoad() {
    this.loadMyPages();
  },

  onShow() {
    this.loadMyPages();
  },

  onPullDownRefresh() {
    this.loadMyPages().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载我的页面
   */
  async loadMyPages() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getMyPages',
          page: 1,
          limit: 100
        }
      });

      if (result.result && result.result.success) {
        const pages = result.result.data;

        // 计算总发布文章数
        let totalArticles = 0;
        pages.forEach(page => {
          totalArticles += page.my_published_count || 0;
        });

        this.setData({
          pages: pages,
          totalArticles: totalArticles,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载我的页面失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 查看页面详情（跳转到文章列表）
   */
  viewPageDetail(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/article-list/article-list?pageId=${page._id}`
    });
  },

  /**
   * 发布文章
   */
  publishArticle(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/publish/publish?pageId=${page._id}`
    });
  },

  /**
   * 退出页面
   */
  async quitPage(e) {
    const { page } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认退出',
      content: `确定要退出"${page.page_name}"吗？\n\n退出后您将无法在该页面发布文章。请确保没有活跃的文章。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '退出中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'quitPage',
                pageId: page._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已退出页面',
                icon: 'success'
              });
              this.loadMyPages();
            } else {
              wx.showModal({
                title: '退出失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('退出页面失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '退出失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 浏览合作页面
   */
  browsePage() {
    wx.navigateTo({
      url: '/pages/partner/list/list'
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
    return `加入于 ${year}-${month}-${day}`;
  }
});
