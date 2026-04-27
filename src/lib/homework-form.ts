export type HomeworkProofType = "photo" | "audio" | null;

export type HomeworkFormState = {
  child_ids: string[];
  type_id: string;
  type_name: string;
  type_icon: string;
  title: string;
  description: string;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[];
  repeat_interval: number;
  repeat_start_date: string;
  point_value: number;
  point_deduction: number;
  estimated_minutes: number | null;
  daily_cutoff_time: string;
  required_checkpoint_type: HomeworkProofType | "";
  platform_binding_platform: string;
  platform_binding_source_ref: string;
  send_to_wechat: boolean;
  wechat_group_id: string;
};

export type HomeworkAssignmentSummary = {
  selectedCount: number;
  childNames: string[];
  createCountLabel: string;
  independenceHint: string;
};

export type HomeworkRulePreview = {
  title: string;
  childLabel: string;
  scheduleLabel: string;
  proofLabel: string;
  cutoffLabel: string;
  scoringLabel: string;
};

type SourceHomework = {
  child_id: string;
  type_id: string | null;
  type_name: string;
  type_icon: string;
  title: string;
  description: string | null;
  repeat_type: "daily" | "weekly" | "interval" | "once";
  repeat_days: number[] | null;
  repeat_interval: number | null;
  repeat_start_date: string | null;
  point_value: number;
  point_deduction: number;
  estimated_minutes: number | null;
  daily_cutoff_time: string | null;
  required_checkpoint_type: HomeworkProofType;
  platform_binding_platform: string | null;
  platform_binding_source_ref: string | null;
  send_to_wechat: boolean | null;
  wechat_group_id: string | null;
};

type ChildRef = {
  id: string;
  name: string;
};

function getScheduleLabel(form: HomeworkFormState): string {
  if (form.repeat_type === "weekly") {
    const weekdayLabels = form.repeat_days.map((day) => "日一二三四五六"[day]);
    return `孩子端会在每周${weekdayLabels.join("、")}显示这项作业`;
  }

  if (form.repeat_type === "interval") {
    return `孩子端会从开始日期起每隔 ${form.repeat_interval} 天显示这项作业`;
  }

  if (form.repeat_type === "once") {
    return "孩子端只会在指定日期看到这项单次作业";
  }

  return "孩子端每天都会看到这项作业";
}

export function buildHomeworkDraftFromSource(
  source: SourceHomework
): HomeworkFormState {
  return {
    child_ids: [source.child_id],
    type_id: source.type_id || "",
    type_name: source.type_name,
    type_icon: source.type_icon || "📝",
    title: source.title,
    description: source.description || "",
    repeat_type: source.repeat_type,
    repeat_days: source.repeat_days || [],
    repeat_interval: source.repeat_interval || 1,
    repeat_start_date: source.repeat_start_date || "",
    point_value: source.point_value,
    point_deduction: source.point_deduction ?? 0,
    estimated_minutes: source.estimated_minutes,
    daily_cutoff_time: source.daily_cutoff_time || "23:30",
    required_checkpoint_type: source.required_checkpoint_type || "",
    platform_binding_platform: source.platform_binding_platform || "",
    platform_binding_source_ref: source.platform_binding_source_ref || "",
    send_to_wechat: source.send_to_wechat || false,
    wechat_group_id: source.wechat_group_id || "",
  };
}

export function buildHomeworkInsertRows(
  form: HomeworkFormState,
  createdBy: string
) {
  return form.child_ids.map((childId) => ({
    child_id: childId,
    type_id: form.type_id || null,
    type_name: form.type_name,
    type_icon: form.type_icon,
    title: form.title,
    description: form.description || null,
    repeat_type: form.repeat_type,
    repeat_days: form.repeat_type === "weekly" ? form.repeat_days : null,
    repeat_interval: form.repeat_type === "interval" ? form.repeat_interval : null,
    repeat_start_date: form.repeat_start_date || null,
    point_value: form.point_value,
    estimated_minutes: form.estimated_minutes,
    daily_cutoff_time: form.daily_cutoff_time || null,
    created_by: createdBy,
  }));
}

export function buildAssignmentSummary(
  children: ChildRef[]
): HomeworkAssignmentSummary {
  return {
    selectedCount: children.length,
    childNames: children.map((child) => child.name),
    createCountLabel: `将创建 ${children.length} 份独立作业`,
    independenceHint: "创建后这些作业彼此独立，后续每个孩子可以单独修改。",
  };
}

export function buildHomeworkRulePreview(
  form: HomeworkFormState,
  childNames: string[]
): HomeworkRulePreview {
  return {
    title: form.title || form.type_name || "新作业",
    childLabel: childNames.length
      ? `会分别分配给 ${childNames.join("、")}`
      : "请先选择孩子",
    scheduleLabel: getScheduleLabel(form),
    proofLabel:
      form.required_checkpoint_type === "photo"
        ? "孩子完成时需要提交照片证明，可以拍照或上传已有图片"
        : form.required_checkpoint_type === "audio"
          ? "孩子完成时需要提交录音证明"
          : "孩子完成时不需要额外证明",
    cutoffLabel: form.daily_cutoff_time
      ? `建议在 ${form.daily_cutoff_time} 前完成，逾期后仍可补交并获得积分`
      : "未设置截止时间",
    scoringLabel: "同一天允许重复提交，但只有第一次完成会计分。",
  };
}

export function buildNewHomeworkHref(input: {
  selectedChildId: string | null;
}): string {
  if (!input.selectedChildId || input.selectedChildId === "all") {
    return "/homework/new";
  }
  return `/homework/new?childId=${input.selectedChildId}`;
}
