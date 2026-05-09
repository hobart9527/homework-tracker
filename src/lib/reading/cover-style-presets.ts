/**
 * Cover style presets for the reading pipeline.
 *
 * Frozen contract: .planning/reading-pipeline-task-plan.md §6
 *
 * 10 presets cover the union of zh + en categories. Some categories share
 * semantics across languages (e.g. 科学 / 科普) but each gets its own preset
 * so callers can match by raw `category` string without normalization.
 *
 * `buildCoverPrompt` falls back to the `现代文` preset when an unknown
 * category is supplied. This intentionally tolerates topic-table drift
 * during pipeline integration; callers must not silently normalize.
 *
 * Wave 3 step 1 (W3-T1): created.
 * Wave 3 step 2 (W3-T2 illustration-generator) reads this module read-only.
 */

export interface CoverStylePreset {
  positive: string;
  negative: string;
}

export const COVER_STYLES: Record<string, CoverStylePreset> = {
  成语故事: {
    positive:
      "traditional Chinese ink painting style, gentle brush stroke, pastel watercolor, animal or character central, story-book illustration",
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  寓言: {
    positive:
      "soft fable storybook illustration, anthropomorphic animals, warm pastel palette, classic children's-book composition",
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  历史: {
    positive:
      "vintage storybook illustration, period-accurate dress and architecture, warm sepia tones, dignified composition",
    negative: "no text, no logo, no battle gore, no violence, child-friendly",
  },
  人物: {
    positive:
      "bust portrait illustration, soft pencil with watercolor, warm lighting, era-appropriate background",
    negative: "no text, no logo, child-friendly",
  },
  科学: {
    positive:
      "clean infographic illustration, isometric or cutaway view, friendly bright palette",
    negative: "no text labels, no logo, no scary scene, child-friendly",
  },
  科普: {
    positive:
      "friendly cartoon educational illustration, bright soft color, science-themed scene, kid-friendly characters",
    negative: "no text, no logo, child-friendly",
  },
  自然: {
    positive:
      "naturalist field-guide illustration, scientifically accurate, lush environment, soft watercolor",
    negative: "no text, no logo, no hunting, child-friendly",
  },
  时事: {
    positive:
      "editorial magazine illustration, modern flat with grain texture, soft journalism palette, conceptual",
    negative:
      "no text, no logo, no political symbol, no violence, child-friendly",
  },
  文化: {
    positive:
      "festive folk-art illustration, culture-specific motifs, vibrant celebratory palette",
    negative: "no text, no logo, child-friendly",
  },
  现代文: {
    positive:
      "contemporary children's picture-book style, soft pastels, kid-friendly characters, daily-life setting",
    negative: "no text, no logo, child-friendly",
  },
};

/**
 * Build a cover prompt by merging a category preset with a per-article scene
 * description. Unknown categories fall back to the `现代文` preset.
 */
export function buildCoverPrompt(
  category: string,
  scene: string
): { positive: string; negative: string } {
  const preset = COVER_STYLES[category] ?? COVER_STYLES["现代文"];
  return {
    positive: `${preset.positive}, scene: ${scene}`,
    negative: preset.negative,
  };
}
