/**
 * 系统信息工具类
 * 使用微信官方推荐的新API替代已废弃的 wx.getSystemInfoSync()
 *
 * 参考文档：https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getSystemInfoSync.html
 */

/**
 * 获取完整的系统信息（兼容旧代码）
 * @returns {Object} 系统信息对象
 */
function getSystemInfo() {
  try {
    // 使用新的分类API获取系统信息
    const deviceInfo = wx.getDeviceInfo();        // 设备信息
    const windowInfo = wx.getWindowInfo();        // 窗口信息
    const appBaseInfo = wx.getAppBaseInfo();      // App基础信息
    const systemSetting = wx.getSystemSetting();  // 系统设置
    const appAuthorizeSetting = wx.getAppAuthorizeSetting(); // 授权设置

    // 合并所有信息，保持与旧API的兼容性
    return {
      // 设备信息
      ...deviceInfo,
      // 窗口信息
      ...windowInfo,
      // App信息
      ...appBaseInfo,
      // 系统设置
      ...systemSetting,
      // 授权设置
      ...appAuthorizeSetting,
      // 添加获取时间戳
      _timestamp: Date.now()
    };
  } catch (err) {
    console.error('[system-info] 获取系统信息失败', err);

    // 降级方案：如果新API不可用，尝试使用旧API
    try {
      return wx.getSystemInfoSync();
    } catch (fallbackErr) {
      console.error('[system-info] 降级方案也失败', fallbackErr);
      return {};
    }
  }
}

/**
 * 获取设备信息
 * @returns {Object} 设备信息（品牌、型号、系统版本等）
 */
function getDeviceInfo() {
  try {
    return wx.getDeviceInfo();
  } catch (err) {
    console.error('[system-info] 获取设备信息失败', err);
    return {};
  }
}

/**
 * 获取窗口信息
 * @returns {Object} 窗口信息（宽度、高度、像素比等）
 */
function getWindowInfo() {
  try {
    return wx.getWindowInfo();
  } catch (err) {
    console.error('[system-info] 获取窗口信息失败', err);
    return {};
  }
}

/**
 * 获取App基础信息
 * @returns {Object} App信息（版本号、SDK版本等）
 */
function getAppBaseInfo() {
  try {
    return wx.getAppBaseInfo();
  } catch (err) {
    console.error('[system-info] 获取App基础信息失败', err);
    return {};
  }
}

/**
 * 获取系统设置
 * @returns {Object} 系统设置（主题、语言等）
 */
function getSystemSetting() {
  try {
    return wx.getSystemSetting();
  } catch (err) {
    console.error('[system-info] 获取系统设置失败', err);
    return {};
  }
}

/**
 * 获取授权设置
 * @returns {Object} 授权设置（各种权限状态）
 */
function getAppAuthorizeSetting() {
  try {
    return wx.getAppAuthorizeSetting();
  } catch (err) {
    console.error('[system-info] 获取授权设置失败', err);
    return {};
  }
}

/**
 * 判断是否为iPhone X系列（有刘海屏）
 * @returns {Boolean}
 */
function isIPhoneX() {
  try {
    const windowInfo = wx.getWindowInfo();
    const { screenHeight, safeArea } = windowInfo;

    // iPhone X 系列的安全区域底部距离屏幕底部 > 0
    return safeArea && (screenHeight - safeArea.bottom > 0);
  } catch (err) {
    return false;
  }
}

/**
 * 获取安全区域信息
 * @returns {Object} 安全区域坐标
 */
function getSafeAreaInsets() {
  try {
    const windowInfo = wx.getWindowInfo();
    const { safeArea, screenHeight, screenWidth } = windowInfo;

    if (!safeArea) {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }

    return {
      top: safeArea.top,
      right: screenWidth - safeArea.right,
      bottom: screenHeight - safeArea.bottom,
      left: safeArea.left
    };
  } catch (err) {
    console.error('[system-info] 获取安全区域失败', err);
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

module.exports = {
  getSystemInfo,
  getDeviceInfo,
  getWindowInfo,
  getAppBaseInfo,
  getSystemSetting,
  getAppAuthorizeSetting,
  isIPhoneX,
  getSafeAreaInsets
};
