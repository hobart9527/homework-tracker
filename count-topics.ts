import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { createServiceRoleClient } = await import('./src/lib/supabase/server');
  const supabase = await createServiceRoleClient();
  const { data: zhTopics, error: zhErr } = await supabase
    .from('reading_topics')
    .select('topic_key, category, target_grades')
    .eq('language', 'zh')
    .eq('status', 'active');
  const { data: enTopics, error: enErr } = await supabase
    .from('reading_topics')
    .select('topic_key, category, target_grades')
    .eq('language', 'en')
    .eq('status', 'active');

  if (zhErr) console.error('ZH error:', zhErr.message);
  if (enErr) console.error('EN error:', enErr.message);

  console.log('ZH topics:', zhTopics?.length || 0);
  console.log('EN topics:', enTopics?.length || 0);
  if (zhTopics?.length) console.log('ZH samples:', zhTopics.slice(0, 3).map((t: any) => t.topic_key));
  if (enTopics?.length) console.log('EN samples:', enTopics.slice(0, 3).map((t: any) => t.topic_key));
}

main().catch(console.error);
