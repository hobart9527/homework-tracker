import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from('reading_articles')
    .select('id, title, cover_image_url, cover_source')
    .not('cover_image_url', 'is', null);

  const groups: Record<string, string[]> = {};
  for (const a of data!) {
    groups[a.cover_image_url!] = groups[a.cover_image_url!] || [];
    groups[a.cover_image_url!].push(a.title);
  }

  const result = Object.entries(groups)
    .map(([url, titles]) => ({ url: url.slice(-40), count: titles.length, titles }))
    .sort((a, b) => b.count - a.count);

  // Write to file
  const fs = await import('fs');
  fs.writeFileSync('/tmp/cover-groups.json', JSON.stringify(result, null, 2));
  console.log('Wrote /tmp/cover-groups.json');
}

main().catch(console.error);
