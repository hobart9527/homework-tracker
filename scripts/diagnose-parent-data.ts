import { config } from "dotenv";
config({ path: ".env.local" });

import { createServiceRoleClient } from "@/lib/supabase/server";

async function main() {
  const supabase = await createServiceRoleClient();

  console.log("=== Database Diagnostic Report ===\n");

  // 1. Count key tables
  const tables = ["auth.users", "parents", "children", "homeworks", "check_ins", "custom_homework_types"];
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table.replace("auth.", ""))
      .select("*", { count: "exact", head: true });
    if (error) {
      console.log(`${table}: ERROR - ${error.message}`);
    } else {
      console.log(`${table}: ${count ?? 0} rows`);
    }
  }

  // auth.users needs special handling (it's in auth schema)
  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.log(`\nauth.users: ERROR - ${authErr.message}`);
  } else {
    console.log(`\nauth.users: ${authUsers.users.length} users`);
    for (const u of authUsers.users.slice(0, 5)) {
      console.log(`  - ${u.id} | ${u.email}`);
    }
  }

  // 2. Check parents table
  const { data: parents, error: parentsErr } = await supabase
    .from("parents")
    .select("id, passcode, created_at, auth_user_email")
    .limit(10);

  if (parentsErr) {
    console.log(`\nparents query ERROR: ${parentsErr.message}`);
  } else {
    console.log(`\nparents rows: ${parents?.length ?? 0}`);
    for (const p of parents ?? []) {
      console.log(`  - id=${p.id} | passcode=${p.passcode} | auth_email=${p.auth_user_email ?? "null"}`);
    }
  }

  // 3. Check children and their parent linkage
  const { data: children, error: childrenErr } = await supabase
    .from("children")
    .select("id, name, parent_id, created_at")
    .limit(10);

  if (childrenErr) {
    console.log(`\nchildren query ERROR: ${childrenErr.message}`);
  } else {
    console.log(`\nchildren rows: ${children?.length ?? 0}`);
    for (const c of children ?? []) {
      console.log(`  - id=${c.id} | name=${c.name} | parent_id=${c.parent_id}`);
    }
  }

  // 4. Check homeworks
  const { data: homeworks, error: hwErr } = await supabase
    .from("homeworks")
    .select("id, title, child_id, created_by, created_at")
    .limit(10);

  if (hwErr) {
    console.log(`\nhomeworks query ERROR: ${hwErr.message}`);
  } else {
    console.log(`\nhomeworks rows: ${homeworks?.length ?? 0}`);
    for (const h of homeworks ?? []) {
      console.log(`  - id=${h.id} | title=${h.title} | child_id=${h.child_id} | created_by=${h.created_by}`);
    }
  }

  // 5. Check if parent_ids in children match auth users
  if (children && children.length > 0 && authUsers?.users.length) {
    const authIds = new Set(authUsers.users.map((u) => u.id));
    const orphaned = children.filter((c) => !authIds.has(c.parent_id));
    if (orphaned.length > 0) {
      console.log(`\n⚠️  ${orphaned.length} children have parent_id not matching any auth user!`);
    } else {
      console.log(`\n✅ All children parent_ids match auth users`);
    }
  }

  console.log("\n=== End Diagnostic ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
