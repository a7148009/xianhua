// pages/publish/publish.js
Page({
  data: {
    isEditMode: false, // 是否编辑模式
    editId: null, // 编辑的信息ID

    // 键盘管理
    keyboardHeight: 0, // 键盘高度
    windowHeight: 0, // 窗口高度

    // 表单数据
    formData: {
      title: '',
      price_min: '',
      price_max: '',
      price_unit_id: '',
      price_unit_name: '',
      area_id: '',
      area_name: '',
      company_name: '',
      company_address: '',
      company_logo: '', // 公司Logo
      contact_name: '',
      contact_phone: '',
      contact_wechat: '',
      longitude: null,
      latitude: null,
      access_level: 'free' // 访问权限：free-普通用户可看, vip-仅VIP用户可看
    },

    // 描述文本（用于textarea）
    descriptionText: '',

    // 图片列表
    images: [],

    // 选中的分类ID数组
    selectedCategories: [],
    // 选中的标签ID数组
    selectedTags: [],

    // 地图相关
    isDragging: false, // 是否正在拖动地图
    showMapCard: true,  // 默认显示地图卡片，展示初始位置
    mapCenter: {
      longitude: 121.499809,
      latitude: 31.239666
    },
    currentCity: '上海',
    currentDistrict: '浦东新区',
    detailedAddress: '东方明珠广播电视塔',
    isInitialLocation: true,  // 标记是否为初始位置

    // 系统配置数据
    categoryList: [], // 分类列表
    areaList: [], // 区域列表
    tagList: [], // 标签列表
    priceUnitList: [], // 价格单位列表

    // 选择器索引
    areaIndex: -1,
    priceUnitIndex: -1
  },

  onLoad(options) {
    console.log('🔵 发布页面加载', options);

    // 获取窗口信息
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      windowHeight: systemInfo.windowHeight
    });

    // 监听键盘弹起
    wx.onKeyboardHeightChange((res) => {
      console.log('⌨️ 键盘高度变化:', res.height);
      this.setData({
        keyboardHeight: res.height
      });

      // 记录键盘是否弹起
      this.isKeyboardShown = res.height > 0;
    });

    // 检查是否是编辑模式
    if (options.mode === 'edit' && options.id) {
      // 管理员编辑模式：通过 mode=edit&id=xxx 进入
      this.setData({
        isEditMode: true,
        editId: options.id
      });
      wx.setNavigationBarTitle({
        title: '编辑信息'
      });
      console.log('✅ 管理员编辑模式，hash_id:', options.id);
    } else if (options.id) {
      // 兼容旧版本：通过id参数编辑
      this.setData({
        isEditMode: true,
        editId: options.id
      });
      wx.setNavigationBarTitle({
        title: '编辑信息'
      });
      console.log('✅ 编辑模式，hash_id:', options.id);
    }

    // 加载系统配置
    this.loadSystemConfig();

    // 如果是编辑模式，加载信息数据
    if (this.data.isEditMode && this.data.editId) {
      this.loadItemData(this.data.editId);
    }
  },

  onShow() {
    console.log('🔵 发布页面显示');

    // 同步 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }

    // 检查是否有待编辑的数据（从首页长按进入的编辑模式）
    try {
      const editItemData = wx.getStorageSync('editItemData');
      if (editItemData && editItemData.mode === 'edit' && editItemData.hash_id) {
        console.log('🔵 检测到编辑模式数据:', editItemData);

        // 清除本地存储，避免重复加载
        wx.removeStorageSync('editItemData');

        // 设置编辑模式
        this.setData({
          isEditMode: true,
          editId: editItemData.hash_id
        });

        wx.setNavigationBarTitle({
          title: '编辑信息'
        });

        console.log('🔵 当前系统配置状态:', {
          categoryCount: this.data.categoryList.length,
          areaCount: this.data.areaList.length,
          tagCount: this.data.tagList.length,
          priceUnitCount: this.data.priceUnitList.length
        });

        // 加载信息数据（如果系统配置已加载）
        if (this.data.categoryList.length > 0) {
          console.log('🔵 系统配置已加载，立即加载编辑数据');
          this.loadItemData(editItemData.hash_id);
        } else {
          // 如果系统配置还没加载，等待加载完成后再加载信息数据
          console.log('🔵 系统配置未加载，设置待加载编辑ID');
          this.pendingEditId = editItemData.hash_id;

          // 强制重新加载系统配置（确保一定会加载）
          this.loadSystemConfig();
        }
      }
    } catch (error) {
      console.error('🔵 检查编辑数据失败:', error);
    }
  },

  onReady() {
    console.log('🔵 发布页面准备完成');
  },

  /**
   * 加载系统配置
   */
  async loadSystemConfig() {
    try {
      wx.showLoading({ title: '加载中...' });

      // 并行加载所有配置
      const [categoryResult, areaResult, tagResult, priceUnitResult] = await Promise.all([
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: { action: 'getList', type: 'category' }
        }),
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: { action: 'getList', type: 'area', city: '昆明市' }
        }),
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: { action: 'getList', type: 'tag' }
        }),
        wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: { action: 'getList', type: 'price_unit' }
        })
      ]);

      this.setData({
        categoryList: categoryResult.result?.success ? categoryResult.result.data : [],
        areaList: areaResult.result?.success ? areaResult.result.data : [],
        tagList: tagResult.result?.success ? tagResult.result.data : [],
        priceUnitList: priceUnitResult.result?.success ? priceUnitResult.result.data : []
      });

      console.log('✅ 系统配置加载成功');

      // 如果有待加载的编辑数据，现在加载
      if (this.pendingEditId) {
        console.log('🔵 系统配置已加载，现在加载编辑数据:', this.pendingEditId);
        this.loadItemData(this.pendingEditId);
        this.pendingEditId = null;
      }
    } catch (error) {
      console.error('❌ 加载系统配置失败:', error);
      wx.showToast({
        title: '加载配置失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 加载待编辑的信息数据
   */
  async loadItemData(hashId) {
    try {
      wx.showLoading({ title: '加载数据...' });

      const result = await wx.cloud.callFunction({
        name: 'getFlowerDetail',
        data: { hash_id: hashId }
      });

      if (result.result && result.result.success) {
        const data = result.result.data;

        // 处理描述数据（数组转换为文本）
        let descriptionText = '';
        if (Array.isArray(data.description)) {
          descriptionText = data.description.join('\n');
        } else if (typeof data.description === 'string') {
          descriptionText = data.description;
        }

        // 处理分类ID
        const selectedCategories = data.category_ids || [];

        // 处理标签ID
        const selectedTags = data.tag_ids || [];

        // 处理图片
        const images = data.images || [];

        // 查找区域索引（同时支持custom_id和_id）
        const areaIndex = this.data.areaList.findIndex(a =>
          a.custom_id === data.area_id || a._id === data.area_id
        );

        // 查找价格单位索引（同时支持custom_id和_id）
        const priceUnitIndex = this.data.priceUnitList.findIndex(p =>
          p.custom_id === data.price_unit_id || p._id === data.price_unit_id
        );

        // 处理地图相关数据
        const showMapCard = !!(data.longitude && data.latitude);
        const mapData = showMapCard ? {
          showMapCard: true,
          currentDistrict: data.area || '',
          detailedAddress: data.company_address || '',
          mapCenter: {
            longitude: data.longitude,
            latitude: data.latitude
          }
        } : {};

        this.setData({
          formData: {
            title: data.title || '',
            price_min: data.price_min || '',
            price_max: data.price_max || '',
            price_unit_id: data.price_unit_id || '',
            price_unit_name: data.price_unit || '',
            area_id: data.area_id || '',
            area_name: data.area || '',
            company_name: data.company_name || '',
            company_address: data.company_address || '',
            company_logo: data.company_logo || '',
            contact_name: data.contact_name || '',
            contact_phone: data.contact_phone || '',
            contact_wechat: data.contact_wechat || '',
            longitude: data.longitude || null,
            latitude: data.latitude || null,
            access_level: data.access_level || 'free'
          },
          descriptionText,
          selectedCategories,
          selectedTags,
          images,
          areaIndex: areaIndex >= 0 ? areaIndex : -1,
          priceUnitIndex: priceUnitIndex >= 0 ? priceUnitIndex : -1,
          ...mapData
        });

        console.log('✅ 信息数据加载成功');
      } else {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
    } catch (error) {
      console.error('❌ 加载信息数据失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 智能调整页面滚动以适应键盘
   */
  adjustScrollForKeyboard() {
    if (!this.currentFocusedField) {
      console.log('⚠️ 未记录聚焦字段');
      return;
    }

    // 延迟执行，等待键盘弹起
    setTimeout(() => {
      const { keyboardHeight, windowHeight } = this.data;

      // 如果键盘还没弹起，继续等待
      if (keyboardHeight === 0) {
        console.log('⏳ 键盘尚未弹起，延迟调整');
        setTimeout(() => {
          if (this.data.keyboardHeight > 0) {
            this.adjustScrollForKeyboard();
          }
        }, 200);
        return;
      }

      // 使用ID精确查询当前聚焦的输入框
      const inputId = `#input-${this.currentFocusedField}`;
      const query = wx.createSelectorQuery().in(this);

      query.select(inputId).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.selectViewport().fields({ scrollHeight: true }, null);

      query.exec((res) => {
        if (!res || !res[0]) {
          console.log(`⚠️ 未找到输入框: ${inputId}`);
          return;
        }

        const rect = res[0]; // 输入框的位置
        const scrollOffset = res[1]; // 当前滚动位置
        const viewportInfo = res[2]; // 视口信息

        console.log('📏 页面尺寸信息:', {
          scrollHeight: viewportInfo ? viewportInfo.scrollHeight : '未知',
          windowHeight,
          currentScrollTop: scrollOffset.scrollTop
        });

        console.log('📍 当前聚焦输入框:', {
          id: inputId,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height
        });

        // 计算键盘顶部相对于视窗的位置
        const keyboardTop = windowHeight - keyboardHeight;

        console.log('📊 位置信息:', {
          inputBottom: rect.bottom,
          keyboardTop,
          windowHeight,
          keyboardHeight,
          currentScrollTop: scrollOffset.scrollTop,
          field: this.currentFocusedField
        });

        // 如果输入框被键盘遮挡
        if (rect.bottom > keyboardTop - 50) {
          // 计算需要滚动的距离
          const extraSpace = 80; // 额外间距，确保输入框在键盘上方
          const scrollDistance = rect.bottom - keyboardTop + extraSpace;
          const newScrollTop = scrollOffset.scrollTop + scrollDistance;

          console.log('📱 准备滚动:', {
            field: this.currentFocusedField,
            scrollDistance,
            newScrollTop
          });

          // 执行滚动
          wx.pageScrollTo({
            scrollTop: newScrollTop,
            duration: 300,
            success: () => {
              console.log('✅ 页面滚动成功');
            },
            fail: (err) => {
              console.log('❌ 页面滚动失败:', err);
            }
          });
        } else {
          console.log('✅ 输入框未被遮挡，无需调整');
        }
      });
    }, 350); // 增加延迟，确保键盘完全弹起
  },

  /**
   * 输入框聚焦事件
   */
  onInputFocus(e) {
    const field = e.currentTarget.dataset.field;
    this.currentFocusedField = field;
    console.log('🎯 输入框聚焦:', field);

    // 开始调整滚动
    this.adjustScrollForKeyboard();
  },

  /**
   * 输入框变化
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  /**
   * 描述输入
   */
  onDescriptionInput(e) {
    this.setData({
      descriptionText: e.detail.value
    });
  },

  /**
   * 切换分类选择
   */
  toggleCategory(e) {
    const { id } = e.currentTarget.dataset;
    console.log('🔵 点击分类ID:', id);

    let selectedCategories = [...this.data.selectedCategories];
    console.log('🔵 当前已选分类:', selectedCategories);

    const index = selectedCategories.indexOf(id);
    if (index > -1) {
      // 取消选择
      selectedCategories.splice(index, 1);
      console.log('✅ 取消选择分类:', id);
    } else {
      // 选择（最多3个）
      if (selectedCategories.length >= 3) {
        wx.showToast({
          title: '最多选择3个分类',
          icon: 'none'
        });
        return;
      }
      selectedCategories.push(id);
      console.log('✅ 选择分类:', id);
    }

    console.log('🔵 更新后的分类:', selectedCategories);
    this.setData({ selectedCategories }, () => {
      console.log('✅ setData完成, 当前selectedCategories:', this.data.selectedCategories);
    });
  },

  /**
   * 切换标签选择
   */
  toggleTag(e) {
    const { id } = e.currentTarget.dataset;
    console.log('🟢 点击标签ID:', id);

    let selectedTags = [...this.data.selectedTags];
    console.log('🟢 当前已选标签:', selectedTags);

    const index = selectedTags.indexOf(id);
    if (index > -1) {
      // 取消选择
      selectedTags.splice(index, 1);
      console.log('✅ 取消选择标签:', id);
    } else {
      // 选择（最多10个）
      if (selectedTags.length >= 10) {
        wx.showToast({
          title: '最多选择10个标签',
          icon: 'none'
        });
        return;
      }
      selectedTags.push(id);
      console.log('✅ 选择标签:', id);
    }

    console.log('🟢 更新后的标签:', selectedTags);
    this.setData({ selectedTags }, () => {
      console.log('✅ setData完成, 当前selectedTags:', this.data.selectedTags);
    });
  },

  /**
   * 区域选择
   */
  onAreaChange(e) {
    const index = parseInt(e.detail.value);
    const area = this.data.areaList[index];

    this.setData({
      areaIndex: index,
      'formData.area_id': area.custom_id || area._id,  // 优先使用custom_id
      'formData.area_name': area.name
    });
  },

  /**
   * 价格单位选择
   */
  onPriceUnitChange(e) {
    const index = parseInt(e.detail.value);
    const priceUnit = this.data.priceUnitList[index];

    this.setData({
      priceUnitIndex: index,
      'formData.price_unit_id': priceUnit.custom_id || priceUnit._id,  // 优先使用custom_id
      'formData.price_unit_name': priceUnit.name
    });
  },

  /**
   * 访问权限选择
   */
  onAccessLevelChange(e) {
    const { level } = e.currentTarget.dataset;
    console.log('🔐 选择访问权限:', level);

    this.setData({
      'formData.access_level': level
    });

    wx.showToast({
      title: level === 'free' ? '设置为普通用户可看' : '设置为仅VIP用户可看',
      icon: 'success',
      duration: 1500
    });
  },

  /**
   * 上传公司Logo
   */
  async uploadLogo() {
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });

      wx.showLoading({ title: '上传中...' });

      const filePath = res.tempFilePaths[0];
      const cloudPath = `company_logos/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;

      const uploadResult = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });

      this.setData({
        'formData.company_logo': uploadResult.fileID
      });

      wx.showToast({
        title: 'Logo上传成功',
        icon: 'success'
      });

      console.log('✅ Logo上传成功:', uploadResult.fileID);
    } catch (error) {
      console.error('❌ Logo上传失败:', error);
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 获取地理位置
   */
  async getLocation() {
    try {
      wx.showLoading({ title: '获取位置中...' });

      const res = await wx.getLocation({
        type: 'gcj02',
        altitude: true
      });

      console.log('📍 获取当前位置:', res);

      // 调用逆地址解析，将经纬度转换为地址
      const addressInfo = await this.reverseGeocodeLocation(res.latitude, res.longitude);

      if (addressInfo) {
        // 验证地址是否在运营范围内
        const validateResult = await wx.cloud.callFunction({
          name: 'validateAddress',
          data: { address: addressInfo.fullAddress }
        });

        console.log('🔍 地址验证结果:', validateResult.result);

        if (validateResult.result.success && validateResult.result.valid) {
          const matchedArea = validateResult.result.matchedArea;
          const areaIndex = this.data.areaList.findIndex(a =>
            a.custom_id === matchedArea.custom_id || a.custom_id === matchedArea._id ||
            a._id === matchedArea.custom_id || a._id === matchedArea._id
          );

          this.setData({
            'formData.longitude': res.longitude,
            'formData.latitude': res.latitude,
            'formData.company_address': addressInfo.standardAddress,
            'formData.area_id': matchedArea.custom_id || matchedArea._id,  // 优先使用custom_id
            'formData.area_name': matchedArea.name,
            areaIndex: areaIndex >= 0 ? areaIndex : -1,
            showMapCard: true,
            isInitialLocation: false,
            currentCity: addressInfo.city,
            currentDistrict: matchedArea.name,
            detailedAddress: addressInfo.detailedAddress,
            mapCenter: {
              longitude: res.longitude,
              latitude: res.latitude
            }
          });

          wx.hideLoading();
          wx.showToast({
            title: '位置获取成功',
            icon: 'success'
          });

          console.log('✅ 位置获取成功，地图卡片已显示');
        } else {
          wx.hideLoading();
          wx.showModal({
            title: '地址验证失败',
            content: validateResult.result.message || '当前位置不在运营范围内',
            showCancel: false
          });
        }
      }

    } catch (error) {
      wx.hideLoading();
      console.error('❌ 获取位置失败:', error);
      wx.showModal({
        title: '获取位置失败',
        content: '请在小程序设置中开启位置权限',
        showCancel: false
      });
    }
  },

  /**
   * 逆地址解析 - 将经纬度转换为地址
   */
  async reverseGeocodeLocation(latitude, longitude) {
    return new Promise((resolve, reject) => {
      // 创建地图上下文
      const mapCtx = wx.createMapContext('publishMap', this);

      // 使用腾讯地图API进行逆地址解析
      wx.request({
        url: 'https://apis.map.qq.com/ws/geocoder/v1/',
        data: {
          location: `${latitude},${longitude}`,
          key: 'ENLBZ-LUUCQ-3SN5D-25WBS-OT3IZ-WPFF4',  // 腾讯地图API密钥
          get_poi: 1
        },
        success: (res) => {
          console.log('🗺️ 腾讯地图API返回:', res.data);

          if (res.data.status === 0 && res.data.result) {
            const result = res.data.result;
            const addressComponent = result.address_component || result.address_components;
            const formattedAddresses = result.formatted_addresses || {};
            const addressReference = result.address_reference || {};

            if (!addressComponent) {
              console.error('地址组件为空:', result);
              resolve({
                city: '昆明',
                district: '',
                street: '',
                landmark: '',
                detailedAddress: result.address || `经度:${longitude} 纬度:${latitude}`,
                fullAddress: result.address || `昆明市 经度:${longitude} 纬度:${latitude}`,
                standardAddress: result.address || `昆明市 经度:${longitude} 纬度:${latitude}`
              });
              return;
            }

            // 提取城市、区域、街道
            const city = addressComponent.city || addressComponent.province || '昆明市';
            const district = addressComponent.district || '';
            const street = addressComponent.street || '';

            // 提取地标（POI或landmark）
            let landmark = '';
            if (addressReference.landmark_l2 && addressReference.landmark_l2.title) {
              landmark = addressReference.landmark_l2.title;
            } else if (result.pois && result.pois.length > 0) {
              landmark = result.pois[0].title;
            }

            // 详细地址用于地图显示（格式：城市·区域·街道·地标）
            const detailedAddressParts = [];
            if (city) detailedAddressParts.push(city.replace('市', ''));
            if (district) detailedAddressParts.push(district.replace('区', ''));
            if (street) detailedAddressParts.push(street);
            if (landmark) detailedAddressParts.push(landmark);
            const detailedAddress = detailedAddressParts.join(' · ');

            // 标准完整地址用于填入公司地址输入框
            const standardAddress = formattedAddresses.standard_address ||
                                   formattedAddresses.recommend ||
                                   result.address ||
                                   `${city}${district}${street}`;

            // 简单完整地址（原始address）
            const fullAddress = result.address || standardAddress;

            console.log('🗺️ 逆地址解析成功:', {
              city,
              district,
              street,
              landmark,
              detailedAddress,
              fullAddress,
              standardAddress
            });

            resolve({
              city,
              district,
              street,
              landmark,
              detailedAddress,
              fullAddress,
              standardAddress
            });
          } else {
            console.error('逆地址解析失败:', res.data);
            // 如果API失败，返回默认值
            resolve({
              city: '昆明市',
              district: '',
              street: '',
              landmark: '',
              detailedAddress: `经度:${longitude} 纬度:${latitude}`,
              fullAddress: `昆明市 经度:${longitude} 纬度:${latitude}`,
              standardAddress: `昆明市 经度:${longitude} 纬度:${latitude}`
            });
          }
        },
        fail: (error) => {
          console.error('逆地址解析请求失败:', error);
          // 返回默认值
          resolve({
            city: '昆明市',
            district: '',
            street: '',
            landmark: '',
            detailedAddress: `经度:${longitude} 纬度:${latitude}`,
            fullAddress: `昆明市 经度:${longitude} 纬度:${latitude}`,
            standardAddress: `昆明市 经度:${longitude} 纬度:${latitude}`
          });
        }
      });
    });
  },

  /**
   * 地图区域变化事件 - 拖动地图选点
   */
  async onMapRegionChange(e) {
    console.log('🗺️ 地图区域变化:', e);

    // 开始拖动
    if (e.type === 'begin' && e.causedBy === 'gesture') {
      this.setData({
        isDragging: true
      });
    }

    // 拖动结束
    if (e.type === 'end' && e.causedBy === 'drag') {
      // 用户拖动了地图，获取地图中心点
      const mapCtx = wx.createMapContext('publishMap', this);

      mapCtx.getCenterLocation({
        success: async (res) => {
          console.log('🗺️ 地图中心点:', res);

          // 更新地图中心坐标
          this.setData({
            mapCenter: {
              longitude: res.longitude,
              latitude: res.latitude
            },
            isDragging: false
          });

          wx.showLoading({ title: '获取位置中...' });

          // 进行逆地址解析
          const addressInfo = await this.reverseGeocodeLocation(res.latitude, res.longitude);

          if (addressInfo) {
            // 验证地址
            const validateResult = await wx.cloud.callFunction({
              name: 'validateAddress',
              data: { address: addressInfo.fullAddress }
            });

            wx.hideLoading();

            if (validateResult.result.success && validateResult.result.valid) {
              const matchedArea = validateResult.result.matchedArea;
              const areaIndex = this.data.areaList.findIndex(a =>
                a.custom_id === matchedArea.custom_id || a.custom_id === matchedArea._id ||
                a._id === matchedArea.custom_id || a._id === matchedArea._id
              );

              this.setData({
                'formData.longitude': res.longitude,
                'formData.latitude': res.latitude,
                'formData.company_address': addressInfo.standardAddress,
                'formData.area_id': matchedArea.custom_id || matchedArea._id,  // 优先使用custom_id
                'formData.area_name': matchedArea.name,
                areaIndex: areaIndex >= 0 ? areaIndex : -1,
                isInitialLocation: false,
                currentCity: addressInfo.city,
                currentDistrict: matchedArea.name,
                detailedAddress: addressInfo.detailedAddress
              });

              wx.showToast({
                title: '位置已更新',
                icon: 'success',
                duration: 1500
              });
            } else {
              wx.showToast({
                title: '该位置不在运营范围',
                icon: 'none',
                duration: 2000
              });
            }
          } else {
            wx.hideLoading();
            wx.showToast({
              title: '获取地址失败',
              icon: 'none'
            });
          }
        },
        fail: () => {
          this.setData({ isDragging: false });
          wx.hideLoading();
        }
      });
    }
  },


  /**
   * 根据地址搜索定位
   */
  async searchLocation() {
    const address = this.data.formData.company_address;

    if (!address || !address.trim()) {
      wx.showToast({
        title: '请先输入公司地址',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '验证地址中...' });

      // 调用云函数验证地址是否在运营范围内
      const validateResult = await wx.cloud.callFunction({
        name: 'validateAddress',
        data: { address: address }
      });

      console.log('🔍 地址验证结果:', validateResult.result);

      if (!validateResult.result.success) {
        wx.hideLoading();
        wx.showToast({
          title: validateResult.result.message || '验证失败',
          icon: 'none',
          duration: 3000
        });
        return;
      }

      if (!validateResult.result.valid) {
        wx.hideLoading();
        wx.showModal({
          title: '地址验证失败',
          content: validateResult.result.message,
          showCancel: false
        });
        return;
      }

      // 地址验证通过，自动选择匹配的区域
      const matchedArea = validateResult.result.matchedArea;
      if (matchedArea) {
        const areaIndex = this.data.areaList.findIndex(a =>
          a.custom_id === matchedArea.custom_id || a.custom_id === matchedArea._id ||
          a._id === matchedArea.custom_id || a._id === matchedArea._id
        );

        // 步骤2：使用腾讯地图API将地址转换为经纬度（正向地理编码）
        wx.showLoading({ title: '解析地址中...' });
        const geocodeResult = await this.geocodeAddress(address);

        if (!geocodeResult || !geocodeResult.location) {
          wx.hideLoading();
          wx.showModal({
            title: '地址解析失败',
            content: '无法找到该地址的位置信息，请检查地址是否正确',
            showCancel: false
          });
          return;
        }

        const { lat, lng } = geocodeResult.location;
        console.log('✅ 地址解析成功，经纬度:', { lat, lng });

        // 步骤3：使用经纬度进行逆地址解析，获取详细地址信息
        wx.showLoading({ title: '获取详细地址中...' });
        const addressInfo = await this.reverseGeocodeLocation(lat, lng);

        this.setData({
          'formData.longitude': lng,
          'formData.latitude': lat,
          'formData.company_address': addressInfo.standardAddress,
          'formData.area_id': matchedArea.custom_id || matchedArea._id,  // 优先使用custom_id
          'formData.area_name': matchedArea.name,
          areaIndex: areaIndex >= 0 ? areaIndex : -1,
          currentCity: addressInfo.city,
          currentDistrict: matchedArea.name,
          detailedAddress: addressInfo.detailedAddress,
          isInitialLocation: false,
          showMapCard: true,
          mapCenter: {
            longitude: lng,
            latitude: lat
          }
        });

        console.log('✅ 地址搜索定位成功:', {
          address: addressInfo.standardAddress,
          city: addressInfo.city,
          district: matchedArea.name,
          detailedAddress: addressInfo.detailedAddress
        });

        wx.hideLoading();
        wx.showToast({
          title: '验证成功',
          icon: 'success'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 地址定位失败:', error);
      wx.showToast({
        title: error.message || '定位失败',
        icon: 'none',
        duration: 3000
      });
    }
  },

  /**
   * 地址解析(地理编码) - 将地址转换为经纬度
   */
  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://apis.map.qq.com/ws/geocoder/v1/',
        data: {
          address: address,
          key: 'ENLBZ-LUUCQ-3SN5D-25WBS-OT3IZ-WPFF4'
        },
        success: (res) => {
          console.log('🗺️ 腾讯地图地址解析返回:', res.data);

          if (res.data.status === 0 && res.data.result && res.data.result.location) {
            resolve(res.data.result);
          } else {
            reject(new Error(res.data.message || '地址解析失败'));
          }
        },
        fail: (error) => {
          console.error('❌ 地址解析请求失败:', error);
          reject(new Error('地址解析请求失败'));
        }
      });
    });
  },

  /**
   * 选择图片
   */
  async chooseImages() {
    try {
      const currentCount = this.data.images.length;
      const maxCount = 9; // 最多9张图片

      if (currentCount >= maxCount) {
        wx.showToast({
          title: `最多上传${maxCount}张图片`,
          icon: 'none'
        });
        return;
      }

      const res = await wx.chooseImage({
        count: maxCount - currentCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      });

      wx.showLoading({ title: '上传中...' });

      // 并行上传所有图片
      const uploadPromises = res.tempFilePaths.map(async (filePath) => {
        const cloudPath = `item_images/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath
        });
        return uploadResult.fileID;
      });

      const fileIDs = await Promise.all(uploadPromises);

      this.setData({
        images: [...this.data.images, ...fileIDs]
      });

      wx.showToast({
        title: `已上传${fileIDs.length}张图片`,
        icon: 'success'
      });

      console.log('✅ 图片上传成功:', fileIDs);
    } catch (error) {
      console.error('❌ 图片上传失败:', error);
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 删除图片
   */
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  /**
   * 删除Logo
   */
  deleteLogo() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除公司Logo吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'formData.company_logo': ''
          });
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      urls: this.data.images,
      current: url
    });
  },

  /**
   * 表单验证
   */
  validateForm() {
    const { formData, selectedCategories, descriptionText } = this.data;

    if (!formData.title || !formData.title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return false;
    }

    if (selectedCategories.length === 0) {
      wx.showToast({ title: '请选择至少一个分类', icon: 'none' });
      return false;
    }

    if (!formData.area_id) {
      wx.showToast({ title: '请选择区域', icon: 'none' });
      return false;
    }

    if (!formData.price_min || !formData.price_max) {
      wx.showToast({ title: '请输入价格范围', icon: 'none' });
      return false;
    }

    if (parseInt(formData.price_min) > parseInt(formData.price_max)) {
      wx.showToast({ title: '最低价不能大于最高价', icon: 'none' });
      return false;
    }

    if (!formData.price_unit_id) {
      wx.showToast({ title: '请选择价格单位', icon: 'none' });
      return false;
    }

    if (!descriptionText || !descriptionText.trim()) {
      wx.showToast({ title: '请输入职位描述', icon: 'none' });
      return false;
    }

    if (!formData.company_name || !formData.company_name.trim()) {
      wx.showToast({ title: '请输入公司名称', icon: 'none' });
      return false;
    }

    if (!formData.contact_name || !formData.contact_name.trim()) {
      wx.showToast({ title: '请输入联系人', icon: 'none' });
      return false;
    }

    if (!formData.contact_phone || !formData.contact_phone.trim()) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return false;
    }

    // 验证手机号格式（支持所有运营商号段）
    if (!this.validatePhoneNumber(formData.contact_phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }

    if (!formData.contact_wechat || !formData.contact_wechat.trim()) {
      wx.showToast({ title: '请输入微信号', icon: 'none' });
      return false;
    }

    return true;
  },

  /**
   * 验证手机号格式（支持所有运营商号段）
   * 包括：移动、联通、电信、广电、虚拟运营商
   */
  validatePhoneNumber(phone) {
    if (!phone) return false;

    // 去除所有空格和特殊字符
    phone = phone.replace(/[\s-]/g, '');

    // 必须是11位数字
    if (!/^\d{11}$/.test(phone)) {
      return false;
    }

    // 中国大陆手机号码正则（截至2025年）
    // 移动：134-139, 147, 148, 150-152, 157-159, 172, 178, 182-184, 187, 188, 195, 197, 198
    // 联通：130-132, 145, 146, 155, 156, 166, 167, 171, 175, 176, 185, 186, 196
    // 电信：133, 149, 153, 173, 174, 177, 180, 181, 189, 191, 193, 199
    // 广电：192
    // 虚拟运营商：165, 167, 170, 171
    const phoneRegex = /^1(?:3\d|4[5-9]|5[0-35-9]|6[2567]|7[0-8]|8[0-9]|9[0-35-9])\d{8}$/;

    return phoneRegex.test(phone);
  },

  /**
   * 重置表单到初始状态
   */
  resetForm() {
    this.setData({
      formData: {
        title: '',
        price_min: '',
        price_max: '',
        price_unit_id: '',
        price_unit_name: '',
        area_id: '',
        area_name: '',
        company_name: '',
        company_address: '',
        company_logo: '',
        contact_name: '',
        contact_phone: '',
        contact_wechat: '',
        longitude: null,
        latitude: null
      },
      descriptionText: '',
      selectedCategories: [],
      selectedTags: [],
      images: [],
      areaIndex: -1,
      priceUnitIndex: -1,
      currentCity: '昆明市',
      currentDistrict: '',
      detailedAddress: '',
      isInitialLocation: true,
      mapCenter: {
        longitude: 102.712251,
        latitude: 25.040609
      },
      mapMarkers: []
    });
  },

  /**
   * 提交表单
   */
  async handleSubmit() {
    // 验证表单
    if (!this.validateForm()) {
      return;
    }

    try {
      wx.showLoading({ title: this.data.isEditMode ? '保存中...' : '发布中...' });

      // 处理描述数据（文本转换为数组）
      const description = this.data.descriptionText
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.trim());

      // 构建提交数据
      const submitData = {
        action: this.data.isEditMode ? 'update' : 'create',
        data: {
          title: this.data.formData.title.trim(),
          description: description,
          price_min: parseInt(this.data.formData.price_min),
          price_max: parseInt(this.data.formData.price_max),
          price_unit_id: this.data.formData.price_unit_id,
          category_ids: this.data.selectedCategories,
          area_id: this.data.formData.area_id,
          tag_ids: this.data.selectedTags,
          company_name: this.data.formData.company_name.trim(),
          company_address: this.data.formData.company_address.trim() || '',
          company_logo: this.data.formData.company_logo || '',
          images: this.data.images || [],
          contact_name: this.data.formData.contact_name.trim(),
          contact_phone: this.data.formData.contact_phone.trim(),
          contact_wechat: this.data.formData.contact_wechat.trim() || '',
          longitude: this.data.formData.longitude,
          latitude: this.data.formData.latitude,
          access_level: this.data.formData.access_level || 'free'
        }
      };

      // 如果是编辑模式，添加ID
      if (this.data.isEditMode) {
        submitData.hash_id = this.data.editId;
      }

      // 调用云函数
      const result = await wx.cloud.callFunction({
        name: 'publishItem',
        data: submitData
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.hideLoading();

        // 编辑模式和发布模式都提供选择弹窗
        const title = this.data.isEditMode ? '保存成功' : '发布成功';
        const content = this.data.isEditMode
          ? '信息修改成功！是否继续发布新信息？'
          : '信息发布成功！是否继续发布新信息？';

        wx.showModal({
          title: title,
          content: content,
          confirmText: '继续发布',
          cancelText: '返回首页',
          success: (res) => {
            if (res.confirm) {
              // 用户选择继续发布：重置表单并切换为发布模式
              this.setData({
                isEditMode: false,
                editId: null
              });
              wx.setNavigationBarTitle({
                title: '发布信息'
              });
              this.resetForm();
              wx.pageScrollTo({
                scrollTop: 0,
                duration: 300
              });
              wx.showToast({
                title: '已清空表单',
                icon: 'success'
              });
            } else if (res.cancel) {
              // 用户选择返回首页：清空表单并重置状态
              this.setData({
                isEditMode: false,
                editId: null
              });
              wx.setNavigationBarTitle({
                title: '发布信息'
              });
              this.resetForm();

              // 跳转到首页
              wx.switchTab({
                url: '/pages/index/index'
              });
            }
          }
        });
      } else {
        wx.showToast({
          title: result.result?.message || '操作失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 提交失败:', error);
      wx.showToast({
        title: '提交失败',
        icon: 'none'
      });
    }
  },

  /**
   * 重置表单
   */
  resetForm() {
    this.setData({
      formData: {
        title: '',
        price_min: '',
        price_max: '',
        price_unit_id: '',
        price_unit_name: '',
        area_id: '',
        area_name: '',
        company_name: '',
        company_address: '',
        company_logo: '',
        contact_name: '',
        contact_phone: '',
        contact_wechat: '',
        longitude: null,
        latitude: null
      },
      descriptionText: '',
      images: [],
      selectedCategories: [],
      selectedTags: [],
      areaIndex: -1,
      priceUnitIndex: -1,
      showMapCard: false,
      mapCenter: {
        longitude: 102.712251,
        latitude: 25.040609
      },
      currentCity: '昆明',
      currentDistrict: '',
      detailedAddress: '点击下方按钮获取位置信息'
    });

    wx.showToast({
      title: '表单已清空',
      icon: 'success'
    });

    // 滚动到顶部
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    });
  }
});
