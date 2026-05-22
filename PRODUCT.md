# Product

## Register

product

## Users

**主要用户 (Primary) — G4-G7 国际学校孩子 (9-13岁)**

双语环境成长，每天在 iPad 上查看作业、完成打卡。从 G4 的具象思维过渡到 G7 的抽象推理：低年级需要清晰引导和即时反馈，高年级需要自主感和效率。英文阅读能力通常高于中文。对被当成"小孩"敏感——讨厌幼稚的设计，但也不喜欢冷冰冰的工具。

场景：放学回家后在沙发上打开 iPad，花 5-10 分钟查看今天的作业、完成打卡、看看积分进度。可能在嘈杂的家庭环境中使用。

**次要用户 (Secondary) — 国际学校家长**

中产家庭，重视教育但忙碌。在 iPad 横屏或电脑上管理作业、查看月度报告、配置平台同步。需要快速操作和清晰的数据呈现。对教育科技产品有接触（IXL, Khan Academy, EPIC）。

场景：晚上快速分配明天的作业，查看本周孩子完成情况，处理平台同步提醒。

## Product Purpose

一个面向国际学校家庭的 iPad 作业管理工具。家长分配作业追踪进度；孩子用清晰好玩的界面完成每日打卡。核心不是"监控"——是帮孩子建立自主管理习惯，让家长从重复性催促中解放出来。

## Brand Personality

**活泼但不幼稚，鼓励但不哄骗。**

3 词描述：Curious / Playful / Steady

像一个在硅谷长大的酷老师——用 emoji 不如用恰到好处的插画，用奖励不如用成长感。G7 孩子不会觉得被当成小孩，G4 孩子不会觉得无聊。

## Anti-references

- **拒绝卡通化**: 不使用拟人化动物吉祥物、弹跳 emoji、扁平大色块儿童插画（如 ABCmouse 风格）。G6-G7 孩子会觉得被 insulted
- **拒绝 Dashboard 味**: 不堆砌数据指标（日均学习分钟、完成率百分比），孩子端不该像 CRM
- **拒绝 SaaS 奶油味**: 不用 gradient text、glass cards、hero metrics、identical card grids
- **拒绝暗色 System UI**: 不做深色侧边栏 + 数据表格的"管理员系统"感，家长端也要温暖

## Design Principles

1. **成长中的尊严 (Growing Dignity)**: 设计要承认这个年龄段的孩子正在"成为大人"。不给指令，给选择。不替他们做，让他们自己做。UI 语言从中性专业出发，用细节加温度。

2. **即时满足，延迟奖励 (Quick Win, Long Arc)**: 每日打卡即时反馈（动画、音效、视觉确认），但激励系统指向长期——积分积累、阅读等级提升、本周趋势。Duolingo 式的"今天打卡了吗"而不是"你落后了"。

3. **触控优先，但不说教 (Touch-First, Not Touch-Only)**: iPad 横屏是主场景，拇指热区、≥44pt 触控目标。但家长在电脑上操作时不该有被 mobile 化对待的感觉。

4. **空间胜过步骤 (Space Over Steps)**: 用空间布局（tab、panel、sheet）而不是多步骤向导。G4-G7 孩子习惯在屏幕上"漫游"发现内容，不应该被 wizard 流限制。

5. **双语自然 (Bilingual by Nature)**: 中英文不是切换语言包——是同一项作业的两种表述。UI 文案同时出现中英文时，用字体层级区分，不堆砌。

## Accessibility & Inclusion

- WCAG 2.1 AA 目标覆盖
- 触控目标 ≥44pt，关键操作 ≥48pt
- 支持 `prefers-reduced-motion`，验收动画均有降级版本
- 阅读器 3 种主题 (light/sepia/dark)，字体大小可调节
- 关注色觉障碍：不使用红绿单独传达成败信息
- 字体包含中文+Latin，阅读正文使用 LXGW WenKai（舒适度优先）
