// pages/admin/vip-settings/vip-settings.js
Page({
  data: {
    plans: [], // VIP套餐列表
    showEditModal: false, // 是否显示编辑弹窗
    editingIndex: -1, // 正在编辑的套餐索引（-1表示新增）
    editingPlan: null, // 正在编辑的套餐数据
    editForm: { // 编辑表单
      duration: '',
      unit: '',
      price: '',
      originalPrice: '',
      save: '',
      months: '',
      badge: ''
    }
  },

  async onLoad() {
    console.log('[vip-settings] 页面加载');
    // 检查管理员权限
    await this.checkAdminPermission();
    // 加载VIP套餐
    await this.loadPlans();
  },

  /**
   * 检查管理员权限
   */
  async checkAdminPermission() {
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || userInfo.role !== 'admin') {
      wx.showModal({
        title: '权限不足',
        content: '仅管理员可访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
      return false;
    }
    return true;
  },

  /**
   * 加载VIP套餐
   */
  async loadPlans() {
    try {
      wx.showLoading({ title: '加载中...' });

      const result = await wx.cloud.callFunction({
        name: 'vipManager',
        data: {
          action: 'getPlans'
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        const plans = result.result.data || [];
        this.setData({ plans });
        console.log('[vip-settings] VIP套餐加载成功:', plans);
      } else {
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[vip-settings] 加载VIP套餐失败:', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      // 使用空数组
      this.setData({ plans: [] });
    }
  },

  /**
   * 添加套餐
   */
  onAddPlan() {
    this.setData({
      showEditModal: true,
      editingIndex: -1,
      editingPlan: null,
      editForm: {
        duration: '',
        unit: '月',
        price: '',
        originalPrice: '',
        save: '',
        months: '',
        badge: ''
      }
    });
  },

  /**
   * 编辑套餐
   */
  onEditPlan(e) {
    const { index } = e.currentTarget.dataset;
    const plan = this.data.plans[index];

    this.setData({
      showEditModal: true,
      editingIndex: index,
      editingPlan: plan,
      editForm: {
        duration: plan.duration || '',
        unit: plan.unit || '月',
        price: String(plan.price || ''),
        originalPrice: String(plan.originalPrice || ''),
        save: String(plan.save || ''),
        months: String(plan.months || ''),
        badge: plan.badge || ''
      }
    });
  },

  /**
   * 删除套餐
   */
  onDeletePlan(e) {
    const { index } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个套餐吗？',
      success: (res) => {
        if (res.confirm) {
          const plans = [...this.data.plans];
          plans.splice(index, 1);
          this.setData({ plans });
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 关闭弹窗
   */
  onCloseModal() {
    this.setData({
      showEditModal: false,
      editingIndex: -1,
      editingPlan: null
    });
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止冒泡到 overlay
  },

  /**
   * 表单输入处理
   */
  onInputDuration(e) {
    this.setData({ 'editForm.duration': e.detail.value });
  },

  onInputUnit(e) {
    this.setData({ 'editForm.unit': e.detail.value });
  },

  onInputPrice(e) {
    this.setData({ 'editForm.price': e.detail.value });
  },

  onInputOriginalPrice(e) {
    this.setData({ 'editForm.originalPrice': e.detail.value });
  },

  onInputSave(e) {
    this.setData({ 'editForm.save': e.detail.value });
  },

  onInputMonths(e) {
    this.setData({ 'editForm.months': e.detail.value });
  },

  onInputBadge(e) {
    this.setData({ 'editForm.badge': e.detail.value });
  },

  /**
   * 确认编辑
   */
  onConfirmEdit() {
    const form = this.data.editForm;

    // 验证必填项
    if (!form.duration) {
      wx.showToast({
        title: '请输入套餐时长',
        icon: 'none'
      });
      return;
    }

    if (!form.price) {
      wx.showToast({
        title: '请输入价格',
        icon: 'none'
      });
      return;
    }

    if (!form.months) {
      wx.showToast({
        title: '请输入月数',
        icon: 'none'
      });
      return;
    }

    // 构建套餐数据
    const planData = {
      id: this.data.editingPlan ? this.data.editingPlan.id : `plan_${Date.now()}`,
      duration: form.duration,
      unit: form.unit || '月',
      price: parseFloat(form.price) || 0,
      originalPrice: form.originalPrice ? parseFloat(form.originalPrice) : null,
      save: form.save ? parseFloat(form.save) : null,
      months: parseInt(form.months) || 0,
      badge: form.badge || null
    };

    // 更新或添加套餐
    const plans = [...this.data.plans];
    if (this.data.editingIndex >= 0) {
      // 编辑现有套餐
      plans[this.data.editingIndex] = planData;
    } else {
      // 添加新套餐
      plans.push(planData);
    }

    this.setData({
      plans,
      showEditModal: false,
      editingIndex: -1,
      editingPlan: null
    });

    wx.showToast({
      title: this.data.editingIndex >= 0 ? '修改成功' : '添加成功',
      icon: 'success'
    });
  },

  /**
   * 保存设置
   */
  async onSave() {
    if (this.data.plans.length === 0) {
      wx.showToast({
        title: '请至少添加一个套餐',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '保存中...' });

      const result = await wx.cloud.callFunction({
        name: 'vipManager',
        data: {
          action: 'setPlans',
          plans: this.data.plans
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        console.log('[vip-settings] VIP套餐保存成功');
      } else {
        throw new Error(result.result?.message || '保存失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('[vip-settings] 保存VIP套餐失败:', error);
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      });
    }
  }
});
