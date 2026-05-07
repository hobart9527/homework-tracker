# Integrations Page Child-First Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `/settings/integrations` to child-first architecture: tab bar selects child, all sections scoped to that child, WeChat group CRUD included.

**Architecture:** Single-file refactor of `page.tsx`. Replace `hasChildContext` dual-mode branching with explicit `selectedChildId` state + tab bar. Add WeChat group CRUD section (ported from `/settings/channels`). No new files, no API changes.

**Tech Stack:** Next.js App Router, React `useState`/`useEffect`, Supabase client-side SDK, Tailwind CSS

---

### Task 1: Replace `selectedChildIdFromQuery`/`hasChildContext` with `selectedChildId` state

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx:42-81`

**Goal:** Add `selectedChildId` state initialized from query param. Remove `hasChildContext`. Add import for `useRouter`.

- [ ] **Step 1: Add `useRouter` import**

Change line 4:
```typescript
import { useSearchParams } from "next/navigation";
```
To:
```typescript
import { useRouter, useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Replace `hasChildContext` with `selectedChildId` state**

Replace lines 42-43 and 81:
```typescript
  const selectedChildIdFromQuery = searchParams.get("childId");
  // ... (lines 44-80) ...
  const hasChildContext = Boolean(selectedChildIdFromQuery);
```

With:
```typescript
  const router = useRouter();
  const selectedChildIdFromQuery = searchParams.get("childId");

  const [selectedChildId, setSelectedChildId] = useState<string>("");
  // ... (lines 44-80 unchanged) ...
```

- [ ] **Step 3: Initialize `selectedChildId` after children load**

Replace the `useEffect` at lines 168-179:

Old:
```typescript
  useEffect(() => {
    if (!selectedChildIdFromQuery || !children.length) {
      return;
    }

    if (!children.some((child) => child.id === selectedChildIdFromQuery)) {
      return;
    }

    setBindingForm((prev) => ({ ...prev, childId: selectedChildIdFromQuery }));
    setRoutingForm((prev) => ({ ...prev, childId: selectedChildIdFromQuery }));
  }, [children, selectedChildIdFromQuery]);
```

New:
```typescript
  useEffect(() => {
    if (!children.length) return;

    const validFromQuery =
      selectedChildIdFromQuery &&
      children.some((c) => c.id === selectedChildIdFromQuery)
        ? selectedChildIdFromQuery
        : null;

    const nextId = validFromQuery || children[0].id;

    setSelectedChildId((prev) => {
      if (prev && children.some((c) => c.id === prev)) return prev;
      return nextId;
    });
  }, [children, selectedChildIdFromQuery]);
```

- [ ] **Step 4: Sync `bindingForm.childId` from `selectedChildId`**

Replace the above useEffect with a simpler one. Add after the init effect:
```typescript
  useEffect(() => {
    if (selectedChildId) {
      setBindingForm((prev) => ({ ...prev, childId: selectedChildId }));
    }
  }, [selectedChildId]);
```

- [ ] **Step 5: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "refactor: replace hasChildContext with selectedChildId state"
```

---

### Task 2: Add child tab bar

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx` (JSX section, after loading guard)

**Goal:** Add a tab bar at the top of the main content that shows all children and highlights the selected one.

- [ ] **Step 1: Add tab bar JSX before the first Card**

Insert after the loading guard return (line 193, before the `return` of main content), at the top of the main content (after `<SettingsShell ...>` opening, before `<Card id="platform-binding">`):

```tsx
      <SettingsShell
        title="孩子集成"
        description="这里管理孩子自己的学习平台账号和默认消息路由，不处理家庭级通知通道。"
        backHref={hasChildContext ? "/children" : "/settings"}
      >
        {/* Child tab bar */}
        {children.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist">
            {children.map((child) => (
              <button
                key={child.id}
                role="tab"
                aria-selected={selectedChildId === child.id}
                onClick={() => {
                  setSelectedChildId(child.id);
                  setBindingForm((prev) => ({
                    ...prev,
                    childId: child.id,
                    username: "",
                    externalAccountRef: "",
                    loginPassword: "",
                    managedSessionPayloadText: "",
                    managedSessionCapturedAt: "",
                  }));
                  setBindingError(null);
                  setManualSessionGuide(null);
                  router.replace(`/settings/integrations?childId=${child.id}`, { scroll: false });
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  selectedChildId === child.id
                    ? "bg-primary text-white"
                    : "bg-forest-50 text-forest-600 hover:bg-forest-100"
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>
        )}

        {!selectedChildId && (
          <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-center text-sm text-forest-500">
            请选择一个孩子开始配置
          </div>
        )}
```

Also update `backHref` to not depend on `hasChildContext`:
```
        backHref="/settings"
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "feat: add child tab bar to integrations page"
```

---

### Task 3: Simplify binding form — remove `hasChildContext` branching

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx:542-569`

**Goal:** Remove the `hasChildContext ? readonly : dropdown` branching for the child selector. `selectedChildId` is always set by the tab bar.

- [ ] **Step 1: Replace child selector block**

Replace lines 542-569:

Old:
```tsx
            {hasChildContext ? (
              <div className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3">
                <p className="text-sm font-medium text-forest-700">
                  孩子：{children.find((c) => c.id === bindingForm.childId)?.name ?? "未选择"}
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="platform-child-id" className="mb-1 block text-sm font-medium text-forest-700">
                  孩子
                </label>
                <select
                  id="platform-child-id"
                  value={bindingForm.childId}
                  onChange={(e) =>
                    setBindingForm((prev) => ({ ...prev, childId: e.target.value }))
                  }
                  className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 focus:border-primary focus:outline-none"
                >
                  <option value="">请选择孩子</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
```

New (always show the readonly child display):
```tsx
            <div className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3">
              <p className="text-sm font-medium text-forest-700">
                孩子：{children.find((c) => c.id === selectedChildId)?.name ?? "未选择"}
              </p>
            </div>
```

- [ ] **Step 2: Scope the binding form Card to `selectedChildId`**

Wrap the entire `Card id="platform-binding"` content in a condition. Add after `<Card ...>` opening tag:

```tsx
        {selectedChildId && (
          <Card id="platform-binding" className="scroll-mt-4">
```

And close before the next Card. Also scope the account cards filter: already uses `hasChildContext` — change to always filter by `selectedChildId`.

Replace line 726-727:
```tsx
              const filteredAccounts = hasChildContext
                ? platformAccounts.filter((a) => a.child_id === selectedChildIdFromQuery)
                : platformAccounts;
```

With:
```tsx
              const filteredAccounts = platformAccounts.filter((a) => a.child_id === selectedChildId);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "refactor: simplify binding form with tab-selected childId"
```

---

### Task 4: Restructure default WeChat group to per-child view

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx` (lines 1057-1133)

**Goal:** Show default WeChat group selector for `selectedChildId` only, not iterate all children.

- [ ] **Step 1: Replace the "孩子默认提交群" Card content**

Replace lines 1057-1133 (the entire Card "孩子默认提交群"):

Old approach: iterates `filteredChildren` and shows one row per child.
New approach: single row for `selectedChildId`.

Replace the card's inner content (lines 1057-1133) with:

```tsx
      {selectedChildId && (
        <Card id="default-group" className="scroll-mt-4">
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-forest-700">默认微信群</h2>
              <p className="mt-1 text-sm text-forest-500">
                孩子提交作业的默认目标微信群；作业级覆盖在作业编辑时确定。
              </p>
            </div>

            {(() => {
              const child = children.find((c) => c.id === selectedChildId);
              if (!child) return null;
              return (
                <div className="rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex-1">
                      <label
                        htmlFor="default-group-select"
                        className="mb-1 block text-sm font-medium text-forest-700"
                      >
                        {child.name} 默认群
                      </label>
                      <select
                        id="default-group-select"
                        value={childGroupSelections[child.id] ?? ""}
                        onChange={(e) =>
                          setChildGroupSelections((prev) => ({
                            ...prev,
                            [child.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border-2 border-forest-200 bg-white px-4 py-2 focus:border-primary focus:outline-none"
                      >
                        <option value="">暂不设置默认群</option>
                        {wechatGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.display_name || group.recipient_ref}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      size="sm"
                      disabled={savingChildGroupId === child.id}
                      onClick={async () => {
                        setSavingChildGroupId(child.id);
                        try {
                          await supabase
                            .from("children")
                            .update({
                              default_wechat_group_id:
                                childGroupSelections[child.id] || null,
                            })
                            .eq("id", child.id);
                          if (parentId) {
                            await refreshData(parentId);
                          }
                        } finally {
                          setSavingChildGroupId(null);
                        }
                      }}
                    >
                      {savingChildGroupId === child.id ? "保存中..." : "保存"}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </Card>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "refactor: scope default WeChat group to selected child"
```

---

### Task 5: Add WeChat group management CRUD

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx` (new Card, after default group)

**Goal:** Add a new Card with WeChat group list + add/edit/delete, ported from `/settings/channels`.

- [ ] **Step 1: Add WeChat group management state**

Add after line 95 (`const [savingChildGroupId, setSavingChildGroupId] = useState<string | null>(null);`):

```typescript
  const [showGroupAddForm, setShowGroupAddForm] = useState(false);
  const [groupAddForm, setGroupAddForm] = useState({ recipientRef: "", displayName: "" });
  const [groupAddLoading, setGroupAddLoading] = useState(false);
  const [groupAddError, setGroupAddError] = useState<string | null>(null);
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupEditName, setGroupEditName] = useState("");
  const [groupEditLoading, setGroupEditLoading] = useState(false);
```

- [ ] **Step 2: Add WeChat group CRUD handlers**

Add after the `statusLabel` function (line 489):

```typescript
  const handleGroupAdd = async () => {
    setGroupAddError(null);
    if (!groupAddForm.recipientRef.trim()) {
      setGroupAddError("请输入微信群标识。");
      return;
    }
    setGroupAddLoading(true);
    try {
      const { error } = await supabase.from("wechat_groups").insert({
        parent_id: parentId,
        recipient_ref: groupAddForm.recipientRef.trim(),
        display_name: groupAddForm.displayName.trim() || null,
        source: "manual",
      });
      if (error) {
        if (error.message.includes("duplicate")) {
          setGroupAddError("这个群标识已经存在了。");
        } else {
          setGroupAddError(error.message);
        }
        return;
      }
      setGroupAddForm({ recipientRef: "", displayName: "" });
      setShowGroupAddForm(false);
      if (parentId) await refreshData(parentId);
    } finally {
      setGroupAddLoading(false);
    }
  };

  const handleGroupEdit = async (groupId: string) => {
    setGroupEditLoading(true);
    try {
      const { error } = await supabase
        .from("wechat_groups")
        .update({ display_name: groupEditName.trim() || null })
        .eq("id", groupId);
      if (!error) {
        setGroupEditingId(null);
        if (parentId) await refreshData(parentId);
      }
    } finally {
      setGroupEditLoading(false);
    }
  };

  const handleGroupDelete = async (groupId: string) => {
    if (!confirm("确定要删除这个微信群吗？相关的消息路由也会失效。")) return;
    await supabase.from("wechat_groups").delete().eq("id", groupId);
    if (parentId) await refreshData(parentId);
  };
```

- [ ] **Step 3: Add WeChat group management Card JSX**

Insert after the default WeChat group Card closing tag (`</Card>` from Task 4) and before the routing rules section:

```tsx
      {selectedChildId && (
        <Card id="wechat-groups" className="scroll-mt-4">
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-forest-700">微信群管理</h2>
              <p className="mt-1 text-sm text-forest-500">
                管理你的目标微信群，系统自动发现活跃群，也可以手动添加。
              </p>
            </div>

            <div className="space-y-2">
              {wechatGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-forest-200 bg-forest-50 px-4 py-5 text-sm text-forest-500">
                  还没有微信群。点击下方「手动添加微信群」输入企业微信 chatid 即可添加。
                </div>
              ) : (
                wechatGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-xl border border-forest-100 bg-forest-50/70 px-4 py-3"
                  >
                    {groupEditingId === group.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={groupEditName}
                          onChange={(e) => setGroupEditName(e.target.value)}
                          placeholder="群显示名称"
                          className="flex-1 rounded-lg border border-forest-200 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          disabled={groupEditLoading}
                          onClick={() => handleGroupEdit(group.id)}
                        >
                          {groupEditLoading ? "保存中..." : "保存"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setGroupEditingId(null)}
                        >
                          取消
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm">
                          <p className="font-medium text-forest-700">
                            {group.display_name || "未命名群"}
                          </p>
                          <p className="mt-0.5 text-xs text-forest-500">
                            {group.source === "manual" ? "手动添加" : "自动发现"}
                            {group.last_seen_at ? " · 最近已连接" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setGroupEditingId(group.id);
                              setGroupEditName(group.display_name || "");
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500"
                            onClick={() => handleGroupDelete(group.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {showGroupAddForm ? (
              <div className="rounded-xl border border-forest-200 bg-white p-4 space-y-3">
                <p className="text-sm font-medium text-forest-700">手动添加微信群</p>
                <Input
                  label="微信群标识"
                  value={groupAddForm.recipientRef}
                  onChange={(e) =>
                    setGroupAddForm((prev) => ({ ...prev, recipientRef: e.target.value }))
                  }
                  placeholder="例如 wrOgDSDAAAaMesOMFQTvLdUHDqKqkVmA"
                />
                <Input
                  label="显示名称（可选）"
                  value={groupAddForm.displayName}
                  onChange={(e) =>
                    setGroupAddForm((prev) => ({ ...prev, displayName: e.target.value }))
                  }
                  placeholder="例如 Mia 数学群"
                />
                {groupAddError ? (
                  <p className="text-sm text-rose-700">{groupAddError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={groupAddLoading} onClick={handleGroupAdd}>
                    {groupAddLoading ? "添加中..." : "添加"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowGroupAddForm(false);
                      setGroupAddForm({ recipientRef: "", displayName: "" });
                      setGroupAddError(null);
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowGroupAddForm(true)}
              >
                + 手动添加微信群
              </Button>
            )}
          </div>
        </Card>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "feat: add WeChat group CRUD to integrations page"
```

---

### Task 6: Scope routing rules to selected child

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx` (routing rules section, after wechat groups Card)

**Goal:** Filter legacy routing rules by `selectedChildId` instead of the old `hasChildContext` logic.

- [ ] **Step 1: Update routing rules filter**

Replace the routing rules filter (lines 1136-1138):

Old:
```tsx
            const filteredRules = hasChildContext
              ? routingRules.filter((r) => r.child_id === selectedChildIdFromQuery)
              : routingRules;
```

New:
```tsx
            const filteredRules = routingRules.filter((r) => r.child_id === selectedChildId);
```

Also wrap the routing rules Card with `{selectedChildId && (`:

```tsx
      {selectedChildId && (
        <Card id="message-routing" className="scroll-mt-4">
          ...
        </Card>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "refactor: scope routing rules to selected child"
```

---

### Task 7: Cleanup unused code and type check

**Files:**
- Modify: `src/app/(parent)/settings/integrations/page.tsx`

**Goal:** Remove dead `hasChildContext` references, unused `routingForm`/`routingError`/`routingLoading` state (if truly unused after refactor), and verify build.

- [ ] **Step 1: Remove unused `routingForm` state**

The `routingForm`, `routingError`, `routingLoading` state and the `routingHomeworkOptions` computed value are part of the removed "new routing rule" form (not present in current code, was commented out / legacy). Check if they're still referenced. If not, remove lines 83-91 (`routingForm` through `routingLoading`).

Also remove `routingHomeworkOptions` at line 184-186 if unused:

```typescript
  const routingHomeworkOptions = homeworks.filter(
    (homework) => !routingForm.childId || homework.child_id === routingForm.childId
  );
```

If `routingHomeworkOptions` is not used anywhere in JSX, delete these 3 lines.

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: clean output, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(parent)/settings/integrations/page.tsx
git commit -m "chore: remove unused routing form state"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full build check**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 2: Verify all changes**

Spot-check the page structure:
- Tab bar visible and clickable
- Binding form scoped to selected child (no child dropdown)
- Account cards filtered by selected child
- Default WeChat group for selected child only
- WeChat group CRUD functional
- Routing rules filtered by selected child

- [ ] **Step 3: Final commit if needed**

```bash
git status
```
