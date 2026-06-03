CREATE OR REPLACE FUNCTION get_reading_dashboard_stats(
  p_child_id UUID,
  p_start TIMESTAMPTZ,
  p_end TIMESTAMPTZ,
  p_recent_limit INT DEFAULT 10
) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH filtered AS (
    SELECT rqa.*, ra.category, ra.category_v2, ra.raz_level, ra.language, ra.title
    FROM reading_quiz_attempts rqa
    LEFT JOIN reading_articles ra ON ra.id = rqa.article_id
    WHERE rqa.child_id = p_child_id
      AND rqa.created_at >= p_start AND rqa.created_at < p_end
  )
  SELECT jsonb_build_object(
    'quizzes_taken', (SELECT COUNT(*) FROM filtered),
    'articles_read', (SELECT COUNT(DISTINCT article_id) FROM filtered),
    'average_accuracy', COALESCE((SELECT AVG(CASE WHEN total_questions > 0 THEN score::float / total_questions END) FROM filtered), 0),
    'by_category', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', cat, 'count', cnt, 'avg_accuracy', avg_acc) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(NULLIF(category_v2, ''), category) AS cat, COUNT(*) AS cnt,
          COALESCE(AVG(CASE WHEN total_questions > 0 THEN score::float / total_questions END), 0) AS avg_acc
        FROM filtered
        WHERE COALESCE(NULLIF(category_v2, ''), category) IS NOT NULL
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'by_level', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', lvl, 'count', cnt, 'avg_accuracy', avg_acc) ORDER BY cnt DESC)
      FROM (
        SELECT raz_level AS lvl, COUNT(*) AS cnt,
          COALESCE(AVG(CASE WHEN total_questions > 0 THEN score::float / total_questions END), 0) AS avg_acc
        FROM filtered
        WHERE raz_level IS NOT NULL
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'by_language', COALESCE((
      SELECT jsonb_object_agg(lang, cnt)
      FROM (
        SELECT language AS lang, COUNT(DISTINCT article_id) AS cnt
        FROM filtered
        WHERE language IS NOT NULL
        GROUP BY 1
      ) t
    ), '{}'::jsonb),
    'recent_attempts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', LEFT(created_at::text, 10),
        'article_id', article_id,
        'title', title,
        'score', score,
        'total_questions', total_questions,
        'time_spent_seconds', time_spent_seconds
      ) ORDER BY created_at DESC)
      FROM filtered
      LIMIT p_recent_limit
    ), '[]'::jsonb)
  )
$$;
