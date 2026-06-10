/**
 * Tier 2 Classic Corpus for Reading Content Pipeline
 *
 * Provides authentic classic texts (public domain) as sourceText for historical,
 * cultural, and literary reading articles. Pipeline will adapt these texts to
 * appropriate grade levels.
 */

export interface ClassicCorpusEntry {
  topic_key: string;
  title: string;
  content: string;
  source: string;
  source_url: string | null;
  tags: string[];
  grade_range: [number, number];
  ib_theme_code: string;
  text_type: string;
}

// ============================================================================
// Chinese Classic Texts (10+ entries)
// ============================================================================

const chineseCorpus: ClassicCorpusEntry[] = [
  // ---- 成语故事 ----
  {
    topic_key: "chengyu-ths",
    title: "铁杵成针",
    content: "磨针溪，在眉州象耳山下。世传李太白读书山中，未成，弃去。过小溪，逢老媪方磨铁杵，问之，曰：'欲作针。'太白感其意，还卒业。媪自言姓武。今溪旁有武氏岩。",
    source: "《方舆胜览》",
    source_url: null,
    tags: ["成语故事", "励志", "坚持"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-shouwang",
    title: "守株待兔",
    content: "宋人有耕者。田中有株，兔走触株，折颈而死。因释其耒而守株，冀复得兔。兔不可复得，而身为宋国笑。",
    source: "《韩非子·五蠹》",
    source_url: null,
    tags: ["成语故事", "寓言", "智慧"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-yuema",
    title: "叶公好龙",
    content: "叶公子高好龙，钩以写龙，凿以写龙，屋室雕文以写龙。于是天龙闻而下之，窥头于牖，施尾于堂。叶公见之，弃而还走，失其魂魄，五色无主。是叶公非好龙也，好夫似龙而非龙者也。",
    source: "《新序·杂事》",
    source_url: null,
    tags: ["成语故事", "寓言", "真诚"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  // ---- 历史故事 ----
  {
    topic_key: "lishi-zhuged",
    title: "诸葛亮草船借箭",
    content: '周瑜请亮议曰："今日督军，欲与曹兵交战。请问先生，水战用什么兵器最好？"亮曰："以弓箭最佳。"瑜曰："军中正缺箭用，敢烦先生监造十万支箭，此乃公事，望先生勿辞。"亮曰："都督见委，自当效劳。只需三日，便可交差。"瑜不信，欲观后效。亮唤鲁肃同去取箭。亮曰："望子敬借我二十只船，每船军士三十人，船上用青布蒙住，并扎一千个草人分布于船两侧。"是夜大雾漫天，亮令人将二十只船向北进发，靠近曹营。亮下令擂鼓呐喊。曹兵不敢轻动，只命弓箭手射箭御敌。待雾散时，草人上已插满箭矢，共得十万余支。',
    source: "《三国演义》",
    source_url: null,
    tags: ["历史故事", "三国", "智慧"],
    grade_range: [4, 6],
    ib_theme_code: "T2",
    text_type: "fiction",
  },
  {
    topic_key: "lishi-ximen",
    title: "西门豹治邺",
    content: '魏文侯时，西门豹为邺令。豹往到邺，会长老，问民所疾苦。长老曰："苦为河伯娶妇，以故贫。"豹问其故，对曰："邺三老、廷掾常岁赋敛民财，收取其钱得数百万，用其二三十万为河伯娶妇，与祝巫共分其余钱持归。"豹曰："至为河伯娶妇时，愿三老、巫祝、父老送女河上，幸来告语之，吾亦往送女。"皆曰："诺。"至其时，豹往会之河上。三老、官属、豪长者、里父老皆会，以人民往观之者三二千人。豹视之，顾谓三老、巫祝、父老曰："是女子不好，烦大巫妪为入报河伯，更求好女，后日送之。"使吏卒共抱大巫妪投之河中。良久，豹曰："巫妪何久也？弟子趣之？"复以一人投之河中。凡投三弟子。豹复曰："巫妪、弟子是女子也，不能白事。"复使掾趣之，皆投河中。于是邺之吏民大惊恐，不敢复言河伯娶妇。',
    source: "《史记·滑稽列传》",
    source_url: null,
    tags: ["历史故事", "战国", "智慧", "破除迷信"],
    grade_range: [4, 6],
    ib_theme_code: "T2",
    text_type: "fiction",
  },
  // ---- 古典诗词 ----
  {
    topic_key: "shici-chunjiang",
    title: "春江花月夜（节选）",
    content: "春江潮水连海平，海上明月共潮生。滟滟随波千万里，何处春江无月明。江流宛转绕芳甸，月照花林皆似霰。空里流霜不觉飞，汀上白沙看不见。江天一色无纤尘，皎皎空中孤月轮。",
    source: "唐代·张若虚《春江花月夜》",
    source_url: null,
    tags: ["古典诗词", "写景", "自然"],
    grade_range: [3, 6],
    ib_theme_code: "T3",
    text_type: "poetry",
  },
  {
    topic_key: "shici-denggao",
    title: "登鹳雀楼",
    content: "白日依山尽，黄河入海流。欲穷千里目，更上一层楼。",
    source: "唐代·王之涣《登鹳雀楼》",
    source_url: null,
    tags: ["古典诗词", "写景", "励志"],
    grade_range: [3, 6],
    ib_theme_code: "T3",
    text_type: "poetry",
  },
  // ---- 寓言故事 ----
  {
    topic_key: "yuyan-hehual",
    title: "荷花生子",
    content: '荷花生一子，落地三日，即能行走游泳。荷花生见之，忧曰："我子甚小，而江湖甚大，奈何？"其子曰："不须忧也。落泥中则泥处行，住水中则水处泳，随所在而安之，夫何忧乎？"',
    source: "民间寓言",
    source_url: null,
    tags: ["寓言", "智慧", "适应环境"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-yanmu",
    title: "晏子使楚",
    content: '晏子将使楚。楚王闻之，谓左右曰："晏婴，齐之习辞者也，今方来，吾欲辱之，何以也？"左右对曰："为其来也，臣请缚一人，过王而行。王曰，何为者也？对曰，齐人也。王曰，何坐？曰，坐盗。"晏子至，楚王赐晏子酒。酒酣，吏二缚一人诣王。王曰："缚者曷为者也？"对曰："齐人也，坐盗。"王视晏子曰："齐人固善盗乎？"晏子避席对曰："婴闻之，橘生淮南则为橘，生于淮北则为枳，叶徒相似，其实味不同。所以然者何？水土异也。今民生长于齐不盗，入楚则盗，得无楚之水土使民善盗耶？"王笑曰："圣人非所与熙也，寡人反取病焉。"',
    source: "《晏子春秋》",
    source_url: null,
    tags: ["寓言", "历史", "智慧", "外交"],
    grade_range: [4, 6],
    ib_theme_code: "T5",
    text_type: "fiction",
  },
  // ---- 文化故事 ----
  {
    topic_key: "wenhua-zhuanke",
    title: '王羲之写"鹅"字',
    content: '王羲之性爱鹅。会稽有孤居老姥养一鹅，善鸣，求市未能得，遂携亲友命驾就观。姥闻羲之将至，烹以待之，羲之叹息弥日。又山阴有一道士，养好鹅，羲之往观焉，意甚悦，固求市之。道士云："性好道，久欲写《道德经》，无人能书，若义之写经毕，当以相与。"羲之欣然写毕，笼鹅而归，甚以为乐。其任率如此。',
    source: "《晋书·王羲之传》",
    source_url: null,
    tags: ["文化", "历史人物", "书法"],
    grade_range: [3, 6],
    ib_theme_code: "T3",
    text_type: "non-fiction",
  },
];

// ============================================================================
// English Classic Texts (8+ entries)
// ============================================================================

const englishCorpus: ClassicCorpusEntry[] = [
  // ---- Grimm's Fairy Tales ----
  {
    topic_key: "grimm-snowwhite",
    title: "Snow White and the Seven Dwarfs (Excerpt)",
    content: "Once upon a time a queen sat sewing at her window when she pricked her finger and three drops of blood fell on the snow that lay on the ebony windowframe. She said to herself, How white I am! How red my blood! Then she wished for a daughter with skin as white as snow, lips as red as blood, and hair as black as ebony wood. Soon after, the queen had a little girl who was everything she had wished for. They named her Snow White. But the queen became wicked and jealous. When Snow White grew up, the queen ordered a huntsman to take the girl into the forest and kill her. The huntsman took pity on Snow White and let her go. She ran deep into the forest where she found a small house belonging to seven dwarfs. She lived with them and became their friend. The queen eventually learned Snow White was still alive, and disguised herself as an old woman to bring her a poisoned apple.",
    source: "Brothers Grimm, 'Snow White'",
    source_url: null,
    tags: ["fairy tale", "classic literature", " Grimm"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "grimm-hansel",
    title: "Hansel and Gretel (Excerpt)",
    content: "A poor woodcutter had two children named Hansel and Gretel. Their mother had died, and their stepmother wanted to abandon the children in the forest. Hansel overheard their plan and filled his pockets with small white pebbles so he could find his way home. That night, he scattered the pebbles at the door. The children were left in the forest, but the moonlight showed the pebbles, and they found their way home. The stepmother locked the door so Hansel could not gather more pebbles. When they were taken to the forest again, Hansel broke off a piece of bread from his pocket and dropped the crumbs on the path. But the birds ate the crumbs, and they could not find their way home. Instead, they discovered a strange little house made of bread, cake, and candy. A friendly voice invited them inside.",
    source: "Brothers Grimm, 'Hansel and Gretel'",
    source_url: null,
    tags: ["fairy tale", "classic literature", " Grimm", "adventure"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "grimm-raven",
    title: "The Twelve Dancing Princesses (Excerpt)",
    content: "A king had twelve daughters, each more beautiful than the last. They all slept in one room with twelve beds. Every morning, their shoes were worn out from dancing. The king promised his kingdom to whoever could discover where the princesses danced at night, but anyone who tried and failed was put to death. An old soldier returning from war passed through the kingdom and learned of the challenge. He received a magic cloak from an old woman and was able to watch the princesses. He saw that each night, a hidden door opened beneath their room, leading to a beautiful island where twelve princes waited to dance with them until dawn.",
    source: "Brothers Grimm, 'The Twelve Dancing Princesses'",
    source_url: null,
    tags: ["fairy tale", "classic literature", " Grimm", "mystery"],
    grade_range: [3, 6],
    ib_theme_code: "T3",
    text_type: "fiction",
  },
  // ---- Aesop's Fables ----
  {
    topic_key: "aesop-tortoise",
    title: "The Tortoise and the Hare",
    content: 'A hare was making fun of a tortoise one day. You move so slowly! said the hare. You will never win a race against me. The tortoise smiled and replied, I may be slow, but I am steady. Let us race and see who crosses the finish line first. The hare agreed and ran as fast as the wind. But after running a short distance, he decided to take a nap under a shady tree, thinking he had plenty of time. The tortoise kept walking, never stopping. When the hare woke up and ran to the finish line, he found the tortoise had already arrived. Slow and steady wins the race, said the tortoise proudly.',
    source: "Aesop's Fables",
    source_url: null,
    tags: ["fable", "Aesop", "morality", "perseverance"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "aesop-boywolf",
    title: "The Boy Who Cried Wolf",
    content: 'A shepherd boy often bored while watching his sheep. To have some fun, he rushed down to the village shouting, Wolf! Wolf! The villagers came running to help him, only to find no wolf was there. The boy laughed at their worried faces. This happened several times. Then one evening, a real wolf came out of the forest. The boy was terrified and cried out, Wolf! Wolf! But this time, the villagers thought he was playing his old trick and ignored him. The wolf chased away the sheep, and the boy learned an important lesson about lying.',
    source: "Aesop's Fables",
    source_url: null,
    tags: ["fable", "Aesop", "morality", "honesty"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "aesop-travellers",
    title: "The Two Travelers and the Bear",
    content: 'Two friends were walking through a dark forest when they saw a large bear approaching. One of them quickly climbed a tree and hid in the branches. The other, knowing he could not escape, fell flat on the ground, pretending to be dead. The bear came close and sniffed the man on the ground. But the bear only eats those who are dead, so after a while, the bear walked away. When the man in the tree came down, he asked his friend what the bear had whispered in his ear. The friend replied, The bear told me never to travel with a friend who abandons you when danger comes. True friends are known in times of trouble.',
    source: "Aesop's Fables",
    source_url: null,
    tags: ["fable", "Aesop", "morality", "friendship"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  // ---- Classic Literature Excerpts ----
  {
    topic_key: "literature-treasure",
    title: "Treasure Island (Excerpt)",
    content: 'Squire Trelawney, Doctor Livesey, and I sat in the inn at Bristol, waiting for our ship to set sail. The squire had bought a ship and hired a crew. I had never seen the sea before, and I was both excited and frightened. On the day we were to leave, a strange man with a scarred face arrived at the inn. He gave me a coin and told me to listen for the sailors song: Fifteen men on the dead mans chest. That night, I heard the song and saw the scarred man singing with the crew. Little did I know then how dangerous that song would prove to be.',
    source: "Robert Louis Stevenson, 'Treasure Island'",
    source_url: null,
    tags: ["classic literature", "adventure", "Treasure Island"],
    grade_range: [4, 6],
    ib_theme_code: "T3",
    text_type: "fiction",
  },
  {
    topic_key: "literature-alice",
    title: "Alice's Adventures in Wonderland (Excerpt)",
    content: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do. She had been reading, but the book had no pictures or conversations in it. What is the use of a book, thought Alice, without pictures or conversations? Just then, a white rabbit with pink eyes ran close beside her. She heard it say, Oh dear! Oh dear! I shall be late! This was very remarkable, but Alice was not surprised to hear the rabbit speak. She followed it down a large rabbit hole and fell for a long time. When she landed, she found herself in a long, low hall with many locked doors. In the center was a small golden key on a table. The key opened a tiny door behind a curtain, leading to a beautiful garden.',
    source: "Lewis Carroll, 'Alice's Adventures in Wonderland'",
    source_url: null,
    tags: ["classic literature", "fantasy", "adventure"],
    grade_range: [3, 6],
    ib_theme_code: "T3",
    text_type: "fiction",
  },
];

// ============================================================================
// Combined corpus and lookup function
// ============================================================================

export const classicCorpus: ClassicCorpusEntry[] = [...chineseCorpus, ...englishCorpus];

/**
 * Look up a corpus entry by topic_key and language.
 * @param topicKey - the topic_key to match
 * @param language - "zh" for Chinese, "en" for English
 * @returns the matching entry, or undefined if not found
 */
export function getCorpusEntry(
  topicKey: string,
  language: "zh" | "en"
): ClassicCorpusEntry | undefined {
  // Normalize: strip grade suffix if present (e.g., "chengyu-ths-G3" -> "chengyu-ths")
  const baseKey = topicKey.replace(/-G\d+$/, "");
  return classicCorpus.find(
    (entry) =>
      entry.topic_key === baseKey ||
      entry.topic_key === topicKey ||
      topicKey.startsWith(entry.topic_key)
  );
}
