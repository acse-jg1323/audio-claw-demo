import { getRoleLabel, logout, requireAdmin, requireAuth } from "./auth-store.js";
import { getSystemLanguage, onSystemLanguageChange } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";

function getGreetingText() {
  const hour = new Date().getHours();
  const language = getSystemLanguage();
  if (hour < 6) return t("greeting_late_night", {}, language);
  if (hour < 12) return t("greeting_morning", {}, language);
  if (hour < 18) return t("greeting_afternoon", {}, language);
  return t("greeting_evening", {}, language);
}

function updateTextContent(selector, text) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = text;
  });
}

function updateUserIdentity(user) {
  const language = getSystemLanguage();
  const roleLabel = getRoleLabel(user.role, language);
  const avatarText = user.avatar || user.name?.slice(0, 1) || "用";

  document.querySelectorAll(".user-avatar").forEach((node) => {
    node.textContent = avatarText;
  });

  document.querySelectorAll(".avatar").forEach((node) => {
    node.textContent = avatarText;
    node.title = user.name;
  });

  updateTextContent(".user-name", user.name);
  updateTextContent(".user-plan", `${roleLabel} · ${user.company}`);

  const welcomeTitle = document.querySelector(".welcome h1");
  if (welcomeTitle) {
    welcomeTitle.textContent = `${getGreetingText()}，${user.name} 👋`;
  }
}

function hideAdminNavigationForMember(user) {
  if (user.role === "admin") {
    return;
  }

  const adminBadge = document.querySelector(".admin-badge");
  const adminItem = adminBadge?.closest(".nav-item");
  const adminSection = adminBadge?.closest(".nav-section");

  if (adminItem) {
    adminItem.style.display = "none";
  }

  if (adminSection) {
    adminSection.style.display = "none";
  }
}

function bindLogoutAction() {
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (!logoutButton || logoutButton.dataset.bound === "true") {
    return;
  }

  logoutButton.dataset.bound = "true";
  logoutButton.addEventListener("click", () => {
    const confirmed = window.confirm(t("logout_confirm"));
    if (!confirmed) {
      return;
    }

    logout();
  });
}

export function initPageAuth(options = {}) {
  const { requireAdminAccess = false } = options;
  const currentUser = requireAdminAccess ? requireAdmin() : requireAuth();

  if (!currentUser) {
    return null;
  }

  updateUserIdentity(currentUser);
  hideAdminNavigationForMember(currentUser);
  bindLogoutAction();
  onSystemLanguageChange(() => {
    updateUserIdentity(currentUser);
  });
  return currentUser;
}
