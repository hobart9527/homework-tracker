import { deliverVoicePushRequest } from "@/lib/voice-push-bridge";
import { runVoicePushDeliveryBatch } from "@/lib/voice-push-worker";
import { resolveWeChatTarget } from "@/lib/wechat-target-resolver";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall =
    !!cronSecret && cronSecret === (process.env.CRON_SECRET || "");

  const supabase = isCronCall
    ? await createServiceRoleClient()
    : await createClient();

  if (!isCronCall) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get("limit") ?? "20");
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : 20;

  try {
    const result = await runVoicePushDeliveryBatch({
      supabase: supabase as any,
      deliver: (request) =>
        deliverVoicePushRequest({
          request,
        }),
      resolveTarget: (task) =>
        resolveWeChatTarget({
          supabase: supabase as any,
          childId: task.child_id,
          homeworkId: task.homework_id,
        }),
      generateFileUrl: async (task) => {
        const { data, error } = await supabase.storage
          .from("attachments")
          .createSignedUrl(task.file_path, 600);
        if (error || !data?.signedUrl) {
          console.error(
            "[voice-push] Failed to create signed URL for",
            task.file_path,
            error?.message
          );
          return null;
        }
        return data.signedUrl;
      },
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Voice push queue run failed",
      },
      { status: 500 }
    );
  }
}
