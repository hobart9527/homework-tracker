#!/usr/bin/env tsx
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const { decideRoute } = await import("@/lib/reading/route-analyzer");
  const { generateReadingContent } = await import("@/lib/reading");
  const { validateContent } = await import("@/lib/reading/quality-gate");
  const { validateIBCriteria } = await import("@/lib/reading/ib-criteria-gate");

  const supabase = await createServiceRoleClient();

  // Test a longer poem — 水调歌头 or 陋室铭 have enough chars
  const { data: topics } = await supabase
    .from("reading_topics")
    .select("*")
    .in("topic_key", ["gushiwen-陋室铭", "gushiwen-爱莲说", "gushiwen-水调歌头"])
    .order("topic_key");

  if (!topics || topics.length === 0) { console.log("No topics"); return; }

  for (const topic of topics) {
    console.log(`\n--- ${topic.topic_key} ---`);
    console.log(`source=${topic.source} text_len=${topic.source_text?.length || 0}`);

    const d = decideRoute({ topic_key: topic.topic_key, language: "zh", source: topic.source, source_text: topic.source_text, target_grades: topic.target_grades });
    console.log(`Route: ${d.route} grades=${d.expandedGrades} reason=${d.reason}`);

    if (d.route === "A") {
      const grade = d.expandedGrades[0];
      console.log(`Generating Route A for G${grade}...`);
      const { article, questions } = await generateReadingContent({ topicKey: topic.topic_key, language: "zh", category: topic.category, gradeLevel: grade, sourceText: topic.source_text!, route: "A" });

      const match = article.content.trim() === topic.source_text!.trim();
      console.log(`Content verbatim match: ${match ? "PASS" : "FAIL"}`);

      const gate = validateContent({ article, questions, language: "zh", gradeLevel: grade });
      const ib = validateIBCriteria({ article, questions, language: "zh", gradeLevel: grade });
      console.log(`Quality: ${gate.pass ? "PASS" : "FAIL"} issues=${gate.issues.length}`);
      console.log(`IB: ${ib.pass ? "PASS" : "FAIL"} issues=${ib.issues.length}`);
      console.log(`Questions: ${questions.length}`);
      console.log(`END-TO-END ROUTE A: ${match ? "PASS" : "FAIL"}`);
      return; // one successful test is enough
    }
  }
  console.log("No Route A candidate found among tested topics");
}

main().catch(console.error);
