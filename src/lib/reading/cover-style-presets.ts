/**
 * Cover style presets for the reading pipeline.
 *
 * 10 presets cover the union of zh + en categories. Each preset provides
 * 2-3 positive style variants so the same category produces visually distinct
 * covers across different articles. A variant is picked at random on each
 * call to `buildCoverPrompt`.
 *
 * When a `title` is provided it is injected as a style hint, further
 * differentiating covers per-article beyond the category preset.
 *
 * `buildCoverPrompt` falls back to the `现代文` preset when an unknown
 * category is supplied.
 */

export interface CoverStylePreset {
  /** Multiple positive style variants — one is chosen at random per call. */
  positive: string[];
  negative: string;
}

export const COVER_STYLES: Record<string, CoverStylePreset> = {
  成语故事: {
    positive: [
      "traditional Chinese ink painting style, gentle brush stroke, pastel watercolor, animal or character central, story-book illustration",
      "ancient Chinese mural style, earthy pigments, folk tale illustration, simple bold outlines, hand-drawn texture",
      "painted scroll style, Song dynasty landscape aesthetic, wash painting, poetic composition, soft atmosphere",
    ],
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  寓言: {
    positive: [
      "soft fable storybook illustration, anthropomorphic animals, warm pastel palette, classic children's-book composition",
      "watercolor storyboard style, gentle outdoor scene, moral-tale atmosphere, dreamy lighting",
      "paper-cut collage style, layered textures, folk art aesthetic, warm earthy palette",
    ],
    negative: "no text, no logo, no scary scene, no violence, child-friendly",
  },
  历史: {
    positive: [
      "vintage storybook illustration, period-accurate dress and architecture, warm sepia tones, dignified composition",
      "aged parchment illustration style, antique map aesthetic, muted earth tones, historical scene",
      "oil painting style, dramatic chiaroscuro lighting, period setting, museum-quality composition",
    ],
    negative: "no text, no logo, no battle gore, no violence, child-friendly",
  },
  人物: {
    positive: [
      "bust portrait illustration, soft pencil with watercolor, warm lighting, era-appropriate background",
      "sketch portrait style, charcoal and pastel, expressive lines, intimate close-up framing",
      "vintage photograph aesthetic, sepia-toned portrait, historical costume detail, faded paper texture",
    ],
    negative: "no text, no logo, child-friendly",
  },
  科学: {
    positive: [
      "clean infographic illustration, isometric or cutaway view, friendly bright palette",
      "scientific diagram style, blueprint aesthetic, technical drawing with color accents, exploded view",
      "soft sci-fi educational art, glowing elements, dark background with bright highlights, futuristic but warm",
    ],
    negative: "no text labels, no logo, no scary scene, child-friendly",
  },
  科普: {
    positive: [
      "friendly cartoon educational illustration, bright soft color, science-themed scene, kid-friendly characters",
      "children's museum exhibit style, playful diagrams, colorful 3D render, engaging classroom aesthetic",
      "flat vector infographic, bold shapes, harmonious pastels, simple clean composition",
    ],
    negative: "no text, no logo, child-friendly",
  },
  自然: {
    positive: [
      "naturalist field-guide illustration, scientifically accurate, lush environment, soft watercolor",
      "golden hour nature photography style, dramatic sunlight through trees, rich green palette, atmospheric depth",
      "botanical print style, detailed flora and fauna, vintage natural-history aesthetic, cream background",
    ],
    negative: "no text, no logo, no hunting, child-friendly",
  },
  时事: {
    positive: [
      "editorial magazine illustration, modern flat with grain texture, soft journalism palette, conceptual",
      "digital news collage style, layered cutouts, contemporary color palette, urban setting",
      "minimalist editorial art, bold geometric shapes, limited color palette, modern graphic design feel",
    ],
    negative:
      "no text, no logo, no political symbol, no violence, child-friendly",
  },
  文化: {
    positive: [
      "festive folk-art illustration, culture-specific motifs, vibrant celebratory palette",
      "stained-glass window style, bold colored segments, decorative border, ceremonial atmosphere",
      "textile pattern illustration, embroidery-like details, rich jewel tones, traditional craft aesthetic",
    ],
    negative: "no text, no logo, child-friendly",
  },
  现代文: {
    positive: [
      "contemporary children's picture-book style, soft pastels, kid-friendly characters, daily-life setting",
      "modern storybook art, clean linework, cheerful palette, slice-of-life composition",
      "digital illustration with hand-drawn feel, gentle gradients, relatable character expressions, warm indoor lighting",
    ],
    negative: "no text, no logo, child-friendly",
  },
};

/**
 * Build a cover prompt by merging a category preset with a per-article scene
 * description. One positive style variant is chosen at random each call.
 * When `title` is provided, it is injected as an additional style hint.
 * Unknown categories fall back to the `现代文` preset.
 */
export function buildCoverPrompt(
  category: string,
  scene: string,
  title?: string
): { positive: string; negative: string } {
  const preset = COVER_STYLES[category] ?? COVER_STYLES["现代文"];
  const positives = preset.positive;
  const variant = positives[Math.floor(Math.random() * positives.length)];

  const titleHint = title
    ? `, article theme: '${title}'`
    : "";

  return {
    positive: `${variant}, scene: ${scene}${titleHint}`,
    negative: preset.negative,
  };
}
