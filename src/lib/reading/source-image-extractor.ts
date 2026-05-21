/**
 * Extracts images from scraped HTML for the reading pipeline.
 *
 * Returns a cover image (og:image first, then first article image) and
 * inline images for paragraph-level illustration mapping.
 *
 * See docs/pipeline-refactor-plan.md §三 for the frozen contract.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedImages {
  cover: string | null;
  inline: string[];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function extractImages(html: string): ExtractedImages {
  // 1. og:image — best cover candidate
  const ogMatch = html.match(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
  );
  const ogImage = ogMatch?.[1] ?? null;

  // 2. twitter:image — fallback cover
  const twMatch = html.match(
    /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i
  );

  // 3. First img inside <article> — second fallback
  const articleImgMatch = html.match(
    /<article[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i
  );

  const cover =
    ogImage ||
    twMatch?.[1] ||
    articleImgMatch?.[1] ||
    null;

  // 4. All images inside the main content area
  const inline: string[] = [];
  const contentBlock =
    html.match(
      /<(?:article|div)[^>]*class="[^"]*(?:content|post|article|entry)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/i
    )?.[1] ?? html;

  const imgRegex = /<img[^>]+src="([^"]+)"/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRegex.exec(contentBlock)) !== null) {
    const url = imgMatch[1];
    // Skip tiny icons, avatars, tracking pixels
    if (
      url.includes("avatar") ||
      url.includes("icon") ||
      url.includes("pixel") ||
      url.includes("1x1") ||
      url.includes("logo")
    ) {
      continue;
    }
    if (!inline.includes(url)) {
      inline.push(url);
    }
  }

  return { cover, inline: inline.slice(0, 15) };
}
