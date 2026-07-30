// Shared platform label map. Single source of truth so the child dashboard,
// parent dashboard, and any other UI render the same Chinese + English labels.

export const PLATFORM_LABELS: Record<string, { zh: string; en: string }> = {
  ixl: { zh: "IXL", en: "IXL" },
  "khan-academy": { zh: "可汗学院", en: "Khan Academy" },
  "raz-kids": { zh: "Raz-Kids", en: "Raz-Kids" },
  epic: { zh: "Epic", en: "Epic" },
};

export function platformLabel(
  platform: string,
  locale: "zh" | "en" = "zh"
): string {
  return PLATFORM_LABELS[platform]?.[locale] ?? platform;
}