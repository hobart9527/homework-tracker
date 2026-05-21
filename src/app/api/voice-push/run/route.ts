import { deliverVoicePushRequest, deliverVoicePushToTelegram, deliverVoicePushToWeCom } from "@/lib/voice-push-bridge";
import { runVoicePushDeliveryBatch } from "@/lib/voice-push-worker";
import { resolveWeChatTarget } from "@/lib/wechat-target-resolver";
import { resolveMessageDeliveryTarget } from "@/lib/message-routing";
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
    const useWeCom = !!(process.env.WECOM_CORPID && process.env.WECOM_CORPSECRET);

    const result = await runVoicePushDeliveryBatch({
      supabase: supabase as any,
      deliver: (request) => {
        if (useWeCom && request.channel === "wechat_group") {
          return deliverVoicePushToWeCom({
            taskId: request.taskId,
            attachmentId: request.attachmentId,
            filePath: request.filePath,
            fileUrl: request.fileUrl,
            recipientRef: request.recipientRef,
            deliveryKey: request.deliveryKey,
          });
        }
        if (request.channel === "telegram_chat") {
          return (async () => {
            const { data: taskDetail } = await supabase
              .from("voice_push_tasks")
              .select("child_id, homework_id, check_in_id")
              .eq("id", request.taskId)
              .single();

            let caption = "作业录音";
            if (taskDetail) {
              const [childRes, hwRes, ciRes] = await Promise.all([
                supabase.from("children").select("name").eq("id", taskDetail.child_id).single(),
                supabase.from("homeworks").select("title").eq("id", taskDetail.homework_id).single(),
                supabase.from("check_ins").select("completed_at").eq("id", taskDetail.check_in_id).single(),
              ]);
              const childName = childRes.data?.name ?? "";
              const hwTitle = hwRes.data?.title ?? "";
              const date = ciRes.data?.completed_at
                ? new Date(ciRes.data.completed_at).toLocaleDateString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                  })
                : "";
              if (childName && hwTitle) {
                caption = `${childName} 的作业录音：${hwTitle}${date ? `-${date}` : ""}`;
              }
            }
            return deliverVoicePushToTelegram({
              taskId: request.taskId,
              attachmentId: request.attachmentId,
              filePath: request.filePath,
              fileUrl: request.fileUrl,
              recipientRef: request.recipientRef,
              deliveryKey: request.deliveryKey,
              caption,
            });
          })();
        }
        return deliverVoicePushRequest({ request });
      },
      resolveTarget: async (task) => {
        const wechatTarget = await resolveWeChatTarget({
          supabase: supabase as any,
          childId: task.child_id,
          homeworkId: task.homework_id,
        });
        if (wechatTarget) return wechatTarget;
        return resolveMessageDeliveryTarget({
          supabase: supabase as any,
          childId: task.child_id,
          homeworkId: task.homework_id,
          channel: "telegram_chat",
        });
      },
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
