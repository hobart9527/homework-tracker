# OpenClaw 录音推送 API

Homework Tracker 对外暴露的接口，供 OpenClaw 外部调度器拉取待推送录音并回传结果。

---

## 鉴权

所有请求需携带 Header:

```
x-api-key: <OPENCLAW_API_KEY>
```

`OPENCLAW_API_KEY` 与服务端 `env.OPENCLAW_API_KEY` 比对。失败返回 `401 Unauthorized`。

---

## GET /api/voice-push/openclaw

拉取待处理任务（status = `pending` 或 `retrying` 且 `sent_at IS NULL`）。

### 响应

```json
{
  "tasks": [
    {
      "taskId": "uuid",
      "childId": "uuid",
      "childName": "小明",
      "homeworkId": "uuid",
      "homeworkTitle": "语文作业",
      "fileUrl": "https://xxx.supabase.co/storage/v1/object/sign/attachments/...",
      "deliveryAttempts": 0,
      "createdAt": "2026-05-29T10:00:00.000Z"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `taskId` | 任务 ID，标记完成/失败时回传 |
| `childName` | 孩子姓名 |
| `homeworkTitle` | 作业标题 |
| `fileUrl` | 录音文件 signed URL，**有效期 10 分钟**，需在此时间内下载 |
| `deliveryAttempts` | 当前已尝试次数 |

最大返回 20 条，按 `created_at` 升序（最早待处理优先）。

---

## PATCH /api/voice-push/openclaw

标记任务完成或失败。

### 请求体

```json
{
  "taskId": "uuid",
  "action": "complete" | "fail",
  "failureReason": "可选，失败原因"
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `taskId` | 是 | 从 GET 获取的 taskId |
| `action` | 是 | `"complete"` 或 `"fail"` |
| `failureReason` | 否 | action=`fail` 时建议填写 |

### 响应

```json
{ "status": "sent", "taskId": "uuid" }
```

或

```json
{ "status": "failed", "taskId": "uuid" }
```

失败时返回 `400 Bad Request` 或 `500 Internal Server Error`。

---

## POST /api/voice-push/openclaw

统一入口，用 `action` 参数区分操作。

### 请求体

```json
{ "action": "fetch_tasks" }
```

等价于 `GET`。

```json
{ "action": "complete",  "taskId": "..." }
{ "action": "fail",      "taskId": "...", "failureReason": "..." }
```

等价于 `PATCH`。

---

## 推荐工作流

```
1. GET  /api/voice-push/openclaw     → 拿到 tasks (含 fileUrl)
2. 下载 fileUrl (普通 HTTP GET)       → 拿到音频二进制
3. 推送音频到微信通道
4. PATCH /api/voice-push/openclaw     → action=complete 或 fail
```

失败可重试（task 仍处于 `pending`/`retrying` 状态，下次 GET 会再次返回）。

---

## .env 配置

```bash
OPENCLAW_API_KEY=replace-with-a-random-secret
```

---

## 相关表

- `voice_push_tasks` — 任务队列，CheckInModal 上传录音时自动写入
- `voice_push_attempts` — 尝试记录，每次标记自动写入
