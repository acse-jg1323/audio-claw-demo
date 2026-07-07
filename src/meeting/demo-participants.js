export const DEMO_MEETING_PARTICIPANTS = [
  { key: "spk-1", name: "李明", role: "销售总监", avatar: "李", color: "var(--speaker-1)" },
  { key: "spk-2", name: "田中健太", role: "CTO", avatar: "田", color: "var(--speaker-2)" },
  { key: "spk-3", name: "王芳", role: "产品经理", avatar: "王", color: "var(--speaker-3)" },
  { key: "spk-4", name: "佐藤美咲", role: "产品总监", avatar: "佐", color: "var(--speaker-4)" },
  { key: "spk-5", name: "王敏", role: "技术专家", avatar: "王", color: "var(--speaker-5)" },
];

const ROLE_LABELS = {
  sales_director: { zh: "销售总监", ja: "営業ディレクター", en: "Sales Director" },
  cto: { zh: "CTO", ja: "CTO", en: "CTO" },
  product_manager: { zh: "产品经理", ja: "プロダクトマネージャー", en: "Product Manager" },
  product_director: { zh: "产品总监", ja: "プロダクトディレクター", en: "Product Director" },
  technical_specialist: { zh: "技术专家", ja: "技術スペシャリスト", en: "Technical Specialist" },
  vp_engineering: { zh: "研发副总", ja: "研究開発担当副社長", en: "VP Of Engineering" },
  legal_counsel: { zh: "法务顾问", ja: "法務顧問", en: "Legal Counsel" },
};

const ROLE_ALIASES = Object.entries(ROLE_LABELS).reduce((result, [roleKey, labels]) => {
  Object.values(labels).forEach((label) => {
    result[String(label || "").trim().toLowerCase()] = roleKey;
  });
  return result;
}, {});

export function getDemoParticipantByName(name) {
  return DEMO_MEETING_PARTICIPANTS.find((participant) => participant.name === name) || null;
}

export function getLocalizedParticipantRole(role, language = "zh") {
  const normalizedRole = String(role || "").trim();
  if (!normalizedRole) {
    return "";
  }

  const roleKey = ROLE_ALIASES[normalizedRole.toLowerCase()];
  if (!roleKey) {
    return normalizedRole;
  }

  return ROLE_LABELS[roleKey]?.[language] || ROLE_LABELS[roleKey]?.zh || normalizedRole;
}
