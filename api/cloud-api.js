const { cloudInitializer } = require("../utils/cloud-init.js");

class CloudAPI {
  constructor() {
    this.cache = new Map();
    this.shortCache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 分钟
    this.shortCacheTimeout = 30 * 1000; // 30 秒
  }

  _getCacheKey(method, params) {
    return `${method}_${JSON.stringify(params || {})}`;
  }

  _isCacheValid(cacheKey, useShortCache) {
    const store = useShortCache ? this.shortCache : this.cache;
    const timeout = useShortCache ? this.shortCacheTimeout : this.cacheTimeout;
    const cached = store.get(cacheKey);
    if (!cached) return false;
    return Date.now() - cached.timestamp < timeout;
  }

  _getCached(cacheKey, useShortCache) {
    const store = useShortCache ? this.shortCache : this.cache;
    const cached = store.get(cacheKey);
    return cached ? cached.data : null;
  }

  _setCache(cacheKey, data, useShortCache) {
    const store = useShortCache ? this.shortCache : this.cache;
    store.set(cacheKey, { data, timestamp: Date.now() });

    const maxSize = useShortCache ? 50 : 100;
    if (store.size > maxSize) {
      const firstKey = store.keys().next().value;
      store.delete(firstKey);
    }
  }

  clearCache() {
    this.cache.clear();
    this.shortCache.clear();
  }

  async ensureCloudInit() {
    const result = await cloudInitializer.init();
    if (!result.success) {
      throw new Error(result.message || '云开发初始化失败');
    }
  }

  async callFunction(name, data = {}) {
    await this.ensureCloudInit();
    const res = await wx.cloud.callFunction({ name, data });
    if (res && res.errMsg === 'cloud.callFunction:ok') {
      return res.result;
    }
    throw new Error(res && res.errMsg ? res.errMsg : '云函数调用失败');
  }

  async getItemList(params = {}) {
    const cacheKey = this._getCacheKey('getItemList', params);

    if (this._isCacheValid(cacheKey, true)) {
      return this._getCached(cacheKey, true);
    }
    if (this._isCacheValid(cacheKey, false)) {
      return this._getCached(cacheKey, false);
    }

    try {
      const result = await this.callFunction('getFlowerList', params);
      this._setCache(cacheKey, result, true);
      this._setCache(cacheKey, result, false);
      return result;
    } catch (err) {
      console.error('[cloud-api] getItemList error:', err);
      return {
        success: false,
        message: err.message || '加载失败',
        data: []
      };
    }
  }

  async getItemDetail(hashId) {
    try {
      return await this.callFunction('getFlowerDetail', { hash_id: hashId });
    } catch (err) {
      console.error('[cloud-api] getItemDetail error:', err);
      return {
        success: false,
        message: err.message || '加载失败'
      };
    }
  }

  async increaseViewCount(hashId) {
    try {
      return await this.callFunction('increaseViewCount', { hash_id: hashId });
    } catch (err) {
      console.error('[cloud-api] increaseViewCount error:', err);
      return {
        success: false,
        message: err.message || '操作失败'
      };
    }
  }

  async getItemCount(params = {}) {
    const result = await this.getItemList({ ...params, page: 1, limit: 1 });
    return result && result.total ? result.total : 0;
  }

  async userLogin(data) {
    try {
      return await this.callFunction('userLogin', data);
    } catch (err) {
      console.error('[cloud-api] userLogin error:', err);
      return {
        success: false,
        message: err.message || '登录失败，请重试'
      };
    }
  }

  async avatarManager(data) {
    try {
      return await this.callFunction('avatarManager', data);
    } catch (err) {
      console.error('[cloud-api] avatarManager error:', err);
      return {
        success: false,
        message: err.message || '头像处理失败，请重试'
      };
    }
  }

  async databaseFix(data = {}) {
    try {
      return await this.callFunction('databaseFix', data);
    } catch (err) {
      console.error('[cloud-api] databaseFix error:', err);
      return {
        success: false,
        message: err.message || '修复失败'
      };
    }
  }

  async userRoleManager(data = {}) {
    try {
      return await this.callFunction('userRoleManager', data);
    } catch (err) {
      console.error('[cloud-api] userRoleManager error:', err);
      return {
        success: false,
        message: err.message || '操作失败'
      };
    }
  }
}

module.exports = new CloudAPI();
