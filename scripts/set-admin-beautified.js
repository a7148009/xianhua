/**
 * 管理员设置脚本
 * 在微信开发者工具控制台执行，将首个用户升级为管理员并校验结果
 *
 * 使用方法：
 * 1. 打开微信开发者工具
 * 2. 进入控制台（Console）
 * 3. 复制本文件全部内容并粘贴到控制台
 * 4. 按回车键执行
 */

(async function setAdminBeautified() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   鲜花发布系统 - 管理员设置工具        ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // 步骤 1: 初始化云开发
    console.log('📋 [步骤 1/5] 初始化云开发环境...');
    if (!wx.cloud) {
      throw new Error('❌ 云开发 SDK 不可用，请确保已开启云开发能力');
    }

    const db = wx.cloud.database();
    console.log('✓ 云开发环境初始化成功\n');

    // 步骤 2: 检查现有管理员
    console.log('📋 [步骤 2/5] 检查现有管理员...');
    const adminResult = await db.collection('users')
      .where({ role: 'admin' })
      .get();

    if (adminResult.data && adminResult.data.length > 0) {
      console.log('ℹ️  已存在管理员账号:');
      adminResult.data.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.nickName || '未命名'} (${admin.openid})`);
      });
      console.log('\n⚠️  系统已有管理员，是否继续将首个用户设为管理员？');
      console.log('   如需继续，请手动调用云函数或直接在数据库中修改\n');
      return;
    }
    console.log('✓ 当前无管理员账号\n');

    // 步骤 3: 获取首个用户
    console.log('📋 [步骤 3/5] 查找首个注册用户...');
    const usersResult = await db.collection('users')
      .orderBy('loginTime', 'asc')
      .limit(1)
      .get();

    if (!usersResult.data || usersResult.data.length === 0) {
      throw new Error('❌ 数据库中没有用户，请先登录小程序创建用户');
    }

    const firstUser = usersResult.data[0];
    console.log('✓ 找到首个用户:');
    console.log(`   昵称: ${firstUser.nickName || '未设置'}`);
    console.log(`   OpenID: ${firstUser.openid}`);
    console.log(`   注册时间: ${new Date(firstUser.loginTime).toLocaleString()}`);
    console.log(`   当前角色: ${firstUser.role || 'user'}\n`);

    // 步骤 4: 设置为管理员
    console.log('📋 [步骤 4/5] 设置用户为管理员...');
    const updateResult = await db.collection('users')
      .doc(firstUser._id)
      .update({
        data: {
          role: 'admin',
          updateTime: new Date()
        }
      });

    if (updateResult.stats.updated === 0) {
      throw new Error('❌ 更新失败，请检查数据库权限');
    }
    console.log('✓ 用户角色已更新为管理员\n');

    // 步骤 5: 验证结果
    console.log('📋 [步骤 5/5] 验证更新结果...');
    const verifyResult = await db.collection('users')
      .doc(firstUser._id)
      .get();

    if (!verifyResult.data || verifyResult.data.length === 0) {
      throw new Error('❌ 验证失败，无法获取更新后的用户信息');
    }

    const updatedUser = verifyResult.data[0];
    if (updatedUser.role !== 'admin') {
      throw new Error('❌ 验证失败，用户角色未成功更新');
    }

    console.log('✓ 验证成功！用户信息:');
    console.log(`   昵称: ${updatedUser.nickName || '未设置'}`);
    console.log(`   OpenID: ${updatedUser.openid}`);
    console.log(`   角色: ${updatedUser.role}`);
    console.log(`   更新时间: ${new Date(updatedUser.updateTime).toLocaleString()}\n`);

    // 成功总结
    console.log('╔════════════════════════════════════════╗');
    console.log('║          ✅ 管理员设置成功！            ║');
    console.log('╚════════════════════════════════════════╝\n');
    console.log('📌 提示：');
    console.log('   1. 请重新登录小程序以刷新用户信息');
    console.log('   2. 管理员可访问"用户管理"和"系统设置"页面');
    console.log('   3. 建议在生产环境中妥善保管管理员账号\n');

  } catch (error) {
    console.error('\n❌ 设置失败:', error.message || error);
    console.log('\n💡 解决方案：');
    console.log('   1. 确保已开启云开发能力');
    console.log('   2. 检查云数据库权限设置');
    console.log('   3. 确保 users 集合存在且有数据');
    console.log('   4. 查看控制台详细错误信息\n');
  }
})();
