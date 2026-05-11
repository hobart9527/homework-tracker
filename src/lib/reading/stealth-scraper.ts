/**
 * Stealth web scraper using Playwright + stealth plugin.
 * Simulates a real browser to avoid anti-bot detection.
 *
 * Usage:
 *   const scraper = new StealthScraper();
 *   const result = await scraper.scrape('https://www.dogonews.com/article-slug');
 *   await scraper.close();
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import { stealth } from '@mr_ozio/playwright-stealth';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

export interface ScrapedPage {
  url: string;
  title: string;
  text: string;
  charCount: number;
  /** ISO timestamp */
  scrapedAt: string;
  /** DOMContentLoaded timestamp or null if not detected */
  publishedAt: string | null;
}

export class ScrapingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScrapingError';
    this.code = code;
  }
}

// Randomized browser headers to simulate different real users
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

export class StealthScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private userAgent: string;
  private requestCount = 0;

  constructor() {
    // Pick random user agent at construction time
    this.userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !(this.browser as any).connected) {
      this.browser = await stealth(chromium).launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,sitePerProcess',
          '--window-size=1280,800',
        ],
      });
      // Create a new context for each browser instance
      this.context = await this.browser.newContext({
        viewport: DEFAULT_VIEWPORT,
        userAgent: this.userAgent,
      });
    }
    return this.browser;
  }

  async createPage(): Promise<Page> {
    if (!this.context) {
      await this.getBrowser();
    }
    const page = await this.context!.newPage();

    // Set realistic viewport
    await page.setViewportSize(DEFAULT_VIEWPORT);

    // Block resource-heavy items to speed up and look more realistic
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      // Block images, fonts, and media (not needed for text extraction)
      if (['image', 'font', 'media', 'websocket', 'other'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    return page;
  }

  /**
   * Scrape a single URL with stealth browser.
   * - Navigates to URL
   * - Waits for article content to load
   * - Extracts title + main text via multiple strategies
   * - Returns plain text ready for LLM
   */
  async scrape(url: string, options?: { timeoutMs?: number }): Promise<ScrapedPage> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const page = await this.createPage();

    try {
      // Random delay before request (simulates human hesitation)
      await this.humanDelay(800, 2000);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });

      // Scroll down to trigger lazy-loaded content
      await this.stealthScroll(page);

      // Wait a bit for dynamic content
      await this.humanDelay(1000, 2500);

      // Extract title
      const title = await this.extractTitle(page);

      // Extract body text using multiple strategies
      const text = await this.extractText(page);

      if (text.length < 200) {
        throw new ScrapingError('too_short', `Extracted only ${text.length} chars`);
      }

      if (text.length > 50000) {
        throw new ScrapingError('too_long', `Extracted ${text.length} chars (max 50000)`);
      }

      // Try to get published date
      const publishedAt = await this.extractPublishedDate(page);

      this.requestCount++;

      // Random delay after request (rate limiting)
      await this.humanDelay(1500, 4000);

      return {
        url: page.url(),
        title,
        text,
        charCount: text.length,
        scrapedAt: new Date().toISOString(),
        publishedAt,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /** Extract title from og:title, title tag, or h1 */
  private async extractTitle(page: Page): Promise<string> {
    const title = await page.evaluate(() => {
      // Try og:title first
      const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogTitle?.trim()) return ogTitle.trim();

      // Try standard title tag
      const tagTitle = document.querySelector('title')?.textContent?.trim();
      if (tagTitle) return tagTitle;

      // Try h1
      const h1 = document.querySelector('h1')?.textContent?.trim();
      if (h1) return h1;

      return document.title.trim();
    });
    return title;
  }

  /** Extract main article text using priority selectors */
  private async extractText(page: Page): Promise<string> {
    const text = await page.evaluate(() => {
      // Priority: .article-body first (DOGO News stores content here, not in <article>)
      // Then article/main content areas
      const selectors = [
        '.article-body',
        'article',
        'main',
        '[role="main"]',
        '.article-content',
        '.post-content',
        '.entry-content',
        '.story-body',
        '.node-content',
        '#article-body',
        '.content-body',
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          return el.textContent ?? '';
        }
      }

      // Fallback: body text
      return document.body?.textContent ?? '';
    });

    // Clean up whitespace
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Try to extract published date from meta tags or article element */
  private async extractPublishedDate(page: Page): Promise<string | null> {
    const dateStr = await page.evaluate(() => {
      const metaSelectors = [
        'meta[property="article:published_time"]',
        'meta[name="publishdate"]',
        'meta[name="date"]',
        'meta[itemprop="datePublished"]',
        'time[datetime]',
        '.published-date',
        '.article-date',
        '.post-date',
      ];
      for (const sel of metaSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          return el.getAttribute('content')
            ?? el.getAttribute('datetime')
            ?? el.textContent?.trim()
            ?? null;
        }
      }
      return null;
    });
    return dateStr;
  }

  /** Simulate human scrolling behavior */
  private async stealthScroll(page: Page): Promise<void> {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 50);
      });
    });
  }

  /** Random delay to simulate human behavior */
  private async humanDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = minMs + Math.random() * (maxMs - minMs);
    await new Promise((r) => setTimeout(r, delay));
  }

  /** Close the browser instance */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
    }
  }

  get requestCount_(): number {
    return this.requestCount;
  }
}