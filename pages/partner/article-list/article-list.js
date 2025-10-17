// pages/partner/article-list/article-list.js
Page({
  data: {
    pageId: null,
    pageInfo: {},
    articles: [],
    loading: false,
    hasMore: true,
    page: 1,
    limit: 20,

    // 排序模式：default (默认排序) / promotion (推广排序)
    sortMode: 'default',
    isPromoter: false // 是否当前用户是成员（可获得推广排序）
  },

  onLoad(options) {
    console.log('📄 文章列表页加载', options);

    if (options.pageId) {
      this.setData({ pageId: options.pageId });

      // 检查是否通过推广链接访问（新版Token方式）
      if (options.t) {
        console.log('🔗 通过推广链接访问，Token:', options.t);
        this.validateAndRecordPromotionVisit(options.t);
      }

      this.loadPageInfo();
      this.checkMemberStatus();
      this.loadArticles(true);
    } else {
      wx.showToast({
        title: '页面参数错误',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  onPullDownRefresh() {
    this.loadArticles(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (!this.data.loading && this.data.hasMore) {
      this.loadArticles(false);
    }
  },

  /**
   * 加载页面信息
   */
  async loadPageInfo() {
    try {
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
        wx.setNavigationBarTitle({
          title: result.result.data.page_name
        });
      }
    } catch (error) {
      console.error('❌ 加载页面信息失败:', error);
    }
  },

  /**
   * 检查成员身份（是否可以使用推广排序）
   */
  async checkMemberStatus() {
    try {
      console.log('🔍 ========== 开始检查成员身份 ==========');
      console.log('🔍 pageId:', this.data.pageId);

      // 不传递 userId，让云函数自动使用调用者的 openid
      const result = await wx.cloud.callFunction({
        name: 'partnerMemberManager',
        data: {
          action: 'getMemberInfo',
          pageId: this.data.pageId
          // 不传递 userId，云函数会自动使用 wxContext.OPENID
        }
      });

      console.log('🔍 云函数返回完整结果:', JSON.stringify(result));
      console.log('🔍 result.result:', result.result);
      console.log('🔍 result.result.success:', result.result?.success);
      console.log('🔍 result.result.is_member:', result.result?.is_member);
      console.log('🔍 result.result.message:', result.result?.message);
      console.log('🔍 result.result.data:', result.result?.data);

      if (result.result?.data) {
        console.log('🔍 成员数据详情:');
        console.log('   join_status:', result.result.data.join_status);
        console.log('   member_role:', result.result.data.member_role);
        console.log('   page_id:', result.result.data.page_id);
        console.log('   user_id:', result.result.data.user_id);
      }

      if (result.result && result.result.success && result.result.is_member) {
        console.log('✅ 是成员，设置 isPromoter = true');
        this.setData({
          isPromoter: true
        });
      } else {
        console.log('❌ 不是成员或检查失败');
        console.log('   success:', result.result?.success);
        console.log('   is_member:', result.result?.is_member);
        console.log('   message:', result.result?.message);
      }
      console.log('🔍 ========== 成员身份检查完成 ==========');
    } catch (error) {
      console.error('❌ 检查成员身份失败:', error);
      console.error('❌ 错误详情:', JSON.stringify(error));
    }
  },

  /**
   * 切换排序模式
   */
  switchSortMode() {
    if (!this.data.isPromoter) {
      wx.showToast({
        title: '仅成员可切换推广排序',
        icon: 'none'
      });
      return;
    }

    const newMode = this.data.sortMode === 'default' ? 'promotion' : 'default';
    this.setData({
      sortMode: newMode
    });
    this.loadArticles(true);
  },

  /**
   * 加载文章列表
   */
  async loadArticles(refresh = false) {
    if (refresh) {
      this.setData({
        page: 1,
        articles: [],
        hasMore: true
      });
    }

    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      // 🔍 调试信息
      console.log('🔍 ========== 开始加载文章 ==========');
      console.log('🔍 页面 pageId:', this.data.pageId);
      console.log('🔍 排序模式:', this.data.sortMode);
      console.log('🔍 是否是成员:', this.data.isPromoter);

      const action = this.data.sortMode === 'promotion'
        ? 'getListWithPromotionSort'
        : 'getListWithDefaultSort';

      const requestData = {
        action,
        pageId: this.data.pageId,
        page: this.data.page,
        limit: this.data.limit
        // 不传递 promoterId，云函数会自动使用调用者的 OPENID
      };

      console.log('🔍 调用云函数 action:', action);

      const result = await wx.cloud.callFunction({
        name: 'partnerArticleManager',
        data: requestData
      });

      if (result.result && result.result.success) {
        const articles = result.result.data || [];

        // 🔍 调试：输出返回的文章数据
        console.log('📋 云函数返回成功');
        console.log('📋 文章数量:', articles.length);
        console.log('📋 文章列表:', articles);
        articles.forEach((item, index) => {
          console.log(`  [${index + 1}] ${item.title}`);
          console.log(`      status: ${item.status}, review: ${item.review_status || '无'}`);
        });

        this.setData({
          articles: refresh ? articles : [...this.data.articles, ...articles],
          page: this.data.page + 1,
          hasMore: articles.length >= this.data.limit,
          loading: false
        });
      } else {
        console.error('❌ 云函数调用失败:', result.result?.message);
        throw new Error(result.result?.message || '加载失败');
      }
    } catch (error) {
      console.error('❌ 加载文章列表失败:', error);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  /**
   * 查看文章详情
   */
  viewArticle(e) {
    const { hashId } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/partner/article-detail/article-detail?hashId=${hashId}`
    });
  },

  /**
   * 发布新文章
   */
  publishArticle() {
    // 检查是否是成员
    if (!this.data.isPromoter) {
      wx.showModal({
        title: '提示',
        content: '您还不是该页面的成员，是否申请加入？',
        confirmText: '去申请',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack();
          }
        }
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/partner/publish/publish?pageId=${this.data.pageId}`
    });
  },

  /**
   * 显示推广链接（新版Token方式）
   */
  async showPromotionLink() {
    try {
      wx.showLoading({ title: '生成中...' });

      // 1. 生成Token
      const tokenResult = await wx.cloud.callFunction({
        name: 'partnerMemberManager',
        data: {
          action: 'generatePromotionToken',
          pageId: this.data.pageId
        }
      });

      if (!tokenResult.result || !tokenResult.result.success) {
        throw new Error(tokenResult.result?.message || 'Token生成失败');
      }

      const token = tokenResult.result.data.token;
      const isReused = tokenResult.result.data.is_reused;

      // 2. 生成URL Link（可选，用于微信外分享）
      const linkResult = await wx.cloud.callFunction({
        name: 'generateMiniCode',
        data: {
          action: 'getUrlLink',
          path: 'pages/partner/article-list/article-list',
          query: `pageId=${this.data.pageId}&t=${token}`,
          expireInterval: 30  // 30天有效期
        }
      });

      wx.hideLoading();

      const urlLink = linkResult.result?.url_link || '';
      const miniPath = `pages/partner/article-list/article-list?pageId=${this.data.pageId}&t=${token}`;

      // 显示多种分享方式
      wx.showActionSheet({
        itemList: ['复制小程序路径', '复制URL链接（微信外可用）', '生成小程序码'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 复制小程序路径
            wx.setClipboardData({
              data: miniPath,
              success: () => {
                wx.showToast({ title: '路径已复制', icon: 'success' });
              }
            });
          } else if (res.tapIndex === 1) {
            // 复制URL Link
            if (urlLink) {
              wx.setClipboardData({
                data: urlLink,
                success: () => {
                  wx.showToast({ title: 'URL链接已复制', icon: 'success' });
                }
              });
            } else {
              wx.showToast({ title: 'URL链接生成失败', icon: 'none' });
            }
          } else if (res.tapIndex === 2) {
            // 生成小程序码
            this.generateMiniCode(token);
          }
        }
      });
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 显示推广链接失败:', error);
      wx.showToast({
        title: error.message || '获取失败',
        icon: 'none'
      });
    }
  },

  /**
   * 生成小程序码
   */
  async generateMiniCode(token) {
    try {
      wx.showLoading({ title: '生成小程序码...' });

      // scene参数：最多32个字符
      const scene = `t=${token}&p=${this.data.pageId.substring(0, 20)}`;

      const result = await wx.cloud.callFunction({
        name: 'generateMiniCode',
        data: {
          action: 'getUnlimited',
          scene: scene,
          page: 'pages/partner/article-list/article-list',
          width: 280
        }
      });

      wx.hideLoading();

      if (result.result && result.result.success) {
        // 将Buffer保存到临时文件
        const fs = wx.getFileSystemManager();
        const filePath = `${wx.env.USER_DATA_PATH}/minicode_${Date.now()}.jpg`;

        fs.writeFile({
          filePath: filePath,
          data: result.result.buffer,
          encoding: 'binary',
          success: () => {
            // 预览小程序码
            wx.previewImage({
              urls: [filePath],
              success: () => {
                wx.showToast({
                  title: '长按保存小程序码',
                  icon: 'none',
                  duration: 2000
                });
              }
            });
          },
          fail: (err) => {
            console.error('保存小程序码失败:', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      } else {
        throw new Error('生成小程序码失败');
      }
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 生成小程序码失败:', error);
      wx.showToast({
        title: '生成失败',
        icon: 'none'
      });
    }
  },

  /**
   * 验证Token并记录推广访问（新版）
   */
  async validateAndRecordPromotionVisit(token) {
    try {
      // 1. 验证Token
      const validateResult = await wx.cloud.callFunction({
        name: 'partnerMemberManager',
        data: {
          action: 'validatePromotionToken',
          token: token,
          pageId: this.data.pageId
        }
      });

      if (validateResult.result && validateResult.result.success) {
        const promoterId = validateResult.result.data.promoter_id;
        console.log('✅ Token验证成功，推广者:', promoterId);

        // 2. 记录推广访问
        await wx.cloud.callFunction({
          name: 'partnerMemberManager',
          data: {
            action: 'recordPromotionVisit',
            pageId: this.data.pageId,
            promoterId: promoterId
          }
        });

        console.log('✅ 推广访问记录成功');
      } else {
        console.log('⚠️ Token无效或已过期:', validateResult.result?.message);
      }
    } catch (error) {
      console.error('❌ 验证Token或记录访问失败:', error);
    }
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * 分享功能（新版Token方式）
   */
  onShareAppMessage() {
    // 如果是成员，需要生成Token后分享
    if (this.data.isPromoter) {
      // 先返回一个Promise，异步获取Token
      return new Promise(async (resolve) => {
        try {
          const result = await wx.cloud.callFunction({
            name: 'partnerMemberManager',
            data: {
              action: 'generatePromotionToken',
              pageId: this.data.pageId
            }
          });

          if (result.result && result.result.success) {
            const token = result.result.data.token;
            resolve({
              title: `${this.data.pageInfo.page_name || '合作页面'} - 精选文章推荐`,
              path: `/pages/partner/article-list/article-list?pageId=${this.data.pageId}&t=${token}`,
              imageUrl: this.data.pageInfo.cover_image || ''
            });
          } else {
            // 生成Token失败，分享普通链接
            resolve({
              title: `${this.data.pageInfo.page_name || '合作页面'} - 精选文章`,
              path: `/pages/partner/article-list/article-list?pageId=${this.data.pageId}`,
              imageUrl: this.data.pageInfo.cover_image || ''
            });
          }
        } catch (error) {
          console.error('❌ 分享时生成Token失败:', error);
          // 失败时分享普通链接
          resolve({
            title: `${this.data.pageInfo.page_name || '合作页面'} - 精选文章`,
            path: `/pages/partner/article-list/article-list?pageId=${this.data.pageId}`,
            imageUrl: this.data.pageInfo.cover_image || ''
          });
        }
      });
    }

    // 非成员分享普通链接
    return {
      title: `${this.data.pageInfo.page_name || '合作页面'} - 精选文章`,
      path: `/pages/partner/article-list/article-list?pageId=${this.data.pageId}`,
      imageUrl: this.data.pageInfo.cover_image || ''
    };
  }
});
