// pages/admin/payment-settings/payment-settings.js
Page({
  data: {
    paymentConfig: {
      mchId: '',              // 商户号
      subMchId: '',           // 子商户号（服务商模式）
      apiKey: '',             // API密钥
      certSerialNo: '',       // 证书序列号
      paymentMode: 'normal',  // 支付模式：normal/service
      environment: 'sandbox', // 环境：production/sandbox
      enabled: false          // 是否启用
    },
    showApiKey: false // 是否显示API密钥
  },

  async onLoad() {
    console.log('[payment-settings] 页面加载');
    // 检查管理员权限
    await this.checkAdminPermission();
    // 加载支付配置
    await this.loadPaymentConfig();
  },

  /**
   * 检查管理员权限
   */
  async checkAdminPermission() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showModal({
        title: '权限不足',
        content: '仅管理员可访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return false;
    }
    return true;
  },

  /**
   * 加载支付配置
   */
  async loadPaymentConfig() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'paymentManager',
        data: {
          action: 'getConfig'
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const config = result.result.data || {};
        this.setData({
          paymentConfig: {
            mchId: config.mchId || '',
            subMchId: config.subMchId || '',
            apiKey: config.apiKey || '',
            certSerialNo: config.certSerialNo || '',
            paymentMode: config.paymentMode || 'normal',
            environment: config.environment || 'sandbox',
            enabled: config.enabled || false
          }
        });
        console.log('[payment-settings] 支付配置加载成功');
      } else {
        console.log('[payment-settings] 未找到支付配置，使用默认值');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[payment-settings] 加载支付配置失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 表单输入处理
   */
  onInputMchId(e) {
    this.setData({ 'paymentConfig.mchId': e.detail.value });
  },

  onInputSubMchId(e) {
    this.setData({ 'paymentConfig.subMchId': e.detail.value });
  },

  onInputApiKey(e) {
    this.setData({ 'paymentConfig.apiKey': e.detail.value });
  },

  onInputCertSerialNo(e) {
    this.setData({ 'paymentConfig.certSerialNo': e.detail.value });
  },

  /**
   * 切换API密钥显示
   */
  toggleApiKey() {
    this.setData({ showApiKey: !this.data.showApiKey });
  },

  /**
   * 选择支付模式
   */
  onSelectPaymentMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ 'paymentConfig.paymentMode': mode });
  },

  /**
   * 选择支付环境
   */
  onSelectEnvironment(e) {
    const env = e.currentTarget.dataset.env;
    this.setData({ 'paymentConfig.environment': env });
  },

  /**
   * 切换启用状态
   */
  onToggleEnabled(e) {
    this.setData({ 'paymentConfig.enabled': e.detail.value });
  },

  /**
   * 保存配置
   */
  async onSave() {
    const config = this.data.paymentConfig;

    // 验证必填项
    if (!config.mchId) {
      wx.showToast({
        title: '请输入商户号',
        icon: 'none'
      });
      return;
    }

    if (!config.apiKey) {
      wx.showToast({
        title: '请输入API密钥',
        icon: 'none'
      });
      return;
    }

    // 如果是服务商模式，验证子商户号
    if (config.paymentMode === 'service' && !config.subMchId) {
      wx.showToast({
        title: '服务商模式需要输入子商户号',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      const result = await wx.cloud.callFunction({
        name: 'paymentManager',
        data: {
          action: 'setConfig',
          config: config
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        console.log('[payment-settings] 支付配置保存成功');
      } else {
        throw new Error(result.result?.message || '保存失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[payment-settings] 保存支付配置失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  /**
   * 测试支付
   */
  async onTestPayment() {
    const config = this.data.paymentConfig;

    // 检查配置是否完整
    if (!config.mchId || !config.apiKey) {
      wx.showToast({
        title: '请先配置商户号和API密钥',
        icon: 'none'
      });
      return;
    }

    if (!config.enabled) {
      wx.showModal({
        title: '支付未启用',
        content: '请先启用微信支付功能',
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '测试支付',
      content: '将创建一笔0.01元的测试订单，确定继续吗？',
      success: async (res) => {
        if (res.confirm) {
          await this.createTestOrder();
        }
      }
    });
  },

  /**
   * 创建测试订单
   */
  async createTestOrder() {
    try {
      wx.showLoading({ title: '创建订单中...' });

      const userInfo = wx.getStorageSync('userInfo');
      if (!userInfo || !userInfo.openid) {
        wx.hideLoading();
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }

      const result = await wx.cloud.callFunction({
        name: 'paymentManager',
        data: {
          action: 'createTestOrder',
          openid: userInfo.openid
        }
      });

      wx.hideLoading();

      console.log('[payment-settings] 云函数返回结果:', result.result);

      if (result.result && result.result.success) {
        const paymentData = result.result.data;

        // 验证支付参数是否完整
        if (!paymentData || !paymentData.timeStamp || !paymentData.nonceStr ||
            !paymentData.package || !paymentData.paySign) {
          console.error('[payment-settings] 支付参数不完整:', paymentData);
          wx.showModal({
            title: '配置错误',
            content: '支付参数不完整，可能原因：\n1. 商户号配置错误\n2. API密钥配置错误\n3. 小程序未关联商户号\n\n请检查云函数日志获取详细错误',
            showCancel: false
          });
          return;
        }

        console.log('[payment-settings] 支付参数:', {
          timeStamp: paymentData.timeStamp,
          nonceStr: paymentData.nonceStr,
          package: paymentData.package ? '已获取' : '缺失',
          paySign: paymentData.paySign ? '已获取' : '缺失'
        });

        // 调用微信支付
        wx.requestPayment({
          timeStamp: paymentData.timeStamp,
          nonceStr: paymentData.nonceStr,
          package: paymentData.package,
          signType: paymentData.signType || 'RSA',
          paySign: paymentData.paySign,
          success: () => {
            wx.showModal({
              title: '支付成功',
              content: '测试支付完成！支付功能正常。',
              showCancel: false
            });
          },
          fail: (error) => {
            console.error('[payment-settings] 测试支付失败:', error);
            wx.showModal({
              title: '支付失败',
              content: `错误信息：${error.errMsg}\n\n请检查：\n1. 商户号是否正确\n2. API密钥是否正确\n3. 小程序APPID是否已关联商户号`,
              showCancel: false
            });
          }
        });
      } else {
        const errorMsg = result.result?.message || '创建订单失败';
        const errorDetail = result.result?.error;
        console.error('[payment-settings] 创建订单失败:', errorDetail);

        wx.showModal({
          title: '创建订单失败',
          content: errorMsg,
          showCancel: false
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[payment-settings] 创建测试订单失败:', error);
      wx.showModal({
        title: '创建订单失败',
        content: error.message || '请检查支付配置是否正确',
        showCancel: false
      });
    }
  }
});
