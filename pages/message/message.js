Page({
  data: {
    infoList: [], // 从数据库加载鲜花信息列表
    loading: true,
    isVIP: false, // 是否是VIP用户
    isAdmin: false // 是否是管理员
  },

  async onLoad() {
    // 检查用户权限
    await this.checkUserPermission();
    // 加载鲜花信息数据
    await this.loadMoreInfo();
  },

  onShow() {
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 3
      });
    }
  },

  /**
   * 检查用户权限（VIP或管理员）
   */
  async checkUserPermission() {
    try {
      const userInfo = wx.getStorageSync('userInfo');

      // 检查是否是管理员
      if (userInfo && userInfo.role === 'admin') {
        this.setData({
          isAdmin: true,
          isVIP: true // 管理员默认拥有VIP权限
        });
        console.log('[message] 管理员权限');
        return;
      }

      // 检查是否是VIP
      if (userInfo && userInfo.openid) {
        const result = await wx.cloud.callFunction({
          name: 'vipManager',
          data: {
            action: 'checkVIP',
            openid: userInfo.openid
          }
        });

        if (result.result && result.result.success && result.result.isVIP) {
          this.setData({ isVIP: true });
          console.log('[message] VIP用户');
        } else {
          this.setData({ isVIP: false });
          console.log('[message] 普通用户');
        }
      } else {
        this.setData({ isVIP: false });
        console.log('[message] 未登录用户');
      }
    } catch (error) {
      console.error('[message] 检查权限失败:', error);
      this.setData({ isVIP: false, isAdmin: false });
    }
  },

  /**
   * 从数据库加载更多鲜花信息
   */
  async loadMoreInfo() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'moreInfoManager',
        data: {
          action: 'getList',
          page: 1,
          limit: 100
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const infoList = result.result.data.map(item => {
          // 处理每一条details，智能识别并脱敏联系方式
          const processedDetails = this.processDetails(item.details);

          return {
            ...item,
            details: processedDetails
          };
        });

        this.setData({
          infoList: infoList,
          loading: false
        });

        console.log('[message] 加载成功，共', infoList.length, '条鲜花信息');
      } else {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('[message] 加载鲜花信息失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  /**
   * 处理详情列表，智能识别联系方式（微信号和电话号码）
   * @param {Array} details 详情数组
   * @returns {Array} 处理后的详情数组
   */
  processDetails(details) {
    if (!Array.isArray(details)) {
      return [];
    }

    return details.map(detail => {
      // 检测是否包含敏感信息（电话号码或微信号）
      const hasSensitiveInfo = this.detectSensitiveInfo(detail);

      if (hasSensitiveInfo) {
        // 如果用户有权限，显示原文
        if (this.data.isVIP || this.data.isAdmin) {
          return {
            text: detail,
            isSensitive: true,
            isVisible: true
          };
        } else {
          // 普通用户，脱敏显示
          return {
            text: this.maskSensitiveInfo(detail),
            originalText: detail, // 保存原文，用于点击时提示
            isSensitive: true,
            isVisible: false
          };
        }
      } else {
        // 非敏感信息，所有用户都能看到
        return {
          text: detail,
          isSensitive: false,
          isVisible: true
        };
      }
    });
  },

  /**
   * 智能检测联系方式（电话号码和微信号）
   * @param {String} text 文本内容
   * @returns {Boolean} 是否包含联系方式
   */
  detectSensitiveInfo(text) {
    if (typeof text !== 'string') {
      return false;
    }

    // 精准检测电话号码
    const phonePatterns = [
      /1[3-9]\d{9}/,                    // 11位手机号
      /0\d{2,3}[-\s]?\d{7,8}/,         // 固定电话：010-12345678 或 0871-1234567（以0开头）
      /[48]00[-\s]?\d{3}[-\s]?\d{4}/   // 400/800电话
    ];

    // 精准检测微信号
    const wechatPatterns = [
      /微信[号|：|:]\s*[a-zA-Z0-9_-]{6,20}/, // "微信号：xxx"
      /wx[：|:]\s*[a-zA-Z0-9_-]{6,20}/i,     // "wx：xxx" (不区分大小写)
      /weixin[：|:]\s*[a-zA-Z0-9_-]{6,20}/i, // "weixin：xxx"
      /VX[：|:]\s*[a-zA-Z0-9_-]{6,20}/i      // "VX：xxx"
    ];

    // 检测电话号码
    const hasPhone = phonePatterns.some(pattern => pattern.test(text));

    // 检测微信号
    const hasWechat = wechatPatterns.some(pattern => pattern.test(text));

    // 联系方式关键词 + 明确的联系信息格式
    const contactKeywords = ['联系电话', '联系方式', '电话', '手机'];
    const hasContactKeyword = contactKeywords.some(keyword => text.includes(keyword));

    // 只有同时包含联系关键词和手机号才判定为敏感
    const hasContactInfo = hasContactKeyword && hasPhone;

    return hasPhone || hasWechat || hasContactInfo;
  },

  /**
   * 脱敏处理联系方式
   * @param {String} text 原始文本
   * @returns {String} 脱敏后的文本
   */
  maskSensitiveInfo(text) {
    if (typeof text !== 'string') {
      return text;
    }

    let maskedText = text;

    // 脱敏电话号码：保留前3位和后4位
    maskedText = maskedText.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    maskedText = maskedText.replace(/1[3-9]\d{9}/, (match) => {
      return match.substr(0, 3) + '****' + match.substr(7);
    });

    // 脱敏微信号：保留前2位和后2位
    maskedText = maskedText.replace(/([a-zA-Z][a-zA-Z0-9_-]{1})[a-zA-Z0-9_-]{2,}([a-zA-Z0-9_-]{2})/, '$1***$2');

    // 如果没有匹配到具体模式，显示通用提示
    if (maskedText === text && this.detectSensitiveInfo(text)) {
      maskedText = text.replace(/[a-zA-Z0-9_-]{6,}/g, '***');
    }

    return maskedText + ' (VIP可见)';
  },

  /**
   * 点击联系方式（提示开通VIP）
   */
  onSensitiveInfoTap(e) {
    const { isSensitive, isVisible } = e.currentTarget.dataset;

    // 如果是联系方式且不可见，提示开通VIP
    if (isSensitive && !isVisible) {
      this.showVIPPrivilegeModal();
    }
  },

  /**
   * 显示VIP特权弹窗（与首页一致）
   */
  showVIPPrivilegeModal() {
    const privileges = [
      '查看VIP专属鲜花信息',
      '获取VIP商家联系方式',
      '优先查看高端鲜花资源',
      '专属客服一对一服务',
      '每日推荐精选信息'
    ];

    wx.showModal({
      title: '开通VIP会员',
      content: `VIP特权：\n${privileges.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n立即开通VIP，畅享全部特权！`,
      confirmText: '立即开通',
      cancelText: '暂不开通',
      success: (res) => {
        if (res.confirm) {
          // 跳转到VIP购买页面
          wx.navigateTo({
            url: '/pages/vip/vip-purchase/vip-purchase'
          });
        }
      }
    });
  },

  /**
   * 下拉刷新鲜花信息
   */
  async onPullDownRefresh() {
    console.log('[message] 下拉刷新鲜花信息');
    await this.checkUserPermission();
    await this.loadMoreInfo();
    wx.stopPullDownRefresh();
  }
});
