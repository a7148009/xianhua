// pages/admin/partner-detail/partner-detail.js
Page({
  data: {
    pageId: null,
    pageInfo: {},
    currentTab: 'active',
    members: [],
    pendingCount: 0,
    pendingArticles: [],
    articlePendingCount: 0,
    loading: false
  },

  onLoad(options) {
    if (options.pageId) {
      this.setData({ pageId: options.pageId });
      this.loadPageInfo();
      this.loadMembers();
    }
  },

  onShow() {
    if (this.data.pageId) {
      this.loadMembers();
    }
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadPageInfo(),
      this.loadMembers()
    ]).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载页面信息
   */
  async loadPageInfo() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageDetail',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          pageInfo: result.result.data
        });
      }
    } catch (error) {
      console.error('加载页面信息失败:', error);
    }
  },

  /**
   * 切换Tab
   */
  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ currentTab: tab });

    if (tab === 'articles') {
      this.loadPendingArticles();
    } else {
      this.loadMembers();
    }
  },

  /**
   * 加载成员列表
   */
  async loadMembers() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageMembers',
          pageId: this.data.pageId,
          joinStatus: this.data.currentTab,
          page: 1,
          limit: 100
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          members: result.result.data,
          loading: false
        });

        // 如果当前是活跃成员tab，获取待审核数量
        if (this.data.currentTab === 'active') {
          this.loadPendingCount();
        }
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载成员列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 加载待审核数量
   */
  async loadPendingCount() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerMemberManager',
        data: {
          action: 'getPendingApplications',
          pageId: this.data.pageId,
          page: 1,
          limit: 1
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          pendingCount: result.result.pagination.total
        });
      }
    } catch (error) {
      console.error('加载待审核数量失败:', error);
    }

    // 同时加载文章待审核数量
    this.loadArticlePendingCount();
  },

  /**
   * 加载文章待审核数量
   */
  async loadArticlePendingCount() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'getPendingArticles',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        // 只统计 pending 状态的文章
        const pendingCount = result.result.data.filter(a => a.review_status === 'pending').length;
        this.setData({
          articlePendingCount: pendingCount
        });
      }
    } catch (error) {
      console.error('加载文章待审核数量失败:', error);
    }
  },

  /**
   * 通过申请
   */
  async approveMember(e) {
    const { member } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认通过',
      content: `确定通过"${member.user_info.nickName || '未知用户'}"的申请吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'approveApplication',
                pageId: this.data.pageId,
                userId: member.user_id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已通过',
                icon: 'success'
              });
              this.loadMembers();
              this.loadPageInfo();
            } else {
              wx.showModal({
                title: '操作失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('通过申请失败:', error);
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
   * 拒绝申请
   */
  async rejectMember(e) {
    const { member } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认拒绝',
      content: `确定拒绝"${member.user_info.nickName || '未知用户'}"的申请吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'rejectApplication',
                pageId: this.data.pageId,
                userId: member.user_id,
                rejectReason: '管理员拒绝'
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已拒绝',
                icon: 'success'
              });
              this.loadMembers();
            } else {
              wx.showModal({
                title: '操作失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('拒绝申请失败:', error);
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
   * 移除成员
   */
  async removeMember(e) {
    const { member } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认移除',
      content: `确定移除成员"${member.user_info.nickName || '未知用户'}"吗？\n\n请确保该成员没有活跃的文章。`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'removeMember',
                pageId: this.data.pageId,
                userId: member.user_id,
                removeReason: '管理员移除'
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已移除',
                icon: 'success'
              });
              this.loadMembers();
              this.loadPageInfo();
            } else {
              wx.showModal({
                title: '操作失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('移除成员失败:', error);
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
   * 加载待审核文章
   */
  async loadPendingArticles() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'getPendingArticles',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          pendingArticles: result.result.data,
          articlePendingCount: result.result.data.length,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载待审核文章失败:', error);
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
  viewArticleDetail(e) {
    const { article } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/admin/article-review/article-review?articleId=${article._id}`
    });
  }
});
