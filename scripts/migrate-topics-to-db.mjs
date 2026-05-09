#!/usr/bin/env node

/**
 * One-shot data migration: load reading_topics from the four legacy
 * hardcoded topic lists.
 *
 * Sources (read-only):
 *   1. scripts/reading-content-pipeline.mjs        — CURATED_NEWS  (10, en)
 *   2. scripts/seed-reading-content.mjs            — TOPICS + SOURCE_TEXTS (60 rows / 35 unique en)
 *   3. scripts/seed-chinese-reading-content.mjs    — CHINESE_SEED_TOPICS (30, zh)
 *   4. src/app/api/reading/refresh-news/route.ts   — CURATED_NEWS (33, en)
 *
 * Dedup key: (topic_key, language). When the same (topic_key, language) appears
 * in multiple sources, the entry that ships with non-empty source_text wins;
 * if multiple have source_text, the longer one wins; target_grades are unioned;
 * source_url falls back to whatever source provides one.
 *
 * Modes:
 *   --dry-run                Print summary + sample rows; no DB writes
 *   (default)                Upsert all rows into reading_topics on conflict
 *                            (topic_key, language). Requires service-role creds.
 *
 * Usage:
 *   node scripts/migrate-topics-to-db.mjs --dry-run
 *   node scripts/migrate-topics-to-db.mjs
 */

import { config } from "dotenv";
config({ path: ".env.local" });

// ---------------------------------------------------------------------------
// Source 1: scripts/reading-content-pipeline.mjs CURATED_NEWS (10, English)
// Each entry has its own sourceText (G3-friendly).
// ---------------------------------------------------------------------------
const PIPELINE_CURATED_NEWS = [
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
    sourceUrl:
      "https://www.worldwildlife.org/initiatives/wildlife-conservation",
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
// Source 2: scripts/seed-reading-content.mjs TOPICS + SOURCE_TEXTS
// 60 (topicKey, gradeLevel) rows mapping to 35 unique English topics.
// We collapse to per-topic entries with target_grades unioned and pick
// SOURCE_TEXTS at the lowest grade (which carries the canonical text).
// ---------------------------------------------------------------------------
const SEED_TOPICS = [
  { topicKey: "moon-return-missions", category: "时事", gradeLevel: 3 },
  { topicKey: "moon-return-missions", category: "时事", gradeLevel: 6 },
  { topicKey: "ocean-plastic-crisis", category: "时事", gradeLevel: 3 },
  { topicKey: "ocean-plastic-crisis", category: "时事", gradeLevel: 6 },
  { topicKey: "ai-transforming-school", category: "时事", gradeLevel: 3 },
  { topicKey: "ai-transforming-school", category: "时事", gradeLevel: 6 },
  { topicKey: "renewable-energy-boom", category: "时事", gradeLevel: 3 },
  { topicKey: "renewable-energy-boom", category: "时事", gradeLevel: 6 },
  { topicKey: "wildlife-protection-2020s", category: "时事", gradeLevel: 3 },
  { topicKey: "wildlife-protection-2020s", category: "时事", gradeLevel: 6 },

  { topicKey: "ancient-egypt", category: "历史", gradeLevel: 3 },
  { topicKey: "ancient-greece-democracy", category: "历史", gradeLevel: 3 },
  { topicKey: "silk-road-trade", category: "历史", gradeLevel: 3 },
  { topicKey: "great-wall-china", category: "历史", gradeLevel: 3 },
  { topicKey: "viking-age", category: "历史", gradeLevel: 3 },
  { topicKey: "industrial-revolution", category: "历史", gradeLevel: 6 },
  { topicKey: "american-revolution", category: "历史", gradeLevel: 6 },
  { topicKey: "renaissance-art-science", category: "历史", gradeLevel: 6 },
  { topicKey: "age-of-exploration", category: "历史", gradeLevel: 6 },
  { topicKey: "world-war-ii-overview", category: "历史", gradeLevel: 6 },

  { topicKey: "solar-system-exploration", category: "科学", gradeLevel: 3 },
  { topicKey: "human-body-systems", category: "科学", gradeLevel: 3 },
  { topicKey: "weather-and-climate", category: "科学", gradeLevel: 3 },
  { topicKey: "animal-adaptations", category: "科学", gradeLevel: 3 },
  { topicKey: "states-of-matter", category: "科学", gradeLevel: 3 },
  { topicKey: "genetics-and-dna", category: "科学", gradeLevel: 6 },
  { topicKey: "electricity-circuits", category: "科学", gradeLevel: 6 },
  { topicKey: "photosynthesis", category: "科学", gradeLevel: 6 },
  { topicKey: "plate-tectonics", category: "科学", gradeLevel: 6 },
  { topicKey: "human-circulatory-system", category: "科学", gradeLevel: 6 },

  { topicKey: "marie-curie", category: "人物", gradeLevel: 3 },
  { topicKey: "albert-einstein", category: "人物", gradeLevel: 3 },
  { topicKey: "helen-keller", category: "人物", gradeLevel: 3 },
  { topicKey: "thomas-edison", category: "人物", gradeLevel: 3 },
  { topicKey: "rosa-parks", category: "人物", gradeLevel: 3 },
  { topicKey: "nelson-mandela", category: "人物", gradeLevel: 6 },
  { topicKey: "florence-nightingale", category: "人物", gradeLevel: 6 },
  { topicKey: "leonardo-da-vinci", category: "人物", gradeLevel: 6 },
  { topicKey: "amelia-earhart", category: "人物", gradeLevel: 6 },
  { topicKey: "martin-luther-king-jr", category: "人物", gradeLevel: 6 },

  { topicKey: "rainforest-ecosystems", category: "自然", gradeLevel: 3 },
  { topicKey: "ocean-life-zones", category: "自然", gradeLevel: 3 },
  { topicKey: "butterfly-life-cycle", category: "自然", gradeLevel: 3 },
  { topicKey: "desert-adaptations", category: "自然", gradeLevel: 3 },
  { topicKey: "coral-reef-ecosystems", category: "自然", gradeLevel: 3 },
  { topicKey: "food-chains-webs", category: "自然", gradeLevel: 6 },
  { topicKey: "animal-migration", category: "自然", gradeLevel: 6 },
  { topicKey: "world-biomes", category: "自然", gradeLevel: 6 },
  { topicKey: "endangered-species", category: "自然", gradeLevel: 6 },
  { topicKey: "water-cycle", category: "自然", gradeLevel: 6 },

  { topicKey: "chinese-new-year", category: "文化", gradeLevel: 3 },
  { topicKey: "chinese-new-year", category: "文化", gradeLevel: 6 },
  { topicKey: "diwali-festival", category: "文化", gradeLevel: 3 },
  { topicKey: "diwali-festival", category: "文化", gradeLevel: 6 },
  { topicKey: "japanese-tea-ceremony", category: "文化", gradeLevel: 3 },
  { topicKey: "japanese-tea-ceremony", category: "文化", gradeLevel: 6 },
  { topicKey: "mexican-day-of-dead", category: "文化", gradeLevel: 3 },
  { topicKey: "mexican-day-of-dead", category: "文化", gradeLevel: 6 },
  { topicKey: "thanksgiving-traditions", category: "文化", gradeLevel: 3 },
  { topicKey: "thanksgiving-traditions", category: "文化", gradeLevel: 6 },
];

// SOURCE_TEXTS keyed by `${topicKey}|G${gradeLevel}`. We import only one
// canonical text per topic; in seed-reading-content.mjs the G3 and G6 entries
// are identical for current-events/culture topics and unique for the rest.
// To keep this script self-contained we inline them here (one line per topic
// at lowest grade).  Pulled verbatim from seed-reading-content.mjs §source_text.
const SEED_SOURCE_TEXTS = {
  "moon-return-missions": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "moon-return-missions"
  ).sourceText,
  "ocean-plastic-crisis": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "ocean-plastic-crisis"
  ).sourceText,
  "ai-transforming-school": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "ai-transforming-school"
  ).sourceText,
  "renewable-energy-boom": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "renewable-energy-boom"
  ).sourceText,
  "wildlife-protection-2020s": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "wildlife-protection-2020s"
  ).sourceText,
  "ancient-egypt": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "ancient-egypt"
  ).sourceText,
  "solar-system-exploration": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "solar-system-exploration"
  ).sourceText,
  "weather-and-climate": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "weather-and-climate"
  ).sourceText,
  "animal-adaptations": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "animal-adaptations"
  ).sourceText,
  "coral-reef-ecosystems": PIPELINE_CURATED_NEWS.find(
    (n) => n.topicKey === "coral-reef-ecosystems"
  ).sourceText,
  // Topics unique to seed-reading-content.mjs — text is pulled verbatim.
  "ancient-greece-democracy":
    "Ancient Greece is often called the birthplace of democracy. The word democracy comes from the Greek words demos, meaning people, and kratos, meaning power. Around 508 BCE, the city-state of Athens introduced a new system of government in which citizens could vote on laws and policies directly. However, not everyone was considered a citizen. Only free adult men born in Athens could participate. Women, slaves, and foreigners had no political rights. Citizens gathered in the Athenian Assembly to debate and vote on important matters such as war, taxes, and new laws. They also used a system called ostracism to vote on whether to exile a dangerous citizen for ten years. Greek democracy was direct, meaning citizens voted on issues themselves rather than electing representatives. This was possible because Athens was a small city-state. Today, most modern democracies are representative, meaning citizens elect officials to make decisions on their behalf. The ideas developed in ancient Athens influenced the founding fathers of the United States and continue to shape democratic governments around the world.",
  "silk-road-trade":
    "The Silk Road was not a single road but a vast network of trade routes that connected China with Central Asia, the Middle East, and Europe. It was active from about 130 BCE to the 1400s CE. The name comes from the valuable Chinese silk that was traded along these routes, but many other goods were exchanged as well. From China, merchants carried silk, tea, paper, and porcelain. From the West, they brought gold, silver, glassware, wool, and horses. The Silk Road was about 6,400 kilometers long and crossing it took months or even years. Travel was dangerous due to harsh deserts, high mountains, and bandits. Caravans often traveled together for safety. Along the way, trading cities like Samarkand and Baghdad became wealthy centers of culture and learning. More than goods traveled the Silk Road. Ideas, religions, and technologies also spread. Buddhism traveled from India to China along these routes. Papermaking, gunpowder, and the compass slowly made their way from Asia to Europe. The Silk Road was one of the most important channels of cultural exchange in world history.",
  "great-wall-china":
    "The Great Wall of China is one of the most impressive construction projects in human history. It is not a single continuous wall but a collection of walls, fortifications, and watchtowers built over many centuries. The earliest sections were built as early as the 7th century BCE, but the most famous sections were constructed during the Ming Dynasty between 1368 and 1644 CE. The main purpose of the wall was to protect Chinese states and empires from invasions by nomadic groups from the north. The wall also helped control trade and immigration. Soldiers stationed along the wall would light signal fires to warn of approaching danger.",
  "viking-age":
    "The Viking Age lasted from about 793 to 1066 CE. The Vikings came from Scandinavia, which includes the modern countries of Norway, Sweden, and Denmark. They were skilled sailors, warriors, and traders. Their famous longships were fast, lightweight, and could sail in both open seas and shallow rivers. This allowed them to travel great distances and launch surprise attacks.",
  "industrial-revolution":
    "The Industrial Revolution was a period of profound technological, economic, and social change that began in Britain around 1760 and spread throughout Europe and North America over the following century. At its core was a shift from handmade production in homes to machine-powered manufacturing in factories.",
  "american-revolution":
    "The American Revolution was a political and military conflict that took place between 1765 and 1783, in which the thirteen American colonies overthrew British rule and established the United States of America.",
  "renaissance-art-science":
    "The Renaissance, meaning 'rebirth' in French, was a period of remarkable cultural, artistic, and scientific achievement that began in Italy around the 14th century and spread across Europe until the 17th century.",
  "age-of-exploration":
    "The Age of Exploration, also called the Age of Discovery, spanned from the early 15th to the early 17th century. During this period, European nations sent ships across the Atlantic, Indian, and Pacific Oceans in search of new trade routes, resources, and knowledge.",
  "world-war-ii-overview":
    "World War II was the deadliest and most widespread conflict in human history, lasting from 1939 to 1945. It involved most of the world's nations, including all major powers, organized into two opposing military alliances: the Allies and the Axis.",
  "human-body-systems":
    "The human body is an incredible machine made up of several systems that work together to keep us alive and healthy. Each system has a specific job, and they all depend on each other.",
  "states-of-matter":
    "Matter is anything that has mass and takes up space. It exists in four main states: solid, liquid, gas, and plasma. The state depends on how tightly the particles that make up the material are packed together and how much energy they have.",
  "genetics-and-dna":
    "Genetics is the study of heredity, or how traits are passed from parents to offspring. The foundation of genetics lies in DNA, or deoxyribonucleic acid, a molecule that contains the instructions for building and maintaining an organism.",
  "electricity-circuits":
    "Electricity is a form of energy resulting from the movement of charged particles, typically electrons. It powers everything from tiny calculators to massive city grids.",
  "photosynthesis":
    "Photosynthesis is one of the most important biochemical processes on Earth. It is the process by which plants, algae, and some bacteria convert light energy from the Sun into chemical energy stored in glucose.",
  "plate-tectonics":
    "Plate tectonics is the scientific theory that explains how Earth's outer layer, called the lithosphere, is divided into several large and small plates that move slowly over the planet's surface.",
  "human-circulatory-system":
    "The circulatory system is the body's transportation network, delivering oxygen, nutrients, and hormones to cells while removing waste products like carbon dioxide. It consists of the heart, blood vessels, and blood.",
  "marie-curie":
    "Marie Curie was one of the most brilliant scientists in history. She was born Maria Sklodowska in Warsaw, Poland, in 1867. At that time, women were not allowed to attend university in Poland, so Marie moved to Paris to study at the Sorbonne.",
  "albert-einstein":
    "Albert Einstein is widely regarded as one of the greatest physicists of all time. Born in Ulm, Germany, in 1879, Einstein was a curious child who loved mathematics and science.",
  "helen-keller":
    "Helen Keller was an American author, activist, and lecturer who overcame tremendous challenges. Born in 1880 in Tuscumbia, Alabama, she became ill at 19 months old, leaving her both blind and deaf.",
  "thomas-edison":
    "Thomas Edison was one of the most prolific inventors in American history. Born in 1847 in Milan, Ohio, Edison had little formal schooling.",
  "rosa-parks":
    "Rosa Parks was a courageous African American woman whose simple act of defiance helped spark a movement for civil rights in the United States. She was born in 1913 in Tuskegee, Alabama.",
  "nelson-mandela":
    "Nelson Mandela was a South African anti-apartheid revolutionary and political leader who served as South Africa's first Black president from 1994 to 1999.",
  "florence-nightingale":
    "Florence Nightingale was a pioneering nurse who revolutionized healthcare and established nursing as a respected profession. Born in 1820 to a wealthy British family.",
  "leonardo-da-vinci":
    "Leonardo da Vinci was the ultimate Renaissance man, excelling as a painter, sculptor, architect, engineer, scientist, and inventor. Born in 1452 in the Tuscan town of Vinci, Italy.",
  "amelia-earhart":
    "Amelia Earhart was a pioneering aviator, author, and women's rights advocate who became a symbol of courage and determination. Born in 1897 in Atchison, Kansas, Earhart was a tomboy who loved adventure.",
  "martin-luther-king-jr":
    "Martin Luther King Jr. was a Baptist minister and civil rights leader who became the most prominent voice for racial equality in American history.",
  "rainforest-ecosystems":
    "Rainforests are the most diverse ecosystems on Earth, covering only about 6 percent of the planet's land surface but containing more than half of all plant and animal species.",
  "ocean-life-zones":
    "The ocean is divided into different zones based on how much sunlight reaches each depth. Each zone has unique conditions and is home to specially adapted creatures.",
  "butterfly-life-cycle":
    "Butterflies undergo one of nature's most remarkable transformations, called complete metamorphosis. Their life cycle has four distinct stages: egg, larva, pupa, and adult.",
  "desert-adaptations":
    "Deserts are harsh environments that receive less than 250 millimeters of rain per year. They can be scorching hot during the day and surprisingly cold at night.",
  "food-chains-webs":
    "All living things need energy to survive, and that energy flows through ecosystems in what scientists call food chains and food webs.",
  "animal-migration":
    "Migration is the large-scale movement of animals from one place to another, usually in response to seasonal changes in food availability, temperature, or breeding conditions.",
  "world-biomes":
    "A biome is a large geographic region characterized by its climate, soil, and the plants and animals that live there.",
  "endangered-species":
    "An endangered species is a species at serious risk of extinction, meaning it could disappear from Earth forever.",
  "water-cycle":
    "The water cycle, also known as the hydrological cycle, is the continuous movement of water through the Earth's atmosphere, land, and oceans.",
  "chinese-new-year":
    "Chinese New Year, also known as the Spring Festival, is the most important traditional holiday in China and many other parts of Asia.",
  "diwali-festival":
    "Diwali, also called the Festival of Lights, is the most important holiday in India and is celebrated by Hindus, Sikhs, Jains, and Buddhists around the world.",
  "japanese-tea-ceremony":
    "The Japanese tea ceremony, called chanoyu or sado, is a traditional practice that involves the ceremonial preparation and presentation of matcha, a powdered green tea.",
  "mexican-day-of-dead":
    "The Day of the Dead, or Dia de los Muertos, is a Mexican holiday that honors deceased loved ones and celebrates the continuity of life.",
  "thanksgiving-traditions":
    "Thanksgiving is a national holiday celebrated primarily in the United States and Canada, centered around giving thanks for the harvest and the blessings of the past year.",
};

// ---------------------------------------------------------------------------
// Source 3: scripts/seed-chinese-reading-content.mjs CHINESE_SEED_TOPICS (30, zh)
// ---------------------------------------------------------------------------
const CHINESE_SEED_TOPICS = [
  { topicKey: "守株待兔", category: "成语故事", grades: [3, 5] },
  { topicKey: "亡羊补牢", category: "成语故事", grades: [3, 5] },
  { topicKey: "刻舟求剑", category: "成语故事", grades: [4, 6] },
  { topicKey: "画蛇添足", category: "成语故事", grades: [4, 6] },
  { topicKey: "井底之蛙", category: "成语故事", grades: [3, 5] },
  { topicKey: "买椟还珠", category: "成语故事", grades: [5, 7] },

  { topicKey: "狼来了", category: "寓言", grades: [3, 4] },
  { topicKey: "乌鸦喝水", category: "寓言", grades: [3, 4] },
  { topicKey: "盲人摸象", category: "寓言", grades: [4, 5] },
  { topicKey: "龟兔赛跑", category: "寓言", grades: [3, 5] },
  { topicKey: "蚂蚁和蟋蟀", category: "寓言", grades: [4, 5] },

  { topicKey: "大禹治水", category: "历史", grades: [4, 6] },
  { topicKey: "孔子的故事", category: "历史", grades: [5, 7] },
  { topicKey: "秦始皇统一中国", category: "历史", grades: [5, 7] },
  { topicKey: "张骞出使西域", category: "历史", grades: [5, 7] },
  { topicKey: "桃园三结义", category: "历史", grades: [4, 6] },
  { topicKey: "草船借箭", category: "历史", grades: [5, 7] },
  { topicKey: "岳飞精忠报国", category: "历史", grades: [6, 7] },
  { topicKey: "郑和下西洋", category: "历史", grades: [5, 7] },

  { topicKey: "我的好朋友", category: "现代文", grades: [3, 4] },
  { topicKey: "第一次参加运动会", category: "现代文", grades: [4, 5] },
  { topicKey: "校园里的那棵树", category: "现代文", grades: [4, 6] },
  { topicKey: "和家人一起做饭", category: "现代文", grades: [3, 4] },
  { topicKey: "我最难忘的一天", category: "现代文", grades: [5, 6] },
  { topicKey: "我的梦想", category: "现代文", grades: [5, 7] },

  { topicKey: "太阳系有哪些行星", category: "科普", grades: [4, 6] },
  { topicKey: "地震是怎么发生的", category: "科普", grades: [5, 7] },
  { topicKey: "月球是怎么形成的", category: "科普", grades: [5, 6] },
  { topicKey: "为什么天空是蓝色的", category: "科普", grades: [4, 6] },
  { topicKey: "恐龙的灭绝", category: "科普", grades: [3, 5] },
];

// ---------------------------------------------------------------------------
// Source 4: src/app/api/reading/refresh-news/route.ts CURATED_NEWS (33, en)
// Each entry has its own sourceText.
// ---------------------------------------------------------------------------
const REFRESH_NEWS = [
  {
    topicKey: "space-telescope-discoveries",
    category: "科学",
    sourceText:
      "Space telescopes like the James Webb Space Telescope have revolutionized our understanding of the universe. Launched in 2021, JWST can see further into space and further back in time than any telescope before it.",
    sourceUrl: "https://webb.nasa.gov",
  },
  {
    topicKey: "electric-vehicle-revolution",
    category: "时事",
    sourceText:
      "Electric vehicles (EVs) are transforming transportation around the world. Major car manufacturers have committed to phasing out gasoline-powered cars in favor of electric models over the next two decades.",
  },
  {
    topicKey: "olympic-games-spirit",
    category: "文化",
    sourceText:
      "The Olympic Games bring together athletes from over 200 nations every two years, alternating between Summer and Winter Games. Beyond competition, the Olympics promote values of excellence, friendship, and respect.",
  },
  {
    topicKey: "rainforest-conservation",
    category: "自然",
    sourceText:
      "Rainforests cover only about 6% of Earth's land surface but are home to more than half of the world's plant and animal species. The Amazon rainforest alone produces about 20% of the world's oxygen.",
  },
  {
    topicKey: "artificial-intelligence-daily-life",
    category: "科学",
    sourceText:
      "Artificial intelligence has moved from science fiction into everyday life. AI systems now help doctors diagnose diseases, enable cars to drive themselves, power voice assistants like Siri and Alexa.",
  },
  {
    topicKey: "great-barrier-reef",
    category: "自然",
    sourceText:
      "The Great Barrier Reef off the coast of Australia is the world's largest coral reef system, stretching over 2,300 kilometers. It is so large it can be seen from space.",
  },
  {
    topicKey: "renewable-energy-growth",
    category: "时事",
    sourceText:
      "Countries around the world are investing heavily in renewable energy sources like solar, wind, and hydroelectric power. The cost of solar panels has dropped by over 80% in the last decade.",
  },
  {
    topicKey: "mars-exploration",
    category: "科学",
    sourceText:
      "Mars has captured human imagination for centuries. NASA's Perseverance rover, which landed on Mars in 2021, is searching for signs of ancient microbial life.",
  },
  {
    topicKey: "endangered-species-protection",
    category: "自然",
    sourceText:
      "An endangered species is a species at serious risk of extinction. The International Union for Conservation of Nature maintains the Red List, which currently assesses over 150,000 species.",
  },
  {
    topicKey: "world-cup-football",
    category: "文化",
    sourceText:
      "The FIFA World Cup is the most widely viewed sporting event in the world, held every four years. National teams compete in a month-long tournament that captures global attention.",
  },
  {
    topicKey: "immune-system",
    category: "科学",
    sourceText:
      "The human immune system is the body's defense against infections and diseases. It consists of various cells, tissues, and organs that work together to protect us from harmful invaders.",
  },
  {
    topicKey: "photosynthesis",
    category: "科学",
    sourceText:
      "Photosynthesis is the process by which plants, algae, and some bacteria convert sunlight into chemical energy. This remarkable process is the foundation of life on Earth.",
  },
  {
    topicKey: "earthquakes-tectonics",
    category: "科学",
    sourceText:
      "Earthquakes are among the most powerful natural phenomena on Earth, caused by the sudden release of energy in the Earth's crust.",
  },
  {
    topicKey: "genes-dna",
    category: "科学",
    sourceText:
      "Deoxyribonucleic acid, or DNA, is the molecule that carries the genetic instructions for all known living organisms.",
  },
  {
    topicKey: "black-holes",
    category: "科学",
    sourceText:
      "Black holes are among the most mysterious and fascinating objects in the universe. A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape its pull.",
  },
  {
    topicKey: "roman-empire",
    category: "历史",
    sourceText:
      "The Roman Empire was one of the most powerful and influential civilizations in world history.",
  },
  {
    topicKey: "printing-press",
    category: "历史",
    sourceText:
      "The invention of the printing press by Johannes Gutenberg around 1440 in Mainz, Germany, is widely regarded as one of the most important innovations in human history.",
  },
  {
    topicKey: "silk-road",
    category: "历史",
    sourceText:
      "The Silk Road was not a single road but a vast network of trade routes that connected East Asia, Central Asia, the Middle East, and Europe for over 1,500 years.",
  },
  {
    topicKey: "industrial-revolution",
    category: "历史",
    sourceText:
      "The Industrial Revolution was a period of major technological, economic, and social change that began in Britain in the late 18th century.",
  },
  {
    topicKey: "zheng-he",
    category: "历史",
    sourceText:
      "Zheng He was a Chinese explorer, admiral, and diplomat who led seven epic voyages across the Indian Ocean between 1405 and 1433.",
  },
  {
    topicKey: "american-revolution",
    category: "历史",
    sourceText:
      "The American Revolution was a political and military conflict from 1775 to 1783 in which the Thirteen American Colonies fought for independence from British rule.",
  },
  {
    topicKey: "dinosaur-extinction",
    category: "历史",
    sourceText:
      "About 66 million years ago, a catastrophic event ended the reign of the dinosaurs, which had dominated Earth for over 160 million years.",
  },
  {
    topicKey: "animal-migration",
    category: "自然",
    sourceText:
      "Animal migration is the large-scale movement of animals from one place to another, often covering vast distances.",
  },
  {
    topicKey: "ocean-plastic-pollution",
    category: "自然",
    sourceText:
      "Ocean plastic pollution has become one of the most pressing environmental issues of our time. An estimated 8 to 12 million metric tons of plastic enter the oceans each year.",
  },
  {
    topicKey: "penguins-antarctica",
    category: "自然",
    sourceText:
      "Penguins are a group of flightless birds that are remarkably adapted to life in cold environments, especially Antarctica.",
  },
  {
    topicKey: "volcanoes-islands",
    category: "自然",
    sourceText:
      "Volcanoes are openings in the Earth's crust through which molten rock, ash, and gases erupt.",
  },
  {
    topicKey: "leonardo-da-vinci",
    category: "人物",
    sourceText:
      "Leonardo da Vinci was an Italian Renaissance artist, inventor, scientist, and thinker, widely regarded as one of the most brilliant minds in human history.",
  },
  {
    topicKey: "marie-curie",
    category: "人物",
    sourceText:
      "Marie Curie was a pioneering physicist and chemist who made groundbreaking discoveries in the field of radioactivity.",
  },
  {
    topicKey: "martin-luther-king",
    category: "人物",
    sourceText:
      "Martin Luther King Jr. was an American Baptist minister and civil rights leader who became the most prominent figure in the fight for racial equality in the United States.",
  },
  {
    topicKey: "tu-youyou",
    category: "人物",
    sourceText:
      "Tu Youyou is a Chinese pharmaceutical chemist, best known for discovering artemisinin, a life-saving malaria treatment.",
  },
  {
    topicKey: "malala",
    category: "人物",
    sourceText:
      "Malala Yousafzai is a Pakistani education activist and the youngest Nobel Prize laureate in history.",
  },
  {
    topicKey: "stephen-hawking",
    category: "人物",
    sourceText:
      "Stephen Hawking was one of the most brilliant theoretical physicists of modern times, known for his work on black holes, relativity, and cosmology.",
  },
  {
    topicKey: "ludwig-van-beethoven",
    category: "人物",
    sourceText:
      "Ludwig van Beethoven was a German composer and pianist, widely regarded as one of the greatest composers in the history of Western music.",
  },
  {
    topicKey: "thanksgiving-origins",
    category: "文化",
    sourceText:
      "Thanksgiving is a national holiday celebrated primarily in the United States and Canada.",
  },
  {
    topicKey: "chinese-spring-festival",
    category: "文化",
    sourceText:
      "The Chinese Spring Festival, also known as the Lunar New Year, is the most important traditional holiday in China and many other East Asian countries.",
  },
  {
    topicKey: "diwali-india",
    category: "文化",
    sourceText:
      "Diwali, also known as the Festival of Lights, is one of the most important and widely celebrated festivals in India and among Hindu communities worldwide.",
  },
  {
    topicKey: "brazil-carnival",
    category: "文化",
    sourceText:
      "The Brazilian Carnival, or Carnaval, is the world's biggest and most famous carnival celebration, held annually in cities across Brazil in the days leading up to Lent.",
  },
  {
    topicKey: "space-tourism-commercialization",
    category: "时事",
    sourceText:
      "Space tourism, once the stuff of science fiction, has become a reality in recent years. Private companies like SpaceX, Blue Origin, and Virgin Galactic have developed vehicles capable of carrying civilians beyond Earth's atmosphere.",
  },
  {
    topicKey: "climate-change-extreme-weather",
    category: "时事",
    sourceText:
      "Climate change is causing an increase in extreme weather events around the world, and scientists have established a clear link between rising global temperatures and more frequent and intense weather disasters.",
  },
  {
    topicKey: "internet-changing-world",
    category: "时事",
    sourceText:
      "The internet has fundamentally transformed nearly every aspect of modern life in just a few decades.",
  },
];

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Build a Map<key, row> where key = `${topic_key}::${language}`.
 * On collision: keep the entry with the longer non-empty source_text;
 * union target_grades; prefer non-null source_url; prefer the existing category
 * unless the existing one is empty.  Category mismatches do happen across
 * sources (e.g. moon-return-missions is "科学" in pipeline but "时事" in seed)
 * — we keep the FIRST seen category (sources processed in priority order:
 * seed (broad) -> pipeline (curated) -> refresh-news (recent).  Recorded as
 * a warning in the report.
 */
function mergeRows() {
  /** @type {Map<string, {topic_key: string, language: 'zh'|'en', category: string, source_text: string|null, source_url: string|null, target_grades: number[], _categories: Set<string>}>} */
  const map = new Map();
  const categoryConflicts = [];

  function upsert(row) {
    const key = `${row.topic_key}::${row.language}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        topic_key: row.topic_key,
        language: row.language,
        category: row.category,
        source_text: row.source_text || null,
        source_url: row.source_url || null,
        target_grades: Array.from(new Set(row.target_grades || [])).sort(
          (a, b) => a - b
        ),
        _categories: new Set([row.category]),
      });
      return;
    }
    // Track category divergence for reporting
    existing._categories.add(row.category);
    if (existing.category !== row.category) {
      categoryConflicts.push({
        key,
        kept: existing.category,
        seen: row.category,
      });
    }
    // Pick longer source_text
    const incomingText = row.source_text || "";
    const existingText = existing.source_text || "";
    if (incomingText.length > existingText.length) {
      existing.source_text = incomingText;
    }
    // Pick first non-null source_url
    if (!existing.source_url && row.source_url) {
      existing.source_url = row.source_url;
    }
    // Union grades
    const union = new Set(existing.target_grades);
    for (const g of row.target_grades || []) union.add(g);
    existing.target_grades = Array.from(union).sort((a, b) => a - b);
  }

  // Source 2: seed-reading-content.mjs (broadest English coverage)
  // Aggregate per topicKey (en)
  /** @type {Map<string, {category: string, grades: Set<number>}>} */
  const seedAgg = new Map();
  for (const t of SEED_TOPICS) {
    if (!seedAgg.has(t.topicKey)) {
      seedAgg.set(t.topicKey, { category: t.category, grades: new Set() });
    }
    seedAgg.get(t.topicKey).grades.add(t.gradeLevel);
  }
  for (const [topicKey, agg] of seedAgg) {
    upsert({
      topic_key: topicKey,
      language: "en",
      category: agg.category,
      source_text: SEED_SOURCE_TEXTS[topicKey] || null,
      source_url: null,
      target_grades: Array.from(agg.grades),
    });
  }

  // Source 1: pipeline CURATED_NEWS (provides source_url + canonical sourceText
  // for shared topics and grades [3,6]).
  for (const t of PIPELINE_CURATED_NEWS) {
    upsert({
      topic_key: t.topicKey,
      language: "en",
      category: t.category,
      source_text: t.sourceText,
      source_url: t.sourceUrl || null,
      target_grades: [3, 6],
    });
  }

  // Source 4: refresh-news/route.ts CURATED_NEWS (default grades [3,6]).
  for (const t of REFRESH_NEWS) {
    upsert({
      topic_key: t.topicKey,
      language: "en",
      category: t.category,
      source_text: t.sourceText,
      source_url: t.sourceUrl || null,
      target_grades: [3, 6],
    });
  }

  // Source 3: CHINESE_SEED_TOPICS — language='zh', source_text=null.
  for (const t of CHINESE_SEED_TOPICS) {
    upsert({
      topic_key: t.topicKey,
      language: "zh",
      category: t.category,
      source_text: null,
      source_url: null,
      target_grades: t.grades,
    });
  }

  // Strip private fields before returning rows
  const rows = Array.from(map.values()).map((r) => ({
    topic_key: r.topic_key,
    language: r.language,
    category: r.category,
    source_text: r.source_text,
    source_url: r.source_url,
    target_grades: r.target_grades,
  }));

  return { rows, categoryConflicts };
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

function groupBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const key = row[field] || "(null)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  );
}

function printReport(rows, categoryConflicts) {
  console.log("\n=== MIGRATION REPORT ===");
  console.log(`Total unique topics: ${rows.length}`);

  console.log("\nBy language:");
  const byLang = groupBy(rows, "language");
  for (const [k, v] of Object.entries(byLang)) {
    console.log(`  ${k.padEnd(6)} ${v}`);
  }

  console.log("\nBy category:");
  const byCat = groupBy(rows, "category");
  for (const [k, v] of Object.entries(byCat)) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }

  if (categoryConflicts.length > 0) {
    console.log(
      `\nCategory conflicts (${categoryConflicts.length}; kept first-seen):`
    );
    for (const c of categoryConflicts.slice(0, 10)) {
      console.log(`  ${c.key}  kept=${c.kept}  saw=${c.seen}`);
    }
    if (categoryConflicts.length > 10) {
      console.log(`  ... and ${categoryConflicts.length - 10} more`);
    }
  }

  const withText = rows.filter((r) => r.source_text).length;
  const withUrl = rows.filter((r) => r.source_url).length;
  console.log(
    `\nsource_text: ${withText} populated, ${rows.length - withText} null`
  );
  console.log(
    `source_url:  ${withUrl} populated, ${rows.length - withUrl} null`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");

  const { rows, categoryConflicts } = mergeRows();

  if (isDryRun) {
    console.log("=== DRY-RUN MODE ===");
    console.log(`Loaded ${rows.length} unique (topic_key, language) entries.`);
    console.log("\nFirst 5 rows:");
    for (const row of rows.slice(0, 5)) {
      const textPreview = row.source_text
        ? `${row.source_text.slice(0, 60).replace(/\s+/g, " ")}...`
        : "(null)";
      console.log(
        `  [${row.language}] ${row.topic_key}  cat=${row.category}  grades=[${row.target_grades.join(",")}]  src_text=${textPreview}`
      );
    }
    printReport(rows, categoryConflicts);
    if (rows.length < 100) {
      console.error(
        `\nERROR: expected ≥ 100 unique topics, got ${rows.length}. Aborting.`
      );
      process.exit(1);
    }
    console.log("\n=== DRY-RUN COMPLETE (no DB writes) ===");
    return;
  }

  // Live mode — needs Supabase service-role credentials
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
    console.error("Set them in .env.local or via env. Aborting.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`Upserting ${rows.length} rows into reading_topics...`);
  // Supabase upsert in batches of 100 to stay below request size limits.
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from("reading_topics")
      .upsert(batch, { onConflict: "topic_key,language" });
    if (error) {
      console.error(
        `Batch ${i}-${i + batch.length} failed: ${error.message}`
      );
      process.exit(1);
    }
    inserted += batch.length;
    process.stdout.write(`  upserted ${inserted}/${rows.length}\r`);
  }
  console.log(`\n  done.`);
  printReport(rows, categoryConflicts);
  console.log("\n=== MIGRATION COMPLETE ===");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
