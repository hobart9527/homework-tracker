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
    .select('id, title, cover_image_url')
    .like('cover_image_url', '%pending%')
    .limit(3);
  
  console.log('Pending covers:');
  for (const a of data!) {
    console.log(`  ${a.title}: ${a.cover_image_url}`);
  }
}

main().catch(console.error);
