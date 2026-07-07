import { initPageAuth } from "../auth/page-auth.js";
import { getSystemLanguage, onSystemLanguageChange } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";
import { getLocalizedParticipantRole } from "../meeting/demo-participants.js";
import { getOngoingMeetingByUser } from "../storage/meeting-store.js";

let currentUser = null;

const VOICEPRINT_TEXTS = {
  zh: {
    title: "AudioClaw · 声纹库",
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
    pageTitle: "声纹库",
    encryptedBadge: "端到端加密",
    pageSub: "用于会议中自动识别说话人身份 · 共 6 位",
    addVoiceprint: "添加声纹",
    privacyTitle: "声纹属于敏感生物特征数据，我们这样保护它",
    privacyPoint1: "声纹数据全程端到端加密传输与存储，仅用于会议中的说话人识别，不用于模型训练。",
    privacyPoint2: "添加他人声纹前，需确认已获得本人明确同意。",
    privacyLink: "查看完整隐私政策 →",
    listTitle: "声纹列表",
    count: "6 位",
    searchPlaceholder: "按姓名搜索…",
    statusCollected: "已采集",
    storageEncrypted: "已加密",
    editTitle: "编辑",
    deleteTitle: "删除",
    autoMatchLabel: "会议中自动识别匹配",
    autoMatchHint: "检测到声纹库中已有的说话人时，自动显示对应身份；否则标记为「未识别」",
    rightsTitle: "你的数据权利",
    rightsText: "你随时拥有完全的控制权。所有声纹数据仅归属于你的账号，不与任何第三方共享，删除即彻底擦除。",
    exportMine: "导出我的声纹数据",
    clearAll: "清空全部声纹库",
    modalTitle: "添加新声纹",
    modalSub: "采集 10 秒以上音频样本即可",
    nameLabel: "姓名",
    namePlaceholder: "如：田中 健太",
    roleLabel: "角色 / 备注（可选）",
    rolePlaceholder: "如：CTO · 株式会社サンライズ",
    modeLabel: "人物类型",
    modeInternal: "内部成员",
    modeExternal: "外部来宾",
    memberLabel: "选择内部成员",
    memberPlaceholder: "请选择成员",
    memberSearchEmpty: "没有匹配的成员。",
    memberHint: "点选后自动带出姓名与职位，并绑定成员主档。",
    readonlyHint: "内部成员声纹的姓名与职位跟随成员主档，声纹页不可单独修改。",
    typeInternal: "内部成员",
    typeExternal: "外部来宾",
    editModalTitle: "编辑外部来宾声纹",
    editModalSub: "仅允许修改外部来宾的姓名与职位备注，不改动已有声纹样本。",
    readPromptTitle: "录音时请清晰朗读下面这段话（约 15 秒）",
    readPromptBody:
      "你好，我现在录入我的声纹。<br>春天的清晨，阳光洒满安静的山谷，鸟儿在枝头欢快地歌唱。<br>请记住我说话的声音和语气，无论中文还是数字：一二三四五六七八九十。<br>谢谢，这段录音用于会议中自动识别我的身份。",
    readPromptTip: "提示：保持正常语速和音量，安静环境单人朗读，效果最佳。",
    sampleLabel: "音频样本",
    recordMain: "点击录制 10 秒",
    recordSub: "或拖入音频文件 · 也可从已有会议中提取",
    recordIdleMain: "点击开始朗读录制（15 秒）",
    recordIdleSub: "请照上方文字清晰朗读",
    recordLoadingFailed: "引擎加载失败，请重试",
    recordMicUnavailable: "麦克风不可用",
    recordRunning: "录音中… {seconds}s",
    recordRunningSub: "正在录音…",
    recordBuilding: "正在生成声纹…",
    recordTooShort: "录音太短，请按提示完整朗读后重录",
    recordTooShortSub: "本次仅 {seconds}s，至少需 8s",
    recordReady: "✓ 声纹已采集（点击可重录）",
    recordReadySub: "填写信息后点击确认保存",
    recordFailed: "声纹生成失败，请重录",
    consent1: "<strong>我已获得该说话人本人的明确同意</strong>采集其声纹用于身份识别。",
    consent2: "我了解声纹将以<strong>端到端加密方式存储于云端</strong>，并随时可由我导出或删除。",
    cancel: "取消",
    confirm: "确认添加",
    saveChanges: "保存修改",
    saving: "保存中…",
    updating: "保存中…",
    emptyList: "还没有声纹，点击右上角「添加声纹」开始采集。",
    emptySearch: "没有匹配的声纹记录。",
    statusReady: "已就绪",
    storageLocalEncrypted: "本地加密",
    validationNameRequired: "请填写姓名。",
    validationMemberRequired: "请选择内部成员。",
    validationConsentsRequired: "请先确认两项授权同意。",
    validationSampleRequired: "请先录制声纹样本。",
    validationInternalExists: "该内部成员已存在声纹记录。",
    deleteConfirm: "确认删除声纹“{name}”吗？",
    saveFailed: "保存失败：{message}",
    similarityWarning:
      "⚠ 这段声纹与已有成员“{name}”高度相似（余弦 {score}）。\n\n不同人的声纹通常应低于 0.4。这通常意味着录音时混入了他人声音、环境太吵，或本人发声样本不足。\n\n建议在安静环境、按提示完整朗读后重录。\n\n仍要强行保存吗？",
  },
  ja: {
    title: "AudioClaw · 声紋ライブラリ",
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
    pageTitle: "声紋ライブラリ",
    encryptedBadge: "エンドツーエンド暗号化",
    pageSub: "会議中の話者識別に使用 · 合計 6 名",
    addVoiceprint: "声紋を追加",
    privacyTitle: "声紋は機微な生体特徴データです。以下のように保護します",
    privacyPoint1: "声紋データは送信時も保存時もエンドツーエンドで暗号化され、会議中の話者識別のみに使用されます。モデル学習には使いません。",
    privacyPoint2: "他者の声紋を追加する前に、本人から明確な同意を得ていることを確認してください。",
    privacyLink: "完全なプライバシーポリシーを見る →",
    listTitle: "声紋一覧",
    count: "6 名",
    searchPlaceholder: "名前で検索…",
    statusCollected: "収集済み",
    storageEncrypted: "暗号化済み",
    editTitle: "編集",
    deleteTitle: "削除",
    autoMatchLabel: "会議中に自動で声紋照合する",
    autoMatchHint: "既存の声紋が検出されると対応する身元を自動表示し、それ以外は「未識別」と表示します。",
    rightsTitle: "データに関するあなたの権利",
    rightsText: "常に完全なコントロール権があります。すべての声紋データはあなたのアカウントのみに帰属し、第三者とは共有されません。削除すると完全に消去されます。",
    exportMine: "自分の声紋データを書き出す",
    clearAll: "すべての声紋を削除",
    modalTitle: "新しい声紋を追加",
    modalSub: "10 秒以上の音声サンプルを収集してください",
    nameLabel: "氏名",
    namePlaceholder: "例: 田中 健太",
    roleLabel: "役職 / メモ（任意）",
    rolePlaceholder: "例: CTO · 株式会社サンライズ",
    modeLabel: "人物タイプ",
    modeInternal: "社内メンバー",
    modeExternal: "外部ゲスト",
    memberLabel: "社内メンバーを選択",
    memberPlaceholder: "メンバーを選択してください",
    memberSearchEmpty: "一致するメンバーが見つかりません。",
    memberHint: "選択後、氏名と役職を自動入力し、メンバー主档に紐付けます。",
    readonlyHint: "社内メンバー声紋の氏名と役職はメンバー主档に従います。声紋ページでは個別に変更できません。",
    typeInternal: "社内メンバー",
    typeExternal: "外部ゲスト",
    editModalTitle: "外部ゲスト声紋を編集",
    editModalSub: "外部ゲストの氏名と役職メモのみ変更できます。既存の声紋サンプルは変更しません。",
    readPromptTitle: "録音時は次の文章をはっきり朗読してください（約 15 秒）",
    readPromptBody:
      "こんにちは。これから私の声紋を登録します。<br>春の朝、静かな谷に日差しが差し込み、枝先では鳥たちが楽しそうにさえずっています。<br>私の声と話し方を覚えてください。日本語でも数字でも、一二三四五六七八九十。<br>ありがとうございます。この録音は会議中に私を自動識別するために使われます。",
    readPromptTip: "ヒント: 普段どおりの速度と音量で、静かな環境で一人で朗読すると最も効果的です。",
    sampleLabel: "音声サンプル",
    recordMain: "10 秒録音する",
    recordSub: "音声ファイルをドラッグするか、既存の会議から抽出することもできます",
    recordIdleMain: "朗読録音を開始する（15 秒）",
    recordIdleSub: "上の文章をはっきり朗読してください",
    recordLoadingFailed: "エンジンの読み込みに失敗しました。もう一度お試しください。",
    recordMicUnavailable: "マイクを利用できません",
    recordRunning: "録音中… {seconds}s",
    recordRunningSub: "録音中…",
    recordBuilding: "声紋を生成中…",
    recordTooShort: "録音が短すぎます。案内どおりに最後まで朗読して再録音してください。",
    recordTooShortSub: "今回は {seconds}s です。最低 8s 必要です",
    recordReady: "✓ 声紋を収集しました（クリックで再録音）",
    recordReadySub: "情報を確認して保存してください",
    recordFailed: "声紋の生成に失敗しました。録り直してください。",
    consent1: "<strong>私はこの話者本人から明確な同意を得ています</strong>。その声紋を話者識別に使用します。",
    consent2: "声紋は<strong>クラウド上でエンドツーエンド暗号化して保存</strong>され、必要に応じていつでも書き出しまたは削除できることを理解しています。",
    cancel: "キャンセル",
    confirm: "追加する",
    saveChanges: "変更を保存",
    saving: "保存中…",
    updating: "保存中…",
    emptyList: "声紋がまだありません。右上の「声紋を追加」から収集を始めてください。",
    emptySearch: "条件に一致する声紋がありません。",
    statusReady: "準備完了",
    storageLocalEncrypted: "ローカル暗号化",
    validationNameRequired: "氏名を入力してください。",
    validationMemberRequired: "社内メンバーを選択してください。",
    validationConsentsRequired: "2 つの同意確認を完了してください。",
    validationSampleRequired: "先に声紋サンプルを録音してください。",
    validationInternalExists: "この社内メンバーの声紋は既に存在します。",
    deleteConfirm: "声紋「{name}」を削除しますか？",
    saveFailed: "保存に失敗しました: {message}",
    similarityWarning:
      "⚠ この声紋は既存メンバー「{name}」と非常に近いです（コサイン {score}）。\n\n通常、別人同士の声紋は 0.4 未満になるはずです。録音に他人の声が混ざった、周囲が騒がしい、または本人の発話が不足している可能性があります。\n\n静かな環境で案内文を最後まで朗読して再録音することをおすすめします。\n\nそれでも保存しますか？",
  },
  en: {
    title: "AudioClaw · Voiceprints",
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
    pageTitle: "Voiceprints",
    encryptedBadge: "End-To-End Encrypted",
    pageSub: "Used for automatic speaker identification during meetings · 6 profiles",
    addVoiceprint: "Add Voiceprint",
    privacyTitle: "Voiceprints are sensitive biometric data. Here is how we protect them",
    privacyPoint1: "Voiceprint data is encrypted end to end in transit and at rest, used only for speaker identification during meetings, and never used for model training.",
    privacyPoint2: "Before adding someone else's voiceprint, confirm that you have their explicit consent.",
    privacyLink: "View the full privacy policy →",
    listTitle: "Voiceprint List",
    count: "6 profiles",
    searchPlaceholder: "Search by name...",
    statusCollected: "Collected",
    storageEncrypted: "Encrypted",
    editTitle: "Edit",
    deleteTitle: "Delete",
    autoMatchLabel: "Auto-match speakers during meetings",
    autoMatchHint: "When a speaker already exists in the voiceprint library, the identity is shown automatically. Otherwise it is marked as \"Unrecognized\".",
    rightsTitle: "Your Data Rights",
    rightsText: "You always retain full control. All voiceprint data belongs only to your account, is never shared with third parties, and is permanently erased when deleted.",
    exportMine: "Export My Voiceprint Data",
    clearAll: "Delete All Voiceprints",
    modalTitle: "Add A New Voiceprint",
    modalSub: "Collect at least 10 seconds of audio",
    nameLabel: "Name",
    namePlaceholder: "Example: Kenta Tanaka",
    roleLabel: "Role / Notes (Optional)",
    rolePlaceholder: "Example: CTO · Sunrise Co., Ltd.",
    modeLabel: "Person Type",
    modeInternal: "Internal Member",
    modeExternal: "External Guest",
    memberLabel: "Select Internal Member",
    memberPlaceholder: "Please select a member",
    memberSearchEmpty: "No matching members found.",
    memberHint: "Selecting a member auto-fills the name and title and links to the member master record.",
    readonlyHint: "Internal voiceprint names and titles follow the member master record and cannot be edited here.",
    typeInternal: "Internal Member",
    typeExternal: "External Guest",
    editModalTitle: "Edit External Voiceprint",
    editModalSub: "Only the external guest name and title notes can be changed. The recorded voiceprint sample stays unchanged.",
    readPromptTitle: "Please read the following passage clearly while recording (about 15 seconds)",
    readPromptBody:
      "Hello, I am now enrolling my voiceprint.<br>On a spring morning, sunlight fills a quiet valley while birds sing happily on the branches.<br>Please remember my voice and speaking style, whether I speak words or numbers: one two three four five six seven eight nine ten.<br>Thank you. This recording is used to identify me automatically during meetings.",
    readPromptTip: "Tip: Use a natural pace and volume, and read alone in a quiet environment for the best result.",
    sampleLabel: "Audio Sample",
    recordMain: "Record 10 Seconds",
    recordSub: "Or drop an audio file here, or extract it from an existing meeting",
    recordIdleMain: "Start Reading Recording (15s)",
    recordIdleSub: "Please read the text above clearly",
    recordLoadingFailed: "Engine failed to load. Please try again.",
    recordMicUnavailable: "Microphone unavailable",
    recordRunning: "Recording... {seconds}s",
    recordRunningSub: "Recording in progress...",
    recordBuilding: "Generating voiceprint...",
    recordTooShort: "Recording is too short. Please read the full prompt and record again.",
    recordTooShortSub: "Only {seconds}s captured this time. At least 8s is required.",
    recordReady: "✓ Voiceprint collected (click to record again)",
    recordReadySub: "Review the fields and save the profile",
    recordFailed: "Voiceprint generation failed. Please record again.",
    consent1: "<strong>I have obtained explicit consent from this speaker</strong> to collect their voiceprint for identity recognition.",
    consent2: "I understand that the voiceprint will be <strong>stored in the cloud with end-to-end encryption</strong> and can be exported or deleted by me at any time.",
    cancel: "Cancel",
    confirm: "Add Voiceprint",
    saveChanges: "Save Changes",
    saving: "Saving...",
    updating: "Saving...",
    emptyList: "No voiceprints yet. Click “Add Voiceprint” in the top right to start collecting one.",
    emptySearch: "No voiceprints match the current search.",
    statusReady: "Ready",
    storageLocalEncrypted: "Locally Encrypted",
    validationNameRequired: "Please enter a name.",
    validationMemberRequired: "Please select an internal member.",
    validationConsentsRequired: "Please confirm both consent items first.",
    validationSampleRequired: "Please record a voiceprint sample first.",
    validationInternalExists: "A voiceprint for this internal member already exists.",
    deleteConfirm: 'Delete voiceprint "{name}"?',
    saveFailed: "Failed to save: {message}",
    similarityWarning:
      "Warning: this voiceprint is very close to the existing profile “{name}” (cosine {score}).\n\nDifferent speakers are usually below 0.4. This often means the recording contains another voice, the environment is noisy, or the spoken sample is insufficient.\n\nWe recommend recording again in a quiet environment and reading the full prompt.\n\nDo you still want to save it?",
  },
};

export function getVoiceprintText(key) {
  const language = getSystemLanguage();
  return VOICEPRINT_TEXTS[language]?.[key] ?? VOICEPRINT_TEXTS.zh[key] ?? key;
}

function vt(key) {
  return getVoiceprintText(key);
}

export function formatVoiceprintCount(count) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `${count} 名`;
  }
  if (language === "en") {
    return `${count} profiles`;
  }
  return `${count} 位`;
}

export function formatVoiceprintPageSub(count) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `会議中の話者識別に使用 · 合計 ${count} 名`;
  }
  if (language === "en") {
    return `Used for automatic speaker identification during meetings · ${count} profiles`;
  }
  return `用于会议中自动识别说话人身份 · 共 ${count} 位`;
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

function getMeetingEntryLabel() {
  const hasOngoingMeeting = Boolean(currentUser?.id && getOngoingMeetingByUser(currentUser.id));
  const language = getSystemLanguage();
  if (hasOngoingMeeting) {
    return language === "ja" ? "現在の会議に戻る" : language === "en" ? "Back To Current Meeting" : "回到当前会议";
  }
  return vt("newMeeting");
}

function bindMeetingEntryButton() {
  const button = document.querySelector(".new-meeting-btn");
  if (!button || button.dataset.bound === "true") {
    return;
  }
  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    const ongoingMeeting = currentUser?.id ? getOngoingMeetingByUser(currentUser.id) : null;
    if (ongoingMeeting) {
      navigateToMeeting(ongoingMeeting.id);
      return;
    }
    navigateToHomeCreateMeeting();
  });
}

function applySidebarTranslations() {
  document.title = vt("title");
  const newMeeting = document.querySelector(".new-meeting-btn span");
  if (newMeeting) newMeeting.textContent = getMeetingEntryLabel();

  const navTitles = document.querySelectorAll(".nav-title");
  if (navTitles[0]) navTitles[0].textContent = vt("navMain");
  if (navTitles[1]) navTitles[1].textContent = vt("navAssets");
  if (navTitles[2]) navTitles[2].textContent = vt("navOrg");

  const navLabels = document.querySelectorAll(".nav-item span:not(.nav-count):not(.admin-badge)");
  if (navLabels[0]) navLabels[0].textContent = vt("navMeetings");
  if (navLabels[1]) navLabels[1].textContent = vt("navVoiceprints");
  if (navLabels[2]) navLabels[2].textContent = vt("navTerms");
  if (navLabels[3]) navLabels[3].textContent = vt("navAdmin");
  if (navLabels[4]) navLabels[4].textContent = vt("navSettings");

  const adminBadge = document.querySelector(".admin-badge");
  if (adminBadge) adminBadge.textContent = vt("adminBadge");

  const userPlan = document.querySelector(".user-plan");
  if (userPlan) {
    userPlan.textContent = `${t("role_admin")} · 神泉科技`;
  }
}

function applyVoiceRows() {
  document.querySelectorAll(".voice-row").forEach((row) => {
    const roleNode = row.querySelector(".voice-role");
    if (roleNode) {
      const [role, company] = roleNode.textContent.split("·").map((item) => item.trim());
      const localizedRole = getLocalizedParticipantRole(role, getSystemLanguage()) || role;
      roleNode.textContent = company ? `${localizedRole} · ${company}` : localizedRole;
    }

    const statusNode = row.querySelector(".voice-status span:last-child");
    if (statusNode) statusNode.textContent = vt("statusCollected");

    const storageNode = row.querySelector(".voice-storage");
    if (storageNode) {
      const textNode = Array.from(storageNode.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = ` ${vt("storageEncrypted")}`;
      }
    }

    row.querySelectorAll(".icon-btn").forEach((button, index) => {
      button.title = index === 0 ? vt("editTitle") : vt("deleteTitle");
      button.setAttribute("aria-label", button.title);
    });
  });
}

function applyTranslations() {
  applySidebarTranslations();

  const titleNode = document.querySelector(".page-title");
  if (titleNode?.childNodes[0]) {
    titleNode.childNodes[0].textContent = vt("pageTitle");
  }
  const encryptedBadge = document.querySelector(".page-title span");
  if (encryptedBadge) {
    encryptedBadge.lastChild.textContent = ` ${vt("encryptedBadge")}`;
  }
  const pageSub = document.querySelector(".page-sub");
  if (pageSub) pageSub.textContent = vt("pageSub");

  const topAction = document.querySelector(".top-actions .btn.primary");
  if (topAction) topAction.lastChild.textContent = ` ${vt("addVoiceprint")}`;

  const privacyTitle = document.querySelector(".privacy-title");
  if (privacyTitle) privacyTitle.textContent = vt("privacyTitle");
  const privacyPoints = document.querySelectorAll(".privacy-point");
  if (privacyPoints[0]) privacyPoints[0].textContent = vt("privacyPoint1");
  if (privacyPoints[1]) privacyPoints[1].textContent = vt("privacyPoint2");
  const privacyLink = document.querySelector(".privacy-foot a");
  if (privacyLink) privacyLink.textContent = vt("privacyLink");

  const searchTitle = document.querySelector(".search-row h2");
  if (searchTitle) searchTitle.textContent = vt("listTitle");
  const countPill = document.querySelector(".count-pill");
  if (countPill) countPill.textContent = vt("count");
  const searchInput = document.querySelector(".search-row .search-box input");
  if (searchInput) searchInput.placeholder = vt("searchPlaceholder");

  const meTag = document.querySelector(".voice-me-tag");
  if (meTag) meTag.textContent = t("common_me");
  applyVoiceRows();

  const settingLabel = document.querySelector(".setting-label");
  if (settingLabel) settingLabel.textContent = vt("autoMatchLabel");
  const settingHint = document.querySelector(".setting-hint");
  if (settingHint) settingHint.textContent = vt("autoMatchHint");

  const rightsTitle = document.querySelector(".data-rights h3");
  if (rightsTitle) rightsTitle.textContent = vt("rightsTitle");
  const rightsText = document.querySelector(".data-rights p");
  if (rightsText) rightsText.textContent = vt("rightsText");
  const rightsButtons = document.querySelectorAll(".data-rights .btn");
  if (rightsButtons[0]) rightsButtons[0].lastChild.textContent = ` ${vt("exportMine")}`;
  if (rightsButtons[1]) rightsButtons[1].lastChild.textContent = ` ${vt("clearAll")}`;

  const modal = document.getElementById("addModal");
  if (modal) {
    const headerTitle = modal.querySelector(".modal-header h2");
    const headerSub = modal.querySelector(".modal-header p");
    if (headerTitle) headerTitle.textContent = vt("modalTitle");
    if (headerSub) headerSub.textContent = vt("modalSub");

    const modeLabel = document.getElementById("vpModeLabel");
    const modeInternal = document.getElementById("vpModeInternal");
    const modeExternal = document.getElementById("vpModeExternal");
    const memberLabel = document.getElementById("vpMemberLabel");
    const memberHint = document.getElementById("vpMemberHint");
    const nameLabel = document.getElementById("vpNameLabel");
    const roleLabel = document.getElementById("vpRoleLabel");
    const sampleLabel = document.getElementById("vpSampleLabel");
    const readonlyHint = document.getElementById("vpReadonlyHint");
    const readPromptTitle = document.getElementById("vpReadPromptTitle");
    const readPromptBody = document.getElementById("vpReadPromptBody");
    const readPromptTip = document.getElementById("vpReadPromptTip");

    if (modeLabel) modeLabel.textContent = vt("modeLabel");
    if (modeInternal) modeInternal.textContent = vt("modeInternal");
    if (modeExternal) modeExternal.textContent = vt("modeExternal");
    if (memberLabel) memberLabel.textContent = vt("memberLabel");
    if (memberHint) memberHint.textContent = vt("memberHint");
    if (nameLabel) nameLabel.textContent = vt("nameLabel");
    if (roleLabel) roleLabel.textContent = vt("roleLabel");
    if (sampleLabel) sampleLabel.textContent = vt("sampleLabel");
    if (readonlyHint) readonlyHint.textContent = vt("readonlyHint");
    if (readPromptTitle) readPromptTitle.lastChild.textContent = ` ${vt("readPromptTitle")}`;
    if (readPromptBody) readPromptBody.innerHTML = vt("readPromptBody");
    if (readPromptTip) readPromptTip.textContent = vt("readPromptTip");

    const inputs = modal.querySelectorAll(".form-input");
    const memberSelect = document.getElementById("vpMemberSelect");
    if (memberSelect?.options[0]) {
      memberSelect.options[0].textContent = vt("memberPlaceholder");
    }
    if (inputs[1]) inputs[1].placeholder = vt("namePlaceholder");
    if (inputs[2]) inputs[2].placeholder = vt("rolePlaceholder");

    const mainText = modal.querySelector(".upload-zone .main-text");
    const subText = modal.querySelector(".upload-zone .sub-text");
    if (mainText) mainText.textContent = vt("recordIdleMain");
    if (subText) subText.textContent = vt("recordIdleSub");

    const consentTexts = modal.querySelectorAll(".consent-text");
    if (consentTexts[0]) consentTexts[0].innerHTML = vt("consent1");
    if (consentTexts[1]) consentTexts[1].innerHTML = vt("consent2");

    const footerButtons = modal.querySelectorAll(".modal-footer .btn");
    if (footerButtons[0]) footerButtons[0].textContent = vt("cancel");
    if (footerButtons[1]) footerButtons[1].textContent = vt("confirm");
  }
}

function initVoiceprintPage() {
  currentUser = initPageAuth();
  if (!currentUser) {
    return;
  }
  bindMeetingEntryButton();
  applyTranslations();
  onSystemLanguageChange(() => {
    applyTranslations();
  });
}

// 动态渲染的声纹行（renderList 注入）在初次 applyTranslations 之后才出现，
// 需由页面在 renderList 完成后回调，单独补翻这些新行。
export function applyVoiceprintRowTranslations() {
  applyVoiceRows();
}

initVoiceprintPage();
