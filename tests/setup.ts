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
  "parent.homework.basicInfo": "基本信息",
  "parent.homework.groupLabel": "作业分组",
  "parent.homework.groupHint": "选择或创建一个分组来组织作业",
  "parent.homework.allGroups": "全部分组",
  "parent.homework.typeLabel": "作业类型",
  "parent.homework.typeHint": "选择作业类型，系统将自动推荐相关设置",
  "parent.homework.custom": "自定义",
  "parent.homework.homeworkTitle": "作业标题",
  "parent.homework.titleLabel": "标题",
  "parent.homework.titlePlaceholder": "输入作业标题",
  "parent.homework.description": "作业描述",
  "parent.homework.descriptionPlaceholder": "描述作业内容或要求（可选）",
  "parent.homework.rules": "作业规则",
  "parent.homework.repeatRule": "重复规则",
  "parent.homework.daily": "每天",
  "parent.homework.weekly": "每周",
  "parent.homework.interval": "间隔",
  "parent.homework.once": "单次",
  "parent.homework.selectDays": "选择日期",
  "parent.homework.intervalDays": "间隔天数",
  "parent.homework.homeworkDate": "作业日期",
  "parent.homework.startDate": "开始日期",
  "parent.homework.cutoffTimeLabel": "每日截止时间",
  "parent.homework.pointReward": "积分奖励",
  "parent.homework.pointDeduction": "积分扣除",
  "parent.homework.proofRequired": "完成证明",
  "parent.homework.needPhoto": "需要照片",
  "parent.homework.photoHint": "完成后需要拍照或上传图片作为证明",
  "parent.homework.enableRecording": "开启录音打卡",
  "parent.homework.recordingHint": "完成后需要上传录音作为证明",
  "parent.homework.autoSendWechat": "提交完成后自动发到微信群",
  "parent.homework.selectWechatGroup": "提交到哪个微信群",
  "parent.homework.inheritDefault": "继承默认群",
  "parent.homework.batchCreateWarning": "将创建多份独立作业，每个孩子一份",
  "parent.homework.advancedSettings": "高级设置",
  "parent.homework.collapse": "收起",
  "parent.homework.expand": "展开",
  "parent.homework.bindReadingArticle": "绑定阅读文章",
  "parent.homework.bindReadingHint": "绑定后孩子可以在阅读器中完成并自动打卡",
  "parent.homework.freeChoice": "自由选择",
  "parent.homework.platformBinding": "平台绑定",
  "parent.homework.platformBindingHint": "将作业与在线学习平台关联",
  "parent.homework.sourcePlatform": "来源平台",
  "parent.homework.noBinding": "不绑定",
  "parent.homework.sourceRef": "来源编号",
  "parent.homework.sourceRefPlaceholder": "输入平台课程或练习编号",
  "parent.homework.platformHint": "已自动匹配到平台账号",
  "parent.homework.batchPlatformDisabled": "批量创建时暂不支持平台绑定",
  "parent.homework.autoMatchTitle": "自动匹配",
  "parent.homework.estimatedMinutesLabel": "预计时长（分钟）",
  "parent.homework.saving": "保存中...",
  "parent.homework.updateHomeworkBtn": "更新作业",
  "parent.homework.createHomeworkBtn": "创建作业",
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
  "parent.monthCalendar.allChildren": "全部孩子",
  // Missing homework keys
  "parent.homework.audio": "录音",
  "parent.homework.copy": "复制",
  "parent.homework.deleteConfirm": "确定要删除这个作业吗？",
  "parent.homework.items": "项",
  "parent.homework.newHomework": "新建作业",
  "parent.homework.otherTask": "其他作业",
  "parent.homework.photo": "照片",
  "parent.homework.points": "积分",
  "parent.homework.todayTask": "今天",
  "parent.homework.unknownChild": "未知孩子",
  "parent.homework.previewTitle": "作业预览",
  // Missing child progress key
  "child.progress.achievement": "成就",
  // Homework form missing keys
  "parent.homework.assignedTo": "分配给",
  "parent.homework.batchHint": "可以一次分配给多个孩子，系统会分别创建独立作业",
  "parent.homework.editHint": "编辑作业时将保留原有分配",
  "parent.homework.selected": "已选择",
  "parent.homework.clickToAdd": "点击添加",
  "parent.homework.platformHint": "已自动匹配到平台账号",
  "parent.homework.autoMatchTitle": "自动匹配",
  "parent.homework.estimatedMinutesLabel": "预计时长（分钟）",
  "parent.homework.updateHomeworkBtn": "更新作业",
  "parent.homework.createHomeworkBtn": "创建作业",
  "parent.homework.saving": "保存中...",
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

// Global fetch mock to prevent unmocked network requests from hanging in tests
global.fetch = vi.fn().mockResolvedValue({ ok: false });

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
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));
