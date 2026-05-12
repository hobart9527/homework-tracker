import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  // 1. List all children
  const { data: children } = await supabase.from("children").select("*");
  console.log(`\n=== Children (${children?.length ?? 0}) ===`);
  if (children) {
    for (const c of children) {
      console.log(`  ${c.name} | id: ${c.id} | parent_id: ${c.parent_id}`);
    }
  }

  // 2. List auth users
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  console.log(`\n=== Auth Users (${authUsers?.users?.length ?? 0}) ===`);
  if (authUsers?.users) {
    for (const u of authUsers.users) {
      console.log(`  id: ${u.id} | email: ${u.email} | confirmed: ${u.email_confirmed_at ? "yes" : "no"}`);
    }
  }

  // 3. Cross-check: does each child have a matching auth user with correct email?
  console.log("\n=== Cross-check ===");
  if (children && authUsers?.users) {
    const authMap = new Map(authUsers.users.map((u: any) => [u.id, u]));
    for (const c of children) {
      const auth = authMap.get(c.id);
      if (!auth) {
        console.log(`  ❌ ${c.name}: NO auth user found for id ${c.id}`);
      } else if (auth.email !== `${c.id}@child.local`) {
        console.log(`  ⚠️  ${c.name}: email mismatch — auth.email="${auth.email}" expected="${c.id}@child.local"`);
      } else {
        console.log(`  ✅ ${c.name}: auth user OK, email="${auth.email}"`);
      }
    }
  }

  // 4. Test get_child_by_name RPC with anon key
  console.log("\n=== RPC Test (anon key) ===");
  const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  if (children && children.length > 0) {
    for (const c of children) {
      const { data, error } = await anonClient.rpc("get_child_by_name", { name_param: c.name });
      console.log(`  RPC "${c.name}": ${error ? `❌ ${error.message}` : `✅ found ${data?.length ?? 0} result(s)`}`);
    }
  }

  // 5. Test signInWithPassword directly (won't work from server, but children records exist check)
  console.log("\n=== Auth count check ===");
  const childAuthUsers = authUsers?.users?.filter((u: any) => u.email?.includes("@child.local")) ?? [];
  console.log(`  Child auth users: ${childAuthUsers.length}`);
  for (const u of childAuthUsers) {
    const child = children?.find((c: any) => c.id === u.id);
    console.log(`  ${u.email} → child_record: ${child ? `✅ "${child.name}"` : "❌ missing"}`);
  }
}

main().catch(console.error);
