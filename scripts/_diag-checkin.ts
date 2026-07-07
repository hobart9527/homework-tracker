import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function main() {
  // 1. Check homework_type_groups
  const { data: groups, error: groupsErr } = await supabase.from("homework_type_groups").select("id, name, parent_id").limit(10);
  console.log("=== homework_type_groups ===");
  console.log(JSON.stringify({ data: groups, error: groupsErr?.message }, null, 2));

  const { count } = await supabase.from("homework_type_groups").select("*", { count: "exact", head: true });
  console.log("group count:", count);

  // 2. Check homeworks - especially type_name and type_group_id
  const { data: homeworks } = await supabase
    .from("homeworks")
    .select("id, type_name, type_group_id, title, child_id, required_checkpoint_type")
    .limit(30);
  console.log("\n=== homeworks ===");
  console.log(JSON.stringify(homeworks, null, 2));

  // 3. Count homeworks with type_name = "阅读"
  const { data: readingHws } = await supabase
    .from("homeworks")
    .select("id, type_name, type_group_id")
    .or("type_name.eq.阅读,type_name.eq.英文阅读,type_name.eq.中文阅读");
  console.log("\n=== reading homeworks ===");
  console.log(JSON.stringify(readingHws, null, 2));

  // 4. Check auto-checkin flow: use service_role to test FK join
  // This simulates what createReadingAutoCheckinServer does
  if (readingHws && readingHws.length > 0) {
    const sampleHw = readingHws[0];
    console.log("\n=== Testing FK join for sample homework ===");
    const { data: joined } = await supabase
      .from("homeworks")
      .select("id, type_name, type_group_id, group:homework_type_groups(name)")
      .eq("id", sampleHw.id);
    console.log(JSON.stringify(joined, null, 2));
  }

  // 5. Check children
  const { data: children } = await supabase.from("children").select("id, name, parent_id");
  console.log("\n=== children ===");
  console.log(JSON.stringify(children, null, 2));

  // 6. Check if there are missing type_group_id in reading homeworks
  if (readingHws) {
    const missingGroup = readingHws.filter(h => !h.type_group_id);
    if (missingGroup.length > 0) {
      console.log(`\n⚠️  ${missingGroup.length} reading homeworks missing type_group_id`);
    } else {
      console.log("\n✅ All reading homeworks have type_group_id");
    }
  }
}

main().catch(console.error);
