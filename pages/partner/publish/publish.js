// pages/partner/publish/publish.js
Page({
  data: {
    // 页面基本信息
    pageId: null,
    pageInfo: {},

    // 编辑模式
    isEditMode: false, // 是否为编辑模式
    hashId: null, // 编辑的文章ID

    // 发布模式
    publishMode: 'partner', // 'partner' 合作发布 | 'paid' 付费发布

    // 表单数据
    formData: {
      title: '',
      content: ''
    },

    // 排序位置相关
    sortPrices: [], // 所有排序位的价格
    selectedSort: null, // 选中的排序位
    selectedPrice: 0, // 选中排序位的价格

    // 支付状态
    isPaid: false, // 是否已付费
    orderId: null, // 订单ID
    canPublish: false, // 是否可以发布

    // 用户信息
    userInfo: null
  },

  onLoad(options) {
    console.log('📝 发布页加载', options);

    // 编辑模式
    if (options.hashId && options.mode === 'edit') {
      this.setData({
        isEditMode: true,
        hashId: options.hashId
      });
      this.loadArticleForEdit();
      return;
    }

    // 新建模式
    if (options.pageId) {
      this.setData({
        pageId: options.pageId,
        publishMode: 'partner' // 默认合作发布模式
      });
      this.loadPageInfo();
      this.loadSortPrices();
    } else {
      wx.showToast({
        title: '页面参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ userInfo });
  },

  /**
   * 加载文章数据（编辑模式）
   */
  async loadArticleForEdit() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'getArticleDetail',
          hashId: this.data.hashId
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const article = result.result.data;

        // 验证是否是文章所有者
        const userInfo = wx.getStorageSync('userInfo');
        if (article.user_id !== userInfo?.openid) {
          wx.showModal({
            title: '无权限',
            content: '您没有权限编辑此文章',
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
          return;
        }

        this.setData({
          pageId: article.page_id,
          publishMode: article.publish_type,
          formData: {
            title: article.title,
            content: article.content
          }
        });

        // 加载页面信息
        this.loadPageInfo();
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('❌ 加载文章失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '加载失败',
        content: error.message || '未知错误',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  /**
   * 切换发布模式
   */
  switchMode(e) {
    const { mode } = e.currentTarget.dataset;
    this.setData({
      publishMode: mode,
      // 切换模式时重置支付相关状态
      selectedSort: null,
      selectedPrice: 0,
      isPaid: false,
      canPublish: false,
      orderId: null
    });
  },

  /**
   * 加载页面信息
   */
  async loadPageInfo() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'partnerPageManager',
        data: {
          action: 'getPageDetail',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        this.setData({
          pageInfo: result.result.data
        });
      } else {
        throw new Error(result.result?.message || '加载页面信息失败');
      }
    } catch (error) {
      console.error('❌ 加载页面信息失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 加载排序位价格
   */
  async loadSortPrices() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'sortPriceManager',
        data: {
          action: 'getPrices',
          pageId: this.data.pageId
        }
      });

      if (result.result && result.result.success) {
        // 只显示1-60的排序位
        const prices = result.result.data.filter(item =>
          item.sort_position >= 1 && item.sort_position <= 60
        );
        this.setData({
          sortPrices: prices
        });
      }
    } catch (error) {
      console.error('❌ 加载排序价格失败:', error);
      wx.showToast({
        title: '加载价格失败',
        icon: 'none'
      });
    }
  },

  /**
   * 选择排序位
   */
  selectSort(e) {
    const { item } = e.currentTarget.dataset;

    if (!item.is_available) {
      wx.showToast({
        title: '该排序位已被占用',
        icon: 'none'
      });
      return;
    }

    this.setData({
      selectedSort: item.sort_position,
      selectedPrice: item.price,
      // 重置支付状态（如果重新选择了排序位）
      isPaid: false,
      canPublish: false
    });

    // 根据发布模式显示不同提示
    const message = this.data.publishMode === 'paid'
      ? `已选择排序位${item.sort_position}，价格¥${item.price}`
      : `已选择排序位${item.sort_position}`;

    wx.showToast({
      title: message,
      icon: 'success'
    });
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
   * 表单验证
   */
  validateForm() {
    const { formData } = this.data;

    if (!formData.title || !formData.title.trim()) {
      wx.showToast({ title: '请输入文章标题', icon: 'none' });
      return false;
    }

    if (formData.title.length > 100) {
      wx.showToast({ title: '标题不能超过100个字符', icon: 'none' });
      return false;
    }

    if (!formData.content || !formData.content.trim()) {
      wx.showToast({ title: '请输入文章内容', icon: 'none' });
      return false;
    }

    if (formData.content.length > 5000) {
      wx.showToast({ title: '内容不能超过5000个字符', icon: 'none' });
      return false;
    }

    return true;
  },

  /**
   * 去付费
   */
  async handlePay() {
    // 先验证表单
    if (!this.validateForm()) {
      return;
    }

    // 验证是否选择了排序位
    if (!this.data.selectedSort) {
      wx.showToast({
        title: '请选择排序位置',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '创建订单中...' });

      // 创建付费订单
      const result = await wx.cloud.callFunction({
        name: 'vipOrderManager',
        data: {
          action: 'create',
          orderType: 'article_publish',
          amount: this.data.selectedPrice,
          relatedId: `${this.data.pageId}_sort_${this.data.selectedSort}`,
          description: `付费发布文章 - 排序位${this.data.selectedSort}`
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const orderId = result.result.data.order_id;
        this.setData({ orderId });

        // 跳转到支付页面
        wx.navigateTo({
          url: `/pages/payment/payment?orderId=${orderId}&type=article_publish`,
          events: {
            // 监听支付成功事件
            paymentSuccess: (data) => {
              this.handlePaymentSuccess(data);
            }
          }
        });
      } else {
        throw new Error(result.result?.message || '创建订单失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 创建订单失败:', error);
      wx.showModal({
        title: '创建订单失败',
        content: error.message || '请重试',
        showCancel: false
      });
    }
  },

  /**
   * 处理支付成功
   */
  handlePaymentSuccess(data) {
    this.setData({
      isPaid: true,
      canPublish: true
    });

    wx.showToast({
      title: '支付成功，可以发布了',
      icon: 'success'
    });
  },

  /**
   * 提交发布
   */
  async handleSubmit() {
    if (!this.validateForm()) {
      return;
    }

    // 编辑模式
    if (this.data.isEditMode) {
      return this.updateArticle();
    }

    // 新建模式
    const { publishMode, formData, pageId, selectedSort, selectedPrice, orderId } = this.data;

    // 验证是否选择了排序位（两种模式都需要）
    if (!selectedSort) {
      wx.showToast({
        title: '请选择排序位置',
        icon: 'none'
      });
      return;
    }

    // 付费发布模式需要检查支付状态
    if (publishMode === 'paid') {
      if (!this.data.canPublish) {
        wx.showToast({
          title: '请先完成付费',
          icon: 'none'
        });
        return;
      }
    }

    try {
      wx.showLoading({ title: '发布中...' });

      // 调用云函数发布文章
      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'createArticle',
          pageId: pageId,
          publishType: publishMode,
          title: formData.title.trim(),
          content: formData.content.trim(),
          images: [],
          contactPhone: '',
          contactWechat: '',
          customSort: selectedSort, // 合作发布和付费发布都传递选中的排序位
          payAmount: publishMode === 'paid' ? selectedPrice : 0,
          orderId: publishMode === 'paid' ? orderId : null
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const article = result.result.data;

        const successMessage = publishMode === 'paid'
          ? `文章已成功发布！排序位置: ${selectedSort}`
          : `文章已提交审核，排序位置: ${selectedSort}，请等待管理员审核`;

        wx.showModal({
          title: '发布成功',
          content: successMessage,
          confirmText: '查看文章',
          cancelText: '返回',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: `/pages/partner/article-detail/article-detail?hashId=${article.hash_id}`
              });
            } else {
              wx.navigateBack();
            }
          }
        });
      } else {
        throw new Error(result.result?.message || '发布失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 发布失败:', error);
      wx.showModal({
        title: '发布失败',
        content: error.message || '发布文章失败，请重试',
        showCancel: false
      });
    }
  },

  /**
   * 更新文章（编辑模式）
   */
  async updateArticle() {
    try {
      wx.showLoading({ title: '保存中...' });

      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: {
          action: 'update',
          hashId: this.data.hashId,
          title: this.data.formData.title.trim(),
          content: this.data.formData.content.trim()
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(result.result?.message || '保存失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 保存失败:', error);
      wx.showModal({
        title: '保存失败',
        content: error.message || '保存文章失败，请重试',
        showCancel: false
      });
    }
  }
});
