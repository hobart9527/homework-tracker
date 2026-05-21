# 作业小管家 Homework Tracker

作业小管家是一个面向家庭场景的 iPad Web 应用，用来帮助家长分配作业、跟踪孩子完成情况，并用更轻量的方式管理每日学习任务。  
Homework Tracker is an iPad-first family web app that helps parents assign homework, track completion, and manage daily learning routines with a lightweight workflow.

## 项目目的 Purpose

### 中文

- 为双语或多任务家庭提供一个统一的作业管理入口。
- 让家长可以按孩子分配作业、设置积分、截止时间与证明要求。
- 让孩子只需要进入一个清晰的主页，就能看到今天最重要的任务并完成打卡。
- 用月历、当天详情和薄弱类型视图帮助家长发现学习节奏和跟进重点。

### English

- Provide one shared homework management hub for busy family routines.
- Allow parents to assign homework per child, with points, cutoff times, and proof requirements.
- Give children a single clear home page focused on today's most important tasks and check-ins.
- Help parents review progress through monthly calendar views, day details, and weak-category insights.

## 核心功能 Key Features

### 设计系统 Design System

- 统一 Token 系统 / Unified Token System
  - 5 色系：forest（森林绿）、cream（奶油白）、coral（珊瑚橙）、honey（蜂蜜黄）、ink（墨水黑）
  - 字体家族：Inter（UI）+ LXGW WenKai（中文阅读）+ Fraunces（标题装饰）
  - 统一的圆角、阴影、间距和动画 token
- iPad-first 布局 / iPad-First Layout
  - 家长端：侧边栏导航 + 内容区双栏布局（iPad 横屏 12 列网格）
  - 孩子端：Hero 区 + 任务网格 + 底部导航（保留触控友好）
  - 阅读器：全屏沉浸式布局，无导航干扰
- 阅读模式 / Reader Mode
  - 3 种主题：light（明亮）/ sepia（羊皮纸）/ dark（夜间）
  - 字体大小、行高即时调节，localStorage 持久化
  - 中文跟读音频 + 字符级同步高亮（Azure Neural Voice）
  - 滚动进度条 + 段落位置记忆，跨 Session 恢复
  - 完成印章动画（prefers-reduced-motion 降级支持）

### 家长端 Parent Experience

- 孩子管理 / Child management
  - 添加和查看孩子信息
  - Add and view child profiles
- 作业管理 / Homework management
  - 5 级分类体系：英文/中文/数学/兴趣/自定义，每级下设预设二级类型
  - 5-tier category system: English/Chinese/Math/Interest/Custom, each with preset secondary types
  - 自定义一级分类支持动态添加任意二级类型
  - Custom primary group supports dynamic secondary type creation
  - 上下文感知平台绑定：阅读→EPIC/Raz-Kids，课程/练习→IXL/Khan Academy
  - Context-aware platform binding: reading→EPIC/Raz-Kids, course/practice→IXL/Khan
  - 批量分配作业给多个孩子，并生成彼此独立的作业副本
  - Assign homework to multiple children at once while creating independent copies
  - 支持复制已有作业、设置重复规则、积分、截止时间和证明要求
  - Supports copying existing homework, recurrence rules, points, cutoff times, and proof requirements
  - 中英文阅读类型可绑定指定阅读文章，完成后自动打卡
  - Chinese/English reading homework can bind to specific articles for auto-checkin
- 月度总览 / Monthly dashboard
  - 月历查看每天的完成情况
  - View daily completion from a month calendar
  - 查看某一天某个孩子的详细任务状态
  - Inspect one child's task details for a selected day
  - 查看当月完成率较低的作业类型
  - Review weaker homework categories for the month
- 学习平台同步 / Platform sync
  - 绑定 IXL、Khan Academy、EPIC、Raz-Kids 等学习平台账号
  - Bind IXL, Khan Academy, EPIC, Raz-Kids learning platform accounts per child
  - 定时自动同步学习记录并生成统一学习事件
  - Scheduled sync imports learning activity into normalized events
  - 支持 managed session (自动登录) 和手动 session (Cookie 粘贴)
  - Supports managed-session (auto-login) and manual session (Cookie paste)
- 自动打卡 / Auto check-ins
  - 根据同步的学习记录自动完成对应作业
  - Automatically complete homework when same-day learning evidence matches
  - 保留每次自动完成的平台来源和学习内容依据
  - Preserve exact learning evidence for every automatic completion
- Telegram 通知 / Telegram notifications
  - 每晚发送家庭日报，汇总所有孩子当天完成情况
  - Daily household summary delivered every evening
  - 作业自动完成时发送即时通知
  - Instant factual notifications on auto-completion events
  - 每周发送完成率和学习活跃度周报
  - Weekly progress digest with completion rates
- 微信群录音推送 / WeChat voice push (Beta)
  - 录音类作业提交后自动进入发送队列
  - Recording homework queued for WeChat group delivery
  - 通过独立桥接服务发送到指定微信群
  - Delivered via independent bridge service to teacher groups
- 分级阅读 / Graded Reading
  - 统一中英文内容生成管线（从 reading_topics 表读取主题，OpenAI/MiniMax 生成内容）
  - Unified Chinese/English content generation pipeline (reads topics from reading_topics table, generates content via OpenAI/MiniMax)
  - 分级难度适配（按年级生成不同难度文章）
  - Grade-adaptive difficulty (different article complexity per grade level)
  - 中文拼音注音（pinyin-pro 服务器端生成，前端用 <ruby>+<rt> 渲染）
  - Chinese pinyin annotation (server-side via pinyin-pro, rendered with <ruby>+<rt> tags)
  - 封面与段落插图生成（MiniMax image-01 主源 + Pollinations 兜底，Supabase Storage 持久化）
  - Cover and paragraph illustration generation (MiniMax image-01 primary + Pollinations fallback, persisted to Supabase Storage)
  - 质量门控自动发布（7 项检查，通过则 published，不通过则 draft）
  - Quality-gate auto-publish (7 checks; passes → published, fails → draft)
  - 题库自动生成（每篇文章配套阅读理解题）
  - Auto-generated reading comprehension questions per article
  - 主题矩阵 v2 / Topic Matrix v2
    - 18 个分类、153 个主题、约 30 个 topic_packs（系列化包），覆盖中国史三段、人文、传记、科技、现实世界等
    - 18 categories, 153 topics, ~30 `topic_packs` (serialized packs) covering the China-history triplet, humanities, biography, science/tech, and real-world domains
    - Schema 由 supabase migrations `038` 与 `039` 引入（新增 `topic_packs` 表，扩展 `reading_topics` 字段：`pack_id` / `pack_order` / `recommended_levels` / `category_v2` / `freshness_until` / `age_min_level` / `content_warnings`；扩展 `children` 字段：`reading_level_en` / `reading_level_zh` / `audio_zh_enabled` / `pinyin_enabled` / `category_priorities` / `interest_signal`）
    - Schema introduced by Supabase migrations `038` & `039` (new `topic_packs` table; extends `reading_topics` with `pack_id` / `pack_order` / `recommended_levels` / `category_v2` / `freshness_until` / `age_min_level` / `content_warnings`; extends `children` with `reading_level_en` / `reading_level_zh` / `audio_zh_enabled` / `pinyin_enabled` / `category_priorities` / `interest_signal`)
    - 通过 `scripts/seed-topic-matrix-v2.ts` 幂等 upsert（`--dry-run` 默认，`--execute` 写入）；详细映射见 `.planning/topic-matrix-v2.md`
    - Idempotent upsert via `scripts/seed-topic-matrix-v2.ts` (`--dry-run` default, `--execute` to write); detailed mapping in `.planning/topic-matrix-v2.md`
  - 中文跟读音频 / Chinese Read-Along Audio
    - Azure Neural Voice TTS 合成（默认 `zh-CN-XiaoxiaoNeural`，可切换 `zh-CN-YunxiNeural`），输出 mp3 + 字符级时间戳对齐 JSON
    - Azure Neural Voice TTS synthesis (default `zh-CN-XiaoxiaoNeural`, alternate `zh-CN-YunxiNeural`); outputs mp3 plus character-level alignment JSON
    - 音频持久化到 Supabase Storage `reading-audios` 桶；前端 `<ReadAlong>` 组件按字符高亮同步播放
    - Audio persisted to Supabase Storage `reading-audios` bucket; the front-end `<ReadAlong>` component highlights characters in sync with playback
    - Schema 由 migration `040` 引入（在 `reading_articles` 增加 `audio_zh_url` / `audio_zh_alignment` / `audio_zh_voice` / `content_warnings` 列）
    - Schema introduced by migration `040` (adds `audio_zh_url` / `audio_zh_alignment` / `audio_zh_voice` / `content_warnings` columns on `reading_articles`)
    - 批量回填脚本 `scripts/synthesize-chinese-audio.ts`（支持 `--grade` 和 `--topic-key` 过滤；`AZURE_SPEECH_KEY` 缺失时安全跳过）
    - Batch backfill script `scripts/synthesize-chinese-audio.ts` (supports `--grade` and `--topic-key` filters; cleanly skips when `AZURE_SPEECH_KEY` is absent)
  - 家长投递新闻 / Parent-Fed News Pipeline
    - 家长在 `设置 → 阅读新闻 / settings → reading-news` 页面提交时事 URL（建议每周 1-2 篇）
    - Parents submit timely news URLs (1-2/week recommended) from the `Settings → Reading News` page
    - LLM 自动改写为孩子分级版本（按 grade 同时生成中英文改写），落入常规生成管线
    - LLM rewrites each submission into per-grade child-friendly versions (both Chinese and English) and feeds them into the standard generation pipeline
    - 时效到期自动归档：`scripts/archive-stale-news.ts` 将 `category_v2='时事'` 且 `freshness_until` 已过期的主题置 `archived`，对应 `reading_articles` 从 `published` 降级为 `draft`，从而退出推荐池
    - Auto-archive once stale: `scripts/archive-stale-news.ts` flips `category_v2='时事'` topics with expired `freshness_until` to `archived`, demoting their `reading_articles` from `published` to `draft` so they exit the recommend pool
  - 逐孩子推荐 v2 + 自动分级 / Per-Child Recommendation v2 + Auto-Leveling
    - 推荐评分综合 `reading_level_en` / `reading_level_zh`、`category_priorities`、`interest_signal` 以及 recency
    - Recommendation scoring combines `reading_level_en` / `reading_level_zh`, `category_priorities`, `interest_signal`, and recency
    - 自动升级：累计 ≥15 篇且持续 ≥80% 正确率 → 阅读等级 +1
    - Auto level-up: 15+ articles with sustained ≥80% accuracy → reading level +1
    - 自动降级：连续 2 篇 <60% 正确率 → 阅读等级 -1
    - Auto level-down: 2 consecutive articles below 60% accuracy → reading level -1
    - 逐孩子统计 dashboard API 暴露等级演进、正确率、分类覆盖；现有 `recommend/route.ts` 已迁移到新评分管线
    - Per-child stats dashboard API exposes level progression, accuracy, and category coverage; existing `recommend/route.ts` migrated to the new scoring pipeline
  - Pollinations 重试 / Pollinations Retry
    - `cover-generator` 与 `illustration-generator` 的 `downloadAndUploadFromUrl` 调用已包裹指数退避（`maxAttempts=4`、`baseDelayMs=500`、`maxDelayMs=8000`、`jitterRatio=0.5`）
    - `cover-generator` and `illustration-generator` now wrap `downloadAndUploadFromUrl` with exponential backoff (`maxAttempts=4`, `baseDelayMs=500`, `maxDelayMs=8000`, `jitterRatio=0.5`)
    - 仅对 `429` / `5xx` / 网络 / 超时 重试；其他 `4xx` 立即失败；MiniMax 路径未受影响
    - Retries `429` / `5xx` / network / timeout only; other `4xx` fails fast; the MiniMax path is untouched
    - 显著缓解 Pollinations 高峰期 429（封面失败率 ~40% → 显著下降；段落插图失败率 ~90% → 显著下降）
    - Significantly mitigates Pollinations peak-time 429s (cover failure rate ~40% and illustration failure rate ~90% both substantially reduced)

### 孩子端 Child Experience

- 统一首页 / Unified home page
  - 每周概览、本周积分、日历和当天任务清单集中展示
  - Weekly summary, weekly points, calendar, and daily task list in one place
- 优先任务 / Priority task
  - 突出显示下一项最值得先完成的作业
  - Highlights the next most important task to complete
- 打卡提交 / Check-in submission
  - 支持完成打卡、逾期打卡和带证明的提交流程
  - Supports standard check-ins, late check-ins, and proof-based submissions
  - 支持录音和照片作为完成证明附件
  - Supports audio recordings and photos as completion proof attachments

## 技术栈 Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase
- Vitest + Testing Library
- pinyin-pro（中文拼音生成 / Chinese pinyin generation）
- MiniMax image-01 + Pollinations.ai（AI 图像生成 / AI image generation）

## 设计系统 Design System

### 中文

近期完成了从 Stage 1 到 Stage 3 的视觉与交互改造。核心要点如下，详细规范见 [`.planning/design-system.md`](./.planning/design-system.md) 与 [`.planning/task_plan.md`](./.planning/task_plan.md)。

- **Token 系统**：统一调色板 `forest` / `cream` / `coral` / `honey` / `ink`，统一字体三件套 `Inter`（拉丁正文）/ `LXGW WenKai`（中文正文与跟读）/ `Fraunces`（标题与品牌强调）。所有间距、圆角、阴影、过渡时长全部走 token，禁止 ad-hoc 数值。
- **iPad-first 布局**：家长端为侧栏导航 + 主区结构；孩子端为英雄区 + 当日任务卡片；阅读端为 3-pane 结构（封面/文章/侧栏工具）。所有视图按 iPad 横竖屏优先布局，向桌面与手机降级。
- **阅读模式独立路由**：阅读体验以独立路由组 `(reader)` 隔离，包含 3 个主题（`light` / `sepia` / `dark`）、设置面板、中文字符级跟读高亮、完成印章动画。阅读路由有独立的工具栏与手势层。
- **改造里程碑**：Stage 1（token 系统与视觉基线）、Stage 2（iPad 布局重构）、Stage 3（阅读模式独立模块）已全部落地，对应 commit 历史记录在 [`CHANGELOG.md`](./CHANGELOG.md) 的 `Design Overhaul` 节。

### English

The Stage 1 → Stage 3 visual and interaction overhaul has shipped. Key points below; full spec lives in [`.planning/design-system.md`](./.planning/design-system.md) and [`.planning/task_plan.md`](./.planning/task_plan.md).

- **Token system**: unified palette `forest` / `cream` / `coral` / `honey` / `ink`, unified font trio `Inter` (Latin body), `LXGW WenKai` (Chinese body and read-along), `Fraunces` (headings and brand accent). All spacing, radius, shadow, and motion durations go through tokens — no ad-hoc values.
- **iPad-first layout**: parent surfaces use a side-nav + main-pane shell; child surfaces lead with a hero block plus today's task cards; the reading experience uses a three-pane shell (cover, article, side tools). All views are designed iPad-first across landscape and portrait, then degraded for desktop and phone.
- **Reading mode as an independent module**: the reading experience is isolated under the `(reader)` route group, with 3 themes (`light` / `sepia` / `dark`), a settings panel, character-level Chinese read-along highlighting, and a completion-stamp animation. The reader has its own toolbar and gesture layer.
- **Overhaul milestones**: Stage 1 (token system + visual baseline), Stage 2 (iPad layout restructure), Stage 3 (reading mode independent module) have all landed; commit history is captured in the `Design Overhaul` section of [`CHANGELOG.md`](./CHANGELOG.md).

## 目录结构 Project Structure

```text
src/app
  (auth)       Parent login
  (child)      Child-facing pages
  (parent)     Parent-facing pages
  api          API routes

src/components
  child        Child UI modules
  parent       Parent UI modules
  ui           Shared UI building blocks

src/lib
  Business logic, dashboard builders, homework helpers, Supabase types

supabase
  Migrations and local Supabase metadata

tests/unit
  Focused unit and UI behavior tests
```

## 本地启动 Getting Started

### 1. 安装依赖 Install dependencies

```bash
npm install
```

### 2. 配置环境变量 Configure environment variables

请在项目根目录创建 `.env.local`，并填写 Supabase 相关配置。  
Create a `.env.local` file in the project root and provide your Supabase settings.

常见字段通常包括 / Typical fields usually include:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
PROJECT_ID=...
CRON_SECRET=...
PLATFORM_CREDENTIALS_ENCRYPTION_KEY=...  # 用于加密自动登录凭据，至少 32 字符
SUPABASE_SERVICE_ROLE_KEY=...
VOICE_PUSH_BRIDGE_URL=...
VOICE_PUSH_BRIDGE_TOKEN=...
```

#### 阅读模块新增环境变量 / Reading-Module Env Vars

近期阅读模块迭代新增以下环境变量，仅列出 stub；完整说明见 [`.env.example`](./.env.example)。  
The recent reading-module iterations introduce the following environment variables; stubs only — full reference lives in [`.env.example`](./.env.example).

```bash
# Azure Neural Voice TTS — 中文跟读音频必需 / required for Chinese read-along audio
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=eastus           # 默认 eastus / defaults to eastus

# MiniMax 每日封面图配额 / MiniMax daily cover-image quota
MINIMAX_DAILY_QUOTA=50               # 默认 50 / defaults to 50
```

- `AZURE_SPEECH_KEY` — Azure Cognitive Services Speech key；缺失时 `scripts/synthesize-chinese-audio.ts` 与跟读管线安全跳过（exit 0）
- `AZURE_SPEECH_KEY` — Azure Cognitive Services Speech key; when absent, `scripts/synthesize-chinese-audio.ts` and the read-along pipeline cleanly skip (exit 0)
- `AZURE_SPEECH_REGION` — Azure Speech 区域，默认 `eastus`
- `AZURE_SPEECH_REGION` — Azure Speech region, defaults to `eastus`
- `MINIMAX_DAILY_QUOTA` — MiniMax `image-01` 每日封面图配额上限，默认 `50`，配额耗尽会切换到 Pollinations 路径
- `MINIMAX_DAILY_QUOTA` — MiniMax `image-01` daily cover-image quota cap, defaults to `50`; once exhausted the pipeline routes to the Pollinations path

也可以直接参考仓库里的 [`.env.example`](./.env.example)。  
You can also start from [`.env.example`](./.env.example).

### 3. 启动开发环境 Start the development server

```bash
npm run dev
```

默认访问地址通常为 / The app usually runs at:

```text
http://localhost:3000
```

## 数据库与类型 Database and Types

### 推送数据库迁移 Push migrations

```bash
npm run supabase:migrate
```

### 生成 Supabase TypeScript 类型 Generate Supabase types

```bash
npm run supabase:generate-types
```

### 阅读功能相关表 Reading-related tables

- `reading_topics` — 主题目录源表（中英文主题统一管理）
  - Topic catalog source table (unified Chinese/English topic management)
- `reading_article_illustrations` — 文章段落插图表
  - In-article illustration table per paragraph
- `reading_image_quota_daily` — MiniMax 每日配额计数表
  - MiniMax daily image generation quota counter
- `topic_packs` — 主题系列包目录（migration 038 引入）
  - Topic pack catalog (introduced by migration 038)
- `reading_articles.audio_zh_*` — 中文跟读音频列（migration 040 引入：`audio_zh_url` / `audio_zh_alignment` / `audio_zh_voice` / `content_warnings`）
  - Chinese read-along audio columns (introduced by migration 040: `audio_zh_url` / `audio_zh_alignment` / `audio_zh_voice` / `content_warnings`)

> 需要运行迁移 035-037 才能启用基础阅读功能；运行迁移 038-040 启用主题矩阵 v2 与中文跟读音频。  
> Run migrations 035-037 to enable the base reading feature; run migrations 038-040 to enable Topic Matrix v2 and Chinese read-along audio.

## 常用命令 Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run test
npm run supabase:migrate
npm run supabase:generate-types
npm run test:auto-login          # 测试自动登录
npm run sync:ixl                 # 手动同步 IXL 学习记录
npm run sync:khan                # 手动同步 Khan Academy 学习记录
npx tsx scripts/reading-content-pipeline.ts  # 英文阅读内容生成管道（cron 兼容）
npx tsx scripts/seed-chinese-reading-content.ts  # 中文阅读内容种子
curl /api/reading/refresh-news   # 手动触发内容刷新 API
```

## 首发集成运行说明 Release-One Integration Notes

### 平台同步 Platform Sync

- 当前首发只开放 `IXL` 和 `Khan Academy`
- 支持两种绑定方式：自动登录（Playwright 浏览器自动化）和手动 Session（Cookie 粘贴）
- 自动登录使用 `playwright-extra` + `puppeteer-extra-plugin-stealth`，包含 warm-up、随机鼠标轨迹、人类化输入等防检测策略
- 已过期 session 会触发自动重新登录；连续失败则进入 `attention_required` 并 Telegram 通知家长
- 定时入口为 `GET /api/platform-sync/run`
- 手动排障入口为 `POST /api/platform-sync/import`

#### 自动登录测试

本地验证自动登录成功率：

```bash
npm run test:auto-login -- --platform=ixl
npm run test:auto-login -- --platform=khan-academy
```

#### Session 收集辅助脚本（手动兜底）

当自动登录触发 CAPTCHA 时，需要手动在真实浏览器中完成登录并提取 Cookie。

```bash
npm run session:collect -- --platform=ixl
# 或带凭据自动填充：
npm run session:collect -- --platform=ixl --username=xxx --password=xxx
```

脚本流程：
1. 启动有头 Chromium 浏览器窗口
2. 导航到平台登录页（如有凭据则自动填充）
3. 用户手动完成登录（包括 CAPTCHA）
4. 回到终端按 Enter，脚本自动提取所有 Cookie
5. JSON 格式化的 Session 自动复制到剪贴板
6. 回到应用「孩子集成」页面，点击「手动补录」粘贴保存

### 语音桥接 Voice Push Bridge

- 录音作业提交成功后会创建 `voice_push_tasks`
- 队列处理入口为 `GET /api/voice-push/run`
- 可带 `x-cron-secret` 作为定时调用保护
- 实际发送会转发到 `VOICE_PUSH_BRIDGE_URL`
- bridge 返回 `200` 会记为 `sent`
- bridge 返回 `409` 会记为重复确认，并按已发送处理，避免重复发送
- 家长可在设置页查看最近桥接状态，并手动触发一次队列处理
- 当前微信方案不是应用内微信授权，而是 bridge 映射方案
- 当消息路由选择“微信群”时，`recipient_ref` / “微信群标识” 填的是一个稳定别名，由 bridge 自己映射到真实微信群

仓库提供两种 Bridge 实现：

1. **示例 Bridge（mock，无真实微信）**：`npm run voice-push:bridge-example`
   只验证应用到 Bridge 的 HTTP 契约，不真正发微信。用于本地开发和 CI。

2. **iLink Bot Bridge（真实微信）**：`npm run voice-push:bridge-ilink`
   基于微信官方 iLink Bot 协议，通过 QR 扫码登录后，可以把录音文件真正发送到微信群。需要先安装依赖：
   ```bash
   npm install @pawastation/ilink-bot-sdk
   ```

### 微信通道本地联调步骤 WeChat Channel Local Test Flow

#### 方式一：一键启动（推荐）

应用和 Bridge 现在可以一键同时启动，无需另开终端：

1. 确保已安装依赖：
   ```bash
   npm install @pawastation/ilink-bot-sdk
   ```
2. 配置 `.env.local`（复制 `.env.example` 并按需修改）
3. 运行统一启动命令：
   ```bash
   npm run dev:with-bridge
   ```
   这会同时启动 Next.js（:3000）和 iLink Bridge（:4010），共享环境变量。
4. 首次启动 Bridge 会输出 QR Code URL，用微信扫码授权登录
5. 登录成功后，在目标微信群中发一条消息（让 Bridge 获取群的 `context_token`）
6. Bridge 日志会打印：`Discovered new recipient: recipientRef=xxx`。把这个 `xxx` 记下来

#### 方式二：示例 Bridge（验证链路，不真发微信）

1. 配置 `.env.local`：
   ```bash
   VOICE_PUSH_BRIDGE_URL=http://127.0.0.1:4010/send
   VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token
   ```
2. 启动应用：`npm run dev`
3. 另开终端启动示例 Bridge：`VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token npm run voice-push:bridge-example`
4. 按下方通用配置步骤验证

#### 通用配置和验证步骤

7. 打开”设置 → 孩子集成”，给一个孩子新增默认消息路由：
   - 通道选”微信群”
   - “微信群标识”填 Bridge 日志中打印的 `recipientRef`（如 `wxid_xxxx@chatroom`）

8. 提交一条带录音附件的作业打卡，确认系统里已经生成 `voice_push_tasks`

9. 打开”设置 → 系统运行”，点击”处理发送队列”，或手动请求：
   ```bash
   curl -s http://127.0.0.1:3000/api/voice-push/run
   ```

10. 验证结果：
    - iLink Bridge 终端出现发送成功日志，微信群收到录音文件
    - 或示例 Bridge 终端出现 `accepted task=...` 日志
    - “系统运行”页里该任务状态变为”已发送”
    - 访问 `http://127.0.0.1:4010/health` 可查看 Bridge 状态

### 云端部署注意事项

当把项目部署到云服务器时，iLink Bridge 的登录态需要持久化，否则每次部署后都需要重新扫码：

1. **设置 `CREDENTIALS_PATH` 环境变量**，指向一个持久化卷路径：
   ```bash
   CREDENTIALS_PATH=/data/voice-push-bridge/credentials.json
   ```
2. **首次部署时**：在本地扫码授权，将生成的 `credentials.json` 上传到服务器的持久化路径；或者直接在服务器上通过 SSH 扫码
3. **后续部署**：只要 `CREDENTIALS_PATH` 指向的路径不变，Bridge 会自动复用缓存的登录态，无需再次扫码
4. **使用 `npm run start:with-bridge` 一键同时启动 Next.js 生产服务器和 Bridge**

### 当前微信方案的责任边界

- **Homework Tracker 负责**：创建录音推送任务、选出消息路由、生成录音文件的 signed URL、把投递请求发给 Bridge
- **iLink Bot Bridge 负责**：维护微信登录态、通过 iLink 协议把录音文件上传到微信 CDN 并发送到指定群
- **用户负责**：首次扫码授权 Bridge 登录微信，在目标群中先发一条消息以获取 `context_token`
- `recipient_ref` 对于 iLink Bridge 就是微信群的实际 ID（`group_id`），Bridge 启动后会在日志中打印已知的群 ID

### Pilot Checklist

- 确认 `.env.local` 已填写 Supabase、`CRON_SECRET`、`VOICE_PUSH_BRIDGE_URL`、`VOICE_PUSH_BRIDGE_TOKEN`、`SUPABASE_SERVICE_ROLE_KEY`
- 如果使用 iLink Bridge：先扫码登录，在目标微信群中发一条消息获取群 ID
- 确认 Bridge 可以访问应用提供的录音文件 signed URL
- 先在设置页手动触发一次”处理发送队列”验证状态流转
- 再通过 cron 或外部调度定时调用 `/api/platform-sync/run` 和 `/api/voice-push/run`

## 测试 Testing

运行全部单元测试 / Run all unit tests:

```bash
npm test
```

运行指定测试文件 / Run specific test files:

```bash
npm test -- --run tests/unit/homework-form.test.ts
```

### 设计改造 Design Overhaul（2026-05-08 至 2026-05-10）

**Stage 1 — Token System & Visual Foundation**
建立了完整的 token 系统（forest/cream/coral/honey/ink 5 色系，Inter + LXGW WenKai + Fraunces 字体三件套），迁移所有现有组件到新 token，消除了 ad-hoc 颜色值。

**Stage 2 — iPad Layout Restructure**
重构了家长端侧边栏导航、孩子端 Hero + 网格布局、响应式断点（1024px iPad 横屏 / 834px 竖屏），扩大了内容区最大宽度。

**Stage 3 — Reading Mode Independent Module**
独立的阅读器路由组 `(reader)`，3 种主题（light/sepia/dark），阅读设置面板（字体大小、行高），滚动进度 + 段落位置记忆，中文跟读音频 + 字符级同步高亮，完成印章动画。

详细设计规范见 `.planning/design-system.md`，执行计划见 `.planning/task_plan.md`。

## 适用场景 Intended Use

### 中文

这个项目适合希望把“布置作业、孩子完成、家长查看反馈”放到一个统一流程中的家庭。它尤其适合：

- 有两个或以上孩子，需要分别管理任务
- 希望用积分激励孩子形成日常学习习惯
- 需要照片或录音作为完成证明
- 想在平板上快速完成日常操作

### English

This project is a good fit for families that want one simple workflow for assigning homework, checking completion, and reviewing progress. It is especially useful when:

- there are two or more children with different task lists
- parents want to use points as motivation
- some tasks require photo or audio proof
- the main usage device is an iPad or tablet browser

## 当前状态 Current Status

### 中文

项目正在持续迭代中，当前重点包括：

- 5 级作业分类体系（英文/中文/数学/兴趣/自定义）已完善，支持上下文感知平台绑定
- 平台同步扩展至 EPIC 和 Raz-Kids，支持 4 平台自动同步与自动打卡
- 分级阅读中文跟读音频（Azure TTS）和逐孩子推荐 v2 已上线
- 阅读新闻家长投递管线已上线，LLM 自动改写为分级文章
- Telegram 家庭日报和即时通知的稳定性
- 录音类作业微信群推送桥接的试点运行
- 学习记录去重、凭据过期处理和自动打卡依据的可解释性

### English

The project is under active iteration. Current focus areas include:

- 5-tier homework category system (English/Chinese/Math/Interest/Custom) with context-aware platform binding
- Platform sync expanded to EPIC and Raz-Kids, now covering 4 platforms with auto-sync and auto-checkins
- Chinese read-along audio (Azure TTS) and per-child recommendation v2 live
- Parent-fed news pipeline live with LLM rewriting into grade-appropriate articles
- Telegram household daily summaries and instant notification reliability
- WeChat voice-push bridge pilot for recording homework
- Learning-event deduplication, credential expiry handling, and auto-completion auditability

## 贡献与协作 Contributing

### 中文

- 提交代码前建议先运行测试
- 修改数据库结构后请同步更新 migration 和类型文件
- 新功能请尽量补充对应测试，保持行为可验证

### English

- Run tests before submitting changes when possible
- Keep migrations and generated types aligned after schema updates
- Add focused tests for new behavior whenever practical

## License

当前仓库未声明单独许可证。  
No separate license file is currently declared in this repository.
