import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function checkRateLimit(
  request: Request,
  maxRequests = 30,
  windowMs = 60_000
): Promise<Response | null> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";

  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_key: ip,
    p_max_requests: maxRequests,
    p_window_ms: windowMs,
  });

  if (error) {
    console.error("[rate-limit] RPC error:", error.message);
    // Fail open on RPC error
    return null;
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  return null;
}
