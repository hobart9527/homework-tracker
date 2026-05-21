# 文章管道重构方案 v2

> 核心理念：**原文优先，LLM 只做附加值（出题 + 元数据 + 插图描述）**
> 
> v2 更新：基于 2026-05-13 实际执行结果校准 — 年级扩展、来源覆盖、draft 积压、JSON 截断根因

---

## 一、当前问题诊断（实际执行校准）

### 1.1 内容管道

| 问题 | 实际表现 | 根因 | 影响 |
|------|----------|------|------|
| 所有爬取内容过 LLM 重写 | 100% 文章走 `generateReadingContent()` | `source_text` 仅做 prompt 原料 | 事实漂移、API 浪费、JSON 截断 |
| factual-gate "事后验尸" | EN 84篇 draft（40%）| LLM 自由改写完才发现事实丢失 | 高质量原文被劣化后弃用 |
| 中文全量走 Route C | 137篇全部 `ai_generated`，0篇原文直出 | classic-corpus/ICDL 不在白名单 | 成语故事/古诗被 LLM 改写产生事实漂移 |
| MiniMax JSON 截断 | 24576 tokens 仍截断（郑和下西洋 G5 等） | LLM 生成千字长文+8道题+元数据 | 生成长文 token 不够 |
| `source` 列不存在 | migration 035 无此列，爬虫靠 `as any` 强写 | 表结构缺陷 | Route A 白名单检查依赖虚空字段 |

### 1.2 图片管道

| 问题 | 实际表现 | 根因 |
|------|----------|------|
| 封面/插图全靠模型生成 | 208幅插图全AI，封面亦然 | 爬虫不提取 `<img>` / `og:image` |
| 源站配图被丢弃 | DOGO/CommonLit 文章本身有高质量配图 | 所有爬虫无图片提取逻辑 |

### 1.3 抓取脚本

| 问题 | 实际表现 |
|------|----------|
| DOGO 硬编码 10 个 URL，无图片提取，**无 `source` 字段** |
| CommonLit 仅 excerpt 时也入库（`source_text` 为空），无图片提取 |
| news-in-levels 代码标记不可用 |
| ICDL 中文书籍仅取描述文本，非正文 |

### 1.4 年级覆盖

| 问题 | 实际表现 |
|------|----------|
| EN 硬编码 `target_grades: [3,6]` | 丢弃了字数匹配的高年级覆盖 |
| G7:18篇，G8:6篇 published | 严重不足 |
| ZH 默认 `target_grades: [3,5]` | G6-G8 覆盖缺失 |

**字数匹配天然可扩展**（来自 `reading-standards.json`）：

| 原年级 | 字数范围 | 重叠年级 | 可扩展至 |
|--------|----------|----------|----------|
| G3 (350-550) | ←→ G4 (450-800) | G4 | 字数≥382则生成 G4 |
| G6 (700-1500) | ←→ G7 (900-1800) → G8 (1000-2200) | G7, G8 | 字数≥765→G7，≥850→G8 |

---

## 二、重构架构

### 阶段 0：来源分级引擎

```
reading_topics.source_text
        │
        ▼
route-analyzer.ts (新增)
  ├─ 来源白名单检查
  ├─ 年级匹配度: source_text 字数 vs 目标年级标准
  ├─ 内容完整度: fullText vs excerpt vs 空
  └─ 输出: route = A | B | C + expanded_grades
```

### Route 决策矩阵

```typescript
// route-analyzer.ts

const WHITELIST_SOURCES = [
  'commonlit', 'dogo', 'news-in-levels',  // EN 原方案
  'icdl', 'classic-corpus',               // ZH 原文源
];

interface RouteDecision {
  route: 'A' | 'B' | 'C';
  expandedGrades: number[];   // 替代硬编码 target_grades
  reason: string;
}

function decideRoute(topic: TopicRow): RouteDecision {
  const sourceText = topic.source_text;

  // Route C: 无原文
  if (!sourceText || sourceText.trim().length < 50) {
    return { route: 'C', expandedGrades: topic.target_grades ?? [3, 6], reason: 'no-source' };
  }

  const isWhitelisted = WHITELIST_SOURCES.includes(topic.source || '');
  const wordCount = topic.language === 'en' ? countWords(sourceText) : sourceText.length;

  // Route A: 白名单 + 字数匹配 ±25% + 完整正文
  if (isWhitelisted) {
    const baseGrade = topic.target_grades?.[0] || 3;
    const range = getWordCountRange(topic.language, baseGrade);
    const withinRange = wordCount >= range.min * 0.75
                     && wordCount <= range.max * 1.25;

    // 正文完整度：CommonLit 的 excerpt 不算完整正文
    const hasFullContent = wordCount >= range.min * 0.5;

    if (withinRange && hasFullContent) {
      const expanded = expandGrades(wordCount, baseGrade, topic.language);
      return { route: 'A', expandedGrades: expanded, reason: 'whitelist+quality' };
    }

    // Route B: 白名单但字数不匹配或内容不完整
    return { route: 'B', expandedGrades: topic.target_grades ?? [baseGrade], reason: 'whitelist+mismatch' };
  }

  // Route C: 非白名单（包括 classic-corpus 被 Route C 消费的场景 — 
  //          classic-corpus 内部通过 sourceText 传给 LLM 改编）
  return { route: 'C', expandedGrades: topic.target_grades ?? [3, 6], reason: 'no-whitelist' };
}
```

### 年级扩展算法

```typescript
function expandGrades(wordCount: number, baseGrade: number, lang: 'en' | 'zh'): number[] {
  const grades = [baseGrade];
  const standards = lang === 'en' ? EN_STANDARDS : ZH_STANDARDS;

  // G3 扩展: 字数 >= G4 下限 * 0.85 → 也生成 G4
  if (baseGrade === 3 && wordCount >= getBound(lang, 4).min * 0.85) {
    grades.push(4);
  }

  // G5 扩展: 字数 >= G6 下限 * 0.85 → 生成 G6
  if (baseGrade === 5 && wordCount >= getBound(lang, 6).min * 0.85) {
    grades.push(6);
  }

  // G6 扩展: 字数达标 → G7 / G8
  if (baseGrade === 6) {
    if (wordCount >= getBound(lang, 7).min * 0.85) grades.push(7);
    if (wordCount >= getBound(lang, 8).min * 0.85) grades.push(8);
  }

  return grades;
}
```

---

### Route A：原文直出 + LLM 只出题（预期 60%+）

```
source_text → 直接作为 article.content
            → LLM 生成: questions (5-8题) + genre + IB fields + illustrations 描述
            → quality-gate (仅检查题数/选项/题型分布/字数)
            → factual-gate 跳过（原文即事实基准）
            → published
```

**LLM 调用量**：原文 0 token 消耗，仅生成题目 ≈ 500 tokens → **JSON 截断问题消失**

**Prompt 关键约束**：
```
文章正文请直接使用下方提供的原文，不要改写、润色或扩写。
仅输出以下附加值：
- questions: 5-8道阅读理解选择题
- scene_description: 基于原文场景的插图描述
- genre / author_purpose / cultural_connection (IB 字段)
- difficulty (LLM 初判，管线会用 calculateObjectiveDifficulty 覆盖)
```

---

### Route B：约束改写（预期 25%）

**触发**：白名单来源但字数偏差 10%-40%，或只有 excerpt 而非 fullText

**按语言和年级跨度分三档 Prompt**：

| 档位 | 跨度 | 改写策略 |
|------|------|----------|
| B1 微调 | 同级（字数差 <25%） | 仅调词汇难度、拆分过长句 |
| B2 降级 | 原文高于目标 1-2 级 | 简化概念复杂度、缩短段落、替换学术词 |
| B3 文言→白话 | ZH 古典→现代 | 逐句翻译+语境解释，保留原文典故和人物 |

```
source_text → LLM 约束改写 (B1/B2/B3 分档 prompt)
            → 保事实约束: "保留以下关键事实: [key_facts]"
            → LLM 生成: questions + scene_description + IB fields
            → 全量 quality-gate + factual-gate
```

**B3 专用：classic-corpus 文言文→白话文**

目前 zh-history 系列（秦始皇统一中国、张骞出使西域、大禹治水等）和成语故事（守株待兔、亡羊补牢等）的 `sourceText` 是古文原文，prompt 要求"基于原文改编"。实际执行中 LLM 自由发挥过大，factual-gate 挂。

B3 专用约束：
```
请将以下文言文/古文逐句翻译成适合小学{grade}年级的白话文：
1. 保留原文所有人物、事件、时间、地点
2. 生僻字替换为课本常用字（不超过本年级识字范围）
3. 每句文言文对应1-2句白话文
4. 不要添加原文中没有的细节或评论
5. 不要删除原文中的任何段落
```

---

### Route C：全量生成（预期 15%）

无 `source_text` / 内容质量 < 0.4 / 非白名单 / 年级差 > 2。现有流程不变。

---

## 三、数据库变更

```sql
-- 039_source_routing.sql (新 migration)

-- reading_topics 补充字段
ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS source TEXT,          -- 来源标识：dogo/commonlit/news-in-levels/icdl/classic-corpus
  ADD COLUMN IF NOT EXISTS source_image_url TEXT, -- 源站封面/配图
  ADD COLUMN IF NOT EXISTS source_quality_score FLOAT DEFAULT 0, -- 内容质量评分 (0-1)
  ADD COLUMN IF NOT EXISTS content_completeness TEXT DEFAULT 'unknown';
    -- 'full' = 完整正文, 'excerpt' = 摘要, 'description' = 描述, 'unknown'

-- reading_articles 补充字段
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS content_source TEXT DEFAULT 'llm';
    -- 'original' = Route A 原文直出
    -- 'adapted' = Route B LLM微调
    -- 'llm' = Route C 全量生成
```

---

## 四、图片策略

### 爬虫新增图片提取

所有爬虫新增 `extractImages()` 方法：

```typescript
function extractImages(html: string): { cover: string | null; inline: string[] } {
  // 1. og:image 优先 (封面)
  const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
  
  // 2. article/post 内首张图 (降级封面)
  const articleImg = html.match(/<article[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  
  // 3. content 内所有图 (插图)
  const contentImgs = [...html.matchAll(/class="[^"]*content[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"/g)];
  
  return {
    cover: ogImg?.[1] || articleImg?.[1] || null,
    inline: contentImgs.map(m => m[1]).slice(0, 5),
  };
}
```

存入 `reading_topics.source_image_url`（封面）+ metadata（插图列表）。

### 封面/插图生成优先级

```
generateCover():
  1. topic.source_image_url → 下载裁剪 → 直接上传
  2. 降级到 MiniMax/Pollinations 生成

generateIllustrations(paragraphIndex):
  1. topic.metadata.source_images[paragraphIndex] 存在 → 下载上传
  2. 降级到 Pollinations 生成
```

---

## 五、Draft 积压处理

新增 `scripts/draft-triage.ts`：

```
draft 文章
  ├─ 重新跑3道质量门
  ├─ 按失败门分类:
  │   ├─ quality-gate 失败 → 检查具体项（字数/题型/题目正确性）
  │   │   ├─ 字数偏差 <20% → Route A 直接发布（原文够好）
  │   │   ├─ 题目格式问题 → LLM 只重生成题目
  │   │   └─ 内容问题 → Route B 改写
  │   ├─ ib-criteria-gate 失败 → LLM 只补 IB 元数据
  │   └─ factual-gate 失败 → 人工 review 标记
  └─ 汇总报告 → 批量修复
```

---

## 六、新增/修改文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/lib/reading/route-analyzer.ts` | **新增** | 来源分级引擎 + 年级扩展算法 |
| `src/lib/reading/source-image-extractor.ts` | **新增** | HTML 图片提取 |
| `src/lib/reading/cover-source-extractor.ts` | **新增** | 源站图片→封面 |
| `src/lib/reading/content-generator.ts` | **修改** | + Route A 只出题 prompt + Route B 三档改写 prompt (含 B3 文言→白话) |
| `src/lib/reading/cover-generator.ts` | **修改** | 优先 source_image_url |
| `src/lib/reading/illustration-generator.ts` | **修改** | 优先源站插图 |
| `scripts/draft-triage.ts` | **新增** | draft 积压分诊+批量修复 |
| `scripts/reading/scrapers/dogo-scraper.ts` | **修改** | 补 `source: "dogo"` + 图片提取 + 分类页自动发现 |
| `scripts/reading/scrapers/commonlit-scraper.ts` | **修改** | 图片提取 + content_completeness 标记 |
| `scripts/reading/scrapers/news-in-levels.ts` | **修改** | 重写 + 图片提取 |
| `scripts/reading/scrapers/icdl-scraper.ts` | **修改** | 图片提取 |
| `scripts/reading-content-pipeline.ts` | **修改** | Route 分派 + source_image_url 传递 + content_source 标记 |
| `scripts/seed-chinese-reading-content.ts` | **修改** | Route 分派 + classic-corpus 匹配 B3 |
| `supabase/migrations/039_source_routing.sql` | **新增** | DB 字段扩展 |

---

## 七、执行计划

### Wave 1: 数据层（1 天）
- [ ] migration 039: `source`, `source_image_url`, `source_quality_score`, `content_completeness` 到 `reading_topics`
- [ ] migration: `content_source` 到 `reading_articles`
- [ ] dogo 补 `source: "dogo"` 字段
- [ ] 回填现有 `reading_topics` 的 source 字段（根据 topic_key 前缀推断）

### Wave 2: 分级引擎（2 天）
- [ ] `route-analyzer.ts` 实现（Route A/B/C 决策 + 年级扩展算法）
- [ ] 单元测试

### Wave 3: 内容管线（3 天）
- [ ] `content-generator.ts` Route A prompt（原文直出 + 只出题）
- [ ] `content-generator.ts` Route B 三档 prompt（B1 微调 / B2 降级 / B3 文言→白话）
- [ ] `reading-content-pipeline.ts` Route 分派
- [ ] `seed-chinese-reading-content.ts` Route 分派 + B3 路由
- [ ] `draft-triage.ts`

### Wave 4: 图片管线（2 天）
- [ ] `source-image-extractor.ts`
- [ ] `cover-source-extractor.ts`
- [ ] 4 个爬虫添加图片提取
- [ ] `cover-generator.ts` / `illustration-generator.ts` 优先源站图片

### Wave 5: 爬虫扩展（2 天）
- [ ] dogo 分类页自动发现（替代 10 个硬编码 URL）
- [ ] CommonLit 分页抓取 + excerpt/fullText 区分标记
- [ ] news-in-levels 重写
- [ ] 新增 1-2 个中文来源（小学生作文网 / 古诗文网）

### Wave 6: 集成验证（1 天）
- [ ] Route A → 生成一篇，验证原文不漂移
- [ ] Route B1/B2/B3 各一篇，验证改写质量
- [ ] 年级扩展：G6 文章自动生成 G7/G8 版本
- [ ] 图片：源站图片 → 封面 + 插图通路
- [ ] draft-triage 跑全量 draft，预期修复率 > 70%

---

## 八、预期效果

| 指标 | 当前 | 重构后 |
|------|------|--------|
| LLM API token 消耗 | 24576/篇 (ZH), 4096/篇 (EN) | Route A: ~500/篇, Route B: ~4000/篇 |
| JSON 截断 | Route C 频繁 | Route A/B 不再出现（题目短） |
| factual-gate 失败率 | 高 | ~5%（Route A 跳过，Route B 约束改写） |
| 图片生成成本 | 100% AI | ~40% 源站免费 |
| 文章发布率 | ~60% | ~85%+ |
| G7/G8 覆盖 | G7:18, G8:6 | 自动从 G6 扩展，预计各 +20-40篇 |
| Route A 中文覆盖 | 0% | classic-corpus 40+条目 + ICDL 中文 → B3 文言转白话 |
