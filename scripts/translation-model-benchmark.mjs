const API_URL = "https://api.senseaudio.cn/v1/chat/completions";

const API_KEY = process.env.SENSEAUDIO_API_KEY;

if (!API_KEY) {
  console.error("缺少环境变量 SENSEAUDIO_API_KEY");
  process.exit(1);
}

const SYSTEM_PROMPT = `你是一个会议实时翻译器。
请将用户提供的文本准确翻译为指定目标语言。
要求：
1. 保留原句语气，不做扩写。
2. 不总结、不解释、不补充背景。
3. 专有名词、API、产品名尽量保持原样。
4. 输出仅包含译文，不要附加说明。`;

const MODELS = [
  "senseaudio-s2-flash",
  "senseaudio-s2-lite",
  "senseaudio-s2",
];

const SAMPLES = [
  {
    id: "case-01",
    label: "中文 -> 日语 / 技术术语",
    source_language: "zh",
    target_language: "ja",
    context_tail: ["我们先把会议页跑起来。"],
    text: "这个 API 先走 websocket，后面再补 token 的鉴权层。",
  },
  {
    id: "case-02",
    label: "中文 -> 英文 / 产品逻辑",
    source_language: "zh",
    target_language: "en",
    context_tail: ["现在先不要改总结模块。"],
    text: "这一版先保证原文稳定展示，译文异步补上就可以。",
  },
  {
    id: "case-03",
    label: "中文口语 -> 日语",
    source_language: "zh",
    target_language: "ja",
    context_tail: ["这个地方还没完全定。"],
    text: "对，就先这么搞，后面我们再慢慢收。",
  },
  {
    id: "case-04",
    label: "日语 -> 中文 / 产品推进",
    source_language: "ja",
    target_language: "zh",
    context_tail: ["先把 MVP 的核心链路跑通。"],
    text: "まず会議中のリアルタイム翻訳だけ安定させれば十分です。",
  },
  {
    id: "case-05",
    label: "日语 -> 中文 / 术语库",
    source_language: "ja",
    target_language: "zh",
    context_tail: ["现在讨论的是术语处理策略。"],
    text: "専門用語については、企業ごとの用語集をあとから差し込めるようにしたいです。",
  },
  {
    id: "case-06",
    label: "英文 -> 中文 / 实时显示",
    source_language: "en",
    target_language: "zh",
    context_tail: ["We already finished the websocket validation page."],
    text: "We should keep the original transcript first and append the translated segment asynchronously.",
  },
  {
    id: "case-07",
    label: "英文 -> 中文 / 技术表达",
    source_language: "en",
    target_language: "zh",
    context_tail: ["The ASR result comes from DeepThink."],
    text: "Please preserve product names, API terms, and websocket related wording in the translated output.",
  },
  {
    id: "case-08",
    label: "中文夹英文术语 -> 日语",
    source_language: "zh",
    target_language: "ja",
    context_tail: ["这里要跟前端联动一下。"],
    text: "这条消息先不要走 summary，只走 segment 翻译和 UI append。",
  },
  {
    id: "case-09",
    label: "日文夹英文产品名 -> 中文",
    source_language: "ja",
    target_language: "zh",
    context_tail: ["今は会中翻訳だけを見ています。"],
    text: "AudioClaw の meeting page は、まず original transcript を先に表示したいです。",
  },
];

async function main() {
  const summary = [];

  for (const model of MODELS) {
    console.log(`\n===== ${model} =====`);
    const results = [];

    for (const sample of SAMPLES) {
      const result = await runCase(model, sample);
      results.push(result);
      printResult(result);
    }

    summary.push({
      model,
      avgLatency: average(results.map((item) => item.latency_ms)),
      successCount: results.filter((item) => item.ok).length,
    });
  }

  console.log("\n===== 汇总 =====");
  for (const row of summary) {
    console.log(
      `${row.model} | 平均延迟 ${Math.round(row.avgLatency)} ms | 成功 ${row.successCount}/${SAMPLES.length}`
    );
  }
}

async function runCase(model, sample) {
  const userPrompt = buildUserPrompt(sample);
  const startedAt = performance.now();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const latency_ms = performance.now() - startedAt;
    const payload = await response.json();

    if (!response.ok) {
      return {
        model,
        sample,
        ok: false,
        latency_ms,
        translated_text: "",
        error: payload?.error?.message || payload?.message || `HTTP ${response.status}`,
      };
    }

    const translated_text =
      payload?.choices?.[0]?.message?.content?.trim() || "";

    return {
      model,
      sample,
      ok: true,
      latency_ms,
      translated_text,
      raw: payload,
    };
  } catch (error) {
    return {
      model,
      sample,
      ok: false,
      latency_ms: performance.now() - startedAt,
      translated_text: "",
      error: error?.message || "unknown error",
    };
  }
}

function buildUserPrompt(sample) {
  const lines = [
    `source_language: ${sample.source_language}`,
    `target_language: ${sample.target_language}`,
    "context_tail:",
  ];

  if (sample.context_tail?.length) {
    for (const item of sample.context_tail.slice(0, 2)) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- (none)");
  }

  lines.push(`text: ${sample.text}`);
  return lines.join("\n");
}

function printResult(result) {
  const latency = `${Math.round(result.latency_ms)} ms`;
  console.log(`\n[${result.sample.id}] ${result.sample.label}`);
  console.log(`耗时: ${latency}`);

  if (!result.ok) {
    console.log(`错误: ${result.error}`);
    return;
  }

  console.log(`原文: ${result.sample.text}`);
  console.log(`译文: ${result.translated_text}`);
}

function average(numbers) {
  if (!numbers.length) {
    return 0;
  }

  const total = numbers.reduce((sum, value) => sum + value, 0);
  return total / numbers.length;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
