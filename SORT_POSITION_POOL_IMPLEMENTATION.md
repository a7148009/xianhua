# 排序位池管理系统实现文档

## 概述

实现了一个统一的排序位池管理系统（1-60独占模式），合作发布和付费发布共享同一个排序位池。

## 核心特性

### 1. 排序位池（1-60独占）
- **范围**: 1-60位
- **共享**: 合作发布（partner）和付费发布（paid）共享同一个排序位池
- **独占**: 每个排序位只能被一篇文章占用
- **释放**: 文章删除后（status='deleted'），排序位自动释放回池中

### 2. 价格分级
根据排序位位置计算价格（仅付费发布）：
- 1-10位：基础价格 + 100元 = 150元
- 11-30位：基础价格 + 50元 = 100元
- 31-60位：基础价格 + 20元 = 70元
- 合作发布：免费

### 3. 权限控制
- **合作者**: 可以编辑自己文章的排序位
- **管理员**: 可以编辑任何文章的排序位
- **管理员专属**: 查看排序位池统计信息

## 已实现的云函数

### 1. getAvailableSortPositions
**功能**: 获取可用的排序位列表

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'getAvailableSortPositions',
    pageId: 'page_id_here'
  }
})
```

**返回数据**:
```javascript
{
  success: true,
  data: {
    available_positions: [1, 2, 5, 8, ...],  // 可用排序位数组
    occupied_count: 45,                       // 已占用数量
    total_positions: 60,                      // 总排序位数
    available_count: 15                       // 可用数量
  }
}
```

### 2. updateSortPosition
**功能**: 更新文章排序位（合作者编辑自己的，管理员编辑任何人的）

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'updateSortPosition',
    hashId: 'article_hash_id',
    newPosition: 5
  }
})
```

**返回数据**:
```javascript
{
  success: true,
  message: '排序位更新成功',
  data: {
    hash_id: 'ABC12345',
    old_position: 10,
    new_position: 5
  }
}
```

**错误处理**:
- 排序位不在1-60范围：`排序位必须在1-60之间`
- 排序位已被占用：`排序位 5 已被占用`
- 权限不足：`您没有权限编辑此文章的排序位`

### 3. getSortPoolStats
**功能**: 获取排序位池统计信息（管理员专用）

**调用方式**:
```javascript
wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'getSortPoolStats',
    pageId: 'page_id_here'
  }
})
```

**返回数据**:
```javascript
{
  success: true,
  data: {
    total_positions: 60,
    occupied_count: 45,
    vacant_count: 15,
    vacant_positions: [1, 2, 5, 8, ...],
    position_map: {
      3: { title: '文章标题', publish_type: 'partner', status: 'active', review_status: 'approved' },
      4: { title: '另一篇文章', publish_type: 'paid', status: 'pending', review_status: 'pending' },
      // ...
    },
    statistics: {
      partner_articles: 30,
      paid_articles: 15,
      total_articles: 45
    }
  }
}
```

### 4. assignDefaultSort (内部函数)
**功能**: 自动分配排序位或验证指定排序位

**逻辑**:
1. 如果指定了排序位（preferredSort/customSort）：
   - 验证范围（1-60）
   - 检查是否被占用
   - 返回排序位和价格

2. 如果自动分配：
   - 查询所有有效文章（status in ['pending', 'active', 'rejected']）
   - 统计已占用的排序位
   - 从1-60中找第一个可用的排序位
   - 返回排序位和价格

**查询条件**（判断排序位是否被占用）:
```javascript
status: _.in(['pending', 'active', 'rejected'])
```
- ✅ 包含: pending（待审核）、active（已发布）、rejected（被拒绝）
- ❌ 排除: deleted（已删除）

## 使用场景

### 场景1: 发布文章时自动分配排序位
```javascript
// 前端调用
wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'createArticle',
    pageId: 'page_id',
    publishType: 'partner',  // 或 'paid'
    title: '文章标题',
    content: '文章内容',
    // 不传 customSort，自动分配
  }
})

// 系统会自动分配第一个可用的排序位（如第3位）
```

### 场景2: 发布文章时指定排序位（付费发布）
```javascript
wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'createArticle',
    pageId: 'page_id',
    publishType: 'paid',
    title: '文章标题',
    content: '文章内容',
    customSort: 5,  // 指定排序位5
    // 系统会验证排序位5是否可用，并计算价格（100元）
  }
})
```

### 场景3: 合作者修改自己文章的排序位
```javascript
// 1. 先获取可用排序位
const availableResult = await wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'getAvailableSortPositions',
    pageId: 'page_id'
  }
})

// 2. 显示可用排序位供用户选择
// available_positions: [1, 2, 5, 8, 10, ...]

// 3. 用户选择新排序位后更新
await wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'updateSortPosition',
    hashId: 'article_hash_id',
    newPosition: 5
  }
})
```

### 场景4: 管理员查看排序位统计
```javascript
const statsResult = await wx.cloud.callFunction({
  name: 'partnerArticleManager',
  data: {
    action: 'getSortPoolStats',
    pageId: 'page_id'
  }
})

// 显示统计信息：
// - 总共60个排序位
// - 已占用45个
// - 空置15个
// - 空置排序位列表：[1, 2, 5, 8, ...]
// - 每个排序位的占用情况
```

## 待实现的前端功能

### 1. 发布文章页面
- [ ] 添加排序位选择器
- [ ] 显示可用排序位列表
- [ ] 显示不同排序位的价格（付费发布）
- [ ] 支持自动分配或手动选择

### 2. 文章管理页面
- [ ] 添加"编辑排序位"按钮
- [ ] 显示当前排序位
- [ ] 弹窗选择新排序位
- [ ] 显示可用排序位列表

### 3. 管理员统计页面
- [ ] 创建排序位池统计页面
- [ ] 可视化显示排序位占用情况（1-60网格）
- [ ] 显示每个排序位的文章信息
- [ ] 显示空置排序位列表
- [ ] 显示合作发布vs付费发布统计

### 4. 推广链接功能
- [ ] 为每个成员生成固定推广参数
- [ ] 追踪推广链接访问数据
- [ ] 显示推广效果统计

## 数据库字段说明

### partner_articles 集合
```javascript
{
  actual_sort: Number,      // 实际排序位（1-60）
  default_sort: Number,     // 默认排序位（与actual_sort保持一致）
  publish_type: String,     // 发布类型：'partner' | 'paid'
  status: String,           // 状态：'pending' | 'active' | 'rejected' | 'deleted'
  is_paid: Boolean,         // 是否付费发布
  paid_amount: Number,      // 付费金额
  // ...
}
```

## 技术细节

### 排序位占用判断逻辑
查询条件：`status: _.in(['pending', 'active', 'rejected'])`

**为什么包含这些状态？**
1. **pending（待审核）**: 文章提交后即占用排序位，防止重复占用
2. **active（已发布）**: 已发布的文章占用排序位
3. **rejected（被拒绝）**: 被拒绝的文章也占用排序位，合作者可见可修改

**为什么排除deleted？**
- deleted（已删除）: 已删除的文章释放排序位，可被新文章使用

### 价格计算公式
```javascript
function calculatePrice(sortPosition) {
  const basePrice = 50;

  if (sortPosition >= 1 && sortPosition <= 10) {
    return basePrice + 100;  // 150元
  } else if (sortPosition >= 11 && sortPosition <= 30) {
    return basePrice + 50;   // 100元
  } else if (sortPosition >= 31 && sortPosition <= 60) {
    return basePrice + 20;   // 70元
  } else {
    return basePrice;        // 50元（不应出现）
  }
}
```

## 日志和调试

云函数已添加详细日志输出：

```
[assignDefaultSort] pageId: xxx, publishType: partner, preferredSort: null
[assignDefaultSort] 查询到 45 篇文章占用排序位
[assignDefaultSort] 已占用排序位数量: 45/60
[assignDefaultSort] ✅ 自动分配排序位: 3, 价格: 0

[getAvailableSortPositions] pageId: xxx, range: 1-60
[getAvailableSortPositions] 查询到 45 篇文章占用排序位
[getAvailableSortPositions] 可用排序位数量: 15/60

[updateSortPosition] userId: xxx, hashId: ABC12345, newPosition: 5
[updateSortPosition] ✅ 排序位更新成功: 10 → 5
```

## 注意事项

1. **排序位范围**: 严格限制在1-60之间
2. **独占验证**: 每次分配或更新前必须检查占用情况
3. **权限控制**: 合作者只能编辑自己的文章，管理员无限制
4. **价格计算**: 仅付费发布需要计算价格，合作发布免费
5. **状态过滤**: 查询排序位占用时，必须排除deleted状态

## 更新历史

- 2025-01-XX: 完成云函数后端实现
  - ✅ 统一排序位分配逻辑（assignDefaultSort）
  - ✅ 实现获取可用排序位（getAvailableSortPositions）
  - ✅ 实现排序位编辑（updateSortPosition）
  - ✅ 实现管理员统计（getSortPoolStats）
  - ⏳ 待实现前端UI
  - ⏳ 待实现推广链接功能
