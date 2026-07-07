export const SYSTEM_LANGUAGE_STORAGE_KEY = "ac_system_language";
export const SUPPORTED_SYSTEM_LANGUAGES = Object.freeze(["zh", "ja", "en"]);

const DOCUMENT_LANGUAGE_MAP = {
  zh: "zh-CN",
  ja: "ja",
  en: "en",
};

const WINDOW_EVENT_NAME = "ac:system-language-change";

export function normalizeSystemLanguage(value, fallback = "zh") {
  const normalized = String(value || "").trim().toLowerCase();
  return SUPPORTED_SYSTEM_LANGUAGES.includes(normalized) ? normalized : fallback;
}

export function getSystemLanguage() {
  try {
    const stored = localStorage.getItem(SYSTEM_LANGUAGE_STORAGE_KEY);
    return normalizeSystemLanguage(stored, "zh");
  } catch {
    return "zh";
  }
}

export function getDocumentLanguageTag(language = getSystemLanguage()) {
  return DOCUMENT_LANGUAGE_MAP[normalizeSystemLanguage(language)] || DOCUMENT_LANGUAGE_MAP.zh;
}

export function applyDocumentLanguage(language = getSystemLanguage()) {
  const nextLanguage = normalizeSystemLanguage(language);
  document.documentElement.lang = getDocumentLanguageTag(nextLanguage);
  return nextLanguage;
}

export function setSystemLanguage(language) {
  const nextLanguage = normalizeSystemLanguage(language);
  const previousLanguage = getSystemLanguage();

  try {
    localStorage.setItem(SYSTEM_LANGUAGE_STORAGE_KEY, nextLanguage);
  } catch {
    // Ignore storage failure in demo mode.
  }

  applyDocumentLanguage(nextLanguage);

  if (previousLanguage !== nextLanguage) {
    window.dispatchEvent(
      new CustomEvent(WINDOW_EVENT_NAME, {
        detail: {
          language: nextLanguage,
          previousLanguage,
        },
      })
    );
  }

  return nextLanguage;
}

export function onSystemLanguageChange(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const customEventHandler = (event) => {
    callback(event?.detail?.language || getSystemLanguage(), event?.detail || {});
  };

  const storageHandler = (event) => {
    if (event?.key !== SYSTEM_LANGUAGE_STORAGE_KEY) {
      return;
    }
    const language = normalizeSystemLanguage(event.newValue, "zh");
    applyDocumentLanguage(language);
    callback(language, {
      language,
      previousLanguage: normalizeSystemLanguage(event.oldValue, "zh"),
      source: "storage",
    });
  };

  window.addEventListener(WINDOW_EVENT_NAME, customEventHandler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(WINDOW_EVENT_NAME, customEventHandler);
    window.removeEventListener("storage", storageHandler);
  };
}

export function createDateFormatter(options = {}, language = getSystemLanguage()) {
  return new Intl.DateTimeFormat(getDocumentLanguageTag(language), options);
}

export function createNumberFormatter(options = {}, language = getSystemLanguage()) {
  return new Intl.NumberFormat(getDocumentLanguageTag(language), options);
}

export function formatDateTime(value, options = {}, language = getSystemLanguage()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return createDateFormatter(options, language).format(date);
}

export function formatDate(value, options = {}, language = getSystemLanguage()) {
  return formatDateTime(
    value,
    {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      ...options,
    },
    language
  );
}

export function formatTime(value, options = {}, language = getSystemLanguage()) {
  return formatDateTime(
    value,
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...options,
    },
    language
  );
}

export function formatNumber(value, options = {}, language = getSystemLanguage()) {
  return createNumberFormatter(options, language).format(Number(value) || 0);
}

applyDocumentLanguage(getSystemLanguage());
