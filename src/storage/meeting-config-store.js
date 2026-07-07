const LEGACY_STORAGE_KEY = "audio-claw-meeting-config";
const STORAGE_KEY_PREFIX = "audio-claw-meeting-config:";

function readJson(storageKey, fallback) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey, value) {
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function normalizeConfigPayload(userId, payload = {}) {
  return {
    userId,
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey : "",
    translatorModel: payload.translatorModel || "senseaudio-s2-lite",
    mainLanguage: payload.mainLanguage || "zh",
    meetingTargetLanguage: payload.meetingTargetLanguage || "en",
    silenceDuration: payload.silenceDuration || "500",
    minSpeechDuration: payload.minSpeechDuration || "300",
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

function sanitizeLegacyConfig(legacyConfig = {}) {
  return {
    translatorModel: legacyConfig.translatorModel || "senseaudio-s2-lite",
    mainLanguage: legacyConfig.mainLanguage || "zh",
    meetingTargetLanguage: legacyConfig.meetingTargetLanguage || "en",
    silenceDuration: legacyConfig.silenceDuration || "500",
    minSpeechDuration: legacyConfig.minSpeechDuration || "300",
  };
}

export function getMeetingConfigStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export function getMeetingConfigForUser(userId) {
  if (!userId) {
    return null;
  }

  const scopedStorageKey = getMeetingConfigStorageKey(userId);
  const scopedConfig = readJson(scopedStorageKey, null);
  if (scopedConfig?.userId === userId) {
    return normalizeConfigPayload(userId, scopedConfig);
  }

  const legacyConfig = readJson(LEGACY_STORAGE_KEY, null);
  if (!legacyConfig) {
    return null;
  }

  // Legacy global config may belong to another account. To avoid leaking an
  // existing API key across users, only migrate non-sensitive meeting prefs.
  const migratedConfig = normalizeConfigPayload(userId, sanitizeLegacyConfig(legacyConfig));
  writeJson(scopedStorageKey, migratedConfig);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return migratedConfig;
}

export function saveMeetingConfigForUser(userId, payload = {}) {
  if (!userId) {
    return null;
  }

  const nextConfig = normalizeConfigPayload(userId, payload);
  writeJson(getMeetingConfigStorageKey(userId), nextConfig);
  return nextConfig;
}

export function clearMeetingConfigForUser(userId) {
  if (userId) {
    localStorage.removeItem(getMeetingConfigStorageKey(userId));
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}
