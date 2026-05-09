import { pinyin } from "pinyin-pro";

/**
 * Convert Chinese text to ruby-format pinyin string used by ArticleReader.
 *
 * Output format example:
 *   "我爱中国" -> "我(wǒ)爱(ài)中国(zhōng guó)"
 *   "Hello 你好!" -> "Hello 你好(nǐ hǎo)!"
 *
 * Behavior:
 * - Splits the input into runs of Chinese characters and runs of non-Chinese
 *   characters.
 * - For each Chinese run, calls pinyin-pro with word-aware segmentation so
 *   polyphonic characters (e.g. 银行/行走, 重要/重新) get the correct tone.
 * - Non-Chinese characters (punctuation, ASCII letters, digits, whitespace)
 *   are passed through unchanged.
 * - Returns the original input untouched when it contains no Chinese.
 */
export function convertToRubyPinyin(text: string): string {
  if (!text) return "";

  // Match contiguous runs of CJK Unified Ideographs.
  const chineseRunRegex = /[一-鿿]+/g;

  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chineseRunRegex.exec(text)) !== null) {
    // Append any non-Chinese segment that precedes this run.
    if (match.index > lastIndex) {
      output += text.slice(lastIndex, match.index);
    }

    const run = match[0];
    const pinyinStr = pinyin(run, {
      toneType: "symbol",
      type: "string",
      separator: " ",
    });

    output += `${run}(${pinyinStr})`;
    lastIndex = chineseRunRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    output += text.slice(lastIndex);
  }

  return output;
}
