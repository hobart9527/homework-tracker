import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function main() {
  // Check migration tracking table
  const { data: migrations, error: migErr } = await supabase
    .from("schema_migrations")
    .select("version, name")
    .order("version", { ascending: true });

  console.log("=== schema_migrations ===");
  if (migErr) console.log("Error:", migErr.message, migErr.details);
  else {
    for (const m of migrations ?? []) {
      const v = (m as any).version ?? m.version;
      const n = (m as any).name ?? m.name;
      console.log(`  ${v} ${n}`);
    }
  }

  // Try _migrations
  const { data: m2, error: e2 } = await supabase
    .from("_migrations")
    .select("version, name")
    .order("version", { ascending: true });

  console.log("\n=== _migrations ===");
  if (e2) console.log("Error:", e2.message);
  else {
    for (const m of m2 ?? []) {
      console.log(`  ${(m as any).version} ${(m as any).name}`);
    }
  }

  // Try supabase_migrations schema
  const { data: m3, error: e3 } = await supabase
    .from("supabase_migrations")
    .select("version, name")
    .order("version", { ascending: true });

  console.log("\n=== supabase_migrations ===");
  if (e3) console.log("Error:", e3.message);
  else {
    for (const m of m3 ?? []) {
      console.log(`  ${(m as any).version} ${(m as any).name}`);
    }
  }
}

main().catch(console.error);
