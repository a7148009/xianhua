const cloudAPI = require('../../api/cloud-api.js');
const cacheManager = require('../../utils/cache-manager.js');
const variableManager = require('../../utils/variable-manager.js');

Page({
  data: {
    currentType: '', // 当前选中的类型ID（_id）
    currentTypeName: '', // 当前选中的类型名称（用于显示）
    currentArea: '', // 当前选中的地区ID（_id）
    currentAreaName: '', // 当前选中的地区名称（用于显示）
    keyword: '',

    jobList: [],
    loading: false,
    smartLoading: false, // 智能加载状态：只有超过300ms才显示
    currentPage: 1,
    totalCount: 0,
    hasMore: true,

    // 动态配置数据
    categoryList: [], // 信息分类列表（包含_id和name）
    areaList: [], // 行政区域列表（包含_id和name）
    vipCategoryName: '', // VIP分类名称

    // 骨架屏状态
    showSkeleton: true, // 默认显示骨架屏

    // 排序相关
    currentSort: 'recommend', // 当前排序方式：recommend/newest/nearby
    userLocation: null, // 用户位置信息

    // 距离筛选相关
    currentDistance: '', // 当前选中的距离筛选：1/3/5/10（单位：公里），空字符串表示不筛选
    showDistanceFilter: false, // 是否显示距离筛选选项

    // 城市筛选
    currentCity: '昆明市', // 当前选中的城市
    cityFilterActive: false, // 昆明筛选是否激活（默认不激活）

    // 变量数据
    searchPlaceholder: '搜索鲜花、公司信息', // 搜索框提示
    workContentLabel: '鲜花信息', // 鲜花信息标签
  },

  async onLoad() {
    console.log('🚀 [性能] 首页onLoad开始');
    const startTime = Date.now();

    // ========================================
    // 步骤0: 立即同步设置页面标题（避免闪烁）
    // ========================================
    this.setPageTitleSync();

    // ========================================
    // 步骤1: 加载变量配置
    // ========================================
    this.loadVariables();

    // ========================================
    // 步骤2: 立即尝试读取缓存（秒开关键）
    // ========================================
    this.loadFromCache();

    // ========================================
    // 步骤3: 后台异步加载最新数据
    // ========================================
    this.loadFreshData();

    console.log(`⏱️ [性能] onLoad执行完成，耗时: ${Date.now() - startTime}ms`);
  },

  /**
   * 同步设置页面标题（避免闪烁）
   */
  setPageTitleSync() {
    try {
      // 尝试从本地存储同步读取变量
      const cachedVariables = wx.getStorageSync('system_variables');
      if (cachedVariables && cachedVariables.home_page_title) {
        wx.setNavigationBarTitle({
          title: cachedVariables.home_page_title
        });
        console.log('⚡ [性能] 使用缓存变量设置页面标题:', cachedVariables.home_page_title);
      }
      // 如果没有缓存，使用index.json中的默认值，不需要再设置
    } catch (error) {
      console.warn('读取缓存变量失败:', error);
      // 失败也没关系，会使用index.json中的默认值
    }
  },

  /**
   * 加载变量配置
   */
  async loadVariables() {
    try {
      console.log('[变量] 开始加载首页变量...');
      const variables = await variableManager.getAllVariables();
      console.log('[变量] 获取到的变量数据:', variables);

      this.setData({
        searchPlaceholder: variables.home_search_placeholder || '搜索鲜花、公司信息',
        workContentLabel: variables.home_work_content_label || '鲜花信息'
      });

      // 动态设置页面标题
      const pageTitle = variables.home_page_title || '找鲜花信息';
      wx.setNavigationBarTitle({
        title: pageTitle
      });

      console.log('✅ [变量] 首页变量加载成功', {
        pageTitle,
        searchPlaceholder: this.data.searchPlaceholder,
        workContentLabel: this.data.workContentLabel
      });
    } catch (error) {
      console.error('❌ [变量] 加载首页变量失败:', error);
      // 静默失败，使用默认值
    }
  },

  /**
   * 从缓存加载数据（秒开关键）
   */
  loadFromCache() {
    const cacheStartTime = Date.now();

    // 读取配置缓存
    const cachedConfig = cacheManager.getIndexConfig();
    if (cachedConfig) {
      this.setData({
        categoryList: cachedConfig.categoryList || [],
        areaList: cachedConfig.areaList || [],
        vipCategoryName: cachedConfig.vipCategoryName || ''
      });
      console.log(`✅ [缓存] 配置数据加载成功，耗时: ${Date.now() - cacheStartTime}ms`);
    }

    // 读取列表缓存
    const cachedData = cacheManager.getIndexData();
    if (cachedData) {
      this.setData({
        jobList: cachedData.jobList || [],
        totalCount: cachedData.totalCount || 0,
        currentPage: cachedData.currentPage || 1,
        hasMore: cachedData.hasMore !== false,
        showSkeleton: false // 有缓存数据，隐藏骨架屏
      });
      console.log(`✅ [缓存] 列表数据加载成功，耗时: ${Date.now() - cacheStartTime}ms`);
    }

    // 如果没有任何缓存，骨架屏会继续显示
    if (!cachedConfig && !cachedData) {
      console.log('📭 [缓存] 无缓存数据，显示骨架屏');
    }
  },

  /**
   * 加载最新数据（后台静默更新）
   */
  async loadFreshData() {
    const freshStartTime = Date.now();
    console.log('🔄 [刷新] 开始加载最新数据');

    try {
      // 并行加载配置和列表
      await Promise.all([
        this.loadSystemConfig(),
        this.loadFlowerList()
      ]);

      console.log(`✅ [刷新] 最新数据加载完成，耗时: ${Date.now() - freshStartTime}ms`);
    } catch (error) {
      console.error('❌ [刷新] 加载最新数据失败:', error);
    }
  },

  onShow() {
    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }

    // 刷新系统配置和列表数据
    // 使用 isRefreshNeeded 标记避免首次加载时重复刷新
    if (this.isRefreshNeeded) {
      this.loadSystemConfig(); // 刷新分类和区域配置
      this.loadFlowerList(true);
      this.isRefreshNeeded = false;
    } else {
      this.isRefreshNeeded = true;
    }
  },

  /**
   * 加载系统配置（行政区域和信息分类）
   */
  async loadSystemConfig() {
    try {
      const configStartTime = Date.now();

      // 并行加载分类和区域
      const [categoryResult, areaResult] = await Promise.all([
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: {
            action: 'getList',
            type: 'category'
          }
        }),
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: {
            action: 'getList',
            type: 'area',
            city: '昆明市'
          }
        })
      ]);

      // 处理分类数据
      const categoryList = categoryResult.result?.success
        ? categoryResult.result.data || []
        : [];

      // 找出VIP分类
      const vipCategory = categoryList.find(cat => cat.isVIP);
      const vipCategoryName = vipCategory ? vipCategory.name : '';

      // 处理区域数据
      const areaList = areaResult.result?.success
        ? areaResult.result.data || []
        : [];

      // 更新页面数据
      this.setData({
        categoryList,
        areaList,
        vipCategoryName
      });

      // 保存配置到缓存
      cacheManager.saveIndexConfig({
        categoryList,
        areaList,
        vipCategoryName
      });

      console.log(`✅ [配置] 系统配置加载成功，耗时: ${Date.now() - configStartTime}ms`, {
        分类数量: categoryList.length,
        区域数量: areaList.length,
        VIP分类: vipCategoryName
      });
    } catch (error) {
      console.error('❌ [配置] 加载系统配置失败:', error);
      // 静默失败，使用空数组（不影响页面其他功能）
      this.setData({
        categoryList: [],
        areaList: []
      });
    }
  },

  /**
   * 加载花卉/职位列表
   */
  async loadFlowerList(refresh = false) {
    if (this.loading) return;

    // 智能加载状态：只有超过300ms才显示加载状态
    let loadingTimer = null;
    const showSmartLoading = () => {
      loadingTimer = setTimeout(() => {
        this.setData({ smartLoading: true });
      }, 300);
    };

    const hideSmartLoading = () => {
      if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
      }
      this.setData({ smartLoading: false });
    };

    this.loading = true;

    // 只在刷新或初始加载时显示智能加载状态
    if (refresh || this.data.jobList.length === 0) {
      showSmartLoading();
    }

    try {
      if (refresh) {
        this.currentPage = 1;
        this.setData({
          jobList: [],
          hasMore: true
        });
      }

      // 根据排序方式确定sortBy参数
      let sortBy = 'created_at'; // 默认推荐排序：按创建时间倒序（推荐最早发布的）
      if (this.data.currentSort === 'newest') {
        sortBy = 'updated_at'; // 最新排序：按更新时间倒序
      } else if (this.data.currentSort === 'nearby') {
        // 附近排序：暂时还是用更新时间，因为需要在前端根据位置排序
        sortBy = 'updated_at';
      }

      const params = {
        page: this.currentPage,
        limit: 20,
        type: this.data.currentType || 'all',  // 使用分类ID（升级后）
        areaCode: this.data.currentArea || 'all',  // 使用区域ID（升级后）
        keyword: this.data.keyword,
        sortBy: sortBy
      };

      console.log('[index] 调用云函数 getItemList，参数:', params);

      const result = await cloudAPI.getItemList(params);

      console.log('[index] 云函数返回结果:', {
        success: result.success,
        total: result.total,
        dataLength: result.data?.length,
        message: result.message
      });

      if (result.success) {
        // 先快速处理数据并显示，不等待阅读统计
        const processedData = result.data.map(item => {
          // 判断是否是VIP分类
          const categories = Array.isArray(item.categories) ? item.categories : (item.category ? [item.category] : []);
          const isVIP = categories.includes(this.data.vipCategoryName);

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

          // 处理工作内容预览：直接使用发布者输入的内容，用2个空格间隔
          let descriptionPreview = '';
          if (Array.isArray(item.description) && item.description.length > 0) {
            // 直接使用原始内容，不添加序号，用2个空格间隔
            descriptionPreview = item.description
              .map(text => typeof text === 'string' ? text.trim() : text)
              .filter(text => text) // 过滤掉空字符串
              .join('  '); // 用2个空格连接各条目
          } else if (typeof item.description === 'string') {
            // 如果是字符串，直接使用
            descriptionPreview = item.description.trim();
          }

          return {
            ...item,
            recruiterInitial: item.contact_name ? item.contact_name.charAt(0) : '招',
            totalViews: 0,  // 默认值，稍后异步更新
            todayViews: 0,  // 默认值，稍后异步更新
            isVIP,
            categories, // 多分类数组（用于显示）
            tags: tags,  // 标签对象数组：[{_id?, name}, ...]
            descriptionPreview // 工作内容预览（前2条，横向显示）
          };
        });

        let newList = refresh ? processedData : [...this.data.jobList, ...processedData];

        // 城市筛选：如果激活了昆明筛选，只显示昆明范围内的信息
        if (this.data.cityFilterActive) {
          newList = newList.filter(item => {
            // 检查公司地址是否包含"昆明"
            const address = item.company_address || item.address || '';
            const city = item.city || '';
            const area = item.area || '';

            // 判断是否在昆明范围内（检查地址、城市、区域字段）
            const isInKunming =
              address.includes('昆明') ||
              city.includes('昆明') ||
              area.includes('昆明') ||
              (item.latitude >= 24.5 && item.latitude <= 26.0 &&
               item.longitude >= 102.0 && item.longitude <= 103.5);

            return isInKunming;
          });
          console.log(`[index] 城市筛选完成，昆明范围内有${newList.length}个职位`);
        }

        // 如果是"附近"排序或有距离筛选，需要计算距离
        if ((this.data.currentSort === 'nearby' || this.data.currentDistance) && this.data.userLocation) {
          const userLat = this.data.userLocation.latitude;
          const userLon = this.data.userLocation.longitude;

          // 为每个item计算距离
          newList = newList.map(item => {
            const distance = this.calculateDistance(
              userLat,
              userLon,
              item.latitude || 25.040609,  // 默认昆明纬度
              item.longitude || 102.712251  // 默认昆明经度
            );
            return {
              ...item,
              distance: distance,
              distanceText: distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`
            };
          });

          // 如果有距离筛选，进行过滤
          if (this.data.currentDistance) {
            const maxDistance = parseFloat(this.data.currentDistance);
            newList = newList.filter(item => item.distance <= maxDistance);
            console.log(`[index] 距离筛选完成，${maxDistance}公里内有${newList.length}个职位`);
          }

          // 如果是"附近"排序或有距离筛选，按距离排序（近到远）
          if (this.data.currentSort === 'nearby' || this.data.currentDistance) {
            newList.sort((a, b) => a.distance - b.distance);
            console.log('[index] 距离排序完成，最近的3个职位:', newList.slice(0, 3).map(item => ({
              title: item.title,
              distance: item.distanceText
            })));
          }
        }

        // 计算实际显示的数量（考虑前端筛选后的结果）
        const actualTotalCount = newList.length;

        // 立即显示列表并隐藏骨架屏
        this.setData({
          jobList: newList,
          totalCount: actualTotalCount,  // 使用前端筛选后的实际数量
          hasMore: newList.length < (result.total || 0),
          showSkeleton: false // 数据加载完成，隐藏骨架屏
        });

        if (result.data.length > 0) {
          this.currentPage++;
        }

        // 保存列表数据到缓存（仅首页数据）
        if (this.currentPage === 2) { // 只缓存第一页数据
          cacheManager.saveIndexData({
            jobList: newList,
            totalCount: result.total || 0,
            currentPage: this.currentPage,
            hasMore: newList.length < (result.total || 0)
          });
        }

        // 异步加载阅读统计，不阻塞UI
        this.loadViewStatsAsync(processedData, refresh);
      } else {
        this.setData({ showSkeleton: false }); // 即使失败也要隐藏骨架屏
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('[index] 加载列表失败:', error);
      this.setData({ showSkeleton: false }); // 即使失败也要隐藏骨架屏
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.loading = false;
      hideSmartLoading();
    }
  },

  /**
   * 类型选择（带VIP权限检查）
   */
  async onTypeChange(e) {
    const typeId = e.currentTarget.dataset.id;      // 获取分类ID（升级后）
    const typeName = e.currentTarget.dataset.name;  // 获取分类名称
    const isVIP = e.currentTarget.dataset.isVip;    // 是否是VIP分类

    console.log('[index] 选择分类 - id:', typeId, 'name:', typeName, 'isVIP:', isVIP);

    // 如果是VIP分类，需要检查用户VIP权限
    if (isVIP) {
      try {
        // 检查用户登录状态
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo || !userInfo.openid) {
          wx.showModal({
            title: '需要登录',
            content: '请先登录后再使用VIP筛选功能',
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

        // 是VIP，继续筛选
        console.log('[index] VIP权限验证通过，允许筛选');
      } catch (error) {
        console.error('[index] 检查VIP状态失败:', error);
        wx.showToast({
          title: '检查权限失败',
          icon: 'none'
        });
        return;
      }
    }

    // 普通分类或VIP权限验证通过，执行筛选
    if (typeId === this.data.currentType) {
      // 取消选中
      this.setData({
        currentType: '',
        currentTypeName: ''
      });
    } else {
      this.setData({
        currentType: typeId,       // 保存分类ID（升级后）
        currentTypeName: typeName  // 保存分类名称（用于显示）
      });
    }

    console.log('[index] 当前筛选 - currentType:', this.data.currentType, 'currentArea:', this.data.currentArea);
    this.loadFlowerList(true);
  },

  /**
   * 地区选择
   */
  onAreaChange(e) {
    const areaId = e.currentTarget.dataset.id;      // 获取区域ID（升级后）
    const areaName = e.currentTarget.dataset.name;  // 获取区域名称

    console.log('[index] 选择区域 - id:', areaId, 'name:', areaName);

    if (areaId === this.data.currentArea) {
      // 取消选中
      this.setData({
        currentArea: '',
        currentAreaName: ''
      });
    } else {
      this.setData({
        currentArea: areaId,       // 保存区域ID（升级后）
        currentAreaName: areaName  // 保存区域名称（用于显示）
      });
    }

    console.log('[index] 当前筛选 - currentType:', this.data.currentType, 'currentArea:', this.data.currentArea);
    this.loadFlowerList(true);
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  /**
   * 搜索确认
   */
  onSearchConfirm() {
    this.loadFlowerList(true);
  },

  /**
   * 排序方式切换
   */
  async onSortChange(e) {
    const sortType = e.currentTarget.dataset.sort;

    if (sortType === this.data.currentSort) {
      return; // 已选中，不重复处理
    }

    console.log('[index] 切换排序方式:', sortType);

    // 如果选择"附近"排序，需要先获取用户位置
    if (sortType === 'nearby') {
      try {
        const location = await this.getUserLocation();
        this.setData({
          currentSort: sortType,
          userLocation: location
        });
        console.log('[index] 用户位置获取成功:', location);
      } catch (error) {
        console.error('[index] 获取用户位置失败:', error);
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
    } else {
      this.setData({
        currentSort: sortType
      });
    }

    // 刷新列表
    this.loadFlowerList(true);
  },

  /**
   * 获取用户位置
   */
  getUserLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02', // 国测局坐标系
        success: (res) => {
          resolve({
            latitude: res.latitude,
            longitude: res.longitude
          });
        },
        fail: (error) => {
          // 如果失败，提示用户授权
          wx.showModal({
            title: '需要位置权限',
            content: '附近排序需要获取您的位置信息，请在设置中开启位置权限',
            confirmText: '去设置',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.userLocation']) {
                      // 重新获取位置
                      wx.getLocation({
                        type: 'gcj02',
                        success: (res) => {
                          resolve({
                            latitude: res.latitude,
                            longitude: res.longitude
                          });
                        },
                        fail: reject
                      });
                    } else {
                      reject(error);
                    }
                  }
                });
              } else {
                reject(error);
              }
            }
          });
        }
      });
    });
  },

  /**
   * 计算两点之间的距离（Haversine公式）
   * @param {number} lat1 纬度1
   * @param {number} lon1 经度1
   * @param {number} lat2 纬度2
   * @param {number} lon2 经度2
   * @returns {number} 距离（公里）
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  },

  /**
   * 角度转弧度
   */
  toRad(degrees) {
    return degrees * Math.PI / 180;
  },

  /**
   * 跳转详情页
   */
  goToDetail(e) {
    const item = e.currentTarget.dataset.item;
    if (!item || !item.hash_id) {
      wx.showToast({
        title: '数据异常',
        icon: 'none'
      });
      return;
    }

    // 增加浏览量（异步执行，不阻塞跳转）
    cloudAPI.increaseViewCount(item.hash_id).catch(err => {
      console.warn('[index] 增加浏览量失败:', err);
    });

    // 直接传递完整数据到详情页，避免重复加载
    try {
      const encodedData = encodeURIComponent(JSON.stringify(item));
      wx.navigateTo({
        url: `/pages/detail/detail?data=${encodedData}`
      });
    } catch (error) {
      console.error('[index] 数据编码失败，使用hash_id跳转:', error);
      // 降级方案：如果数据太大无法编码，则使用hash_id
      wx.navigateTo({
        url: `/pages/detail/detail?hash_id=${item.hash_id}`
      });
    }
  },

  /**
   * 拨打电话（带VIP权限检查）
   */
  async makePhoneCall(e) {
    const phone = e.currentTarget.dataset.phone;
    const accessLevel = e.currentTarget.dataset.accessLevel; // 获取访问权限

    if (!phone) {
      wx.showToast({
        title: '暂无联系电话',
        icon: 'none'
      });
      return;
    }

    // 如果是VIP专属信息，需要检查用户VIP状态
    if (accessLevel === 'vip') {
      try {
        // 检查用户VIP状态
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
        console.error('[index] 检查VIP状态失败:', error);
        wx.showToast({
          title: '检查权限失败',
          icon: 'none'
        });
        return;
      }
    }

    // 普通信息或VIP用户，直接拨打电话
    wx.makePhoneCall({
      phoneNumber: phone,
      success: function() {
        console.log('[index] 拨打电话成功');
      },
      fail: function() {
        console.log('[index] 拨打电话失败');
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
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('[index] 开始下拉刷新');

    // 清除所有缓存，确保获取最新数据
    cacheManager.clearAllIndexCache();
    console.log('🗑️ [刷新] 已清除所有缓存');

    // 同时刷新变量、配置和列表
    Promise.all([
      this.loadVariables(),        // 刷新首页变量（搜索框提示、工作内容标签、页面标题）
      this.loadSystemConfig(),
      this.loadFlowerList(true)
    ]).then(() => {
      wx.stopPullDownRefresh();
      // 显示刷新成功提示
      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
      console.log('[index] 下拉刷新完成');
    }).catch((error) => {
      wx.stopPullDownRefresh();
      // 显示刷新失败提示
      wx.showToast({
        title: '刷新失败',
        icon: 'none',
        duration: 2000
      });
      console.error('[index] 下拉刷新失败:', error);
    });
  },

  /**
   * 异步加载阅读统计（不阻塞UI渲染）
   */
  async loadViewStatsAsync(items, refresh = false) {
    console.log(`[index] 开始异步加载 ${items.length} 条数据的阅读统计`);

    // 批量处理，每次处理5条，避免并发过高
    const batchSize = 5;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // 并行处理这一批
      const statsPromises = batch.map(async item => {
        try {
          const statsResult = await wx.cloud.callFunction({
            name: 'viewStatistics',
            data: {
              action: 'getStats',
              jobId: item.hash_id
            }
          });

          if (statsResult.result && statsResult.result.success) {
            return {
              hash_id: item.hash_id,
              totalViews: statsResult.result.data.totalViews || 0,
              todayViews: statsResult.result.data.todayViews || 0
            };
          }
        } catch (err) {
          console.warn(`[index] 获取阅读统计失败 hash_id=${item.hash_id}:`, err);
        }
        return null;
      });

      const stats = await Promise.all(statsPromises);

      // 更新数据
      const updatedList = this.data.jobList.map(job => {
        const stat = stats.find(s => s && s.hash_id === job.hash_id);
        if (stat) {
          return {
            ...job,
            totalViews: stat.totalViews,
            todayViews: stat.todayViews
          };
        }
        return job;
      });

      this.setData({ jobList: updatedList });

      // 稍微延迟，避免一次性请求过多
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('[index] 阅读统计加载完成');
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.loading) {
      this.loadFlowerList();
    }
  },

  /**
   * 切换距离筛选显示
   */
  toggleDistanceFilter() {
    this.setData({
      showDistanceFilter: !this.data.showDistanceFilter
    });
  },

  /**
   * 切换城市筛选
   */
  onCityFilterToggle() {
    const newState = !this.data.cityFilterActive;
    this.setData({
      cityFilterActive: newState
    });
    console.log('[index] 城市筛选状态:', newState ? '仅昆明' : '全部城市');

    // 刷新列表
    this.loadFlowerList(true);
  },

  /**
   * 选择距离筛选
   */
  async onDistanceChange(e) {
    const distance = e.currentTarget.dataset.distance;
    console.log('[index] 选择距离筛选:', distance);

    // 如果选择距离筛选，需要先获取用户位置
    if (distance && !this.data.userLocation) {
      try {
        const location = await this.getUserLocation();
        this.setData({
          userLocation: location
        });
        console.log('[index] 用户位置获取成功:', location);
      } catch (error) {
        console.error('[index] 获取用户位置失败:', error);
        wx.showToast({
          title: '获取位置失败',
          icon: 'none',
          duration: 2000
        });
        return;
      }
    }

    // 如果点击已选中的距离，则取消筛选
    if (distance === this.data.currentDistance) {
      this.setData({
        currentDistance: '',
        showDistanceFilter: false
      });
    } else {
      this.setData({
        currentDistance: distance,
        showDistanceFilter: false
      });
    }

    // 刷新列表
    this.loadFlowerList(true);
  }
});
