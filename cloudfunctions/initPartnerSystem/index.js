// 云函数：合作页面系统数据库初始化
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

/**
 * 合作页面系统数据库初始化
 */
exports.main = async (event, context) => {
  const { action = 'init' } = event;

  try {
    switch (action) {
      case 'init':
        return await initPartnerDatabase();

      case 'createIndexes':
        return await createDatabaseIndexes();

      case 'checkCollections':
        return await checkCollections();

      default:
        return {
          success: false,
          message: '未知操作类型'
        };
    }
  } catch (error) {
    console.error('[initPartnerSystem] 错误:', error);
    return {
      success: false,
      message: error.message || '初始化失败'
    };
  }
};

/**
 * 初始化合作页面系统数据库
 */
async function initPartnerDatabase() {
  const results = [];

  try {
    // 1. 创建 partner_pages 集合（合作页面）
    try {
      await db.collection('partner_pages').limit(1).get();
      results.push('✅ partner_pages 集合已存在');
    } catch (error) {
      await db.collection('partner_pages').add({
        data: {
          page_name: '示例合作页面',
          page_desc: '这是一个示例合作页面',
          cover_image: '',
          status: 'active',
          max_members: 60,
          member_count: 0,
          article_count: 0,
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 partner_pages 集合成功');
    }

    // 2. 创建 page_members 集合（页面成员）
    try {
      await db.collection('page_members').limit(1).get();
      results.push('✅ page_members 集合已存在');
    } catch (error) {
      await db.collection('page_members').add({
        data: {
          page_id: 'example_page_id',
          user_id: 'example_user_id',
          member_role: 'member',
          join_status: 'active',
          apply_time: new Date(),
          approve_time: new Date(),
          published_count: 0,
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 page_members 集合成功');
    }

    // 3. 创建 partner_articles 集合（合作文章）
    try {
      await db.collection('partner_articles').limit(1).get();
      results.push('✅ partner_articles 集合已存在');
    } catch (error) {
      await db.collection('partner_articles').add({
        data: {
          hash_id: 'EXAMPLE1',
          page_id: 'example_page_id',
          user_id: 'example_user_id',
          title: '示例文章',
          content: '这是示例内容',
          images: [],
          publish_type: 'partner',
          is_paid: false,
          paid_amount: 0,
          default_sort: 1,
          promotion_sort: 1,
          actual_sort: 1,
          group_type: 'partner',
          audit_status: 'approved',
          promotion_score: 100,
          is_score_sufficient: true,
          total_promotion_views: 0,
          total_promotion_visitors: 0,
          view_count: 0,
          share_count: 0,
          like_count: 0,
          status: 'active',
          is_visible: true,
          publish_time: new Date(),
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 partner_articles 集合成功');
    }

    // 4. 创建 article_read_logs 集合（阅读记录）
    try {
      await db.collection('article_read_logs').limit(1).get();
      results.push('✅ article_read_logs 集合已存在');
    } catch (error) {
      await db.collection('article_read_logs').add({
        data: {
          article_hash_id: 'EXAMPLE1',
          page_id: 'example_page_id',
          reader_id: 'example_reader_id',
          article_owner_id: 'example_user_id',
          read_source: 'default',
          promoter_id: null,
          read_start_time: new Date(),
          read_end_time: new Date(),
          read_duration: 30,
          is_read_complete: true,
          scroll_depth: 80,
          is_liked: false,
          is_shared: false,
          display_position: 1,
          device_type: 'unknown',
          network_type: 'unknown',
          create_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 article_read_logs 集合成功');
    }

    // 5. 创建 article_statistics 集合（文章统计）
    try {
      await db.collection('article_statistics').limit(1).get();
      results.push('✅ article_statistics 集合已存在');
    } catch (error) {
      await db.collection('article_statistics').add({
        data: {
          article_hash_id: 'EXAMPLE1',
          page_id: 'example_page_id',
          owner_id: 'example_user_id',
          promotion_stats: {
            own_promotion_views: 0,
            own_promotion_visitors: 0,
            own_promotion_clicks: 0,
            share_count: 0,
            read_complete_count: 0,
            like_count: 0,
            comment_count: 0
          },
          display_stats: {
            default_page_views: 0,
            others_promotion_views: 0,
            own_promotion_views: 0,
            top_10_views: 0,
            top_30_views: 0,
            top_60_views: 0,
            normal_views: 0
          },
          quality_metrics: {
            avg_read_duration: 0,
            completion_rate: 0,
            share_rate: 0,
            like_rate: 0,
            bounce_rate: 0
          },
          score_summary: {
            total_earned: 0,
            total_cost: 0,
            current_score: 100,
            daily_maintenance_cost: 5,
            last_update_time: new Date()
          },
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 article_statistics 集合成功');
    }

    // 6. 创建 promoter_earnings 集合（推广者收益）
    try {
      await db.collection('promoter_earnings').limit(1).get();
      results.push('✅ promoter_earnings 集合已存在');
    } catch (error) {
      await db.collection('promoter_earnings').add({
        data: {
          promoter_id: 'example_promoter_id',
          article_hash_id: 'EXAMPLE1',
          page_id: 'example_page_id',
          total_views: 0,
          total_visitors: 0,
          total_clicks: 0,
          total_earned_score: 0,
          rank_in_page: 1,
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 promoter_earnings 集合成功');
    }

    // 7. 创建 promotion_links 集合（推广链接）
    try {
      await db.collection('promotion_links').limit(1).get();
      results.push('✅ promotion_links 集合已存在');
    } catch (error) {
      await db.collection('promotion_links').add({
        data: {
          user_id: 'example_user_id',
          page_id: 'example_page_id',
          scene: 'examplescene',
          qr_code_url: '',
          total_views: 0,
          total_visitors: 0,
          create_time: new Date(),
          expires_at: null,
          status: 'active',
          _isExample: true
        }
      });
      results.push('✅ 创建 promotion_links 集合成功');
    }

    // 8. 创建 article_payments 集合（文章付费记录）
    try {
      await db.collection('article_payments').limit(1).get();
      results.push('✅ article_payments 集合已存在');
    } catch (error) {
      await db.collection('article_payments').add({
        data: {
          user_id: 'example_user_id',
          article_hash_id: 'EXAMPLE1',
          page_id: 'example_page_id',
          payment_type: 'publish',
          base_price: 50,
          sort_position: null,
          position_price: 0,
          extra_service_price: 0,
          total_amount: 50,
          payment_method: 'wechat',
          trade_no: '',
          transaction_id: '',
          status: 'paid',
          paid_at: new Date(),
          create_time: new Date(),
          update_time: new Date(),
          _isExample: true
        }
      });
      results.push('✅ 创建 article_payments 集合成功');
    }

    return {
      success: true,
      message: '合作页面系统数据库初始化完成',
      details: results
    };

  } catch (error) {
    console.error('[initPartnerDatabase] 错误:', error);
    return {
      success: false,
      message: error.message || '初始化失败',
      details: results
    };
  }
}

/**
 * 创建数据库索引
 */
async function createDatabaseIndexes() {
  const results = [];

  try {
    // 注意：微信云开发不支持通过代码创建索引
    // 需要在云开发控制台手动创建

    results.push('ℹ️ 微信云开发需要在控制台手动创建索引');
    results.push('');
    results.push('📝 推荐创建以下索引：');
    results.push('');
    results.push('partner_articles 集合：');
    results.push('  - hash_id: 唯一索引');
    results.push('  - page_id + actual_sort: 复合索引');
    results.push('  - page_id + publish_type + status: 复合索引');
    results.push('  - user_id + create_time: 复合索引（降序）');
    results.push('');
    results.push('page_members 集合：');
    results.push('  - page_id + user_id: 唯一复合索引');
    results.push('  - user_id + join_status: 复合索引');
    results.push('');
    results.push('article_read_logs 集合：');
    results.push('  - article_hash_id + create_time: 复合索引（降序）');
    results.push('  - reader_id + create_time: 复合索引（降序）');
    results.push('  - read_source + promoter_id: 复合索引');
    results.push('');
    results.push('article_statistics 集合：');
    results.push('  - article_hash_id: 唯一索引');
    results.push('');
    results.push('promotion_links 集合：');
    results.push('  - user_id + page_id: 复合索引');
    results.push('  - scene: 索引');
    results.push('');
    results.push('promoter_earnings 集合：');
    results.push('  - promoter_id + page_id: 复合索引');
    results.push('  - article_hash_id + total_earned_score: 复合索引（降序）');

    return {
      success: true,
      message: '索引建议已生成',
      details: results
    };

  } catch (error) {
    console.error('[createDatabaseIndexes] 错误:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * 检查集合是否存在
 */
async function checkCollections() {
  const requiredCollections = [
    'partner_pages',
    'page_members',
    'partner_articles',
    'article_read_logs',
    'article_statistics',
    'promoter_earnings',
    'promotion_links',
    'article_payments'
  ];

  const results = [];

  for (const collectionName of requiredCollections) {
    try {
      const { total } = await db.collection(collectionName).count();
      results.push({
        collection: collectionName,
        exists: true,
        count: total,
        status: '✅'
      });
    } catch (error) {
      results.push({
        collection: collectionName,
        exists: false,
        count: 0,
        status: '❌'
      });
    }
  }

  return {
    success: true,
    message: '集合检查完成',
    collections: results,
    summary: {
      total: requiredCollections.length,
      exists: results.filter(r => r.exists).length,
      missing: results.filter(r => !r.exists).length
    }
  };
}
