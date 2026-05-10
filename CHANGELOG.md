# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Reading module: per-child recommendation v2 + auto-leveling + stats dashboard.
  Recommendation scoring now combines `reading_level_en` / `reading_level_zh`,
  `category_priorities`, `interest_signal`, and recency. Auto level-up triggers
  after 15+ articles with sustained ≥80% accuracy; auto level-down triggers on
  2 consecutive articles below 60%. A per-child stats dashboard route surfaces
  level progression, accuracy, and category coverage. (b8c0057)
- Reading module: parent-fed news pipeline. Parents submit news URLs (1-2/week)
  from the `Settings → Reading News` page; an LLM rewrites each article into
  per-grade child-friendly versions. New API routes power the parent intake
  flow, and `scripts/archive-stale-news.ts` retires entries past
  `freshness_until`. (61ba307)
- Reading module: Chinese read-along audio. Adds an Azure Neural Voice TTS
  client (`zh-CN-XiaoxiaoNeural` / `zh-CN-YunxiNeural`) that produces mp3
  output plus character-level alignment timestamps, an uploader that persists
  to the Supabase Storage `reading-audios` bucket, and a `<ReadAlong>`
  component that highlights characters in sync with playback. The
  `scripts/synthesize-chinese-audio.ts` batch script regenerates audio for
  published Chinese reading articles and supports `--grade` and `--topic-key`
  filters. (a7c0854)
- Design system: unified token palette (forest/cream/coral/honey/ink), Inter + LXGW WenKai + Fraunces font trio, consistent radius/shadow/spacing/motion tokens. All components migrated off ad-hoc hex values. (Design Overhaul)
- iPad layout: parent sidebar nav + 12-col dashboard, child hero + grid, expanded max-width, responsive breakpoints at 1024px/834px. (Design Overhaul)
- Reader mode: independent `(reader)` route group, 3 themes (light/sepia/dark), reader settings (font size/line height/theme), scroll progress + position memory, completion stamp animation. (Design Overhaul)

- Reading module: topic matrix v2 schema + 153-topic seed. Adds the
  `topic_packs` table; extends `reading_topics` with `pack_id` /
  `pack_order` / `recommended_levels` / `category_v2` / `freshness_until` /
  `age_min_level` / `content_warnings`; extends `children` with
  `reading_level_en` / `reading_level_zh` / `audio_zh_enabled` /
  `pinyin_enabled` / `category_priorities` / `interest_signal`; extends
  `reading_articles` with `audio_zh_url` / `audio_zh_alignment` /
  `audio_zh_voice` / `content_warnings` and a recommend-pool index. The
  `scripts/seed-topic-matrix-v2.ts` seed covers 18 categories / 153 topics
  across the China-history triplet, humanities, biography, science/tech, and
  real-world domains, with idempotent upsert behind `--execute`. (1382a68)

### Changed

- Reading module: drift tools + content-generator integration tweaks.
  `detect-article-drift.ts` flags articles with quality issues (out-of-band
  difficulty, mismatched pinyin, etc.); `regenerate-flagged-articles.ts`
  re-runs the pipeline for flagged rows. `content-generator.ts` now accepts
  `recommended_levels` arrays per the topic-matrix-v2 contract. The quiz
  submit flow and reader page integrate read-along audio plus the per-child
  dashboard. `.env.example` documents the new Azure TTS / topic-matrix env
  vars. (b378c84)

### Fixed

- Reading module: retry Pollinations with exponential backoff in cover &
  illustration generators. `cover-generator` and `illustration-generator`
  wrap `downloadAndUploadFromUrl` with `retryWithBackoff` (`maxAttempts=4`,
  `baseDelayMs=500`, `maxDelayMs=8000`, `jitterRatio=0.5`). Retries cover
  `429` / `5xx` / network / timeout; other `4xx` fail fast. The MiniMax path
  is untouched. Resolves the ~40% cover and ~90% illustration failure rate
  from Pollinations 429s. Six new tests cover retry-then-succeed,
  exhaustion-throws, and 4xx-immediate behavior; helpers are inlined per file
  (no cross-import) per the frozen contract. (c31a64a)

## [Design Overhaul] - 2026-05-08 to 2026-05-09

This non-semver milestone captures the Stage 1 → Stage 3 visual and
interaction overhaul completed prior to `c31a64a`. Detailed specs live in
[`.planning/design-system.md`](./.planning/design-system.md) and
[`.planning/task_plan.md`](./.planning/task_plan.md).

### Stage 1 — Token system & visual foundation

- Established the unified token palette (`forest` / `cream` / `coral` /
  `honey` / `ink`) and the Inter / LXGW WenKai / Fraunces font trio.
- Migrated existing surfaces off ad-hoc spacing, radius, shadow, and motion
  values onto the new tokens.

### Stage 2 — iPad layout restructure

- Restructured parent surfaces into a side-nav + main-pane shell and child
  surfaces into a hero + daily-tasks shell, both designed iPad-first across
  landscape and portrait.
- Introduced the magazine-style entry surfaces (`MagazineCard`,
  `CategoryTrack`) and the share/vocabulary side modules (`ShareCard`,
  `VocabularyCollection`, `ReadingTitleBadge`).

### Stage 3 — Reading mode independent module

- Promoted the reading experience to an independent route group `(reader)`
  with 3 themes (`light` / `sepia` / `dark`), a settings panel, and the
  reader-specific animation set.
- Added the reader chrome: `BottomReaderToolbar`, `PageCurlView`,
  `GestureOverlay`, `ArticleReader` redesign with language inference, and
  the auto theme.
- Polished the quiz surface (`QuizView` circular progress, liquid-fill, and
  streak), resolved theme type mismatch, SVG icons, grab handles, and a
  flaky test.

Approximate commit range covering this milestone: prior to `c31a64a`,
spanning `f0e22ee` → `203e073` on `main`.
