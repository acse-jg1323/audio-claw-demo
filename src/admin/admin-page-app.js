import { initPageAuth } from "../auth/page-auth.js";
import { getSystemLanguage, onSystemLanguageChange } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";
import { getOngoingMeetingByUser } from "../storage/meeting-store.js";
import {
  createOrgMember,
  deleteOrgMember,
  getOrgMemberById,
  getOrgMembersByCompany,
  updateOrgMember,
} from "../storage/org-member-store.js";
import { deleteVoiceprintsByMemberId } from "../storage/voiceprint-store.js";

const PAGE_SIZE = 14;
const SEAT_LIMIT = 50;

let currentUser = null;

const refs = {
  pageTitle: document.querySelector(".page-title"),
  adminMode: document.querySelector(".admin-mode"),
  pageSub: document.getElementById("adminPageSub"),
  topButtons: document.querySelectorAll(".top-actions .btn"),
  statLabels: document.querySelectorAll(".stat-label"),
  statSubs: document.querySelectorAll(".stat-sub"),
  seatUsageValue: document.getElementById("seatUsageValue"),
  seatUsageProgress: document.getElementById("seatUsageProgress"),
  seatUsageSub: document.getElementById("seatUsageSub"),
  weeklyActiveValue: document.getElementById("weeklyActiveValue"),
  weeklyActiveSub: document.getElementById("weeklyActiveSub"),
  pendingInviteValue: document.getElementById("pendingInviteValue"),
  pendingInviteSub: document.getElementById("pendingInviteSub"),
  mainBannerTitle: document.querySelector(".content > .admin-banner .ab-title"),
  mainBannerSub: document.querySelector(".content > .admin-banner .ab-sub"),
  tabs: document.querySelectorAll(".tab"),
  membersTabCount: document.getElementById("membersTabCount"),
  memberFilterChips: document.querySelectorAll('[data-panel="members"] .chip[data-member-filter]'),
  memberDepartmentFilter: document.getElementById("memberDepartmentFilter"),
  memberSearchInput: document.getElementById("memberSearchInput"),
  membersTableBody: document.getElementById("membersTableBody"),
  membersFooterCount: document.getElementById("membersFooterCount"),
  membersPrevPage: document.getElementById("membersPrevPage"),
  membersNextPage: document.getElementById("membersNextPage"),
  membersPageInfo: document.getElementById("membersPageInfo"),
  sharedBannerTitle: document.querySelector('.panel[data-panel="terms"] .ab-title'),
  sharedBannerSub: document.querySelector('.panel[data-panel="terms"] .ab-sub'),
  inviteModal: document.getElementById("inviteModal"),
  memberModalTitle: document.getElementById("memberModalTitle"),
  memberModalSub: document.getElementById("memberModalSub"),
  memberNameLabel: document.getElementById("memberNameLabel"),
  memberNameInput: document.getElementById("memberNameInput"),
  memberEmailLabel: document.getElementById("memberEmailLabel"),
  memberEmailInput: document.getElementById("memberEmailInput"),
  memberRoleLabel: document.getElementById("memberRoleLabel"),
  memberRoleOptions: document.querySelectorAll("#inviteModal .role-opt"),
  memberDepartmentLabel: document.getElementById("memberDepartmentLabel"),
  memberDepartmentSelect: document.getElementById("memberDepartmentSelect"),
  memberTitleLabel: document.getElementById("memberTitleLabel"),
  memberTitleInput: document.getElementById("memberTitleInput"),
  memberModalCancel: document.getElementById("memberModalCancel"),
  memberModalSubmit: document.getElementById("memberModalSubmit"),
  memberActionMenu: document.getElementById("memberActionMenu"),
  memberActionMenuButtons: document.querySelectorAll("#memberActionMenu .action-menu-btn"),
};

const state = {
  members: [],
  activeFilter: "all",
  department: "all",
  searchText: "",
  currentPage: 1,
  modalMode: "create",
  editingMemberId: null,
  actionMenuMemberId: null,
};

const ADMIN_TEXTS = {
  zh: {
    title: "AudioClaw · 管理后台",
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
    pageTitle: "组织管理",
    adminMode: "管理员模式",
    exportReport: "导出报表",
    inviteMember: "新增成员",
    statSeatUsage: "席位用量",
    statWeeklyActive: "本周活跃成员",
    statPendingInvite: "待激活邀请",
    statTerms: "企业术语数",
    statTermsSub: "本周新增 3 条",
    bannerTitle: "你正在以 <strong>管理员</strong> 身份操作神泉科技组织",
    bannerSub: "此处的所有操作（成员变更、企业术语修改）会立即影响组织内所有成员，请谨慎操作。",
    tabMembers: "成员管理",
    tabTerms: "企业热词库",
    departments: ["所有部门", "管理层", "销售", "产品", "研发", "市场", "法务", "财务", "客户成功", "HR"],
    memberSearch: "搜索姓名或邮箱…",
    memberHeaders: ["成员", "角色", "部门", "状态", "最近活跃", "加入时间"],
    meTag: "我",
    roleOwner: "👑 所有者",
    roleAdmin: "🛡 管理员",
    roleMember: "成员",
    statusActive: "活跃",
    statusPending: "待激活",
    statusDisabled: "已停用",
    prev: "‹ 上一页",
    next: "下一页 ›",
    sharedBannerSub: "在此处添加、修改、删除的术语，会议中所有成员都会自动应用相同译法，确保术语一致性。",
    termChips: ["全部 23", "固定译法 18", "识别热词 5"],
    termLanguageOptions: ["所有语言对", "中 ↔ 日", "中 ↔ 英", "多语言"],
    termSortOptions: ["按命中次数", "按更新时间", "按字母排序"],
    termSearch: "搜索术语…",
    importExcel: "导入 Excel",
    export: "导出",
    createEnterpriseTerm: "新增企业术语",
    termHeaders: ["源词", "译法", "类型", "语言对", "维护者", "更新时间"],
    termTypeFixed: "固定译法",
    termTypeHotword: "识别热词",
    multiLanguage: "多语言",
    termFooter: "显示 10 / 23 条",
    memberNameLabel: "姓名",
    memberEmailLabel: "邮箱地址",
    roleLabel: "分配角色",
    memberRoleTitle: "普通成员",
    memberRoleDesc: "可使用所有功能，不能管理组织",
    adminRoleTitle: "管理员",
    adminRoleDesc: "可管理成员与企业资产",
    departmentLabel: "所属部门",
    departmentDefault: "不指定",
    memberTitleLabel: "职位",
    memberNamePlaceholder: "如：张三",
    memberEmailPlaceholder: "zhangsan@shenchuan.com",
    memberTitlePlaceholder: "如：销售总监",
    createMemberTitle: "新增成员",
    createMemberSub: "新增为真实组织成员，保存后将直接以活跃状态进入列表。",
    editMemberTitle: "编辑成员信息",
    editMemberSub: "仅修改姓名、邮箱、角色、部门与职位，不改变页面展示结构。",
    sendInvite: "确认新增",
    saveChanges: "保存修改",
    cancel: "取消",
    actionEdit: "编辑",
    actionDelete: "删除",
    emptyMembers: "当前筛选条件下暂无成员",
    validationNameRequired: "请填写成员姓名。",
    validationEmailRequired: "请填写邮箱地址。",
    validationEmailDuplicate: "该邮箱已存在，请使用其他邮箱。",
    deleteConfirm: "确认删除成员“{name}”吗？",
  },
  ja: {
    title: "AudioClaw · 管理コンソール",
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
    pageTitle: "組織管理",
    adminMode: "管理者モード",
    exportReport: "レポートを書き出す",
    inviteMember: "メンバーを追加",
    statSeatUsage: "シート使用数",
    statWeeklyActive: "今週のアクティブメンバー",
    statPendingInvite: "未有効化の招待",
    statTerms: "企業用語数",
    statTermsSub: "今週 3 件追加",
    bannerTitle: "<strong>管理者</strong>として神泉科技組織を操作しています",
    bannerSub: "ここでのすべての操作（メンバー変更、企業用語の変更）は組織内の全員に即時反映されます。慎重に操作してください。",
    tabMembers: "メンバー管理",
    tabTerms: "企業用語ライブラリ",
    departments: ["全部門", "経営層", "営業", "プロダクト", "研究開発", "マーケティング", "法務", "財務", "カスタマーサクセス", "HR"],
    memberSearch: "氏名またはメールを検索…",
    memberHeaders: ["メンバー", "役割", "部門", "状態", "最終アクティブ", "参加日"],
    meTag: "自分",
    roleOwner: "👑 オーナー",
    roleAdmin: "🛡 管理者",
    roleMember: "メンバー",
    statusActive: "アクティブ",
    statusPending: "未有効化",
    statusDisabled: "無効化",
    prev: "‹ 前へ",
    next: "次へ ›",
    sharedBannerSub: "ここで追加、変更、削除した用語は会議中に全メンバーへ同じ訳語として適用され、用語の一貫性を保ちます。",
    termChips: ["すべて 23", "固定訳 18", "認識ホットワード 5"],
    termLanguageOptions: ["すべての言語ペア", "中 ↔ 日", "中 ↔ 英", "多言語"],
    termSortOptions: ["命中回数順", "更新日時順", "アルファベット順"],
    termSearch: "用語を検索…",
    importExcel: "Excel を取り込む",
    export: "書き出す",
    createEnterpriseTerm: "企業用語を追加",
    termHeaders: ["原語", "訳語", "タイプ", "言語ペア", "管理者", "更新日時"],
    termTypeFixed: "固定訳",
    termTypeHotword: "認識ホットワード",
    multiLanguage: "多言語",
    termFooter: "10 / 23 件を表示",
    memberNameLabel: "氏名",
    memberEmailLabel: "メールアドレス",
    roleLabel: "役割を割り当てる",
    memberRoleTitle: "一般メンバー",
    memberRoleDesc: "すべての機能を使えますが、組織管理はできません",
    adminRoleTitle: "管理者",
    adminRoleDesc: "メンバーと企業アセットを管理できます",
    departmentLabel: "所属部門",
    departmentDefault: "指定しない",
    memberTitleLabel: "役職",
    memberNamePlaceholder: "例: 山田太郎",
    memberEmailPlaceholder: "taro.yamada@shenchuan.com",
    memberTitlePlaceholder: "例: 営業部長",
    createMemberTitle: "メンバーを追加",
    createMemberSub: "実際の組織メンバーとして追加し、保存後すぐにアクティブ状態で一覧へ反映します。",
    editMemberTitle: "メンバー情報を編集",
    editMemberSub: "氏名、メール、役割、部門、役職のみを更新し、画面構成は変更しません。",
    sendInvite: "追加する",
    saveChanges: "変更を保存",
    cancel: "キャンセル",
    actionEdit: "編集",
    actionDelete: "削除",
    emptyMembers: "現在の条件ではメンバーがいません",
    validationNameRequired: "メンバー名を入力してください。",
    validationEmailRequired: "メールアドレスを入力してください。",
    validationEmailDuplicate: "このメールアドレスは既に存在します。",
    deleteConfirm: "メンバー「{name}」を削除しますか？",
  },
  en: {
    title: "AudioClaw · Admin Console",
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
    pageTitle: "Organization Management",
    adminMode: "Admin Mode",
    exportReport: "Export Report",
    inviteMember: "Add Member",
    statSeatUsage: "Seat Usage",
    statWeeklyActive: "Weekly Active Members",
    statPendingInvite: "Pending Invites",
    statTerms: "Enterprise Terms",
    statTermsSub: "3 new entries this week",
    bannerTitle: "You are operating the Shenquan Technology workspace as an <strong>admin</strong>",
    bannerSub: "All actions here, including member changes and enterprise term edits, immediately affect everyone in the organization. Please proceed carefully.",
    tabMembers: "Members",
    tabTerms: "Enterprise Terms",
    departments: ["All Departments", "Leadership", "Sales", "Product", "Engineering", "Marketing", "Legal", "Finance", "Customer Success", "HR"],
    memberSearch: "Search by name or email...",
    memberHeaders: ["Member", "Role", "Department", "Status", "Last Active", "Joined"],
    meTag: "Me",
    roleOwner: "👑 Owner",
    roleAdmin: "🛡 Admin",
    roleMember: "Member",
    statusActive: "Active",
    statusPending: "Pending",
    statusDisabled: "Disabled",
    prev: "‹ Previous",
    next: "Next ›",
    sharedBannerSub: "Any term added, edited, or deleted here is automatically applied to every member during meetings to keep terminology consistent.",
    termChips: ["All 23", "Fixed 18", "Hotwords 5"],
    termLanguageOptions: ["All Language Pairs", "ZH ↔ JA", "ZH ↔ EN", "Multilingual"],
    termSortOptions: ["By Hit Count", "By Updated Time", "Alphabetical"],
    termSearch: "Search terms...",
    importExcel: "Import Excel",
    export: "Export",
    createEnterpriseTerm: "Add Enterprise Term",
    termHeaders: ["Source", "Translation", "Type", "Language Pair", "Maintainer", "Updated"],
    termTypeFixed: "Fixed Translation",
    termTypeHotword: "Recognition Hotword",
    multiLanguage: "Multilingual",
    termFooter: "Showing 10 / 23",
    memberNameLabel: "Name",
    memberEmailLabel: "Email Address",
    roleLabel: "Assign Role",
    memberRoleTitle: "Member",
    memberRoleDesc: "Can use all features but cannot manage the organization",
    adminRoleTitle: "Admin",
    adminRoleDesc: "Can manage members and enterprise assets",
    departmentLabel: "Department",
    departmentDefault: "Not specified",
    memberTitleLabel: "Job Title",
    memberNamePlaceholder: "e.g. Alex Chen",
    memberEmailPlaceholder: "alex.chen@shenchuan.com",
    memberTitlePlaceholder: "e.g. Sales Director",
    createMemberTitle: "Add Member",
    createMemberSub: "Add a real organization member and place the record into the list as active immediately after saving.",
    editMemberTitle: "Edit Member",
    editMemberSub: "Update only name, email, role, department, and title without changing the page layout.",
    sendInvite: "Add Member",
    saveChanges: "Save Changes",
    cancel: "Cancel",
    actionEdit: "Edit",
    actionDelete: "Delete",
    emptyMembers: "No members match the current filters",
    validationNameRequired: "Please enter a member name.",
    validationEmailRequired: "Please enter an email address.",
    validationEmailDuplicate: "This email already exists.",
    deleteConfirm: 'Delete member "{name}"?',
  },
};

const DEPARTMENT_LABELS = {
  管理层: { zh: "管理层", ja: "経営層", en: "Leadership" },
  销售: { zh: "销售", ja: "営業", en: "Sales" },
  产品: { zh: "产品", ja: "プロダクト", en: "Product" },
  研发: { zh: "研发", ja: "研究開発", en: "Engineering" },
  市场: { zh: "市场", ja: "マーケティング", en: "Marketing" },
  法务: { zh: "法务", ja: "法務", en: "Legal" },
  财务: { zh: "财务", ja: "財務", en: "Finance" },
  客户成功: { zh: "客户成功", ja: "カスタマーサクセス", en: "Customer Success" },
  HR: { zh: "HR", ja: "HR", en: "HR" },
};

function at(key) {
  const language = getSystemLanguage();
  return ADMIN_TEXTS[language]?.[key] ?? ADMIN_TEXTS.zh[key] ?? key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function interpolate(template, values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function translateRelativeTime(text) {
  const value = String(text || "").trim();
  const language = getSystemLanguage();
  if (!value) return value;
  if (language === "zh" || value === "—") return value;
  if (value === "刚刚") return language === "ja" ? "たった今" : "Just now";

  const minuteMatch = value.match(/^(\d+)\s*分钟前$/);
  if (minuteMatch) return language === "ja" ? `${minuteMatch[1]} 分前` : `${minuteMatch[1]} minutes ago`;

  const hourMatch = value.match(/^(\d+)\s*小时前$/);
  if (hourMatch) return language === "ja" ? `${hourMatch[1]} 時間前` : `${hourMatch[1]} hours ago`;

  const dayMatch = value.match(/^(\d+)\s*天前$/);
  if (dayMatch) return language === "ja" ? `${dayMatch[1]} 日前` : `${dayMatch[1]} days ago`;

  const weekMatch = value.match(/^(\d+)\s*周前$/);
  if (weekMatch) return language === "ja" ? `${weekMatch[1]} 週間前` : `${weekMatch[1]} weeks ago`;

  const todayMatch = value.match(/^今天\s+(.+)$/);
  if (todayMatch) return language === "ja" ? `今日 ${todayMatch[1]}` : `Today ${todayMatch[1]}`;

  if (value === "昨天") return language === "ja" ? "昨日" : "Yesterday";
  return value;
}

function translateDepartment(value) {
  const language = getSystemLanguage();
  return DEPARTMENT_LABELS[value]?.[language] ?? value;
}

function syncDepartmentOptions(select, defaultLabel, allLabel) {
  Array.from(select?.options || []).forEach((option) => {
    if (option.value === "all") {
      option.textContent = allLabel;
      return;
    }
    if (!option.value) {
      option.textContent = defaultLabel;
      return;
    }
    option.textContent = translateDepartment(option.value);
  });
}

function getMeetingEntryLabel() {
  const hasOngoingMeeting = Boolean(currentUser?.id && getOngoingMeetingByUser(currentUser.id));
  const language = getSystemLanguage();
  if (hasOngoingMeeting) {
    return language === "ja"
      ? "現在の会議に戻る"
      : language === "en"
        ? "Back To Current Meeting"
        : "回到当前会议";
  }
  return at("newMeeting");
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

function loadMembers() {
  state.members = getOrgMembersByCompany(currentUser?.company || "神泉科技").sort((a, b) => {
    const memberWeight = (member) => {
      if (member.status === "disabled") return 4;
      if (member.status === "pending") return 3;
      if (member.role === "member") return 2;
      if (member.role === "admin") return 1;
      return 0;
    };

    const weightDiff = memberWeight(a) - memberWeight(b);
    if (weightDiff !== 0) {
      return weightDiff;
    }

    const createdAtDiff = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    if (createdAtDiff !== 0) {
      return createdAtDiff;
    }

    return new Date(b.joinedAt || 0).getTime() - new Date(a.joinedAt || 0).getTime();
  });
}

function getMemberCounts() {
  return {
    all: state.members.length,
    owner: state.members.filter((member) => member.role === "owner").length,
    admin: state.members.filter((member) => member.role === "admin").length,
    member: state.members.filter((member) => member.role === "member" && member.status === "active").length,
    pending: state.members.filter((member) => member.status === "pending").length,
    disabled: state.members.filter((member) => member.status === "disabled").length,
  };
}

function getFilteredMembers() {
  const keyword = state.searchText.trim().toLowerCase();

  return state.members.filter((member) => {
    if (state.activeFilter === "owner" && member.role !== "owner") {
      return false;
    }
    if (state.activeFilter === "admin" && member.role !== "admin") {
      return false;
    }
    if (state.activeFilter === "member" && !(member.role === "member" && member.status === "active")) {
      return false;
    }
    if (state.activeFilter === "pending" && member.status !== "pending") {
      return false;
    }
    if (state.activeFilter === "disabled" && member.status !== "disabled") {
      return false;
    }

    if (state.department !== "all" && member.department !== state.department) {
      return false;
    }

    if (keyword) {
      const haystack = `${member.name} ${member.email}`.toLowerCase();
      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    return true;
  });
}

function getPagedMembers() {
  const filteredMembers = getFilteredMembers();
  const pageCount = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  if (state.currentPage > pageCount) {
    state.currentPage = pageCount;
  }
  const start = (state.currentPage - 1) * PAGE_SIZE;
  return {
    filteredMembers,
    pageCount,
    pageMembers: filteredMembers.slice(start, start + PAGE_SIZE),
  };
}

function formatMemberChip(filter, count) {
  const language = getSystemLanguage();
  const labels = {
    zh: {
      all: "全部",
      owner: "所有者",
      admin: "管理员",
      member: "普通成员",
      pending: "待激活",
      disabled: "已停用",
    },
    ja: {
      all: "すべて",
      owner: "オーナー",
      admin: "管理者",
      member: "メンバー",
      pending: "未有効化",
      disabled: "無効化",
    },
    en: {
      all: "All",
      owner: "Owners",
      admin: "Admins",
      member: "Members",
      pending: "Pending",
      disabled: "Disabled",
    },
  };
  return `${labels[language]?.[filter] ?? labels.zh[filter]} ${count}`;
}

function formatFooterCount(visibleCount, totalCount) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `${visibleCount} / ${totalCount} 名を表示`;
  }
  if (language === "en") {
    return `Showing ${visibleCount} / ${totalCount}`;
  }
  return `显示 ${visibleCount} / ${totalCount} 位`;
}

function formatPageInfo(page, pageCount) {
  return `${page} / ${pageCount}`;
}

function formatPageSub(total) {
  const company = currentUser?.company || "神泉科技";
  const language = getSystemLanguage();
  if (language === "ja") {
    return `${company} · Enterprise · ${total} / ${SEAT_LIMIT} シート`;
  }
  if (language === "en") {
    return `${company} · Enterprise · ${total} / ${SEAT_LIMIT} seats`;
  }
  return `${company} · 企业版 · ${total} / ${SEAT_LIMIT} 席位`;
}

function formatSeatUsageSub(remaining) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `残り ${remaining} シート`;
  }
  if (language === "en") {
    return `${remaining} seats remaining`;
  }
  return `剩余 ${remaining} 席`;
}

function formatWeeklyActiveSub(activeCount, totalCount) {
  const rate = totalCount ? Math.round((activeCount / totalCount) * 100) : 0;
  const language = getSystemLanguage();
  if (language === "ja") {
    return `アクティブ率 ${rate}%`;
  }
  if (language === "en") {
    return `${rate}% active rate`;
  }
  return `活跃率 ${rate}%`;
}

function formatSharedBannerTitle(total) {
  const language = getSystemLanguage();
  if (language === "ja") {
    return `企業用語ライブラリは ${total} 名全員に同期されます`;
  }
  if (language === "en") {
    return `Enterprise terms sync to all ${total} members`;
  }
  return `企业热词库会同步到所有 ${total} 位成员`;
}

function getRoleLabel(role) {
  if (role === "owner") return at("roleOwner");
  if (role === "admin") return at("roleAdmin");
  return at("roleMember");
}

function getRoleClass(role) {
  if (role === "owner") return "role-owner";
  if (role === "admin") return "role-admin";
  return "role-member";
}

function getStatusLabel(status) {
  if (status === "pending") return at("statusPending");
  if (status === "disabled") return at("statusDisabled");
  return at("statusActive");
}

function renderMemberChips() {
  const counts = getMemberCounts();
  refs.memberFilterChips.forEach((chip) => {
    const filter = chip.dataset.memberFilter;
    chip.textContent = formatMemberChip(filter, counts[filter] ?? 0);
    chip.classList.toggle("active", state.activeFilter === filter);
  });
}

function renderStats() {
  const total = state.members.length;
  const weeklyActive = state.members.filter((member) => member.isWeeklyActive).length;
  const pending = state.members.filter((member) => member.status === "pending").length;
  const remaining = Math.max(SEAT_LIMIT - total, 0);
  const seatProgress = Math.min(100, Math.round((total / SEAT_LIMIT) * 100));

  if (refs.pageSub) refs.pageSub.textContent = formatPageSub(total);
  if (refs.seatUsageValue) {
    refs.seatUsageValue.innerHTML = `${total}<span style="font-size:13px;color:var(--text-tertiary);font-weight:500"> / ${SEAT_LIMIT}</span>`;
  }
  if (refs.seatUsageProgress) {
    refs.seatUsageProgress.style.width = `${seatProgress}%`;
  }
  if (refs.seatUsageSub) refs.seatUsageSub.textContent = formatSeatUsageSub(remaining);
  if (refs.weeklyActiveValue) refs.weeklyActiveValue.textContent = String(weeklyActive);
  if (refs.weeklyActiveSub) refs.weeklyActiveSub.textContent = formatWeeklyActiveSub(weeklyActive, total);
  if (refs.pendingInviteValue) refs.pendingInviteValue.textContent = String(pending);
  if (refs.membersTabCount) refs.membersTabCount.textContent = String(total);
  if (refs.sharedBannerTitle) refs.sharedBannerTitle.textContent = formatSharedBannerTitle(total);
}

function renderMemberTable() {
  const { filteredMembers, pageCount, pageMembers } = getPagedMembers();

  if (!pageMembers.length) {
    refs.membersTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="padding:32px 16px;text-align:center;color:var(--text-tertiary)">
          ${escapeHtml(at("emptyMembers"))}
        </td>
      </tr>
    `;
  } else {
    refs.membersTableBody.innerHTML = pageMembers
      .map((member) => {
        const isMe = currentUser?.name === member.name;
        return `
          <tr>
            <td><div class="checkbox"></div></td>
            <td>
              <div class="member-cell">
                <div class="member-avatar" style="background:${escapeHtml(member.avatarColor)}">${escapeHtml(member.avatarText)}</div>
                <div class="member-info">
                  <div class="member-name">
                    ${escapeHtml(member.name)}${isMe ? `<span class="member-me-tag">${escapeHtml(at("meTag"))}</span>` : ""}
                  </div>
                  <div class="member-email">${escapeHtml(member.email)}</div>
                </div>
              </div>
            </td>
            <td><span class="role-pill ${getRoleClass(member.role)}">${escapeHtml(getRoleLabel(member.role))}</span></td>
            <td>${escapeHtml(translateDepartment(member.department || "—"))}</td>
            <td><span class="status-pill status-${escapeHtml(member.status)}"><span class="status-dot"></span>${escapeHtml(getStatusLabel(member.status))}</span></td>
            <td>${escapeHtml(translateRelativeTime(member.lastActiveLabel))}</td>
            <td>${escapeHtml(member.joinedAt)}</td>
            <td class="col-actions">
              <button class="icon-btn" type="button" data-member-action="menu" data-member-id="${escapeHtml(member.id)}">⋯</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  refs.membersFooterCount.textContent = formatFooterCount(pageMembers.length, filteredMembers.length);
  refs.membersPageInfo.textContent = formatPageInfo(state.currentPage, pageCount);
  refs.membersPrevPage.disabled = state.currentPage <= 1;
  refs.membersNextPage.disabled = state.currentPage >= pageCount;
}

function renderMemberFiltersAndTable() {
  renderMemberChips();
  renderMemberTable();
}

function renderMemberModalTexts() {
  refs.memberNameLabel.textContent = at("memberNameLabel");
  refs.memberEmailLabel.textContent = at("memberEmailLabel");
  refs.memberRoleLabel.textContent = at("roleLabel");
  refs.memberDepartmentLabel.textContent = at("departmentLabel");
  refs.memberTitleLabel.textContent = at("memberTitleLabel");
  refs.memberNameInput.placeholder = at("memberNamePlaceholder");
  refs.memberEmailInput.placeholder = at("memberEmailPlaceholder");
  refs.memberTitleInput.placeholder = at("memberTitlePlaceholder");
  if (refs.memberModalCancel) refs.memberModalCancel.textContent = at("cancel");
  refs.memberModalSubmit.textContent = state.modalMode === "edit" ? at("saveChanges") : at("sendInvite");
  refs.memberActionMenuButtons[0].textContent = at("actionEdit");
  refs.memberActionMenuButtons[1].textContent = at("actionDelete");

  const roleTitles = refs.inviteModal.querySelectorAll(".role-opt-title");
  const roleDescs = refs.inviteModal.querySelectorAll(".role-opt-desc");
  if (roleTitles[0]) roleTitles[0].textContent = at("memberRoleTitle");
  if (roleDescs[0]) roleDescs[0].textContent = at("memberRoleDesc");
  if (roleTitles[1]) roleTitles[1].textContent = at("adminRoleTitle");
  if (roleDescs[1]) roleDescs[1].textContent = at("adminRoleDesc");

  syncDepartmentOptions(refs.memberDepartmentSelect, at("departmentDefault"), at("departments")[0]);

  if (state.modalMode === "edit") {
    refs.memberModalTitle.textContent = at("editMemberTitle");
    refs.memberModalSub.textContent = at("editMemberSub");
  } else {
    refs.memberModalTitle.textContent = at("createMemberTitle");
    refs.memberModalSub.textContent = at("createMemberSub");
  }
}

function applySidebarTranslations() {
  document.title = at("title");
  const newMeeting = document.querySelector(".new-meeting-btn span");
  if (newMeeting) newMeeting.textContent = getMeetingEntryLabel();

  const navTitles = document.querySelectorAll(".nav-title");
  if (navTitles[0]) navTitles[0].textContent = at("navMain");
  if (navTitles[1]) navTitles[1].textContent = at("navAssets");
  if (navTitles[2]) navTitles[2].textContent = at("navOrg");

  const navLabels = document.querySelectorAll(".nav-item span:not(.nav-count):not(.admin-badge)");
  if (navLabels[0]) navLabels[0].textContent = at("navMeetings");
  if (navLabels[1]) navLabels[1].textContent = at("navVoiceprints");
  if (navLabels[2]) navLabels[2].textContent = at("navTerms");
  if (navLabels[3]) navLabels[3].textContent = at("navAdmin");
  if (navLabels[4]) navLabels[4].textContent = at("navSettings");

  const adminBadge = document.querySelector(".admin-badge");
  if (adminBadge) adminBadge.textContent = at("adminBadge");

  const userPlan = document.querySelector(".user-plan");
  if (userPlan) userPlan.textContent = `${t("role_admin")} · ${currentUser?.company || "神泉科技"}`;
}

function applyTermsPanelTranslations() {
  const headerCells = document.querySelectorAll('.panel[data-panel="terms"] thead th');
  [0, 2, 3, 4, 5, 6].forEach((headerIndex, index) => {
    if (headerCells[headerIndex]) {
      headerCells[headerIndex].textContent = at("termHeaders")[index];
    }
  });

  document.querySelectorAll('.panel[data-panel="terms"] .pill.locked').forEach((node) => {
    node.textContent = at("termTypeFixed");
  });
  document.querySelectorAll('.panel[data-panel="terms"] .pill.auto').forEach((node) => {
    node.textContent = at("termTypeHotword");
  });
  document.querySelectorAll('.panel[data-panel="terms"] .lang-tag').forEach((node) => {
    node.textContent = at("multiLanguage");
  });

  document.querySelectorAll('.panel[data-panel="terms"] tbody tr').forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells[6]) cells[6].textContent = translateRelativeTime(cells[6].textContent.trim());
  });
}

function applyStaticTranslations() {
  applySidebarTranslations();

  if (refs.pageTitle?.childNodes[0]) refs.pageTitle.childNodes[0].textContent = at("pageTitle");
  if (refs.adminMode) refs.adminMode.lastChild.textContent = ` ${at("adminMode")}`;

  if (refs.topButtons[0]) refs.topButtons[0].lastChild.textContent = ` ${at("exportReport")}`;
  if (refs.topButtons[1]) refs.topButtons[1].lastChild.textContent = ` ${at("inviteMember")}`;

  if (refs.statLabels[0]) refs.statLabels[0].lastChild.textContent = ` ${at("statSeatUsage")}`;
  if (refs.statLabels[1]) refs.statLabels[1].lastChild.textContent = ` ${at("statWeeklyActive")}`;
  if (refs.statLabels[2]) refs.statLabels[2].lastChild.textContent = ` ${at("statPendingInvite")}`;
  if (refs.statLabels[3]) refs.statLabels[3].lastChild.textContent = ` ${at("statTerms")}`;

  if (refs.statSubs[3]) refs.statSubs[3].textContent = at("statTermsSub");
  if (refs.mainBannerTitle) refs.mainBannerTitle.innerHTML = at("bannerTitle");
  if (refs.mainBannerSub) refs.mainBannerSub.textContent = at("bannerSub");

  if (refs.tabs[0]) refs.tabs[0].childNodes[2].textContent = at("tabMembers");
  if (refs.tabs[1]) refs.tabs[1].childNodes[2].textContent = at("tabTerms");

  syncDepartmentOptions(refs.memberDepartmentFilter, at("departmentDefault"), at("departments")[0]);
  refs.memberSearchInput.placeholder = at("memberSearch");

  const memberHeaderCells = document.querySelectorAll('.panel[data-panel="members"] thead th');
  [1, 2, 3, 4, 5, 6].forEach((headerIndex, index) => {
    if (memberHeaderCells[headerIndex]) {
      memberHeaderCells[headerIndex].textContent = at("memberHeaders")[index];
    }
  });

  const memberFooterButtons = document.querySelectorAll('.panel[data-panel="members"] .table-footer .btn.sm');
  if (memberFooterButtons[0]) memberFooterButtons[0].textContent = at("prev");
  if (memberFooterButtons[1]) memberFooterButtons[1].textContent = at("next");

  if (refs.sharedBannerSub) refs.sharedBannerSub.textContent = at("sharedBannerSub");

  const termChips = document.querySelectorAll('.panel[data-panel="terms"] .chip');
  termChips.forEach((node, index) => {
    node.textContent = at("termChips")[index] || node.textContent;
  });
  const termSelects = document.querySelectorAll('.panel[data-panel="terms"] .select');
  if (termSelects[0]) {
    Array.from(termSelects[0].options).forEach((option, index) => {
      option.textContent = at("termLanguageOptions")[index] || option.textContent;
    });
  }
  if (termSelects[1]) {
    Array.from(termSelects[1].options).forEach((option, index) => {
      option.textContent = at("termSortOptions")[index] || option.textContent;
    });
  }
  const termSearch = document.querySelector('.panel[data-panel="terms"] .search-box input');
  if (termSearch) termSearch.placeholder = at("termSearch");
  const termPanelButtons = document.querySelectorAll('.panel[data-panel="terms"] .btn');
  if (termPanelButtons[0]) termPanelButtons[0].lastChild.textContent = ` ${at("importExcel")}`;
  if (termPanelButtons[1]) termPanelButtons[1].lastChild.textContent = ` ${at("export")}`;
  if (termPanelButtons[2]) termPanelButtons[2].lastChild.textContent = ` ${at("createEnterpriseTerm")}`;
  applyTermsPanelTranslations();
  const termFooter = document.querySelector('.panel[data-panel="terms"] .table-footer span');
  if (termFooter) termFooter.textContent = at("termFooter");
  const termFooterButtons = document.querySelectorAll('.panel[data-panel="terms"] .table-footer .btn.sm');
  if (termFooterButtons[0]) termFooterButtons[0].textContent = at("prev");
  if (termFooterButtons[1]) termFooterButtons[1].textContent = at("next");
}

function renderAll() {
  applyStaticTranslations();
  renderStats();
  renderMemberFiltersAndTable();
  renderMemberModalTexts();
}

function resetMemberModal() {
  state.modalMode = "create";
  state.editingMemberId = null;
  refs.memberNameInput.value = "";
  refs.memberEmailInput.value = "";
  refs.memberDepartmentSelect.selectedIndex = 0;
  refs.memberTitleInput.value = "";
  setSelectedRole("member");
}

function setSelectedRole(role) {
  refs.memberRoleOptions.forEach((option) => {
    option.classList.toggle("selected", option.dataset.role === role);
  });
}

function getSelectedRole() {
  return Array.from(refs.memberRoleOptions).find((option) => option.classList.contains("selected"))?.dataset.role || "member";
}

function openMemberModal(mode, member = null) {
  state.modalMode = mode;
  state.editingMemberId = member?.id || null;
  refs.memberNameInput.value = member?.name || "";
  refs.memberEmailInput.value = member?.email || "";
  refs.memberDepartmentSelect.value = member?.department || "";
  refs.memberTitleInput.value = member?.title || "";
  setSelectedRole(member?.role || "member");
  renderMemberModalTexts();
  refs.inviteModal.classList.add("active");
}

function closeMemberModal() {
  refs.inviteModal.classList.remove("active");
  resetMemberModal();
}

function validateMemberForm() {
  const name = refs.memberNameInput.value.trim();
  const email = refs.memberEmailInput.value.trim().toLowerCase();
  if (!name) {
    window.alert(at("validationNameRequired"));
    return null;
  }
  if (!email) {
    window.alert(at("validationEmailRequired"));
    return null;
  }

  const duplicated = state.members.find(
    (member) => member.email.toLowerCase() === email && member.id !== state.editingMemberId
  );
  if (duplicated) {
    window.alert(at("validationEmailDuplicate"));
    return null;
  }

  return {
    name,
    email,
    role: getSelectedRole(),
    department:
      refs.memberDepartmentSelect.selectedIndex <= 0
        ? ""
        : refs.memberDepartmentSelect.value,
    title: refs.memberTitleInput.value.trim(),
  };
}

function handleMemberSubmit() {
  const payload = validateMemberForm();
  if (!payload) {
    return;
  }

  if (state.modalMode === "edit" && state.editingMemberId) {
    updateOrgMember(state.editingMemberId, payload);
  } else {
    createOrgMember(currentUser?.company || "神泉科技", {
      ...payload,
      status: "active",
      lastActiveLabel: "刚刚",
    });
  }

  loadMembers();
  renderAll();
  closeMemberModal();
}

function closeActionMenu() {
  state.actionMenuMemberId = null;
  refs.memberActionMenu.classList.remove("active");
}

function openActionMenu(button, memberId) {
  state.actionMenuMemberId = memberId;
  const rect = button.getBoundingClientRect();
  refs.memberActionMenu.style.top = `${rect.bottom + 6}px`;
  refs.memberActionMenu.style.left = `${Math.max(16, rect.right - 132)}px`;
  refs.memberActionMenu.classList.add("active");
}

function handleEditMember(memberId) {
  const member = getOrgMemberById(memberId);
  if (!member) return;
  closeActionMenu();
  openMemberModal("edit", member);
}

async function handleDeleteMember(memberId) {
  const member = getOrgMemberById(memberId);
  if (!member) return;

  const confirmed = window.confirm(interpolate(at("deleteConfirm"), { name: member.name }));
  if (!confirmed) {
    return;
  }

  await deleteVoiceprintsByMemberId(memberId);
  deleteOrgMember(memberId);
  closeActionMenu();
  loadMembers();
  renderAll();
}

function bindEvents() {
  refs.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.panel;
      refs.tabs.forEach((node) => node.classList.toggle("active", node === tab));
      document.querySelectorAll(".panel").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === name);
      });
    });
  });

  document.addEventListener("click", (event) => {
    const checkbox = event.target.closest(".checkbox");
    if (checkbox) {
      checkbox.classList.toggle("checked");
      return;
    }

    const roleOption = event.target.closest("#inviteModal .role-opt");
    if (roleOption) {
      setSelectedRole(roleOption.dataset.role || "member");
      return;
    }

    const openModalButton = event.target.closest('[data-action="open-member-modal"]');
    if (openModalButton) {
      resetMemberModal();
      openMemberModal("create");
      return;
    }

    const closeModalButton = event.target.closest('[data-action="close-member-modal"]');
    if (closeModalButton) {
      closeMemberModal();
      return;
    }

    const actionButton = event.target.closest('[data-member-action="menu"]');
    if (actionButton) {
      event.stopPropagation();
      const memberId = actionButton.dataset.memberId || "";
      if (state.actionMenuMemberId === memberId && refs.memberActionMenu.classList.contains("active")) {
        closeActionMenu();
      } else {
        openActionMenu(actionButton, memberId);
      }
      return;
    }

    const menuAction = event.target.closest("#memberActionMenu .action-menu-btn");
    if (menuAction) {
      const action = menuAction.dataset.menuAction;
      if (action === "edit") {
        handleEditMember(state.actionMenuMemberId);
      } else if (action === "delete") {
        handleDeleteMember(state.actionMenuMemberId);
      }
      return;
    }

    if (!event.target.closest("#memberActionMenu")) {
      closeActionMenu();
    }
  });

  refs.inviteModal.addEventListener("click", (event) => {
    if (event.target === refs.inviteModal) {
      closeMemberModal();
    }
  });

  refs.memberSearchInput.addEventListener("input", () => {
    state.searchText = refs.memberSearchInput.value;
    state.currentPage = 1;
    renderMemberFiltersAndTable();
  });

  refs.memberDepartmentFilter.addEventListener("change", () => {
    state.department = refs.memberDepartmentFilter.selectedIndex <= 0 ? "all" : refs.memberDepartmentFilter.value;
    state.currentPage = 1;
    renderMemberFiltersAndTable();
  });

  refs.memberFilterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.activeFilter = chip.dataset.memberFilter || "all";
      state.currentPage = 1;
      renderMemberFiltersAndTable();
    });
  });

  refs.membersPrevPage.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderMemberTable();
    }
  });

  refs.membersNextPage.addEventListener("click", () => {
    const { pageCount } = getPagedMembers();
    if (state.currentPage < pageCount) {
      state.currentPage += 1;
      renderMemberTable();
    }
  });

  refs.memberModalSubmit.addEventListener("click", handleMemberSubmit);
}

function initAdminPage() {
  currentUser = initPageAuth({ requireAdminAccess: true });
  if (!currentUser) {
    return;
  }

  bindMeetingEntryButton();
  bindEvents();
  loadMembers();
  renderAll();
  onSystemLanguageChange(() => {
    renderAll();
  });
}

initAdminPage();
