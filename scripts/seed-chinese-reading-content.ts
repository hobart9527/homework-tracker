#!/usr/bin/env tsx
/**
 * Seed Chinese Graded Reading Content
 * 从 reading_topics 表读取中文主题，通过统一管线生成文章。
 *
 * Usage: npx tsx scripts/seed-chinese-reading-content.ts [--scrape-first]
 * 需要环境变量: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from "dotenv";
import { getCorpusEntry } from "./reading/classic-corpus";
import { decideRoute, type RouteDecision } from "@/lib/reading/route-analyzer";
import { coerceQuestionType } from "@/lib/reading/standards";
import scrapeAllSources from "./reading/scrape-all-sources";
config({ path: ".env.local" });

interface TaskEntry {
  topic: {
    topic_key: string;
    category: string;
    target_grades: number[] | null;
    key_facts: string[] | null;
    source: string | null;
    source_image_url: string | null;
    content_completeness: string | null;
  };
  grade: number;
  topicKey: string;
  sourceText: string | undefined;
  routeDecision: RouteDecision;
}

interface NewZhTopicSeed {
  topic_key: string;
  category: string;
  target_grades: number[];
  key_facts: string[];
}

/**
 * New Chinese topics for underrepresented categories.
 * Upserted to reading_topics before the generation pipeline runs.
 * All use source="seed" and source_text=null (Route C full generation).
 */
const NEW_ZH_TOPICS: NewZhTopicSeed[] = [
  // ---------------------------------------------------------------------------
  // science/科普 (12 topics)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-science-solar-system", category: "科普", target_grades: [3,4,5,6,7], key_facts: ["太阳系有八大行星", "地球是太阳系中唯一已知有生命的行星", "太阳是太阳系的中心恒星"] },
  { topic_key: "zh-science-how-computer-works", category: "科普", target_grades: [3,4,5,6,7], key_facts: ["计算机用二进制处理信息", "CPU是计算机的大脑", "计算机由硬件和软件组成"] },
  { topic_key: "zh-science-ai-in-daily-life", category: "科普", target_grades: [4,5,6,7], key_facts: ["AI可以识别图像和语音", "AI已用于医疗诊断和自动驾驶", "机器学习是AI的核心技术"] },
  { topic_key: "zh-science-human-body", category: "科普", target_grades: [3,4,5,6], key_facts: ["人体有206块骨骼", "心脏每天跳动约10万次", "大脑有约860亿个神经元"] },
  { topic_key: "zh-science-dinosaurs", category: "科普", target_grades: [3,4,5], key_facts: ["恐龙生活在2.3亿至6600万年前", "鸟类是恐龙的后裔", "恐龙因小行星撞击而灭绝"] },
  { topic_key: "zh-science-ocean-exploration", category: "科普", target_grades: [4,5,6,7], key_facts: ["海洋覆盖地球71%表面", "最深的海沟约11000米", "人类只探索了5%的海洋"] },
  { topic_key: "zh-science-electricity", category: "科普", target_grades: [4,5,6,7], key_facts: ["电分为直流电和交流电", "闪电是一种自然放电现象", "电路由电源导线和负载组成"] },
  { topic_key: "zh-science-magnets", category: "科普", target_grades: [3,4,5,6], key_facts: ["磁铁有南北两极", "地球本身是一个大磁铁", "磁悬浮列车利用磁力悬浮"] },
  { topic_key: "zh-science-weather", category: "科普", target_grades: [3,4,5,6,7], key_facts: ["天气是短时大气状态", "气候是长期平均天气", "全球变暖影响地球气候"] },
  { topic_key: "zh-science-plants", category: "科普", target_grades: [3,4,5,6], key_facts: ["植物通过光合作用制造食物", "地球上约有39万种植物", "种子是植物的繁殖器官"] },
  { topic_key: "zh-science-evolution", category: "科普", target_grades: [5,6,7], key_facts: ["达尔文提出自然选择理论", "生物通过基因突变产生变异", "适者生存是进化的核心"] },
  { topic_key: "zh-science-space-exploration", category: "科普", target_grades: [4,5,6,7], key_facts: ["人类1969年首次登月", "国际空间站是最大的太空实验室", "火星是人类下一个探索目标"] },

  // ---------------------------------------------------------------------------
  // nature/自然 (12 topics)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-nature-giant-panda", category: "nature", target_grades: [3,4,5], key_facts: ["大熊猫是中国国宝", "大熊猫以竹子为主食", "野生大熊猫仅存约1800只"] },
  { topic_key: "zh-nature-ocean-animals", category: "nature", target_grades: [3,4,5,6], key_facts: ["蓝鲸是地球上最大的动物", "海豚使用回声定位", "珊瑚礁是海洋中的热带雨林"] },
  { topic_key: "zh-nature-rainforest", category: "nature", target_grades: [4,5,6,7], key_facts: ["热带雨林是地球上生物多样性最丰富的生态系统", "亚马逊雨林被称为地球之肺", "热带雨林面积正快速减少"] },
  { topic_key: "zh-nature-migratory-birds", category: "nature", target_grades: [3,4,5,6], key_facts: ["候鸟每年春秋两季迁徙", "大雁迁徙时排成人字形", "鸟类利用地磁和太阳导航"] },
  { topic_key: "zh-nature-butterfly", category: "nature", target_grades: [3,4,5], key_facts: ["蝴蝶是完全变态昆虫", "蝴蝶一生经历卵幼虫蛹成虫四阶段", "帝王蝶迁徙距离达4000公里"] },
  { topic_key: "zh-nature-desert", category: "nature", target_grades: [4,5,6,7], key_facts: ["沙漠年降水量少于250毫米", "骆驼是沙漠重要的交通工具", "仙人掌能在沙漠中储存水分"] },
  { topic_key: "zh-nature-endangered-species", category: "nature", target_grades: [4,5,6,7], key_facts: ["许多动物因栖息地破坏而濒危", "中国有大熊猫金丝猴等濒危保护动物", "建立自然保护区是保护濒危动物的重要方式"] },
  { topic_key: "zh-nature-freshwater", category: "nature", target_grades: [4,5,6], key_facts: ["淡水只占地球总水量的2.5%", "河流湖泊是重要的淡水生态系统", "湿地被称为地球之肾"] },
  { topic_key: "zh-nature-mountains", category: "nature", target_grades: [3,4,5,6,7], key_facts: ["珠穆朗玛峰是世界最高峰", "山脉海拔不同分布着不同的动植物", "山脉影响气候和降水"] },
  { topic_key: "zh-nature-insects", category: "nature", target_grades: [3,4,5], key_facts: ["昆虫是种类最多的动物类群", "蚂蚁蜜蜂等社会性昆虫有严格分工", "昆虫有六条腿和三段身体"] },
  { topic_key: "zh-nature-polar-regions", category: "nature", target_grades: [4,5,6], key_facts: ["南极和北极是地球上最寒冷的地方", "北极熊是北极的顶级捕食者", "企鹅只生活在南极"] },
  { topic_key: "zh-nature-sea-turtle", category: "nature", target_grades: [3,4,5], key_facts: ["海龟已在海洋生活超过1亿年", "海龟洄游数千公里回出生地产卵", "所有海龟种类都受到威胁"] },

  // ---------------------------------------------------------------------------
  // biography/人物 (9 topics)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-biography-yuan-longping", category: "biography", target_grades: [4,5,6,7], key_facts: ["袁隆平被称为中国杂交水稻之父", "他成功培育出高产杂交水稻", "为解决中国粮食问题做出巨大贡献"] },
  { topic_key: "zh-biography-zhong-nanshan", category: "biography", target_grades: [5,6,7], key_facts: ["钟南山是中国著名呼吸病学专家", "他在抗击非典和新冠疫情中做出突出贡献", "曾获得共和国勋章"] },
  { topic_key: "zh-biography-zu-chongzhi", category: "biography", target_grades: [4,5,6], key_facts: ["祖冲之是南北朝著名数学家和天文学家", "他将圆周率精确到小数点后七位", "这一成果领先世界近千年"] },
  { topic_key: "zh-biography-hua-luogeng", category: "biography", target_grades: [5,6,7], key_facts: ["华罗庚是中国现代数学之父", "他在数论领域做出杰出贡献", "自学成才成为世界级数学家"] },
  { topic_key: "zh-biography-zhan-tianyou", category: "biography", target_grades: [4,5,6], key_facts: ["詹天佑是中国首位铁路工程师", "他主持修建了京张铁路", "创造性地设计了人字形铁路"] },
  { topic_key: "zh-biography-li-siguang", category: "biography", target_grades: [5,6,7], key_facts: ["李四光是中国地质力学创始人", "他发现中国有丰富的石油资源", "推翻了中国贫油论"] },
  { topic_key: "zh-biography-mao-yisheng", category: "biography", target_grades: [4,5,6], key_facts: ["茅以升是中国著名桥梁专家", "他主持设计了钱塘江大桥", "这是中国人自行设计建造的第一座双线铁路桥"] },
  { topic_key: "zh-biography-wang-xuan", category: "biography", target_grades: [5,6,7], key_facts: ["王选是汉字激光照排系统创始人", "他的发明使中文印刷告别铅与火", "被誉为当代毕昇"] },
  { topic_key: "zh-biography-deng-jiaxian", category: "biography", target_grades: [5,6,7], key_facts: ["邓稼先是中国核武器研制奠基人", "他领导了中国第一颗原子弹和氢弹的研制", "被称为两弹元勋"] },

  // ---------------------------------------------------------------------------
  // current/时事 (9 topics)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-current-china-space-station", category: "current", target_grades: [4,5,6,7], key_facts: ["中国空间站天宫已建成", "神舟飞船定期运送航天员", "中国成为世界第三个拥有空间站的国家"] },
  { topic_key: "zh-current-olympic-spirit", category: "current", target_grades: [3,4,5,6], key_facts: ["现代奥运会每四年举办一次", "奥林匹克格言是更快更高更强更团结", "2022年冬奥会在北京成功举办"] },
  { topic_key: "zh-current-environment-action", category: "current", target_grades: [4,5,6,7], key_facts: ["中国提出2030年碳达峰2060年碳中和目标", "垃圾分类在全国推广", "可再生能源占比持续提高"] },
  { topic_key: "zh-current-cyber-safety", category: "current", target_grades: [4,5,6,7], key_facts: ["网络安全保护个人信息不受侵犯", "中国有网络安全法保护公民权益", "强密码和双因素认证能提高账户安全性"] },
  { topic_key: "zh-current-smart-city", category: "current", target_grades: [4,5,6,7], key_facts: ["智慧城市用科技提升城市管理效率", "智能交通系统减少拥堵", "物联网连接城市各种设施"] },
  { topic_key: "zh-current-high-speed-rail", category: "current", target_grades: [3,4,5,6,7], key_facts: ["中国高铁总里程世界第一", "复兴号时速可达350公里", "高铁极大缩短了城市间的旅行时间"] },
  { topic_key: "zh-current-tech-in-school", category: "current", target_grades: [3,4,5,6], key_facts: ["在线教育让学习更方便", "智能教育工具帮助个性化学习", "编程教育逐渐进入中小学课堂"] },
  { topic_key: "zh-current-volunteer", category: "current", target_grades: [4,5,6,7], key_facts: ["志愿者无偿为社会提供帮助", "中国注册志愿者超过2亿人", "志愿服务培养责任感和团队精神"] },
  { topic_key: "zh-current-youth-innovation", category: "current", target_grades: [5,6,7], key_facts: ["全国青少年科技创新大赛每年举办", "中国青少年在国际科学竞赛中屡获佳绩", "创新精神从小培养"] },

  // ---------------------------------------------------------------------------
  // 数学与逻辑 (6 topics) — category "科普" (science-adjacent)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-science-math-in-nature", category: "科普", target_grades: [4,5,6,7], key_facts: ["斐波那契数列在植物中普遍存在", "蜂巢的六边形结构是最省材料的形状", "蜘蛛网的几何结构极为精巧"] },
  { topic_key: "zh-science-logic-reasoning", category: "科普", target_grades: [4,5,6], key_facts: ["逻辑推理分为归纳和演绎", "排除法是常用的推理方法", "侦探推理考验观察和逻辑能力"] },
  { topic_key: "zh-science-chinese-abacus", category: "科普", target_grades: [3,4,5,6], key_facts: ["算盘是中国古代重要计算工具", "珠算已被列入非物质文化遗产", "算盘在计算机时代仍有独特价值"] },
  { topic_key: "zh-science-golden-ratio", category: "科普", target_grades: [5,6,7], key_facts: ["黄金分割比例约等于0.618", "黄金分割在艺术建筑中广泛应用", "帕特农神庙和蒙娜丽莎都运用了黄金分割"] },
  { topic_key: "zh-science-patterns", category: "科普", target_grades: [3,4,5,6], key_facts: ["自然界中存在丰富的周期和规律", "天气预报基于大气运动模式分析", "音乐中的节拍是时间模式"] },
  { topic_key: "zh-science-codes", category: "科普", target_grades: [4,5,6,7], key_facts: ["密码用于保护信息安全", "凯撒密码是最早的加密方法之一", "二维码存储信息需要图像识别解码"] },

  // ---------------------------------------------------------------------------
  // 体育与健康 (6 topics)
  // ---------------------------------------------------------------------------
  { topic_key: "zh-sport-basketball", category: "current", target_grades: [3,4,5,6], key_facts: ["篮球由詹姆斯奈史密斯发明", "篮球比赛每队五人上场", "中国篮球运动员姚明是NBA状元秀"] },
  { topic_key: "zh-sport-swimming", category: "current", target_grades: [3,4,5,6], key_facts: ["游泳是全身运动锻炼心肺功能", "蛙泳自由泳仰泳蝶泳是四种主要泳姿", "游泳时注意安全预防溺水"] },
  { topic_key: "zh-sport-healthy-eating", category: "current", target_grades: [3,4,5,6,7], key_facts: ["均衡饮食包括谷物蔬菜水果蛋白质乳制品", "每天应喝足量的水", "少吃零食和含糖饮料"] },
  { topic_key: "zh-sport-teamwork", category: "current", target_grades: [3,4,5,6], key_facts: ["团队合作需要沟通信任和分工", "接力赛体现团队配合的重要性", "足球篮球等团队运动培养合作精神"] },
  { topic_key: "zh-sport-traditional-games", category: "current", target_grades: [3,4,5,6], key_facts: ["踢毽子跳绳是传统的中国体育游戏", "太极拳是中华武术的瑰宝", "传统体育游戏锻炼身体又传承文化"] },
  { topic_key: "zh-sport-morning-exercise", category: "current", target_grades: [3,4,5], key_facts: ["每天户外活动1小时有益健康", "运动增强体质提高学习效率", "选择合适的运动项目培养运动习惯"] },
];

interface GenerationResult {
  topicKey: string;
  topic_key: string;
  grade: number;
  category: string;
  article: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["article"];
  questions: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["questions"];
  generatedIllustrations: Awaited<ReturnType<typeof import("@/lib/reading").generateReadingContent>>["illustrations"];
  coverResult: Awaited<ReturnType<typeof import("@/lib/reading").generateCover>> | null;
  pinyinContent: string;
  status: "published" | "draft";
  gate: { pass: boolean; issues: string[] };
  allIssues: Array<{ code: string; severity: string; message: string; source: string }>;
}

async function main() {
  // Dynamic imports after dotenv config so env vars are available.
  const { createServiceRoleClient } = await import("@/lib/supabase/server");
  const { Pacer, withRetry } = await import("@/lib/reading/concurrency");
  const {
    generateReadingContent,
    convertToRubyPinyin,
    generateCover,
    generateIllustrations,
    validateContent,
    validateIBCriteria,
    validateFactualAccuracy,
  } = await import("@/lib/reading");

  const pacer = new Pacer(3); // 3 concurrent LLM calls

  const supabase = await createServiceRoleClient();

  // ---------------------------------------------------------------------------
  // Seed new Chinese topics (skip with --no-seed)
  // ---------------------------------------------------------------------------
  const noSeed = process.argv.includes("--no-seed");
  if (!noSeed && NEW_ZH_TOPICS.length > 0) {
    console.log(`Seeding ${NEW_ZH_TOPICS.length} new Chinese topics...`);
    for (const t of NEW_ZH_TOPICS) {
      const { error } = await supabase.from("reading_topics").upsert(
        {
          topic_key: t.topic_key,
          language: "zh",
          category: t.category,
          source: "seed",
          source_text: null,
          status: "active",
          target_grades: t.target_grades,
          key_facts: t.key_facts,
        },
        { onConflict: "topic_key,language" }
      );
      if (error) {
        console.error(`  Topic seed failed for ${t.topic_key}: ${error.message}`);
      }
    }
    console.log("  Topic seeding complete.\n");
  } else if (noSeed) {
    console.log("Skipping topic seeding (--no-seed).\n");
  }

  // Optional: scrape content sources before loading topics
  const scrapeFirst = process.argv.includes("--scrape-first");
  if (scrapeFirst) {
    console.log("Scraping content sources first...");
    await scrapeAllSources({ dryRun: false, lang: "zh" });
    console.log("");
  }

  // ---------------------------------------------------------------------------
  // Fetch active Chinese topics from reading_topics
  // ---------------------------------------------------------------------------

  const { data: topics, error: topicsError } = await supabase
    .from("reading_topics")
    .select("topic_key, category, target_grades, key_facts, source, source_image_url, content_completeness")
    .eq("language", "zh")
    .eq("status", "active");

  if (topicsError) {
    console.error(`读取主题失败: ${topicsError.message}`);
    process.exit(1);
  }

  if (!topics || topics.length === 0) {
    console.log("没有找到 active 的中文主题，退出。");
    process.exit(0);
  }

  const TOPIC_LIMIT = parseInt(process.env.TOPIC_LIMIT || "0", 10);
  if (TOPIC_LIMIT > 0) {
    topics.splice(TOPIC_LIMIT);
    console.log(`TOPIC_LIMIT=${TOPIC_LIMIT}，限制处理前 ${TOPIC_LIMIT} 个主题`);
  }

  console.log(`找到 ${topics.length} 个中文主题，开始生成...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // ---------------------------------------------------------------------------
  // Phase 1: Collect all tasks and filter out existing ones
  // ---------------------------------------------------------------------------

  const allTasks: TaskEntry[] = [];

  for (const topic of topics) {
    // Resolve source text from corpus (needed before route decision)
    const sourceText = getCorpusEntry(topic.topic_key, "zh")?.content ?? undefined;

    // Determine route based on source text quality
    const routeDecision = decideRoute({
      topic_key: topic.topic_key,
      language: "zh",
      source: topic.source,
      source_text: sourceText ?? null,
      target_grades: topic.target_grades,
    });

    const grades = routeDecision.expandedGrades;

    for (const grade of grades) {
      const topicKey = `${topic.topic_key}-G${grade}`;
      allTasks.push({ topic, grade, topicKey, sourceText, routeDecision });
    }
  }

  // Check which already exist
  const tasksToProcess: TaskEntry[] = [];

  for (const task of allTasks) {
    const { data: existing } = await supabase
      .from("reading_articles")
      .select("id")
      .eq("topic_key", task.topicKey)
      .eq("language", "zh")
      .maybeSingle();

    if (existing) {
      console.log(`已存在，跳过: ${task.topic.topic_key} G${task.grade}`);
      skipCount++;
    } else {
      console.log(`排队中: ${task.topic.topic_key} G${task.grade}...`);
      tasksToProcess.push(task);
    }
  }

  console.log(`\n共 ${tasksToProcess.length} 个任务待处理，并发生成中...\n`);

  // ---------------------------------------------------------------------------
  // Phase 2: Generate content concurrently (up to 3 at a time)
  // ---------------------------------------------------------------------------

  const generationPromises = tasksToProcess.map(
    (task) =>
      pacer.run(async () => {
        console.log(`生成中: ${task.topic.topic_key} G${task.grade}...`);

        try {
          // 1. Generate content via unified pipeline (with retry)
          const { article, questions, illustrations: generatedIllustrations } =
            await withRetry(() =>
              generateReadingContent({
                topicKey: task.topic.topic_key,
                language: "zh",
                category: task.topic.category,
                gradeLevel: task.grade,
                sourceText: task.sourceText,
                route: task.routeDecision.route,
              })
            );

          // 2. Post-process pinyin
          const pinyinContent = convertToRubyPinyin(article.content);

          // 3. Quality gate, IB criteria gate, and factual accuracy gate
          const gate = validateContent({
            article,
            questions,
            language: "zh",
            gradeLevel: task.grade,
          });
          const ibGate = validateIBCriteria({
            article,
            questions,
            language: "zh",
            gradeLevel: task.grade,
          });
          const factualGate = validateFactualAccuracy({
            article,
            sourceText: task.sourceText,
            keyFacts: task.topic.key_facts || undefined,
            language: "zh",
            gradeLevel: task.grade,
          });

          // Merge issues with source tagging
          const allIssues = [
            ...gate.issues.map(i => ({ ...i, source: "quality" as const })),
            ...ibGate.issues.map(i => ({ ...i, source: "ib-criteria" as const })),
            ...factualGate.issues.map(i => ({ ...i, source: "factual" as const })),
          ];

          // Route A: skip factual gate (original text is trusted)
          const effectiveFactualPass = task.routeDecision.route === "A" ? true : factualGate.pass;
          const status = gate.pass && ibGate.pass && effectiveFactualPass ? "published" : "draft";

          // 4. Generate cover (non-blocking failure)
          let coverResult: Awaited<ReturnType<typeof generateCover>> | null = null;
          try {
            coverResult = await pacer.run(() =>
              withRetry(() =>
                generateCover({
                  articleId: "pending",
                  language: "zh",
                  category: task.topic.category,
                  scene: article.scene_description,
                  title: article.title,
                  sourceImageUrl: task.topic.source_image_url ?? undefined,
                })
              )
            );
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[cover] ${task.topic.topic_key} G${task.grade} 封面生成失败: ${reason}`);
          }

          return {
            topicKey: task.topicKey,
            topic_key: task.topic.topic_key,
            grade: task.grade,
            category: task.topic.category,
            article,
            questions,
            generatedIllustrations,
            coverResult,
            pinyinContent,
            status,
            gate: {
              pass: gate.pass,
              issues: gate.issues.map((i) => i.message),
            },
            allIssues,
          } as GenerationResult;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`生成失败: ${task.topic.topic_key} G${task.grade} — ${reason}`);
          throw error;
        }
      })
  );

  // Wait for all generations to complete
  const results = await Promise.allSettled(generationPromises);

  // ---------------------------------------------------------------------------
  // Phase 3: DB operations (sequential, no concurrency needed)
  // ---------------------------------------------------------------------------

  for (const result of results) {
    if (result.status === "rejected") {
      errorCount++;
      continue;
    }

    const gen = result.value;
    const taskEntry = tasksToProcess.find(
      (t) => t.topicKey === gen.topicKey
    )!;

    try {
      // Insert article
      const { data: articleRow, error: articleError } = await supabase
        .from("reading_articles")
        .insert({
          topic_key: gen.topicKey,
          title: gen.article.title,
          content: gen.article.content,
          language: "zh",
          pinyin_content: gen.pinyinContent,
          source: "ai_generated",
          content_source: taskEntry.routeDecision.route === "A" ? "original" : taskEntry.routeDecision.route === "B" ? "adapted" : "llm",
          category: gen.category,
          grade_level: gen.grade,
          word_count: gen.article.word_count,
          estimated_minutes: gen.article.estimated_minutes,
          difficulty: gen.article.difficulty,
          status: gen.status,
          summary: gen.article.summary || null,
          scene_description: gen.article.scene_description || null,
          classical_quote: gen.article.classical_quote || null,
          cover_image_url: gen.coverResult?.url ?? null,
          cover_source: gen.coverResult?.source ?? null,
          cover_source_url: gen.coverResult?.source_url ?? null,
          quality_issues: gen.allIssues.length > 0 ? gen.allIssues : null,
        })
        .select()
        .single();

      if (articleError) {
        console.error(`插入文章失败: ${articleError.message}`);
        errorCount++;
        continue;
      }

      // Update cover with real articleId if generated
      if (gen.coverResult && gen.coverResult.url) {
        try {
          const { downloadAndUploadFromUrl } = await import(
            "@/lib/reading/storage-uploader"
          );
          const { buildCoverPrompt } = await import(
            "@/lib/reading/cover-style-presets"
          );
          const { positive } = buildCoverPrompt(gen.category, gen.article.scene_description);
          const seed = Math.floor(Math.random() * 1_000_000);
          const externalUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            positive
          )}?width=800&height=533&seed=${seed}&nologo=true`;

          const upload = await downloadAndUploadFromUrl({
            externalUrl,
            path: `covers/${articleRow.id}.webp`,
          });

          await supabase
            .from("reading_articles")
            .update({
              cover_image_url: upload.url,
              cover_source_url: externalUrl,
            })
            .eq("id", articleRow.id);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[cover-reupload] ${gen.topic_key} G${gen.grade} 失败: ${reason}`);
        }
      }

      // Insert questions
      if (gen.questions.length > 0) {
        const { error: deleteQuestionsError } = await supabase
          .from("reading_questions")
          .delete()
          .eq("article_id", articleRow.id);

        if (deleteQuestionsError) {
          console.warn(`删除旧题目警告: ${deleteQuestionsError.message}`);
        }

        const questionsToInsert = gen.questions.map((q, idx) => ({
          article_id: articleRow.id,
          question_text: q.question_text,
          question_type: coerceQuestionType(q.question_type),
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty,
          order_index: idx,
        }));

        const { error: questionError } = await supabase
          .from("reading_questions")
          .insert(questionsToInsert);

        if (questionError) {
          console.error(`插入题目失败: ${questionError.message}`);
        }
      }

      // Generate and insert illustrations
      try {
        const illustrationScenes = gen.generatedIllustrations.map((ill) => ({
          paragraphIndex: ill.paragraph_index,
          sceneDescription: ill.scene_description,
        }));

        const illustrationResults = await pacer.run(() =>
          withRetry(() =>
            generateIllustrations({
              articleId: articleRow.id,
              language: "zh",
              category: gen.category,
              scenes: illustrationScenes,
            })
          )
        );

        if (illustrationResults.length > 0) {
          const { error: deleteIllustError } = await supabase
            .from("reading_article_illustrations")
            .delete()
            .eq("article_id", articleRow.id);

          if (deleteIllustError) {
            console.warn(`删除旧插图警告: ${deleteIllustError.message}`);
          }

          const illustrationsToInsert = illustrationResults.map((ill) => ({
            article_id: articleRow.id,
            paragraph_index: ill.paragraph_index,
            image_url: ill.url,
            source_url: ill.source_url,
            source: ill.source,
            scene_description:
              illustrationScenes.find(
                (s) => s.paragraphIndex === ill.paragraph_index
              )?.sceneDescription ?? null,
          }));

          const { error: illustError } = await supabase
            .from("reading_article_illustrations")
            .insert(illustrationsToInsert);

          if (illustError) {
            console.error(`插入插图失败: ${illustError.message}`);
          }
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[illustrations] ${gen.topic_key} G${gen.grade} 失败: ${reason}`);
      }

      console.log(
        `完成: ${gen.article.title} (${gen.article.word_count}字, 难度${gen.article.difficulty}, status=${gen.status})`
      );
      successCount++;
    } catch (dbError) {
      const reason = dbError instanceof Error ? dbError.message : String(dbError);
      console.error(`DB操作失败: ${gen.topic_key} G${gen.grade} — ${reason}`);
      errorCount++;
    }
  }

  console.log(
    `\n完成！成功: ${successCount}, 跳过: ${skipCount}, 失败: ${errorCount}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});