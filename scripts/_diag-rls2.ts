import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function main() {
  // Try to query from auth schema
  const { data, error } = await supabase
    .from("homework_type_groups")
    .select(`
      id, name, parent_id
    `)
    .limit(10);

  if (error) {
    console.log("Query error:", error.message);
  } else {
    console.log("Groups:", data);
  }

  // Check if RLS is enabled by checking pg_policies
  // Use raw SQL via rpc
  const { data: rpcData, error: rpcErr } = await supabase.rpc("exec_sql" as any, {
    sql: "SELECT tablename, policyname FROM pg_policies WHERE tablename = 'homework_type_groups'"
  } as any);

  if (rpcErr) {
    console.log("RPC error:", rpcErr.message);

    // Try without params
    const { data: rpc2 } = await supabase.rpc("exec_sql2" as any, {
      query: "SELECT 1"
    } as any);
    console.log("rpc2:", rpc2);
  } else {
    console.log("Policies:", JSON.stringify(rpcData));
  }

  // Direct attempt with pg vector
  const { data: directPolicies } = await supabase
    .from("pg_policies" as any)
    .select("tablename, policyname, cmd, qual")
    .eq("tablename", "homework_type_groups");
  console.log("direct policies:", directPolicies);
}

main().catch(console.error);
