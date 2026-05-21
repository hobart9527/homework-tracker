export type HomeworkProofType = "photo" | "audio" | null;

export type HomeworkFormState = {
  child_ids: string[];
  type_group_id: string;
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
  enable_recording: boolean;
  reading_article_id: string;
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
  recordingLabel: string;
  wechatPushLabel: string;
};

type SourceHomework = {
  child_id: string;
  type_group_id: string | null;
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

const DESC_META_KEY = "__hw_meta__:";

function encodeDescriptionMeta(description: string, meta: Record<string, unknown>): string {
  const json = JSON.stringify(meta);
  return `${DESC_META_KEY}${json}\n${description}`;
}

export function decodeDescriptionMeta(raw: string | null): {
  description: string;
  meta: Record<string, unknown>;
} {
  if (!raw || !raw.startsWith(DESC_META_KEY)) {
    return { description: raw || "", meta: {} };
  }
  const newlineIdx = raw.indexOf("\n");
  if (newlineIdx === -1) {
    return { description: "", meta: {} };
  }
  try {
    const meta = JSON.parse(raw.slice(DESC_META_KEY.length, newlineIdx));
    return { description: raw.slice(newlineIdx + 1), meta };
  } catch {
    return { description: raw.slice(newlineIdx + 1), meta: {} };
  }
}

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
  const { description, meta } = decodeDescriptionMeta(source.description);
  return {
    child_ids: [source.child_id],
    type_group_id: source.type_group_id || "",
    type_id: source.type_id || "",
    type_name: source.type_name,
    type_icon: source.type_icon || "📝",
    title: source.title,
    description,
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
    enable_recording: meta.enable_recording as boolean || false,
    reading_article_id: meta.reading_article_id as string || "",
  };
}

export function buildHomeworkInsertRows(
  form: HomeworkFormState,
  createdBy: string
) {
  const meta: Record<string, unknown> = {};
  if (form.reading_article_id) {
    meta.reading_article_id = form.reading_article_id;
  }
  if (form.enable_recording) {
    meta.enable_recording = true;
  }

  let description = form.description || null;
  if (Object.keys(meta).length > 0) {
    description = encodeDescriptionMeta(description || "", meta);
  }

  let checkpointType = form.required_checkpoint_type;
  if (form.enable_recording && !checkpointType) {
    checkpointType = "audio";
  }

  const effectiveSendToWechat = form.enable_recording ? form.send_to_wechat : false;
  const effectiveWechatGroupId = effectiveSendToWechat ? form.wechat_group_id : "";

  return form.child_ids.map((childId) => ({
    child_id: childId,
    type_id: form.type_id || null,
    type_name: form.type_name,
    type_icon: form.type_icon,
    title: form.title,
    description,
    repeat_type: form.repeat_type,
    repeat_days: form.repeat_type === "weekly" ? form.repeat_days : null,
    repeat_interval: form.repeat_type === "interval" ? form.repeat_interval : null,
    repeat_start_date: form.repeat_start_date || null,
    point_value: form.point_value,
    point_deduction: form.point_deduction,
    estimated_minutes: form.estimated_minutes,
    daily_cutoff_time: form.daily_cutoff_time || null,
    created_by: createdBy,
    required_checkpoint_type: checkpointType || null,
    send_to_wechat: effectiveSendToWechat,
    wechat_group_id: effectiveWechatGroupId || null,
    type_group_id: form.type_group_id || null,
    platform_binding_platform: form.platform_binding_platform || null,
    platform_binding_source_ref: form.platform_binding_source_ref || null,
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
    recordingLabel: form.enable_recording
      ? "孩子完成时需要录音打卡"
      : "孩子阅读完成后自动打卡",
    wechatPushLabel: form.send_to_wechat
      ? (form.wechat_group_id ? "会推送到指定微信群" : "会推送到孩子的默认微信群")
      : "不会自动推送到微信群",
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
