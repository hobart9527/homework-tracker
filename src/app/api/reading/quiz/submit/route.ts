import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  evaluateAutoLevel,
  recomputeStats,
  type AutoLevelDecision,
} from "@/lib/reading/auto-level";
import { createReadingAutoCheckinServer } from "@/lib/auto-checkins";

const BASE_READING_POINTS = 10;
const RECENT_ATTEMPTS_LIMIT = 25;

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 20, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { childId, articleId, assignmentId, answers, timeSpentSeconds } = body;

  if (!childId || !articleId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Fetch questions to validate answers. Articles may legitimately have
    // zero questions (e.g. legacy zh articles) — in that case we still
    // record the completion attempt so the child gets credit for reading.
    const { data: questions } = await supabase
      .from("reading_questions")
      .select("id, correct_answer, explanation")
      .eq("article_id", articleId);

    const qList = questions ?? [];

    // Build answer map
    const correctMap = new Map(qList.map((q) => [q.id, q.correct_answer]));

    const gradedAnswers = (answers ?? []).map(
      (a: { questionId: string; selectedLabel: string }) => ({
        question_id: a.questionId,
        selected: a.selectedLabel,
        correct: correctMap.get(a.questionId) === a.selectedLabel,
      })
    );

    const score = gradedAnswers.filter((a: { correct: boolean }) => a.correct).length;
    const total = qList.length;
    const pointsEarned = total > 0 ? Math.round(BASE_READING_POINTS * (score / total)) : 0;

    // Insert quiz attempt
    const { error: attemptError } = await supabase
      .from("reading_quiz_attempts")
      .insert({
        child_id: childId,
        article_id: articleId,
        assignment_id: assignmentId || null,
        answers: gradedAnswers,
        score,
        total_questions: total,
        time_spent_seconds: timeSpentSeconds || 0,
      });

    if (attemptError) {
      console.error("Failed to save quiz attempt:", attemptError);
    }

    // Update assignment status if applicable
    if (assignmentId) {
      await supabase
        .from("reading_assignments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", assignmentId);
    }

    // -----------------------------------------------------------------
    // Auto-level side-effect (best-effort).
    //
    // Update reading_stats and (if criteria met) bump the child's
    // per-language reading level. ANY failure here is logged but MUST
    // NOT cause the quiz submission to fail — the score is already
    // persisted above.
    //
    // Type tolerance: reading_stats and the per-language children.*
    // columns may not yet be in the generated Database types, so we
    // cast through `as never` / `as unknown` where needed.
    // -----------------------------------------------------------------
    let levelChange: AutoLevelDecision | null = null;
    try {
      // 1. Resolve the article's language and raz_level.
      const { data: articleMeta, error: articleMetaError } = await supabase
        .from("reading_articles")
        .select("language, raz_level")
        .eq("id", articleId)
        .single();

      if (articleMetaError || !articleMeta) {
        console.warn(
          "[auto-level] could not load article meta; skipping",
          articleMetaError?.message
        );
      } else {
        const articleLang = (articleMeta as { language?: string | null }).language;
        const articleRazLevel = (articleMeta as { raz_level?: string | null }).raz_level;

        if (articleRazLevel == null) {
          console.warn(
            "[auto-level] reading_articles.raz_level is missing; skipping auto-level"
          );
        } else {
          const language: "en" | "zh" = articleLang === "zh" ? "zh" : "en";
          const levelCol = language === "zh" ? "reading_level_zh" : "reading_level_en";
          const maxCol = language === "zh" ? "reading_level_zh_max" : "reading_level_en_max";

          // 2. Load child's current per-language level + cap.
          const { data: childRow, error: childErr } = await supabase
            .from("children")
            .select(`id, ${levelCol}, ${maxCol}`)
            .eq("id", childId)
            .single();

          if (childErr || !childRow) {
            console.warn(
              "[auto-level] could not load child level; skipping",
              childErr?.message
            );
          } else {
            const childRec = childRow as unknown as Record<string, string | null>;
            const currentLevel = (childRec[levelCol] ?? "L3") as string;
            const maxLevel = (childRec[maxCol] ?? null) as string | null;

            // 3. Fetch the most-recent 25 attempts for this child, joined
            //    with reading_articles to get raz_level. We filter to the
            //    current level later in JS — fetching unfiltered keeps the
            //    bump-down "last 2 at level" check accurate too.
            const { data: rawAttempts, error: attemptsErr } = await supabase
              .from("reading_quiz_attempts")
              .select(
                "score, total_questions, created_at, article:article_id(raz_level, language)"
              )
              .eq("child_id", childId)
              .order("created_at", { ascending: false })
              .limit(RECENT_ATTEMPTS_LIMIT);

            if (attemptsErr) {
              console.warn(
                "[auto-level] could not load recent attempts; skipping",
                attemptsErr.message
              );
            } else {
              type RawAttempt = {
                score: number;
                total_questions: number;
                created_at: string;
                article:
                  | { raz_level: string | null; language: string | null }
                  | { raz_level: string | null; language: string | null }[]
                  | null;
              };
              const attempts = ((rawAttempts ?? []) as unknown as RawAttempt[])
                .map((a) => {
                  const art = Array.isArray(a.article) ? a.article[0] : a.article;
                  return {
                    score: a.score,
                    total_questions: a.total_questions,
                    created_at: a.created_at,
                    article_raz_level: art?.raz_level ?? null,
                    article_language: art?.language ?? null,
                  };
                })
                // Restrict to attempts on articles in the same language as
                // the just-completed quiz, so per-language stats stay clean.
                .filter((a) => a.article_language === language)
                .map((a) => ({
                  score: a.score,
                  total_questions: a.total_questions,
                  created_at: a.created_at,
                  article_raz_level: a.article_raz_level,
                }));

              // 4. Recompute aggregate stats for currentLevel.
              const newStats = recomputeStats({ attempts, currentLevel });

              // 5. Decide bump_up / bump_down / hold.
              const decision = evaluateAutoLevel({
                language,
                currentLevel,
                maxLevel,
                recentAttempts: attempts,
                stats: newStats,
              });
              levelChange = decision;

              const today = new Date().toISOString().split("T")[0];
              const nowIso = new Date().toISOString();
              const willBump =
                decision.action === "bump_up" || decision.action === "bump_down";

              // 6. Upsert reading_stats. If we're about to bump, reset
              //    per-level counters since the new level has no history.
              const upsertPayload = {
                child_id: childId,
                total_articles_read: newStats.total_articles_read,
                articles_at_current_level: willBump
                  ? 0
                  : newStats.articles_at_current_level,
                accuracy_streak: willBump ? 0 : newStats.accuracy_streak,
                last_article_date: today,
                updated_at: nowIso,
              };
              const { error: statsErr } = await supabase
                .from("reading_stats")
                .upsert(upsertPayload as Record<string, unknown>, { onConflict: "child_id" });
              if (statsErr) {
                console.warn(
                  "[auto-level] failed to upsert reading_stats",
                  statsErr.message
                );
              }

              // 7. Apply the per-language level bump if any.
              if (willBump) {
                const update = { [levelCol]: decision.to } as Record<string, string>;
                const { error: bumpErr } = await supabase
                  .from("children")
                  .update(update)
                  .eq("id", childId);
                if (bumpErr) {
                  console.warn(
                    "[auto-level] failed to bump child level",
                    bumpErr.message
                  );
                } else {
                  console.info("[auto-level] level changed", {
                    childId,
                    language,
                    fromLevel: decision.from,
                    toLevel: decision.to,
                    action: decision.action,
                    reasons: decision.reasons,
                  });
                }
              } else {
                console.info("[auto-level] hold", {
                  childId,
                  language,
                  level: currentLevel,
                  reasons: decision.reasons,
                });
              }
            }
          }
        }
      }
    } catch (autoLevelErr) {
      console.warn(
        "[auto-level] unexpected error; quiz submission unaffected",
        autoLevelErr
      );
    }

    // -----------------------------------------------------------------
    // Auto-checkin side-effect (best-effort).
    // Insert/update check_ins for the matched reading homework.
    // -----------------------------------------------------------------
    let checkinResult: { status: string; check_in_id?: string; reason?: string; homework_id: string | null } | null = null;
    try {
      // Fetch article language fresh (not available from auto-level scope)
      let articleLang: "zh" | "en" | undefined;
      const { data: langData } = await supabase
        .from("reading_articles")
        .select("language")
        .eq("id", articleId)
        .single();
      articleLang = (langData as { language?: string | null } | null)?.language === "zh" ? "zh" : "en";

      checkinResult = await createReadingAutoCheckinServer({
        supabase,
        childId,
        articleId,
        articleLanguage: articleLang,
        score,
        total,
      });
    } catch (checkinErr) {
      console.warn("[auto-checkin] unexpected error; quiz submission unaffected", checkinErr);
      checkinResult = { status: "failed", reason: String(checkinErr), homework_id: null };
    }

    return NextResponse.json({
      score,
      total,
      pointsEarned,
      answers: gradedAnswers,
      questions: questions.map((q) => ({
        id: q.id,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
      })),
      ...(levelChange ? { level_change: levelChange } : {}),
      ...(checkinResult ? { checkin: checkinResult } : {}),
    });
  } catch (error) {
    console.error("Quiz submit error:", error);
    return NextResponse.json({ error: "Failed to submit quiz" }, { status: 500 });
  }
}
