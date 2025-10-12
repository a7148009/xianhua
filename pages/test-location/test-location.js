Page({
  data: {
    locationInfo: null,
    addressData: null,
    rawData: '',
    logs: []
  },

  onLoad() {
    this.addLog('调试页面加载完成');
  },

  /**
   * 添加日志
   */
  addLog(text) {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const logs = this.data.logs;
    logs.unshift({ time, text });

    this.setData({ logs });
    console.log(`[${time}] ${text}`);
  },

  /**
   * 清空日志
   */
  clearLog() {
    this.setData({
      logs: [],
      locationInfo: null,
      addressData: null,
      rawData: ''
    });
    wx.showToast({
      title: '已清空',
      icon: 'success'
    });
  },

  /**
   * 获取当前位置
   */
  getCurrentLocation() {
    this.addLog('开始获取当前位置...');

    wx.showLoading({ title: '获取位置中...' });

    wx.getLocation({
      type: 'gcj02',
      altitude: true,
      success: (res) => {
        this.addLog(`✅ 位置获取成功`);
        this.addLog(`经度: ${res.longitude}`);
        this.addLog(`纬度: ${res.latitude}`);
        this.addLog(`精度: ${res.accuracy}米`);

        this.setData({
          locationInfo: {
            longitude: res.longitude,
            latitude: res.latitude,
            accuracy: res.accuracy,
            altitude: res.altitude || 0,
            speed: res.speed || 0
          }
        });

        wx.hideLoading();

        // 自动调用逆地址解析
        this.testReverseGeocode(res.latitude, res.longitude);
      },
      fail: (error) => {
        wx.hideLoading();
        this.addLog(`❌ 位置获取失败: ${error.errMsg}`);
        wx.showModal({
          title: '获取位置失败',
          content: `错误信息: ${error.errMsg}\n\n请检查：\n1. 是否授权位置权限\n2. 是否开启GPS\n3. 网络是否正常`,
          showCancel: false
        });
      }
    });
  },

  /**
   * 测试逆地址解析（腾讯地图API）
   */
  async testReverseGeocode(lat, lng) {
    // 如果没有传入经纬度，使用当前存储的
    if (!lat || !lng) {
      if (!this.data.locationInfo) {
        wx.showToast({
          title: '请先获取位置',
          icon: 'none'
        });
        return;
      }
      lat = this.data.locationInfo.latitude;
      lng = this.data.locationInfo.longitude;
    }

    this.addLog('开始腾讯地图逆地址解析...');
    wx.showLoading({ title: '解析地址中...' });

    try {
      // 调用微信小程序自带的逆地址解析
      const result = await this.wxReverseGeocode(lat, lng);

      if (result) {
        this.addLog('✅ 逆地址解析成功');
        this.addLog(`标准地址: ${result.address}`);

        this.setData({
          addressData: result,
          rawData: JSON.stringify(result, null, 2)
        });

        // 解析详细信息
        if (result.address_component) {
          this.addLog(`省: ${result.address_component.province}`);
          this.addLog(`市: ${result.address_component.city}`);
          this.addLog(`区: ${result.address_component.district}`);
          this.addLog(`街道: ${result.address_component.street}`);
        }

        if (result.pois && result.pois.length > 0) {
          this.addLog(`附近POI: ${result.pois[0].title}`);
        }
      }

      wx.hideLoading();
    } catch (error) {
      wx.hideLoading();
      this.addLog(`❌ 逆地址解析失败: ${error.message}`);
      wx.showToast({
        title: '解析失败',
        icon: 'none'
      });
    }
  },

  /**
   * 显示完整地址信息
   */
  showFullAddressInfo() {
    if (!this.data.addressData) {
      wx.showToast({
        title: '请先获取位置',
        icon: 'none'
      });
      return;
    }

    const data = this.data.addressData;
    this.addLog('========== 完整地址信息 ==========');

    // 基础地址
    this.addLog(`📍 标准地址: ${data.address}`);

    // 格式化地址
    if (data.formatted_addresses) {
      this.addLog(`📮 推荐地址: ${data.formatted_addresses.recommend}`);
      this.addLog(`📮 粗略地址: ${data.formatted_addresses.rough}`);
    }

    // 地址组件
    if (data.address_component) {
      this.addLog('--- 地址组件 ---');
      this.addLog(`🌏 国家: ${data.address_component.nation}`);
      this.addLog(`🏛️ 省份: ${data.address_component.province}`);
      this.addLog(`🏙️ 城市: ${data.address_component.city}`);
      this.addLog(`🏘️ 区县: ${data.address_component.district}`);
      this.addLog(`🛣️ 街道: ${data.address_component.street}`);
      this.addLog(`🔢 街道号: ${data.address_component.street_number || '无'}`);
    }

    // 地址参考
    if (data.address_reference) {
      this.addLog('--- 地址参考 ---');

      if (data.address_reference.town) {
        this.addLog(`🏛️ 街道办: ${data.address_reference.town.title} (距离${data.address_reference.town._distance}米)`);
      }

      if (data.address_reference.street) {
        this.addLog(`🛣️ 道路: ${data.address_reference.street.title} (距离${data.address_reference.street._distance}米)`);
      }

      if (data.address_reference.landmark_l1) {
        this.addLog(`🏢 一级地标: ${data.address_reference.landmark_l1.title}`);
      }

      if (data.address_reference.landmark_l2) {
        this.addLog(`🏬 二级地标: ${data.address_reference.landmark_l2.title}`);
      }
    }

    // POI信息
    if (data.pois && data.pois.length > 0) {
      this.addLog(`--- 附近POI (共${data.pois.length}个) ---`);
      data.pois.forEach((poi, index) => {
        if (index < 10) { // 只显示前10个
          this.addLog(`${index + 1}. ${poi.title} (${poi._distance}米) - ${poi.category}`);
        }
      });
    }

    this.addLog('====================================');

    wx.showToast({
      title: '已输出完整信息',
      icon: 'success'
    });
  },

  /**
   * 微信小程序逆地址解析
   */
  wxReverseGeocode(latitude, longitude) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: 'https://apis.map.qq.com/ws/geocoder/v1/',
        data: {
          location: `${latitude},${longitude}`,
          key: 'ENLBZ-LUUCQ-3SN5D-25WBS-OT3IZ-WPFF4', // 腾讯地图API密钥
          get_poi: 1,
          poi_options: 'radius=1000;policy=1;page_size=20'  // 增加POI数量
        },
        success: (res) => {
          console.log('🗺️ 腾讯地图API完整返回:', res.data);

          if (res.data.status === 0 && res.data.result) {
            const result = res.data.result;

            // 打印更详细的信息
            this.addLog(`完整地址: ${result.address}`);
            if (result.formatted_addresses) {
              this.addLog(`推荐地址: ${result.formatted_addresses.recommend}`);
              this.addLog(`粗略地址: ${result.formatted_addresses.rough}`);
            }
            if (result.address_reference) {
              if (result.address_reference.town) {
                this.addLog(`街道办事处: ${result.address_reference.town.title}`);
              }
              if (result.address_reference.street) {
                this.addLog(`道路: ${result.address_reference.street.title}`);
              }
              if (result.address_reference.landmark_l2) {
                this.addLog(`二级地标: ${result.address_reference.landmark_l2.title}`);
              }
            }

            resolve(res.data.result);
          } else if (res.data.status === 121) {
            // 密钥错误，使用备用方案
            this.addLog('⚠️ 腾讯地图API密钥无效，使用备用方案');
            this.useFallbackGeocode(latitude, longitude)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`API错误: ${res.data.message || '未知错误'}`));
          }
        },
        fail: (error) => {
          console.error('❌ 腾讯地图API请求失败:', error);
          // 使用备用方案
          this.addLog('⚠️ API请求失败，使用备用方案');
          this.useFallbackGeocode(latitude, longitude)
            .then(resolve)
            .catch(reject);
        }
      });
    });
  },

  /**
   * 备用方案：使用模拟数据（用于测试）
   */
  useFallbackGeocode(latitude, longitude) {
    return new Promise((resolve) => {
      this.addLog('使用备用地址解析方案（模拟数据）');

      // 模拟腾讯地图API返回格式
      const mockData = {
        address: `云南省昆明市官渡区矣六街道王官路`,
        formatted_addresses: {
          recommend: '云南省昆明市官渡区矣六街道王官路附近',
          rough: '昆明市官渡区'
        },
        address_component: {
          nation: '中国',
          province: '云南省',
          city: '昆明市',
          district: '官渡区',
          street: '王官路',
          street_number: ''
        },
        ad_info: {
          nation_code: '156',
          adcode: '530111',
          city_code: '259',
          name: '中国,云南省,昆明市,官渡区',
          location: {
            lat: latitude,
            lng: longitude
          },
          nation: '中国',
          province: '云南省',
          city: '昆明市',
          district: '官渡区'
        },
        address_reference: {
          town: {
            id: '530111008',
            title: '矣六街道',
            location: {
              lat: latitude,
              lng: longitude
            },
            _distance: 0,
            _dir_desc: '内'
          },
          street: {
            id: '15744950413585408205',
            title: '王官路',
            location: {
              lat: latitude,
              lng: longitude
            },
            _distance: 0,
            _dir_desc: '附近'
          }
        },
        pois: [
          {
            id: '123456',
            title: '锦泰宾馆',
            address: '云南省昆明市官渡区王官路',
            category: '酒店:经济型酒店',
            location: {
              lat: latitude,
              lng: longitude
            },
            _distance: 50,
            _dir_desc: '东北'
          },
          {
            id: '123457',
            title: '矣六村',
            address: '云南省昆明市官渡区',
            category: '地名地址信息:村庄',
            location: {
              lat: latitude,
              lng: longitude
            },
            _distance: 100,
            _dir_desc: '北'
          }
        ],
        location: {
          lat: latitude,
          lng: longitude
        }
      };

      resolve(mockData);
    });
  },

  /**
   * 批量添加更多页面数据
   */
  async addMoreInfoData() {
    this.addLog('========== 开始添加更多页面数据 ==========');
    wx.showLoading({ title: '添加中...' });

    const data = [
      {
        sortOrder: 1,
        title: "第1条信息标题",
        content: "第1条信息内容\n请在这里粘贴从微信文章复制的内容\n包含电话和微信等联系方式",
        publishTime: "2025-01-20 10:00:00"
      },
      {
        sortOrder: 2,
        title: "第2条信息标题",
        content: "第2条信息内容",
        publishTime: "2025-01-21 10:00:00"
      },
      {
        sortOrder: 3,
        title: "第3条信息标题",
        content: "第3条信息内容",
        publishTime: "2025-01-22 10:00:00"
      },
      {
        sortOrder: 4,
        title: "第4条信息标题",
        content: "第4条信息内容",
        publishTime: "2025-01-23 10:00:00"
      },
      {
        sortOrder: 5,
        title: "第5条信息标题",
        content: "第5条信息内容",
        publishTime: "2025-01-24 10:00:00"
      }
    ];

    let successCount = 0;
    let failCount = 0;

    for (const item of data) {
      try {
        this.addLog(`正在添加第${item.sortOrder}条...`);

        const result = await wx.cloud.callFunction({
          name: 'moreInfoManager',
          data: {
            action: 'add',
            ...item
          }
        });

        console.log(`第${item.sortOrder}条云函数返回:`, result);
        console.log(`第${item.sortOrder}条result内容:`, JSON.stringify(result.result, null, 2));

        if (result.result && result.result.success) {
          this.addLog(`✅ 第${item.sortOrder}条添加成功`);
          successCount++;
        } else {
          const errorMsg = result.result ? result.result.message : '未知错误';
          this.addLog(`❌ 第${item.sortOrder}条添加失败: ${errorMsg}`);
          console.error(`第${item.sortOrder}条详细错误:`, result);
          console.error(`第${item.sortOrder}条result.result:`, result.result);
          failCount++;
        }
      } catch (error) {
        this.addLog(`❌ 第${item.sortOrder}条添加异常: ${error.message || error.errMsg || '未知异常'}`);
        console.error(`第${item.sortOrder}条异常详情:`, error);
        failCount++;
      }
    }

    wx.hideLoading();
    this.addLog(`========== 添加完成: 成功${successCount}条, 失败${failCount}条 ==========`);

    wx.showModal({
      title: '添加完成',
      content: `成功添加 ${successCount} 条\n失败 ${failCount} 条`,
      showCancel: false
    });
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: '位置信息调试工具',
      path: '/pages/test-location/test-location'
    };
  }
});
