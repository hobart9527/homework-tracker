import { pinyin } from "pinyin-pro";

/**
 * Convert Chinese text to ruby-format pinyin string used by ArticleReader.
 *
 * Output format (character-by-character for 1-to-1 ruby alignment):
 *   "我爱中国" -> "我(wǒ)爱(ài)中(zhōng)国(guó)"
 *   "Hello 你好!" -> "Hello 你(nǐ)好(hǎo)!"
 *
 * Behavior:
 * - Splits the input into runs of Chinese characters and runs of non-Chinese
 *   characters.
 * - For each Chinese run, calls pinyin-pro with word-aware segmentation so
 *   polyphonic characters get the correct tone, then outputs each character
 *   with its own pinyin annotation for 1-to-1 ruby alignment.
 * - Non-Chinese characters are passed through unchanged.
 * - Returns the original input untouched when it contains no Chinese.
 */
export function convertToRubyPinyin(text: string): string {
  if (!text) return "";

  const chineseRunRegex = /[一-鿿]+/g;

  let output = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chineseRunRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      output += text.slice(lastIndex, match.index);
    }

    const run = match[0];
    // Per-character pinyin with word-aware polyphonic disambiguation.
    const items = pinyin(run, {
      toneType: "symbol",
      type: "all",
    });

    for (let i = 0; i < run.length; i++) {
      output += `${run[i]}(${items[i].result})`;
    }
    lastIndex = chineseRunRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    output += text.slice(lastIndex);
  }

  return output;
}
