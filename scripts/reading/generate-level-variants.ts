#!/usr/bin/env node

/**
 * Generate Level Variants Script
 *
 * Validates the L1/L2/L3 three-tier content generation for a single topic.
 * Reads source text from classic-corpus.ts, calls generateReadingContent
 * three times (once per level), and outputs articles + questions.
 *
 * Usage:
 *   npx tsx scripts/reading/generate-level-variants.ts --topic=grimm-snowwhite
 *   npx tsx scripts/reading/generate-level-variants.ts --topic=grimm-snowwhite --execute
 *
 * Without --execute, performs a dry-run (shows what would be generated).
 * With --execute, calls the LLM and outputs generated content.
 *
 * NO database writes — pure validation script.
 */

import { config } from "dotenv";
import { getCorpusEntry } from "./classic-corpus";
import type { LevelVariant } from "@/lib/reading";

config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { topic: string; execute: boolean } {
  const args = process.argv.slice(2);
  const topicArg = args.find((a) => a.startsWith("--topic="));
  const execute = args.includes("--execute");
  const topic = topicArg?.split("=")[1]?.trim() || "";
  return { topic, execute };
}

// ---------------------------------------------------------------------------
// Word counting
// ---------------------------------------------------------------------------

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

interface VariantAnalysis {
  level: LevelVariant;
  title: string;
  wordCount: number;
  sentenceCount: number;
  questionCount: number;
  questionTypes: Record<string, number>;
  bloomsDistribution: {
    literal: number;
    infer: number;
    evaluate: number;
    synthesize: number;
  };
}

function analyzeQuestions(
  questions: { question_type: string; question_text: string }[]
): {
  questionTypes: Record<string, number>;
  bloomsDistribution: VariantAnalysis["bloomsDistribution"];
} {
  const types: Record<string, number> = {};
  const blooms = { literal: 0, infer: 0, evaluate: 0, synthesize: 0 };

  for (const q of questions) {
    types[q.question_type] = (types[q.question_type] || 0) + 1;

    // Heuristic Bloom's classification from question_type + text
    const text = q.question_text.toLowerCase();
    if (q.question_type === "detail" || q.question_type === "vocabulary" || q.question_type === "sequence") {
      blooms.literal += 1;
    } else if (q.question_type === "inference") {
      blooms.infer += 1;
    } else if (q.question_type === "main_idea") {
      // main_idea can be infer or evaluate depending on wording
      if (text.includes("why") || text.includes("how") || text.includes("best")) {
        blooms.evaluate += 1;
      } else {
        blooms.infer += 1;
      }
    } else {
      blooms.evaluate += 1;
    }
  }

  return { questionTypes: types, bloomsDistribution: blooms };
}

// ---------------------------------------------------------------------------
// Dry-run mock (when --execute is NOT passed)
// ---------------------------------------------------------------------------

function mockGenerate(level: LevelVariant, topicKey: string, sourceText: string) {
  const specs: Record<
    LevelVariant,
    { wordCount: [number, number]; questions: number; blooms: [number, number, number, number] }
  > = {
    L1: { wordCount: [300, 400], questions: 5, blooms: [4, 1, 0, 0] },
    L2: { wordCount: [600, 800], questions: 5, blooms: [1, 2, 2, 0] },
    L3: { wordCount: [800, 1100], questions: 5, blooms: [0, 2, 2, 1] },
  };
  const spec = specs[level];

  return {
    article: {
      title: `[${level}] ${topicKey.replace(/-/g, " ")}`,
      content: `This is a mock article for ${level}. `.repeat(
        Math.floor((spec.wordCount[0] + spec.wordCount[1]) / 2 / 6)
      ),
      summary: `Mock summary for ${level}.`,
      word_count: Math.floor((spec.wordCount[0] + spec.wordCount[1]) / 2),
      estimated_minutes: level === "L1" ? 5 : level === "L2" ? 8 : 12,
      difficulty: level === "L1" ? 2 : level === "L2" ? 3 : 4,
      scene_description: `A scene from ${topicKey}.`,
      genre: "narrative" as const,
      author_purpose: "to entertain" as const,
    },
    questions: Array.from({ length: spec.questions }, (_, i) => ({
      question_text: `Question ${i + 1} for ${level}?`,
      question_type:
        i < spec.blooms[0]
          ? "detail"
          : i < spec.blooms[0] + spec.blooms[1]
            ? "inference"
            : i < spec.blooms[0] + spec.blooms[1] + spec.blooms[2]
              ? "main_idea"
              : "vocabulary",
      options: [
        { label: "A", text: "Option A" },
        { label: "B", text: "Option B" },
        { label: "C", text: "Option C" },
        { label: "D", text: "Option D" },
      ],
      correct_answer: "A",
      difficulty: level === "L1" ? 2 : level === "L2" ? 3 : 4,
    })),
    illustrations: [{ paragraph_index: 0, scene_description: `Illustration for ${level}` }],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { topic, execute } = parseArgs();

  if (!topic) {
    console.error("Usage: npx tsx scripts/reading/generate-level-variants.ts --topic=<topic_key> [--execute]");
    console.error("\nAvailable topics:");
    const { classicCorpus } = await import("./classic-corpus");
    for (const entry of classicCorpus) {
      console.error(`  ${entry.topic_key} — ${entry.title}`);
    }
    process.exit(1);
  }

  console.log(`=== Level Variant Generation ===`);
  console.log(`Topic: ${topic}`);
  console.log(`Mode:  ${execute ? "LIVE (LLM calls)" : "DRY-RUN (mock data)"}\n`);

  // Resolve corpus entry
  const corpusEntry = getCorpusEntry(topic, "en");
  if (!corpusEntry) {
    console.error(`ERROR: Topic "${topic}" not found in classic corpus.`);
    process.exit(1);
  }

  console.log(`Source: ${corpusEntry.title}`);
  console.log(`IB Theme: ${corpusEntry.ib_theme_code}`);
  console.log(`Text Type: ${corpusEntry.text_type}`);
  console.log(`Source words: ${countWords(corpusEntry.content)}\n`);

  // Dynamic import for LLM module (needs dotenv loaded)
  const readingMod = await import("@/lib/reading");
  const generateReadingContent = readingMod.generateReadingContent;

  const levels: LevelVariant[] = ["L1", "L2", "L3"];
  const analyses: VariantAnalysis[] = [];

  for (const level of levels) {
    console.log(`\n--- Generating ${level} ---`);

    let result: {
      article: {
        title: string;
        content: string;
        word_count: number;
        estimated_minutes: number;
        difficulty: number;
      };
      questions: { question_text: string; question_type: string }[];
    };

    if (execute) {
      // Validate env
      if (!process.env.OPENAI_API_KEY) {
        console.error("ERROR: OPENAI_API_KEY not set. Set it in .env.local");
        process.exit(1);
      }

      const fullResult = await generateReadingContent({
        topicKey: topic,
        language: "en",
        category: corpusEntry.text_type === "fiction" ? "culture" : "news",
        levelVariant: level,
        sourceText: corpusEntry.content,
        route: "C",
        ibTheme: corpusEntry.ib_theme_code,
        textType: corpusEntry.text_type,
      });
      result = fullResult;
    } else {
      result = mockGenerate(level, topic, corpusEntry.content);
    }

    const { article, questions } = result;
    const actualWordCount = countWords(article.content);
    const actualSentences = countSentences(article.content);
    const { questionTypes, bloomsDistribution } = analyzeQuestions(questions);

    analyses.push({
      level,
      title: article.title,
      wordCount: actualWordCount,
      sentenceCount: actualSentences,
      questionCount: questions.length,
      questionTypes,
      bloomsDistribution,
    });

    console.log(`Title:    ${article.title}`);
    console.log(`Words:    ${actualWordCount} (LLM reported: ${article.word_count})`);
    console.log(`Sentences: ${actualSentences}`);
    console.log(`Minutes:  ${article.estimated_minutes}`);
    console.log(`Difficulty: ${article.difficulty}`);
    console.log(`Questions: ${questions.length}`);
    console.log(`Question types: ${JSON.stringify(questionTypes)}`);
    console.log(`Bloom's distribution: ${JSON.stringify(bloomsDistribution)}`);

    if (execute) {
      console.log(`\n--- ${level} Article ---`);
      console.log(article.content);
      console.log(`\n--- ${level} Questions ---`);
      for (const q of questions) {
        console.log(`[${q.question_type}] ${q.question_text}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary comparison
  // ---------------------------------------------------------------------------
  console.log(`\n\n=== SUMMARY COMPARISON ===`);
  console.log(
    `${"Level".padEnd(6)} ${"Words".padStart(6)} ${"Sents".padStart(6)} ${"Qs".padStart(4)} ${"Literal".padStart(8)} ${"Infer".padStart(6)} ${"Eval".padStart(5)} ${"Synth".padStart(6)}`
  );
  console.log("-".repeat(60));
  for (const a of analyses) {
    console.log(
      `${a.level.padEnd(6)} ${String(a.wordCount).padStart(6)} ${String(a.sentenceCount).padStart(6)} ${String(a.questionCount).padStart(4)} ${String(a.bloomsDistribution.literal).padStart(8)} ${String(a.bloomsDistribution.infer).padStart(6)} ${String(a.bloomsDistribution.evaluate).padStart(5)} ${String(a.bloomsDistribution.synthesize).padStart(6)}`
    );
  }

  // Standards check
  console.log(`\n=== STANDARDS CHECK ===`);
  const standards: Record<
    LevelVariant,
    { wordCount: [number, number]; blooms: [number, number, number, number] }
  > = {
    L1: { wordCount: [300, 400], blooms: [4, 1, 0, 0] },
    L2: { wordCount: [600, 800], blooms: [1, 2, 2, 0] },
    L3: { wordCount: [800, 1100], blooms: [0, 2, 2, 1] },
  };

  let allPass = true;
  for (const a of analyses) {
    const std = standards[a.level];
    const wordPass = a.wordCount >= std.wordCount[0] && a.wordCount <= std.wordCount[1];
    // Bloom's check: allow ±1 deviation per tier (heuristic classification is approximate)
    const bloomsPass =
      Math.abs(a.bloomsDistribution.literal - std.blooms[0]) <= 1 &&
      Math.abs(a.bloomsDistribution.infer - std.blooms[1]) <= 1 &&
      Math.abs(a.bloomsDistribution.evaluate - std.blooms[2]) <= 1 &&
      Math.abs(a.bloomsDistribution.synthesize - std.blooms[3]) <= 1;

    const status = wordPass && bloomsPass ? "PASS" : "FAIL";
    if (!wordPass || !bloomsPass) allPass = false;

    console.log(
      `${a.level}: words=${a.wordCount} [${std.wordCount[0]}-${std.wordCount[1]}] ${wordPass ? "OK" : "FAIL"} | blooms=${JSON.stringify(a.bloomsDistribution)} vs ${JSON.stringify(std.blooms)} ${bloomsPass ? "OK" : "FAIL"} → ${status}`
    );
  }

  console.log(`\nOverall: ${allPass ? "ALL PASS" : "SOME FAILURES"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
