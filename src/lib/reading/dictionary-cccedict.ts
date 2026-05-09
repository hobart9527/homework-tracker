// CC-CEDICT Chinese Dictionary Lookup
// Format: Traditional Simplified [pinyin] /definition/
// Uses streaming readline to avoid loading the large dictionary file into memory.

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

export interface ChineseWordEntry {
  pinyin: string;
  definition: string;
  traditional?: string;
}

const DICT_URL = "https://www.manythings.org/anki/chinese_cc_cedict.txt";
const DICT_DIR = path.join(process.cwd(), "public", "dict");
const DICT_PATH = path.join(DICT_DIR, "cedict_ts.txt");

/** Download CC-CEDICT to public/dict/ if not present */
export async function ensureDictFile(): Promise<boolean> {
  if (fs.existsSync(DICT_PATH)) return true;

  try {
    await fs.promises.mkdir(DICT_DIR, { recursive: true });
    const file = fs.createWriteStream(DICT_PATH);

    return new Promise((resolve) => {
      const protocol = DICT_URL.startsWith("https") ? https : http;
      protocol.get(DICT_URL, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(DICT_PATH);
          resolve(false);
          return;
        }
        response.pipe(file);
        file.on("finish", () => resolve(true));
      }).on("error", () => {
        file.close();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/** Strip pinyin tone numbers and return simplified pinyin string */
function normalizePinyin(pinyin: string): string {
  const toneMap: Record<string, string> = {
    a: "a", ai: "ai", an: "an", ang: "ang", ao: "ao",
    e: "e", ei: "ei", en: "en", eng: "eng", er: "er",
    i: "i", ia: "ia", ian: "ian", iang: "iang", iao: "iao",
    ie: "ie", in: "in", ing: "ing", iong: "iong", iu: "iu",
    o: "o", ong: "ong", ou: "ou",
    u: "u", ua: "ua", uai: "uai", uan: "uan", uang: "uang",
    ue: "ue", ui: "ui", un: "un", uo: "uo",
    v: "u",
  };

  // Simple tone-stripping: remove digits and normalize ü
  return pinyin
    .replace(/[āáǎà]/g, "a").replace(/[ēéěè]/g, "e")
    .replace(/[īíǐì]/g, "i").replace(/[ōóǒò]/g, "o")
    .replace(/[ūúǔù]/g, "u").replace(/[ǖǘǚǜ]/g, "u")
    .replace(/[^a-zA-Z]/g, "");
}

/** Parse a CC-CEDICT line into a word entry */
function parseLine(line: string): { traditional: string; simplified: string; pinyin: string; definition: string } | null {
  // Skip comments and empty lines
  if (!line || line.startsWith("#")) return null;

  // Format: Traditional Simplified [pinyin] /definition/
  // Example: 我 我 [wǒ] /I; me; myself/
  const match = line.match(/^([^\s]+)\s+([^\s]+)\s+\[([^\]]+)\]\s+\/(.+)\/$/);
  if (!match) return null;

  return {
    traditional: match[1],
    simplified: match[2],
    pinyin: match[3],
    definition: match[4],
  };
}

/** Lookup a Chinese word in CC-CEDICT using streaming readline */
export async function lookupChineseWord(word: string): Promise<ChineseWordEntry | null> {
  // Try local file first
  let filePath = DICT_PATH;
  if (!fs.existsSync(filePath)) {
    const downloaded = await ensureDictFile();
    if (!downloaded) {
      console.error("[dictionary-cccedict] Failed to download CC-CEDICT dictionary");
      return null;
    }
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const parsed = parseLine(line);
      if (parsed && (parsed.traditional === word || parsed.simplified === word)) {
        rl.close();
        return {
          pinyin: parsed.pinyin,
          definition: parsed.definition,
          traditional: parsed.traditional !== parsed.simplified ? parsed.traditional : undefined,
        };
      }
    }
  } finally {
    rl.close();
  }

  return null;
}
