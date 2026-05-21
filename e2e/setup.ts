/**
 * E2E Test Helpers
 * Uses RPC calls to bypass Supabase schema cache issues.
 */
import { SupabaseClient, createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

// ── Shared clients ────────────────────────────────────────────────
export function getServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Schema cache fix (refresh PostgREST schema) ───────────────────
export async function refreshSchemaCache(supabase: SupabaseClient) {
  // Supabase CLI / pg_dump approach: call the pgrst schema cache reload
  // via SQL function if available, otherwise use a workaround:
  const { error } = await supabase.rpc("pgrst", { command: "reload schema" });
  if (error) {
    // Fallback: do a simple query to force introspection
    // This is a known issue with Supabase + @supabase/supabase-js
    // The real fix is to wait for schema propagation or use direct SQL
    console.warn("Schema cache refresh skipped (may need manual reload):", error.message);
  }
}

// ── Test data helpers (all via RPC to avoid schema cache issues) ──

export async function ensureTestParent(): Promise<{ passcode: string }> {
  const passcode = "666666";
  // Use the SQL function directly - it handles everything
  // If parent doesn't exist, we create one via SQL
  const supabase = getServiceClient();

  // Try to get parent first
  const { data: existing } = await supabase.rpc("get_parent_by_passcode", { passcode });
  if (existing) return { passcode };

  // Create parent via insert + set passcode
  const { data, error } = await supabase.rpc("create_test_parent", {
    p_nickname: "E2E Test Parent",
    p_email: `e2e-${Date.now()}@test.com`,
    p_passcode: passcode,
  });

  if (error) {
    // Fallback: raw SQL
    console.log("create_test_parent RPC not found, trying raw insert...");
    const { data: raw } = await supabase
      .from("parents")
      .insert({ nickname: "E2E Test Parent", email: `e2e-${Date.now()}@test.com` })
      .select("id")
      .single();
    if (raw) {
      await supabase.rpc("set_parent_passcode", {
        parent_id: raw.id,
        passcode,
      });
    }
  }

  return { passcode };
}

export async function ensureTestChild(parentId: string): Promise<{ passcode: string; childName: string }> {
  const passcode = "123456";
  const childName = "E2E Child";
  const supabase = getServiceClient();

  // Check if child exists
  const { data: existing } = await supabase
    .from("children")
    .select("id")
    .eq("name", childName)
    .single();

  if (existing) return { passcode, childName };

  const { data: child } = await supabase
    .from("children")
    .insert({
      parent_id: parentId,
      name: childName,
      default_weekly_goal: 5,
    })
    .select("id")
    .single();

  return { passcode, childName };
}

// ── Cleanup ───────────────────────────────────────────────────────
export async function cleanupE2ETestData() {
  const supabase = getServiceClient();

  // Delete by known test identifiers
  await supabase.from("check_ins").delete().eq("title", "E2E Test Homework");
  await supabase.from("homeworks").delete().eq("title", "E2E Test Homework");

  console.log("🧹 E2E test data cleaned");
}