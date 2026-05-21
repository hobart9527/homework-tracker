/**
 * Global setup runs once before all E2E workers.
 * Uses service role key if available, falls back to anon.
 */
import { SupabaseClient, createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export default async function globalSetup() {
  const client = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Clean up any stale test data from previous runs
  console.log("🧹 Global setup: cleaning stale test data...");

  // Delete test check-ins
  const { error: ciErr } = await client
    .from("check_ins")
    .delete()
    .eq("title", "E2E Test Homework");
  if (ciErr) console.warn("check_ins cleanup:", ciErr.message);

  // Delete test homeworks
  const { error: hwErr } = await client
    .from("homeworks")
    .delete()
    .eq("title", "E2E Test Homework");
  if (hwErr) console.warn("homeworks cleanup:", hwErr.message);

  // Delete test children created by e2e
  const { error: chErr } = await client
    .from("children")
    .delete()
    .eq("name", "E2E Child");
  if (chErr) console.warn("children cleanup:", chErr.message);

  const { error: chErr2 } = await client
    .from("children")
    .delete()
    .eq("name", "TestChild");
  if (chErr2) console.warn("children TestChild cleanup:", chErr2.message);

  console.log("✅ Global setup complete");
}