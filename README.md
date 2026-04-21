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

### 家长端 Parent Experience

- 孩子管理 / Child management
  - 添加和查看孩子信息
  - Add and view child profiles
- 作业管理 / Homework management
  - 批量分配作业给多个孩子，并生成彼此独立的作业副本
  - Assign homework to multiple children at once while creating independent copies
  - 支持复制已有作业、设置重复规则、积分、截止时间和证明要求
  - Supports copying existing homework, recurrence rules, points, cutoff times, and proof requirements
- 月度总览 / Monthly dashboard
  - 月历查看每天的完成情况
  - View daily completion from a month calendar
  - 查看某一天某个孩子的详细任务状态
  - Inspect one child's task details for a selected day
  - 查看当月完成率较低的作业类型
  - Review weaker homework categories for the month

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

## 技术栈 Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase
- Vitest + Testing Library

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
VOICE_PUSH_BRIDGE_URL=...
VOICE_PUSH_BRIDGE_TOKEN=...
```

也可以直接参考仓库里的 [`.env.example`](/Users/haobo/codex/homework-tracker/.env.example)。  
You can also start from [`.env.example`](/Users/haobo/codex/homework-tracker/.env.example).

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

## 常用命令 Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run test
npm run supabase:migrate
npm run supabase:generate-types
```

## 首发集成运行说明 Release-One Integration Notes

### 平台同步 Platform Sync

- 当前首发只开放 `IXL` 和 `Khan Academy`
- 连接创建后，运行时抓取依赖 managed session，而不是在应用内重放账号密码登录
- 已过期 session 会进入 `attention_required`
- 定时入口为 `GET /api/platform-sync/run`
- 手动排障入口为 `POST /api/platform-sync/import`

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

#### 方式一：示例 Bridge（验证链路，不真发微信）

1. 配置 `.env.local`：
   ```bash
   VOICE_PUSH_BRIDGE_URL=http://127.0.0.1:4010/send
   VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token
   ```
2. 启动应用：`npm run dev`
3. 另开终端启动示例 Bridge：`VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token npm run voice-push:bridge-example`
4. 按下方通用步骤 4-7 验证

#### 方式二：iLink Bot Bridge（真实发微信）

1. 安装依赖：
   ```bash
   npm install @pawastation/ilink-bot-sdk
   ```
2. 配置 `.env.local`：
   ```bash
   VOICE_PUSH_BRIDGE_URL=http://127.0.0.1:4010/send
   VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
3. 启动应用：`npm run dev`
4. 另开终端启动 iLink Bridge：
   ```bash
   VOICE_PUSH_BRIDGE_TOKEN=dev-bridge-token npm run voice-push:bridge-ilink
   ```
5. 首次启动会输出 QR Code URL，用微信扫码授权登录
6. 登录成功后，在目标微信群中发一条消息（让 Bridge 获取群的 `context_token`）
7. Bridge 日志会打印：`Discovered new recipient: recipientRef=xxx`。把这个 `xxx` 记下来

#### 通用配置和验证步骤

8. 打开”设置 → 孩子集成”，给一个孩子新增默认消息路由：
   - 通道选”微信群”
   - “微信群标识”填 Bridge 日志中打印的 `recipientRef`（如 `wxid_xxxx@chatroom`）

9. 提交一条带录音附件的作业打卡，确认系统里已经生成 `voice_push_tasks`

10. 打开”设置 → 系统运行”，点击”处理发送队列”，或手动请求：
    ```bash
    curl -s http://127.0.0.1:3000/api/voice-push/run
    ```

11. 验证结果：
    - iLink Bridge 终端出现发送成功日志，微信群收到录音文件
    - 或示例 Bridge 终端出现 `accepted task=...` 日志
    - “系统运行”页里该任务状态变为”已发送”
    - 访问 `http://127.0.0.1:4010/health` 可查看 Bridge 状态

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

- 统一孩子端首页体验
- 简化家长端作业管理流程
- 强化月度总览和打卡数据一致性

### English

The project is under active iteration. Current focus areas include:

- unifying the child home experience
- simplifying the parent homework workflow
- improving monthly dashboard clarity and check-in data consistency

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
