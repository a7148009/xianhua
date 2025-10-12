// pages/admin/system-settings.js
Page({
  data: {
    currentUser: null,
    systemInfo: {
      version: '2.0.0',
      buildDate: '2025-01-06',
      environment: '云开发'
    },
    // TabBar 数据
    tabBarSelected: 1, // 系统设置页面是第2个tab，索引为1
    tabBarColor: "#8a8a8a",
    tabBarSelectedColor: "#FF6B35",
    tabBarList: [
      {
        pagePath: "/pages/admin/user-management/user-management",
        text: "用户管理",
        emoji: "👥",
        selectedEmoji: "👥"
      },
      {
        pagePath: "/pages/admin/system-settings/system-settings",
        text: "系统设置",
        emoji: "⚙️",
        selectedEmoji: "⚙️"
      }
    ]
  },

  onLoad() {
    this.getCurrentUser();
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.role === 'admin') {
        this.setData({ currentUser: userInfo });
      } else {
        wx.showModal({
          title: '权限不足',
          content: '您没有访问此页面的权限',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  },

  /**
   * 菜单项点击
   */
  onMenuTap(e) {
    const { action } = e.currentTarget.dataset;

    switch (action) {
      case 'initSystemConfig':
        // 初始化系统配置
        this.initSystemConfig();
        break;
      case 'areaManagement':
        // 跳转到行政区域管理页面
        wx.navigateTo({
          url: '/pages/admin/area-management/area-management'
        });
        break;
      case 'categoryManagement':
        // 跳转到信息分类管理页面
        wx.navigateTo({
          url: '/pages/admin/category-management/category-management'
        });
        break;
      case 'tagManagement':
        // 跳转到标签管理页面
        wx.navigateTo({
          url: '/pages/admin/tag-management/tag-management'
        });
        break;
      case 'priceUnitManagement':
        // 跳转到价格单位管理页面
        wx.navigateTo({
          url: '/pages/admin/price-unit-management/price-unit-management'
        });
        break;
      default:
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
    }
  },

  /**
   * 初始化系统配置
   */
  async initSystemConfig() {
    wx.showModal({
      title: '初始化系统配置',
      content: '将创建system_config集合并导入默认的区域和分类数据。如果已存在数据将跳过。确认继续？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '初始化中...' });

            const result = await wx.cloud.callFunction({
              name: 'initDatabase',
              data: {
                action: 'initSystemConfig'
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              const details = result.result.details.join('\n');
              wx.showModal({
                title: '初始化成功',
                content: details,
                showCancel: false
              });
            } else {
              wx.showModal({
                title: '初始化失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 初始化失败:', error);
            wx.showModal({
              title: '初始化失败',
              content: error.message || '请检查云函数是否已部署',
              showCancel: false
            });
          }
        }
      }
    });
  },

  /**
   * TabBar 切换
   */
  switchTab(e) {
    const data = e.currentTarget.dataset;
    const url = data.path;
    const index = data.index;

    // 如果点击的是当前页面，不进行跳转
    if (index === this.data.tabBarSelected) {
      return;
    }

    // 立即更新选中状态，提供即时视觉反馈
    this.setData({ tabBarSelected: index });

    // 使用 redirectTo 进行页面跳转
    wx.redirectTo({
      url,
      fail: (err) => {
        console.error('页面跳转失败:', err);
        // 恢复原来的选中状态
        this.setData({ tabBarSelected: 1 });
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  }
});