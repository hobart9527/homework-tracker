import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: articles, count } = await supabase
    .from("reading_articles")
    .select("*", { count: "exact" });
  console.log(`reading_articles: ${count}`);

  if (articles && articles.length > 0) {
    const zh = articles.filter((a: any) => a.language === "zh").length;
    const en = articles.filter((a: any) => a.language === "en").length;
    console.log(`zh=${zh}, en=${en}`);
    const byStatus: Record<string, number> = {};
    for (const a of articles) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    console.log("By status:", JSON.stringify(byStatus));
    console.log("Latest:", articles[articles.length-1]?.title);
  }
}

main().catch(console.error);
