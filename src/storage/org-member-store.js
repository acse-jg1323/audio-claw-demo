const STORAGE_KEY = "ac_org_members_v1";
const DEFAULT_COMPANY = "神泉科技";
const MEMBER_AVATAR_COLORS = [
  "var(--speaker-1)",
  "var(--speaker-2)",
  "var(--speaker-3)",
  "var(--speaker-4)",
  "var(--speaker-5)",
  "var(--speaker-6)",
  "var(--speaker-7)",
  "var(--speaker-8)",
];

const SEEDED_MEMBERS = [
  {
    id: "mem_sc_001",
    name: "张建国",
    email: "zhangjg@shenchuan.com",
    role: "owner",
    department: "管理层",
    title: "",
    status: "active",
    lastActiveLabel: "刚刚",
    isWeeklyActive: true,
    joinedAt: "2025-03-01",
    avatarColor: "var(--speaker-8)",
  },
  {
    id: "mem_sc_002",
    name: "李明",
    email: "liming@shenchuan.com",
    role: "admin",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "刚刚",
    isWeeklyActive: true,
    joinedAt: "2025-03-15",
    avatarColor: "var(--speaker-1)",
  },
  {
    id: "mem_sc_003",
    name: "陈志远",
    email: "chenzy@shenchuan.com",
    role: "admin",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "1 小时前",
    isWeeklyActive: true,
    joinedAt: "2025-03-15",
    avatarColor: "var(--speaker-5)",
  },
  {
    id: "mem_sc_004",
    name: "王芳",
    email: "wangfang@shenchuan.com",
    role: "admin",
    department: "产品",
    title: "",
    status: "active",
    lastActiveLabel: "30 分钟前",
    isWeeklyActive: true,
    joinedAt: "2025-04-02",
    avatarColor: "var(--speaker-3)",
  },
  {
    id: "mem_sc_005",
    name: "林雨晴",
    email: "linyq@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "active",
    lastActiveLabel: "2 小时前",
    isWeeklyActive: true,
    joinedAt: "2025-04-10",
    avatarColor: "var(--speaker-7)",
  },
  {
    id: "mem_sc_006",
    name: "高律师",
    email: "gao.lawyer@shenchuan.com",
    role: "member",
    department: "法务",
    title: "",
    status: "active",
    lastActiveLabel: "今天 09:24",
    isWeeklyActive: true,
    joinedAt: "2025-04-20",
    avatarColor: "var(--speaker-6)",
  },
  {
    id: "mem_sc_007",
    name: "刘建华",
    email: "liujh@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "昨天",
    isWeeklyActive: true,
    joinedAt: "2025-05-01",
    avatarColor: "var(--speaker-2)",
  },
  {
    id: "mem_sc_008",
    name: "周敏",
    email: "zhoumin@shenchuan.com",
    role: "member",
    department: "客户成功",
    title: "",
    status: "active",
    lastActiveLabel: "今天 11:08",
    isWeeklyActive: true,
    joinedAt: "2025-05-12",
    avatarColor: "var(--speaker-4)",
  },
  {
    id: "mem_sc_009",
    name: "黄强",
    email: "huangq@shenchuan.com",
    role: "member",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "今天 10:32",
    isWeeklyActive: true,
    joinedAt: "2025-05-18",
    avatarColor: "var(--speaker-1)",
  },
  {
    id: "mem_sc_010",
    name: "孙磊",
    email: "sunlei@shenchuan.com",
    role: "member",
    department: "HR",
    title: "",
    status: "active",
    lastActiveLabel: "昨天",
    isWeeklyActive: true,
    joinedAt: "2025-05-20",
    avatarColor: "var(--speaker-5)",
  },
  {
    id: "mem_sc_011",
    name: "吴丽",
    email: "wuli@shenchuan.com",
    role: "member",
    department: "财务",
    title: "",
    status: "active",
    lastActiveLabel: "3 天前",
    isWeeklyActive: true,
    joinedAt: "2025-05-22",
    avatarColor: "var(--speaker-8)",
  },
  {
    id: "mem_sc_012",
    name: "赵晓",
    email: "zhaox@shenchuan.com",
    role: "member",
    department: "产品",
    title: "",
    status: "active",
    lastActiveLabel: "今天 14:02",
    isWeeklyActive: true,
    joinedAt: "2025-05-23",
    avatarColor: "var(--speaker-7)",
  },
  {
    id: "mem_sc_013",
    name: "钱诚",
    email: "qiancheng@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "pending",
    lastActiveLabel: "—",
    isWeeklyActive: false,
    joinedAt: "2025-05-24",
    avatarColor: "var(--text-tertiary)",
  },
  {
    id: "mem_sc_014",
    name: "何美玲",
    email: "hemeil@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "pending",
    lastActiveLabel: "—",
    isWeeklyActive: false,
    joinedAt: "2025-05-25",
    avatarColor: "var(--text-tertiary)",
  },
  {
    id: "mem_sc_015",
    name: "许倩",
    email: "xuqian@shenchuan.com",
    role: "member",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "今天 15:10",
    isWeeklyActive: true,
    joinedAt: "2025-05-27",
    avatarColor: "var(--speaker-3)",
  },
  {
    id: "mem_sc_016",
    name: "郑伟",
    email: "zhengwei@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "今天 16:20",
    isWeeklyActive: true,
    joinedAt: "2025-05-28",
    avatarColor: "var(--speaker-6)",
  },
  {
    id: "mem_sc_017",
    name: "冯静",
    email: "fengjing@shenchuan.com",
    role: "member",
    department: "产品",
    title: "",
    status: "active",
    lastActiveLabel: "1 天前",
    isWeeklyActive: true,
    joinedAt: "2025-05-29",
    avatarColor: "var(--speaker-4)",
  },
  {
    id: "mem_sc_018",
    name: "褚航",
    email: "chuhang@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "active",
    lastActiveLabel: "4 天前",
    isWeeklyActive: true,
    joinedAt: "2025-05-30",
    avatarColor: "var(--speaker-2)",
  },
  {
    id: "mem_sc_019",
    name: "卫宁",
    email: "weining@shenchuan.com",
    role: "member",
    department: "法务",
    title: "",
    status: "active",
    lastActiveLabel: "今天 13:18",
    isWeeklyActive: true,
    joinedAt: "2025-06-01",
    avatarColor: "var(--speaker-5)",
  },
  {
    id: "mem_sc_020",
    name: "蒋欣",
    email: "jiangxin@shenchuan.com",
    role: "member",
    department: "财务",
    title: "",
    status: "active",
    lastActiveLabel: "2 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-02",
    avatarColor: "var(--speaker-7)",
  },
  {
    id: "mem_sc_021",
    name: "沈涛",
    email: "shentao@shenchuan.com",
    role: "member",
    department: "客户成功",
    title: "",
    status: "active",
    lastActiveLabel: "今天 09:46",
    isWeeklyActive: true,
    joinedAt: "2025-06-03",
    avatarColor: "var(--speaker-8)",
  },
  {
    id: "mem_sc_022",
    name: "韩露",
    email: "hanlu@shenchuan.com",
    role: "member",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "昨天",
    isWeeklyActive: true,
    joinedAt: "2025-06-04",
    avatarColor: "var(--speaker-1)",
  },
  {
    id: "mem_sc_023",
    name: "杨帆",
    email: "yangfan@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "今天 08:32",
    isWeeklyActive: true,
    joinedAt: "2025-06-05",
    avatarColor: "var(--speaker-3)",
  },
  {
    id: "mem_sc_024",
    name: "朱琳",
    email: "zhulin@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "active",
    lastActiveLabel: "5 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-06",
    avatarColor: "var(--speaker-6)",
  },
  {
    id: "mem_sc_025",
    name: "秦浩",
    email: "qinhao@shenchuan.com",
    role: "member",
    department: "HR",
    title: "",
    status: "active",
    lastActiveLabel: "今天 12:24",
    isWeeklyActive: true,
    joinedAt: "2025-06-07",
    avatarColor: "var(--speaker-4)",
  },
  {
    id: "mem_sc_026",
    name: "尤娜",
    email: "youna@shenchuan.com",
    role: "member",
    department: "产品",
    title: "",
    status: "active",
    lastActiveLabel: "1 小时前",
    isWeeklyActive: true,
    joinedAt: "2025-06-08",
    avatarColor: "var(--speaker-2)",
  },
  {
    id: "mem_sc_027",
    name: "曹悦",
    email: "caoyue@shenchuan.com",
    role: "member",
    department: "客户成功",
    title: "",
    status: "active",
    lastActiveLabel: "今天 11:15",
    isWeeklyActive: true,
    joinedAt: "2025-06-09",
    avatarColor: "var(--speaker-5)",
  },
  {
    id: "mem_sc_028",
    name: "严博",
    email: "yanbo@shenchuan.com",
    role: "member",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "3 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-10",
    avatarColor: "var(--speaker-7)",
  },
  {
    id: "mem_sc_029",
    name: "华清",
    email: "huaqing@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "4 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-11",
    avatarColor: "var(--speaker-8)",
  },
  {
    id: "mem_sc_030",
    name: "谢然",
    email: "xieran@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "active",
    lastActiveLabel: "今天 17:05",
    isWeeklyActive: true,
    joinedAt: "2025-06-12",
    avatarColor: "var(--speaker-1)",
  },
  {
    id: "mem_sc_031",
    name: "邹宁",
    email: "zouning@shenchuan.com",
    role: "member",
    department: "财务",
    title: "",
    status: "active",
    lastActiveLabel: "2 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-13",
    avatarColor: "var(--speaker-3)",
  },
  {
    id: "mem_sc_032",
    name: "苏桐",
    email: "sutong@shenchuan.com",
    role: "member",
    department: "法务",
    title: "",
    status: "active",
    lastActiveLabel: "今天 09:02",
    isWeeklyActive: true,
    joinedAt: "2025-06-14",
    avatarColor: "var(--speaker-6)",
  },
  {
    id: "mem_sc_033",
    name: "贺宁",
    email: "hening@shenchuan.com",
    role: "member",
    department: "产品",
    title: "",
    status: "active",
    lastActiveLabel: "2 周前",
    isWeeklyActive: false,
    joinedAt: "2025-06-15",
    avatarColor: "var(--speaker-4)",
  },
  {
    id: "mem_sc_034",
    name: "熊川",
    email: "xiongchuan@shenchuan.com",
    role: "member",
    department: "销售",
    title: "",
    status: "active",
    lastActiveLabel: "2 周前",
    isWeeklyActive: false,
    joinedAt: "2025-06-16",
    avatarColor: "var(--speaker-2)",
  },
  {
    id: "mem_sc_035",
    name: "白雪",
    email: "baixue@shenchuan.com",
    role: "member",
    department: "研发",
    title: "",
    status: "active",
    lastActiveLabel: "3 周前",
    isWeeklyActive: false,
    joinedAt: "2025-06-17",
    avatarColor: "var(--speaker-5)",
  },
  {
    id: "mem_sc_036",
    name: "黎安",
    email: "lian@shenchuan.com",
    role: "member",
    department: "市场",
    title: "",
    status: "active",
    lastActiveLabel: "2 周前",
    isWeeklyActive: false,
    joinedAt: "2025-06-18",
    avatarColor: "var(--speaker-7)",
  },
  {
    id: "mem_sc_037",
    name: "方源",
    email: "fangyuan@shenchuan.com",
    role: "member",
    department: "客户成功",
    title: "",
    status: "active",
    lastActiveLabel: "6 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-19",
    avatarColor: "var(--speaker-8)",
  },
  {
    id: "mem_sc_038",
    name: "段琪",
    email: "duanqi@shenchuan.com",
    role: "member",
    department: "HR",
    title: "",
    status: "active",
    lastActiveLabel: "5 天前",
    isWeeklyActive: true,
    joinedAt: "2025-06-20",
    avatarColor: "var(--speaker-1)",
  },
];

function readMembers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalizedMembers = parsed.map(normalizeMember);
    const { members: repairedMembers, changed } = repairMemberIds(normalizedMembers);
    if (changed) {
      writeMembers(repairedMembers);
    }
    return repairedMembers;
  } catch {
    return [];
  }
}

function writeMembers(members) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

function getAvatarText(name) {
  const normalized = String(name || "").trim();
  return normalized.slice(0, 1) || "未";
}

function normalizeMember(member) {
  const now = new Date().toISOString();
  const name = String(member?.name || "").trim();
  const email = String(member?.email || "").trim();

  return {
    id: String(member?.id || ""),
    companyKey: String(member?.companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY,
    name,
    email,
    role: member?.role === "owner" || member?.role === "admin" ? member.role : "member",
    department: String(member?.department || "").trim(),
    title: String(member?.title || "").trim(),
    status:
      member?.status === "pending" || member?.status === "disabled" ? member.status : "active",
    lastActiveLabel: String(member?.lastActiveLabel || (member?.status === "pending" ? "—" : "刚刚")).trim(),
    isWeeklyActive: Boolean(member?.isWeeklyActive),
    joinedAt: String(member?.joinedAt || now.slice(0, 10)).trim(),
    avatarText: String(member?.avatarText || getAvatarText(name)).trim() || "未",
    avatarColor: String(member?.avatarColor || "var(--text-tertiary)").trim() || "var(--text-tertiary)",
    isSeeded: Boolean(member?.isSeeded),
    createdAt: String(member?.createdAt || now),
    updatedAt: String(member?.updatedAt || now),
  };
}

function seedMembersForCompany(companyKey) {
  return SEEDED_MEMBERS.map((member) =>
    normalizeMember({
      ...member,
      companyKey: companyKey || DEFAULT_COMPANY,
      isSeeded: true,
    })
  );
}

function buildCompanySlug(companyKey) {
  return String(companyKey || DEFAULT_COMPANY)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "") || "org";
}

function parseMemberId(value) {
  const matched = String(value || "").match(/^(.*_)(\d+)$/);
  if (!matched) {
    return null;
  }
  return {
    prefix: matched[1],
    sequence: Number(matched[2]) || 0,
    width: matched[2].length,
  };
}

function getMemberIdPrefix(companyKey, existingMembers = []) {
  const normalizedCompany = String(companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  const prefixCounts = new Map();
  existingMembers
    .filter((member) => member.companyKey === normalizedCompany)
    .forEach((member) => {
      const parsed = parseMemberId(member.id);
      if (!parsed?.prefix) {
        return;
      }
      prefixCounts.set(parsed.prefix, (prefixCounts.get(parsed.prefix) || 0) + 1);
    });

  const sortedPrefixes = Array.from(prefixCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return a[0].localeCompare(b[0]);
  });
  if (sortedPrefixes[0]?.[0]) {
    return sortedPrefixes[0][0];
  }
  return `mem_${buildCompanySlug(normalizedCompany)}_`;
}

function generateUniqueMemberId(companyKey, existingMembers = [], takenIds = new Set()) {
  const normalizedCompany = String(companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  const prefix = getMemberIdPrefix(normalizedCompany, existingMembers);
  const parsedIds = existingMembers
    .filter((member) => member.companyKey === normalizedCompany)
    .map((member) => parseMemberId(member.id))
    .filter((parsed) => parsed?.prefix === prefix);
  const width = Math.max(3, ...parsedIds.map((parsed) => parsed.width || 0));
  let sequence = parsedIds.reduce((max, parsed) => Math.max(max, parsed.sequence || 0), 0) + 1;
  let candidate = `${prefix}${String(sequence).padStart(width, "0")}`;
  while (takenIds.has(candidate)) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(width, "0")}`;
  }
  return candidate;
}

function ensureSeededMembers(companyKey) {
  const normalizedCompany = String(companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  const members = readMembers();
  const hasCompanyMembers = members.some((member) => member.companyKey === normalizedCompany);
  if (hasCompanyMembers) {
    return members;
  }

  const seededMembers = [...members, ...seedMembersForCompany(normalizedCompany)];
  writeMembers(seededMembers);
  return seededMembers;
}

function repairMemberIds(members) {
  const normalizedMembers = Array.isArray(members) ? members.map(normalizeMember) : [];
  const takenIds = new Set(normalizedMembers.map((member) => member.id).filter(Boolean));
  const repairedMembers = [];
  const usedIds = new Set();
  let changed = false;

  normalizedMembers.forEach((member) => {
    const trimmedId = String(member.id || "").trim();
    let nextId = trimmedId;
    if (!trimmedId || usedIds.has(trimmedId)) {
      nextId = generateUniqueMemberId(member.companyKey, repairedMembers.concat(normalizedMembers), takenIds);
      takenIds.add(nextId);
      changed = true;
    }
    usedIds.add(nextId);
    repairedMembers.push(
      nextId === member.id
        ? member
        : normalizeMember({
            ...member,
            id: nextId,
          })
    );
  });

  return {
    members: repairedMembers,
    changed,
  };
}

function generateMemberId(companyKey, existingMembers) {
  const normalizedMembers = Array.isArray(existingMembers) ? existingMembers.map(normalizeMember) : [];
  const takenIds = new Set(normalizedMembers.map((member) => member.id).filter(Boolean));
  return generateUniqueMemberId(companyKey, normalizedMembers, takenIds);
}

function getNextAvatarColor(companyKey, existingMembers) {
  const companyMembers = existingMembers.filter((member) => member.companyKey === companyKey);
  const colorCounts = new Map(MEMBER_AVATAR_COLORS.map((color) => [color, 0]));

  companyMembers.forEach((member) => {
    if (colorCounts.has(member.avatarColor)) {
      colorCounts.set(member.avatarColor, (colorCounts.get(member.avatarColor) || 0) + 1);
    }
  });

  return MEMBER_AVATAR_COLORS.reduce((bestColor, currentColor) => {
    if (!bestColor) {
      return currentColor;
    }
    const bestCount = colorCounts.get(bestColor) || 0;
    const currentCount = colorCounts.get(currentColor) || 0;
    return currentCount < bestCount ? currentColor : bestColor;
  }, MEMBER_AVATAR_COLORS[0]);
}

function updateMemberById(memberId, updater) {
  const members = readMembers();
  const index = members.findIndex((member) => member.id === memberId);
  if (index === -1) {
    throw new Error(`未找到成员：${memberId}`);
  }

  const current = normalizeMember(members[index]);
  const next = normalizeMember(updater(current));
  members[index] = next;
  writeMembers(members);
  return next;
}

export function getOrgMembersByCompany(companyKey) {
  const normalizedCompany = String(companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  return ensureSeededMembers(normalizedCompany)
    .filter((member) => member.companyKey === normalizedCompany)
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
}

export function getOrgMemberById(memberId) {
  return readMembers().find((member) => member.id === memberId) || null;
}

export function createOrgMember(companyKey, payload = {}) {
  const normalizedCompany = String(companyKey || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
  const members = ensureSeededMembers(normalizedCompany);
  const now = new Date().toISOString();
  const avatarColor = String(payload.avatarColor || "").trim() || getNextAvatarColor(normalizedCompany, members);
  const nextMember = normalizeMember({
    ...payload,
    id: payload.id || generateMemberId(normalizedCompany, members),
    companyKey: normalizedCompany,
    status: payload.status || "active",
    lastActiveLabel: payload.lastActiveLabel || "刚刚",
    avatarColor,
    isWeeklyActive: false,
    createdAt: now,
    updatedAt: now,
  });

  members.push(nextMember);
  writeMembers(members);
  return nextMember;
}

export function updateOrgMember(memberId, payload = {}) {
  return updateMemberById(memberId, (member) => ({
    ...member,
    ...payload,
    id: member.id,
    companyKey: member.companyKey,
    updatedAt: new Date().toISOString(),
  }));
}

export function deleteOrgMember(memberId) {
  const members = readMembers();
  const targetMember = members.find((member) => member.id === memberId);
  if (!targetMember) {
    throw new Error(`未找到成员：${memberId}`);
  }

  writeMembers(members.filter((member) => member.id !== memberId));
  return normalizeMember(targetMember);
}

export function clearOrgMembersForDebug() {
  localStorage.removeItem(STORAGE_KEY);
}
