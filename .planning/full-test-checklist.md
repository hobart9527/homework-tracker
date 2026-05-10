# Full-Stack Verification Checklist

> Created: 2026-05-10
> Owner: orchestrator
> Scope: all preconditions to verify every reading-related feature end-to-end (not just unit tests).
> Use alongside `.planning/deployment-checklist.md` (A1-A4 deploy steps).

This document answers: "What do I need to do so the entire codebase can be tested at every level?"

It enumerates 12 verification levels (L1-L12). Higher levels depend on lower ones being green.

---

## TL;DR — what you must do

| Block | Action | Effort |
|-------|--------|--------|
| **B0** | `.env.local` complete (see §0) | 5-15 min, depends on which keys you have |
| **B1** | `npm install` if `node_modules` is stale | < 5 min |
| **B2** | Apply migrations 035-040 (`.planning/deployment-checklist.md` A1-A2) | 5-15 min |
| **B3** | Regen Supabase types (A3) | 1-2 min |
| **B4** | Seed 153 topics (A4) | 1-3 min |
| **B5** | Run reading content pipeline once (a few articles each language) | 5-15 min |
| **B6** | Verify dev server reader page in browser | 10-30 min |

After B0-B6, you can run any of L1-L11 below. B0-B4 are the bare minimum to unblock all DB-dependent features.

---

## §0 — Required environment variables (`.env.local`)

Copy from `.env.example` and fill in real values. Group by what each enables.

### Group A — Always required (L4+)

| Var | Purpose | Source |
|-----|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend → Supabase | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser auth | Same panel, anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin (RPC, RLS bypass) | Same panel, service_role key |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI for `db push` / `gen types` | https://supabase.com/dashboard/account/tokens |
| `PROJECT_ID` | Used by `npm run supabase:generate-types` | `supabase projects list` → reference id |

### Group B — Reading content pipeline (L7)

| Var | Purpose |
|-----|---------|
| `OPENAI_API_KEY` | Article + question generation; doubles as MiniMax key when base URL points to MiniMax |
| `OPENAI_BASE_URL` | Should be `https://api.minimaxi.com/v1` (or compatible) for cover generation |
| `OPENAI_READING_MODEL` | Default `gpt-4o-mini`; pick a model your endpoint serves |
| `MINIMAX_DAILY_QUOTA` | Default 50; soft ceiling for daily MiniMax cover generation |
| `PIPELINE_GRADES` | Default `3,6`; comma-separated grades to generate for |
| `PIPELINE_TOPIC_LIMIT` | Default `0` (unlimited); set `2` or `5` while testing |

### Group C — Read-along audio (L8)

| Var | Purpose |
|-----|---------|
| `AZURE_SPEECH_KEY` | Azure Neural Voice TTS |
| `AZURE_SPEECH_REGION` | Default `eastus` |

### Group D — Cron / API auth (L9)

| Var | Purpose |
|-----|---------|
| `CRON_SECRET` | Header guard for `refresh-news` and other cron endpoints |

### Group E — Telegram / WeChat / Voice push (already working, not changed this batch)

| Var | Purpose |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | Daily summary, instant notifications, weekly digest |
| `PLATFORM_CREDENTIALS_ENCRYPTION_KEY` | ≥ 32 chars; encrypts IXL/Khan/etc. passwords |
| `VOICE_PUSH_BRIDGE_URL` / `VOICE_PUSH_BRIDGE_TOKEN` | WeChat voice push bridge |
| `ILINK_API_BASE_URL` / `ILINK_CDN_BASE_URL` | iLink WeChat bridge |

If you only care about reading features, you can skip Group E.

---

## L1 — Unit tests (vitest)

**Status**: ✅ 469 / 469 (verified 2026-05-10).

**Prerequisites**: `node_modules`.

**Command**:
```bash
cd /Users/Shared/projects/homework-tracker
npx vitest run
```

**Expected**: `Test Files  70 passed (70)` and `Tests  469 passed (469)`.

**External dependencies**: none (all mocks).

**You don't need to do anything for this level.**

---

## L2 — TypeScript compile

**Status**: ✅ 0 errors (verified 2026-05-10).

**Command**:
```bash
npx tsc --noEmit
```

**Expected**: empty output / exit 0.

**External dependencies**: none.

---

## L3 — Next.js production build

**Status**: passed in prior session; not re-run this session (no route layer changes after).

**Command**:
```bash
npm run build
```

**Expected**: ends with `Route (app)` table listing all routes incl. `(reader)/reading/[id]`, `/api/reading/news/...`, `/api/reading/stats/dashboard`.

**External dependencies**: none (build is offline; routes registered statically).

**Recommendation**: run once to confirm all new routes still register cleanly.

---

## L4 — Supabase migration apply

**Status**: NOT verified (W6-T1 was blocked on this).

**Prerequisites**: §0 Group A.

**Command** (full sequence in `.planning/deployment-checklist.md` A1-A2):
```bash
supabase db push --dry-run
npm run supabase:migrate
supabase migration list
```

**Expected**: migration list shows 035-040 all marked applied (✓ in remote column).

**External dependencies**: Supabase project reachable, access token valid.

**You must do this — it unblocks L5-L11.**

---

## L5 — Supabase TypeScript types regenerate

**Status**: NOT done (still on schema before 038-040).

**Prerequisites**: L4 + `PROJECT_ID` exported.

**Command**:
```bash
export PROJECT_ID=<reference-id-from-supabase-projects-list>
npm run supabase:generate-types
git diff --stat src/lib/supabase/types.ts
```

**Expected**: types file diff shows additions for `topic_packs`, `reading_audios` bucket types, `reading_level_en/zh`, `audio_zh_url/alignment`, `pack_id/pack_order`.

**Sanity check**:
```bash
grep -E "topic_packs|reading_audios|reading_level_en" src/lib/supabase/types.ts | head
```

**You must do this — without it the new feature code may compile against stale types and silently miscast at runtime.**

---

## L6 — Topic seed (153 topics + ~30 packs)

**Status**: NOT seeded.

**Prerequisites**: L4 + L5.

**Command**:
```bash
npx tsx scripts/seed-topic-matrix-v2.ts --dry-run
npx tsx scripts/seed-topic-matrix-v2.ts --execute
```

**Expected dry-run**: prints summary like `Would upsert 30 packs / 153 topics`.

**Expected execute**: ends with `Seed complete: 30 packs, 153 topics.` (or similar; exact wording depends on script implementation).

**Verify**:
```bash
psql "$DATABASE_URL" -c "select count(*) from topic_packs;"          # ~30
psql "$DATABASE_URL" -c "select count(*) from reading_topics;"       # ≥ 153
psql "$DATABASE_URL" -c "select language, count(*) from reading_topics group by language;"
```

If `psql` not handy, use the Supabase dashboard SQL editor.

**You must do this — without it the recommendation engine has nothing to recommend.**

---

## L7 — Reading content pipeline (real run)

**Status**: NEVER end-to-end run with new schema.

**Prerequisites**: L4 + L5 + L6 + §0 Group B + network to image.pollinations.ai.

**Command** (start tiny):
```bash
# English pipeline — generates ~2 articles per grade
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=2 \
  npx tsx scripts/reading-content-pipeline.ts

# Chinese pipeline — same
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=2 \
  npx tsx scripts/seed-chinese-reading-content.ts
```

**Expected**:
- For each topic, log line indicates: article generated → cover generated (minimax / pollinations) → illustrations generated (pollinations) → quality gate verdict (published / draft) → DB upsert
- Pollinations 429 retries should be visible in logs (e.g. `retry 1/3 after Xms`)

**Verify in DB**:
```sql
select id, title, language, status, cover_image_url, cover_source
  from reading_articles
  order by created_at desc limit 10;

select count(*) from reading_article_illustrations;
```

**Verify in Supabase Storage** (dashboard): `reading-media` bucket has `covers/<articleId>.webp` and `illustrations/<articleId>/<paragraphIndex>.webp` files.

**External dependencies**:
- OpenAI / MiniMax endpoint (article + cover)
- Pollinations (illustration; cover fallback)
- Supabase Storage (image persistence)

**You must do this** if you want to verify the entire content pipeline. Generating 4 articles takes 2-5 minutes and 4 minimax quota slots (out of 50/day).

---

## L8 — Read-along audio pipeline

**Status**: NEVER run.

**Prerequisites**: L7 + §0 Group C.

**Command**:
```bash
npx tsx scripts/synthesize-chinese-audio.ts --help     # check actual CLI flags
# typical:
npx tsx scripts/synthesize-chinese-audio.ts --grade 3 --topic-key story-shouzhudaitu
```

**Expected**:
- Azure TTS call returns audio bytes
- Upload to Supabase Storage `reading-audios` bucket
- DB row updated: `audio_zh_url`, `audio_zh_alignment`, `audio_zh_voice` populated for that article

**Verify**:
```sql
select id, title, audio_zh_url, audio_zh_voice
  from reading_articles
  where audio_zh_url is not null
  order by created_at desc limit 5;
```

In browser: open `/reading/<id>` for that article → confirm `<ReadAlong>` plays audio with synchronized character highlight.

**External dependencies**: Azure Speech Service.

**You must do this** if you want to verify Chinese read-along. Without `AZURE_SPEECH_KEY` this level fails at the first call.

---

## L9 — Parent-fed news pipeline

**Status**: NEVER run end-to-end.

**Prerequisites**:
- L4-L7
- A parent account exists (existing auth)
- Dev server running

**Steps**:
1. `npm run dev`
2. Login as a parent
3. Navigate to `/settings/reading-news` (under parent group)
4. Submit 1-2 news URLs (real article URLs from a kid-safe source)
5. Wait for LLM rewrite
6. Verify `reading_articles` has new rows with `freshness_until` set
7. Test the archiver: `npx tsx scripts/archive-stale-news.ts`
   - Verify it skips fresh items, archives expired ones (`status='archived'`)

**External dependencies**: OpenAI (rewrite) + DB.

**You must do this** if you want to verify parent intake. Optional if you don't plan to use the URL submission flow.

---

## L10 — Recommendation v2 + auto-leveling

**Status**: unit-tested; end-to-end NOT verified.

**Prerequisites**:
- L4-L7 (need ≥ 15 published articles per language for stable recommendations)
- ≥ 1 child with `reading_level_en/zh` and `category_priorities` set
- (For auto-leveling) ≥ 15 `reading_quiz_attempts` rows for that child with sustained accuracy

**Manual API tests**:
```bash
# Recommendation
curl "http://localhost:3000/api/reading/recommend?childId=<id>" | jq

# Stats dashboard
curl "http://localhost:3000/api/reading/stats/dashboard?childId=<id>" | jq
```

**Expected**:
- Recommend route returns ranked list keyed by category and level
- Dashboard route returns: current `reading_level_en/zh`, accuracy trend, category coverage, recent articles

**Auto-leveling trigger** (manual scenario):
- Construct quiz_attempts: 15 attempts at current level, 3 consecutive ≥ 80% → `reading_level_en` should bump up after the 3rd
- Reverse: 2 consecutive < 60% → bumps down

**External dependencies**: DB only (no external services).

**You must do this** if you want to verify the recommendation backend behavior. Skipping = unit tests still cover the algorithm but you won't catch DB-shape issues.

---

## L11 — Reader UI live (dev server, browser)

**Status**: build passes; live verification NOT done this session.

**Prerequisites**:
- L4-L7 (so reader has real articles to render)
- L8 (optional, only if you want to test read-along)
- Auth works (existing parent + child accounts)
- `npm run dev` running

**Manual checklist** (open `/reading/<articleId>` after logging in as a child):
- [ ] 3-pane layout on ≥ 1024px wide; rails collapse on < 1024px
- [ ] Theme switcher: light / sepia / dark — instant
- [ ] Settings panel opens, font size + line height adjust live
- [ ] No bottom nav visible (reader-shell active)
- [ ] Pinyin renders above Chinese characters (rt tag)
- [ ] Cover and illustrations load from Supabase Storage
- [ ] Scroll progress bar fills as you scroll
- [ ] Reload mid-article → returns to last-read paragraph
- [ ] Reach end of article → completion stamp animation triggers
- [ ] If `audio_zh_url` set: ReadAlong plays + highlights characters
- [ ] `prefers-reduced-motion` (system setting) disables stamp animation

**Browser check tools**: Chrome / Safari / iPad Safari simulator.

**External dependencies**: Supabase (auth + DB), Supabase Storage (media).

**You must do this** for any UX-related sign-off; unit tests cannot cover layout / theme / animation correctness.

---

## L12 — Existing learning-platform sync (not changed this batch)

**Status**: refresh-sessions workflow verified in earlier sessions.

**Prerequisites**:
- §0 Group A + Group E
- IXL / Khan / Epic / Raz-Kids platform credentials per child
- Bound `platform_accounts` row with `status='active'`

**Commands**:
```bash
npm run sync:khan
npm run sync:ixl
npm run test:auto-login
```

**External dependencies**: each learning platform's web flow (Playwright-driven).

**Skip this** unless you specifically want to re-validate that area.

---

## What "full-stack tested" looks like (recommended order)

```
L1 vitest (already green)
└─ L2 tsc (already green)
   └─ L3 next build (run once)
      └─ L4 supabase db push   ← USER ACTION
         └─ L5 supabase gen types ← USER ACTION
            └─ L6 seed topics ← USER ACTION
               └─ L7 content pipeline (small batch) ← USER ACTION
                  ├─ L8 audio pipeline (optional) ← USER ACTION
                  ├─ L9 parent news (optional) ← USER ACTION
                  ├─ L10 recommendation API ← USER ACTION
                  └─ L11 reader UI in browser ← USER ACTION

L12 platform sync — independent, run only if you want to re-verify it.
```

If you only have time for the **critical reading path**: L1-L7 + L11. That covers content generation + persistence + display.

If you need read-along: add L8.

---

## Risk register

| ID | Risk | Mitigation |
|----|------|------------|
| F1 | `.env.local` missing one of Group A keys → L4-L11 all fail at first DB call | §0 dump format makes it easy to diff against `.env.example` |
| F2 | `PROJECT_ID` not exported → L5 silently writes empty `types.ts` | L5 sanity grep catches this |
| F3 | MiniMax endpoint returns format the new code doesn't parse | reading-pipeline-findings.md §MiniMax response format already covers `data.image_urls[0]` / `data[0].url` dual-fallback |
| F4 | Pollinations heavy 429 even with retry → L7 illustrations sparse | Retry is best-effort. If real failure rate stays > 50% after the new retry layer, escalate as a separate root-cause investigation (provider status, prompt size, image dimensions). Do NOT stack additional fallback providers without architectural review — that path leads to ad-hoc shims. |
| F5 | Azure Speech rate-limited or region down → L8 partial | `synthesize-chinese-audio.ts` should retry / skip; check script for behavior |
| F6 | Auth flow blocks L9-L11 (e.g., RLS misconfigured) | run `supabase migration list` in L4; check policies for `reading_articles`, `children` tables |
| F7 | Dev server port conflict (3000) | start on alternate: `PORT=3001 npm run dev` |
| F8 | iPad-specific layout issues hidden in desktop browser | Use Chrome iPad Pro simulator (Settings → Toggle device toolbar); or test on real iPad |

---

## Quick "smoke test" sequence (15-20 min)

After §0 + B0-B4 done:

```bash
cd /Users/Shared/projects/homework-tracker

# L1+L2+L3
npx vitest run                         # 469/469
npx tsc --noEmit                       # 0
npm run build                          # all routes

# L7 (tiny)
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=1 \
  npx tsx scripts/reading-content-pipeline.ts
PIPELINE_GRADES="3,6" PIPELINE_TOPIC_LIMIT=1 \
  npx tsx scripts/seed-chinese-reading-content.ts

# L11
npm run dev
# → browser: login child → open one article → click around → confirm checklist
```

If all pass, the reading pipeline is verified end-to-end at minimum coverage.

---

## When to update this document

- Adding new env var → update §0 group
- Adding new pipeline / module → add new L# section
- Found a runtime issue not caught by unit tests → add to risk register
