const SUMMARY_API_URL = "https://api.senseaudio.cn/v1/chat/completions";
const SUMMARY_MODEL = "senseaudio-s2";

function buildSummarySystemPrompt(summaryLanguage = "zh") {
  if (summaryLanguage === "ja") {
    return `あなたは会議サマリー生成アシスタントです。

与えられた会議 transcript を基に、構造化された会議サマリーを生成してください。

以下の要件を厳守してください。
1. 入力内容だけを根拠にし、会議に存在しない情報を作らないこと。
2. 出力は正しい JSON のみとし、JSON 以外の説明文を出さないこと。
3. サマリーには以下を必ず含めること。
   - ai_summary: 完整な要約文
   - decisions: 決定事項の一覧
   - action_items: タスクと担当者の一覧
   - open_questions: 未解決事項の一覧
4. decisions には、会議内で明確に合意・決定された内容だけを残し、単なる議論は入れないこと。
5. action_items では可能な限り task、owner、deadline を抽出すること。担当者または期限が不明な場合は「未明确」とすること。
6. owner はまず参加者リストから選ぶこと。根拠が足りない場合は「未明确」とすること。
7. open_questions には、会議で明示され、まだ解決していない論点だけを残すこと。
8. ai_summary は自然で簡潔な日本語の一段落とし、箇条書きを使わないこと。
9. 現在の顧客使用言語は日本語なので、出力本文は必ず日本語にすること。
10. 参加者名は翻訳せず、入力の表示名をそのまま保持すること。
11. summary_mode が draft の場合は慎重な文体にし、未確定事項を最終結論として書かないこと。
12. title フィールドは入力の meeting_title を使い、その後ろに「· 会議サマリー」を付けること。

返却する JSON schema:
{
  "summary_version": "v1",
  "summary_mode": "draft | final",
  "summary_language": "zh | ja | en",
  "title": "string",
  "ai_summary": "string",
  "decisions": [
    { "text": "string" }
  ],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string",
      "owner_status": "confirmed | unclear"
    }
  ],
  "open_questions": [
    { "text": "string" }
  ],
  "metadata": {
    "confidence_note": "string"
  }
}`;
  }

  if (summaryLanguage === "en") {
    return `You are a meeting summary generation assistant.

Your task is to generate a structured meeting summary from the provided meeting transcript.

Follow these rules strictly:
1. Use only the provided content and do not invent information that was not mentioned in the meeting.
2. Output valid JSON only and do not include any explanation outside JSON.
3. The summary must include:
   - ai_summary: one complete summary paragraph
   - decisions: a list of confirmed decisions
   - action_items: tasks with owners
   - open_questions: unresolved questions
4. Keep only clearly confirmed decisions in decisions. Do not turn normal discussion points into decisions.
5. For action_items, extract task, owner, and deadline whenever possible. If owner or deadline is unclear, write "未明确".
6. Prefer owners from the provided participant list. If there is not enough evidence, use "未明确".
7. Keep only questions that were explicitly raised and remain unresolved in open_questions.
8. ai_summary must be a natural and concise English paragraph suitable for a meeting summary card, without bullet points.
9. The current customer language is English, so all summary content must be written in English.
10. Do not translate or rewrite participant names. Keep names exactly as provided.
11. If summary_mode is draft, keep a cautious tone and do not present unfinished discussions as final conclusions.
12. Use the input meeting_title for the title field and append "· Meeting Summary".

Return this JSON schema:
{
  "summary_version": "v1",
  "summary_mode": "draft | final",
  "summary_language": "zh | ja | en",
  "title": "string",
  "ai_summary": "string",
  "decisions": [
    { "text": "string" }
  ],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string",
      "owner_status": "confirmed | unclear"
    }
  ],
  "open_questions": [
    { "text": "string" }
  ],
  "metadata": {
    "confidence_note": "string"
  }
}`;
  }

  return `你是一个会议总结生成助手。

你的任务是基于一场会议的转写内容，生成结构化会议总结。

请严格遵守以下要求：
1. 只依据输入内容生成，不要编造会议中未出现的信息。
2. 输出必须是合法 JSON，不要输出任何 JSON 之外的解释文字。
3. 总结必须包含以下部分：
   - ai_summary：一段完整摘要
   - decisions：关键决议列表
   - action_items：待办与负责人列表
   - open_questions：遗留问题列表
4. 关键决议只保留会议中已经明确确认、拍板或形成一致意见的内容，不要把普通讨论点误写成决议。
5. 待办项必须尽量提取：
   - task：任务内容
   - owner：负责人
   - deadline：截止日期
   如果负责人或截止日期不明确，填写“未明确”。
6. owner 必须优先从给定参会人名单中选择；若会议中没有足够依据，则填写“未明确”。
7. 遗留问题只保留会议中已明确提出但尚未解决、尚未形成结论的问题。
8. ai_summary 必须是一段自然、简洁、适合放入会议总结卡片中的摘要，不要使用项目符号。
9. 由于当前客户使用的语言是中文，所以你应该使用中文输出全部总结内容。
10. 不要翻译或改写参会人姓名，姓名按输入中的展示名保留。
11. 如果 summary_mode 为 draft，需要显式保持谨慎语气，不要把未完成讨论写成最终结论。
12. title 字段请使用输入中的 meeting_title，并在后方补上“· 会议总结”。

返回 JSON schema 如下：
{
  "summary_version": "v1",
  "summary_mode": "draft | final",
  "summary_language": "zh | ja | en",
  "title": "string",
  "ai_summary": "string",
  "decisions": [
    { "text": "string" }
  ],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string",
      "owner_status": "confirmed | unclear"
    }
  ],
  "open_questions": [
    { "text": "string" }
  ],
  "metadata": {
    "confidence_note": "string"
  }
}`;
}

export const SUMMARY_MODEL_INFO = {
  value: SUMMARY_MODEL,
  label: "SenseAudio-S2",
};

export async function generateMeetingSummary({
  apiKey,
  summaryMode,
  summaryLanguage,
  meetingTitle,
  meetingSubtitle,
  participants,
  speakerStats,
  summarySegments,
}) {
  if (!apiKey) {
    throw new Error("缺少 Summary 接口 API Key。");
  }

  if (!summarySegments?.length) {
    throw new Error("当前会议还没有足够的转写内容用于生成总结。");
  }

  const startedAt = performance.now();
  const response = await fetch(SUMMARY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: buildSummarySystemPrompt(summaryLanguage) },
        {
          role: "user",
          content: buildSummaryUserPrompt({
            summaryMode,
            summaryLanguage,
            meetingTitle,
            meetingSubtitle,
            participants,
            speakerStats,
            summarySegments,
          }),
        },
      ],
    }),
  });

  const latencyMs = performance.now() - startedAt;
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `会议总结请求失败：HTTP ${response.status}`);
  }

  const content = payload?.choices?.[0]?.message?.content ?? "";
  const parsed = normalizeSummaryPayload(parseJsonObject(content), {
    summaryMode,
    summaryLanguage,
    meetingTitle,
  });

  return {
    summary: parsed,
    model: SUMMARY_MODEL,
    latencyMs,
    raw: payload,
  };
}

function buildSummaryUserPrompt({
  summaryMode,
  summaryLanguage,
  meetingTitle,
  meetingSubtitle,
  participants,
  speakerStats,
  summarySegments,
}) {
  const lines = [
    `meeting_title: ${meetingTitle}`,
    `meeting_subtitle: ${meetingSubtitle || "未提供"}`,
    `summary_mode: ${summaryMode}`,
    `summary_language: ${summaryLanguage}`,
    "",
    "participants:",
  ];

  participants.forEach((item) => {
    lines.push(`- ${item}`);
  });

  lines.push("", "speaker_stats:");
  speakerStats.forEach((item) => {
    lines.push(
      `- ${item.speaker} | char_count: ${item.charCount} | segment_count: ${item.segmentCount} | ratio: ${item.ratioLabel}`
    );
  });

  lines.push("", "summary_segments:");
  summarySegments.forEach((item) => {
    lines.push(`- [${item.timestamp}] ${item.speaker}：${item.text}`);
  });

  lines.push("", "请根据以上内容输出合法 JSON，不要输出 JSON 以外的任何内容。");
  return lines.join("\n");
}

function parseJsonObject(content) {
  const text = String(content || "").trim();
  if (!text) {
    throw new Error("Summary Agent 返回为空。");
  }

  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || extractFirstJsonObject(text);

  if (!candidate) {
    throw new Error("未能从 Summary Agent 返回中解析出 JSON。");
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Summary JSON 解析失败：${error.message}`);
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1);
}

function normalizeSummaryPayload(payload, { summaryMode, summaryLanguage, meetingTitle }) {
  const aiSummary = normalizeText(payload?.ai_summary);
  if (!aiSummary) {
    throw new Error("Summary Agent 未返回有效摘要。");
  }

  return {
    summaryVersion: normalizeText(payload?.summary_version) || "v1",
    summaryMode: normalizeText(payload?.summary_mode) || summaryMode,
    summaryLanguage: normalizeText(payload?.summary_language) || summaryLanguage,
    // 标题由前端统一控制，避免模型输出改写页面固定标题。
    title: `${meetingTitle} · 会议总结`,
    aiSummary,
    decisions: normalizeTextArray(payload?.decisions, "text"),
    actionItems: normalizeActionItems(payload?.action_items),
    openQuestions: normalizeTextArray(payload?.open_questions, "text"),
    metadata: {
      confidenceNote:
        normalizeText(payload?.metadata?.confidence_note) || "若会议尚未结束，当前总结为草稿版本。",
    },
  };
}

function normalizeTextArray(items, fieldName) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => normalizeText(typeof item === "string" ? item : item?.[fieldName]))
    .filter(Boolean)
    .map((text) => ({ text }));
}

function normalizeActionItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      task: normalizeText(item?.task),
      owner: normalizeActionField(item?.owner),
      deadline: normalizeActionField(item?.deadline),
      ownerStatus: normalizeOwnerStatus(item?.owner_status),
    }))
    .filter((item) => item.task);
}

function normalizeOwnerStatus(value) {
  return value === "confirmed" || value === "已确认" ? "confirmed" : "unclear";
}

function normalizeActionField(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  const lowerText = text.toLowerCase();
  if (text === "未明确" || text === "不明确" || lowerText === "unknown" || lowerText === "unclear") {
    return "";
  }

  return text;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/^["“]|["”]$/g, "");
}
