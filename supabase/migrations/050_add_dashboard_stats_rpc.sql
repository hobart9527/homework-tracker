CREATE OR REPLACE FUNCTION get_reading_dashboard_stats(
  p_child_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_recent_limit INT DEFAULT 10
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'quizzes_taken', COUNT(*),
    'articles_read', COUNT(DISTINCT rqa.article_id),
    'average_accuracy', COALESCE(AVG(
      CASE WHEN rqa.total_questions > 0 THEN rqa.score::float / rqa.total_questions END
    ), 0),
    'by_category', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category', cat_stats.cat,
        'count', cat_stats.cnt,
        'avg_accuracy', cat_stats.avg_acc
      ) ORDER BY cat_stats.cnt DESC)
      FROM (
        SELECT
          COALESCE(NULLIF(ra2.category_v2, ''), ra2.category) AS cat,
          COUNT(*) AS cnt,
          COALESCE(AVG(CASE WHEN rqa2.total_questions > 0 THEN rqa2.score::float / rqa2.total_questions END), 0) AS avg_acc
        FROM reading_quiz_attempts rqa2
        LEFT JOIN reading_articles ra2 ON ra2.id = rqa2.article_id
        WHERE rqa2.child_id = p_child_id
          AND rqa2.created_at >= p_start AND rqa2.created_at < p_end
        GROUP BY COALESCE(NULLIF(ra2.category_v2, ''), ra2.category)
        HAVING COALESCE(NULLIF(ra2.category_v2, ''), ra2.category) IS NOT NULL
      ) cat_stats
    ), '[]'::jsonb),
    'by_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'level', lvl_stats.lvl,
        'count', lvl_stats.cnt,
        'avg_accuracy', lvl_stats.avg_acc
      ) ORDER BY lvl_stats.cnt DESC)
      FROM (
        SELECT
          ra2.raz_level AS lvl,
          COUNT(*) AS cnt,
          COALESCE(AVG(CASE WHEN rqa2.total_questions > 0 THEN rqa2.score::float / rqa2.total_questions END), 0) AS avg_acc
        FROM reading_quiz_attempts rqa2
        LEFT JOIN reading_articles ra2 ON ra2.id = rqa2.article_id
        WHERE rqa2.child_id = p_child_id
          AND rqa2.created_at >= p_start AND rqa2.created_at < p_end
          AND ra2.raz_level IS NOT NULL
        GROUP BY ra2.raz_level
      ) lvl_stats
    ), '[]'::jsonb),
    'by_language', COALESCE((
      SELECT jsonb_object_agg(lang_stats.lang, lang_stats.cnt)
      FROM (
        SELECT ra2.language AS lang, COUNT(DISTINCT rqa2.article_id) AS cnt
        FROM reading_quiz_attempts rqa2
        LEFT JOIN reading_articles ra2 ON ra2.id = rqa2.article_id
        WHERE rqa2.child_id = p_child_id
          AND rqa2.created_at >= p_start AND rqa2.created_at < p_end
          AND ra2.language IS NOT NULL
        GROUP BY ra2.language
      ) lang_stats
    ), '{}'::jsonb),
    'recent_attempts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', LEFT(rqa2.created_at::text, 10),
        'article_id', rqa2.article_id,
        'title', ra2.title,
        'score', rqa2.score,
        'total_questions', rqa2.total_questions,
        'time_spent_seconds', rqa2.time_spent_seconds
      ) ORDER BY rqa2.created_at DESC)
      FROM reading_quiz_attempts rqa2
      LEFT JOIN reading_articles ra2 ON ra2.id = rqa2.article_id
      WHERE rqa2.child_id = p_child_id
        AND rqa2.created_at >= p_start AND rqa2.created_at < p_end
      LIMIT p_recent_limit
    ), '[]'::jsonb)
  )
  FROM reading_quiz_attempts rqa
  WHERE rqa.child_id = p_child_id
    AND rqa.created_at >= p_start AND rqa.created_at < p_end;
$$;
