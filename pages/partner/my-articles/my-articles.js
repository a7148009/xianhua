// pages/partner/my-articles/my-articles.js
Page({
  data: {
    articles: [],
    loading: false,
    currentTab: 'all', // all, pending, approved, rejected
    page: 1,
    limit: 20,
    hasMore: true
  },

  onLoad() {
    this.loadMyArticles(true);
  },

  onShow() {
    // 刷新数据（可能从发布页面返回）
    this.loadMyArticles(true);
  },

  onPullDownRefresh() {
    this.loadMyArticles(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadMyArticles(false);
    }
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab
    });
    this.loadMyArticles(true);
  },

  /**
   * 加载我的文章列表
   */
  async loadMyArticles(refresh = false) {
    if (refresh) {
      this.setData({
        page: 1,
        articles: [],
        hasMore: true
      });
    }

    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'getMyArticles',
          page: this.data.page,
          limit: this.data.limit
        }
      });

      if (result.result && result.result.success) {
        const articles = result.result.data || [];

        // 根据当前tab过滤文章（基于 review_status）
        const filteredArticles = articles.filter(article => {
          // 确保每篇文章都有 review_status（云函数已处理兼容性）
          const reviewStatus = article.review_status || 'pending';

          if (this.data.currentTab === 'all') {
            return true; // 显示所有文章
          } else if (this.data.currentTab === 'pending') {
            return reviewStatus === 'pending'; // 待审核
          } else if (this.data.currentTab === 'approved') {
            return reviewStatus === 'approved'; // 已通过
          } else if (this.data.currentTab === 'rejected') {
            return reviewStatus === 'rejected'; // 已拒绝
          }
          return true;
        });

        console.log(`[my-articles] 当前Tab: ${this.data.currentTab}, 过滤后文章数: ${filteredArticles.length}`);

        this.setData({
          articles: refresh ? filteredArticles : [...this.data.articles, ...filteredArticles],
          page: this.data.page + 1,
          hasMore: articles.length >= this.data.limit,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('❌ 加载我的文章失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 查看文章详情
   */
  viewArticle(e) {
    const { hashId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/article-detail/article-detail?hashId=${hashId}`
    });
  },

  /**
   * 编辑文章
   */
  editArticle(e) {
    const { article } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/publish/publish?mode=edit&hashId=${article.hash_id}`
    });
  },

  /**
   * 删除文章
   */
  async deleteArticle(e) {
    const { article } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除文章"${article.title}"吗？删除后无法恢复。`,
      confirmText: '删除',
      confirmColor: '#f74734',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerArticleManager',
              data: {
                action: 'delete',
                hashId: article.hash_id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              this.loadMyArticles(true);
            } else {
              throw new Error(result.result?.message || '删除失败');
            }
          } catch (error) {
            console.error('❌ 删除文章失败:', error);
            wx.hideLoading();
            wx.showModal({
              title: '删除失败',
              content: error.message || '删除文章失败',
              showCancel: false
            });
          }
        }
      }
    });
  },

  /**
   * 查看文章统计
   */
  viewStats(e) {
    const { hashId } = e.currentTarget.dataset;
    wx.showToast({
      title: '统计功能开发中',
      icon: 'none'
    });
  },

  /**
   * 发布新文章
   */
  publishNew() {
    wx.navigateTo({
      url: '/pages/partner/list/list'
    });
  }
});
