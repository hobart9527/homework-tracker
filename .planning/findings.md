# Homework Tracker Design Audit — Findings

Created: 2026-05-08
Status: Pre-Stage 1 audit findings. Codified from codebase read-through.

---

## 1. Current Design Language Inventory

### 1.1 Color Usage Matrix

The current codebase uses color in the following pattern:

| Element | Color Used | Frequency | Notes |
|---|---|---|---|
| Page background | `#F8FFF8` / `bg-background` / `bg-[#F6FBF8]` | Very High | Inconsistent alias — 3 different hexes for "almost green-white" |
| Card background | `bg-white` + `bg-white/80` + `bg-white/90` | Very High | Opacity variants lack design intent — just copy-pasted |
| Card border/ring | `ring-1 ring-forest-100` / `border-forest-100` | Very High | Same ring on everything |
| Primary CTA | `bg-primary` | High | `#56AB91`, fine |
| Accent (danger/urgent) | `#FF6B6B` | Medium | Coral shift needed — currently reads medical/alert |
| Hero / highlight | `amber-50 → orange-50` gradient | Low | Only in reading recommended hero + priority card — good pattern, should be systematized |
| Category chips | sky/amber/indigo/rose/emerald/purple | Medium | Scattered in `ArticleCard.tsx`, not a real system |
| Skeleton bg | `bg-gray-200` / `bg-forest-100` / `bg-forest-50` | Medium | Inconsistent between components |
| Status colors | emerald (done), rose (overdue), sky (in-progress), amber (makeup) | Medium | Actually fairly consistent, could be formalized as semantic tokens |

### 1.2 Radius Usage

| Value | Found In | Count |
|---|---|---|
| `rounded-sm` | Chips, tags | Few |
| `rounded-lg` | Child login confirm buttons, small elements | Medium |
| `rounded-xl` | Cards, modals | Many |
| `rounded-2xl` | `Card.tsx`, various cards | Many |
| `rounded-3xl` | `ParentMonthCalendar`, `ParentDayDetailPanel` | Medium |
| `rounded-[32px]` | Child landing page section | 1 |
| `rounded-card` (1.75rem/28px) | `ChildWeekSummaryCard`, `DayHomeworkView` | Medium |
| `rounded-full` | Avatar, buttons, tags | Many |

**Verdict**: No consistent hierarchy. A card in parent dashboard (`rounded-3xl`) looks like a page section in child (`rounded-[32px]`), which looks like a big card (`rounded-card`).

### 1.3 Shadow Usage

| Value | Found In | Usage |
|---|---|---|
| `shadow-sm` | Card (default), WeekCalendar | Default for all cards |
| `shadow-md` | PriorityHomeworkCard, DayHomeworkView | Slightly elevated |
| `shadow-lg` | Child landing section | Overused for a section wrapper |
| `shadow-xl` | Not found | — |
| `shadow-[...custom]` | Empty states with glow | Ad-hoc |

**Verdict**: Shadow alone cannot communicate hierarchy because it is paired inconsistently with border-radius and ring.

### 1.4 Typography

| Issue | Evidence | Impact |
|---|---|---|
| Single font stack | Nunito + PingFang SC everywhere | Reading text and UI text share identical treatment |
| Line height inconsistent | `leading-[2.0]` vs `leading-[2.2]` vs `leading-[2.5]` in reader | No systematic scale |
| No display font | Titles use same font as body | Weak hierarchy in hero sections |
| Text sizes ad-hoc | `text-2xl` in one place, `text-3xl` in another for same semantic role | Parent dashboard heading `text-xl`, Child header `text-xl`, reading page `text-2xl` — "page title" is not standardized |
| Uppercase tracking abuse | `tracking-[0.18em]`, `tracking-[0.2em]` in metric cards | Fine for parent dashboard, but this style leaks into child-facing components via copy-paste |

---

## 2. Architecture Findings

### 2.1 Component Layer Inconsistency

The `src/components/ui/` folder currently has:
- `Button.tsx` — primitive, clean
- `Card.tsx` — primitive but over-simple (no skin concept)
- `Modal.tsx` — modal wrapper
- `Input.tsx`, `PasscodeInput.tsx` — form primitives
- `AudioPlayer.tsx` — domain-specific, not a primitive
- `icons.tsx` — inline SVG icons

**Problem**: No intermediate "layout primitives" layer. Every page invents its own card styling:
- `DayHomeworkView` → `rounded-card bg-white p-5 shadow-md ring-1 ring-forest-100`
- `ChildWeekSummaryCard` → `rounded-card bg-white p-5 shadow-md ring-1 ring-forest-100`
- `PriorityHomeworkCard` → `rounded-card bg-gradient-to-r ... p-5 shadow-md ring-1`

All three are "section cards" but each opens codes its own surface treatment. This is why the app feels "samey everywhere" — not because there are too few styles, but because the same style is repeated without hierarchy.

### 2.2 Layout Primitives Missing

No shared concept of:
- `PageShell` (page background + nav + max-width)
- `PageHeader` (kicker + title + actions)
- `SectionCard` (surface + elevation + radius + padding in one)
- `MetricBlock` (label + value + trend)
- `EmptyState` (icon + title + subtitle + CTA)

Each page implements its own skeleton/empty/error states with varying quality. `ChildLandingPage` has elaborate skeletons (good), `ReadingBrowserPage` has simpler ones, parent dashboard has its own.

### 2.3 Reading Mode is "Page-Level Inline", Not "Module"

The reading experience spans:
- `src/app/(child)/reading/page.tsx` — list/grid browser
- `src/app/(child)/reading/[id]/page.tsx` — article + quiz
- `src/components/reading/ArticleReader.tsx` — core reader
- `src/components/reading/QuizView.tsx` — quiz
- `src/components/reading/ArticleCard.tsx` — card
- `src/components/reading/LevelProgressBar.tsx`, `LevelUpModal.tsx` — gamification

**Key finding**: The `[id]/page.tsx` wraps `ArticleReader` inside the standard child layout (`(child)/layout.tsx`), which means the bottom nav bar is always visible during reading. This is the #1 distraction in the reading experience on iPad.

Also, `ArticleReader.tsx` is 417 lines and mixes:
- TTS logic
- Sentence splitting + highlighting
- Pinyin rendering
- Word lookup API call
- Theme-unaware content rendering
- Bottom sticky CTA logic

**This should be split into**: `ReaderShell` (layout) + `ReaderContent` (text rendering) + `ReaderToolbar` (side controls) + `ReaderDictionary` (lookup panel) + `ReaderProgress` (progress indicator).

### 2.4 iPad Layout Gaps

| Page | Current max-width | iPad Pro 12.9" (1366w) Gap | Issue |
|---|---|---|---|
| Parent dashboard | `max-w-6xl` (~1152px) | ~107px each side | Wasted space, could use sidebar |
| Child today | `max-w-[1480px]` | OK-ish on landscape | But layout is `360px + 1fr`, which on 1366w gives 1006px right column — too wide for single-column task list |
| Reading list | `max-w-6xl` | ~107px each side | Centered but small; could be wider grid |
| Reading article | `max-w-2xl` (~672px) | ~347px each side | **Extreme waste on iPad landscape** |

**iPad portrait (834w)**: Most pages work OK because Tailwind `sm:` breakpoint is 640px. But parent dashboard 2-col `xl:grid-cols-[1fr_380px]` collapses to single column below 1280px, which means on iPad portrait (834w) parent dashboard is fully single column and very long.

---

## 3. Token Migration Risk Points

### 3.1 High-Risk Files (many color/shadow/radius usages)

1. `src/app/(child)/page.tsx` — 200+ lines, many inline styles, skeleton states with ad-hoc classes
2. `src/components/reading/ArticleReader.tsx` — complex, many conditional styles, TTS state coupled with rendering
3. `src/app/(parent)/dashboard/page.tsx` — 470+ lines, skeleton states, child component composition
4. `src/components/child/WeekCalendar.tsx` — SVG ring rendering with hardcoded colors, dynamic ring color logic
5. `src/components/parent/ParentMonthCalendar.tsx` — conic-gradient completion ring, hardcoded color mapping
6. `src/components/child/ChildHomeworkCard.tsx` — border/color state logic (completed/overdue)
7. `src/app/(child)/reading/page.tsx` — hero gradient, category chips

### 3.2 Medium-Risk Files

8. `src/components/parent/ParentDayDetailPanel.tsx` — metric cards, but structure is clean
9. `src/components/parent/ChildSummaryCard.tsx` — selected/unselected states
10. `src/components/child/PriorityHomeworkCard.tsx` — gradient hero card
11. `src/components/ui/Button.tsx` — needs variant expansion (outline, reading variants)
12. `src/components/ui/Card.tsx` — complete rewrite to TokenizedCard
13. `src/components/child/StatCard.tsx` — simple, easy migration

### 3.3 Low-Risk Files

14. `src/app/(auth)/login/page.tsx` — single page, straightforward
15. `src/app/child-login/page.tsx` — single page
16. Settings pages — lower traffic, can be done in later wave

---

## 4. Technical Notes

### 4.1 Font Loading Strategy

LXGW WenKai (霞鹜文楷) is available on:
- CDN: `https://cdn.jsdelivr.net/npm/lxgwwenkai-webfont@latest/style.css`
- npm: `lxgwwenkai-webfont` package
- Self-hosted: subset for faster loading

Fraunces is on Google Fonts: `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap`

**Recommendation**: Use Google Fonts for Fraunces + Inter, and npm package for LXGW WenKai for self-hosting. Reader font should load lazily (only when entering reading mode).

### 4.2 Theme Switching Strategy

Reader themes (light/sepia/dark) should use:
1. CSS custom properties on a container element (not `document.documentElement` to avoid polluting global scope)
2. `data-reader-theme` attribute on the reader root
3. `localStorage` persistence with versioned key `reader-settings-v2`
4. No FOUC: read localStorage in a blocking script tag before React hydration, or accept a brief flash (acceptable for reader mode)

### 4.3 Scroll Position Memory

For reading position across sessions:
- Store `articleId` → `{ scrollY: number, paragraphIndex: number, timestamp: string }`
- On load: if position exists and article hasn't changed, scroll to stored position
- Use `IntersectionObserver` on paragraph elements for robust paragraph-based tracking (more resilient than pixel scrollY across font size changes)
- Clear positions older than 30 days

### 4.4 IntersectionObserver for Reading Progress

```
- Each paragraph gets a data-paragraph-index
- IO tracks which paragraphs have been "read" (visible for >2 seconds)
- Progress bar = max(visible paragraphs) / total paragraphs
- When user leaves: store the last "read" paragraph index
```

This is more robust than scroll-based percentage because it accounts for user actually seeing the content.

### 4.5 Side Toolbar on iPad

ReaderShell 三栏布局：
- **Left rail** (min 200px, max 260px): TOC / 当前章节 / 段落导航
- **Center** (flex-1, max 720px): 正文
- **Right rail** (min 200px, max 260px): 工具栏 (朗读/拼音/字号/行距/主题/词典/收藏)

On iPad portrait (< 1024px): collapse both rails into floating bottom toolbars or top app bar.
On iPad landscape (≥ 1024px): show both rails.
On desktop (≥ 1440px): same as iPad landscape.

---

## 5. Open Questions (Pre-Implementation)

1. **家长 sidebar nav 内容**: 当前 parent 只有 dashboard, homework, children, settings 4 项。sidebar 是否需要嵌套分组？
2. **Reading 目录结构**: 当前文章没有 formal "章节" 概念，只有一整篇文章。TOC 是：
   - (a) 按段落自动分段生成 mini TOC？
   - (b) 等后续文章增加 chapter 字段后再做？
3. **字体授权**: LXGW WenKai 是 SIL Open Font License 1.1，可以商业使用 + 可以嵌入 web。确认部署方式。
4. **Dark mode for non-reader pages**: P0 是否只在 reader 内做 dark mode？还是 parent/child 页面也做？
   - 建议：P0 只做 reader dark mode。parent/child 保持 light（ forest-50 / cream-50 背景已足够柔和）。
5. **图片处理**: 阅读器中的 cover images 是否需要根据主题调整？（暗色模式下图片可能需要亮度调节）
   - 建议：暗色主题下给图片加 `brightness(0.85)` filter。

---

## 6. Token Audit Report — Wave 1.3a

**Audit date**: 2026-05-08
**Auditor**: wave-1.3a (read-only)
**Scope**: All files migrated in Waves 1.0–1.2
**Status**: COMPLETE — issues found

### 6.0 Critical Finding: Tailwind Config Missing Design System Tokens

**Severity**: P0 — Blocks all token-based styling

The current `tailwind.config.ts` only defines the **legacy** color palette (`primary`, `accent`, `background`, `forest-*`). It does **not** define any of the design-system.md v2 tokens:

| Missing Token Category | Examples | Impact |
|---|---|---|
| `ink-*` colors | `ink-100`, `ink-200`, `ink-400`, `ink-500`, `ink-600`, `ink-700` | 60+ class usages in codebase compile to nothing |
| `cream-*` colors | `cream-50`, `cream-100`, `cream-200`, `cream-200/40` | 40+ class usages compile to nothing |
| `coral-*` colors | `coral-50`, `coral-400` | 5+ class usages compile to nothing |
| `honey-*` colors | `honey-50`, `honey-100`, `honey-200`, `honey-400` | 20+ class usages compile to nothing |
| `radius-*` tokens | `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`, `radius-2xl` | 30+ class usages compile to nothing |
| `elevation-*` shadows | `shadow-elevation-raised`, `shadow-elevation-floating`, `shadow-elevation-modal` | 60+ class usages compile to nothing |

**Current tailwind.config.ts colors defined**:
```
primary (DEFAULT=#56AB91, light=#A8E6CF, dark=#3D8B76)
accent = #FF6B6B
background = #F8FFF8
forest-50..forest-900
```

**Conclusion**: The design system spec exists in `.planning/design-system.md` but has **not been wired into Tailwind**. All code using the new tokens will silently fail at build time (classes will be purged). This must be fixed in a dedicated config Wave before any token migration can be considered complete.

---

### 6.1 Hex Color Literals (`#`)

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/reading/[id]/page.tsx` | 106 | `bg-gradient-to-br from-[#F6FBF8] via-[#FFF9F1] to-[#F5F8FF]` | Ad-hoc gradient with hex literals | P1 |
| 2 | `src/app/(child)/reading/[id]/page.tsx` | 138 | Same gradient | Same | P1 |
| 3 | `src/app/(child)/reading/[id]/page.tsx` | 159 | Same gradient | Same | P1 |
| 4 | `src/app/(child)/progress/page.tsx` | 211 | Same gradient | Same | P1 |
| 5 | `src/app/(child)/progress/page.tsx` | 236 | Same gradient | Same | P1 |
| 6 | `src/app/(child)/progress/page.tsx` | 250 | Same gradient | Same | P1 |
| 7 | `src/app/(child)/progress/page.tsx` | 252 | `bg-[linear-gradient(135deg,#155E52_0%,#2C7C68_48%,#F6B06A_100%)]` | Complex inline gradient with 3 hex colors | P1 |
| 8 | `src/styles/globals.css` | 8 | `--color-primary: #56AB91;` | CSS variable in :root (acceptable — global theme var) | P2 |
| 9 | `src/styles/globals.css` | 9 | `--color-primary-light: #A8E6CF;` | Same | P2 |
| 10 | `src/styles/globals.css` | 10 | `--color-accent: #FF6B6B;` | Same | P2 |
| 11 | `src/styles/globals.css` | 11 | `--color-background: #F8FFF8;` | Same | P2 |
| 12 | `src/styles/globals.css` | 25 | `background: #f1f1f1;` | Scrollbar track — acceptable as browser chrome | P2 |
| 13 | `src/styles/globals.css` | 30 | `background: #56AB91;` | Scrollbar thumb — acceptable as browser chrome | P2 |

**Note**: `tailwind.config.ts` also contains hex literals in the `colors` section, but these are the canonical source-of-truth definitions and are acceptable.

---

### 6.2 Arbitrary Value Patterns (`bg-[` / `text-[` / `border-[` / `ring-[`)

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/progress/page.tsx` | 252 | `bg-[linear-gradient(135deg,#155E52_0%,#2C7C68_48%,#F6B06A_100%)]` | Complex arbitrary gradient | P1 |

**Clean**: No other `bg-[`, `border-[`, or `ring-[` arbitrary values found.

**Note**: `text-[10px]`, `text-[11px]`, `text-[8px]` found in multiple files. These are font-size arbitrary values, not color tokens. Per design-system.md §6, the type scale uses standard Tailwind sizes. These arbitrary font sizes should eventually be migrated to the token scale, but they are not ad-hoc color/shadow violations.

---

### 6.3 Shadow Classes Outside UI Primitives

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/progress/page.tsx` | 66 | `shadow-sm` | Used in tab button class string | P1 |
| 2 | `src/app/(child)/progress/page.tsx` | 214 | `shadow-lg` | Empty state card | P1 |
| 3 | `src/app/(child)/progress/page.tsx` | 237 | `shadow-lg` | Loading state card | P1 |
| 4 | `src/app/(child)/progress/page.tsx` | 252 | `shadow-xl` | Hero section gradient | P1 |
| 5 | `src/app/(child)/progress/page.tsx` | 288 | `shadow-sm` | Stats card | P1 |
| 6 | `src/app/(child)/progress/page.tsx` | 345 | `shadow-sm` | Calendar day card | P1 |
| 7 | `src/app/(child)/progress/page.tsx` | 368 | `shadow-sm` | Section card | P1 |
| 8 | `src/app/(child)/progress/page.tsx` | 378 | `shadow-sm` | Section card | P1 |
| 9 | `src/app/(child)/progress/page.tsx` | 408 | `shadow-sm` | Section card | P1 |
| 10 | `src/app/(child)/progress/page.tsx` | 457 | `shadow-sm` | Section card | P1 |
| 11 | `src/app/(child)/reading/[id]/page.tsx` | 122 | `shadow-sm` | Error state card | P1 |
| 12 | `src/app/(child)/rewards/page.tsx` | 108 | `shadow-lg` | Rewards hero | P1 |
| 13 | `src/app/(child)/rewards/page.tsx` | 135 | `shadow-md` | Reward card | P1 |
| 14 | `src/app/(child)/rewards/page.tsx` | 152 | `shadow-md` | Reward card | P1 |
| 15 | `src/app/(child)/rewards/page.tsx` | 158 | `shadow-md` | Reward card | P1 |
| 16 | `src/app/(child)/rewards/page.tsx` | 178 | `shadow-md` | Reward card | P1 |
| 17 | `src/components/parent/ParentMonthlyStats.tsx` | 23 | `shadow-sm` | Stats panel | P1 |
| 18 | `src/components/parent/ParentChildSummaryPanel.tsx` | 17 | `shadow-sm` | Summary panel | P1 |

**Total**: 18 occurrences across 5 files.

**UI Primitives excluded** (these are allowed as they are the source definitions):
- `src/components/ui/SectionCard.tsx` — uses `shadow-elevation-*` (but these tokens don't exist in config either)

---

### 6.4 `rounded-card` / `rounded-[` Arbitrary Values

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/progress/page.tsx` | 214 | `rounded-[32px]` | Should be `rounded-2xl` (per design-system.md §5) | P1 |
| 2 | `src/app/(child)/progress/page.tsx` | 237 | `rounded-[32px]` | Same | P1 |
| 3 | `src/app/(child)/progress/page.tsx` | 252 | `rounded-[32px]` | Same | P1 |
| 4 | `src/app/(child)/progress/page.tsx` | 288 | `rounded-[32px]` | Same | P1 |
| 5 | `src/app/(child)/progress/page.tsx` | 368 | `rounded-[32px]` | Same | P1 |
| 6 | `src/app/(child)/progress/page.tsx` | 378 | `rounded-[32px]` | Same | P1 |
| 7 | `src/app/(child)/progress/page.tsx` | 408 | `rounded-[32px]` | Same | P1 |
| 8 | `src/app/(child)/progress/page.tsx` | 457 | `rounded-[32px]` | Same | P1 |

**Total**: 8 occurrences, all in `src/app/(child)/progress/page.tsx`.

**Note**: `rounded-card` is defined in `tailwind.config.ts` as `1.75rem` and is used in legacy components. Per design-system.md §5, it should be replaced with `rounded-xl` (24px). However, since `rounded-card` is a named config token (not an arbitrary value), it is a P2 cleanup item, not a P1 violation.

---

### 6.5 `bg-gray-*` / `text-gray-*` / `bg-slate-*` / `text-slate-*` / `bg-stone-*` / `text-stone-*`

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/progress/page.tsx` | 90 | `bg-slate-100 text-slate-500` | Calendar day "no tasks" state | P1 |
| 2 | `src/app/(child)/progress/page.tsx` | 109 | `bg-slate-100 text-slate-600` | Calendar day default state | P1 |
| 3 | `src/app/(parent)/settings/integrations/page.tsx` | 962 | `bg-slate-100 text-slate-700` | Code block styling | P1 |
| 4 | `src/app/(parent)/settings/integrations/page.tsx` | 982 | `bg-slate-100 text-slate-600` | Inline code styling | P1 |

**Total**: 4 occurrences across 2 files.

**Migration target**: Replace with `ink-*` equivalents per design-system.md §2.5 and §10.1.

---

### 6.6 `bg-amber-*` / `text-amber-*`

| # | File | Line | Code | Issue | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/progress/page.tsx` | 95 | `bg-amber-100 text-amber-700` | Calendar "late but completed" state | P1 |
| 2 | `src/app/(parent)/settings/integrations/page.tsx` | 943 | `text-amber-700 bg-amber-50` | Warning message | P1 |
| 3 | `src/app/(parent)/settings/channels/page.tsx` | 86 | `bg-amber-50 text-amber-900` | Warning banner | P1 |
| 4 | `src/app/(parent)/settings/channels/page.tsx` | 96–98 | `bg-amber-100` (×3) | Inline code in warning | P1 |
| 5 | `src/app/(parent)/settings/channels/page.tsx` | 104 | `text-amber-800` | Warning text | P1 |
| 6 | `src/components/ui/MetricBlock.tsx` | 43 | `text-amber-500` | Warning color in metric block | P1 |
| 7 | `src/components/parent/PlatformSyncStatusPanel.tsx` | 62 | `bg-amber-100 text-amber-700` | Warning status badge | P1 |
| 8 | `src/components/parent/HomeworkForm.tsx` | 799 | `text-amber-700` | Form warning text | P1 |
| 9 | `src/components/parent/VoicePushStatusPanel.tsx` | 64 | `bg-amber-100 text-amber-700` | Warning status badge | P1 |
| 10 | `src/components/parent/ReminderActionButton.tsx` | 31 | `bg-amber-50 text-amber-600` | SMS reminder badge | P1 |

**Total**: 10 occurrences across 7 files.

**Note**: Per design-system.md §2.4, `amber-*` in reading/achievement contexts should map to `honey-*`. However, many of these usages are **warning/alert semantics** (settings pages, status panels, form validation), not achievement contexts. The design-system.md §2.6 defines `warning` as mapping to `amber-500`, so these warning usages may be acceptable if formalized as semantic tokens. The `ReminderActionButton.tsx` line 31 (`bg-amber-50 text-amber-600` for "sent SMS") is arguably a status indicator, not a warning.

**Recommendation**: Distinguish between:
- **Achievement context** (reading progress, badges, points) → migrate to `honey-*`
- **Warning/alert context** (settings warnings, form validation, status alerts) → keep as semantic `warning` token (which maps to amber)

---

### 6.7 Skeleton Background Consistency

**Finding**: Skeleton screens are **mostly consistent** with `bg-ink-100`.

| File | Pattern | Status |
|---|---|---|
| `src/app/(parent)/dashboard/page.tsx` | `bg-ink-100` | OK |
| `src/app/(child)/page.tsx` | `bg-ink-100` | OK |
| `src/app/(child)/reading/page.tsx` | `bg-ink-100` | OK |
| `src/components/reading/LevelProgressBar.tsx` | `bg-ink-100` | OK |
| `src/components/reading/ReadingProgressPanel.tsx` | `bg-ink-100` | OK |
| `src/components/ui/SkeletonShell.tsx` | `bg-ink-100` (pulse), gradient shimmer | OK |
| `src/components/parent/ParentCheckInHeatmap.tsx` | `bg-ink-100` | OK |
| `src/app/(child)/reading/[id]/page.tsx` | `bg-forest-200`, `bg-forest-100`, `bg-forest-50` | **INCONSISTENT** |

**Exception** (`src/app/(child)/reading/[id]/page.tsx`):
- Line 109: `bg-forest-200`
- Lines 113–117: `bg-forest-100`
- Lines 123–128: `bg-forest-50`

These are in the article reader skeleton state and use forest greens instead of the standard `bg-ink-100`. This is a P1 inconsistency.

---

### 6.8 `bg-white/80` / `bg-white/90` / `bg-white/95` — Parent Surface Opacity

| # | File | Line | Code | Context | Priority |
|---|---|---|---|---|---|
| 1 | `src/app/(child)/layout.tsx` | 81 | `bg-white/90` | Child header backdrop | P1 |
| 2 | `src/app/(child)/page.tsx` | 140 | `bg-white/80` | Skeleton card | P2 (skeleton, acceptable) |
| 3 | `src/app/(child)/page.tsx` | 158 | `bg-white/80` | Skeleton card | P2 |
| 4 | `src/app/(child)/page.tsx` | 215 | `bg-white/90` | Empty state card | P1 |
| 5 | `src/app/(child)/page.tsx` | 253 | `bg-white/80` | Empty state dashed card | P1 |
| 6 | `src/app/(child)/reading/page.tsx` | 116 | `bg-white/90` | Empty state card | P1 |
| 7 | `src/app/(child)/reading/page.tsx` | 163 | `bg-white/70` | Article difficulty badge | P1 |
| 8 | `src/app/(child)/reading/page.tsx` | 243 | `bg-white/80` | Loading state | P1 |
| 9 | `src/app/(child)/progress/page.tsx` | 214 | `bg-white/90` | Empty state card | P1 |
| 10 | `src/app/(child)/progress/page.tsx` | 237 | `bg-white/85` | Loading state card | P1 |
| 11 | `src/app/(child)/progress/page.tsx` | 288 | `bg-white/90` | Stats card | P1 |
| 12 | `src/app/(child)/progress/page.tsx` | 352 | `bg-white/80` | Calendar tag | P1 |
| 13 | `src/app/(child)/progress/page.tsx` | 368 | `bg-white/90` | Section card | P1 |
| 14 | `src/app/(child)/progress/page.tsx` | 378 | `bg-white/90` | Section card | P1 |
| 15 | `src/app/(child)/progress/page.tsx` | 408 | `bg-white/90` | Section card | P1 |
| 16 | `src/app/(child)/progress/page.tsx` | 457 | `bg-white/90` | Section card | P1 |
| 17 | `src/app/(parent)/homework/page.tsx` | 95 | `bg-white/80` | Info banner | P1 |
| 18 | `src/app/(parent)/homework/page.tsx` | 108 | `bg-white/90` | Sidebar | P1 |
| 19 | `src/components/reading/LevelProgressBar.tsx` | 119 | `bg-white/80` | Skeleton | P2 |
| 20 | `src/components/reading/LevelProgressBar.tsx` | 144 | `bg-white/80` | Card | P1 |
| 21 | `src/components/reading/ArticleReader.tsx` | 119 | `bg-white/95` | Bottom sticky CTA | P1 |
| 22 | `src/components/reading/ReadingProgressPanel.tsx` | 66 | `bg-white/90` | Section | P1 |
| 23 | `src/components/reading/ReadingProgressPanel.tsx` | 98 | `bg-white/90` | Section | P1 |
| 24 | `src/components/reading/ReadingProgressPanel.tsx` | 108 | `bg-white/90` | Section | P1 |
| 25 | `src/components/parent/PlatformSyncStatusPanel.tsx` | 129 | `bg-white/80` | Inner panel | P1 |
| 26 | `src/components/parent/ParentMonthlyStats.tsx` | 23 | `bg-white/80` | Stats card | P1 |
| 27 | `src/components/parent/HomeworkForm.tsx` | 443 | `bg-white/90` | Form container | P1 |
| 28 | `src/components/child/PriorityHomeworkCard.tsx` | 15 | `bg-white/80` | Empty card | P1 |
| 29 | `src/components/child/PriorityHomeworkCard.tsx` | 27, 37, 40, 44 | `bg-white/80` (×4) | Tags inside card | P1 |
| 30 | `src/components/parent/HomeworkAssignmentPanel.tsx` | 27 | `bg-white/90` | Panel | P1 |

**Total**: 30 occurrences across 12 files.

**Design system rule** (design-system.md §3): Parent surfaces should use **solid white + ring**, not opacity variants. Child surfaces use solid white with cream ring. The opacity variants (`bg-white/80`, `bg-white/90`, `bg-white/95`) are ad-hoc and should be replaced with solid `bg-white` + appropriate `ring-*` tokens.

---

### 6.9 `rounded-radius-*` Token Usage

**Finding**: `rounded-radius-*` classes appear in 20+ locations but these tokens **do not exist** in `tailwind.config.ts`.

| File | Count | Examples |
|---|---|---|
| `src/app/(child)/page.tsx` | 5 | `rounded-radius-xl`, `rounded-radius-2xl` |
| `src/components/ui/MetricBlock.tsx` | 2 | `rounded-radius-md`, `rounded-radius-lg` |
| `src/components/ui/SectionCard.tsx` | 6 | `rounded-radius-md` through `rounded-radius-2xl` |
| `src/components/ui/EmptyState.tsx` | 1 | `rounded-radius-2xl` |
| `src/components/child/StatCard.tsx` | 1 | `rounded-radius-lg` |
| `src/components/child/WeekCalendar.tsx` | 1 | `rounded-radius-xl` |
| `src/components/child/ChildWeekSummaryCard.tsx` | 1 | `rounded-radius-xl` |
| `src/components/child/PriorityHomeworkCard.tsx` | 2 | `rounded-radius-xl` |
| `src/components/child/DayHomeworkView.tsx` | 1 | `rounded-radius-xl` |
| `src/components/child/ChildHomeworkCard.tsx` | 1 | `rounded-radius-lg` |

These classes will be **purged by Tailwind** because no `borderRadius` tokens named `radius-*` are defined. The code compiles only because Tailwind's JIT may not be running in strict mode, or the classes are being treated as arbitrary values that happen to match no pattern.

**Note**: The `tailwind.config.ts` does define `rounded-card` (1.75rem) and standard Tailwind sizes (`rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`). The `radius-*` naming convention from design-system.md has not been implemented.

---

### 6.10 `shadow-elevation-*` Token Usage

**Finding**: `shadow-elevation-*` classes appear in **60+ locations** but these tokens **do not exist** in `tailwind.config.ts`.

The design-system.md §4 defines 4 elevation levels:
- `elevation-flat`: none
- `elevation-raised`: `0 1px 2px rgba(10,27,20,0.04)`
- `elevation-floating`: `0 8px 24px rgba(10,27,20,0.08), 0 0 0 1px rgba(232,234,237,0.5)`
- `elevation-modal`: `0 24px 48px rgba(10,27,20,0.12)`

None of these are defined in the Tailwind config. All usages will compile to nothing.

---

### 6.11 Summary Table

| Category | Count | Files | Priority |
|---|---|---|---|
| Hex color literals in JSX/TSX | 7 | 2 | P1 |
| Hex color literals in CSS (scrollbar) | 2 | 1 | P2 |
| `bg-[` arbitrary values | 1 | 1 | P1 |
| `shadow-sm/md/lg/xl` outside primitives | 18 | 5 | P1 |
| `rounded-[32px]` arbitrary values | 8 | 1 | P1 |
| `bg-slate-*` / `text-slate-*` | 4 | 2 | P1 |
| `bg-amber-*` / `text-amber-*` | 10 | 7 | P1 (achievement) / P2 (warning) |
| `bg-white/80/90/95` opacity surfaces | 30 | 12 | P1 |
| Skeleton bg inconsistency (forest vs ink) | 1 | 1 | P1 |
| **Missing Tailwind config tokens** (ink, cream, coral, honey, radius, elevation) | **All usages** | **All files** | **P0** |

---

### 6.12 Recommended Fix Order

1. **P0**: Update `tailwind.config.ts` to define all design-system.md v2 tokens (colors: ink, cream, coral, honey; borderRadius: radius-sm/md/lg/xl/2xl; boxShadow: elevation-flat/raised/floating/modal). Without this, all token migration is cosmetic only.

2. **P1**: Fix `src/app/(child)/progress/page.tsx` — this single file contains 8 `rounded-[32px]`, 7 hex gradients, 8 shadow classes, 2 slate colors, 1 amber color, and 6 `bg-white/90` usages. It is the highest-density violation file.

3. **P1**: Replace all `bg-white/80/90/95` with solid `bg-white` + ring tokens.

4. **P1**: Replace `bg-slate-*` with `bg-ink-*` equivalents.

5. **P1**: Audit `bg-amber-*` usages — migrate achievement contexts to `honey-*`, keep warning contexts as semantic `warning` token.

6. **P1**: Replace `shadow-sm/md/lg/xl` with `shadow-elevation-*` tokens.

7. **P1**: Replace `rounded-[32px]` with `rounded-2xl`.

8. **P2**: Fix `rounded-card` → `rounded-xl` in legacy components.

9. **P2**: Fix scrollbar hex colors in globals.css to use ink tokens.

10. **P2**: Replace `text-[10px]`, `text-[11px]`, `text-[8px]` arbitrary font sizes with design-system type scale tokens.
