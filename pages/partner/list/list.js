// pages/partner/list/list.js
Page({
  data: {
    pages: [],
    searchKeyword: '',
    loading: false
  },

  onLoad() {
    this.loadPages();
  },

  onShow() {
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
          action: 'getAllPages',
          page: 1,
          limit: 100
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          pages: result.result.data,
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
   * 搜索输入
   */
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });
    // 简单的前端过滤
    // 可以改为调用云函数进行后端搜索
  },

  /**
   * 查看页面详情
   */
  viewPageDetail(e) {
    const { page } = e.currentTarget.dataset;
    // 如果已加入，跳转到文章列表
    // 如果未加入，显示页面介绍
    wx.showToast({
      title: '页面详情开发中',
      icon: 'none'
    });
  },

  /**
   * 申请加入
   */
  async applyToJoin(e) {
    const { page } = e.currentTarget.dataset;

    wx.showModal({
      title: '申请加入',
      content: `确定要申请加入"${page.page_name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '申请中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'applyToJoin',
                pageId: page._id,
                applyReason: ''
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              const autoApproved = result.result.data.auto_approved;
              wx.showToast({
                title: autoApproved ? '加入成功' : '申请已提交',
                icon: 'success'
              });
              this.loadPages();
            } else {
              wx.showModal({
                title: '申请失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('申请加入失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '申请失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 取消申请
   */
  async cancelApplication(e) {
    const { page } = e.currentTarget.dataset;

    wx.showModal({
      title: '取消申请',
      content: `确定要取消加入"${page.page_name}"的申请吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '取消中...' });

            const result = await wx.cloud.callFunction({
              name: 'partnerMemberManager',
              data: {
                action: 'cancelApplication',
                pageId: page._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '已取消申请',
                icon: 'success'
              });
              this.loadPages();
            } else {
              wx.showModal({
                title: '取消失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('取消申请失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '取消失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 查看我的页面
   */
  viewMyPage(e) {
    const { page } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/my-pages/my-pages?pageId=${page._id}`
    });
  }
});
