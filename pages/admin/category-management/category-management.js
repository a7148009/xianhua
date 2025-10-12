// pages/admin/category-management/category-management.js
const app = getApp();

Page({
  data: {
    currentUser: null,
    categoryList: [],
    loading: false,
    showAddModal: false,
    showEditModal: false,
    newCategoryName: '',
    editingCategory: null,
    editCategoryName: ''
  },

  onLoad() {
    this.getCurrentUser();
    this.loadCategoryList();
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
   * 加载信息分类列表
   */
  async loadCategoryList() {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'getList',
          type: 'category'
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          categoryList: result.result.data || []
        });
        console.log('✅ 加载信息分类成功，数量:', result.result.data.length);
      } else {
        console.error('❌ 加载失败:', result.result?.message);
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载信息分类失败:', error);
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
    await this.loadCategoryList();
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
      newCategoryName: ''
    });
  },

  /**
   * 关闭添加弹窗
   */
  closeAddModal() {
    this.setData({
      showAddModal: false,
      newCategoryName: ''
    });
  },

  /**
   * 输入新分类名称
   */
  onNewCategoryInput(e) {
    this.setData({ newCategoryName: e.detail.value });
  },

  /**
   * 确认添加
   */
  async confirmAdd() {
    const name = this.data.newCategoryName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入分类名称',
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
          type: 'category',
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
        this.loadCategoryList();
      } else {
        wx.showToast({
          title: result.result?.message || '添加失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 添加分类失败:', error);
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
    const category = e.currentTarget.dataset.category;
    this.setData({
      showEditModal: true,
      editingCategory: category,
      editCategoryName: category.name
    });
  },

  /**
   * 关闭编辑弹窗
   */
  closeEditModal() {
    this.setData({
      showEditModal: false,
      editingCategory: null,
      editCategoryName: ''
    });
  },

  /**
   * 输入编辑分类名称
   */
  onEditCategoryInput(e) {
    this.setData({ editCategoryName: e.detail.value });
  },

  /**
   * 确认编辑
   */
  async confirmEdit() {
    const name = this.data.editCategoryName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入分类名称',
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
          _id: this.data.editingCategory._id,
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
        this.loadCategoryList();
      } else {
        wx.showToast({
          title: result.result?.message || '更新失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 更新分类失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    }
  },

  /**
   * 删除分类
   */
  deleteCategory(e) {
    const category = e.currentTarget.dataset.category;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${category.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'systemConfigManager',
              data: {
                action: 'delete',
                _id: category._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              this.loadCategoryList();
            } else {
              wx.showToast({
                title: result.result?.message || '删除失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 删除分类失败:', error);
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
   * 点击分类名称，弹出设置VIP分类对话框
   */
  onCategoryNameTap(e) {
    const category = e.currentTarget.dataset.category;
    const isCurrentVIP = category.isVIP || false;

    wx.showModal({
      title: '设置VIP分类',
      content: isCurrentVIP
        ? `"${category.name}" 当前已是VIP分类\n\n是否取消VIP？`
        : `是否将 "${category.name}" 设为VIP分类？\n\n（只能有1个VIP分类，设置后其他分类将变为普通分类）`,
      confirmText: isCurrentVIP ? '取消VIP' : '设为VIP',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          await this.setVIPCategory(category._id, !isCurrentVIP);
        }
      }
    });
  },

  /**
   * 设置VIP分类
   */
  async setVIPCategory(categoryId, setAsVIP) {
    try {
      wx.showLoading({ title: setAsVIP ? '设置中...' : '取消中...' });

      if (setAsVIP) {
        // 设为VIP
        const result = await wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: {
            action: 'setVIPCategory',
            _id: categoryId
          }
        });

        wx.hideLoading();

        if (result.result && result.result.success) {
          wx.showToast({
            title: '设置成功',
            icon: 'success'
          });
          this.loadCategoryList();
        } else {
          wx.showToast({
            title: result.result?.message || '设置失败',
            icon: 'none'
          });
        }
      } else {
        // 取消VIP（将该分类的isVIP设为false）
        const result = await wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: {
            action: 'update',
            _id: categoryId,
            enabled: true  // 只是更新，保持启用状态
          }
        });

        // 手动更新isVIP为false
        await wx.cloud.callFunction({
          name: 'systemConfigManager',
          data: {
            action: 'update',
            _id: categoryId
          }
        });

        wx.hideLoading();
        wx.showToast({
          title: '已取消VIP',
          icon: 'success'
        });
        this.loadCategoryList();
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 设置VIP分类失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  }
});
