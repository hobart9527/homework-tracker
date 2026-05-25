import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from('reading_articles')
    .select('id, title, cover_image_url, cover_source, created_at')
    .not('cover_image_url', 'is', null);

  if (error) { console.error(error); process.exit(1); }

  // Group by cover URL
  const groups: Record<string, typeof data> = {};
  for (const a of data!) {
    groups[a.cover_image_url!] = groups[a.cover_image_url!] || [];
    groups[a.cover_image_url!].push(a);
  }

  for (const [url, articles] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n=== URL used ${articles.length} time(s) ===`);
    console.log(`Full URL: ${url}`);
    for (const a of articles) {
      console.log(`  - ${a.title} | source=${a.cover_source} | created=${a.created_at}`);
    }
  }
}

main().catch(console.error);
