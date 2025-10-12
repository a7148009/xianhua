// pages/profile/profile.js
const { cloudInitializer } = require('../../utils/cloud-init.js');

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    menuItems: [], // 动态设置菜单项
    showDebug: false // 调试模式
  },

  async onLoad() {
    // 初始化云环境
    try {
      const result = await cloudInitializer.init();
      if (result.success) {
        console.log('✅ 云环境初始化成功');
      } else {
        console.error('❌ 云环境初始化失败:', result.message);
      }
    } catch (error) {
      console.error('❌ 云环境初始化出错:', error);
    }

    this.checkLoginStatus();
  },

  /**
   * 页面显示时
   */
  onShow() {
    console.log('📝 Profile页面显示');
    this.checkLoginStatus();
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 4
      });
    }

    // 双击标题区域开启调试模式
    let tapCount = 0;
    this.titleTapHandler = () => {
      tapCount++;
      if (tapCount >= 5) {
        this.setData({ showDebug: !this.data.showDebug });
        wx.showToast({
          title: this.data.showDebug ? '调试模式开启' : '调试模式关闭',
          icon: 'none'
        });
        tapCount = 0;
      }
      setTimeout(() => { tapCount = 0; }, 3000);
    };
  },

  /**
   * 激活调试模式
   */
  onTitleTap() {
    if (this.titleTapHandler) {
      this.titleTapHandler();
    }
  },

  /**
   * 检查登录状态
   */
  async checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    console.log('📝 检查本地用户信息:', userInfo);

    if (userInfo && userInfo.openid) {
      // 🚀 优化：先立即显示本地缓存的用户信息，无需loading
      const cachedUserInfo = await this.ensureAvatarUrl(userInfo);
      this.setData({
        isLoggedIn: true,
        userInfo: cachedUserInfo
      });
      this.updateMenuItems(cachedUserInfo.role || 'user');
      console.log('⚡ 使用本地缓存快速显示用户信息');

      // 🔄 后台静默更新用户信息（不显示loading）
      this.refreshUserInfoSilently(userInfo.openid);
    } else {
      console.log('🙋‍♂️ 用户未登录');
      this.setData({
        isLoggedIn: false
      });
      this.updateMenuItems('guest');
    }
  },

  /**
   * 静默刷新用户信息（后台更新，不显示loading）
   */
  async refreshUserInfoSilently(openid) {
    try {
      const db = wx.cloud.database();
      const result = await db.collection('users').where({
        openid: openid
      }).get();

      if (result.data.length > 0) {
        let latestUser = result.data[0];
        latestUser = await this.ensureAvatarUrl(latestUser);
        console.log('🔄 后台获取到最新用户信息:', latestUser);

        // 更新本地用户信息
        const updatedUserInfo = {
          openid: latestUser.openid,
          nickName: latestUser.nickName || '微信用户',
          avatarUrl: latestUser.avatarUrl || '',
          cloudAvatarFileID: latestUser.cloudAvatarFileID || latestUser.cloudFileID || '',
          avatarUpdateTime: latestUser.avatarUpdateTime || Date.now(),
          role: latestUser.role || 'user',
          vipExpireDate: latestUser.vipExpireDate,
          gender: latestUser.gender || 0,
          city: latestUser.city || '',
          province: latestUser.province || '',
          country: latestUser.country || ''
        };

        wx.setStorageSync('userInfo', updatedUserInfo);

        // 静默更新界面（无提示）
        this.setData({
          userInfo: updatedUserInfo
        });

        // 如果角色有变化，更新菜单
        if (this.data.userInfo.role !== updatedUserInfo.role) {
          this.updateMenuItems(updatedUserInfo.role);
        }

        console.log('✅ 用户信息已静默更新');
      }
    } catch (error) {
      console.error('⚠️ 后台刷新用户信息失败:', error);
      // 静默失败，不影响用户体验
    }
  },

  /**
   * 根据用户角色更新菜单项
   */
  updateMenuItems(role) {
    console.log('📋 更新菜单项，用户角色:', role);

    let menuItems = [];

    // 管理员专有功能
    if (role === 'admin') {
      console.log('👑 检测到管理员角色，添加管理功能菜单');
      menuItems = [
        {
          icon: '👥',
          title: '用户管理',
          desc: '管理所有用户和角色权限',
          url: '/pages/admin/user-management/user-management'
        },
        {
          icon: '💎',
          title: 'VIP价格设置',
          desc: '设置VIP会员套餐和价格',
          url: '/pages/admin/vip-settings/vip-settings'
        },
        {
          icon: '💳',
          title: '微信支付设置',
          desc: '配置微信支付商户参数',
          url: '/pages/admin/payment-settings/payment-settings'
        },
        {
          icon: '📝',
          title: '变量设置',
          desc: '自定义系统文字显示内容',
          url: '/pages/admin/variable-settings/variable-settings'
        },
        {
          icon: '⚙️',
          title: '系统设置',
          desc: '系统配置和高级设置',
          url: '/pages/admin/system-settings/system-settings'
        }
      ];
    } else {
      console.log('👤 非管理员用户，角色:', role);
    }

    console.log('📝 设置菜单项:', menuItems);
    this.setData({ menuItems });
  },

  /**
   * 微信登录 - 跳转到登录页面
   */
  async wxLogin() {
    try {
      console.log('点击登录，跳转到登录页面');

      // 跳转到专门的登录页面
      wx.navigateTo({
        url: '/pages/login/login'
      });

    } catch (error) {
      console.error('跳转登录页面失败:', error);
      wx.showToast({
        title: '跳转失败',
        icon: 'none'
      });
    }
  },

  /**
   * 更新个人资料 - 跳转到登录页面进行资料完善
   */
  updateProfile() {
    if (!this.data.isLoggedIn) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      this.wxLogin();
      return;
    }

    wx.navigateTo({
      url: '/pages/login/login?update=true'
    });
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          this.setData({
            isLoggedIn: false,
            userInfo: null
          });
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 菜单项点击
   */
  onMenuTap(e) {
    const { item } = e.currentTarget.dataset;

    if (!this.data.isLoggedIn && item.title !== '联系客服' && item.title !== '关于我们') {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    if (item.action === 'contact') {
      this.contactService();
    } else if (item.url) {
      // 检查页面是否存在，如果不存在则显示开发中提示
      if (item.url.includes('my-posts') || item.url.includes('favorites') ||
          item.url.includes('history') || item.url.includes('about')) {
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        });
      } else {
        wx.navigateTo({
          url: item.url
        });
      }
    }
  },

  /**
   * 联系客服
   */
  contactService() {
    wx.makePhoneCall({
      phoneNumber: '400-123-4567',
      success: () => {
        console.log('拨打客服电话成功');
      },
      fail: () => {
        wx.showModal({
          title: '客服电话',
          content: '400-123-4567\n\n工作时间：9:00-18:00',
          showCancel: false
        });
      }
    });
  },

  /**
   * 获取角色显示名称
   */
  getRoleDisplayName(role) {
    const roleMap = {
      'admin': '管理员',
      'vip': 'VIP',
      'publisher': '发布者',
      'user': '普通用户'
    };
    return roleMap[role] || '普通用户';
  },

  /**
   * 格式化VIP过期时间
   */
  formatVipExpireDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 确保头像URL有效（处理云文件ID和过期链接）
   */
  async ensureAvatarUrl(user) {
    if (!user) return user;

    // 检查是否需要刷新头像URL
    const needsRefresh = this.isAvatarUrlExpired(user);

    // 如果有 cloudAvatarFileID 或 cloudFileID，优先从云存储获取最新临时链接
    const fileID = user.cloudAvatarFileID || user.cloudFileID;
    if (fileID && fileID.startsWith('cloud://')) {
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: [fileID]
        });

        if (result.fileList && result.fileList.length > 0) {
          const fileInfo = result.fileList[0];
          if (fileInfo.tempFileURL) {
            user.avatarUrl = fileInfo.tempFileURL;
            user.avatarUpdateTime = Date.now(); // 记录更新时间
            console.log('✅ 头像URL已刷新');
            return user;
          }
        }
      } catch (error) {
        console.warn('⚠️ 获取头像临时链接失败:', error);
        // 继续使用默认头像逻辑
      }
    }

    // 如果有现有的 avatarUrl 且未过期，直接使用
    if (user.avatarUrl && user.avatarUrl.startsWith('http') && !needsRefresh) {
      return user;
    }

    // 如果以上都失败，生成默认头像
    user.avatarUrl = this.generateDefaultAvatar(user);
    console.log('ℹ️ 使用默认头像');
    return user;
  },

  /**
   * 检查头像URL是否过期
   */
  isAvatarUrlExpired(user) {
    // 如果没有 avatarUrl，需要刷新
    if (!user.avatarUrl) return true;

    // 如果不是云存储链接，不过期
    if (!user.avatarUrl.includes('tcb.qcloud.la') &&
        !user.avatarUrl.includes('cloud.tencent.com')) {
      return false;
    }

    // 如果有更新时间记录，检查是否超过2小时
    if (user.avatarUpdateTime) {
      const twoHours = 2 * 60 * 60 * 1000;
      const elapsed = Date.now() - user.avatarUpdateTime;
      return elapsed > twoHours;
    }

    // 如果是云存储链接但没有更新时间，认为可能过期
    return true;
  },

  /**
   * 生成默认头像
   */
  generateDefaultAvatar(user) {
    const firstChar = (user.nickName || '用').charAt(0);
    const hash = this.hashCode(user.openid || '');
    const colorIndex = Math.abs(hash) % 10;
    const colors = [
      'FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7',
      'DDA0DD', '98D8C8', 'F7DC6F', 'BB8FCE', '85C1E9'
    ];
    const backgroundColor = colors[colorIndex];
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(firstChar)}&background=${backgroundColor}&color=fff&size=200&bold=true&format=png`;
  },

  /**
   * 字符串哈希函数
   */
  hashCode(str) {
    let hash = 0;
    if (!str || str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  },

  /**
   * 复制OpenID
   */
  copyOpenId() {
    if (this.data.userInfo && this.data.userInfo.openid) {
      wx.setClipboardData({
        data: this.data.userInfo.openid,
        success: () => {
          wx.showToast({
            title: 'OpenID已复制',
            icon: 'success'
          });
        }
      });
    }
  },

  /**
   * 头像加载失败处理
   */
  onAvatarError(e) {
    console.log('头像加载失败:', e.detail);
    // 生成默认头像
    const userInfo = this.data.userInfo;
    if (userInfo) {
      const defaultAvatar = this.generateDefaultAvatar(userInfo);
      this.setData({
        'userInfo.avatarUrl': defaultAvatar
      });
    }
  },

  /**
   * 诊断VIP状态（管理员专用）
   */
  async diagnoseVIP() {
    const userInfo = this.data.userInfo;
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showToast({
        title: '仅管理员可用',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '诊断中...' });

      const result = await wx.cloud.callFunction({
        name: 'vipDiagnose',
        data: {
          openid: userInfo.openid
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const diagnosis = result.result.data;

        // 格式化诊断结果
        let content = `当前时间: ${new Date(diagnosis.currentTime).toLocaleString('zh-CN')}\n\n`;

        content += `📊 users集合:\n`;
        content += `  - 存在: ${diagnosis.usersCollection.exists ? '✅' : '❌'}\n`;
        content += `  - 角色: ${diagnosis.usersCollection.role || '无'}\n`;
        content += `  - VIP到期: ${diagnosis.usersCollection.vipExpireDate ? new Date(diagnosis.usersCollection.vipExpireDate).toLocaleString('zh-CN') : '无'}\n`;
        content += `  - VIP有效: ${diagnosis.usersCollection.isVIPValid ? '✅' : '❌'}\n\n`;

        content += `📊 user_roles集合:\n`;
        content += `  - 存在: ${diagnosis.userRolesCollection.exists ? '✅' : '❌'}\n`;
        content += `  - 角色: ${diagnosis.userRolesCollection.role || '无'}\n`;
        content += `  - is_vip: ${diagnosis.userRolesCollection.is_vip ? '✅' : '❌'}\n`;
        content += `  - VIP到期: ${diagnosis.userRolesCollection.vip_expire_time ? new Date(diagnosis.userRolesCollection.vip_expire_time).toLocaleString('zh-CN') : '无'}\n`;
        content += `  - VIP有效: ${diagnosis.userRolesCollection.isVIPValid ? '✅' : '❌'}\n\n`;

        content += `💡 结论:\n${diagnosis.conclusion}\n`;

        if (diagnosis.suggestion) {
          content += `\n💬 建议:\n${diagnosis.suggestion}`;
        }

        wx.showModal({
          title: 'VIP状态诊断报告',
          content: content,
          showCancel: false,
          confirmText: '知道了'
        });

        console.log('[profile] VIP诊断详细结果:', diagnosis);
      } else {
        wx.showModal({
          title: '诊断失败',
          content: result.result?.message || '请确保已上传vipDiagnose云函数',
          showCancel: false
        });
      }
    } catch (error) {
      console.error('[profile] VIP诊断失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '诊断失败',
        content: `错误: ${error.message}\n\n请确保已上传vipDiagnose云函数`,
        showCancel: false
      });
    }
  },

  /**
   * 初始化系统变量（管理员专用）
   */
  async initializeVariables() {
    // 检查管理员权限
    const userInfo = this.data.userInfo;
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showToast({
        title: '仅管理员可用',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '初始化系统变量',
      content: '此操作将创建system_variables集合并初始化默认变量，确定继续吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '初始化中...' });

            const result = await wx.cloud.callFunction({
              name: 'initVariables'
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showModal({
                title: '初始化成功',
                content: result.result.message + '\n\n现在可以在"变量设置"页面进行配置了。',
                showCancel: false,
                success: () => {
                  // 提示上传云函数
                  if (result.result.action === 'created') {
                    wx.showToast({
                      title: '初始化完成',
                      icon: 'success'
                    });
                  }
                }
              });
            } else {
              wx.showModal({
                title: '初始化失败',
                content: (result.result && result.result.message) || '请确保已上传initVariables云函数',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('初始化系统变量失败:', error);
            wx.hideLoading();
            wx.showModal({
              title: '初始化失败',
              content: '请确保已上传以下云函数：\n1. initVariables\n2. variableManager',
              showCancel: false
            });
          }
        }
      }
    });
  }
});
