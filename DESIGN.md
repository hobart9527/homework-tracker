---
name: 作业小管家 Homework Tracker
description: 国际学校家庭作业管理 — 成长手账式的每日学习伴侣
colors:
  forest-green: "#56AB91"
  forest-green-deep: "#3D8B76"
  forest-green-dark: "#2D6B5A"
  forest-green-subtle: "#F4F9F5"
  forest-green-surface: "#E5F0E8"
  coral-warm: "#F26033"
  coral-warm-deep: "#D54A1F"
  coral-warm-subtle: "#FFF4F0"
  honey-gold: "#F5B41A"
  honey-gold-subtle: "#FFFAEB"
  cream-paper: "#FDFCF8"
  cream-warm: "#FAF6EC"
  ink-primary: "#202124"
  ink-secondary: "#5F6368"
  ink-muted: "#80868B"
  ink-border: "#DADCE0"
  ink-subtle: "#F8F9FA"
  surface-white: "#FFFFFF"
typography:
  display:
    fontFamily: "'Inter Tight', 'Source Han Sans SC', sans-serif"
    fontWeight: 600
  headline:
    fontFamily: "'Inter', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontWeight: 700
    fontSize: "1.875rem"
    lineHeight: 2.25
  title:
    fontFamily: "'Inter', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontWeight: 600
    fontSize: "1.25rem"
    lineHeight: 1.75rem
  body:
    fontFamily: "'Inter', 'LXGW WenKai', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', 'Source Han Sans SC', 'PingFang SC', system-ui, sans-serif"
    fontWeight: 500
    fontSize: "0.875rem"
    lineHeight: 1.25rem
    letterSpacing: "0.005em"
  reading-zh:
    fontFamily: "'LXGW WenKai', 'PingFang SC', serif"
    fontWeight: 400
    fontSize: "1.25rem"
    lineHeight: 2.375
  reading-en:
    fontFamily: "'Fraunces', 'Inter', serif"
    fontWeight: 400
    fontSize: "1.25rem"
    lineHeight: 2.375
rounded:
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
  2xl: "32px"
  card: "28px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
  16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.forest-green}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.forest-green-deep}"
  button-secondary:
    backgroundColor: "{colors.forest-green-surface}"
    textColor: "{colors.forest-green-dark}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-accent:
    backgroundColor: "{colors.coral-warm}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-accent-hover:
    backgroundColor: "{colors.coral-warm-deep}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  nav-sidebar:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    height: "44px"
  nav-sidebar-active:
    backgroundColor: "{colors.forest-green-subtle}"
    textColor: "{colors.forest-green-dark}"
  nav-bottom-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    height: "64px"
  nav-bottom-tab-active:
    textColor: "{colors.forest-green}"
---

# Design System: 作业小管家 Homework Tracker

## 1. Overview

**Creative North Star: "The Growing Notebook — 成长手账"**

作业小管家的视觉系统是一本陪伴孩子成长的学习手账。不是学校里的练习册，而是一个孩子在书桌前自然打开、每天写下一笔的本子——温暖但有结构，活泼但不吵闹。它记录的不是"完成率"而是"今天做了什么"。

氛围策略：自然光下的书桌。上午或下午的家庭时段，iPad 放在桌上或沙发上，环境光充足但不刺眼。色彩从森林、蜂蜜、珊瑚这些自然物中提取，不是从色轮上推导的——所以绿色偏暖、黄色偏沉、红色带橙。

系统明确拒绝：卡通化（ABCmouse 的动物吉祥物）、SaaS dashboard 味（hero metrics、数据至上的冰冷感）、暗色管理系统（黑侧边栏+数据表格）。也拒绝过于随意的"手机 app"感——这是 iPad 上的专注工具，不是杀时间的 feed 流。

**Key Characteristics:**
- 纸张质感并不来自纹理图片，来自 cream-50 的暖底和微妙的阴影层次
- 色彩不是均匀撒在整个界面上的——forest green 提权给导航和主操作，coral 留给强调，honey 只给奖励时刻
- 圆角收紧（8-12px），用锐度换取年龄跨越能力——G7 孩子不觉得被敷衍
- 阅读器是一个独立的视觉世界：3 种主题、专用字体、沉浸式全屏——"手账"里藏着一本书

## 2. Colors

当前是 Committed 色彩策略——forest green 承载 30-40% 的功能表面，coral 和 honey 作为点缀不超过 15%。PRODUCT.md 要求向 Full palette 演进（更丰富的饱和度层次和辅助色角色），但当前调色板已经是扎实的起点。

### Primary — Forest Green
- **Forest Green** (#56AB91): 主操作按钮、激活态导航、主品牌色。出现在侧边栏活跃项、底部 tab 选中态、primary button 背景。
- **Forest Green Deep** (#3D8B76): hover 态。按钮悬停、链接悬停。
- **Forest Green Dark** (#2D6B5A): 主色文字、不需要按钮时的强调色文本。
- **Forest Green Subtle** (#F4F9F5): 活跃项背景、选中行背景。大面积使用时几乎像白色但带着一点点绿。
- **Forest Green Surface** (#E5F0E8): secondary button 背景、信息面板底色。

### Secondary — Coral Warm
- **Coral Warm** (#F26033): accent button 背景、删除/破坏性操作的警告色、需要吸引注意的强调元素。使用节制，每屏不超过 2 处。
- **Coral Warm Deep** (#D54A1F): accent button hover 态。
- **Coral Warm Subtle** (#FFF4F0): 错误/警告背景、destructive action hover 区。

### Tertiary — Honey Gold
- **Honey Gold** (#F5B41A): 成就徽章、积分展示、完成动画（星星粒子）、打卡成功反馈。这是"奖励时刻"专用色，不应出现在常规 UI 中。
- **Honey Gold Subtle** (#FFFAEB): 成就卡片背景、徽章底色。

### Neutral — Ink + Cream
- **Ink Primary** (#202124): 正文、标题、主要文字。不是纯黑，微暖。
- **Ink Secondary** (#5F6368): 标签、元数据、辅助信息。
- **Ink Muted** (#80868B): 占位符文字、禁用态、非活跃导航图标。
- **Ink Border** (#DADCE0): 分割线、卡片边框、输入框边框。
- **Ink Subtle** (#F8F9FA): 悬停背景、骨架屏。
- **Cream Paper** (#FDFCF8): 孩子端页面背景。比纯白暖一个色温，像笔记本内页。
- **Cream Warm** (#FAF6EC): 更暖的背景、ceram section 底色。
- **Surface White** (#FFFFFF): 导航栏、卡片、弹窗——所有"浮在页面上"的元素。

**The Reward-Only Rule.** Honey gold 不出现在导航、表单、常规按钮中。它是积分、徽章、打卡成功。"只在孩子做对了什么的时候出现"，稀缺性是激励本身。

**The One-Green Rule.** Forest green 是唯一的"系统功能色"。不用蓝色做链接、不用绿色做成功状态——forest green 同时承担主色+成功色，coral 承担强调+危险。这个约束让色彩词汇控制在 3 个语义角色内，避免配色过载。

## 3. Typography

**Display Font:** Inter Tight (with Source Han Sans SC fallback for Chinese)
**Body Font:** Inter (with LXGW WenKai / Source Han Sans SC / PingFang SC fallbacks)
**Reading Font (ZH):** LXGW WenKai 霞鹜文楷 (with PingFang SC fallback)
**Reading Font (EN):** Fraunces (with Inter fallback)

**Character:** Inter 作为主力 UI 字体提供了干净的中英文混排基础。Inter Tight 用于品牌标题，稍紧的字间距在侧边栏和页面标题中看起来更"成年"。中文阅读正文切换为 LXGW WenKai——像手写体的温暖衬线让长文阅读更舒适，也呼应"手账"隐喻。英文阅读正文用 Fraunces——有性格的衬线让英文段落有杂志感。

### Hierarchy
- **Display** (600, 1.875rem-3rem, 1.2-1.3): 页面标题、阅读器文章标题、登录页品牌名。font-ui-display。
- **Headline** (700, 1.875rem, 2.25): 页面主标题。只有每个页面的 h1 使用。
- **Title** (600, 1.25rem, 1.75): Section 标题、卡片标题、对话框标题。
- **Body** (400, 1rem, 1.5): 正文。标签文字、段落、列表。中英文混排。
- **Label** (500, 0.875rem, 1.25, 0.005em): 导航项、按钮文字、表单标签、元数据。微字间距防止中文笔画粘连。
- **Reading ZH** (400, 1.25rem, 2.375): 中文阅读正文。大字面、松行高，LXGW WenKai 字体。`reader-md`。
- **Reading EN** (400, 1.25rem, 2.375): 英文阅读正文。Fraunces 衬线，`reader-md`。

**The Reading Separation Rule.** 阅读器正文字体不与 UI 共享。读者进入文章时，字体从 Inter 切换到 LXGW WenKai / Fraunces——这个切换本身就是"现在进入阅读模式"的信号。UI 组件永远不使用阅读字体。

**The Single Sans Rule.** 产品 UI 中，Inter 是唯一的 sans 字体。Inter Tight 只用于品牌标题（Display 级别），Fraunces 只用于英文阅读。拒绝在 UI 中引入第三个 sans 家族。

## 4. Elevation

轻浮混合策略（Light Hybrid）。日常布局用色调区分层级——cream 页面底、white 导航栏和卡片、forest-green-subtle 选中项——完全不需要阴影。阴影只在元素真正"浮起"时出现：hover lift、下拉菜单、弹窗、阅读器翻页。

### Shadow Vocabulary
- **elevation-raised** (`0 1px 2px rgba(10,27,20,0.04)`): 按钮默认态、卡片默认态。极微弱的阴影，几乎不可见但提供了"这可以按"的触感线索。
- **elevation-floating** (`0 8px 24px rgba(10,27,20,0.08), 0 0 0 1px rgba(232,234,237,0.5)`): 下拉菜单、popover、hover-lift 动画终点。1px 的 border-like shadow 保证了在浅色背景上的可见边界。
- **elevation-modal** (`0 24px 48px rgba(10,27,20,0.12)`): 弹窗、抽屉。大幅偏移+大模糊=强烈的"我在最上面"信号。
- **parchment** (`0 1px 0 rgba(0,0,0,0.04) inset, 0 -1px 0 rgba(0,0,0,0.04) inset, 0 0 32px rgba(0,0,0,0.06)`): 阅读器卡片专用。内阴影模拟纸张厚度，外阴影模拟书本翻开。
- **reader-glow** (`0 0 20px rgba(86, 171, 145, 0.15)`): 阅读器聚焦元素。
- **reader-float** (`0 8px 32px rgba(10, 27, 20, 0.12), 0 0 0 1px rgba(232, 234, 237, 0.3)`): 翻页卡片、阅读器浮层。

**The Grounded-By-Default Rule.** 静止状态下，元素靠色调区分层级。阴影只用于两种场景：交互反馈（hover/focus/active）和有意浮层（menu/modal/reader-card）。"阴影=正在发生什么"。

## 5. Components

### Buttons

**Character:** 清晰利落。圆角 12px（radius-md），不追求 pill 形状。激活时 scale(0.98)，hover 时用颜色变化+lift 阴影。不依赖阴影表达可点击性——颜色权重就够了。

- **Shape:** radius-md (12px), 最小触控目标 44px 高。
- **Primary:** bg-forest-500, white text, shadow-elevation-raised. Hover: bg-forest-600 + translateY(-2px) shadow-elevation-floating. Active: scale(0.98).
- **Secondary:** bg-forest-100, text-forest-700. Hover: bg-forest-200. No shadow.
- **Accent:** bg-coral-500, white text. 用于需要强力注意的操作（删除确认、重要行动）。每屏最多 1 个 accent button。
- **Ghost:** transparent, text-ink-600. Hover: bg-ink-100. 用于表格行操作、工具栏图标按钮。
- **Outline:** transparent, border-ink-300, text-ink-700. Hover: bg-ink-50. 用于次要 CTA、取消操作。
- **Sizes:** sm (px-4 py-2, text-sm), md (px-5 py-3, text-base), lg (px-6 py-3, text-lg).

### Navigation

**Parent Shell (Sidebar):**
- Desktop (>= 1024px): 固定左侧 240px, bg-white, 右侧 border-ink-300 分割。导航项 44px 高（radius-md），active: bg-forest-50 + text-forest-700，inactive: text-ink-600。
- Mobile (< 1024px): 固定顶部，底部水平导航条。同样 active/inactive 规则。

**Child Shell (Bottom Nav):**
- 固定底部, bg-white, border-t-ink-300. 64px 高 + safe-area-pb。4 个 tab，图标+标签。Active: text-forest-500, inactive: text-ink-400.
- 底部导航始终可见（showNav 控制）。

### Cards

- **Corner Style:** radius-card (28px). 大圆角但不超过 pill 感——恰好。
- **Background:** bg-white，hover 时 shadow-elevation-floating。
- **Internal Padding:** p-4 (16px) 标准 / p-6 (24px) 宽松。
- **Border:** border-ink-300，1px。
- 阅读器卡片独立：parchment shadow + reader-card 样式。

### Inputs

- **Style:** bg-cream-50, border-2, radius-lg (18px) for standalone / radius-md (12px) for inline.
- **Focus:** border-color → forest-500, no ring shadow (avoid browser default ring).
- **Error:** border-red-500, error text below.
- **Passcode Input:** 4 个独立格子，56×56px，border-2，radius-xl。Filled: border-primary, Empty: border-forest-200, Error: border-red-500.
- **Height:** 40-56px，保证 ≥44pt 触控目标。

### Chips / Badges

- **Achievement Badge (ReadingTitleBadge):** px-4 py-2, rounded-full. bg-gradient-to-r from-honey-100 to-coral-100, border-honey-200. 用于阅读称号展示。
- **Status Pills:** 小圆角标签，用于分类和状态标识。

### Reading Shell

阅读器使用独立设计语言，与主应用视觉解耦：
- 3 种主题 (light/sepia/dark)，通过 CSS 变量切换
- 页面卷曲翻页动画 (600ms, cubic-bezier(.65, 0, .35, 1))
- 完成印章动画 (360ms, cubic-bezier(.34, 1.56, .64, 1))——这是一个例外，bounce easing 在这里是合理的，因为印章"盖下去"的物理感需要 overshoot
- 设置面板从底部滑出，遮罩 bg-ink-900/50

## 6. Do's and Don'ts

### Do:
- **Do** 使用 forest green 作为唯一的系统功能色（导航+操作+成功状态），保持 ≤40% 屏幕面积
- **Do** 保留 honey gold 只用于奖励时刻——积分、成就、打卡完成的动画。不舍得用 honey = honey 贬值
- **Do** 使用色调层级（cream 底 → white 卡 → forest-subtle 选中）区分层级，阴影只用于浮层和交互反馈
- **Do** 圆角控制在 8-12px 范围（导航、按钮、输入框），阅读器卡片可以用 18-32px
- **Do** 阅读器正文使用 LXGW WenKai / Fraunces，UI 只用 Inter。字体切换本身就是"进入阅读模式"的信号
- **Do** 所有可交互元素提供 hover + focus-visible + active 三态，触控目标 ≥44pt
- **Do** 动画使用 cubic-bezier(.16, 1, .3, 1) 作为默认缓动，阅读器翻页用 cubic-bezier(.65, 0, .35, 1)，只有印章动画可以用 bounce easing

### Don't:
- **Don't** 使用拟人化动物吉祥物、弹跳 emoji、扁平大色块儿童插画（ABCmouse 风格）——G6-G7 孩子会觉得被侮辱
- **Don't** 在孩子端堆砌数据指标（日均学习分钟、完成率百分比），这是手账不是 CRM dashboard
- **Don't** 使用 gradient text（background-clip: text）、glass cards、hero metrics 模板、identical card grids——SaaS cliché 禁止
- **Don't** 做暗色侧边栏+数据表格的"管理员系统"——家长端也要温暖，家长也是这个家庭的成员不是 admin operator
- **Don't** 使用 border-left/right > 1px 作为彩色装饰条纹
- **Don't** 在 UI 组件中混用阅读字体（LXGW WenKai / Fraunces）——字体角色严格分离
- **Don't** 用红绿单独传达成败信息——色觉障碍友好：红色始终配图标/文字，绿色始终配图标/文字
- **Don't** 使用纯黑 (#000) 或纯白 (#FFF)——所有中性色向 forest green 的色相微暖
