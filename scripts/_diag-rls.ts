import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function main() {
  // Check if migration 055 child RLS policy exists
  const { data: policies, error: policiesErr } = await supabase
    .rpc("exec_sql" as any, { query_text: "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE tablename = 'homework_type_groups'" } as any);

  // Try raw query approach
  console.log("Trying pg_policies query...");

  // Use the sql() function from pg_graphql
  const { data: rawData, error: rawErr } = await supabase
    .from("_pg_policies")
    .select("*")
    .limit(10);

  if (rawErr) {
    console.log("_pg_policies error:", rawErr.message);
  } else {
    console.log("rawData:", rawData);
  }

  // Try: query homework_type_groups with ANON key to simulate child
  const anonSupabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  // First authenticate as a child
  // We need the child's auth token. Let's try with the service role to check if RLS blocks
  console.log("\n=== Testing RLS with different approaches ===");

  // Service role (bypasses RLS) - should work
  const { data: srGroups } = await supabase
    .from("homework_type_groups")
    .select("id, name, parent_id");
  console.log("Service role groups count:", srGroups?.length);

  // Now let's simulate the child query with anon key
  // Just check if we can get any groups - this will be limited by RLS
  const { data: anonGroups, error: anonErr } = await anonSupabase
    .from("homework_type_groups")
    .select("id, name");
  console.log("Anon key groups:", anonGroups?.length ?? 0, anonErr?.message);

  // Check if migration 055 was applied by looking at supabase migration tracking
  const { data: migrations, error: migErr } = await supabase
    .from("_migrations")
    .select("*")
    .order("version", { ascending: false })
    .limit(60);

  if (migErr) {
    console.log("\n_migrations error:", migErr.message);
    // Try schema_migrations
    const { data: schemaMigrations } = await supabase
      .from("schema_migrations")
      .select("*")
      .order("version", { ascending: false })
      .limit(60);
    console.log("schema_migrations:", schemaMigrations);
  } else {
    console.log("\n=== Supabase migrations ===");
    console.log(JSON.stringify(migrations?.map(m => ({ version: m.version, name: m.name })), null, 2));
  }

  // Also try to directly query the FK join with anon key to see if it returns null
  // This simulates what createReadingAutoCheckinServer does for the child
  const { data: hwWithGroup } = await anonSupabase
    .from("homeworks")
    .select("id, type_name, type_group_id, group:homework_type_groups(name)")
    .eq("child_id", "36c7d1f2-7650-4508-85d3-c819a6515d52")
    .limit(5);

  console.log("\n=== Anon key: homeworks with group join ===");
  console.log(JSON.stringify(hwWithGroup, null, 2));
}

main().catch(console.error);
