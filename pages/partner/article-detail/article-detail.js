// pages/partner/article-detail/article-detail.js
Page({
  data: {
    hashId: '',
    article: null,
    loading: true,
    isOwner: false,
    isVip: false,
    showContact: false,
    currentUserId: ''
  },

  onLoad(options) {
    const { hashId } = options;
    if (!hashId) {
      wx.showToast({
        title: '文章不存在',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({ hashId });
    this.loadArticle();
    this.checkVipStatus();
  },

  onPullDownRefresh() {
    this.loadArticle().then(() => {
      wx.stopPullDownRefresh();
    });
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
          action: 'getArticleDetail',
          hashId: this.data.hashId
        }
      });

      if (result.result && result.result.success) {
        const article = result.result.data;
        const userInfo = wx.getStorageSync('userInfo');
        const currentUserId = userInfo?.openid || '';
        const isOwner = article.user_id === currentUserId;

        this.setData({
          article,
          currentUserId,
          isOwner,
          loading: false
        });

        // 增加浏览量（非所有者）
        if (!isOwner) {
          this.increaseViewCount();
        }
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载文章详情失败:', error);
      this.setData({ loading: false });
      wx.showModal({
        title: '加载失败',
        content: error.message || '未知错误',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  /**
   * 检查VIP状态
   */
  async checkVipStatus() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (!userInfo) return;

      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'checkVipStatus'
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          isVip: result.result.data.isVip
        });
      }
    } catch (error) {
      console.error('检查VIP状态失败:', error);
    }
  },

  /**
   * 增加浏览量
   */
  async increaseViewCount() {
    try {
      await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'increaseViewCount',
          hashId: this.data.hashId
        }
      });
    } catch (error) {
      console.error('增加浏览量失败:', error);
    }
  },

  /**
   * 查看联系方式
   */
  viewContact() {
    if (!this.data.isVip) {
      wx.showModal({
        title: '需要VIP会员',
        content: '查看联系方式需要VIP会员权限，是否前往购买？',
        confirmText: '去购买',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/vip/vip-purchase/vip-purchase'
            });
          }
        }
      });
      return;
    }

    this.setData({
      showContact: !this.data.showContact
    });
  },

  /**
   * 复制联系方式
   */
  copyContact(e) {
    const { type, value } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({
          title: type === 'phone' ? '电话已复制' : '微信号已复制',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      urls: this.data.article.images,
      current: url
    });
  },

  /**
   * 点赞
   */
  async handleLike() {
    if (this.data.isOwner) {
      wx.showToast({
        title: '不能给自己点赞',
        icon: 'none'
      });
      return;
    }

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'likeArticle',
          hashId: this.data.hashId
        }
      });

      if (result.result && result.result.success) {
        const article = this.data.article;
        article.like_count = (article.like_count || 0) + 1;
        this.setData({ article });

        wx.showToast({
          title: '点赞成功',
          icon: 'success'
        });
      }
    } catch (error) {
      console.error('点赞失败:', error);
      wx.showToast({
        title: '点赞失败',
        icon: 'none'
      });
    }
  },

  /**
   * 分享
   */
  async handleShare() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'shareArticle',
          hashId: this.data.hashId
        }
      });

      if (result.result && result.result.success) {
        const article = this.data.article;
        article.share_count = (article.share_count || 0) + 1;
        this.setData({ article });
      }
    } catch (error) {
      console.error('分享统计失败:', error);
    }
  },

  /**
   * 编辑文章
   */
  editArticle() {
    wx.navigateTo({
      url: `/pages/partner/publish/publish?hashId=${this.data.hashId}&mode=edit`
    });
  },

  /**
   * 删除文章
   */
  deleteArticle() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这篇文章吗？删除后可在"已删除"列表中找回。',
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerArticleManager',
              data: {
                action: 'deleteArticle',
                hashId: this.data.hashId
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已删除',
                icon: 'success'
              });
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            } else {
              wx.showModal({
                title: '删除失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('删除文章失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 查看统计
   */
  viewStats() {
    wx.navigateTo({
      url: `/pages/partner/article-stats/article-stats?hashId=${this.data.hashId}`
    });
  },

  /**
   * 分享到聊天
   */
  onShareAppMessage() {
    this.handleShare();

    return {
      title: this.data.article?.title || '文章分享',
      path: `/pages/partner/article-detail/article-detail?hashId=${this.data.hashId}`,
      imageUrl: this.data.article?.images?.[0] || ''
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    this.handleShare();

    return {
      title: this.data.article?.title || '文章分享',
      query: `hashId=${this.data.hashId}`,
      imageUrl: this.data.article?.images?.[0] || ''
    };
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
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
});
