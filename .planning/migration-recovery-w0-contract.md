# Migration Recovery — W0 Contract

> Created: 2026-05-10
> Owner: orchestrator
> Trigger: schema-drift-investigation.md 确认 10 个 migrations 在远端缺失
> Status: W0 frozen pending user-side prerequisites
> Successor: W1 (repair) / W2 (push) / W3 (regen + adapt) / W4 (smoke)

---

## 1. Scope Freeze

### In Scope — 本次 D 路径覆盖的缺失 migrations（按 push 顺序）

1. `007_check_in_scoring_fields.sql`
2. `008_unify_photo_proof_type.sql`
3. `009_homework_reminders.sql`
4. `010_add_point_deduction.sql`
5. `010_homework_reminders_rls.sql`
6. `015_add_notification_deliveries.sql`
7. `018_add_homework_auto_matches.sql`
8. `019_add_learning_event_reviews.sql`
9. `020_add_homework_platform_bindings.sql`
10. `021_add_platform_account_managed_sessions.sql`
11. `023_add_platform_login_credentials.sql`
12. `027_add_wechat_groups_and_targets.sql` （**部分缺失**：`wechat_group_targets` 子项尚未创建；`wechat_groups` 已存在）

### 路径边界

- **不动 reading 栈**：030-040 已 applied 完整，本路径完全 hands-off。
- **不动已 applied 的迁移**：011 / 012 / 013 / 014 / 023a / 024 / 026 / 028 / 029。

### W1-W4 一并要做的（In Scope）

- migration push（W2）
- supabase types regen（W3）
- 修复 9 个出问题的源文件（write_scope 在 §6 候选，最终 W3 派发时 freeze）
- smoke 验证 9 个功能点：
  1. 积分扣分（point_deduction）
  2. check-in scoring（awarded_points / is_scored / is_late / proof_type）
  3. 迟交追踪（is_late）
  4. 平台绑定（homework_platform_bindings）
  5. reminder 推送（homework_reminders + RLS）
  6. auto-match（homework_auto_matches）
  7. learning event reviews（learning_event_reviews）
  8. 平台登录凭据（platform_login_credentials）
  9. 托管会话（platform_account_managed_sessions）

### Out of Scope（W0 不做，留为 W3+ follow-up）

- 给 `required_checkpoint_type` / `repeat_type` / `platform_accounts.status` 加 CHECK constraint（mig 041+ 单独提交）
- 删除 `.env.example` 里现已不需要的 var（清理任务）
- PITR 升级（如果项目当前是 free 计划）

---

## 2. Push Order Decision

按以下顺序执行 `supabase db push` 应该安全。依赖关系与 idempotency 标注如下：

| Step | Migration | Idempotent? | Depends on | Notes |
|------|-----------|-------------|------------|-------|
| 1 | 007_check_in_scoring_fields | YES (ADD COLUMN IF NOT EXISTS) | 001 (check_ins exists) | adds 4 columns + backfill |
| 2 | 008_unify_photo_proof_type | NO destructive but YES guarded | 007 | normalizes `'screenshot'` → `'photo'` |
| 3 | 009_homework_reminders | YES | 001 (homeworks/parents/children) | new table |
| 4 | 010_add_point_deduction | YES | 001 (homeworks) | one column |
| 5 | 010_homework_reminders_rls | RLS policies idempotent? — **TODO**：W2 dry-run 前 read 文件确认；CREATE POLICY 可能 fail-on-replay | 009 | RLS only |
| 6 | 015_add_notification_deliveries | YES (CREATE TABLE IF NOT EXISTS) | 001 + maybe voice_push | new table |
| 7 | 018_add_homework_auto_matches | YES | 001 | new table |
| 8 | 019_add_learning_event_reviews | YES | 012 (learning_events) | new table |
| 9 | 020_add_homework_platform_bindings | YES | 001 + 012 | adds 2 columns + new table |
| 10 | 021_add_platform_account_managed_sessions | YES | 012 (platform_accounts) | new table |
| 11 | 023_add_platform_login_credentials | YES (ADD COLUMN IF NOT EXISTS) | 012 | 2 columns |
| 12 | 027_add_wechat_groups_and_targets (子项) | depends on 027 partial state | 001 | targets 子表 |

### 重点说明

- **027 部分 applied**（`wechat_groups` 存在）。需要在 W2 dry-run 阶段确认现有迁移文件能否 idempotent 重跑；若不能，需要单独写 `041_create_wechat_group_targets.sql` 只补缺的子表。**TODO for W2**：跑 `supabase db push --dry-run` 看 CLI 怎么处理。
- **duplicate prefix 010 / 023 不冲突**：lexical 顺序 = 业务正确顺序，无需重命名。

---

## 3. Rollback Plan

### 单 migration 回滚

- 用 down migration（手写）。每个 missing migration 在 W2 派发前应附 rollback SQL 草稿。
- 关键回滚提示：
  - `007`：DROP COLUMN awarded_points, is_scored, is_late, proof_type CASCADE
  - `008`：UPDATE check_ins SET proof_type='screenshot' WHERE proof_type='photo' （仅当回滚必要）
  - `009` / `015` / `018` / `019` / `020` / `021`：DROP TABLE IF EXISTS（注意 FK / RLS 依赖）
  - `010_add_point_deduction`：DROP COLUMN point_deduction
  - `010_homework_reminders_rls`：DROP POLICY ...
  - `023_add_platform_login_credentials`：DROP COLUMN
  - `027 子项`：DROP TABLE wechat_group_targets

### 全栈回滚

- 从 W0 step 4（User-Side Prerequisites）的 PITR / dump 还原。

### 阶段性回滚（仅 W2 失败后）

- 如果某条 migration push 失败：用 `supabase migration repair --status reverted <id>` 标记，然后修复 SQL 后重跑。
- 如果 push 成功但 W3 regen 暴露新错：先 regen 再决定是否 revert SQL。

### 禁止动作

- **不要做 `supabase db reset`**（会清空所有数据）。

---

## 4. User-Side Prerequisites（执行 W1 之前必须完成）

| Item | Status | How to obtain |
|------|--------|---------------|
| `SUPABASE_ACCESS_TOKEN` in `.env.local` | ❌ MISSING | https://supabase.com/dashboard/account/tokens → Generate new token → 加到 `.env.local` 一行 `SUPABASE_ACCESS_TOKEN=<token>` |
| 远端 PITR backup confirmed | ❌ NOT VERIFIED | dashboard → Database → Backups → 看是否有 today/recent；free 计划没有 PITR，需要手动 `supabase db dump --file backup-YYYYMMDD.sql` |
| `DATABASE_URL`（可选，便于 psql 验证）| ❌ NOT SET | dashboard → Database → Connection string → URI；加到 `.env.local` |
| duplicate prefix 决策签字 | ✅ FROZEN（lexical OK，无需重命名）| this contract |
| push 顺序签字 | ✅ FROZEN（见 §2）| this contract |

---

## 5. Acceptance Criteria for Each Subsequent Wave

### W1 (repair)

- 跑 `supabase migration list`；输出已记录但未应用的 migrations。
- 对每个这样的 ID 跑 `supabase migration repair --status reverted`。
- 不做 push。
- 产出 `.planning/migration-recovery-w1-report.md`。

### W2 (push)

- 先跑 `supabase db push --dry-run`；人工 review SQL；orchestrator 派发后 adhd-agent 执行 `supabase db push`。
- 跑 `supabase migration list`；12 个目标 migration 都显示 ✓ applied。
- 不修改任何源代码。
- 产出 `.planning/migration-recovery-w2-report.md`。

### W3 (regen + adapt)

- `npm run supabase:generate-types`。
- 必须看到 `types.ts` diff 包含：
  - `check_ins.proof_type` / `awarded_points` / `is_scored` / `is_late`
  - `homeworks.point_deduction` / `platform_binding_*`
  - 7 张新表：`homework_reminders`、`notification_deliveries`、`homework_auto_matches`、`learning_event_reviews`、`homework_platform_bindings`（如果作为表）、`platform_account_managed_sessions`、`wechat_group_targets`
- 跑 `npx tsc --noEmit`；预期 29 errors → 0（或仅余 literal narrowing 那几条 P1）。
- 派发 fix Wave 修剩余文件（write_scope 列举见 §6）。
- 跑 `npx vitest run`；469/469 pass。
- 跑 `npm run build`；exit 0。

### W4 (smoke)

- 启动 dev server，9 个功能点逐项 manual smoke：
  1. 积分扣分
  2. check-in scoring
  3. 迟交追踪
  4. 平台绑定
  5. reminder 推送
  6. auto-match
  7. learning event reviews
  8. 平台登录凭据
  9. 托管会话
- 把结果写进 `.planning/migration-recovery-w4-smoke.md`。

---

## 6. Fix Wave Re-scoping（W3 内嵌的 sub-Wave 预声明）

write_scope 候选（具体在 W3 派发时 freeze）：

- `src/lib/supabase/types.ts` （regen 自动）
- `src/lib/tasks/check-in-submission.ts`
- `src/lib/tasks/daily-task.ts`
- `src/lib/tasks/point-deduction.ts`
- `src/lib/learning-event-auto-checkins.ts`
- `src/lib/parent-dashboard.ts`
- `src/lib/auto-checkins.ts`
- `src/lib/homework-form.ts`
- `src/components/parent/HomeworkForm.tsx`
- `src/components/parent/ParentChildTaskList.tsx`
- `src/components/child/ChildHomeworkCard.tsx`
- `src/components/child/CheckInModal.tsx`
- `src/app/(child)/rewards/page.tsx`
- `src/app/(parent)/homework/page.tsx`
- `src/app/(parent)/settings/system/page.tsx`

预计修改类型：

- 恢复字面联合 narrowing assertions
- 添加 null guards
- 修复 status enum 收紧
- 类型 import 路径同步

---

## 7. Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|-----------|
| M1 | duplicate prefix 010/023 引发 supabase CLI 困惑 | low | 已确认 lexical 顺序 OK；W2 dry-run 时 sanity check |
| M2 | 027 部分 applied 状态 | medium | W2 dry-run；需要时拆出 `041_create_wechat_group_targets.sql` |
| M3 | mig 008 数据 normalize（`screenshot`→`photo`）影响生产 | medium | 备份必做；mig 是 UPDATE 不是 DELETE，可逆 |
| M4 | mig 010_rls `CREATE POLICY` 在 replay 时报错 | low | dry-run 检查；必要时 wrap `DO $$ BEGIN ... EXCEPTION ... END $$` |
| M5 | regen 后 types 仍缺 CHECK 约束的字面联合 | medium | 单独写 mig 041 加 CHECK；不卡 W3 |
| M6 | 9 个修复后的功能曾长期不可用，可能积压脏数据 | medium | W4 smoke 时排查；必要时单独清理 |
| M7 | 没 PITR 时备份失败导致不可逆 | high | W1 之前用 `supabase db dump --file` 手工备份 |
| M8 | `SUPABASE_ACCESS_TOKEN` 泄露 | medium | 永远不写进 commit / log / wiki；只放 `.env.local` |

---

## 8. Decision Log（本 contract 内已锁定的决策）

- **2026-05-10** 选 D 路径（apply missing migrations）而非 A（revert）或 B（rewrite code） — 理由见 `schema-drift-investigation.md` §Recommendation。
- **2026-05-10** duplicate prefix 010 / 023 lexical 顺序保持，无需重命名。
- **2026-05-10** 027 部分缺失留待 W2 dry-run 决定是否拆 `041_create_wechat_group_targets.sql`。
- **2026-05-10** CHECK constraint 补齐留为 follow-up（mig 041+），不阻塞 W3。
- **2026-05-10** W0 在缺 `SUPABASE_ACCESS_TOKEN` 状态下完成 contract，W1+ 阻塞等用户提供 token。
- **2026-05-10** 不动 reading 栈（030-040），不动已 applied 的 011/012/013/014/023a/024/026/028/029。
- **2026-05-10** push 顺序 = 上表 §2 step 1→12，frozen。

---

## 9. Blockers / Pending User Action

1. 提供 `SUPABASE_ACCESS_TOKEN`（写到 `.env.local` 一行：`SUPABASE_ACCESS_TOKEN=<token>`）。
2. 确认 PITR 状态或手动 `supabase db dump --file backup-YYYYMMDD.sql`。
3. 提供 `DATABASE_URL`（可选，便于 psql 直连验证）。
4. 在新 session 重新进入此 contract → orchestrator 派发 W1。
