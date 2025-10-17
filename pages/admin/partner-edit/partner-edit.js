// pages/admin/partner-edit/partner-edit.js
Page({
  data: {
    isEdit: false,
    pageId: null,
    formData: {
      pageName: '',
      pageDesc: '',
      maxMembers: 60,
      enableAutoApprove: false,
      status: 'active'
    },
    statusOptions: [
      { value: 'active', label: '活跃' },
      { value: 'disabled', label: '已禁用' }
    ],
    statusIndex: 0
  },

  onLoad(options) {
    if (options.pageId) {
      this.setData({
        isEdit: true,
        pageId: options.pageId
      });
      this.loadPageData(options.pageId);
    }
  },

  /**
   * 加载页面数据
   */
  async loadPageData(pageId) {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageDetail',
          pageId: pageId
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const page = result.result.data;
        const statusIndex = this.data.statusOptions.findIndex(
          opt => opt.value === page.status
        );

        this.setData({
          formData: {
            pageName: page.page_name,
            pageDesc: page.page_desc || '',
            maxMembers: page.max_members,
            enableAutoApprove: page.enable_auto_approve || false,
            status: page.status
          },
          statusIndex: statusIndex >= 0 ? statusIndex : 0
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载页面数据失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '加载失败',
        content: error.message,
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
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
   * 开关变化
   */
  onSwitchChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({
      [`formData.${field}`]: value
    });
  },

  /**
   * 状态选择变化
   */
  onStatusChange(e) {
    const index = e.detail.value;
    this.setData({
      statusIndex: index,
      'formData.status': this.data.statusOptions[index].value
    });
  },

  /**
   * 保存
   */
  async handleSave() {
    const { formData, isEdit, pageId } = this.data;

    // 验证必填项
    if (!formData.pageName || formData.pageName.trim().length === 0) {
      wx.showToast({
        title: '请输入页面名称',
        icon: 'none'
      });
      return;
    }

    if (formData.maxMembers < 1 || formData.maxMembers > 1000) {
      wx.showToast({
        title: '最大成员数范围：1-1000',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: isEdit ? '保存中...' : '创建中...' });

      const action = isEdit ? 'updatePage' : 'createPage';
      const data = {
        action,
        pageName: formData.pageName.trim(),
        pageDesc: formData.pageDesc.trim(),
        maxMembers: parseInt(formData.maxMembers),
        enableAutoApprove: formData.enableAutoApprove
      };

      if (isEdit) {
        data.pageId = pageId;
        data.status = formData.status;
      }

      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: isEdit ? '保存成功' : '创建成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showModal({
          title: isEdit ? '保存失败' : '创建失败',
          content: result.result?.message || '未知错误',
          showCancel: false
        });
      }
    } catch (error) {
      console.error('保存失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '操作失败',
        content: error.message || '未知错误',
        showCancel: false
      });
    }
  },

  /**
   * 取消
   */
  handleCancel() {
    wx.navigateBack();
  }
});
