#!/usr/bin/env tsx
import { config } from 'dotenv';
config({ path: '.env.local' });
import { StealthScraper } from '../src/lib/reading/stealth-scraper';

async function main() {
  const scraper = new StealthScraper();
  const page = await scraper.createPage();

  console.log('Fetching DOGO News homepage...');
  await page.goto('https://www.dogonews.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Stealth scroll to trigger lazy-loaded content
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      let totalHeight = 0;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, 100);
        totalHeight += 100;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 50);
    });
  });

  // Extract all article links
  const articleLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map(a => a.href)
      .filter(h => h.includes('dogonews.com') && !h.endsWith('dogonews.com') && !h.includes('/category/'))
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
    return links.slice(0, 20);
  });

  console.log('Found article links:');
  articleLinks.forEach(l => console.log(l));

  await scraper.close();
}

main().catch(console.error);
