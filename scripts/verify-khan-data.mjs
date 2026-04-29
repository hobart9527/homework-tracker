import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from("learning_events")
    .select("*")
    .eq("platform", "khan-academy")
    .order("occurred_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("❌", error.message);
    return;
  }

  console.log("Khan Academy 学习记录:\n");
  data.forEach((e, i) => {
    console.log(`${i + 1}. ${e.title}`);
    console.log(`   时间: ${e.occurred_at}`);
    console.log(`   科目: ${e.subject}`);
    console.log(`   时长: ${e.duration_minutes} 分钟`);
    console.log(`   得分: ${e.score}`);
    console.log(`   状态: ${e.completion_state}`);
    console.log(`   本地日期: ${e.local_date_key}`);
    console.log(`   Raw: ${JSON.stringify(e.raw_payload, null, 2).slice(0, 200)}`);
    console.log();
  });
}

main();
