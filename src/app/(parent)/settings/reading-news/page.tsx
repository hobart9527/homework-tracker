"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// ---------------------------------------------------------------------------
// Parent-side admin: paste news URL → submit to /api/reading/news/submit
//
// The API itself is built by w1-task-2; this page consumes the frozen contract
// and renders gracefully even when the endpoint returns 404 or any other
// error response (the API's actual error body is surfaced to the user).
//
// Auth: client-side Supabase session check, matching existing settings/page.tsx
// pattern (no server actions are used elsewhere in this project).
// ---------------------------------------------------------------------------

type SubmitState =
  | { kind: "idle" }
  | { kind: "pending" }
  | {
      kind: "success";
      data: {
        topic_key: string;
        article_ids: string[];
        generated_count: number;
        failed?: { gradeLevel: number; reason: string }[];
      };
    }
  | {
      kind: "client_error";
      error:
        | "invalid_url"
        | "missing_field"
        | "too_short"
        | "too_long"
        | "unauthorized"
        | "fetch_failed"
        | "generation_failed"
        | "api_not_ready"
        | "network_error"
        | "unknown";
      message: string;
      httpStatus?: number;
    };

interface RecentTopicRow {
  topic_key: string;
  category: string | null;
  category_v2: string | null;
  source_url: string | null;
  status: string | null;
  fetched_at: string | null;
  freshness_until: string | null;
  created_at: string | null;
  target_grades: number[] | null;
}

interface RecentArticleRow {
  id: string;
  topic_key: string;
  grade_level: number;
  title: string;
}

const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const FRESHNESS_OPTIONS = [
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天（默认）" },
  { value: 90, label: "90 天" },
];

function isValidUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function mapClientError(
  code: string,
): {
  title: string;
  hint: string;
} {
  switch (code) {
    case "invalid_url":
      return { title: "链接格式无效", hint: "请检查 URL 是否包含 http(s):// 前缀。" };
    case "missing_field":
      return { title: "缺少必填字段", hint: "请确认 URL 与年级都已填写。" };
    case "too_short":
      return { title: "原文过短", hint: "原文内容不足以生成阅读文章，请换一篇更长的报道。" };
    case "too_long":
      return { title: "原文过长", hint: "请选择篇幅适中的新闻文章。" };
    case "unauthorized":
      return { title: "未登录或无权限", hint: "请重新登录家长账号后再试。" };
    case "fetch_failed":
      return { title: "无法抓取链接", hint: "服务端无法读取这条新闻，可能是反爬或站点不可达。" };
    case "generation_failed":
      return { title: "改写失败", hint: "AI 生成阶段出错。请稍后重试或换一条链接。" };
    case "api_not_ready":
      return { title: "API 未就绪", hint: "/api/reading/news/submit 尚未部署（等待 w1-task-2 实装）。" };
    case "network_error":
      return { title: "网络错误", hint: "请求未能到达服务器，请检查网络。" };
    default:
      return { title: "未知错误", hint: "请稍后重试或联系管理员。" };
  }
}

export default function ReadingNewsAdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [authState, setAuthState] = useState<
    "loading" | "anonymous" | "non_parent" | "parent"
  >("loading");

  // form state
  const [url, setUrl] = useState("");
  const [grades, setGrades] = useState<number[]>([3, 6]);
  const [freshnessDays, setFreshnessDays] = useState<number>(30);
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });

  // recent submissions
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentTopics, setRecentTopics] = useState<RecentTopicRow[]>([]);
  const [recentArticles, setRecentArticles] = useState<RecentArticleRow[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        setAuthState("anonymous");
        return;
      }

      const { data: parentRow } = await supabase
        .from("parents")
        .select("id")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (!parentRow) {
        setAuthState("non_parent");
        return;
      }

      setAuthState("parent");

      // Recent submissions: latest 10 reading_topics WHERE category_v2 = '时事'.
      // `reading_topics` is not in the generated Database types yet, so cast
      // the client to a structural subset for this query only.
      const looseClient = supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: RecentTopicRow[] | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };

      const topicsRes = await looseClient
        .from("reading_topics")
        .select(
          "topic_key, category, category_v2, source_url, status, fetched_at, freshness_until, created_at, target_grades",
        )
        .eq("category_v2", "时事")
        .order("created_at", { ascending: false })
        .limit(10);

      if (cancelled) return;

      if (topicsRes.error) {
        setRecentError(topicsRes.error.message);
        setRecentTopics([]);
        setRecentArticles([]);
      } else {
        const topics = topicsRes.data ?? [];
        setRecentTopics(topics);

        if (topics.length > 0) {
          const topicKeys = topics.map((t) => t.topic_key);
          const { data: articleData } = await supabase
            .from("reading_articles")
            .select("id, topic_key, grade_level, title")
            .in("topic_key", topicKeys);

          if (!cancelled) {
            setRecentArticles((articleData ?? []) as RecentArticleRow[]);
          }
        } else {
          setRecentArticles([]);
        }
      }

      setRecentLoading(false);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const urlValid = isValidUrl(url);
  const gradesValid = grades.length > 0;
  const formValid = urlValid && gradesValid && submit.kind !== "pending";

  const toggleGrade = (g: number) => {
    setGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g].sort((a, b) => a - b),
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formValid) return;

    setSubmit({ kind: "pending" });

    let res: Response;
    try {
      res = await fetch("/api/reading/news/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          gradeLevels: grades,
          freshnessDays,
        }),
      });
    } catch (err) {
      setSubmit({
        kind: "client_error",
        error: "network_error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // Surface API's actual response body, even when the endpoint is missing
    // (404 from a not-yet-built route returns HTML in dev — handle gracefully).
    let body: unknown = null;
    let bodyText = "";
    try {
      bodyText = await res.text();
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }

    if (res.ok) {
      const ok = body as {
        topic_key?: string;
        article_ids?: string[];
        generated_count?: number;
        failed?: { gradeLevel: number; reason: string }[];
      } | null;
      if (
        ok &&
        typeof ok.topic_key === "string" &&
        Array.isArray(ok.article_ids) &&
        typeof ok.generated_count === "number"
      ) {
        setSubmit({
          kind: "success",
          data: {
            topic_key: ok.topic_key,
            article_ids: ok.article_ids,
            generated_count: ok.generated_count,
            failed: ok.failed,
          },
        });
        return;
      }
      setSubmit({
        kind: "client_error",
        error: "unknown",
        message: "服务器返回 200 但响应格式不符合预期。",
        httpStatus: res.status,
      });
      return;
    }

    // Non-2xx: try to read `{ error, message }` from the API contract.
    if (res.status === 404) {
      setSubmit({
        kind: "client_error",
        error: "api_not_ready",
        message: bodyText || "/api/reading/news/submit 返回 404。",
        httpStatus: 404,
      });
      return;
    }

    const errBody = body as { error?: string; message?: string } | null;
    const errCode = (errBody?.error ?? "unknown") as
      | "invalid_url"
      | "missing_field"
      | "too_short"
      | "too_long"
      | "unauthorized"
      | "fetch_failed"
      | "generation_failed"
      | "unknown";
    const errMessage = errBody?.message ?? bodyText ?? `HTTP ${res.status}`;

    setSubmit({
      kind: "client_error",
      error: errCode,
      message: errMessage,
      httpStatus: res.status,
    });
  };

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-2xl text-forest-600">加载中…</div>
      </div>
    );
  }

  if (authState === "anonymous" || authState === "non_parent") {
    return (
      <div className="bg-background">
        <header className="bg-forest-500 p-space-4 text-white">
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <Link href="/login">
              <span className="text-xl">←</span>
            </Link>
            <div>
              <h1 className="text-ui-xl font-ui-display font-bold">新闻投稿</h1>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl p-space-4">
          <Card>
            <h2 className="font-bold text-coral-600">无访问权限</h2>
            <p className="mt-2 text-ui-sm text-forest-500">
              {authState === "anonymous"
                ? "请先登录家长账号。"
                : "当前账号不是家长账号，无法访问新闻投稿管理页面。"}
            </p>
            <div className="mt-3">
              <Link href="/login" className="text-forest-700 underline">
                前往登录
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // Group articles by topic_key for the recent submissions card.
  const articlesByTopic = new Map<string, RecentArticleRow[]>();
  for (const a of recentArticles) {
    const list = articlesByTopic.get(a.topic_key) ?? [];
    list.push(a);
    articlesByTopic.set(a.topic_key, list);
  }

  return (
    <div className="bg-background">
      <header className="bg-forest-500 p-space-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href="/settings">
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-ui-xl font-ui-display font-bold">新闻投稿</h1>
            <p className="mt-1 text-ui-sm text-white/80">
              粘贴新闻链接，自动改写为孩子可读的英文阅读文章。
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-space-4">
        <Card>
          <div className="space-y-3">
            <div>
              <h2 className="font-bold text-forest-700">提交新闻链接</h2>
              <p className="mt-1 text-ui-sm text-forest-500">
                输入要改写的新闻 URL，选择目标年级和新鲜度窗口。系统会调用
                后端管线生成对应等级的英文阅读文章。
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label
                  htmlFor="news-url"
                  className="block text-ui-sm font-medium text-forest-700"
                >
                  新闻链接 URL
                </label>
                <input
                  id="news-url"
                  type="url"
                  required
                  placeholder="https://example.com/news/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-radius-md border-2 border-forest-200 bg-white px-space-3 py-space-2 text-ui-base text-ink-800 focus:border-primary focus:outline-none"
                />
                {url && !urlValid ? (
                  <p className="text-ui-xs text-coral-600">
                    URL 格式无效，请确认包含 http(s):// 前缀。
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <span className="block text-ui-sm font-medium text-forest-700">
                  目标年级
                </span>
                <p className="text-ui-xs text-forest-500">
                  默认为 Grade 3 与 Grade 6（家中两个孩子）。可勾选其他年级以扩展。
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {ALL_GRADES.map((g) => {
                    const checked = grades.includes(g);
                    return (
                      <label
                        key={g}
                        className={`cursor-pointer rounded-radius-sm border-2 px-3 py-1.5 text-ui-sm transition-colors ${
                          checked
                            ? "border-primary bg-forest-50 text-forest-700"
                            : "border-forest-100 bg-white text-ink-600 hover:border-forest-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleGrade(g)}
                        />
                        Grade {g}
                      </label>
                    );
                  })}
                </div>
                {!gradesValid ? (
                  <p className="text-ui-xs text-coral-600">至少选择一个年级。</p>
                ) : null}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="freshness-days"
                  className="block text-ui-sm font-medium text-forest-700"
                >
                  新鲜度窗口
                </label>
                <select
                  id="freshness-days"
                  value={freshnessDays}
                  onChange={(e) => setFreshnessDays(parseInt(e.target.value, 10))}
                  className="w-full rounded-radius-md border-2 border-forest-200 bg-white px-space-3 py-space-2 text-ui-base text-ink-800 focus:border-primary focus:outline-none"
                >
                  {FRESHNESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!formValid}>
                  {submit.kind === "pending" ? "处理中…" : "提交并生成"}
                </Button>
                {submit.kind === "pending" ? (
                  <span className="text-ui-sm text-forest-600">
                    Fetching and rewriting…
                  </span>
                ) : null}
              </div>
            </form>

            {submit.kind === "success" ? (
              <div className="rounded-radius-md border border-forest-200 bg-forest-50/70 p-3">
                <h3 className="font-semibold text-forest-700">生成成功</h3>
                <p className="mt-1 text-ui-sm text-forest-600">
                  topic_key:{" "}
                  <code className="rounded bg-cream-100 px-1.5 py-0.5">
                    {submit.data.topic_key}
                  </code>
                </p>
                <p className="mt-1 text-ui-sm text-forest-600">
                  共生成 {submit.data.generated_count} 篇文章。
                </p>
                {submit.data.article_ids.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {submit.data.article_ids.map((id) => (
                      <Link
                        key={id}
                        href={`/reading/${id}`}
                        className="rounded-radius-sm bg-cream-100 px-2 py-1 text-ui-xs text-forest-700 hover:bg-cream-200"
                      >
                        查看文章 · {id.slice(0, 8)}
                      </Link>
                    ))}
                  </div>
                ) : null}
                {submit.data.failed && submit.data.failed.length > 0 ? (
                  <div className="mt-2">
                    <p className="text-ui-xs text-coral-700">
                      部分年级生成失败：
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-ui-xs text-coral-700">
                      {submit.data.failed.map((f) => (
                        <li key={f.gradeLevel}>
                          Grade {f.gradeLevel}：{f.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            {submit.kind === "client_error" ? (
              (() => {
                const status = submit.httpStatus ?? 0;
                const isServerError = status >= 500;
                if (isServerError) {
                  return (
                    <div className="rounded-radius-md border border-coral-200 bg-coral-50 p-3">
                      <h3 className="font-semibold text-coral-700">
                        服务器繁忙，请稍后重试
                      </h3>
                      <details className="mt-2 text-ui-xs text-coral-700">
                        <summary className="cursor-pointer">调试信息</summary>
                        <pre className="mt-1 whitespace-pre-wrap break-all">
                          HTTP {status} · error={submit.error}
                          {"\n"}
                          {submit.message}
                        </pre>
                      </details>
                    </div>
                  );
                }
                const mapped = mapClientError(submit.error);
                return (
                  <div className="rounded-radius-md border border-coral-200 bg-coral-50 p-3">
                    <h3 className="font-semibold text-coral-700">
                      {mapped.title}
                    </h3>
                    <p className="mt-1 text-ui-sm text-coral-700">
                      {mapped.hint}
                    </p>
                    <details className="mt-2 text-ui-xs text-coral-700">
                      <summary className="cursor-pointer">详细错误</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all">
                        {status ? `HTTP ${status} · ` : ""}error={submit.error}
                        {"\n"}
                        {submit.message}
                      </pre>
                    </details>
                  </div>
                );
              })()
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold text-forest-700">近期投稿</h2>
              <span className="text-ui-xs text-ink-500">
                最近 10 条 · category_v2 = 时事
              </span>
            </div>

            {recentLoading ? (
              <p className="rounded-radius-md bg-forest-50/70 p-3 text-ui-sm text-forest-500">
                加载中…
              </p>
            ) : recentError ? (
              <p className="rounded-radius-md border border-coral-200 bg-coral-50 p-3 text-ui-sm text-coral-700">
                读取失败：{recentError}
              </p>
            ) : recentTopics.length === 0 ? (
              <p className="rounded-radius-md bg-forest-50/70 p-3 text-ui-sm text-forest-500">
                还没有时事类投稿。提交第一条新闻链接后会出现在这里。
              </p>
            ) : (
              <ul className="space-y-2">
                {recentTopics.map((topic) => {
                  const topicArticles =
                    articlesByTopic.get(topic.topic_key) ?? [];
                  return (
                    <li
                      key={topic.topic_key}
                      className="rounded-radius-md border border-forest-100 bg-forest-50/70 p-3"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-forest-700">
                          {topic.topic_key}
                        </span>
                        <span
                          className={`text-ui-xs ${
                            topic.status === "active"
                              ? "text-forest-600"
                              : "text-ink-500"
                          }`}
                        >
                          {topic.status ?? "unknown"}
                        </span>
                      </div>
                      <div className="mt-1 grid gap-1 text-ui-xs text-ink-600 sm:grid-cols-2">
                        <span>
                          抓取：
                          {topic.fetched_at
                            ? new Date(topic.fetched_at).toLocaleString()
                            : "—"}
                        </span>
                        <span>
                          有效至：
                          {topic.freshness_until
                            ? new Date(
                                topic.freshness_until,
                              ).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      {topicArticles.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {topicArticles.map((a) => (
                            <Link
                              key={a.id}
                              href={`/reading/${a.id}`}
                              className="rounded-radius-sm bg-cream-100 px-2 py-1 text-ui-xs text-forest-700 hover:bg-cream-200"
                            >
                              查看文章 · Grade {a.grade_level}
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-ui-xs text-ink-500">
                          尚未生成文章
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
