const TRANSLATION_API_URL = "https://api.senseaudio.cn/v1/chat/completions";

const SYSTEM_PROMPT = `你是一个会议实时翻译器。
请将用户提供的文本准确翻译为指定目标语言。
要求：
1. 保留原句语气，不做扩写。
2. 不总结、不解释、不补充背景。
3. 专有名词、API、产品名尽量保持原样。
4. 输出仅包含译文，不要附加说明。`;

const SHORT_UTTERANCE_SYSTEM_PROMPT = `你是一个会议实时翻译器。
当前输入是一条超短会议回应、语气词、招呼语或短促插话。
请仅翻译当前 text 这一条内容，不要翻译、复述或借用任何未在 text 中出现的上下文。
要求：
1. 输出目标语言中的自然短表达。
2. 保留原句语气，不做扩写，不补全额外信息。
3. 如果是专有名词、产品名、API 名且本身不应翻译，可保持原样。
4. 输出仅包含译文，不要附加说明。`;

const GLOSSARY_PROMPT_APPENDIX = `以下 glossary_terms 是本场会议的术语热词。
翻译时应优先参考这些术语的对应译法或保留原文要求。
如果某个术语命中与当前语义明显不符，不要生硬套用；请在保持原意与整句通顺的前提下自然翻译。`;

export const TRANSLATOR_MODELS = [
  { value: "senseaudio-s2-lite", label: "SenseAudio-S2-Lite" },
  { value: "senseaudio-s2", label: "SenseAudio-S2" },
  { value: "senseaudio-s2-flash", label: "SenseAudio-S2-Flash" },
];

export async function translateSegment({
  apiKey,
  model = "senseaudio-s2-lite",
  sourceLanguage,
  targetLanguage,
  text,
  contextTail = [],
  onDelta = null,
  glossaryTerms = [],
}) {
  if (!apiKey) {
    throw new Error("缺少翻译接口 API Key。");
  }

  if (!text?.trim()) {
    return {
      translatedText: "",
      model,
      latencyMs: 0,
      status: "skipped",
    };
  }

  const useShortUtteranceRoute = isShortUtterance(text);
  const effectiveContextTail = useShortUtteranceRoute ? [] : contextTail;
  const useStream = typeof onDelta === "function";
  const glossaryApplied = Array.isArray(glossaryTerms) && glossaryTerms.length > 0;

  const startedAt = performance.now();
  const response = await fetch(TRANSLATION_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      stream: useStream,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt({
            useShortUtteranceRoute,
            glossaryApplied,
          }),
        },
        {
          role: "user",
          content: buildUserPrompt({
            sourceLanguage,
            targetLanguage,
            contextTail: effectiveContextTail,
            text,
            useShortUtteranceRoute,
            glossaryTerms,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => null);
    throw new Error(
      errPayload?.error?.message || errPayload?.message || `翻译请求失败：HTTP ${response.status}`
    );
  }

  if (useStream) {
    return await consumeTranslationStream({ response, model, startedAt, onDelta });
  }

  const latencyMs = performance.now() - startedAt;
  const payload = await response.json();

  return {
    translatedText: normalizeTranslatedText(payload?.choices?.[0]?.message?.content ?? ""),
    model,
    latencyMs,
    status: "success",
    glossaryApplied,
    glossaryTermCount: glossaryApplied ? glossaryTerms.length : 0,
    raw: payload,
  };
}

// 解析 SSE 流：逐块累积 delta，每次回调 onDelta(累积译文)，流结束返回终值。
async function consumeTranslationStream({ response, model, startedAt, onDelta }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  let firstTokenAt = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        const delta = json?.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          if (firstTokenAt === null) firstTokenAt = performance.now();
          assembled += delta;
          try {
            onDelta(normalizeStreamingText(assembled));
          } catch {}
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  return {
    translatedText: normalizeTranslatedText(assembled),
    model,
    latencyMs: performance.now() - startedAt,
    firstTokenMs: firstTokenAt !== null ? firstTokenAt - startedAt : null,
    status: "success",
  };
}

// 流式过程中显示用：只 trim 行首引号，不裁行尾（行尾引号可能还没到）。
function normalizeStreamingText(text) {
  return String(text || "").replace(/^["“]/, "");
}

function buildSystemPrompt({ useShortUtteranceRoute, glossaryApplied }) {
  const basePrompt = useShortUtteranceRoute ? SHORT_UTTERANCE_SYSTEM_PROMPT : SYSTEM_PROMPT;
  return glossaryApplied ? `${basePrompt}\n${GLOSSARY_PROMPT_APPENDIX}` : basePrompt;
}

function buildUserPrompt({
  sourceLanguage,
  targetLanguage,
  contextTail,
  text,
  useShortUtteranceRoute,
  glossaryTerms = [],
}) {
  const lines = [];

  if (useShortUtteranceRoute) {
    lines.push("segment_mode: short_utterance");
  }

  lines.push(`source_language: ${sourceLanguage || "unknown"}`);
  lines.push(`target_language: ${targetLanguage || "zh"}`);

  if (!useShortUtteranceRoute) {
    lines.push("context_tail:");
    if (contextTail?.length) {
      contextTail.slice(-2).forEach((item) => {
        lines.push(`- ${item}`);
      });
    } else {
      lines.push("- (none)");
    }
  }

  if (glossaryTerms.length) {
    lines.push("glossary_terms:");
    glossaryTerms.forEach((term) => {
      lines.push(formatGlossaryPromptLine(term));
    });
  }

  lines.push(`text: ${text}`);
  return lines.join("\n");
}

function formatGlossaryPromptLine(term) {
  const sourceText = sanitizePromptInlineText(term?.sourceText);
  const targetText = sanitizePromptInlineText(term?.targetText);
  const modeLabel = term?.targetMode === "preserve_original" ? "保留原文" : "固定翻译";
  return `- 源词: ${sourceText || "(empty)"} | 处理方式: ${modeLabel} | 译法: ${targetText}`;
}

function sanitizePromptInlineText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeTranslatedText(text) {
  return String(text || "").trim().replace(/^["“]|["”]$/g, "");
}

function isShortUtterance(text) {
  const normalized = String(text || "")
    .trim()
    .replace(/[。！？!?，、,.．…·:：;；"'“”‘’（）()【】\[\]<>《》「」『』\-—_～~`/\\|]+/g, "");

  return normalized.length > 0 && normalized.length <= 2;
}
