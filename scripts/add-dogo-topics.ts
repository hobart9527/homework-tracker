#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { StealthScraper } from '../src/lib/reading/stealth-scraper';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DOGO_ARTICLES = [
  { url: 'https://www.dogonews.com/2026/5/8/robot-outruns-humans-in-beijing-half-marathon', category: '时事' },
  { url: 'https://www.dogonews.com/2026/5/7/georgia-battles-large-wildfires-amid-drought-conditions', category: '时事' },
  { url: 'https://www.dogonews.com/2026/5/5/african-elephants-may-be-using-farm-crops-as-medicine', category: '自然' },
  { url: 'https://www.dogonews.com/2026/4/29/emperor-penguins-face-risk-of-extinction-as-sea-ice-melts', category: '自然' },
  { url: 'https://www.dogonews.com/2026/4/23/nasas-dart-spacecraft-changed-an-asteroids-orbit-around-the-sun', category: '科学' },
  { url: 'https://www.dogonews.com/2026/4/21/giant-tortoises-return-to-galapagos-island-after-centuries', category: '自然' },
  { url: 'https://www.dogonews.com/2026/4/20/how-the-netherlands-became-the-worlds-tulip-capital', category: '文化' },
];

async function main() {
  const scraper = new StealthScraper();

  for (const article of DOGO_ARTICLES) {
    // Check if already exists
    const { data: existing } = await sb.from('reading_topics')
      .select('topic_key')
      .eq('source_url', article.url)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${article.url}`);
      continue;
    }

    // Fetch article to extract source_text
    console.log(`Fetching: ${article.url}`);
    let sourceText = '';
    try {
      const result = await scraper.scrape(article.url, { timeoutMs: 30000 });
      sourceText = result.text;
      console.log(`  Got ${sourceText.length} chars`);
    } catch (err) {
      console.log(`  Fetch failed: ${(err as Error).message}`);
    }

    // Derive topic_key from URL slug
    const slug = article.url.split('/').pop() || '';
    const topicKey = 'dogo-' + slug.replace(/-/g, '_');

    // Insert
    const { error } = await sb.from('reading_topics').insert({
      topic_key: topicKey,
      language: 'en',
      category: article.category,
      source_url: article.url,
      source_text: sourceText || null,
      status: 'active',
      target_grades: [3, 6],
    });

    if (error) {
      console.log(`  Insert failed: ${error.message}`);
    } else {
      console.log(`  Added: ${topicKey}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  await scraper.close();
  console.log('\nDone adding topics.');
}

main().catch(console.error);
