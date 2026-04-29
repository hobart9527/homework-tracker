import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const corpid = process.env.WECOM_CORPID;
  const corpsecret = process.env.WECOM_CORPSECRET;

  if (corpid && corpsecret) {
    return NextResponse.json({
      configured: true,
      corpidPreview: corpid.slice(0, 8) + "…",
    });
  }

  return NextResponse.json({
    configured: false,
    missing: !corpid ? "WECOM_CORPID" : "WECOM_CORPSECRET",
  });
}
