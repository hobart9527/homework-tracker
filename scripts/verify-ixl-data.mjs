import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { count, error: countError } = await supabase
    .from("learning_events")
    .select("*", { count: "exact", head: true })
    .eq("platform", "ixl");

  if (countError) {
    console.error("❌", countError.message);
    return;
  }

  console.log("IXL 学习记录总数:", count);

  const { data, error } = await supabase
    .from("learning_events")
    .select("*")
    .eq("platform", "ixl")
    .order("occurred_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("❌", error.message);
    return;
  }

  console.log("\n最近 5 条记录:");
  data.forEach((e, i) => {
    console.log(`${i + 1}. ${e.title}`);
    console.log(`   时间: ${e.occurred_at}`);
    console.log(`   科目: ${e.subject}`);
    console.log(`   时长: ${e.duration_minutes} 分钟`);
    console.log(`   得分: ${e.score}`);
    console.log();
  });
}

main();
