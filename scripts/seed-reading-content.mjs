#!/usr/bin/env node

/**
 * Seed Reading Content Script
 *
 * Generates 60 reading articles with comprehension questions using OpenAI
 * and inserts them into Supabase. Uses the service role key to bypass RLS.
 *
 * Usage:
 *   node scripts/seed-reading-content.mjs          # Run full seed
 *   node scripts/seed-reading-content.mjs --dry-run # Preview only
 *   node scripts/seed-reading-content.mjs --category 科学  # Seed only one category
 *   node scripts/seed-reading-content.mjs --grade 3       # Seed only one grade level
 *
 * Environment variables (from .env.local):
 *   OPENAI_API_KEY, OPENAI_BASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Topic definitions
// ---------------------------------------------------------------------------

/** @type {{ topicKey: string; category: string; gradeLevel: number }[]} */
const TOPICS = [
  // 时事 (Current Events) — 5 topics × both grades = 10 articles
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

  // 历史 (History) — 10 topics × 1 grade each = 10 articles
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

  // 科学 (Science) — 10 topics × 1 grade each = 10 articles
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

  // 人物 (People) — 10 topics × 1 grade each = 10 articles
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

  // 自然 (Nature) — 10 topics × 1 grade each = 10 articles
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

  // 文化 (Culture) — 5 topics × both grades = 10 articles
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

// ---------------------------------------------------------------------------
// Source texts — keyed by "topicKey|gradeLevel"
// Written at G6-G8 reading level; AI adapts to target grade.
// ---------------------------------------------------------------------------

/** @type {Map<string, string>} */
const SOURCE_TEXTS = new Map();

// ── 时事: moon-return-missions ──
SOURCE_TEXTS.set(
  "moon-return-missions|G3",
  "In the 1960s and 1970s, NASA's Apollo program successfully sent astronauts to the Moon. After more than fifty years, space agencies around the world are planning new missions to the Moon. NASA's Artemis program aims to land the first woman and the next man on the lunar surface by the mid-2020s. Unlike the Apollo missions, which were short visits, Artemis plans to build a long-term presence on the Moon. Astronauts will explore the South Pole of the Moon, where ice exists in permanently shadowed craters. This ice could be used for drinking water, breathable oxygen, and even rocket fuel. China's Chang'e program has also successfully landed robotic probes on the far side of the Moon and returned samples to Earth. Private companies like SpaceX are developing massive rockets capable of carrying both cargo and crew to the Moon. These efforts are seen as stepping stones for an even bigger goal: sending humans to Mars. Scientists believe that learning to live and work on the Moon will provide essential experience for the longer, more difficult journey to the Red Planet."
);
SOURCE_TEXTS.set(
  "moon-return-missions|G6",
  SOURCE_TEXTS.get("moon-return-missions|G3")
);

// ── 时事: ocean-plastic-crisis ──
SOURCE_TEXTS.set(
  "ocean-plastic-crisis|G3",
  "Every year, approximately 11 million metric tons of plastic waste enters the world's oceans. That is equivalent to dumping a garbage truck full of plastic into the ocean every minute. Once in the ocean, plastic does not biodegrade. Instead, it breaks down into smaller pieces called microplastics, which are less than five millimeters in size. These microplastics are consumed by fish, sea turtles, seabirds, and marine mammals, often causing injury or death. Scientists have found microplastics in seafood, drinking water, and even in the air we breathe. Countries around the world are taking action to address this crisis. The United Nations is working on a Global Plastics Treaty that would set rules for plastic production, design, and disposal. Many countries have banned single-use plastic items such as straws, bags, and cutlery. Innovative technologies are being developed to clean up plastic already in the ocean, including floating barriers that collect debris and drones that map plastic hotspots. The most effective solution, however, remains reducing plastic use at the source."
);
SOURCE_TEXTS.set(
  "ocean-plastic-crisis|G6",
  SOURCE_TEXTS.get("ocean-plastic-crisis|G3")
);

// ── 时事: ai-transforming-school ──
SOURCE_TEXTS.set(
  "ai-transforming-school|G3",
  "Artificial intelligence is rapidly changing how students learn and how teachers teach. AI-powered tutoring systems can provide personalized instruction, adapting to each student's learning pace and style. When a student struggles with a math problem, the AI tutor can offer additional practice problems or explain the concept in a different way. For teachers, AI tools can grade assignments, analyze student performance data, and suggest lesson plans, freeing up time for direct instruction and mentoring. Language learning apps use AI to provide real-time feedback on pronunciation and grammar. However, the rise of AI in education also raises concerns. Some worry about student data privacy and the risk of AI reinforcing biases. Others are concerned that students might use AI chatbots to cheat on assignments. Schools are now developing policies for responsible AI use, teaching students how to use these tools ethically. Many educators believe that AI will not replace teachers but will become a powerful tool that enhances teaching and learning when used thoughtfully."
);
SOURCE_TEXTS.set(
  "ai-transforming-school|G6",
  SOURCE_TEXTS.get("ai-transforming-school|G3")
);

// ── 时事: renewable-energy-boom ──
SOURCE_TEXTS.set(
  "renewable-energy-boom|G3",
  "The world is experiencing a massive shift toward renewable energy sources such as solar, wind, and hydropower. In 2023, global renewable energy capacity grew by nearly 50 percent compared to the previous year, the fastest growth rate in decades. Solar energy has become the cheapest source of electricity in many parts of the world, thanks to dramatic improvements in solar panel technology and manufacturing. Wind turbines, both on land and offshore, are also producing increasing amounts of clean electricity. China leads the world in renewable energy installations, followed by the United States and European nations. Many countries have set ambitious targets to reach net-zero carbon emissions by 2050, which will require even faster adoption of clean energy. Battery technology has also improved significantly, making it possible to store solar and wind energy for use when the sun is not shining or the wind is not blowing. While challenges remain, including grid infrastructure upgrades and the need for critical minerals, the transition to renewable energy is well underway and accelerating."
);
SOURCE_TEXTS.set(
  "renewable-energy-boom|G6",
  SOURCE_TEXTS.get("renewable-energy-boom|G3")
);

// ── 时事: wildlife-protection-2020s ──
SOURCE_TEXTS.set(
  "wildlife-protection-2020s|G3",
  "The 2020s have brought new attention to wildlife protection as scientists report alarming declines in animal populations worldwide. According to the World Wildlife Fund, global wildlife populations have declined by an average of 69 percent since 1970. Habitat loss, climate change, pollution, and poaching are the primary threats. In response, conservation efforts have intensified. The Kunming-Montreal Global Biodiversity Framework, signed by nearly 200 countries in 2022, sets targets to protect 30 percent of land and ocean areas by 2030. In Africa, anti-poaching patrols use drones and AI-powered cameras to protect elephants and rhinos. In the oceans, marine protected areas have expanded significantly, giving fish and other marine life safe spaces to recover. Reintroduction programs have brought species like the California condor and the black-footed ferret back from the brink of extinction. Technology plays an increasing role in conservation, with satellite tracking helping scientists understand animal migration patterns and environmental DNA sampling allowing researchers to detect rare species without ever seeing them."
);
SOURCE_TEXTS.set(
  "wildlife-protection-2020s|G6",
  SOURCE_TEXTS.get("wildlife-protection-2020s|G3")
);

// ── 历史: ancient-egypt (G3) ──
SOURCE_TEXTS.set(
  "ancient-egypt|G3",
  "Ancient Egypt was one of the world's greatest civilizations, lasting for over 3,000 years. It began around 3100 BCE when King Menes united Upper and Lower Egypt. The civilization grew along the Nile River, which provided water, food, and transportation. Every year, the Nile flooded and deposited rich soil on the riverbanks, which helped farmers grow wheat, barley, and flax. The Egyptians built magnificent pyramids as tombs for their pharaohs. The largest, the Great Pyramid of Giza, was the tallest man-made structure in the world for over 3,800 years. Egyptians developed a writing system called hieroglyphics, which used pictures and symbols to represent words and sounds. They also made advances in mathematics, medicine, and astronomy. Egyptian society was structured like a pyramid, with the pharaoh at the top, followed by nobles, priests, scribes, soldiers, farmers, and slaves at the bottom. The Egyptians believed in an afterlife and practiced mummification to preserve bodies for the journey to the next world. Their art, architecture, and culture continue to fascinate people today."
);

// ── 历史: ancient-greece-democracy (G3) ──
SOURCE_TEXTS.set(
  "ancient-greece-democracy|G3",
  "Ancient Greece is often called the birthplace of democracy. The word democracy comes from the Greek words demos, meaning people, and kratos, meaning power. Around 508 BCE, the city-state of Athens introduced a new system of government in which citizens could vote on laws and policies directly. However, not everyone was considered a citizen. Only free adult men born in Athens could participate. Women, slaves, and foreigners had no political rights. Citizens gathered in the Athenian Assembly to debate and vote on important matters such as war, taxes, and new laws. They also used a system called ostracism to vote on whether to exile a dangerous citizen for ten years. Greek democracy was direct, meaning citizens voted on issues themselves rather than electing representatives. This was possible because Athens was a small city-state. Today, most modern democracies are representative, meaning citizens elect officials to make decisions on their behalf. The ideas developed in ancient Athens influenced the founding fathers of the United States and continue to shape democratic governments around the world."
);

// ── 历史: silk-road-trade (G3) ──
SOURCE_TEXTS.set(
  "silk-road-trade|G3",
  "The Silk Road was not a single road but a vast network of trade routes that connected China with Central Asia, the Middle East, and Europe. It was active from about 130 BCE to the 1400s CE. The name comes from the valuable Chinese silk that was traded along these routes, but many other goods were exchanged as well. From China, merchants carried silk, tea, paper, and porcelain. From the West, they brought gold, silver, glassware, wool, and horses. The Silk Road was about 6,400 kilometers long and crossing it took months or even years. Travel was dangerous due to harsh deserts, high mountains, and bandits. Caravans often traveled together for safety. Along the way, trading cities like Samarkand and Baghdad became wealthy centers of culture and learning. More than goods traveled the Silk Road. Ideas, religions, and technologies also spread. Buddhism traveled from India to China along these routes. Papermaking, gunpowder, and the compass slowly made their way from Asia to Europe. The Silk Road was one of the most important channels of cultural exchange in world history."
);

// ── 历史: great-wall-china (G3) ──
SOURCE_TEXTS.set(
  "great-wall-china|G3",
  "The Great Wall of China is one of the most impressive construction projects in human history. It is not a single continuous wall but a collection of walls, fortifications, and watchtowers built over many centuries. The earliest sections were built as early as the 7th century BCE, but the most famous sections were constructed during the Ming Dynasty between 1368 and 1644 CE. The main purpose of the wall was to protect Chinese states and empires from invasions by nomadic groups from the north. The wall also helped control trade and immigration. Soldiers stationed along the wall would light signal fires to warn of approaching danger. The Ming sections of the wall stretch about 8,850 kilometers, though some estimates are higher when counting all branches and sections. Building the wall was an enormous undertaking. Workers included soldiers, peasants, and convicts. They used local materials, including stone, earth, and brick. It is estimated that millions of workers contributed to its construction over the centuries, and many died during the work. Today, the Great Wall is a UNESCO World Heritage site and one of the most popular tourist destinations in the world."
);

// ── 历史: viking-age (G3) ──
SOURCE_TEXTS.set(
  "viking-age|G3",
  "The Viking Age lasted from about 793 to 1066 CE. The Vikings came from Scandinavia, which includes the modern countries of Norway, Sweden, and Denmark. They were skilled sailors, warriors, and traders. Their famous longships were fast, lightweight, and could sail in both open seas and shallow rivers. This allowed them to travel great distances and launch surprise attacks. The Vikings raided monasteries, towns, and villages across Europe, but they also established trade routes that reached as far as Constantinople and Baghdad. They founded settlements in Iceland, Greenland, and even briefly in North America, around the year 1000, long before Columbus. Viking society was divided into three classes: jarls (nobles), karls (free farmers and craftsmen), and thralls (slaves). They had their own gods, including Odin, Thor, and Freyja. Their mythology included stories of giants, dwarves, and a world tree called Yggdrasil. The Vikings had a rich oral tradition and used a writing system called runes. The Viking Age gradually ended as Scandinavian kingdoms adopted Christianity and centralized their governments. The legacy of the Vikings can still be seen in place names, language, and DNA across Europe."
);

// ── 历史: industrial-revolution (G6) ──
SOURCE_TEXTS.set(
  "industrial-revolution|G6",
  "The Industrial Revolution was a period of profound technological, economic, and social change that began in Britain around 1760 and spread throughout Europe and North America over the following century. At its core was a shift from handmade production in homes to machine-powered manufacturing in factories. Key inventions drove this transformation. James Watt's improved steam engine provided reliable power for factories and locomotives. The spinning jenny and power loom revolutionized textile production. The Bessemer process made steel production cheaper and faster, enabling the construction of railways, bridges, and skyscrapers. The Industrial Revolution brought tremendous economic growth but also severe social costs. Millions of people moved from rural areas to rapidly growing industrial cities, where living conditions were often overcrowded and unsanitary. Factory workers, including women and children, labored long hours in dangerous conditions for low wages. Child labor was widespread. In response, labor movements emerged, demanding better working conditions and fair wages. Over time, governments passed laws regulating working hours, improving safety, and restricting child labor. The Industrial Revolution fundamentally reshaped society, creating the modern industrial economy and setting the stage for the technological advances of the twentieth century."
);

// ── 历史: american-revolution (G6) ──
SOURCE_TEXTS.set(
  "american-revolution|G6",
  "The American Revolution was a political and military conflict that took place between 1765 and 1783, in which the thirteen American colonies overthrew British rule and established the United States of America. Tensions had been building for years. After the French and Indian War, Britain was deep in debt and looked to the colonies for revenue through acts like the Stamp Act and the Townshend Acts. Colonists objected to taxation without representation in Parliament. The slogan 'No taxation without representation' became a rallying cry. Key events escalated the conflict. The Boston Massacre in 1770 and the Boston Tea Party in 1773 deepened colonial resentment. In response, Britain passed the Intolerable Acts, which closed Boston Harbor and restricted colonial self-government. The First Continental Congress met in 1774 to coordinate colonial resistance. Fighting began at Lexington and Concord in April 1775. The Declaration of Independence, drafted primarily by Thomas Jefferson, was adopted on July 4, 1776, asserting the colonies' right to self-governance. Under General George Washington, the Continental Army faced numerous defeats but persevered. The turning point came with the American victory at Saratoga in 1777, which convinced France to enter the war as an ally of the colonies. The war ended with the British surrender at Yorktown in 1781, and the Treaty of Paris was signed in 1783, formally recognizing American independence."
);

// ── 历史: renaissance-art-science (G6) ──
SOURCE_TEXTS.set(
  "renaissance-art-science|G6",
  "The Renaissance, meaning 'rebirth' in French, was a period of remarkable cultural, artistic, and scientific achievement that began in Italy around the 14th century and spread across Europe until the 17th century. It marked the transition from the medieval period to the modern age. At the heart of the Renaissance was humanism, a philosophical movement that emphasized the value and potential of the individual. Humanists studied classical texts from ancient Greece and Rome, reviving knowledge that had been largely forgotten during the Middle Ages. In art, Renaissance masters transformed painting and sculpture. Leonardo da Vinci's Mona Lisa and The Last Supper exemplify the use of perspective, anatomical accuracy, and emotional depth. Michelangelo's sculptures, including David and the ceiling of the Sistine Chapel, demonstrated an unprecedented understanding of the human form. Raphael, Donatello, and Botticelli also produced masterpieces during this period. The Renaissance was equally significant in science. Nicolaus Copernicus proposed that the Earth revolves around the Sun, challenging centuries of astronomical doctrine. Galileo Galilei improved the telescope and made observations that supported Copernicus's theory. Johannes Kepler described the elliptical orbits of planets. The printing press, invented by Johannes Gutenberg around 1440, was crucial to the Renaissance. It allowed books and ideas to circulate widely for the first time, accelerating the spread of knowledge across Europe."
);

// ── 历史: age-of-exploration (G6) ──
SOURCE_TEXTS.set(
  "age-of-exploration|G6",
  "The Age of Exploration, also called the Age of Discovery, spanned from the early 15th to the early 17th century. During this period, European nations sent ships across the Atlantic, Indian, and Pacific Oceans in search of new trade routes, resources, and knowledge. Several factors drove this era of exploration. The Ottoman Empire had blocked European land routes to Asia, creating demand for alternative sea routes to access valuable spices, silks, and other goods. Advances in shipbuilding, navigation, and cartography made long-distance sea travel possible. The caravel, a new type of ship, was faster and more maneuverable than earlier vessels. Instruments like the astrolabe and magnetic compass helped sailors navigate across open ocean. Portugal led the way. Prince Henry the Navigator sponsored expeditions along the coast of Africa. In 1488, Bartolomeu Dias rounded the Cape of Good Hope, and a decade later, Vasco da Gama reached India by sea. Christopher Columbus, sailing for Spain, crossed the Atlantic in 1492 and encountered the Americas. Ferdinand Magellan's expedition completed the first circumnavigation of the globe between 1519 and 1522. These voyages had enormous consequences. They established direct European contact with the Americas, leading to colonization and the exchange of goods, plants, animals, and diseases known as the Columbian Exchange. However, exploration also led to the conquest and enslavement of indigenous peoples and the transatlantic slave trade."
);

// ── 历史: world-war-ii-overview (G6) ──
SOURCE_TEXTS.set(
  "world-war-ii-overview|G6",
  "World War II was the deadliest and most widespread conflict in human history, lasting from 1939 to 1945. It involved most of the world's nations, including all major powers, organized into two opposing military alliances: the Allies and the Axis. The war began when Germany, under Adolf Hitler's Nazi regime, invaded Poland on September 1, 1939. Britain and France responded by declaring war on Germany. The Axis powers, including Germany, Italy, and Japan, quickly conquered much of Europe and Asia. Germany used a military strategy called blitzkrieg, or lightning war, combining fast-moving tanks and aircraft to overwhelm enemy defenses. The war had several major turning points. In 1941, Germany invaded the Soviet Union, opening a massive eastern front. Japan's attack on Pearl Harbor in December 1941 brought the United States into the war. The Allied invasion of Normandy on D-Day, June 6, 1944, began the liberation of Western Europe. The war in Europe ended in May 1945 with Germany's surrender. The war in the Pacific continued until August 1945, when the United States dropped atomic bombs on Hiroshima and Nagasaki, leading to Japan's surrender. The war caused an estimated 70 to 85 million deaths, about 3 percent of the world population at the time. In its aftermath, the United Nations was established to promote international cooperation and prevent future conflicts."
);

// ── 科学: solar-system-exploration (G3) ──
SOURCE_TEXTS.set(
  "solar-system-exploration|G3",
  "Our solar system consists of the Sun and everything that orbits around it, including eight planets, at least five dwarf planets, hundreds of moons, and millions of asteroids and comets. The Sun is a star, a giant ball of hot gas that provides light and heat to the entire system. The four inner planets, Mercury, Venus, Earth, and Mars, are rocky and relatively small. Earth is the only planet known to support life, with liquid water covering about 71 percent of its surface. Mars, called the Red Planet, has the tallest mountain in the solar system, Olympus Mons, which is about two and a half times the height of Mount Everest. The four outer planets, Jupiter, Saturn, Uranus, and Neptune, are gas giants or ice giants. Jupiter is the largest planet, with a famous Great Red Spot that is a storm larger than Earth. Saturn is known for its beautiful rings, made of ice and rock particles. For decades, space agencies have been sending robotic probes to explore these worlds. NASA's Voyager spacecraft, launched in 1977, are now over 20 billion kilometers from Earth, exploring interstellar space. The Perseverance rover is currently exploring Mars, searching for signs of ancient microbial life. Future missions plan to return samples from Mars and explore the icy moons of Jupiter and Saturn, which might harbor oceans beneath their frozen surfaces."
);

// ── 科学: human-body-systems (G3) ──
SOURCE_TEXTS.set(
  "human-body-systems|G3",
  "The human body is an incredible machine made up of several systems that work together to keep us alive and healthy. Each system has a specific job, and they all depend on each other. The skeletal system consists of 206 bones that provide structure, protect organs, and work with muscles to allow movement. Bones are living tissue that store minerals and produce blood cells. The muscular system includes over 600 muscles. Some muscles, like those in your arms and legs, you control voluntarily. Others, like your heart, work automatically. The digestive system breaks down food so your body can absorb nutrients. It starts at the mouth and continues through the esophagus, stomach, small intestine, and large intestine. The respiratory system brings oxygen into the body and removes carbon dioxide. Your lungs contain about 300 million tiny air sacs called alveoli where gas exchange occurs. The circulatory system, powered by your heart, pumps blood throughout your body. Your heart beats about 100,000 times per day, moving about 7,500 liters of blood. The nervous system controls all body functions. Your brain, which contains about 86 billion neurons, processes information and sends signals to every part of your body. The immune system defends against germs. White blood cells identify and destroy harmful bacteria and viruses that enter the body."
);

// ── 科学: weather-and-climate (G3) ──
SOURCE_TEXTS.set(
  "weather-and-climate|G3",
  "Weather and climate are related but different concepts. Weather describes the conditions in the atmosphere at a specific time and place, such as whether it is raining, sunny, windy, or cloudy. Climate describes the average weather patterns in a region over a long period, typically 30 years or more. Weather is driven by the uneven heating of Earth's surface by the Sun. Warm air rises, cool air sinks, and this movement creates wind. When warm, moist air rises and cools, water vapor condenses into clouds and eventually falls as precipitation. The water cycle connects weather to the movement of water through evaporation, condensation, and precipitation. Different regions have different climates due to factors like latitude, altitude, distance from oceans, and prevailing winds. Tropical regions near the equator are generally hot and wet. Polar regions near the poles are cold and dry. Deserts receive very little rainfall, while rainforests receive abundant rain. Climate change, driven primarily by the burning of fossil fuels and deforestation, is causing global temperatures to rise. This leads to more extreme weather events, including stronger hurricanes, longer droughts, and more intense heatwaves. Understanding both weather and climate is essential for predicting future conditions and preparing for their impacts on agriculture, infrastructure, and human health."
);

// ── 科学: animal-adaptations (G3) ──
SOURCE_TEXTS.set(
  "animal-adaptations|G3",
  "Animals have evolved amazing adaptations that help them survive in their environments. Adaptations can be physical features, such as a cheetah's speed or a polar bear's thick fur, or behavioral strategies, such as migration or hibernation. In cold environments, animals like polar bears and arctic foxes have thick fur and layers of fat for insulation. Their white fur provides camouflage against snow. Some animals, like the arctic hare, change their fur color from brown in summer to white in winter. In deserts, animals face extreme heat and scarce water. Camels can go for weeks without drinking and store fat in their humps. The fennec fox has large ears that radiate heat to keep it cool. Kangaroo rats never need to drink water, getting all the moisture they need from their food. In oceans, fish have gills to extract oxygen from water, while marine mammals like whales and dolphins must surface to breathe. Many deep-sea creatures produce their own light through bioluminescence to attract prey or mates. In rainforests, some frogs are brightly colored to warn predators they are poisonous. Others use camouflage to blend in with leaves or bark. Some insects look exactly like twigs or leaves. These adaptations developed over millions of years through natural selection, where individuals with traits better suited to their environment are more likely to survive and reproduce."
);

// ── 科学: states-of-matter (G3) ──
SOURCE_TEXTS.set(
  "states-of-matter|G3",
  "Matter is anything that has mass and takes up space. It exists in four main states: solid, liquid, gas, and plasma. The state depends on how tightly the particles that make up the material are packed together and how much energy they have. In a solid, particles are packed closely together in a fixed arrangement. They vibrate in place but cannot move past each other. This gives solids a definite shape and volume. Ice, wood, and rocks are examples of solids. In a liquid, particles are still close together but can move past each other. Liquids have a definite volume but take the shape of their container. Water, oil, and juice are examples of liquids. In a gas, particles are far apart and move freely in all directions. Gases have no definite shape or volume and will expand to fill any container. Air, oxygen, and steam are examples of gases. Changes between states occur when energy is added or removed. Melting is the change from solid to liquid. Freezing is from liquid to solid. Evaporation is from liquid to gas. Condensation is from gas to liquid. Sublimation is a direct change from solid to gas, like dry ice turning into vapor. These changes are physical changes, meaning the substance itself remains the same even though its appearance changes."
);

// ── 科学: genetics-and-dna (G6) ──
SOURCE_TEXTS.set(
  "genetics-and-dna|G6",
  "Genetics is the study of heredity, or how traits are passed from parents to offspring. The foundation of genetics lies in DNA, or deoxyribonucleic acid, a molecule that contains the instructions for building and maintaining an organism. DNA has a remarkable structure: it is shaped like a double helix, often described as a twisted ladder. The sides of the ladder are made of sugar and phosphate molecules, while the rungs are pairs of chemical bases: adenine paired with thymine, and guanine paired with cytosine. The sequence of these bases along the DNA strand forms the genetic code. Genes are segments of DNA that contain instructions for specific traits, such as eye color or height. Humans have about 20,000 to 25,000 genes distributed across 23 pairs of chromosomes. We inherit one copy of each gene from each parent. Some versions of genes, called alleles, are dominant and will be expressed even if only one copy is present. Others are recessive and require two copies to be expressed. Gregor Mendel, an Austrian monk working in the 19th century, discovered the basic principles of heredity by studying pea plants before anyone knew about DNA. Today, advances in genetics have led to breakthroughs in medicine, agriculture, and forensic science. CRISPR technology allows scientists to edit genes with precision, opening possibilities for treating genetic disorders. However, genetic engineering also raises ethical questions about safety, consent, and equity."
);

// ── 科学: electricity-circuits (G6) ──
SOURCE_TEXTS.set(
  "electricity-circuits|G6",
  "Electricity is a form of energy resulting from the movement of charged particles, typically electrons. It powers everything from tiny calculators to massive city grids. Understanding how electricity works requires knowledge of atoms, circuits, and the forces that move electrons. Every atom contains protons with a positive charge, neutrons with no charge, and electrons with a negative charge. When electrons move from one atom to another, they create an electric current. Materials that allow electrons to flow easily, like copper and aluminum, are called conductors. Materials that resist electron flow, like rubber and plastic, are called insulators. An electric circuit is a closed loop through which current can flow. A simple circuit consists of a power source, such as a battery, wires to carry the current, and a load, such as a light bulb, that uses the electrical energy. A switch can open or close the circuit to control the flow of electricity. There are two main types of circuits. In a series circuit, components are connected end to end, so the same current flows through each component. If one component fails, the entire circuit is broken. In a parallel circuit, components are connected across multiple paths. Each component receives the same voltage, and if one fails, the others continue to work. This is why homes use parallel circuits. Understanding circuits is fundamental to electronics, from simple flashlights to complex computer processors containing billions of transistors."
);

// ── 科学: photosynthesis (G6) ──
SOURCE_TEXTS.set(
  "photosynthesis|G6",
  "Photosynthesis is one of the most important biochemical processes on Earth. It is the process by which plants, algae, and some bacteria convert light energy from the Sun into chemical energy stored in glucose. This process provides the food and oxygen that nearly all living things depend on. Photosynthesis takes place primarily in the leaves of plants, inside specialized structures called chloroplasts. Within chloroplasts is a pigment called chlorophyll, which gives plants their green color and absorbs light energy, mostly from the blue and red parts of the spectrum. The overall chemical equation for photosynthesis is 6CO2 + 6H2O + light energy yields C6H12O6 + 6O2. In simpler terms, plants take in carbon dioxide from the air through tiny openings called stomata and water from the soil through their roots. Using energy from sunlight, they convert these raw materials into glucose, a sugar that the plant uses for energy and growth. Oxygen is released as a byproduct through the stomata. Photosynthesis occurs in two main stages. The light-dependent reactions require direct sunlight and produce ATP and NADPH, energy-carrying molecules. The Calvin cycle, also called the light-independent reactions, uses these molecules to convert carbon dioxide into glucose. Factors that affect the rate of photosynthesis include light intensity, carbon dioxide concentration, and temperature. Understanding photosynthesis is crucial for addressing global challenges such as food security and climate change, as plants play a vital role in the carbon cycle."
);

// ── 科学: plate-tectonics (G6) ──
SOURCE_TEXTS.set(
  "plate-tectonics|G6",
  "Plate tectonics is the scientific theory that explains how Earth's outer layer, called the lithosphere, is divided into several large and small plates that move slowly over the planet's surface. This theory, developed in the 1960s, revolutionized geology by providing a unified explanation for earthquakes, volcanoes, mountain building, and continental drift. The lithosphere is broken into about 15 major tectonic plates, including the Pacific Plate, North American Plate, Eurasian Plate, and African Plate. These plates float on the semifluid layer beneath them called the asthenosphere. Convection currents in the mantle, driven by heat from Earth's core, cause the plates to move at rates of a few centimeters per year, about as fast as fingernails grow. Plate boundaries are where most geological activity occurs. At divergent boundaries, plates move apart, creating new crust as magma rises, such as at the Mid-Atlantic Ridge. At convergent boundaries, plates collide. If an oceanic plate collides with a continental plate, the denser oceanic plate subducts beneath the continental plate, creating deep ocean trenches and volcanic arcs like the Andes Mountains. When two continental plates collide, they form mountain ranges like the Himalayas. At transform boundaries, plates slide past each other horizontally, causing earthquakes, like along California's San Andreas Fault. The theory of plate tectonics helps scientists understand Earth's past, from the positions of ancient continents to the distribution of fossils, and even predict future geological changes."
);

// ── 科学: human-circulatory-system (G6) ──
SOURCE_TEXTS.set(
  "human-circulatory-system|G6",
  "The circulatory system is the body's transportation network, delivering oxygen, nutrients, and hormones to cells while removing waste products like carbon dioxide. It consists of the heart, blood vessels, and blood. The heart is a muscular organ about the size of a fist, located slightly left of the center of the chest. It beats approximately 100,000 times per day, pumping about 7,500 liters of blood through the body. The heart has four chambers: two upper atria and two lower ventricles. Valves between these chambers ensure blood flows in one direction. Blood flows through two main circuits. In the pulmonary circuit, the heart pumps deoxygenated blood to the lungs, where it picks up oxygen and releases carbon dioxide. In the systemic circuit, oxygenated blood is pumped to the rest of the body. Blood carries oxygen through red blood cells, which contain hemoglobin, a protein that binds to oxygen. White blood cells fight infection, and platelets help blood clot to stop bleeding. There are three types of blood vessels: arteries carry blood away from the heart, veins carry blood back to the heart, and capillaries are tiny vessels where exchanges between blood and body cells occur. Common circulatory system diseases include hypertension, or high blood pressure, which forces the heart to work harder, and atherosclerosis, where arteries become narrowed by fatty deposits. Regular exercise, a balanced diet, and avoiding smoking are important for maintaining a healthy circulatory system."
);

// ── 人物: marie-curie (G3) ──
SOURCE_TEXTS.set(
  "marie-curie|G3",
  "Marie Curie was one of the most brilliant scientists in history. She was born Maria Sklodowska in Warsaw, Poland, in 1867. At that time, women were not allowed to attend university in Poland, so Marie moved to Paris to study at the Sorbonne. She studied physics and mathematics, graduating at the top of her class. In Paris, Marie met Pierre Curie, a fellow scientist, and they married. Together, they conducted groundbreaking research on radioactivity, a term Marie herself coined. They discovered two new elements: polonium, named after Marie's native Poland, and radium. Their work showed that atoms were not indivisible as previously thought but could release energy. In 1903, Marie Curie became the first woman to win a Nobel Prize, sharing the prize in physics with Pierre and another scientist. After Pierre died in 1906, Marie continued their work. In 1911, she won a second Nobel Prize, this time in chemistry, for her work on radium. She is the only person to have won Nobel Prizes in two different scientific fields. During World War I, Curie developed mobile X-ray units to help surgeons treat wounded soldiers. She personally drove these units to the front lines. Her lifelong exposure to radiation eventually caused her death in 1934. Her contributions to science, especially in understanding radioactivity, paved the way for advances in medicine, including cancer treatment."
);

// ── 人物: albert-einstein (G3) ──
SOURCE_TEXTS.set(
  "albert-einstein|G3",
  "Albert Einstein is widely regarded as one of the greatest physicists of all time. Born in Ulm, Germany, in 1879, Einstein was a curious child who loved mathematics and science. He taught himself geometry at age 12 and became fascinated by the way a compass needle always points north, wondering about the invisible forces that guide it. As a young adult, Einstein was unable to find a teaching job after graduation, so he worked at the Swiss Patent Office. During his spare time, he developed his most famous scientific ideas. In 1905, often called his miracle year, Einstein published four groundbreaking papers. One of them introduced his special theory of relativity and the famous equation E = mc2, which showed that mass and energy are two forms of the same thing. This equation later helped scientists understand nuclear energy. In 1915, Einstein completed his general theory of relativity, which described gravity as a curvature of space and time caused by mass. This theory was confirmed during a solar eclipse in 1919 when scientists observed that light from distant stars bent around the Sun exactly as Einstein predicted. The news made him a worldwide celebrity. Einstein won the Nobel Prize in Physics in 1921, not for relativity but for his discovery of the photoelectric effect, which was essential for the development of quantum mechanics. After Hitler came to power in Germany, Einstein immigrated to the United States. He spent his later years working on a unified field theory and advocating for peace and civil rights."
);

// ── 人物: helen-keller (G3) ──
SOURCE_TEXTS.set(
  "helen-keller|G3",
  "Helen Keller was an American author, activist, and lecturer who overcame tremendous challenges. Born in 1880 in Tuscumbia, Alabama, she became ill at 19 months old, leaving her both blind and deaf. Cut off from language and communication, young Helen was frustrated and often had tantrums. Her life changed forever when Anne Sullivan arrived as her teacher in 1887. Sullivan, who was partially blind herself, had graduated from the Perkins School for the Blind. She began teaching Helen by spelling words into her hand. The breakthrough came when Sullivan pumped water over one of Helen's hands while spelling W-A-T-E-R into the other. Helen suddenly understood that everything had a name. From that moment, she was eager to learn. Helen quickly learned to read and write in Braille. She went on to attend Radcliffe College, becoming the first deaf-blind person to earn a Bachelor of Arts degree. She learned to speak through a method involving feeling the vibrations of speech on people's lips and throats. After college, Helen Keller became a world-famous advocate. She campaigned for women's suffrage, labor rights, and better treatment for people with disabilities. She wrote 12 books and traveled to 39 countries. She worked for the American Foundation for the Blind and helped change public attitudes toward people with disabilities. In 1964, President Lyndon Johnson awarded her the Presidential Medal of Freedom, one of the highest civilian honors in the United States."
);

// ── 人物: thomas-edison (G3) ──
SOURCE_TEXTS.set(
  "thomas-edison|G3",
  "Thomas Edison was one of the most prolific inventors in American history. Born in 1847 in Milan, Ohio, Edison had little formal schooling. His mother taught him at home, and he developed a passion for reading and experimenting. At age 12, he began working on a railroad, selling newspapers and snacks to passengers. He set up a chemistry lab in a train car and a printing press where he published his own newspaper. After an accident, he lost most of his hearing, but he considered this an advantage because it helped him concentrate on his work. Edison established his first major laboratory in Menlo Park, New Jersey, in 1876. He promised to produce a minor invention every ten days and a major one every six months. He kept that promise. His most famous invention was the practical incandescent light bulb in 1879. While he did not invent the first light bulb, Edison created a bulb that burned for long hours and developed the entire electrical system needed to make it useful, including generators, wires, and sockets. Other major inventions included the phonograph, which could record and play back sound, and the motion picture camera. He also improved the telephone and the telegraph. Edison held 1,093 US patents, more than anyone else at the time. He famously said that genius is one percent inspiration and ninety-nine percent perspiration. His approach to inventing was methodical: when trying to find a material for the light bulb filament, he tested thousands of materials before finding one that worked."
);

// ── 人物: rosa-parks (G3) ──
SOURCE_TEXTS.set(
  "rosa-parks|G3",
  "Rosa Parks was a courageous African American woman whose simple act of defiance helped spark a movement for civil rights in the United States. She was born in 1913 in Tuskegee, Alabama, a time when segregation laws enforced racial separation in many parts of the country. African Americans faced discrimination in schools, restaurants, transportation, and virtually every aspect of public life. On December 1, 1955, in Montgomery, Alabama, Rosa Parks was riding the bus home after a long day of work as a seamstress. When the bus became crowded, the driver ordered Parks and three other African American passengers to give up their seats to white passengers. While the others complied, Parks quietly refused. She was arrested and fined $10 plus $4 in court costs. Her arrest was not a spontaneous act. Parks was an active member of the local NAACP chapter and had attended training in civil disobedience at the Highlander Folk School. Her arrest became the catalyst for the Montgomery Bus Boycott, a 381-day protest during which African Americans walked or carpooled instead of riding city buses. The boycott was led by a young minister named Martin Luther King Jr. In 1956, the Supreme Court ruled that bus segregation was unconstitutional. Rosa Parks became known as the mother of the civil rights movement. She continued her activism for the rest of her life, working for Congressman John Conyers and speaking out against inequality. In 1999, she was awarded the Congressional Gold Medal."
);

// ── 人物: nelson-mandela (G6) ──
SOURCE_TEXTS.set(
  "nelson-mandela|G6",
  "Nelson Mandela was a South African anti-apartheid revolutionary and political leader who served as South Africa's first Black president from 1994 to 1999. His life story is one of extraordinary resilience, sacrifice, and forgiveness. Born in 1918 in the village of Mvezo, Mandela was given the birth name Rolihlahla, which means pulling the branch of a tree. He studied law at the University of Fort Hare and later at the University of Witwatersrand. In 1944, Mandela joined the African National Congress, a political group fighting against apartheid, South Africa's system of racial segregation and discrimination. The apartheid regime enforced brutal restrictions on non-white citizens, including forced relocation, limited education, and denial of voting rights. As the struggle intensified, Mandela co-founded the ANC Youth League and later commanded Umkhonto we Sizwe, the armed wing of the ANC. In 1962, he was arrested and sentenced to life imprisonment. For 27 years, Mandela was incarcerated, mostly on Robben Island, where he performed hard labor in a limestone quarry. Despite harsh conditions, he continued to study, mentor fellow prisoners, and negotiate with prison authorities. International pressure to free Mandela grew over the decades. He was finally released on February 11, 1990. Rather than seeking revenge, Mandela led peaceful negotiations to end apartheid. In 1993, he shared the Nobel Peace Prize with President F.W. de Klerk. In 1994, in South Africa's first multiracial elections, Mandela was elected president. He established the Truth and Reconciliation Commission to heal the nation's wounds."
);

// ── 人物: florence-nightingale (G6) ──
SOURCE_TEXTS.set(
  "florence-nightingale|G6",
  "Florence Nightingale was a pioneering nurse who revolutionized healthcare and established nursing as a respected profession. Born in 1820 to a wealthy British family, Nightingale was expected to marry and manage a household. Instead, she felt a calling from God to serve others and pursued nursing despite her family's strong opposition. In 1854, during the Crimean War, Nightingale received permission to lead a group of 38 nurses to treat wounded British soldiers at the military hospital in Scutari, near Constantinople. The conditions she found were appalling. The hospital was overcrowded, filthy, and infested with rats and fleas. More soldiers were dying from infectious diseases like cholera and typhus than from battle wounds. Nightingale implemented strict sanitation measures: scrubbing floors, washing linens, improving ventilation, and ensuring clean water and nutritious food. Within months, the death rate dropped from 42 percent to 2 percent. She worked tirelessly, often making rounds at night with her lamp, earning her the nickname the Lady with the Lamp. After the war, Nightingale used statistics and data visualization to demonstrate that sanitation reform saved lives. She created the polar area diagram, a type of graph now called a Nightingale rose, to show causes of mortality in the army. She established the Nightingale Training School for Nurses at St. Thomas' Hospital in London in 1860. Her book Notes on Nursing became a standard text. Despite suffering from chronic illness after the war, Nightingale continued to advocate for healthcare reform until her death in 1910."
);

// ── 人物: leonardo-da-vinci (G6) ──
SOURCE_TEXTS.set(
  "leonardo-da-vinci|G6",
  "Leonardo da Vinci was the ultimate Renaissance man, excelling as a painter, sculptor, architect, engineer, scientist, and inventor. Born in 1452 in the Tuscan town of Vinci, Italy, Leonardo was the illegitimate son of a notary and a peasant woman. This status prevented him from receiving a formal classical education but allowed him to be apprenticed to the artist Andrea del Verrocchio in Florence at age 14. Leonardo's most famous paintings demonstrate his mastery of art. The Mona Lisa, painted between 1503 and 1519, is known for its mysterious smile and innovative sfumato technique, which creates soft, hazy transitions between colors and tones. The Last Supper, painted on the wall of a monastery in Milan, captures the dramatic moment when Jesus announces one of his disciples will betray him. Despite being masterpieces, both works have suffered from experimental techniques and environmental damage. Beyond art, Leonardo filled thousands of pages in his notebooks with observations and designs far ahead of their time. He studied human anatomy by dissecting cadavers, producing drawings of muscles, bones, and organs that remain accurate today. He designed flying machines, including an ornithopter with flapping wings. He drew plans for military inventions such as tanks, giant crossbows, and diving suits. He studied geology, botany, hydraulics, and optics. Many of his inventions were never built, but his systematic approach to observation and documentation embodied the scientific method before it was formally defined. Leonardo died in 1519 in France, leaving behind an unmatched legacy of curiosity and creativity."
);

// ── 人物: amelia-earhart (G6) ──
SOURCE_TEXTS.set(
  "amelia-earhart|G6",
  "Amelia Earhart was a pioneering aviator, author, and women's rights advocate who became a symbol of courage and determination. Born in 1897 in Atchison, Kansas, Earhart was a tomboy who loved adventure. She kept scrapbooks of newspaper clippings about women who had succeeded in male-dominated fields. Her first experience with flying came in 1920 when she took a ten-minute airplane ride. She later said, 'By the time I had got two or three hundred feet off the ground, I knew I had to fly.' Earhart worked multiple jobs to save money for flying lessons. She earned her pilot's license in 1923, the 16th woman in the United States to do so. In 1928, she gained fame as the first woman to fly across the Atlantic Ocean as a passenger. Eager to prove herself, she completed her first solo transatlantic flight in 1932, flying from Newfoundland to Northern Ireland. She was the first woman and second person to achieve this feat. For this achievement, she received the Distinguished Flying Cross and became internationally famous. Earhart used her fame to promote aviation and women's rights. She helped found the Ninety-Nines, an organization for female pilots. She wrote books about her flights and designed a line of women's clothing. In 1937, Earhart attempted to become the first woman to fly around the world. On July 2, while flying from New Guinea to Howland Island in the Pacific, she and her navigator Fred Noonan disappeared. Despite an extensive search, no trace of them was ever found. Her mysterious disappearance has fascinated the public for decades, but her legacy as a trailblazer for women in aviation remains unquestioned."
);

// ── 人物: martin-luther-king-jr (G6) ──
SOURCE_TEXTS.set(
  "martin-luther-king-jr|G6",
  "Martin Luther King Jr. was a Baptist minister and civil rights leader who became the most prominent voice for racial equality in American history. He is remembered for his powerful speeches, his philosophy of nonviolent resistance, and his role in ending legal segregation in the United States. Born in 1929 in Atlanta, Georgia, King grew up in a segregated society where African Americans were denied basic rights. He was an exceptional student, graduating from Morehouse College at age 19, then earning a divinity degree from Crozer Theological Seminary and a doctorate in theology from Boston University. King was influenced by Mahatma Gandhi's philosophy of nonviolent civil disobedience and Christian teachings about love and justice. He believed that people should protest unjust laws through peaceful means, accepting punishment without retaliation. This approach, he argued, would awaken the conscience of the oppressor and win public support. King first gained national attention during the Montgomery Bus Boycott in 1955-1956. He went on to lead the Southern Christian Leadership Conference and organize major campaigns for voting rights, desegregation, and economic justice. His 1963 March on Washington speech, I Have a Dream, is one of the most famous orations in American history. King's efforts contributed to the passage of the Civil Rights Act of 1964 and the Voting Rights Act of 1965. In 1964, he became the youngest person to receive the Nobel Peace Prize at age 35. King was assassinated on April 4, 1968, in Memphis, Tennessee, where he had gone to support striking sanitation workers. His legacy continues to inspire movements for justice worldwide."
);

// ── 自然: rainforest-ecosystems (G3) ──
SOURCE_TEXTS.set(
  "rainforest-ecosystems|G3",
  "Rainforests are the most diverse ecosystems on Earth, covering only about 6 percent of the planet's land surface but containing more than half of all plant and animal species. They are found near the equator in regions like the Amazon Basin, Congo Basin, and Southeast Asia. Rainforests have four distinct layers. The emergent layer consists of the tallest trees, rising up to 60 meters above the forest floor. These trees endure strong winds and direct sunlight. Eagles, bats, and butterflies live here. The canopy is the primary layer, a dense roof of treetops about 30 to 45 meters above the ground. Most rainforest animals live in the canopy, including monkeys, sloths, toucans, and thousands of insect species. The understory is a dark layer beneath the canopy where very little sunlight reaches. Plants here have large leaves to capture what little light is available. Jaguars, tree frogs, and snakes are common. The forest floor receives almost no sunlight, so it is relatively open. Decomposers like fungi and insects break down dead leaves and wood, recycling nutrients back into the soil. Rainforests are crucial for the planet's health. They absorb vast amounts of carbon dioxide and produce oxygen, earning them the nickname the lungs of the Earth. They also regulate rainfall patterns and provide habitats for countless species. However, rainforests are being destroyed at alarming rates for agriculture, logging, and mining. Losing rainforests threatens biodiversity and accelerates climate change."
);

// ── 自然: ocean-life-zones (G3) ──
SOURCE_TEXTS.set(
  "ocean-life-zones|G3",
  "The ocean is divided into different zones based on how much sunlight reaches each depth. Each zone has unique conditions and is home to specially adapted creatures. The sunlight zone extends from the ocean surface down to about 200 meters. This is where most marine life is found because sunlight penetrates this zone, allowing plants and algae to photosynthesize. Colorful coral reefs, dolphins, sea turtles, and whales live here. The twilight zone lies between 200 and 1,000 meters deep. Only a faint amount of light reaches here, not enough for photosynthesis. Animals in this zone have adapted to low light conditions. Some have large eyes to see better, while others produce their own light through bioluminescence. Creatures include lanternfish, swordfish, and squid. The midnight zone extends from 1,000 to 4,000 meters. It is completely dark, with near-freezing temperatures and immense pressure. Animals here often have bioluminescent lures to attract prey or mates. The anglerfish, with its glowing lure, is a famous resident. Many animals in this zone are red or black, colors that are invisible in the darkness. The abyssal zone reaches from 4,000 to 6,000 meters. The pressure is enormous, over 400 times the atmospheric pressure at sea level. Life is sparse and includes deep-sea worms, sea cucumbers, and certain fish that can withstand extreme conditions. The hadal zone includes deep ocean trenches below 6,000 meters. Even here, life exists, including specially adapted shrimp-like creatures and microorganisms."
);

// ── 自然: butterfly-life-cycle (G3) ──
SOURCE_TEXTS.set(
  "butterfly-life-cycle|G3",
  "Butterflies undergo one of nature's most remarkable transformations, called complete metamorphosis. Their life cycle has four distinct stages: egg, larva, pupa, and adult. The process begins when a female butterfly lays tiny eggs on a leaf. She carefully chooses a plant that will provide food for the caterpillars after they hatch. Different butterfly species prefer different host plants. The eggs are usually round or oval and have a sticky coating that holds them to the leaf. After three to seven days, a tiny caterpillar, which is the larval stage, chews its way out of the egg. The caterpillar's only job is to eat and grow. It sheds its skin several times as it grows, a process called molting. Caterpillars have strong jaws for chewing leaves and grow to many times their original size. When the caterpillar has grown enough, it enters the pupal stage. It attaches itself to a leaf or twig and forms a hard outer shell called a chrysalis. Inside the chrysalis, an amazing transformation takes place. The caterpillar's body breaks down into a soupy substance, and special groups of cells called imaginal discs direct the formation of butterfly structures, including wings, legs, and antennae. After about 10 to 14 days depending on the species and temperature, an adult butterfly emerges from the chrysalis. Its wings are soft and folded, so it must pump fluid into them to expand them. After a few hours of drying and strengthening its wings, the butterfly is ready to fly. Adult butterflies feed on nectar from flowers and live for a few weeks to several months, depending on the species."
);

// ── 自然: desert-adaptations (G3) ──
SOURCE_TEXTS.set(
  "desert-adaptations|G3",
  "Deserts are harsh environments that receive less than 250 millimeters of rain per year. They can be scorching hot during the day and surprisingly cold at night. Despite these extreme conditions, many plants and animals have evolved remarkable adaptations to survive. Desert plants have developed several strategies for conserving water. Cacti have thick, fleshy stems that store water. Instead of leaves, which would lose water through evaporation, cacti have spines that provide shade and deter animals. Their root systems are shallow but spread out widely to capture any rainfall. Other desert plants, like the creosote bush, have deep taproots that reach groundwater. Some plants are ephemerals, meaning they lie dormant as seeds for years and only sprout, bloom, and produce seeds quickly after rare rainfall. Desert animals also have impressive adaptations. The fennec fox has enormous ears that radiate heat and help keep it cool. The kangaroo rat never needs to drink water, getting all its moisture from the seeds it eats and producing extremely concentrated urine. Many desert animals are nocturnal, staying in cool burrows during the day and coming out at night. The thorny devil lizard has skin that can absorb water like a sponge, channeling it to its mouth. Camels can survive for weeks without water. Their humps store fat, not water, which provides energy when food is scarce. Their thick fur reflects sunlight and insulates against heat. Their nostrils close to keep out sand during dust storms."
);

// ── 自然: coral-reef-ecosystems (G3) ──
SOURCE_TEXTS.set(
  "coral-reef-ecosystems|G3",
  "Coral reefs are often called the rainforests of the sea because of the incredible diversity of life they support. They cover less than 1 percent of the ocean floor but are home to about 25 percent of all marine species. Coral reefs are built by tiny animals called coral polyps. Each polyp is a soft-bodied animal related to jellyfish and sea anemones. The polyp secretes a hard outer skeleton of calcium carbonate, which forms the structure of the reef. When polyps die, new polyps grow on top of their skeletons, slowly building the reef over thousands of years. Most reef-building corals have a symbiotic relationship with microscopic algae called zooxanthellae that live inside their tissues. The algae photosynthesize and produce food for the coral, while the coral provides the algae with shelter and nutrients. This is why corals need clear, warm, shallow water where sunlight can reach the algae. Coral reefs provide essential services. They protect coastlines from storms and erosion by absorbing wave energy. They support fishing industries and tourism. They are also a source of new medicines. Many marine creatures depend on reefs for food, shelter, and breeding grounds. Unfortunately, coral reefs are in serious danger. Rising ocean temperatures cause coral bleaching, where stressed corals expel their algae and turn white. If temperatures remain high for too long, the corals die. Ocean acidification, pollution, overfishing, and destructive fishing practices also threaten reefs. Scientists and conservationists are working to protect and restore coral reefs through marine protected areas, coral gardening, and breeding more resilient coral species."
);

// ── 自然: food-chains-webs (G6) ──
SOURCE_TEXTS.set(
  "food-chains-webs|G6",
  "All living things need energy to survive, and that energy flows through ecosystems in what scientists call food chains and food webs. Understanding these energy pathways is fundamental to ecology. A food chain shows a single path of energy flow. It begins with producers, organisms that can make their own food using sunlight through photosynthesis. Plants, algae, and phytoplankton are the primary producers in most ecosystems. They convert solar energy into chemical energy stored in sugars. Next come consumers. Primary consumers, or herbivores, eat producers. Examples include grasshoppers eating grass and zooplankton eating phytoplankton. Secondary consumers eat primary consumers. A frog that eats a grasshopper is a secondary consumer. Tertiary consumers eat secondary consumers. A snake that eats a frog is a tertiary consumer. At the top of the chain are apex predators, like eagles, wolves, or sharks, with no natural predators of their own. Decomposers, such as bacteria and fungi, break down dead organisms and waste, returning nutrients to the soil to be used by producers again. In reality, most organisms eat more than one thing, so scientists use food webs instead of simple chains. A food web is a network of interconnected food chains that shows the complex feeding relationships in an ecosystem. Energy is lost at each level of a food chain. Only about 10 percent of the energy from one level is passed to the next, with the rest used for metabolism, growth, and lost as heat. This is why there are fewer organisms at each higher level, forming an energy pyramid."
);

// ── 自然: animal-migration (G6) ──
SOURCE_TEXTS.set(
  "animal-migration|G6",
  "Migration is the large-scale movement of animals from one place to another, usually in response to seasonal changes in food availability, temperature, or breeding conditions. It is one of the most remarkable phenomena in the natural world, involving journeys that can span thousands of kilometers. Perhaps the most famous migration is that of the monarch butterfly. Each year, millions of monarchs travel up to 4,800 kilometers from Canada and the United States to overwinter in the forests of central Mexico. Remarkably, the butterflies making the journey have never been to Mexico before. They navigate using a combination of the Sun's position and an internal compass. It takes several generations of butterflies to complete the entire round trip. The Arctic tern holds the record for the longest migration of any animal. These small seabirds travel from their breeding grounds in the Arctic to the Antarctic and back each year, a round trip of about 70,000 kilometers. They experience two summers each year and see more daylight than any other creature on Earth. Many large mammals also migrate. The wildebeest migration in East Africa involves about 1.5 million animals moving in a circular pattern across the Serengeti and Maasai Mara in search of fresh grazing and water. They cross crocodile-infested rivers, an event that is both dangerous and spectacular. Ocean animals migrate too. Gray whales travel up to 20,000 kilometers round trip from feeding grounds in the Arctic to breeding lagoons in Baja California. Sea turtles migrate hundreds or thousands of kilometers between feeding areas and nesting beaches. Scientists use satellite tracking to study these incredible journeys."
);

// ── 自然: world-biomes (G6) ──
SOURCE_TEXTS.set(
  "world-biomes|G6",
  "A biome is a large geographic region characterized by its climate, soil, and the plants and animals that live there. Understanding Earth's major biomes helps scientists study how ecosystems function and how they respond to changes. Tropical rainforests are found near the equator with high rainfall and temperatures year-round. They have the greatest biodiversity of any biome, hosting millions of species. The soil is surprisingly poor because nutrients are quickly recycled by decomposers and absorbed by plants. Savannas are grasslands with scattered trees, found in Africa, South America, and Australia. They have a wet season and a dry season. Large herbivores like zebras and elephants, along with their predators like lions, are characteristic animals. Deserts receive very little rainfall. They can be hot or cold. Plants and animals have specialized adaptations for water conservation. Contrary to popular belief, deserts can be full of life, including cacti, reptiles, insects, and small mammals. Temperate grasslands, also called prairies or steppes, have hot summers and cold winters with moderate rainfall. The fertile soil makes them ideal for agriculture, and they are often called the breadbaskets of the world. Temperate forests experience four distinct seasons and receive enough rain to support deciduous trees that lose their leaves in winter. Taiga, or boreal forest, is the world's largest land biome, stretching across Canada, Russia, and Scandinavia. It has long, cold winters and short summers. Coniferous trees like spruce and pine dominate. Tundra is the coldest biome, with permanently frozen soil called permafrost. Only low-growing plants like mosses and lichens can survive here. Animals like caribou and arctic foxes have thick fur and other cold-weather adaptations."
);

// ── 自然: endangered-species (G6) ──
SOURCE_TEXTS.set(
  "endangered-species|G6",
  "An endangered species is a species at serious risk of extinction, meaning it could disappear from Earth forever. The International Union for Conservation of Nature maintains the Red List of Threatened Species, which currently assesses over 150,000 species. Of these, more than 42,000 are threatened with extinction. The primary cause of species decline is habitat loss. As human populations grow, forests are cleared for agriculture, wetlands are drained for development, and natural areas are fragmented by roads and cities. The Amazon rainforest, home to an estimated 10 percent of the world's species, continues to be cleared at alarming rates. Climate change is an accelerating threat. Rising temperatures force species to shift their ranges toward the poles or higher elevations. Polar bears depend on sea ice for hunting seals, but Arctic sea ice is shrinking rapidly. Coral reefs are experiencing more frequent bleaching events as ocean temperatures rise. Poaching and illegal wildlife trade push many species toward extinction. Elephants are killed for their ivory tusks, rhinos for their horns, and pangolins for their scales. Despite these challenges, conservation efforts have achieved notable successes. The bald eagle was removed from the endangered list after DDT was banned and nesting sites were protected. The giant panda's status improved from endangered to vulnerable thanks to habitat preservation and captive breeding programs in China. The California condor was down to only 22 individuals in the 1980s but now numbers over 500 through an intensive captive breeding and release program. These examples show that with sustained effort, species can recover."
);

// ── 自然: water-cycle (G6) ──
SOURCE_TEXTS.set(
  "water-cycle|G6",
  "The water cycle, also known as the hydrological cycle, is the continuous movement of water through the Earth's atmosphere, land, and oceans. It is a closed system, meaning the same water that existed on Earth billions of years ago is still cycling today. The water you drink may have once been part of an ocean, a cloud, a glacier, or even a dinosaur. The cycle has several key processes. Evaporation occurs when the Sun's energy heats surface water in oceans, lakes, and rivers, turning it into water vapor. About 86 percent of evaporation comes from the oceans. Transpiration is the release of water vapor from plants through tiny pores in their leaves. Together, evaporation and transpiration are called evapotranspiration. Condensation happens when water vapor rises and cools in the atmosphere, forming clouds. Tiny water droplets or ice crystals cling to dust and other particles in the air. Precipitation occurs when these droplets grow heavy enough to fall as rain, snow, sleet, or hail. About 78 percent of precipitation falls back into the oceans, with the rest landing on land. Once on land, water takes different paths. Some flows over the surface as runoff, collecting in streams and rivers that carry it back to the oceans. Some seeps into the ground as infiltration, becoming groundwater stored in aquifers. Groundwater can stay underground for thousands of years before slowly flowing into rivers or oceans. Plants and animals also play a role in the water cycle. All living things contain water and release it through respiration and excretion. Humans affect the water cycle through deforestation, urbanization, dam building, and groundwater extraction."
);

// ── 文化: chinese-new-year ──
SOURCE_TEXTS.set(
  "chinese-new-year|G3",
  "Chinese New Year, also known as the Spring Festival, is the most important traditional holiday in China and many other parts of Asia. It marks the beginning of the lunar new year, and the date changes each year, usually falling between January 21 and February 20. The celebration lasts for 15 days, ending with the Lantern Festival. Preparations begin weeks in advance. People clean their homes thoroughly to sweep away bad luck and make room for good fortune. They decorate with red lanterns, paper cutouts, and couplets with auspicious messages. Red is the main color because it symbolizes good luck and is believed to scare away a mythical monster called Nian. Families gather for a reunion dinner on New Year's Eve, one of the most important meals of the year. Traditional foods include dumplings, which look like ancient Chinese silver ingots and symbolize wealth, and fish, which represents abundance. The word for fish sounds like the word for surplus. Adults give children red envelopes containing money, called hongbao, as blessings for the new year. The envelopes are red, the color of good luck. Each year is associated with one of 12 zodiac animals. The animals rotate in a cycle: Rat, Ox, Tiger, Rabbit, Dragon, Snake, Horse, Goat, Monkey, Rooster, Dog, and Pig. People believe that the animal of their birth year influences their personality and fortune. Celebrations include dragon and lion dances, fireworks, and parades. The holiday is a time for family, honoring ancestors, and wishing others prosperity and happiness in the new year."
);
SOURCE_TEXTS.set(
  "chinese-new-year|G6",
  SOURCE_TEXTS.get("chinese-new-year|G3")
);

// ── 文化: diwali-festival ──
SOURCE_TEXTS.set(
  "diwali-festival|G3",
  "Diwali, also called the Festival of Lights, is the most important holiday in India and is celebrated by Hindus, Sikhs, Jains, and Buddhists around the world. The name Diwali comes from the Sanskrit word deepavali, meaning a row of lamps. The festival usually falls in October or November and lasts for five days. The central theme of Diwali is the victory of light over darkness and good over evil. According to Hindu tradition, Diwali celebrates the return of Lord Rama to his kingdom Ayodhya after 14 years of exile and his victory over the demon king Ravana. People lit oil lamps to welcome him home, a tradition that continues today. During Diwali, families clean and decorate their homes with lamps called diyas, which are small clay pots filled with oil and a cotton wick. Colorful rangoli patterns are created on floors using colored powders, rice, or flower petals. Homes and buildings are adorned with strings of electric lights. Fireworks and firecrackers are a big part of the celebration, though many people now choose quieter, more environmentally friendly alternatives. Families gather for feasts and exchange gifts and sweets. Traditional sweets called mithai, including ladoo, barfi, and jalebi, are shared with neighbors and friends. The festival also has a spiritual meaning about inner light and self-improvement. People pray to Lakshmi, the goddess of wealth and prosperity, and perform ceremonies to invite good fortune into their homes. For many, Diwali is also a time to settle debts, start new business ventures, and make fresh beginnings."
);
SOURCE_TEXTS.set(
  "diwali-festival|G6",
  SOURCE_TEXTS.get("diwali-festival|G3")
);

// ── 文化: japanese-tea-ceremony ──
SOURCE_TEXTS.set(
  "japanese-tea-ceremony|G3",
  "The Japanese tea ceremony, called chanoyu or sado, is a traditional practice that involves the ceremonial preparation and presentation of matcha, a powdered green tea. It is far more than just drinking tea; it is a meditative practice that emphasizes harmony, respect, purity, and tranquility. The tea ceremony has its roots in Zen Buddhism and was developed over centuries. It was formalized by Sen no Rikyu, a tea master who lived in the 16th century. Rikyu established the principles of wabi-sabi, finding beauty in simplicity, imperfection, and the natural passage of time. A tea ceremony typically takes place in a small, simple room or a separate tea house. Guests enter through a small door called a nijiriguchi, which is purposely low so that everyone, regardless of social status, must bow to enter. The room contains a scroll of calligraphy and a simple flower arrangement called chabana. The host prepares the tea with precise, deliberate movements. Each gesture has meaning, from how the host cleans the tea bowl to how the whisk is held. The matcha is whisked with hot water until frothy using a bamboo whisk called a chasen. Guests admire the tea bowl, drink the tea in prescribed sips, and compliment the host. The entire ceremony can last up to four hours when it includes a full meal. Participants find peace and mindfulness in the ritual. The tea ceremony is considered an art form and a way to cultivate character. It is still widely practiced in Japan today."
);
SOURCE_TEXTS.set(
  "japanese-tea-ceremony|G6",
  SOURCE_TEXTS.get("japanese-tea-ceremony|G3")
);

// ── 文化: mexican-day-of-dead ──
SOURCE_TEXTS.set(
  "mexican-day-of-dead|G3",
  "The Day of the Dead, or Dia de los Muertos, is a Mexican holiday that honors deceased loved ones and celebrates the continuity of life. It is observed on November 1 and 2, coinciding with the Catholic holidays of All Saints' Day and All Souls' Day. The holiday blends indigenous Aztec traditions with Catholic influences. Far from being a sad occasion, it is a joyful celebration filled with color, music, and family. Families create altars, or ofrendas, in their homes and at gravesites. These altars are decorated with marigold flowers, candles, incense, photographs of the deceased, and offerings of food and drink. Marigolds, called cempasuchil, are particularly important. Their bright color and strong scent are believed to guide spirits back to the world of the living. The ofrenda typically includes the favorite foods and drinks of the departed, such as tamales, pan de muerto bread, fruit, and water. Families gather at cemeteries to clean and decorate graves, often spending the night there, sharing stories, eating, and playing music. Skeletons and skulls, called calaveras, are a prominent symbol. People paint their faces as skulls, and colorful sugar skulls are made as decorations and treats. Catrina, a elegantly dressed female skeleton, has become an iconic figure associated with the holiday. The 2017 animated film Coco brought this tradition to a global audience. UNESCO recognized the Day of the Dead as an Intangible Cultural Heritage of Humanity in 2008. The holiday reminds people to remember and honor their ancestors while embracing life."
);
SOURCE_TEXTS.set(
  "mexican-day-of-dead|G6",
  SOURCE_TEXTS.get("mexican-day-of-dead|G3")
);

// ── 文化: thanksgiving-traditions ──
SOURCE_TEXTS.set(
  "thanksgiving-traditions|G3",
  "Thanksgiving is a national holiday celebrated primarily in the United States and Canada, centered around giving thanks for the harvest and the blessings of the past year. In the United States, it is observed on the fourth Thursday of November. In Canada, it falls on the second Monday of October. The holiday has its origins in 1621, when the Pilgrims, English settlers in Plymouth, Massachusetts, shared a harvest feast with the Wampanoag people. The Wampanoag had taught the Pilgrims how to grow corn, fish, and hunt in the New World. This three-day feast is often considered the first Thanksgiving, though the historical details are more complex than the popular story suggests. Today, Thanksgiving is primarily a family holiday. People travel long distances to gather with loved ones. The centerpiece of the celebration is a large feast, traditionally featuring roast turkey, stuffing, mashed potatoes, cranberry sauce, and pumpkin pie. The meal is so central that Thanksgiving is sometimes called Turkey Day. Another important tradition is the presidential turkey pardon, where the President of the United States symbolically spares a turkey from being eaten. The Macy's Thanksgiving Day Parade in New York City features giant balloons, floats, and marching bands and is watched by millions on television. For many, Thanksgiving is a time to reflect on what they are grateful for and to give back to their communities through volunteering at food banks or shelters. The day after Thanksgiving, called Black Friday, marks the beginning of the holiday shopping season."
);
SOURCE_TEXTS.set(
  "thanksgiving-traditions|G6",
  SOURCE_TEXTS.get("thanksgiving-traditions|G3")
);

// ---------------------------------------------------------------------------
// OpenAI client (lazy init — avoids crash at module scope when env not set)
// ---------------------------------------------------------------------------

let _openai = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || "https://api.minimaxi.com/v1",
    });
  }
  return _openai;
}

// ---------------------------------------------------------------------------
// Prompt builder (mirrors content-generator.ts)
// ---------------------------------------------------------------------------

function buildPrompt({ topicKey, category, gradeLevel, sourceText, categoryChinese }) {
  const wordLimit = gradeLevel <= 4 ? "300-450 words" : "500-800 words";
  const questionCount = gradeLevel <= 4 ? 5 : 8;
  const focusAreas = gradeLevel <= 4
    ? "Detail and vocabulary questions (easier)"
    : "Main idea and inference questions (more analytical)";

  return `You are adapting a reading passage for a Grade ${gradeLevel} student (age ${gradeLevel + 5}).

Original passage:
${sourceText.slice(0, 6000)}

Create an adapted version suitable for Grade ${gradeLevel}. Requirements:
- Target length: ${wordLimit}
- Grade-appropriate vocabulary and sentence complexity
- Clear topic, engaging opening paragraph
- Category: ${categoryChinese}

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
// OpenAI call
// ---------------------------------------------------------------------------

async function generateArticle(topicKey, category, gradeLevel, sourceText) {
  const prompt = buildPrompt({
    topicKey,
    category,
    gradeLevel,
    sourceText,
    categoryChinese: category,
  });

  const completion = await getOpenAI().chat.completions.create({
    model: process.env.OPENAI_READING_MODEL || "MiniMax-M2.7",
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
// Supabase client
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
    );
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

// ---------------------------------------------------------------------------
// Insert into Supabase
// ---------------------------------------------------------------------------

async function insertArticle(supabase, { topicKey, category, gradeLevel, title, content, summary, source, wordCount, estimatedMinutes, difficulty }) {
  const { data: article, error } = await supabase
    .from("reading_articles")
    .upsert(
      {
        topic_key: topicKey,
        grade_level: gradeLevel,
        title,
        content,
        source: source || "ai_generated",
        source_url: null,
        category,
        word_count: wordCount || 0,
        estimated_minutes: estimatedMinutes || 5,
        difficulty: difficulty || 3,
        status: "published",
      },
      { onConflict: "topic_key, grade_level" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to insert article: ${error.message}`);
  }

  return article.id;
}

async function insertQuestions(supabase, articleId, questions) {
  if (!questions || questions.length === 0) return;

  const { error } = await supabase.from("reading_questions").insert(
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

  if (error) {
    throw new Error(`Failed to insert questions: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const categoryFilter = args.includes("--category")
    ? args[args.indexOf("--category") + 1]
    : null;
  const gradeFilter = args.includes("--grade")
    ? parseInt(args[args.indexOf("--grade") + 1], 10)
    : null;

  if (isDryRun) {
    console.log("=== DRY-RUN MODE ===\n");
  }

  // Filter topics
  const filteredTopics = TOPICS.filter((t) => {
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (gradeFilter && t.gradeLevel !== gradeFilter) return false;
    return true;
  });

  console.log(
    `\nPreparing to seed ${filteredTopics.length} articles across ${new Set(filteredTopics.map((t) => t.category)).size} categories...`
  );

  // Group by topicKey for summary
  const topicKeys = [...new Set(filteredTopics.map((t) => t.topicKey))];
  console.log(`Unique topics: ${topicKeys.length}\n`);

  if (isDryRun) {
    for (const topic of filteredTopics) {
      const mapKey = `${topic.topicKey}|G${topic.gradeLevel}`;
      const sourceText = SOURCE_TEXTS.get(mapKey);
      const wordCount = sourceText ? sourceText.split(/\s+/).length : 0;

      console.log(
        `[DRY-RUN] Would generate: ${topic.topicKey} | Grade ${topic.gradeLevel} | ${topic.category} | source text: ~${wordCount} words`
      );
    }

    console.log("\n=== DRY-RUN COMPLETE ===");
    console.log(`Total articles that would be generated: ${filteredTopics.length}`);
    return;
  }

  // Validate env
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is not set in .env.local");
    process.exit(1);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
    process.exit(1);
  }

  const supabase = getSupabaseClient();

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < filteredTopics.length; i++) {
    const topic = filteredTopics[i];
    const mapKey = `${topic.topicKey}|G${topic.gradeLevel}`;
    const sourceText = SOURCE_TEXTS.get(mapKey);

    if (!sourceText) {
      console.warn(
        `[${i + 1}/${filteredTopics.length}] SKIP: No source text for ${mapKey}`
      );
      failCount++;
      continue;
    }

    process.stdout.write(
      `[${i + 1}/${filteredTopics.length}] Generating ${topic.topicKey} (G${topic.gradeLevel}, ${topic.category})... `
    );

    try {
      const result = await generateArticle(
        topic.topicKey,
        topic.category,
        topic.gradeLevel,
        sourceText
      );

      const articleId = await insertArticle(supabase, {
        topicKey: topic.topicKey,
        category: topic.category,
        gradeLevel: topic.gradeLevel,
        title: result.article.title,
        content: result.article.content,
        summary: result.article.summary,
        source: "ai_generated",
        wordCount: result.article.word_count,
        estimatedMinutes: result.article.estimated_minutes,
        difficulty: result.article.difficulty,
      });

      await insertQuestions(supabase, articleId, result.questions);

      console.log(
        `OK — "${result.article.title}" (${result.questions.length} questions)`
      );
      successCount++;
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      failCount++;
    }

    // Brief delay between API calls to avoid rate limits
    if (i < filteredTopics.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log("\n=== SEED COMPLETE ===");
  console.log(`Success: ${successCount}`);
  console.log(`Failed:  ${failCount}`);
  console.log(`Total:   ${filteredTopics.length}`);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
