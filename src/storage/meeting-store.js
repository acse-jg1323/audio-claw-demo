import { getCurrentUser } from "../auth/auth-store.js";
import { getDemoParticipantByName } from "../meeting/demo-participants.js";

const STORAGE_KEY = "ac_meetings";
const DEFAULT_MEETING_TITLE = "AI 会议平台产品介绍";

export const MEETING_STATUSES = {
  DRAFT: "draft",
  STARTING: "starting",
  LIVE: "live",
  LIVE_DEGRADED: "live_degraded",
  ENDING: "ending",
  SUMMARIZING: "summarizing",
  ARCHIVABLE: "archivable",
  ARCHIVABLE_NO_SUMMARY: "archivable_no_summary",
  ARCHIVED: "archived",
  RECOVERABLE: "recoverable",
  ABORTED: "aborted",
};

const ACTIVE_MEETING_STATUS_SET = new Set([
  MEETING_STATUSES.STARTING,
  MEETING_STATUSES.LIVE,
  MEETING_STATUSES.LIVE_DEGRADED,
  MEETING_STATUSES.ENDING,
  MEETING_STATUSES.SUMMARIZING,
  MEETING_STATUSES.ARCHIVABLE,
  MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY,
  MEETING_STATUSES.RECOVERABLE,
]);

function readMeetings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeMeetingRecord) : [];
  } catch {
    return [];
  }
}

function writeMeetings(meetings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meetings));
}

function hasPersistedMeetingActivity(meeting) {
  const hasTranscript = Array.isArray(meeting?.transcriptSegments) && meeting.transcriptSegments.length > 0;
  const hasAssistant = Array.isArray(meeting?.assistantMessages) && meeting.assistantMessages.length > 0;
  const hasSummary = Boolean(meeting?.summary) || meeting?.summaryStatus === "ready";
  const hasCoverSnippet = typeof meeting?.coverSnippet === "string" && meeting.coverSnippet.trim().length > 0;
  const hasDuration = Number(meeting?.durationSeconds) > 0;
  const hasEndTime = Boolean(meeting?.endedAt);
  const hasStartMutation =
    typeof meeting?.startedAt === "string" &&
    typeof meeting?.lastVisitedAt === "string" &&
    meeting.startedAt !== meeting.lastVisitedAt;

  return (
    hasTranscript ||
    hasAssistant ||
    hasSummary ||
    hasCoverSnippet ||
    hasDuration ||
    hasEndTime ||
    hasStartMutation
  );
}

function normalizeMeetingStatus(meeting) {
  const status = meeting?.status;
  if (Object.values(MEETING_STATUSES).includes(status)) {
    return status;
  }

  if (status === "finished") {
    return MEETING_STATUSES.ARCHIVED;
  }

  if (status === "processing") {
    return meeting?.summary || meeting?.summaryStatus === "ready"
      ? MEETING_STATUSES.ARCHIVABLE
      : MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY;
  }

  if (status === "ongoing") {
    return hasPersistedMeetingActivity(meeting) ? MEETING_STATUSES.RECOVERABLE : MEETING_STATUSES.DRAFT;
  }

  return hasPersistedMeetingActivity(meeting) ? MEETING_STATUSES.RECOVERABLE : MEETING_STATUSES.DRAFT;
}

function normalizeMeetingRecord(meeting) {
  const normalizedStatus = normalizeMeetingStatus(meeting);
  return {
    id: meeting.id,
    ownerUserId: meeting.ownerUserId || "",
    ownerName: meeting.ownerName || "",
    title: meeting.title || DEFAULT_MEETING_TITLE,
    status: normalizedStatus,
    startedAt: meeting.startedAt || null,
    endedAt: meeting.endedAt || null,
    durationSeconds: Number.isFinite(meeting.durationSeconds) ? meeting.durationSeconds : 0,
    mainLanguage: meeting.mainLanguage || "zh",
    meetingTargetLanguage: meeting.meetingTargetLanguage || "en",
    participants: normalizeParticipants(meeting.participants),
    tags: Array.isArray(meeting.tags) ? meeting.tags : [],
    transcriptSegments: Array.isArray(meeting.transcriptSegments) ? meeting.transcriptSegments : [],
    summary: meeting.summary || null,
    summaryStatus: meeting.summaryStatus || "empty",
    assistantMessages: Array.isArray(meeting.assistantMessages) ? meeting.assistantMessages : [],
    coverSnippet: meeting.coverSnippet || "",
    isStarred: Boolean(meeting.isStarred),
    lastVisitedAt: meeting.lastVisitedAt || meeting.startedAt || new Date().toISOString(),
  };
}

function normalizeParticipant(participant) {
  if (!participant) {
    return null;
  }

  if (typeof participant === "string") {
    const matched = getDemoParticipantByName(participant);
    return (
      matched || {
        name: participant,
        role: "",
        avatar: participant.trim().slice(0, 1) || "未",
        color: "var(--text-tertiary)",
      }
    );
  }

  if (typeof participant === "object" && participant.name) {
    const matched = getDemoParticipantByName(participant.name);
    return {
      ...(matched || {}),
      ...participant,
      avatar: participant.avatar || matched?.avatar || participant.name.trim().slice(0, 1) || "未",
      color: participant.color || matched?.color || "var(--text-tertiary)",
      role: participant.role || matched?.role || "",
    };
  }

  return null;
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }

  const seenNames = new Set();
  return participants
    .map(normalizeParticipant)
    .filter((participant) => {
      if (!participant?.name || seenNames.has(participant.name)) {
        return false;
      }
      seenNames.add(participant.name);
      return true;
    });
}

function ensureUser(user) {
  if (!user?.id) {
    throw new Error("创建会议前必须提供有效用户。");
  }
}

function formatDateToken(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function generateMeetingId(existingMeetings) {
  const dateToken = formatDateToken(new Date());
  const prefix = `mtg_${dateToken}_`;
  const count = existingMeetings.filter((meeting) => meeting.id.startsWith(prefix)).length + 1;
  return `${prefix}${String(count).padStart(3, "0")}`;
}

function mergeParticipants(existingParticipants, transcriptSegments) {
  const participants = normalizeParticipants(existingParticipants);
  const participantMap = new Map(participants.map((participant) => [participant.name, participant]));
  transcriptSegments.forEach((segment) => {
    const name = segment?.speaker?.name?.trim?.();
    if (name && !participantMap.has(name)) {
      participantMap.set(name, normalizeParticipant(name));
    }
  });
  return Array.from(participantMap.values());
}

function buildCoverSnippet({ coverSnippet, transcriptSegments, summary }) {
  if (coverSnippet?.trim()) {
    return coverSnippet.trim();
  }

  if (summary?.aiSummary?.trim()) {
    return summary.aiSummary.trim().slice(0, 120);
  }

  const firstSegmentText = transcriptSegments.find((segment) => segment?.text?.trim())?.text || "";
  return firstSegmentText.trim().slice(0, 120);
}

function updateMeetingById(meetingId, updater) {
  const meetings = readMeetings();
  const index = meetings.findIndex((meeting) => meeting.id === meetingId);

  if (index === -1) {
    throw new Error(`未找到会议：${meetingId}`);
  }

  const currentMeeting = normalizeMeetingRecord(meetings[index]);
  const nextMeeting = normalizeMeetingRecord(updater(currentMeeting));
  meetings[index] = nextMeeting;
  writeMeetings(meetings);
  return nextMeeting;
}

export function getAllMeetings() {
  return readMeetings();
}

export function isActiveMeetingStatus(status) {
  return ACTIVE_MEETING_STATUS_SET.has(status);
}

export function isArchivedMeetingStatus(status) {
  return status === MEETING_STATUSES.ARCHIVED;
}

export function getMeetingsByUser(userId) {
  return readMeetings()
    .filter((meeting) => meeting.ownerUserId === userId)
    .sort((a, b) => new Date(b.lastVisitedAt).getTime() - new Date(a.lastVisitedAt).getTime());
}

export function getMeetingById(meetingId) {
  return readMeetings().find((meeting) => meeting.id === meetingId) || null;
}

export function getOngoingMeetingByUser(userId) {
  return (
    getMeetingsByUser(userId).find((meeting) => isActiveMeetingStatus(meeting.status)) || null
  );
}

export function createMeetingForUser(user, payload = {}) {
  ensureUser(user);

  const meetings = readMeetings();
  const now = new Date().toISOString();
  const meeting = normalizeMeetingRecord({
    id: generateMeetingId(meetings),
    ownerUserId: user.id,
    ownerName: user.name || "",
    title: payload.title || DEFAULT_MEETING_TITLE,
    status: payload.status || MEETING_STATUSES.DRAFT,
    startedAt: payload.startedAt || null,
    endedAt: payload.endedAt || null,
    durationSeconds: payload.durationSeconds || 0,
    mainLanguage: payload.mainLanguage || "zh",
    meetingTargetLanguage: payload.meetingTargetLanguage || "en",
    participants: payload.participants || [],
    tags: payload.tags || [],
    transcriptSegments: payload.transcriptSegments || [],
    summary: payload.summary || null,
    summaryStatus: payload.summaryStatus || "empty",
    assistantMessages: payload.assistantMessages || [],
    coverSnippet: payload.coverSnippet || "",
    isStarred: payload.isStarred || false,
    lastVisitedAt: payload.lastVisitedAt || now,
  });

  meetings.unshift(meeting);
  writeMeetings(meetings);
  return meeting;
}

export function createMeetingForCurrentUser(payload = {}) {
  const currentUser = getCurrentUser();
  ensureUser(currentUser);
  return createMeetingForUser(currentUser, payload);
}

export function updateMeetingSnapshot(meetingId, payload = {}) {
  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    ...payload,
    id: meeting.id,
    ownerUserId: meeting.ownerUserId,
    ownerName: meeting.ownerName,
    lastVisitedAt: payload.lastVisitedAt || new Date().toISOString(),
  }));
}

export function saveMeetingSegments(meetingId, transcriptSegments, extraPayload = {}) {
  const safeSegments = Array.isArray(transcriptSegments) ? transcriptSegments : [];

  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    ...extraPayload,
    transcriptSegments: safeSegments,
    participants: mergeParticipants(meeting.participants, safeSegments),
    coverSnippet: buildCoverSnippet({
      coverSnippet: extraPayload.coverSnippet || meeting.coverSnippet,
      transcriptSegments: safeSegments,
      summary: meeting.summary,
    }),
    lastVisitedAt: new Date().toISOString(),
  }));
}

export function saveMeetingSummary(meetingId, summary, extraPayload = {}) {
  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    ...extraPayload,
    summary,
    summaryStatus: summary ? "ready" : meeting.summaryStatus,
    coverSnippet: buildCoverSnippet({
      coverSnippet: extraPayload.coverSnippet || meeting.coverSnippet,
      transcriptSegments: meeting.transcriptSegments,
      summary,
    }),
    lastVisitedAt: new Date().toISOString(),
  }));
}

export function saveMeetingAssistantMessages(meetingId, assistantMessages, extraPayload = {}) {
  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    ...extraPayload,
    assistantMessages: Array.isArray(assistantMessages) ? assistantMessages : [],
    lastVisitedAt: new Date().toISOString(),
  }));
}

export function finishMeeting(meetingId, payload = {}) {
  return updateMeetingById(meetingId, (meeting) => {
    const endedAt = payload.endedAt || new Date().toISOString();
    const durationSeconds =
      payload.durationSeconds ??
      Math.max(
        0,
        Math.floor((new Date(endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 1000)
      );

    const transcriptSegments = Array.isArray(payload.transcriptSegments)
      ? payload.transcriptSegments
      : meeting.transcriptSegments;
    const summary = payload.summary ?? meeting.summary;
    const assistantMessages = Array.isArray(payload.assistantMessages)
      ? payload.assistantMessages
      : meeting.assistantMessages;

    return {
      ...meeting,
      ...payload,
      status: payload.status || MEETING_STATUSES.ARCHIVED,
      endedAt,
      durationSeconds,
      transcriptSegments,
      summary,
      summaryStatus: summary ? "ready" : meeting.summaryStatus,
      assistantMessages,
      participants: mergeParticipants(meeting.participants, transcriptSegments),
      coverSnippet: buildCoverSnippet({
        coverSnippet: payload.coverSnippet || meeting.coverSnippet,
        transcriptSegments,
        summary,
      }),
      lastVisitedAt: endedAt,
    };
  });
}

export function touchMeeting(meetingId) {
  return updateMeetingSnapshot(meetingId, {
    lastVisitedAt: new Date().toISOString(),
  });
}

export function toggleMeetingStarred(meetingId) {
  return updateMeetingById(meetingId, (meeting) => ({
    ...meeting,
    isStarred: !meeting.isStarred,
    lastVisitedAt: new Date().toISOString(),
  }));
}

export function deleteFinishedMeetingById(meetingId, ownerUserId) {
  const meetings = readMeetings();
  const targetMeeting = meetings.find((meeting) => meeting.id === meetingId);

  if (!targetMeeting) {
    throw new Error(`未找到会议：${meetingId}`);
  }

  if (targetMeeting.ownerUserId !== ownerUserId) {
    throw new Error("只能删除当前用户自己的历史会议。");
  }

  if (targetMeeting.status !== MEETING_STATUSES.ARCHIVED) {
    throw new Error("只能删除已归档的历史会议。");
  }

  writeMeetings(meetings.filter((meeting) => meeting.id !== meetingId));
  return normalizeMeetingRecord(targetMeeting);
}

export function clearMeetingsForDebug() {
  localStorage.removeItem(STORAGE_KEY);
}
