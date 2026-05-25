# 作业平台绑定重构计划

## 背景
现有作业系统的二级目录→平台绑定和匹配逻辑是硬编码的，无法灵活扩展。
用户确认方向：A+C 组合方案，兴趣类不扩展平台，中文预留但不启用。

## Frozen Contracts

### Schema

#### 新表 1: `homework_type_bindings`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| type_id | string NOT NULL UNIQUE | 内置 id 如 "english_reading" 或 custom UUID |
| is_builtin | boolean DEFAULT true | |
| group_id | string NOT NULL | 一级分组 id |
| allowed_platforms | text[] | 可绑定平台白名单，空数组=不允许绑定 |
| match_keywords | text[] | 自动匹配关键词 |
| sort_order | int DEFAULT 0 | |
| created_at | timestamptz DEFAULT now() | |

#### 新表 2: `platform_subject_mappings`
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid PK | |
| platform | string NOT NULL | "ixl", "khan-academy", etc. |
| platform_subject | string NOT NULL | 平台原始科目名 |
| type_id | string NOT NULL | 映射到的 homework type |
| is_builtin | boolean DEFAULT true | |
| confidence | float DEFAULT 1.0 | 映射可信度 |
| created_at | timestamptz DEFAULT now() | |
| UNIQUE(platform, platform_subject, type_id) | | |

### 现有 Contract 不变
- `homeworks.platform_binding_platform` / `platform_binding_source_ref` 不变
- `learning_events` 表结构不变
- `check_ins` 表结构不变
- `HomeworkFormState` 新增 `allowed_platforms` 读取字段（只读，不改变提交结构）

## Wave 划分

### Wave 0: Schema Migration + Seed
- Migration SQL 创建两表
- Seed script 初始化数据（见下方）
- 运行 migration + seed

### Wave 1: HomeworkForm 平台绑定重构
**write_scope**: `src/components/parent/HomeworkForm.tsx`
**read_scope**: `src/lib/homework-form.ts`, `src/lib/supabase/types.ts`
**changes**:
1. `relevantPlatforms` 从硬编码改为查询 `homework_type_bindings.allowed_platforms`
2. `autoMatchedPlatform` 只在 `allowed_platforms` 包含时生效
3. 兴趣类（group_interest）隐藏平台绑定 UI
4. 中文类 allowed_platforms 为空时显示"预留"提示
5. DEFAULT_TYPES 添加 interest_dance、interest_drums

### Wave 2: 匹配逻辑重构
**write_scope**: `src/lib/learning-sync.ts`, `src/lib/learning-event-auto-checkins.ts`
**read_scope**: `src/lib/platform-adapters/*`
**changes**:
1. `matchesPlatformHomeworkType` 拆分为三阶段：
   - L1: `platform_subject_mappings` 精确映射（方案 C）
   - L2: `homework_type_bindings.match_keywords` 关键词匹配（方案 A）
   - L3: 原有 fallback 逻辑
2. 新增 `matchesTypePlatformBinding`：event platform 必须在 homework type 的 `allowed_platforms` 中
3. `syncLearningEventAutoCheckins` 加载 `homework_type_bindings` 做 platform 过滤

### Wave 3: 类型定义 + API 适配
**write_scope**: `src/lib/supabase/types.ts`（类型扩展）, `src/app/api/homework-types/route.ts`（新 API）
**read_scope**: `src/components/parent/HomeworkForm.tsx`
**changes**:
1. 新增 API `/api/homework-types`：返回类型 + 绑定配置 + 平台白名单
2. HomeworkForm 使用该 API 替代部分硬编码
3. 更新 `src/lib/supabase/types.ts` 类型定义

## Seed 数据

### homework_type_bindings
| type_id | group_id | allowed_platforms | match_keywords | sort_order |
|---------|----------|-------------------|----------------|------------|
| english_reading | group_english | {raz-kids,epic,khan-academy} | {reading,read,phonics,book,story} | 0 |
| english_course | group_english | {khan-academy,ixl} | {course,lesson,grammar,vocabulary,ela} | 1 |
| english_practice | group_english | {ixl,khan-academy} | {practice,exercise,worksheet,quiz,spelling} | 2 |
| english_custom | group_english | {} | {english,英文} | 3 |
| chinese_reading | group_chinese | {} | {阅读,read,朗读,中文,故事} | 0 |
| chinese_course | group_chinese | {} | {课程,course,lesson,grammar,写作} | 1 |
| chinese_practice | group_chinese | {} | {练习,practice,exercise,worksheet,生字} | 2 |
| chinese_custom | group_chinese | {} | {中文,Chinese} | 3 |
| math_practice | group_math | {ixl,khan-academy} | {math,mathematics,数学,algebra,geometry,arithmetic} | 0 |
| math_course | group_math | {khan-academy,ixl} | {math,mathematics,数学,course,lesson} | 1 |
| math_custom | group_math | {} | {math,数学} | 2 |
| interest_piano | group_interest | {} | {piano,钢琴,keyboard} | 0 |
| interest_vocal | group_interest | {} | {vocal,singing,声乐,唱歌} | 1 |
| interest_ea | group_interest | {} | {drama,theatre,theater,ea,表演} | 2 |
| interest_dance | group_interest | {} | {dance,dancing,舞蹈,ballet} | 3 |
| interest_drums | group_interest | {} | {drum,drumming,架子鼓,percussion} | 4 |
| interest_custom | group_interest | {} | {interest,兴趣} | 5 |

### platform_subject_mappings
| platform | platform_subject | type_id | confidence |
|----------|-----------------|---------|------------|
| ixl | Math | math_practice | 0.9 |
| ixl | Math | math_course | 0.8 |
| ixl | Language Arts | english_practice | 0.9 |
| ixl | Language Arts | english_course | 0.8 |
| khan-academy | math | math_practice | 0.95 |
| khan-academy | math | math_course | 0.9 |
| khan-academy | humanities | chinese_reading | 0.5 |
| raz-kids | reading | english_reading | 0.95 |
| epic | reading | english_reading | 0.9 |

## 回滚
- `DROP TABLE IF EXISTS homework_type_bindings, platform_subject_mappings;`
- 恢复 HomeworkForm.tsx 到 git HEAD
- 恢复 learning-sync.ts 到 git HEAD

## 验证
1. 创建英文阅读作业 → 平台下拉显示 Raz-Kids / Epic / Khan Academy
2. 创建数学练习作业 → 平台下拉显示 IXL / Khan Academy
3. 创建钢琴作业 → 无平台绑定选项
4. 创建中文阅读作业 → 显示"平台绑定预留中"
5. 同步 IXL Math 记录 → 自动匹配到 math_practice 作业
6. 同步 Raz-Kids 记录 → 自动匹配到 english_reading 作业
