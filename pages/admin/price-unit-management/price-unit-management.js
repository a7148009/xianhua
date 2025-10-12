// pages/admin/price-unit-management/price-unit-management.js
const app = getApp();

Page({
  data: {
    currentUser: null,
    priceUnitList: [],
    loading: false,
    showAddModal: false,
    showEditModal: false,
    newPriceUnitName: '',
    editingPriceUnit: null,
    editPriceUnitName: ''
  },

  onLoad() {
    this.getCurrentUser();
    this.loadPriceUnitList();
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
   * 加载价格单位列表
   */
  async loadPriceUnitList() {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'getList',
          type: 'price_unit'
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          priceUnitList: result.result.data || []
        });
        console.log('✅ 加载价格单位成功，数量:', result.result.data.length);
      } else {
        console.error('❌ 加载失败:', result.result?.message);
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载价格单位失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadPriceUnitList();
    wx.stopPullDownRefresh();
  },

  /**
   * 打开添加弹窗
   */
  openAddModal() {
    if (this.data.priceUnitList.length >= 10) {
      wx.showToast({
        title: '最多支持10个价格单位',
        icon: 'none'
      });
      return;
    }

    this.setData({
      showAddModal: true,
      newPriceUnitName: ''
    });
  },

  /**
   * 关闭添加弹窗
   */
  closeAddModal() {
    this.setData({
      showAddModal: false,
      newPriceUnitName: ''
    });
  },

  /**
   * 输入新价格单位名称
   */
  onNewPriceUnitInput(e) {
    this.setData({ newPriceUnitName: e.detail.value });
  },

  /**
   * 确认添加
   */
  async confirmAdd() {
    const name = this.data.newPriceUnitName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入价格单位',
        icon: 'none'
      });
      return;
    }

    if (name.length > 15) {
      wx.showToast({
        title: '价格单位不能超过15个字',
        icon: 'none'
      });
      return;
    }

    if (this.data.priceUnitList.length >= 10) {
      wx.showToast({
        title: '最多支持10个价格单位',
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
          type: 'price_unit',
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
        this.loadPriceUnitList();
      } else {
        wx.showToast({
          title: result.result?.message || '添加失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 添加价格单位失败:', error);
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
    const priceUnit = e.currentTarget.dataset.priceunit;
    this.setData({
      showEditModal: true,
      editingPriceUnit: priceUnit,
      editPriceUnitName: priceUnit.name
    });
  },

  /**
   * 关闭编辑弹窗
   */
  closeEditModal() {
    this.setData({
      showEditModal: false,
      editingPriceUnit: null,
      editPriceUnitName: ''
    });
  },

  /**
   * 输入编辑价格单位名称
   */
  onEditPriceUnitInput(e) {
    this.setData({ editPriceUnitName: e.detail.value });
  },

  /**
   * 确认编辑
   */
  async confirmEdit() {
    const name = this.data.editPriceUnitName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入价格单位',
        icon: 'none'
      });
      return;
    }

    if (name.length > 15) {
      wx.showToast({
        title: '价格单位不能超过15个字',
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
          _id: this.data.editingPriceUnit._id,
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
        this.loadPriceUnitList();
      } else {
        wx.showToast({
          title: result.result?.message || '更新失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 更新价格单位失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    }
  },

  /**
   * 删除价格单位
   */
  deletePriceUnit(e) {
    const priceUnit = e.currentTarget.dataset.priceunit;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${priceUnit.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'systemConfigManager',
              data: {
                action: 'delete',
                _id: priceUnit._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              this.loadPriceUnitList();
            } else {
              wx.showToast({
                title: result.result?.message || '删除失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 删除价格单位失败:', error);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
