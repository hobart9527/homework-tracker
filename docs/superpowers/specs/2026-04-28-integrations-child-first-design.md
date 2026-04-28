# 孩子集成页 Child-First 重构设计

## 概述

将 `/settings/integrations` 从混合模式重构为 child-first 架构：先选孩子，再配置该孩子的学习平台账号和默认微信群。同时把微信群 CRUD 从 `/settings/channels` 搬到此页面。

## 页面结构

```
SettingsShell (title: "孩子集成", backHref: /settings or /children)

── 孩子标签栏 ──
  未选中：提示 "请选择一个孩子开始配置"
  选中后：标签高亮，下方显示该孩子的配置

选中孩子后：

── 学习平台账号 ──
  绑定表单（child 已确定，无 child 下拉）
  已绑定账号卡片列表

── 默认微信群 ──
  下拉选择 + 保存按钮

── 微信群管理 ──
  已有群列表 + 新增/编辑/删除
  （家长级数据，不随孩子切换刷新）
```

## 各模块行为

### 孩子标签栏

- 从 `children` list（页面加载时已获取）渲染标签
- 1 个孩子时自动选中，不显示标签栏
- URL `?childId=xxx` 控制选中状态，切换时更新 URL（shallow replace）
- 从 `/children?childId=xxx` 进入时自动选中对应标签
- 切换孩子时清空绑定表单（避免上一孩子的填写数据残留到新孩子），已绑定卡片和微信群选项正常刷新

### 学习平台账号

- `bindingForm.childId` 直接从选中孩子取，移除 child 下拉框
- `hasChildContext` 逻辑简化：不再需要两套渲染分支
- auth mode toggle、平台选择、凭据输入、managed session JSON 保持现有逻辑
- 已绑定账号卡片：按选中孩子过滤，编辑/删除/详情/凭据修改/手动补录功能不变
- 未选中孩子时，不渲染此块

### 默认微信群

- 基于选中孩子显示下拉框 + 保存
- 选项来自 `wechatGroups`（家长级）
- 直接更新 `children.default_wechat_group_id`

### 微信群管理

- 从 `/settings/channels` 搬过来的 CRUD，Supabase 直连
- 列表：显示 display_name / recipient_ref / source / last_seen_at
- 操作：编辑显示名称、删除、手动添加
- 手动添加表单：recipient_ref + display_name（可选）
- `/settings/channels` 里的微信群部分保留不动

## 实现要点

- 所有数据页面加载时已有，标签切换不触发额外请求
- 微信群管理数据复用 `wechatGroups` state，CRUD 后调用 `refreshData`
- 类型和组件复用现有模式，不新增依赖

## 不改的

- 数据库 schema
- API route 逻辑
- `/settings/channels` 页面
- `/settings/integrations` 的 URL 路径
