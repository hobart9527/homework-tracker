import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateArticleContent } from "@/lib/reading";

// Built-in curated news blurbs (timeless educational topics)
const CURATED_NEWS: Array<{
  topicKey: string;
  category: string;
  sourceText: string;
  sourceUrl?: string;
}> = [
  {
    topicKey: "space-telescope-discoveries",
    category: "科学",
    sourceText:
      "Space telescopes like the James Webb Space Telescope have revolutionized our understanding of the universe. Launched in 2021, JWST can see further into space and further back in time than any telescope before it. It has captured images of the earliest galaxies formed after the Big Bang, revealed new details about exoplanet atmospheres, and shown us star-forming regions in stunning clarity. These discoveries help scientists understand how our universe began and whether other planets might support life.",
    sourceUrl: "https://webb.nasa.gov",
  },
  {
    topicKey: "electric-vehicle-revolution",
    category: "时事",
    sourceText:
      "Electric vehicles (EVs) are transforming transportation around the world. Major car manufacturers have committed to phasing out gasoline-powered cars in favor of electric models over the next two decades. Countries like Norway lead the transition, with over 80% of new car sales being electric in 2024. China is the world's largest EV market. Advances in battery technology have increased driving range and reduced costs. However, challenges remain, including building enough charging infrastructure and ensuring the electricity grid can handle increased demand.",
  },
  {
    topicKey: "olympic-games-spirit",
    category: "文化",
    sourceText:
      "The Olympic Games bring together athletes from over 200 nations every two years, alternating between Summer and Winter Games. Beyond competition, the Olympics promote values of excellence, friendship, and respect. The Games trace their roots to ancient Greece in 776 BCE, where they were held in Olympia to honor Zeus. The modern Olympics were revived in 1896 by Pierre de Coubertin. Memorable moments include Jesse Owens winning four gold medals in 1936 Berlin, and the 2008 Beijing opening ceremony.",
  },
  {
    topicKey: "rainforest-conservation",
    category: "自然",
    sourceText:
      "Rainforests cover only about 6% of Earth's land surface but are home to more than half of the world's plant and animal species. The Amazon rainforest alone produces about 20% of the world's oxygen. However, rainforests are being destroyed at an alarming rate for agriculture, logging, and mining. Scientists estimate that 137 species of plants, animals, and insects become extinct every day due to rainforest loss. Conservation efforts include creating protected areas, sustainable farming practices, and reforestation projects.",
  },
  {
    topicKey: "artificial-intelligence-daily-life",
    category: "科学",
    sourceText:
      "Artificial intelligence has moved from science fiction into everyday life. AI systems now help doctors diagnose diseases, enable cars to drive themselves, power voice assistants like Siri and Alexa, recommend movies on streaming services, and even help students learn. The development of large language models has made AI more capable of understanding and generating human language. While AI brings many benefits, experts also discuss important questions about privacy, job changes, and making sure AI is used ethically and fairly.",
  },
  {
    topicKey: "great-barrier-reef",
    category: "自然",
    sourceText:
      "The Great Barrier Reef off the coast of Australia is the world's largest coral reef system, stretching over 2,300 kilometers. It is so large it can be seen from space. The reef is home to over 1,500 species of fish, 400 types of coral, and many other marine animals including sea turtles, dolphins, and sharks. However, rising ocean temperatures due to climate change have caused widespread coral bleaching, where corals expel the colorful algae living inside them and turn white. Scientists are working on innovative solutions, including growing heat-resistant corals.",
  },
  {
    topicKey: "renewable-energy-growth",
    category: "时事",
    sourceText:
      "Countries around the world are investing heavily in renewable energy sources like solar, wind, and hydroelectric power. The cost of solar panels has dropped by over 80% in the last decade, making solar power cheaper than coal in many places. China leads the world in renewable energy production. The European Union aims to get 40% of its energy from renewable sources by 2030. Wind farms, both on land and offshore, are expanding rapidly. These changes are crucial for reducing greenhouse gas emissions and fighting climate change.",
  },
  {
    topicKey: "mars-exploration",
    category: "科学",
    sourceText:
      "Mars has captured human imagination for centuries. NASA's Perseverance rover, which landed on Mars in 2021, is searching for signs of ancient microbial life and collecting rock samples for future return to Earth. The Ingenuity helicopter demonstrated powered flight on another planet for the first time. China's Tianwen-1 mission successfully placed a rover on Mars. SpaceX is developing Starship with the goal of eventually sending humans to Mars. Scientists believe Mars once had liquid water on its surface, raising the question of whether life ever existed there.",
  },
  {
    topicKey: "endangered-species-protection",
    category: "自然",
    sourceText:
      "An endangered species is a species at serious risk of extinction. The International Union for Conservation of Nature maintains the Red List, which currently assesses over 150,000 species. More than 42,000 are threatened with extinction. The main cause is habitat loss as human populations grow. Climate change is an accelerating threat. Conservation efforts have achieved successes: the bald eagle was removed from the endangered list after DDT was banned, and the giant panda's status improved from endangered to vulnerable thanks to habitat preservation in China.",
  },
  {
    topicKey: "world-cup-football",
    category: "文化",
    sourceText:
      "The FIFA World Cup is the most widely viewed sporting event in the world, held every four years. National teams compete in a month-long tournament that captures global attention. The first World Cup was held in 1930 in Uruguay. Brazil holds the record with five championships. The tournament has expanded from 13 teams in 1930 to 48 teams starting in 2026. Beyond sport, the World Cup brings together different cultures, promotes international understanding, and inspires millions of young people to play football.",
  },
];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const grades: number[] = body.grades || [3, 6]; // default G3 + G6
  const topics = body.topics || CURATED_NEWS; // allow custom topics
  const limit: number = body.limit || 0; // 0 = all, >0 = only first N topics

  const items = limit > 0 ? topics.slice(0, limit) : topics;
  const results: Array<{
    topicKey: string;
    grade: number;
    status: string;
    articleId?: string;
    error?: string;
  }> = [];

  for (const item of items) {
    for (const grade of grades) {
      try {
        const { article, questions } = await generateArticleContent({
          sourceText: item.sourceText,
          sourceUrl: item.sourceUrl,
          gradeLevel: grade,
          category: item.category,
          topicKey: item.topicKey,
        });

        const { data: articleData, error: articleError } = await supabase
          .from("reading_articles")
          .upsert(
            {
              topic_key: item.topicKey,
              title: article.title,
              content: article.content,
              source: "news_api",
              source_url: item.sourceUrl || null,
              category: item.category,
              grade_level: grade,
              word_count: article.word_count,
              estimated_minutes: article.estimated_minutes,
              difficulty: article.difficulty,
              status: "published",
            },
            { onConflict: "topic_key,grade_level" },
          )
          .select("id")
          .single();

        if (articleError) throw articleError;

        const questionRows = questions.map((q, i) => ({
          article_id: articleData.id,
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          difficulty: q.difficulty,
          order_index: i,
        }));

        await supabase.from("reading_questions").insert(questionRows);

        results.push({
          topicKey: item.topicKey,
          grade,
          status: "ok",
          articleId: articleData.id,
        });
      } catch (err) {
        results.push({
          topicKey: item.topicKey,
          grade,
          status: "error",
          error: String(err),
        });
      }
    }
  }

  return NextResponse.json({
    total: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
