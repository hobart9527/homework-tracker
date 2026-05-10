# Reading Topic Matrix v2 — Design for Review

> **Status**: DRAFT — awaiting parent review
> **Date**: 2026-05-10
> **Wave**: W0a (Topic Matrix Baseline)
> **Predecessor**: `.planning/reading-pipeline-task-plan.md` (frozen)
> **Purpose**: Expand reading content from 6 categories / ~80 topics to 18 categories / ~150 MVP topics, with per-child reading level tracking, topic packs, and read-along Chinese audio support.

---

## 0. Context (Parent-Confirmed Constraints)

| Dimension | Value | Source |
|-----------|-------|--------|
| Children | 2 (G3 + G6, ages 9-12, Beijing International School) | Parent input |
| English ability | Native level → raise 1-2 levels (G3→L4-L5, G6→L7-L8) | Parent input |
| Chinese ability | Slightly weaker → support with **pinyin** (existing) + **read-along audio** (new W0b) | Parent input |
| Category breadth | 18 categories (history triplet + humanities + science + reality) | Parent input |
| Matrix depth | Standard 6 articles per pack/era × dimension | Parent input |
| News pipeline | Parent feeds 1-2 URLs/week → LLM rewrites for both grades | Parent input |
| Review mode | Auto-publish, no manual review queue | Parent input |
| TTS provider | Azure Neural Voice (xiaoxiao / yunxi) | Parent input |
| Total scale | MVP 150 topics in W0a; expand to 270-360 in W2/W3 | Derived |

---

## 0.1 Decisions Confirmed (2026-05-10)

Parent sign-off received on 2026-05-10. The following resolutions override any conflicting cell in §1-§6 below; downstream agents (seed script, migrations, prompts) MUST honor this section as authoritative.

### Q-Review-1 Resolution: Topic List Adjustments

**Add 2 topics to Cat 1 中国史** (count goes from 10 → 12, total 151 → 153):

| topic_key | Title (zh) | Pack | Order | Levels | Notes |
|-----------|-----------|------|-------|--------|-------|
| zh-history-anti-japanese-war | 抗日战争 | china-modern | 3 | L6-L8 | 1937-1945，age-gate (G6+ only) |
| zh-history-new-china-founding | 新中国成立 | china-contemporary | 0 | L5-L7 | 1949，pack_order=0 = before reform-and-opening |

**Confirmed kept**: Bitcoin & cryptocurrency, stock market basics, inflation (Cat 8 经济与生活)
**Confirmed merged**: religion topics merge into 文化 category as needed (no separate Religion category)

### Q-Review-2 Resolution: G3 Content Block List

| Topic | G3 Allowed? | Reason |
|-------|-------------|--------|
| Opium War | ❌ Blocked | War + violence |
| WWII Overview | ❌ Blocked | War + scale |
| Black Death | ❌ Blocked | Death + plague |
| Mental Health & Stress | ❌ Blocked | Mature content |
| **Anti-Japanese War (new)** | ❌ Blocked | War + age-appropriate concerns |
| Vaccine History | ✅ Allowed | Educational, no blood/politics |
| Penicillin Discovery | ✅ Allowed | Educational, scientific narrative |

`age_min_level` for blocked topics = 'L5' (i.e., G5+ only).

### Q-Review-3 Resolution: English Difficulty Ceiling

- **G3** default range: L4-L5; auto-leveler MAY occasionally surface L6 when accuracy ≥80% sustained
- **G6** default range: L7-L8; auto-leveler MAY occasionally surface L9 when accuracy ≥80% sustained
- Hard cap: G3 never above L6; G6 never above L9 (auto-leveler will not exceed these in W2)

### Q-Review-4 Resolution: Chinese Reading Level

Confirmed: Chinese sits 2-3 levels below English; gap closed by pinyin annotation + read-along audio (W0b).

| Child | English | Chinese | Compensation Tools |
|-------|---------|---------|---------------------|
| G3 | L4-L5 | L3 | pinyin + audio |
| G6 | L7-L8 | L5-L6 | pinyin (selectively) + audio |

### Q-Review-5 Resolution: Topic Pack Order

**Recommendation only, NOT enforced**. `pack_order` is used by recommendation algorithm to suggest "next in series" but child can read in any order. The DB does not block out-of-order reads.

### Q-Review-6 Resolution: Single-Language Topics (CRITICAL FOR SEED AGENT)

**No `zh+en` topics. Each topic has ONE primary language. Independent topics, no parallel translations, no summary pairs.**

The following topics — previously marked `zh+en` in §2 — must be assigned a single primary language as resolved below. Downstream seed/generation agents MUST use this resolution table:

| topic_key | Final Language |
|-----------|----------------|
| lit-little-prince-bilingual → **rename to** lit-little-prince | en |
| culture-spring-festival | zh |
| culture-mid-autumn | zh |
| culture-chinese-tea-ceremony | zh |
| culture-beijing-opera | zh |
| art-chinese-ink-painting | zh |
| art-dunhuang-murals | zh |
| bio-tu-youyou | zh |
| bio-qian-xuesen | zh |
| space-china-space-program | zh |
| sports-china-olympics-2008-2022 | zh |
| sports-tai-chi-martial-arts | zh |
| env-china-environmental-action | zh |
| nature-china-yellow-mountains | zh |
| nature-china-jiuzhaigou | zh |

Rationale: Chinese cultural / Chinese geographic / Chinese-historical-figure topics anchor in zh primary so they exercise Chinese reading muscles. The two children read different languages anyway (English-dominant), so en variants of these can be added later in W2 if needed.

### Updated Topic Counts

| Category | W0a topics | Notes |
|----------|------------|-------|
| 中国史 | **12** | +2 (anti-Japanese war, new China founding) |
| All other categories | unchanged | per §3 |
| **TOTAL** | **153** | (was 151) |

---

## 1. The 18 Categories

Grouped into 5 thematic axes. Existing categories (时事/历史/科学/人物/自然/文化) remap into the new structure without losing the legacy `category` enum — they map to the new `category_v2` field while old field stays for backward compat.

### Axis A — 历史 History (3)

| # | Category | English Label | 主语言 / Primary Lang |
|---|----------|---------------|------------------------|
| 1 | 中国史 | Chinese History | 中文为主，英文摘要可选 |
| 2 | 美国史 | American History | 英文为主 |
| 3 | 世界史 | World History | 英文为主 |

### Axis B — 人文 Humanities (5)

| # | Category | English Label | 主语言 |
|---|----------|---------------|--------|
| 4 | 文学 | Literature (excerpts + analysis) | 中英双语 |
| 5 | 诗歌 | Poetry (Chinese + English) | 中英双语 |
| 6 | 文化 | Culture (festivals, customs, traditions) | 中英双语 |
| 7 | 艺术 | Art (painting, music, theatre, design) | 中英双语 |
| 8 | 经济与生活 | Economics & Daily Life | 英文为主 |

### Axis C — 故事人物 Stories & Biography (2)

| # | Category | English Label | 主语言 |
|---|----------|---------------|--------|
| 9 | 故事 | Stories (folk tales, fables, fairy tales) | 中英双语 |
| 10 | 人物 | Biography | 中英双语 |

### Axis D — 科技 Science & Tech (4)

| # | Category | English Label | 主语言 |
|---|----------|---------------|--------|
| 11 | 科学 | Science (physics, chemistry, biology, earth) | 英文为主 |
| 12 | 数码与AI | Digital & AI | 英文为主 |
| 13 | 太空与天文 | Space & Astronomy | 英文为主 |
| 14 | 医学健康 | Medicine & Health | 英文为主 |

### Axis E — 现实 Real-World (4)

| # | Category | English Label | 主语言 |
|---|----------|---------------|--------|
| 15 | 时事 | Current Events (parent-fed URLs) | 英文为主 |
| 16 | 体育 | Sports | 英文为主 |
| 17 | 环保 | Environment & Sustainability | 中英双语 |
| 18 | 自然生态 | Nature & Ecosystems | 中英双语 |

**Boundary notes** (avoid overlap):
- **故事 vs 文学**: 故事 = self-contained short narratives (10-30 min read); 文学 = excerpts of canonical works + meta-analysis ("why this novel matters")
- **科学 vs 医学**: 医学 = human body, disease, immunity, mental health; 科学 = physics/chemistry/biology of non-human systems
- **自然生态 vs 环保**: 自然生态 = how ecosystems work (descriptive); 环保 = human impact + actions (prescriptive)
- **历史 vs 人物**: when a person *defines* an era → 历史 (e.g., 秦始皇 in 中国史); when biographical arc itself is the lesson → 人物 (e.g., 海伦凯勒)

---

## 2. Per-Category Topic List (W0a MVP — ~150 topics)

Each topic carries: `topic_key` (slug, primary identifier), display title (zh/en), recommended levels (L1-L12), and pack_id (where applicable).

> **Convention**: A `pack_id` groups 3-10 articles meant to be read in `pack_order` (sequential progression). Topics without `pack_id` are standalone.

### Cat 1 — 中国史 (10 topics, 4 packs)

| topic_key | Title (zh) | Pack | Order | Levels | Notes |
|-----------|-----------|------|-------|--------|-------|
| zh-history-yu-the-great | 大禹治水 | china-foundations | 1 | L3-L5 | 上古传说，洪水神话 |
| zh-history-qin-unification | 秦始皇统一六国 | china-empire | 1 | L4-L7 | 公元前 221，秦朝建立 |
| zh-history-silk-road-zhang-qian | 张骞出使西域 | china-empire | 2 | L4-L7 | 丝绸之路开通 |
| zh-history-three-visits-thatched-cottage | 三顾茅庐 | china-three-kingdoms | 1 | L4-L7 | 三国故事，礼贤下士 |
| zh-history-xuanzang-pilgrimage | 玄奘西行取经 | china-tang | 1 | L4-L7 | 唐代，文化交流 |
| zh-history-zheng-he-voyages | 郑和七下西洋 | china-ming | 1 | L5-L8 | 明初，海上丝绸之路 |
| zh-history-forbidden-city-construction | 紫禁城的建造 | china-ming | 2 | L4-L7 | 故宫由来 |
| zh-history-opium-war | 鸦片战争 | china-modern | 1 | L6-L8 | 近代史开端，需儿童化处理 |
| zh-history-1911-revolution | 辛亥革命 | china-modern | 2 | L6-L8 | 帝制终结 |
| zh-history-reform-and-opening | 改革开放四十年 | china-contemporary | 1 | L6-L8 | 当代变迁 |

### Cat 2 — 美国史 (10 topics, 4 packs)

| topic_key | Title (en) | Pack | Order | Levels | Notes |
|-----------|-----------|------|-------|--------|-------|
| us-history-mayflower | The Mayflower Voyage | us-colonial | 1 | L3-L5 | 1620, Plymouth |
| us-history-thirteen-colonies | The Thirteen Colonies | us-colonial | 2 | L4-L6 | Pre-revolution context |
| us-history-boston-tea-party | The Boston Tea Party | us-revolution | 1 | L4-L6 | 1773 |
| us-history-declaration-of-independence | The Declaration of Independence | us-revolution | 2 | L5-L7 | 1776 |
| us-history-lincoln-emancipation | Lincoln & Emancipation | us-civil-war | 1 | L5-L7 | 1863 |
| us-history-transcontinental-railroad | The Transcontinental Railroad | us-westward | 1 | L4-L6 | 1869 |
| us-history-fdr-new-deal | FDR & The New Deal | us-20c | 1 | L6-L8 | 1933-1939 |
| us-history-mlk-civil-rights | Martin Luther King Jr. & Civil Rights | us-20c | 2 | L5-L7 | 1955-1968 (existing topic) |
| us-history-apollo-moon-landing | Apollo 11 Moon Landing | us-20c | 3 | L4-L6 | 1969 |
| us-history-internet-origins-arpanet | Internet Origins: ARPANET to Web | us-tech | 1 | L6-L8 | 1969-1991 |

### Cat 3 — 世界史 (10 topics, 4 packs)

| topic_key | Title (en) | Pack | Order | Levels | Notes |
|-----------|-----------|------|-------|--------|-------|
| world-history-egypt-pyramids | Ancient Egypt & The Pyramids | ancient-civilizations | 1 | L3-L6 | Existing |
| world-history-mesopotamia-cuneiform | Mesopotamia: Cradle of Writing | ancient-civilizations | 2 | L4-L7 | New |
| world-history-greek-democracy | Athenian Democracy | classical-antiquity | 1 | L4-L7 | Existing |
| world-history-roman-empire | The Roman Empire | classical-antiquity | 2 | L5-L7 | New |
| world-history-viking-age | The Viking Age | medieval | 1 | L4-L6 | Existing |
| world-history-black-death | The Black Death | medieval | 2 | L6-L8 | Mature topic, age-gate |
| world-history-renaissance | The Renaissance | early-modern | 1 | L5-L8 | Existing |
| world-history-age-of-exploration | The Age of Exploration | early-modern | 2 | L5-L7 | Existing |
| world-history-industrial-revolution | The Industrial Revolution | modern | 1 | L6-L8 | Existing |
| world-history-wwii-overview | World War II: An Overview | modern | 2 | L6-L8 | Existing, age-gate |

### Cat 4 — 文学 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| lit-charlottes-web | Charlotte's Web (excerpt + analysis) | en | L3-L5 | E.B. White |
| lit-wonder-by-rj-palacio | Wonder by R.J. Palacio | en | L4-L6 | Theme: kindness |
| lit-harry-potter-themes | Harry Potter: Themes & Symbols | en | L5-L7 | Excerpt + symbol analysis |
| lit-roald-dahl-style | Roald Dahl's Style | en | L4-L6 | Charlie & Chocolate Factory excerpt |
| lit-xiyou-monkey-king | 西游记：孙悟空大闹天宫 | zh | L4-L6 | 古典小说节选 |
| lit-three-kingdoms-zhuge | 三国演义：诸葛亮草船借箭 | zh | L4-L6 | 古典小说节选 |
| lit-luxun-hometown | 鲁迅《故乡》节选 | zh | L6-L8 | 现代文学 |
| lit-little-prince-bilingual | 小王子 (中英对照精选) | zh+en | L4-L6 | 跨语言文本 |

### Cat 5 — 诗歌 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| poetry-li-bai-jingyesi | 李白《静夜思》赏析 | zh | L3-L5 | 唐诗 |
| poetry-meng-haoran-chunxiao | 孟浩然《春晓》赏析 | zh | L3-L5 | 唐诗 |
| poetry-wang-zhihuan-denguanqulou | 王之涣《登鹳雀楼》赏析 | zh | L4-L6 | 唐诗 |
| poetry-su-shi-shuidiao | 苏轼《水调歌头》 | zh | L5-L7 | 宋词 |
| poetry-shijing-guanju | 《诗经·关雎》 | zh | L6-L8 | 古典诗经 |
| poetry-robert-frost-road-not-taken | Robert Frost: The Road Not Taken | en | L5-L7 | 美国诗歌 |
| poetry-shel-silverstein | Shel Silverstein's Funny Poems | en | L3-L5 | 童诗 |
| poetry-emily-dickinson-hope | Emily Dickinson: Hope is the Thing with Feathers | en | L5-L7 | 美国诗歌 |

### Cat 6 — 文化 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| culture-spring-festival | 春节传统与起源 | zh+en | L3-L5 | 已有 chinese-new-year |
| culture-mid-autumn | 中秋节与嫦娥传说 | zh+en | L3-L5 | New |
| culture-chinese-tea-ceremony | 中国茶文化 | zh+en | L4-L6 | New |
| culture-beijing-opera | 京剧介绍 | zh+en | L4-L6 | New |
| culture-japanese-tea-ceremony | Japanese Tea Ceremony | en | L4-L6 | Existing |
| culture-diwali-festival | Diwali: Festival of Lights | en | L3-L5 | Existing |
| culture-thanksgiving | Thanksgiving Traditions | en | L3-L5 | Existing |
| culture-mexican-day-of-dead | Mexican Day of the Dead | en | L4-L6 | Existing |

### Cat 7 — 艺术 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| art-chinese-ink-painting | 中国水墨画 | zh+en | L4-L6 | New |
| art-dunhuang-murals | 敦煌壁画 | zh+en | L5-L7 | New |
| art-monet-impressionism | Monet & Impressionism | en | L4-L6 | New |
| art-van-gogh-starry-night | Van Gogh's Starry Night | en | L4-L6 | New |
| art-michelangelo-sistine | Michelangelo & Sistine Chapel | en | L5-L7 | New |
| art-pixar-animation-craft | The Craft of Pixar Animation | en | L4-L6 | New, modern |
| art-graffiti-banksy | Banksy & Street Art | en | L5-L7 | New, contemporary |
| art-music-beethoven-symphony | Beethoven's Ninth Symphony | en | L5-L7 | New |

### Cat 8 — 经济与生活 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| econ-money-history | The History of Money | en | L4-L6 | New |
| econ-savings-and-compound-interest | How Compound Interest Works | en | L5-L7 | New, finance literacy |
| econ-stock-market-basics | What is the Stock Market? | en | L5-L7 | New, age-appropriate |
| econ-inflation-explained | What is Inflation? | en | L6-L8 | New |
| econ-bitcoin-cryptocurrency | Bitcoin & Cryptocurrency | en | L6-L8 | New, modern |
| econ-global-supply-chains | How Goods Travel: Global Supply Chains | en | L5-L7 | New |
| econ-shipping-containers | The Container That Changed the World | en | L5-L7 | New, fascinating angle |
| econ-fair-trade | What is Fair Trade Coffee? | en | L4-L6 | New, accessible |

### Cat 9 — 故事 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| story-shouzhudaitu | 守株待兔 | zh | L3-L5 | Existing |
| story-yangbulao | 亡羊补牢 | zh | L3-L5 | Existing |
| story-changedrun-to-moon | 嫦娥奔月 | zh | L3-L5 | New, mid-autumn tale |
| story-niulang-zhinv | 牛郎织女 | zh | L4-L6 | New, Qixi tale |
| story-aesop-tortoise-hare | Aesop: The Tortoise and the Hare | en | L3-L5 | New |
| story-andersen-emperor-clothes | Andersen: The Emperor's New Clothes | en | L3-L5 | New |
| story-norse-mythology-thor | Norse Mythology: Thor's Hammer | en | L4-L6 | New |
| story-grimm-rapunzel | Grimm: Rapunzel | en | L3-L5 | New |

### Cat 10 — 人物 (10 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| bio-marie-curie | Marie Curie | en | L3-L6 | Existing |
| bio-einstein | Albert Einstein | en | L3-L6 | Existing |
| bio-helen-keller | Helen Keller | en | L3-L5 | Existing |
| bio-darwin | Charles Darwin | en | L5-L7 | New |
| bio-tu-youyou | 屠呦呦：青蒿素发现者 | zh+en | L5-L7 | New, 中国诺奖 |
| bio-qian-xuesen | 钱学森：中国航天之父 | zh+en | L5-L7 | New |
| bio-zhang-qian-explorer | 张骞：丝绸之路开拓者 | zh | L4-L6 | New |
| bio-elon-musk | Elon Musk: Innovator & Entrepreneur | en | L6-L8 | New, contemporary |
| bio-steve-jobs | Steve Jobs & The Mac Revolution | en | L5-L7 | New |
| bio-nelson-mandela | Nelson Mandela | en | L5-L7 | Existing |

### Cat 11 — 科学 (10 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| sci-solar-system | The Solar System | en | L3-L5 | Existing |
| sci-states-of-matter | States of Matter | en | L3-L5 | Existing |
| sci-photosynthesis | Photosynthesis | en | L4-L6 | Existing |
| sci-electromagnetism | Electricity & Magnetism | en | L5-L7 | New |
| sci-genetics-dna | Genetics & DNA | en | L5-L7 | Existing |
| sci-evolution-darwin | Evolution Explained | en | L6-L8 | New |
| sci-plate-tectonics | Plate Tectonics | en | L4-L6 | Existing |
| sci-volcanoes-and-earthquakes | Volcanoes & Earthquakes | en | L4-L6 | New |
| sci-water-cycle | The Water Cycle | en | L3-L5 | Existing |
| sci-light-spectrum | Light & The Visible Spectrum | en | L4-L6 | New |

### Cat 12 — 数码与 AI (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| digital-computer-history | A Brief History of Computers | en | L4-L6 | New |
| digital-how-internet-works | How the Internet Works | en | L5-L7 | New |
| digital-ai-history-overview | A Brief History of AI | en | L5-L7 | New |
| digital-how-chatgpt-works | How ChatGPT Works (Simplified) | en | L6-L8 | New, kid-friendly explanation |
| digital-alphago-and-go | AlphaGo: When AI Beat the Best | en | L6-L8 | New |
| digital-cybersecurity-basics | Online Safety & Cybersecurity Basics | en | L5-L7 | New, practical |
| digital-vr-ar-explained | Virtual Reality vs Augmented Reality | en | L4-L6 | New |
| digital-coding-introduction | What is Programming? | en | L4-L6 | New |

### Cat 13 — 太空与天文 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| space-moon-return-missions | Returning to the Moon: Artemis Program | en | L3-L6 | Existing (was 时事) |
| space-mars-exploration | Mars Rovers: Searching for Life | en | L4-L6 | New |
| space-james-webb-telescope | The James Webb Space Telescope | en | L5-L7 | New |
| space-iss-life-aboard | Life Aboard the ISS | en | L4-L6 | New |
| space-spacex-falcon | SpaceX: Reusable Rockets | en | L5-L7 | New |
| space-black-holes | Black Holes Explained | en | L6-L8 | New |
| space-exoplanets | Exoplanets: Worlds Beyond Our Sun | en | L5-L7 | New |
| space-china-space-program | China's Space Program: Tiangong & Chang'e | zh+en | L5-L7 | New |

### Cat 14 — 医学健康 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| health-immune-system | The Immune System | en | L4-L6 | New |
| health-vaccine-history | A History of Vaccines | en | L5-L7 | New |
| health-penicillin-discovery | The Discovery of Penicillin | en | L4-L6 | New |
| health-heart-and-blood | The Heart & Blood Circulation | en | L4-L6 | Existing (human-circulatory) |
| health-the-brain-explained | The Brain: How It Works | en | L5-L7 | New |
| health-sleep-science | Why We Sleep: The Science | en | L4-L6 | New |
| health-nutrition-basics | Healthy Eating: A Practical Guide | en | L4-L6 | New |
| health-mental-health-stress | Mental Health & Stress for Kids | en | L5-L7 | New, important |

### Cat 15 — 时事 (5 placeholders + parent-fed pipeline)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| news-evergreen-ocean-plastic | Ocean Plastic Crisis (evergreen) | en | L3-L7 | Existing, kept as fallback |
| news-evergreen-renewable-energy | The Renewable Energy Boom (evergreen) | en | L3-L7 | Existing |
| news-evergreen-ai-in-school | AI in Classrooms (evergreen) | en | L3-L7 | Existing |
| news-evergreen-wildlife-2020s | Wildlife Conservation in the 2020s | en | L3-L7 | Existing |
| news-evergreen-climate-action | Climate Action: What Countries Are Doing | en | L4-L7 | New, evergreen |

> **W1 will add**: parent-fed dynamic news with `freshness_until` field. Above 5 are evergreen fallback when no fresh news.

### Cat 16 — 体育 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| sports-olympics-history | A Brief History of the Olympics | en | L4-L6 | New |
| sports-china-olympics-2008-2022 | 北京奥运 2008 与 2022 | zh+en | L4-L6 | New |
| sports-fifa-world-cup | The FIFA World Cup | en | L4-L6 | New |
| sports-nba-basketball | The NBA & American Basketball | en | L4-L6 | New |
| sports-tennis-grand-slams | Tennis & The Grand Slams | en | L4-L6 | New |
| sports-tai-chi-martial-arts | 太极拳与中国武术 | zh+en | L4-L6 | New |
| sports-physics-of-sports | The Physics of Sports | en | L5-L7 | New |
| sports-marathon-and-endurance | The Marathon: Body & Mind | en | L5-L7 | New |

### Cat 17 — 环保 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| env-climate-change-basics | Climate Change Explained | en | L4-L7 | New |
| env-electric-vehicles | The Rise of Electric Vehicles | en | L4-L6 | New |
| env-solar-and-wind-power | Solar & Wind: Clean Energy | en | L4-L6 | Builds on existing |
| env-recycling-and-zero-waste | Recycling & Zero-Waste Living | en | L3-L5 | New, practical |
| env-endangered-species | Endangered Species & Conservation | en | L4-L6 | Existing |
| env-deforestation | The Loss of Forests | en | L5-L7 | New |
| env-china-environmental-action | 中国的环保行动 | zh+en | L5-L7 | New |
| env-cities-going-green | Cities Going Green | en | L4-L6 | New |

### Cat 18 — 自然生态 (8 topics)

| topic_key | Title | Lang | Levels | Notes |
|-----------|-------|------|--------|-------|
| nature-rainforest-ecosystems | Rainforest Ecosystems | en | L3-L5 | Existing |
| nature-coral-reefs | Coral Reef Ecosystems | en | L3-L5 | Existing |
| nature-deserts-life | Desert Adaptations | en | L3-L5 | Existing |
| nature-tundra-arctic | Arctic Tundra Life | en | L4-L6 | New |
| nature-china-yellow-mountains | 中国自然奇观：黄山 | zh+en | L4-L6 | New |
| nature-china-jiuzhaigou | 中国自然奇观：九寨沟 | zh+en | L4-L6 | New |
| nature-yellowstone-national-park | Yellowstone National Park | en | L4-L6 | New |
| nature-grand-canyon | The Grand Canyon | en | L4-L6 | New |

---

## 3. Topic Count Summary

| Category | Topics in W0a | Existing | New |
|----------|---------------|----------|-----|
| 中国史 | 10 | 2 | 8 |
| 美国史 | 10 | 3 | 7 |
| 世界史 | 10 | 5 | 5 |
| 文学 | 8 | 0 | 8 |
| 诗歌 | 8 | 0 | 8 |
| 文化 | 8 | 5 | 3 |
| 艺术 | 8 | 0 | 8 |
| 经济与生活 | 8 | 0 | 8 |
| 故事 | 8 | 9 (existing zh ≥9) | merged/dedup |
| 人物 | 10 | 5 | 5 |
| 科学 | 10 | 6 | 4 |
| 数码与AI | 8 | 1 (ai-transforming-school) | 7 |
| 太空与天文 | 8 | 1 (moon-return) | 7 |
| 医学健康 | 8 | 1 (circulatory) | 7 |
| 时事 | 5 (evergreen) | 5 | 0 (W1 dynamic adds) |
| 体育 | 8 | 0 | 8 |
| 环保 | 8 | 0 | 8 |
| 自然生态 | 8 | 5 | 3 |
| **Total** | **151** | **~48** | **~103 new** |

---

## 4. Per-Child Configuration

### Child 1: G3 (即将升 G4, ~9-10 岁)

```yaml
child:
  reading_level_en: "L4"          # raised from G3 baseline (L3)
  reading_level_en_max: "L5"      # ceiling for stretch articles
  reading_level_zh: "L3"          # at-level for Chinese (slightly weaker)
  reading_level_zh_audio: true    # read-along enabled
  reading_level_zh_pinyin: true   # pinyin enabled
  category_priorities:            # initial weighting (system learns from interest_signal)
    高: [故事, 科学, 太空与天文, 体育]
    中: [中国史, 美国史, 世界史, 文化, 艺术, 自然生态, 数码与AI]
    低: [经济与生活, 医学健康, 文学, 诗歌, 环保, 时事]
  age_appropriateness:
    - block_topics: [opium-war, wwii-overview, black-death, mental-health]
    - require_kid_friendly_rewrite: [history-modern, news-current]
```

### Child 2: G6 (即将升 G7, ~11-12 岁)

```yaml
child:
  reading_level_en: "L7"
  reading_level_en_max: "L8"
  reading_level_zh: "L5"
  reading_level_zh_max: "L6"
  reading_level_zh_audio: true
  reading_level_zh_pinyin: true   # 仍保留，复杂字辅助
  category_priorities:
    高: [中国史, 美国史, 世界史, 数码与AI, 太空与天文, 经济与生活]
    中: [科学, 文化, 艺术, 人物, 体育, 文学, 时事]
    低: [故事, 诗歌, 医学健康, 环保, 自然生态]
  age_appropriateness:
    - block_topics: []           # G6 已可读多数 mature topic
    - require_kid_friendly_rewrite: []
```

> **Auto-leveling rule** (already exists per migration 033): 15+ articles at current level + 3 consecutive ≥80% accuracy → auto-bump up; reverse: 2 consecutive <60% → auto-bump down.

---

## 5. Schema Changes Proposed (W0a-task-2)

### 5a. New table: `topic_packs`

```sql
CREATE TABLE topic_packs (
  pack_id TEXT PRIMARY KEY,                        -- e.g., "china-empire", "us-revolution"
  pack_name_zh TEXT NOT NULL,                      -- 例: "秦汉帝国"
  pack_name_en TEXT NOT NULL,                      -- e.g., "Qin & Han Empires"
  category TEXT NOT NULL,                          -- one of the 18 v2 categories
  language TEXT NOT NULL CHECK (language IN ('zh', 'en', 'zh+en')),
  recommended_levels TEXT[] NOT NULL,              -- e.g., ['L4','L5','L6']
  description TEXT,
  total_articles INT DEFAULT 0,                    -- denorm: count(reading_topics where pack_id = this)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5b. `reading_topics` — new fields

```sql
ALTER TABLE reading_topics
  ADD COLUMN pack_id TEXT REFERENCES topic_packs(pack_id) ON DELETE SET NULL,
  ADD COLUMN pack_order INT,                       -- ordering within pack (1, 2, 3...)
  ADD COLUMN recommended_levels TEXT[] DEFAULT '{}',  -- ['L3','L4','L5'] preferred over target_grades
  ADD COLUMN category_v2 TEXT,                     -- new 18-category enum (kept legacy `category` for compat)
  ADD COLUMN freshness_until TIMESTAMPTZ,          -- 时事 only — auto-archive when expires
  ADD COLUMN age_min_level TEXT,                   -- block-list barrier (e.g., 'L5' = G5+ only)
  ADD COLUMN content_warnings TEXT[] DEFAULT '{}'; -- e.g., ['war', 'death', 'politics']
```

### 5c. `children` — new fields

```sql
ALTER TABLE children
  ADD COLUMN reading_level_en TEXT DEFAULT 'L3'
    CHECK (reading_level_en IN ('L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12')),
  ADD COLUMN reading_level_en_max TEXT,
  ADD COLUMN reading_level_zh TEXT DEFAULT 'L3'
    CHECK (reading_level_zh IN ('L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12')),
  ADD COLUMN reading_level_zh_max TEXT,
  ADD COLUMN audio_zh_enabled BOOLEAN DEFAULT TRUE,    -- read-along toggle
  ADD COLUMN pinyin_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN category_priorities JSONB DEFAULT '{}',   -- {"高": ["故事"], "中": [...], "低": [...]}
  ADD COLUMN interest_signal JSONB DEFAULT '{}',       -- {"故事": 0.8, "科学": 0.5} learned over time
  ADD COLUMN last_categories TEXT[] DEFAULT '{}';      -- last 5 categories shown (for variety)
```

> **Backward compat note**: existing `reading_level` column stays (RLS-policy-touching); new `reading_level_en` / `reading_level_zh` supplement it. `recommend/route.ts` will be migrated in W2.

### 5d. `reading_articles` — new fields

```sql
ALTER TABLE reading_articles
  ADD COLUMN pack_id TEXT REFERENCES topic_packs(pack_id) ON DELETE SET NULL,
  ADD COLUMN pack_order INT,
  ADD COLUMN audio_zh_url TEXT,                    -- TTS-generated audio (Azure Neural)
  ADD COLUMN audio_zh_alignment JSONB,             -- character-level timestamps {char: [t_start, t_end]}
  ADD COLUMN audio_zh_voice TEXT,                  -- 'xiaoxiao' / 'yunxi' / etc.
  ADD COLUMN content_warnings TEXT[] DEFAULT '{}';
```

> Audio alignment will be populated by W0b (Chinese read-along feature). For W0a, the columns are added but stay NULL.

### 5e. New index for recommendation query patterns

```sql
CREATE INDEX idx_reading_articles_recommend_pool
  ON reading_articles (status, language, raz_level)
  WHERE status = 'published';

CREATE INDEX idx_reading_topics_pack_order
  ON reading_topics (pack_id, pack_order)
  WHERE pack_id IS NOT NULL;
```

---

## 6. Open Decisions Awaiting Parent Review

These are the decisions I need explicit confirmation on before W0a-task-2/3/4 dispatch:

### Q-Review-1: 主题清单代表性

The above 151 topics — anything **missing** that you want included before dispatch? Anything you want **removed**? Especially:
- 中国近代/现代史只有 3 个主题（鸦片战争 / 辛亥革命 / 改革开放）—— 是否需要加抗战 / 新中国成立 / 港澳回归？
- 经济与生活类含 Bitcoin / 股市基础 — 接受度如何？
- 没有"宗教"专门类别（佛教/基督教/伊斯兰教文化），意图是放进文化类，但只占 1-2 主题。是否需要专门加？

### Q-Review-2: 年龄分级（content_warnings）

Some topics flag mature content. Confirm the block list for G3:
- ❌ Opium War (war + violence)
- ❌ WWII Overview (war + scale)
- ❌ Black Death (death + plague)
- ❌ Mental Health & Stress (mature)
- ⚠️ Vaccine History — OK?
- ⚠️ Discovery of Penicillin — OK?

### Q-Review-3: 拔高难度上限

英文 G3 → L4-L5（默认）/ L5（最大）。是否允许偶尔 L6？G6 → L7-L8（默认）/ L8（最大）。是否允许偶尔 L9？

### Q-Review-4: 中文级别策略

中文 G3 = L3，G6 = L5（比英文低 2-3 级）。这个降级是否合理？还是继续与英文同级靠拼音 + 跟读补差距？

### Q-Review-5: 主题包（pack）顺序约束

是否允许"乱序读"主题包？例如 china-empire pack 有 3 篇，孩子是否必须按 1→2→3 顺序，还是只是推荐顺序？

### Q-Review-6: 多语言主题（zh+en）

文化 / 艺术 / 故事 / 人物 类别中标了 `zh+en` 的主题，是要：
- (a) 生成两版独立文章（同 topic_key + language 区分），双倍存储
- (b) 一篇主语言版本 + 另一语言简短摘要（节省成本）
- (c) 只生成主语言版本，另一语言不做

---

## 7. W0a Task Graph (after this doc is approved)

Once Q-Review-1 to Q-Review-6 are confirmed, the following tasks will be compiled and dispatched:

```yaml
W0a-task-2: Migration 038 — topic_packs + reading_topics extensions
  write_scope: [supabase/migrations/038_topic_packs_v2.sql]
  read_scope: [supabase/migrations/035_create_reading_topics.sql, supabase/migrations/033_reading_level_system.sql]
  acceptance: 
    - topic_packs table exists with correct schema
    - reading_topics has pack_id/pack_order/recommended_levels/category_v2/freshness_until/age_min_level/content_warnings
    - All migrations idempotent (DO NOT FAIL on re-run)
  verification: supabase db push --dry-run pass; existing data integrity preserved
  rollback: drop new columns and table

W0a-task-3: Migration 039 — children + reading_articles extensions
  write_scope: [supabase/migrations/039_per_child_reading_v2.sql]
  read_scope: [supabase/migrations/033_reading_level_system.sql, supabase/migrations/030_english_reading_schema.sql]
  acceptance:
    - children has reading_level_en/zh/etc. fields
    - reading_articles has pack_id/audio_zh_url/audio_zh_alignment/content_warnings
    - Existing data filled with sensible defaults (reading_level → reading_level_en)
  verification: migration dry-run pass
  rollback: drop new columns

W0a-task-4: Seed script — 151 topics import
  write_scope: [scripts/seed-topic-matrix-v2.ts]
  read_scope: [.planning/topic-matrix-v2.md, supabase/migrations/038*, src/lib/reading/types.ts]
  acceptance:
    - upsert into topic_packs (~30 packs)
    - upsert into reading_topics (~151 topics) with correct pack_id, recommended_levels, category_v2
    - dry-run mode: prints summary, no DB write
  verification: dry-run pass; --execute then verify counts match this doc
  rollback: DELETE FROM reading_topics WHERE created_at >= migration_timestamp

W0a-task-5: Update content-generator prompt v1.5
  write_scope: [src/lib/reading/content-generator.ts]
  read_scope: [src/lib/reading/types.ts, .planning/topic-matrix-v2.md]
  acceptance:
    - Prompt accepts `recommended_levels` array (not single gradeLevel)
    - Prompt enforces age-appropriateness based on content_warnings
    - Pack context injected for sequential coherence (pack_order > 1 → reference previous article)
  verification: regen 3 sample articles (1 history G3, 1 science G6, 1 zh-poetry G5); quality gate pass
  rollback: revert content-generator.ts
```

These 4 tasks have **non-overlapping write_scope** → dispatch as **Wave Parallel**. task-2 and task-3 are independent migrations; task-4 depends on task-2 schema; task-5 is independent of all schema work but consumes the `.planning/topic-matrix-v2.md` design.

DAG:
```
W0a-task-2 ──┐
             ├─→ W0a-task-4 (seed)
W0a-task-3 ──┘
W0a-task-5 (prompt) — independent, can run in same wave
```

---

## 8. What This Document Does NOT Cover (Out of Scope for W0a)

- **W0b**: Chinese read-along TTS implementation (Azure Neural integration, audio_zh_alignment generation, ReadAlong UI component)
- **W1**: Parent-fed news pipeline (URL submission page, LLM rewriter, freshness expiry job)
- **W2**: Recommendation algorithm rewrite (per-child scoring, category_balance, auto-leveling wired in)
- **W3**: Quiz attempts feedback loop, drift detection, auto-regen signals

These are tracked in the parent plan and will be detailed once W0a closes.

---

## 9. Glossary

| Term | Definition |
|------|------------|
| RAZ Level | Reading A-Z difficulty level L1-L12, mapped to grades G1-G12 |
| Topic Pack | A 3-10 article series meant to be read sequentially within a theme |
| Pack Order | The position of an article inside its pack (1 = first to read) |
| Recommended Levels | Array of RAZ levels at which a topic can produce a quality article |
| Content Warnings | Tags marking sensitive content (war/death/politics) for age-gating |
| Freshness Until | Timestamp after which a 时事 article auto-archives |
| Interest Signal | Per-child JSONB tracking category preference learned from reading behavior |
| Auto-Leveling | Automatic level bump-up/down based on quiz accuracy and article count |
| Read-Along | Synchronized audio playback with character-level highlighting (W0b) |

---

## Reviewer Sign-Off

- [ ] Parent confirms 18 categories and 151 topics meet expectation
- [ ] Parent confirms per-child reading levels (G3 → L4-L5 en / L3 zh; G6 → L7-L8 en / L5 zh)
- [ ] Parent confirms content_warnings block list for G3
- [ ] Parent confirms schema additions don't conflict with future plans
- [ ] Parent confirms answers to Q-Review-1 through Q-Review-6

After sign-off, orchestrator will compile and dispatch W0a-task-2/3/4/5 as Wave Parallel via adhd-agent.
