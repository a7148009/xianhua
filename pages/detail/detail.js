const cloudAPI = require('../../api/cloud-api.js');
const variableManager = require('../../utils/variable-manager.js');

Page({
  data: {
    jobData: {},
    categoriesText: '', // 分类文本
    mapInfo: {
      longitude: 102.712251, // 昆明经度
      latitude: 25.040609    // 昆明纬度
    },
    markers: [],           // 地图标记点
    isSharing: false,      // 分享状态标识
    shareStartTime: null,  // 分享开始时间
    enterTime: null,       // 进入页面时间（用于阅读统计）
    totalViews: 0,         // 总阅读量
    todayViews: 0,         // 今日阅读量

    // 变量数据
    workContentLabel: '鲜花信息', // 鲜花信息标签（与首页共用）
    feeNoticeText: '鲜花配送费用明细公示', // 费用公示标题
    safetyModeText: '鲜花配送费用包括哪些项目？\n配送费用是否包含包装费用？\n订单取消后退款标准是什么？\n鲜花养护服务是否收费？', // 安全模式说明
    safetyTitleText: '鲜花平台交易保障', // 安全保障标题
    warningText: '本平台严禁商家发布虚假鲜花信息、以次充好、虚标价格等违规行为。所有鲜花信息均需真实有效，严禁欺诈消费者。平台承诺对所有交易进行监管，如发现商家违规行为将立即下架并处罚。消费者如遇到商家违规，请立即向平台举报，我们将在24小时内处理并保障您的合法权益。' // 警告提示
  },

  /**
   * 页面加载
   */
  async onLoad(options) {
    // ========================================
    // 步骤0: 立即同步设置页面标题（避免闪烁）
    // ========================================
    this.setPageTitleSync();

    // 加载变量配置
    await this.loadVariables();

    // 记录进入时间
    this.setData({ enterTime: Date.now() });

    // 从 URL 参数中获取数据
    if (options.data) {
      try {
        const item = JSON.parse(decodeURIComponent(options.data));

        // 处理描述数据，保持原始换行格式
        console.log('[detail] 原始描述数据类型:', typeof item.description);
        console.log('[detail] 原始描述数据:', item.description);

        let descriptionArray = [];
        if (!item.description) {
          descriptionArray = ['暂无描述'];
        } else if (Array.isArray(item.description)) {
          // 如果是数组，直接使用
          descriptionArray = item.description;
        } else if (typeof item.description === 'string') {
          // 如果是字符串，先尝试按换行符分割，如果没有换行符则按逗号分割
          if (item.description.includes('\n')) {
            descriptionArray = item.description.split('\n');
          } else if (item.description.includes(',')) {
            descriptionArray = item.description.split(',').map(s => s.trim());
          } else {
            descriptionArray = [item.description];
          }
        } else {
          descriptionArray = [String(item.description)];
        }

        console.log('[detail] 处理后的描述数组:', descriptionArray);

        // 处理标签数据 - 支持新格式（对象数组）和旧格式（字符串数组）
        let tags = [];
        if (Array.isArray(item.tags) && item.tags.length > 0) {
          // 新格式：[{_id, name}, ...] 或旧格式：['标签名', ...]
          tags = item.tags.map(tag => {
            if (typeof tag === 'object' && tag.name) {
              return { _id: tag._id, name: tag.name };
            } else if (typeof tag === 'string') {
              return { name: tag };
            }
            return { name: '标签' };
          });
        }

        // 注意：不再补充默认标签，直接使用数据库中的标签数据

        // 处理地址和地图信息
        const address = item.company_address || item.location || '昆明五华区';

        // 格式化地址：将 company_address 转换为 "昆明市·官渡区·矣六街道·详细地址" 格式
        let formattedAddress = address;
        if (item.company_address) {
          formattedAddress = this.formatAddress(item.company_address);
        }

        // 处理地图信息 - 使用真实的经纬度数据
        const longitude = item.longitude || 102.712251; // 使用数据库中的经度，默认昆明经度
        const latitude = item.latitude || 25.040609;    // 使用数据库中的纬度，默认昆明纬度

        const mapInfo = {
          longitude: longitude,
          latitude: latitude
        };

        // 创建地图标记点（使用系统默认绿色标记）
        const markers = [{
          id: 1,
          longitude: longitude,
          latitude: latitude,
          width: 30,
          height: 30,
          callout: {
            content: item.company_name || '公司位置',
            color: '#333',
            fontSize: 12,
            borderRadius: 5,
            padding: 5,
            display: 'ALWAYS'
          }
        }];

        // 处理分类文本（用 · 连接）
        const categoriesText = item.categories && item.categories.length > 0
          ? item.categories.join(' · ')
          : '';

        // 立即设置数据，无需loading
        this.setData({
          jobData: {
            ...item,
            descriptionArray,
            tags,
            address,
            formattedAddress,  // 添加格式化后的地址
            wechat: item.contact_wechat || item.contact_phone,
            company_scale: item.company_scale || '已上市 · 1000-9999人'
          },
          categoriesText,
          mapInfo,
          markers
        });

        // 加载阅读统计
        this.loadViewStats(item.hash_id);

        console.log('[detail] 从列表页传递的数据已加载');
      } catch (e) {
        console.error('[detail] 解析鲜花数据失败:', e);
        // 解析失败，尝试使用hash_id加载
        if (options.hash_id) {
          this.loadJobDetail(options.hash_id);
        }
      }
    } else if (options.hash_id) {
      // 根据 hash_id 加载详情（分享或直接访问的情况）
      this.loadJobDetail(options.hash_id);
    }
  },

  /**
   * 同步设置页面标题（避免闪烁）
   */
  setPageTitleSync() {
    try {
      // 尝试从本地存储同步读取变量
      const cachedVariables = wx.getStorageSync('system_variables');
      if (cachedVariables && cachedVariables.detail_page_title) {
        wx.setNavigationBarTitle({
          title: cachedVariables.detail_page_title
        });
        console.log('⚡ [性能] 使用缓存变量设置页面标题:', cachedVariables.detail_page_title);
      }
      // 如果没有缓存，使用detail.json中的默认值，不需要再设置
    } catch (error) {
      console.warn('读取缓存变量失败:', error);
      // 失败也没关系，会使用detail.json中的默认值
    }
  },

  /**
   * 加载变量配置
   */
  async loadVariables() {
    try {
      const variables = await variableManager.getAllVariables();

      // 处理安全模式文本：将换行符转换为数组
      const safetyModeText = variables.detail_safety_mode || '鲜花配送费用包括哪些项目？\n配送费用是否包含包装费用？\n订单取消后退款标准是什么？\n鲜花养护服务是否收费？';
      const safetyModeLines = safetyModeText.split('\n').filter(line => line.trim());

      this.setData({
        workContentLabel: variables.home_work_content_label || '鲜花信息', // 使用首页的鲜花信息变量
        feeNoticeText: variables.detail_fee_notice || '鲜花配送费用明细公示',
        safetyModeLines: safetyModeLines,
        safetyTitleText: variables.detail_safety_title || '鲜花平台交易保障',
        warningText: variables.detail_warning_text || '本平台严禁商家发布虚假鲜花信息、以次充好、虚标价格等违规行为。所有鲜花信息均需真实有效，严禁欺诈消费者。平台承诺对所有交易进行监管，如发现商家违规行为将立即下架并处罚。消费者如遇到商家违规，请立即向平台举报，我们将在24小时内处理并保障您的合法权益。'
      });

      // 动态设置页面标题
      const pageTitle = variables.detail_page_title || '鲜花信息详情';
      wx.setNavigationBarTitle({
        title: pageTitle
      });

      console.log('✅ [变量] 详情页变量加载成功');
    } catch (error) {
      console.error('❌ [变量] 加载详情页变量失败:', error);
      // 静默失败，使用默认值
      // 使用默认值处理safetyModeText
      const defaultSafetyMode = '鲜花配送费用包括哪些项目？\n配送费用是否包含包装费用？\n订单取消后退款标准是什么？\n鲜花养护服务是否收费？';
      this.setData({
        safetyModeLines: defaultSafetyMode.split('\n').filter(line => line.trim())
      });
    }
  },

  /**
   * 页面显示
   */
  onShow() {
    // 隐藏 tabBar，因为详情页不应该显示底部导航
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: -1  // 设置为 -1 表示不选中任何项
      });
    }

    // 检测分享状态
    if (this.data.isSharing && this.data.shareStartTime) {
      const shareDuration = Date.now() - this.data.shareStartTime;
      this.setData({
        isSharing: false,
        shareStartTime: null
      });

      if (shareDuration > 500) {
        wx.showToast({
          title: '分享成功！',
          icon: 'success',
          duration: 2000
        });
      } else {
        wx.showToast({
          title: '放弃分享',
          icon: 'none',
          duration: 2000
        });
      }
    } else if (this.data.isSharing) {
      this.setData({ isSharing: false });
      wx.showToast({
        title: '放弃分享',
        icon: 'none',
        duration: 2000
      });
    }
  },

  /**
   * 微信小程序分享功能
   */
  onShareAppMessage(options) {
    this.setData({ isSharing: true });

    const shareData = {
      title: this.data.jobData.title || '鲜花信息详情',
      path: '/pages/detail/detail?data=' + encodeURIComponent(JSON.stringify(this.data.jobData)),
      imageUrl: '' // 可以设置分享图片
    };

    if (options && options.from === 'button') {
      setTimeout(() => {
        if (this.data.isSharing) {
          this.setData({ isSharing: false });
        }
      }, 3000);
    }

    return shareData;
  },

  /**
   * 根据hash_id加载鲜花详情
   */
  async loadJobDetail(hashId) {
    try {
      wx.showLoading({ title: '加载中...' });
      const result = await cloudAPI.getItemDetail(hashId);

      if (result.success) {
        const data = result.data;

        // 处理描述数据，保持原始换行格式
        console.log('[detail] loadJobDetail - 原始描述数据类型:', typeof data.description);
        console.log('[detail] loadJobDetail - 原始描述数据:', data.description);

        let descriptionArray = [];
        if (!data.description) {
          descriptionArray = ['暂无描述'];
        } else if (Array.isArray(data.description)) {
          // 如果是数组，直接使用
          descriptionArray = data.description;
        } else if (typeof data.description === 'string') {
          // 如果是字符串，按换行符分割
          descriptionArray = data.description.split('\n');
        } else {
          descriptionArray = [String(data.description)];
        }

        console.log('[detail] loadJobDetail - 处理后的描述数组:', descriptionArray);

        // 标签数据：云函数已经处理好了，直接使用
        const tags = Array.isArray(data.tags) ? data.tags : [];

        // 添加招聘人首字母
        const recruiterInitial = data.contact_name
          ? data.contact_name.charAt(0)
          : '招';

        // 处理地址和地图信息
        const address = data.company_address || data.location || '昆明五华区镇国大厦';

        // 格式化地址：将 company_address 转换为 "昆明市·官渡区·矣六街道·详细地址" 格式
        let formattedAddress = address;
        if (data.company_address) {
          formattedAddress = this.formatAddress(data.company_address);
        }

        // 处理地图信息 - 使用真实的经纬度数据
        const longitude = data.longitude || 102.712251; // 使用数据库中的经度，默认昆明经度
        const latitude = data.latitude || 25.040609;    // 使用数据库中的纬度，默认昆明纬度

        const mapInfo = {
          longitude: longitude,
          latitude: latitude
        };

        // 创建地图标记点（使用系统默认绿色标记）
        const markers = [{
          id: 1,
          longitude: longitude,
          latitude: latitude,
          width: 30,
          height: 30,
          callout: {
            content: data.company_name || '公司位置',
            color: '#333',
            fontSize: 12,
            borderRadius: 5,
            padding: 5,
            display: 'ALWAYS'
          }
        }];

        // 处理分类文本（用 · 连接）
        const categoriesText = data.categories && data.categories.length > 0
          ? data.categories.join(' · ')
          : '';

        this.setData({
          jobData: {
            ...data,
            descriptionArray,
            tags,
            recruiterInitial,
            responseTime: '16分钟回应',
            replyCount: '今日回复10次+',
            address,
            formattedAddress,  // 添加格式化后的地址
            // 字段映射
            wechat: data.contact_wechat || data.contact_phone,
            company_scale: data.company_scale || '已上市 · 1000-9999人'
          },
          categoriesText,
          mapInfo,
          markers
        });

        // 刷新阅读统计
        this.loadViewStats(data.hash_id);

        console.log('[detail] 加载鲜花详情成功:', this.data.jobData);
      } else {
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        });
        wx.navigateBack();
      }
    } catch (error) {
      console.error('[detail] 加载鲜花详情失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      wx.navigateBack();
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 格式化地址
   * 将 "云南省昆明市官渡区矣六街道王官段矣六村二组406号"
   * 转换为 "昆明市·官渡区·矣六街道·王官段矣六村二组406号"
   */
  formatAddress(address) {
    if (!address) return '';

    // 去掉省份（云南省、四川省等）
    let formatted = address.replace(/^[^省]+省/, '');

    // 提取市、区、街道、详细地址
    const cityMatch = formatted.match(/^([^市]+市)/);
    const districtMatch = formatted.match(/市([^区县]+[区县])/);
    const streetMatch = formatted.match(/[区县]([^街道]+街道)/);

    const city = cityMatch ? cityMatch[1] : '';
    const district = districtMatch ? districtMatch[1] : '';
    const street = streetMatch ? streetMatch[1] : '';

    // 详细地址（去掉前面的市区街道部分）
    let detailAddress = formatted
      .replace(city, '')
      .replace(district, '')
      .replace(street, '');

    // 组合格式化地址
    const parts = [city, district, street, detailAddress].filter(p => p);
    return parts.join('·');
  },

  /**
   * 点击地图标记
   */
  onMarkerTap(e) {
    console.log('[detail] 点击了标记点:', e);
  },

  /**
   * 打开位置
   */
  openLocation() {
    wx.openLocation({
      longitude: this.data.mapInfo.longitude,
      latitude: this.data.mapInfo.latitude,
      name: this.data.jobData.company_name || '公司名称',
      address: this.data.jobData.address || '昆明五华区镇国大厦',
      success: function() {
        console.log('[detail] 打开地图成功');
      },
      fail: function() {
        console.log('[detail] 打开地图失败');
      }
    });
  },

  /**
   * 复制微信号（带VIP权限检查）
   */
  async copyWechat() {
    const wechatId = this.data.jobData.wechat || this.data.jobData.contact_phone || 'flower_001';
    const accessLevel = this.data.jobData.access_level; // 获取访问权限

    // 如果是VIP专属信息，需要检查用户VIP状态
    if (accessLevel === 'vip') {
      try {
        // 检查用户登录状态
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo || !userInfo.openid) {
          wx.showModal({
            title: '需要登录',
            content: '请先登录后再查看VIP信息',
            confirmText: '去登录',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({
                  url: '/pages/profile/profile'
                });
              }
            }
          });
          return;
        }

        // 调用云函数检查VIP状态
        const result = await wx.cloud.callFunction({
          name: 'vipManager',
          data: {
            action: 'checkVIP',
            openid: userInfo.openid
          }
        });

        if (!result.result || !result.result.success || !result.result.isVIP) {
          // 不是VIP，显示VIP特权弹窗
          this.showVIPPrivilegeModal();
          return;
        }

        // 是VIP，继续复制微信号
      } catch (error) {
        console.error('[detail] 检查VIP状态失败:', error);
        wx.showToast({
          title: '检查权限失败',
          icon: 'none'
        });
        return;
      }
    }

    // 普通信息或VIP用户，直接复制微信号
    wx.setClipboardData({
      data: wechatId,
      success: () => {
        wx.showToast({
          title: `已复制微信号${wechatId}`,
          icon: 'success',
          duration: 2000
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'error'
        });
      }
    });
  },

  /**
   * 拨打电话（带VIP权限检查）
   */
  async makeCall() {
    const phoneNumber = this.data.jobData.contact_phone || '13888888001';
    const accessLevel = this.data.jobData.access_level; // 获取访问权限

    // 如果是VIP专属信息，需要检查用户VIP状态
    if (accessLevel === 'vip') {
      try {
        // 检查用户登录状态
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo || !userInfo.openid) {
          wx.showModal({
            title: '需要登录',
            content: '请先登录后再查看VIP信息',
            confirmText: '去登录',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({
                  url: '/pages/profile/profile'
                });
              }
            }
          });
          return;
        }

        // 调用云函数检查VIP状态
        const result = await wx.cloud.callFunction({
          name: 'vipManager',
          data: {
            action: 'checkVIP',
            openid: userInfo.openid
          }
        });

        if (!result.result || !result.result.success || !result.result.isVIP) {
          // 不是VIP，显示VIP特权弹窗
          this.showVIPPrivilegeModal();
          return;
        }

        // 是VIP，继续拨打电话
      } catch (error) {
        console.error('[detail] 检查VIP状态失败:', error);
        wx.showToast({
          title: '检查权限失败',
          icon: 'none'
        });
        return;
      }
    }

    // 普通信息或VIP用户，直接拨打电话
    wx.makePhoneCall({
      phoneNumber: phoneNumber,
      success: () => {
        console.log('[detail] 拨打电话成功');
      },
      fail: () => {
        wx.showToast({
          title: '拨打电话失败',
          icon: 'error'
        });
      }
    });
  },

  /**
   * 显示VIP特权弹窗
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
   * 页面隐藏时记录阅读
   */
  onHide() {
    // 判断是否去分享
    if (this.data.isSharing) {
      this.setData({
        shareStartTime: Date.now()
      });
    }

    // 记录阅读时长
    this.recordViewDuration();
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    try {
      console.log('[detail] 开始下拉刷新');

      // 如果有 hash_id，并行刷新变量和详情数据
      if (this.data.jobData.hash_id) {
        await Promise.all([
          this.loadVariables(),                             // 刷新详情页变量（工作内容标签、费用公示、安全保障、警告提示、页面标题）
          this.loadJobDetail(this.data.jobData.hash_id)    // 刷新鲜花详情
        ]);

        wx.showToast({
          title: '刷新成功',
          icon: 'success',
          duration: 1500
        });
      }
    } catch (error) {
      console.error('[detail] 下拉刷新失败:', error);
      wx.showToast({
        title: '刷新失败',
        icon: 'none',
        duration: 1500
      });
    } finally {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 页面卸载时记录阅读
   */
  onUnload() {
    this.recordViewDuration();
  },

  /**
   * 记录阅读时长
   */
  async recordViewDuration() {
    if (!this.data.enterTime || !this.data.jobData.hash_id) {
      console.warn('[detail] 无法记录阅读: enterTime=', this.data.enterTime, 'hash_id=', this.data.jobData.hash_id);
      return;
    }

    const duration = Math.floor((Date.now() - this.data.enterTime) / 1000);
    console.log(`[detail] 准备记录阅读: hash_id=${this.data.jobData.hash_id}, duration=${duration}秒`);

    // 只记录一次
    if (duration > 0) {
      this.setData({ enterTime: null });

      try {
        const result = await wx.cloud.callFunction({
          name: 'viewStatistics',
          data: {
            action: 'record',
            jobId: this.data.jobData.hash_id,
            duration
          }
        });
        console.log(`[detail] 记录阅读返回结果:`, result.result);

        // 如果记录成功，立即刷新统计数据
        if (result.result && result.result.success) {
          console.log('[detail] 记录成功，刷新统计数据');
          await this.loadViewStats(this.data.jobData.hash_id);
        } else {
          console.warn('[detail] 记录失败:', result.result?.message);
        }
      } catch (err) {
        console.error('[detail] 记录阅读失败:', err);
      }
    }
  },

  /**
   * 加载阅读统计
   */
  async loadViewStats(jobId) {
    if (!jobId) {
      console.warn('[detail] loadViewStats 缺少 jobId');
      return;
    }

    console.log(`[detail] 开始加载阅读统计: jobId=${jobId}`);

    try {
      const result = await wx.cloud.callFunction({
        name: 'viewStatistics',
        data: {
          action: 'getStats',
          jobId
        }
      });

      console.log('[detail] 加载阅读统计返回:', result.result);

      if (result.result && result.result.success) {
        this.setData({
          totalViews: result.result.data.totalViews || 0,
          todayViews: result.result.data.todayViews || 0
        });
        console.log(`[detail] 统计数据已更新: 总阅读=${result.result.data.totalViews}, 今日阅读=${result.result.data.todayViews}`);
      }
    } catch (err) {
      console.error('[detail] 加载阅读统计失败:', err);
    }
  }
});
