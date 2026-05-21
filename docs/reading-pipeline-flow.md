# 中英文文章生产加工流程

```mermaid
flowchart TB
    subgraph S1["阶段1: 内容来源"]
        A1["硬编码源文本<br/>(seed-reading-content.mjs)"]
        A2["经典语料库<br/>(classic-corpus.ts)"]
        A3["网络爬取<br/>(news-fetcher.ts / stealth-scraper.ts)"]
    end

    subgraph S2["阶段2: LLM 生成"]
        B1["buildEnglishPrompt() / buildChinesePrompt()"]
        B2["年级词数范围 (standards.ts)"]
        B3["年龄适宜性门 (grade<5)"]
        B4["连贯性门 (packOrder>1)"]
        B5["语言锁定 (强制单语言)"]
        B6["IB MYP 要求<br/>文体·批判性思维≥30%·修辞·经典引文"]
        B7["自检清单"]
        B8["OpenAI gpt-4o-mini<br/>temperature 0.7"]
        B9["repairJson() 修复"]
        B10["calculateObjectiveDifficulty()<br/>Flesch-Kincaid / 高频字覆盖率"]
        B11["返回 GeneratedArticle<br/>(含 questions, illustrations)"]

        B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7 --> B8 --> B9 --> B10 --> B11
    end

    subgraph S3["阶段3: 拼音转换 (仅中文)"]
        C1["convertToRubyPinyin()<br/>pinyin-pro 带词意识切分"]
        C2["我(wǒ)爱(ài)中(zhōng)国(guó)"]
        C1 --> C2
    end

    subgraph S4["阶段4: 质量门 (并行)"]
        D1["validateContent()<br/>字数·选项·题型·难度·拼音往返·引文"]
        D2["validateIBCriteria()<br/>文体·思维比例·文化关联/作者意图"]
        D3["validateFactualAccuracy()<br/>事实保真·膨胀比·关键事实"]
        D4{"全部通过?"}
        D5["→ published"]
        D6["→ draft (记录 quality_issues)"]

        D1 & D2 & D3 --> D4
        D4 -->|是| D5
        D4 -->|否| D6
    end

    subgraph S5["阶段5: 封面图片"]
        E1["cover-style-presets.ts<br/>10 个类别预设"]
        E2["MiniMax (日配额 50)"]
        E3{"成功?"}
        E4["Pollinations (指数退避重试)"]
        E5["上传 covers/{articleId}.webp"]

        E1 --> E2 --> E3
        E3 -->|是| E5
        E3 -->|否| E4 --> E5
    end

    subgraph S6["阶段6: 段落内插图"]
        F1["generateIllustrations()"]
        F2["Pollinations 逐个生成"]
        F3["上传 illustrations/{articleId}/{idx}.webp"]
        F4["单段失败跳过 (非阻断)"]

        F1 --> F2 --> F3
        F2 -.-> F4
    end

    subgraph S7["阶段7: 音频合成 (仅中文)"]
        G1["synthesizeChinese()"]
        G2["Azure TTS REST API<br/>zh-CN-XiaoxiaoNeural"]
        G3["SSML prosody rate -15%"]
        G4["上传 reading-audios 存储桶"]

        G1 --> G2 --> G3 --> G4
    end

    subgraph S8["阶段8: 数据库持久化"]
        H1["reading_articles"]
        H2["reading_questions"]
        H3["reading_article_illustrations"]
        H1 & H2 & H3
    end

    %% 主流程连接
    S1 --> S2
    S2 --> S4
    S2 -.->|仅中文| S3
    S3 --> S4
    S4 --> S5
    S5 --> S6
    S6 --> S8
    S6 -.->|仅中文| S7
    S7 --> S8
```

## 执行脚本

```mermaid
flowchart LR
    subgraph Scripts["执行入口"]
        T1["reading-content-pipeline.ts<br/>中英文主管道"]
        T2["seed-chinese-reading-content.ts<br/>中文专用 + 拼音"]
        T3["seed-reading-content.mjs<br/>英文旧版 (60个硬编码主题)"]
        T4["seed-topic-matrix-v2.ts<br/>种子 18 包 153 主题"]
        T5["regenerate-flagged-articles.ts<br/>重新生成不合格文章"]
        T6["synthesize-chinese-audio.ts<br/>批量 TTS"]
    end

    T1 & T2 & T3 -->|读取主题| Topics["reading_topics"]
    T1 -->|生成→质检→封面→插图→写入| DB[("Supabase<br/>(reading_articles etc)")]
    T5 -->|读取 drift 报告| DB
    T6 -->|TTS| DB
    T4 --> Topics
```

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/lib/reading/content-generator.ts` | LLM 提示构建 + OpenAI 调用 + JSON 修复 |
| `src/lib/reading/pinyin-converter.ts` | 逐字 ruby 拼音 |
| `src/lib/reading/quality-gate.ts` | 6 项客观质量检查 |
| `src/lib/reading/ib-criteria-gate.ts` | IB MYP 文体/思维/文化门 |
| `src/lib/reading/factual-gate.ts` | 来源文本保真度门 |
| `src/lib/reading/difficulty.ts` | Flesch-Kincaid / 高频字覆盖率 |
| `src/lib/reading/standards.ts` | 各年级字数/字符数规格 |
| `src/lib/reading/cover-generator.ts` | MiniMax → Pollinations 封面 |
| `src/lib/reading/illustration-generator.ts` | Pollinations 段落插图 |
| `src/lib/reading/cover-style-presets.ts` | 10 个类别图片提示词预设 |
| `src/lib/reading/tts-azure-client.ts` | Azure TTS 合成 |
| `src/lib/reading/storage-uploader.ts` | Supabase 存储上传 |
| `src/lib/reading/concurrency.ts` | Pacer(3) + withRetry 指数退避 |
| `src/lib/reading/json-recovery.ts` | JSON 修复回退策略 |
