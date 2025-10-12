// pages/login/login.js
const { cloudAPI } = require('../../api/CloudAPI.js');
const { cloudInitializer } = require('../../utils/cloud-init.js');

// 默认头像 - 使用更好的默认头像
const defaultAvatarUrl = 'https://ui-avatars.com/api/?name=U&background=28a745&color=fff&size=200&bold=true&format=png'

Page({
  data: {
    showProfileForm: false, // 是否显示资料完善表单
    avatarUrl: defaultAvatarUrl, // 用户头像
    nickName: '', // 用户昵称
    canComplete: false, // 是否可以完成设置
    tempLoginCode: '', // 临时存储的登录凭证
    isUpdatingProfile: false, // 是否为更新模式（区分新用户和更新资料）
    isChoosingAvatar: false, // 是否正在选择头像（防止重复调用）
  },

  onLoad(options) {
    // 检查是否为更新模式
    if (options && options.update === 'true') {
      // 直接进入资料更新模式
      this.enterUpdateMode();
    }
  },

  /**
   * 进入资料更新模式
   */
  async enterUpdateMode() {
    try {
      wx.showLoading({ title: '加载中...' });
      
      // 获取登录凭证
      const loginRes = await this.wxLoginAsync();
      const userInfo = wx.getStorageSync('userInfo');
      
      if (!userInfo || !userInfo.openid) {
        wx.hideLoading();
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        return;
      }
      
      // 预填充现有信息
      this.setData({
        showProfileForm: true,
        tempLoginCode: loginRes.code,
        avatarUrl: userInfo.avatarUrl || defaultAvatarUrl,
        nickName: userInfo.nickName || '',
        isUpdatingProfile: true
      });
      
      // 检查是否可以完成
      this.checkCanComplete();
      
      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      console.error('进入更新模式失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  onShow() {
    // 隐藏 tabBar，因为登录页不应该显示底部导航
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: -1  // 设置为 -1 表示不选中任何项
      });
    }
  },

  /**
   * 微信一键登录
   */
  async wxLogin() {
    try {
      wx.showLoading({ title: '登录中...' });
      
      // 1. 获取登录凭证
      const loginRes = await this.wxLoginAsync();
      console.log('登录凭证:', loginRes.code);
      
      // 2. 检查用户是否已存在（先调用一次登录接口）
      console.log('开始调用 userLogin 云函数...');
      const checkResult = await cloudAPI.userLogin({
        loginCode: loginRes.code,
        loginMethod: 'check'
      });
      
      console.log('userLogin 云函数返回结果:', checkResult);
      
      if (checkResult.success) {
        // 用户已存在，检查是否需要完善头像昵称
        const userData = checkResult.data || checkResult.userInfo || checkResult.result || null;

        if (!userData) {
          console.warn('userLogin 成功但缺少用户数据，视为需完善资料');
          wx.hideLoading();
          this.setData({
            showProfileForm: true,
            tempLoginCode: loginRes.code,
            avatarUrl: defaultAvatarUrl,
            nickName: '',
            isUpdatingProfile: false
          });
          return;
        }

        const needsProfileUpdate = typeof checkResult.needsProfile === 'boolean'
          ? checkResult.needsProfile
          : this.checkIfNeedsProfileUpdate(userData);
        
        if (needsProfileUpdate) {
          // 需要完善资料，显示完善表单
          wx.hideLoading();
          
          // 预填充现有信息
          this.setData({
            showProfileForm: true,
            tempLoginCode: loginRes.code,
            avatarUrl: userData.avatarUrl || defaultAvatarUrl,
            nickName: userData.nickName || '',
            isUpdatingProfile: true // 标记为更新模式
          });
          
          wx.showToast({
            title: '请完善头像和昵称',
            icon: 'none'
          });
        } else {
          // 信息完整，直接登录
          const userInfo = {
            ...userData,
            loginTime: new Date().getTime(),
            loginMethod: 'wechat'
          };
          
          wx.setStorageSync('userInfo', userInfo);
          
          wx.hideLoading();
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          
          setTimeout(() => {
            this.navigateBack();
          }, 1500);
        }
      } else {
        // 新用户，需要完善资料
        wx.hideLoading();
        this.setData({
          showProfileForm: true,
          tempLoginCode: loginRes.code,
          avatarUrl: defaultAvatarUrl,
          nickName: '',
          isUpdatingProfile: false // 标记为新用户模式
        });
      }
      
    } catch (error) {
      wx.hideLoading();
      console.error('微信登录失败:', error);
      
      // 显示详细的错误信息
      let errorMsg = '登录失败';
      if (error.message) {
        errorMsg = error.message;
      } else if (error.errMsg) {
        errorMsg = error.errMsg;
      }
      
      wx.showModal({
        title: '登录失败',
        content: `错误信息: ${errorMsg}\n\n请检查网络连接或重试`,
        showCancel: true,
        confirmText: '重试',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            // 重试登录
            this.wxLogin();
          }
        }
      });
    }
  },

  /**
   * 检查用户是否需要完善资料
   */
  checkIfNeedsProfileUpdate(userData) {
    // 检查头像是否为默认头像或空
    const avatarUrl = userData.avatarUrl || '';
    const hasValidAvatar = avatarUrl && 
                          typeof avatarUrl === 'string' &&
                          avatarUrl.trim() !== '' && 
                          !avatarUrl.includes('ui-avatars.com') && 
                          !avatarUrl.includes('default');
    
    // 检查昵称是否为默认昵称或太短
    const nickName = userData.nickName || '';
    const hasValidNickName = nickName && 
                            typeof nickName === 'string' &&
                            nickName.trim() !== '' && 
                            nickName !== '微信用户' && 
                            nickName.length >= 2;
    
    console.log('检查用户资料完整性:', {
      avatarUrl: avatarUrl,
      nickName: nickName,
      hasValidAvatar,
      hasValidNickName,
      needsUpdate: !hasValidAvatar || !hasValidNickName
    });
    
    // 如果头像或昵称不完整，则需要完善
    return !hasValidAvatar || !hasValidNickName;
  },

  /**
   * 选择头像
   */
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    console.log('选择头像:', avatarUrl);
    
    // 根据官方文档，从基础库2.24.4版本起，若用户上传的图片未通过安全监测，不触发bindchooseavatar 事件
    // 所以能到达这里说明头像已通过安全检测
    this.setData({
      avatarUrl
    });
    
    this.checkCanComplete();
  },

  /**
   * 昵称输入
   */
  onNicknameInput(e) {
    const nickName = e.detail.value.trim();
    
    this.setData({
      nickName
    });
    
    this.checkCanComplete();
  },

  /**
   * 昵称失去焦点事件（安全检测）
   */
  onNicknameBlur(e) {
    // 根据官方文档，从基础库2.24.4版本起，在onBlur 事件触发时，
    // 微信将异步对用户输入的内容进行安全监测，若未通过安全监测，微信将清空用户输入的内容
    const currentNickName = e.detail.value.trim();
    console.log('昵称失去焦点:', currentNickName);
    
    // 检查是否被清空（说明未通过安全检测）
    setTimeout(() => {
      if (this.data.nickName !== currentNickName) {
        wx.showToast({
          title: '昵称包含敏感内容，请重新输入',
          icon: 'none'
        });
        this.checkCanComplete();
      }
    }, 100);
  },

  /**
   * 检查是否可以完成设置
   */
  checkCanComplete() {
    const { avatarUrl, nickName } = this.data;
    const canComplete = avatarUrl !== defaultAvatarUrl && nickName.length >= 2;
    
    this.setData({
      canComplete
    });
  },

  /**
   * form 表单提交（确保安全检测生效）
   */
  onFormSubmit(e) {
    console.log('form 提交:', e.detail.value);
    
    // 获取 form 中的数据
    const formData = e.detail.value;
    const { nickName } = formData;
    
    // 确保数据同步
    if (nickName && nickName.trim() !== this.data.nickName) {
      this.setData({
        nickName: nickName.trim()
      });
    }
    
    // 调用完成资料设置
    this.completeProfile();
  },

  /**
   * form 表单重置
   */
  onFormReset(e) {
    console.log('form 重置');
    this.setData({
      avatarUrl: defaultAvatarUrl,
      nickName: '',
      canComplete: false
    });
  },

  /**
   * 完成资料设置
   */
  async completeProfile() {
    try {
      const { tempLoginCode, avatarUrl, nickName } = this.data;
      
      console.log('开始完成资料设置:', {
        hasLoginCode: !!tempLoginCode,
        avatarUrl,
        nickName,
        nickNameLength: nickName.length
      });
      
      if (!tempLoginCode) {
        wx.showToast({
          title: '登录信息已过期，请重新登录',
          icon: 'none'
        });
        this.setData({ showProfileForm: false });
        return;
      }
      
      // 检查必要字段
      if (avatarUrl === defaultAvatarUrl) {
        wx.showToast({
          title: '请选择头像',
          icon: 'none'
        });
        return;
      }
      
      if (!nickName || nickName.length < 2) {
        wx.showToast({
          title: '请输入至少2个字符的昵称',
          icon: 'none'
        });
        return;
      }
      
      wx.showLoading({ title: '保存中...' });
      
      // 处理头像持久化

      let finalAvatarUrl = avatarUrl;

      let cloudFileID = '';



      if (avatarUrl && avatarUrl !== defaultAvatarUrl) {

        try {

          const persistResult = await this.persistAvatar(avatarUrl);

          finalAvatarUrl = persistResult.avatarUrl;

          cloudFileID = persistResult.cloudFileID || '';

          console.log('头像已持久化:', { finalAvatarUrl, cloudFileID });

        } catch (error) {

          console.warn('头像持久化失败，使用临时链接', error);

        }

      }



      // 调用云函数创建或更新用户

      console.log('开始调用 userLogin 云函数保存用户信息...');

      const loginPayload = {
        loginCode: tempLoginCode,
        avatarUrl: finalAvatarUrl,
        nickName,
        loginMethod: this.data.isUpdatingProfile ? 'update' : 'wechat'
      };

      if (cloudFileID) {
        loginPayload.cloudFileID = cloudFileID;
      }

      const loginResult = await cloudAPI.userLogin(loginPayload);

      console.log('云函数返回结果:', loginResult);
      
      if (loginResult.success) {
        // 保存用户信息 - 确保包含所有必要字段，优先使用本地上传的头像
        const userData = loginResult.data || loginResult.userInfo || {};
        const userInfo = {
          openid: userData.openid || userData._openid,
          nickName: userData.nickName || this.data.nickName,
          avatarUrl: finalAvatarUrl || userData.avatarUrl, // 优先使用本地上传的头像URL
          cloudAvatarFileID: cloudFileID || userData.cloudAvatarFileID || userData.cloudFileID || '',
          role: userData.role || 'user',
          vipExpireDate: userData.vipExpireDate,
          gender: userData.gender || 0,
          city: userData.city || '',
          province: userData.province || '',
          country: userData.country || '',
          avatarUpdateTime: Date.now(), // 记录头像更新时间
          loginTime: new Date().getTime(),
          loginMethod: 'wechat'
        };

        wx.setStorageSync('userInfo', userInfo);
        console.log('用户信息已保存:', userInfo);
        
        wx.hideLoading();
        wx.showToast({
          title: '设置成功',
          icon: 'success'
        });
        
        setTimeout(() => {
          this.navigateBack();
        }, 1500);
      } else {
        const error = new Error(loginResult.message || '设置失败');
        error.cloudResult = loginResult;
        throw error;
      }
      
    } catch (error) {
      wx.hideLoading();
      console.error('完成资料设置失败:', error);
      
      // 显示错误信息
      let errorMsg = '设置失败';
      if (error.message) {
        errorMsg = error.message;
      } else if (error.errMsg) {
        errorMsg = error.errMsg;
      }
      
      wx.showModal({
        title: '设置失败',
        content: `错误信息: ${errorMsg}\n\n请检查网络连接或重试`,
        showCancel: true,
        confirmText: '重试',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            // 重试登录
            this.setData({ showProfileForm: false });
          } else {
            this.setData({ showProfileForm: false });
          }
        }
      });
    }
  },

  /**
   * 将用户选择的头像上传到云存储并返回可访问链接
   */
  async persistAvatar(avatarUrl) {
    const initResult = await cloudInitializer.init();
    if (!initResult.success) {
      throw new Error(initResult.message || '云开发初始化失败');
    }

    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return {
        avatarUrl,
        cloudFileID: ''
      };
    }

    const isCloudFileId = avatarUrl.startsWith('cloud://');
    const isTempFile = avatarUrl.startsWith('wxfile://') || avatarUrl.includes('tmp/');
    let fileID = '';
    let finalUrl = avatarUrl;

    try {
      if (isTempFile) {
        const extensionMatch = avatarUrl.match(/\.[a-zA-Z0-9]+$/);
        const extension = extensionMatch ? extensionMatch[0] : '.png';
        const cloudPath = `avatars/${Date.now()}_${Math.floor(Math.random() * 100000)}${extension}`;

        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        });

        fileID = uploadResult.fileID || '';
      } else if (isCloudFileId) {
        fileID = avatarUrl;
      }

      if (fileID) {
        const tempUrlRes = await wx.cloud.getTempFileURL({
          fileList: [fileID]
        });

        const fileInfo = tempUrlRes.fileList && tempUrlRes.fileList[0];
        if (fileInfo && fileInfo.tempFileURL) {
          finalUrl = fileInfo.tempFileURL;
        }
      }

      return {
        avatarUrl: finalUrl,
        cloudFileID: fileID
      };
    } catch (error) {
      console.error('头像持久化失败:', error);
      return {
        avatarUrl,
        cloudFileID: fileID
      };
    }
  },

  /**
   * Promise化的wx.login
   */
  wxLoginAsync() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      });
    });
  },

  /**
   * 统一的返回导航逻辑
   */
  navigateBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({
          url: '/pages/profile/profile'
        });
      }
    });
  },

  /**
   * 查看用户协议
   */
  openUserAgreement() {
    wx.navigateTo({
      url: '/pages/legal/user-agreement/user-agreement'
    });
  },

  /**
   * 查看隐私政策
   */
  openPrivacyPolicy() {
    wx.navigateTo({
      url: '/pages/legal/privacy-policy/privacy-policy'
    });
  },
});