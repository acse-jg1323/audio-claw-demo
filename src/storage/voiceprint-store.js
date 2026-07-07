// 声纹库存储：IndexedDB 持久化每位成员的声纹向量（192 维）
// 声纹仅存本地，不上传，符合 voiceprint.html 的"端到端、不出设备"承诺。
import { getCurrentUser } from "../auth/auth-store.js";
import { getOrgMemberById } from "./org-member-store.js";

const DB_NAME = "ac_voiceprints";
const DB_VERSION = 2;
const STORE = "voiceprints";
const EMBEDDING_DIM = 192;
const ZERO_EMBEDDING = Object.freeze(Array.from({ length: EMBEDDING_DIM }, () => 0));

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "id" });
      if (!store.indexNames.contains("ownerUserId")) {
        store.createIndex("ownerUserId", "ownerUserId", { unique: false });
      }
      if (!store.indexNames.contains("memberId")) {
        store.createIndex("memberId", "memberId", { unique: false });
      }
      if (!store.indexNames.contains("companyKey")) {
        store.createIndex("companyKey", "companyKey", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function generateId() {
  const rand = Math.floor(performance.now() * 1000) % 1000000;
  return `vp_${Date.now()}_${String(rand).padStart(6, "0")}`;
}

const PALETTE = [
  "#2F6BFF", "#16B8A6", "#F5A623", "#E2566D",
  "#7C5CFF", "#3FAE49", "#FF7A45", "#00A3BF",
];

function normalize(record) {
  const embedding =
    Array.isArray(record.embedding) && record.embedding.length === EMBEDDING_DIM
      ? record.embedding.map((value) => Number(value) || 0)
      : ZERO_EMBEDDING.slice();

  return {
    id: record.id,
    ownerUserId: record.ownerUserId || "",
    memberId: record.memberId || null,
    personType: record.personType === "internal" ? "internal" : "external",
    companyKey: record.companyKey || "",
    name: record.name || "",
    role: record.role || "",
    color: record.color || PALETTE[0],
    avatar: record.avatar || (record.name?.trim?.().slice(0, 1) ?? "声"),
    embedding,
    sampleCount: Number.isFinite(record.sampleCount) ? record.sampleCount : 1,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
  };
}

function resolveLinkedMemberFields(record) {
  if (record.personType !== "internal" || !record.memberId) {
    return record;
  }

  const member = getOrgMemberById(record.memberId);
  if (!member) {
    return record;
  }

  return normalize({
    ...record,
    companyKey: member.companyKey || record.companyKey,
    name: member.name || record.name,
    role: member.title || record.role || "",
    avatar: member.avatarText || record.avatar || member.name?.trim?.().slice(0, 1) || "声",
  });
}

function ensureUser(user) {
  if (!user?.id) throw new Error("操作声纹库前必须提供有效用户。");
}

export function pickColor(existingCount) {
  return PALETTE[existingCount % PALETTE.length];
}

export async function getVoiceprintsByUser(userId) {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const out = [];
    const idx = store.index("ownerUserId");
    const req = idx.openCursor(IDBKeyRange.only(userId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out.push(resolveLinkedMemberFields(normalize(cursor.value)));
        cursor.continue();
      } else {
        out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getVoiceprintsForCurrentUser() {
  const user = getCurrentUser();
  ensureUser(user);
  return getVoiceprintsByUser(user.id);
}

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export async function getVoiceprintsForMeetingParticipants(participants = []) {
  const user = getCurrentUser();
  ensureUser(user);

  const library = await getVoiceprintsByUser(user.id);
  if (!Array.isArray(participants) || !participants.length) {
    return library;
  }

  const selectedMemberIds = new Set(
    participants
      .map((participant) => participant?.memberId)
      .filter(Boolean)
  );

  return library.filter((record) => {
    if (record.personType === "internal" && record.memberId) {
      return selectedMemberIds.has(record.memberId);
    }
    if (record.personType === "external") {
      return true;
    }
    return false;
  });
}

export async function getVoiceprintById(id) {
  const store = await tx("readonly");
  const record = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return record ? resolveLinkedMemberFields(normalize(record)) : null;
}

export async function addVoiceprintForCurrentUser({
  name,
  role,
  embedding,
  memberId = null,
  personType = memberId ? "internal" : "external",
  companyKey = "",
}) {
  const user = getCurrentUser();
  ensureUser(user);
  const normalizedType = personType === "internal" ? "internal" : "external";
  if (!name?.trim()) throw new Error("声纹姓名不能为空。");
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    throw new Error("声纹向量无效（需 192 维）。");
  }
  if (normalizedType === "internal" && !memberId) {
    throw new Error("内部成员声纹必须绑定 memberId。");
  }
  const existing = await getVoiceprintsByUser(user.id);
  if (normalizedType === "internal" && existing.some((item) => item.memberId === memberId)) {
    throw new Error("该内部成员已存在声纹记录。");
  }
  const now = new Date().toISOString();
  const record = normalize({
    id: generateId(),
    ownerUserId: user.id,
    memberId: normalizedType === "internal" ? memberId : null,
    personType: normalizedType,
    companyKey: companyKey || user.company || "",
    name: name.trim(),
    role: role?.trim() || "",
    color: pickColor(existing.length),
    embedding,
    sampleCount: 1,
    createdAt: now,
    updatedAt: now,
  });
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const req = store.add(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return resolveLinkedMemberFields(record);
}

export async function deleteVoiceprint(id) {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteVoiceprintsByMemberId(memberId) {
  if (!memberId) {
    return 0;
  }

  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    let deletedCount = 0;
    const index = store.index("memberId");
    const request = index.openCursor(IDBKeyRange.only(memberId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(deletedCount);
        return;
      }

      const deleteRequest = cursor.delete();
      deleteRequest.onsuccess = () => {
        deletedCount += 1;
        cursor.continue();
      };
      deleteRequest.onerror = () => reject(deleteRequest.error);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function updateVoiceprintProfile(id, payload = {}) {
  const store = await tx("readwrite");
  const record = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!record) throw new Error(`未找到声纹：${id}`);
  const current = normalize(record);
  if (current.personType === "internal") {
    throw new Error("内部成员声纹的姓名与职位跟随成员主档，请前往成员管理修改。");
  }
  const next = normalize({
    ...current,
    name: payload.name?.trim() || current.name,
    role: payload.role !== undefined ? payload.role?.trim() || "" : current.role,
    updatedAt: new Date().toISOString(),
  });
  const store2 = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const req = store2.put(next);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  return next;
}

export async function renameVoiceprint(id, name, role) {
  return updateVoiceprintProfile(id, { name, role });
}

export async function clearVoiceprintsForDebug() {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
