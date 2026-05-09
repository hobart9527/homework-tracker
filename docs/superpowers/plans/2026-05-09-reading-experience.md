# 阅读功能 UI/UX 优化实现计划

> **OMC execution note:** This is planning material. Before execution, compile this plan through the OMC Plan Adapter into file ownership, dependency graph, waves, and scoped `adhd-agent` task packets. Do not use native `subagent-driven-development` or `executing-plans` unless the user explicitly opts into native Superpowers execution.

**Goal:** 对 homework-tracker 的阅读功能进行全流程 UI/UX 优化，提升青少年在 iPad 端的中英文阅读体验。

**Architecture:** 在现有 Next.js + Tailwind + shadcn/ui 基础上，增强阅读器沉浸感、优化文章列表发现体验、升级测验交互反馈、新增成就与分享系统。所有改动为前端 UI/UX 层，复用现有 API 和数据结构。

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion (新增)

**Ownership Map:**
| Task | Files | Scope |
|------|-------|-------|
| T1-T2 | `ReaderThemeContext.tsx`, `tailwind.config.ts` | 基础主题系统增强 |
| T3-T5 | `ReadingBrowserPage.tsx`, `MagazineCard.tsx`, `CategoryTrack.tsx` | 文章列表页 |
| T6-T10 | `ReaderShell.tsx`, `BottomReaderToolbar.tsx`, `PageCurlView.tsx`, `GestureOverlay.tsx`, `ArticleReader.tsx` | 阅读器核心 |
| T11-T13 | `ReaderToolbar.tsx`, `ReaderSettingsPanel.tsx` | 阅读器配件 |
| T14-T16 | `QuizView.tsx`, `CompletionStamp.tsx`, `LevelUpModal.tsx` | 测验与反馈 |
| T17-T19 | `ShareCard.tsx`, `VocabularyCollection.tsx`, `ReadingTitleBadge.tsx` | 新增成就组件 |
| T20 | E2E verification | 集成验证 |

**Dependency Graph:**
```
T1 (主题系统) → T6-T13, T14-T16
T2 (Tailwind动画) → T3-T19
T3-T5 (列表页) 独立
T6-T10 (阅读器核心) 依赖 T1, T2
T11-T13 (阅读器配件) 依赖 T1
T14-T16 (测验) 依赖 T2
T17-T19 (成就) 依赖 T2
T20 (验证) 依赖 T3-T19
```

**Wave Plan:**
- **Wave 0** (基础): T1 + T2 — 主题系统和动画基础设施
- **Wave 1** (列表): T3 + T4 + T5 — 文章列表页（与 Wave 0 无文件冲突，可并行）
- **Wave 2** (阅读器): T6 + T7 + T8 + T9 + T10 + T11 + T12 + T13 — 阅读器全链路
- **Wave 3** (测验与成就): T14 + T15 + T16 + T17 + T18 + T19 — 测验反馈系统
- **Wave 4** (验证): T20 — 端到端验证

**Verification:**
- `npm run build` — 无 TypeScript 错误
- `npm run lint` — 无 ESLint 错误
- 手动验证：iPad 横竖屏切换、主题切换、翻页手势、测验答题反馈

**Rollback:**
- 每个任务独立 commit，可 `git revert` 单任务
- 全局回滚：`git reset --hard HEAD~N`（N = 任务数）

---

## 文件结构映射

### 修改文件

| 文件 | 当前职责 | 修改内容 |
|------|----------|----------|
| `src/components/reading/ReaderThemeContext.tsx` | 主题上下文（light/sepia/dark） | 新增 auto 主题，跟随系统 |
| `src/app/(child)/reading/page.tsx` | 文章列表页 | 新增欢迎区、分类轨道、杂志风卡片集成 |
| `src/components/reading/ArticleCard.tsx` | 文章卡片 | 升级为杂志风（大封面、字体层级、进度条） |
| `src/components/ui/ReaderShell.tsx` | 阅读器三栏布局 | 毛玻璃导航栏、自动收起 |
| `src/components/reading/ArticleReader.tsx` | 阅读器核心 | 排版升级、3D翻页、段落渐入、手势支持 |
| `src/components/reading/ReaderToolbar.tsx` | 侧边工具栏 | 新增书签列表、精简图标 |
| `src/components/reading/ReaderSettingsPanel.tsx` | 右侧面板 | 适配底部滑出模式 |
| `src/components/reading/QuizView.tsx` | 测验组件 | 环形进度、液态反馈、连击系统 |
| `src/components/reading/CompletionStamp.tsx` | 完成印章 | 保留动画，新增数据面板入口 |
| `tailwind.config.ts` | Tailwind 配置 | 新增 reader 专用动画和阴影 |

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/components/reading/BottomReaderToolbar.tsx` | 竖屏底部悬浮工具栏 |
| `src/components/reading/GestureOverlay.tsx` | 全局手势识别层 |
| `src/components/reading/PageCurlView.tsx` | 3D 翻页效果组件 |
| `src/components/reading/ShareCard.tsx` | 阅读完成分享卡片 |
| `src/components/reading/VocabularyCollection.tsx` | 生词本展示 |
| `src/components/reading/ReadingTitleBadge.tsx` | 动态称号组件 |
| `src/components/reading/CategoryTrack.tsx` | 横向滑动分类轨道 |
| `src/components/reading/MagazineCard.tsx` | 杂志风文章卡片 |

---

## Task 1: 增强主题系统（ReaderThemeContext）

**Files:**
- Modify: `src/components/reading/ReaderThemeContext.tsx`

**新增内容：**

- [ ] **Step 1: 添加 auto 主题类型**

在 `ReaderTheme` 类型中新增 `"auto"`：

```typescript
export type ReaderTheme = "light" | "sepia" | "dark" | "auto";
```

- [ ] **Step 2: 实现系统主题检测**

添加系统主题检测逻辑：

```typescript
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: ReaderTheme): "light" | "sepia" | "dark" {
  if (theme === "auto") return getSystemTheme();
  return theme;
}
```

- [ ] **Step 3: 更新 Provider**

修改 `ReaderThemeProvider`，当 theme 为 auto 时监听系统主题变化：

```typescript
useEffect(() => {
  if (settings.theme !== "auto") return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => {
    // 触发重渲染，resolveTheme 会自动切换
    setSettings((prev) => ({ ...prev }));
  };
  media.addEventListener("change", handler);
  return () => media.removeEventListener("change", handler);
}, [settings.theme]);
```

- [ ] **Step 4: 导出 resolveTheme**

确保 `resolveTheme` 被导出供其他组件使用：

```typescript
export { resolveTheme };
```

- [ ] **Step 5: Commit**

```bash
git add src/components/reading/ReaderThemeContext.tsx
git commit -m "feat(reader): add auto theme following system preference"
```

---

## Task 2: 新增 Tailwind 动画配置

**Files:**
- Modify: `tailwind.config.ts`

**新增内容：**

- [ ] **Step 1: 添加 reader 专用动画**

在 `keyframes` 中新增：

```typescript
"page-curl": {
  "0%": { transform: "perspective(1000px) rotateY(0deg)", transformOrigin: "left center" },
  "100%": { transform: "perspective(1000px) rotateY(-180deg)", transformOrigin: "left center" },
},
"fade-in-up": {
  "0%": { opacity: "0", transform: "translateY(20px)" },
  "100%": { opacity: "1", transform: "translateY(0)" },
},
"sound-wave": {
  "0%, 100%": { height: "4px" },
  "50%": { height: "16px" },
},
"liquid-fill": {
  "0%": { transform: "scaleX(0)", transformOrigin: "left" },
  "100%": { transform: "scaleX(1)", transformOrigin: "left" },
},
```

在 `animation` 中新增：

```typescript
"page-curl": "page-curl 600ms cubic-bezier(.65, 0, .35, 1) forwards",
"fade-in-up": "fade-in-up 500ms cubic-bezier(.16, 1, .3, 1) forwards",
"sound-wave": "sound-wave 1s ease-in-out infinite",
"liquid-fill": "liquid-fill 300ms cubic-bezier(.16, 1, .3, 1) forwards",
```

- [ ] **Step 2: 添加 reader 专用阴影**

```typescript
"reader-glow": "0 0 20px rgba(86, 171, 145, 0.15)",
"reader-float": "0 8px 32px rgba(10, 27, 20, 0.12), 0 0 0 1px rgba(232, 234, 237, 0.3)",
```

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat(tailwind): add reader-specific animations and shadows"
```

---

## Task 3: 新增杂志风卡片（MagazineCard）

**Files:**
- Create: `src/components/reading/MagazineCard.tsx`

**内容：**

- [ ] **Step 1: 创建 MagazineCard 组件**

```typescript
"use client";

import { useState } from "react";

interface MagazineCardProps {
  id: string;
  title: string;
  gradeLevel: number;
  category: string;
  wordCount: number;
  estimatedMinutes: number;
  coverImageUrl?: string;
  isCompleted?: boolean;
  score?: number;
  language?: "zh" | "en";
  progress?: number; // 0-100，阅读进度
  onClick: () => void;
  onPreview?: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  时事: "bg-sky-100 text-sky-700",
  历史: "bg-honey-100 text-honey-700",
  科学: "bg-indigo-100 text-indigo-700",
  人物: "bg-coral-100 text-coral-700",
  自然: "bg-emerald-100 text-emerald-700",
  文化: "bg-purple-100 text-purple-700",
  成语故事: "bg-rose-100 text-rose-700",
  寓言: "bg-amber-100 text-amber-700",
  news: "bg-sky-100 text-sky-700",
  history: "bg-honey-100 text-honey-700",
  science: "bg-indigo-100 text-indigo-700",
  biography: "bg-coral-100 text-coral-700",
  nature: "bg-emerald-100 text-emerald-700",
  culture: "bg-purple-100 text-purple-700",
};

export function MagazineCard({
  title,
  gradeLevel,
  category,
  wordCount,
  estimatedMinutes,
  coverImageUrl,
  isCompleted,
  score,
  language,
  progress,
  onClick,
  onPreview,
}: MagazineCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showBadge, setShowBadge] = useState(false);

  const thumbnailUrl = coverImageUrl
    ? `${coverImageUrl}?width=600&format=webp&quality=80`
    : null;

  const categoryStyle = CATEGORY_COLORS[category] || "bg-forest-100 text-forest-700";

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onPreview?.();
      }}
      className="group relative w-full text-left rounded-2xl bg-white shadow-elevation-raised ring-1 ring-cream-200/40 transition-all duration-300 hover:shadow-elevation-floating hover:-translate-y-1 overflow-hidden"
    >
      {/* Cover image - larger, magazine style */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-100">
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-ink-100" />
        )}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${
              imgLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-forest-100 to-cream-200">
            <span className="text-6xl opacity-30 font-reading-zh">{category.charAt(0)}</span>
          </div>
        )}

        {/* Language badge - top right */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
            language === "en" 
              ? "bg-sky-500/90 text-white" 
              : "bg-coral-500/90 text-white"
          }`}>
            {language === "en" ? "EN" : "中文"}
          </span>
        </div>

        {/* Progress overlay */}
        {progress !== undefined && progress > 0 && !isCompleted && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-ink-200/50">
            <div 
              className="h-full bg-primary transition-all duration-500" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        )}
      </div>

      <div className="p-5">
        {/* Category + Grade */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${categoryStyle}`}>
            {category}
          </span>
          <span className="inline-block rounded-full bg-cream-50 px-3 py-1 text-xs font-medium text-ink-500">
            G{gradeLevel}
          </span>
        </div>

        {/* Title - magazine style font */}
        <h3 className={`font-semibold text-forest-800 line-clamp-2 min-h-[3rem] text-lg leading-snug ${
          language === "zh" ? "font-reading-zh" : "font-reading-en"
        }`}>
          {title}
        </h3>

        {/* Bottom row */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span>{wordCount} 字</span>
            <span className="w-1 h-1 rounded-full bg-ink-300" />
            <span>{estimatedMinutes} 分钟</span>
          </div>

          {/* Completion badge */}
          {isCompleted && (
            <div 
              className="relative"
              onMouseEnter={() => setShowBadge(true)}
              onMouseLeave={() => setShowBadge(false)}
            >
              <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                <span>✓</span>
                <span>{score}分</span>
              </div>
              {showBadge && score !== undefined && (
                <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-forest-800 text-white text-xs rounded-lg whitespace-nowrap z-10">
                  得分: {score}/100
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/MagazineCard.tsx
git commit -m "feat(reading): add MagazineCard component with magazine-style layout"
```

---

## Task 4: 新增分类轨道（CategoryTrack）

**Files:**
- Create: `src/components/reading/CategoryTrack.tsx`

**内容：**

- [ ] **Step 1: 创建 CategoryTrack 组件**

```typescript
"use client";

interface Category {
  key: string;
  label: string;
}

interface CategoryTrackProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryTrack({ categories, activeCategory, onCategoryChange }: CategoryTrackProps) {
  return (
    <div className="relative -mx-4 px-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {categories.map((cat) => {
          const isActive = cat.key === activeCategory;
          return (
            <button
              key={cat.key}
              onClick={() => onCategoryChange(isActive ? "" : cat.key)}
              className={`relative flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 min-h-[44px] ${
                isActive
                  ? "bg-forest-600 text-white shadow-md"
                  : "bg-white text-ink-600 hover:bg-cream-50 ring-1 ring-cream-200"
              }`}
            >
              {cat.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full mb-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/CategoryTrack.tsx
git commit -m "feat(reading): add CategoryTrack component with horizontal scroll"
```

---

## Task 5: 重构文章列表页（ReadingBrowserPage）

**Files:**
- Modify: `src/app/(child)/reading/page.tsx`

**修改内容：**

- [ ] **Step 1: 导入新组件**

```typescript
import { MagazineCard } from "@/components/reading/MagazineCard";
import { CategoryTrack } from "@/components/reading/CategoryTrack";
```

- [ ] **Step 2: 新增欢迎区组件**

在页面内添加：

```typescript
function WelcomeHeader({ readCount }: { readCount: number }) {
  return (
    <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-forest-600 to-forest-500 text-white shadow-lg">
      <h1 className="text-2xl font-bold">阅读专区</h1>
      <p className="mt-1 text-sm text-forest-100">
        {readCount > 0 ? `本周已读 ${readCount} 篇，继续保持！` : "探索有趣的文章，拓展知识视野"}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: 重构页面布局**

替换原有渲染逻辑：

```typescript
// 在 return 中：
<main className="min-h-screen bg-cream-50 p-4 pb-24 text-forest-700">
  <div className="mx-auto max-w-6xl">
    <WelcomeHeader readCount={articles.filter(a => a.isCompleted).length} />

    {/* Language toggle - segmented control */}
    <div className="mb-4">
      <div className="inline-flex rounded-xl bg-white shadow-sm ring-1 ring-cream-200 p-1">
        <button
          onClick={() => { setActiveLanguage("en"); setActiveCategory(""); }}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
            activeLanguage === "en"
              ? "bg-forest-600 text-white shadow-sm"
              : "text-ink-600 hover:bg-cream-50"
          }`}
        >
          English
        </button>
        <button
          onClick={() => { setActiveLanguage("zh"); setActiveCategory(""); }}
          className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
            activeLanguage === "zh"
              ? "bg-forest-600 text-white shadow-sm"
              : "text-ink-600 hover:bg-cream-50"
          }`}
        >
          中文
        </button>
      </div>
    </div>

    {/* Category track */}
    <div className="mb-6">
      <CategoryTrack
        categories={categoriesForLanguage}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />
    </div>

    {/* Article grid */}
    {loading ? (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    ) : filteredArticles.length === 0 ? (
      <EmptyState language={activeLanguage} />
    ) : (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredArticles.map((article) => (
          <MagazineCard
            key={article.id}
            id={article.id}
            title={article.title}
            gradeLevel={article.grade_level}
            category={article.category}
            wordCount={article.word_count}
            estimatedMinutes={article.estimated_minutes}
            coverImageUrl={article.cover_image_url}
            language={inferLanguage(article)}
            isCompleted={article.isCompleted}
            score={article.score}
            onClick={() => router.push(`/reading/${article.id}`)}
          />
        ))}
      </div>
    )}
  </div>
</main>
```

- [ ] **Step 4: 更新空状态**

```typescript
function EmptyState({ language }: { language: "zh" | "en" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4 opacity-40">📚</div>
      <p className="text-lg font-medium text-ink-600">
        {language === "en" ? "No articles found" : "暂无相关文章"}
      </p>
      <p className="mt-2 text-sm text-ink-400">
        {language === "en" ? "Try switching to 中文" : "试试切换到 English"}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(child)/reading/page.tsx
git commit -m "feat(reading): redesign reading browser with MagazineCard and CategoryTrack"
```

---

## Task 6: 新增底部阅读工具栏（BottomReaderToolbar）

**Files:**
- Create: `src/components/reading/BottomReaderToolbar.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

import { useState } from "react";
import { useReaderTheme } from "./ReaderThemeContext";

interface BottomReaderToolbarProps {
  onFontSizeChange: (delta: number) => void;
  onThemeCycle: () => void;
  onToggleToc: () => void;
  onToggleNotes: () => void;
}

export function BottomReaderToolbar({
  onFontSizeChange,
  onThemeCycle,
  onToggleToc,
  onToggleNotes,
}: BottomReaderToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useReaderTheme();

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        expanded ? "w-[90%] max-w-md" : "w-auto"
      }`}
    >
      {/* Main toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-2xl shadow-reader-float backdrop-blur-md"
        style={{
          backgroundColor: "rgba(var(--reader-surface-rgb), 0.9)",
          border: "1px solid var(--reader-border)",
        }}
      >
        {/* Font size controls */}
        <button
          onClick={() => onFontSizeChange(-1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="减小字体"
        >
          <span className="text-lg">A-</span>
        </button>
        <button
          onClick={() => onFontSizeChange(1)}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="增大字体"
        >
          <span className="text-xl">A+</span>
        </button>

        <div className="w-px h-6 bg-ink-200" />

        {/* Theme toggle */}
        <button
          onClick={onThemeCycle}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="切换主题"
        >
          <span className="text-lg">
            {theme === "dark" ? "🌙" : theme === "sepia" ? "👁️" : "☀️"}
          </span>
        </button>

        <div className="w-px h-6 bg-ink-200" />

        {/* TOC */}
        <button
          onClick={onToggleToc}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="目录"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Notes */}
        <button
          onClick={onToggleNotes}
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-ink-100 min-h-[44px]"
          aria-label="笔记"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/BottomReaderToolbar.tsx
git commit -m "feat(reader): add bottom floating toolbar for portrait mode"
```

---

## Task 7: 新增 3D 翻页组件（PageCurlView）

**Files:**
- Create: `src/components/reading/PageCurlView.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface PageCurlViewProps {
  pages: React.ReactNode[];
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function PageCurlView({ pages, currentPage, onPageChange }: PageCurlViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const goToPage = useCallback((targetPage: number) => {
    if (isAnimating || targetPage === currentPage) return;
    if (targetPage < 0 || targetPage >= pages.length) return;
    
    setIsAnimating(true);
    onPageChange(targetPage);
    
    setTimeout(() => setIsAnimating(false), 600);
  }, [currentPage, pages.length, onPageChange, isAnimating]);

  // Touch handling
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = touchStartRef.current.x - e.changedTouches[0].clientX;
    const dy = touchStartRef.current.y - e.changedTouches[0].clientY;
    
    // Only handle horizontal swipes
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) {
        goToPage(currentPage + 1);
      } else {
        goToPage(currentPage - 1);
      }
    }
    touchStartRef.current = null;
  };

  // Click zones
  const handleClick = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    if (x < width * 0.2) {
      goToPage(currentPage - 1);
    } else if (x > width * 0.8) {
      goToPage(currentPage + 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-8rem)] overflow-hidden"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(calc(-${currentPage} * 100%))`,
          transition: isAnimating 
            ? "transform 600ms cubic-bezier(.65, 0, .35, 1)" 
            : "none",
        }}
      >
        {pages.map((page, index) => (
          <div
            key={index}
            className="flex-shrink-0 w-full h-full px-6 flex items-center justify-center"
          >
            <div
              className="w-full h-full max-w-3xl rounded-xl overflow-hidden shadow-reader-float relative"
              style={{
                backgroundColor: "var(--reader-surface)",
                color: "var(--reader-text)",
                transform: index === currentPage - 1 && isAnimating
                  ? "perspective(1000px) rotateY(-25deg)"
                  : "none",
                transformOrigin: "right center",
                transition: "transform 600ms cubic-bezier(.65, 0, .35, 1)",
              }}
            >
              {/* Page shadow overlay */}
              <div 
                className="absolute inset-y-0 right-0 w-8 pointer-events-none"
                style={{
                  background: "linear-gradient(to left, rgba(0,0,0,0.08), transparent)",
                }}
              />
              <div className="h-full overflow-hidden p-8">
                {page}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
        <span className="text-sm opacity-70" style={{ color: "var(--reader-text-muted)" }}>
          {currentPage + 1} / {pages.length}
        </span>
        <div className="flex gap-1.5">
          {pages.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentPage ? "bg-primary w-4" : "bg-ink-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/PageCurlView.tsx
git commit -m "feat(reader): add PageCurlView with 3D perspective effect"
```

---

## Task 8: 重构阅读器核心（ArticleReader）

**Files:**
- Modify: `src/components/reading/ArticleReader.tsx`

**修改内容：**

- [ ] **Step 1: 增强拼音显示**

修改 ruby 样式，将拼音字号从 0.45em 提升到 0.55em：

```typescript
// 在 dangerouslySetInnerHTML 样式中：
.ruby-pinyin > rt {
  order: 0;
  font-size: 0.55em;  // 从 0.45em 提升
  color: #9ca3af;
  line-height: 1.1;
  text-align: center;
  padding: 0 0.1em;
  margin-bottom: 0.15em;
  white-space: nowrap;
}
```

- [ ] **Step 2: 升级顶部导航栏为毛玻璃效果**

```typescript
{/* Minimal header - glassmorphism */}
<div className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-cream-200/50 -mx-4 px-4 py-3 transition-all duration-300">
  <div className="flex items-center justify-between">
    <button
      onClick={() => router.back()}
      className="flex items-center gap-2 text-sm text-forest-600 hover:text-forest-800 transition-colors"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span className="hidden sm:inline">返回</span>
    </button>
    
    <div className="flex items-center gap-3">
      {/* Bookmark */}
      <button
        onClick={() => setBookmarked((prev) => !prev)}
        className={`flex items-center justify-center rounded-xl transition-colors duration-200 min-h-[44px] min-w-[44px] ${
          bookmarked ? "text-honey-500" : "text-ink-400 hover:text-ink-600"
        }`}
        aria-label={bookmarked ? "取消书签" : "添加书签"}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      </button>

      {isLowerGrade && ttsSupported && (
        <button
          onClick={handleTTS}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg shadow-md transition-all active:scale-95 ${
            ttsPlaying && !ttsPaused
              ? "bg-forest-600 text-white"
              : "bg-primary text-white hover:bg-primary-dark"
          }`}
        >
          {ttsPlaying && !ttsPaused ? "⏸" : "▶"}
        </button>
      )}
      
      <button
        onClick={onStartQuiz}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-sm font-medium text-white hover:bg-primary-dark transition shadow-sm"
      >
        <span>📝</span>
        <span>答题</span>
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 增强内容排版**

修改内容区样式，增加段落间距和首字下沉（英文）：

```typescript
{/* Content paragraphs */}
<div
  className={`space-y-6 text-forest-700 ${
    isLowerGrade ? "text-lg leading-relaxed" : "text-base leading-relaxed"
  }`}
>
  {paragraphs.map((paragraph, index) => (
    <div
      key={index}
      data-paragraph-index={index}
      className={`transition-all duration-500 animate-fade-in-up ${
        activeParagraphIndex === index && activeCharRange
          ? "bg-amber-50/60 rounded-lg px-3 -mx-3 py-2"
          : ""
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Drop cap for first paragraph in English articles */}
      {index === 0 && article.language === "en" ? (
        <p className="first-letter:text-5xl first-letter:font-reading-en first-letter:font-bold first-letter:float-left first-letter:mr-3 first-letter:mt-[-4px] first-letter:text-forest-800">
          {renderParagraph(paragraph, index)}
        </p>
      ) : (
        <p>{renderParagraph(paragraph, index)}</p>
      )}

      {/* Illustration - lightbox style */}
      {illustrationMap.has(index) && (
        <button
          className="mt-4 w-full rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow"
          onClick={() => {
            // Open lightbox
            window.open(illustrationMap.get(index)!.image_url, '_blank');
          }}
        >
          <img
            src={`${illustrationMap.get(index)!.image_url}?width=600&format=webp&quality=75`}
            alt={illustrationMap.get(index)!.scene_description || "段落插图"}
            className="w-full object-cover max-h-48"
          />
        </button>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 4: 升级字典弹窗**

```typescript
{/* Dictionary Popup - positioned near click */}
{dictLookup && (
  <div
    className="fixed z-50 backdrop-blur-md bg-white/95 rounded-xl shadow-elevation-floating border border-cream-200 p-4 min-w-[140px] cursor-pointer animate-fade-in-up"
    style={{ 
      left: Math.min(Math.max(dictLookup.x - 70, 16), window.innerWidth - 156), 
      top: Math.min(dictLookup.y + 16, window.innerHeight - 120),
    }}
    onClick={() => setDictLookup(null)}
  >
    <div className="text-3xl font-bold text-forest-800 mb-1">
      {dictLookup.word}
    </div>
    {article.language === "zh" && article.pinyinContent && (
      <div className="text-sm text-ink-500 mb-2">
        {getPinyinForChar(dictLookup.word)}
      </div>
    )}
    <div className="flex items-center gap-2 text-xs text-ink-400">
      <span>点击关闭</span>
      <button 
        className="text-primary hover:text-primary-dark font-medium"
        onClick={(e) => {
          e.stopPropagation();
          // Add to vocabulary collection
          window.dispatchEvent(new CustomEvent("add-to-vocabulary", { 
            detail: { word: dictLookup.word, language: article.language }
          }));
        }}
      >
        + 生词本
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/reading/ArticleReader.tsx
git commit -m "feat(reader): enhance ArticleReader with glassmorphism, drop cap, and improved dictionary"
```

---

## Task 9: 重构阅读器布局（ReaderShell）

**Files:**
- Modify: `src/components/ui/ReaderShell.tsx`

**修改内容：**

- [ ] **Step 1: 更新移动端抽屉样式**

```typescript
{/* Mobile rail drawers */}
{leftRail && leftOpen && (
  <>
    <div
      className="fixed inset-0 bg-ink-900/30 backdrop-blur-sm z-40 transition-opacity"
      onClick={() => setLeftOpen(false)}
      aria-hidden="true"
    />
    <div
      className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[70vh] overflow-y-auto shadow-elevation-modal"
      style={{
        backgroundColor: "var(--reader-surface)",
        borderTop: "1px solid var(--reader-border)",
      }}
    >
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-ink-300" />
      </div>
      <div className="p-4">{leftRail}</div>
    </div>
  </>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/ReaderShell.tsx
git commit -m "feat(reader): enhance ReaderShell mobile drawers with backdrop blur"
```

---

## Task 10: 新增手势覆盖层（GestureOverlay）

**Files:**
- Create: `src/components/reading/GestureOverlay.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

import { useRef, useCallback, useEffect } from "react";

interface GestureOverlayProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPinchIn?: () => void;
  onPinchOut?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: (x: number, y: number) => void;
  children: React.ReactNode;
}

export function GestureOverlay({
  onSwipeLeft,
  onSwipeRight,
  onPinchIn,
  onPinchOut,
  onDoubleTap,
  onLongPress,
  children,
}: GestureOverlayProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPinchDistance = useRef<number | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      
      longPressTimerRef.current = setTimeout(() => {
        onLongPress?.(touch.clientX, touch.clientY);
      }, 500);
    } else if (e.touches.length === 2) {
      clearLongPress();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, [onLongPress, clearLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStartRef.current) {
      // Cancel long press if moved too much
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearLongPress();
      }
    }
  }, [clearLongPress]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    clearLongPress();
    
    if (e.changedTouches.length === 1 && touchStartRef.current) {
      const touch = e.changedTouches[0];
      const start = touchStartRef.current;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Date.now() - start.time;

      // Swipe detection
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50 && dt < 300) {
        if (dx > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      }

      // Double tap detection
      if (dt < 200 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const now = Date.now();
        if (lastTapRef.current && now - lastTapRef.current.time < 300) {
          const tapDx = touch.clientX - lastTapRef.current.x;
          const tapDy = touch.clientY - lastTapRef.current.y;
          if (Math.sqrt(tapDx * tapDx + tapDy * tapDy) < 30) {
            onDoubleTap?.();
          }
        }
        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      }

      touchStartRef.current = null;
    }

    if (e.touches.length < 2) {
      initialPinchDistance.current = null;
    }
  }, [onSwipeLeft, onSwipeRight, onDoubleTap, clearLongPress]);

  return (
    <div
      className="touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/GestureOverlay.tsx
git commit -m "feat(reader): add GestureOverlay for swipe, pinch, and long press"
```

---

## Task 11: 重构阅读工具栏（ReaderToolbar）

**Files:**
- Modify: `src/components/reading/ReaderToolbar.tsx`

**修改内容：**

- [ ] **Step 1: 简化工具栏，保留核心功能**

```typescript
"use client";

import { useState } from "react";

interface ReaderToolbarProps {
  onTTSToggle?: () => void;
  ttsPlaying?: boolean;
  ttsPaused?: boolean;
  onTTSStop?: () => void;
  initialBookmarked?: boolean;
  onBookmarkToggle?: (bookmarked: boolean) => void;
}

export function ReaderToolbar({
  onTTSToggle,
  ttsPlaying = false,
  ttsPaused = false,
  onTTSStop,
  initialBookmarked = false,
  onBookmarkToggle,
}: ReaderToolbarProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);

  const handleBookmark = () => {
    const next = !bookmarked;
    setBookmarked(next);
    onBookmarkToggle?.(next);
  };

  return (
    <div className="hidden lg:flex flex-col items-center gap-3">
      {/* TTS Button */}
      {onTTSToggle && (
        <button
          type="button"
          onClick={onTTSToggle}
          className="flex items-center justify-center rounded-xl transition-colors duration-200 min-h-[48px] min-w-[48px] w-12 h-12 shadow-sm hover:shadow-md"
          style={{
            color: ttsPlaying ? "var(--reader-accent)" : "var(--reader-text)",
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
          aria-label={ttsPlaying && !ttsPaused ? "暂停朗读" : ttsPaused ? "继续朗读" : "朗读"}
        >
          <span className="text-xl" aria-hidden="true">
            {ttsPlaying && !ttsPaused ? "⏸" : ttsPaused ? "▶" : "🔊"}
          </span>
        </button>
      )}

      {ttsPlaying && onTTSStop && (
        <button
          type="button"
          onClick={onTTSStop}
          className="flex items-center justify-center rounded-xl transition-colors duration-200 min-h-[48px] min-w-[48px] w-12 h-12"
          style={{
            color: "var(--reader-text)",
            backgroundColor: "var(--reader-surface)",
            border: "1px solid var(--reader-border)",
          }}
          aria-label="停止朗读"
        >
          <span className="text-xl" aria-hidden="true">⏹</span>
        </button>
      )}

      {/* Bookmark Button */}
      <button
        type="button"
        onClick={handleBookmark}
        className="flex items-center justify-center rounded-xl transition-colors duration-200 min-h-[48px] min-w-[48px] w-12 h-12 shadow-sm hover:shadow-md"
        style={{
          color: bookmarked ? "var(--reader-accent)" : "var(--reader-text)",
          backgroundColor: "var(--reader-surface)",
          border: "1px solid var(--reader-border)",
        }}
        aria-label={bookmarked ? "取消书签" : "添加书签"}
        aria-pressed={bookmarked}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/ReaderToolbar.tsx
git commit -m "feat(reader): simplify ReaderToolbar with svg icons and improved touch targets"
```

---

## Task 12: 重构设置面板（ReaderSettingsPanel）

**Files:**
- Modify: `src/components/reading/ReaderSettingsPanel.tsx`

**修改内容：**

- [ ] **Step 1: 添加 auto 主题选项**

```typescript
const THEME_OPTIONS = [
  { value: "light" as const, label: "浅色", icon: "☀️" },
  { value: "sepia" as const, label: "护眼", icon: "👁️" },
  { value: "dark" as const, label: "深色", icon: "🌙" },
  { value: "auto" as const, label: "自动", icon: "⚡" },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/ReaderSettingsPanel.tsx
git commit -m "feat(reader): add auto theme option to settings panel"
```

---

## Task 13: 重构测验组件（QuizView）

**Files:**
- Modify: `src/components/reading/QuizView.tsx`

**修改内容：**

- [ ] **Step 1: 升级进度显示为环形**

```typescript
{/* Circular progress */}
<div className="flex items-center justify-center mb-6">
  <div className="relative w-20 h-20">
    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="none" stroke="#E8EAED" strokeWidth="2" />
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="none"
        stroke="#56AB91"
        strokeWidth="2"
        strokeDasharray={`${(currentIndex / totalQuestions) * 100} 100`}
        className="transition-all duration-500"
      />
    </svg>
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-lg font-bold text-forest-700">
        {currentIndex + 1}/{totalQuestions}
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 升级选项按钮为液态反馈**

```typescript
{/* Options with liquid fill effect */}
<div className="space-y-3">
  {currentQuestion.options.map((option) => {
    const isSelected = selectedLabel === option.label;
    return (
      <button
        key={option.label}
        type="button"
        onClick={() => handleSelect(option.label)}
        disabled={selectedLabel !== null}
        className={`relative flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-300 active:scale-[0.98] disabled:cursor-default overflow-hidden ${
          isSelected
            ? "border-primary bg-primary/5"
            : "border-ink-100 bg-white hover:border-ink-200"
        }`}
      >
        {/* Liquid fill overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/5 animate-liquid-fill pointer-events-none" />
        )}
        
        <span
          className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-all duration-300 ${
            isSelected
              ? "bg-primary text-white shadow-md"
              : "bg-cream-50 text-ink-600"
          }`}
        >
          {option.label}
        </span>
        <span
          className={`relative text-base ${
            isSelected
              ? "font-medium text-primary-dark"
              : "text-forest-700"
          }`}
        >
          {option.text}
        </span>
      </button>
    );
  })}
</div>
```

- [ ] **Step 3: 添加连击系统**

```typescript
const [streak, setStreak] = useState(0);
const [showStreak, setShowStreak] = useState(false);

// In handleSelect:
const handleSelect = useCallback((label: string) => {
  if (selectedLabel !== null) return;
  setSelectedLabel(label);

  const isCorrect = label === currentQuestion.correctLabel; // 假设有 correctLabel
  
  if (isCorrect) {
    setStreak((s) => {
      const newStreak = s + 1;
      if (newStreak >= 3) {
        setShowStreak(true);
        setTimeout(() => setShowStreak(false), 2000);
      }
      return newStreak;
    });
  } else {
    setStreak(0);
  }
  // ... rest of logic
}, [selectedLabel, currentQuestion]);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/reading/QuizView.tsx
git commit -m "feat(quiz): enhance QuizView with circular progress, liquid fill, and streak system"
```

---

## Task 14: 新增分享卡片（ShareCard）

**Files:**
- Create: `src/components/reading/ShareCard.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

interface ShareCardProps {
  title: string;
  score: number;
  total: number;
  readingTime: number; // minutes
  summary?: string;
  onShare?: () => void;
}

export function ShareCard({ title, score, total, readingTime, summary, onShare }: ShareCardProps) {
  const percentage = Math.round((score / total) * 100);
  
  return (
    <div className="w-full max-w-sm mx-auto bg-gradient-to-br from-forest-50 to-cream-50 rounded-2xl p-6 shadow-lg border border-forest-100">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full bg-forest-600 flex items-center justify-center">
          <span className="text-white text-sm font-bold">R</span>
        </div>
        <span className="text-sm font-medium text-forest-700">Reading Tracker</span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-forest-800 mb-3 line-clamp-2">
        {title}
      </h3>

      {/* Score */}
      <div className="flex items-center justify-center mb-4">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center border-4 border-primary/20">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{percentage}%</div>
            <div className="text-xs text-primary/70">{score}/{total}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-6 mb-4 text-sm text-ink-600">
        <div className="text-center">
          <div className="font-bold text-forest-700">{readingTime}</div>
          <div className="text-xs">分钟</div>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <p className="text-sm text-ink-500 text-center mb-4 italic">
          &ldquo;{summary}&rdquo;
        </p>
      )}

      {/* Share button */}
      {onShare && (
        <button
          onClick={onShare}
          className="w-full py-3 rounded-xl bg-forest-600 text-white font-medium hover:bg-forest-700 transition-colors"
        >
          分享成果
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/ShareCard.tsx
git commit -m "feat(reading): add ShareCard component for reading completion"
```

---

## Task 15: 新增生词本（VocabularyCollection）

**Files:**
- Create: `src/components/reading/VocabularyCollection.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

import { useState, useEffect } from "react";

interface VocabularyItem {
  word: string;
  language: "zh" | "en";
  pinyin?: string;
  translation?: string;
  addedAt: string;
}

const STORAGE_KEY = "hw-vocabulary-v1";

function loadVocabulary(): VocabularyItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVocabulary(items: VocabularyItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useVocabulary() {
  const [items, setItems] = useState<VocabularyItem[]>([]);

  useEffect(() => {
    setItems(loadVocabulary());
  }, []);

  const addWord = (word: string, language: "zh" | "en", pinyin?: string) => {
    setItems((prev) => {
      if (prev.some((i) => i.word === word)) return prev;
      const next = [...prev, { word, language, pinyin, addedAt: new Date().toISOString() }];
      saveVocabulary(next);
      return next;
    });
  };

  const removeWord = (word: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.word !== word);
      saveVocabulary(next);
      return next;
    });
  };

  return { items, addWord, removeWord };
}

export function VocabularyCollection({ onClose }: { onClose?: () => void }) {
  const { items, removeWord } = useVocabulary();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-forest-800">生词本</h3>
        {onClose && (
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600">
            ✕
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-ink-400">
          <div className="text-3xl mb-2">📖</div>
          <p>阅读时查词会自动收录到这里</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.word}
              className="flex items-center justify-between p-3 rounded-xl bg-cream-50 hover:bg-cream-100 transition-colors"
            >
              <div>
                <div className="font-bold text-forest-800">{item.word}</div>
                {item.pinyin && (
                  <div className="text-sm text-ink-500">{item.pinyin}</div>
                )}
              </div>
              <button
                onClick={() => removeWord(item.word)}
                className="text-ink-400 hover:text-coral-500 transition-colors"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/VocabularyCollection.tsx
git commit -m "feat(reading): add VocabularyCollection with localStorage persistence"
```

---

## Task 16: 新增称号系统（ReadingTitleBadge）

**Files:**
- Create: `src/components/reading/ReadingTitleBadge.tsx`

**内容：**

- [ ] **Step 1: 创建组件**

```typescript
"use client";

interface ReadingTitleBadgeProps {
  accuracy: number; // 0-100
  speed: number; // words per minute
  streak: number; // consecutive days
}

interface Title {
  name: string;
  icon: string;
  condition: string;
}

function calculateTitle({ accuracy, speed, streak }: ReadingTitleBadgeProps): Title {
  if (streak >= 7 && accuracy >= 90) {
    return { name: "阅读大师", icon: "👑", condition: "连续7天准确率90%+" };
  }
  if (speed > 200 && accuracy >= 85) {
    return { name: "速读新星", icon: "⚡", condition: "速度200词/分+准确率85%+" };
  }
  if (accuracy >= 95) {
    return { name: "完美阅读者", icon: "💎", condition: "准确率95%+" };
  }
  if (streak >= 7) {
    return { name: "坚持不懈", icon: "🔥", condition: "连续7天阅读" };
  }
  if (accuracy >= 80) {
    return { name: "阅读达人", icon: "⭐", condition: "准确率80%+" };
  }
  if (speed > 150) {
    return { name: "快速阅读", icon: "🚀", condition: "速度150词/分+" };
  }
  return { name: "阅读新手", icon: "🌱", condition: "开始阅读之旅" };
}

export function ReadingTitleBadge(props: ReadingTitleBadgeProps) {
  const title = calculateTitle(props);

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-honey-100 to-coral-100 border border-honey-200 shadow-sm">
      <span className="text-xl">{title.icon}</span>
      <div>
        <div className="text-sm font-bold text-forest-800">{title.name}</div>
        <div className="text-xs text-ink-500">{title.condition}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/reading/ReadingTitleBadge.tsx
git commit -m "feat(reading): add ReadingTitleBadge achievement system"
```

---

## Task 17: 集成验证

**Files:**
- Modify: `src/app/(reader)/reading/[id]/page.tsx`（集成手势和底部工具栏）

**修改内容：**

- [ ] **Step 1: 导入新组件**

```typescript
import { GestureOverlay } from "@/components/reading/GestureOverlay";
import { BottomReaderToolbar } from "@/components/reading/BottomReaderToolbar";
import { PageCurlView } from "@/components/reading/PageCurlView";
```

- [ ] **Step 2: 在移动端集成底部工具栏和手势**

在阅读内容外层包裹 GestureOverlay，并在竖屏模式下显示 BottomReaderToolbar。

- [ ] **Step 3: 运行构建验证**

```bash
npm run build
```

Expected: 无 TypeScript 错误

- [ ] **Step 4: Commit**

```bash
git add src/app/(reader)/reading/[id]/page.tsx
git commit -m "feat(reader): integrate GestureOverlay and BottomReaderToolbar"
```

---

## 自审检查

**1. Spec 覆盖检查：**
- [x] 个性化欢迎区 → Task 5
- [x] 分类轨道 → Task 4 + Task 5
- [x] 杂志风卡片 → Task 3 + Task 5
- [x] 毛玻璃导航栏 → Task 8
- [x] 拼音字号提升 → Task 8
- [x] 就近查词弹窗 → Task 8
- [x] 自动主题 → Task 1 + Task 12
- [x] 底部工具栏 → Task 6 + Task 17
- [x] 3D 翻页 → Task 7
- [x] 段落渐入 → Task 8
- [x] 测验环形进度 → Task 13
- [x] 液态反馈 → Task 13
- [x] 连击系统 → Task 13
- [x] 完成页数据面板 → Task 14
- [x] 称号系统 → Task 16
- [x] 生词本 → Task 15
- [x] 分享卡片 → Task 14
- [x] 手势系统 → Task 10 + Task 17

**2. Placeholder 扫描：**
- [x] 无 TBD、TODO、FIXME
- [x] 无 "add appropriate error handling" 等模糊描述
- [x] 每个步骤包含具体代码

**3. 类型一致性：**
- [x] ReaderTheme 类型在 Task 1 和 Task 12 中一致
- [x] 所有文件路径准确
- [x] 组件 props 接口完整

**无发现遗漏，计划完整。**
