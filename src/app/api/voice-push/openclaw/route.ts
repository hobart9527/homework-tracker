import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

// ─── 鉴权 ─────────────────────────────────────────────────────
function authenticate(request: Request): NextResponse | null {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.OPENCLAW_API_KEY;
  if (!apiKey || !expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

// ─── 共享: 拉取待处理任务 ────────────────────────────────────
async function handleFetchTasks(supabase: any) {
  try {
    const { data: tasks, error } = await supabase
      .from("voice_push_tasks")
      .select(
        "id, child_id, homework_id, check_in_id, attachment_id, file_path, delivery_attempts, created_at"
      )
      .in("status", ["pending", "retrying"])
      .is("sent_at", null)
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) throw new Error(error.message);
    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ tasks: [] });
    }

    // 并行 enrichment: child name + homework title + signed URL
    const enrichedTasks = await Promise.all(
      tasks.map(async (task: any) => {
        const [childRes, hwRes, urlData] = await Promise.all([
          supabase
            .from("children")
            .select("name")
            .eq("id", task.child_id)
            .single(),
          supabase
            .from("homeworks")
            .select("title")
            .eq("id", task.homework_id)
            .single(),
          supabase.storage
            .from("attachments")
            .createSignedUrl(task.file_path, 600),
        ]);

        return {
          taskId: task.id,
          childId: task.child_id,
          childName: childRes?.data?.name ?? "",
          homeworkId: task.homework_id,
          homeworkTitle: hwRes?.data?.title ?? "",
          fileUrl: urlData?.data?.signedUrl ?? null,
          deliveryAttempts: task.delivery_attempts,
          createdAt: task.created_at,
        };
      })
    );

    return NextResponse.json({ tasks: enrichedTasks });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch pending tasks",
      },
      { status: 500 }
    );
  }
}

// ─── 共享: 标记任务完成/失败 ────────────────────────────────
// delivery_attempts: 先查当前值 → +1 → update
async function handleUpdateTask(supabase: any, body: any) {
  const { taskId, action, failureReason } = body ?? {};

  if (!taskId || !action) {
    return NextResponse.json(
      { error: "Missing required fields: taskId, action" },
      { status: 400 }
    );
  }

  const { data: current } = await supabase
    .from("voice_push_tasks")
    .select("delivery_attempts")
    .eq("id", taskId)
    .single();

  const nextAttempt = (current?.delivery_attempts ?? 0) + 1;
  const attemptedAt = new Date().toISOString();

  if (action === "complete") {
    const { error } = await supabase
      .from("voice_push_tasks")
      .update({
        status: "sent",
        delivery_attempts: nextAttempt,
        failure_reason: null,
        last_attempted_at: attemptedAt,
        sent_at: attemptedAt,
      })
      .eq("id", taskId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "sent", taskId });
  }

  if (action === "fail") {
    const { error } = await supabase
      .from("voice_push_tasks")
      .update({
        status: "failed",
        delivery_attempts: nextAttempt,
        failure_reason: failureReason ?? "Delivery failed",
        last_attempted_at: attemptedAt,
        sent_at: null,
      })
      .eq("id", taskId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ status: "failed", taskId });
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}` },
    { status: 400 }
  );
}

// ─── GET: 拉取待处理任务 ──────────────────────────────────────
export async function GET(request: Request) {
  const authError = authenticate(request);
  if (authError) return authError;

  const supabase = await createServiceRoleClient();
  return handleFetchTasks(supabase);
}

// ─── PATCH: 标记任务完成或失败 ──────────────────────────────
export async function PATCH(request: Request) {
  const authError = authenticate(request);
  if (authError) return authError;

  const supabase = await createServiceRoleClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return handleUpdateTask(supabase, body);
}

// ─── POST: 统一入口 (action 参数区分) ─────────────────────────
// action: "fetch_tasks" | "complete" | "fail"
export async function POST(request: Request) {
  const authError = authenticate(request);
  if (authError) return authError;

  const supabase = await createServiceRoleClient();
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body ?? {};

  if (action === "fetch_tasks") {
    return handleFetchTasks(supabase);
  }

  if (action === "complete" || action === "fail") {
    return handleUpdateTask(supabase, body);
  }

  return NextResponse.json(
    { error: `Unknown action: ${action}` },
    { status: 400 }
  );
}
