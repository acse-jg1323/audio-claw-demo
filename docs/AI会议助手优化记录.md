# AI会议助手优化记录

更新时间：2026-06-24

本文档用于记录并确认 `AudioClaw 助手` 的一组优化需求。当前阶段先约定交互、接口、数据结构与边界，不直接进入最终开发。

## 1. 背景

当前 AI 会议助手来自 `zyy/feature/assistant-pip` 分支，已具备：

- 基于本场会议转写内容进行问答
- 快捷问题 chip
- AI 回复引用转写片段，并支持点击引用跳转到对应转写气泡

本轮需要优化三个方向：

1. 输入框发送体验
2. 引用展示体验
3. 助手聊天记录与会议归档、replay 回看绑定

## 2. 现状观察

### 2.1 输入框

当前 `assistantInput` 是 `textarea`。

现有发送逻辑：

- 点击发送按钮：发送
- `Cmd/Ctrl + Enter`：发送
- 单独按 `Enter`：textarea 默认换行

问题：

- 会中快速使用场景下，用户更期待 `Enter` 直接发送。
- 换行能力仍然有价值，但不应占用最高频操作。

### 2.2 引用

当前 AI 助手返回：

```json
{
  "answer": "string",
  "citations": ["string"]
}
```

其中 `citations` 使用转写片段 id，例如 `segmentId` / `localSegmentId`。

现有前端展示方式：

- 直接把 id 文本显示在 chip 上
- 点击 chip 后滚动到对应转写气泡

问题：

- `localSegmentId` 是技术 id，例如 `1-3-3`，用户不知道含义。
- 引用数量没有展示上限，引用较多时会占用气泡下方空间。
- 跳转能力很好，应保留。

### 2.3 聊天记录

当前聊天记录只存在 DOM 中：

- 用户提问通过 `appendAssistantMessage("user", question)` 渲染
- AI 回复通过 `appendAssistantMessage("bot", answer, { citations })` 渲染
- 页面刷新、会议结束归档、replay 回看后不会恢复这段聊天

当前会议本地存储结构位于 `src/storage/meeting-store.js`，已有：

- `transcriptSegments`
- `summary`
- `summaryStatus`
- `status`
- `startedAt`
- `endedAt`
- `durationSeconds`

需要新增 AI 助手聊天记录字段。

## 3. 目标方案

### 3.1 输入框发送规则

推荐规则：

| 操作 | 行为 |
| --- | --- |
| `Enter` | 发送当前问题 |
| `Shift + Enter` | 换行 |
| `Cmd/Ctrl + Enter` | 兼容保留为发送 |
| 输入为空时发送 | 不触发请求 |
| 请求中发送 | 忽略或禁用，沿用当前 `assistantBusy` 逻辑 |

同步调整 placeholder：

```text
请输入你的问题…例：客户关心安全吗？（Enter 发送，Shift+Enter 换行）
```

边界：

- replay 模式下原则上不再调用 AI 接口，只展示归档聊天记录。
- 如果未来要支持 replay 二次追问，应作为单独能力设计。

### 3.2 引用展示规则

底层仍然保存真实 `segmentId`，用于点击跳转。

展示层不直接显示技术 id，改为用户友好的数字标号：

- 第 1 条引用：`1`
- 第 2 条引用：`2`
- 第 10 条引用：`10`

数字标号展示在 `引用原文：` 后面，整体与 AI 聊天气泡同宽。

每个数字标号使用等宽小圆条样式：

- 一位数和两位数占用相同或近似相同的横向空间。
- 形态可以是轻量圆角胶囊，视觉上接近“小圆圈”，但保留足够宽度容纳两位数。
- 间距保持紧凑，避免引用区抢占回答正文注意力。
- 样式沿用当前原型的浅色背景、细边框、蓝色强调色与 hover 高亮风格。

每个数字标号可增加 `title`，用于悬停提示更多信息：

```text
田中 · 14:26:42
```

点击行为保持：

- 点击数字标号
- 滚动到对应转写气泡
- 给转写气泡加短暂高亮

### 3.3 引用数量与布局

推荐第一版规则：

- 不限制引用展示数量。
- 不使用 `+N 条引用` 截断。
- 所有可匹配的引用都展示出来。
- 引用区使用横向滚动容器，容器宽度与聊天气泡一致。
- 当引用数量较多时，用户横向滑动查看全部数字标号。

建议结构：

```text
引用原文：  1  2  3  4  5  6  7  8 ...
```

建议布局：

- `引用原文：` 固定在滚动区域左侧或作为同一行的前置标签。
- 数字标号区域横向排列，可滚动。
- 纵向高度保持一行，不因引用数量增加而撑高气泡。
- 在触控板和鼠标滚轮横向滚动时都应可用。
- 如需要更明显的可滚动感，可在右侧加轻微渐隐遮罩，但第一版不是必须。

边界：

- 模型返回的 citation 如果无法匹配真实转写片段，不展示为可点击引用。
- 如果全部无法匹配，则不展示引用 chip，避免用户点了无效目标。
- 模型 prompt 不强行限制引用数量；前端负责把所有有效引用以横向滚动方式承载。

### 3.4 助手聊天记录数据结构

在会议记录中新增字段：

```json
{
  "assistantMessages": [
    {
      "id": "assistant_msg_20260624_001",
      "role": "user",
      "text": "客户到目前为止主要关心哪几方面？",
      "createdAt": "2026-06-24T10:30:00.000Z",
      "citations": []
    },
    {
      "id": "assistant_msg_20260624_002",
      "role": "assistant",
      "text": "客户主要关心多语种识别精度、数据安全与部署门槛。",
      "createdAt": "2026-06-24T10:30:03.000Z",
      "citations": [
        {
          "segmentId": "1-3-3",
          "label": "1",
          "speaker": "田中",
          "timestamp": "14:26:42",
          "textPreview": "価格についてはいかがでしょうか？"
        }
      ],
      "model": "senseaudio-s2",
      "latencyMs": 1830
    }
  ]
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | 前端生成的消息 id，用于 DOM key 和后续扩展 |
| `role` | `user` 或 `assistant` |
| `text` | 气泡正文 |
| `createdAt` | 消息产生时间 |
| `citations` | 结构化引用，不直接暴露技术 id |
| `citations[].segmentId` | 真实转写片段 id，用于跳转 |
| `citations[].label` | 展示文案，例如 `1`、`2`、`10` |
| `citations[].speaker` | 引用片段发言人 |
| `citations[].timestamp` | 引用片段时间 |
| `citations[].textPreview` | 引用片段预览，可用于 title 或后续展开 |
| `model` | AI 助手使用模型 |
| `latencyMs` | 请求耗时 |

### 3.5 存储接口方案

在 `src/storage/meeting-store.js` 中补充：

1. `normalizeMeetingRecord` 增加：

```js
assistantMessages: Array.isArray(meeting.assistantMessages) ? meeting.assistantMessages : [],
```

2. `createMeetingForUser` 写入初始值：

```js
assistantMessages: payload.assistantMessages || [],
```

3. 新增保存接口：

```js
export function saveMeetingAssistantMessages(meetingId, assistantMessages, extraPayload = {}) {
  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    ...extraPayload,
    assistantMessages: Array.isArray(assistantMessages) ? assistantMessages : [],
    lastVisitedAt: new Date().toISOString(),
  }));
}
```

4. `finishMeeting` 支持带上最终聊天记录：

```js
const assistantMessages = Array.isArray(payload.assistantMessages)
  ? payload.assistantMessages
  : meeting.assistantMessages;
```

并写入返回对象。

### 3.6 页面状态方案

在 `src/meeting/meeting-page-app.js` 中新增内存状态：

```js
let assistantMessages = [];
```

live 模式：

- 页面初始化后显示默认欢迎语，但默认欢迎语不一定写入存储。
- 用户发送问题时，先 append user message，并写入 `assistantMessages`。
- AI 返回后 append assistant message，并写入 `assistantMessages`。
- 每次消息变化后调用 `persistAssistantSnapshot()` 保存到当前会议。
- 会议结束 `finishMeeting(...)` 时，将 `assistantMessages` 一起带入归档。

replay 模式：

- `initializeReplayMode()` 中增加 `restoreReplayAssistantMessages(currentMeetingRecord)`。
- 如果有 `assistantMessages`，按原气泡样式只读渲染。
- 如果没有聊天记录，显示默认空态或欢迎语。
- replay 下禁用输入框和发送按钮，快捷 chip 不触发请求。
- replay 下引用点击仍可跳转到归档转写片段。

### 3.7 引用构建方案

AI executor 仍返回原始 `citations: ["segmentId"]`。

页面层在接收结果后，将 citation id 转成结构化对象：

```js
function buildAssistantCitationObjects(citationIds) {
  return citationIds
    .map((segmentId) => segmentStore.get(segmentId))
    .filter(Boolean)
    .map((record, index) => ({
      segmentId: record.localSegmentId,
      label: String(index + 1),
      speaker: record.speaker?.name || "发言人",
      timestamp: formatTime(record.timestampEnd),
      textPreview: selectSummaryText(record, refs.mainLanguage?.value || "zh").slice(0, 80),
    }));
}
```

不再需要 `hiddenCitationCount` 或 `+N 条引用`。引用数量较多时由横向滚动容器承载。

## 4. 开发边界

本轮包含：

- Enter 发送、Shift+Enter 换行
- 引用 chip 用户友好展示
- 引用横向滚动展示全部有效引用
- AI 聊天记录保存到会议本地存储
- replay 恢复 AI 聊天记录
- replay 下引用跳转历史转写气泡

本轮不包含：

- replay 模式继续向 AI 追问
- 引用全文展开面板
- 引用数量截断和 `+N 条引用`
- 服务端持久化
- 多设备同步
- AI 聊天记录导出
- 对历史已归档会议做数据迁移补齐

## 5. 验收标准

### 5.1 输入框

- 输入文字后按 `Enter` 能直接发送。
- 按 `Shift + Enter` 可以在输入框内换行。
- `Cmd/Ctrl + Enter` 仍可发送。
- 空输入不会发送。
- 请求过程中不会重复发送。

### 5.2 引用

- AI 回复下方不再显示 `1-3-3` 这类技术 id。
- 引用区显示 `引用原文：` 和等宽数字标号，例如 `1`、`2`、`10`。
- 点击引用仍能跳到对应转写片段并高亮。
- 引用较多时，气泡下方引用区保持一行，并可横向滚动查看全部引用。
- 无法匹配真实转写片段的 citation 不展示为可点击 chip。

### 5.3 存储与 replay

- live 会中提问和回答会写入当前会议记录。
- 结束会议归档后，会议记录包含 `assistantMessages`。
- 从 home 历史卡片进入 replay 后，能看到当时的 AI 助手聊天记录。
- replay 中 AI 输入框不可用，不会误触发新请求。
- replay 中历史 AI 回复的引用仍能跳转到对应历史转写片段。

## 6. 建议开发顺序

1. 调整输入框键盘交互。
2. 抽象 `assistantMessages` 内存状态与渲染函数。
3. 将引用从原始 id 转成结构化引用对象。
4. 调整引用 chip 为 `引用原文：` + 横向滚动数字标号。
5. 在 `meeting-store.js` 增加 `assistantMessages` 字段与保存接口。
6. live 模式每次消息变化后保存聊天快照。
7. 会议结束时随 `finishMeeting` 一起归档聊天记录。
8. replay 模式恢复并只读渲染聊天记录。
9. 做一轮 live -> 归档 -> home -> replay 的手测。

## 7. 待确认点

1. 引用区是否采用 `引用原文：` + 等宽数字小圆条 + 横向滚动展示全部引用？
2. replay 模式是否明确只读，不允许继续追问？
3. 默认欢迎语是否需要进入存储？

建议默认答案：

- 引用展示：不限制上限，横向滚动展示全部有效引用，不显示技术 id。
- replay 模式：第一版只读。
- 默认欢迎语：不进入存储，只在没有聊天记录时作为 UI 初始提示。
