import { initPageAuth } from "../auth/page-auth.js";
import { formatNumber as formatLocaleNumber, getSystemLanguage, onSystemLanguageChange } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";
import {
  TERM_SCOPES,
  TERM_TARGET_MODES,
  TERM_TYPES,
  createTermEntry,
  deleteTermEntry,
  ensureTermsStore,
  exportTermsToWorkbook,
  getTermStats,
  importTermsFromWorkbook,
  readTermsWorkbookFromArrayBuffer,
  updateTermEntry,
  getVisibleTermEntries,
} from "../storage/terms-store.js";
import { getOngoingMeetingByUser } from "../storage/meeting-store.js";

const state = {
  user: null,
  activePanel: "mine",
  mineTypeFilter: "all",
  mineLanguageFilter: "all",
  mineSort: "hitCount",
  mineSearch: "",
  selectedEntryIds: new Set(),
  editor: {
    open: false,
    mode: "create",
    entryId: "",
    draft: null,
  },
};

const languageMeta = {
  zh: { label: "中", flag: "🇨🇳" },
  ja: { label: "日", flag: "🇯🇵" },
  en: { label: "英", flag: "🇺🇸" },
};

const TERMS_PAGE_TEXTS = {
  zh: {
    pageTitle: "AudioClaw · 术语热词库",
    newMeeting: "开始新会议",
    navMain: "主导航",
    navAssets: "资产库",
    navOrg: "组织",
    navMeetings: "我的会议",
    navVoiceprints: "声纹库",
    navTerms: "术语热词库",
    navAdmin: "组织管理",
    navSettings: "设置",
    adminBadge: "管理员",
    userPlan: `${t("role_admin", {}, "zh")} · 神泉科技`,
    headerTitle: "术语热词库",
    headerSub: "为专有名词、产品名、人名等定制识别与翻译规则",
    importExcel: "导入 Excel",
    export: "导出",
    create: "新增术语",
    statLabels: ["总术语数", "固定译法", "识别热词", "本周命中"],
    tabs: ["我的术语", "企业共享"],
    mineHeaders: ["源词", "译法", "类型", "语言对", "命中"],
    mineLanguageOptions: ["所有语言对", "中 ↔ 日", "中 ↔ 英", "日 ↔ 英", "多语言"],
    mineSortOptions: ["按命中次数", "按添加时间", "按字母排序"],
    mineSearchPlaceholder: "搜索源词或译文…",
    sharedSearchCta: "查看企业术语",
    sharedContactAdmin: "联系管理员",
    sharedManage: "管理员可维护",
    ruleSection: "语言规则",
    addRule: "新增规则",
    fieldScope: "归属范围",
    fieldType: "术语类型",
    fieldName: "术语名称",
    fieldNotes: "备注",
    fieldRuleTitle: "规则 {index}",
    fieldDeleteRule: "删除规则",
    fieldSourceLanguage: "源语言",
    fieldTargetLanguage: "目标语言",
    fieldSourceTerms: "源词",
    fieldAliases: "别名 / 缩写",
    fieldTargetMode: "输出模式",
    fieldTargetText: "译法",
    sourceTermsPlaceholder: "多个源词用 | 分隔",
    aliasesPlaceholder: "可选，多个值用 | 分隔",
    targetPlaceholder: "输出模式为保留原文时可留空",
    displayNamePlaceholder: "如 AudioClaw、神泉科技、田中健太",
    notesPlaceholder: "补充术语背景、维护说明或适用范围",
    notesHint: "保存后会写入 localStorage 的 ac_terms_v2，个人术语绑定当前账号，企业术语绑定当前公司。",
    editorSubtitleCreate: "保存后会立即写入本地术语库，并同步到当前页面。",
    editorSubtitleEdit: "修改后会直接覆盖当前术语条目及其语言规则。",
    editorScopePersonal: "我的术语",
    editorScopeEnterprise: "企业共享",
    typeFixed: "固定译法",
    typeHotword: "识别热词",
    targetModeTranslate: "固定译法",
    targetModePreserve: "保留原文",
    languageZh: "中文",
    languageJa: "日文",
    languageEn: "英文",
    multiLanguage: "多语言",
    preserveText: "不翻译（保留原文）",
    unnamedTerm: "未命名术语",
    unset: "未设置",
    close: "关闭",
    saveFailed: "保存失败，请稍后重试。",
    mineEmpty: "当前筛选条件下暂无术语",
    sharedEmpty: "当前企业共享术语为空",
    footerFiltered: "已应用筛选条件",
    footerMine: "当前显示个人术语",
    footerSharedReadonly: "仅企业管理员可编辑",
    footerSharedEditable: "当前账号可维护企业共享术语",
    statSubFixed: "译文锁定不变",
    statSubHotword: "识别热词资产",
    statSubWeekly: "基于当前术语累计命中",
    enterpriseTitle: "{company} 企业术语库已启用 · {count} 条共享术语自动同步",
    enterpriseSub: "由企业管理员统一维护，所有团队成员共享。最近更新 {time}。",
    sharedBannerTitle: "{company} · 企业术语库",
    sharedBannerSub: "由企业管理员维护 · {count} 条 · 最近更新 {time} · 所有团队成员共享",
    chipAll: "全部 {count}",
    chipFixed: "固定译法 {count}",
    chipHotword: "识别热词 {count}",
    tableShowing: "显示 {shown} / {total} 条",
    importCompleted: "Excel 导入完成。\n新增术语 {createdEntries} 条，更新术语 {updatedEntries} 条，新增规则 {createdRules} 条，跳过空行 {skippedRows} 行。",
    createFailed: "创建会议失败，请稍后重试。",
    statTotalSub: "个人 {personal} · 企业 {enterprise}",
    sharedMaintainer: "维护者",
    sharedUpdated: "更新时间",
    edit: "编辑",
    delete: "删除",
    xlsxLoadedButFailed: "Excel 组件已加载但未初始化成功，请刷新页面后重试。",
    xlsxLoadInitFailed: "Excel 组件加载完成但初始化失败，请刷新页面后重试。",
    xlsxLoadFailed: "Excel 组件加载失败，请刷新页面后重试。",
    xlsxLoadTimeout: "Excel 组件加载超时，请检查本地脚本是否可访问。",
    xlsxUnavailable: "Excel 能力尚未加载完成，请刷新页面后重试。",
    mergeConflict:
      "术语“{name}”在 {sourceLanguage} -> {targetLanguage} 下存在冲突规则，请保留一条后再保存。",
    validationNameRequired: "请填写术语名称。",
    validationRuleRequired: "至少需要保留一条规则。",
    validationRuleMissingSource: "第 {index} 条规则缺少源词。",
    validationRuleConflict: "同一个术语在 {sourceLanguage} -> {targetLanguage} 下只能保留一条规则。",
    validationRuleMissingTarget: "第 {index} 条规则缺少译法。",
  },
  ja: {
    pageTitle: "AudioClaw · 用語ライブラリ",
    newMeeting: "新しい会議を開始",
    navMain: "メイン",
    navAssets: "アセット",
    navOrg: "組織",
    navMeetings: "会議一覧",
    navVoiceprints: "声紋ライブラリ",
    navTerms: "用語ライブラリ",
    navAdmin: "組織管理",
    navSettings: "設定",
    adminBadge: "管理者",
    userPlan: `${t("role_admin", {}, "ja")} · 神泉科技`,
    headerTitle: "用語ライブラリ",
    headerSub: "固有名詞、製品名、人名などに対して認識と翻訳のルールを定義します",
    importExcel: "Excel を取り込む",
    export: "書き出す",
    create: "用語を追加",
    statLabels: ["総用語数", "固定訳", "認識ホットワード", "今週のヒット"],
    tabs: ["自分の用語", "企業共有"],
    mineHeaders: ["原語", "訳語", "タイプ", "言語ペア", "ヒット"],
    mineLanguageOptions: ["すべての言語ペア", "中 ↔ 日", "中 ↔ 英", "日 ↔ 英", "多言語"],
    mineSortOptions: ["命中回数順", "追加日時順", "アルファベット順"],
    mineSearchPlaceholder: "原語または訳語を検索…",
    sharedSearchCta: "企業用語を見る",
    sharedContactAdmin: "管理者に連絡",
    sharedManage: "管理者が編集可能",
    ruleSection: "言語ルール",
    addRule: "ルールを追加",
    fieldScope: "範囲",
    fieldType: "用語タイプ",
    fieldName: "用語名",
    fieldNotes: "メモ",
    fieldRuleTitle: "ルール {index}",
    fieldDeleteRule: "ルールを削除",
    fieldSourceLanguage: "原文言語",
    fieldTargetLanguage: "対象言語",
    fieldSourceTerms: "原語",
    fieldAliases: "別名 / 略称",
    fieldTargetMode: "出力モード",
    fieldTargetText: "訳語",
    sourceTermsPlaceholder: "複数ある場合は | で区切る",
    aliasesPlaceholder: "任意。複数ある場合は | で区切る",
    targetPlaceholder: "原文保持モードでは空欄でも可",
    displayNamePlaceholder: "例: AudioClaw、神泉科技、田中健太",
    notesPlaceholder: "用語の背景、運用メモ、適用範囲を記入",
    notesHint:
      "保存後は localStorage の ac_terms_v2 に書き込まれます。個人用語は現在のアカウント、企業用語は現在の会社に紐づきます。",
    editorSubtitleCreate: "保存後すぐにローカル用語ライブラリへ反映され、このページにも同期されます。",
    editorSubtitleEdit: "変更内容は現在の用語項目とその言語ルールを直接上書きします。",
    editorScopePersonal: "自分の用語",
    editorScopeEnterprise: "企業共有",
    typeFixed: "固定訳",
    typeHotword: "認識ホットワード",
    targetModeTranslate: "固定訳",
    targetModePreserve: "原文を保持",
    languageZh: "中国語",
    languageJa: "日本語",
    languageEn: "英語",
    multiLanguage: "多言語",
    preserveText: "翻訳しない（原文を保持）",
    unnamedTerm: "名称未設定の用語",
    unset: "未設定",
    close: "閉じる",
    saveFailed: "保存に失敗しました。後でもう一度お試しください。",
    mineEmpty: "現在の絞り込み条件に一致する用語はありません",
    sharedEmpty: "企業共有用語はまだありません",
    footerFiltered: "絞り込み条件を適用中",
    footerMine: "現在は個人用語を表示しています",
    footerSharedReadonly: "企業管理者のみ編集できます",
    footerSharedEditable: "現在のアカウントは企業共有用語を管理できます",
    statSubFixed: "訳語を固定します",
    statSubHotword: "認識ホットワード資産",
    statSubWeekly: "現在の用語に基づく累計ヒット数",
    enterpriseTitle: "{company} の企業用語ライブラリを有効化中 · {count} 件の共有用語を自動同期",
    enterpriseSub: "企業管理者が一元管理し、全メンバーで共有します。最終更新 {time}。",
    sharedBannerTitle: "{company} · 企業用語ライブラリ",
    sharedBannerSub: "企業管理者が管理 · {count} 件 · 最終更新 {time} · 全メンバーで共有",
    chipAll: "すべて {count}",
    chipFixed: "固定訳 {count}",
    chipHotword: "認識ホットワード {count}",
    tableShowing: "{shown} / {total} 件を表示",
    importCompleted:
      "Excel の取り込みが完了しました。\n新規用語 {createdEntries} 件、更新用語 {updatedEntries} 件、新規ルール {createdRules} 件、空行スキップ {skippedRows} 行。",
    createFailed: "会議の作成に失敗しました。後でもう一度お試しください。",
    statTotalSub: "個人 {personal} · 企業 {enterprise}",
    sharedMaintainer: "管理者",
    sharedUpdated: "更新日時",
    edit: "編集",
    delete: "削除",
    xlsxLoadedButFailed: "Excel コンポーネントは読み込まれましたが、初期化に失敗しました。ページを更新して再試行してください。",
    xlsxLoadInitFailed: "Excel コンポーネントの読み込み後に初期化できませんでした。ページを更新して再試行してください。",
    xlsxLoadFailed: "Excel コンポーネントの読み込みに失敗しました。ページを更新して再試行してください。",
    xlsxLoadTimeout: "Excel コンポーネントの読み込みがタイムアウトしました。ローカルスクリプトにアクセスできるか確認してください。",
    xlsxUnavailable: "Excel 機能の読み込みが完了していません。ページを更新して再試行してください。",
    mergeConflict:
      "用語「{name}」には {sourceLanguage} -> {targetLanguage} で競合するルールがあります。1 件だけ残してから保存してください。",
    validationNameRequired: "用語名を入力してください。",
    validationRuleRequired: "少なくとも 1 つのルールを残してください。",
    validationRuleMissingSource: "ルール {index} に原語がありません。",
    validationRuleConflict: "同じ用語では {sourceLanguage} -> {targetLanguage} のルールを 1 件だけ残せます。",
    validationRuleMissingTarget: "ルール {index} に訳語がありません。",
  },
  en: {
    pageTitle: "AudioClaw · Term Library",
    newMeeting: "Start New Meeting",
    navMain: "Main",
    navAssets: "Assets",
    navOrg: "Organization",
    navMeetings: "My Meetings",
    navVoiceprints: "Voiceprints",
    navTerms: "Term Library",
    navAdmin: "Organization",
    navSettings: "Settings",
    adminBadge: "Admin",
    userPlan: `${t("role_admin", {}, "en")} · Shenquan Technology`,
    headerTitle: "Term Library",
    headerSub: "Define recognition and translation rules for proper nouns, product names, and people names",
    importExcel: "Import Excel",
    export: "Export",
    create: "Add Term",
    statLabels: ["Total Terms", "Fixed Translations", "Recognition Hotwords", "Weekly Hits"],
    tabs: ["My Terms", "Enterprise Shared"],
    mineHeaders: ["Source", "Translation", "Type", "Language Pair", "Hits"],
    mineLanguageOptions: ["All Language Pairs", "ZH ↔ JA", "ZH ↔ EN", "JA ↔ EN", "Multilingual"],
    mineSortOptions: ["By Hit Count", "By Added Time", "Alphabetical"],
    mineSearchPlaceholder: "Search source terms or translations...",
    sharedSearchCta: "View Enterprise Terms",
    sharedContactAdmin: "Contact Admin",
    sharedManage: "Admin Can Manage",
    ruleSection: "Language Rules",
    addRule: "Add Rule",
    fieldScope: "Scope",
    fieldType: "Term Type",
    fieldName: "Term Name",
    fieldNotes: "Notes",
    fieldRuleTitle: "Rule {index}",
    fieldDeleteRule: "Delete Rule",
    fieldSourceLanguage: "Source Language",
    fieldTargetLanguage: "Target Language",
    fieldSourceTerms: "Source Terms",
    fieldAliases: "Aliases / Abbreviations",
    fieldTargetMode: "Output Mode",
    fieldTargetText: "Translation",
    sourceTermsPlaceholder: "Separate multiple source terms with |",
    aliasesPlaceholder: "Optional. Separate multiple values with |",
    targetPlaceholder: "Leave blank when preserving the original text",
    displayNamePlaceholder: "Example: AudioClaw, Shenquan Technology, Kenta Tanaka",
    notesPlaceholder: "Add background, maintenance notes, or usage scope",
    notesHint:
      "After saving, data is written into localStorage key ac_terms_v2. Personal terms stay bound to the current account, and enterprise terms stay bound to the current company.",
    editorSubtitleCreate: "After saving, the local term library updates immediately and syncs back to this page.",
    editorSubtitleEdit: "Changes overwrite the current term entry and its language rules directly.",
    editorScopePersonal: "My Terms",
    editorScopeEnterprise: "Enterprise Shared",
    typeFixed: "Fixed Translation",
    typeHotword: "Recognition Hotword",
    targetModeTranslate: "Fixed Translation",
    targetModePreserve: "Preserve Original",
    languageZh: "Chinese",
    languageJa: "Japanese",
    languageEn: "English",
    multiLanguage: "Multilingual",
    preserveText: "Do not translate (preserve original)",
    unnamedTerm: "Untitled Term",
    unset: "Not Set",
    close: "Close",
    saveFailed: "Save failed. Please try again later.",
    mineEmpty: "No terms match the current filters",
    sharedEmpty: "No enterprise shared terms yet",
    footerFiltered: "Filters applied",
    footerMine: "Showing personal terms",
    footerSharedReadonly: "Only enterprise admins can edit",
    footerSharedEditable: "This account can manage enterprise shared terms",
    statSubFixed: "Translation stays locked",
    statSubHotword: "Recognition hotword assets",
    statSubWeekly: "Accumulated hits based on current terms",
    enterpriseTitle: "{company} enterprise term library enabled · {count} shared terms auto-synced",
    enterpriseSub: "Maintained centrally by enterprise admins and shared with the whole team. Last updated {time}.",
    sharedBannerTitle: "{company} · Enterprise Term Library",
    sharedBannerSub: "Maintained by enterprise admins · {count} entries · Updated {time} · Shared by the whole team",
    chipAll: "All {count}",
    chipFixed: "Fixed {count}",
    chipHotword: "Hotwords {count}",
    tableShowing: "Showing {shown} / {total}",
    importCompleted:
      "Excel import completed.\nCreated {createdEntries} terms, updated {updatedEntries} terms, added {createdRules} rules, skipped {skippedRows} empty rows.",
    createFailed: "Failed to create the meeting. Please try again later.",
    statTotalSub: "Personal {personal} · Enterprise {enterprise}",
    sharedMaintainer: "Maintainer",
    sharedUpdated: "Updated",
    edit: "Edit",
    delete: "Delete",
    xlsxLoadedButFailed: "The Excel component loaded, but initialization failed. Refresh the page and try again.",
    xlsxLoadInitFailed: "The Excel component finished loading, but initialization failed. Refresh the page and try again.",
    xlsxLoadFailed: "Failed to load the Excel component. Refresh the page and try again.",
    xlsxLoadTimeout: "Loading the Excel component timed out. Check whether the local script is accessible.",
    xlsxUnavailable: "Excel capability has not finished loading. Refresh the page and try again.",
    mergeConflict:
      'Term "{name}" has conflicting rules under {sourceLanguage} -> {targetLanguage}. Keep only one rule before saving.',
    validationNameRequired: "Please enter a term name.",
    validationRuleRequired: "Keep at least one rule.",
    validationRuleMissingSource: "Rule {index} is missing source terms.",
    validationRuleConflict:
      "Only one rule can be kept for the same term under {sourceLanguage} -> {targetLanguage}.",
    validationRuleMissingTarget: "Rule {index} is missing a translation.",
  },
};

function tt(key, params = {}, language = getSystemLanguage()) {
  const template = TERMS_PAGE_TEXTS[language]?.[key] ?? TERMS_PAGE_TEXTS.zh[key] ?? key;
  return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
    return result.replaceAll(`{${paramKey}}`, String(paramValue));
  }, template);
}

function navigateToMeeting(meetingId) {
  const targetUrl = new URL("./index.html", window.location.href);
  targetUrl.searchParams.set("meetingId", meetingId);
  targetUrl.searchParams.set("mode", "live");
  window.location.href = targetUrl.toString();
}

function navigateToHomeCreateMeeting() {
  const targetUrl = new URL("./home.html", window.location.href);
  targetUrl.searchParams.set("action", "create-meeting");
  window.location.href = targetUrl.toString();
}

function getMeetingEntryLabel(hasOngoingMeeting) {
  const language = getSystemLanguage();
  if (hasOngoingMeeting) {
    return language === "ja" ? "現在の会議に戻る" : language === "en" ? "Back To Current Meeting" : "回到当前会议";
  }
  return tt("newMeeting");
}

function handleMeetingEntry() {
  const ongoingMeeting = state.user?.id ? getOngoingMeetingByUser(state.user.id) : null;
  if (ongoingMeeting) {
    navigateToMeeting(ongoingMeeting.id);
    return;
  }
  navigateToHomeCreateMeeting();
}

function bindMeetingEntryButton() {
  const button = document.querySelector(".new-meeting-btn");
  if (!button || button.dataset.bound === "true") {
    return;
  }
  button.dataset.bound = "true";
  button.addEventListener("click", handleMeetingEntry);
}

function applyTermsStaticTranslations() {
  document.title = tt("pageTitle");

  const newMeeting = document.querySelector(".new-meeting-btn span");
  if (newMeeting) newMeeting.textContent = getMeetingEntryLabel(Boolean(state.user?.id && getOngoingMeetingByUser(state.user.id)));

  const navTitles = document.querySelectorAll(".nav-title");
  if (navTitles[0]) navTitles[0].textContent = tt("navMain");
  if (navTitles[1]) navTitles[1].textContent = tt("navAssets");
  if (navTitles[2]) navTitles[2].textContent = tt("navOrg");

  const navLabels = document.querySelectorAll(".nav-item span:not(.nav-count):not(.admin-badge)");
  if (navLabels[0]) navLabels[0].textContent = tt("navMeetings");
  if (navLabels[1]) navLabels[1].textContent = tt("navVoiceprints");
  if (navLabels[2]) navLabels[2].textContent = tt("navTerms");
  if (navLabels[3]) navLabels[3].textContent = tt("navAdmin");
  if (navLabels[4]) navLabels[4].textContent = tt("navSettings");

  const adminBadge = document.querySelector(".admin-badge");
  if (adminBadge) adminBadge.textContent = tt("adminBadge");

  const userPlan = document.querySelector(".user-plan");
  if (userPlan) userPlan.textContent = tt("userPlan");

  const pageTitle = document.querySelector(".page-title");
  if (pageTitle) pageTitle.textContent = tt("headerTitle");
  const pageSub = document.querySelector(".page-sub");
  if (pageSub) pageSub.textContent = tt("headerSub");

  const topButtons = document.querySelectorAll(".top-actions .btn");
  if (topButtons[0]) topButtons[0].lastChild.textContent = ` ${tt("importExcel")}`;
  if (topButtons[1]) topButtons[1].lastChild.textContent = ` ${tt("export")}`;
  if (topButtons[2]) topButtons[2].lastChild.textContent = ` ${tt("create")}`;

  const statLabels = document.querySelectorAll(".stats-row .stat-label");
  const statLabelTexts = tt("statLabels");
  statLabels.forEach((node, index) => {
    node.textContent = statLabelTexts[index] || node.textContent;
  });

  const tabs = document.querySelectorAll(".tabs .tab");
  const tabTexts = tt("tabs");
  tabs.forEach((tab, index) => {
    const textNode = Array.from(tab.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = `${tabTexts[index] || ""} `;
    }
  });

  const mineHeaders = document.querySelectorAll('.panel[data-panel="mine"] thead th');
  [1, 3, 4, 5, 6].forEach((headerIndex, index) => {
    if (mineHeaders[headerIndex]) {
      mineHeaders[headerIndex].textContent = tt("mineHeaders")[index];
    }
  });

  const languageFilter = $("#mineLanguageFilter");
  if (languageFilter) {
    Array.from(languageFilter.options).forEach((option, index) => {
      option.textContent = tt("mineLanguageOptions")[index] || option.textContent;
    });
  }

  const sortSelect = $("#mineSortSelect");
  if (sortSelect) {
    Array.from(sortSelect.options).forEach((option, index) => {
      option.textContent = tt("mineSortOptions")[index] || option.textContent;
    });
  }

  const mineSearchInput = $("#mineSearchInput");
  if (mineSearchInput) mineSearchInput.placeholder = tt("mineSearchPlaceholder");
}

function $(selector) {
  return document.querySelector(selector);
}

let xlsxLoadingPromise = null;

async function ensureXlsxLibrary() {
  if (window.XLSX?.utils) {
    return window.XLSX;
  }

  if (!xlsxLoadingPromise) {
    xlsxLoadingPromise = new Promise((resolve, reject) => {
      const resolveLibrary = () => {
        if (window.XLSX?.utils) {
          resolve(window.XLSX);
          return true;
        }
        return false;
      };

      const existingScript = document.querySelector('script[data-xlsx-loader="true"]');
      if (existingScript) {
        if (resolveLibrary()) {
          return;
        }
        if (existingScript.dataset.loaded === "true") {
          reject(new Error(tt("xlsxLoadedButFailed")));
          return;
        }
        existingScript.addEventListener(
          "load",
          () => {
            if (!resolveLibrary()) {
              reject(new Error(tt("xlsxLoadInitFailed")));
            }
          },
          { once: true }
        );
        existingScript.addEventListener(
          "error",
          () => reject(new Error(tt("xlsxLoadFailed"))),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = new URL("../../app/vendor/xlsx.full.min.js", import.meta.url).href;
      script.async = true;
      script.dataset.xlsxLoader = "true";
      script.onload = () => {
        script.dataset.loaded = "true";
        if (!resolveLibrary()) {
          reject(new Error(tt("xlsxLoadInitFailed")));
        }
      };
      script.onerror = () => reject(new Error(tt("xlsxLoadFailed")));
      document.head.appendChild(script);

      window.setTimeout(() => {
        if (!resolveLibrary()) {
          reject(new Error(tt("xlsxLoadTimeout")));
        }
      }, 5000);
    }).finally(() => {
      if (!window.XLSX?.utils) {
        xlsxLoadingPromise = null;
      }
    });
  }

  const library = await xlsxLoadingPromise;
  if (!library?.utils) {
    throw new Error(tt("xlsxUnavailable"));
  }
  return library;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEmptyRuleDraft() {
  return {
    sourceLanguage: "zh",
    targetLanguage: "ja",
    sourceTermsText: "",
    sourceAliasesText: "",
    targetMode: TERM_TARGET_MODES.TRANSLATE,
    targetText: "",
  };
}

function createEntryDraft(scope = TERM_SCOPES.PERSONAL) {
  return {
    scope,
    termType: TERM_TYPES.FIXED_TRANSLATION,
    displayName: "",
    notes: "",
    rules: [createEmptyRuleDraft()],
  };
}

function splitPipeSeparated(value) {
  return String(value || "")
    .split(/[|;；、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getEntryById(entryId) {
  return getEntries().find((entry) => entry.entryId === entryId) || null;
}

function buildDraftFromEntry(entry) {
  return {
    scope: entry.scope,
    termType: entry.termType,
    displayName: entry.displayName || "",
    notes: entry.notes || "",
    rules: (entry.rules || []).map((rule) => ({
      ruleId: rule.ruleId,
      sourceLanguage: rule.sourceLanguage,
      targetLanguage: rule.targetLanguage,
      sourceTermsText: (rule.sourceTerms || []).join(" | "),
      sourceAliasesText: (rule.sourceAliases || []).join(" | "),
      targetMode: rule.targetMode,
      targetText:
        rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL &&
        rule.targetText === (rule.sourceTerms || [])[0]
          ? ""
          : rule.targetText || "",
    })),
  };
}

function getDefaultCreateScope() {
  if (state.user?.role === "admin" && state.activePanel === "shared") {
    return TERM_SCOPES.ENTERPRISE;
  }
  return TERM_SCOPES.PERSONAL;
}

function buildEntryPayloadFromDraft(draft) {
  const normalizedRules = (draft.rules || []).map((rule) => ({
    ...(rule.ruleId ? { ruleId: rule.ruleId } : {}),
    sourceLanguage: rule.sourceLanguage,
    targetLanguage: rule.targetLanguage,
    sourceTerms: splitPipeSeparated(rule.sourceTermsText),
    sourceAliases: splitPipeSeparated(rule.sourceAliasesText),
    targetMode: rule.targetMode,
    targetText: String(rule.targetText || "").trim(),
  }));

  return {
    scope: draft.scope,
    termType: draft.termType,
    displayName: String(draft.displayName || "").trim(),
    notes: String(draft.notes || "").trim(),
    rules: normalizedRules,
  };
}

function normalizeDisplayNameForMerge(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRuleValuesForMerge(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .map((item) => item.toLowerCase())
    )
  ).sort();
}

function buildRulePairKey(rule) {
  return `${rule.sourceLanguage}->${rule.targetLanguage}`;
}

function buildRuleContentFingerprint(rule) {
  return [
    buildRulePairKey(rule),
    rule.targetMode,
    String(rule.targetText || "").trim().toLowerCase(),
    normalizeRuleValuesForMerge(rule.sourceTerms).join("|"),
    normalizeRuleValuesForMerge(rule.sourceAliases).join("|"),
  ].join("::");
}

function toMergeableRule(rule = {}) {
  return {
    ...(rule.ruleId ? { ruleId: rule.ruleId } : {}),
    sourceLanguage: rule.sourceLanguage,
    targetLanguage: rule.targetLanguage,
    sourceTerms: splitPipeSeparated(rule.sourceTermsText || rule.sourceTerms),
    sourceAliases: splitPipeSeparated(rule.sourceAliasesText || rule.sourceAliases),
    targetMode: rule.targetMode,
    targetText: String(rule.targetText || "").trim(),
  };
}

function mergeRulesForSave(existingRules = [], incomingRules = [], displayName = "") {
  const mergedRules = [...existingRules.map((rule) => ({ ...rule }))];

  incomingRules.forEach((rule) => {
    const incomingRule = toMergeableRule(rule);
    const pairKey = buildRulePairKey(incomingRule);
    const existingIndex = mergedRules.findIndex((item) => buildRulePairKey(item) === pairKey);
    if (existingIndex === -1) {
      mergedRules.push(incomingRule);
      return;
    }

    const existingRule = mergedRules[existingIndex];
    if (buildRuleContentFingerprint(existingRule) === buildRuleContentFingerprint(incomingRule)) {
      return;
    }

    throw new Error(
      tt("mergeConflict", {
        name: displayName || tt("unnamedTerm"),
        sourceLanguage: incomingRule.sourceLanguage,
        targetLanguage: incomingRule.targetLanguage,
      })
    );
  });

  return mergedRules;
}

function findMatchingEntriesForPayload(payload, excludeEntryId = "") {
  const normalizedName = normalizeDisplayNameForMerge(payload.displayName);
  if (!normalizedName) {
    return [];
  }

  return getEntries().filter(
    (entry) =>
      entry.entryId !== excludeEntryId &&
      entry.scope === payload.scope &&
      entry.termType === payload.termType &&
      normalizeDisplayNameForMerge(entry.displayName) === normalizedName
  );
}

function buildPayloadFromEntry(entry) {
  return {
    scope: entry.scope,
    termType: entry.termType,
    displayName: entry.displayName || "",
    notes: entry.notes || "",
    rules: (entry.rules || []).map((rule) => toMergeableRule(rule)),
  };
}

function saveWithMergedEntries(payload) {
  const matchingEntries = findMatchingEntriesForPayload(payload);
  if (!matchingEntries.length) {
    return createTermEntry(payload, state.user);
  }

  const [targetEntry, ...duplicateEntries] = matchingEntries;
  let mergedRules = buildPayloadFromEntry(targetEntry).rules;
  duplicateEntries.forEach((entry) => {
    mergedRules = mergeRulesForSave(mergedRules, buildPayloadFromEntry(entry).rules, payload.displayName);
  });
  mergedRules = mergeRulesForSave(mergedRules, payload.rules, payload.displayName);

  const updatedEntry = updateTermEntry(
    targetEntry.entryId,
    {
      ...payload,
      notes: payload.notes || targetEntry.notes || "",
      rules: mergedRules,
    },
    state.user
  );

  duplicateEntries.forEach((entry) => {
    deleteTermEntry(entry.entryId, state.user);
  });

  return updatedEntry;
}

function saveWithEditedEntry(payload, currentEntryId) {
  const currentEntry = getEntryById(currentEntryId);
  const matchingEntries = findMatchingEntriesForPayload(payload, currentEntryId);
  let mergedRules = payload.rules;

  matchingEntries.forEach((entry) => {
    mergedRules = mergeRulesForSave(
      buildPayloadFromEntry(entry).rules,
      mergedRules,
      payload.displayName
    );
  });

  const updatedEntry = updateTermEntry(
    currentEntryId,
    {
      ...payload,
      notes: payload.notes || currentEntry?.notes || matchingEntries[0]?.notes || "",
      rules: mergedRules,
    },
    state.user
  );

  matchingEntries.forEach((entry) => {
    deleteTermEntry(entry.entryId, state.user);
  });

  return updatedEntry;
}

function validateEntryDraft(draft) {
  if (!String(draft.displayName || "").trim()) {
    return tt("validationNameRequired");
  }

  if (!Array.isArray(draft.rules) || !draft.rules.length) {
    return tt("validationRuleRequired");
  }

  const pairSet = new Set();
  for (const [index, rule] of draft.rules.entries()) {
    if (!splitPipeSeparated(rule.sourceTermsText).length) {
      return tt("validationRuleMissingSource", { index: index + 1 });
    }

    const pairKey = `${rule.sourceLanguage}->${rule.targetLanguage}`;
    if (pairSet.has(pairKey)) {
      return tt("validationRuleConflict", {
        sourceLanguage: rule.sourceLanguage,
        targetLanguage: rule.targetLanguage,
      });
    }
    pairSet.add(pairKey);

    if (
      rule.targetMode === TERM_TARGET_MODES.TRANSLATE &&
      !String(rule.targetText || "").trim()
    ) {
      return tt("validationRuleMissingTarget", { index: index + 1 });
    }
  }

  return "";
}

function getEditorNodes() {
  return {
    overlay: $("#termsEditorOverlay"),
    title: $("#termsEditorTitle"),
    subtitle: $("#termsEditorSubtitle"),
    form: $("#termsEditorForm"),
    scope: $("#termScopeField"),
    type: $("#termTypeField"),
    displayName: $("#termDisplayNameField"),
    notes: $("#termNotesField"),
    rulesList: $("#termRulesList"),
    error: $("#termsEditorError"),
    save: $("#termsEditorSave"),
    addRule: $("#termsEditorAddRule"),
  };
}

function ensureEditorModal() {
  if ($("#termsEditorOverlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "termsEditorOverlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="termsEditorTitle">
      <div class="modal-header">
        <div class="modal-title-wrap">
          <div class="modal-title" id="termsEditorTitle">新增术语</div>
          <div class="modal-subtitle" id="termsEditorSubtitle">${tt("editorSubtitleCreate")}</div>
        </div>
        <button class="modal-close" type="button" data-editor-action="close" aria-label="${tt("close")}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <form id="termsEditorForm">
          <div class="form-grid">
            <label class="form-field">
              <span class="form-label">${tt("fieldScope")}</span>
              <select class="select" id="termScopeField">
                <option value="personal">${tt("editorScopePersonal")}</option>
                <option value="enterprise">${tt("editorScopeEnterprise")}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">${tt("fieldType")}</span>
              <select class="select" id="termTypeField">
                <option value="fixed_translation">${tt("typeFixed")}</option>
                <option value="recognition_hotword">${tt("typeHotword")}</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">${tt("fieldName")}</span>
              <input class="input" id="termDisplayNameField" placeholder="${tt("displayNamePlaceholder")}">
            </label>
            <label class="form-field full-width">
              <span class="form-label">${tt("fieldNotes")}</span>
              <textarea class="textarea" id="termNotesField" placeholder="${tt("notesPlaceholder")}"></textarea>
              <span class="field-hint">${tt("notesHint")}</span>
            </label>
          </div>
        </form>
        <div class="section-title">
          <strong>${tt("ruleSection")}</strong>
          <button class="btn sm" type="button" id="termsEditorAddRule">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            ${tt("addRule")}
          </button>
        </div>
        <div class="rule-list" id="termRulesList"></div>
      </div>
      <div class="modal-footer">
        <div class="modal-error" id="termsEditorError"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn" type="button" data-editor-action="close">${t("common_cancel")}</button>
          <button class="btn primary" type="button" id="termsEditorSave">${tt("create")}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function renderRuleCard(rule, index, totalCount) {
  const targetDisabled = rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL;
  return `
    <div class="rule-card" data-rule-index="${index}">
      <div class="rule-card-header">
        <div class="rule-card-title">${tt("fieldRuleTitle", { index: index + 1 })}</div>
        <button class="btn sm danger" type="button" data-editor-action="remove-rule" ${
          totalCount <= 1 ? "disabled" : ""
        }>${tt("fieldDeleteRule")}</button>
      </div>
      <div class="rule-card-grid">
        <label class="form-field">
          <span class="form-label">${tt("fieldSourceLanguage")}</span>
          <select class="select" data-rule-field="sourceLanguage">
            <option value="zh" ${rule.sourceLanguage === "zh" ? "selected" : ""}>${tt("languageZh")}</option>
            <option value="ja" ${rule.sourceLanguage === "ja" ? "selected" : ""}>${tt("languageJa")}</option>
            <option value="en" ${rule.sourceLanguage === "en" ? "selected" : ""}>${tt("languageEn")}</option>
          </select>
        </label>
        <label class="form-field">
          <span class="form-label">${tt("fieldTargetLanguage")}</span>
          <select class="select" data-rule-field="targetLanguage">
            <option value="zh" ${rule.targetLanguage === "zh" ? "selected" : ""}>${tt("languageZh")}</option>
            <option value="ja" ${rule.targetLanguage === "ja" ? "selected" : ""}>${tt("languageJa")}</option>
            <option value="en" ${rule.targetLanguage === "en" ? "selected" : ""}>${tt("languageEn")}</option>
          </select>
        </label>
        <label class="form-field">
          <span class="form-label">${tt("fieldSourceTerms")}</span>
          <input class="input" data-rule-field="sourceTermsText" value="${escapeHtml(
            rule.sourceTermsText
          )}" placeholder="${tt("sourceTermsPlaceholder")}">
        </label>
        <label class="form-field">
          <span class="form-label">${tt("fieldAliases")}</span>
          <input class="input" data-rule-field="sourceAliasesText" value="${escapeHtml(
            rule.sourceAliasesText
          )}" placeholder="${tt("aliasesPlaceholder")}">
        </label>
        <label class="form-field">
          <span class="form-label">${tt("fieldTargetMode")}</span>
          <select class="select" data-rule-field="targetMode">
            <option value="translate" ${
              rule.targetMode === TERM_TARGET_MODES.TRANSLATE ? "selected" : ""
            }>${tt("targetModeTranslate")}</option>
            <option value="preserve_original" ${
              rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL ? "selected" : ""
            }>${tt("targetModePreserve")}</option>
          </select>
        </label>
        <label class="form-field full-width">
          <span class="form-label">${tt("fieldTargetText")}</span>
          <input class="input" data-rule-field="targetText" value="${escapeHtml(
            rule.targetText
          )}" placeholder="${tt("targetPlaceholder")}" ${targetDisabled ? "disabled" : ""}>
          <span class="field-hint">${
            targetDisabled ? t("terms_rule_preserve_hint") : t("terms_rule_translate_hint")
          }</span>
        </label>
      </div>
    </div>
  `;
}

function readEditorDraftFromDom() {
  const nodes = getEditorNodes();
  if (!nodes.overlay) {
    return state.editor.draft;
  }

  const rules = Array.from(nodes.rulesList.querySelectorAll("[data-rule-index]")).map((card) => ({
    ruleId: state.editor.draft?.rules?.[Number(card.dataset.ruleIndex)]?.ruleId || "",
    sourceLanguage: card.querySelector('[data-rule-field="sourceLanguage"]').value,
    targetLanguage: card.querySelector('[data-rule-field="targetLanguage"]').value,
    sourceTermsText: card.querySelector('[data-rule-field="sourceTermsText"]').value.trim(),
    sourceAliasesText: card.querySelector('[data-rule-field="sourceAliasesText"]').value.trim(),
    targetMode: card.querySelector('[data-rule-field="targetMode"]').value,
    targetText: card.querySelector('[data-rule-field="targetText"]').value.trim(),
  }));

  return {
    scope: nodes.scope.value,
    termType: nodes.type.value,
    displayName: nodes.displayName.value.trim(),
    notes: nodes.notes.value.trim(),
    rules,
  };
}

function renderEditorModal() {
  ensureEditorModal();
  const nodes = getEditorNodes();
  const draft = state.editor.draft || createEntryDraft(getDefaultCreateScope());
  const isEdit = state.editor.mode === "edit";
  const canChooseEnterprise = state.user.role === "admin";

  nodes.overlay.classList.toggle("open", state.editor.open);
  nodes.title.textContent = isEdit ? t("terms_edit_title") : t("terms_create_title");
  nodes.subtitle.textContent = isEdit
    ? tt("editorSubtitleEdit")
    : tt("editorSubtitleCreate");
  nodes.scope.value = draft.scope;
  nodes.type.value = draft.termType;
  nodes.displayName.value = draft.displayName;
  nodes.notes.value = draft.notes || "";
  nodes.scope.disabled = isEdit || !canChooseEnterprise;
  nodes.scope.querySelector('option[value="enterprise"]').disabled = !canChooseEnterprise;
  nodes.rulesList.innerHTML = draft.rules
    .map((rule, index) => renderRuleCard(rule, index, draft.rules.length))
    .join("");
  nodes.error.textContent = "";
  nodes.save.textContent = isEdit ? t("terms_save_edit") : t("terms_save_create");
  nodes.addRule.disabled = false;

  if (state.editor.open) {
    nodes.displayName.focus();
  }
}

function openEditorModal(options = {}) {
  const { mode = "create", entry = null, scope = getDefaultCreateScope() } = options;
  state.editor = {
    open: true,
    mode,
    entryId: entry?.entryId || "",
    draft: entry ? buildDraftFromEntry(entry) : createEntryDraft(scope),
  };
  renderEditorModal();
}

function closeEditorModal() {
  state.editor = {
    open: false,
    mode: "create",
    entryId: "",
    draft: null,
  };
  renderEditorModal();
}

function saveEditorModal() {
  const nodes = getEditorNodes();
  const draft = readEditorDraftFromDom();
  const validationError = validateEntryDraft(draft);
  if (validationError) {
    nodes.error.textContent = validationError;
    return;
  }

  const payload = buildEntryPayloadFromDraft(draft);

  try {
    if (state.editor.mode === "edit" && state.editor.entryId) {
      saveWithEditedEntry(payload, state.editor.entryId);
    } else {
      saveWithMergedEntries(payload);
    }
    closeEditorModal();
    renderAll();
  } catch (error) {
    nodes.error.textContent = error?.message || tt("saveFailed");
  }
}

function getEntries() {
  return getVisibleTermEntries(state.user);
}

function getEntriesByScope(scope) {
  return getEntries().filter((entry) => entry.scope === scope);
}

function formatNumber(value) {
  return formatLocaleNumber(value || 0, {}, getSystemLanguage());
}

function formatRelativeTime(value) {
  if (!value) {
    return getSystemLanguage() === "ja" ? "たった今" : getSystemLanguage() === "en" ? "Just now" : "刚刚";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return getSystemLanguage() === "ja" ? "たった今" : getSystemLanguage() === "en" ? "Just now" : "刚刚";
  }

  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < hour) {
    const minutes = Math.max(1, Math.floor(diff / minute));
    return getSystemLanguage() === "ja"
      ? `${minutes} 分前`
      : getSystemLanguage() === "en"
        ? `${minutes} minutes ago`
        : `${minutes} 分钟前`;
  }
  if (diff < day) {
    const hours = Math.floor(diff / hour);
    return getSystemLanguage() === "ja"
      ? `${hours} 時間前`
      : getSystemLanguage() === "en"
        ? `${hours} hours ago`
        : `${hours} 小时前`;
  }
  if (diff < week) {
    const days = Math.floor(diff / day);
    return getSystemLanguage() === "ja"
      ? `${days} 日前`
      : getSystemLanguage() === "en"
        ? `${days} days ago`
        : `${days} 天前`;
  }
  const weeks = Math.floor(diff / week);
  return getSystemLanguage() === "ja"
    ? `${weeks} 週間前`
    : getSystemLanguage() === "en"
      ? `${weeks} weeks ago`
      : `${weeks} 周前`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTypeMeta(termType) {
  if (termType === TERM_TYPES.RECOGNITION_HOTWORD) {
    return {
      label: tt("typeHotword"),
      className: "auto",
    };
  }
  return {
    label: tt("typeFixed"),
    className: "locked",
  };
}

function getRuleDisplayText(rule, termType) {
  if (rule.targetMode === TERM_TARGET_MODES.PRESERVE_ORIGINAL) {
    if (termType === TERM_TYPES.RECOGNITION_HOTWORD) {
      return tt("preserveText");
    }
    return `${rule.sourceTerms[0] || ""}（${tt("targetModePreserve")}）`;
  }

  return rule.targetText || "";
}

function buildLanguageTag(entry) {
  const rules = Array.isArray(entry.rules) ? entry.rules : [];
  if (rules.length !== 1) {
    return {
      label: tt("multiLanguage"),
      arrow: "⇄",
      key: "multi",
    };
  }

  const [rule] = rules;
  if (rule.sourceLanguage === rule.targetLanguage) {
    return {
      label: tt("multiLanguage"),
      arrow: "→",
      key: "multi",
    };
  }

  const pair = [rule.sourceLanguage, rule.targetLanguage].sort().join("-");
  const source = languageMeta[rule.sourceLanguage];
  const target = languageMeta[rule.targetLanguage];
  return {
    label: `${source.flag} ${source.label} → ${target.flag} ${target.label}`,
    arrow: "→",
    key: pair,
  };
}

function buildEntrySearchText(entry) {
  const fragments = [
    entry.displayName,
    entry.notes,
    entry.updatedByName,
    entry.createdByName,
  ];

  entry.rules.forEach((rule) => {
    fragments.push(...rule.sourceTerms);
    fragments.push(...rule.sourceAliases);
    fragments.push(getRuleDisplayText(rule, entry.termType));
  });

  return fragments.join(" ").toLowerCase();
}

function buildEntryViewModel(entry) {
  const rules = Array.isArray(entry.rules) ? entry.rules : [];
  const typeMeta = getTypeMeta(entry.termType);
  const languageTag = buildLanguageTag(entry);
  const targetParts = [];
  const seenTargets = new Set();

  rules.forEach((rule) => {
    const displayText = getRuleDisplayText(rule, entry.termType).trim();
    if (displayText && !seenTargets.has(displayText)) {
      seenTargets.add(displayText);
      targetParts.push(displayText);
    }
  });

  return {
    entryId: entry.entryId,
    displayName: entry.displayName || rules[0]?.sourceTerms?.[0] || tt("unnamedTerm"),
    targetText: targetParts.join(" / "),
    termType: entry.termType,
    hitCount: entry.stats?.hitCount || 0,
    updatedAt: entry.updatedAt,
    updatedByName: entry.updatedByName || entry.createdByName || tt("unset"),
    typeMeta,
    languageTag,
    rules,
    searchText: buildEntrySearchText(entry),
    createdAt: entry.createdAt,
  };
}

function matchesMineFilters(viewModel) {
  if (
    state.mineTypeFilter !== "all" &&
    (state.mineTypeFilter === TERM_TYPES.FIXED_TRANSLATION ||
      state.mineTypeFilter === TERM_TYPES.RECOGNITION_HOTWORD)
  ) {
    if (viewModel.termType !== state.mineTypeFilter) {
      return false;
    }
  }

  if (
    state.mineLanguageFilter !== "all" &&
    viewModel.languageTag.key !== state.mineLanguageFilter
  ) {
    return false;
  }

  if (state.mineSearch) {
    return viewModel.searchText.includes(state.mineSearch.toLowerCase());
  }

  return true;
}

function sortMineEntries(entries) {
  const nextEntries = [...entries];
  if (state.mineSort === "createdAt") {
    return nextEntries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  if (state.mineSort === "displayName") {
    return nextEntries.sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-CN"));
  }
  return nextEntries.sort((a, b) => b.hitCount - a.hitCount);
}

function getMineViewModels() {
  return sortMineEntries(
    getEntriesByScope(TERM_SCOPES.PERSONAL).map(buildEntryViewModel).filter(matchesMineFilters)
  );
}

function getSharedViewModels() {
  return getEntriesByScope(TERM_SCOPES.ENTERPRISE)
    .map(buildEntryViewModel)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function buildMineRowHtml(viewModel) {
  const hitRatio = Math.min(100, Math.max(8, Math.round((viewModel.hitCount / 40) * 100)));
  const isSelected = state.selectedEntryIds.has(viewModel.entryId);
  return `
    <tr data-entry-id="${escapeHtml(viewModel.entryId)}" class="${isSelected ? "selected" : ""}">
      <td><div class="checkbox ${isSelected ? "checked" : ""}" data-action="toggle-select"></div></td>
      <td><span class="term-source">${escapeHtml(viewModel.displayName)}</span></td>
      <td class="col-arrow">${escapeHtml(viewModel.languageTag.arrow)}</td>
      <td><span class="term-target">${escapeHtml(viewModel.targetText)}</span></td>
      <td><span class="pill ${escapeHtml(viewModel.typeMeta.className)}">${escapeHtml(viewModel.typeMeta.label)}</span></td>
      <td><span class="lang-tag">${escapeHtml(viewModel.languageTag.label)}</span></td>
      <td><span class="freq-bar"><span class="freq-fill" style="width:${hitRatio}%"></span></span><span class="freq-num">${escapeHtml(formatNumber(viewModel.hitCount))}</span></td>
      <td class="col-actions">
        <button class="icon-btn" type="button" title="${escapeHtml(tt("edit"))}" data-action="edit-entry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" type="button" title="${escapeHtml(tt("delete"))}" data-action="delete-entry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </td>
    </tr>
  `;
}

function buildSharedRowHtml(viewModel, canManageShared) {
  const actionCell = canManageShared
    ? `
      <td class="col-actions">
        <button class="icon-btn" type="button" title="${escapeHtml(tt("edit"))}" data-action="edit-entry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" type="button" title="${escapeHtml(tt("delete"))}" data-action="delete-entry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </td>
    `
    : "";

  return `
    <tr data-entry-id="${escapeHtml(viewModel.entryId)}">
      <td><span class="term-source">${escapeHtml(viewModel.displayName)}</span></td>
      <td class="col-arrow">${escapeHtml(viewModel.languageTag.arrow)}</td>
      <td><span class="term-target">${escapeHtml(viewModel.targetText)}</span></td>
      <td>${escapeHtml(viewModel.updatedByName)}</td>
      <td>${escapeHtml(formatRelativeTime(viewModel.updatedAt))}</td>
      ${actionCell}
    </tr>
  `;
}

function renderTabs() {
  const mineEntries = getEntriesByScope(TERM_SCOPES.PERSONAL);
  const sharedEntries = getEntriesByScope(TERM_SCOPES.ENTERPRISE);
  $("#mineTabCount").textContent = formatNumber(mineEntries.length);
  $("#sharedTabCount").textContent = formatNumber(sharedEntries.length);

  document.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.panel === state.activePanel;
    tab.classList.toggle("active", isActive);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === state.activePanel);
  });
}

function renderStats() {
  const stats = getTermStats(state.user);
  const visibleEntries = getEntries();
  const weeklyHits = visibleEntries.reduce((sum, entry) => sum + (entry.stats?.hitCount || 0), 0);

  $("#statTotalTerms").textContent = formatNumber(stats.totalEntries);
  $("#statTotalTermsSub").textContent = tt("statTotalSub", {
    personal: formatNumber(stats.personalEntries),
    enterprise: formatNumber(stats.enterpriseEntries),
  });

  $("#statFixedTerms").textContent = formatNumber(
    visibleEntries.filter((entry) => entry.termType === TERM_TYPES.FIXED_TRANSLATION).length
  );
  $("#statFixedTermsSub").textContent = tt("statSubFixed");

  $("#statHotwords").textContent = formatNumber(
    visibleEntries.filter((entry) => entry.termType === TERM_TYPES.RECOGNITION_HOTWORD).length
  );
  $("#statHotwordsSub").textContent = tt("statSubHotword");

  $("#statWeeklyHits").textContent = formatNumber(weeklyHits);
  $("#statWeeklyHitsSub").textContent = tt("statSubWeekly");
}

function renderEnterpriseSummary() {
  const sharedEntries = getEntriesByScope(TERM_SCOPES.ENTERPRISE);
  const latestUpdatedAt = sharedEntries
    .map((entry) => entry.updatedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  $("#enterpriseSummaryTitle").textContent = tt("enterpriseTitle", {
    company: state.user.company,
    count: formatNumber(sharedEntries.length),
  });
  $("#enterpriseSummarySub").textContent = tt("enterpriseSub", {
    time: formatRelativeTime(latestUpdatedAt),
  });

  $("#sharedBannerTitle").textContent = tt("sharedBannerTitle", { company: state.user.company });
  $("#sharedBannerSub").textContent = tt("sharedBannerSub", {
    count: formatNumber(sharedEntries.length),
    time: formatRelativeTime(latestUpdatedAt),
  });

  $("#btnOpenEnterprisePanel").textContent = tt("sharedSearchCta");
  $("#sharedBannerAction").textContent =
    state.user.role === "admin" ? tt("sharedManage") : tt("sharedContactAdmin");
}

function renderMineFilters() {
  const personalEntries = getEntriesByScope(TERM_SCOPES.PERSONAL);
  const fixedCount = personalEntries.filter(
    (entry) => entry.termType === TERM_TYPES.FIXED_TRANSLATION
  ).length;
  const hotwordCount = personalEntries.filter(
    (entry) => entry.termType === TERM_TYPES.RECOGNITION_HOTWORD
  ).length;

  $("#chipFilterAll").textContent = tt("chipAll", { count: formatNumber(personalEntries.length) });
  $("#chipFilterFixed").textContent = tt("chipFixed", { count: formatNumber(fixedCount) });
  $("#chipFilterHotword").textContent = tt("chipHotword", { count: formatNumber(hotwordCount) });

  document.querySelectorAll("[data-filter-type]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.filterType === state.mineTypeFilter);
  });

  $("#mineLanguageFilter").value = state.mineLanguageFilter;
  $("#mineSortSelect").value = state.mineSort;
  $("#mineSearchInput").value = state.mineSearch;
}

function renderMineTable() {
  const tbody = $("#mineTermsTableBody");
  const allMineEntries = getEntriesByScope(TERM_SCOPES.PERSONAL).map(buildEntryViewModel);
  const filteredEntries = getMineViewModels();

  if (!filteredEntries.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">${tt("mineEmpty")}</td>
      </tr>
    `;
  } else {
    tbody.innerHTML = filteredEntries.map(buildMineRowHtml).join("");
  }

  $("#mineTableFooterText").textContent = tt("tableShowing", {
    shown: formatNumber(filteredEntries.length),
    total: formatNumber(allMineEntries.length),
  });
  $("#mineTableFooterNote").textContent =
    state.mineSearch || state.mineTypeFilter !== "all" || state.mineLanguageFilter !== "all"
      ? tt("footerFiltered")
      : tt("footerMine");
}

function renderSharedTable() {
  const canManageShared = state.user.role === "admin";
  const sharedEntries = getSharedViewModels();
  const header = $("#sharedTableHeaderRow");
  const tbody = $("#sharedTermsTableBody");

  header.innerHTML = `
    <th>${tt("mineHeaders")[0]}</th>
    <th></th>
    <th>${tt("mineHeaders")[1]}</th>
    <th>${tt("sharedMaintainer")}</th>
    <th>${tt("sharedUpdated")}</th>
    ${canManageShared ? '<th class="col-actions"></th>' : ""}
  `;

  if (!sharedEntries.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${canManageShared ? 6 : 5}" class="empty-state">${tt("sharedEmpty")}</td>
      </tr>
    `;
  } else {
    tbody.innerHTML = sharedEntries
      .map((viewModel) => buildSharedRowHtml(viewModel, canManageShared))
      .join("");
  }

  $("#sharedTableFooterText").textContent = tt("tableShowing", {
    shown: formatNumber(sharedEntries.length),
    total: formatNumber(sharedEntries.length),
  });
  $("#sharedTableFooterNote").textContent = canManageShared
    ? tt("footerSharedEditable")
    : tt("footerSharedReadonly");
}

function renderNavigationCount() {
  const totalEntries = getEntries().length;
  const currentNavCount = document.querySelector(".nav-item.active .nav-count");
  if (currentNavCount) {
    currentNavCount.textContent = formatNumber(totalEntries);
  }
}

function renderAll() {
  renderTabs();
  renderStats();
  renderEnterpriseSummary();
  renderMineFilters();
  renderMineTable();
  renderSharedTable();
  renderNavigationCount();
}

async function exportVisibleTermsAsExcel() {
  const scope = state.activePanel === "shared" ? TERM_SCOPES.ENTERPRISE : TERM_SCOPES.PERSONAL;
  const xlsx = await ensureXlsxLibrary();
  const workbook = exportTermsToWorkbook(
    {
      actor: state.user,
      scope,
    },
    xlsx
  );
  const fileName = `terms-${scope}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  xlsx.writeFile(workbook, fileName);
}

async function handleImportFile(file) {
  if (!file) {
    return;
  }

  try {
    const xlsx = await ensureXlsxLibrary();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = readTermsWorkbookFromArrayBuffer(arrayBuffer, xlsx);
    const summary = importTermsFromWorkbook(
      workbook,
      {
        actor: state.user,
        mode: "merge",
      },
      xlsx
    );

    renderAll();
    if (!summary.totalRows) {
      window.alert(t("terms_alert_import_empty"));
      return;
    }

    window.alert(tt("importCompleted", summary));
  } catch (error) {
    window.alert(error?.message || t("terms_alert_import_failed"));
  }
}

function handleDeleteEntry(entryId) {
  const confirmed = window.confirm(t("terms_confirm_delete"));
  if (!confirmed) {
    return;
  }

  try {
    deleteTermEntry(entryId, state.user);
    state.selectedEntryIds.delete(entryId);
    renderAll();
  } catch (error) {
    window.alert(error?.message || t("terms_alert_delete_failed"));
  }
}

function toggleMineSelection(entryId) {
  if (state.selectedEntryIds.has(entryId)) {
    state.selectedEntryIds.delete(entryId);
  } else {
    state.selectedEntryIds.add(entryId);
  }
  renderMineTable();
}

function bindMineTableEvents() {
  $("#mineTermsTableBody").addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-entry-id]");
    if (!row) {
      return;
    }

    const entryId = row.dataset.entryId;
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (action === "toggle-select") {
      event.stopPropagation();
      toggleMineSelection(entryId);
      return;
    }

    if (action === "edit-entry") {
      const entry = getEntryById(entryId);
      if (entry) {
        openEditorModal({ mode: "edit", entry });
      }
      return;
    }

    if (action === "delete-entry") {
      handleDeleteEntry(entryId);
    }
  });
}

function bindSharedTableEvents() {
  $("#sharedTermsTableBody").addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    const row = event.target.closest("tr[data-entry-id]");
    if (!row || !actionTarget) {
      return;
    }

    const entryId = row.dataset.entryId;
    const action = actionTarget.dataset.action;

    if (action === "edit-entry") {
      const entry = getEntryById(entryId);
      if (entry) {
        openEditorModal({ mode: "edit", entry });
      }
      return;
    }

    if (action === "delete-entry") {
      handleDeleteEntry(entryId);
    }
  });
}

function bindFilterEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activePanel = tab.dataset.panel || "mine";
      renderTabs();
    });
  });

  document.querySelectorAll("[data-filter-type]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.mineTypeFilter = chip.dataset.filterType || "all";
      renderMineFilters();
      renderMineTable();
    });
  });

  $("#mineLanguageFilter").addEventListener("change", (event) => {
    state.mineLanguageFilter = event.target.value;
    renderMineTable();
  });

  $("#mineSortSelect").addEventListener("change", (event) => {
    state.mineSort = event.target.value;
    renderMineTable();
  });

  $("#mineSearchInput").addEventListener("input", (event) => {
    state.mineSearch = event.target.value.trim();
    renderMineTable();
  });
}

function bindTopActions() {
  const importInput = $("#termsImportInput");
  $("#btnOpenEnterprisePanel").addEventListener("click", () => {
    state.activePanel = "shared";
    renderTabs();
  });

  $("#btnImportTerms").addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  });

  $("#btnExportTerms").addEventListener("click", async () => {
    try {
      await exportVisibleTermsAsExcel();
    } catch (error) {
      window.alert(error?.message || t("terms_alert_export_failed"));
    }
  });

  importInput.addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    await handleImportFile(file);
    event.target.value = "";
  });

  $("#btnCreateTerm").addEventListener("click", () => {
    openEditorModal({
      mode: "create",
      scope: getDefaultCreateScope(),
    });
  });

  $("#sharedBannerAction").addEventListener("click", () => {
    if (state.user.role === "admin") {
      openEditorModal({
        mode: "create",
        scope: TERM_SCOPES.ENTERPRISE,
      });
      return;
    }

    window.alert(t("terms_enterprise_contact_admin"));
  });
}

function bindEditorModalEvents() {
  ensureEditorModal();
  const nodes = getEditorNodes();

  nodes.overlay.addEventListener("click", (event) => {
    if (event.target === nodes.overlay || event.target.closest('[data-editor-action="close"]')) {
      closeEditorModal();
    }
  });

  nodes.addRule.addEventListener("click", () => {
    const nextDraft = readEditorDraftFromDom();
    nextDraft.rules.push(createEmptyRuleDraft());
    state.editor.draft = nextDraft;
    renderEditorModal();
  });

  nodes.rulesList.addEventListener("click", (event) => {
    const removeButton = event.target.closest('[data-editor-action="remove-rule"]');
    if (!removeButton) {
      return;
    }

    const ruleCard = removeButton.closest("[data-rule-index]");
    if (!ruleCard) {
      return;
    }

    const nextDraft = readEditorDraftFromDom();
    nextDraft.rules.splice(Number(ruleCard.dataset.ruleIndex), 1);
    state.editor.draft = nextDraft;
    renderEditorModal();
  });

  nodes.rulesList.addEventListener("change", (event) => {
    const field = event.target.dataset.ruleField;
    if (field !== "targetMode") {
      return;
    }

    const ruleCard = event.target.closest("[data-rule-index]");
    if (!ruleCard) {
      return;
    }

    const targetInput = ruleCard.querySelector('[data-rule-field="targetText"]');
    const hint = ruleCard.querySelector(".field-hint");
    const isPreserveOriginal = event.target.value === TERM_TARGET_MODES.PRESERVE_ORIGINAL;

    targetInput.disabled = isPreserveOriginal;
    if (isPreserveOriginal) {
      targetInput.value = "";
      hint.textContent = t("terms_rule_preserve_hint");
    } else {
      hint.textContent = t("terms_rule_translate_hint");
    }
  });

  nodes.save.addEventListener("click", () => {
    saveEditorModal();
  });

  document.addEventListener("keydown", (event) => {
    if (!state.editor.open) {
      return;
    }
    if (event.key === "Escape") {
      closeEditorModal();
    }
  });
}

function initTermsPage() {
  state.user = initPageAuth();
  if (!state.user) {
    return;
  }

  ensureTermsStore();
  ensureEditorModal();
  bindMeetingEntryButton();
  bindFilterEvents();
  bindMineTableEvents();
  bindSharedTableEvents();
  bindTopActions();
  bindEditorModalEvents();
  applyTermsStaticTranslations();
  renderAll();
  ensureXlsxLibrary().catch(() => {});
  onSystemLanguageChange(() => {
    applyTermsStaticTranslations();
    renderAll();
    if (state.editor.open) {
      renderEditorModal();
    }
  });
}

initTermsPage();
