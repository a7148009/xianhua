const { cloudInitializer } = require('./utils/cloud-init.js');
const { logEnvConfig } = require('./utils/env-config.js');

App({
  globalData: {
    userInfo: null,
    userRole: 'user', // 用户角色: admin, publisher, user, vip
    hasCloudAccess: false
  },

  async onLaunch() {
    console.log('[App] 小程序启动');

    // 输出环境配置信息
    logEnvConfig();

    // 初始化云开发
    try {
      const result = await cloudInitializer.init();
      if (result.success) {
        console.log('[App] 云开发初始化成功');
        this.globalData.hasCloudAccess = true;
      } else {
        console.error('[App] 云开发初始化失败:', result.message);
        this.globalData.hasCloudAccess = false;
      }
    } catch (error) {
      console.error('[App] 云开发初始化异常:', error);
      this.globalData.hasCloudAccess = false;
    }
  },

  onShow() {
    console.log('[App] 小程序显示');
  },

  onHide() {
    console.log('[App] 小程序隐藏');
  },

  onError(error) {
    console.error('[App] 小程序错误:', error);
  }
})
