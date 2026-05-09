# Homework Tracker Design System v2 — "Two Modes One System"

Design system specification for the comprehensive visual redesign.
Created: 2026-05-08
Status: Draft — pending Stage 1 Wave 1.0 kickoff

---

## 1. Design Principles

1. **角色差异化**：家长端信息密度优先、动效收敛；孩子端温暖鼓励、动效适度；阅读器沉浸纸感、质感优先。
2. **iPad 优先**：触控目标 ≥ 44pt，大间距区域避免误触，布局利用横屏侧边空间。
3. **成长感**：色彩体系随完成度升温（米白 → 暖绿 → 蜂蜜金 → 珊瑚暖红），不靠卡通化。
4. **材质真实感**：纸感表面、有温度阴影、微光晕而非扁平无重量。
5. **系统化拒绝**：无 ad-hoc 的颜色、圆角、阴影。所有视觉决定经过 token。

---

## 2. Color System

### 2.1 Primary — Forest (扩充至 950)

| Token | Hex | Usage |
|---|---|---|
| forest-50 | `#F4F9F5` | 页面背景替代 (parent) |
| forest-100 | `#E5F0E8` | 卡片 hover / 表格斑马行 |
| forest-200 | `#CADFD0` | 分隔线 / disabled 边框 |
| forest-300 | `#A8C7B0` | 次要装饰元素 |
| forest-400 | `#7FA88A` | 暗绿次主色 |
| forest-500 | `#56AB91` | **主色** (保持现有) — CTA、active 态 |
| forest-600 | `#3D8B76` | hover 态 |
| forest-700 | `#2D6B5A` | 强调文字 |
| forest-800 | `#1F4D3F` | 深色背景文字 |
| forest-900 | `#143328` | 深色模式 surface / 深色 header |
| forest-950 | `#0A1B14` | 纯暗模式页面背景 |

**迁移说明**：现有 `forest-50` (#F8FFF8) → 改为 forest-50 (#F4F9F5)，旧值归入 `cream-50`。

### 2.2 Secondary — Cream (纸感家族，新增)

| Token | Hex | Usage |
|---|---|---|
| cream-50 | `#FDFCF8` | 孩子端页面背景 |
| cream-100 | `#FAF6EC` | 孩子端卡片背景 |
| cream-200 | `#F1E8D2` | 阅读器 sepia 主题 / 重点卡片底色 |
| cream-300 | `#E5D4AB` | 阅读器 sepia 文字高亮底色 |
| cream-400 | `#D2BB85` | 装饰线 / 标签次要 |
| cream-500 | `#B8A067` | 强调文字 |

### 2.3 Accent — Coral (替代现有 accent #FF6B6B)

现有 accent 偏医疗警示感。改用偏暖珊瑚，传递"激励/温暖/完成"。

| Token | Hex | Usage |
|---|---|---|
| coral-50 | `#FFF4F0` | 弱背景 / 标签底色 |
| coral-100 | `#FFE5DA` | 卡片 tint |
| coral-200 | `#FFC9B3` | hover 态 |
| coral-300 | `#FFA688` | 进度条填充 |
| coral-400 | `#FF8259` | 中等强调 |
| coral-500 | `#F26033` | **主强调** — 逾期、取消、强 CTAs |
| coral-600 | `#D54A1F` | hover |
| coral-700 | `#A53814` | 深色强调 |

### 2.4 Achievement — Honey (新增，专属正向反馈)

| Token | Hex | Usage |
|---|---|---|
| honey-50 | `#FFFAEB` | 完成态卡片底色 |
| honey-100 | `#FFF1C7` | 激励标签 |
| honey-200 | `#FFE08A` | hover 态 |
| honey-300 | `#FFCC4D` | 进度条 (高亮) |
| honey-400 | `#F5B41A` | **完成色** — 徽章、盖章、积分 |
| honey-500 | `#D69200` | hover 态 |

### 2.5 Neutral — Ink (统一替换散落 slate/gray/stone)

| Token | Hex | Usage |
|---|---|---|
| ink-50 | `#F8F9FA` | 极浅背景 |
| ink-100 | `#F1F3F4` | 表格 hover |
| ink-200 | `#E8EAED` | 边框 / divider |
| ink-300 | `#DADCE0` | 次级边框 |
| ink-400 | `#9AA0A6` | placeholder / disabled |
| ink-500 | `#80868B` | 次要文字 |
| ink-600 | `#5F6368` | 正文浅灰 |
| ink-700 | `#3C4043` | 正文 (浅色 bg) |
| ink-800 | `#202124` | 深色文字 |
| ink-900 | `#171717` | 纯黑替代 |

### 2.6 Semantic (保持映射)

| Semantic | Map | Usage |
|---|---|---|
| success | emerald-500 | 完成、通过 |
| warning | amber-500 | 逾期、待注意 |
| danger | rose-500 | 删除、严重错误 |
| info | sky-500 | 提示、信息 |

### 2.7 Reader Theme Palette (3 themes)

| Theme | page bg | surface bg | text | text-muted | accent |
|---|---|---|---|---|---|
| light (白) | white | white | ink-800 | ink-500 | forest-500 |
| sepia (纸) | cream-200 | cream-100 | ink-800 | ink-600 | forest-600 |
| dark (夜间) | forest-950 | forest-900 | cream-50 | ink-400 | cream-200 |

---

## 3. Surface System

每种 skin 下定义 5 种 surface，使用统一的 elevation + ring 规则。

### 3.1 Parent Skin (dense, ordered)

| Surface | bg | ring | shadow | radius | Usage |
|---|---|---|---|---|---|
| page | forest-50 | none | none | none | 全页背景 |
| raised | white | ink-200 | none | md | 简单行/列表行 |
| elevated | white | ink-200 | floating | lg | 独立卡片 |
| hero | white/forest-50 gradient | none | none | xl | 顶部概览区域 |
| overlay | ink-900/40 (backdrop-blur) | none | none | none | modal 遮罩 |

### 3.2 Child Skin (warm, spacious)

| Surface | bg | ring | shadow | radius | Usage |
|---|---|---|---|---|---|
| page | cream-50 | none | none | none | 全页背景 |
| raised | white | cream-200/40 | none | lg | 信息列表行 |
| elevated | white | cream-200/60 | floating | xl | 卡片 / 日历 |
| hero | cream-100 → coral-50 gradient | none | floating | 2xl | 顶部 hero |
| overlay | ink-900/35 (backdrop-blur) | none | none | none | modal 遮罩 |

### 3.3 Reader Skin (paper, immersive)

| Surface | bg | ring | shadow | radius | Usage |
|---|---|---|---|---|---|
| page | theme.page | none | none | none | 页面背景 |
| reader-bg | theme.surface | parchment-shadow | none | lg | 正文区域 |
| elevated | theme.surface | none | floating | lg | 侧边工具面板 |
| hero | none | none | none | none | 阅读器无 hero |
| overlay | ink-900/40 | none | none | none | 遮罩 |

**Parchment shadow**: `0 1px 0 rgba(0,0,0,0.04) inset, 0 -1px 0 rgba(0,0,0,0.04) inset, 0 0 32px rgba(0,0,0,0.06)` — 边缘柔和发光感。

---

## 4. Elevation & Shadow

4 个统一层级，替代现有的 `shadow-sm` / `shadow-md` / `shadow-lg` 随意使用。

| Name | Value | Usage |
|---|---|---|
| flat | none | 列表行、page |
| raised | `0 1px 2px rgba(10,27,20,0.04)` | 简单按钮、tooltip |
| floating | `0 8px 24px rgba(10,27,20,0.08), 0 0 0 1px rgba(232,234,237,0.5)` | 卡片、浮动面板 |
| modal | `0 24px 48px rgba(10,27,20,0.12)` | dialog、drawer |

**Ring 规则**：不在 shadow 里拼 border。卡片用 `ring-1` 或 `ring-0`，叠在 shadow 上层。

---

## 5. Border Radius

5 个标准层级。抹掉 `rounded-card` `rounded-[32px]` 等散落写法。

| Token | Value | Usage |
|---|---|---|
| sm | 8px | 小标签、芯片、统计数值块 |
| md | 12px | 按钮、表格行、紧凑列表 |
| lg | 18px | 中等卡片、form 元素 |
| xl | 24px | 大卡片、日历面板 |
| 2xl | 32px | hero 区域、首屏大模块、阅读器正文 |

**圆角使用优先级原则**：
- 页面最大容器 → sm（0 或 8）
- 单卡片 → lg
- 卡片堆叠组 → 外层 xl，内层 lg
- hero / 沉浸式 → 2xl

---

## 6. Typography

### 6.1 Font Families

| Role | Font Stack | Weight | Usage |
|---|---|---|---|
| ui | `'Inter', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui` | 400/500/600/700 | 所有 UI 文字 |
| display | `'Inter Tight', 'Source Han Sans SC', sans-serif` | 600/700/800 | 页面标题、hero 标题、大数字 |
| reading-zh | `'LXGW WenKai', 'PingFang SC', serif` | 400 | 阅读器中文正文 |
| reading-en | `'Fraunces', 'Inter', serif` | 400/500 | 阅读器英文正文 |

**LXGW WenKai**（霞鹜文楷）：开源中文阅读字体，可免费 CDN 或本地加载，适合 G4-6 青少年阅读，有字形舒展感。
**Fraunces**：Google Fonts 上的柔性衬线，与 LXGW 搭配不突兀。

### 6.2 Type Scale — UI

| Token | Size | Line-Height | Letter-Spacing | Usage |
|---|---|---|---|---|
| text-xs | 12px | 16px | 0.01em | 标签、元数据、芯片 |
| text-sm | 14px | 20px | 0.005em | 次要文字、辅助信息 |
| text-base | 16px | 24px | 0 | 正文 (parent) |
| text-lg | 18px | 28px | -0.005em | 略大正文、按钮文字 |
| text-xl | 20px | 30px | -0.01em | 卡片标题 |
| text-2xl | 24px | 32px | -0.015em | 模块标题 |
| text-3xl | 30px | 38px | -0.02em | 页面标题 (child) |
| text-4xl | 36px | 44px | -0.025em | hero 大标题 |
| text-5xl | 48px | 56px | -0.03em | 欢迎页 / 成就页大数字 |

### 6.3 Type Scale — Reading (reader-only)

独立于 UI scale，按需调节。

| Token | Size | Line-Height | Usage |
|---|---|---|---|
| reader-xs | 16px | 30px | 最小字号 |
| reader-sm | 18px | 34px | 小字号 |
| reader-md | 20px | 38px | **默认 (G4-6)** |
| reader-lg | 22px | 42px | 大字号 |
| reader-xl | 24px | 46px | 最大字号 |

**行距调节**：紧凑 1.5 / 适中 1.8 (default) / 宽松 2.2。reader scale 的 line-height 已按 `1.8-1.9` 默认值。

---

## 7. Spacing System

保持 Tailwind 默认，但增加语义化命名（在 spacing token 里定义）：

| Token | Value | Usage |
|---|---|---|
| space-1 | 4px | 极小间距 |
| space-2 | 8px | 紧凑间距 |
| space-3 | 12px | 组件内部标准 |
| space-4 | 16px | 卡片内边距标准 (child) |
| space-5 | 20px | 组件间 |
| space-6 | 24px | 模块间标准 |
| space-8 | 32px | section 间 |
| space-10 | 40px | 大模块间 |
| space-12 | 48px | 页面 padding (mobile) |
| space-16 | 64px | 页面 padding (tablet) |
| space-20 | 80px | hero 内边距 |

---

## 8. Motion System

### 8.1 Tokens

| Name | Value | Usage |
|---|---|---|
| duration-fast | 150ms | hover、颜色切换 |
| duration-med | 220ms | 卡片切换、tab 切换 |
| duration-slow | 360ms | 页面过渡、stamp 动效 |
| duration-ritual | 600ms | 翻页仪式、完成庆祝 |

| Name | Value |
|---|---|
| easing-out | `cubic-bezier(.16, 1, .3, 1)` |
| easing-in-out | `cubic-bezier(.65, 0, .35, 1)` |
| easing-bounce | `cubic-bezier(.34, 1.56, .64, 1)` |

### 8.2 Named Presets

| Preset | Properties | Duration | Easing |
|---|---|---|---|
| hover-lift | transform: translateY(-2px) + shadow: floating | fast | out |
| card-active | transform: scale(0.98) | fast | out |
| tab-switch | transform: translateX + opacity | med | in-out |
| stamp-reveal | transform: scale(0.5→1) rotate(-12→0) + opacity | slow | bounce |
| page-turn | transform: perspective rotateY | ritual | in-out |
| confetti | particles translateY + rotate + opacity | 1200ms | out |
| progress-fill | width transition | fast | out |
| shimmer | background-position translate | 2000ms | linear |

**`prefers-reduced-motion: reduce`** 必须覆盖所有动画，退化为 `opacity` 或完全取消。

---

## 9. Component Token API

新原语层。每个原语接受 `skin: 'parent' | 'child' | 'reader'` prop，自动渲染对应 surface 组合。

### 9.1 PageShell

```
skin: parent | child | reader
children: ReactNode
showNav: boolean (child/reader default true, reader default false)
```

- parent: `bg-forest-50`, 顶部 sticky header，max-w-6xl → max-w-7xl
- child: `bg-cream-50`, 底部 fixed nav, `pb-20`
- reader: `bg-{theme}.page`, 无 top/bottom nav，full-bleed

### 9.2 PageHeader

```
skin: parent | child
title: string
subtitle?: string
actions?: ReactNode
kicker?: string
```

- parent: 极简，kicker 用 ink-500 小字 + tracking-wide
- child: hero gradient bg (cream-100 → coral-50)，大标题 text-4xl，可含表情装饰

### 9.3 SectionCard

```
skin: parent | child
level: raised | elevated | hero
padding: sm | md | lg
children: ReactNode
```

- 负责渲染正确的 surface + elevation + radius + padding
- parent level=raised → 白色卡片，ring-ink-200，shadow-none，radius-md
- child level=elevated → 白色卡片，ring-cream-200/60，shadow-floating，radius-xl
- hero level → gradient + shadow-floating + radius-2xl

### 9.4 MetricBlock

```
skin: parent | child
label: string
value: string | number
trend?: 'up' | 'down' | 'flat'
color?: 'default' | 'success' | 'warning' | 'danger'
```

- parent: compact (px-4 py-3, text-sm label + text-xl value), 行式
- child: spacious (px-6 py-4, text-sm label + text-2xl value), 方形

### 9.5 Button (tokenized)

```
variant: primary | secondary | accent | ghost | outline
size: sm | md | lg
skin: parent | child
```

- primary → forest-500 bg, white text, hover forest-600
- accent → coral-500 bg, white text, hover coral-600 (reserved for destructive / urgent)
- ghost → bg-transparent, ink-600 text, hover bg-ink-100
- outline → border ink-300, ink-700 text, hover bg-ink-50

### 9.6 TokenizedCard (replaces Card.tsx)

```
skin: parent | child
level: raised | elevated
interactive?: boolean
className?: string
children: ReactNode
```

---

## 10. Migration Notes

### 10.1 Color 旧 → 新映射

| 旧用法 | 旧值 | 新 Token |
|---|---|---|
| `bg-background` / `#F8FFF8` | #F8FFF8 | `forest-50` (parent) or `cream-50` (child) |
| `bg-primary` | #56AB91 | `forest-500` |
| `bg-primary-light` | #A8E6CF | `forest-200` |
| `bg-primary-dark` | #3D8B76 | `forest-600` |
| `text-forest-800` | #1F4D3F | `forest-800` |
| `text-forest-700` | #2D6B5A | `forest-700` |
| `text-forest-600` | #3D8B76 | `forest-600` |
| `text-forest-500` | #56AB91 | `forest-500` |
| `text-forest-400` | #88D8B0 | 替换为 `ink-400` 或 `forest-300` |
| `text-forest-300` | #A8E6CF | `forest-300` |
| `text-accent` / `#FF6B6B` | #FF6B6B | `coral-500` |
| `bg-rose-50` | #FFF1F2 | `coral-50` (表情上更暖) |
| `bg-amber-50` | #FFFBEB | `honey-50` |
| `text-slate-400` / `text-gray-200` | 各种 | `ink-400` / `ink-200` |
| `border-forest-100` | #E8FFF0 | `ink-200` (中性边框统一) |

### 10.2 Shadow 旧 → 新映射

| 旧值 | 新 Token |
|---|---|
| `shadow-sm` | `elevation-raised` |
| `shadow-md` | `elevation-floating` |
| `shadow-lg` | `elevation-modal` |
| `shadow-[...自定义]` | 按语义归到 elevation-* |

### 10.3 Ring 旧 → 新映射

| 旧值 | 新 Token |
|---|---|
| `ring-1 ring-forest-100` | `ring-1 ring-ink-200` (parent) or `ring-1 ring-cream-200` (child) |
| `ring-1 ring-amber-200` | 保留语义化，不再写死颜色 |

### 10.4 需抹掉的散落写法

| 写法 | 应改为 |
|---|---|
| `rounded-[32px]` | `rounded-2xl` |
| `rounded-card` | `rounded-xl` |
| `bg-[#F6FBF8]` | `bg-forest-50` |
| `bg-gradient-to-br from-[#F6FBF8] via-[#FDFCF8] to-[#F4F8FF]` | `bg-cream-50` (简化，不加渐变) |

---

## 11. Reading Mode Special Tokens

### 11.1 Theme CSS Variables (动态切换)

```css
:root[data-reader-theme="light"] {
  --reader-bg: white;
  --reader-surface: white;
  --reader-text: #202124;
  --reader-text-muted: #80868B;
  --reader-accent: #56AB91;
  --reader-border: #E8EAED;
}
:root[data-reader-theme="sepia"] {
  --reader-bg: #F1E8D2;
  --reader-surface: #FAF6EC;
  --reader-text: #202124;
  --reader-text-muted: #5F6368;
  --reader-accent: #3D8B76;
  --reader-border: #E5D4AB;
}
:root[data-reader-theme="dark"] {
  --reader-bg: #0A1B14;
  --reader-surface: #143328;
  --reader-text: #FDFCF8;
  --reader-text-muted: #9AA0A6;
  --reader-accent: #A8E6CF;
  --reader-border: #1F4D3F;
}
```

### 11.2 Reader Line Height (user-pref)

| Setting | multiplier | Tailwind class |
|---|---|---|
| compact | 1.5 | `leading-relaxed` |
| normal | 1.85 | `leading-loose` |
| spacious | 2.3 | custom `leading-9` |

### 11.3 Reader Font Size (user-pref)

CSS custom properties 控制：
- `--reader-font-size: 16px | 18px | 20px | 22px | 24px`
- `--reader-line-height: 1.5 | 1.85 | 2.3`
- 文章正文容器：`font-size: var(--reader-font-size); line-height: calc(var(--reader-font-size) * var(--reader-line-height))`

持久化：`localStorage` key `reader-settings-v2`:
```json
{
  "fontSize": "md",
  "lineHeight": "normal",
  "theme": "sepia",
  "lastPositions": { "articleId": "scrollTop|paragraphId" }
}
```
