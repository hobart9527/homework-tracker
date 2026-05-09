# Homework Tracker Design Overhaul — Progress Tracker

Created: 2026-05-08
Last Updated: 2026-05-08

---

## Current State

| Item | Status |
|---|---|
| Design direction | ✅ Locked: C · Two Modes One System |
| Target age | ✅ Locked: G4-G6, growth-friendly, not childish |
| P0 execution order | ✅ Locked: Token system → iPad layout → Reader mode |
| Reader pagination | ✅ Locked: Scroll + book-feel rituals (no full pagination in P0) |
| Plan format | ✅ Locked: Full design docs with Wave dispatch |
| Design system spec | ✅ Complete (design-system.md) |
| Codebase audit | ✅ Complete (findings.md) |
| Task plan | ✅ Complete (task-plan.md) |
| **Current Stage** | **Stage 1 / Wave 1.0 — Token Spec & Shared Config** |
| **Status** | **🔄 Dispatched — 1.0a + 1.0b running in parallel** |

---

## Stage 1: Token System & Visual Foundation

### Wave 1.0: Token Spec & Shared Config (Contract Wave)
**Status**: Planned | **Topology**: Serial

| Task | Status | Owner | Notes |
|---|---|---|---|
| 1.0a: Extend tailwind.config.ts | ✅ completed | adhd-agent | Build passed. All tokens added with backward compat. |
| 1.0b: Update globals.css | ✅ completed | adhd-agent | Font imports, CSS custom properties, motion keyframes |
| 1.0c: Update root layout.tsx | ✅ completed | adhd-agent | Font preconnect + suppressHydrationWarning |

### Wave 1.1: Base Primitives & Migration
**Status**: 🔄 Dispatched | **Topology**: Wave Parallel (4 agents)

**Acceptance checkpoint**: `npm run build` passes, all tokens accessible, fonts load.

### Wave 1.1: Base Primitives & Migration
**Status**: Planned | **Topology**: Wave Parallel (4 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 1.1a: PageShell, PageHeader, SectionCard, MetricBlock | ✅ completed | adhd-agent | 4 组件创建，零类型错误 |
| 1.1b: Tokenized Button, Card, EmptyState | ✅ completed | adhd-agent | outline variant + skin + tokenized Card + EmptyState |
| 1.1c: SkeletonShell with shimmer | ✅ completed | adhd-agent | Build passed, 3 sub-components |
| 1.1d: Icons additions | ✅ completed | adhd-agent | 7 新图标：BookOpen, Sun, Moon, Settings, Type, Sidebar, PanelLeft |

### Wave 1.2: Page-Level Token Migration
**Status**: 🔄 Dispatched | **Topology**: Wave Parallel (4 agents)

### Wave 1.2: Page-Level Token Migration
**Status**: Planned | **Topology**: Wave Parallel (4 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 1.2a: Child today page + components | ✅ completed | adhd-agent | 8 files migrated, all logic preserved |
| 1.2b: Reading browser + cards | ✅ completed | adhd-agent | 7 files migrated, content area preserved for Wave 3 |
| 1.2c: Auth pages | ✅ completed | adhd-agent | Login, child-login — all tokens migrated, logic preserved |
| 1.2d: Parent dashboard + components | ✅ completed | adhd-agent | 9 files migrated, semantic colors mapped, all logic preserved |

### Wave 1.3: Verification & Polish
**Status**: 🔄 Dispatched | **Topology**: Serial

| Task | Status | Owner | Notes |
|---|---|---|---|
| 1.3a: Visual regression + token audit | ✅ completed | adhd-agent | 发现 tailwind.config.ts 等被 git reset 回滚 |
| 1.3b: Fix inconsistencies | ✅ completed | adhd-agent | 已重新应用所有回滚的配置 + 组件 token 变更 |

---

## Stage 1 完成 ✅

所有 Token System & Visual Foundation Waves 已完成：
- Wave 1.0: 配置冻结（tailwind.config.ts + globals.css + layout.tsx）
- Wave 1.1: 基础组件创建（PageShell, PageHeader, SectionCard, MetricBlock, EmptyState, SkeletonShell, icons）
- Wave 1.2: 页面级迁移（child, reading, auth, parent dashboard）
- Wave 1.3: 审计 + 修复回滚问题

---

## Stage 2: iPad Layout Restructure
**Status**: ✅ Completed | **Duration**: 1.5 weeks

### Wave 2.0: Layout System & Nav Refactor
**Status**: ✅ Completed | **Topology**: Serial

| Task | Status | Owner | Notes |
|---|---|---|---|
| 2.0a: ParentShell, ChildShell, ReaderShell | ✅ completed | adhd-agent | 3 layout primitives created, build passed |
| 2.0b: Parent layout with sidebar | ✅ completed | adhd-agent | ParentShell integrated with 4 nav items |
| 2.0c: Child layout refinement | ✅ completed | adhd-agent | ChildShell integrated, header preserved, nav removed |
| 2.0d: Responsive breakpoints | ✅ completed | adhd-agent | iPad breakpoints via lg: 1024, md/sm for smaller screens |

### Wave 2.1: Parent Dashboard Layout
**Status**: ✅ Completed | **Topology**: Wave Parallel (2 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 2.1a: Dashboard 12-col grid + sidebar | ✅ completed | adhd-agent | max-w-7xl, lg:grid-cols-12, left 7 cols / right 5 cols |
| 2.1b: Parent detail components | ✅ completed | adhd-agent | Calendar, heatmap, insights, TodayOverview sticky |

### Wave 2.2: Child Pages Layout
**Status**: ✅ Completed | **Topology**: Wave Parallel (2 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 2.2a: Child today hero + grid | ✅ completed | adhd-agent | Header hero in layout.tsx, lg:grid-cols-[22rem_1fr] |
| 2.2b: Reading list wider grid | ✅ completed | adhd-agent | lg:grid-cols-3 article grid, hero recommendation |

### Wave 2.3: Verification & Polish
**Status**: ✅ Completed | **Topology**: Serial

| Task | Status | Owner | Notes |
|---|---|---|---|
| 2.3a: Build verification | ✅ completed | orchestrator | `npm run build` passes, zero errors |
| 2.3b: Responsive layout audit | ✅ completed | orchestrator | All pages use lg: breakpoint for iPad landscape |

---

## Decisions Log

| Date | Decision | Context | Rationale |
|---|---|---|---|
| 2026-05-08 | Direction C: Two Modes One System | 三个方向选择 | 最精准命中"色彩弱+层级乱+阅读差"三大痛点，分阶段落地 |
| 2026-05-08 | G4-G6 age target, not too childish | 年龄段选择 | 孩子慢慢长大，设计要经得起成长；鼓励感靠材质和编排，不靠卡通 |
| 2026-05-08 | P0 order: token → layout → reader | 执行顺序 | 地基先行，否则 layout 和 reader 会反复重做样式 |
| 2026-05-08 | Reader: scroll + book-feel rituals | 翻页问题 | 短文为主，翻页不自然；滚动做主体，节点做翻页仪式感 |
| 2026-05-08 | Full design docs + Wave dispatch | 计划粒度 | Heavy 多 Wave 项目，需要持久化 plan 文件和精确调度 |
| 2026-05-08 | Reader theme: light/sepia/dark only | dark mode 范围 | P0 只做 reader dark mode；parent/child 保持 light，降低复杂度 |
| 2026-05-08 | Font: Inter + LXGW WenKai + Fraunces | 字体选择 | UI 清晰，阅读有温度；LXGW 是 OFL 授权，可商用 |
| 2026-05-08 | Color: coral replaces accent red | accent 调整 | #FF6B6B 偏医疗感，coral 更暖更鼓励 |
| 2026-05-08 | Reader 3-pane: left(TOC) + center(text) + right(tools) | 阅读器架构 | iPad 横屏两侧空间利用最大化；竖屏折叠 rails |

---

## Blockers

None currently.

---

## Completed Milestones

| Milestone | Date | Evidence |
|---|---|---|
| Design direction locked | 2026-05-08 | User confirmed via AskUserQuestion |
| Plan files written | 2026-05-08 | `.planning/design-system.md`, `findings.md`, `task_plan.md`, `progress.md` |
| Codebase audit complete | 2026-05-08 | 47 files read, pain points codified in findings.md |

---

## Stage 3: Reading Mode Independent Module
**Status**: ✅ Completed | **Risk Mode**: Heavy | **Topology**: Wave Parallel + Serial

### Wave 3.0: Reader Shell & Layout
**Status**: 🔄 Dispatched

| Task | Status | Owner | Notes |
|---|---|---|---|
| 3.0a: ReaderShell theme fix | ✅ completed | adhd-agent | CSS variables inlined on ReaderShell div |
| 3.0b: Independent reader route group | ✅ completed | adhd-agent | `(reader)` group created, build passed |
| 3.0c: Theme system | ✅ completed | adhd-agent | ReaderThemeContext + useReaderTheme hook |
| 3.0d: Settings panel UI | ✅ completed | adhd-agent | ReaderSettingsPanel in rightRail, 3 themes + font + line height |

### Wave 3.1: Reader Features
**Status**: ✅ Completed | **Topology**: Wave Parallel (3 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 3.1a: Settings persistence | ✅ completed | adhd-agent | localStorage v1 key, theme + font + line height |
| 3.1b: Side toolbar | ✅ completed | adhd-agent | ReaderToolbar with TTS + bookmark |
| 3.1c: Progress + position memory | ✅ completed | adhd-agent | IntersectionObserver + scroll restore |

### Wave 3.2: Book Feel & Completion Ritual
**Status**: ✅ Completed | **Topology**: Wave Parallel (2 agents)

| Task | Status | Owner | Notes |
|---|---|---|---|
| 3.2a: Parchment background | ✅ completed | adhd-agent | CSS repeating-linear-gradient texture, sepia only |
| 3.2b: Completion stamp animation | ✅ completed | adhd-agent | CompletionStamp with stamp-reveal + star-burst, QuizView integration |

### Wave 3.3: Verification & Polish
**Status**: ✅ Completed | **Topology**: Serial

| Task | Status | Owner | Notes |
|---|---|---|---|
| 3.3a: Build verification | ✅ completed | orchestrator | `npm run build` passes, zero errors |
| 3.3b: Fix test failures | ✅ completed | adhd-agent | parent-dashboard.test.ts 3 failures fixed, 23/23 pass |
| 3.3c: Reader e2e smoke | ✅ completed | orchestrator | All reader features integrated |

---

## Framework Fixes Applied (2026-05-09)

基于 Stage 1-3 复盘中发现的 5 个执行框架漏洞，已更新全局 agent prompt：

| 漏洞 | 修复位置 | 关键变更 |
|------|---------|---------|
| P0-1 完成证据失效 | `orchestrator.md` + `adhd-agent.md` | Wave Barrier 强制 `git status` + `git diff --stat` 交叉验证；agent 写入后必须 Read 确认 |
| P0-2 验证矩阵断裂 | `orchestrator.md` | Standard/Heavy wave 必须运行 test，build pass 不足 |
| P1-3 Git 检查缺失 | `orchestrator.md` | 每个 Wave Barrier 运行 `git status --short` |
| P1-4 写入后自验证缺失 | `adhd-agent.md` | Edit/Write 后必须 Read 确认，失败则重试一次 |
| P2-5 恢复开销 | `orchestrator.md` | Standard/Heavy 强制 `state_write` 持久化 wave 状态 |

详细变更记录见 `.planning/execution-framework-fixes.md`。

---

## Next Action

待用户确认：执行 **Feature Record Gate**（更新 README.md + CHANGELOG.md）或开始新需求。
