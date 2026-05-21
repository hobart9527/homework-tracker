#!/usr/bin/env tsx
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const { decideRoute } = await import("@/lib/reading/route-analyzer");
  const { generateReadingContent, validateContent, validateIBCriteria } = await import("@/lib/reading");

  const supabase = await createServiceRoleClient();
  const { data: topic } = await supabase
    .from("reading_topics")
    .select("*")
    .eq("topic_key", "dogo-emperor_penguins_face_risk_of_extinction_as_sea_ice_melts")
    .single();

  if (!topic) { console.log("Topic not found"); return; }

  console.log(`Topic: ${topic.topic_key} source=${topic.source} text=${topic.source_text?.length || 0} chars`);

  const d = decideRoute({ topic_key: topic.topic_key, language: "en", source: topic.source, source_text: topic.source_text, target_grades: topic.target_grades });
  console.log(`Route: ${d.route} grades=${d.expandedGrades} reason=${d.reason}`);

  const grade = d.expandedGrades[0];
  console.log(`\nGenerating Route A content for G${grade}...`);

  const { article, questions } = await generateReadingContent({
    topicKey: topic.topic_key,
    language: "en",
    category: topic.category,
    gradeLevel: grade,
    sourceText: topic.source_text!,
    route: "A",
  });

  const sourceText = topic.source_text!.trim();
  const articleContent = article.content.trim();
  const match = articleContent === sourceText;

  console.log(`\n=== ROUTE A VERBATIM TEST ===`);
  console.log(`Source:   ${sourceText.length} chars`);
  console.log(`Article:  ${articleContent.length} chars`);
  console.log(`Match:    ${match ? "PASS" : "FAIL"}`);

  if (!match) {
    console.log(`\n--- Diff (first difference) ---`);
    for (let i = 0; i < Math.min(sourceText.length, articleContent.length); i++) {
      if (sourceText[i] !== articleContent[i]) {
        console.log(`First diff at char ${i}: src='${sourceText.substring(i,i+30)}' vs art='${articleContent.substring(i,i+30)}'`);
        break;
      }
    }
  }

  const gate = validateContent({ article, questions, language: "en", gradeLevel: grade });
  const ib = validateIBCriteria({ article, questions, language: "en", gradeLevel: grade });
  console.log(`\nQuality: ${gate.pass ? "PASS" : "FAIL"} (${gate.issues.length} issues)${gate.issues.length > 0 ? ": " + gate.issues.map(i=>i.code).join(",") : ""}`);
  console.log(`IB:      ${ib.pass ? "PASS" : "FAIL"} (${ib.issues.length} issues)${ib.issues.length > 0 ? ": " + ib.issues.map(i=>i.code).join(",") : ""}`);
  console.log(`Questions: ${questions.length}`);

  console.log(`\n=== FINAL: ROUTE A E2E ${match ? "PASS" : "FAIL"} ===`);
}

main().catch(console.error);
