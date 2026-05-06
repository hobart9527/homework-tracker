# 英文分级阅读功能设计

## 概述

在 homework-tracker 中内置英文分级阅读功能，替代 Epic / Raz-Kids。通过 News API + Wikipedia 自动抓取内容，OpenAI 生成多年级适配版本和阅读理解题，与现有作业-打卡-积分系统深度集成。

## 目标用户

- **G3 孩子** — 跟读模式 + 简化文章 + 基础题型
- **G6 孩子** — 自主阅读 + 标准文章 + 推理题型
- **家长** — 管理阅读等级、查看进度、布置阅读作业

## 数据模型

### 现有表扩展

```sql
-- children 表新增字段
ALTER TABLE children ADD COLUMN reading_grade_level INTEGER;
-- 默认与孩子年级一致，家长可在设置中单独调整
```

### 新增表

```sql
CREATE TABLE reading_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_key TEXT NOT NULL,           -- 同一事件关联（如 "2026-05-solar-eclipse"）
  title TEXT NOT NULL,
  content TEXT NOT NULL,             -- 适配目标年级的文章正文
  source TEXT NOT NULL,              -- "news_api" / "wikipedia"
  source_url TEXT,                   -- 原文链接
  category TEXT NOT NULL,            -- 时事 / 历史 / 科学 / 人物 / 自然 / 文化
  grade_level INTEGER NOT NULL,      -- 1-12
  word_count INTEGER,
  estimated_minutes INTEGER,         -- 预估阅读时间（分钟）
  difficulty INTEGER DEFAULT 3,      -- 1-5
  status TEXT DEFAULT 'draft',       -- draft / published
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_key, grade_level)
);

CREATE TABLE reading_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,        -- main_idea / detail / inference / vocabulary / sequence
  options JSONB NOT NULL,            -- [{label: "A", text: "..."}, {label: "B", ...}]
  correct_answer TEXT NOT NULL,       -- 正确答案的 label
  difficulty INTEGER DEFAULT 3,      -- 1-5
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE reading_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'recommended', -- recommended / in_progress / completed
  assigned_by UUID REFERENCES auth.users(id),  -- parent_id or null (system推荐)
  assigned_date DATE DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  UNIQUE(child_id, article_id)
);

CREATE TABLE reading_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES reading_assignments(id) ON DELETE SET NULL,
  answers JSONB NOT NULL,            -- [{question_id, selected, correct: true/false}]
  score INTEGER NOT NULL,            -- 正确数
  total_questions INTEGER NOT NULL,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 内容流水线

### 内容来源

| 来源 | 用途 | 频率 |
|------|------|------|
| News API | 每日时事热点 | 每天抓取 TOP 5 |
| Wikipedia | 历史/科学/人物百科 | 每周补充 10 篇 |

### 内容生产流程（OpenAI）

```
原始文章
  → OpenAI 接收：原文 + 目标年级 (G3 / G6)
  → 输出：
     ├─ 适配正文（控制词汇量、句子长度、字数）
     ├─ 5-10 道选择题（含题型标注和难度分级）
     └─ 元数据（预估阅读时间、字数、难度分级）
  → 存入 reading_articles + reading_questions
  → status = 'published'（自动发布）
```

### 预设内容库

上线时预置 50 篇文章，覆盖：

| 年级 | 篇数 | 分类覆盖 |
|------|------|----------|
| G3 | 20 篇 | 时事4 + 历史4 + 科学4 + 人物4 + 自然4 |
| G6 | 20 篇 | 同上 |
| G3+G6 双版本 | 10 篇 | 同一 topic_key 下两个年级各有一版 |

### 每日自动推荐

每天凌晨 CRON 为每个孩子推荐 1 篇：
- 优先推送未读文章中匹配孩子 `reading_grade_level` 的文章
- 如果当天有家长布置的 assignment，assignment 替代系统推荐
- 写入 `reading_assignments(status='recommended')`

### 年级变更与内容匹配

当孩子年级变化时：

1. **阅读等级自动跟随** — `reading_grade_level` 自动同步为新的年级，无需家长手动调整。家长如需设置为不同等级仍可去设置页独立修改。

2. **螺旋匹配规则**：
   - **同一 topic_key + 同一 grade_level** → 去重（已读不会重复推荐）
   - **同一 topic_key + 不同 grade_level** → 视为新内容（正文和题目均不同，如 G3"古埃及金字塔"与 G6"古埃及金字塔"是两篇独立文章）
   - 同主题低年级已读 → 推荐高阶版时标注"进阶版：你读过基础版了，这次试试更高难度！"
   - 已完成的 assignment 保留在历史中，不强制丢弃进度

3. **新等级推荐** — 升级后立即切换到新级别，不会再从旧级别推荐新文章。未完成的旧级别 assignment 仍可正常完成。

## 孩子端 UI

### 底部导航新增

```
📋 今日  📊 进度  ⭐ 积分  📚 阅读
```

### 阅读专区（📚 页面）

**顶部**：🎯 今日推荐 — 大卡片，显示今日推荐文章标题 + 等级 + 一句话简介。点击进入阅读器。

**中部**：分类筛选标签 — 全部 / 时事 / 历史 / 科学 / 人物

**下部**：文章网格列表 — 每篇展示：封面 emoji + 标题 + 年级标签 + 难度标识

### 阅读器

- **标题区**：标题 + grade_level 标签 + Raz-Kids 对照等级
- **正文**：大字体、舒适行距、窄栏宽，iPad 适配
- **G3 跟读按钮**："🔊 朗读" 调用浏览器 TTS
- **底部操作栏**："📝 开始答题" 按钮

### 答题器

- 逐题显示，每题选完自动下一题
- 顶部进度条 (3/8)
- 答完后显示成绩页：
  - 得分 + 积分奖励
  - 错题回顾（显示正确答案）
- 成绩写入 `reading_quiz_attempts`
- 自动创建 `check_in`，积分计入孩子总积分
- 触发 `child-points-changed` 事件

### 打卡联动

阅读作业在「今日」页面显示为特殊卡片（带 📚 图标）：
- 点击后跳转阅读器直接打开指定文章
- 答题完成 = 打卡完成
- 积分自动发放

## 家长端 UI

### 布置阅读作业（/homework/new）

选择"英文阅读"类型后：
1. 文章浏览器：筛选年级 / 分类 / 关键字
2. 点文章 → 弹出预览（标题 + 正文片段 + 题数量）
3. 确认布置 → 创建 `reading_assignments`

### 设置 — 阅读等级

设置页面新增板块：
- 每个孩子显示当前阅读等级（下拉 Grade 1-12）
- 默认与孩子年级一致
- 家长可独立调整（例如 G3 孩子可以挑战 G4 内容）

### Dashboard 阅读面板

家长仪表盘新增卡片：
- 本周阅读量
- 平均正确率
- 正确率趋势（上升/持平/下降）

## API 路由

```
GET  /api/reading/recommend?childId=xxx      → 获取今日推荐
GET  /api/reading/articles?grade=&category=   → 文章列表（筛选）
GET  /api/reading/articles/:id                → 单篇文章详情（含题目）
POST /api/reading/assignments                 → 家长布置文章
POST /api/reading/quiz/submit                 → 提交答题结果
GET  /api/reading/progress?childId=&month=    → 阅读进度
POST /api/reading/generate                    → 手动触发 Open AI 生成内容
POST /api/reading/refresh-news                → 手动触发新闻抓取
```

## 分步开发顺序

| 阶段 | 内容 | 交付物 |
|------|------|--------|
| **1. 数据层** | Supabase migration + 类型定义 | migration SQL, `src/lib/supabase/types.ts` 更新 |
| **2. 预置内容** | 调用 OpenAI 生成 50 篇种子文章 | `scripts/seed-reading-content.mjs` |
| **3. 阅读专区** | 孩子端 📚 页面 + 底部导航 | `src/app/(child)/reading/` 各页面 |
| **4. 阅读器+答题器** | 文章阅读 + 答题交互 | `src/components/reading/` 组件 |
| **5. 打卡联动** | 阅读作业卡片 + 自动打卡 | 修改 `homework/new`、`ChildHomeworkCard` |
| **6. 家长端** | 布置阅读、Dashboard 面板、等级设置 | 家长端各页面的扩展 |
| **7. 自动流水线** | 定时抓取 + OpenAI 生成 + 发布 | `scripts/reading-content-pipeline.mjs` |
