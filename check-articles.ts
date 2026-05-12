import { config } from "dotenv";
config({ path: ".env.local" });
import { createServiceRoleClient } from "./src/lib/supabase/server";

async function main() {
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase
    .from("reading_articles")
    .select("status, language, grade_level");

  if (error) { console.error(error); return; }

  const groups: Record<string, number> = {};
  data.forEach(a => {
    const key = `${a.language}|${a.grade_level}|${a.status}`;
    groups[key] = (groups[key] || 0) + 1;
  });

  console.log("Current articles:");
  Object.entries(groups).sort().forEach(([k, v]) => {
    const [lang, grade, status] = k.split("|");
    console.log(`  ${lang} G${grade} ${status}: ${v}`);
  });
  console.log(`\nTotal: ${data.length}`);
}

main();