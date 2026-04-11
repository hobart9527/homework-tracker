import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, age, gender, password: rawPassword, avatar } = await request.json();

  if (!name || !age || !rawPassword) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Use service role to create auth user (requires service key)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const childEmail = `child-${Date.now()}@parent.local`;
  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email: childEmail,
    password: rawPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Auth creation error:", authError);
    return NextResponse.json({ error: "Failed to create auth user" }, { status: 500 });
  }

  // Create child profile
  const { data: child, error: profileError } = await supabase.from("children").insert({
    id: authData.user.id,
    parent_id: session.user.id,
    name,
    age: parseInt(age),
    gender,
    password_hash: rawPassword,
    avatar: avatar || "🦊",
  }).select().single();

  if (profileError) {
    console.error("Profile insert error:", profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, child });
}
