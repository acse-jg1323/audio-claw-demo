import {
  ensureDemoUsers,
  getCurrentUser,
  loginWithPassword,
} from "./auth-store.js";
import { getSystemLanguage, onSystemLanguageChange } from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";

const refs = {
  form: document.getElementById("loginForm"),
  account: document.getElementById("accountInput"),
  password: document.getElementById("passwordInput"),
  submit: document.getElementById("submitBtn"),
  error: document.getElementById("loginError"),
  quickFillButtons: Array.from(document.querySelectorAll("[data-account][data-password]")),
};

function setError(message = "") {
  refs.error.textContent = message;
  refs.error.hidden = !message;
}

function setSubmitting(isSubmitting) {
  refs.submit.disabled = isSubmitting;
  refs.submit.textContent = isSubmitting ? t("login_submit_loading") : t("login_submit_idle");
}

function applyStaticTranslations() {
  const language = getSystemLanguage();
  document.title = t("page_login_title", {}, language);

  document.querySelector(".card-head h2").textContent =
    language === "ja" ? "AudioClaw にログイン" : language === "en" ? "Sign in to AudioClaw" : "登录 AudioClaw";
  document.querySelector(".card-head p").textContent =
    language === "ja"
      ? "Demo アカウントを選んで入力するか、アカウントとパスワードを直接入力してログインしてください。"
      : language === "en"
        ? "Choose a demo account to autofill, or sign in directly with your account and password."
        : "请选择一个 Demo 账号快速填充，或直接输入账号与密码登录系统。";

  const heroKicker = document.querySelector(".hero-kicker");
  if (heroKicker) {
    heroKicker.textContent =
      language === "ja" ? "インテリジェント会議システム MVP" : language === "en" ? "Intelligent Meeting MVP" : "智能会议系统 MVP";
  }

  const heroTitle = document.querySelector(".hero h1");
  if (heroTitle) {
    heroTitle.textContent =
      language === "ja"
        ? "ログインして会議ワークフローと高精細 UI 全体に入ります"
        : language === "en"
          ? "Sign in to access the full meeting workflow and high-fidelity interface"
          : "登录后进入完整的会议工作流与高保真界面";
  }

  const heroBody = document.querySelector(".hero p");
  if (heroBody) {
    heroBody.textContent =
      language === "ja"
        ? "現段階では Demo レベルのアカウント認証を使用し、ログイン、ホーム、会議ワークスペース、資産ライブラリ、設定、管理画面までをつなぐ最小実用フローを実現しています。"
        : language === "en"
          ? "The current stage uses demo-level account verification to connect login, home, meeting workspace, asset libraries, settings, and admin pages into one minimum viable workflow."
          : "当前阶段采用 Demo 级账号校验，用于打通“账号进入系统、主页、会议工作区、资产库、设置与后台页面”的最小可用闭环。";
  }

  const featureCards = Array.from(document.querySelectorAll(".feature-card"));
  const featureTexts = {
    zh: [
      ["实时会议工作区", "进入会议页后继续使用现有的流式转写、翻译和会议总结能力。"],
      ["主页与历史会议", "登录后进入主页，后续可在同一套高保真界面中接入会议归档与回看。"],
      ["资产库与设置", "术语热词库、声纹库与个人设置统一接入同一登录态。"],
      ["最小权限", "普通成员和管理员使用不同账号进入，管理员独占组织后台入口。"],
    ],
    ja: [
      ["リアルタイム会議ワークスペース", "会議ページでは既存のストリーミング文字起こし、翻訳、会議サマリー機能をそのまま利用できます。"],
      ["ホームと履歴会議", "ログイン後はホームに入り、同じ高精細 UI 上で会議のアーカイブや再生を確認できます。"],
      ["資産ライブラリと設定", "用語集、声紋ライブラリ、個人設定が同じログイン状態に統合されています。"],
      ["最小権限", "メンバーと管理者は異なるアカウントで入り、管理者のみ組織管理画面にアクセスできます。"],
    ],
    en: [
      ["Live Meeting Workspace", "Use the existing streaming transcript, translation, and meeting summary capabilities after entering the meeting page."],
      ["Home And History", "After signing in, users land on Home and can later access archives and replay in the same UI."],
      ["Assets And Settings", "The terminology library, voiceprint library, and personal settings share the same sign-in state."],
      ["Minimum Permissions", "Members and admins use different accounts, and only admins can access the organization console."],
    ],
  };
  featureCards.forEach((card, index) => {
    const [title, bodyText] = featureTexts[language]?.[index] || featureTexts.zh[index];
    const strong = card.querySelector("strong");
    const span = card.querySelector("span");
    if (strong) strong.textContent = title;
    if (span) span.textContent = bodyText;
  });

  const statTexts = {
    zh: ["预设 Demo 账号", "已接入高保真页面", "统一前端登录态"],
    ja: ["Demo アカウント", "接続済み高精細ページ", "統一フロントエンドログイン状態"],
    en: ["Demo Accounts", "Connected Pages", "Unified Frontend Auth"],
  };
  document.querySelectorAll(".hero-stat span").forEach((node, index) => {
    node.textContent = statTexts[language]?.[index] || statTexts.zh[index];
  });

  const demoButtons = Array.from(document.querySelectorAll(".demo-btn"));
  const demoTexts = {
    zh: [
      ["管理员账号", "管理员"],
      ["普通成员账号", "普通成员"],
    ],
    ja: [
      ["管理者アカウント", "管理者"],
      ["メンバーアカウント", "メンバー"],
    ],
    en: [
      ["Admin Account", "Admin"],
      ["Member Account", "Member"],
    ],
  };
  demoButtons.forEach((button, index) => {
    const [title, role] = demoTexts[language]?.[index] || demoTexts.zh[index];
    const strong = button.querySelector("strong");
    const roleNode = button.querySelector(".demo-role");
    if (strong) strong.textContent = title;
    if (roleNode) roleNode.textContent = role;
  });

  const divider = document.querySelector(".divider");
  if (divider) {
    divider.textContent =
      language === "ja" ? "またはアカウントとパスワードでログイン" : language === "en" ? "Or sign in with account and password" : "或使用账号密码登录";
  }

  const labels = document.querySelectorAll(".field label");
  if (labels[0]) labels[0].textContent = language === "ja" ? "アカウント" : language === "en" ? "Account" : "账号";
  if (labels[1]) labels[1].textContent = language === "ja" ? "パスワード" : language === "en" ? "Password" : "密码";

  refs.account.placeholder =
    language === "ja"
      ? "アカウントを入力してください。例：admin@demo.com"
      : language === "en"
        ? "Enter your account, for example admin@demo.com"
        : "请输入账号，例如 admin@demo.com";
  refs.password.placeholder =
    language === "ja" ? "パスワードを入力してください" : language === "en" ? "Enter your password" : "请输入密码";

  const tips = document.querySelector(".tips");
  if (tips) {
    tips.innerHTML =
      language === "ja"
        ? "<strong>現在の説明：</strong>これは MVP デモ向けのフロントエンドログイン版です。現在はアカウント認証、ログイン状態保存、ページ接続のみを扱い、実際のバックエンドアカウント管理は含みません。"
        : language === "en"
          ? "<strong>Current note:</strong> This is the frontend login flow for the MVP demo. It currently covers credential checking, auth state persistence, and page entry only, without real backend account management."
          : "<strong>当前说明：</strong>这是用于 MVP 演示的前端登录版本。当前仅做账号密码校验、登录态保存与页面接入，不涉及真实后端账户管理。";
  }

  setSubmitting(Boolean(refs.submit.disabled));
}

function fillAccount(account, password) {
  refs.account.value = account;
  refs.password.value = password;
  setError("");
  refs.password.focus();
}

function handleQuickFill() {
  refs.quickFillButtons.forEach((button) => {
    button.addEventListener("click", () => {
      fillAccount(button.dataset.account || "", button.dataset.password || "");
    });
  });
}

function handleSubmit(event) {
  event.preventDefault();
  setSubmitting(true);
  setError("");

  const result = loginWithPassword(refs.account.value, refs.password.value);
  if (!result.ok) {
    setSubmitting(false);
    setError(result.message);
    return;
  }

  window.location.replace("home.html");
}

function init() {
  ensureDemoUsers();
  applyStaticTranslations();

  if (getCurrentUser()) {
    window.location.replace("home.html");
    return;
  }

  handleQuickFill();
  refs.form.addEventListener("submit", handleSubmit);
  onSystemLanguageChange(() => {
    applyStaticTranslations();
    setError("");
  });
}

init();
