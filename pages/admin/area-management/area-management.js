// pages/admin/area-management/area-management.js
Page({
  data: {
    currentUser: null,
    areaList: [],
    loading: false,
    showAddModal: false,
    showEditModal: false,
    newAreaName: '',
    newAreaCity: '昆明市',
    editingArea: null,
    editAreaName: '',
    editAreaCity: '',
    currentCity: '昆明市', // 当前筛选的城市
    cityList: ['昆明市'], // 支持的城市列表（可扩展）
  },

  onLoad() {
    this.getCurrentUser();
    this.loadAreaList();
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
   * 加载行政区域列表
   */
  async loadAreaList() {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'getList',
          type: 'area',
          city: this.data.currentCity
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          areaList: result.result.data || []
        });
        console.log('✅ 加载行政区域成功，数量:', result.result.data.length);
      } else {
        console.error('❌ 加载失败:', result.result?.message);
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载行政区域失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 切换城市筛选
   */
  onCityChange(e) {
    const city = e.detail.value;
    this.setData({
      currentCity: this.data.cityList[city]
    });
    this.loadAreaList();
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadAreaList();
    wx.stopPullDownRefresh();
  },

  /**
   * 阻止事件冒泡（空函数）
   */
  stopPropagation() {
    // 阻止事件冒泡到 modal-overlay
  },

  /**
   * 打开添加弹窗
   */
  openAddModal() {
    this.setData({
      showAddModal: true,
      newAreaName: '',
      newAreaCity: this.data.currentCity
    });
  },

  /**
   * 关闭添加弹窗
   */
  closeAddModal() {
    this.setData({
      showAddModal: false,
      newAreaName: '',
      newAreaCity: '昆明市'
    });
  },

  /**
   * 输入新区域名称
   */
  onNewAreaInput(e) {
    this.setData({ newAreaName: e.detail.value });
  },

  /**
   * 选择新区域城市
   */
  onNewCityChange(e) {
    this.setData({ newAreaCity: this.data.cityList[e.detail.value] });
  },

  /**
   * 确认添加
   */
  async confirmAdd() {
    const name = this.data.newAreaName.trim();
    const city = this.data.newAreaCity;

    if (!name) {
      wx.showToast({
        title: '请输入区域名称',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '添加中...' });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'add',
          type: 'area',
          city: city,
          name: name
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '添加成功',
          icon: 'success'
        });

        this.closeAddModal();
        this.loadAreaList();
      } else {
        wx.showToast({
          title: result.result?.message || '添加失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 添加区域失败:', error);
      wx.showToast({
        title: '添加失败',
        icon: 'none'
      });
    }
  },

  /**
   * 打开编辑弹窗
   */
  openEditModal(e) {
    const area = e.currentTarget.dataset.area;
    this.setData({
      showEditModal: true,
      editingArea: area,
      editAreaName: area.name,
      editAreaCity: area.city || '昆明市'
    });
  },

  /**
   * 关闭编辑弹窗
   */
  closeEditModal() {
    this.setData({
      showEditModal: false,
      editingArea: null,
      editAreaName: '',
      editAreaCity: ''
    });
  },

  /**
   * 输入编辑区域名称
   */
  onEditAreaInput(e) {
    this.setData({ editAreaName: e.detail.value });
  },

  /**
   * 选择编辑区域城市
   */
  onEditCityChange(e) {
    this.setData({ editAreaCity: this.data.cityList[e.detail.value] });
  },

  /**
   * 确认编辑
   */
  async confirmEdit() {
    const name = this.data.editAreaName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入区域名称',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '更新中...' });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'update',
          _id: this.data.editingArea._id,
          name: name
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '更新成功',
          icon: 'success'
        });

        this.closeEditModal();
        this.loadAreaList();
      } else {
        wx.showToast({
          title: result.result?.message || '更新失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 更新区域失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    }
  },

  /**
   * 删除区域
   */
  deleteArea(e) {
    const area = e.currentTarget.dataset.area;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${area.city || ''} ${area.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'systemConfigManager',
              data: {
                action: 'delete',
                _id: area._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              this.loadAreaList();
            } else {
              wx.showToast({
                title: result.result?.message || '删除失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 删除区域失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 根据位置添加行政区域
   * 流程：获取管理员位置 → 获取所在城市 → 获取下级区域 → 批量添加
   */
  async addByLocation() {
    try {
      // 步骤1：获取管理员当前位置
      wx.showLoading({ title: '获取位置中...' });

      wx.getLocation({
        type: 'gcj02',
        success: async (locationRes) => {
          const { latitude, longitude } = locationRes;
          console.log('✅ 获取到位置:', { latitude, longitude });

          try {
            // 步骤2：调用云函数获取该位置的城市和下级行政区域
            wx.showLoading({ title: '查询行政区域...' });

            const result = await wx.cloud.callFunction({
              name: 'getDistricts',
              data: {
                latitude: latitude,
                longitude: longitude
              }
            });

            wx.hideLoading();

            console.log('✅ 云函数返回成功:', result.result);

            if (result.result && result.result.success) {
              const { city, districts, count } = result.result.data;

              // 步骤3：确认是否批量添加
              wx.showModal({
                title: '确认批量添加',
                content: `检测到您当前位置：${city}\n\n找到 ${count} 个下级行政区域，是否批量添加？\n\n已存在的区域将自动跳过。`,
                success: async (modalRes) => {
                  if (modalRes.confirm) {
                    // 步骤4：调用批量添加接口
                    this.batchAddDistricts(city, districts);
                  }
                }
              });
            } else {
              wx.showModal({
                title: '获取行政区域失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 获取行政区域失败:', error);
            wx.showModal({
              title: '获取行政区域失败',
              content: error.message || '请稍后重试',
              showCancel: false
            });
          }
        },
        fail: (error) => {
          wx.hideLoading();
          console.error('❌ 获取位置失败:', error);

          wx.showModal({
            title: '获取位置失败',
            content: '请确保已授权位置权限，或手动添加区域。',
            showCancel: false
          });
        }
      });
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 根据位置添加失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  /**
   * 批量添加行政区域
   * @param {string} city - 城市名称
   * @param {string[]} districts - 区域名称数组
   */
  async batchAddDistricts(city, districts) {
    try {
      wx.showLoading({ title: '批量添加中...' });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'batchAddAreas',
          city: city,
          districts: districts
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const data = result.result.data;
        wx.showModal({
          title: '批量添加完成',
          content: `城市：${city}\n\n总共 ${data.total} 个区域\n✅ 新增 ${data.added} 个\n⏭️ 跳过 ${data.skipped} 个（已存在）`,
          showCancel: false,
          success: () => {
            this.loadAreaList();
          }
        });
      } else {
        wx.showToast({
          title: result.result?.message || '批量添加失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 批量添加区域失败:', error);
      wx.showToast({
        title: '批量添加失败',
        icon: 'none'
      });
    }
  },

  /**
   * 清空当前城市的所有区域
   */
  clearCurrentCityAreas() {
    const city = this.data.currentCity;
    const count = this.data.areaList.length;

    if (count === 0) {
      wx.showToast({
        title: '没有可清空的区域',
        icon: 'none'
      });
      return;
    }

    wx.showModal({
      title: '确认清空',
      content: `确定要清空"${city}"的所有${count}个区域吗？\n\n此操作不可恢复！`,
      confirmText: '确认清空',
      confirmColor: '#ff0000',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '清空中...' });

            const result = await wx.cloud.callFunction({
              name: 'systemConfigManager',
              data: {
                action: 'batchDeleteByCity',
                city: city
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: `成功删除${result.result.data.totalDeleted}个区域`,
                icon: 'success'
              });

              this.loadAreaList();
            } else {
              wx.showToast({
                title: result.result?.message || '清空失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 清空区域失败:', error);
            wx.showToast({
              title: '清空失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
