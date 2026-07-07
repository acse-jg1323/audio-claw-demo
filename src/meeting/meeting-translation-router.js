import { getSystemLanguage } from "../i18n/locale-store.js";

const LANGUAGE_LABELS = {
  zh: { zh: "中文", ja: "中国語", en: "Chinese" },
  en: { zh: "English", ja: "English", en: "English" },
  ja: { zh: "日本語", ja: "日本語", en: "Japanese" },
  none: { zh: "关闭", ja: "オフ", en: "Off" },
  unknown: { zh: "未知语言", ja: "不明な言語", en: "Unknown" },
};

export function detectLanguage(text) {
  const input = (text || "").trim();
  if (!input) {
    return "unknown";
  }

  const normalizedForDetection = stripPunctuationForDetection(input);
  if (normalizedForDetection.length === 1) {
    if (/[\u3040-\u30ff]/.test(normalizedForDetection)) {
      return "ja";
    }

    if (/[\u4e00-\u9fff]/.test(normalizedForDetection)) {
      return "zh";
    }

    return "unknown";
  }

  if (input.length <= 1) {
    return "unknown";
  }

  const hasJapaneseKana = /[\u3040-\u30ff]/.test(input);
  const hasJapanesePattern = /(です|ます|でした|ください|ません|でしたか|しましょう)/.test(input);
  if (hasJapaneseKana || hasJapanesePattern) {
    return "ja";
  }

  const cjkMatches = input.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinMatches = input.match(/[A-Za-z]/g) ?? [];
  const latinWords = input.match(/[A-Za-z]+/g) ?? [];
  const digitMatches = input.match(/[0-9]/g) ?? [];
  const kanaMatches = input.match(/[\u3040-\u30ff]/g) ?? [];
  const meaningfulCount =
    cjkMatches.length + latinMatches.length + kanaMatches.length + digitMatches.length;

  if (meaningfulCount <= 1) {
    return "unknown";
  }

  const latinRatio = meaningfulCount === 0 ? 0 : latinMatches.length / meaningfulCount;
  if (latinRatio >= 0.95 && latinWords.length >= 2) {
    return "en";
  }

  if (cjkMatches.length > 0) {
    return "zh";
  }

  if (latinRatio >= 0.95) {
    return "en";
  }

  return "unknown";
}

export function createTranslationPlan({
  sourceLanguage,
  mainLanguage,
  meetingTargetLanguage,
}) {
  const normalizedSource = sourceLanguage || "unknown";
  const normalizedMain = mainLanguage || "zh";
  const normalizedTarget = meetingTargetLanguage || "en";

  if (normalizedSource === "unknown") {
    return {
      sourceLanguage: normalizedSource,
      desiredTargetLanguage: normalizedMain,
      shouldTranslate: true,
      routeDescription: "语言未判定，默认回译到主阅读语言",
    };
  }

  if (normalizedSource === normalizedMain) {
    return {
      sourceLanguage: normalizedSource,
      desiredTargetLanguage: normalizedTarget,
      shouldTranslate: normalizedTarget !== "none",
      routeDescription: `${getLanguageLabel(normalizedSource)}原文 -> ${getLanguageLabel(normalizedTarget)}`,
    };
  }

  return {
    sourceLanguage: normalizedSource,
    desiredTargetLanguage: normalizedMain,
    shouldTranslate: true,
    routeDescription: `${getLanguageLabel(normalizedSource)}原文 -> ${getLanguageLabel(normalizedMain)}`,
  };
}

export function createPolicySummary({ mainLanguage, meetingTargetLanguage, translatorModel }) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `主表示言語は ${getLanguageLabel(mainLanguage)}、会議の翻訳対象言語は ${getLanguageLabel(
      meetingTargetLanguage
    )} です。現在の正式フローは "DeepThink 音声転写 + ルール判定 + ルーティング翻訳" で、翻訳モデルは ${
      translatorModel || "senseaudio-s2-lite"
    } です。`;
  }
  if (language === "en") {
    return `Primary reading language is ${getLanguageLabel(
      mainLanguage
    )}, meeting target language is ${getLanguageLabel(
      meetingTargetLanguage
    )}. The current production chain is "DeepThink transcription + rule routing + translation", using ${
      translatorModel || "senseaudio-s2-lite"
    } as the translation model.`;
  }
  return `主阅读语言 ${getLanguageLabel(mainLanguage)}，会议外语目标语言 ${getLanguageLabel(
    meetingTargetLanguage
  )}；当前正式链路为“DeepThink 原文转写 + 规则判别 + 路由翻译”，译文执行模型为 ${
    translatorModel || "senseaudio-s2-lite"
  }。`;
}

export function getLanguageLabel(code) {
  const language = getSystemLanguage();
  return LANGUAGE_LABELS[code || "unknown"]?.[language] ?? code ?? LANGUAGE_LABELS.unknown[language];
}

function stripPunctuationForDetection(text) {
  return String(text || "").replace(/[。！？!?，、,.．…·:：;；"'“”‘’（）()【】\[\]<>《》「」『』\-—_～~`/\\|]+/g, "");
}
