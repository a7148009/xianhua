// pages/admin/partner-stats/partner-stats.js
Page({
  data: {
    pageId: null,
    pageInfo: {},
    memberStats: {
      total_members: 0,
      pending_members: 0,
      available_slots: 0
    },
    articleStats: {
      total_articles: 0,
      partner_articles: 0,
      paid_articles: 0,
      total_views: 0,
      total_shares: 0,
      total_likes: 0
    },
    topPromoters: []
  },

  onLoad(options) {
    if (options.pageId) {
      this.setData({ pageId: options.pageId });
      this.loadStats();
    }
  },

  onPullDownRefresh() {
    this.loadStats().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageStats',
          pageId: this.data.pageId
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const { page_info, member_stats, article_stats, top_promoters } = result.result.data;

        this.setData({
          pageInfo: page_info,
          memberStats: member_stats,
          articleStats: article_stats,
          topPromoters: top_promoters
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载统计数据失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  }
});
