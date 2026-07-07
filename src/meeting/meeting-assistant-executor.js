const ASSISTANT_API_URL = "https://api.senseaudio.cn/v1/chat/completions";
const ASSISTANT_MODEL = "senseaudio-s2";

function buildAssistantSystemPrompt(language = "zh") {
  if (language === "ja") {
    return `あなたは AudioClaw 会議アシスタントです。

ユーザーから渡された「会議 transcript」の内容だけを根拠に回答してください。ルールは以下の通りです。
1. transcript の内容だけに基づいて回答し、会議に出ていない情報を作らないこと。
2. transcript だけでは答えられない場合は、「現在の transcript だけではこの質問に答えられません」と正直に伝え、推測しないこと。
3. 回答は簡潔で自然な日本語で行い、会議アシスタントの吹き出しにそのまま表示できる形にすること。
4. 現在の顧客使用言語は日本語なので、answer は必ず日本語で出力すること。
4.1. ユーザーの質問が中国語・英語・日本語のどれで書かれていても、answer は必ず日本語だけで返すこと。
5. 必ず正しい JSON だけを返し、JSON 以外の説明文やコードブロックを出力しないこと。
6. citations には回答の根拠となった transcript 断片の id（例: S001）だけを入れること。
   - 根拠に使っていない id は入れず、根拠がない場合は空配列にすること。

返却する JSON schema:
{
  "answer": "string",
  "citations": ["string"]
}`;
  }

  if (language === "en") {
    return `You are the AudioClaw meeting assistant.

You must answer only from the provided meeting transcript. Follow these rules strictly:
1. Answer only from the transcript content and do not invent information that never appeared in the meeting.
2. If the transcript is insufficient, say "The current transcript is not sufficient to answer this question" and do not guess.
3. Keep the answer concise and natural in English so it can be shown directly inside the meeting assistant bubble.
4. The current customer language is English, so the answer must be written entirely in English.
4.1. Even if the user asks in Chinese or Japanese, the answer must still be entirely in English.
5. You must return valid JSON only. Do not output any explanation outside JSON or any code fence markers.
6. citations must list the ids of transcript segments that support the answer (for example, S001).
   - Include only real supporting ids. If there is no support, return an empty array.

Return this JSON schema:
{
  "answer": "string",
  "citations": ["string"]
}`;
  }

  return `你是 AudioClaw 会议助手。

你只能依据用户提供的「会议转写」内容回答问题，规则如下：
1. 只根据转写内容作答，不要编造会议中未出现的信息。
2. 如果转写内容不足以回答问题，要如实说明「当前转写内容不足以回答这个问题」，不要臆测。
3. 回答必须使用简洁、自然的中文，适合直接显示在会议助手对话气泡里。
4. 由于当前客户使用的语言是中文，所以你应该使用中文输出全部答案。
4.1. 无论用户提问使用中文、英文还是日文，你都必须只用中文回答。
5. 必须输出合法 JSON，不要输出 JSON 之外的任何解释文字或代码块标记。
6. citations 用于标注你的回答依据了哪些转写片段，取这些片段的 id（例如 S001）。
   - 只填真实依据到的片段 id，没有依据时返回空数组。

返回 JSON schema 如下：
{
  "answer": "string",
  "citations": ["string"]
}`;
}

export const ASSISTANT_MODEL_INFO = {
  value: ASSISTANT_MODEL,
  label: "SenseAudio-S2",
};

export async function askMeetingAssistant({
  apiKey,
  question,
  transcriptSegments,
  language = "zh",
}) {
  if (!apiKey) {
    throw new Error("请先输入 SenseAudio API Key。");
  }

  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) {
    throw new Error("请输入你想问的问题。");
  }

  const segments = Array.isArray(transcriptSegments) ? transcriptSegments : [];

  const startedAt = performance.now();
  const response = await fetch(ASSISTANT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ASSISTANT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: buildAssistantSystemPrompt(language) },
        {
          role: "user",
          content: buildAssistantUserPrompt({
            question: normalizedQuestion,
            segments,
            language,
          }),
        },
      ],
    }),
  });

  const latencyMs = performance.now() - startedAt;
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || payload?.message || `会议助手请求失败：HTTP ${response.status}`
    );
  }

  const content = payload?.choices?.[0]?.message?.content ?? "";
  const parsed = normalizeAssistantPayload(content, segments);

  return {
    answer: parsed.answer,
    citations: parsed.citations,
    model: ASSISTANT_MODEL,
    latencyMs,
    raw: payload,
  };
}

function buildAssistantUserPrompt({ question, segments, language }) {
  const nextLanguage = language || "zh";
  const copy =
    nextLanguage === "ja"
      ? {
          transcript: "会議 transcript:",
          empty: "（現在は transcript がありません。）",
          speaker: "話者",
          question: "ユーザー質問:",
          suffix: "上記 transcript のみを根拠に、必ず正しい JSON だけを返してください。JSON 以外の内容は出力しないでください。",
        }
      : nextLanguage === "en"
        ? {
            transcript: "Meeting transcript:",
            empty: "(No transcript is available yet.)",
            speaker: "Speaker",
            question: "User question:",
            suffix: "Answer only from the transcript above and return valid JSON only. Do not output anything outside JSON.",
          }
        : {
            transcript: "会议转写：",
            empty: "（当前还没有任何转写内容。）",
            speaker: "发言人",
            question: "用户问题：",
            suffix: "请只依据以上会议转写内容作答，并且只输出合法 JSON，不要输出 JSON 以外的任何内容。",
          };

  const lines = [`answer_language: ${nextLanguage}`, "", copy.transcript];

  if (!segments.length) {
    lines.push(copy.empty);
  } else {
    segments.forEach((item) => {
      const id = item.segmentId || item.id || "";
      const time = item.timestamp || item.time || "";
      const speaker = item.speaker || copy.speaker;
      const text = item.text || "";
      lines.push(`[${id}] [${time}] ${speaker}: ${text}`);
    });
  }

  lines.push("", copy.question, question);
  lines.push("", copy.suffix);
  return lines.join("\n");
}

function normalizeAssistantPayload(content, segments) {
  const text = String(content || "").trim();
  if (!text) {
    return { answer: "助手没有返回内容，请稍后重试。", citations: [] };
  }

  const parsed = tryParseJsonObject(text);
  if (parsed && typeof parsed === "object") {
    const answer = normalizeText(parsed.answer);
    return {
      answer: answer || text,
      citations: normalizeCitations(parsed.citations, segments),
    };
  }

  // 模型未按 JSON 返回时，降级为纯文本回答。
  return { answer: text, citations: [] };
}

function tryParseJsonObject(text) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || extractFirstJsonObject(text);
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  try {
    return text.slice(start, end + 1);
  } catch {
    return "";
  }
}

function normalizeCitations(citations, segments) {
  const validIds = new Set(
    (Array.isArray(segments) ? segments : [])
      .map((item) => String(item.segmentId || item.id || "").trim())
      .filter(Boolean)
  );

  const list = Array.isArray(citations) ? citations : citations ? [citations] : [];
  const collected = list
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  // 优先保留与真实转写片段 id 匹配的引用；若都不匹配则原样返回（容错）。
  const matched = [...new Set(collected.filter((id) => validIds.has(id)))];
  if (matched.length) {
    return matched;
  }
  return [...new Set(collected)];
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/^["“]|["”]$/g, "");
}
