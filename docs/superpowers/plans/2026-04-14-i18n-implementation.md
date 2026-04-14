# i18n Implementation Plan (next-intl)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chinese and English language support to all pages, auto-detecting system language via Accept-Language header.

**Architecture:** Use next-intl with App Router. Middleware intercepts requests to detect locale from Accept-Language header. Translations stored in JSON files per locale. Components use `useTranslations` hook to get translated strings.

**Tech Stack:** next-intl v3

---

## File Structure

- Create: `src/i18n.ts` — i18n routing config
- Create: `src/messages/zh.json` — Chinese translations
- Create: `src/messages/en.json` — English translations
- Create: `src/middleware.ts` — locale detection middleware
- Create: `src/hooks/useTranslation.ts` — useTranslations hook wrapper
- Modify: `next.config.js` — add next-intl plugin
- Modify: `src/app/layout.tsx` — add NextIntlClientProvider
- Modify: 13 page files — replace hardcoded strings with translation keys

---

## Task 1: Install next-intl

- [ ] **Install next-intl package**

Run: `npm install next-intl`

---

## Task 2: Create i18n configuration

**Files:**
- Create: `src/i18n.ts`

```typescript
import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  const locale = "zh";

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
```

---

## Task 3: Configure next.config.js

**Files:**
- Modify: `next.config.js`

- [ ] **Read current next.config.js**

```javascript
const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // existing config
};

module.exports = withNextIntl(nextConfig);
```

---

## Task 4: Create translation files

**Files:**
- Create: `src/messages/zh.json`
- Create: `src/messages/en.json`

- [ ] **Create zh.json with all Chinese strings**

```json
{
  "common": {
    "loading": "加载中...",
    "retry": "重试",
    "logout": "退出登录",
    "save": "保存",
    "cancel": "取消",
    "confirm": "确认",
    "delete": "删除",
    "edit": "编辑",
    "add": "添加",
    "back": "返回"
  },
  "auth": {
    "login": "登录",
    "logout": "退出登录"
  },
  "child": {
    "page": {
      "title": "作业小管家",
      "loading": "🦊 加载中...",
      "error": "加载作业失败",
      "noChildren": "还没有添加孩子",
      "addChildPrompt": "点击下方按钮添加您的第一个孩子",
      "addChild": "添加孩子"
    },
    "weekCalendar": {
      "title": "本周日历",
      "previousWeek": "上一周",
      "nextWeek": "下一周",
      "today": "今"
    },
    "weekSummary": {
      "title": "本周概览",
      "weeklyPoints": "本周积分",
      "checkInDays": "打卡天数",
      "completedDays": "完成天数"
    },
    "progress": {
      "title": "进度",
      "subtitle": "查看你的作业完成情况",
      "noHomework": "今天没有作业！",
      "restWell": "好好休息吧～"
    },
    "rewards": {
      "title": "奖励",
      "subtitle": "你获得的奖励",
      "noRewards": "还没有奖励",
      "keepGoing": "继续加油哦！"
    },
    "today": {
      "title": "今日任务",
      "subtitle": "今天要完成的任务"
    },
    "priorityCard": {
      "greatJob": "太棒了！",
      "allDone": "今天的任务全部完成啦！",
      "allDoneHint": "可以休息一下，或者看看本周其他天的任务。",
      "nextItem": "下一项",
      "noTasks": "今天没有新的优先任务",
      "noTasksHint": "可以先看看左侧日历，或直接完成下面的任务。",
      "priorityBadge": "优先完成",
      "deadline": "截止",
      "points": "积分",
      "estimatedTime": "约",
      "minutes": "分钟",
      "goComplete": "去完成"
    },
    "dayHomework": {
      "title": "任务清单",
      "subtitle": "把今天的任务一项项清掉。",
      "noHomework": "今天没有作业！",
      "restWell": "好好休息吧～",
      "completed": "已完成",
      "overdue": "已超时",
      "pending": "待完成",
      "lateComplete": "已逾期完成",
      "noPointRepeat": "再次提交不加分",
      "lateSubmit": "逾期可补交",
      "complete": "完成",
      "lateCompleteBtn": "补打卡"
    }
  },
  "parent": {
    "dashboard": {
      "title": "作业小管家",
      "homeworkManage": "作业管理",
      "children": "孩子",
      "noChildren": "还没有添加孩子",
      "noChildrenHint": "点击下方按钮添加您的第一个孩子",
      "addChild": "添加孩子",
      "loading": "🦊 加载中..."
    },
    "monthCalendar": {
      "sectionLabel": "月度视图",
      "title": "本月进度日历",
      "subtitle": "点日期查看当天任务，用圆环颜色快速判断每天的完成状态",
      "previousMonth": "上个月",
      "nextMonth": "下个月",
      "completionRate": "完成率",
      "onTimeRate": "准时率",
      "totalPoints": "累计积分",
      "incompleteCount": "未完成数",
      "completed": "已完成",
      "inProgress": "进行中",
      "notStarted": "未开始",
      "notCompleted": "未完成",
      "lateCompleted": "补做完成",
      "noTask": "无任务"
    },
    "monthlyInsights": {
      "title": "本月薄弱类型",
      "subtitle": "按本月完成率从低到高排序，优先关注最需要跟进的作业类型",
      "noData": "本月还没有作业类型数据",
      "focusOn": "重点关注",
      "completed": "完成"
    },
    "checkInHeatmap": {
      "title": "本月打卡热力图",
      "subtitle": "每天打卡次数越多颜色越深"
    },
    "todayOverview": {
      "title": "今日概览",
      "subtitle": "查看今天任务完成情况",
      "noTasks": "今天没有任务",
      "noTasksHint": "今天不需要完成任何作业",
      "assignHomework": "布置作业",
      "noChildSelected": "请先选择一个孩子",
      "selectChildHint": "在左侧选择要查看的孩子"
    },
    "childSelector": {
      "selectChild": "选择孩子"
    },
    "homework": {
      "title": "作业管理",
      "createHomework": "创建作业",
      "noHomework": "还没有作业",
      "createFirst": "点击下方按钮创建第一个作业",
      "type": "类型",
      "title_col": "标题",
      "assignedTo": "分配给",
      "cutoffTime": "截止时间",
      "estimatedMinutes": "预计时间",
      "pointValue": "积分",
      "requiredCheckpoint": "需要验证",
      "actions": "操作",
      "edit": "编辑",
      "delete": "删除",
      "photo": "照片",
      "audio": "录音"
    },
    "children": {
      "title": "孩子管理",
      "addChild": "添加孩子",
      "noChildren": "还没有添加孩子",
      "addFirst": "点击添加您的第一个孩子",
      "name": "姓名",
      "actions": "操作",
      "edit": "编辑",
      "delete": "删除"
    },
    "settings": {
      "title": "设置",
      "profile": "个人资料",
      "notifications": "通知设置",
      "language": "语言"
    }
  }
}
```

- [ ] **Create en.json with all English strings**

```json
{
  "common": {
    "loading": "Loading...",
    "retry": "Retry",
    "logout": "Logout",
    "save": "Save",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "back": "Back"
  },
  "auth": {
    "login": "Login",
    "logout": "Logout"
  },
  "child": {
    "page": {
      "title": "Homework Tracker",
      "loading": "🦊 Loading...",
      "error": "Failed to load homework",
      "noChildren": "No children added yet",
      "addChildPrompt": "Click the button below to add your first child",
      "addChild": "Add Child"
    },
    "weekCalendar": {
      "title": "This Week",
      "previousWeek": "Previous Week",
      "nextWeek": "Next Week",
      "today": "Today"
    },
    "weekSummary": {
      "title": "Weekly Summary",
      "weeklyPoints": "Weekly Points",
      "checkInDays": "Check-in Days",
      "completedDays": "Completed Days"
    },
    "progress": {
      "title": "Progress",
      "subtitle": "View your homework completion",
      "noHomework": "No homework today!",
      "restWell": "Take a good rest～"
    },
    "rewards": {
      "title": "Rewards",
      "subtitle": "Rewards you've earned",
      "noRewards": "No rewards yet",
      "keepGoing": "Keep going!"
    },
    "today": {
      "title": "Today's Tasks",
      "subtitle": "Tasks to complete today"
    },
    "priorityCard": {
      "greatJob": "Great job!",
      "allDone": "All tasks completed today!",
      "allDoneHint": "Take a rest, or check other days this week.",
      "nextItem": "Next Item",
      "noTasks": "No priority tasks today",
      "noTasksHint": "Check the calendar on the left, or complete tasks below.",
      "priorityBadge": "Priority",
      "deadline": "Due",
      "points": "pts",
      "estimatedTime": "About",
      "minutes": "min",
      "goComplete": "Complete"
    },
    "dayHomework": {
      "title": "Task List",
      "subtitle": "Complete today's tasks one by one.",
      "noHomework": "No homework today!",
      "restWell": "Take a good rest～",
      "completed": "Completed",
      "overdue": "Overdue",
      "pending": "Pending",
      "lateComplete": "Completed Late",
      "noPointRepeat": "No points for re-submit",
      "lateSubmit": "Late submission available",
      "complete": "Complete",
      "lateCompleteBtn": "Late Check-in"
    }
  },
  "parent": {
    "dashboard": {
      "title": "Homework Tracker",
      "homeworkManage": "Manage Homework",
      "children": "Children",
      "noChildren": "No children added yet",
      "noChildrenHint": "Click the button below to add your first child",
      "addChild": "Add Child",
      "loading": "🦊 Loading..."
    },
    "monthCalendar": {
      "sectionLabel": "Monthly View",
      "title": "Monthly Progress Calendar",
      "subtitle": "Click a date to view tasks, colors show completion status",
      "previousMonth": "Previous Month",
      "nextMonth": "Next Month",
      "completionRate": "Completion Rate",
      "onTimeRate": "On-time Rate",
      "totalPoints": "Total Points",
      "incompleteCount": "Incomplete",
      "completed": "Completed",
      "inProgress": "In Progress",
      "notStarted": "Not Started",
      "notCompleted": "Not Completed",
      "lateCompleted": "Late Completed",
      "noTask": "No Task"
    },
    "monthlyInsights": {
      "title": "Weak Areas This Month",
      "subtitle": "Sorted by completion rate, focus on areas needing attention",
      "noData": "No homework type data this month",
      "focusOn": "Focus on",
      "completed": "Completed"
    },
    "checkInHeatmap": {
      "title": "Check-in Heatmap",
      "subtitle": "Darker color means more check-ins"
    },
    "todayOverview": {
      "title": "Today's Overview",
      "subtitle": "View today's task completion",
      "noTasks": "No tasks today",
      "noTasksHint": "No homework to complete today",
      "assignHomework": "Assign Homework",
      "noChildSelected": "Select a child first",
      "selectChildHint": "Select a child on the left"
    },
    "childSelector": {
      "selectChild": "Select Child"
    },
    "homework": {
      "title": "Homework Management",
      "createHomework": "Create Homework",
      "noHomework": "No homework yet",
      "createFirst": "Click below to create your first homework",
      "type": "Type",
      "title_col": "Title",
      "assignedTo": "Assigned To",
      "cutoffTime": "Cutoff Time",
      "estimatedMinutes": "Est. Time",
      "pointValue": "Points",
      "requiredCheckpoint": "Verification",
      "actions": "Actions",
      "edit": "Edit",
      "delete": "Delete",
      "photo": "Photo",
      "audio": "Audio"
    },
    "children": {
      "title": "Children Management",
      "addChild": "Add Child",
      "noChildren": "No children yet",
      "addFirst": "Click to add your first child",
      "name": "Name",
      "actions": "Actions",
      "edit": "Edit",
      "delete": "Delete"
    },
    "settings": {
      "title": "Settings",
      "profile": "Profile",
      "notifications": "Notifications",
      "language": "Language"
    }
  }
}
```

---

## Task 5: Create middleware for locale detection

**Files:**
- Create: `src/middleware.ts`

- [ ] **Create middleware.ts**

```typescript
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/(zh|en)/:path*"],
};
```

- [ ] **Create src/i18n/routing.ts**

```typescript
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh", "en"],
  defaultLocale: "zh",
  localePrefix: "as-needed",
});
```

---

## Task 6: Update root layout with NextIntlClientProvider

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Update layout.tsx**

```typescript
import type { Metadata } from "next";
import "../styles/globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "作业小管家",
  description: "帮助家长管理孩子作业的小工具",
};

export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

---

## Task 7: Create useTranslations hook

**Files:**
- Create: `src/hooks/useTranslation.ts`

- [ ] **Create useTranslation.ts**

```typescript
"use client";

import { useTranslations as useNextTranslations } from "next-intl";

export function useTranslation() {
  const t = useNextTranslations();
  return { t };
}
```

---

## Task 8: Update auth/login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

Read the file and replace hardcoded strings with `useTranslation()` calls.

---

## Task 9: Update child pages

**Files:**
- Modify: `src/app/(child)/page.tsx`
- Modify: `src/app/(child)/progress/page.tsx`
- Modify: `src/app/(child)/rewards/page.tsx`
- Modify: `src/app/(child)/today/page.tsx`

For each page:
1. Import `useTranslation` from hook
2. Replace hardcoded Chinese strings with `t('key.path')`

---

## Task 10: Update parent pages

**Files:**
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Modify: `src/app/(parent)/homework/page.tsx`
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/app/(parent)/homework/[id]/page.tsx`
- Modify: `src/app/(parent)/children/page.tsx`
- Modify: `src/app/(parent)/children/new/page.tsx`
- Modify: `src/app/(parent)/settings/page.tsx`

For each page:
1. Import `useTranslation` from hook
2. Replace hardcoded Chinese strings with `t('key.path')`

---

## Task 11: Update child components

**Files:**
- Modify: `src/components/child/WeekCalendar.tsx`
- Modify: `src/components/child/ChildWeekSummaryCard.tsx`
- Modify: `src/components/child/PriorityHomeworkCard.tsx`
- Modify: `src/components/child/DayHomeworkView.tsx`
- Modify: `src/components/child/ChildHomeworkCard.tsx`
- Modify: `src/components/child/CheckInModal.tsx`

---

## Task 12: Update parent components

**Files:**
- Modify: `src/components/parent/ParentMonthCalendar.tsx`
- Modify: `src/components/parent/ParentMonthlyInsights.tsx`
- Modify: `src/components/parent/ParentCheckInHeatmap.tsx`
- Modify: `src/components/parent/ChildSelector.tsx`
- Modify: `src/components/parent/TodayOverview.tsx`
- Modify: `src/components/parent/ParentDayDetailPanel.tsx`
- Modify: `src/components/parent/ParentChildTaskList.tsx`
- Modify: `src/components/parent/HomeworkForm.tsx`

---

## Task 13: Update child-login page

**Files:**
- Modify: `src/app/child-login/page.tsx`

---

## Task 14: Verify build

- [ ] **Run build to verify no errors**

Run: `npm run build`
Expected: Build completes without errors

---

## Task 15: Run dev server and verify

- [ ] **Start dev server**

Run: `npm run dev`

- [ ] **Test language detection**
- Visit page in browser with `Accept-Language: zh-CN` header → should show Chinese
- Visit page with `Accept-Language: en-US` header → should show English
