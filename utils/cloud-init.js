const { getCloudEnvId } = require('./env-config.js');

class CloudInitializer {
  constructor() {
    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.isInitialized) {
      return { success: true, message: '云开发环境已初始化' };
    }

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  async _doInit() {
    try {
      console.log('[cloud-init] 开始初始化云开发环境');

      if (!wx.cloud) {
        throw new Error('微信云开发不可用，请在开发者工具中开启云开发能力');
      }

      // ⚠️ 必须先用一个临时环境ID初始化，才能调用云函数
      // 这个ID仅用于初始化wx.cloud，后续会被服务端配置覆盖
      const tempEnvId = 'cloud1-0gstm235d0aa46bb';

      wx.cloud.init({
        env: tempEnvId,
        traceUser: true
      });

      console.log('[cloud-init] 临时初始化完成，准备获取服务端配置');

      // 从服务端获取真实的环境配置（必须成功）
      const envId = await getCloudEnvId();

      if (!envId) {
        throw new Error('服务端配置获取失败：未返回有效的环境ID');
      }

      // 使用服务端返回的环境ID重新初始化
      if (envId !== tempEnvId) {
        console.log('[cloud-init] 使用服务端配置，重新初始化云环境');
        wx.cloud.init({
          env: envId,
          traceUser: true
        });
      }

      this.isInitialized = true;
      this.initPromise = null;

      console.log('[cloud-init] 云开发环境初始化成功');
      return {
        success: true,
        message: '云开发环境初始化成功',
        envId: envId
      };
    } catch (error) {
      console.error('[cloud-init] 云开发环境初始化失败:', error);
      this.initPromise = null;
      return {
        success: false,
        message: '云开发环境初始化失败: ' + (error && error.message ? error.message : error),
        error
      };
    }
  }

  isReady() {
    return this.isInitialized;
  }

  reset() {
    this.isInitialized = false;
    this.initPromise = null;
  }
}

const cloudInitializer = new CloudInitializer();

module.exports = {
  cloudInitializer,
  CloudInitializer
};
