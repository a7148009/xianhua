// pages/admin/user-management.js
const { cloudAPI } = require('../../../api/CloudAPI.js');

Page({
  data: {
    currentUser: null,
    userList: [],
    searchKeyword: '',
    loading: false,
    initialLoading: true, // 首次加载标记
    hasMore: true,
    page: 1,
    limit: 20,
    showUserSettingModal: false,
    showVipModal: false,
    selectedUser: null,
    newRole: '',
    vipDuration: null,
    vipExpireTime: '', // 添加VIP到期时间显示字段
    totalUsers: 0,
    adminCount: 0,
    vipCount: 0,
    userCount: 0,
    publisherCount: 0,
    currentFilter: 'all',
    filterTitle: '所有用户',
    // TabBar 数据
    tabBarSelected: 0,
    tabBarColor: "#8a8a8a",
    tabBarSelectedColor: "#FF6B35",
    tabBarList: [
      {
        pagePath: "/pages/admin/user-management/user-management",
        text: "用户管理",
        emoji: "👥",
        selectedEmoji: "👥"
      },
      {
        pagePath: "/pages/admin/system-settings/system-settings",
        text: "系统设置",
        emoji: "⚙️",
        selectedEmoji: "⚙️"
      }
    ]
  },

  onLoad() {
    this.getCurrentUser();

    // 🚀 优化：立即显示统计数据的初始值（0），然后并行加载真实数据
    this.setData({
      totalUsers: 0,
      adminCount: 0,
      vipCount: 0,
      userCount: 0,
      publisherCount: 0
    });

    // 并行加载数据，不显示loading
    Promise.all([
      this.loadUserList(true),
      this.loadFullStats()
    ]).finally(() => {
      this.setData({ initialLoading: false });
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser() {
    try {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo && userInfo.role === 'admin') {
        this.setData({ currentUser: userInfo });
      } else {
        wx.showModal({
          title: '权限不足',
          content: '您没有访问此页面的权限',
          showCancel: false,
          success: () => {
            wx.navigateBack();
          }
        });
      }
    } catch (error) {
      console.error('获取用户信息失败:', error);
    }
  },

  /**
   * 用户设置
   */
  onUserSetting(e) {
    const user = e.currentTarget.dataset.user;
    console.log('打开用户设置弹窗，用户信息:', {
      openid: user.openid,
      nickName: user.nickName,
      role: user.role
    });
    
    this.setData({
      selectedUser: {
        ...user,
        role: user.role || 'user' // 确保角色有默认值
      },
      newRole: user.role || 'user',
      showUserSettingModal: true
    });
  },

  /**
   * 取消用户设置
   */
  onCancelUserSetting() {
    this.setData({
      showUserSettingModal: false,
      selectedUser: null,
      newRole: ''
    });
  },

  /**
   * 选择角色 - 自动保存
   */
  async selectRole(e) {
    const role = e.currentTarget.dataset.role;
    console.log('选择新角色:', {
      原角色: this.data.selectedUser.role,
      新角色: role
    });

    const selectedUser = this.data.selectedUser;

    // 检查管理员保护机制
    if (selectedUser.role === 'admin' && role !== 'admin' && this.data.adminCount <= 1) {
      console.log('⚠️ 触发管理员保护机制');
      wx.showModal({
        title: '操作不允许',
        content: '系统必须至少保留一个管理员用户。',
        showCancel: false
      });
      return;
    }

    // 如果角色没有变化，直接关闭弹窗
    if (selectedUser.role === role) {
      console.log('角色未发生变化，关闭弹窗');
      this.onCancelUserSetting();
      return;
    }

    console.log('=== 开始执行角色变更 ===');

    // 角色共存逻辑：
    // 1. 如果当前是VIP，设置为admin，则保留VIP状态
    // 2. 如果当前是admin，设置为VIP，则保留admin状态
    // 3. 其他情况直接覆盖角色
    let finalRole = role;
    let keepVipStatus = false;

    if (selectedUser.role === 'vip' && role === 'admin') {
      // VIP -> admin: 保留VIP状态，设置为admin+vip
      finalRole = 'admin';
      keepVipStatus = true;
      console.log('VIP用户设置为admin，将保留VIP状态');
    } else if (selectedUser.role === 'admin' && role === 'vip') {
      // admin -> vip: 这种情况不应该发生，因为应该通过"设为VIP"按钮
      // 但如果发生了，我们认为是要给admin添加VIP，保留admin角色
      wx.showModal({
        title: '提示',
        content: '管理员用户请使用"设为VIP"按钮来添加VIP权限',
        showCancel: false
      });
      this.onCancelUserSetting();
      return;
    }

    await this.executeRoleChange(selectedUser, finalRole, null, keepVipStatus);
    this.onCancelUserSetting();
  },

  /**
   * 确认用户设置
   */
  async onConfirmUserSetting() {
    console.log('🔔 点击了确认按钮！');
    console.log('当前data:', {
      newRole: this.data.newRole,
      selectedUser: this.data.selectedUser
    });

    if (!this.data.newRole) {
      console.log('❌ 没有选择角色');
      wx.showToast({
        title: '请选择角色',
        icon: 'none'
      });
      return;
    }

    const selectedUser = this.data.selectedUser;
    const newRole = this.data.newRole;

    console.log('=== 确认角色设置 ===');
    console.log('用户:', selectedUser.nickName);
    console.log('当前角色:', selectedUser.role);
    console.log('新角色:', newRole);
    console.log('是否修改:', selectedUser.role !== newRole);

    // 检查管理员保护机制
    if (selectedUser.role === 'admin' && newRole !== 'admin' && this.data.adminCount <= 1) {
      console.log('⚠️ 触发管理员保护机制');
      wx.showModal({
        title: '操作不允许',
        content: '系统必须至少保留一个管理员用户。',
        showCancel: false
      });
      return;
    }

    // 如果角色没有变化，直接关闭弹窗
    if (selectedUser.role === newRole) {
      console.log('角色未发生变化，无需更新');
      this.onCancelUserSetting();
      return;
    }

    console.log('=== 开始执行角色变更 ===');
    await this.executeRoleChange(selectedUser, newRole);
    this.onCancelUserSetting();
  },

  /**
   * 设置VIP
   */
  onSetVip(e) {
    const user = e.currentTarget.dataset.user;
    this.setData({
      selectedUser: user,
      vipDuration: null,
      showVipModal: true
    });
  },

  /**
   * 取消VIP设置
   */
  onCancelVipSetting() {
    this.setData({
      showVipModal: false,
      selectedUser: null,
      vipDuration: null,
      vipExpireTime: ''
    });
  },

  /**
   * 选择VIP时长 - 自动保存
   */
  async selectVipDuration(e) {
    const duration = parseInt(e.currentTarget.dataset.duration);
    console.log('选择VIP时长:', duration);

    if (!duration) {
      wx.showToast({
        title: '请选择VIP时长',
        icon: 'none'
      });
      return;
    }

    const now = new Date();
    let expireDate;

    // 根据选择的月数计算到期时间
    switch(duration) {
      case 1:
        expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 3:
        expireDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case 6:
        expireDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
        break;
      case 12:
        expireDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        expireDate = new Date(now.getTime() + duration * 30 * 24 * 60 * 60 * 1000);
    }

    // 格式化显示时间
    const vipExpireTime = this.formatTime(expireDate.toISOString());

    // 更新选中状态和显示的到期时间
    this.setData({
      vipDuration: duration,
      vipExpireTime: vipExpireTime
    });

    console.log('=== 设置VIP ===');
    console.log('用户:', this.data.selectedUser.nickName);
    console.log('当前角色:', this.data.selectedUser.role);
    console.log('VIP时长(月):', duration);
    console.log('到期时间:', expireDate.toISOString());

    // VIP设置逻辑：
    // 1. 如果当前是admin，保留admin角色，只添加VIP到期时间
    // 2. 其他角色直接设置为VIP
    let targetRole = 'vip';
    let keepAdminStatus = false;

    if (this.data.selectedUser.role === 'admin') {
      targetRole = 'admin'; // 保持admin角色不变
      keepAdminStatus = true;
      console.log('admin用户设置VIP，将保留admin角色');
    }

    await this.executeRoleChange(this.data.selectedUser, targetRole, expireDate.toISOString(), keepAdminStatus);
    this.onCancelVipSetting();
  },

  /**
   * 计算VIP到期时间
   */
  calculateVipExpireDate(months) {
    if (!months) return '';
    const now = new Date();
    let expireDate;
    
    // 根据月数计算天数
    switch(months) {
      case 1:
        expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 3:
        expireDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case 6:
        expireDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
        break;
      case 12:
        expireDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        expireDate = new Date(now.getTime() + months * 30 * 24 * 60 * 60 * 1000);
    }
    
    return this.formatTime(expireDate);
  },

  /**
   * 确认VIP设置
   */
  async onConfirmVipSetting() {
    if (!this.data.vipDuration) {
      wx.showToast({
        title: '请选择VIP时长',
        icon: 'none'
      });
      return;
    }

    const now = new Date();
    let expireDate;

    // 根据选择的月数计算到期时间
    switch(this.data.vipDuration) {
      case 1:
        expireDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case 3:
        expireDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case 6:
        expireDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
        break;
      case 12:
        expireDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        expireDate = new Date(now.getTime() + this.data.vipDuration * 30 * 24 * 60 * 60 * 1000);
    }

    console.log('=== 设置VIP ===');
    console.log('用户:', this.data.selectedUser.nickName);
    console.log('VIP时长(月):', this.data.vipDuration);
    console.log('到期时间:', expireDate.toISOString());

    await this.executeRoleChange(this.data.selectedUser, 'vip', expireDate.toISOString());
    this.onCancelVipSetting();
  },

  /**
   * 加载用户列表
   */
  async loadUserList(refresh = false) {
    if (this.data.loading) return;

    try {
      // 🚀 优化：只在下拉刷新或加载更多时显示loading，首次加载不显示
      if (!this.data.initialLoading) {
        this.setData({ loading: true });
      }

      const page = refresh ? 1 : this.data.page;

      // 根据当前筛选条件构建请求参数
      let requestParams = {
        action: 'getUserList',
        page: page,
        limit: this.data.limit,
        keyword: this.data.searchKeyword
      };

      // 如果是筛选特定角色，添加角色筛选参数
      if (this.data.currentFilter !== 'all') {
        requestParams.roleFilter = this.data.currentFilter;
      }

      console.log('📤 请求用户列表，参数:', requestParams);

      const result = await cloudAPI.userRoleManager(requestParams);

      console.log('📥 云函数返回结果:', result);

      if (result.success) {
        const newUsers = result.data.users;

        console.log('✅ 获取到用户数量:', newUsers.length, '总数:', result.data.total);

        // 调试：打印第一个用户的数据，查看字段是否存在
        if (newUsers.length > 0) {
          console.log('===== 用户数据示例 =====');
          console.log('第一个用户的完整数据:', newUsers[0]);
          console.log('openid:', newUsers[0].openid);
          console.log('nickName:', newUsers[0].nickName);
          console.log('loginTime:', newUsers[0].loginTime);
          console.log('vipExpireDate:', newUsers[0].vipExpireDate);
          console.log('role:', newUsers[0].role);
        } else {
          console.log('⚠️ 未获取到任何用户数据');
        }

        // 简化处理：直接使用云函数返回的数据，云函数已经处理了头像
        const userList = refresh ? newUsers : [...this.data.userList, ...newUsers];

        // 🚀 优化：如果是首次加载，统计数据已经在并行加载了
        if (!this.data.initialLoading) {
          await this.loadFullStats();
        }

        this.setData({
          userList: userList,
          hasMore: result.data.hasMore,
          page: refresh ? 2 : this.data.page + 1
        });

        console.log('✅ 用户列表加载成功，共', userList.length, '个用户');
      } else {
        console.error('❌ 加载失败:', result.message);
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载用户列表失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 加载完整统计数据
   */
  async loadFullStats() {
    try {
      const result = await cloudAPI.userRoleManager({
        action: 'getUserStats'
      });

      if (result.success) {
        // 🚀 优化：数据返回后立即更新，无loading
        this.setData({
          totalUsers: result.data.total || 0,
          adminCount: result.data.adminCount || 0,
          vipCount: result.data.vipCount || 0,
          userCount: result.data.userCount || 0,
          publisherCount: result.data.publisherCount || 0
        });
        console.log('✅ 统计数据已更新:', result.data);
      }
    } catch (error) {
      console.error('⚠️ 加载统计数据失败:', error);
      // 静默失败，保持初始值
    }
  },

  /**
   * 统计各角色数量
   */
  calculateRoleStats(userList) {
    const stats = {
      adminCount: 0,
      vipCount: 0,
      userCount: 0,
      publisherCount: 0
    };
    
    userList.forEach(user => {
      switch (user.role) {
        case 'admin':
          stats.adminCount++;
          break;
        case 'vip':
          stats.vipCount++;
          break;
        case 'publisher':
          stats.publisherCount++;
          break;
        default:
          stats.userCount++;
      }
    });
    
    this.setData(stats);
  },

  /**
   * 点击统计卡片筛选用户
   */
  onFilterByRole(e) {
    const role = e.currentTarget.dataset.role;
    let filterTitle = '';

    switch (role) {
      case 'all':
        filterTitle = '所有用户';
        break;
      case 'admin':
        filterTitle = '管理员用户';
        break;
      case 'vip':
        filterTitle = 'VIP用户';
        break;
      case 'user':
        filterTitle = '普通用户';
        break;
      case 'publisher':
        filterTitle = '发布者用户';
        break;
    }

    console.log('🔍 筛选用户，角色:', role, '标题:', filterTitle);

    this.setData({
      currentFilter: role,
      filterTitle: filterTitle,
      searchKeyword: '', // 清空搜索关键词
      page: 1,
      userList: [],
      hasMore: true,
      initialLoading: false // 🚀 筛选时不是首次加载，显示loading
    });

    this.loadUserList(true);
  },

  /**
   * 搜索用户
   */
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
  },

  /**
   * 执行搜索
   */
  async onSearch() {
    this.setData({ 
      page: 1,
      userList: []
    });
    await this.loadUserList(true);
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({ 
      searchKeyword: '',
      page: 1,
      userList: []
    });
    this.loadUserList(true);
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadUserList(true);
    wx.stopPullDownRefresh();
  },

  /**
   * 上拉加载更多
   */
  async onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      await this.loadUserList();
    }
  },



  /**
   * 执行角色变更
   */
  async executeRoleChange(user, newRole, vipExpireDate = null, keepCurrentStatus = false) {
    try {
      wx.showLoading({ title: '设置中...' });

      console.log('==================== 开始设置用户角色 ====================');
      console.log('目标用户:', {
        openid: user.openid,
        nickName: user.nickName,
        currentRole: user.role,
        currentVipExpireDate: user.vipExpireDate
      });
      console.log('新角色:', newRole);
      console.log('VIP到期:', vipExpireDate);
      console.log('保留当前状态:', keepCurrentStatus);

      // 构建请求参数
      const params = {
        action: 'setUserRole',
        targetOpenid: user.openid,
        newRole: newRole
      };

      // 如果需要保留VIP状态或设置新的VIP到期时间
      if (vipExpireDate) {
        params.vipExpireDate = vipExpireDate;
      } else if (keepCurrentStatus && user.vipExpireDate) {
        // 保留原有的VIP到期时间
        params.vipExpireDate = user.vipExpireDate;
        console.log('保留原有VIP到期时间:', user.vipExpireDate);
      }

      console.log('云函数请求参数:', params);

      // 调用云函数更新用户角色
      const result = await cloudAPI.userRoleManager(params);

      console.log('云函数返回结果:', JSON.stringify(result, null, 2));

      wx.hideLoading();

      if (result.success) {
        console.log('✅ 角色设置成功');

        wx.showToast({
          title: '角色设置成功',
          icon: 'success',
          duration: 2000
        });

        // 立即更新本地用户列表中的对应用户
        const userList = this.data.userList.map(item => {
          if (item.openid === user.openid) {
            const updatedUser = {
              ...item,
              role: newRole,
              vipExpireDate: vipExpireDate || item.vipExpireDate
            };
            console.log('本地用户信息已更新:', {
              openid: updatedUser.openid,
              nickName: updatedUser.nickName,
              oldRole: item.role,
              newRole: updatedUser.role
            });
            return updatedUser;
          }
          return item;
        });

        this.setData({ userList });

        // 重新加载统计数据
        await this.loadFullStats();

        // 延迟1秒后刷新列表，确保数据库已更新
        setTimeout(async () => {
          console.log('刷新用户列表...');
          await this.loadUserList(true);
        }, 1000);

      } else {
        console.error('❌ 角色设置失败:', result.message);

        wx.showModal({
          title: '设置失败',
          content: result.message || '角色设置失败，请重试',
          showCancel: false
        });
      }

    } catch (error) {
      wx.hideLoading();
      console.error('==================== 角色设置异常 ====================');
      console.error('错误对象:', error);
      console.error('错误消息:', error.message);
      console.error('错误堆栈:', error.stack);

      wx.showModal({
        title: '设置失败',
        content: '发生错误: ' + (error.message || '未知错误'),
        showCancel: false
      });
    }
  },

  /**
   * 获取角色显示名称
   */
  getRoleName(role) {
    const roleMap = {
      'admin': '管理员',
      'vip': 'VIP用户',
      'user': '普通用户',
      'publisher': '发布者'
    };
    return roleMap[role] || '普通用户';
  },

  /**
   * 获取角色样式类
   */
  getRoleClass(role) {
    const roleClassMap = {
      'admin': 'role-admin',
      'vip': 'role-vip',
      'user': 'role-user',
      'publisher': 'role-publisher'
    };
    return roleClassMap[role] || 'role-user';
  },

  /**
   * 头像加载失败处理
   */
  onAvatarError(e) {
    const openid = e.currentTarget.dataset.openid;
    const index = e.currentTarget.dataset.index;
    console.log('头像加载失败:', openid, e.detail);
    
    // 当头像加载失败时，为该用户生成默认头像
    const userList = this.data.userList;
    if (index !== undefined && userList[index]) {
      const user = userList[index];
      const defaultAvatar = this.generateDefaultAvatar(user);
      
      // 更新列表中该用户的头像
      userList[index].avatarUrl = defaultAvatar;
      
      this.setData({ userList });
      
      console.log(`为用户 ${user.nickName} 生成默认头像:`, defaultAvatar);
    }
  },

  /**
   * 生成默认头像
   */
  generateDefaultAvatar(user) {
    // 获取用户昵称首字母
    const firstChar = (user.nickName || '用').charAt(0);
    
    // 根据openid生成稳定的颜色
    const hash = this.hashCode(user.openid || '');
    const colorIndex = Math.abs(hash) % 10;
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    
    const backgroundColor = colors[colorIndex];
    
    // 返回基于UI Avatars的默认头像
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(firstChar)}&background=${backgroundColor.substring(1)}&color=fff&size=200&bold=true&format=png`;
  },

  /**
   * 字符串哈希函数
   */
  hashCode(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash;
  },



  /**
   * 复制OpenID
   */
  copyOpenid(e) {
    const openid = e.currentTarget.dataset.openid;
    if (!openid) {
      wx.showToast({
        title: 'OpenID为空',
        icon: 'none'
      });
      return;
    }
    
    wx.setClipboardData({
      data: openid,
      success: () => {
        wx.showToast({
          title: 'OpenID已复制',
          icon: 'success',
          duration: 1500
        });
        console.log('复制成功:', openid);
      },
      fail: (error) => {
        console.error('复制失败:', error);
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  /**
   * 格式化时间显示
   */
  formatTime(dateStr) {
    if (!dateStr) return '未设置';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '无效时间';
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (error) {
      console.error('时间格式化失败:', error);
      return '格式错误';
    }
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack();
  },

  /**
   * 自动检查并修复数据库
   */
  async fixDatabaseIfNeeded() {
    try {
      console.log('检查数据库状态...');
      
      const result = await cloudAPI.databaseFix();
      
      if (result.success) {
        console.log('数据库检查完成:', result.message);
        // 重新加载数据
        this.loadUserList(true);
        this.loadFullStats();
      } else {
        console.warn('数据库检查失败:', result.message);
      }
    } catch (error) {
      console.error('数据库检查出错:', error);
    }
  },

  /**
   * 手动修复数据库
   */
  async manualFixDatabase() {
    try {
      wx.showLoading({ title: '修复数据库中...' });
      
      const result = await cloudAPI.databaseFix();
      
      if (result.success) {
        wx.showToast({
          title: '数据库修复成功',
          icon: 'success'
        });
        
        // 重新加载数据
        this.loadUserList(true);
        this.loadFullStats();
        
        console.log('数据库修复结果:', result);
      } else {
        wx.showToast({
          title: '修复失败: ' + result.message,
          icon: 'none',
          duration: 3000
        });
      }
    } catch (error) {
      console.error('手动修复数据库失败:', error);
      wx.showToast({
        title: '修复失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 数据库权限检查
   */
  async checkDatabasePermissions() {
    try {
      wx.showLoading({ title: '检查数据库权限...' });

      const result = await wx.cloud.callFunction({
        name: 'databasePermissionTest',
        data: { action: 'checkPermissions' }
      });

      if (result.result && result.result.success) {
        const data = result.result.data;
        const summary = data.summary;

        let message = '数据库权限检查结果:\n';
        message += `读取: ${data.canRead ? '✅' : '❌'}\n`;
        message += `写入: ${data.canWrite ? '✅' : '❌'}\n`;
        message += `更新: ${data.canUpdate ? '✅' : '❌'}\n`;
        message += `删除: ${data.canDelete ? '✅' : '❌'}\n`;

        if (data.updateVerified !== undefined) {
          message += `更新验证: ${data.updateVerified ? '✅' : '❌'}\n`;
        }

        if (data.errors.length > 0) {
          message += '\n错误信息:\n' + data.errors.slice(0, 3).join('\n');
        }

        wx.showModal({
          title: summary.allPermissions ? '权限正常' : '权限异常',
          content: message,
          showCancel: false
        });

        console.log('数据库权限检查结果:', data);
      } else {
        wx.showToast({
          title: '权限检查失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('数据库权限检查失败:', error);
      wx.showToast({
        title: '检查失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * TabBar 切换
   */
  switchTab(e) {
    const data = e.currentTarget.dataset;
    const url = data.path;
    const index = data.index;

    // 如果点击的是当前页面，不进行跳转
    if (index === this.data.tabBarSelected) {
      return;
    }

    // 立即更新选中状态，提供即时视觉反馈
    this.setData({ tabBarSelected: index });

    // 使用 redirectTo 进行页面跳转
    wx.redirectTo({
      url,
      fail: (err) => {
        console.error('页面跳转失败:', err);
        // 恢复原来的选中状态
        this.setData({ tabBarSelected: 0 });
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        });
      }
    });
  }
});
