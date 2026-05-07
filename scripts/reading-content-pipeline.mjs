#!/usr/bin/env node

/**
 * Reading Content Pipeline Script
 *
 * Standalone cron-compatible pipeline for generating English reading content.
 * Uses OpenAI to adapt curated news articles for different grade levels
 * and stores results in Supabase. Does NOT require Next.js runtime.
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL  (required)
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   OPENAI_API_KEY            (required)
 *   OPENAI_BASE_URL           (optional, default: https://api.openai.com/v1)
 *   OPENAI_READING_MODEL      (optional, default: gpt-4o-mini)
 *   PIPELINE_GRADES           (optional, default: "3,6")
 *   PIPELINE_TOPIC_LIMIT      (optional, default: 0 = all topics)
 *
 * Usage:
 *   node scripts/reading-content-pipeline.mjs
 *   PIPELINE_GRADES="3,4,5" PIPELINE_TOPIC_LIMIT=2 node scripts/reading-content-pipeline.mjs
 *
 * Exit codes:
 *   0 - all succeeded or partially skipped (no failures)
 *   1 - one or more articles failed
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Curated News Articles (10 seed articles)
// ---------------------------------------------------------------------------

/** @type {{ topicKey: string; category: string; sourceText: string; sourceUrl: string }[]} */
const CURATED_NEWS = [
  {
    topicKey: "moon-return-missions",
    category: "科学",
    sourceUrl: "https://www.nasa.gov/artemis",
    sourceText:
      "In the 1960s and 1970s, NASA's Apollo program successfully sent astronauts to the Moon. After more than fifty years, space agencies around the world are planning new missions to the Moon. NASA's Artemis program aims to land the first woman and the next man on the lunar surface by the mid-2020s. Unlike the Apollo missions, which were short visits, Artemis plans to build a long-term presence on the Moon. Astronauts will explore the South Pole of the Moon, where ice exists in permanently shadowed craters. This ice could be used for drinking water, breathable oxygen, and even rocket fuel. China's Chang'e program has also successfully landed robotic probes on the far side of the Moon and returned samples to Earth. Private companies like SpaceX are developing massive rockets capable of carrying both cargo and crew to the Moon. These efforts are seen as stepping stones for an even bigger goal: sending humans to Mars. Scientists believe that learning to live and work on the Moon will provide essential experience for the longer, more difficult journey to the Red Planet.",
  },
  {
    topicKey: "ocean-plastic-crisis",
    category: "环境",
    sourceUrl: "https://www.unep.org/topics/ocean-and-seas",
    sourceText:
      "Every year, approximately 11 million metric tons of plastic waste enters the world's oceans. That is equivalent to dumping a garbage truck full of plastic into the ocean every minute. Once in the ocean, plastic does not biodegrade. Instead, it breaks down into smaller pieces called microplastics, which are less than five millimeters in size. These microplastics are consumed by fish, sea turtles, seabirds, and marine mammals, often causing injury or death. Scientists have found microplastics in seafood, drinking water, and even in the air we breathe. Countries around the world are taking action to address this crisis. The United Nations is working on a Global Plastics Treaty that would set rules for plastic production, design, and disposal. Many countries have banned single-use plastic items such as straws, bags, and cutlery. Innovative technologies are being developed to clean up plastic already in the ocean, including floating barriers that collect debris and drones that map plastic hotspots. The most effective solution, however, remains reducing plastic use at the source.",
  },
  {
    topicKey: "ai-transforming-school",
    category: "科技",
    sourceUrl: "https://www.unesco.org/en/digital-education",
    sourceText:
      "Artificial intelligence is rapidly changing how students learn and how teachers teach. AI-powered tutoring systems can provide personalized instruction, adapting to each student's learning pace and style. When a student struggles with a math problem, the AI tutor can offer additional practice problems or explain the concept in a different way. For teachers, AI tools can grade assignments, analyze student performance data, and suggest lesson plans, freeing up time for direct instruction and mentoring. Language learning apps use AI to provide real-time feedback on pronunciation and grammar. However, the rise of AI in education also raises concerns. Some worry about student data privacy and the risk of AI reinforcing biases. Others are concerned that students might use AI chatbots to cheat on assignments. Schools are now developing policies for responsible AI use, teaching students how to use these tools ethically. Many educators believe that AI will not replace teachers but will become a powerful tool that enhances teaching and learning when used thoughtfully.",
  },
  {
    topicKey: "renewable-energy-boom",
    category: "科学",
    sourceUrl: "https://www.irena.org/Energy-Transition",
    sourceText:
      "The world is experiencing a massive shift toward renewable energy sources such as solar, wind, and hydropower. In 2023, global renewable energy capacity grew by nearly 50 percent compared to the previous year, the fastest growth rate in decades. Solar energy has become the cheapest source of electricity in many parts of the world, thanks to dramatic improvements in solar panel technology and manufacturing. Wind turbines, both on land and offshore, are also producing increasing amounts of clean electricity. China leads the world in renewable energy installations, followed by the United States and European nations. Many countries have set ambitious targets to reach net-zero carbon emissions by 2050, which will require even faster adoption of clean energy. Battery technology has also improved significantly, making it possible to store solar and wind energy for use when the sun is not shining or the wind is not blowing. While challenges remain, including grid infrastructure upgrades and the need for critical minerals, the transition to renewable energy is well underway and accelerating.",
  },
  {
    topicKey: "wildlife-protection-2020s",
    category: "自然",
    sourceUrl: "https://www.worldwildlife.org/initiatives/wildlife-conservation",
    sourceText:
      "The 2020s have brought new attention to wildlife protection as scientists report alarming declines in animal populations worldwide. According to the World Wildlife Fund, global wildlife populations have declined by an average of 69 percent since 1970. Habitat loss, climate change, pollution, and poaching are the primary threats. In response, conservation efforts have intensified. The Kunming-Montreal Global Biodiversity Framework, signed by nearly 200 countries in 2022, sets targets to protect 30 percent of land and ocean areas by 2030. In Africa, anti-poaching patrols use drones and AI-powered cameras to protect elephants and rhinos. In the oceans, marine protected areas have expanded significantly, giving fish and other marine life safe spaces to recover. Reintroduction programs have brought species like the California condor and the black-footed ferret back from the brink of extinction. Technology plays an increasing role in conservation, with satellite tracking helping scientists understand animal migration patterns and environmental DNA sampling allowing researchers to detect rare species without ever seeing them.",
  },
  {
    topicKey: "solar-system-exploration",
    category: "科学",
    sourceUrl: "https://solarsystem.nasa.gov",
    sourceText:
      "Our solar system consists of the Sun and everything that orbits around it, including eight planets, at least five dwarf planets, hundreds of moons, and millions of asteroids and comets. The Sun is a star, a giant ball of hot gas that provides light and heat to the entire system. The four inner planets, Mercury, Venus, Earth, and Mars, are rocky and relatively small. Earth is the only planet known to support life, with liquid water covering about 71 percent of its surface. Mars, called the Red Planet, has the tallest mountain in the solar system, Olympus Mons, which is about two and a half times the height of Mount Everest. The four outer planets, Jupiter, Saturn, Uranus, and Neptune, are gas giants or ice giants. Jupiter is the largest planet, with a famous Great Red Spot that is a storm larger than Earth. Saturn is known for its beautiful rings, made of ice and rock particles. For decades, space agencies have been sending robotic probes to explore these worlds. NASA's Voyager spacecraft, launched in 1977, are now over 20 billion kilometers from Earth, exploring interstellar space. The Perseverance rover is currently exploring Mars, searching for signs of ancient microbial life. Future missions plan to return samples from Mars and explore the icy moons of Jupiter and Saturn, which might harbor oceans beneath their frozen surfaces.",
  },
  {
    topicKey: "weather-and-climate",
    category: "科学",
    sourceUrl: "https://www.noaa.gov/education",
    sourceText:
      "Weather and climate are related but different concepts. Weather describes the conditions in the atmosphere at a specific time and place, such as whether it is raining, sunny, windy, or cloudy. Climate describes the average weather patterns in a region over a long period, typically 30 years or more. Weather is driven by the uneven heating of Earth's surface by the Sun. Warm air rises, cool air sinks, and this movement creates wind. When warm, moist air rises and cools, water vapor condenses into clouds and eventually falls as precipitation. The water cycle connects weather to the movement of water through evaporation, condensation, and precipitation. Different regions have different climates due to factors like latitude, altitude, distance from oceans, and prevailing winds. Tropical regions near the equator are generally hot and wet. Polar regions near the poles are cold and dry. Deserts receive very little rainfall, while rainforests receive abundant rain. Climate change, driven primarily by the burning of fossil fuels and deforestation, is causing global temperatures to rise. This leads to more extreme weather events, including stronger hurricanes, longer droughts, and more intense heatwaves. Understanding both weather and climate is essential for predicting future conditions and preparing for their impacts on agriculture, infrastructure, and human health.",
  },
  {
    topicKey: "animal-adaptations",
    category: "自然",
    sourceUrl: "https://www.nationalgeographic.com/animals",
    sourceText:
      "Animals have evolved amazing adaptations that help them survive in their environments. Adaptations can be physical features, such as a cheetah's speed or a polar bear's thick fur, or behavioral strategies, such as migration or hibernation. In cold environments, animals like polar bears and arctic foxes have thick fur and layers of fat for insulation. Their white fur provides camouflage against snow. Some animals, like the arctic hare, change their fur color from brown in summer to white in winter. In deserts, animals face extreme heat and scarce water. Camels can go for weeks without drinking and store fat in their humps. The fennec fox has large ears that radiate heat to keep it cool. Kangaroo rats never need to drink water, getting all the moisture they need from their food. In oceans, fish have gills to extract oxygen from water, while marine mammals like whales and dolphins must surface to breathe. Many deep-sea creatures produce their own light through bioluminescence to attract prey or mates. In rainforests, some frogs are brightly colored to warn predators they are poisonous. Others use camouflage to blend in with leaves or bark. Some insects look exactly like twigs or leaves. These adaptations developed over millions of years through natural selection, where individuals with traits better suited to their environment are more likely to survive and reproduce.",
  },
  {
    topicKey: "coral-reef-ecosystems",
    category: "自然",
    sourceUrl: "https://oceanservice.noaa.gov/education/coral",
    sourceText:
      "Coral reefs are often called the rainforests of the sea because of the incredible diversity of life they support. They cover less than 1 percent of the ocean floor but are home to about 25 percent of all marine species. Coral reefs are built by tiny animals called coral polyps. Each polyp is a soft-bodied animal related to jellyfish and sea anemones. The polyp secretes a hard outer skeleton of calcium carbonate, which forms the structure of the reef. When polyps die, new polyps grow on top of their skeletons, slowly building the reef over thousands of years. Most reef-building corals have a symbiotic relationship with microscopic algae called zooxanthellae that live inside their tissues. The algae photosynthesize and produce food for the coral, while the coral provides the algae with shelter and nutrients. This is why corals need clear, warm, shallow water where sunlight can reach the algae. Coral reefs provide essential services. They protect coastlines from storms and erosion by absorbing wave energy. They support fishing industries and tourism. They are also a source of new medicines. Unfortunately, coral reefs are in serious danger. Rising ocean temperatures cause coral bleaching, where stressed corals expel their algae and turn white. If temperatures remain high for too long, the corals die. Ocean acidification, pollution, overfishing, and destructive fishing practices also threaten reefs.",
  },
  {
    topicKey: "ancient-egypt",
    category: "历史",
    sourceUrl: "https://www.britannica.com/place/ancient-Egypt",
    sourceText:
      "Ancient Egypt was one of the world's greatest civilizations, lasting for over 3,000 years. It began around 3100 BCE when King Menes united Upper and Lower Egypt. The civilization grew along the Nile River, which provided water, food, and transportation. Every year, the Nile flooded and deposited rich soil on the riverbanks, which helped farmers grow wheat, barley, and flax. The Egyptians built magnificent pyramids as tombs for their pharaohs. The largest, the Great Pyramid of Giza, was the tallest man-made structure in the world for over 3,800 years. Egyptians developed a writing system called hieroglyphics, which used pictures and symbols to represent words and sounds. They also made advances in mathematics, medicine, and astronomy. Egyptian society was structured like a pyramid, with the pharaoh at the top, followed by nobles, priests, scribes, soldiers, farmers, and slaves at the bottom. The Egyptians believed in an afterlife and practiced mummification to preserve bodies for the journey to the next world. Their art, architecture, and culture continue to fascinate people today.",
  },
];

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function validateEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error(
      "Ensure these are set in .env.local or in the cron job environment."
    );
    // Use a specific error code so validation-only runs can detect it
    const err = new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    err.code = "ERR_MISSING_ENV";
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder (mirrors content-generator.ts buildGenerationPrompt)
// ---------------------------------------------------------------------------

function buildPrompt(sourceText, gradeLevel, category) {
  const wordLimit = gradeLevel <= 4 ? "300-450 words" : "500-800 words";
  const questionCount = gradeLevel <= 4 ? 5 : 8;
  const focusAreas =
    gradeLevel <= 4
      ? "Detail and vocabulary questions (easier)"
      : "Main idea and inference questions (more analytical)";

  return `You are adapting a reading passage for a Grade ${gradeLevel} student (age ${gradeLevel + 5}).

Original passage:
${sourceText.slice(0, 6000)}

Create an adapted version suitable for Grade ${gradeLevel}. Requirements:
- Target length: ${wordLimit}
- Grade-appropriate vocabulary and sentence complexity
- Clear topic, engaging opening paragraph
- Category: ${category}

Also create ${questionCount} comprehension questions (return as array).
Question types to include: ${focusAreas}
Mix of: main_idea, detail, inference, vocabulary, sequence.
Each question has 4 options (A/B/C/D), exactly one correct answer.
Difficulty scale: 1 (easiest) to 5 (hardest).

Return STRICT JSON (no markdown, no code fences):
{
  "title": "Article title (engaging for grade ${gradeLevel})",
  "content": "Full article text...",
  "summary": "One-sentence summary (max 30 words)",
  "word_count": number,
  "estimated_minutes": number,
  "difficulty": number (1-5),
  "questions": [
    {
      "question_text": "...",
      "question_type": "main_idea|detail|inference|vocabulary|sequence",
      "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correct_answer": "A",
      "difficulty": number (1-5)
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// OpenAI article generation
// ---------------------------------------------------------------------------

async function generateArticle(sourceText, gradeLevel, category, topicKey) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  });

  const prompt = buildPrompt(sourceText, gradeLevel, category);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an expert children's reading content creator. You adapt articles for specific grade levels and create comprehension questions. Always respond with valid JSON only, no markdown formatting.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4096,
  });

  const rawText = completion.choices[0]?.message?.content || "{}";
  // Strip <think>...</think> blocks (MiniMax reasoning models) and markdown fences
  const text = rawText
    .replace(/<think[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim() || "{}";
  const result = JSON.parse(text);

  return {
    article: {
      title: result.title || "Untitled",
      content: result.content || "",
      summary: result.summary || "",
      word_count: result.word_count || 0,
      estimated_minutes: result.estimated_minutes || 5,
      difficulty: result.difficulty || 3,
    },
    questions: (result.questions || []).map((q, i) => ({
      question_text: q.question_text || "",
      question_type: q.question_type || "detail",
      options: q.options || [],
      correct_answer: q.correct_answer || "A",
      difficulty: q.difficulty || 3,
    })),
  };
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Check if an article already exists for this topic+grade combination.
 * Returns { exists: boolean, id: string|null, status: string|null }.
 */
async function checkExistingArticle(supabase, topicKey, gradeLevel) {
  const { data, error } = await supabase
    .from("reading_articles")
    .select("id, status")
    .eq("topic_key", topicKey)
    .eq("grade_level", gradeLevel)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check existing article: ${error.message}`);
  }

  return {
    exists: !!data,
    id: data?.id || null,
    status: data?.status || null,
  };
}

/**
 * Upsert a reading article. Returns the article ID.
 */
async function upsertArticle(supabase, articleData) {
  const { data, error } = await supabase
    .from("reading_articles")
    .upsert(
      {
        topic_key: articleData.topicKey,
        grade_level: articleData.gradeLevel,
        title: articleData.title,
        content: articleData.content,
        source: "curated_news",
        source_url: articleData.sourceUrl,
        category: articleData.category,
        word_count: articleData.wordCount,
        estimated_minutes: articleData.estimatedMinutes,
        difficulty: articleData.difficulty,
        status: "published",
      },
      { onConflict: "topic_key, grade_level" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to upsert article: ${error.message}`);
  }

  return data.id;
}

/**
 * Replace questions for an article: delete old ones, insert new ones.
 */
async function replaceQuestions(supabase, articleId, questions) {
  // Delete existing questions
  const { error: deleteError } = await supabase
    .from("reading_questions")
    .delete()
    .eq("article_id", articleId);

  if (deleteError) {
    throw new Error(`Failed to delete old questions: ${deleteError.message}`);
  }

  // Insert new questions (if any)
  if (!questions || questions.length === 0) return;

  const { error: insertError } = await supabase
    .from("reading_questions")
    .insert(
      questions.map((q, i) => ({
        article_id: articleId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        correct_answer: q.correct_answer,
        difficulty: q.difficulty || 3,
        order_index: i + 1,
      }))
    );

  if (insertError) {
    throw new Error(`Failed to insert questions: ${insertError.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Reading Content Pipeline ===\n");

  // Validate environment
  validateEnv();

  // Parse config
  const grades = (process.env.PIPELINE_GRADES || "3,6")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  const topicLimit = parseInt(process.env.PIPELINE_TOPIC_LIMIT || "0", 10);
  const topics =
    topicLimit > 0 ? CURATED_NEWS.slice(0, topicLimit) : CURATED_NEWS;

  if (grades.length === 0) {
    console.error("ERROR: No valid grade levels configured.");
    process.exit(1);
  }

  console.log(`Grades:     ${grades.join(", ")}`);
  console.log(`Topics:     ${topics.length} (${topicLimit > 0 ? `limited to ${topicLimit}` : "all"})`);
  console.log(`Model:      ${process.env.OPENAI_READING_MODEL || "gpt-4o-mini"}`);
  console.log(`Base URL:   ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`);
  console.log("");

  const supabase = getSupabaseClient();

  let total = 0;
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const grade of grades) {
    for (const topic of topics) {
      total++;
      const key = `${topic.topicKey}|G${grade}`;
      process.stdout.write(
        `[${total}/${grades.length * topics.length}] ${key} (${topic.category})... `
      );

      try {
        // Step 1: Check if article already exists
        const existing = await checkExistingArticle(
          supabase,
          topic.topicKey,
          grade
        );

        if (existing.exists && existing.status === "published") {
          console.log(`SKIP (already published)`);
          skipped++;
          continue;
        }

        // Step 2: Generate article content via OpenAI
        const result = await generateArticle(
          topic.sourceText,
          grade,
          topic.category,
          topic.topicKey
        );

        // Step 3: Upsert article into Supabase
        const articleId = await upsertArticle(supabase, {
          topicKey: topic.topicKey,
          gradeLevel: grade,
          title: result.article.title,
          content: result.article.content,
          sourceUrl: topic.sourceUrl,
          category: topic.category,
          wordCount: result.article.word_count,
          estimatedMinutes: result.article.estimated_minutes,
          difficulty: result.article.difficulty,
        });

        // Step 4: Replace questions
        await replaceQuestions(supabase, articleId, result.questions);

        console.log(
          `OK — "${result.article.title}" (${result.questions.length} questions)`
        );
        succeeded++;
      } catch (err) {
        console.log(`FAIL — ${err.message}`);
        failed++;
      }
    }
  }

  console.log("\n=== PIPELINE COMPLETE ===");
  console.log(`Total:     ${total}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);

  // ERR_MISSING_ENV is expected when env vars are not set (e.g., syntax check)
  if (err.code === "ERR_MISSING_ENV") {
    console.error("(Expected when environment is not configured — this is not a code error.)");
  }

  process.exit(1);
});
