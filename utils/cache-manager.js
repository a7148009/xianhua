/**
 * 数据缓存管理器
 * 用于实现首页秒开和数据持久化
 */

const CACHE_KEYS = {
  INDEX_DATA: 'index_data_cache',
  INDEX_CONFIG: 'index_config_cache'
};

// 缓存有效期（毫秒）
const CACHE_EXPIRY = {
  INDEX_DATA: 5 * 60 * 1000,    // 列表数据：5分钟
  INDEX_CONFIG: 30 * 60 * 1000   // 配置数据：30分钟
};

class CacheManager {

  /**
   * 保存首页列表数据到缓存
   * @param {Object} data - 包含 jobList, totalCount, currentPage 等
   */
  saveIndexData(data) {
    try {
      const cacheData = {
        data: data,
        timestamp: Date.now()
      };
      wx.setStorageSync(CACHE_KEYS.INDEX_DATA, cacheData);
      console.log('✅ 首页数据已缓存', data);
    } catch (error) {
      console.error('❌ 缓存首页数据失败:', error);
    }
  }

  /**
   * 保存首页配置数据到缓存
   * @param {Object} config - 包含 categoryList, areaList 等
   */
  saveIndexConfig(config) {
    try {
      const cacheData = {
        data: config,
        timestamp: Date.now()
      };
      wx.setStorageSync(CACHE_KEYS.INDEX_CONFIG, cacheData);
      console.log('✅ 首页配置已缓存', config);
    } catch (error) {
      console.error('❌ 缓存首页配置失败:', error);
    }
  }

  /**
   * 读取首页列表数据缓存
   * @returns {Object|null} - 缓存的数据，如果无效返回null
   */
  getIndexData() {
    try {
      const cacheData = wx.getStorageSync(CACHE_KEYS.INDEX_DATA);

      if (!cacheData) {
        console.log('📭 没有首页数据缓存');
        return null;
      }

      // 检查缓存是否过期
      const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRY.INDEX_DATA;

      if (isExpired) {
        console.log('⏰ 首页数据缓存已过期');
        this.clearIndexData();
        return null;
      }

      console.log('✅ 读取首页数据缓存成功');
      return cacheData.data;
    } catch (error) {
      console.error('❌ 读取首页数据缓存失败:', error);
      return null;
    }
  }

  /**
   * 读取首页配置数据缓存
   * @returns {Object|null} - 缓存的配置，如果无效返回null
   */
  getIndexConfig() {
    try {
      const cacheData = wx.getStorageSync(CACHE_KEYS.INDEX_CONFIG);

      if (!cacheData) {
        console.log('📭 没有首页配置缓存');
        return null;
      }

      // 检查缓存是否过期
      const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRY.INDEX_CONFIG;

      if (isExpired) {
        console.log('⏰ 首页配置缓存已过期');
        this.clearIndexConfig();
        return null;
      }

      console.log('✅ 读取首页配置缓存成功');
      return cacheData.data;
    } catch (error) {
      console.error('❌ 读取首页配置缓存失败:', error);
      return null;
    }
  }

  /**
   * 清除首页列表数据缓存
   */
  clearIndexData() {
    try {
      wx.removeStorageSync(CACHE_KEYS.INDEX_DATA);
      console.log('🗑️ 首页数据缓存已清除');
    } catch (error) {
      console.error('❌ 清除首页数据缓存失败:', error);
    }
  }

  /**
   * 清除首页配置缓存
   */
  clearIndexConfig() {
    try {
      wx.removeStorageSync(CACHE_KEYS.INDEX_CONFIG);
      console.log('🗑️ 首页配置缓存已清除');
    } catch (error) {
      console.error('❌ 清除首页配置缓存失败:', error);
    }
  }

  /**
   * 清除所有首页相关缓存
   */
  clearAllIndexCache() {
    this.clearIndexData();
    this.clearIndexConfig();
  }

  /**
   * 检查缓存是否存在且有效
   * @param {string} cacheType - 'data' 或 'config'
   * @returns {boolean}
   */
  isCacheValid(cacheType = 'data') {
    if (cacheType === 'data') {
      return this.getIndexData() !== null;
    } else if (cacheType === 'config') {
      return this.getIndexConfig() !== null;
    }
    return false;
  }

  /**
   * 获取缓存信息（用于调试）
   */
  getCacheInfo() {
    const dataCache = wx.getStorageSync(CACHE_KEYS.INDEX_DATA);
    const configCache = wx.getStorageSync(CACHE_KEYS.INDEX_CONFIG);

    return {
      data: {
        exists: !!dataCache,
        timestamp: dataCache?.timestamp,
        age: dataCache ? Date.now() - dataCache.timestamp : 0,
        expired: dataCache ? Date.now() - dataCache.timestamp > CACHE_EXPIRY.INDEX_DATA : true
      },
      config: {
        exists: !!configCache,
        timestamp: configCache?.timestamp,
        age: configCache ? Date.now() - configCache.timestamp : 0,
        expired: configCache ? Date.now() - configCache.timestamp > CACHE_EXPIRY.INDEX_CONFIG : true
      }
    };
  }
}

// 导出单例
module.exports = new CacheManager();
