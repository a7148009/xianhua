Page({
  data: {
    // 公众号信息
    officialAccountName: '昆明鲜花招聘',
    officialAccountDesc: '提供昆明地区最新最全的鲜花行业招聘信息',
    qrcodeUrl: '/images/official_qrcode.png', // 公众号二维码图片路径（本地图片）

    // 订阅模板ID（需要在微信公众平台配置）
    templateId: '' // 例如：'xxx' 需要替换为真实的模板ID
  },

  onLoad() {
    // 页面加载完成
  },

  onShow() {
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }
  },

  /**
   * 复制公众号名称
   */
  copyAccountName() {
    wx.setClipboardData({
      data: this.data.officialAccountName,
      success: () => {
        wx.showToast({
          title: '复制成功',
          icon: 'success',
          duration: 2000
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 点击预览二维码
   * 用户点击后会进入预览模式，在预览界面可以长按识别二维码
   */
  previewQRCode() {
    if (!this.data.qrcodeUrl) {
      return;
    }
    wx.previewImage({
      current: this.data.qrcodeUrl,
      urls: [this.data.qrcodeUrl]
    });
  },

  /**
   * 请求订阅消息
   */
  requestSubscribe() {
    // 检查是否配置了模板ID
    if (!this.data.templateId) {
      wx.showModal({
        title: '提示',
        content: '订阅功能暂未配置，请先在系统设置中配置消息模板ID',
        showCancel: false
      });
      return;
    }

    // 请求订阅消息权限
    wx.requestSubscribeMessage({
      tmplIds: [this.data.templateId],
      success: (res) => {
        console.log('订阅结果:', res);

        // 检查用户是否同意订阅
        if (res[this.data.templateId] === 'accept') {
          // 用户同意订阅
          wx.showToast({
            title: '订阅成功',
            icon: 'success',
            duration: 2000
          });
        } else if (res[this.data.templateId] === 'reject') {
          // 用户拒绝订阅
          wx.showModal({
            title: '订阅失败',
            content: '您拒绝了消息订阅，将无法收到最新招聘信息推送。建议开启订阅以获得更好的服务体验。',
            showCancel: false
          });
        } else if (res[this.data.templateId] === 'ban') {
          // 用户已被封禁
          wx.showModal({
            title: '提示',
            content: '您已被限制订阅，如有疑问请联系客服',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        console.error('订阅失败:', err);

        // 用户取消或其他错误
        if (err.errMsg.indexOf('cancel') > -1) {
          wx.showToast({
            title: '已取消订阅',
            icon: 'none',
            duration: 2000
          });
        } else {
          wx.showModal({
            title: '订阅失败',
            content: '请求订阅消息失败，请稍后重试',
            showCancel: false
          });
        }
      }
    });
  },

  /**
   * 跳转到设置页面
   */
  goToSettings() {
    wx.navigateTo({
      url: '/pages/admin/system-settings/system-settings'
    });
  },

  /**
   * 分享页面
   */
  onShareAppMessage() {
    return {
      title: '关注公众号，获取最新招聘信息',
      path: '/pages/subscribe/subscribe',
      imageUrl: this.data.qrcodeUrl
    };
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '关注公众号，获取最新招聘信息',
      query: '',
      imageUrl: this.data.qrcodeUrl
    };
  }
});
