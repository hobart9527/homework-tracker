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
  // ---- 成语故事 (7) ----
  {
    topic_key: "chengyu-huajia",
    title: "画蛇添足",
    content: "楚有祠者，赐其舍人卮酒。舍人相谓曰：'数人饮之不足，一人饮之有余。请画地为蛇，先成者饮酒。'一人蛇先成，引酒且饮之，乃左手持卮，右手画蛇曰：'吾能为之足。'未成，一人之蛇成，夺其卮曰：'蛇固无足，子安能为之足？'遂饮其酒。为蛇足者，终亡其酒。",
    source: "《战国策·齐策》",
    source_url: null,
    tags: ["成语故事", "寓言", "智慧"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-maodun",
    title: "自相矛盾",
    content: "楚人有鬻盾与矛者，誉之曰：'吾盾之坚，物莫能陷也。'又誉其矛曰：'吾矛之利，于物无不陷也。'或曰：'以子之矛陷子之盾，何如？'其人弗能应也。夫不可陷之盾与无不陷之矛，不可同世而立。",
    source: "《韩非子·难一》",
    source_url: null,
    tags: ["成语故事", "寓言", "逻辑"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-wangyang",
    title: "亡羊补牢",
    content: "庄辛对曰：'臣闻鄙语曰：见兔而顾犬，未为晚也；亡羊而补牢，未为迟也。臣闻昔汤、武以百里昌，桀、纣以天下亡。今楚国虽小，绝长续短，犹以数千里，岂特百里哉？'",
    source: "《战国策·楚策》",
    source_url: null,
    tags: ["成语故事", "励志", "补救"],
    grade_range: [3, 6],
    ib_theme_code: "T5",
    text_type: "non-fiction",
  },
  {
    topic_key: "chengyu-saier",
    title: "塞翁失马",
    content: "近塞上之人有善术者，马无故亡而入胡。人皆吊之。其父曰：'此何遽不为福乎？'居数月，其马将胡骏马而归。人皆贺之。其父曰：'此何遽不能为祸乎？'家富良马，其子好骑，堕而折其髀。人皆吊之。其父曰：'此何遽不为福乎？'居一年，胡人大入塞，丁壮者引弦而战。近塞之人，死者十九。此独以跛之故，父子相保。",
    source: "《淮南子·人间训》",
    source_url: null,
    tags: ["成语故事", "寓言", "福祸", "哲理"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-jingwei",
    title: "精卫填海",
    content: "发鸠之山，其上多柘木，有鸟焉，其状如乌，文首，白喙，赤足，名曰精卫，其鸣自詨。是炎帝之少女，名曰女娃。女娃游于东海，溺而不返，故为精卫，常衔西山之木石，以堙于东海。",
    source: "《山海经·北山经》",
    source_url: null,
    tags: ["成语故事", "神话", "坚持"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-buma",
    title: "买椟还珠",
    content: "楚人有卖其珠于郑者，为木兰之匮，熏以桂椒，缀以珠玉，饰以玫瑰，辑以羽翠。郑人买其椟而还其珠。此可谓善卖椟矣，未可谓善鬻珠也。",
    source: "《韩非子·外储说左上》",
    source_url: null,
    tags: ["成语故事", "寓言", "取舍"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "chengyu-zuoren",
    title: "刻舟求剑",
    content: "楚人有涉江者，其剑自舟中坠于水，遽契其舟曰：'是吾剑之所从坠。'舟止，从其所契者入水求之。舟已行矣，而剑不行，求剑若此，不亦惑乎？",
    source: "《吕氏春秋·察今》",
    source_url: null,
    tags: ["成语故事", "寓言", "变通"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  // ---- 寓言故事 (7) ----
  {
    topic_key: "yuyan-yugong",
    title: "愚公移山",
    content: "太行、王屋二山，方七百里，高万仞。本在冀州之南，河阳之北。北山愚公者，年且九十，面山而居。惩山北之塞，出入之迂也，聚室而谋曰：'吾与汝毕力平险，指通豫南，达于汉阴，可乎？'杂然相许。其妻献疑曰：'以君之力，曾不能损魁父之丘，如太行、王屋何？且焉置土石？'杂曰：'投诸渤海之尾，隐土之北。'遂率子孙荷担者三夫，叩石垦壤，箕畚运于渤海之尾。邻人京城氏之孀妻有遗男，始龀，跳往助之。寒暑易节，始一反焉。河曲智叟笑而止之曰：'甚矣，汝之不惠！以残年余力，曾不能毁山之一毛，其如土石何？'北山愚公长息曰：'汝心之固，固不可彻，曾不若孀妻弱子。虽我之死，有子存焉。子又生孙，孙又生子；子又有子，子又有孙；子子孙孙无穷匮也，而山不加增，何苦而不平？'河曲智叟亡以应。",
    source: "《列子·汤问》",
    source_url: null,
    tags: ["寓言", "坚持", "毅力"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-danqin",
    title: "对牛弹琴",
    content: "公明仪为牛弹清角之操，伏食如故。非牛不闻，不合其耳也。转为蚊虻之声，孤犊之鸣，即掉尾奋耳，蹀躞而听。",
    source: "《牟子理惑论》",
    source_url: null,
    tags: ["寓言", "沟通", "智慧"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-jingwa",
    title: "井底之蛙",
    content: "坎井之蛙谓东海之鳖曰：'吾乐与！出跳梁乎井干之上，入休乎缺甃之崖。赴水则接腋持颐，蹶泥则没足灭跗。还虷、蟹与科斗，莫吾能若也。且夫擅一壑之水，而跨跱坎井之乐，此亦至矣。夫子奚不时时来入观乎？'东海之鳖左足未入，而右膝已絷矣。于是逡巡而却，告之曰：'夫千里之远，不足以举其大；千仞之高，不足以极其深。禹之时十年九潦，而水弗为加益；汤之时八年七旱，而崖不为加损。夫不为顷久推移，不以多少进退者，此亦东海之大乐也。'于是坎井之蛙闻之，适适然惊，规规然自失也。",
    source: "《庄子·秋水》",
    source_url: null,
    tags: ["寓言", "见识", "智慧"],
    grade_range: [4, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-hujia",
    title: "狐假虎威",
    content: "虎求百兽而食之，得狐。狐曰：'子无敢食我也！天帝使我长百兽，今子食我，是逆天帝命也。子以我为不信，吾为子先行，子随我后，观百兽之见我而敢不走乎？'虎以为然，故遂与之行。兽见之皆走。虎不知兽畏己而走也，以为畏狐也。",
    source: "《战国策·楚策》",
    source_url: null,
    tags: ["寓言", "智慧", "权谋"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-yaner",
    title: "掩耳盗铃",
    content: "范氏之亡也，百姓有得钟者，欲负而走，则钟大不可负。以椎毁之，钟况然有音。恐人闻之而夺己也，遽掩其耳。恶人闻之，可也；恶己自闻之，悖矣。",
    source: "《吕氏春秋·自知》",
    source_url: null,
    tags: ["寓言", "自欺", "智慧"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-lanyu",
    title: "滥竽充数",
    content: "齐宣王使人吹竽，必三百人。南郭处士请为王吹竽，宣王说之，廪食以数百人。宣王死，湣王立，好一一听之，处士逃。",
    source: "《韩非子·内储说上》",
    source_url: null,
    tags: ["寓言", "诚信", "能力"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "yuyan-maolu",
    title: "毛遂自荐",
    content: "秦之围邯郸，赵使平原君求救，合从于楚，约与食客门下有勇力文武备具者二十人偕。平原君曰：'使文能取胜，则善矣。文不能取胜，则歃血于华屋之下，必得定从而还。士不外索，取于食客门下足矣。'得十九人，余无可取者，无以满二十人。门下有毛遂者，前，自赞于平原君曰：'遂闻君将合从于楚，约与食客门下二十人偕，不外索。今少一人，愿君即以遂备员而行矣。'平原君曰：'先生处胜之门下几年于此矣？'毛遂曰：'三年于此矣。'平原君曰：'夫贤士之处世也，譬若锥之处囊中，其末立见。今先生处胜之门下三年于此矣，左右未有所称诵，胜未有所闻，是先生无所有也。先生不能，先生留。'毛遂曰：'臣乃今日请处囊中耳。使遂蚤得处囊中，乃颖脱而出，非特其末见而已。'平原君竟与毛遂偕。",
    source: "《史记·平原君虞卿列传》",
    source_url: null,
    tags: ["寓言", "历史", "自信", "勇气"],
    grade_range: [4, 6],
    ib_theme_code: "T5",
    text_type: "non-fiction",
  },
  // ---- 历史故事 (6) ----
  {
    topic_key: "lishi-sima",
    title: "司马光砸缸",
    content: "司马光七岁，凛然如成人。闻讲《左氏春秋》，爱之，退为家人讲，即了其大旨。自是手不释书，至不知饥渴寒暑。群儿戏于庭，一儿登瓮，足跌没水中，众皆弃去，光持石击瓮破之，水迸，儿得活。",
    source: "《宋史·司马光传》",
    source_url: null,
    tags: ["历史故事", "宋代", "智慧", "急智"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "non-fiction",
  },
  {
    topic_key: "lishi-wuxin",
    title: "卧薪尝胆",
    content: "吴既赦越，越王勾践反国，乃苦身焦思，置胆于坐，坐卧即仰胆，饮食亦尝胆也。曰：'女忘会稽之耻邪？'身自耕作，夫人自织，食不加肉，衣不重采，折节下贤人，厚遇宾客，振贫吊死，与百姓同其劳。",
    source: "《史记·越王勾践世家》",
    source_url: null,
    tags: ["历史故事", "春秋", "励志", "坚韧"],
    grade_range: [3, 6],
    ib_theme_code: "T2",
    text_type: "non-fiction",
  },
  {
    topic_key: "lishi-mengmu",
    title: "孟母三迁",
    content: "孟子幼时，其舍近墓，常嬉为墓间之事。其母曰：'此非所以处子也。'遂迁居市旁。孟子又嬉为贾人衒卖之事。母曰：'此亦非所以处子也。'复徙居学宫之旁。孟子乃嬉为设俎豆揖让进退之事。其母曰：'此可以处吾子矣。'遂居焉。及孟子长，学六艺，卒成大儒之名。",
    source: "《列女传·母仪》",
    source_url: null,
    tags: ["历史故事", "战国", "教育", "母爱"],
    grade_range: [3, 6],
    ib_theme_code: "T5",
    text_type: "non-fiction",
  },
  {
    topic_key: "lishi-zhengxiang",
    title: "郑人买履",
    content: "郑人有欲买履者，先自度其足，而置之其坐。至之市，而忘操之。已得履，乃曰：'吾忘持度。'反归取之。及反，市罢，遂不得履。人曰：'何不试之以足？'曰：'宁信度，无自信也。'",
    source: "《韩非子·外储说左上》",
    source_url: null,
    tags: ["历史故事", "寓言", "变通"],
    grade_range: [3, 6],
    ib_theme_code: "T1",
    text_type: "fiction",
  },
  {
    topic_key: "lishi-sangu",
    title: "三顾茅庐",
    content: "先帝不以臣卑鄙，猥自枉屈，三顾臣于草庐之中，咨臣以当世之事，由是感激，遂许先帝以驱驰。后值倾覆，受任于败军之际，奉命于危难之间，尔来二十有一年矣。",
    source: "《三国志·蜀书·诸葛亮传》",
    source_url: null,
    tags: ["历史故事", "三国", "诚心", "用人"],
    grade_range: [3, 6],
    ib_theme_code: "T2",
    text_type: "non-fiction",
  },
  {
    topic_key: "lishi-weijiu",
    title: "围魏救赵",
    content: "魏伐赵，赵急，请救于齐。齐威王欲将孙膑，膑辞谢曰：'刑余之人不可。'于是乃以田忌为将，而孙子为师，居辎车中，坐为计谋。田忌欲引兵之赵，孙子曰：'夫解杂乱纷纠者不控拳，救斗者不搏撠，批亢捣虚，形格势禁，则自为解耳。今梁赵相攻，轻兵锐卒必竭于外，老弱罢于内。君不若引兵疾走大梁，据其街路，冲其方虚，彼必释赵而自救。是我一举解赵之围而收弊于魏也。'田忌从之，魏果去邯郸，与齐战于桂陵，大破梁军。",
    source: "《史记·孙子吴起列传》",
    source_url: null,
    tags: ["历史故事", "战国", "兵法", "智慧"],
    grade_range: [4, 6],
    ib_theme_code: "T2",
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
