export function buildHomeworkCompletedNotification(input: {
  childName: string;
  homeworkTitle: string;
  platformLabel: string;
  durationMinutes: number;
}) {
  return {
    type: "homework_completed" as const,
    message: `${input.childName} 已完成《${input.homeworkTitle}》`,
    detail: `来源：${input.platformLabel} · 学习 ${input.durationMinutes} 分钟`,
  };
}

export function buildHouseholdDailySummary(input: {
  dateLabel: string;
  children: Array<{
    childName: string;
    completedTitles: string[];
    incompleteTitles: string[];
  }>;
}) {
  return {
    type: "household_daily_summary" as const,
    title: `${input.dateLabel}家庭作业完成情况`,
    sections: input.children,
  };
}

export function buildHouseholdWeeklySummary(input: {
  weekLabel: string;
  children: Array<{
    childName: string;
    completionRate: number;
    autoCompletedCount: number;
  }>;
}) {
  return {
    type: "household_weekly_summary" as const,
    title: `${input.weekLabel}家庭作业周报`,
    sections: input.children,
  };
}

export function buildUnresolvedHomeworkNotification(input: {
  childName: string;
  homeworkTitle: string;
}) {
  return {
    type: "homework_unresolved" as const,
    message: `${input.childName} 还有未完成作业《${input.homeworkTitle}》`,
  };
}

export function buildParentReminderTelegramText(input: {
  childName: string;
  homeworkTitle: string;
  targetDate: string;
}) {
  return [
    "作业提醒",
    `${input.childName} 还有未完成作业《${input.homeworkTitle}》`,
    `日期：${input.targetDate}`,
  ].join("\n");
}

export function buildSyncFailureNotification(input: {
  childName: string;
  platformLabel: string;
}) {
  return {
    type: "sync_failed" as const,
    message: `${input.childName} 的 ${input.platformLabel} 同步失败`,
  };
}

export function buildVoicePushTaskPayload(input: {
  childId: string;
  homeworkId: string;
  checkInId: string;
  attachmentId: string;
  storagePath: string;
}) {
  return {
    childId: input.childId,
    homeworkId: input.homeworkId,
    checkInId: input.checkInId,
    attachmentId: input.attachmentId,
    filePath: input.storagePath,
    caption: null,
  };
}
