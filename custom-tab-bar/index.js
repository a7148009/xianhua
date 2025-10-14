const variableManager = require('../utils/variable-manager.js');

Component({
  data: {
    selected: 0,
    color: "#8a8a8a",
    selectedColor: "#FF6B35",
    backgroundColor: "#ffffff",
    list: [
      {
        pagePath: "/pages/index/index",
        text: "找鲜花",
        emoji: "🔍",
        selectedEmoji: "🔍"
      },
      {
        pagePath: "/pages/publish/publish",
        text: "发布",
        emoji: "📝",
        selectedEmoji: "📝"
      },
      {
        pagePath: "/pages/subscribe/subscribe",
        text: "订阅",
        emoji: "🔔",
        selectedEmoji: "🔔"
      },
      {
        pagePath: "/pages/message/message",
        text: "更多",
        emoji: "📋",
        selectedEmoji: "📋"
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        emoji: "👤",
        selectedEmoji: "👤"
      }
    ]
  },

  attached() {
    // 加载变量配置
    this.loadVariables();
    // 获取当前页面路径并设置选中状态
    const pages = getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      const route = currentPage.route;
      const selected = this.data.list.findIndex(item =>
        item.pagePath === `/${route}`
      );
      if (selected !== -1) {
        this.setData({ selected });
      }
    }
  },

  methods: {
    /**
     * 加载变量配置
     */
    async loadVariables() {
      try {
        const variables = await variableManager.getAllVariables();
        const homeTabName = variables.home_tab_name || '找鲜花';
        const moreTabName = variables.more_tab_name || '更多';

        // 更新tab的文本
        const list = this.data.list;
        list[0].text = homeTabName;  // 首页tab
        list[3].text = moreTabName;  // 更多tab

        this.setData({ list });

        console.log('✅ [变量] TabBar变量加载成功');
      } catch (error) {
        console.error('❌ [变量] 加载TabBar变量失败:', error);
        // 静默失败，使用默认值
      }
    },

    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = data.index;

      // 检查是否需要登录
      if (index > 0) { // 除了"找工作"外都需要登录
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo || !userInfo.openid) {
          wx.navigateTo({
            url: '/pages/login/login'
          });
          return;
        }
      }

      // 立即更新选中状态，提供即时视觉反馈
      this.setData({ selected: index });

      // 执行页面切换
      wx.switchTab({
        url,
        success: () => {
          // 切换成功后再次确认状态
          this.setData({ selected: index });
        },
        fail: () => {
          // 如果切换失败，恢复之前的状态
          const pages = getCurrentPages();
          if (pages.length > 0) {
            const currentPage = pages[pages.length - 1];
            const route = currentPage.route;
            const currentSelected = this.data.list.findIndex(item =>
              item.pagePath === `/${route}`
            );
            if (currentSelected !== -1) {
              this.setData({ selected: currentSelected });
            }
          }
        }
      });
    }
  }
});
