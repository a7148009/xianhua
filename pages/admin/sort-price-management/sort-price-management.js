// pages/admin/sort-price-management/sort-price-management.js
Page({
  data: {
    pageId: '',
    pageName: '',
    prices: [],
    loading: false,

    // 批量设置
    showBatchModal: false,
    batchForm: {
      startSort: '',
      endSort: '',
      price: ''
    },

    // 单个设置
    editingItem: null,
    showEditModal: false,
    editForm: {
      sortPosition: '',
      price: ''
    }
  },

  onLoad(options) {
    const { pageId, pageName } = options;
    if (!pageId) {
      wx.showToast({
        title: '缺少页面ID',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({
      pageId,
      pageName: pageName || '未知页面'
    });

    this.loadPrices();
  },

  onPullDownRefresh() {
    this.loadPrices().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 加载价格列表
   */
  async loadPrices() {
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({
        name: 'sortPriceManager',
        data: {
          action: 'getPrices',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          prices: result.result.data,
          loading: false
        });
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('加载价格列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 编辑单个价格
   */
  editPrice(e) {
    const { item } = e.currentTarget.dataset;
    this.setData({
      editingItem: item,
      showEditModal: true,
      editForm: {
        sortPosition: item.sort_position,
        price: item.price.toString()
      }
    });
  },

  /**
   * 保存单个价格
   */
  async savePrice() {
    const { sortPosition, price } = this.data.editForm;

    if (!price || price === '') {
      wx.showToast({
        title: '请输入价格',
        icon: 'none'
      });
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      wx.showToast({
        title: '价格格式错误',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      const result = await wx.cloud.callFunction({
        name: 'sortPriceManager',
        data: {
          action: 'setSinglePrice',
          pageId: this.data.pageId,
          sortPosition: sortPosition,
          price: priceNum
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        this.setData({ showEditModal: false });
        this.loadPrices();
      } else {
        wx.showModal({
          title: '保存失败',
          content: result.result?.message || '未知错误',
          showCancel: false
        });
      }
    } catch (error) {
      console.error('保存价格失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  },

  /**
   * 显示批量设置弹窗
   */
  showBatchSetting() {
    this.setData({
      showBatchModal: true,
      batchForm: {
        startSort: '',
        endSort: '',
        price: ''
      }
    });
  },

  /**
   * 批量设置价格
   */
  async batchSetPrice() {
    const { startSort, endSort, price } = this.data.batchForm;

    if (!startSort || !endSort || !price) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }

    const start = parseInt(startSort);
    const end = parseInt(endSort);
    const priceNum = parseFloat(price);

    if (isNaN(start) || isNaN(end) || isNaN(priceNum)) {
      wx.showToast({
        title: '格式错误',
        icon: 'none'
      });
      return;
    }

    if (start < 1 || end > 60 || start > end) {
      wx.showToast({
        title: '排序位范围：1-60',
        icon: 'none'
      });
      return;
    }

    if (priceNum < 0) {
      wx.showToast({
        title: '价格不能为负数',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '设置中...' });

      const result = await wx.cloud.callFunction({
        name: 'sortPriceManager',
        data: {
          action: 'setBatchPrice',
          pageId: this.data.pageId,
          startSort: start,
          endSort: end,
          price: priceNum
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: result.result.message || '设置成功',
          icon: 'success'
        });
        this.setData({ showBatchModal: false });
        this.loadPrices();
      } else {
        wx.showModal({
          title: '设置失败',
          content: result.result?.message || '未知错误',
          showCancel: false
        });
      }
    } catch (error) {
      console.error('批量设置失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      });
    }
  },

  /**
   * 初始化默认价格
   */
  async initDefaultPrices() {
    wx.showModal({
      title: '初始化默认价格',
      content: '将为未设置的排序位设置梯度默认价格，是否继续？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '初始化中...' });

            const result = await wx.cloud.callFunction({
              name: 'sortPriceManager',
              data: {
                action: 'initDefaultPrices',
                pageId: this.data.pageId
              }
            });

            wx.hideLoading();

            if (result.result && result.result.success) {
              wx.showToast({
                title: result.result.message,
                icon: 'success'
              });
              this.loadPrices();
            } else {
              wx.showModal({
                title: '初始化失败',
                content: result.result?.message || '未知错误',
                showCancel: false
              });
            }
          } catch (error) {
            console.error('初始化失败:', error);
            wx.hideLoading();
            wx.showToast({
              title: '初始化失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  /**
   * 表单输入处理
   */
  onEditPriceInput(e) {
    this.setData({
      'editForm.price': e.detail.value
    });
  },

  onBatchStartInput(e) {
    this.setData({
      'batchForm.startSort': e.detail.value
    });
  },

  onBatchEndInput(e) {
    this.setData({
      'batchForm.endSort': e.detail.value
    });
  },

  onBatchPriceInput(e) {
    this.setData({
      'batchForm.price': e.detail.value
    });
  },

  /**
   * 阻止事件冒泡（空函数即可）
   */
  stopPropagation() {
    // 阻止事件冒泡到 overlay
  },

  /**
   * 关闭弹窗
   */
  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  closeBatchModal() {
    this.setData({ showBatchModal: false });
  }
});
