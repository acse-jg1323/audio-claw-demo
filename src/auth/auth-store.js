import { getSystemLanguage } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";
import { clearMeetingConfigForUser } from "../storage/meeting-config-store.js";

const STORAGE_KEYS = {
  demoUsers: "ac_demo_users",
  currentUser: "ac_current_user",
};

const DEMO_USERS = [
  {
    id: "u_admin_001",
    role: "admin",
    name: "李明",
    company: "神泉科技",
    account: "admin@demo.com",
    password: "admin123",
    avatar: "李",
  },
  {
    id: "u_member_001",
    role: "member",
    name: "王敏",
    company: "神泉科技",
    account: "member@demo.com",
    password: "member123",
    avatar: "王",
  },
];

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

function sanitizeUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    company: user.company,
    account: user.account,
    avatar: user.avatar,
  };
}

export function ensureDemoUsers() {
  const existing = readJson(STORAGE_KEYS.demoUsers, null);
  if (Array.isArray(existing) && existing.length) {
    return existing;
  }

  writeJson(STORAGE_KEYS.demoUsers, DEMO_USERS);
  return DEMO_USERS;
}

export function getDemoUsers() {
  return ensureDemoUsers();
}

export function getCurrentUser() {
  return readJson(STORAGE_KEYS.currentUser, null);
}

export function setCurrentUser(user) {
  writeJson(STORAGE_KEYS.currentUser, {
    ...sanitizeUser(user),
    loginAt: new Date().toISOString(),
  });
}

export function clearCurrentUser() {
  const currentUser = getCurrentUser();
  clearMeetingConfigForUser(currentUser?.id || "");
  localStorage.removeItem(STORAGE_KEYS.currentUser);
}

export function logout() {
  clearCurrentUser();
  window.location.replace("login.html");
}

export function loginWithPassword(account, password) {
  const normalizedAccount = account.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const language = getSystemLanguage();

  if (!normalizedAccount) {
    return { ok: false, code: "account_required", message: t("auth_account_required", {}, language) };
  }

  if (!normalizedPassword) {
    return { ok: false, code: "password_required", message: t("auth_password_required", {}, language) };
  }

  const user = ensureDemoUsers().find(
    (item) => item.account.toLowerCase() === normalizedAccount
  );

  if (!user) {
    return { ok: false, code: "account_not_found", message: t("auth_account_not_found", {}, language) };
  }

  if (user.password !== normalizedPassword) {
    return {
      ok: false,
      code: "password_incorrect",
      message: t("auth_password_incorrect", {}, language),
    };
  }

  setCurrentUser(user);
  return { ok: true, user: sanitizeUser(user) };
}

export function getRoleLabel(role, language = getSystemLanguage()) {
  return role === "admin" ? t("role_admin", {}, language) : t("role_member", {}, language);
}

export function requireAuth() {
  ensureDemoUsers();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    window.location.replace("login.html");
    return null;
  }
  return currentUser;
}

export function requireAdmin() {
  const currentUser = requireAuth();
  if (!currentUser) {
    return null;
  }

  if (currentUser.role !== "admin") {
    window.location.replace("home.html");
    return null;
  }

  return currentUser;
}
