import { getCurrentUser } from "../auth/auth-store.js";

export const TERMS_STORAGE_KEY = "ac_terms_v2";
export const TERMS_STORAGE_VERSION = 2;

export const TERM_SCOPES = Object.freeze({
  PERSONAL: "personal",
  ENTERPRISE: "enterprise",
});

export const TERM_TYPES = Object.freeze({
  FIXED_TRANSLATION: "fixed_translation",
  RECOGNITION_HOTWORD: "recognition_hotword",
});

export const TERM_STATUS = Object.freeze({
  ENABLED: "enabled",
  DISABLED: "disabled",
});

export const TERM_TARGET_MODES = Object.freeze({
  TRANSLATE: "translate",
  PRESERVE_ORIGINAL: "preserve_original",
});

export const TERM_MATCH_MODES = Object.freeze({
  CONTAINS: "contains",
  WHOLE_WORD: "whole_word",
  EXACT: "exact",
});

export const SUPPORTED_TERM_LANGUAGES = Object.freeze(["zh", "ja", "en"]);

export const TERMS_IMPORT_HEADERS = Object.freeze([
  "归属范围",
  "术语类型",
  "术语名称",
  "源语言",
  "源词",
  "别名",
  "目标语言",
  "处理方式",
  "译法",
  "备注",
]);

const XLSX_SHEET_NAME = "术语热词库";
const ENTRY_ID_PREFIX = "term_ent";
const RULE_ID_PREFIX = "term_rule";

const DEFAULT_PRIORITY = 100;

const ROW_KEY_ALIASES = {
  scope: ["归属范围", "scope", "Scope", "范围"],
  term_type: ["术语类型", "term_type", "termType", "类型"],
  display_name: ["术语名称", "display_name", "displayName", "显示名称", "术语名"],
  source_language: ["源语言", "source_language", "sourceLanguage"],
  source_text: ["源词", "source_text", "sourceText", "原文", "命中词"],
  source_aliases: ["别名", "source_aliases", "sourceAliases", "别名列表"],
  target_language: ["目标语言", "target_language", "targetLanguage"],
  target_text: ["译法", "target_text", "targetText", "目标词", "译文"],
  target_mode: ["处理方式", "target_mode", "targetMode", "输出模式"],
  notes: ["备注", "notes", "说明"],
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function ensureStringArray(values) {
  if (typeof values === "string") {
    return splitAliases(values);
  }

  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set();
  values.forEach((value) => {
    const text = ensureString(value);
    if (text) {
      unique.add(text);
    }
  });
  return Array.from(unique);
}

function ensureNumber(value, fallback = 0) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
}

function ensureIsoDate(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isSupportedLanguage(language) {
  return SUPPORTED_TERM_LANGUAGES.includes(language);
}

function normalizeLanguage(language, fallback = "zh") {
  const normalized = ensureString(language).toLowerCase();
  return isSupportedLanguage(normalized) ? normalized : fallback;
}

function normalizeScope(scope, fallback = TERM_SCOPES.PERSONAL) {
  if (scope === "企业共享") {
    return TERM_SCOPES.ENTERPRISE;
  }
  if (scope === "我的术语" || scope === "个人术语") {
    return TERM_SCOPES.PERSONAL;
  }
  return Object.values(TERM_SCOPES).includes(scope) ? scope : fallback;
}

function normalizeTermType(termType, fallback = TERM_TYPES.FIXED_TRANSLATION) {
  if (termType === "固定译法") {
    return TERM_TYPES.FIXED_TRANSLATION;
  }
  if (termType === "识别热词") {
    return TERM_TYPES.RECOGNITION_HOTWORD;
  }
  return Object.values(TERM_TYPES).includes(termType) ? termType : fallback;
}

function normalizeStatus(status, fallback = TERM_STATUS.ENABLED) {
  return Object.values(TERM_STATUS).includes(status) ? status : fallback;
}

function normalizeTargetMode(targetMode, fallback = TERM_TARGET_MODES.TRANSLATE) {
  if (targetMode === "固定翻译" || targetMode === "固定译法") {
    return TERM_TARGET_MODES.TRANSLATE;
  }
  if (targetMode === "保留原文") {
    return TERM_TARGET_MODES.PRESERVE_ORIGINAL;
  }
  return Object.values(TERM_TARGET_MODES).includes(targetMode) ? targetMode : fallback;
}

function getDefaultMatchMode(sourceLanguage) {
  if (sourceLanguage === "en") {
    return TERM_MATCH_MODES.WHOLE_WORD;
  }
  return TERM_MATCH_MODES.CONTAINS;
}

function normalizeMatchMode(matchMode, sourceLanguage) {
  if (Object.values(TERM_MATCH_MODES).includes(matchMode)) {
    return matchMode;
  }
  return getDefaultMatchMode(sourceLanguage);
}

function splitAliases(value) {
  return String(value || "")
    .split(/[|;；、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueBy(values, selector) {
  const seen = new Set();
  return values.filter((value) => {
    const key = selector(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toSlug(value) {
  const asciiOnly = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (asciiOnly) {
    return asciiOnly;
  }
  return `term_${Date.now()}`;
}

function buildPairKey(sourceLanguage, targetLanguage) {
  return `${sourceLanguage}->${targetLanguage}`;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStats(stats) {
  return {
    hitCount: Math.max(0, ensureNumber(stats?.hitCount, 0)),
    lastHitAt: ensureIsoDate(stats?.lastHitAt, null),
  };
}

function resolveActor(actor = null) {
  return actor || getCurrentUser();
}

function assertActor(actor, message = "当前操作需要有效登录用户。") {
  if (!actor?.id) {
    throw new Error(message);
  }
  return actor;
}

function isAdmin(actor) {
  return actor?.role === "admin";
}

function canViewEntry(entry, actor) {
  if (!actor?.id) {
    return false;
  }

  if (entry.scope === TERM_SCOPES.ENTERPRISE) {
    return Boolean(entry.companyKey) && entry.companyKey === actor.company;
  }

  return entry.ownerUserId === actor.id;
}

function canEditEntry(entry, actor) {
  if (!actor?.id) {
    return false;
  }

  if (entry.scope === TERM_SCOPES.ENTERPRISE) {
    return isAdmin(actor) && Boolean(entry.companyKey) && entry.companyKey === actor.company;
  }

  return entry.ownerUserId === actor.id;
}

function assertCanEditEntry(entry, actor) {
  if (!canEditEntry(entry, actor)) {
    throw new Error("当前账号无权编辑该术语。");
  }
}

function normalizeRule(rule, entryContext = {}) {
  const sourceTerms = ensureStringArray(rule?.sourceTerms || rule?.sourceText);
  const sourceLanguage = normalizeLanguage(rule?.sourceLanguage, "zh");
  const targetLanguage = normalizeLanguage(rule?.targetLanguage, sourceLanguage);
  const targetMode = normalizeTargetMode(
    rule?.targetMode,
    ensureString(rule?.targetText) ? TERM_TARGET_MODES.TRANSLATE : TERM_TARGET_MODES.PRESERVE_ORIGINAL
  );
  const matchMode = normalizeMatchMode(rule?.matchMode, sourceLanguage);
  const fallbackTargetText =
    targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL ? sourceTerms[0] || "" : "";

  return {
    ruleId: ensureString(rule?.ruleId) || createId(RULE_ID_PREFIX),
    sourceLanguage,
    targetLanguage,
    sourceTerms,
    sourceAliases: ensureStringArray(rule?.sourceAliases),
    targetText: ensureString(rule?.targetText) || fallbackTargetText,
    targetMode,
    matchMode,
    caseSensitive: Boolean(rule?.caseSensitive),
    wholeWord:
      typeof rule?.wholeWord === "boolean"
        ? rule.wholeWord
        : matchMode === TERM_MATCH_MODES.WHOLE_WORD,
    bidirectionalGroup: ensureString(rule?.bidirectionalGroup),
    status: normalizeStatus(rule?.status, TERM_STATUS.ENABLED),
    stats: normalizeStats(rule?.stats),
    createdAt: ensureIsoDate(rule?.createdAt, entryContext.createdAt || nowIso()),
    updatedAt: ensureIsoDate(rule?.updatedAt, entryContext.updatedAt || nowIso()),
  };
}

function normalizeEntry(entry) {
  const createdAt = ensureIsoDate(entry?.createdAt, nowIso());
  const updatedAt = ensureIsoDate(entry?.updatedAt, createdAt);
  const scope = normalizeScope(entry?.scope, TERM_SCOPES.PERSONAL);

  const normalizedEntry = {
    entryId: ensureString(entry?.entryId) || createId(ENTRY_ID_PREFIX),
    conceptKey: ensureString(entry?.conceptKey) || toSlug(entry?.displayName || entry?.entryId),
    scope,
    ownerUserId: scope === TERM_SCOPES.PERSONAL ? ensureString(entry?.ownerUserId) : "",
    companyKey: scope === TERM_SCOPES.ENTERPRISE ? ensureString(entry?.companyKey) : "",
    termType: normalizeTermType(entry?.termType, TERM_TYPES.FIXED_TRANSLATION),
    displayName: ensureString(entry?.displayName),
    notes: ensureString(entry?.notes),
    tags: ensureStringArray(entry?.tags),
    status: normalizeStatus(entry?.status, TERM_STATUS.ENABLED),
    priority: ensureNumber(entry?.priority, DEFAULT_PRIORITY),
    createdAt,
    createdByUserId: ensureString(entry?.createdByUserId),
    createdByName: ensureString(entry?.createdByName),
    updatedAt,
    updatedByUserId: ensureString(entry?.updatedByUserId),
    updatedByName: ensureString(entry?.updatedByName),
    stats: normalizeStats(entry?.stats),
    rules: [],
  };

  normalizedEntry.rules = uniqueBy(
    (Array.isArray(entry?.rules) ? entry.rules : [])
      .map((rule) => normalizeRule(rule, normalizedEntry))
      .filter((rule) => rule.sourceTerms.length),
    (rule) => rule.ruleId
  );

  return normalizedEntry;
}

function normalizeStore(store) {
  const fallback = {
    version: TERMS_STORAGE_VERSION,
    entries: [],
    updatedAt: nowIso(),
  };
  const rawStore = isObject(store) ? store : fallback;
  const entries = Array.isArray(rawStore.entries)
    ? rawStore.entries.map(normalizeEntry)
    : [];

  return {
    version: TERMS_STORAGE_VERSION,
    entries,
    updatedAt: ensureIsoDate(rawStore.updatedAt, nowIso()),
  };
}

function buildDemoEntry({
  conceptKey,
  scope,
  ownerUserId = "",
  companyKey = "",
  termType,
  displayName,
  notes = "",
  priority = DEFAULT_PRIORITY,
  createdByUserId,
  createdByName,
  updatedByUserId = createdByUserId,
  updatedByName = createdByName,
  hitCount = 0,
  lastHitAt = null,
  rules = [],
}) {
  const timestamp = nowIso();
  return normalizeEntry({
    entryId: createId(ENTRY_ID_PREFIX),
    conceptKey,
    scope,
    ownerUserId,
    companyKey,
    termType,
    displayName,
    notes,
    status: TERM_STATUS.ENABLED,
    priority,
    createdAt: timestamp,
    createdByUserId,
    createdByName,
    updatedAt: timestamp,
    updatedByUserId,
    updatedByName,
    stats: { hitCount, lastHitAt },
    rules,
  });
}

function buildDemoStore() {
  const lastHitAt = nowIso();
  return normalizeStore({
    version: TERMS_STORAGE_VERSION,
    updatedAt: lastHitAt,
    entries: [
      buildDemoEntry({
        conceptKey: "audioclaw",
        scope: TERM_SCOPES.PERSONAL,
        ownerUserId: "u_admin_001",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "AudioClaw",
        notes: "产品名固定译法",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 32,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "en",
            targetLanguage: "ja",
            sourceTerms: ["AudioClaw"],
            sourceAliases: ["audio claw", "AUDIOCLAW"],
            targetText: "オーディオクロー",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 32, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "shenchuan_tech",
        scope: TERM_SCOPES.PERSONAL,
        ownerUserId: "u_admin_001",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "神泉科技",
        notes: "公司名统一译法",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 29,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "zh",
            targetLanguage: "ja",
            sourceTerms: ["神泉科技"],
            sourceAliases: ["神泉"],
            targetText: "シェンチュアン・テクノロジー",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 29, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "sunrise_keep",
        scope: TERM_SCOPES.PERSONAL,
        ownerUserId: "u_admin_001",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "サンライズ",
        notes: "保留原文",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 25,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "ja",
            targetLanguage: "zh",
            sourceTerms: ["サンライズ"],
            targetText: "",
            targetMode: TERM_TARGET_MODES.PRESERVE_ORIGINAL,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 25, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "appi",
        scope: TERM_SCOPES.PERSONAL,
        ownerUserId: "u_admin_001",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "APPI",
        notes: "法务术语",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 24,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "en",
            targetLanguage: "zh",
            sourceTerms: ["APPI"],
            targetText: "个人情报保护法",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 12, lastHitAt },
          },
          {
            sourceLanguage: "en",
            targetLanguage: "ja",
            sourceTerms: ["APPI"],
            targetText: "個人情報保護法",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 12, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "tanaka_kenta",
        scope: TERM_SCOPES.PERSONAL,
        ownerUserId: "u_admin_001",
        termType: TERM_TYPES.RECOGNITION_HOTWORD,
        displayName: "田中健太",
        notes: "人名热词",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 24,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "ja",
            targetLanguage: "ja",
            sourceTerms: ["田中健太"],
            sourceAliases: ["田中 健太"],
            targetText: "",
            targetMode: TERM_TARGET_MODES.PRESERVE_ORIGINAL,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 24, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "shenchuan_company_shared",
        scope: TERM_SCOPES.ENTERPRISE,
        companyKey: "神泉科技",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "神泉科技",
        notes: "企业统一品牌译法",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        updatedByUserId: "u_admin_001",
        updatedByName: "李明",
        hitCount: 46,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "zh",
            targetLanguage: "en",
            sourceTerms: ["神泉科技"],
            targetText: "Shenchuan Technology",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 23, lastHitAt },
          },
          {
            sourceLanguage: "zh",
            targetLanguage: "ja",
            sourceTerms: ["神泉科技"],
            targetText: "シェンチュアン",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 23, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "audioclaw_pro",
        scope: TERM_SCOPES.ENTERPRISE,
        companyKey: "神泉科技",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "AudioClaw Pro",
        notes: "产品线统一名称",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 28,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "en",
            targetLanguage: "en",
            sourceTerms: ["AudioClaw Pro"],
            targetText: "AudioClaw Pro",
            targetMode: TERM_TARGET_MODES.PRESERVE_ORIGINAL,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 14, lastHitAt },
          },
          {
            sourceLanguage: "en",
            targetLanguage: "ja",
            sourceTerms: ["AudioClaw Pro"],
            targetText: "オーディオクロー Pro",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 14, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "poc",
        scope: TERM_SCOPES.ENTERPRISE,
        companyKey: "神泉科技",
        termType: TERM_TYPES.RECOGNITION_HOTWORD,
        displayName: "POC",
        notes: "常见缩写热词",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 14,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "en",
            targetLanguage: "zh",
            sourceTerms: ["POC"],
            targetText: "概念验证",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 7, lastHitAt },
          },
          {
            sourceLanguage: "en",
            targetLanguage: "ja",
            sourceTerms: ["POC"],
            targetText: "概念実証",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 7, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "document_picture_in_picture",
        scope: TERM_SCOPES.ENTERPRISE,
        companyKey: "神泉科技",
        termType: TERM_TYPES.RECOGNITION_HOTWORD,
        displayName: "Document Picture-in-Picture",
        notes: "悬浮字幕相关术语",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 15,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "en",
            targetLanguage: "zh",
            sourceTerms: ["Document Picture-in-Picture"],
            sourceAliases: ["document pip", "pip"],
            targetText: "悬浮字幕窗",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 8, lastHitAt },
          },
          {
            sourceLanguage: "en",
            targetLanguage: "ja",
            sourceTerms: ["Document Picture-in-Picture"],
            sourceAliases: ["document pip", "pip"],
            targetText: "浮遊字幕窓",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.WHOLE_WORD,
            stats: { hitCount: 7, lastHitAt },
          },
        ],
      }),
      buildDemoEntry({
        conceptKey: "enterprise_edition",
        scope: TERM_SCOPES.ENTERPRISE,
        companyKey: "神泉科技",
        termType: TERM_TYPES.FIXED_TRANSLATION,
        displayName: "エンタープライズ版",
        notes: "产品版本标准译法",
        createdByUserId: "u_admin_001",
        createdByName: "李明",
        hitCount: 18,
        lastHitAt,
        rules: [
          {
            sourceLanguage: "ja",
            targetLanguage: "zh",
            sourceTerms: ["エンタープライズ版"],
            targetText: "企业版",
            targetMode: TERM_TARGET_MODES.TRANSLATE,
            matchMode: TERM_MATCH_MODES.CONTAINS,
            stats: { hitCount: 18, lastHitAt },
          },
        ],
      }),
    ],
  });
}

function readTermsStoreRaw() {
  return readJson(TERMS_STORAGE_KEY, null);
}

function writeTermsStore(store) {
  writeJson(TERMS_STORAGE_KEY, normalizeStore(store));
}

function readTermsStore() {
  const existing = readTermsStoreRaw();
  if (existing) {
    const normalized = normalizeStore(existing);
    if (JSON.stringify(existing) !== JSON.stringify(normalized)) {
      writeTermsStore(normalized);
    }
    return normalized;
  }

  const demoStore = buildDemoStore();
  writeTermsStore(demoStore);
  return demoStore;
}

function updateStore(updater) {
  const currentStore = readTermsStore();
  const nextStore = normalizeStore(updater(cloneJson(currentStore)));
  nextStore.updatedAt = nowIso();
  writeTermsStore(nextStore);
  return nextStore;
}

function resolveScopeOwnership(scope, actor, fallback = {}) {
  if (scope === TERM_SCOPES.ENTERPRISE) {
    if (!isAdmin(actor)) {
      throw new Error("只有管理员可以维护企业共享术语。");
    }
    return {
      ownerUserId: "",
      companyKey: ensureString(fallback.companyKey || actor.company),
    };
  }

  return {
    ownerUserId: ensureString(fallback.ownerUserId || actor.id),
    companyKey: "",
  };
}

function buildRuleFingerprint(rule) {
  return [
    rule.sourceLanguage,
    rule.targetLanguage,
    rule.targetMode,
    rule.sourceTerms.join("|").toLowerCase(),
  ].join("::");
}

function buildRulePairFingerprint(rule) {
  return `${rule.sourceLanguage}->${rule.targetLanguage}`;
}

function buildRuleContentFingerprint(rule) {
  return [
    buildRulePairFingerprint(rule),
    rule.targetMode,
    (rule.targetText || "").trim().toLowerCase(),
    rule.sourceTerms.map((item) => item.toLowerCase()).join("|"),
    rule.sourceAliases.map((item) => item.toLowerCase()).join("|"),
  ].join("::");
}

function mergeRules(existingRules, nextRules) {
  const mergedMap = new Map(existingRules.map((rule) => [buildRulePairFingerprint(rule), rule]));
  nextRules.forEach((rule) => {
    const pairKey = buildRulePairFingerprint(rule);
    const existingRule = mergedMap.get(pairKey);
    if (!existingRule) {
      mergedMap.set(pairKey, rule);
      return;
    }

    if (buildRuleContentFingerprint(existingRule) === buildRuleContentFingerprint(rule)) {
      return;
    }

    throw new Error(
      `同一个术语在 ${rule.sourceLanguage} -> ${rule.targetLanguage} 下存在冲突规则，请保留一条后再导入。`
    );
  });
  return Array.from(mergedMap.values());
}

function assertUniqueRulePairs(rules) {
  const pairMap = new Map();
  rules.forEach((rule) => {
    const pairKey = buildRulePairFingerprint(rule);
    if (pairMap.has(pairKey)) {
      throw new Error(
        `同一个术语在 ${rule.sourceLanguage} -> ${rule.targetLanguage} 下只能保留一条规则。`
      );
    }
    pairMap.set(pairKey, rule.ruleId);
  });
}

function normalizeImportEntryName(entry) {
  return ensureString(entry?.displayName).toLowerCase();
}

function buildImportEntryGroupKey(entry) {
  return [
    entry.scope,
    entry.termType,
    normalizeImportEntryName(entry),
  ].join("::");
}

function buildImportRowFingerprint(parsed) {
  const rule = parsed.rules[0];
  return [
    parsed.scope,
    parsed.termType,
    normalizeImportEntryName(parsed),
    buildRuleContentFingerprint(rule),
    ensureString(parsed.notes).toLowerCase(),
  ].join("::");
}

function buildEntrySearchText(entry) {
  const fragments = [
    entry.displayName,
    entry.notes,
    entry.updatedByName,
    ...(entry.tags || []),
  ];
  entry.rules.forEach((rule) => {
    fragments.push(rule.targetText);
    fragments.push(...rule.sourceTerms);
    fragments.push(...rule.sourceAliases);
  });
  return fragments.join(" ").toLowerCase();
}

function compareEntriesByUpdatedAt(a, b) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function compareRulesByPriority(a, b) {
  if (a.scope !== b.scope) {
    return a.scope === TERM_SCOPES.ENTERPRISE ? -1 : 1;
  }
  if (a.longestSourceLength !== b.longestSourceLength) {
    return b.longestSourceLength - a.longestSourceLength;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function buildEntryRow(entry, rule) {
  const primarySource = rule.sourceTerms[0] || "";
  const resolvedTargetText =
    rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL
      ? rule.targetText || primarySource
      : rule.targetText;

  return {
    entryId: entry.entryId,
    ruleId: rule.ruleId,
    conceptKey: entry.conceptKey,
    scope: entry.scope,
    ownerUserId: entry.ownerUserId,
    companyKey: entry.companyKey,
    termType: entry.termType,
    displayName: entry.displayName || primarySource,
    sourceText: primarySource,
    sourceTerms: [...rule.sourceTerms],
    sourceAliases: [...rule.sourceAliases],
    targetText: resolvedTargetText,
    targetMode: rule.targetMode,
    matchMode: rule.matchMode,
    languagePair: buildPairKey(rule.sourceLanguage, rule.targetLanguage),
    sourceLanguage: rule.sourceLanguage,
    targetLanguage: rule.targetLanguage,
    hitCount: rule.stats.hitCount,
    entryHitCount: entry.stats.hitCount,
    maintainerName: entry.updatedByName || entry.createdByName,
    updatedAt: entry.updatedAt,
    status: entry.status,
    ruleStatus: rule.status,
    priority: entry.priority,
    notes: entry.notes,
    tags: [...entry.tags],
    canEdit: false,
  };
}

function getVisibleEntries(actor = resolveActor()) {
  const user = assertActor(actor, "获取术语前需要有效登录用户。");
  return readTermsStore()
    .entries
    .filter((entry) => canViewEntry(entry, user))
    .sort(compareEntriesByUpdatedAt);
}

function getEntryByIdOrThrow(entryId) {
  const store = readTermsStore();
  const entry = store.entries.find((item) => item.entryId === entryId);
  if (!entry) {
    throw new Error(`未找到术语条目：${entryId}`);
  }
  return entry;
}

function normalizeRulePayload(rulePayload, entryDraft) {
  const normalizedRule = normalizeRule(rulePayload, entryDraft);
  if (!normalizedRule.sourceTerms.length) {
    throw new Error("术语规则必须至少包含一个源词。");
  }
  return normalizedRule;
}

function buildEntryFromPayload(payload, actor, fallbackEntry = null) {
  const scope = normalizeScope(payload?.scope, fallbackEntry?.scope || TERM_SCOPES.PERSONAL);
  const ownership = resolveScopeOwnership(scope, actor, fallbackEntry || payload || {});
  const timestamp = nowIso();
  const createdAt = fallbackEntry?.createdAt || timestamp;
  const termType = normalizeTermType(payload?.termType, fallbackEntry?.termType || TERM_TYPES.FIXED_TRANSLATION);
  const priority = DEFAULT_PRIORITY;

  const entryDraft = normalizeEntry({
    entryId: fallbackEntry?.entryId || payload?.entryId || createId(ENTRY_ID_PREFIX),
    conceptKey: ensureString(payload?.conceptKey || fallbackEntry?.conceptKey) || toSlug(payload?.displayName),
    scope,
    ownerUserId: ownership.ownerUserId,
    companyKey: ownership.companyKey,
    termType,
    displayName: ensureString(payload?.displayName, fallbackEntry?.displayName || ""),
    notes: ensureString(payload?.notes, fallbackEntry?.notes || ""),
    tags: Array.isArray(payload?.tags) ? payload.tags : fallbackEntry?.tags || [],
    status: normalizeStatus(payload?.status, fallbackEntry?.status || TERM_STATUS.ENABLED),
    priority,
    createdAt,
    createdByUserId: fallbackEntry?.createdByUserId || actor.id,
    createdByName: fallbackEntry?.createdByName || actor.name || "",
    updatedAt: timestamp,
    updatedByUserId: actor.id,
    updatedByName: actor.name || "",
    stats: fallbackEntry?.stats || { hitCount: 0, lastHitAt: null },
    rules: [],
  });

  const incomingRules = Array.isArray(payload?.rules)
    ? payload.rules.map((rule) => normalizeRulePayload(rule, entryDraft))
    : fallbackEntry?.rules || [];

  entryDraft.rules = uniqueBy(incomingRules, (rule) => rule.ruleId);
  assertUniqueRulePairs(entryDraft.rules);
  if (!entryDraft.displayName) {
    entryDraft.displayName = entryDraft.rules[0]?.sourceTerms[0] || entryDraft.conceptKey;
  }
  return entryDraft;
}

function findEntryIndex(store, entryId) {
  return store.entries.findIndex((entry) => entry.entryId === entryId);
}

function getRowValue(row, field) {
  const keys = ROW_KEY_ALIASES[field] || [field];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }
  return "";
}

function parseImportRow(row, actor, forcedScope = "") {
  const scope = normalizeScope(forcedScope || getRowValue(row, "scope"), TERM_SCOPES.PERSONAL);
  const termType = normalizeTermType(
    getRowValue(row, "term_type"),
    TERM_TYPES.FIXED_TRANSLATION
  );
  const sourceText = ensureString(getRowValue(row, "source_text"));
  if (!sourceText) {
    return null;
  }

  const sourceLanguage = normalizeLanguage(getRowValue(row, "source_language"), "zh");
  const targetLanguage = normalizeLanguage(getRowValue(row, "target_language"), sourceLanguage);
  const targetMode = normalizeTargetMode(
    getRowValue(row, "target_mode"),
    ensureString(getRowValue(row, "target_text"))
      ? TERM_TARGET_MODES.TRANSLATE
      : TERM_TARGET_MODES.PRESERVE_ORIGINAL
  );

  const conceptKey = toSlug(
    `${getRowValue(row, "display_name") || sourceText}_${termType}_${scope}_${actor?.company || actor?.id || ""}`
  );

  return {
    conceptKey,
    scope,
    termType,
    displayName: ensureString(getRowValue(row, "display_name")) || sourceText,
    notes: ensureString(getRowValue(row, "notes")),
    rules: [
      {
        sourceLanguage,
        targetLanguage,
        sourceTerms: [sourceText],
        sourceAliases: splitAliases(getRowValue(row, "source_aliases")),
        targetText: ensureString(getRowValue(row, "target_text")),
        targetMode,
      },
    ],
  };
}

function mergeImportedEntry(existingEntry, importedEntry, actor, mode = "merge") {
  const baseEntry = buildEntryFromPayload(importedEntry, actor, existingEntry);
  if (mode === "replace") {
    return baseEntry;
  }

  const mergedRules = mergeRules(
    existingEntry.rules,
    importedEntry.rules.map((rule) => normalizeRulePayload(rule, baseEntry))
  );

  return normalizeEntry({
    ...baseEntry,
    stats: existingEntry.stats,
    rules: mergedRules,
  });
}

function getRuleTargetText(rule) {
  if (rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL) {
    return rule.targetText || rule.sourceTerms[0] || "";
  }
  return rule.targetText;
}

function buildCompiledRule(entry, rule) {
  const terms = uniqueBy(
    [...rule.sourceTerms, ...rule.sourceAliases].filter(Boolean),
    (item) => item.toLowerCase()
  );
  const longestSourceLength = terms.reduce((max, item) => Math.max(max, item.length), 0);

  return {
    entryId: entry.entryId,
    ruleId: rule.ruleId,
    conceptKey: entry.conceptKey,
    scope: entry.scope,
    termType: entry.termType,
    priority: entry.priority,
    displayName: entry.displayName,
    notes: entry.notes,
    sourceLanguage: rule.sourceLanguage,
    targetLanguage: rule.targetLanguage,
    sourceTerms: [...rule.sourceTerms],
    sourceAliases: [...rule.sourceAliases],
    targetText: getRuleTargetText(rule),
    targetMode: rule.targetMode,
    matchMode: rule.matchMode,
    caseSensitive: rule.caseSensitive,
    wholeWord: rule.wholeWord,
    updatedAt: entry.updatedAt,
    longestSourceLength,
    stats: cloneJson(rule.stats),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchCandidate(text, token, rule) {
  if (!token) {
    return false;
  }

  const sourceText = rule.caseSensitive ? text : text.toLowerCase();
  const sourceToken = rule.caseSensitive ? token : token.toLowerCase();

  if (rule.matchMode === TERM_MATCH_MODES.EXACT) {
    return sourceText === sourceToken;
  }

  if (rule.matchMode === TERM_MATCH_MODES.WHOLE_WORD || rule.wholeWord) {
    const flags = rule.caseSensitive ? "u" : "iu";
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(token)}([^\\p{L}\\p{N}_]|$)`, flags);
    return pattern.test(text);
  }

  return sourceText.includes(sourceToken);
}

function buildWorkbookHelpers(xlsx) {
  const library =
    xlsx ||
    (typeof window !== "undefined" ? window.XLSX : null) ||
    (typeof globalThis !== "undefined" ? globalThis.XLSX : null);

  if (!library?.utils) {
    throw new Error("当前环境未检测到 XLSX，请在页面侧先加载 SheetJS。");
  }

  return library;
}

export function ensureTermsStore() {
  return readTermsStore();
}

export function getTermsStoreSnapshot() {
  return cloneJson(readTermsStore());
}

export function clearTermsForDebug() {
  localStorage.removeItem(TERMS_STORAGE_KEY);
}

export function getVisibleTermEntries(actor = resolveActor()) {
  return cloneJson(getVisibleEntries(actor));
}

export function getTermEntryById(entryId, actor = resolveActor()) {
  const user = assertActor(actor, "获取术语前需要有效登录用户。");
  const entry = getEntryByIdOrThrow(entryId);
  if (!canViewEntry(entry, user)) {
    throw new Error("当前账号无权查看该术语。");
  }
  return cloneJson(entry);
}

export function getTermRows(options = {}) {
  const {
    actor = resolveActor(),
    scope = "",
    termType = "",
    sourceLanguage = "",
    targetLanguage = "",
    search = "",
    includeDisabled = false,
  } = options;
  const user = assertActor(actor, "查询术语前需要有效登录用户。");
  const normalizedScope = scope ? normalizeScope(scope, "") : "";
  const normalizedTermType = termType ? normalizeTermType(termType, "") : "";
  const normalizedSourceLanguage = sourceLanguage ? normalizeLanguage(sourceLanguage, "") : "";
  const normalizedTargetLanguage = targetLanguage ? normalizeLanguage(targetLanguage, "") : "";
  const searchText = ensureString(search).toLowerCase();

  return getVisibleEntries(user)
    .filter((entry) => !normalizedScope || entry.scope === normalizedScope)
    .filter((entry) => !normalizedTermType || entry.termType === normalizedTermType)
    .filter((entry) => includeDisabled || entry.status === TERM_STATUS.ENABLED)
    .filter((entry) => !searchText || buildEntrySearchText(entry).includes(searchText))
    .flatMap((entry) =>
      entry.rules
        .filter((rule) => includeDisabled || rule.status === TERM_STATUS.ENABLED)
        .filter((rule) => !normalizedSourceLanguage || rule.sourceLanguage === normalizedSourceLanguage)
        .filter((rule) => !normalizedTargetLanguage || rule.targetLanguage === normalizedTargetLanguage)
        .map((rule) => ({
          ...buildEntryRow(entry, rule),
          canEdit: canEditEntry(entry, user),
        }))
    );
}

export function getTermStats(actor = resolveActor()) {
  const rows = getTermRows({ actor, includeDisabled: true });
  const visibleEntries = getVisibleEntries(actor);
  return {
    totalEntries: visibleEntries.length,
    totalRules: rows.length,
    personalEntries: visibleEntries.filter((entry) => entry.scope === TERM_SCOPES.PERSONAL).length,
    enterpriseEntries: visibleEntries.filter((entry) => entry.scope === TERM_SCOPES.ENTERPRISE).length,
    enabledEntries: visibleEntries.filter((entry) => entry.status === TERM_STATUS.ENABLED).length,
    totalHits: rows.reduce((sum, row) => sum + ensureNumber(row.hitCount, 0), 0),
    lastUpdatedAt: visibleEntries[0]?.updatedAt || null,
  };
}

export function createTermEntry(payload, actor = resolveActor()) {
  const user = assertActor(actor, "创建术语前需要有效登录用户。");
  const nextEntry = buildEntryFromPayload(payload, user);
  if (!nextEntry.rules.length) {
    throw new Error("创建术语时至少需要一条规则。");
  }

  const nextStore = updateStore((store) => {
    store.entries.unshift(nextEntry);
    return store;
  });

  return cloneJson(nextStore.entries.find((entry) => entry.entryId === nextEntry.entryId));
}

export function updateTermEntry(entryId, payload, actor = resolveActor()) {
  const user = assertActor(actor, "更新术语前需要有效登录用户。");
  const currentEntry = getEntryByIdOrThrow(entryId);
  assertCanEditEntry(currentEntry, user);

  const nextEntry = buildEntryFromPayload(payload, user, currentEntry);
  if (!nextEntry.rules.length) {
    throw new Error("术语条目至少需要保留一条规则。");
  }

  const nextStore = updateStore((store) => {
    const entryIndex = findEntryIndex(store, entryId);
    store.entries[entryIndex] = nextEntry;
    return store;
  });

  return cloneJson(nextStore.entries.find((entry) => entry.entryId === entryId));
}

export function deleteTermEntry(entryId, actor = resolveActor()) {
  const user = assertActor(actor, "删除术语前需要有效登录用户。");
  const currentEntry = getEntryByIdOrThrow(entryId);
  assertCanEditEntry(currentEntry, user);

  updateStore((store) => {
    store.entries = store.entries.filter((entry) => entry.entryId !== entryId);
    return store;
  });

  return cloneJson(currentEntry);
}

export function addTermRule(entryId, rulePayload, actor = resolveActor()) {
  const user = assertActor(actor, "新增术语规则前需要有效登录用户。");
  const currentEntry = getEntryByIdOrThrow(entryId);
  assertCanEditEntry(currentEntry, user);
  const nextRule = normalizeRulePayload(rulePayload, currentEntry);

  const nextStore = updateStore((store) => {
    const entryIndex = findEntryIndex(store, entryId);
    const entry = normalizeEntry(store.entries[entryIndex]);
    entry.rules.push(nextRule);
    assertUniqueRulePairs(entry.rules);
    entry.updatedAt = nowIso();
    entry.updatedByUserId = user.id;
    entry.updatedByName = user.name || "";
    store.entries[entryIndex] = normalizeEntry(entry);
    return store;
  });

  return cloneJson(nextStore.entries.find((entry) => entry.entryId === entryId));
}

export function updateTermRule(entryId, ruleId, patch, actor = resolveActor()) {
  const user = assertActor(actor, "更新术语规则前需要有效登录用户。");
  const currentEntry = getEntryByIdOrThrow(entryId);
  assertCanEditEntry(currentEntry, user);

  const currentRule = currentEntry.rules.find((rule) => rule.ruleId === ruleId);
  if (!currentRule) {
    throw new Error(`未找到术语规则：${ruleId}`);
  }

  const nextRule = normalizeRulePayload(
    {
      ...currentRule,
      ...patch,
      ruleId,
      createdAt: currentRule.createdAt,
      stats: currentRule.stats,
    },
    currentEntry
  );

  const nextStore = updateStore((store) => {
    const entryIndex = findEntryIndex(store, entryId);
    const entry = normalizeEntry(store.entries[entryIndex]);
    entry.rules = entry.rules.map((rule) => (rule.ruleId === ruleId ? nextRule : rule));
    assertUniqueRulePairs(entry.rules);
    entry.updatedAt = nowIso();
    entry.updatedByUserId = user.id;
    entry.updatedByName = user.name || "";
    store.entries[entryIndex] = normalizeEntry(entry);
    return store;
  });

  return cloneJson(nextStore.entries.find((entry) => entry.entryId === entryId));
}

export function deleteTermRule(entryId, ruleId, actor = resolveActor()) {
  const user = assertActor(actor, "删除术语规则前需要有效登录用户。");
  const currentEntry = getEntryByIdOrThrow(entryId);
  assertCanEditEntry(currentEntry, user);

  if (currentEntry.rules.length <= 1) {
    throw new Error("术语条目至少需要保留一条规则，如需移除请直接删除整个条目。");
  }

  const nextStore = updateStore((store) => {
    const entryIndex = findEntryIndex(store, entryId);
    const entry = normalizeEntry(store.entries[entryIndex]);
    entry.rules = entry.rules.filter((rule) => rule.ruleId !== ruleId);
    entry.updatedAt = nowIso();
    entry.updatedByUserId = user.id;
    entry.updatedByName = user.name || "";
    store.entries[entryIndex] = normalizeEntry(entry);
    return store;
  });

  return cloneJson(nextStore.entries.find((entry) => entry.entryId === entryId));
}

export function importTermsFromRows(rows, options = {}) {
  const {
    actor = resolveActor(),
    scope = "",
    mode = "merge",
  } = options;
  const user = assertActor(actor, "导入术语前需要有效登录用户。");
  if (!Array.isArray(rows) || !rows.length) {
    return {
      createdEntries: 0,
      updatedEntries: 0,
      createdRules: 0,
      totalRows: 0,
      skippedRows: 0,
      entries: [],
    };
  }

  const groupedImports = new Map();
  let skippedRows = 0;
  const seenRowFingerprints = new Set();

  rows.forEach((row) => {
    const parsed = parseImportRow(row, user, scope);
    if (!parsed) {
      skippedRows += 1;
      return;
    }

    const rowFingerprint = buildImportRowFingerprint(parsed);
    if (seenRowFingerprints.has(rowFingerprint)) {
      skippedRows += 1;
      return;
    }
    seenRowFingerprints.add(rowFingerprint);

    const groupKey = buildImportEntryGroupKey(parsed);
    const existing = groupedImports.get(groupKey) || {
      ...parsed,
      rules: [],
    };

    existing.displayName = parsed.displayName || existing.displayName;
    existing.notes = parsed.notes || existing.notes;
    existing.termType = parsed.termType || existing.termType;
    existing.rules = mergeRules(existing.rules, parsed.rules);
    groupedImports.set(groupKey, existing);
  });

  const summary = {
    createdEntries: 0,
    updatedEntries: 0,
    createdRules: 0,
    totalRows: rows.length,
    skippedRows,
    entries: [],
  };

  const nextStore = updateStore((store) => {
    groupedImports.forEach((importedEntry) => {
      const ownership = resolveScopeOwnership(importedEntry.scope, user, importedEntry);
      const matchedIndex = store.entries.findIndex(
        (entry) =>
          entry.scope === importedEntry.scope &&
          entry.termType === importedEntry.termType &&
          normalizeImportEntryName(entry) === normalizeImportEntryName(importedEntry) &&
          entry.ownerUserId === ownership.ownerUserId &&
          entry.companyKey === ownership.companyKey
      );

      if (matchedIndex === -1) {
        const createdEntry = buildEntryFromPayload(
          {
            ...importedEntry,
            scope: importedEntry.scope,
          },
          user
        );
        store.entries.unshift(createdEntry);
        summary.createdEntries += 1;
        summary.createdRules += createdEntry.rules.length;
        summary.entries.push(createdEntry.entryId);
        return;
      }

      const existingEntry = normalizeEntry(store.entries[matchedIndex]);
      assertCanEditEntry(existingEntry, user);
      const nextEntry = mergeImportedEntry(existingEntry, importedEntry, user, mode);
      const previousRuleCount = existingEntry.rules.length;
      store.entries[matchedIndex] = nextEntry;
      summary.updatedEntries += 1;
      summary.createdRules += Math.max(0, nextEntry.rules.length - previousRuleCount);
      summary.entries.push(nextEntry.entryId);
    });

    return store;
  });

  summary.entries = summary.entries.map((entryId) =>
    cloneJson(nextStore.entries.find((entry) => entry.entryId === entryId))
  );
  return summary;
}

export function exportTermsToRows(options = {}) {
  const {
    actor = resolveActor(),
    scope = "",
    termType = "",
    includeDisabled = false,
  } = options;

  return getTermRows({
    actor,
    scope,
    termType,
    includeDisabled,
  }).map((row) => ({
    归属范围: row.scope === TERM_SCOPES.ENTERPRISE ? "企业共享" : "我的术语",
    术语类型:
      row.termType === TERM_TYPES.RECOGNITION_HOTWORD ? "识别热词" : "固定译法",
    术语名称: row.displayName,
    源语言: row.sourceLanguage,
    源词: row.sourceText,
    别名: row.sourceAliases.join(" | "),
    目标语言: row.targetLanguage,
    处理方式:
      row.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL ? "保留原文" : "固定翻译",
    译法:
      row.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL && row.targetText === row.sourceText
        ? ""
        : row.targetText,
    备注: row.notes,
  }));
}

export function exportTermsTemplateRows() {
  return [
    {
      归属范围: "企业共享",
      术语类型: "固定译法",
      术语名称: "AudioClaw",
      源语言: "en",
      源词: "AudioClaw",
      别名: "audio claw | AUDIOCLAW",
      目标语言: "ja",
      处理方式: "固定翻译",
      译法: "オーディオクロー",
      备注: "产品名固定译法",
    },
    {
      归属范围: "我的术语",
      术语类型: "固定译法",
      术语名称: "サンライズ",
      源语言: "ja",
      源词: "サンライズ",
      别名: "",
      目标语言: "zh",
      处理方式: "保留原文",
      译法: "",
      备注: "保留原文",
    },
  ];
}

export function exportTermsToWorkbook(options = {}, xlsx = null) {
  const library = buildWorkbookHelpers(xlsx);
  const rows = exportTermsToRows(options);
  const workbook = library.utils.book_new();
  const worksheet = library.utils.json_to_sheet(rows, {
    header: [...TERMS_IMPORT_HEADERS],
  });
  library.utils.book_append_sheet(workbook, worksheet, XLSX_SHEET_NAME);
  return workbook;
}

export function exportTermsTemplateWorkbook(xlsx = null) {
  const library = buildWorkbookHelpers(xlsx);
  const workbook = library.utils.book_new();
  const worksheet = library.utils.json_to_sheet(exportTermsTemplateRows(), {
    header: [...TERMS_IMPORT_HEADERS],
  });
  library.utils.book_append_sheet(workbook, worksheet, XLSX_SHEET_NAME);
  return workbook;
}

export function readTermsWorkbook(workbook, options = {}, xlsx = null) {
  const library = buildWorkbookHelpers(xlsx);
  const sheetName = options.sheetName || workbook?.SheetNames?.[0];
  if (!sheetName || !workbook.Sheets?.[sheetName]) {
    throw new Error("未找到可导入的 Excel 工作表。");
  }
  const worksheet = workbook.Sheets[sheetName];
  const headerRows = library.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
  });
  const headers = (headerRows[0] || []).map((item) => ensureString(item));
  const missingHeaders = TERMS_IMPORT_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new Error(
      `Excel 模板不符合要求，缺少以下字段：${missingHeaders.join("、")}。请先导出当前术语表，或按固定模板补齐表头后再导入。`
    );
  }

  return library.utils.sheet_to_json(worksheet, { defval: "" });
}

export function importTermsFromWorkbook(workbook, options = {}, xlsx = null) {
  const rows = readTermsWorkbook(workbook, options, xlsx);
  return importTermsFromRows(rows, options);
}

export function readTermsWorkbookFromArrayBuffer(arrayBuffer, xlsx = null) {
  const library = buildWorkbookHelpers(xlsx);
  return library.read(arrayBuffer, { type: "array" });
}

export function buildTermRuntimeIndex(options = {}) {
  const { actor = resolveActor(), includeDisabled = false } = options;
  const user = assertActor(actor, "构建术语索引前需要有效登录用户。");

  const index = {
    fixedTranslationByPair: {},
    hotwordByLanguage: {
      zh: [],
      ja: [],
      en: [],
    },
  };

  getVisibleEntries(user)
    .filter((entry) => includeDisabled || entry.status === TERM_STATUS.ENABLED)
    .forEach((entry) => {
      entry.rules
        .filter((rule) => includeDisabled || rule.status === TERM_STATUS.ENABLED)
        .forEach((rule) => {
          const compiledRule = buildCompiledRule(entry, rule);
          if (entry.termType === TERM_TYPES.FIXED_TRANSLATION) {
            const pairKey = buildPairKey(rule.sourceLanguage, rule.targetLanguage);
            index.fixedTranslationByPair[pairKey] ||= [];
            index.fixedTranslationByPair[pairKey].push(compiledRule);
            return;
          }

          index.hotwordByLanguage[rule.sourceLanguage] ||= [];
          index.hotwordByLanguage[rule.sourceLanguage].push(compiledRule);
        });
    });

  Object.keys(index.fixedTranslationByPair).forEach((pairKey) => {
    index.fixedTranslationByPair[pairKey].sort(compareRulesByPriority);
  });
  Object.keys(index.hotwordByLanguage).forEach((language) => {
    index.hotwordByLanguage[language].sort(compareRulesByPriority);
  });

  return index;
}

export function findMatchingTermRules(payload) {
  const {
    actor = resolveActor(),
    text = "",
    sourceLanguage = "",
    targetLanguage = "",
    termType = TERM_TYPES.FIXED_TRANSLATION,
    limit,
  } = payload || {};
  const content = ensureString(text);
  if (!content) {
    return [];
  }

  const index = buildTermRuntimeIndex({ actor });
  const rules =
    termType === TERM_TYPES.FIXED_TRANSLATION
      ? index.fixedTranslationByPair[buildPairKey(sourceLanguage, targetLanguage)] || []
      : index.hotwordByLanguage[normalizeLanguage(sourceLanguage, "zh")] || [];

  const matches = rules
    .map((rule) => {
      const matchedSource = [...rule.sourceTerms, ...rule.sourceAliases].find((token) =>
        matchCandidate(content, token, rule)
      );
      if (!matchedSource) {
        return null;
      }
      return {
        ...rule,
        matchedSource,
      };
    })
    .filter(Boolean)
    .sort(compareRulesByPriority);

  const resolvedMatches = [];
  const conflictKeys = new Set();

  matches.forEach((match) => {
    const primarySource = (match.sourceTerms[0] || "").toLowerCase();
    const matchedSource = (match.matchedSource || "").toLowerCase();
    const pairKey = buildPairKey(match.sourceLanguage, match.targetLanguage);
    const conflictCandidates = [
      `${pairKey}::primary::${primarySource}`,
      `${pairKey}::matched::${matchedSource}`,
    ];

    if (conflictCandidates.some((key) => key && conflictKeys.has(key))) {
      return;
    }

    conflictCandidates.forEach((key) => {
      if (key) {
        conflictKeys.add(key);
      }
    });
    resolvedMatches.push(match);
  });

  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    return resolvedMatches.slice(0, Math.max(1, Math.floor(limit)));
  }

  return resolvedMatches;
}

export function buildGlossaryPromptTerms(matches = []) {
  return matches.map((match) => ({
    entryId: match.entryId,
    ruleId: match.ruleId,
    sourceText: match.matchedSource || match.sourceTerms[0] || "",
    targetText: match.targetText,
    targetMode: match.targetMode,
    scope: match.scope,
  }));
}

export function incrementTermHitCount({ entryId, ruleId, incrementBy = 1, hitAt = nowIso() }) {
  const safeIncrement = Math.max(1, ensureNumber(incrementBy, 1));
  let updatedEntry = null;

  updateStore((store) => {
    const entryIndex = findEntryIndex(store, entryId);
    if (entryIndex === -1) {
      return store;
    }

    const entry = normalizeEntry(store.entries[entryIndex]);
    entry.stats.hitCount += safeIncrement;
    entry.stats.lastHitAt = hitAt;
    entry.updatedAt = entry.updatedAt || hitAt;

    if (ruleId) {
      entry.rules = entry.rules.map((rule) => {
        if (rule.ruleId !== ruleId) {
          return rule;
        }
        return normalizeRule({
          ...rule,
          stats: {
            hitCount: rule.stats.hitCount + safeIncrement,
            lastHitAt: hitAt,
          },
          updatedAt: hitAt,
        });
      });
    }

    updatedEntry = normalizeEntry(entry);
    store.entries[entryIndex] = updatedEntry;
    return store;
  });

  return cloneJson(updatedEntry);
}

export function recordMatchedTermHits(matches = [], options = {}) {
  const { incrementBy = 1, hitAt = nowIso() } = options;
  return matches.map((match) =>
    incrementTermHitCount({
      entryId: match.entryId,
      ruleId: match.ruleId,
      incrementBy,
      hitAt,
    })
  );
}
