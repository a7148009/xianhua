// pages/admin/tag-management/tag-management.js
const app = getApp();

Page({
  data: {
    currentUser: null,
    tagList: [],
    loading: false,
    showAddModal: false,
    showEditModal: false,
    newTagName: '',
    editingTag: null,
    editTagName: ''
  },

  onLoad() {
    this.getCurrentUser();
    this.loadTagList();
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
   * 加载标签列表
   */
  async loadTagList() {
    if (this.data.loading) return;

    try {
      this.setData({ loading: true });

      const result = await wx.cloud.callFunction({
        name: 'systemConfigManager',
        data: {
          action: 'getList',
          type: 'tag'
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          tagList: result.result.data || []
        });
        console.log('✅ 加载标签成功，数量:', result.result.data.length);
      } else {
        console.error('❌ 加载失败:', result.result?.message);
        wx.showToast({
          title: result.result?.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 加载标签失败:', error);
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
    await this.loadTagList();
    wx.stopPullDownRefresh();
  },

  /**
   * 打开添加弹窗
   */
  openAddModal() {
    if (this.data.tagList.length >= 20) {
      wx.showToast({
        title: '最多支持20个标签',
        icon: 'none'
      });
      return;
    }

    this.setData({
      showAddModal: true,
      newTagName: ''
    });
  },

  /**
   * 关闭添加弹窗
   */
  closeAddModal() {
    this.setData({
      showAddModal: false,
      newTagName: ''
    });
  },

  /**
   * 输入新标签名称
   */
  onNewTagInput(e) {
    this.setData({ newTagName: e.detail.value });
  },

  /**
   * 确认添加
   */
  async confirmAdd() {
    const name = this.data.newTagName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入标签名称',
        icon: 'none'
      });
      return;
    }

    if (name.length > 10) {
      wx.showToast({
        title: '标签名称不能超过10个字',
        icon: 'none'
      });
      return;
    }

    if (this.data.tagList.length >= 20) {
      wx.showToast({
        title: '最多支持20个标签',
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
          type: 'tag',
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
        this.loadTagList();
      } else {
        wx.showToast({
          title: result.result?.message || '添加失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 添加标签失败:', error);
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
    const tag = e.currentTarget.dataset.tag;
    this.setData({
      showEditModal: true,
      editingTag: tag,
      editTagName: tag.name
    });
  },

  /**
   * 关闭编辑弹窗
   */
  closeEditModal() {
    this.setData({
      showEditModal: false,
      editingTag: null,
      editTagName: ''
    });
  },

  /**
   * 输入编辑标签名称
   */
  onEditTagInput(e) {
    this.setData({ editTagName: e.detail.value });
  },

  /**
   * 确认编辑
   */
  async confirmEdit() {
    const name = this.data.editTagName.trim();

    if (!name) {
      wx.showToast({
        title: '请输入标签名称',
        icon: 'none'
      });
      return;
    }

    if (name.length > 10) {
      wx.showToast({
        title: '标签名称不能超过10个字',
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
          _id: this.data.editingTag._id,
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
        this.loadTagList();
      } else {
        wx.showToast({
          title: result.result?.message || '更新失败',
          icon: 'none'
        });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 更新标签失败:', error);
      wx.showToast({
        title: '更新失败',
        icon: 'none'
      });
    }
  },

  /**
   * 删除标签
   */
  deleteTag(e) {
    const tag = e.currentTarget.dataset.tag;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${tag.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' });

            const result = await wx.cloud.callFunction({
              name: 'systemConfigManager',
              data: {
                action: 'delete',
                _id: tag._id
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });

              this.loadTagList();
            } else {
              wx.showToast({
                title: result.result?.message || '删除失败',
                icon: 'none'
              });
            }
          } catch (error) {
            wx.hideLoading();
            console.error('❌ 删除标签失败:', error);
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
