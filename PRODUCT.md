## 产品概览 Product Overview

作业小管家 (Homework Tracker) 是一个 iPad-first 家庭作业管理 Web 应用。家长分配作业、设置积分和打卡规则；孩子查看每日任务并完成打卡；系统自动同步学习平台数据并智能补打卡。

Homework Tracker is an iPad-first family homework management web app. Parents assign homework with points and check-in rules; children view daily tasks and submit check-ins; the system auto-syncs learning platform data and intelligently fills check-ins.

---

## 用户角色 User Roles

| 角色 | 描述 |
|------|------|
| **家长 Parent** | 管理孩子档案、分配作业、查看月度数据、配置平台同步和通知。iPad 横屏侧边栏导航。 |
| **孩子 Child** | G4-G6（10-12岁），查看每日任务、提交打卡、查看积分进度。iPad 触控优先。 |

---

## 功能清单 Feature Inventory

### 1. 家长端 Parent Experience

#### 1.1 孩子档案管理 Child Profiles
- 创建/编辑孩子档案 (name, grade, avatar)
- 设置 passcode 登录密码
- 配置阅读等级 (reading_level_en / reading_level_zh)
- 配置学习偏好 (category_priorities / interest_signal)

#### 1.2 作业管理 Homework Management
- **分类体系 Category System**:
  - 5 个一级分类 (primary groups): 英文 / 中文 / 数学 / 兴趣 / 自定义
  - 每个一级分类下有预设二级类型 (secondary types):
    - 英文: 阅读、课程、练习、自定义
    - 中文: 阅读、课程、练习、自定义
    - 数学: 课程、练习、自定义
    - 兴趣: 钢琴、声乐、EA、自定义
  - 自定义一级分类支持动态添加任意二级类型
  - 数据库层 `homework_type_groups` 表持久化，每个家长独立配置（通过 seed 脚本初始化）

- **作业创建**:
  - 支持批量分配给多个孩子（每人独立副本）
  - 重复规则: 每天/每周/间隔N天/单次
  - 积分设置 (point_value + point_deduction)
  - 预计时长 (estimated_minutes)
  - 每日截止时间 (daily_cutoff_time)
  - 打卡证明要求: 无/照片/录音 (required_checkpoint_type)
  - 录音打卡: 启用后自动设 proof_type=audio，提交时调用录音组件

- **平台绑定 Platform Binding**:
  - 上下文感知的平台筛选:
    - 阅读类 → EPIC / Raz-Kids
    - 课程/练习类 → IXL / Khan Academy
    - 其他 → 全部四个平台
  - 类型名自动匹配平台 (如 "IXL" → ixl, "Khan" → khan-academy)
  - 平台绑定写入 `homeworks.platform_binding_platform` + `platform_binding_source_ref`
  - 自定义平台 source_ref 手动输入

- **阅读绑定 Reading Article Binding**:
  - 中英文阅读类型作业可绑定指定阅读文章
  - 绑定后孩子端在阅读器完成文章+测验自动打卡 (createReadingAutoCheckin)
  - 元数据通过 `__hw_meta__:` 前缀编码在 description 中

- **作业复制**: 从已有作业复制配置快速创建新作业

#### 1.3 仪表盘 Dashboard
- **月度日历 Monthly Calendar**: `ParentMonthCalendar` - 月视图展示每天完成情况
- **日详情 Day Detail**: `ParentDayDetailPanel` - 点击某天查看每个孩子的具体任务
- **月统计 Monthly Stats**: `ParentMonthlyStats` - 完成率、积分汇总
- **月度洞察 Monthly Insights**: `ParentMonthlyInsights` - 薄弱类型识别、趋势分析
- **今日总览 Today Overview**: `TodayOverview` - 当天所有孩子完成概况
- **活动流 Activity Feed**: `TodayActivityFeed` - 实时打卡动态

#### 1.4 设置中心 Settings
- **孩子集成 Settings → Integrations**:
  - 绑定学习平台账号 (IXL / Khan Academy / EPIC / Raz-Kids)
  - 支持 managed session (自动登录) 和手动 session (Cookie 粘贴)
  - 平台同步状态面板 `PlatformSyncStatusPanel`
  - 消息路由规则: 默认路由 vs 作业级覆盖 (wechat_group / telegram_chat)

- **系统运行 Settings → System**:
  - 语音推送队列状态和手动触发
  - 平台同步手动触发

- **阅读新闻 Settings → Reading News**:
  - 家长投递时事 URL，LLM 改写为分级文章

#### 1.5 通知系统 Notifications
- **Telegram**: 家庭日报/即时通知/周报，通过 `family-notifications.ts` 发送
- **微信群语音推送 Voice Push (Beta)**: 录音作业提交后自动入队，通过 Bridge 服务发送到微信群
  - iLink Bot Bridge（真实微信）/ 示例 Bridge（mock）
  - 幂等投递 key，重试机制
  - 支持 `dev:with-bridge` 一键启动

### 2. 孩子端 Child Experience

#### 2.1 统一首页 Home Page
- **周概览 Week Summary**: `ChildWeekSummaryCard` - 本周积分、完成情况
- **优先级任务 Priority Task**: `PriorityHomeworkCard` - 下一项最值得做的作业
- **每日任务清单 Daily Task List**: `DayHomeworkView` - 当天所有作业卡片
- **周历 Week Calendar**: `WeekCalendar` - 7天视图

#### 2.2 打卡系统 Check-in
- 完成打卡 / 逾期打卡
- 照片/录音证明提交 (`CheckInModal`)
- 积分实时更新
- 同天多次提交只计首次积分

#### 2.3 进度页 Progress Page
- 历史打卡记录
- 积分趋势

#### 2.4 奖励页 Rewards Page
- 积分兑换（预留）

#### 2.5 阅读页 Reading Page
- 推荐阅读列表
- 分级文章卡片

### 3. 分级阅读系统 Graded Reading

#### 3.1 内容管道 Content Pipeline
- **中英文统一管线**: OpenAI/MiniMax 生成文章内容
- **主题矩阵 v2**: 18 个分类 / 153 个主题 / ~30 个 topic_packs
  - 覆盖: 中国史三段、人文、传记、科技、现实世界
- **分级难度**: 按年级生成不同难度文章
- **中文拼音注音**: pinyin-pro 服务端生成，前端 `<ruby>` + `<rt>` 渲染
- **插图生成**: MiniMax image-01 主源 + Pollinations 兜底（指数退避重试）
  - 封面图 + 段落插图，Supabase Storage 持久化
- **中文跟读音频**: Azure Neural Voice TTS (zh-CN-XiaoxiaoNeural)
  - 字符级时间戳对齐 JSON，前端 `<ReadAlong>` 同步高亮
- **题库**: 每篇文章自动生成阅读理解题
- **质量门控**: 7 项检查，通过→published，不通过→draft

#### 3.2 家长投递新闻 Parent-Fed News
- 家长提交时事 URL → LLM 改写为分级中英文版本
- `freshness_until` 到期自动归档（archive-stale-news.ts）

#### 3.3 逐孩子推荐 v2 Per-Child Recommendation
- 评分: reading_level + category_priorities + interest_signal + recency
- 自动升级: ≥15篇 + ≥80%正确率 → 阅读等级+1
- 自动降级: 连续2篇 <60% → 阅读等级-1
- 逐孩子统计 dashboard API

#### 3.4 阅读器 Reader Mode
- 独立 `(reader)` 路由组，与主应用布局解耦
- 3 种主题: light / sepia / dark
- 设置面板: 字体大小、行高
- 滚动进度 + 段落位置记忆（跨会话恢复）
- 中文字符级跟读高亮 (`<ReadAlong>`)
- 完成印章动画 (`<CompletionStamp>`)
- 手势层 (`<GestureOverlay>`)
- 页面卷曲效果 (`<PageCurlView>`)
- 测验视图 (`<QuizView>`) + 词汇收集 (`<VocabularyCollection>`)
- 分享卡片 (`<ShareCard>`)
- 杂志式入口 (`<MagazineCard>`, `<CategoryTrack>`)

### 4. 平台同步与自动打卡 Platform Sync & Auto Check-in

#### 4.1 支持平台
| 平台 | 同步方式 | Auto-login |
|------|---------|------------|
| IXL | Playwright 浏览器自动化 | 支持 (managed session) |
| Khan Academy | Cookie session | 支持 |
| EPIC | Cookie session | 支持 |
| Raz-Kids | Cookie session | 支持 |

#### 4.2 自动打卡规则
- **学习事件匹配**: 平台同步产生 learning_events → 按 platform + type_name + group 匹配作业
- **直接平台绑定**: `homeworks.platform_binding_platform` + `platform_binding_source_ref` 精确匹配
- **自动补打卡**: 满足时长/完成状态阈值 → 自动创建 check_in (auto_completed)
- **部分完成**: 满足时长但有 proof 要求 → 标记 partially_completed
- **阅读自动打卡**: 阅读类型作业绑定文章后，完成测验自动打卡

#### 4.3 同步管理
- 定时入口: `GET /api/platform-sync/run`（cron 触发）
- 手动导入: `POST /api/platform-sync/import`
- 凭据过期自动重登录，连续失败 → attention_required + Telegram 通知
- 去重: `buildLearningEventDedupKey` (childId:platform:accountId:sourceRef)

### 5. 设计系统 Design System

#### 5.1 Token 系统
- **5 Color Families**: forest (主色绿) / cream (背景米白) / coral (强调珊瑚) / honey (暖色蜂蜜) / ink (文字墨色)
- **3 Fonts**: Inter (Latin UI) / LXGW WenKai 霞鹜文楷 (中文正文+跟读高亮) / Fraunces (标题品牌)
- **Unified**: radius / shadow / spacing / motion — 全站统一 token

#### 5.2 布局架构
- **Parent Shell**: 侧导航 (side-nav) + 主内容区 (main-pane)，≥1024px 12列网格
- **Child Shell**: Hero 区域 + 每日任务网格 + 底部导航
- **Reader Shell**: 3栏布局（封面/文章/工具侧栏），独立路由组

#### 5.3 设计原则
1. 温暖亲近: forest + cream + coral 色调体系
2. 秩序清晰: 12列网格 + side-nav 信息层级
3. 正向激励: honey 暖色点缀 + 动画 + 积分反馈
4. 触控优先: ≥44pt 触控目标，iPad 拇指操作优化
5. 渐进展示: Hero → Grid → Detail 信息架构

---

## 技术架构 Technical Architecture

### 技术栈
- **Framework**: Next.js 14 App Router
- **UI**: React 18 + Tailwind CSS
- **Language**: TypeScript (strict)
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Test**: Vitest + Testing Library
- **TTS**: Azure Neural Voice
- **AI**: OpenAI (文章生成) + MiniMax image-01 (插图)
- **Browser Automation**: Playwright (平台同步)

### 路由结构 Route Structure
```
src/app/
  (auth)/login/           家长登录
  (parent)/               家长端 (layout: side-nav)
    dashboard/            月度仪表盘
    children/             孩子管理
    children/new/         新建孩子
    homework/             作业列表
    homework/new/         创建作业
    homework/[id]/        编辑作业
    settings/             系统设置
    settings/channels/    通知通道
    settings/integrations/平台集成
    settings/reading/     阅读设置
    settings/reading-news/ 阅读新闻投递
  (child)/                孩子端 (layout: bottom-nav)
    page.tsx              首页 (今日任务)
    today/                今日详情
    progress/             积分进度
    reading/              阅读推荐
    rewards/              奖励兑换
  (reader)/               阅读器 (layout: 全屏沉浸)
    reading/[id]/         文章阅读
  api/                    API Routes
    platform-sync/        平台同步
    voice-push/           语音推送
    reading/              阅读管线
    check-ins/            打卡
    children/             孩子
    channels/             通知通道
    reminders/            提醒
    admin/                管理
```

### 数据库核心表 Core Database Tables
| 表名 | 用途 |
|------|------|
| children | 孩子档案 |
| parents | 家长档案 |
| homeworks | 作业定义 |
| check_ins | 打卡记录 |
| homework_type_groups | 作业一级分类（per-parent） |
| platform_accounts | 学习平台绑定 |
| learning_events | 同步的学习活动记录 |
| homework_auto_matches | 自动打卡匹配记录 |
| reading_articles | 阅读文章 |
| reading_topics | 阅读主题目录 |
| topic_packs | 主题系列包 |
| voice_push_tasks | 语音推送队列 |
| message_routing_rules | 消息路由规则 |
| wechat_groups | 微信群映射 |
| notification_deliveries | 通知发送记录 |

### 本地启动
```bash
npm install
cp .env.example .env.local  # 填写 Supabase 等配置
npm run dev                  # http://localhost:3000
npm run dev:with-bridge      # 应用 + iLink Bridge 一键启动
```
