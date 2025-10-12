const variableManager = require('../../../utils/variable-manager.js');

Page({
  data: {
    variables: {},
    originalVariables: {}, // 保存原始数据用于对比
    hasChanges: false
  },

  async onLoad() {
    // 加载变量
    await this.loadVariables();
  },

  /**
   * 加载所有变量
   */
  async loadVariables() {
    try {
      wx.showLoading({ title: '加载中...' });

      const variables = await variableManager.getAllVariables(true); // 强制刷新

      this.setData({
        variables: { ...variables },
        originalVariables: { ...variables }
      });

      console.log('✅ 变量加载成功:', variables);
    } catch (error) {
      console.error('❌ 加载变量失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 输入框变化
   */
  onInputChange(e) {
    const { key } = e.currentTarget.dataset;
    const { value } = e.detail;

    this.setData({
      [`variables.${key}`]: value
    });

    // 标记有变化
    this.checkHasChanges();
  },

  /**
   * 检查是否有变更
   */
  checkHasChanges() {
    const { variables, originalVariables } = this.data;

    let hasChanges = false;
    for (const key in variables) {
      if (variables[key] !== originalVariables[key]) {
        hasChanges = true;
        break;
      }
    }

    this.setData({ hasChanges });
  },

  /**
   * 保存变量
   */
  async saveVariables() {
    if (!this.data.hasChanges) {
      wx.showToast({
        title: '没有修改',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      // 移除内部字段（_id, _openid等）
      const cleanVariables = {};
      const { variables } = this.data;

      for (const key in variables) {
        if (!key.startsWith('_') && key !== 'createTime' && key !== 'updateTime') {
          cleanVariables[key] = variables[key];
        }
      }

      const result = await variableManager.batchUpdateVariables(cleanVariables);

      if (result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success',
          duration: 2000
        });

        // 更新原始数据
        this.setData({
          originalVariables: { ...cleanVariables },
          hasChanges: false
        });

        // 延迟返回，让用户看到成功提示
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({
          title: result.message || '保存失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('❌ 保存变量失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 恢复默认值
   */
  resetToDefault() {
    wx.showModal({
      title: '确认恢复默认',
      content: '确定要恢复所有变量为默认值吗？当前的修改将丢失。',
      confirmText: '确定恢复',
      confirmColor: '#ff6b35',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '恢复中...' });

            const result = await variableManager.resetVariables();

            if (result.success) {
              wx.showToast({
                title: '已恢复默认',
                icon: 'success'
              });

              // 重新加载变量
              await this.loadVariables();
            } else {
              wx.showToast({
                title: result.message || '恢复失败',
                icon: 'none'
              });
            }
          } catch (error) {
            console.error('❌ 恢复默认失败:', error);
            wx.showToast({
              title: '恢复失败',
              icon: 'none'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    await this.loadVariables();
    wx.stopPullDownRefresh();
  },

  /**
   * 页面卸载时检查未保存的修改
   */
  onUnload() {
    if (this.data.hasChanges) {
      wx.showModal({
        title: '有未保存的修改',
        content: '确定要离开吗？未保存的修改将丢失。',
        showCancel: false
      });
    }
  }
});
