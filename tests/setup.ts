import { expect } from "vitest";
import "@testing-library/jest-dom";

// Translation mock data
const translations: Record<string, string> = {
  // Common
  "common.loading": "加载中...",
  "common.retry": "重试",
  "common.logout": "退出登录",
  "common.save": "保存",
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.add": "添加",
  "common.back": "返回",
  // Parent dashboard
  "parent.dashboard.title": "作业小管家",
  "parent.dashboard.homeworkManage": "作业管理",
  "parent.dashboard.children": "孩子",
  "parent.dashboard.noChildren": "还没有添加孩子",
  "parent.dashboard.noChildrenHint": "点击下方按钮添加您的第一个孩子",
  "parent.dashboard.addChild": "添加孩子",
  "parent.dashboard.loading": "🦊 加载中...",
  // Parent settings
  "parent.settings.title": "设置",
  "parent.settings.profile": "账户",
  "parent.settings.notifications": "提醒设置",
  "parent.settings.language": "语言",
  // Parent homework
  "parent.homework.title": "作业管理",
  "parent.homework.createHomework": "创建作业",
  "parent.homework.noHomework": "还没有作业",
  "parent.homework.createFirst": "点击下方按钮创建第一个作业",
  // Parent children
  "parent.children.title": "孩子管理",
  "parent.children.addChild": "添加孩子",
  "parent.children.noChildren": "还没有添加孩子",
  "parent.children.addFirst": "点击添加您的第一个孩子",
  // Parent childSelector
  "parent.childSelector.selectChild": "查看范围",
  // Parent dashboard
  "parent.dashboard.allChildren": "全部孩子",
  // Homework list
  "homework.allChildren": "全部孩子",
  // Child page
  "child.page.loading": "🦊 加载中...",
  "child.page.error": "加载作业失败",
  "child.priorityCard.greatJob": "太棒了！",
  "child.priorityCard.allDone": "今天的任务全部完成啦！",
  "child.priorityCard.allDoneHint": "可以休息一下，或者看看本周其他天的任务。",
  // Child progress
  "child.progress.loadError": "加载月度数据失败",
  "child.progress.loadingMessage": "正在整理这个月的打卡表现...",
  "child.progress.monthlyTitle": "月度打卡分析",
  "child.progress.monthCompletionRate": "月完成率",
  "child.progress.totalPoints": "累计积分",
  "child.progress.activeDays": "活跃天数",
  "child.progress.onTimeRate": "按时完成率",
  "child.progress.currentlyViewing": "当前查看",
  "child.progress.noTask": "无任务",
  "child.progress.late": "补",
  "child.progress.completed": "完成",
  "child.progress.pointsEarned": "积分",
  "child.progress.checkInPeakTime": "打卡高峰时段",
  "child.progress.peakTimeDescription": "统计当月所有打卡记录，颜色越深说明这个小时越常完成作业",
  "child.progress.monthlyAnalysisFocus": "本月分析重点",
  "child.progress.totalAssigned": "总任务量",
  "child.progress.lateCheckInCount": "补打卡次数",
  "child.progress.completedTasks": "完成任务",
  "child.progress.incompleteTasks": "未完成任务",
  "child.progress.homeworkTypePerformance": "作业类型表现",
  "child.progress.focusOnWeakest": "优先盯住最弱项",
  "child.progress.needsImprovement": "需要补强",
  "child.progress.currentStrength": "当前优势项",
  "child.progress.learningHabitSuggestions": "学习习惯建议",
  // Child rewards
  "child.rewards.title": "总积分",
  "child.rewards.noRewards": "还没有积分记录",
  // Child week calendar
  "child.weekCalendar.title": "本周日历",
  "child.weekCalendar.previousWeek": "上一周",
  "child.weekCalendar.nextWeek": "下一周",
  "child.weekCalendar.today": "今",
  // Parent month calendar navigation
  "parent.monthCalendar.previousMonth": "上个月",
  "parent.monthCalendar.nextMonth": "下个月",
  "parent.monthCalendar.sectionLabel": "月度视图",
  "parent.monthCalendar.title": "本月进度日历",
};

// Mock next-intl useTranslations
vi.mock("next-intl", async () => {
  const actual = await vi.importActual("next-intl");
  return {
    ...actual,
    useTranslations: () => (key: string) => translations[key] || key,
  };
});

// Mock useTranslation hook
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] || key,
  }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));
