// Objective difficulty calculator for reading articles.
// Provides a non-LLM signal that quality-gate.ts can cross-check against
// the LLM self-rated difficulty. Implements Flesch-Kincaid grade level for
// English (no external deps, syllable count via vowel-group heuristic) and
// a sentence-length + high-frequency-character coverage heuristic for Chinese.

export interface DifficultyInput {
  content: string;
  language: "zh" | "en";
  /** Target grade level, kept for callers that want to cross-check expectations. */
  gradeLevel: number;
  /** LLM self-rated difficulty 1-5. When provided, mismatch detection runs. */
  llmDifficulty?: number;
}

export interface DifficultyIndicators {
  // English-specific
  flesch_kincaid_grade?: number;
  avg_syllables_per_word?: number;
  avg_words_per_sentence?: number;
  // Chinese-specific
  avg_chars_per_sentence?: number;
  /** Fraction of Chinese characters covered by the high-frequency list (0-1). */
  high_freq_char_coverage?: number;
  /** Heuristic density of classical / idiomatic markers (0-1). */
  classical_density?: number;
}

export interface DifficultyResult {
  /** Calculated difficulty 1-5 (independent of LLM rating). */
  difficulty: number;
  indicators: DifficultyIndicators;
  /** True when |llmDifficulty - difficulty| > 1. */
  mismatch_with_llm: boolean;
  mismatch_reason?: string;
}

// ---------------------------------------------------------------------------
// English: Flesch-Kincaid grade level
// ---------------------------------------------------------------------------

const VOWELS = new Set(["a", "e", "i", "o", "u", "y"]);

/**
 * Heuristic syllable count.
 *  - count vowel groups (consecutive a/e/i/o/u/y)
 *  - drop a trailing silent 'e'
 *  - clamp to at least 1
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;

  let groups = 0;
  let inVowel = false;
  for (const ch of w) {
    const isVowel = VOWELS.has(ch);
    if (isVowel && !inVowel) groups += 1;
    inVowel = isVowel;
  }

  // silent trailing 'e' (e.g. "name", "make") — but keep "the" / "be" intact,
  // and keep the final 'e' in consonant+le clusters like "apple", "table".
  if (w.length > 2 && w.endsWith("e") && groups > 1) {
    const prev = w[w.length - 2];
    const endsWithCle = w.length >= 3 && prev === "l" && !VOWELS.has(w[w.length - 3]);
    if (!VOWELS.has(prev) && !endsWithCle) groups -= 1;
  }

  return Math.max(1, groups);
}

function splitEnglishSentences(content: string): string[] {
  return content
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitEnglishWords(content: string): string[] {
  return content
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z']/g, ""))
    .filter((w) => w.length > 0);
}

function fkGradeToDifficulty(fk: number): number {
  if (fk <= 3) return 1;
  if (fk <= 5) return 2;
  if (fk <= 7) return 3;
  if (fk <= 9) return 4;
  return 5;
}

function calculateEnglish(content: string): {
  difficulty: number;
  indicators: DifficultyIndicators;
} {
  const sentences = splitEnglishSentences(content);
  const words = splitEnglishWords(content);

  if (sentences.length === 0 || words.length === 0) {
    return {
      difficulty: 1,
      indicators: {
        flesch_kincaid_grade: 0,
        avg_syllables_per_word: 0,
        avg_words_per_sentence: 0,
      },
    };
  }

  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fk = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

  return {
    difficulty: fkGradeToDifficulty(fk),
    indicators: {
      flesch_kincaid_grade: round2(fk),
      avg_syllables_per_word: round2(avgSyllablesPerWord),
      avg_words_per_sentence: round2(avgWordsPerSentence),
    },
  };
}

// ---------------------------------------------------------------------------
// Chinese: sentence length + high-frequency character coverage
// ---------------------------------------------------------------------------

/**
 * A compact list of frequent simplified Chinese characters (~200) drawn from
 * the standard high-frequency lists. Coverage is computed against this set.
 * This intentionally stays small to keep the bundle lean; the goal is a
 * directional signal, not a full corpus statistic.
 */
const HIGH_FREQ_CHARS = new Set<string>(
  Array.from(
    "的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日军者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西斯月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轮母苏",
  ),
);

const CHINESE_CHAR_RE = /[一-鿿]/g;

function isChineseChar(ch: string): boolean {
  return /[一-鿿]/.test(ch);
}

function splitChineseSentences(content: string): string[] {
  return content
    .split(/[。！？!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function chineseCharsOnly(s: string): string[] {
  return s.match(CHINESE_CHAR_RE) ?? [];
}

function chineseDifficultyFromAvg(avg: number): number {
  if (avg <= 8) return 1;
  if (avg <= 12) return 2;
  if (avg <= 16) return 3;
  if (avg <= 22) return 4;
  return 5;
}

/**
 * Very lightweight classical / idiom marker. Counts characters frequently
 * appearing in classical Chinese constructions and idioms ("之乎者也"-style).
 * Used only to add slight texture; not central to grading.
 */
const CLASSICAL_MARKERS = new Set<string>(
  Array.from("之乎者也焉耳矣兮夫吾汝尔斯乃岂哉曰其余予且若兹诸兮"),
);

function calculateChinese(content: string): {
  difficulty: number;
  indicators: DifficultyIndicators;
} {
  const sentences = splitChineseSentences(content);
  const allChars = chineseCharsOnly(content);
  const totalChineseChars = allChars.length;

  if (sentences.length === 0 || totalChineseChars === 0) {
    return {
      difficulty: 1,
      indicators: {
        avg_chars_per_sentence: 0,
        high_freq_char_coverage: 0,
        classical_density: 0,
      },
    };
  }

  const charsPerSentence = sentences.map(
    (s) => chineseCharsOnly(s).length,
  );
  const avgCharsPerSentence =
    charsPerSentence.reduce((a, b) => a + b, 0) / sentences.length;

  let highFreqHits = 0;
  let classicalHits = 0;
  for (const ch of allChars) {
    if (HIGH_FREQ_CHARS.has(ch)) highFreqHits += 1;
    if (CLASSICAL_MARKERS.has(ch)) classicalHits += 1;
  }
  const coverage = highFreqHits / totalChineseChars;
  const classicalDensity = classicalHits / totalChineseChars;

  let difficulty = chineseDifficultyFromAvg(avgCharsPerSentence);
  // Penalize rare-character density only when sentences are not very short.
  // Short colloquial text often contains everyday nouns (苹果/妈妈/爸爸) that
  // fall outside a compact high-frequency list — those should still grade as 1.
  if (avgCharsPerSentence > 8 && coverage < 0.85) difficulty += 1;
  if (difficulty > 5) difficulty = 5;
  if (difficulty < 1) difficulty = 1;

  return {
    difficulty,
    indicators: {
      avg_chars_per_sentence: round2(avgCharsPerSentence),
      high_freq_char_coverage: round2(coverage),
      classical_density: round2(classicalDensity),
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function describeMismatch(
  language: "zh" | "en",
  llm: number,
  calc: number,
  indicators: DifficultyIndicators,
): string {
  const direction =
    llm > calc ? "but objective indicators suggest simpler" : "but objective indicators suggest harder";

  if (language === "en") {
    const fk = indicators.flesch_kincaid_grade ?? 0;
    return `LLM rated ${llm} ${direction} (FK grade ≈ ${fk}, calc=${calc})`;
  }
  const avg = indicators.avg_chars_per_sentence ?? 0;
  const cov = indicators.high_freq_char_coverage ?? 0;
  return `LLM rated ${llm} ${direction} (avg chars/sentence ≈ ${avg}, high-freq coverage ≈ ${cov}, calc=${calc})`;
}

export function calculateObjectiveDifficulty(
  input: DifficultyInput,
): DifficultyResult {
  const { content, language, llmDifficulty } = input;

  // Empty / whitespace-only input: default to easiest, never throw.
  if (!content || !content.trim()) {
    const result: DifficultyResult = {
      difficulty: 1,
      indicators: {},
      mismatch_with_llm: false,
    };
    if (typeof llmDifficulty === "number" && Math.abs(llmDifficulty - 1) > 1) {
      result.mismatch_with_llm = true;
      result.mismatch_reason = `LLM rated ${llmDifficulty} but content is empty (calc=1)`;
    }
    return result;
  }

  const { difficulty, indicators } =
    language === "en" ? calculateEnglish(content) : calculateChinese(content);

  const result: DifficultyResult = {
    difficulty,
    indicators,
    mismatch_with_llm: false,
  };

  if (typeof llmDifficulty === "number") {
    if (Math.abs(llmDifficulty - difficulty) > 1) {
      result.mismatch_with_llm = true;
      result.mismatch_reason = describeMismatch(
        language,
        llmDifficulty,
        difficulty,
        indicators,
      );
    }
  }

  return result;
}

// Internal exports retained for tests / future tooling.
export const __internals = {
  countSyllables,
  splitEnglishSentences,
  splitEnglishWords,
  splitChineseSentences,
  chineseCharsOnly,
  isChineseChar,
  HIGH_FREQ_CHARS,
};
