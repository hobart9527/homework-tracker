## Design Context

### Users
- **家长**: 忙碌的父母，用 iPad 快速分配作业、查看孩子完成情况。需要清晰有序的仪表盘，一眼掌握全局。
- **孩子**: G4-G6 学龄儿童（10-12岁），打开 iPad 查看今天的任务并完成打卡。需要趣味化的正向激励，成长友好不幼稚。
- **使用场景**: iPad 为主（≥1024px 12列网格），家庭环境，碎片时间操作。

### Brand Personality
- **活泼 / 秩序 / 成长**: 有趣但不幼稚，有秩序感，传递成长性
- 情感目标: 温暖可靠 — 家长感到掌控有序，孩子感到被鼓励
- 目标年龄段: G4-G6（10-12岁），成长友好 (growth-friendly) 而非幼稚化
- 参考方向: ClassDojo（教育类、卡通友好、正向反馈）+ Notion（模块化清晰布局）

### Token System
- **5 Color Families**: forest（主色绿）、cream（背景米白）、coral（强调珊瑚）、honey（暖色蜂蜜）、ink（文字墨色）
- **3 Fonts**: Inter（Latin UI 系统字体）、LXGW WenKai 霞鹜文楷（中文正文/跟读高亮）、Fraunces（标题/品牌 accent）
- **Unified Tokens**: radius、shadow、spacing、motion — 全站统一 token，禁止 ad-hoc 值
- **Primary Palette**: forest green 主色，coral + honey 用于强调与暖色点缀，cream 背景

### Aesthetic Direction
- 视觉基调: 温暖柔和的自然色调，森林绿为主，珊瑚+蜂蜜色点缀
- 参考: ClassDojo 的友好卡通风格 + Notion 的模块化清晰布局
- 反参考: 冰冷的 LMS 管理系统、过于严肃的企业风格
- iPad 优先设计，大触控目标 (≥44pt)

### Layout Architecture
- **Parent Shell**: 侧导航 (side-nav) + 主内容区 (main-pane)，≥1024px 启用 12 列网格
- **Child Shell**: Hero 区域 + 每日任务网格 (daily-task grid) + 底部导航 (bottom nav)
- **Reader Shell**: 3 栏布局（封面栏 / 文章栏 / 工具侧栏），独立 `(reader)` 路由组，与主应用布局解耦

### Reader Mode
- 独立 `(reader)` 路由组，不与 Parent/Child Shell 共享布局
- 3 种主题切换: light / sepia / dark
- 设置面板: 主题、字体大小可调
- 滚动进度追踪 + 阅读位置记忆（跨会话恢复）
- 中文字符级跟读高亮 (character-level read-along highlighting)
- 完成印章动画 (completion stamp animation)

### Design Principles
1. **温暖亲近**: 色彩、圆角、微交互传递亲切感，像一位耐心的家教。forest + cream + coral 色调体系支撑。
2. **秩序清晰**: 信息层级分明，家长一眼找到核心数据。12 列网格 + side-nav 仪表盘布局支撑。
3. **正向激励**: 孩子端充满鼓励 — 动画、积分、成就反馈、印章动画。honey 暖色点缀 + motion token 支撑。
4. **触控优先**: 为 iPad 拇指操作优化，大按钮、大卡片、清楚的可点击区域 (≥44pt)。统一 spacing/radius token 支撑。
5. **渐进展示**: 家长端先看概览再下钻详情，孩子端只看今天的核心任务。Hero → Grid → Detail 渐进信息架构支撑。
