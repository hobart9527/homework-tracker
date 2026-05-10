#!/usr/bin/env tsx
/**
 * Test script for stealth scraper on DOGO News + NatGeo Kids.
 *
 * Usage: npx tsx scripts/test-stealth-scraper.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { StealthScraper, ScrapingError } from '@/lib/reading/stealth-scraper';

const TEST_URLS = [
  // DOGO News - recent science/current events articles
  'https://www.dogonews.com/2026/5/8/nasa-dart-spacecraft-changed-asteroid-orbit',
  'https://www.dogonews.com/2026/5/7/emperor-penguins-face-extinction',
  'https://www.dogonews.com/2026/5/6/giant-tortoises-return-galapagos',
  // NatGeo Kids - animals and science
  'https://kids.nationalgeographic.com/animals/article/animals-moms',
  'https://kids.nationalgeographic.com/nature/article/bee-colony',
];

async function main() {
  const scraper = new StealthScraper();

  console.log('Starting stealth scraper test...\n');

  for (const url of TEST_URLS) {
    console.log(`Scraping: ${url}`);
    try {
      const result = await scraper.scrape(url, { timeoutMs: 30000 });
      console.log(`  Title: ${result.title.substring(0, 60)}`);
      console.log(`  Chars: ${result.charCount}`);
      console.log(`  Published: ${result.publishedAt ?? 'unknown'}`);
      console.log(`  Preview: ${result.text.substring(0, 150)}...`);
      console.log('');
    } catch (err) {
      if (err instanceof ScrapingError) {
        console.log(`  Error [${err.code}]: ${err.message}`);
      } else {
        console.log(`  Error: ${(err as Error).message}`);
      }
      console.log('');
    }

    // Delay between URLs
    await new Promise((r) => setTimeout(r, 2000));
  }

  await scraper.close();
  console.log(`Done. Total requests: ${scraper.requestCount_}`);
}

main().catch(console.error);