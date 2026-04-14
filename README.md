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
```

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
