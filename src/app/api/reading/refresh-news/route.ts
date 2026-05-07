import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { generateArticleContent } from "@/lib/reading";

// Built-in curated news blurbs (timeless educational topics)
const CURATED_NEWS: Array<{
  topicKey: string;
  category: string;
  sourceText: string;
  sourceUrl?: string;
}> = [
  // --- Existing items (10) ---
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

  // --- Science (5 new) ---
  {
    topicKey: "immune-system",
    category: "科学",
    sourceText:
      "The human immune system is the body's defense against infections and diseases. It consists of various cells, tissues, and organs that work together to protect us from harmful invaders like bacteria, viruses, and parasites. The immune system has two main parts: the innate immune system and the adaptive immune system. The innate immune system provides immediate, general defense through physical barriers like skin and immune cells that attack any foreign substance. The adaptive immune system, on the other hand, learns to recognize specific pathogens and remembers them for future encounters. White blood cells, including B cells and T cells, play crucial roles in immune responses. B cells produce antibodies that neutralize pathogens, while T cells destroy infected cells. Vaccines work by training the adaptive immune system to recognize specific pathogens without causing illness, creating immunological memory that can last for years or even a lifetime. Understanding the immune system has been critical in developing treatments for diseases and creating effective public health strategies.",
  },
  {
    topicKey: "photosynthesis",
    category: "科学",
    sourceText:
      "Photosynthesis is the process by which plants, algae, and some bacteria convert sunlight into chemical energy. This remarkable process is the foundation of life on Earth, producing the oxygen we breathe and serving as the base of most food chains. Photosynthesis takes place primarily in the leaves of plants, inside cell structures called chloroplasts. Chloroplasts contain chlorophyll, the green pigment that captures light energy. During photosynthesis, plants take in carbon dioxide from the air through tiny pores called stomata and absorb water from the soil through their roots. Using energy from sunlight, the plant converts carbon dioxide and water into glucose, a sugar that provides energy, and releases oxygen as a byproduct. The chemical equation for photosynthesis is 6CO2 plus 6H2O plus sunlight yields C6H12O6 plus 6O2. Photosynthesis not only feeds the plant but also releases the oxygen that animals and humans need to breathe. Without photosynthesis, life as we know it could not exist.",
  },
  {
    topicKey: "earthquakes-tectonics",
    category: "科学",
    sourceText:
      "Earthquakes are among the most powerful natural phenomena on Earth, caused by the sudden release of energy in the Earth's crust. This energy release occurs along faults, which are fractures between blocks of rock. The theory of plate tectonics explains why earthquakes happen where they do. The Earth's outer shell, or lithosphere, is divided into several large pieces called tectonic plates that float on the partially molten mantle beneath. These plates move slowly over time, typically just a few centimeters per year, about as fast as fingernails grow. When plates collide, pull apart, or slide past each other, stress builds up along their boundaries. When this stress exceeds the strength of the rocks, the stored energy is released suddenly as seismic waves, causing the ground to shake. The point underground where the earthquake originates is called the focus, and the point directly above it on the surface is the epicenter. The Richter scale and moment magnitude scale measure earthquake size. Scientists use seismographs to detect and record earthquakes, and early warning systems can provide precious seconds of alert before shaking arrives.",
  },
  {
    topicKey: "genes-dna",
    category: "科学",
    sourceText:
      "Deoxyribonucleic acid, or DNA, is the molecule that carries the genetic instructions for all known living organisms. Often described as the blueprint of life, DNA contains the information needed to build and maintain an organism. DNA has a remarkable double helix structure, discovered by James Watson and Francis Crick in 1953 with crucial contributions from Rosalind Franklin's X-ray crystallography images. The double helix consists of two strands that wind around each other like a twisted ladder. Each strand is made of a sugar-phosphate backbone with nitrogenous bases attached. There are four types of bases: adenine (A), thymine (T), guanine (G), and cytosine (C). These bases pair specifically: A with T, and G with C. The sequence of these bases along the DNA strand forms the genetic code. Genes are specific segments of DNA that contain instructions for making proteins, which perform most functions in living cells. The complete set of genetic information in an organism is called its genome. The Human Genome Project, completed in 2003, mapped all 20,000 to 25,000 genes in human DNA, opening new frontiers in medicine and biology.",
  },
  {
    topicKey: "black-holes",
    category: "科学",
    sourceText:
      "Black holes are among the most mysterious and fascinating objects in the universe. A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape its pull. They form when massive stars collapse at the end of their life cycles, compressing an enormous amount of matter into an incredibly small space. The boundary around a black hole beyond which nothing can escape is called the event horizon. At the center lies the singularity, a point where matter is infinitely dense and the laws of physics as we know them break down. Black holes come in different sizes: stellar-mass black holes form from collapsed stars and are about 5 to 20 times the mass of our Sun; supermassive black holes, found at the centers of galaxies including our own Milky Way, can be millions or billions of times more massive than the Sun. In 2019, the Event Horizon Telescope captured the first-ever image of a black hole, located in the galaxy M87. Despite their name, black holes can be detected by observing their effects on nearby matter and stars that orbit around them.",
  },

  // --- History (7 new) ---
  {
    topicKey: "roman-empire",
    category: "历史",
    sourceText:
      "The Roman Empire was one of the most powerful and influential civilizations in world history. At its height, it stretched from Britain to North Africa and from Spain to the Middle East, encompassing the entire Mediterranean Sea. The empire began in 27 BCE when Augustus became the first Roman emperor, following centuries of Roman expansion as a republic. The Romans were remarkable engineers and builders. They constructed an extensive network of roads stretching over 400,000 kilometers, aqueducts that brought fresh water to cities, and architectural marvels like the Colosseum and the Pantheon. Roman law and government systems influenced legal systems throughout Europe and beyond. The empire also spread Latin, which evolved into the Romance languages including Italian, French, Spanish, Portuguese, and Romanian. Roman contributions to philosophy, literature, and art were also significant. However, by the 5th century CE, the Western Roman Empire fell due to a combination of internal decay, economic problems, and invasions by Germanic tribes. The Eastern Roman Empire, known as the Byzantine Empire, continued for another thousand years until Constantinople fell in 1453.",
  },
  {
    topicKey: "printing-press",
    category: "历史",
    sourceText:
      "The invention of the printing press by Johannes Gutenberg around 1440 in Mainz, Germany, is widely regarded as one of the most important innovations in human history. Before the printing press, books were copied by hand, making them extremely rare and expensive, available only to wealthy scholars and religious institutions. Gutenberg's printing press used movable type: individual letters made of metal that could be arranged, inked, and pressed onto paper. This allowed multiple copies of the same text to be produced quickly and accurately. Gutenberg's most famous work is the Gutenberg Bible, printed around 1455. The printing press revolutionized the spread of knowledge and ideas. Books became more affordable and accessible to ordinary people, leading to higher literacy rates across Europe. The printing press played a crucial role in the Reformation, as Martin Luther's ideas could be spread rapidly through printed pamphlets. Scientific discoveries could be shared more easily among scholars. The printing press laid the foundation for the modern knowledge economy and is often credited with helping to end the Middle Ages and usher in the modern era.",
  },
  {
    topicKey: "silk-road",
    category: "历史",
    sourceText:
      "The Silk Road was not a single road but a vast network of trade routes that connected East Asia, Central Asia, the Middle East, and Europe for over 1,500 years. The name comes from the lucrative trade in Chinese silk, but many other goods were exchanged along these routes, including spices, precious metals, textiles, glassware, and animals. The Silk Road began to flourish around the 2nd century BCE when the Han Dynasty of China expanded westward and established trade connections with Central Asian kingdoms. The routes stretched approximately 6,400 kilometers from Chang'an, modern-day Xi'an, to the Mediterranean Sea. Traveling the entire Silk Road could take months or years, and traders faced extreme weather, rugged terrain, and bandits. Caravans would stop at oasis cities like Samarkand and Bukhara to rest and trade. Beyond goods, the Silk Road was also a highway for the exchange of ideas, religions, and technologies. Buddhism spread from India to China along these routes. Papermaking, gunpowder, and the compass traveled from China to the West. The Silk Road declined in the 15th century as maritime trade routes became more important.",
  },
  {
    topicKey: "industrial-revolution",
    category: "历史",
    sourceText:
      "The Industrial Revolution was a period of major technological, economic, and social change that began in Britain in the late 18th century and spread across the world. It marked a decisive shift from handmade, agrarian economies to machine-based manufacturing and industrial production. Key inventions drove this transformation. The steam engine, improved by James Watt in the 1760s, provided a powerful new source of energy. In the textile industry, machines like the spinning jenny, the water frame, and the power loom dramatically increased the speed of cloth production. The iron and coal industries expanded rapidly to supply raw materials and fuel. Railroads and steamships revolutionized transportation, making it faster and cheaper to move goods and people. The Industrial Revolution had profound effects on society. Millions of people moved from rural areas to cities in search of factory work, leading to rapid urbanization. Working conditions in early factories were often harsh, with long hours, low wages, and dangerous machinery. Child labor was widespread. Over time, labor movements fought for better conditions, leading to laws regulating working hours and child labor. The Industrial Revolution fundamentally changed how people lived and worked.",
  },
  {
    topicKey: "zheng-he",
    category: "历史",
    sourceText:
      "Zheng He was a Chinese explorer, admiral, and diplomat who led seven epic voyages across the Indian Ocean between 1405 and 1433, during the Ming Dynasty. Born as Ma He in 1371 in what is now Yunnan province, he was captured as a boy and became a eunuch in the service of the imperial court. He rose through the ranks to become a trusted advisor to Emperor Yongle. Zheng He's fleet was the largest and most advanced the world had ever seen. His treasure ships were enormous, estimated to be up to 120 meters long, far larger than contemporary European ships. Each voyage involved hundreds of ships and tens of thousands of crew members. Zheng He traveled to Southeast Asia, India, the Arabian Peninsula, and the east coast of Africa. He brought back exotic goods, animals, and ambassadors from foreign lands. The voyages demonstrated China's power and established tributary relationships with numerous states. However, after Zheng He's death, China's imperial court turned inward, halted further voyages, and destroyed many records of the fleet. Zheng He's accomplishments were largely forgotten in China for centuries but are now recognized as one of the great achievements in maritime history.",
  },
  {
    topicKey: "american-revolution",
    category: "历史",
    sourceText:
      "The American Revolution was a political and military conflict from 1775 to 1783 in which the Thirteen American Colonies fought for independence from British rule. Tensions had been building for years over issues of taxation without representation, as the British Parliament imposed taxes like the Stamp Act and the Tea Act on the colonies without giving them any voice in government. The Boston Tea Party of 1773, where colonists dumped British tea into Boston Harbor in protest, was a key event leading to war. The conflict began in 1775 with the Battles of Lexington and Concord. The Continental Congress appointed George Washington as commander of the Continental Army. On July 4, 1776, the Congress adopted the Declaration of Independence, written by Thomas Jefferson, which proclaimed the colonies' right to be free and independent states. The war was long and difficult for the American forces, who faced the powerful British army with limited resources. However, the Americans received crucial assistance from France. The turning point came with the American victory at Saratoga in 1777. The war ended in 1781 when British General Cornwallis surrendered at Yorktown. The Treaty of Paris in 1783 officially recognized the United States as an independent nation.",
  },
  {
    topicKey: "dinosaur-extinction",
    category: "历史",
    sourceText:
      "About 66 million years ago, a catastrophic event ended the reign of the dinosaurs, which had dominated Earth for over 160 million years. This mass extinction, known as the Cretaceous-Paleogene extinction event, wiped out approximately 75% of all plant and animal species on Earth, including all non-avian dinosaurs. The leading scientific theory, proposed by physicist Luis Alvarez and his son Walter in 1980, is that a massive asteroid about 10 to 15 kilometers in diameter struck the Earth near what is now the Yucatan Peninsula in Mexico. This impact created the Chicxulub crater, which is over 180 kilometers wide. The asteroid impact released energy equivalent to billions of atomic bombs. It caused massive earthquakes, tsunamis, and wildfires around the world. A huge cloud of dust and debris was thrown into the atmosphere, blocking sunlight for months or years. Without sunlight, plants could not photosynthesize, causing a collapse of food chains. The cold and dark conditions made it impossible for most large animals to survive. However, many groups of animals did survive, including mammals, birds, and insects. The extinction of the dinosaurs opened ecological opportunities for mammals, which eventually diversified and gave rise to many modern species, including humans.",
  },

  // --- Nature (4 new) ---
  {
    topicKey: "animal-migration",
    category: "自然",
    sourceText:
      "Animal migration is the large-scale movement of animals from one place to another, often covering vast distances. Animals migrate for various reasons: to find food, to reproduce, to escape harsh weather, or to reach more favorable habitats. One of the most spectacular migrations is that of the wildebeest in East Africa, where about 1.5 million wildebeest, along with hundreds of thousands of zebras and gazelles, travel in a circular route through Tanzania and Kenya, following seasonal rains and fresh grass. In the oceans, humpback whales migrate up to 8,000 kilometers each year, traveling from cold feeding waters near the poles to warm tropical waters where they give birth. Birds are among the most impressive migrants. The Arctic tern holds the record for the longest migration, flying from the Arctic to the Antarctic and back each year, a round trip of about 70,000 kilometers. Many species of birds use the Earth's magnetic field, the position of the sun and stars, and even their sense of smell to navigate across continents. Migration is a risky journey as animals face predators, extreme weather, habitat loss, and human-made obstacles like buildings and roads.",
  },
  {
    topicKey: "ocean-plastic-pollution",
    category: "自然",
    sourceText:
      "Ocean plastic pollution has become one of the most pressing environmental issues of our time. An estimated 8 to 12 million metric tons of plastic enter the oceans each year, equivalent to dumping a garbage truck full of plastic into the ocean every minute. Most of this plastic comes from land-based sources, carried by rivers and wind into the sea. Once in the ocean, plastic does not biodegrade. Instead, it breaks down into smaller and smaller pieces called microplastics, which are less than 5 millimeters in size. These microplastics have been found everywhere in the ocean, from the surface to the deepest trenches, and even in Arctic sea ice. Huge garbage patches, such as the Great Pacific Garbage Patch, have formed where ocean currents concentrate plastic debris. These patches are not solid islands of trash but rather dispersed areas of floating plastic. Marine animals often mistake plastic for food, leading to choking, starvation, and death. Sea turtles cannot tell plastic bags from jellyfish. Seabirds feed plastic to their chicks. Microplastics have entered the food chain and have been found in drinking water, salt, and even human bodies. Efforts to address this problem include reducing plastic production, improving waste management, and cleaning up existing pollution.",
  },
  {
    topicKey: "penguins-antarctica",
    category: "自然",
    sourceText:
      "Penguins are a group of flightless birds that are remarkably adapted to life in cold environments, especially Antarctica. While many people associate all penguins with ice and snow, only a few species actually live in Antarctica, including the emperor penguin, Adélie penguin, and chinstrap penguin. Emperor penguins are the largest of all penguin species, standing up to 120 centimeters tall and weighing up to 45 kilograms. They have several extraordinary adaptations for surviving Antarctica's extreme conditions. Their bodies are covered with dense, waterproof feathers that provide excellent insulation. Under their skin, they have a thick layer of blubber for warmth and energy storage. They huddle together in large groups, taking turns being on the warm inside and the cold outside, to conserve heat during brutal winter storms. Emperor penguins breed during the Antarctic winter, the harshest time of year. The female lays a single egg and then transfers it to the male, who balances it on his feet, covering it with a warm flap of skin called a brood pouch. The male incubates the egg for about two months while the female travels to the sea to feed. Despite their clumsy walk on land, penguins are graceful and efficient swimmers capable of diving to depths of over 500 meters.",
  },
  {
    topicKey: "volcanoes-islands",
    category: "自然",
    sourceText:
      "Volcanoes are openings in the Earth's crust through which molten rock, ash, and gases erupt. While they can be destructive, volcanoes are also constructive forces that have created many of the world's islands and landforms. The Hawaiian Islands are a perfect example of volcanic island formation. They were created by a hot spot, a fixed area of intense heat in the Earth's mantle. As the Pacific tectonic plate slowly moved over this hot spot over millions of years, a chain of volcanic islands was formed. The oldest islands in the northwest are eroded and small, while the youngest islands to the southeast, including Hawaii's Big Island, are still volcanically active. Kilauea, one of the world's most active volcanoes, has been erupting continuously for decades, adding new land to the island. Volcanic eruptions can also create new islands seemingly overnight. In 1963, the island of Surtsey emerged off the coast of Iceland after a volcanic eruption, providing scientists with a unique opportunity to study how life colonizes new land. Iceland itself was formed by volcanic activity along the Mid-Atlantic Ridge. Volcanoes enrich soil with minerals, making surrounding areas fertile for farming, though the eruptions themselves pose significant risks to nearby communities.",
  },

  // --- People (7 new) ---
  {
    topicKey: "leonardo-da-vinci",
    category: "人物",
    sourceText:
      "Leonardo da Vinci was an Italian Renaissance artist, inventor, scientist, and thinker, widely regarded as one of the most brilliant minds in human history. Born in 1452 in the town of Vinci near Florence, he showed extraordinary talent from an early age. He is most famous as the painter of two of the world's most iconic works: the Mona Lisa, with her mysterious smile, and The Last Supper, a mural depicting Jesus with his disciples. But Leonardo was far more than an artist. He kept detailed notebooks filled with sketches and ideas that were centuries ahead of their time. He designed flying machines, including an ornithopter that mimicked bird flight, and a helicopter-like device. He studied anatomy by dissecting human corpses, producing incredibly accurate drawings of muscles, bones, and organs. He designed military inventions like armored vehicles and giant crossbows. He studied geology, botany, optics, and engineering. Leonardo wrote in mirror script, writing from right to left, which made his notes difficult for others to read. His approach to learning was based on observation and experience rather than accepting traditional knowledge. Leonardo da Vinci died in 1519, leaving behind a legacy of curiosity and creativity that continues to inspire people around the world.",
  },
  {
    topicKey: "marie-curie",
    category: "人物",
    sourceText:
      "Marie Curie was a pioneering physicist and chemist who made groundbreaking discoveries in the field of radioactivity. Born Maria Sklodowska in Warsaw, Poland, in 1867, she moved to Paris to study at the Sorbonne, where she met her husband and research partner, Pierre Curie. Marie Curie's research led to the discovery of two new radioactive elements: polonium, named after her native Poland, and radium. Her work showed that atoms were not indivisible as previously thought, but could change form and release energy. She coined the term radioactivity to describe this phenomenon. In 1903, she and Pierre, along with Henri Becquerel, were awarded the Nobel Prize in Physics for their work on radioactivity. In 1911, she won the Nobel Prize in Chemistry for isolating pure radium. She remains the only person to have won Nobel Prizes in two different scientific fields. During World War I, Curie developed mobile X-ray units, called Little Curies, to help doctors treat wounded soldiers on the battlefield. She trained other women to operate the equipment. Curie's work came at a personal cost as she suffered from radiation sickness due to long-term exposure without proper protection. She died in 1934 from aplastic anemia caused by radiation exposure.",
  },
  {
    topicKey: "martin-luther-king",
    category: "人物",
    sourceText:
      "Martin Luther King Jr. was an American Baptist minister and civil rights leader who became the most prominent figure in the fight for racial equality in the United States. Born in Atlanta, Georgia, in 1929, he grew up in a segregated society where African Americans faced discrimination in almost every aspect of life. Inspired by Mahatma Gandhi's philosophy of nonviolent resistance, King led peaceful protests and marches to challenge racial injustice. In 1955, he emerged as a leader during the Montgomery Bus Boycott, a protest against segregated public transportation sparked by Rosa Parks's refusal to give up her seat. In 1963, King delivered his famous I Have a Dream speech during the March on Washington, where he spoke of his vision for a future where people would be judged by their character rather than the color of their skin. His leadership was crucial in the passing of the Civil Rights Act of 1964 and the Voting Rights Act of 1965. In 1964, he became the youngest person to receive the Nobel Peace Prize at the age of 35. King was assassinated on April 4, 1968, in Memphis, Tennessee. His legacy continues to inspire civil rights movements around the world.",
  },
  {
    topicKey: "tu-youyou",
    category: "人物",
    sourceText:
      "Tu Youyou is a Chinese pharmaceutical chemist, best known for discovering artemisinin, a life-saving malaria treatment. Born in 1930 in Ningbo, Zhejiang Province, China, she studied pharmacy at Peking University and later joined the Academy of Chinese Traditional Medicine in Beijing. In the 1960s, during the Vietnam War, malaria was killing more soldiers than combat. China launched a secret military project called Project 523 to find a malaria cure. Tu Youyou was appointed to lead the research team. She studied ancient Chinese medical texts, searching through thousands of recipes used in traditional medicine. One recipe described using sweet wormwood, Artemisia annua, to treat fevers. The text instructed that the plant should be soaked in cold water and the juice squeezed out. Tu realized that high temperatures might destroy the active compound. She developed a method using a low-temperature ether extraction to isolate the effective substance, which she called artemisinin. Artemisinin proved highly effective against the malaria parasite. Tu Youyou's discovery has saved millions of lives worldwide, especially in developing countries. In 2015, she was awarded the Nobel Prize in Physiology or Medicine, becoming the first Chinese woman to win a Nobel Prize. Her work demonstrated the value of combining traditional knowledge with modern scientific methods.",
  },
  {
    topicKey: "malala",
    category: "人物",
    sourceText:
      "Malala Yousafzai is a Pakistani education activist and the youngest Nobel Prize laureate in history. Born in 1997 in Mingora, a city in the Swat Valley of Pakistan, she grew up in a region that came under the control of the Taliban, a militant group that opposed girls' education. When the Taliban banned girls from attending school, Malala, at just 11 years old, began speaking out publicly for the right of girls to receive an education. She wrote a blog for the BBC under a pseudonym, describing life under Taliban rule and her determination to continue learning. Her activism made her a target. In October 2012, a Taliban gunman boarded her school bus and shot her in the head. Malala survived the attack after undergoing multiple surgeries and was flown to the United Kingdom for rehabilitation. The assassination attempt sparked global outrage and drew international attention to the cause of girls' education. After recovering, Malala continued her activism with even greater determination. In 2013, she co-founded the Malala Fund, which works to ensure girls around the world can access 12 years of free, quality education. In 2014, at age 17, she became the youngest-ever recipient of the Nobel Peace Prize. Her courage continues to inspire young people worldwide.",
  },
  {
    topicKey: "stephen-hawking",
    category: "人物",
    sourceText:
      "Stephen Hawking was one of the most brilliant theoretical physicists of modern times, known for his work on black holes, relativity, and cosmology. Born in Oxford, England, in 1942, he studied physics at Oxford University and later pursued his PhD at Cambridge University. While still a graduate student, Hawking was diagnosed with amyotrophic lateral sclerosis (ALS), a progressive motor neuron disease that gradually paralyzed him. Doctors gave him only a few years to live, but he defied the odds, living with the condition for over 50 years. Hawking made several groundbreaking contributions to our understanding of the universe. He showed that black holes are not completely black but emit radiation, now known as Hawking radiation. This was a revolutionary idea that connected Einstein's theory of relativity with quantum mechanics. He also proposed that the universe had no boundary or beginning in time, and that time itself began with the Big Bang. Despite becoming almost completely paralyzed and communicating through a speech-generating device, Hawking continued to work, write, and lecture. His book A Brief History of Time became an international bestseller, making complex scientific ideas accessible to millions of readers. Stephen Hawking died in 2018, leaving an enduring legacy in physics and popular science.",
  },
  {
    topicKey: "ludwig-van-beethoven",
    category: "人物",
    sourceText:
      "Ludwig van Beethoven was a German composer and pianist, widely regarded as one of the greatest composers in the history of Western music. Born in Bonn in 1770, he showed remarkable musical talent at an early age. His father, a harsh and demanding teacher, pushed him to practice for hours. Beethoven moved to Vienna in 1792, where he studied under Joseph Haydn and quickly established himself as a brilliant pianist and composer. His early works were in the classical style of Mozart and Haydn. However, Beethoven's music became increasingly powerful and emotionally intense, bridging the classical and romantic eras. In his late twenties, Beethoven began to lose his hearing. By his mid-forties, he was completely deaf, a devastating fate for a musician. Despite this, Beethoven continued to compose some of his greatest works. His most famous compositions include Symphony No. 5, with its iconic opening four-note motif; Symphony No. 9, also known as the Choral Symphony, which features the Ode to Joy; and the Moonlight Sonata. He composed his Ninth Symphony when he was completely deaf. Beethoven's music broke conventions and expanded the possibilities of musical expression. He died in 1827 during a thunderstorm, and thousands attended his funeral.",
  },

  // --- Culture (4 new) ---
  {
    topicKey: "thanksgiving-origins",
    category: "文化",
    sourceText:
      "Thanksgiving is a national holiday celebrated primarily in the United States and Canada. The American Thanksgiving tradition traces its origins to a harvest feast in 1621 shared between the English Pilgrims who had settled at Plymouth Colony and the Wampanoag Native American people. The Pilgrims had arrived in Massachusetts in 1620 after a difficult sea voyage on the Mayflower. Their first winter in the New World was harsh, and about half of the settlers died from disease and starvation. In the spring, the Pilgrims were helped by two Native Americans, Squanto and Samoset, who taught them how to grow corn, catch fish, and gather other foods. By autumn, the colonists had a successful harvest. To celebrate, Governor William Bradford organized a feast of thanks. The Wampanoag leader Massasoit and about 90 of his people joined the celebration, which lasted three days. The meal likely included venison, wildfowl like ducks and geese, fish, corn, squash, and berries. Thanksgiving did not become an official national holiday until 1863, when President Abraham Lincoln proclaimed it a national day of thanks during the Civil War. Today, Thanksgiving is celebrated on the fourth Thursday of November. Families gather for a traditional meal of turkey, stuffing, cranberry sauce, and pumpkin pie.",
  },
  {
    topicKey: "chinese-spring-festival",
    category: "文化",
    sourceText:
      "The Chinese Spring Festival, also known as the Lunar New Year, is the most important traditional holiday in China and many other East Asian countries. Unlike the Western New Year, which follows the Gregorian calendar, the Spring Festival follows the lunar calendar and typically falls between January 21 and February 20. The celebration lasts for 15 days, ending with the Lantern Festival. The Spring Festival has a history spanning over 4,000 years. According to legend, it began as a celebration of the victory over a mythical beast called Nian, which would come out on New Year's Eve to attack villagers. People discovered that Nian was afraid of the color red, bright lights, and loud noises, which is why red decorations and fireworks became part of the tradition. Preparations for the festival begin weeks in advance. Families thoroughly clean their homes to sweep away bad luck and make room for good fortune. Red couplets with calligraphy are pasted on doors. On New Year's Eve, families gather for a lavish reunion dinner, with dishes like dumplings, fish, and spring rolls having symbolic meanings. Older family members give children red envelopes containing money, called hongbao. During the festival, people visit relatives, exchange greetings, watch dragon and lion dances, and set off fireworks.",
  },
  {
    topicKey: "diwali-india",
    category: "文化",
    sourceText:
      "Diwali, also known as the Festival of Lights, is one of the most important and widely celebrated festivals in India and among Hindu communities worldwide. The name Diwali comes from the Sanskrit word deepavali, which means a row of lights. The festival usually lasts for five days and falls between October and November, according to the Hindu lunar calendar. Diwali symbolizes the spiritual victory of light over darkness, good over evil, and knowledge over ignorance. The festival has different meanings in different regions of India. In northern India, Diwali celebrates the return of Lord Rama, his wife Sita, and his brother Lakshmana to their kingdom of Ayodhya after 14 years of exile, as told in the epic Ramayana. People lit rows of lamps to guide their way home. In southern India, Diwali honors the victory of Lord Krishna over the demon Narakasura. During Diwali, homes and streets are decorated with small oil lamps called diyas and colorful lights. Families create intricate rangoli patterns on their floors using colored powders, flowers, and rice. The celebration involves prayers, feasting, and exchanging gifts. Fireworks light up the night sky. Diwali is also an important time for cleaning and renovating homes, buying new clothes, and beginning new business ventures.",
  },
  {
    topicKey: "brazil-carnival",
    category: "文化",
    sourceText:
      "The Brazilian Carnival, or Carnaval, is the world's biggest and most famous carnival celebration, held annually in cities across Brazil in the days leading up to Lent. The festival is a spectacular explosion of music, dance, color, and creativity that draws millions of participants and visitors from around the globe. Carnival has its roots in European colonial traditions combined with African and Indigenous influences. The Portuguese brought the tradition of Entrudo, a festival where people playfully threw water, mud, and food at each other. African slaves and their descendants contributed drumming, dance movements, and musical styles like samba. Indigenous Brazilian cultures added their own elements. Rio de Janeiro's Carnival is the most famous. At its heart is the Sambadrome, a purpose-built stadium where samba schools compete in elaborate parades. Each samba school, representing a neighborhood, spends the whole year preparing. They choose a theme and create massive floats, costumes, and choreography. Thousands of dancers, drummers, and singers perform in a dazzling display. Salvador's Carnival is known for its Afro-Brazilian rhythms, while Recife and Olinda feature the unique frevo music and dance. Carnival is a time when social barriers are temporarily set aside, and people from all walks of life join together in celebration.",
  },

  // --- Current Events (3 new) ---
  {
    topicKey: "space-tourism-commercialization",
    category: "时事",
    sourceText:
      "Space tourism, once the stuff of science fiction, has become a reality in recent years. Private companies like SpaceX, Blue Origin, and Virgin Galactic have developed vehicles capable of carrying civilians beyond Earth's atmosphere. In 2021, Richard Branson and Jeff Bezos each flew on their own company's spacecraft, marking the beginning of a new era in commercial space travel. SpaceX has been sending private astronauts to orbit the Earth and to the International Space Station through its Crew Dragon capsule. Blue Origin's New Shepard rocket carries passengers on suborbital flights, reaching an altitude of about 100 kilometers, where passengers can experience a few minutes of weightlessness. Virgin Galactic's SpaceShipTwo also offers suborbital experiences. The cost of space tourism remains extremely high, with tickets ranging from hundreds of thousands to tens of millions of dollars. However, companies aim to reduce costs over time through reusable rocket technology and increased competition. As the industry grows, it raises questions about space debris, environmental impact, and the regulation of commercial activities beyond Earth. Scientists and policymakers are working on guidelines to ensure space tourism develops responsibly and sustainably.",
  },
  {
    topicKey: "climate-change-extreme-weather",
    category: "时事",
    sourceText:
      "Climate change is causing an increase in extreme weather events around the world, and scientists have established a clear link between rising global temperatures and more frequent and intense weather disasters. The Earth's average temperature has risen by about 1.2 degrees Celsius since the late 19th century, primarily due to the burning of fossil fuels. This seemingly small increase has significant consequences. Heatwaves are becoming more frequent, longer, and more intense. Record-breaking temperatures have been recorded across Europe, North America, and Asia in recent years, leading to thousands of deaths and massive wildfires. Wildfire seasons have become longer and more destructive, particularly in Australia, California, and the Mediterranean region. Rainfall patterns are changing, causing more intense flooding in some areas. In 2022, unprecedented floods submerged one-third of Pakistan, affecting over 30 million people. Hurricanes and tropical cyclones are becoming stronger because warmer ocean waters provide more energy for storms. Rising sea levels, caused by melting glaciers and ice sheets, make coastal flooding worse. Scientists warn that without significant reductions in greenhouse gas emissions, extreme weather events will continue to intensify.",
  },
  {
    topicKey: "internet-changing-world",
    category: "时事",
    sourceText:
      "The internet has fundamentally transformed nearly every aspect of modern life in just a few decades. What began as a military research project called ARPANET in the 1960s has grown into a global network connecting over 5 billion people. The World Wide Web, invented by Tim Berners-Lee in 1989, made the internet accessible to ordinary people through web browsers. Today, the internet has revolutionized communication, education, commerce, and entertainment. Email, social media, and messaging apps allow instant communication across continents. Online learning platforms make education available to anyone with an internet connection. E-commerce giants like Amazon and Alibaba have transformed how we shop. Streaming services like YouTube and Netflix have changed how we watch videos and listen to music. The internet has also created new industries and jobs that did not exist before, such as app developers, social media managers, and data scientists. However, the internet also presents challenges. Issues of online privacy, data security, misinformation, and digital divides have become major concerns. Countries around the world are developing new laws and regulations to address these problems while trying to keep the internet open and accessible for all.",
  },
];

export async function GET(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isCronCall =
    !!cronSecret && cronSecret === (process.env.CRON_SECRET || "");

  const supabase = isCronCall
    ? await createServiceRoleClient()
    : await createClient();

  if (!isCronCall) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const gradesParam = searchParams.get("grades") || "3,6";
  const grades: number[] = gradesParam
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n));
  const limit = Number(searchParams.get("limit")) || 0;

  const items = limit > 0 ? CURATED_NEWS.slice(0, limit) : CURATED_NEWS;
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
