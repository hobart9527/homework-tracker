import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function main() {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: children } = await serviceClient.from("children").select("id, name");

  if (!children || children.length === 0) {
    console.log("No children found");
    return;
  }

  for (const child of children) {
    console.log(`\n=== Testing login for ${child.name} (${child.id}) ===`);

    const { data: authUser } = await serviceClient.auth.admin.getUserById(child.id);
    if (!authUser?.user) {
      console.log(`  ❌ No auth user for child`);
      continue;
    }

    const u = authUser.user;
    console.log(`  Email: ${u.email}, Confirmed: ${u.email_confirmed_at || "no"}, Has password: ${u.has_password}`);

    for (const testPass of ["1234", "0000", "1111", "2222"]) {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: `${child.id}@child.local`,
        password: testPass,
      });
      if (!error) {
        console.log(`  ✅ LOGIN SUCCESS with passcode: ${testPass}`);
        await supabase.auth.signOut();
        break;
      } else if (testPass === "1234") {
        console.log(`  First attempt error: ${error.message} (code: ${error.code || "none"})`);
      }
    }
  }
}

main().catch(console.error);
