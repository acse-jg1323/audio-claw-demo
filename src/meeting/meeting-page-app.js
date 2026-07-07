import { AudioPcmCapture } from "../integrations/audio-pcm-capture.js?v=20260621-m5";
import {
  generateMeetingSummary,
  SUMMARY_MODEL_INFO,
} from "./meeting-summary-executor.js?v=20260629-i18n-fix";
import { askMeetingAssistant } from "./meeting-assistant-executor.js?v=20260629-i18n-fix";
import { SenseAudioWebSocketClient } from "../integrations/senseaudio-websocket-client.js?v=20260628-stream";
import { translateSegment } from "./meeting-translation-executor.js?v=20260628-stream";
import { matchGlossaryForSegment } from "./meeting-terms-matcher.js?v=20260624-terms";
import {
  createPolicySummary,
  createTranslationPlan,
  detectLanguage,
  getLanguageLabel,
} from "./meeting-translation-router.js?v=20260629-i18n-fix";
import { recordMatchedTermHits } from "../storage/terms-store.js?v=20260624-terms";
import {
  MEETING_STATUSES,
  finishMeeting,
  getMeetingById,
  saveMeetingAssistantMessages,
  saveMeetingSegments,
  saveMeetingSummary,
  updateMeetingSnapshot,
} from "../storage/meeting-store.js?v=20260624-assistant";
import { getCurrentUser } from "../auth/auth-store.js";
import {
  getMeetingConfigForUser,
  saveMeetingConfigForUser,
} from "../storage/meeting-config-store.js";
import {
  formatDateTime,
  formatTime as formatLocaleTime,
  getSystemLanguage,
  onSystemLanguageChange,
} from "../i18n/locale-store.js";
import { t } from "../i18n/messages.js";
import {
  DEMO_MEETING_PARTICIPANTS,
  getDemoParticipantByName,
  getLocalizedParticipantRole,
} from "./demo-participants.js";
import {
  initVoiceprintEngine,
  extractEmbedding,
  extractAveragedEmbedding,
  matchSpeaker,
} from "../integrations/voiceprint-engine.js?v=20260629-vpalign";
import { getVoiceprintsForMeetingParticipants } from "../storage/voiceprint-store.js?v=20260705-vpmeeting";

const SUMMARY_TITLE_BASE = "AI 会议平台产品介绍";
const SUMMARY_PARTNER_LABEL = "神泉科技 ↔ 株式会社サンライズ";
const ASSISTANT_MAX_SEGMENTS = 50; // 助手提问时最多带最近多少条转写（防止长会议拖慢响应）
const pageSearchParams = new URLSearchParams(window.location.search);
const currentMeetingId = pageSearchParams.get("meetingId") || "";
const currentMeetingMode = pageSearchParams.get("mode") || "live";
const isReplayMode = currentMeetingMode === "replay";

const refs = {
  startBtn: document.getElementById("btnStartMeeting"),
  stopBtn: document.getElementById("btnStopMeeting"),
  transcriptPanel: document.getElementById("tab-transcript"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  translatorModel: document.getElementById("translatorModel"),
  mainLanguage: document.getElementById("mainLanguage"),
  meetingTargetLanguage: document.getElementById("meetingTargetLanguage"),
  silenceDuration: document.getElementById("silenceDuration"),
  minSpeechDuration: document.getElementById("minSpeechDuration"),
  configStatus: document.getElementById("configStatus"),
  configHint: document.getElementById("configHint"),
  configSession: document.getElementById("configSession"),
  transcriptStatus: document.getElementById("transcriptStatusText"),
  transcriptStatusBadge: document.getElementById("transcriptLiveStatus"),
  transcriptModeText: document.getElementById("transcriptModeText"),
  recordingStatus: document.getElementById("recordingStatus"),
  recordingStatusText: document.getElementById("recordingStatusText"),
  meetingTitleMain: document.getElementById("meetingTitleMain"),
  meetingTitleSub: document.getElementById("meetingTitleSub"),
  speakerLegend: document.getElementById("speakerLegend"),
  bubbles: document.getElementById("bubbles"),
  timer: document.getElementById("meetingDuration"),
  activeSpeakerAvatar: document.getElementById("activeSpeakerAvatar"),
  activeSpeakerName: document.getElementById("activeSpeakerName"),
  recognitionStatus: document.getElementById("recognitionStatus"),
  micBars: Array.from(document.querySelectorAll("#micBars .level-bar")),
  floatContent: document.getElementById("floatContent"),
  jumpLatestBtn: document.getElementById("jumpLatestBtn"),
  jumpLatestCount: document.getElementById("jumpLatestCount"),
  summaryPanel: document.getElementById("tab-summary"),
  summaryTitle: document.getElementById("summaryTitle"),
  summarySubtitle: document.getElementById("summarySubtitle"),
  summaryContent: document.getElementById("summaryContent"),
  summaryStatusLine: document.getElementById("summaryStatusLine"),
  summaryStatusText: document.getElementById("summaryStatusText"),
  summaryModeBadge: document.getElementById("summaryModeBadge"),
  btnSummaryRegenerate: document.getElementById("btnSummaryRegenerate"),
  btnSummaryEdit: document.getElementById("btnSummaryEdit"),
  btnSummaryCancel: document.getElementById("btnSummaryCancel"),
  btnSummarySave: document.getElementById("btnSummarySave"),
  btnSummaryExport: document.getElementById("btnSummaryExport"),
  // 悬浮字幕 PiP
  floatSubtitle: document.getElementById("floatSubtitle"),
  btnFloat: document.getElementById("btnFloat"),
  // AI 助手
  assistantMessages: document.getElementById("assistantMessages"),
  assistantInput: document.getElementById("assistantInput"),
  assistantSend: document.getElementById("assistantSend"),
  assistantChips: Array.from(document.querySelectorAll(".ai-quick .ai-chip")),
};

let channels = []; // 每个音频源一路：{ source, client, capture, vpRingBuffer, vpRingFilled, connectionLostHandled }
let meetingState = "idle";
let meetingStartedAt = null;
let timerId = null;
let segmentCount = 0;
let meetingRunId = 0;
let segmentOrder = [];
let segmentStore = new Map();
let isAutoFollowEnabled = true;
let pendingNewMessageCount = 0;
let summaryState = createInitialSummaryState();
let summaryRequestSeq = 0;
let hasLoggedMeetingPersistenceWarning = false;
let isArchivingMeeting = false;
let currentMeetingTitle = SUMMARY_TITLE_BASE;
let activeMeetingParticipants = DEMO_MEETING_PARTICIPANTS.slice(0, 4);
let currentMeetingRecord = null;
let currentMeetingEndedAt = null;
let assistantMessages = [];
let assistantInputComposing = false;
let hasHandledPageClose = false;
let pendingTranscriptPersistTimerId = null;
let pendingTranscriptPersistPayload = null;
let lastPersistedSegmentCount = 0;
let transcriptWindowStartIndex = 0;
let transcriptWindowEndIndex = 0;

// ---- 声纹识别状态 ----
const VP_SAMPLE_RATE = 16000;
const VP_BUFFER_SECONDS = 30; // 环形缓冲保留最近 30 秒
const VP_AMBIGUOUS_MARGIN = 0.03; // 最高分与次高分差小于此值视为“分不清是谁”
const VP_MIN_DURATION_MS = 1500;
const VP_MAX_DURATION_MS = 8000;
let vpEnginePromise = null;
let vpLibrary = [];
let vpReady = false;

// 每路音频独立的声纹环形缓冲，避免麦克风与系统声写入同一缓冲导致切片串路。
function createChannel(source) {
  return {
    source, // 'mic' | 'system'
    client: null,
    capture: null,
    vpRingBuffer: new Float32Array(VP_SAMPLE_RATE * VP_BUFFER_SECONDS),
    vpRingFilled: 0, // 已写入样本总数（单调递增，用于换算时间→缓冲位置）
    connectionLostHandled: false, // 断线收尾每路只执行一次
    debugChunkCount: 0,
    debugLevelCount: 0,
  };
}

// 建一路完整链路：WebSocket 连接 + task_start + 采集。stream 为空走麦克风 getUserMedia，
// 传入 stream（系统声 getDisplayMedia 的 audio track）时复用同一套降采样管线。
async function startChannel(channel, { apiKey, vadSetting, stream, onLevel }) {
  // #region debug-point A:start-channel
  reportMicSystemDropDebug("A", "meeting-page-app.js:startChannel:init", "startChannel init", {
    source: channel?.source || "unknown",
    hasProvidedStream: Boolean(stream),
    providedAudioTracks: stream?.getAudioTracks?.().length ?? 0,
    meetingState,
    channelsCount: channels.length,
    vadSetting,
  });
  // #endregion
  channel.client = new SenseAudioWebSocketClient({
    apiKey,
    targetLanguage: "",
    vadSetting,
    onStatus: (status) => handleClientStatus(status, channel),
    onResult: (result) => handleResult(result, channel),
    onError: (error) => handleChannelError(error, channel),
    onLog: () => {},
  });

  await channel.client.connect();
  await channel.client.startTask();

  channel.capture = new AudioPcmCapture({
    targetSampleRate: 16000,
    stream: stream ?? null,
    onChunk: (buffer) => {
      channel.debugChunkCount += 1;
      if (channel.debugChunkCount <= 5) {
        // #region debug-point A:audio-chunk
        reportMicSystemDropDebug("A", "meeting-page-app.js:startChannel:onChunk", "audio chunk received", {
          source: channel?.source || "unknown",
          chunkCount: channel.debugChunkCount,
          byteLength: buffer?.byteLength ?? 0,
          clientConnected: channel.client?.isConnected?.() ?? false,
          meetingState,
        });
        // #endregion
      }
      if (!channel.client?.isConnected()) {
        handleChannelLost(channel);
        return;
      }
      try {
        channel.client.sendAudio(buffer);
      } catch {
        handleChannelLost(channel);
        return;
      }
      pushVoiceBuffer(buffer, channel);
    },
    onLevel: (level) => {
      channel.debugLevelCount += 1;
      if (channel.debugLevelCount <= 8 && channel.source === "mic") {
        // #region debug-point A:audio-level
        reportMicSystemDropDebug("A", "meeting-page-app.js:startChannel:onLevel", "audio level observed", {
          source: channel.source,
          levelCount: channel.debugLevelCount,
          level,
          meetingState,
        });
        // #endregion
      }
      (onLevel ?? (() => {}))(level);
    },
  });

  await channel.capture.start();
  // #region debug-point A:start-channel-ready
  reportMicSystemDropDebug("A", "meeting-page-app.js:startChannel:ready", "startChannel ready", {
    source: channel?.source || "unknown",
    clientConnected: channel.client?.isConnected?.() ?? false,
    hasCapture: Boolean(channel.capture),
    meetingState,
  });
  // #endregion
}

function handleChannelError(error, channel) {
  if (channel?.source === "system") {
    return;
  }
  handleError(error);
}

// 声纹调试日志：默认关闭，localStorage.vpDebug="1" 时打印（便于日后排查识别/调阈值）
function vpLog(...args) {
  try {
    if (localStorage.getItem("vpDebug") === "1") console.log(...args);
  } catch {}
}

const AUTO_FOLLOW_THRESHOLD_PX = 300;
const TRANSCRIPT_PERSIST_THROTTLE_MS = 3000;
const TRANSCRIPT_PERSIST_SEGMENT_BATCH = 5;
const TRANSCRIPT_WINDOW_VISIBLE_COUNT = 200;
const TRANSCRIPT_WINDOW_MAX_COUNT = 300;
const TRANSCRIPT_WINDOW_STEP = 100;
const TRANSCRIPT_WINDOW_EDGE_PX = 96;

const MEETING_TEXTS = {
  zh: {
    page_title: "AudioClaw · 会议",
    transcript_tab: "实时转写流",
    summary_tab: "会议总结",
    float_button: "悬浮字幕",
    float_button_title: "悬浮字幕（悬浮到桌面，浮于任意应用之上）",
    start_button_title: "开始会议",
    stop_button_title: "结束会议",
    stop_button: "结束",
    settings_button_title: "设置",
    home_link_title: "回到主页",
    home_link_short_title: "返回主页",
    home_link_short: "主页",
    float_mode_source: "原文",
    float_mode_translation: "翻译",
    float_mode_both: "双语",
    active_label: "活跃：",
    network_good: "网络良好",
    jump_latest: "回到最新消息",
    bubble_mark: "标记重点",
    bubble_ask_ai: "问 AI",
    bubble_starred: "已标记",
    drawer_collapse: "收起 (⌘K)",
    drawer_expand: "展开 (⌘K)",
    send_button_title: "发送",
    mic_level_title: "麦克风电平",
    api_key_placeholder: "开发联调阶段临时输入，不写入前端代码",
    translator_model: "翻译模型",
    main_language: "主阅读语言",
    meeting_target_language: "会议外语目标语言",
    silence_duration: "静音断句 ms",
    min_speech_duration: "最短语音 ms",
    auto_scroll: "自动滚动 ↓",
    speaker_default_role: "参会人",
    speaker_generic: "发言人",
    replay_no_chat_history: "这场历史会议没有保存 AI 助手聊天记录。",
    replay_float_placeholder: "当前为历史会议回看模式，悬浮字幕不再接收新的实时内容。",
    replay_missing_id: "缺少历史会议标识，无法进入回看。",
    replay_not_found: "未找到对应的历史会议记录。",
    replay_no_access: "你没有权限查看这场历史会议。",
    replay_not_finished: "该会议尚未完成归档，暂时不能进入回看。",
    replay_hint: "当前为历史会议回看模式，页面展示的是已归档的 transcript 与 summary 快照。",
    replay_loaded: "已加载历史会议，只读查看中。",
    not_recorded: "未记录",
    replay_session: "meeting_id: {id} · 开始：{start} · 结束：{end}",
    replay_no_transcript: "这场历史会议暂无可回看的转写内容。",
    archived_snapshot: "归档快照",
    meeting_recoverable_notice: "检测到上次会议未正常关闭。当前内容已恢复，你可以继续会议或直接结束收尾。",
    persist_warn_missing_record: "未找到可持久化的会议记录：{id}",
    persist_metadata_failed: "会议元数据保存失败。",
    persist_transcript_failed: "会议转写快照保存失败。",
    persist_summary_failed: "会议总结快照保存失败。",
    persist_assistant_failed: "AI 助手聊天记录保存失败。",
    missing_api_key: "请先输入 SenseAudio API Key。",
    missing_key_badge: "缺少 Key",
    live_wait_first_segment: "会议已启动，等待第一条识别结果...",
    live_float_placeholder: "会中转写启动后，最近两条实时结果会显示在这里。",
    ws_connecting: "正在建立 DeepThink WebSocket 连接...",
    connected_success: "connected_success 已收到，正在发送 task_start。",
    task_started: "task_started 已收到，正在启动麦克风采集。",
    config_status_waiting: "等待开始",
    meeting_finished_waiting: "正在结束本场会议并等待 task_finished...",
    meeting_finished_kept: "会议已结束，本场实时转写保留在当前页面。",
    connection_success: "连接成功",
    connection_lost_badge: "连接断开",
    connection_lost_status: "与转写服务的连接已断开，已停止采集。当前转写结果保留在页面上，可重新开始会议。",
    system_audio_connected: "系统声音路已接入，远程发言将一并转写。",
    system_audio_failed: "系统声音路接入失败，已降级为仅麦克风转写。",
    system_audio_missing: "未捕获到系统声音，本场仅转写麦克风。",
    system_audio_disconnected: "系统声音路已断开，继续转写麦克风。",
    transcribing: "转写中",
    finished: "已结束",
    recognition_failed_badge: "识别失败",
    recognition_failed_status: "识别失败",
    segment_received: "已接收 {count} 条分段结果，最新路由：{route}。",
    translation_status_with_glossary: "最新译文由 {model} 返回，耗时 {latency} ms，已参考 {count} 条术语热词。",
    translation_status_plain: "最新译文由 {model} 返回，耗时 {latency} ms。",
    translation_failed_short: "翻译暂时失败，请稍后重试。",
    translation_failed_status: "译文回填失败。",
    meeting_recognition_failed: "会议识别失败。",
    translation_pending: "翻译中... ({language})",
    transcript_empty_title: "实时会议尚未开始",
    transcript_empty_text:
      "点击顶部“开始会议”后，系统会调用 DeepThink WebSocket 建立实时连接，并把麦克风语音流式输出到当前界面。",
    float_placeholder_default: "悬浮字幕开启后，会在这里显示最近一条原文和译文。",
    pip_not_supported: "当前浏览器不支持桌面悬浮窗（Document PiP），请使用 Chrome / Edge 116+。",
    pip_open_failed: "无法打开桌面悬浮窗：{message}",
    assistant_empty_answer: "没有可用的回答。",
    assistant_request_failed: "会议助手请求失败，请稍后重试。",
    citation_label: "引用原文：",
    summary_missing_api_key: "请先输入 SenseAudio API Key，再生成会议总结。",
    summary_final_label: "最终总结",
    summary_current_label: "当前总结",
    summary_generated_status: "{modeLabel}已生成，模型 {model}，耗时 {latency} ms。",
    summary_auto_generated: "会议已结束，已自动生成最终总结。",
    summary_no_content: "当前会议还没有可用于总结的转写内容。",
    summary_no_valid_content: "当前会议还没有足够的有效内容用于生成总结。",
    summary_editing_notice: "正在编辑当前总结，修改内容仅保存在本页。",
    summary_updated_prefix: "已更新于 ",
    participants_count: "{count} 名参会者",
    participants_waiting: "等待参会内容",
    summary_empty_replay_title: "该历史会议暂无归档总结",
    summary_generate_final: "生成最终总结",
    summary_generate_current: "生成当前总结",
    summary_empty_text:
      "系统会基于当前会议已产生的转写内容，自动整理 AI 摘要、关键决议、待办与负责人、遗留问题，以及参会人发言占比。",
    summary_error_help: "可以稍后重试一次；实时转写内容仍然保留在当前页面，不会丢失。",
    summary_error_check: "请检查 API Key、网络连接或当前总结输入内容。",
    archive_ready_no_summary: "当前未生成最终总结，但会议内容已保留。你可以直接归档，或稍后再重试总结。",
    ai_summary_title: "AI 摘要",
    decisions_title: "关键决议",
    actions_title: "待办与负责人",
    questions_title: "遗留问题",
    speaker_stats_title: "参会人与发言占比",
    archive_ready: "最终总结已生成。点击后将完成本场会议归档，并返回首页。",
    archiving: "归档中...",
    archive_and_return: "归档并返回首页",
    decision_label: "决议内容",
    delete_rule: "删除",
    add_decision: "新增决议",
    action_task_label: "待办内容",
    owner_label: "负责人",
    owner_placeholder: "待补充负责人",
    deadline_label: "截止日",
    deadline_placeholder: "待补充截止日",
    owner_status_label: "确认情况",
    owner_status_confirmed: "已确认",
    owner_status_unclear: "待确认",
    add_action: "新增待办",
    question_label: "遗留问题",
    add_question: "新增遗留问题",
    speaker_stats_note: "发言占比为程序计算结果，当前编辑态下保持只读。",
    no_decisions: "当前未识别出明确的关键决议。",
    no_actions: "当前未识别出明确的待办事项。",
    no_questions: "当前没有识别出需要继续跟进的遗留问题。",
    no_speaker_stats: "暂无可计算的发言占比。",
    owner_unspecified: "未明确",
    deadline_unspecified: "未明确",
    archive_failed: "会议归档失败，请稍后重试。",
    markdown_mode: "模式",
    markdown_final: "最终总结",
    markdown_draft: "草稿总结",
    markdown_language: "语言",
    markdown_updated_at: "更新时间",
    markdown_ai_summary: "AI 摘要",
    markdown_decisions: "关键决议",
    markdown_actions: "待办与负责人",
    markdown_questions: "遗留问题",
    markdown_speaker_stats: "参会人与发言占比",
    markdown_none: "暂无",
    markdown_owner: "负责人",
    markdown_deadline: "截止日",
    recognition_normal: "识别正常",
    recognition_finished: "识别结束",
    recognition_error: "识别异常",
    voiceprint_library_empty: "本场参会人暂无可用声纹，将继续转写并显示未识别说话人。",
    voiceprint_library_loaded: "已加载本场 {count} 个可用声纹，将自动识别说话人。",
    replay_policy_hint: "当前为历史会议回看模式，展示的是归档时保存的 transcript 与 summary 快照。",
    archived_status: "已归档",
    duration_live: "进行 {duration}",
    duration_waiting: "待开始",
    active_speaker_demo: "{name}（演示占位）",
    active_speaker_waiting: "等待发言",
    vad_must_number: "VAD 参数必须是数字。",
    config_error: "配置错误",
  },
  ja: {
    page_title: "AudioClaw · 会議",
    transcript_tab: "リアルタイム transcript",
    summary_tab: "会議サマリー",
    float_button: "フローティング字幕",
    float_button_title: "フローティング字幕（デスクトップ上で常に最前面表示）",
    start_button_title: "会議を開始",
    stop_button_title: "会議を終了",
    stop_button: "終了",
    settings_button_title: "設定",
    home_link_title: "ホームに戻る",
    home_link_short_title: "ホームへ戻る",
    home_link_short: "ホーム",
    float_mode_source: "原文",
    float_mode_translation: "翻訳",
    float_mode_both: "二言語",
    active_label: "アクティブ：",
    network_good: "ネットワーク正常",
    jump_latest: "最新メッセージへ戻る",
    bubble_mark: "重要ポイントをマーク",
    bubble_ask_ai: "AI に質問",
    bubble_starred: "マーク済み",
    drawer_collapse: "折りたたむ (⌘K)",
    drawer_expand: "展開する (⌘K)",
    send_button_title: "送信",
    mic_level_title: "マイクレベル",
    api_key_placeholder: "開発検証用に一時入力します。フロントエンドコードには保存しません",
    translator_model: "翻訳モデル",
    main_language: "主表示言語",
    meeting_target_language: "会議の翻訳対象言語",
    silence_duration: "無音区切り ms",
    min_speech_duration: "最短音声 ms",
    auto_scroll: "自動スクロール ↓",
    speaker_default_role: "参加者",
    speaker_generic: "話者",
    replay_no_chat_history: "この履歴会議には AI アシスタントの保存済みチャット履歴がありません。",
    replay_float_placeholder: "現在は履歴会議の再生モードで、フローティング字幕は新しいリアルタイム内容を受信しません。",
    replay_missing_id: "履歴会議 ID がないため再生を開けません。",
    replay_not_found: "対応する履歴会議が見つかりませんでした。",
    replay_no_access: "この履歴会議を表示する権限がありません。",
    replay_not_finished: "この会議はまだアーカイブされていないため、再生できません。",
    replay_hint: "現在は履歴会議の再生モードで、保存済み transcript と summary スナップショットを表示しています。",
    replay_loaded: "履歴会議を読み込みました。閲覧専用です。",
    not_recorded: "未記録",
    replay_session: "meeting_id: {id} · 開始: {start} · 終了: {end}",
    replay_no_transcript: "この履歴会議には再生できる transcript がまだありません。",
    archived_snapshot: "アーカイブスナップショット",
    meeting_recoverable_notice:
      "前回の会議が正常終了していません。現在の内容を復元しました。会議を再開するか、そのまま終了して締め処理できます。",
    persist_warn_missing_record: "永続化対象の会議記録が見つかりません: {id}",
    persist_metadata_failed: "会議メタデータの保存に失敗しました。",
    persist_transcript_failed: "会議 transcript スナップショットの保存に失敗しました。",
    persist_summary_failed: "会議サマリースナップショットの保存に失敗しました。",
    persist_assistant_failed: "AI アシスタントのチャット履歴保存に失敗しました。",
    missing_api_key: "先に SenseAudio API Key を入力してください。",
    missing_key_badge: "Key 不足",
    live_wait_first_segment: "会議を開始しました。最初の認識結果を待っています...",
    live_float_placeholder: "会議中の transcript が始まると、直近 2 件の結果がここに表示されます。",
    ws_connecting: "DeepThink WebSocket 接続を確立しています...",
    connected_success: "connected_success を受信しました。task_start を送信しています。",
    task_started: "task_started を受信しました。マイク収集を開始しています。",
    config_status_waiting: "開始待ち",
    meeting_finished_waiting: "会議を終了し、task_finished を待機しています...",
    meeting_finished_kept: "会議は終了しました。リアルタイム transcript はこのページに保持されます。",
    connection_success: "接続成功",
    connection_lost_badge: "接続切断",
    connection_lost_status:
      "文字起こしサービスとの接続が切断され、収集を停止しました。現在の transcript はページ上に保持されており、会議を再開できます。",
    system_audio_connected: "システム音声経路を接続しました。リモート発言も合わせて文字起こしします。",
    system_audio_failed: "システム音声経路の接続に失敗したため、マイクのみの文字起こしに切り替えました。",
    system_audio_missing: "システム音声を取得できなかったため、この会議ではマイクのみを文字起こしします。",
    system_audio_disconnected: "システム音声経路が切断されました。マイクの文字起こしは継続します。",
    transcribing: "文字起こし中",
    finished: "終了",
    recognition_failed_badge: "認識失敗",
    recognition_failed_status: "認識失敗",
    segment_received: "{count} 件のセグメントを受信しました。最新ルート: {route}。",
    translation_status_with_glossary:
      "最新の訳文は {model} が返しました。所要時間 {latency} ms、{count} 件の用語を参照しました。",
    translation_status_plain: "最新の訳文は {model} が返しました。所要時間 {latency} ms。",
    translation_failed_short: "翻訳に失敗しました。しばらくしてから再試行してください。",
    translation_failed_status: "訳文の反映に失敗しました。",
    meeting_recognition_failed: "会議認識に失敗しました。",
    translation_pending: "翻訳中... ({language})",
    transcript_empty_title: "リアルタイム会議はまだ開始していません",
    transcript_empty_text:
      "上部の「会議を開始」を押すと、システムが DeepThink WebSocket に接続し、マイク音声をこの画面へストリーミングします。",
    float_placeholder_default: "フローティング字幕を開くと、ここに最新の原文と訳文が表示されます。",
    pip_not_supported:
      "現在のブラウザはデスクトップフローティングウィンドウ（Document PiP）に対応していません。Chrome / Edge 116+ を使用してください。",
    pip_open_failed: "デスクトップフローティングウィンドウを開けません: {message}",
    assistant_empty_answer: "利用できる回答がありません。",
    assistant_request_failed: "会議アシスタントのリクエストに失敗しました。後でもう一度お試しください。",
    citation_label: "引用 transcript:",
    summary_missing_api_key: "先に SenseAudio API Key を入力してから会議サマリーを生成してください。",
    summary_final_label: "最終サマリー",
    summary_current_label: "現在のサマリー",
    summary_generated_status: "{modeLabel}を生成しました。モデル {model}、所要時間 {latency} ms。",
    summary_auto_generated: "会議が終了し、最終サマリーを自動生成しました。",
    summary_no_content: "この会議にはまだサマリー対象の transcript がありません。",
    summary_no_valid_content: "この会議にはまだサマリー生成に十分な有効内容がありません。",
    summary_editing_notice: "現在のサマリーを編集中です。変更内容はこのページにのみ保存されます。",
    summary_updated_prefix: "更新時刻 ",
    participants_count: "{count} 名参加者",
    participants_waiting: "参加者待ち",
    summary_empty_replay_title: "この履歴会議には保存済みサマリーがありません",
    summary_generate_final: "最終サマリーを生成",
    summary_generate_current: "現在のサマリーを生成",
    summary_empty_text:
      "システムは現在の transcript を基に、AI 要約、決定事項、タスクと担当者、未解決事項、参加者ごとの発言比率を自動で整理します。",
    summary_error_help:
      "後でもう一度お試しください。リアルタイム transcript はこのページに保持され、失われません。",
    summary_error_check: "API Key、ネットワーク接続、または現在のサマリー入力内容を確認してください。",
    archive_ready_no_summary:
      "最終サマリーはまだありませんが、会議内容は保持されています。すぐにアーカイブするか、後でもう一度サマリーを試せます。",
    ai_summary_title: "AI 要約",
    decisions_title: "決定事項",
    actions_title: "タスクと担当者",
    questions_title: "未解決事項",
    speaker_stats_title: "参加者と発言比率",
    archive_ready: "最終サマリーが生成されました。クリックすると会議をアーカイブし、ホームに戻ります。",
    archiving: "アーカイブ中...",
    archive_and_return: "アーカイブしてホームへ戻る",
    decision_label: "決議内容",
    delete_rule: "削除",
    add_decision: "決議を追加",
    action_task_label: "タスク内容",
    owner_label: "担当者",
    owner_placeholder: "担当者を補足",
    deadline_label: "期限",
    deadline_placeholder: "期限を補足",
    owner_status_label: "確認状況",
    owner_status_confirmed: "確認済み",
    owner_status_unclear: "未確認",
    add_action: "タスクを追加",
    question_label: "未解決事項",
    add_question: "未解決事項を追加",
    speaker_stats_note: "発言比率はプログラム計算結果であり、編集中も読み取り専用です。",
    no_decisions: "明確な決定事項はまだ検出されていません。",
    no_actions: "明確なタスクはまだ検出されていません。",
    no_questions: "継続フォローが必要な未解決事項はまだ検出されていません。",
    no_speaker_stats: "計算可能な発言比率がまだありません。",
    owner_unspecified: "未確定",
    deadline_unspecified: "未確定",
    archive_failed: "会議のアーカイブに失敗しました。後でもう一度お試しください。",
    markdown_mode: "モード",
    markdown_final: "最終サマリー",
    markdown_draft: "ドラフトサマリー",
    markdown_language: "言語",
    markdown_updated_at: "更新時刻",
    markdown_ai_summary: "AI 要約",
    markdown_decisions: "決定事項",
    markdown_actions: "タスクと担当者",
    markdown_questions: "未解決事項",
    markdown_speaker_stats: "参加者と発言比率",
    markdown_none: "なし",
    markdown_owner: "担当者",
    markdown_deadline: "期限",
    recognition_normal: "認識正常",
    recognition_finished: "認識終了",
    recognition_error: "認識異常",
    voiceprint_library_empty:
      "この会議の参加者には利用可能な声紋がありません。文字起こしは継続し、話者は未識別として表示されます。",
    voiceprint_library_loaded: "この会議で利用可能な声紋を {count} 件読み込み、自動で話者認識します。",
    replay_policy_hint: "現在は履歴会議の再生モードで、保存時の transcript と summary スナップショットを表示しています。",
    archived_status: "アーカイブ済み",
    duration_live: "{duration} 経過",
    duration_waiting: "開始待ち",
    active_speaker_demo: "{name}（デモ表示）",
    active_speaker_waiting: "発言待ち",
    vad_must_number: "VAD パラメータは数値で入力してください。",
    config_error: "設定エラー",
  },
  en: {
    page_title: "AudioClaw · Meeting",
    transcript_tab: "Live Transcript",
    summary_tab: "Summary",
    float_button: "Floating Captions",
    float_button_title: "Floating captions above any desktop app",
    start_button_title: "Start Meeting",
    stop_button_title: "Stop Meeting",
    stop_button: "Stop",
    settings_button_title: "Settings",
    home_link_title: "Back Home",
    home_link_short_title: "Return Home",
    home_link_short: "Home",
    float_mode_source: "Source",
    float_mode_translation: "Translation",
    float_mode_both: "Bilingual",
    active_label: "Active:",
    network_good: "Network Good",
    jump_latest: "Jump To Latest",
    bubble_mark: "Mark Key Point",
    bubble_ask_ai: "Ask AI",
    bubble_starred: "Marked",
    drawer_collapse: "Collapse (⌘K)",
    drawer_expand: "Expand (⌘K)",
    send_button_title: "Send",
    mic_level_title: "Microphone Level",
    api_key_placeholder: "Temporary input for development only. Not written into frontend code",
    translator_model: "Translation Model",
    main_language: "Primary Language",
    meeting_target_language: "Meeting Target Language",
    silence_duration: "Silence Split ms",
    min_speech_duration: "Minimum Speech ms",
    auto_scroll: "Auto Scroll ↓",
    speaker_default_role: "Participant",
    speaker_generic: "Speaker",
    replay_no_chat_history: "No archived AI assistant chat history was saved for this replay meeting.",
    replay_float_placeholder: "Replay mode is active. Floating captions no longer receive new real-time content.",
    replay_missing_id: "Missing replay meeting identifier.",
    replay_not_found: "The requested replay meeting record was not found.",
    replay_no_access: "You do not have access to this replay meeting.",
    replay_not_finished: "This meeting has not finished archiving yet.",
    replay_hint: "Replay mode is active. This page shows archived transcript and summary snapshots.",
    replay_loaded: "Archived meeting loaded in read-only mode.",
    not_recorded: "Not recorded",
    replay_session: "meeting_id: {id} · Start: {start} · End: {end}",
    replay_no_transcript: "No replayable transcript is available for this archived meeting yet.",
    archived_snapshot: "Archived",
    meeting_recoverable_notice:
      "The last meeting did not close normally. The current content has been restored, and you can resume or end it safely.",
    persist_warn_missing_record: "No meeting record available for persistence: {id}",
    persist_metadata_failed: "Failed to persist meeting metadata.",
    persist_transcript_failed: "Failed to persist transcript snapshot.",
    persist_summary_failed: "Failed to persist summary snapshot.",
    persist_assistant_failed: "Failed to persist assistant chat history.",
    missing_api_key: "Enter the SenseAudio API Key first.",
    missing_key_badge: "Missing Key",
    live_wait_first_segment: "Meeting started. Waiting for the first recognition result...",
    live_float_placeholder: "Once live transcription starts, the latest two real-time results appear here.",
    ws_connecting: "Opening the DeepThink WebSocket connection...",
    connected_success: "Received connected_success. Sending task_start now.",
    task_started: "Received task_started. Starting microphone capture now.",
    config_status_waiting: "Waiting to start",
    meeting_finished_waiting: "Finishing this meeting and waiting for task_finished...",
    meeting_finished_kept: "Meeting ended. The live transcript remains on this page.",
    connection_success: "Connected",
    connection_lost_badge: "Connection Lost",
    connection_lost_status:
      "The connection to the transcription service was lost and capture has stopped. The current transcript stays on the page, and you can start the meeting again.",
    system_audio_connected: "System audio is connected. Remote speech is now transcribed as well.",
    system_audio_failed: "System audio could not be connected. Falling back to microphone-only transcription.",
    system_audio_missing: "No system audio was captured. This meeting will transcribe microphone input only.",
    system_audio_disconnected: "System audio was disconnected. Microphone transcription continues.",
    transcribing: "Transcribing",
    finished: "Finished",
    recognition_failed_badge: "Recognition Failed",
    recognition_failed_status: "Recognition Failed",
    segment_received: "Received {count} segments. Latest route: {route}.",
    translation_status_with_glossary:
      "Latest translation returned by {model} in {latency} ms, with {count} glossary terms applied.",
    translation_status_plain: "Latest translation returned by {model} in {latency} ms.",
    translation_failed_short: "Translation failed for now. Please try again later.",
    translation_failed_status: "Failed to write back the translation.",
    meeting_recognition_failed: "Meeting recognition failed.",
    translation_pending: "Translating... ({language})",
    transcript_empty_title: "The live meeting has not started yet",
    transcript_empty_text:
      'Click "Start Meeting" above to open the DeepThink WebSocket connection and stream microphone audio into this page.',
    float_placeholder_default: "Once floating captions are enabled, the latest source and translation appear here.",
    pip_not_supported:
      "This browser does not support desktop floating windows (Document PiP). Please use Chrome / Edge 116+.",
    pip_open_failed: "Unable to open the desktop floating window: {message}",
    assistant_empty_answer: "No answer is available.",
    assistant_request_failed: "The meeting assistant request failed. Please try again later.",
    citation_label: "Citations:",
    summary_missing_api_key: "Enter the SenseAudio API Key before generating a meeting summary.",
    summary_final_label: "Final Summary",
    summary_current_label: "Current Summary",
    summary_generated_status: "{modeLabel} ready · {latency} ms.",
    summary_auto_generated: "Final summary ready.",
    summary_no_content: "No transcript is available for summarization yet.",
    summary_no_valid_content: "There is not enough valid content to generate a summary yet.",
    summary_editing_notice: "Editing the current summary. Changes are stored on this page only.",
    summary_updated_prefix: "",
    participants_count: "{count} participants",
    participants_waiting: "Waiting for meeting content",
    summary_empty_replay_title: "No archived summary is available for this replay",
    summary_generate_final: "Generate Final Summary",
    summary_generate_current: "Generate Current Summary",
    summary_empty_text:
      "The system uses the current transcript to organize an AI summary, decisions, action items with owners, open questions, and speaker share.",
    summary_error_help: "Try again later. The live transcript remains on the page and will not be lost.",
    summary_error_check: "Please check the API Key, network connection, or current summary input.",
    archive_ready_no_summary:
      "No final summary is available yet, but the meeting content is preserved. You can archive now or retry the summary later.",
    ai_summary_title: "AI Summary",
    decisions_title: "Decisions",
    actions_title: "Action Items",
    questions_title: "Open Questions",
    speaker_stats_title: "Participants And Speaker Share",
    archive_ready: "The final summary is ready. Click to archive this meeting and return home.",
    archiving: "Archiving...",
    archive_and_return: "Archive And Return Home",
    decision_label: "Decision",
    delete_rule: "Delete",
    add_decision: "Add Decision",
    action_task_label: "Action Item",
    owner_label: "Owner",
    owner_placeholder: "Add an owner",
    deadline_label: "Deadline",
    deadline_placeholder: "Add a deadline",
    owner_status_label: "Confirmation",
    owner_status_confirmed: "Confirmed",
    owner_status_unclear: "Unclear",
    add_action: "Add Action Item",
    question_label: "Open Question",
    add_question: "Add Open Question",
    speaker_stats_note: "Speaker share is calculated by the system and stays read-only while editing.",
    no_decisions: "No clear decisions have been identified yet.",
    no_actions: "No clear action items have been identified yet.",
    no_questions: "No unresolved follow-up questions have been identified yet.",
    no_speaker_stats: "No speaker share is available yet.",
    owner_unspecified: "Unspecified",
    deadline_unspecified: "Unspecified",
    archive_failed: "Failed to archive the meeting. Please try again later.",
    markdown_mode: "Mode",
    markdown_final: "Final Summary",
    markdown_draft: "Draft Summary",
    markdown_language: "Language",
    markdown_updated_at: "Updated At",
    markdown_ai_summary: "AI Summary",
    markdown_decisions: "Decisions",
    markdown_actions: "Action Items",
    markdown_questions: "Open Questions",
    markdown_speaker_stats: "Participants And Speaker Share",
    markdown_none: "None",
    markdown_owner: "Owner",
    markdown_deadline: "Deadline",
    recognition_normal: "Recognition Normal",
    recognition_finished: "Recognition Finished",
    recognition_error: "Recognition Error",
    voiceprint_library_empty:
      "No available voiceprints were found for this meeting's participants. Transcription continues and unmatched speakers appear as unidentified.",
    voiceprint_library_loaded:
      "Loaded {count} available voiceprints for this meeting. Speaker identification is now enabled.",
    replay_policy_hint: "Replay mode is active and shows the archived transcript and summary snapshot.",
    archived_status: "Archived",
    duration_live: "Elapsed {duration}",
    duration_waiting: "Waiting to start",
    active_speaker_demo: "{name} (demo placeholder)",
    active_speaker_waiting: "Waiting for speech",
    vad_must_number: "VAD parameters must be numeric.",
    config_error: "Configuration Error",
  },
};

function mt(key, params = {}, language = getSystemLanguage()) {
  const template =
    MEETING_TEXTS[language]?.[key] ??
    MEETING_TEXTS.zh[key] ??
    key;
  return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
    return result.replaceAll(`{${paramKey}}`, String(paramValue));
  }, template);
}

function getSpeakerRoleLabel(role) {
  return getLocalizedParticipantRole(role, getSystemLanguage());
}

// #region debug-point A:runtime-reporter
function reportMicSystemDropDebug(hypothesisId, location, msg, data = {}) {
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "mic-system-drop",
      runId: "pre-fix",
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

initialize();

function validateLiveEntry() {
  if (isReplayMode || currentMeetingId) {
    return { ok: true };
  }
  const redirectUrl = new URL("./home.html", window.location.href);
  redirectUrl.searchParams.set("action", "create-meeting");
  return { ok: false, redirectUrl: redirectUrl.toString() };
}

function initialize() {
  const liveEntryValidation = validateLiveEntry();
  if (!liveEntryValidation.ok) {
    window.location.replace(liveEntryValidation.redirectUrl);
    return;
  }
  hydrateConfig();
  hydrateMeetingMeta();
  bindEvents();
  bindSystemLanguageSync();
  applyMeetingStaticTranslations();
  if (isReplayMode) {
    initializeReplayMode();
    return;
  }
  if (shouldRestorePersistedLiveSession()) {
    restorePersistedLiveSession();
  } else {
    restoreAssistantMessages(null);
    renderSpeakerLegend();
    renderEmptyState();
    renderSummaryState();
    renderFloatPlaceholder();
    setMeetingState("idle", t("meeting_waiting"));
    setConfigStatusByKey("config_status_waiting", "info");
    updateActiveSpeaker(null);
  }
  updatePolicySummary();
  updateMeetingSubTitle();
  updateMicLevel(0);
}

function bindSystemLanguageSync() {
  onSystemLanguageChange((language) => {
    if (refs.mainLanguage) {
      refs.mainLanguage.value = language;
    }
    if (!isReplayMode) {
      persistConfig();
    }
    applyMeetingStaticTranslations();
    if (!isReplayMode) {
      setMeetingState(meetingState, getDefaultMeetingStateLabel(meetingState));
    }
    updatePolicySummary();
    updateMeetingSubTitle();
    renderSummaryState();
    renderSpeakerLegend();
    updateActiveSpeaker(getLastReplaySpeaker());
    restoreAssistantMessages(
      { assistantMessages },
      isReplayMode ? mt("replay_no_chat_history") : ""
    );
  });
}

function bindEvents() {
  refs.startBtn?.addEventListener("click", startMeeting);
  refs.stopBtn?.addEventListener("click", stopMeeting);
  refs.btnSummaryRegenerate?.addEventListener("click", handleSummaryGenerateClick);
  refs.btnSummaryEdit?.addEventListener("click", enterSummaryEditing);
  refs.btnSummaryCancel?.addEventListener("click", cancelSummaryEditing);
  refs.btnSummarySave?.addEventListener("click", saveSummaryEditing);
  refs.btnSummaryExport?.addEventListener("click", exportSummaryMarkdown);

  [
    refs.apiKeyInput,
    refs.translatorModel,
    refs.mainLanguage,
    refs.meetingTargetLanguage,
    refs.silenceDuration,
    refs.minSpeechDuration,
  ].forEach((element) => {
    element?.addEventListener("input", handleConfigChange);
    element?.addEventListener("change", handleConfigChange);
  });

  refs.transcriptPanel?.addEventListener("scroll", handleTranscriptScroll);
  refs.jumpLatestBtn?.addEventListener("click", jumpToLatestMessage);
  refs.summaryContent?.addEventListener("click", handleSummaryContentClick);

  // AI 助手
  refs.assistantSend?.addEventListener("click", askAssistant);
  refs.assistantInput?.addEventListener("compositionstart", () => {
    assistantInputComposing = true;
  });
  refs.assistantInput?.addEventListener("compositionend", () => {
    assistantInputComposing = false;
  });
  refs.assistantInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (assistantInputComposing || event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      askAssistant();
    }
  });
  refs.assistantChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (isReplayMode) {
        return;
      }
      const prompt = chip.dataset.prompt || chip.textContent.trim();
      if (!prompt) return;
      refs.assistantInput.value = prompt;
      askAssistant();
    });
  });
  refs.assistantMessages?.addEventListener("click", handleAssistantCitationClick);

  // 悬浮字幕 PiP（顶栏「悬浮字幕」按钮 = 开/关 Document PiP）
  refs.btnFloat?.addEventListener("click", toggleSubtitlePip);

  window.addEventListener("beforeunload", handlePageCloseLifecycle);
  window.addEventListener("pagehide", handlePageCloseLifecycle);
}

function initializeReplayMode() {
  const validation = validateReplayAccess();
  if (!validation.ok) {
    window.alert(validation.message);
    window.location.replace("home.html");
    return;
  }

  configureReplayView();
  restoreReplayTranscript(currentMeetingRecord);
  restoreAssistantMessages(currentMeetingRecord, mt("replay_no_chat_history"));
  restoreReplaySummary(currentMeetingRecord);
  renderSpeakerLegend();
  renderFloatPlaceholder(mt("replay_float_placeholder"));
  updatePolicySummary();
  setMeetingState("finished", t("meeting_history_replay"));
  updateMeetingSubTitle();
  updateActiveSpeaker(getLastReplaySpeaker());
  updateMicLevel(0);
}

function validateReplayAccess() {
  const currentUser = getCurrentUser();
  if (!currentMeetingId) {
    return { ok: false, message: mt("replay_missing_id") };
  }

  if (!currentMeetingRecord) {
    return { ok: false, message: mt("replay_not_found") };
  }

  if (!currentUser?.id || currentMeetingRecord.ownerUserId !== currentUser.id) {
    return { ok: false, message: mt("replay_no_access") };
  }

  if (currentMeetingRecord.status !== MEETING_STATUSES.ARCHIVED) {
    return { ok: false, message: mt("replay_not_finished") };
  }

  return { ok: true };
}

function configureReplayView() {
  refs.startBtn.hidden = true;
  refs.stopBtn.hidden = true;
  refs.startBtn.disabled = true;
  refs.stopBtn.disabled = true;

  [
    refs.apiKeyInput,
    refs.translatorModel,
    refs.mainLanguage,
    refs.meetingTargetLanguage,
    refs.silenceDuration,
    refs.minSpeechDuration,
  ].forEach((element) => {
    if (element) {
      element.disabled = true;
    }
  });

  refs.transcriptModeText.textContent = t("meeting_history_replay");
  refs.recordingStatusText.textContent = t("meeting_history_replay");
  refs.transcriptStatus.textContent = t("meeting_history_replay");
  refs.recognitionStatus.textContent = t("meeting_readonly_replay");
  refs.configHint.textContent = mt("replay_hint");
  setConfigStatusByKey("replay_loaded", "info");
  refs.configSession.textContent = buildReplaySessionInfo();
  refs.timer.textContent = `⏱ ${formatDuration(currentMeetingRecord?.durationSeconds || 0)}`;

  if (refs.assistantInput) {
    refs.assistantInput.disabled = true;
    refs.assistantInput.placeholder = t("meeting_assistant_placeholder_replay");
  }
  if (refs.assistantSend) {
    refs.assistantSend.disabled = true;
  }
}

function buildReplaySessionInfo() {
  if (!currentMeetingRecord) {
    return "";
  }

  const startText = currentMeetingRecord.startedAt
    ? formatDateTime(currentMeetingRecord.startedAt, { hour12: false }, getSystemLanguage())
    : mt("not_recorded");
  const endText = currentMeetingRecord.endedAt
    ? formatDateTime(currentMeetingRecord.endedAt, { hour12: false }, getSystemLanguage())
    : mt("not_recorded");
  return mt("replay_session", {
    id: currentMeetingRecord.id,
    start: startText,
    end: endText,
  });
}

function restoreReplayTranscript(meeting) {
  resetSessionState();

  const transcriptSegments = Array.isArray(meeting?.transcriptSegments) ? meeting.transcriptSegments : [];
  if (!transcriptSegments.length) {
    renderEmptyState(mt("replay_no_transcript"));
    return;
  }

  transcriptSegments.forEach((segment, index) => {
    const record = hydrateReplaySegment(segment, index);
    segmentStore.set(record.localSegmentId, record);
    segmentOrder.push(record.localSegmentId);
  });

  lastPersistedSegmentCount = segmentOrder.length;
  renderLatestTranscriptWindow({ stickToBottom: true });
  isAutoFollowEnabled = true;
  pendingNewMessageCount = 0;
  syncJumpLatestButton();
}

function hydrateReplaySegment(segment, index) {
  const speaker = normalizeReplaySpeaker(segment?.speaker);
  return {
    localSegmentId: segment?.localSegmentId || `replay-${index + 1}`,
    runId: 0,
    serverSegmentId: segment?.serverSegmentId ?? index + 1,
    speaker,
    sourceLanguage: segment?.sourceLanguage || refs.mainLanguage?.value || "zh",
    translationPlan: segment?.translationPlan || null,
    contextTail: Array.isArray(segment?.contextTail) ? [...segment.contextTail] : [],
    text: segment?.text || "",
    timestampEnd: segment?.timestampEnd || null,
    translation: segment?.translation || "",
    translationStatus: segment?.translationStatus || (segment?.translation ? "success" : "none"),
    translatorModel: segment?.translatorModel || "",
    glossaryMatches: Array.isArray(segment?.glossaryMatches) ? [...segment.glossaryMatches] : [],
    glossaryTerms: Array.isArray(segment?.glossaryTerms) ? [...segment.glossaryTerms] : [],
    glossaryApplied: Boolean(segment?.glossaryApplied),
    bubbleElement: null,
    translationElement: null,
  };
}

function normalizeReplaySpeaker(speaker) {
  if (!speaker?.name) {
    return getSpeakerPool()[0];
  }

  const matched = getDemoParticipantByName(speaker.name);
  return {
    ...(matched || {}),
    ...speaker,
    avatar: speaker.avatar || matched?.avatar || speaker.name.trim().slice(0, 1) || "未",
    color: speaker.color || matched?.color || "var(--text-tertiary)",
    role: speaker.role || matched?.role || "",
  };
}

function restoreReplaySummary(meeting) {
  if (meeting?.summary) {
    summaryState = {
      status: "ready",
      mode: "final",
      data: meeting.summary,
      editDraft: null,
      errorMessage: "",
      lastUpdatedAt: currentMeetingEndedAt || Date.now(),
      lastModel: mt("archived_snapshot"),
    };
  } else {
    summaryState = {
      status: "empty",
      mode: "final",
      data: null,
      editDraft: null,
      errorMessage: "",
      lastUpdatedAt: currentMeetingEndedAt || Date.now(),
      lastModel: "",
    };
  }

  renderSummaryState();
}

function restoreAssistantMessages(meeting, emptyMessage = "") {
  assistantMessages = Array.isArray(meeting?.assistantMessages)
    ? meeting.assistantMessages.map(normalizeAssistantMessage).filter(Boolean)
    : [];

  if (!refs.assistantMessages) {
    return;
  }

  refs.assistantMessages.innerHTML = "";
  if (!assistantMessages.length) {
    renderAssistantWelcomeMessage(emptyMessage);
    return;
  }

  assistantMessages.forEach((message) => {
    renderAssistantMessage(message);
  });
}

function getLastReplaySpeaker() {
  const lastSegment = segmentOrder.length ? segmentStore.get(segmentOrder[segmentOrder.length - 1]) : null;
  return lastSegment?.speaker || null;
}

function shouldRestorePersistedLiveSession() {
  if (currentMeetingMode !== "live" || !currentMeetingRecord) {
    return false;
  }

  return [
    MEETING_STATUSES.LIVE,
    MEETING_STATUSES.LIVE_DEGRADED,
    MEETING_STATUSES.RECOVERABLE,
    MEETING_STATUSES.ARCHIVABLE,
    MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY,
  ].includes(currentMeetingRecord.status);
}

function restorePersistedLiveSession() {
  restoreReplayTranscript(currentMeetingRecord);

  if (!segmentOrder.length) {
    renderEmptyState();
    renderFloatPlaceholder();
  } else {
    renderFloatSegments();
  }

  const shouldSelfHealArchivable =
    Boolean(currentMeetingRecord?.summary) &&
    ![
      MEETING_STATUSES.ARCHIVABLE,
      MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY,
      MEETING_STATUSES.ARCHIVED,
    ].includes(currentMeetingRecord?.status);

  if (shouldSelfHealArchivable) {
    persistSummarySnapshot(
      currentMeetingRecord.summary,
      buildFinishedMeetingPayload(MEETING_STATUSES.ARCHIVABLE, { summaryStatus: "ready" })
    );
  }

  if (currentMeetingRecord?.summary) {
    summaryState = {
      status: "ready",
      mode: "final",
      data: currentMeetingRecord.summary,
      editDraft: null,
      errorMessage: "",
      lastUpdatedAt: currentMeetingEndedAt || Date.now(),
      lastModel: mt("archived_snapshot"),
    };
  } else {
    summaryState = {
      ...createInitialSummaryState(),
      mode:
        currentMeetingRecord.status === MEETING_STATUSES.ARCHIVABLE ||
        currentMeetingRecord.status === MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY
          ? "final"
          : getCurrentSummaryMode(),
    };
  }

  restoreAssistantMessages(currentMeetingRecord);
  renderSpeakerLegend();
  renderSummaryState();
  updateActiveSpeaker(getLastReplaySpeaker());

  if (
    currentMeetingRecord.status === MEETING_STATUSES.ARCHIVABLE ||
    currentMeetingRecord.status === MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY ||
    shouldSelfHealArchivable
  ) {
    setMeetingState("finished", mt("finished"));
    switchMeetingTab("summary");
    setConfigStatus(
      currentMeetingRecord.status === MEETING_STATUSES.ARCHIVABLE || shouldSelfHealArchivable
        ? mt("archive_ready")
        : mt("archive_ready_no_summary"),
      "info"
    );
    return;
  }

  setMeetingState("error", mt("recognition_error"));
  refs.stopBtn.disabled = !canStopCurrentMeeting();
  switchMeetingTab("transcript");
  setConfigStatus(mt("meeting_recoverable_notice"), "info");
}

function deriveMeetingStatusForPageClose() {
  if (isArchivingMeeting || isReplayMode || currentMeetingMode !== "live" || !currentMeetingId) {
    return null;
  }

  if (currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVED) {
    return null;
  }

  if (
    currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE ||
    currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY
  ) {
    return currentMeetingRecord.status;
  }

  if (meetingState === "finished") {
    if (summaryState.status === "ready" && summaryState.mode === "final" && summaryState.data) {
      return MEETING_STATUSES.ARCHIVABLE;
    }
    return MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY;
  }

  if (meetingState === "connecting" || meetingState === "transcribing" || meetingState === "error") {
    return hasRecoverableMeetingEvidence() ? MEETING_STATUSES.RECOVERABLE : null;
  }

  if (currentMeetingRecord?.status === MEETING_STATUSES.RECOVERABLE && hasRecoverableMeetingEvidence()) {
    return MEETING_STATUSES.RECOVERABLE;
  }

  return null;
}

function hasRecoverableMeetingEvidence() {
  return Boolean(
    channels.length ||
      segmentOrder.length ||
      meetingStartedAt ||
      currentMeetingRecord?.status === MEETING_STATUSES.LIVE ||
      currentMeetingRecord?.status === MEETING_STATUSES.LIVE_DEGRADED ||
      currentMeetingRecord?.status === MEETING_STATUSES.RECOVERABLE
  );
}

function handlePageCloseLifecycle() {
  if (hasHandledPageClose) {
    return;
  }

  hasHandledPageClose = true;
  if (segmentOrder.length) {
    persistTranscriptSnapshot({}, { immediate: true });
  }
  const closingStatus = deriveMeetingStatusForPageClose();
  if (closingStatus) {
    persistMeetingMetadata({ status: closingStatus });
  }
  safeCleanup(false);
}

function isLivePersistenceEnabled() {
  return currentMeetingMode === "live" && Boolean(currentMeetingId);
}

function ensurePersistableMeetingRecord() {
  if (!isLivePersistenceEnabled()) {
    return false;
  }

  const meeting = getMeetingById(currentMeetingId);
  if (meeting) {
    return true;
  }

  if (!hasLoggedMeetingPersistenceWarning) {
    hasLoggedMeetingPersistenceWarning = true;
    console.warn(mt("persist_warn_missing_record", { id: currentMeetingId }));
  }
  return false;
}

function getMeetingBasePayload() {
  const payload = {
    title: currentMeetingTitle,
    mainLanguage: refs.mainLanguage?.value || "zh",
    meetingTargetLanguage: refs.meetingTargetLanguage?.value || "en",
    participants: activeMeetingParticipants,
    status: getMeetingPersistenceStatus(),
    lastVisitedAt: new Date().toISOString(),
  };

  if (meetingStartedAt) {
    payload.startedAt = new Date(meetingStartedAt).toISOString();
  }

  return payload;
}

function hydrateMeetingMeta() {
  if (!currentMeetingId) {
    return;
  }

  const meeting = getMeetingById(currentMeetingId);
  if (!meeting) {
    return;
  }

  currentMeetingRecord = meeting;
  currentMeetingTitle = meeting.title || SUMMARY_TITLE_BASE;
  activeMeetingParticipants = normalizeMeetingParticipants(meeting.participants);
  meetingStartedAt = meeting.startedAt ? new Date(meeting.startedAt).getTime() : null;
  currentMeetingEndedAt = meeting.endedAt ? new Date(meeting.endedAt).getTime() : null;

  if (refs.meetingTitleMain) {
    refs.meetingTitleMain.textContent = currentMeetingTitle;
  }

  if (refs.mainLanguage && meeting.mainLanguage) {
    refs.mainLanguage.value = meeting.mainLanguage;
  }

  if (refs.meetingTargetLanguage && meeting.meetingTargetLanguage) {
    refs.meetingTargetLanguage.value = meeting.meetingTargetLanguage;
  }
}

function normalizeMeetingParticipants(participants) {
  const normalized = Array.isArray(participants)
    ? participants
        .map((participant) => {
          if (!participant) {
            return null;
          }
          if (typeof participant === "string") {
            return getDemoParticipantByName(participant) || {
              name: participant,
              role: "",
              avatar: participant.trim().slice(0, 1) || "未",
              color: "var(--text-tertiary)",
            };
          }
          if (participant.name) {
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
        })
        .filter(Boolean)
    : [];

  return normalized.length ? normalized : DEMO_MEETING_PARTICIPANTS.slice(0, 4);
}

function getSpeakerPool() {
  return activeMeetingParticipants.length ? activeMeetingParticipants : DEMO_MEETING_PARTICIPANTS.slice(0, 4);
}

function renderSpeakerLegend() {
  if (!refs.speakerLegend) {
    return;
  }

  refs.speakerLegend.innerHTML = getSpeakerPool()
    .map(
      (speaker) =>
        `<div class="legend-item"><div class="legend-dot" style="background:${speaker.color}"></div>${escapeHtml(
          speaker.name
        )} · ${escapeHtml(getSpeakerRoleLabel(speaker.role) || mt("speaker_default_role"))}</div>`
    )
    .join("");
}

function getMeetingPersistenceStatus() {
  if (currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVED) {
    return MEETING_STATUSES.ARCHIVED;
  }

  if (meetingState === "transcribing" || meetingState === "connecting") {
    return MEETING_STATUSES.LIVE;
  }

  if (meetingState === "finished") {
    if (summaryState.status === "ready" && summaryState.mode === "final" && summaryState.data) {
      return MEETING_STATUSES.ARCHIVABLE;
    }
    if (summaryState.status === "error" && summaryState.mode === "final") {
      return MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY;
    }
    return MEETING_STATUSES.SUMMARIZING;
  }

  return currentMeetingRecord?.status || MEETING_STATUSES.DRAFT;
}

function buildFinishedMeetingPayload(status, extraPayload = {}) {
  const endedAt =
    extraPayload.endedAt ||
    currentMeetingRecord?.endedAt ||
    (currentMeetingEndedAt ? new Date(currentMeetingEndedAt).toISOString() : new Date().toISOString());
  const endedAtMs = new Date(endedAt).getTime();
  const baseTime = meetingStartedAt || endedAtMs;
  const computedDurationSeconds = Math.max(0, Math.floor((endedAtMs - baseTime) / 1000));

  currentMeetingEndedAt = endedAtMs;
  return {
    status,
    endedAt,
    durationSeconds:
      extraPayload.durationSeconds ??
      (Number.isFinite(currentMeetingRecord?.durationSeconds) && currentMeetingRecord.durationSeconds > 0
        ? currentMeetingRecord.durationSeconds
        : computedDurationSeconds),
    ...extraPayload,
  };
}

function serializeSegmentRecord(record) {
  if (!record) {
    return null;
  }

  return {
    localSegmentId: record.localSegmentId,
    runId: record.runId,
    serverSegmentId: record.serverSegmentId,
    speaker: record.speaker ? { ...record.speaker } : null,
    sourceLanguage: record.sourceLanguage,
    translationPlan: record.translationPlan ? { ...record.translationPlan } : null,
    contextTail: Array.isArray(record.contextTail) ? [...record.contextTail] : [],
    text: record.text || "",
    timestampEnd: record.timestampEnd || null,
    translation: record.translation || "",
    translationStatus: record.translationStatus || "none",
    translatorModel: record.translatorModel || "",
    glossaryMatches: Array.isArray(record.glossaryMatches) ? [...record.glossaryMatches] : [],
    glossaryTerms: Array.isArray(record.glossaryTerms) ? [...record.glossaryTerms] : [],
    glossaryApplied: Boolean(record.glossaryApplied),
  };
}

function getPersistableSegmentsSnapshot() {
  return segmentOrder
    .map((segmentId) => serializeSegmentRecord(segmentStore.get(segmentId)))
    .filter(Boolean);
}

function persistMeetingMetadata(extraPayload = {}) {
  if (!ensurePersistableMeetingRecord()) {
    return;
  }

  try {
    currentMeetingRecord = updateMeetingSnapshot(currentMeetingId, {
      ...getMeetingBasePayload(),
      ...extraPayload,
    });
  } catch (error) {
    console.warn(mt("persist_metadata_failed"), error);
  }
}

function clearPendingTranscriptPersistTimer() {
  if (pendingTranscriptPersistTimerId) {
    window.clearTimeout(pendingTranscriptPersistTimerId);
    pendingTranscriptPersistTimerId = null;
  }
}

function flushTranscriptSnapshot(extraPayload = {}) {
  if (!ensurePersistableMeetingRecord()) {
    return;
  }

  clearPendingTranscriptPersistTimer();
  const mergedPayload = {
    ...(pendingTranscriptPersistPayload || {}),
    ...extraPayload,
  };
  pendingTranscriptPersistPayload = null;

  try {
    currentMeetingRecord = saveMeetingSegments(currentMeetingId, getPersistableSegmentsSnapshot(), {
      ...getMeetingBasePayload(),
      ...mergedPayload,
    });
    lastPersistedSegmentCount = segmentOrder.length;
  } catch (error) {
    console.warn(mt("persist_transcript_failed"), error);
  }
}

function persistTranscriptSnapshot(extraPayload = {}, options = {}) {
  if (!ensurePersistableMeetingRecord()) {
    return;
  }

  pendingTranscriptPersistPayload = {
    ...(pendingTranscriptPersistPayload || {}),
    ...extraPayload,
  };

  const shouldFlushImmediately =
    options.immediate === true ||
    segmentOrder.length - lastPersistedSegmentCount >= TRANSCRIPT_PERSIST_SEGMENT_BATCH;

  if (shouldFlushImmediately) {
    flushTranscriptSnapshot();
    return;
  }

  if (pendingTranscriptPersistTimerId) {
    return;
  }

  pendingTranscriptPersistTimerId = window.setTimeout(() => {
    flushTranscriptSnapshot();
  }, TRANSCRIPT_PERSIST_THROTTLE_MS);
}

function persistSummarySnapshot(summary, extraPayload = {}) {
  if (!ensurePersistableMeetingRecord()) {
    return;
  }

  try {
    currentMeetingRecord = saveMeetingSummary(currentMeetingId, summary, {
      ...getMeetingBasePayload(),
      ...extraPayload,
    });
  } catch (error) {
    console.warn(mt("persist_summary_failed"), error);
  }
}

function persistAssistantSnapshot(extraPayload = {}) {
  if (!ensurePersistableMeetingRecord()) {
    return;
  }

  try {
    currentMeetingRecord = saveMeetingAssistantMessages(currentMeetingId, assistantMessages, {
      ...getMeetingBasePayload(),
      ...extraPayload,
    });
  } catch (error) {
    console.warn(mt("persist_assistant_failed"), error);
  }
}

function handleConfigChange() {
  if (isReplayMode) {
    return;
  }
  persistConfig();
  updatePolicySummary();
  updateMeetingSubTitle();
  updateSummaryHeader();
}

async function startMeeting() {
  if (isReplayMode) {
    return;
  }
  if (meetingState === "connecting" || meetingState === "transcribing") {
    return;
  }

  const apiKey = refs.apiKeyInput?.value.trim() || "";
  if (!apiKey) {
    setConfigStatus(mt("missing_api_key"), "error");
    setMeetingState("error", mt("missing_key_badge"));
    return;
  }

  const vadSetting = getVadSetting();
  if (!vadSetting) {
    return;
  }

  const isResumeStart = shouldResumeRecoveredMeeting();
  persistConfig();
  if (isResumeStart) {
    prepareResumeAppendState();
    if (!segmentOrder.length) {
      renderEmptyState(mt("live_wait_first_segment"));
      renderFloatPlaceholder(mt("live_float_placeholder"));
    } else {
      renderFloatSegments();
    }
    renderSummaryState();
  } else {
    resetSessionState();
    resetSummaryState();
    renderEmptyState(mt("live_wait_first_segment"));
    renderFloatPlaceholder(mt("live_float_placeholder"));
  }
  refs.configSession.textContent = "";

  refs.startBtn.disabled = true;
  refs.stopBtn.disabled = false;
  setConfigStatus(mt("ws_connecting"), "info");
  setMeetingState("connecting", t("meeting_connecting"));
  // #region debug-point A:start-meeting
  reportMicSystemDropDebug("A", "meeting-page-app.js:startMeeting", "startMeeting entered", {
    meetingState,
    vadSetting,
    mainLanguage: refs.mainLanguage?.value || "",
    targetLanguage: refs.meetingTargetLanguage?.value || "",
    silenceDuration: refs.silenceDuration?.value || "",
    minSpeechDuration: refs.minSpeechDuration?.value || "",
  });
  // #endregion

  channels = [];
  prepareVoiceprint();
  warmTranslationPipeline();

  try {
    const micChannel = createChannel("mic");
    channels.push(micChannel);
    await startChannel(micChannel, {
      apiKey,
      vadSetting,
      stream: null,
      onLevel: updateMicLevel,
    });

    // mic 建链成功后再申请屏幕共享，避免 mic 失败时白申请一股流泄漏。
    let systemStream = null;
    try {
      systemStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      systemStream = null;
    }
    // #region debug-point C:system-media
    reportMicSystemDropDebug("C", "meeting-page-app.js:startMeeting:getDisplayMedia", "system media request finished", {
      granted: Boolean(systemStream),
      audioTracks: systemStream?.getAudioTracks?.().length ?? 0,
      videoTracks: systemStream?.getVideoTracks?.().length ?? 0,
    });
    // #endregion

    const systemAudioTracks = systemStream?.getAudioTracks?.() ?? [];
    if (systemStream && systemAudioTracks.length === 0) {
      systemStream.getTracks().forEach((t) => t.stop());
      systemStream = null;
    }

    if (systemStream) {
      const systemAudioStream = new MediaStream(systemAudioTracks);
      const systemChannel = createChannel("system");
      const videoTrack = systemStream.getVideoTracks()[0] ?? null;
      systemChannel.systemStream = systemStream;
      try {
        await startChannel(systemChannel, {
          apiKey,
          vadSetting,
          stream: systemAudioStream,
          onLevel: null,
        });
        channels.push(systemChannel);
        if (videoTrack) {
          videoTrack.addEventListener("ended", () => handleChannelLost(systemChannel));
        }
        setConfigStatusByKey("system_audio_connected", "success");
      } catch (e) {
        stopChannel(systemChannel);
        setConfigStatusByKey("system_audio_failed", "info");
      }
    } else {
      setConfigStatusByKey("system_audio_missing", "info");
    }

    if (!isResumeStart || !meetingStartedAt) {
      meetingStartedAt = Date.now();
    }
    startTimer();
    setMeetingState("transcribing", mt("transcribing"));
    persistMeetingMetadata();
  } catch (error) {
    handleError(error);
    await safeCleanup(true);
  }
}

function handleChannelLost(channel) {
  if (!channel || channel.connectionLostHandled) {
    return;
  }
  channel.connectionLostHandled = true;
  // #region debug-point B:channel-lost
  reportMicSystemDropDebug("B", "meeting-page-app.js:handleChannelLost", "channel lost", {
    source: channel.source,
    meetingState,
    channelsCount: channels.length,
    segmentCount,
    summaryStatus: summaryState.status,
  });
  // #endregion

  // 系统声路掉线只收该路，麦克风路继续转写，会议不中断。
  if (channel.source === "system") {
    stopChannel(channel);
    channels = channels.filter((c) => c !== channel);
    setConfigStatusByKey("system_audio_disconnected", "info");
    return;
  }

  // 麦克风路掉线视为整场断连，走原降级收尾。
  setMeetingState("error", mt("connection_lost_badge"));
  setConfigStatusByKey("connection_lost_status", "error");
  persistMeetingMetadata({ status: MEETING_STATUSES.RECOVERABLE });

  safeCleanup(true).then(() => {
    if (segmentOrder.length && summaryState.status !== "loading") {
      generateSummary({ mode: "final", trigger: "auto" });
    }
  });
  refs.stopBtn.disabled = !canStopCurrentMeeting();
}

// 停一路：采集 + WebSocket + 占用的系统流轨道。同步收尾，调用方负责从 channels 移除。
function stopChannel(channel) {
  if (!channel) return;
  try {
    channel.capture?.stop();
  } catch {}
  try {
    channel.client?.close();
  } catch {}
  try {
    channel.systemStream?.getTracks().forEach((t) => t.stop());
  } catch {}
  channel.capture = null;
  channel.client = null;
  channel.systemStream = null;
}

async function stopMeeting() {
  if (isReplayMode) {
    return;
  }
  if (!canStopCurrentMeeting()) {
    return;
  }

  refs.stopBtn.disabled = true;
  setConfigStatus(mt("meeting_finished_waiting"), "info");

  try {
    for (const channel of channels) {
      try {
        await channel.capture?.stop();
        channel.capture = null;
      } catch {}
    }

    updateMicLevel(0);

    for (const channel of channels) {
      try {
        await channel.client?.finishTask();
      } catch {}
    }

    currentMeetingEndedAt = Date.now();
    persistTranscriptSnapshot(buildFinishedMeetingPayload(MEETING_STATUSES.SUMMARIZING), { immediate: true });
    setMeetingState("finished", mt("finished"));
    switchMeetingTab("summary");
    persistMeetingMetadata(buildFinishedMeetingPayload(MEETING_STATUSES.SUMMARIZING));
    setConfigStatus(mt("meeting_finished_kept"), "success");
  } catch (error) {
    handleError(error);
  } finally {
    await safeCleanup(true);
    if (summaryState.status === "loading") {
      return;
    }
    if (!segmentOrder.length) {
      markMeetingArchivableWithoutSummary(mt("summary_no_content"));
      return;
    }
    await generateSummary({ mode: "final", trigger: "auto" });
  }
}

function resetSessionState() {
  clearPendingTranscriptPersistTimer();
  pendingTranscriptPersistPayload = null;
  meetingRunId += 1;
  segmentCount = 0;
  segmentOrder = [];
  segmentStore = new Map();
  lastPersistedSegmentCount = 0;
  transcriptWindowStartIndex = 0;
  transcriptWindowEndIndex = 0;
  isAutoFollowEnabled = true;
  pendingNewMessageCount = 0;
  syncJumpLatestButton();
}

function shouldResumeRecoveredMeeting() {
  if (isReplayMode || currentMeetingMode !== "live" || !currentMeetingId) {
    return false;
  }

  return (
    meetingState === "error" &&
    [
      MEETING_STATUSES.LIVE,
      MEETING_STATUSES.LIVE_DEGRADED,
      MEETING_STATUSES.RECOVERABLE,
    ].includes(currentMeetingRecord?.status)
  );
}

function prepareResumeAppendState() {
  meetingRunId += 1;
  segmentCount = segmentOrder.length;
  isAutoFollowEnabled = true;
  pendingNewMessageCount = 0;
  syncJumpLatestButton();
}

function handleClientStatus(status, channel) {
  const isMic = !channel || channel.source === "mic";
  // #region debug-point E:client-status
  reportMicSystemDropDebug("E", "meeting-page-app.js:handleClientStatus", "client status", {
    status,
    source: channel?.source || "mic",
    isMic,
    meetingState,
    channelsCount: channels.length,
  });
  // #endregion

  if (status === "error") {
    if (channel && (meetingState === "transcribing" || meetingState === "connecting")) {
      handleChannelLost(channel);
      return;
    }
    if (isMic) setMeetingState("error", mt("recognition_failed_status"));
    return;
  }

  // 仅麦克风路驱动整场会议状态，避免系统声路的 connected/finished 覆盖全局 UI。
  if (!isMic) {
    return;
  }

  if (status === "connected") {
    setMeetingState("connecting", mt("connection_success"));
    updateSessionInfo();
    return;
  }

  if (status === "transcribing") {
    setMeetingState("transcribing", mt("transcribing"));
    updateSessionInfo();
    return;
  }

  if (status === "finished") {
    setMeetingState("finished", mt("finished"));
    updateSessionInfo();
    return;
  }

  if (status === "error") {
    setMeetingState("error", mt("recognition_failed_badge"));
  }
}

function handleResult(result, channel) {
  const normalizedText = normalizeSegmentText(result.text);
  if (!normalizedText) {
    return;
  }
  // #region debug-point D:first-results
  reportMicSystemDropDebug("D", "meeting-page-app.js:handleResult", "result received", {
    source: channel?.source || "mic",
    textLength: normalizedText.length,
    nextSegmentCount: segmentCount + 1,
    meetingState,
    timestampEnd: result.timestampEnd ?? null,
  });
  // #endregion

  segmentCount += 1;

  const record = createSegmentRecord({
    ...result,
    text: normalizedText,
    source: channel?.source ?? "mic",
  });
  segmentStore.set(record.localSegmentId, record);
  segmentOrder.push(record.localSegmentId);
  appendBubble(record);
  persistTranscriptSnapshot();

  if (vpLibrary.length > 0) {
    identifySpeakerForRecord(record, result, channel);
  }

  renderFloatSegments();
  updateActiveSpeaker(record.speaker);
  setConfigStatus(
    mt("segment_received", {
      count: segmentCount,
      route: record.translationPlan.routeDescription,
    }),
    "success"
  );

  if (record.translationPlan.shouldTranslate) {
    requestTranslation(record);
  }
}

function createSegmentRecord(result) {
  const serverSegmentId = result.segmentId ?? segmentCount;
  const localSegmentId = `${meetingRunId}-${serverSegmentId}-${segmentCount}`;
  const speaker = vpLibrary.length > 0 ? makePendingSpeaker() : makeUnknownSpeaker();
  const sourceLanguage = detectLanguage(result.text);
  const translationPlan = createTranslationPlan({
    sourceLanguage,
    mainLanguage: refs.mainLanguage?.value || "zh",
    meetingTargetLanguage: refs.meetingTargetLanguage?.value || "en",
  });

  const contextTail = segmentOrder
    .slice(-2)
    .map((segmentId) => segmentStore.get(segmentId)?.text)
    .filter(Boolean);

  return {
    localSegmentId,
    runId: meetingRunId,
    serverSegmentId,
    source: result.source ?? "mic",
    speaker,
    sourceLanguage,
    translationPlan,
    contextTail,
    text: result.text,
    timestampEnd: result.timestampEnd,
    translation: "",
    translationStatus: translationPlan.shouldTranslate ? "pending" : "none",
    translatorModel: refs.translatorModel?.value || "senseaudio-s2-lite",
    glossaryMatches: [],
    glossaryTerms: [],
    glossaryApplied: false,
    bubbleElement: null,
    translationElement: null,
  };
}

// 开会瞬间发一个极小翻译请求，预热 TLS 连接与后端模型，降低第一句的冷启动时延。
// fire-and-forget：预热失败不影响会议，静默忽略。
function warmTranslationPipeline() {
  const apiKey = refs.apiKeyInput?.value.trim() || "";
  if (!apiKey) return;
  const model = refs.translatorModel?.value || "senseaudio-s2-lite";
  translateSegment({
    apiKey,
    model,
    sourceLanguage: "en",
    targetLanguage: "zh",
    text: ".",
    contextTail: [],
  }).catch(() => {});
}

async function requestTranslation(record) {
  const apiKey = refs.apiKeyInput?.value.trim() || "";
  const recordKey = record.localSegmentId;
  const glossaryPayload = matchGlossaryForSegment({
    actor: getCurrentUser(),
    text: record.text,
    sourceLanguage: record.sourceLanguage,
    targetLanguage: record.translationPlan.desiredTargetLanguage,
  });

  record.glossaryMatches = glossaryPayload.matches;
  record.glossaryTerms = glossaryPayload.glossaryTerms;
  record.glossaryApplied = glossaryPayload.hasGlossary;

  const pendingRecord = segmentStore.get(recordKey);
  if (pendingRecord) {
    pendingRecord.glossaryMatches = glossaryPayload.matches;
    pendingRecord.glossaryTerms = glossaryPayload.glossaryTerms;
    pendingRecord.glossaryApplied = glossaryPayload.hasGlossary;
  }

  try {
    const response = await translateSegment({
      apiKey,
      model: record.translatorModel,
      sourceLanguage: record.sourceLanguage,
      targetLanguage: record.translationPlan.desiredTargetLanguage,
      contextTail: record.contextTail,
      text: record.text,
      glossaryTerms: glossaryPayload.glossaryTerms,
      onDelta: (partial) => {
        const live = segmentStore.get(recordKey);
        if (!live || live.runId !== record.runId) return;
        live.translation = partial;
        updateBubbleTranslation(recordKey, partial, "streaming");
      },
    });

    const liveRecord = segmentStore.get(recordKey);
    if (!liveRecord || liveRecord.runId !== record.runId) {
      return;
    }

    liveRecord.translation = response.translatedText;
    liveRecord.translationStatus = "success";
    liveRecord.glossaryMatches = glossaryPayload.matches;
    liveRecord.glossaryTerms = glossaryPayload.glossaryTerms;
    liveRecord.glossaryApplied = Boolean(response.glossaryApplied);
    updateBubbleTranslation(recordKey, response.translatedText, "success");
    if (glossaryPayload.matches.length) {
      recordMatchedTermHits(glossaryPayload.matches);
    }
    persistTranscriptSnapshot();
    renderFloatSegments();
    maybeAutoFollow(refs.transcriptPanel);
    setConfigStatus(
      response.glossaryApplied
        ? mt("translation_status_with_glossary", {
            model: response.model,
            latency: Math.round(response.latencyMs),
            count: response.glossaryTermCount,
          })
        : mt("translation_status_plain", {
            model: response.model,
            latency: Math.round(response.latencyMs),
          }),
      "success"
    );
  } catch (error) {
    const liveRecord = segmentStore.get(recordKey);
    if (!liveRecord || liveRecord.runId !== record.runId) {
      return;
    }

    liveRecord.translationStatus = "error";
    liveRecord.glossaryMatches = glossaryPayload.matches;
    liveRecord.glossaryTerms = glossaryPayload.glossaryTerms;
    liveRecord.glossaryApplied = glossaryPayload.hasGlossary;
    updateBubbleTranslation(recordKey, mt("translation_failed_short"), "error");
    persistTranscriptSnapshot();
    renderFloatSegments();
    maybeAutoFollow(refs.transcriptPanel);
    setConfigStatus(error?.message || mt("translation_failed_status"), "error");
  }
}

function handleError(error) {
  const message = error?.message || mt("meeting_recognition_failed");
  // #region debug-point D:handle-error
  fetch("http://127.0.0.1:7777/event",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:"meeting-streaming-fail",runId:"pre-fix",hypothesisId:"D",location:"meeting-page-app.js:handleError",msg:"[DEBUG] handleError triggered",data:{meetingState,message,errorName:error?.name||"",stackTop:String(error?.stack||"").split("\n").slice(0,2).join(" | ")},ts:Date.now()})}).catch(()=>{});
  // #endregion
  setMeetingState("error", mt("recognition_error"));
  setConfigStatus(message, "error");
  refs.startBtn.disabled = false;
  refs.stopBtn.disabled = !canStopCurrentMeeting();
}

function canStopCurrentMeeting() {
  if (isReplayMode || !currentMeetingId) {
    return false;
  }

  if (meetingState === "connecting" || meetingState === "transcribing") {
    return true;
  }

  if (meetingState === "error") {
    return Boolean(
      channels.length ||
        segmentOrder.length ||
        meetingStartedAt ||
        currentMeetingRecord?.status === MEETING_STATUSES.LIVE ||
        currentMeetingRecord?.status === MEETING_STATUSES.LIVE_DEGRADED ||
        currentMeetingRecord?.status === MEETING_STATUSES.RECOVERABLE ||
        currentMeetingRecord?.status === MEETING_STATUSES.SUMMARIZING ||
        currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE ||
        currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY
    );
  }

  return false;
}

function appendBubble() {
  clearEmptyStateIfNeeded();
  if (isAutoFollowEnabled || transcriptWindowEndIndex === 0) {
    renderLatestTranscriptWindow({ stickToBottom: true });
    return;
  }

  pendingNewMessageCount += 1;
  animateJumpLatestCount();
  syncJumpLatestButton();
}

function updateBubbleTranslation(segmentKey, translationText, status) {
  const record = segmentStore.get(segmentKey);
  if (!record) {
    return;
  }

  let translationElement = record.translationElement;
  if (!translationElement) {
    const bubbleBody = record.bubbleElement?.querySelector(".bubble-body");
    if (!bubbleBody) {
      return;
    }
    translationElement = document.createElement("div");
    translationElement.className = "bubble-translation";
    bubbleBody.appendChild(translationElement);
    record.translationElement = translationElement;
  }

  translationElement.classList.remove("pending", "error", "streaming");
  if (status === "error") {
    translationElement.classList.add("error");
  } else if (status === "streaming") {
    translationElement.classList.add("streaming");
  }

  translationElement.textContent = translationText;
}

function renderEmptyState(message) {
  releaseRenderedBubbleReferences();
  transcriptWindowStartIndex = 0;
  transcriptWindowEndIndex = 0;
  refs.bubbles.innerHTML = `
    <div class="transcript-empty">
      <div class="transcript-empty-title">${mt("transcript_empty_title")}</div>
      <div class="transcript-empty-text">${
        escapeHtml(
          message || mt("transcript_empty_text")
        )
      }</div>
    </div>
  `;
}

function clearEmptyStateIfNeeded() {
  if (refs.bubbles.querySelector(".transcript-empty")) {
    refs.bubbles.innerHTML = "";
  }
}

function getTranscriptScrollContainer() {
  return refs.transcriptPanel || refs.bubbles.closest(".tab-content") || refs.bubbles.parentElement;
}

function shouldRenderBubbleTranslation(record) {
  return Boolean(
    record?.translationPlan?.shouldTranslate ||
      record?.translation ||
      (record?.translationStatus && record.translationStatus !== "none")
  );
}

function getBubbleTranslationPresentation(record) {
  if (!shouldRenderBubbleTranslation(record)) {
    return null;
  }

  const pendingText =
    record.translation ||
    mt("translation_pending", {
      language: getLanguageLabel(record.translationPlan?.desiredTargetLanguage || refs.meetingTargetLanguage?.value || "en"),
    });

  if (record.translationStatus === "success" && record.translation) {
    return { text: record.translation, className: "" };
  }

  if (record.translationStatus === "error") {
    return {
      text: record.translation || mt("translation_failed_short"),
      className: "error",
    };
  }

  if (record.translationStatus === "streaming") {
    return { text: pendingText, className: "streaming" };
  }

  return { text: pendingText, className: "pending" };
}

function createBubbleElement(record) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${record.speaker.key} source-${record.source ?? "mic"}`;
  bubble.dataset.segmentId = record.localSegmentId;
  bubble.dataset.source = record.source ?? "mic";

  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  avatar.textContent = record.speaker.avatar;
  if (record.speaker.color) {
    avatar.style.background = record.speaker.color;
  }

  const body = document.createElement("div");
  body.className = "bubble-body";

  const head = document.createElement("div");
  head.className = "bubble-head";
  const sourceBadge =
    record.source === "system"
      ? `<span class="bubble-source bubble-source-system">🔊 系统声</span>`
      : "";
  head.innerHTML = `
    <span class="bubble-name">${escapeHtml(record.speaker.name)}</span>
    <span class="bubble-role">${escapeHtml(getSpeakerRoleLabel(record.speaker.role))}</span>
    ${sourceBadge}
    <span class="bubble-time">${formatTime(record.timestampEnd)}</span>
  `;

  const text = document.createElement("div");
  text.className = "bubble-text";
  text.textContent = record.text;

  body.appendChild(head);
  body.appendChild(text);

  const translationPresentation = getBubbleTranslationPresentation(record);
  if (translationPresentation) {
    const translation = document.createElement("div");
    translation.className = "bubble-translation";
    if (translationPresentation.className) {
      translation.classList.add(translationPresentation.className);
    }
    translation.textContent = translationPresentation.text;
    body.appendChild(translation);
    record.translationElement = translation;
  } else {
    record.translationElement = null;
  }

  bubble.appendChild(avatar);
  bubble.appendChild(body);
  record.bubbleElement = bubble;
  return bubble;
}

function releaseRenderedBubbleReferences() {
  for (let index = transcriptWindowStartIndex; index < transcriptWindowEndIndex; index += 1) {
    const record = segmentStore.get(segmentOrder[index]);
    if (!record) {
      continue;
    }
    record.bubbleElement = null;
    record.translationElement = null;
  }
}

function renderTranscriptWindowRange(startIndex, endIndex) {
  releaseRenderedBubbleReferences();
  refs.bubbles.innerHTML = "";

  const fragment = document.createDocumentFragment();
  for (let index = startIndex; index < endIndex; index += 1) {
    const record = segmentStore.get(segmentOrder[index]);
    if (!record) {
      continue;
    }
    fragment.appendChild(createBubbleElement(record));
  }

  refs.bubbles.appendChild(fragment);
  transcriptWindowStartIndex = startIndex;
  transcriptWindowEndIndex = endIndex;
}

function renderLatestTranscriptWindow({ stickToBottom = false } = {}) {
  if (!segmentOrder.length) {
    renderEmptyState();
    return;
  }

  const endIndex = segmentOrder.length;
  const startIndex = Math.max(0, endIndex - TRANSCRIPT_WINDOW_VISIBLE_COUNT);
  renderTranscriptWindowRange(startIndex, endIndex);

  const container = getTranscriptScrollContainer();
  if (stickToBottom && container) {
    container.scrollTop = container.scrollHeight;
  }
  syncJumpLatestButton();
}

function shiftTranscriptWindow(direction) {
  const container = getTranscriptScrollContainer();
  if (!container || !segmentOrder.length) {
    return false;
  }

  let nextStartIndex = transcriptWindowStartIndex;
  let nextEndIndex = transcriptWindowEndIndex;

  if (direction === "older") {
    if (transcriptWindowStartIndex <= 0) {
      return false;
    }
    nextStartIndex = Math.max(0, transcriptWindowStartIndex - TRANSCRIPT_WINDOW_STEP);
    nextEndIndex = Math.min(segmentOrder.length, nextStartIndex + TRANSCRIPT_WINDOW_MAX_COUNT);
  } else {
    if (transcriptWindowEndIndex >= segmentOrder.length) {
      return false;
    }
    nextEndIndex = Math.min(segmentOrder.length, transcriptWindowEndIndex + TRANSCRIPT_WINDOW_STEP);
    nextStartIndex = Math.max(0, nextEndIndex - TRANSCRIPT_WINDOW_MAX_COUNT);
  }

  const previousScrollHeight = container.scrollHeight;
  const previousScrollTop = container.scrollTop;
  renderTranscriptWindowRange(nextStartIndex, nextEndIndex);
  const scrollHeightDelta = container.scrollHeight - previousScrollHeight;
  container.scrollTop = Math.max(0, previousScrollTop + scrollHeightDelta);
  return true;
}

function renderFloatPlaceholder(message) {
  refs.floatContent.innerHTML = `
    <div class="float-line is-placeholder">
      <span class="float-spk-dot" style="background:rgba(255,255,255,0.35)"></span>
      <div class="float-text-block">
        <div class="float-text-source">${escapeHtml(
          message || mt("float_placeholder_default")
        )}</div>
      </div>
    </div>
  `;
}

function renderFloatSegments() {
  if (!segmentOrder.length) {
    renderFloatPlaceholder();
    return;
  }

  const latestSegments = segmentOrder
    .slice(-2)
    .map((segmentId) => segmentStore.get(segmentId))
    .filter(Boolean);

  refs.floatContent.innerHTML = latestSegments
    .map(
      (segment) => `
        <div class="float-line">
          <span class="float-spk-dot" style="background:${segment.speaker.color}"></span>
          <div class="float-text-block">
            <div class="float-text-source">${escapeHtml(segment.text)}</div>
            ${
              segment.translationStatus === "success" && segment.translation
                ? `<div class="float-text-translation">${escapeHtml(segment.translation)}</div>`
                : ""
            }
          </div>
        </div>
      `
    )
    .join("");
}

// ============ 悬浮字幕 Document Picture-in-Picture（浮于桌面任意应用之上） ============

let subtitlePipWindow = null;
let subtitleHomeParent = null;
let subtitleHomeNextSibling = null;
let subtitlePipOpening = false;

function isSubtitlePipActive() {
  return Boolean(subtitlePipWindow) && !subtitlePipWindow.closed;
}

async function toggleSubtitlePip() {
  if (isSubtitlePipActive()) {
    subtitlePipWindow.close();
    return;
  }
  if (subtitlePipOpening) {
    return;
  }
  subtitlePipOpening = true;
  try {
    await openSubtitlePip();
  } finally {
    subtitlePipOpening = false;
  }
}

async function openSubtitlePip() {
  const floatNode = refs.floatSubtitle;
  if (!floatNode) {
    return;
  }

  if (!window.documentPictureInPicture) {
    setConfigStatus(mt("pip_not_supported"), "error");
    return;
  }

  try {
    const pip = await window.documentPictureInPicture.requestWindow({
      width: 480,
      height: 220,
    });
    subtitlePipWindow = pip;

    // PiP 窗口不继承父页样式，克隆所有样式表（含 CSS 变量与 .float-* 规则）。
    copyStylesIntoPipWindow(pip);

    // 让字幕在 PiP 窗内铺满。
    const pipStyle = pip.document.createElement("style");
    pipStyle.textContent = `
      html, body { margin: 0; padding: 0; background: transparent; }
      #floatSubtitle {
        position: static !important;
        top: auto !important; left: auto !important; right: auto !important;
        width: 100% !important; height: 100vh !important;
        border-radius: 0 !important; box-shadow: none !important;
        cursor: default !important;
        display: flex !important; flex-direction: column;
        opacity: 1 !important; transform: none !important; pointer-events: auto !important;
      }
      #floatSubtitle .float-content { flex: 1; }
    `;
    pip.document.head.appendChild(pipStyle);

    // 记住原始位置，关闭后还原。
    subtitleHomeParent = floatNode.parentNode;
    subtitleHomeNextSibling = floatNode.nextSibling;

    // 移动真实节点：renderFloatSegments() 写入的还是同一个 #floatContent，实时字幕继续刷新。
    pip.document.body.appendChild(floatNode);
    floatNode.hidden = false;
    floatNode.classList.remove("hidden");

    refs.btnFloat?.classList.add("active");

    pip.addEventListener("pagehide", restoreSubtitleFromPip, { once: true });
  } catch (error) {
    setConfigStatus(mt("pip_open_failed", { message: error?.message || error }), "error");
    subtitlePipWindow = null;
  }
}

function copyStylesIntoPipWindow(pip) {
  // 克隆 <style> 与 <link rel="stylesheet">，保证 CSS 变量与字幕样式在 PiP 窗内生效。
  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      const cssRules = Array.from(styleSheet.cssRules)
        .map((rule) => rule.cssText)
        .join("");
      const style = pip.document.createElement("style");
      style.textContent = cssRules;
      pip.document.head.appendChild(style);
    } catch {
      // 跨域样式表无法读取 cssRules，退回用 <link> 引用。
      if (styleSheet.href) {
        const link = pip.document.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        pip.document.head.appendChild(link);
      }
    }
  });
}

function restoreSubtitleFromPip() {
  const floatNode = refs.floatSubtitle;
  if (floatNode && subtitleHomeParent) {
    if (subtitleHomeNextSibling && subtitleHomeNextSibling.parentNode === subtitleHomeParent) {
      subtitleHomeParent.insertBefore(floatNode, subtitleHomeNextSibling);
    } else {
      subtitleHomeParent.appendChild(floatNode);
    }
    // 清掉可能残留的内联定位，并在页面内重新隐藏（字幕只作为 PiP 内容模板，不在页面常驻）。
    floatNode.style.left = "";
    floatNode.style.top = "";
    floatNode.style.right = "";
    floatNode.hidden = true;
    floatNode.classList.add("hidden");
  }
  subtitlePipWindow = null;
  subtitleHomeParent = null;
  subtitleHomeNextSibling = null;

  refs.btnFloat?.classList.remove("active");
}

// ============ AI 助手（页面内，前端填 Key 直连） ============

let assistantBusy = false;

function collectAssistantSegments() {
  const language = refs.mainLanguage?.value || "zh";
  // 只取最近 N 条，避免长会议把全量转写塞进 prompt 导致助手变慢、并拖累共用 key 的翻译
  const recent =
    segmentOrder.length > ASSISTANT_MAX_SEGMENTS
      ? segmentOrder.slice(-ASSISTANT_MAX_SEGMENTS)
      : segmentOrder;
  return recent
    .map((segmentId) => segmentStore.get(segmentId))
    .filter(Boolean)
    .map((record) => ({
      segmentId: record.localSegmentId,
      speaker: record.speaker?.name || "发言人",
      timestamp: formatTime(record.timestampEnd),
      text: selectSummaryText(record, language),
    }))
    .filter((item) => item.text);
}

async function askAssistant() {
  if (assistantBusy || isReplayMode) {
    return;
  }

  const question = (refs.assistantInput?.value || "").trim();
  if (!question) {
    return;
  }

  const apiKey = refs.apiKeyInput?.value.trim() || "";
  if (!apiKey) {
    appendAssistantMessage("assistant", t("meeting_assistant_missing_key"), {
      transient: true,
    });
    return;
  }

  refs.assistantInput.value = "";
  appendAssistantMessage("user", question);
  const thinkingNode = appendAssistantMessage("assistant", t("meeting_assistant_thinking"), {
    thinking: true,
    transient: true,
  });
  assistantBusy = true;
  setAssistantInputDisabled(true);

  try {
    const result = await askMeetingAssistant({
      apiKey,
      question,
      transcriptSegments: collectAssistantSegments(),
      language: getSystemLanguage(),
    });
    thinkingNode?.remove();
    appendAssistantMessage("assistant", result.answer || mt("assistant_empty_answer"), {
      citations: buildAssistantCitations(result.citations || []),
      model: result.model,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    thinkingNode?.remove();
    appendAssistantMessage(
      "assistant",
      error?.message || mt("assistant_request_failed")
    );
  } finally {
    assistantBusy = false;
    setAssistantInputDisabled(false);
    refs.assistantInput?.focus();
  }
}

function setAssistantInputDisabled(disabled) {
  if (refs.assistantInput) refs.assistantInput.disabled = disabled;
  if (refs.assistantSend) refs.assistantSend.disabled = disabled;
}

function appendAssistantMessage(role, text, options = {}) {
  const message = createAssistantMessage(role, text, options);
  if (!message) {
    return null;
  }

  const node = renderAssistantMessage(message, { thinking: Boolean(options.thinking) });
  if (!options.transient) {
    assistantMessages.push(message);
    persistAssistantSnapshot();
  }
  return node;
}

function createAssistantMessage(role, text, options = {}) {
  const normalizedRole = role === "user" ? "user" : "assistant";
  const normalizedText = String(text || "").trim();
  if (!normalizedText) {
    return null;
  }

  return {
    id: options.id || `assistant_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role: normalizedRole,
    text: normalizedText,
    createdAt: options.createdAt || new Date().toISOString(),
    citations: normalizeAssistantCitations(options.citations),
    model: options.model || "",
    latencyMs: Number.isFinite(options.latencyMs) ? Math.round(options.latencyMs) : null,
  };
}

function normalizeAssistantMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  return createAssistantMessage(message.role, message.text, {
    id: message.id,
    createdAt: message.createdAt,
    citations: message.citations,
    model: message.model,
    latencyMs: message.latencyMs,
  });
}

function renderAssistantWelcomeMessage(message = "") {
  renderAssistantMessage(
    createAssistantMessage(
      "assistant",
      message || t("meeting_assistant_welcome"),
      { transient: true }
    )
  );
}

function renderAssistantMessage(message, options = {}) {
  if (!refs.assistantMessages) {
    return null;
  }

  const node = document.createElement("div");
  node.className = message.role === "user" ? "ai-msg-user" : "ai-msg-bot";
  if (options.thinking) {
    node.dataset.thinking = "true";
  }

  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  avatar.textContent = message.role === "user" ? t("common_you") : t("common_ai");

  const bubbleWrap = document.createElement("div");
  bubbleWrap.className = "ai-msg-content";

  const bubble = document.createElement("div");
  bubble.className = "ai-msg-bubble";
  bubble.innerHTML = escapeHtml(message.text).replace(/\n/g, "<br>");
  bubbleWrap.appendChild(bubble);

  const citations = normalizeAssistantCitations(message.citations);
  if (citations.length) {
    const citationRow = document.createElement("div");
    citationRow.className = "ai-citation-row";

    const label = document.createElement("span");
    label.className = "ai-citation-label";
    label.textContent = mt("citation_label");
    citationRow.appendChild(label);

    const citationScroll = document.createElement("div");
    citationScroll.className = "ai-citation-scroll";
    citations.forEach((citation, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ai-citation-chip";
      chip.dataset.segmentId = citation.segmentId;
      chip.title = buildCitationTitle(citation);
      chip.textContent = citation.label || String(index + 1);
      citationScroll.appendChild(chip);
    });
    citationRow.appendChild(citationScroll);
    bubbleWrap.appendChild(citationRow);
  }

  node.appendChild(avatar);
  node.appendChild(bubbleWrap);
  refs.assistantMessages.appendChild(node);
  refs.assistantMessages.scrollTop = refs.assistantMessages.scrollHeight;
  return node;
}

function buildAssistantCitations(citationIds) {
  const ids = Array.isArray(citationIds) ? citationIds : citationIds ? [citationIds] : [];
  const seen = new Set();

  return ids
    .map((id) => String(id || "").trim())
    .filter((id) => {
      if (!id || seen.has(id) || !segmentStore.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    })
    .map((segmentId, index) => {
      const record = segmentStore.get(segmentId);
      const text = selectSummaryText(record, refs.mainLanguage?.value || "zh");
      return {
        segmentId,
        label: String(index + 1),
        speaker: record?.speaker?.name || mt("speaker_generic"),
        timestamp: formatTime(record?.timestampEnd),
        textPreview: text.slice(0, 80),
      };
    });
}

function normalizeAssistantCitations(citations) {
  const list = Array.isArray(citations) ? citations : citations ? [citations] : [];
  return list
    .map((citation, index) => {
      if (typeof citation === "string") {
        return { segmentId: citation, label: String(index + 1), speaker: "", timestamp: "", textPreview: "" };
      }
      if (!citation || typeof citation !== "object") {
        return null;
      }
      const segmentId = String(citation.segmentId || "").trim();
      if (!segmentId) {
        return null;
      }
      return {
        segmentId,
        label: String(citation.label || index + 1),
        speaker: String(citation.speaker || ""),
        timestamp: String(citation.timestamp || ""),
        textPreview: String(citation.textPreview || ""),
      };
    })
    .filter(Boolean);
}

function buildCitationTitle(citation) {
  return [citation.speaker, citation.timestamp, citation.textPreview]
    .filter(Boolean)
    .join(" · ");
}

function handleAssistantCitationClick(event) {
  const chip = event.target.closest(".ai-citation-chip");
  if (!chip) {
    return;
  }
  const segmentId = chip.dataset.segmentId;
  if (!segmentId) {
    return;
  }
  const bubble = refs.bubbles?.querySelector(`[data-segment-id="${cssEscape(segmentId)}"]`);
  if (bubble) {
    bubble.scrollIntoView({ behavior: "smooth", block: "center" });
    bubble.classList.add("bubble-highlight");
    setTimeout(() => bubble.classList.remove("bubble-highlight"), 1600);
  }
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, "\\$&");
}

function createInitialSummaryState() {
  return {
    status: "empty",
    mode: getCurrentSummaryMode(),
    data: null,
    editDraft: null,
    errorMessage: "",
    lastUpdatedAt: null,
    lastModel: "",
  };
}

function resetSummaryState() {
  summaryState = createInitialSummaryState();
  renderSummaryState();
}

function handleSummaryGenerateClick() {
  if (isReplayMode) {
    return;
  }
  generateSummary({ mode: getCurrentSummaryMode(), trigger: "manual" });
}

async function generateSummary({ mode, trigger }) {
  if (summaryState.status === "loading") {
    return;
  }

  const apiKey = refs.apiKeyInput?.value.trim() || "";
  if (!apiKey) {
    setSummaryError(mt("summary_missing_api_key"), mode);
    return;
  }

  let inputPackage = null;
  try {
    inputPackage = buildSummaryInputPackage(mode);
  } catch (error) {
    setSummaryError(error.message, mode);
    return;
  }

  const requestId = ++summaryRequestSeq;
  summaryState = {
    ...summaryState,
    status: "loading",
    mode,
    errorMessage: "",
    editDraft: null,
  };
  renderSummaryState();

  try {
    const response = await generateMeetingSummary({
      apiKey,
      summaryMode: mode,
      summaryLanguage: inputPackage.summaryLanguage,
      meetingTitle: inputPackage.meetingTitle,
      meetingSubtitle: inputPackage.meetingSubtitle,
      participants: inputPackage.participants,
      speakerStats: inputPackage.speakerStats,
      summarySegments: inputPackage.summarySegments,
    });

    if (requestId !== summaryRequestSeq) {
      return;
    }

    summaryState = {
      status: "ready",
      mode,
      data: {
        ...response.summary,
        speakerStats: inputPackage.speakerStats,
      },
      editDraft: null,
      errorMessage: "",
      lastUpdatedAt: Date.now(),
      lastModel: response.model,
    };
    renderSummaryState();
    persistSummarySnapshot(
      summaryState.data,
      mode === "final"
        ? buildFinishedMeetingPayload(MEETING_STATUSES.ARCHIVABLE, { summaryStatus: "ready" })
        : {}
    );

    const modeLabel = mode === "final" ? mt("summary_final_label") : mt("summary_current_label");
    setConfigStatus(
      mt("summary_generated_status", {
        modeLabel,
        model: response.model,
        latency: Math.round(response.latencyMs),
      }),
      "success"
    );

    if (trigger === "auto" && meetingState === "finished") {
      setSummaryStatusLine("ready", mode, mt("summary_auto_generated"));
    }
  } catch (error) {
    if (requestId !== summaryRequestSeq) {
      return;
    }
    setSummaryError(error.message || t("meeting_summary_failed"), mode);
  }
}

function buildSummaryInputPackage(mode) {
  const records = segmentOrder.map((segmentId) => segmentStore.get(segmentId)).filter(Boolean);
  if (!records.length) {
    throw new Error(mt("summary_no_content"));
  }

  const summaryLanguage = getSystemLanguage();
  const participants = getSummaryParticipants(records);
  const speakerStats = computeSpeakerStats(records);
  const summarySegments = records
    .map((record) => ({
      segmentId: record.localSegmentId,
      speaker: record.speaker.name,
      timestamp: formatTime(record.timestampEnd),
      text: selectSummaryText(record, summaryLanguage),
    }))
    .filter((item) => item.text);

  if (!summarySegments.length) {
    throw new Error(mt("summary_no_valid_content"));
  }

  return {
    meetingTitle: currentMeetingTitle,
    meetingSubtitle: buildSummarySubtitleText({ mode, includeStateHint: false }),
    summaryLanguage,
    participants,
    speakerStats,
    summarySegments,
  };
}

function getSummaryParticipants(records) {
  const names = new Set(records.map((record) => record.speaker.name));
  return getSpeakerPool().map((speaker) => speaker.name).filter((name) => names.has(name));
}

function computeSpeakerStats(records) {
  const totals = new Map();
  records.forEach((record) => {
    const key = record.speaker.name;
    const current = totals.get(key) || {
      speaker: record.speaker.name,
      avatar: record.speaker.avatar,
      color: record.speaker.color,
      charCount: 0,
      segmentCount: 0,
    };

    current.charCount += countMeaningfulChars(record.text);
    current.segmentCount += 1;
    totals.set(key, current);
  });

  const ordered = getSpeakerPool().map((speaker) => totals.get(speaker.name)).filter(Boolean);
  const totalChars = ordered.reduce((sum, item) => sum + item.charCount, 0) || 1;

  return ordered.map((item) => ({
    ...item,
    ratio: item.charCount / totalChars,
    ratioLabel: `${Math.round((item.charCount / totalChars) * 100)}%`,
  }));
}

function selectSummaryText(record, summaryLanguage) {
  if (record.sourceLanguage === summaryLanguage) {
    return record.text;
  }

  if (
    record.translationStatus === "success" &&
    record.translation &&
    record.translationPlan?.desiredTargetLanguage === summaryLanguage
  ) {
    return record.translation;
  }

  return record.text;
}

function renderSummaryState() {
  updateSummaryHeader();
  updateSummaryActions();

  if (summaryState.status === "loading") {
    setSummaryStatusLine("loading", summaryState.mode, t("meeting_summary_generating"));
    refs.summaryContent.innerHTML = renderSummaryLoading();
    return;
  }

  if (summaryState.status === "error") {
    setSummaryStatusLine("error", summaryState.mode, summaryState.errorMessage || t("meeting_summary_failed"));
    refs.summaryContent.innerHTML = renderSummaryError(summaryState.errorMessage);
    return;
  }

  if (summaryState.status === "editing" && summaryState.editDraft) {
    setSummaryStatusLine("ready", summaryState.mode, mt("summary_editing_notice"));
    refs.summaryContent.innerHTML = renderSummaryEditing(summaryState.editDraft);
    return;
  }

  if (summaryState.status === "ready" && summaryState.data) {
    const timestamp = summaryState.lastUpdatedAt
      ? `${mt("summary_updated_prefix")}${formatLocaleTime(
          summaryState.lastUpdatedAt,
          { hour12: false },
          getSystemLanguage()
        )}`
      : t("meeting_summary_ready");
    setSummaryStatusLine("ready", summaryState.mode, `${timestamp} · ${summaryState.lastModel || SUMMARY_MODEL_INFO.label}`);
    refs.summaryContent.innerHTML = renderSummaryReady(summaryState.data);
    return;
  }

  refs.summaryStatusLine.hidden = true;
  refs.summaryContent.innerHTML = renderSummaryEmpty();
}

function updateSummaryHeader() {
  refs.summaryTitle.textContent = getSummaryDisplayTitle();
  refs.summarySubtitle.textContent = buildSummarySubtitleText({
    mode: summaryState.mode,
    includeStateHint: summaryState.status === "empty",
  });
}

function buildSummarySubtitleText({ mode, includeStateHint }) {
  if (includeStateHint) {
    if (isReplayMode) {
      return t("meeting_summary_replay");
    }
    return t("meeting_summary_not_generated");
  }

  const participantCount = Math.max(getSummaryParticipants(segmentOrder.map((id) => segmentStore.get(id)).filter(Boolean)).length, 0);
  const dateText = formatSummaryDateRange();
  const participantText = participantCount
    ? mt("participants_count", { count: participantCount })
    : mt("participants_waiting");
  const modeText = mode === "final" ? t("meeting_summary_final") : t("meeting_summary_draft");
  return `${dateText} · ${participantText} · ${SUMMARY_PARTNER_LABEL} · ${modeText}`;
}

function formatSummaryDateRange() {
  const start = meetingStartedAt ? new Date(meetingStartedAt) : new Date();
  const end = currentMeetingEndedAt ? new Date(currentMeetingEndedAt) : new Date();
  const datePart = formatDateTime(
    start,
    { year: "numeric", month: "numeric", day: "numeric" },
    getSystemLanguage()
  );
  const startTime = formatLocaleTime(start, { hour12: false, hour: "2-digit", minute: "2-digit" }, getSystemLanguage());
  const endTime = formatLocaleTime(end, { hour12: false, hour: "2-digit", minute: "2-digit" }, getSystemLanguage());
  return `${datePart} ${startTime} — ${endTime}`;
}

function updateSummaryActions() {
  const hasSummary = Boolean(summaryState.data);
  const isEditing = summaryState.status === "editing";
  const isLoading = summaryState.status === "loading";

  if (isReplayMode) {
    refs.btnSummaryRegenerate.hidden = true;
    refs.btnSummaryEdit.hidden = true;
    refs.btnSummaryCancel.hidden = true;
    refs.btnSummarySave.hidden = true;
    refs.btnSummaryExport.hidden = true;
    return;
  }

  refs.btnSummaryRegenerate.hidden = !hasSummary || isEditing;
  refs.btnSummaryRegenerate.disabled = isLoading;
  refs.btnSummaryEdit.hidden = !hasSummary || isEditing;
  refs.btnSummaryEdit.disabled = isLoading;
  refs.btnSummaryCancel.hidden = false;
  refs.btnSummaryCancel.disabled = !isEditing || isLoading;
  refs.btnSummarySave.hidden = !hasSummary && !isEditing;
  refs.btnSummarySave.disabled = !isEditing || isLoading;
  refs.btnSummaryExport.hidden = !hasSummary || isEditing;
  refs.btnSummaryExport.disabled = !hasSummary || isLoading;
}

function setSummaryStatusLine(state, mode, text) {
  refs.summaryStatusLine.hidden = false;
  refs.summaryStatusLine.dataset.state = state;
  refs.summaryModeBadge.textContent =
    mode === "final" ? t("meeting_summary_final") : t("meeting_summary_draft");
  refs.summaryStatusText.textContent = text;
}

function renderSummaryEmpty() {
  if (isReplayMode) {
    return `
      <div class="summary-empty">
        <div class="summary-empty-title">${mt("summary_empty_replay_title")}</div>
        <div class="summary-empty-text">${t("meeting_summary_replay_empty")}</div>
      </div>
    `;
  }

  const buttonLabel =
    getCurrentSummaryMode() === "final"
      ? mt("summary_generate_final")
      : mt("summary_generate_current");
  const archiveAction = renderSummaryArchiveAction();
  const shouldShowArchiveHint = isArchivableWithoutSummaryState() && meetingState === "finished";
  return `
    <div class="summary-empty">
      <div class="summary-empty-title">${t("meeting_summary_none")}</div>
      <div class="summary-empty-text">${mt("summary_empty_text")}</div>
      ${
        shouldShowArchiveHint
          ? `<div class="summary-warning">${escapeHtml(mt("summary_no_content"))}</div>`
          : ""
      }
      <div class="summary-empty-actions">
        <button class="btn primary" data-summary-action="generate">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>
          <span>${buttonLabel}</span>
        </button>
      </div>
      ${archiveAction}
    </div>
  `;
}

function renderSummaryLoading() {
  return `
    <div class="summary-loading">
      <div class="summary-skeleton-card"></div>
      <div class="summary-skeleton-section">
        <div class="summary-skeleton-line" style="width: 28%;"></div>
        <div class="summary-skeleton-line" style="width: 100%;"></div>
        <div class="summary-skeleton-line" style="width: 84%;"></div>
      </div>
      <div class="summary-skeleton-section">
        <div class="summary-skeleton-line" style="width: 32%;"></div>
        <div class="summary-skeleton-line" style="width: 94%;"></div>
        <div class="summary-skeleton-line" style="width: 88%;"></div>
        <div class="summary-skeleton-line" style="width: 72%;"></div>
      </div>
      <div class="summary-skeleton-section">
        <div class="summary-skeleton-line" style="width: 26%;"></div>
        <div class="summary-skeleton-line" style="width: 100%;"></div>
        <div class="summary-skeleton-line" style="width: 91%;"></div>
      </div>
    </div>
  `;
}

function renderSummaryError(message) {
  return `
    <div class="summary-empty">
      <div class="summary-empty-title">${t("meeting_summary_failed")}</div>
      <div class="summary-empty-text">${mt("summary_error_help")}</div>
      <div class="summary-warning">${escapeHtml(message || mt("summary_error_check"))}</div>
      <div class="summary-empty-actions" style="margin-top:16px">
        <button class="btn primary" data-summary-action="retry">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.13 3.36L1 14"/></svg>
          <span>${t("meeting_summary_regenerate")}</span>
        </button>
      </div>
      ${renderSummaryArchiveAction()}
    </div>
  `;
}

function renderSummaryReady(summary) {
  return `
    <div class="ai-note">
      <div class="ai-icon-circle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>
      </div>
      <div class="ai-note-text">
        <strong>${mt("ai_summary_title")}</strong>　${escapeHtml(summary.aiSummary)}
      </div>
    </div>

    <div class="summary-section">
      <h2>✓ ${mt("decisions_title")}</h2>
      ${renderDecisionCards(summary.decisions)}
    </div>

    <div class="summary-section">
      <h2>▶ ${mt("actions_title")}</h2>
      ${renderActionItems(summary.actionItems)}
    </div>

    <div class="summary-section">
      <h2>! ${mt("questions_title")}</h2>
      ${renderOpenQuestions(summary.openQuestions)}
    </div>

    <div class="summary-section">
      <h2>👥 ${mt("speaker_stats_title")}</h2>
      ${renderSpeakerStats(summary.speakerStats)}
    </div>

    ${renderSummaryArchiveAction()}
  `;
}

function renderSummaryArchiveAction() {
  const canArchive = canArchiveMeeting();
  if (!canArchive) {
    return "";
  }

  return `
    <div class="summary-bottom-action">
      <div class="summary-bottom-action-text">
        ${mt(isArchivableWithoutSummaryState() ? "archive_ready_no_summary" : "archive_ready")}
      </div>
      <button class="btn primary" data-summary-action="archive-meeting" ${
        isArchivingMeeting ? "disabled" : ""
      }>
        ${isArchivingMeeting ? mt("archiving") : mt("archive_and_return")}
      </button>
    </div>
  `;
}

function canArchiveMeeting() {
  return (
    currentMeetingMode === "live" &&
    Boolean(currentMeetingId) &&
    meetingState === "finished" &&
    (isArchivableWithoutSummaryState() ||
      (summaryState.status === "ready" &&
        summaryState.mode === "final" &&
        Boolean(summaryState.data)) ||
      currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE)
  );
}

function isArchivableWithoutSummaryState() {
  return currentMeetingRecord?.status === MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY;
}

function renderSummaryEditing(summary) {
  return `
    <div class="ai-note">
      <div class="ai-icon-circle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15 8.5 22 9.3 17 14 18.2 21 12 17.8 5.8 21 7 14 2 9.3 9 8.5 12 2"/></svg>
      </div>
      <div class="ai-note-text" style="width:100%">
        <strong>${mt("ai_summary_title")}</strong>
        <textarea class="summary-textarea" id="summaryEditAiSummary">${escapeHtml(summary.aiSummary)}</textarea>
      </div>
    </div>

    <div class="summary-section">
      <h2>✓ ${mt("decisions_title")}</h2>
      <div class="summary-editor-list" id="summaryEditDecisions">
        ${summary.decisions
          .map(
            (item, index) => `
              <div class="decision-card summary-edit-decision-item">
                <label class="summary-editor-label">${mt("decision_label")}</label>
                <textarea class="summary-textarea" data-summary-field="decision">${escapeHtml(item.text)}</textarea>
                <div class="summary-item-toolbar">
                  <button class="summary-mini-btn" data-summary-action="remove-decision" data-index="${index}">${mt("delete_rule")}</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="summary-add-row"><button class="summary-mini-btn" data-summary-action="add-decision">${mt("add_decision")}</button></div>
    </div>

    <div class="summary-section">
      <h2>▶ ${mt("actions_title")}</h2>
      <div class="summary-editor-list" id="summaryEditActions">
        ${summary.actionItems
          .map(
            (item, index) => `
              <div class="todo-item summary-edit-action-item">
                <div class="todo-checkbox"></div>
                <div class="todo-body" style="width:100%">
                  <label class="summary-editor-label">${mt("action_task_label")}</label>
                  <textarea class="summary-textarea" data-summary-field="action-task">${escapeHtml(item.task)}</textarea>
                  <div class="summary-inline-grid">
                    <div class="summary-field-group">
                      <label class="summary-field-label">${mt("owner_label")}</label>
                      <input class="summary-input" data-summary-field="action-owner" value="${escapeHtml(item.owner || "")}" placeholder="${escapeHtml(mt("owner_placeholder"))}">
                    </div>
                    <div class="summary-field-group">
                      <label class="summary-field-label">${mt("deadline_label")}</label>
                      <input class="summary-input" data-summary-field="action-deadline" value="${escapeHtml(item.deadline || "")}" placeholder="${escapeHtml(mt("deadline_placeholder"))}">
                    </div>
                    <div class="summary-field-group">
                      <label class="summary-field-label">${mt("owner_status_label")}</label>
                      <select class="summary-select" data-summary-field="action-owner-status">
                        <option value="confirmed" ${item.ownerStatus === "confirmed" ? "selected" : ""}>${mt("owner_status_confirmed")}</option>
                        <option value="unclear" ${item.ownerStatus !== "confirmed" ? "selected" : ""}>${mt("owner_status_unclear")}</option>
                      </select>
                    </div>
                    <button class="summary-mini-btn" data-summary-action="remove-action" data-index="${index}">${mt("delete_rule")}</button>
                  </div>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="summary-add-row"><button class="summary-mini-btn" data-summary-action="add-action">${mt("add_action")}</button></div>
    </div>

    <div class="summary-section">
      <h2>! ${mt("questions_title")}</h2>
      <div class="summary-editor-list" id="summaryEditQuestions">
        ${summary.openQuestions
          .map(
            (item, index) => `
              <div class="decision-card summary-edit-question-item">
                <label class="summary-editor-label">${mt("question_label")}</label>
                <textarea class="summary-textarea" data-summary-field="question">${escapeHtml(item.text)}</textarea>
                <div class="summary-item-toolbar">
                  <button class="summary-mini-btn" data-summary-action="remove-question" data-index="${index}">${mt("delete_rule")}</button>
                </div>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="summary-add-row"><button class="summary-mini-btn" data-summary-action="add-question">${mt("add_question")}</button></div>
    </div>

    <div class="summary-section">
      <h2>👥 ${mt("speaker_stats_title")}</h2>
      ${renderSpeakerStats(summary.speakerStats)}
      <div class="summary-note-muted">${mt("speaker_stats_note")}</div>
    </div>
  `;
}

function renderDecisionCards(items) {
  if (!items?.length) {
    return `<div class="summary-empty-result">${mt("no_decisions")}</div>`;
  }

  return items.map((item) => `<div class="decision-card">${escapeHtml(item.text)}</div>`).join("");
}

function renderActionItems(items) {
  if (!items?.length) {
    return `<div class="summary-empty-result">${mt("no_actions")}</div>`;
  }

  return items
    .map((item) => {
      const ownerText = item.owner || mt("owner_placeholder");
      const deadlineText = item.deadline || mt("deadline_placeholder");
      const speakerMeta = getSpeakerMetaByName(ownerText);
      return `
        <div class="todo-item">
          <div class="todo-checkbox"></div>
          <div class="todo-body">
            <div class="todo-text">${escapeHtml(item.task)}</div>
            <div class="todo-meta">
              <span class="owner-chip"><span class="owner-avatar" style="background:${speakerMeta.color}">${speakerMeta.avatar}</span>${escapeHtml(ownerText)}</span>
              <span>📅 ${escapeHtml(deadlineText)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderOpenQuestions(items) {
  if (!items?.length) {
    return `<div class="summary-empty-result">${mt("no_questions")}</div>`;
  }

  return `<p>${items.map((item) => escapeHtml(item.text)).join("<br><br>")}</p>`;
}

function renderSpeakerStats(items) {
  if (!items?.length) {
    return `<div class="summary-empty-result">${mt("no_speaker_stats")}</div>`;
  }

  return `
    <div class="participant-grid">
      ${items
        .map(
          (item) => `
            <div class="participant-card">
              <div class="bubble-avatar" style="background:${item.color}">${item.avatar}</div>
              ${escapeHtml(item.speaker)}
              <span class="participant-percent">${escapeHtml(item.ratioLabel)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function handleSummaryContentClick(event) {
  const actionTarget = event.target.closest("[data-summary-action]");
  if (!actionTarget) {
    return;
  }

  const action = actionTarget.dataset.summaryAction;
  if (action === "generate" || action === "retry") {
    handleSummaryGenerateClick();
    return;
  }

  if (action === "archive-meeting") {
    handleArchiveMeetingClick(actionTarget);
    return;
  }

  if (summaryState.status !== "editing") {
    return;
  }

  snapshotSummaryEditingDraft();

  if (action === "add-decision") {
    summaryState.editDraft.decisions.push({ text: "" });
  } else if (action === "remove-decision") {
    summaryState.editDraft.decisions.splice(Number(actionTarget.dataset.index), 1);
  } else if (action === "add-action") {
    summaryState.editDraft.actionItems.push({
      task: "",
      owner: mt("owner_unspecified"),
      deadline: mt("deadline_unspecified"),
      ownerStatus: "unclear",
    });
  } else if (action === "remove-action") {
    summaryState.editDraft.actionItems.splice(Number(actionTarget.dataset.index), 1);
  } else if (action === "add-question") {
    summaryState.editDraft.openQuestions.push({ text: "" });
  } else if (action === "remove-question") {
    summaryState.editDraft.openQuestions.splice(Number(actionTarget.dataset.index), 1);
  }

  renderSummaryState();
}

function enterSummaryEditing() {
  if (isReplayMode) {
    return;
  }
  if (!summaryState.data) {
    return;
  }

  summaryState = {
    ...summaryState,
    status: "editing",
    editDraft: deepClone(summaryState.data),
  };
  renderSummaryState();
}

function cancelSummaryEditing() {
  if (isReplayMode) {
    return;
  }
  if (!summaryState.data) {
    return;
  }

  summaryState = {
    ...summaryState,
    status: "ready",
    editDraft: null,
  };
  renderSummaryState();
}

function saveSummaryEditing() {
  if (isReplayMode) {
    return;
  }
  if (summaryState.status !== "editing") {
    return;
  }

  const draft = snapshotSummaryEditingDraft();
  summaryState = {
    ...summaryState,
    status: "ready",
    data: draft,
    editDraft: null,
    lastUpdatedAt: Date.now(),
  };
  renderSummaryState();
  persistSummarySnapshot(summaryState.data);
}

function markMeetingArchivableWithoutSummary(message) {
  summaryState = {
    ...createInitialSummaryState(),
    mode: "final",
  };
  persistMeetingMetadata(buildFinishedMeetingPayload(MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY));
  renderSummaryState();
  if (message) {
    setConfigStatus(message, "info");
  }
}

async function handleArchiveMeetingClick(actionTarget) {
  if (!canArchiveMeeting() || isArchivingMeeting) {
    return;
  }

  isArchivingMeeting = true;
  if (actionTarget instanceof HTMLButtonElement) {
    actionTarget.disabled = true;
  }

  try {
    const archivedMeeting = finishMeeting(currentMeetingId, {
      ...getMeetingBasePayload(),
      status: MEETING_STATUSES.ARCHIVED,
      transcriptSegments: getPersistableSegmentsSnapshot(),
      summary: summaryState.data,
      assistantMessages,
    });
    currentMeetingRecord = archivedMeeting;
    currentMeetingEndedAt = archivedMeeting?.endedAt
      ? new Date(archivedMeeting.endedAt).getTime()
      : currentMeetingEndedAt;
    const persistedMeeting = getMeetingById(currentMeetingId);
    if (!persistedMeeting || persistedMeeting.status !== MEETING_STATUSES.ARCHIVED) {
      throw new Error(mt("archive_failed"));
    }
    window.location.replace("home.html");
  } catch (error) {
    isArchivingMeeting = false;
    if (actionTarget instanceof HTMLButtonElement) {
      actionTarget.disabled = false;
    }
    window.alert(error instanceof Error ? error.message : mt("archive_failed"));
  }
}

function getMeetingConfigUserId() {
  return getCurrentUser()?.id || "";
}

function hydrateConfig() {
  const defaults = {
    apiKey: "",
    translatorModel: "senseaudio-s2-lite",
    mainLanguage: getSystemLanguage(),
    meetingTargetLanguage: "en",
    silenceDuration: "500",
    minSpeechDuration: "300",
  };

  try {
    const stored = getMeetingConfigForUser(getMeetingConfigUserId()) || defaults;
    const config = { ...defaults, ...stored };
    refs.apiKeyInput.value = config.apiKey;
    refs.translatorModel.value = config.translatorModel;
    refs.mainLanguage.value = config.mainLanguage;
    refs.meetingTargetLanguage.value = config.meetingTargetLanguage;
    refs.silenceDuration.value = config.silenceDuration;
    refs.minSpeechDuration.value = config.minSpeechDuration;
  } catch {
    refs.apiKeyInput.value = defaults.apiKey;
    refs.translatorModel.value = defaults.translatorModel;
    refs.mainLanguage.value = defaults.mainLanguage;
    refs.meetingTargetLanguage.value = defaults.meetingTargetLanguage;
    refs.silenceDuration.value = defaults.silenceDuration;
    refs.minSpeechDuration.value = defaults.minSpeechDuration;
  }
}

function persistConfig() {
  const userId = getMeetingConfigUserId();
  if (!userId) {
    return;
  }

  saveMeetingConfigForUser(userId, {
    apiKey: refs.apiKeyInput?.value || "",
    translatorModel: refs.translatorModel?.value || "senseaudio-s2-lite",
    mainLanguage: refs.mainLanguage?.value || "zh",
    meetingTargetLanguage: refs.meetingTargetLanguage?.value || "en",
    silenceDuration: refs.silenceDuration?.value || "500",
    minSpeechDuration: refs.minSpeechDuration?.value || "300",
  });
}

function snapshotSummaryEditingDraft() {
  if (summaryState.status !== "editing" || !summaryState.editDraft) {
    return summaryState.editDraft;
  }

  const draft = deepClone(summaryState.editDraft);
  draft.aiSummary = normalizeRichTextValue(document.getElementById("summaryEditAiSummary")?.value);
  draft.decisions = Array.from(refs.summaryContent.querySelectorAll('[data-summary-field="decision"]'))
    .map((element) => ({ text: normalizeRichTextValue(element.value) }))
    .filter((item) => item.text);
  draft.actionItems = Array.from(refs.summaryContent.querySelectorAll(".summary-edit-action-item"))
    .map((element) => ({
      task: normalizeRichTextValue(element.querySelector('[data-summary-field="action-task"]')?.value),
      owner: normalizeRichTextValue(element.querySelector('[data-summary-field="action-owner"]')?.value),
      deadline: normalizeRichTextValue(element.querySelector('[data-summary-field="action-deadline"]')?.value),
      ownerStatus:
        normalizeRichTextValue(element.querySelector('[data-summary-field="action-owner-status"]')?.value) ||
        "unclear",
    }))
    .filter((item) => item.task);
  draft.openQuestions = Array.from(refs.summaryContent.querySelectorAll('[data-summary-field="question"]'))
    .map((element) => ({ text: normalizeRichTextValue(element.value) }))
    .filter((item) => item.text);

  summaryState.editDraft = draft;
  return draft;
}

function exportSummaryMarkdown() {
  const source =
    summaryState.status === "editing" ? snapshotSummaryEditingDraft() : summaryState.data;
  if (!source) {
    return;
  }

  const markdown = buildSummaryMarkdown(source);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${getSummaryDisplayTitle().replace(/[\\/:*?"<>|]/g, "-")}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildSummaryMarkdown(summary) {
  return [
    `# ${getSummaryDisplayTitle()}`,
    "",
    `- ${mt("markdown_mode")}: ${summary.summaryMode === "final" ? mt("markdown_final") : mt("markdown_draft")}`,
    `- ${mt("markdown_language")}: ${getLanguageLabel(summary.summaryLanguage || refs.mainLanguage?.value || "zh")}`,
    `- ${mt("markdown_updated_at")}: ${
      summaryState.lastUpdatedAt
        ? formatDateTime(summaryState.lastUpdatedAt, { hour12: false }, getSystemLanguage())
        : mt("not_recorded")
    }`,
    "",
    `## ${mt("markdown_ai_summary")}`,
    "",
    summary.aiSummary || mt("markdown_none"),
    "",
    `## ${mt("markdown_decisions")}`,
    "",
    ...(summary.decisions?.length ? summary.decisions.map((item) => `- ${item.text}`) : [`- ${mt("markdown_none")}`]),
    "",
    `## ${mt("markdown_actions")}`,
    "",
    ...(summary.actionItems?.length
      ? summary.actionItems.map(
          (item) =>
            `- ${item.task} | ${mt("markdown_owner")}: ${item.owner || mt("owner_placeholder")} | ${mt("markdown_deadline")}: ${item.deadline || mt("deadline_placeholder")}`
        )
      : [`- ${mt("markdown_none")}`]),
    "",
    `## ${mt("markdown_questions")}`,
    "",
    ...(summary.openQuestions?.length
      ? summary.openQuestions.map((item) => `- ${item.text}`)
      : [`- ${mt("markdown_none")}`]),
    "",
    `## ${mt("markdown_speaker_stats")}`,
    "",
    ...(summary.speakerStats?.length
      ? summary.speakerStats.map((item) => `- ${item.speaker}: ${item.ratioLabel}`)
      : [`- ${mt("markdown_none")}`]),
    "",
  ].join("\n");
}

function setSummaryError(message, mode) {
  summaryState = {
    ...summaryState,
    status: "error",
    mode,
    errorMessage: message,
    editDraft: null,
  };
  if (!isReplayMode && mode === "final") {
    persistMeetingMetadata(buildFinishedMeetingPayload(MEETING_STATUSES.ARCHIVABLE_NO_SUMMARY));
  }
  renderSummaryState();
  setConfigStatus(message, "error");
}

function getCurrentSummaryMode() {
  if (isReplayMode) {
    return "final";
  }
  return meetingState === "finished" ? "final" : "draft";
}

function handleTranscriptScroll() {
  const container = getTranscriptScrollContainer();
  if (!container) {
    return;
  }

  if (container.scrollTop <= TRANSCRIPT_WINDOW_EDGE_PX && shiftTranscriptWindow("older")) {
    isAutoFollowEnabled = false;
    syncJumpLatestButton();
    return;
  }

  const nearBottom = isNearBottom(container);
  if (nearBottom && shiftTranscriptWindow("newer")) {
    syncJumpLatestButton();
    return;
  }

  isAutoFollowEnabled = nearBottom && transcriptWindowEndIndex >= segmentOrder.length;
  if (isAutoFollowEnabled) {
    pendingNewMessageCount = 0;
  }
  syncJumpLatestButton();
}

function jumpToLatestMessage() {
  const container = getTranscriptScrollContainer();
  if (!container) {
    return;
  }

  renderLatestTranscriptWindow({ stickToBottom: true });
  container.scrollTop = container.scrollHeight;
  isAutoFollowEnabled = true;
  pendingNewMessageCount = 0;
  syncJumpLatestButton();
}

function maybeAutoFollow(container) {
  if (!container) {
    return;
  }

  if (isAutoFollowEnabled || isNearBottom(container)) {
    container.scrollTop = container.scrollHeight;
    isAutoFollowEnabled = true;
    pendingNewMessageCount = 0;
  }

  syncJumpLatestButton();
}

function isNearBottom(container) {
  if (!container) {
    return true;
  }

  const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceToBottom <= AUTO_FOLLOW_THRESHOLD_PX;
}

function syncJumpLatestButton() {
  if (!refs.jumpLatestBtn || !refs.jumpLatestCount) {
    return;
  }

  refs.jumpLatestBtn.hidden = isAutoFollowEnabled || segmentOrder.length === 0;
  refs.jumpLatestCount.hidden = pendingNewMessageCount <= 0;
  if (pendingNewMessageCount > 0) {
    refs.jumpLatestCount.textContent = pendingNewMessageCount > 99 ? "99+" : String(pendingNewMessageCount);
  }
}

function setMeetingState(state, label) {
  meetingState = state;

  refs.transcriptStatus.textContent = label;
  refs.recordingStatusText.textContent = label;
  refs.transcriptStatusBadge.dataset.state = state;
  refs.recordingStatus.dataset.state = state;

  refs.recognitionStatus.textContent = isReplayMode
    ? t("meeting_readonly_replay")
    : state === "transcribing"
      ? mt("recognition_normal")
      : state === "connecting"
        ? t("meeting_connecting")
        : state === "finished"
          ? mt("recognition_finished")
          : state === "error"
            ? mt("recognition_error")
            : t("meeting_waiting_start");
  refs.recognitionStatus.dataset.state = state;

  refs.startBtn.disabled = state === "connecting" || state === "transcribing";
  refs.stopBtn.disabled = !(state === "connecting" || state === "transcribing");

  if (state === "idle") {
    refs.startBtn.querySelector("span").textContent = t("meeting_start");
  } else if (state === "connecting") {
    refs.startBtn.querySelector("span").textContent = t("meeting_connecting");
  } else if (state === "transcribing") {
    refs.startBtn.querySelector("span").textContent = t("meeting_live");
  } else if (state === "finished") {
    refs.startBtn.querySelector("span").textContent = t("meeting_restart");
  } else if (state === "error") {
    refs.startBtn.querySelector("span").textContent = t("meeting_reconnect");
  }

  updateMeetingSubTitle();
}

function updatePolicySummary() {
  if (isReplayMode) {
    refs.configHint.textContent = mt("replay_policy_hint");
    refs.transcriptModeText.textContent = t("meeting_history_replay");
    return;
  }

  refs.configHint.textContent = createPolicySummary({
    mainLanguage: refs.mainLanguage?.value || "zh",
    meetingTargetLanguage: refs.meetingTargetLanguage?.value || "en",
    translatorModel: refs.translatorModel?.value || "senseaudio-s2-lite",
  });
  refs.transcriptModeText.textContent = t("meeting_bilingual");
}

function setConfigStatus(message, type) {
  refs.configStatus.textContent = message;
  refs.configStatus.dataset.state = type;
  delete refs.configStatus.dataset.i18nKey;
  delete refs.configStatus.dataset.i18nParams;
}

function setConfigStatusByKey(key, type, params = {}) {
  refs.configStatus.textContent = mt(key, params);
  refs.configStatus.dataset.state = type;
  refs.configStatus.dataset.i18nKey = key;
  refs.configStatus.dataset.i18nParams = JSON.stringify(params);
}

function getDefaultMeetingStateLabel(state) {
  if (state === "transcribing") {
    return mt("transcribing");
  }
  if (state === "connecting") {
    return t("meeting_connecting");
  }
  if (state === "finished") {
    return mt("finished");
  }
  if (state === "error") {
    return mt("recognition_error");
  }
  return t("meeting_waiting");
}

function updateSessionInfo() {
  const micClient = channels.find((c) => c.source === "mic")?.client ?? null;
  if (!micClient) {
    refs.configSession.textContent = "";
    return;
  }

  const parts = [];
  if (micClient.sessionId) {
    parts.push(`session_id: ${micClient.sessionId}`);
  }
  if (micClient.traceId) {
    parts.push(`trace_id: ${micClient.traceId}`);
  }
  parts.push(`translator: ${refs.translatorModel?.value || "senseaudio-s2-lite"}`);
  refs.configSession.textContent = parts.join(" · ");
}

function updateMeetingSubTitle() {
  if (isReplayMode) {
    refs.meetingTitleSub.textContent = `${getLanguageLabel(
      refs.mainLanguage?.value || "zh"
    )} ↔ ${getLanguageLabel(refs.meetingTargetLanguage?.value || "en")} · ${mt("participants_count", {
      count: getSpeakerPool().length,
    })} · ${mt("archived_status")}`;
    return;
  }

  const durationText =
    meetingState === "transcribing" || meetingState === "finished"
      ? mt("duration_live", { duration: refs.timer.textContent.replace("⏱ ", "") })
      : mt("duration_waiting");

  refs.meetingTitleSub.textContent = `${getLanguageLabel(
    refs.mainLanguage?.value || "zh"
  )} ↔ ${getLanguageLabel(refs.meetingTargetLanguage?.value || "en")} · ${
    mt("participants_count", { count: getSpeakerPool().length })
  } · ${durationText}`;
}

function updateActiveSpeaker(speaker) {
  const nextSpeaker = speaker || getSpeakerPool()[0];

  refs.activeSpeakerAvatar.textContent = nextSpeaker.avatar;
  refs.activeSpeakerAvatar.style.background = nextSpeaker.color;
  refs.activeSpeakerName.textContent =
    meetingState === "transcribing"
      ? mt("active_speaker_demo", { name: nextSpeaker.name })
      : mt("active_speaker_waiting");
}

function updateMicLevel(level) {
  const normalized = Math.max(0, Math.min(1, level || 0));
  refs.micBars.forEach((bar, index) => {
    const activeThreshold = (index + 1) / refs.micBars.length;
    const barLevel = Math.max(0.18, normalized * (1 + index * 0.18));
    bar.style.height = `${Math.min(90, Math.round(barLevel * 100))}%`;
    bar.classList.toggle("on", normalized >= activeThreshold - 0.16);
  });
}

// ---- 声纹识别 ----
function prepareVoiceprint() {
  vpReady = false;
  vpLibrary = [];

  try {
    const u = getCurrentUser();
    vpLog("[声纹] 当前会议用户:", u?.id, u?.name);
  } catch (e) {
    console.warn("[声纹] 获取当前用户失败", e);
  }

  Promise.all([
    getVoiceprintsForMeetingParticipants(activeMeetingParticipants).catch((e) => {
      console.warn("[声纹] 加载声纹库失败", e);
      return [];
    }),
    ensureVoiceprintEngine().catch((e) => {
      console.warn("[声纹] 引擎初始化失败", e);
      return null;
    }),
  ]).then(([library, engine]) => {
    vpLog("[声纹] 读到声纹数:", library?.length, " 引擎:", engine ? "OK" : "失败");
    vpLibrary = (library || []).map((v) => ({
      id: v.id,
      name: v.name,
      role: v.role,
      color: v.color,
      avatar: v.avatar,
      embedding: Float32Array.from(v.embedding),
    }));
    vpReady = Boolean(engine) && vpLibrary.length > 0;
    vpLog("[声纹] vpReady:", vpReady, " vpLibrary.length:", vpLibrary.length);
    if (vpLibrary.length === 0) {
      setConfigStatusByKey("voiceprint_library_empty", "info");
    } else {
      setConfigStatusByKey("voiceprint_library_loaded", "success", { count: vpLibrary.length });
    }
  });
}

function ensureVoiceprintEngine() {
  if (!vpEnginePromise) vpEnginePromise = initVoiceprintEngine();
  return vpEnginePromise;
}

function makePendingSpeaker() {
  return {
    key: "speaker-pending",
    name: "识别中…",
    role: "",
    avatar: "?",
    color: "var(--text-tertiary)",
  };
}

function makeUnknownSpeaker() {
  return {
    key: "speaker-unknown",
    name: "未识别",
    role: "",
    avatar: "?",
    color: "var(--text-tertiary)",
  };
}

function isResolvedVoiceprintSpeaker(speaker) {
  return Boolean(
    speaker &&
      speaker.key &&
      speaker.key !== "speaker-pending" &&
      speaker.key !== "speaker-unknown"
  );
}

function getPreviousResolvedSpeaker(record) {
  for (let i = segmentOrder.length - 1; i >= 0; i -= 1) {
    const segmentId = segmentOrder[i];
    if (!segmentId || segmentId === record.localSegmentId) {
      continue;
    }
    const previousRecord = segmentStore.get(segmentId);
    if (!previousRecord || previousRecord.source !== record.source) {
      continue;
    }
    if (isResolvedVoiceprintSpeaker(previousRecord.speaker)) {
      return { ...previousRecord.speaker };
    }
  }
  return null;
}

function finalizeSpeakerForRecord(record, speaker) {
  const liveRecord = segmentStore.get(record.localSegmentId);
  if (!liveRecord || liveRecord.runId !== record.runId) {
    return false;
  }
  liveRecord.speaker = speaker;
  updateBubbleSpeaker(liveRecord.localSegmentId, speaker);
  persistTranscriptSnapshot();
  renderFloatSegments();
  return true;
}

function resolveFallbackSpeaker(record, { reason = "" } = {}) {
  const inheritedSpeaker = getPreviousResolvedSpeaker(record);
  if (inheritedSpeaker) {
    vpLog(`[声纹] ${reason || "fallback"} → 沿用上一说话人: ${inheritedSpeaker.name}`);
    return inheritedSpeaker;
  }
  vpLog(`[声纹] ${reason || "fallback"} → 未识别`);
  return makeUnknownSpeaker();
}

// onChunk 给的是 ArrayBuffer（Int16 小端，16k），写入环形缓冲
function pushVoiceBuffer(arrayBuffer, channel) {
  const view = new DataView(arrayBuffer);
  const n = arrayBuffer.byteLength / 2;
  const cap = channel.vpRingBuffer.length;
  for (let i = 0; i < n; i++) {
    channel.vpRingBuffer[(channel.vpRingFilled + i) % cap] = view.getInt16(i * 2, true) / 32768;
  }
  channel.vpRingFilled += n;
}

// 从环形缓冲“末尾”往回取最近 durationMs 的音频，不依赖 ASR 时间戳起点对齐。
// 句子刚说完时调用，缓冲尾部就是该句语音，避免两个时钟起点不同导致的切片偏移。
function sliceRecentVoice(channel, durationMs) {
  const cap = channel.vpRingBuffer.length;
  let len = Math.floor((durationMs / 1000) * VP_SAMPLE_RATE);
  len = Math.min(len, cap, channel.vpRingFilled);
  if (len <= 0) return null;
  const startSample = channel.vpRingFilled - len;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = channel.vpRingBuffer[(startSample + i) % cap];
  }
  return out;
}

async function identifySpeakerForRecord(record, result, channel) {
  if (!vpReady) {
    finalizeSpeakerForRecord(record, resolveFallbackSpeaker(record, { reason: "引擎未就绪" }));
    return;
  }

  // 句子时长用 ASR 两个时间戳相减得到——同源相减抵消了“起点对齐”问题，可靠。
  // 但取音频锚定在缓冲末尾（句子刚说完），不依赖时间戳绝对值。
  const endMs = Number(result.timestampEnd ?? NaN);
  const startMs = Number(result.timestampStart ?? NaN);
  let durationMs = 4000; // 拿不到时长时的默认窗口
  if (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs) {
    durationMs = endMs - startMs;
  }
  durationMs = Math.max(VP_MIN_DURATION_MS, Math.min(VP_MAX_DURATION_MS, durationMs));

  // 等一拍，确保该句尾部音频已写入缓冲
  await new Promise((r) => setTimeout(r, 150));

  const pcm = sliceRecentVoice(channel, durationMs);
  // 短句优先继承上一位已确认说话人，避免 pending 长时间挂起。
  if (!pcm || pcm.length < (VP_SAMPLE_RATE * VP_MIN_DURATION_MS) / 1000) {
    finalizeSpeakerForRecord(record, resolveFallbackSpeaker(record, { reason: "短句音频不足" }));
    return;
  }

  let embedding;
  try {
    // 与注册侧同款：3 秒窗/1.5 秒步进窗口平均，保证两侧 embedding 同分布
    embedding = await extractAveragedEmbedding(pcm);
  } catch (e) {
    console.warn("提取声纹失败", e);
    finalizeSpeakerForRecord(record, resolveFallbackSpeaker(record, { reason: "embedding 提取失败" }));
    return;
  }
  if (!embedding) {
    finalizeSpeakerForRecord(record, resolveFallbackSpeaker(record, { reason: "embedding 为空" }));
    return;
  }

  const match = matchSpeaker(embedding, vpLibrary, 0.31);
  // 最高分与次高分挨太近时，优先沿用上一说话人，否则落为未识别。
  const ambiguous =
    match.matched &&
    match.runnerUpScore != null &&
    match.score - match.runnerUpScore < VP_AMBIGUOUS_MARGIN;
  vpLog(
    `[声纹] 句长${Math.round(durationMs)}ms 音频${(pcm.length / VP_SAMPLE_RATE).toFixed(1)}s ` +
      `最高余弦=${match.score.toFixed(3)} ` +
      `次高=${match.runnerUpScore != null ? match.runnerUpScore.toFixed(3) : "无"}` +
      `(${match.runnerUpName || "—"}) → ` +
      `${ambiguous ? "模糊·走降级收口" : match.matched ? "判定:" + match.name : "未识别(最接近:" + (match.nearestName || "无") + ")"}`
  );

  const resolved = ambiguous
    ? resolveFallbackSpeaker(record, { reason: "模糊句" })
    : match.matched
    ? {
        key: `vp-${match.id}`,
        name: match.name,
        role: vpLibrary.find((v) => v.id === match.id)?.role || "",
        avatar: vpLibrary.find((v) => v.id === match.id)?.avatar || match.name.slice(0, 1),
        color: vpLibrary.find((v) => v.id === match.id)?.color || "var(--text-tertiary)",
      }
    : makeUnknownSpeaker();

  finalizeSpeakerForRecord(record, resolved);
}

// 回填气泡的说话人信息（名字/头像/角色/颜色）
function updateBubbleSpeaker(localSegmentId, speaker) {
  const bubble = refs.bubbles?.querySelector(
    `[data-segment-id="${cssEscape(localSegmentId)}"]`
  );
  if (!bubble) return;
  const avatar = bubble.querySelector(".bubble-avatar");
  if (avatar) {
    avatar.textContent = speaker.avatar;
    avatar.style.background = speaker.color;
  }
  const nameEl = bubble.querySelector(".bubble-name");
  if (nameEl) nameEl.textContent = speaker.name;
  const roleEl = bubble.querySelector(".bubble-role");
  if (roleEl) roleEl.textContent = speaker.role || "";
}


function getVadSetting() {
  const silenceDuration = Number(refs.silenceDuration?.value || 500);
  const minSpeechDuration = Number(refs.minSpeechDuration?.value || 300);

  if (!Number.isFinite(silenceDuration) || !Number.isFinite(minSpeechDuration)) {
    setConfigStatus(mt("vad_must_number"), "error");
    setMeetingState("error", mt("config_error"));
    return null;
  }

  return {
    silence_duration: silenceDuration,
    min_speech_duration: minSpeechDuration,
  };
}

function startTimer() {
  stopTimer();
  refs.timer.textContent = "⏱ 00:00:00";
  timerId = window.setInterval(() => {
    if (!meetingStartedAt) {
      refs.timer.textContent = "⏱ 00:00:00";
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - meetingStartedAt) / 1000);
    refs.timer.textContent = `⏱ ${formatDuration(elapsedSeconds)}`;
    updateMeetingSubTitle();
  }, 1000);
}

function stopTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

async function safeCleanup(resetClient) {
  // #region debug-point B:safe-cleanup
  reportMicSystemDropDebug("B", "meeting-page-app.js:safeCleanup", "safeCleanup entered", {
    resetClient,
    meetingState,
    channelsCount: channels.length,
    segmentCount,
  });
  // #endregion
  if (isSubtitlePipActive()) {
    try {
      subtitlePipWindow.close();
    } catch {
      // 忽略关闭悬浮窗时的异常。
    }
  }

  for (const channel of channels) {
    try {
      await channel.capture?.stop();
      channel.capture = null;
    } catch {}
    if (resetClient) {
      try {
        channel.client?.close();
      } catch {}
      channel.client = null;
    }
    try {
      channel.systemStream?.getTracks().forEach((t) => t.stop());
    } catch {}
    channel.systemStream = null;
  }
  if (resetClient) {
    channels = [];
  }

  updateMicLevel(0);

  if (meetingState !== "transcribing" && meetingState !== "connecting") {
    refs.startBtn.disabled = false;
    refs.stopBtn.disabled = true;
  }

  if (meetingState === "finished" || meetingState === "error" || meetingState === "idle") {
    stopTimer();
  }
}

function formatDuration(totalSeconds) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return formatLocaleTime(Date.now(), { hour12: false }, getSystemLanguage());
  }

  if (timestamp > 1000000000000) {
    return formatLocaleTime(timestamp, { hour12: false }, getSystemLanguage());
  }

  return formatLocaleTime(Date.now(), { hour12: false }, getSystemLanguage());
}

function getSummaryDisplayTitle() {
  return `${currentMeetingTitle} · ${t("meeting_summary_suffix")}`;
}

function switchMeetingTab(target) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === target);
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.toggle("active", content.id === `tab-${target}`);
  });
}

function applyMeetingStaticTranslations() {
  document.title = mt("page_title");

  const homeLinks = document.querySelectorAll('a[href="home.html"]');
  if (homeLinks[0]) {
    homeLinks[0].title = mt("home_link_title");
  }
  const backHomeLink = document.getElementById("backHomeLink");
  const backHomeLabel = document.getElementById("backHomeLabel");
  if (backHomeLink) {
    backHomeLink.title = mt("home_link_short_title");
  }
  if (backHomeLabel) {
    backHomeLabel.textContent = mt("home_link_short");
  }

  const transcriptTab = document.querySelector('[data-tab="transcript"]');
  if (transcriptTab) {
    transcriptTab.textContent = mt("transcript_tab");
  }

  const summaryTab = document.querySelector('[data-tab="summary"]');
  if (summaryTab) {
    summaryTab.textContent = mt("summary_tab");
  }

  const configLabels = document.querySelectorAll(".meeting-config-field > span");
  if (configLabels[1]) {
    configLabels[1].textContent = mt("translator_model");
  }
  if (configLabels[2]) {
    configLabels[2].textContent = mt("main_language");
  }
  if (configLabels[3]) {
    configLabels[3].textContent = mt("meeting_target_language");
  }
  if (configLabels[4]) {
    configLabels[4].textContent = mt("silence_duration");
  }
  if (configLabels[5]) {
    configLabels[5].textContent = mt("min_speech_duration");
  }

  const assistantName = document.querySelector(".ai-name");
  const assistantSub = document.querySelector(".ai-sub");
  if (assistantName) assistantName.textContent = t("meeting_assistant_name");
  if (assistantSub) assistantSub.textContent = t("meeting_assistant_subtitle");
  if (refs.assistantInput && !refs.assistantInput.disabled) {
    refs.assistantInput.placeholder = t("meeting_assistant_placeholder");
  }

  const chipKeys = [
    ["meeting_assistant_chip_summary", "meeting_assistant_prompt_summary"],
    ["meeting_assistant_chip_questions", "meeting_assistant_prompt_questions"],
    ["meeting_assistant_chip_numbers", "meeting_assistant_prompt_numbers"],
    ["meeting_assistant_chip_translate", "meeting_assistant_prompt_translate"],
  ];
  refs.assistantChips.forEach((chip, index) => {
    const [labelKey, promptKey] = chipKeys[index] || [];
    if (!labelKey || !promptKey) {
      return;
    }
    chip.textContent = t(labelKey);
    chip.dataset.prompt = t(promptKey);
  });

  if (refs.btnSummaryRegenerate) refs.btnSummaryRegenerate.querySelector("span").textContent = t("meeting_summary_regenerate");
  if (refs.btnSummaryEdit) refs.btnSummaryEdit.querySelector("span").textContent = t("meeting_summary_edit");
  if (refs.btnSummaryCancel) refs.btnSummaryCancel.querySelector("span").textContent = t("common_cancel");
  if (refs.btnSummarySave) refs.btnSummarySave.querySelector("span").textContent = t("meeting_summary_save");
  if (refs.btnSummaryExport) refs.btnSummaryExport.querySelector("span").textContent = t("meeting_summary_export");

  if (refs.apiKeyInput) {
    refs.apiKeyInput.placeholder = mt("api_key_placeholder");
  }
  if (refs.btnFloat) {
    refs.btnFloat.title = mt("float_button_title");
    refs.btnFloat.querySelector("span").textContent = mt("float_button");
  }
  if (refs.startBtn) {
    refs.startBtn.title = mt("start_button_title");
  }
  if (refs.stopBtn) {
    refs.stopBtn.title = mt("stop_button_title");
    const stopLabel = refs.stopBtn.querySelector("span");
    if (stopLabel) {
      stopLabel.textContent = mt("stop_button");
    }
  }

  const settingsButton = document.querySelector('button[onclick*="settings.html"]');
  if (settingsButton) {
    settingsButton.title = mt("settings_button_title");
  }

  const autoScrollLabel = document.querySelector(".transcript-meta > span:last-child");
  if (autoScrollLabel) {
    autoScrollLabel.textContent = mt("auto_scroll");
  }

  const activeLabel = document.querySelector(".active-speakers > span:first-child");
  if (activeLabel) {
    activeLabel.textContent = mt("active_label");
  }
  const networkStatus = document.getElementById("networkStatus");
  if (networkStatus) {
    networkStatus.lastChild.textContent = mt("network_good");
  }

  if (refs.jumpLatestBtn) {
    const jumpLatestLabel = document.getElementById("jumpLatestLabel");
    if (jumpLatestLabel) {
      jumpLatestLabel.textContent = mt("jump_latest");
    }
  }

  if (refs.configStatus?.dataset.i18nKey) {
    let params = {};
    try {
      params = refs.configStatus.dataset.i18nParams
        ? JSON.parse(refs.configStatus.dataset.i18nParams)
        : {};
    } catch {
      params = {};
    }
    refs.configStatus.textContent = mt(refs.configStatus.dataset.i18nKey, params);
  }

  const floatModeButtons = Array.from(document.querySelectorAll(".float-mode-btn"));
  if (floatModeButtons[0]) floatModeButtons[0].textContent = mt("float_mode_source");
  if (floatModeButtons[1]) floatModeButtons[1].textContent = mt("float_mode_translation");
  if (floatModeButtons[2]) floatModeButtons[2].textContent = mt("float_mode_both");

  document.querySelectorAll(".bubble-action").forEach((button) => {
    if (button.classList.contains("starred")) {
      button.title = mt("bubble_starred");
      return;
    }
    if (button.querySelector("path[d*='M21 11.5']")) {
      button.title = mt("bubble_ask_ai");
      return;
    }
    button.title = mt("bubble_mark");
  });

  const drawerToggle = document.getElementById("drawerToggle");
  if (drawerToggle) drawerToggle.title = mt("drawer_collapse");
  const drawerExpand = document.getElementById("drawerExpand");
  if (drawerExpand) drawerExpand.title = mt("drawer_expand");
  if (refs.assistantSend) refs.assistantSend.title = mt("send_button_title");
  const levelMeter = document.querySelector(".level-meter");
  if (levelMeter) levelMeter.title = mt("mic_level_title");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSegmentText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const hasMeaningfulCharacters = /[A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff]/.test(normalized);
  return hasMeaningfulCharacters ? normalized : "";
}

function animateJumpLatestCount() {
  if (!refs.jumpLatestCount || pendingNewMessageCount <= 0) {
    return;
  }

  refs.jumpLatestCount.classList.remove("is-bump");
  requestAnimationFrame(() => {
    refs.jumpLatestCount.classList.add("is-bump");
  });
}

function countMeaningfulChars(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[。！？!?，、,.．…·:：;；"'“”‘’（）()【】\[\]<>《》「」『』\-—_～~`/\\|]+/g, "")
    .length;
}

function getSpeakerMetaByName(name) {
  const matched = getSpeakerPool().find((speaker) => speaker.name === name);
  if (matched) {
    return matched;
  }

  const fallbackName = String(name || mt("not_recorded"));
  return {
    avatar: fallbackName.trim().slice(0, 1) || mt("not_recorded").slice(0, 1),
    color: "var(--text-tertiary)",
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRichTextValue(value) {
  return String(value || "").trim();
}
