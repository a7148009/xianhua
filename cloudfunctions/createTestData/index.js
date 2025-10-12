// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 测试数据
    const testData = [
      {
        sortOrder: 1,
        title: "急招花店销售员",
        content: `花店急招销售员2名,要求:
1. 热爱鲜花行业
2. 有良好的沟通能力
3. 工作认真负责
工资:底薪3000+提成
电话:13800138000
微信:flower_sale123`,
        publishTime: new Date('2025-01-10 09:00:00')
      },
      {
        sortOrder: 2,
        title: "鲜花配送员招聘",
        content: `招聘鲜花配送员,五华区
要求:
- 有电动车
- 熟悉五华区路线
- 吃苦耐劳
薪资:6000-8000元/月
联系电话:138-0013-8001
微信同号`,
        publishTime: new Date('2025-01-11 10:30:00')
      },
      {
        sortOrder: 3,
        title: "花艺师学徒",
        content: `花艺工作室招收学徒
包教包会,学成后可留用
学习内容:插花、花束制作、婚礼花艺等
手机:13800138002
VX:huayi_xuetu`,
        publishTime: new Date('2025-01-12 14:00:00')
      },
      {
        sortOrder: 4,
        title: "婚庆花艺布置团队",
        content: `专业婚庆花艺布置
服务项目:
婚礼现场布置、鲜花拱门、路引花球等
价格优惠,质量保证
咨询电话:0871-12345678
微信:weddingflower2025`,
        publishTime: new Date('2025-01-13 16:20:00')
      },
      {
        sortOrder: 5,
        title: "花卉批发供应",
        content: `昆明斗南花市直供
各类鲜花批发
玫瑰、百合、康乃馨、满天星等
质量好,价格低
联系方式:
电话:13800138003
微信:dounan_huahui
欢迎实地考察!`,
        publishTime: new Date('2025-01-14 08:45:00')
      },
      {
        sortOrder: 6,
        title: "节日花束预定",
        content: `情人节、妇女节花束预定
提前预定享优惠
99朵玫瑰特价399元
TEL:13800138004
微信:jieri_huashu`,
        publishTime: new Date('2025-01-15 11:00:00')
      },
      {
        sortOrder: 7,
        title: "花店转让",
        content: `盘龙区花店转让
位置好,客源稳定
因个人原因转让
转让费可议
电话☎️:13800138005
VX:huadian_zhuanrang`,
        publishTime: new Date('2025-01-16 13:30:00')
      },
      {
        sortOrder: 8,
        title: "花艺培训课程",
        content: `专业花艺培训班招生
零基础可学
课程包括:
基础插花、花束制作、婚礼花艺
小班教学,一对一指导
联系电话:138-0013-8006
微信号:huayi_peixun`,
        publishTime: new Date('2025-01-17 09:15:00')
      },
      {
        sortOrder: 9,
        title: "绿植租赁服务",
        content: `办公室绿植租赁
品种齐全,定期养护
月租金低至50元起
手机📞:13800138007
微信:lvzhi_zulin`,
        publishTime: new Date('2025-01-18 15:40:00')
      },
      {
        sortOrder: 10,
        title: "鲜花包月服务",
        content: `家庭鲜花包月配送
每周配送一次
品种随机搭配
月费仅需199元
咨询:
电话:13800138008
weixin:xianhua_baoyue`,
        publishTime: new Date('2025-01-19 10:20:00')
      }
    ];

    // 批量添加数据
    const promises = testData.map(async (item) => {
      // 检查排序值是否已存在
      const { data: existing } = await db.collection('more_info')
        .where({
          sortOrder: item.sortOrder
        })
        .get();

      if (existing.length > 0) {
        console.log(`排序值${item.sortOrder}已存在,跳过`);
        return { skip: true, sortOrder: item.sortOrder };
      }

      // 添加数据
      const result = await db.collection('more_info').add({
        data: {
          ...item,
          isVisible: true,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });

      return { success: true, id: result._id, sortOrder: item.sortOrder };
    });

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.success).length;
    const skipCount = results.filter(r => r.skip).length;

    return {
      success: true,
      message: '测试数据创建完成',
      total: testData.length,
      successCount: successCount,
      skipCount: skipCount,
      details: results
    };
  } catch (error) {
    console.error('创建测试数据失败:', error);
    return {
      success: false,
      message: error.message || '创建失败',
      error: error
    };
  }
};
