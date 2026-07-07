import { initPageAuth } from "../auth/page-auth.js";
import {
  getSystemLanguage,
  onSystemLanguageChange,
  setSystemLanguage,
} from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";

const refs = {
  localeSelect: document.getElementById("systemLanguageSelect"),
  dateFormatSelect: document.getElementById("dateFormatSelect"),
};

const SIDEBAR_TEXTS = {
  zh: {
    title: "AudioClaw · 设置",
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
    settingsNavTitle: "设置",
  },
  ja: {
    title: "AudioClaw · 設定",
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
    settingsNavTitle: "設定",
  },
  en: {
    title: "AudioClaw · Settings",
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
    settingsNavTitle: "Settings",
  },
};

function setText(selector, text) {
  const node = document.querySelector(selector);
  if (node) {
    node.textContent = text;
  }
}

function setHtml(selector, html) {
  const node = document.querySelector(selector);
  if (node) {
    node.innerHTML = html;
  }
}

function applyLocaleOptions(language) {
  if (!refs.localeSelect) {
    return;
  }

  refs.localeSelect.innerHTML = `
    <option value="zh">${t("settings_language_option_zh", {}, language)}</option>
    <option value="ja">${t("settings_language_option_ja", {}, language)}</option>
    <option value="en">${t("settings_language_option_en", {}, language)}</option>
  `;
  refs.localeSelect.value = getSystemLanguage();

  if (!refs.dateFormatSelect) {
    return;
  }

  const datePreviewTexts = {
    zh: [
      "跟随界面语言（中文：2026年5月26日 14:30）",
      "ISO 8601（2026-05-26 14:30）",
      "美式（May 26, 2026 2:30 PM）",
    ],
    ja: [
      "UI 言語に合わせる（2026年5月26日 14:30）",
      "ISO 8601（2026-05-26 14:30）",
      "US 形式（May 26, 2026 2:30 PM）",
    ],
    en: [
      "Follow UI language (May 26, 2026 2:30 PM)",
      "ISO 8601 (2026-05-26 14:30)",
      "US format (May 26, 2026 2:30 PM)",
    ],
  };
  refs.dateFormatSelect.innerHTML = (datePreviewTexts[language] || datePreviewTexts.zh)
    .map((label) => `<option>${label}</option>`)
    .join("");
}

function applySettingsTranslations() {
  const language = getSystemLanguage();
  document.title = SIDEBAR_TEXTS[language]?.title || t("settings_title", {}, language);

  const sidebarTexts = SIDEBAR_TEXTS[language] || SIDEBAR_TEXTS.zh;
  const newMeeting = document.querySelector(".new-meeting-btn span");
  if (newMeeting) newMeeting.textContent = sidebarTexts.newMeeting;

  const navTitles = document.querySelectorAll(".sidebar .nav-title");
  if (navTitles[0]) navTitles[0].textContent = sidebarTexts.navMain;
  if (navTitles[1]) navTitles[1].textContent = sidebarTexts.navAssets;
  if (navTitles[2]) navTitles[2].textContent = sidebarTexts.navOrg;

  const sidebarNavLabels = document.querySelectorAll(".sidebar .nav-item span:not(.nav-count):not(.admin-badge)");
  if (sidebarNavLabels[0]) sidebarNavLabels[0].textContent = sidebarTexts.navMeetings;
  if (sidebarNavLabels[1]) sidebarNavLabels[1].textContent = sidebarTexts.navVoiceprints;
  if (sidebarNavLabels[2]) sidebarNavLabels[2].textContent = sidebarTexts.navTerms;
  if (sidebarNavLabels[3]) sidebarNavLabels[3].textContent = sidebarTexts.navAdmin;
  if (sidebarNavLabels[4]) sidebarNavLabels[4].textContent = sidebarTexts.navSettings;

  const adminBadge = document.querySelector(".sidebar .admin-badge");
  if (adminBadge) adminBadge.textContent = sidebarTexts.adminBadge;

  const userPlan = document.querySelector(".sidebar .user-plan");
  if (userPlan) userPlan.textContent = `${t("role_admin", {}, language)} · 神泉科技`;

  const settingsNavTitle = document.querySelector(".settings-nav-title");
  if (settingsNavTitle) settingsNavTitle.textContent = sidebarTexts.settingsNavTitle;

  const navLabels = {
    zh: ["通用", "语言与翻译", "账号与套餐"],
    ja: ["一般", "言語と翻訳", "アカウントとプラン"],
    en: ["General", "Language & Translation", "Account & Plan"],
  };
  document.querySelectorAll(".settings-cat span").forEach((node, index) => {
    node.textContent = (navLabels[language] || navLabels.zh)[index] || node.textContent;
  });

  setHtml(
    ".breadcrumb",
    language === "ja"
      ? '<a href="home.html">ホーム</a> / 設定'
      : language === "en"
        ? '<a href="home.html">Home</a> / Settings'
        : '<a href="home.html">主页</a> / 设置'
  );

  const pageTitles = {
    zh: ["通用", "语言与翻译", "账号与套餐"],
    ja: ["一般", "言語と翻訳", "アカウントとプラン"],
    en: ["General", "Language & Translation", "Account & Plan"],
  };
  document.querySelectorAll(".page-title").forEach((node, index) => {
    node.textContent = (pageTitles[language] || pageTitles.zh)[index] || node.textContent;
  });

  const pageSubs = {
    zh: [
      "界面语言、外观、启动行为等基础偏好",
      "默认会议语言、翻译目标语言、双语显示偏好",
      "基本资料、订阅套餐、组织信息",
    ],
    ja: [
      "UI 言語、外観、起動動作などの基本設定",
      "既定の会議言語、翻訳先言語、二言語表示の設定",
      "基本情報、契約プラン、組織情報",
    ],
    en: [
      "Base preferences for UI language, appearance, and startup behavior",
      "Default meeting language, translation targets, and bilingual display preferences",
      "Profile, subscription plan, and organization details",
    ],
  };
  document.querySelectorAll(".page-sub").forEach((node, index) => {
    node.textContent = (pageSubs[language] || pageSubs.zh)[index] || node.textContent;
  });

  const generalLabels = {
    zh: {
      section1: ["界面语言", "菜单、按钮、提示等 UI 文案的语言（与会议翻译语言独立）"],
      row1: ["界面语言（UI Locale）", "改变后整个应用的菜单与按钮会立即切换。会议中的字幕语言不会受影响。"],
      row2: ["日期与数字格式", "影响时间戳、统计数字的显示方式"],
      section2: ["外观"],
      row3: ["主题", "选择浅色、深色或跟随系统"],
      row4: ["默认开启悬浮字幕窗", "每次开始新会议时自动弹出置顶字幕窗"],
      theme: ["☀️ 浅色", "🌙 深色", "🖥 跟随系统"],
    },
    ja: {
      section1: ["表示言語", "メニュー、ボタン、ヒントなど UI 文言の表示言語です（会議翻訳言語とは独立）。"],
      row1: ["表示言語（UI Locale）", "変更するとアプリ全体のメニューとボタンが即時に切り替わります。会議字幕の言語は変わりません。"],
      row2: ["日付と数値の形式", "タイムスタンプと統計数値の表示形式に影響します。"],
      section2: ["外観"],
      row3: ["テーマ", "ライト、ダーク、またはシステムに合わせて選択します。"],
      row4: ["フローティング字幕を既定で開く", "新しい会議を開始するたびに常に前面の字幕ウィンドウを自動で開きます。"],
      theme: ["☀️ ライト", "🌙 ダーク", "🖥 システムに合わせる"],
    },
    en: {
      section1: ["Interface Language", "Language for menus, buttons, and UI hints, independent from meeting translation."],
      row1: ["Interface Language (UI Locale)", "Menus and buttons across the app switch immediately after you change it. Meeting subtitle language stays unchanged."],
      row2: ["Date And Number Format", "Controls how timestamps and numeric stats are displayed."],
      section2: ["Appearance"],
      row3: ["Theme", "Choose light, dark, or follow the system setting."],
      row4: ["Open Floating Captions By Default", "Automatically open the always-on-top caption window whenever a new meeting starts."],
      theme: ["☀️ Light", "🌙 Dark", "🖥 Follow System"],
    },
  };

  const general = generalLabels[language] || generalLabels.zh;
  const sectionHeaders = document.querySelectorAll('.panel[data-panel="general"] .section-header');
  if (sectionHeaders[0]) {
    const titleNode = sectionHeaders[0].querySelector("h2");
    const subNode = sectionHeaders[0].querySelector("p");
    if (titleNode) titleNode.textContent = general.section1[0];
    if (subNode) subNode.textContent = general.section1[1];
  }
  if (sectionHeaders[1]) {
    const titleNode = sectionHeaders[1].querySelector("h2");
    if (titleNode) titleNode.textContent = general.section2[0];
  }

  const generalRows = document.querySelectorAll('.panel[data-panel="general"] .row');
  if (generalRows[0]) {
    generalRows[0].querySelector(".row-label").textContent = general.row1[0];
    generalRows[0].querySelector(".row-hint").textContent = general.row1[1];
  }
  if (generalRows[1]) {
    generalRows[1].querySelector(".row-label").textContent = general.row2[0];
    generalRows[1].querySelector(".row-hint").textContent = general.row2[1];
  }
  if (generalRows[2]) {
    generalRows[2].querySelector(".row-label").textContent = general.row3[0];
    generalRows[2].querySelector(".row-hint").textContent = general.row3[1];
  }
  if (generalRows[3]) {
    generalRows[3].querySelector(".row-label").textContent = general.row4[0];
    generalRows[3].querySelector(".row-hint").textContent = general.row4[1];
  }
  document
    .querySelectorAll('.panel[data-panel="general"] .chip-pick')
    .forEach((node, index) => {
      node.textContent = general.theme[index] || node.textContent;
    });

  const languagePanelTexts = {
    zh: {
      header1: ["默认翻译配对", "新建会议时默认带入的语言组合（可在会议中临时修改）"],
      previewLeft: "中文（自动识别）",
      previewRight: "日本語",
      row1: ['源语言（自动识别 / 指定）', '建议选"自动识别"让系统判断当前发言语种'],
      row2: ["默认翻译目标语言", "可同时勾选多个语言，会议中会同时给出多版本译文"],
      row3: ["转写流默认显示", "在实时转写流 Tab 中默认显示什么"],
      row4: ["悬浮字幕窗默认模式", "悬浮在桌面的小窗的默认显示方式"],
      header2: ["显示偏好"],
    },
    ja: {
      header1: ["既定の翻訳ペア", "新しい会議で最初から使う言語の組み合わせです（会議中に一時変更できます）。"],
      previewLeft: "中国語（自動判定）",
      previewRight: "日本語",
      row1: ["入力言語（自動判定 / 指定）", '通常は「自動判定」を選び、発話言語をシステムに判定させます。'],
      row2: ["既定の翻訳先言語", "複数言語を選ぶと、会議中に複数バージョンの訳文を表示できます。"],
      row3: ["Transcript の既定表示", "リアルタイム transcript タブで既定で何を表示するかを選びます。"],
      row4: ["フローティング字幕の既定モード", "デスクトップに浮かぶ小窓の既定表示です。"],
      header2: ["表示設定"],
    },
    en: {
      header1: ["Default Translation Pair", "Default language combination used when creating a new meeting, with temporary changes allowed in-session."],
      previewLeft: "Chinese (Auto Detect)",
      previewRight: "Japanese",
      row1: ["Source Language (Auto / Fixed)", 'Choose "Auto Detect" so the system can identify the spoken language.'],
      row2: ["Default Translation Target", "You can select multiple languages so the meeting shows multiple translated versions at the same time."],
      row3: ["Default Transcript View", "Controls what the real-time transcript tab shows by default."],
      row4: ["Default Floating Caption Mode", "Controls the default display mode of the floating desktop caption window."],
      header2: ["Display Preferences"],
    },
  };
  const languagePanel = languagePanelTexts[language] || languagePanelTexts.zh;
  const languageHeaders = document.querySelectorAll('.panel[data-panel="language"] .section-header');
  if (languageHeaders[0]) {
    const titleNode = languageHeaders[0].querySelector("h2");
    const subNode = languageHeaders[0].querySelector("p");
    if (titleNode) titleNode.textContent = languagePanel.header1[0];
    if (subNode) subNode.textContent = languagePanel.header1[1];
  }
  if (languageHeaders[1]) {
    const titleNode = languageHeaders[1].querySelector("h2");
    if (titleNode) titleNode.textContent = languagePanel.header2[0];
  }
  const previewStrong = document.querySelectorAll(".translation-preview strong");
  if (previewStrong[0]) previewStrong[0].textContent = languagePanel.previewLeft;
  if (previewStrong[1]) previewStrong[1].textContent = languagePanel.previewRight;

  const languageRows = document.querySelectorAll('.panel[data-panel="language"] .row');
  [languagePanel.row1, languagePanel.row2, languagePanel.row3, languagePanel.row4].forEach((row, index) => {
    const rowNode = languageRows[index];
    if (!rowNode) return;
    rowNode.querySelector(".row-label").textContent = row[0];
    rowNode.querySelector(".row-hint").textContent = row[1];
  });

  const accountTexts = {
    zh: {
      headers: ["个人资料", "当前套餐", "危险操作"],
      labels: ["头像", "姓名", '用于会议中"我"的发言显示', "邮箱", "职位", "上传头像", "企业版", "无限会议时长 · 私有化部署 · 50 个席位（已使用 38）", "管理订阅", "下次续费：2026 年 12 月 31 日 · 由企业账单统一付款", "退出当前账号", "本机将清除所有缓存数据", "退出登录", "删除所有会议记录", "将永久删除你账号下的所有会议、转写、声纹与术语数据", "永久删除"],
    },
    ja: {
      headers: ["プロフィール", "現在のプラン", "危険な操作"],
      labels: ["アバター", "氏名", "会議中の「自分」の発言表示に使われます", "メール", "役職", "アバターをアップロード", "Enterprise", "会議時間無制限・プライベート導入・50 席（使用中 38）", "契約を管理", "次回更新：2026年12月31日 · 企業請求で一括支払い", "現在のアカウントからログアウト", "この端末上のキャッシュデータを削除します", "ログアウト", "すべての会議記録を削除", "このアカウント配下の会議、transcript、声紋、用語データを完全に削除します", "完全に削除"],
    },
    en: {
      headers: ["Profile", "Current Plan", "Danger Zone"],
      labels: ["Avatar", "Name", 'Used for your "me" label during meetings', "Email", "Title", "Upload Avatar", "Enterprise", "Unlimited meeting duration · Private deployment · 50 seats (38 used)", "Manage Subscription", "Next renewal: Dec 31, 2026 · Paid through the company billing account", "Sign Out", "This device cache will be cleared", "Sign Out", "Delete All Meeting Records", "Permanently delete all meetings, transcripts, voiceprints, and terms under this account", "Delete Permanently"],
    },
  };
  const account = accountTexts[language] || accountTexts.zh;
  const accountHeaders = document.querySelectorAll('.panel[data-panel="account"] .section-header h2');
  accountHeaders.forEach((node, index) => {
    node.textContent = account.headers[index] || node.textContent;
  });
  const accountRows = document.querySelectorAll('.panel[data-panel="account"] .row');
  if (accountRows[0]) accountRows[0].querySelector(".row-label").textContent = account.labels[0];
  if (accountRows[0]) accountRows[0].querySelector("button").textContent = account.labels[5];
  if (accountRows[1]) {
    accountRows[1].querySelector(".row-label").textContent = account.labels[1];
    accountRows[1].querySelector(".row-hint").textContent = account.labels[2];
  }
  if (accountRows[2]) accountRows[2].querySelector(".row-label").textContent = account.labels[3];
  if (accountRows[3]) accountRows[3].querySelector(".row-label").textContent = account.labels[4];

  const planTitle = document.querySelector('.panel[data-panel="account"] span[style*="font-size:16px;font-weight:700"]');
  if (planTitle) planTitle.textContent = account.labels[6];
  const planDesc = document.querySelector('.panel[data-panel="account"] div[style*="font-size:12px;color:var(--text-secondary)"]');
  if (planDesc) planDesc.textContent = account.labels[7];
  const planBtn = document.querySelector('.panel[data-panel="account"] button.btn:not([data-action="logout"])');
  if (planBtn) planBtn.textContent = account.labels[8];
  const planRenew = document.querySelector('.panel[data-panel="account"] div[style*="margin-top:14px;font-size:12px;color:var(--text-tertiary)"]');
  if (planRenew) planRenew.textContent = account.labels[9];

  if (accountRows[4]) {
    accountRows[4].querySelector(".row-label").textContent = account.labels[10];
    accountRows[4].querySelector(".row-hint").textContent = account.labels[11];
    accountRows[4].querySelector("button").textContent = account.labels[12];
  }
  if (accountRows[5]) {
    accountRows[5].querySelector(".row-label").textContent = account.labels[13];
    accountRows[5].querySelector(".row-hint").textContent = account.labels[14];
    accountRows[5].querySelector("button").textContent = account.labels[15];
  }

  applyLocaleOptions(language);
}

function bindLanguageSelector() {
  refs.localeSelect?.addEventListener("change", () => {
    const nextLanguage = refs.localeSelect.value;
    setSystemLanguage(nextLanguage);
    applySettingsTranslations();
  });
}

function init() {
  initPageAuth();
  bindLanguageSelector();
  applySettingsTranslations();
  onSystemLanguageChange(() => {
    applySettingsTranslations();
  });
}

init();
