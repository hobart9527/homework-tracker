import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error, count } = await supabase
    .from('reading_articles')
    .select('id, title, cover_image_url, cover_source, category, language, scene_description', { count: 'exact' });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`Total articles: ${count}`);
  const withCover = data!.filter(a => a.cover_image_url);
  const withoutCover = data!.filter(a => !a.cover_image_url);
  console.log(`With cover: ${withCover.length}`);
  console.log(`Without cover: ${withoutCover.length}`);

  // Check for duplicate cover URLs
  const urlMap: Record<string, number> = {};
  for (const a of withCover) {
    urlMap[a.cover_image_url!] = (urlMap[a.cover_image_url!] || 0) + 1;
  }
  const duplicates = Object.entries(urlMap).filter(([_, count]) => count > 1);
  console.log(`Duplicate cover URLs: ${duplicates.length}`);
  for (const [url, count] of duplicates.slice(0, 10)) {
    console.log(`  URL used ${count} times: ${url.slice(0, 80)}...`);
    const articles = data!.filter(a => a.cover_image_url === url);
    for (const a of articles) {
      console.log(`    - ${a.title} (${a.category}, ${a.language})`);
    }
  }

  // Show first 15 covers
  console.log('\nFirst 15 covers:');
  for (const a of withCover.slice(0, 15)) {
    console.log(`  [${a.category}] ${a.title}: ${a.cover_image_url?.slice(0, 70)}...`);
  }
}

main().catch(console.error);
