// pages/admin/article-review/article-review.js
Page({
  data: {
    articleId: null,
    article: null,
    loading: false
  },

  onLoad(options) {
    if (options.articleId) {
      this.setData({ articleId: options.articleId });
      this.loadArticle();
    }
  },

  /**
   * 加载文章详情
   */
  async loadArticle() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'getArticleById',
          articleId: this.data.articleId
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          article: result.result.data,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载文章失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  /**
   * 通过审核
   */
  async approveArticle() {
    wx.showModal({
      title: '确认通过',
      content: '确定通过这篇文章的审核吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerArticleManager',
              data: {
                action: 'approveArticle',
                articleId: this.data.articleId
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '审核通过',
                icon: 'success'
              });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showModal({
                title: '操作失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('审核失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 拒绝审核
   */
  async rejectArticle() {
    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝这篇文章的审核吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerArticleManager',
              data: {
                action: 'rejectArticle',
                articleId: this.data.articleId,
                rejectReason: '管理员拒绝'
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已拒绝',
                icon: 'success'
              });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showModal({
                title: '操作失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('拒绝失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
