import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const GITHUB_API = "https://api.github.com";
const REPO = "hobart9527/homework-tracker";
const WORKFLOW_FILE = "sync-learning.yml";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = params.id;

  if (!accountId) {
    return NextResponse.json({ error: "Missing account ID" }, { status: 400 });
  }

  // Fetch the platform account and verify parent ownership
  const { data: account, error: accountError } = await supabase
    .from("platform_accounts")
    .select("*, children!inner(parent_id)")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Verify ownership via the child
  if (account.children?.parent_id !== session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check credentials exist
  if (!account.login_credentials_encrypted) {
    return NextResponse.json(
      { error: "该账号未配置自动登录凭据，无法刷新 Session。" },
      { status: 400 }
    );
  }

  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    return NextResponse.json(
      { error: "GITHUB_PAT 未配置，请联系管理员设置 GitHub Token。" },
      { status: 500 }
    );
  }

  // Trigger GHA workflow to refresh this specific account
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubPat}`,
          "User-Agent": "homework-tracker-vercel",
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            account_id: accountId,
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error(`GitHub API error (${response.status}): ${body}`);
      return NextResponse.json(
        { error: `触发 GitHub Actions 失败 (${response.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "✅ Session 刷新任务已提交到 GitHub Actions，约 2-5 分钟后完成。请稍后刷新页面查看状态。",
    });
  } catch (error) {
    console.error("Failed to trigger GHA workflow:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "触发 GitHub Actions 时发生网络错误",
      },
      { status: 502 }
    );
  }
}
