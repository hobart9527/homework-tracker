import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const root = process.cwd();
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (process.env[key] === undefined) process.env[key] = value;
      }
      break;
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

const PRESET_GROUPS = [
  { name: "英文", icon: "🇬🇧", sort_order: 1 },
  { name: "中文", icon: "🇨🇳", sort_order: 2 },
  { name: "数学", icon: "🔢", sort_order: 3 },
  { name: "兴趣", icon: "🎨", sort_order: 4 },
  { name: "自定义", icon: "✨", sort_order: 5 },
];

async function seed() {
  const { data: parents, error: parentsError } = await supabase
    .from("parents")
    .select("id");

  if (parentsError) {
    console.error("Failed to fetch parents:", parentsError.message);
    process.exit(1);
  }

  if (!parents || parents.length === 0) {
    console.log("No parents found. Nothing to seed.");
    return;
  }

  let inserted = 0;
  let skipped = 0;

  for (const parent of parents) {
    for (const group of PRESET_GROUPS) {
      const { error } = await supabase
        .from("homework_type_groups")
        .insert({
          parent_id: parent.id,
          name: group.name,
          icon: group.icon,
          sort_order: group.sort_order,
        })
        .select()
        .maybeSingle();

      if (error) {
        if (error.message.includes("duplicate") || error.code === "23505") {
          skipped++;
        } else {
          console.error(
            `Error inserting group "${group.name}" for parent ${parent.id}:`,
            error.message
          );
        }
      } else {
        inserted++;
      }
    }
  }

  console.log(`Done. Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
}

seed().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
