import { describe, expect, it } from "vitest";
import {
  buildHomeworkCompletedNotification,
  buildHouseholdDailySummary,
  buildHouseholdWeeklySummary,
  buildSyncFailureNotification,
  buildUnresolvedHomeworkNotification,
  buildVoicePushTaskPayload,
} from "@/lib/family-notifications";

describe("buildHomeworkCompletedNotification", () => {
  it("builds a factual completion event for Telegram", () => {
    expect(
      buildHomeworkCompletedNotification({
        childName: "Mia",
        homeworkTitle: "IXL Math Practice",
        platformLabel: "IXL",
        durationMinutes: 25,
      })
    ).toEqual({
      type: "homework_completed",
      message: "Mia 已完成《IXL Math Practice》",
      detail: "来源：IXL · 学习 25 分钟",
    });
  });
});

describe("buildHouseholdDailySummary", () => {
  it("groups multiple children into one household digest payload", () => {
    expect(
      buildHouseholdDailySummary({
        dateLabel: "4月20日",
        children: [
          {
            childName: "Mia",
            completedTitles: ["IXL Math Practice"],
            incompleteTitles: ["Reading Log"],
          },
          {
            childName: "Leo",
            completedTitles: ["Khan Reading"],
            incompleteTitles: [],
          },
        ],
      })
    ).toEqual({
      type: "household_daily_summary",
      title: "4月20日家庭作业完成情况",
      sections: [
        {
          childName: "Mia",
          completedTitles: ["IXL Math Practice"],
          incompleteTitles: ["Reading Log"],
        },
        {
          childName: "Leo",
          completedTitles: ["Khan Reading"],
          incompleteTitles: [],
        },
      ],
    });
  });
});

describe("buildHouseholdWeeklySummary", () => {
  it("builds a factual weekly household summary payload", () => {
    expect(
      buildHouseholdWeeklySummary({
        weekLabel: "4月第3周",
        children: [
          {
            childName: "Mia",
            completionRate: 80,
            autoCompletedCount: 3,
          },
        ],
      })
    ).toEqual({
      type: "household_weekly_summary",
      title: "4月第3周家庭作业周报",
      sections: [
        {
          childName: "Mia",
          completionRate: 80,
          autoCompletedCount: 3,
        },
      ],
    });
  });
});

describe("factual event notifications", () => {
  it("builds an unresolved homework reminder", () => {
    expect(
      buildUnresolvedHomeworkNotification({
        childName: "Mia",
        homeworkTitle: "Reading Log",
      })
    ).toEqual({
      type: "homework_unresolved",
      message: "Mia 还有未完成作业《Reading Log》",
    });
  });

  it("builds a sync failure notification", () => {
    expect(
      buildSyncFailureNotification({
        childName: "Mia",
        platformLabel: "Khan Academy",
      })
    ).toEqual({
      type: "sync_failed",
      message: "Mia 的 Khan Academy 同步失败",
    });
  });
});

describe("buildVoicePushTaskPayload", () => {
  it("creates an audio-only bridge payload without a caption", () => {
    expect(
      buildVoicePushTaskPayload({
        childId: "child-1",
        homeworkId: "hw-1",
        checkInId: "check-1",
        attachmentId: "att-1",
        storagePath: "attachments/audio-1.m4a",
      })
    ).toEqual({
      childId: "child-1",
      homeworkId: "hw-1",
      checkInId: "check-1",
      attachmentId: "att-1",
      filePath: "attachments/audio-1.m4a",
      caption: null,
    });
  });
});
