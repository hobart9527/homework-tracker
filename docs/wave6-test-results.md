# Wave 6 Integration Test Results

Date: 2026-05-13

## Test 1: Route A Decision Logic — PASS

Command: `npx tsx -e` direct `decideRoute()` call on dogo topic "emperor_penguins"
- Result: `{"route":"A","expandedGrades":[3,4],"reason":"whitelist:dogo+word-match"}`
- Route A correctly selected (source=dogo, source_text=3037 chars, word count matches G3 standard)

## Test 2: Route C Decision Logic — PASS

- null source_text: `{"route":"C","expandedGrades":[3,6],"reason":"no-source-text"}`
- short source_text (< 50 chars): same result
- non-whitelisted source with good text: `{"route":"C","expandedGrades":[3,4],"reason":"source-not-whitelisted:some-random-site"}`

## Test 3: Grade Expansion — PASS

| Input | Output | Correct? |
|-------|--------|----------|
| EN G3 450 words | [3,4] | Yes (450 >= G4.min*0.85 = 382) |
| EN G3 280 words | [3] | Yes (280 < 382) |
| EN G6 900 words | [6,7,8] | Yes (900 >= both G7.min*0.85 and G8.min*0.85) |
| EN G6 1100 words | [6,7,8] | Yes |
| ZH G3 300 chars | [3,4] | Yes (300 >= G4.min*0.85) |
| ZH G5 600 chars | [5,6] | Yes |

## Test 4: Route A End-to-End Verbatim Copy — PASS

Command: Inline script calling generateReadingContent with route="A" on dogo-emperor_penguins (3037 chars source_text)

| Check | Result |
|-------|--------|
| Route decision | A (whitelist:dogo+word-match) |
| Expanded grades | [3,4] |
| Content match (source vs article) | **PASS — 3037/3037 chars identical** |
| Quality gate | PASS (0 issues) |
| IB criteria | PASS (1 warn: critical-thinking-ratio-warn) |
| Questions generated | 5 |
| Factual gate skipped | Yes (Route A) |

## Test 5: TypeScript Compilation — PASS

26 pre-existing errors (qa-scan-all-articles.ts + test-child-login.ts), 0 new.

## Test 6: Gushiwen scraper — PASS

- 15 poems bundled, 12 new upserted, 3 skipped (already existed)
- dry-run verified correct
- Route decision correct: short poems (<50 chars) get Route C, longer ones with gushiwen source get Route B (word-mismatch: classical text needs B3 adaptation)

## Test 7: Route B Decision Logic — PASS

- 水调歌头 (114 chars, gushiwen, G6 target): Route B with reason "word-mismatch"
- 爱莲说 (144 chars, gushiwen, G6 target): Route B with reason "word-mismatch"
- 陋室铭 (99 chars, gushiwen, G6 target): Route B with reason "word-mismatch"
- Route B correctly triggered for whitelisted classical text that doesn't match grade word count

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | Route A logic (decideRoute) | PASS |
| 2 | Route C logic (decideRoute) | PASS |
| 3 | Grade expansion (expandGrades) | PASS |
| 4 | Route A E2E verbatim copy | **PASS** (0 drift, 5 questions) |
| 5 | TypeScript compilation | PASS (0 new errors) |
| 6 | Gushiwen scraper | PASS (15 poems) |
| 7 | Route B logic (decideRoute) | PASS |
| 8 | refresh-news route wiring | PASS (code verified via grep) |
| 9 | Image pipeline wiring | PASS (code verified via grep) |
