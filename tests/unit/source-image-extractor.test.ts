/**
 * Unit tests for source-image-extractor.
 */

import { describe, it, expect } from "vitest";
import { extractImages } from "@/lib/reading/source-image-extractor";

describe("extractImages", () => {
  it("prefers og:image as cover", () => {
    const html = `
      <meta property="og:image" content="https://example.com/og.jpg" />
      <meta name="twitter:image" content="https://example.com/tw.jpg" />
      <article><img src="https://example.com/article.jpg" /></article>
    `;
    const result = extractImages(html);
    expect(result.cover).toBe("https://example.com/og.jpg");
  });

  it("falls back to twitter:image when og:image is missing", () => {
    const html = `
      <meta name="twitter:image" content="https://example.com/tw.jpg" />
      <article><img src="https://example.com/article.jpg" /></article>
    `;
    const result = extractImages(html);
    expect(result.cover).toBe("https://example.com/tw.jpg");
  });

  it("falls back to first article img when og and twitter are missing", () => {
    const html = `
      <article>
        <img src="https://example.com/first.jpg" />
        <img src="https://example.com/second.jpg" />
      </article>
    `;
    const result = extractImages(html);
    expect(result.cover).toBe("https://example.com/first.jpg");
  });

  it("returns null cover when no image sources exist", () => {
    const html = `<div>no images here</div>`;
    const result = extractImages(html);
    expect(result.cover).toBeNull();
  });

  it("excludes avatar, icon, pixel, 1x1, and logo from inline images", () => {
    const html = `
      <article class="content">
        <img src="https://example.com/avatar.png" />
        <img src="https://example.com/icon.svg" />
        <img src="https://example.com/pixel.gif" />
        <img src="https://example.com/1x1.png" />
        <img src="https://example.com/logo.jpg" />
        <img src="https://example.com/valid.jpg" />
      </article>
    `;
    const result = extractImages(html);
    expect(result.inline).toEqual(["https://example.com/valid.jpg"]);
  });

  it("deduplicates inline images", () => {
    const html = `
      <article class="content">
        <img src="https://example.com/same.jpg" />
        <img src="https://example.com/same.jpg" />
        <img src="https://example.com/other.jpg" />
      </article>
    `;
    const result = extractImages(html);
    expect(result.inline).toEqual([
      "https://example.com/same.jpg",
      "https://example.com/other.jpg",
    ]);
  });

  it("returns at most 5 inline images", () => {
    const html = `
      <article class="content">
        <img src="https://example.com/1.jpg" />
        <img src="https://example.com/2.jpg" />
        <img src="https://example.com/3.jpg" />
        <img src="https://example.com/4.jpg" />
        <img src="https://example.com/5.jpg" />
        <img src="https://example.com/6.jpg" />
        <img src="https://example.com/7.jpg" />
      </article>
    `;
    const result = extractImages(html);
    expect(result.inline).toHaveLength(5);
    expect(result.inline).toEqual([
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
      "https://example.com/3.jpg",
      "https://example.com/4.jpg",
      "https://example.com/5.jpg",
    ]);
  });

  it("collects inline images from content class div when article is absent", () => {
    const html = `
      <div class="post-content">
        <img src="https://example.com/div-img.jpg" />
      </div>
    `;
    const result = extractImages(html);
    expect(result.inline).toContain("https://example.com/div-img.jpg");
  });

  it("falls back to full html for inline images when no content block matched", () => {
    const html = `
      <div>
        <img src="https://example.com/fallback.jpg" />
      </div>
    `;
    const result = extractImages(html);
    expect(result.inline).toContain("https://example.com/fallback.jpg");
  });

  it("returns empty inline array for empty html", () => {
    const result = extractImages("");
    expect(result.cover).toBeNull();
    expect(result.inline).toEqual([]);
  });

  it("returns empty inline array for html without images", () => {
    const result = extractImages("<p>just text</p>");
    expect(result.cover).toBeNull();
    expect(result.inline).toEqual([]);
  });

  it("does not match og:image when content precedes property", () => {
    // Current regex requires property/name before content; this documents the limitation
    const html = `<meta content="https://example.com/og2.jpg" property="og:image" />`;
    const result = extractImages(html);
    expect(result.cover).toBeNull();
  });

  it("does not match twitter:image when content precedes name", () => {
    // Current regex requires property/name before content; this documents the limitation
    const html = `<meta content="https://example.com/tw2.jpg" name="twitter:image" />`;
    const result = extractImages(html);
    expect(result.cover).toBeNull();
  });
});
