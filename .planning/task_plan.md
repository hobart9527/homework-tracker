# Homework Tracker Design Overhaul — Task Plan

Version: 2.0
Created: 2026-05-08
Status: Stage 1 / Wave 1.0 planned, pending dispatch
Direction: C · Two Modes One System

---

## 1. Goal & Scope Freeze

### Goal
Rebuild the visual identity and layout architecture of Homework Tracker from a flat, monochromatic green-on-white design into a role-differentiated, iPad-first system with a premium reading experience.

### In Scope (P0)
1. **Token System**: New color palette (forest extended + cream + coral + honey), surface system, elevation, radius, typography, motion
2. **iPad Layout**: Parent sidebar nav + dense dashboard, Child hero + 12-col grid, Reader 3-pane layout
3. **Reading Mode**: Independent layout (no bottom nav), 3 themes (light/sepia/dark), reader settings (font size/line height/theme), side toolbar, inline dictionary, scroll progress + position memory, completion stamp animation
4. **Component Primitives**: PageShell, PageHeader, SectionCard, MetricBlock, TokenizedCard, EmptyState

### Out of Scope (P1/P2 — documented but not in P0)
- Character/mascot illustrations
- Full pagination mode (P1: optional toggle for long articles)
- Parent/child dark mode (reader-only in P0)
- Real-time collaboration features
- New pages or features beyond visual redesign
- Animation beyond completion stamp and page transitions
- Accessibility audit beyond P0's basic contrast checks

### Acceptance Criteria (Global)
- All pages build without errors: `npm run build`
- All unit tests pass: `npm test`
- No console errors on any page in dev mode
- No ad-hoc colors (hex literals) in modified component files
- All touch targets ≥ 44px on iPad
- `prefers-reduced-motion` respected for all animations

---

## 2. Risk Mode & Budget

| Stage | Risk Mode | Resource Budget | Rationale |
|---|---|---|---|
| Stage 1: Tokens | Standard | coordinated | Config changes affect all downstream; careful verification needed |
| Stage 2: Layout | Standard | coordinated | iPad testing, responsive breakpoints |
| Stage 3: Reader | Heavy | full | New module, complex interactions, 3-pane responsive, TTS integration |

Overall pipeline: Heavy (multi-Wave, cross-module, 6 weeks, shared contract changes).

---

## 3. Design System Reference

All tokens, surfaces, typography, motion defined in `design-system.md`.
Key shared contracts:
- **tailwind.config.ts** — color, font, radius, spacing tokens
- **src/styles/globals.css** — CSS variables for reader themes, font loading
- **src/components/ui/PageShell.tsx** — layout primitive with skin prop
- **src/components/ui/SectionCard.tsx** — surface primitive with level prop

---

## 4. Stage Breakdown

### Stage 1: Token System & Visual Foundation
**Duration**: 1.5 weeks
**Goal**: Establish the complete token system, create new base primitives, migrate all existing components to consume tokens.
**Dependency**: None (foundation stage)

#### Wave 1.0: Token Spec & Shared Config (Contract Wave)
**Topology**: Serial — config is a shared contract, must be frozen before any component work.
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 1.0a | Extend tailwind.config.ts with new color families, font families, radius, spacing, elevation shadows | `tailwind.config.ts` | `globals.css`, existing config | none |
| 1.0b | Update globals.css: font @imports, CSS custom properties for reader themes, motion keyframes | `src/styles/globals.css` | `tailwind.config.ts` | 1.0a |
| 1.0c | Update root layout.tsx to load fonts, set up theme context | `src/app/layout.tsx` | `globals.css`, `i18n.ts` | 1.0b |

**Acceptance**:
- `npm run build` passes with zero errors
- All new tokens accessible via Tailwind classes (verified by spot-check in dev)
- Font files load correctly (no FOUC, no 404s in network panel)
- CSS custom properties render correctly in reader theme test

**Rollback**: `git restore tailwind.config.ts src/styles/globals.css src/app/layout.tsx`

---

#### Wave 1.1: Base Primitives & Component Migration (Wave Parallel)
**Topology**: Wave Parallel — 4 independent component tasks, no shared files.
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 1.1a | Create PageShell, PageHeader, SectionCard, MetricBlock primitives | `src/components/ui/PageShell.tsx`, `PageHeader.tsx`, `SectionCard.tsx`, `MetricBlock.tsx` | `design-system.md`, existing layout files | 1.0c |
| 1.1b | Tokenize Button (add outline, skin-aware), rewrite Card to TokenizedCard, add EmptyState | `src/components/ui/Button.tsx`, `Card.tsx`, `EmptyState.tsx` | `design-system.md`, existing Button/Card | 1.0c |
| 1.1c | Create SkeletonShell with shimmer, update loading skeletons pattern | `src/components/ui/SkeletonShell.tsx` | `design-system.md` | 1.0c |
| 1.1d | Create icons.tsx additions (if needed for new UI patterns) | `src/components/ui/icons.tsx` | existing icons | 1.0c |

**Acceptance**:
- Each primitive renders correctly in isolation (via Storybook-style page or manual import test)
- Button has all 5 variants working (primary, secondary, accent, ghost, outline)
- SectionCard correctly applies surface/elevation/radius per skin+level
- No ad-hoc tailwind classes in new primitive files

**Verification**: Build passes + manual visual check of a test page importing all primitives.

**Rollback**: `git rm src/components/ui/PageShell.tsx PageHeader.tsx SectionCard.tsx MetricBlock.tsx EmptyState.tsx SkeletonShell.tsx` + `git restore src/components/ui/Button.tsx Card.tsx`

---

#### Wave 1.2: Page-Level Token Migration (Wave Parallel)
**Topology**: Wave Parallel — 4 tasks, each owns a distinct page family. No shared files between tasks.
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 1.2a | Migrate child today page + all child components to tokens | `src/app/(child)/page.tsx`, `src/components/child/*` | `src/components/ui/*`, `design-system.md`, `findings.md` | 1.1a, 1.1b |
| 1.2b | Migrate reading browser + article card + progress components to tokens | `src/app/(child)/reading/page.tsx`, `src/components/reading/ArticleCard.tsx`, `LevelProgressBar.tsx`, `LevelUpModal.tsx`, `ReadingProgressPanel.tsx` | `src/components/ui/*`, `findings.md` | 1.1a, 1.1b |
| 1.2c | Migrate auth pages (login + child-login) to tokens | `src/app/(auth)/login/page.tsx`, `src/app/child-login/page.tsx` | `src/components/ui/*`, `findings.md` | 1.1a, 1.1b |
| 1.2d | Migrate parent dashboard + all parent components to tokens | `src/app/(parent)/dashboard/page.tsx`, `src/components/parent/*` | `src/components/ui/*`, `findings.md` | 1.1a, 1.1b |

**Acceptance**:
- Each page renders without console errors
- No `bg-[#...]` or `text-[#...]` arbitrary values remain in migrated files
- All `rounded-[32px]` / `rounded-card` replaced with standard radius tokens
- All `shadow-sm/md/lg` replaced with elevation tokens
- Skeleton states updated to use SkeletonShell

**Verification**: Build passes + visual diff check (open each page, screenshot or manual verify colors/layout match design-system spec).

**Rollback**: Per-task `git restore` of the files in each task's write scope.

---

#### Wave 1.3: Verification & Polish (Serial)
**Topology**: Serial — one verification agent + one polish agent.
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 1.3a | Visual regression + token audit: check all migrated files for remaining ad-hoc styles | `findings.md` (append audit results) | All files from 1.2a-d | 1.2a, 1.2b, 1.2c, 1.2d |
| 1.3b | Fix any inconsistencies found in 1.3a | Files identified in 1.3a | `design-system.md` | 1.3a |

**Acceptance**:
- Zero ad-hoc color values in src/components/ and src/app/ (except for reader theme CSS variables)
- All elevation usage goes through TokenizedCard/SectionCard
- Accessibility: contrast ratios ≥ 4.5:1 for all text
- `prefers-reduced-motion` blocks all keyframe animations

**Verification**: `npm run build` + `npm test` + manual browser check.

---

### Stage 2: iPad Layout Restructure
**Duration**: 1.5 weeks
**Goal**: Restructure layouts for iPad-first: parent sidebar navigation, child hero+grid, expanded max-widths, responsive breakpoints refined.
**Dependency**: Stage 1 complete (tokens available)

#### Wave 2.0: Layout System & Nav Refactor (Contract Wave)
**Topology**: Serial
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 2.0a | Create ParentShell (sidebar nav + content area), ChildShell (bottom nav + content area), ReaderShell (no nav, full-bleed) | `src/components/ui/ParentShell.tsx`, `ChildShell.tsx`, `ReaderShell.tsx` | `design-system.md`, existing layouts | Stage 1 |
| 2.0b | Update parent layout.tsx to use ParentShell with sidebar | `src/app/(parent)/layout.tsx` | `ParentShell.tsx` | 2.0a |
| 2.0c | Update child layout.tsx to use ChildShell | `src/app/(child)/layout.tsx` | `ChildShell.tsx` | 2.0a |
| 2.0d | Refine responsive breakpoints for iPad landscape (1024px) and portrait (834px) | `tailwind.config.ts` (extend screens) | `design-system.md` | 2.0a |

**Acceptance**:
- ParentShell shows sidebar nav on ≥ 1024px, collapses to top nav on < 1024px
- ChildShell preserves bottom nav, content area has proper padding
- ReaderShell has no nav, full viewport usage
- Breakpoints: sm(640) md(768) lg(1024) xl(1280) 2xl(1440)

**Rollback**: `git restore src/app/(parent)/layout.tsx src/app/(child)/layout.tsx` + remove shell components

---

#### Wave 2.1: Parent Dashboard Layout (Wave Parallel)
**Topology**: Wave Parallel — 2 tasks
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 2.1a | Parent dashboard: 12-col grid, sidebar integration, max-width expansion to max-w-7xl | `src/app/(parent)/dashboard/page.tsx` | `ParentShell.tsx`, `design-system.md` | 2.0b |
| 2.1b | Parent detail components: metric cards, calendar, heatmap layout refinement for dense view | `src/components/parent/ParentDayDetailPanel.tsx`, `ParentMonthCalendar.tsx`, `ParentCheckInHeatmap.tsx`, `ParentMonthlyInsights.tsx` | `design-system.md` | 2.0b |

**Acceptance**:
- Dashboard uses full width on iPad Pro landscape (no excessive side margins)
- 12-col grid: calendar 7 cols, day details 5 cols on xl
- Touch targets on calendar days ≥ 44px
- Sidebar nav items ≥ 44px height

---

#### Wave 2.2: Child Pages Layout (Wave Parallel)
**Topology**: Wave Parallel — 2 tasks
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 2.2a | Child today page: full-width hero zone, 12-col grid below, sticky priority card | `src/app/(child)/page.tsx`, `src/components/child/ChildWeekSummaryCard.tsx`, `PriorityHomeworkCard.tsx` | `ChildShell.tsx`, `design-system.md` | 2.0c |
| 2.2b | Reading list: wider grid, better use of iPad landscape, hero recommendation full-width | `src/app/(child)/reading/page.tsx`, `src/components/reading/ArticleCard.tsx` | `design-system.md` | 2.0c |

**Acceptance**:
- Hero zone spans full content width on landscape
- Grid below uses 2-col on md, 3-col on lg+ for task cards
- Reading list uses 3-col on iPad landscape, 2-col on portrait
- Bottom nav doesn't overlap content (ChildShell handles pb-20)

---

#### Wave 2.3: Verification & Polish (Serial)
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 2.3a | iPad responsive testing: landscape + portrait for all pages | `findings.md` (append results) | All pages | 2.1a, 2.1b, 2.2a, 2.2b |
| 2.3b | Fix responsive issues found | Relevant files | `design-system.md` | 2.3a |

**Verification**: Browser dev tools iPad Pro simulation (1366x1024 landscape, 834x1112 portrait).

---

### Stage 3: Reading Mode Independent Module
**Duration**: 2 weeks
**Goal**: Create a premium, immersive reading experience with 3-pane layout, themes, settings, inline dictionary, progress tracking, and completion rituals.
**Dependency**: Stage 2 complete (layout system available)

#### Wave 3.0: Reader Shell & Layout (Contract Wave)
**Topology**: Serial — reader architecture must be frozen before feature implementation.
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 3.0a | ReaderShell 3-pane component: left rail (TOC/position), center reader, right rail (tools) | `src/components/reading/ReaderShell.tsx` | `design-system.md`, `findings.md` | Stage 2 |
| 3.0b | Independent reader layout: new route group `(reader)` or conditional layout that hides bottom nav | `src/app/(child)/reading/[id]/page.tsx` layout changes | `(child)/layout.tsx`, `ReaderShell.tsx` | 3.0a |
| 3.0c | Theme system: CSS custom properties, 3 themes, theme toggle | `src/styles/reader-themes.css`, theme utilities | `design-system.md` | 3.0a |
| 3.0d | Reader settings panel UI (font size, line height, theme selectors) | `src/components/reading/ReaderSettingsPanel.tsx` | `design-system.md` | 3.0c |

**Acceptance**:
- ReaderShell renders 3 panes on ≥ 1024px, collapses rails on < 1024px
- Theme switching works instantly (no page reload)
- Settings panel opens/closes smoothly
- No bottom nav visible in reader mode

**Rollback**: `git restore src/app/(child)/reading/[id]/page.tsx` + remove ReaderShell, reader-themes.css

---

#### Wave 3.1: Reader Features (Wave Parallel)
**Topology**: Wave Parallel — 3 tasks
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 3.1a | Reader settings persistence: localStorage with versioned key, load on mount | `src/lib/reader-settings.ts`, settings integration in ReaderSettingsPanel | `design-system.md` | 3.0d |
| 3.1b | Side toolbar: TTS controls, pinyin toggle, font size/line height quick toggles, bookmark | `src/components/reading/ReaderToolbar.tsx` | `ArticleReader.tsx`, `design-system.md` | 3.0d |
| 3.1c | Scroll progress + paragraph tracking (IntersectionObserver) + position memory | `src/components/reading/ReaderProgress.tsx`, `reader-position.ts` | `ArticleReader.tsx`, `findings.md` | 3.0b |

**Acceptance**:
- Settings persist across reloads
- Toolbar buttons work: TTS play/pause, pinyin show/hide, font size +/-, line height toggle, bookmark toggle
- Progress bar fills as user scrolls through paragraphs
- Position memory: returning to article restores to last-read paragraph

---

#### Wave 3.2: Book Feel & Completion Ritual (Wave Parallel)
**Topology**: Wave Parallel — 2 tasks
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 3.2a | Parchment background system: paper texture (CSS gradient approximation), soft edges, book-like shadows | `src/styles/reader-themes.css` (enhance), `ReaderShell.tsx` | `design-system.md` | 3.0c |
| 3.2b | Completion stamp animation: CSS keyframe stamp reveal + confetti-like particles (CSS-only) | `src/components/reading/CompletionStamp.tsx`, `globals.css` (keyframes) | `design-system.md` | 3.1c |

**Acceptance**:
- Sepia theme has visible paper texture feel
- Completion animation triggers when user reaches end of article
- Animation respects `prefers-reduced-motion` (instant show instead of animate)
- Stamp renders a "藏书票" style seal with article title + completion date

---

#### Wave 3.3: Verification & Polish (Serial)
**Tasks**:

| ID | Goal | Write Scope | Read Scope | Dependencies |
|---|---|---|---|---|
| 3.3a | End-to-end reader testing: all features work together | `findings.md` (append results) | All reader files | 3.1a, 3.1b, 3.1c, 3.2a, 3.2b |
| 3.3b | Fix integration issues | Relevant files | `design-system.md` | 3.3a |
| 3.3c | Performance check: reader bundle size, font loading impact | `findings.md` (append) | Build output | 3.3b |

**Verification**:
- Build passes
- Reader page loads in < 2s on simulated 4G
- TTS works on iPad Safari (voice loading)
- Dictionary lookup works inline
- All 3 themes render correctly
- Position memory works across sessions

---

## 5. Verification Matrix

| Stage | Build | Tests | Visual | iPad Sim | Accessibility | Performance |
|---|---|---|---|---|---|---|
| 1.0 | ✅ | ✅ | — | — | — | — |
| 1.1 | ✅ | ✅ | ✅ | — | — | — |
| 1.2 | ✅ | ✅ | ✅ | — | — | — |
| 1.3 | ✅ | ✅ | ✅ | — | ✅ | — |
| 2.0 | ✅ | ✅ | ✅ | ✅ | — | — |
| 2.1 | ✅ | ✅ | ✅ | ✅ | — | — |
| 2.2 | ✅ | ✅ | ✅ | ✅ | — | — |
| 2.3 | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 3.0 | ✅ | ✅ | ✅ | ✅ | — | — |
| 3.1 | ✅ | ✅ | ✅ | ✅ | — | — |
| 3.2 | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 3.3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 6. Rollback Strategy

### Per-Wave Rollback
Each Wave has file-level rollback via `git restore <files>`. Since we're working on a feature branch (recommended), full stage rollback is `git reset --hard <pre-stage-commit>`.

### Stage-Level Rollback
| Stage | Rollback Command | Impact |
|---|---|---|
| Stage 1 | `git restore tailwind.config.ts src/styles/globals.css src/app/layout.tsx src/components/ui/` | Reverts tokens + primitives, keeps old styling |
| Stage 2 | `git restore src/app/(parent)/layout.tsx src/app/(child)/layout.tsx src/components/ui/*Shell.tsx` | Reverts layout changes, keeps token styling |
| Stage 3 | `git restore src/app/(child)/reading/[id]/page.tsx src/components/reading/Reader*.tsx src/styles/reader-themes.css` | Reverts reader module, keeps rest intact |

### Emergency Rollback
If critical production issue: checkout pre-redesign commit, deploy.

---

## 7. Risk Register

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Tailwind config error breaks all downstream | Medium | Critical | Wave 1.0 ends with mandatory build verification before any component work |
| R2 | Font loading (LXGW WenKai) causes FOUC or performance issue | Medium | High | Lazy-load reader fonts; use font-display: swap; self-host subset |
| R3 | iPad responsive breakpoints conflict with existing sm/md/lg usage | Medium | Medium | Audit all responsive classes before changing breakpoints; add explicit breakpoints rather than override defaults |
| R4 | Reader 3-pane layout breaks on smaller tablets (iPad mini) | Medium | Medium | Test on 768px width; collapse rails below 1024px |
| R5 | TTS integration breaks during reader refactor | Low | Medium | Preserve existing TTS logic in ArticleReader; extract gradually |
| R6 | Token migration leaves inconsistent styling (some files migrated, some not) | Medium | Medium | Wave 1.3 token audit catches all remaining ad-hoc styles |
| R7 | Position memory breaks if article content changes | Low | Low | Store paragraph count + hash; invalidate if mismatch |
| R8 | Accessibility regressions from new colors | Low | High | Wave 1.3 contrast audit; no color-only status indicators |
| R9 | Completion stamp animation performance on iPad | Low | Medium | CSS-only animation, no JS animation loops; reduce-motion fallback |
| R10 | Child growing up — design too childish in 1-2 years | Low | Medium | Design tokens are age-neutral (typography, color, layout); only stamp/celebration can be toned down later |

---

## 8. Shared Contracts (Frozen)

### Contract 1: Token API
**File**: `tailwind.config.ts`
**Exports**: Color tokens (forest-50..950, cream-50..500, coral-50..700, honey-50..500, ink-50..900), font families, radius, spacing, elevation shadows
**Signature**: All tokens prefixed and accessible as `bg-forest-500`, `text-coral-500`, `shadow-floating`, etc.
**Frozen**: After Wave 1.0 completion. No modifications in later Waves without contract Wave.

### Contract 2: Component Primitives API
**Files**: `src/components/ui/PageShell.tsx`, `PageHeader.tsx`, `SectionCard.tsx`, `MetricBlock.tsx`, `TokenizedCard.tsx`, `EmptyState.tsx`, `SkeletonShell.tsx`
**Exports**: React components with typed props including `skin`, `level`, `variant`
**Signature**: Documented in each component's interface
**Frozen**: After Wave 1.1 completion.

### Contract 3: Reader Theme System
**Files**: `src/styles/reader-themes.css`, `src/lib/reader-settings.ts`
**Exports**: CSS custom properties, settings type definition, persistence functions
**Signature**: 3 themes (light/sepia/dark), settings shape `{ fontSize, lineHeight, theme, lastPositions }`
**Frozen**: After Wave 3.0 completion.

### Contract 4: Layout Shell API
**Files**: `src/components/ui/ParentShell.tsx`, `ChildShell.tsx`, `ReaderShell.tsx`
**Exports**: Layout components
**Signature**: ParentShell accepts `sidebarItems`, `children`; ChildShell accepts `children`; ReaderShell accepts `leftRail`, `readerContent`, `rightRail`
**Frozen**: After Wave 2.0 completion.

---

## 9. Dependencies & Pipeline

```
Stage 1: Token System
  Wave 1.0 (config) ──→ Wave 1.1 (primitives) ──→ Wave 1.2 (page migration) ──→ Wave 1.3 (verify)
                                              │
                                              └─── shared contracts: tokens, primitives

Stage 2: iPad Layout
  Wave 2.0 (layout system) ──→ Wave 2.1 (parent) ──┬──→ Wave 2.3 (verify)
                              └──→ Wave 2.2 (child) ─┘

Stage 3: Reader Module
  Wave 3.0 (reader shell) ──→ Wave 3.1 (features) ──┬──→ Wave 3.3 (verify)
                              └──→ Wave 3.2 (book feel) ┘

Cross-stage dependency: Stage 2 depends on Stage 1 contracts.
                      Stage 3 depends on Stage 2 layout system.
```

---

## 10. Feature Record Gate

After Stage 3 completion, update:
- `README.md` — mention new design system, iPad-first layout, reader mode
- `.impeccable.md` — update design context with new tokens and principles
- `CHANGELOG.md` (if exists) or create release notes

---

## 11. Communication Protocol

- **Before each Wave**: update `progress.md` with current Wave, runnable nodes, and verification plan
- **After each Wave**: update `progress.md` with completed/partial/failed status; write decisions to `task_plan.md` decisions section
- **Blockers**: create new task in progress.md, mark blocked, report to user
- **Code review**: Heavy/security-sensitive work requires `code-reviewer` + `designer` review before integration
