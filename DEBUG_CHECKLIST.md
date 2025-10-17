# 被拒绝文章不显示 - 调试检查清单

## 🔍 请按顺序检查以下内容

### 1️⃣ 检查数据库中被拒绝文章的字段

打开云开发控制台 → 数据库 → `partner_articles` 集合

找到一篇被拒绝的文章，**截图或复制**以下字段的值：

```
_id: ________________
title: ________________
page_id: ________________
user_id: ________________
publish_type: ________________  （必须是 'partner'）
status: ________________  （应该是 'rejected'？）
review_status: ________________  （应该是 'rejected'？）
is_visible: ________________
create_time: ________________
```

---

### 2️⃣ 检查云函数日志

1. 微信开发者工具 → 云开发 → 云函数 → `partnerArticleManager` → 日志
2. 刷新合作页面（切换到推广排序）
3. 在日志中查找包含 `[getArticlesWithPromotionSort]` 的记录

**应该看到的日志**:
```
[getArticlesWithPromotionSort] pageId: xxx, promoterId: xxx
[getArticlesWithPromotionSort] 推广者自己的文章数量: X
  [1] 文章标题 | status: xxx | review: xxx | visible: xxx
```

**请复制完整的日志内容**

---

### 3️⃣ 检查当前用户的 openid

在 `pages/partner/article-list/article-list.js` 中添加调试代码：

找到 `loadArticles` 函数（约第120行），在开头添加：

```javascript
async loadArticles(refresh = false) {
  // ⭐ 添加这些调试代码
  const userInfo = wx.getStorageSync('userInfo');
  console.log('🔍 当前用户信息:', userInfo);
  console.log('🔍 openid:', userInfo?.openid);
  console.log('🔍 pageId:', this.data.pageId);
  console.log('🔍 sortMode:', this.data.sortMode);

  // ... 原有代码继续
```

保存后，重新预览，查看控制台输出的 openid 是否与数据库中文章的 user_id 一致。

---

### 4️⃣ 检查是否成功切换到推广排序

在合作页面：
- 点击"推广排序"按钮
- 确认按钮变成紫色高亮状态
- 查看控制台是否有调用云函数的日志

---

### 5️⃣ 临时测试：查询所有文章

为了排除查询条件的问题，我们可以临时修改云函数，查询该用户的所有文章。

**临时修改** `cloudfunctions/partnerArticleManager/index.js` 第131-139行：

```javascript
// 1. 临时测试：查询该用户的所有文章
const { data: myArticles } = await db.collection('partner_articles')
  .where({
    user_id: promoterId  // 只保留这一个条件
  })
  .get();

console.log(`🧪 测试：用户 ${promoterId} 的所有文章: ${myArticles.length}篇`);
myArticles.forEach((article, index) => {
  console.log(`  [${index + 1}] ${article.title}`);
  console.log(`      page_id: ${article.page_id}`);
  console.log(`      publish_type: ${article.publish_type}`);
  console.log(`      status: ${article.status}`);
  console.log(`      review_status: ${article.review_status || '无'}`);
});
```

上传修改后的云函数，再次测试，看日志中能查到多少篇文章。

---

## 📋 请提供以下信息

请按照上述步骤检查，并提供：

1. **数据库截图**：被拒绝文章的完整字段信息
2. **云函数日志**：完整的查询日志
3. **前端控制台截图**：包含 openid 和 pageId 的输出
4. **临时测试结果**：查询所有文章能查到几篇

这样我们就能快速定位问题所在！
