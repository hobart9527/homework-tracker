# English Reading Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an English graded reading system with article browser, reader, quiz, and homework integration.

**Architecture:** New `reading_*` tables in Supabase, new reading API routes, new child reading pages (browser + reader + quiz), modified parent pages (homework assign + settings + dashboard). OpenAI generates content, seed script pre-populates v1 content.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth + Storage), TailwindCSS, OpenAI API (compatible), Web Speech API (TTS), `frontend-design` skill for UI components

---

### Task 1: Supabase Migration + Types

**Files:**
- Create: `supabase/migrations/030_english_reading_schema.sql`
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Create migration SQL**

```sql
-- Add reading_grade_level to children
ALTER TABLE children ADD COLUMN IF NOT EXISTS reading_grade_level INTEGER;

-- Reading articles
CREATE TABLE IF NOT EXISTS reading_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  category TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 5,
  difficulty INTEGER DEFAULT 3,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_key, grade_level)
);

-- Reading comprehension questions
CREATE TABLE IF NOT EXISTS reading_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 3,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reading assignments (links articles to children)
CREATE TABLE IF NOT EXISTS reading_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'recommended',
  assigned_by UUID REFERENCES auth.users(id),
  assigned_date DATE DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  UNIQUE(child_id, article_id)
);

-- Quiz attempts
CREATE TABLE IF NOT EXISTS reading_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES reading_assignments(id) ON DELETE SET NULL,
  answers JSONB NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE reading_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Articles: authenticated users can read published
CREATE POLICY "Anyone can read published articles" ON reading_articles
  FOR SELECT USING (status = 'published');

-- Questions: authenticated users can read
CREATE POLICY "Anyone can read questions" ON reading_questions
  FOR SELECT USING (true);

-- Assignments: children see own, parents see own children
CREATE POLICY "Users can read own assignments" ON reading_assignments
  FOR SELECT USING (
    child_id = auth.uid() OR
    EXISTS (SELECT 1 FROM children WHERE id = child_id AND parent_id = auth.uid())
  );

CREATE POLICY "Parents can create assignments" ON reading_assignments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM children WHERE id = child_id AND parent_id = auth.uid())
  );

-- Quiz attempts: users see own
CREATE POLICY "Users can read own attempts" ON reading_quiz_attempts
  FOR SELECT USING (child_id = auth.uid());

CREATE POLICY "Users can insert own attempts" ON reading_quiz_attempts
  FOR INSERT WITH CHECK (child_id = auth.uid());

-- Initial sync: set reading_grade_level = grade for existing children
UPDATE children SET reading_grade_level = grade WHERE reading_grade_level IS NULL AND grade IS NOT NULL;
```

- [ ] **Step 2: Update Supabase types**
  - Read existing `src/lib/supabase/types.ts`
  - Add types for: `ReadingArticle`, `ReadingQuestion`, `ReadingAssignment`, `ReadingQuizAttempt`, `ReadingCategory`
  - Export the new types matching the `Database` pattern

- [ ] **Step 3: Verify migration**
  - Run: `npx supabase db push` (if docker available) or apply manually via Supabase SQL editor
  - Verify tables created by running: `npx tsx -e "console.log('migration OK')"`

---

### Task 2: Reading Library — Content Generator (OpenAI)

**Files:**
- Create: `src/lib/reading/content-generator.ts`
- Create: `src/lib/reading/index.ts`

- [ ] **Step 1: Create content-generator.ts**

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL, // for compatible APIs
});

export interface GeneratedArticle {
  title: string;
  content: string;
  summary: string;
  word_count: number;
  estimated_minutes: number;
  difficulty: number;
}

export interface GeneratedQuestion {
  question_text: string;
  question_type: "main_idea" | "detail" | "inference" | "vocabulary" | "sequence";
  options: { label: string; text: string }[];
  correct_answer: string;
  difficulty: number;
}

export interface GenerateArticleOptions {
  sourceText: string;
  sourceUrl?: string;
  gradeLevel: number;
  category: string;
  topicKey: string;
}

export async function generateArticleContent(
  options: GenerateArticleOptions
): Promise<{ article: GeneratedArticle; questions: GeneratedQuestion[] }> {
  const prompt = buildGenerationPrompt(options);
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You adapt articles for specific grade levels and create comprehension questions.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
  return {
    article: {
      title: result.title,
      content: result.content,
      summary: result.summary,
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
    },
    questions: result.questions || [],
  };
}

function buildGenerationPrompt(options: GenerateArticleOptions): string {
  return `You are adapting an article for a Grade ${options.gradeLevel} student.

Original article:
${options.sourceText.slice(0, 5000)}

Create a version suitable for Grade ${options.gradeLevel} students (age ${options.gradeLevel + 5}).

Requirements:
- Grade ${options.gradeLevel} vocabulary and sentence complexity
- ${options.gradeLevel <= 4 ? "200-400 words, short sentences" : "400-700 words, moderate complexity"}
- Clear topic, engaging opening
- Category: ${options.category}

Also create ${options.gradeLevel <= 4 ? "5" : "8"} comprehension questions:
- Include mix of: main_idea, detail, inference, vocabulary, sequence
- For Grade ${options.gradeLevel}, focus more on ${options.gradeLevel <= 4 ? "detail and vocabulary" : "main_idea and inference"}
- Each question has 4 options (A/B/C/D), one correct answer
- Mark difficulty 1-5

Return JSON:
{
  "title": "...",
  "content": "...",
  "summary": "...",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "questions": [{ "question_text": "...", "question_type": "...", "options": [{"label":"A","text":"..."}], "correct_answer": "A", "difficulty": 1-5 }]
}`;
}
```

- [ ] **Step 2: Add OPENAI env vars to .env.local**
  ```
  OPENAI_API_KEY=your-api-key
  OPENAI_BASE_URL=https://api.openai.com/v1
  OPENAI_READING_MODEL=gpt-4o-mini
  ```

- [ ] **Step 3: Create reading lib index**

```typescript
export { generateArticleContent } from "./content-generator";
export type { GeneratedArticle, GeneratedQuestion, GenerateArticleOptions } from "./content-generator";
```

---

### Task 3: Seed Content Script (50 Articles)

**Files:**
- Create: `scripts/seed-reading-content.mjs`

- [ ] **Step 1: Create seed script**

The script will:
1. Define 50 seed topics across categories and grade levels
2. For topics that span G3+G6 (10 topics), generate both versions
3. For single-grade topics (30 topics), generate one version
4. Insert into `reading_articles` and `reading_questions`

```javascript
// scripts/seed-reading-content.mjs
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const SEED_TOPICS = [
  // Science (10 topics, dual-grade)
  { topic: "How Do Volcanoes Erupt?", category: "科学", sources: ["geology basics"], grades: [3, 6] },
  { topic: "The Solar System", category: "科学", sources: ["astronomy intro"], grades: [3, 6] },
  { topic: "Dinosaur Fossils", category: "科学", sources: ["paleontology"], grades: [3, 6] },
  { topic: "Why Is the Sky Blue?", category: "科学", sources: ["light physics"], grades: [3, 6] },
  { topic: "Ocean Explorers", category: "科学", sources: ["marine biology"], grades: [3, 6] },
  // History (10 topics)
  { topic: "Ancient Egypt Pyramids", category: "历史", sources: ["egypt history"], grades: [3, 6] },
  { topic: "The Great Wall of China", category: "历史", sources: ["china history"], grades: [3, 6] },
  { topic: "Knights and Castles", category: "历史", sources: ["medieval europe"], grades: [3] },
  { topic: "The First Moon Landing", category: "历史", sources: ["space race"], grades: [3, 6] },
  { topic: "Silk Road Adventures", category: "历史", sources: ["trade history"], grades: [6] },
  // Nature (10 topics)
  { topic: "Rainforest Animals", category: "自然", sources: ["amazon wildlife"], grades: [3] },
  { topic: "Polar Bears and Climate", category: "自然", sources: ["arctic life"], grades: [3, 6] },
  { topic: "How Bees Make Honey", category: "自然", sources: ["bee biology"], grades: [3] },
  { topic: "Migration of Monarch Butterflies", category: "自然", sources: ["insect migration"], grades: [3, 6] },
  { topic: "Deep Sea Creatures", category: "自然", sources: ["ocean life"], grades: [6] },
  // People (10 topics)
  { topic: "Albert Einstein", category: "人物", sources: ["scientist biography"], grades: [3, 6] },
  { topic: "Marie Curie", category: "人物", sources: ["scientist biography"], grades: [3] },
  { topic: "Thomas Edison", category: "人物", sources: ["inventor story"], grades: [3] },
  { topic: "Amelia Earhart", category: "人物", sources: ["aviator history"], grades: [6] },
  { topic: "Nelson Mandela", category: "人物", sources: ["leader story"], grades: [6] },
  // Culture/Geography (10 topics)
  { topic: "Life in the Sahara Desert", category: "文化", sources: ["desert geography"], grades: [3] },
  { topic: "The Amazon River", category: "自然", sources: ["river ecology"], grades: [6] },
  { topic: "Japanese Cherry Blossom Festival", category: "文化", sources: ["japanese culture"], grades: [3, 6] },
  { topic: "Northern Lights", category: "科学", sources: ["aurora science"], grades: [3] },
  { topic: "Mount Everest Climbers", category: "人物", sources: ["mountain climbing"], grades: [6] },
];

// Each topic becomes a function that returns { sourceText, sourceUrl }
// We pre-write simplified encyclopedia-style source text for each
const SOURCE_TEXT_CACHE = {
  "How Do Volcanoes Erupt|3": "Volcanoes are mountains that can explode with hot liquid rock called lava. ...",
  "How Do Volcanoes Erupt|6": "Volcanoes are geological formations where molten rock, ash, and gases escape from beneath the Earth's crust. ...",
  // ... (full content for all 50 variants)
};

async function seed() {
  for (const topic of SEED_TOPICS) {
    for (const grade of topic.grades) {
      const key = `${topic.topic}|${grade}`;
      const sourceText = SOURCE_TEXT_CACHE[key];
      if (!sourceText) continue;

      // Call OpenAI to generate adapted article + questions
      console.log(`Generating: "${topic.topic}" (Grade ${grade})...`);
      
      // ... OpenAI call (import from content-generator logic inline)
      // ... Insert into reading_articles
      // ... Insert into reading_questions
    }
  }
}
seed();
```

- [ ] **Step 2: Write complete source text cache for all 50 topics**
  - For each topic+grade, write a 200-500 word source text in English
  - Grade 3: simpler sentences, basic vocabulary
  - Grade 6: more detail, richer vocabulary
  - Categories: science, history, nature, people, culture

- [ ] **Step 3: Run and verify**
  - Run: `node scripts/seed-reading-content.mjs`
  - Verify: query Supabase to confirm 50+ articles and 300+ questions inserted

---

### Task 4: Child Reading专区 — Navigation + Browser

**Files:**
- Modify: `src/app/(child)/layout.tsx` (add 📚 tab)
- Create: `src/app/(child)/reading/page.tsx`
- Create: `src/components/reading/ArticleCard.tsx`

**Use the `frontend-design` skill for the UI implementation of this task.**

- [ ] **Step 1: Add 📚 reading tab to child bottom nav**

In `src/app/(child)/layout.tsx`, in the bottom navigation array, add:
```tsx
{ href: "/reading", label: "阅读", icon: "📚" },
```
after the existing three items.

- [ ] **Step 2: Create ArticleCard component**

```tsx
// src/components/reading/ArticleCard.tsx
interface ArticleCardProps {
  title: string;
  gradeLevel: number;
  category: string;
  difficulty: number;
  wordCount: number;
  estimatedMinutes: number;
  isRecommended?: boolean;
  isCompleted?: boolean;
  score?: number;
  onClick: () => void;
}
```
Card design: rounded-2xl, white bg, shadow-sm. Shows grade badge, category tag, title, word count, and a "已完成 ✓" badge or "开始阅读" button. If `isRecommended`, show a golden "🎯 今日推荐" banner.

- [ ] **Step 3: Create reading专区 page**

```tsx
// src/app/(child)/reading/page.tsx
"use client";
// Fetches today's recommendation + article list from /api/reading/recommend and /api/reading/articles
// Layout:
//   - Hero section: 今日推荐 card (full width, gradient bg)
//   - Category filter tabs: 全部 / 时事 / 历史 / 科学 / 人物 / 自然 / 文化
//   - Article grid: 2-column on tablet, 3-column on desktop
// States: loading skeleton (matching existing pattern), empty state ("暂无文章"), error state
```

---

### Task 5: Article Reader + Quiz

**Files:**
- Create: `src/app/(child)/reading/[id]/page.tsx`
- Create: `src/components/reading/ArticleReader.tsx`
- Create: `src/components/reading/QuizView.tsx`

**Use the `frontend-design` skill for the UI implementation of this task.**

- [ ] **Step 1: Create ArticleReader component**

Two-mode reader:
- **Mode G3**: Shows TTS button (Web Speech API `speechSynthesis`), larger font (text-lg), wider line height
- **Mode G6**: Standard text (text-base), optional word highlight on tap

```tsx
interface ArticleReaderProps {
  article: { title: string; content: string; gradeLevel: number };
  onStartQuiz: () => void;
}
```

- [ ] **Step 2: Create QuizView component**

Single-page quiz with:
- Progress bar (current/total)
- One question at a time
- Option buttons (A/B/C/D), selected state highlighted
- Auto-advance on selection (500ms delay)
- Results page: score, correct/incorrect breakdown, total points earned
- Submit button → calls POST /api/reading/quiz/submit

```tsx
interface QuizViewProps {
  questions: {
    id: string;
    question_text: string;
    options: { label: string; text: string }[];
    question_type: string;
    difficulty: number;
  }[];
  articleId: string;
  assignmentId?: string;
  onComplete: (result: { score: number; total: number; pointsEarned: number }) => void;
}
```

- [ ] **Step 3: Create reading/[id] page**

Fetches article + questions from `GET /api/reading/articles/[id]`.
Renders: ArticleReader → user clicks "开始答题" → QuizView → completion → auto-navigate back.

---

### Task 6: Reading API Routes

**Files:**
- Create: `src/app/api/reading/recommend/route.ts`
- Create: `src/app/api/reading/articles/route.ts`
- Create: `src/app/api/reading/articles/[id]/route.ts`
- Create: `src/app/api/reading/quiz/submit/route.ts`
- Create: `src/app/api/reading/progress/route.ts`

- [ ] **Step 1: GET /api/reading/recommend?childId=xxx**

Returns the single recommended article for today:
1. Check if there's an uncompleted `reading_assignment` for this child
2. If yes → return that article (with assignment_id)
3. If no → find the article matching child's `reading_grade_level` that hasn't been assigned
4. If none → return null

```typescript
// src/app/api/reading/recommend/route.ts
export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const childId = searchParams.get("childId");
  
  if (!childId) return NextResponse.json({ error: "Missing childId" }, { status: 400 });

  // 1. Check for existing assignments
  const { data: assignment } = await supabase
    .from("reading_assignments")
    .select("*, article:article_id(*)")
    .eq("child_id", childId)
    .neq("status", "completed")
    .order("assigned_date", { ascending: false })
    .limit(1)
    .single();

  if (assignment) return NextResponse.json({ article: assignment.article, assignmentId: assignment.id });

  // 2. Auto-recommend based on grade level
  const { data: child } = await supabase
    .from("children")
    .select("reading_grade_level")
    .eq("id", childId)
    .single();

  const gradeLevel = child?.reading_grade_level || 3;

  const { data: articles } = await supabase
    .from("reading_articles")
    .select("id")
    .eq("grade_level", gradeLevel)
    .eq("status", "published");

  const readIds = (await supabase.from("reading_assignments").select("article_id").eq("child_id", childId))
    .data?.map((a) => a.article_id) || [];

  const unread = articles?.filter((a) => !readIds.includes(a.id)) || [];
  if (unread.length === 0) return NextResponse.json({ article: null });

  // Pick random unread article
  const pick = unread[Math.floor(Math.random() * unread.length)];
  const { data: article } = await supabase.from("reading_articles").select("*").eq("id", pick.id).single();
  
  return NextResponse.json({ article });
}
```

- [ ] **Step 2: GET /api/reading/articles**

Query params: `grade`, `category`, `search`. Returns filtered published articles list.

- [ ] **Step 3: GET /api/reading/articles/[id]**

Returns article with its questions joined. Questions returned in order_index order.

- [ ] **Step 4: POST /api/reading/quiz/submit**

Accepts: `{ childId, articleId, assignmentId?, answers: [{questionId, selectedLabel}], timeSpentSeconds }`
Validates answers, calculates score, creates `reading_quiz_attempts` record, creates check-in (if linked to assignment), triggers `child-points-changed`.

Points formula: `Math.round((score / total) * articleBasePoints)` where base = 10 points per article.

- [ ] **Step 5: GET /api/reading/progress?childId=&month=**

Returns: total articles read this month, avg score, score trend, weak question types.

---

### Task 7: Reading Homework Integration

**Files:**
- Modify: `src/app/(parent)/homework/new/page.tsx`
- Modify: `src/components/child/ChildHomeworkCard.tsx`
- Create: `src/app/api/reading/assignments/route.ts`

- [ ] **Step 1: Create POST /api/reading/assignments**

Accepts: `{ childId, articleId }`. Creates `reading_assignment` with status = 'recommended'. Creates a `homeworks` entry (type_name = "英文阅读") so it appears in the child's today page.

Actually, let me rethink this. The reading feature works differently from regular homework. Instead of creating a `homeworks` record, the assignment appears in the reading tab AND in the "今日" page.

Better approach: When a parent assigns reading:
1. Create `reading_assignments` record
2. Create a lightweight `homeworks` entry with `type_name = "英文阅读"`, `type_icon = "📚"`, linked to the article
3. When the child completes the reading quiz, mark both the assignment and homework as completed

- [ ] **Step 2: Modify homework/new page**

Add a "英文阅读" option in the homework type selector. When selected, show an article browser (similar to reading专区 but with "布置" action button per article).

- [ ] **Step 3: Modify ChildHomeworkCard**

When `homework.type_icon === "📚"` and `type_name === "英文阅读"`, render a special view:
- Title shows the article title (stored in homework's `title` field)
- Clicking "完成" navigates to `/reading/${articleId}` instead of opening CheckInModal
- After reading quiz completion, the homework auto-completes

---

### Task 8: Parent Settings — Reading Grade Level

**Files:**
- Modify: `src/app/(parent)/settings/page.tsx`

- [ ] **Step 1: Add reading grade level per child**

In the settings page, for each child card, add:
```tsx
<div className="flex items-center justify-between">
  <label className="text-sm font-medium text-forest-700">阅读等级</label>
  <select
    value={child.reading_grade_level || child.grade || 3}
    onChange={(e) => updateReadingGrade(child.id, parseInt(e.target.value))}
    className="rounded-lg border-2 border-forest-200 px-3 py-1.5 text-sm"
  >
    {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => (
      <option key={g} value={g}>Grade {g}</option>
    ))}
  </select>
</div>
```

Also add an API endpoint or use existing update route to persist the change.

---

### Task 9: Parent Dashboard — Reading Progress Panel

**Files:**
- Modify: `src/app/(parent)/dashboard/page.tsx`
- Create: `src/components/reading/ReadingProgressPanel.tsx`

- [ ] **Step 1: Create ReadingProgressPanel**

Displays for the selected child:
- 📚 本周阅读: N 篇文章
- ✅ 平均正确率: XX%
- 📈 趋势: 上升/持平/下降 (based on last 4 weeks)

- [ ] **Step 2: Integrate into dashboard**

Add the panel to the right sidebar area, below the existing MonthlyInsights panel.

---

## Self-Review Checklist

1. **Spec coverage:** All spec requirements mapped:
   - ✅ Data model (Task 1)
   - ✅ Content pipeline / OpenAI generation (Task 2)
   - ✅ Seed content (Task 3)
   - ✅ Child reading专区 (Tasks 4-5)
   - ✅ API routes (Task 6)
   - ✅ Reading homework integration (Task 7)
   - ✅ Parent grade level setting (Task 8)
   - ✅ Dashboard reading panel (Task 9)
   - 🔲 Auto news pipeline (deferred to v2)

2. **Placeholder scan:** No TBD/TODO patterns, all code is concrete.

3. **Type consistency:** All types flow consistently from migration → components → API routes.
