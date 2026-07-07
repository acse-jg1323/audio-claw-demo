import { AudioPcmCapture } from "./audio-pcm-capture.js";
import { SenseAudioWebSocketClient } from "./senseaudio-websocket-client.js";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const apiKeyInput = document.getElementById("apiKey");
const targetLanguageSelect = document.getElementById("targetLanguage");
const vadSettingInput = document.getElementById("vadSetting");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const sessionInfo = document.getElementById("sessionInfo");
const resultList = document.getElementById("resultList");
const logBox = document.getElementById("logBox");

let capture = null;
let client = null;
let resultCount = 0;

startBtn.addEventListener("click", startValidation);
stopBtn.addEventListener("click", stopValidation);
clearBtn.addEventListener("click", clearView);

async function startValidation() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("error", "缺少 API Key");
    appendLog("请先输入 API Key。");
    return;
  }

  let vadSetting = {};
  try {
    vadSetting = JSON.parse(vadSettingInput.value.trim());
  } catch (error) {
    setStatus("error", "VAD 配置错误");
    appendLog(`VAD JSON 解析失败：${error.message}`);
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  setStatus("connecting", "连接中");
  appendLog("开始初始化 ASR WebSocket 验证...");

  try {
    client = new SenseAudioWebSocketClient({
      apiKey,
      targetLanguage: targetLanguageSelect.value,
      vadSetting,
      onStatus: handleStatusChange,
      onResult: handleResult,
      onError: handleError,
      onLog: appendLog,
    });

    await client.connect();
    updateSessionInfo();
    appendLog("connected_success 已收到，准备发送 task_start。");

    await client.startTask();
    updateSessionInfo();
    appendLog("task_started 已收到，开始采集麦克风。");

    capture = new AudioPcmCapture({
      targetSampleRate: 16000,
      onChunk: (buffer) => {
        try {
          client.sendAudio(buffer);
        } catch (error) {
          handleError(error);
        }
      },
    });

    await capture.start();
    setStatus("transcribing", "识别中");
    appendLog("麦克风采集已启动，正在持续发送 PCM 音频片段。");
  } catch (error) {
    handleError(error);
    await safeCleanup(false);
  }
}

async function stopValidation() {
  stopBtn.disabled = true;
  appendLog("用户请求结束验证，准备发送 task_finish。");

  try {
    if (capture) {
      await capture.stop();
      capture = null;
      appendLog("麦克风采集已停止。");
    }

    if (client) {
      await client.finishTask();
      appendLog("task_finished 已收到。");
    }

    setStatus("finished", "已结束");
  } catch (error) {
    handleError(error);
  } finally {
    await safeCleanup(true);
  }
}

function handleStatusChange(nextStatus) {
  if (nextStatus === "connected") {
    setStatus("connected", "连接成功");
    updateSessionInfo();
    return;
  }

  if (nextStatus === "transcribing") {
    setStatus("transcribing", "识别中");
    updateSessionInfo();
    return;
  }

  if (nextStatus === "finished") {
    setStatus("finished", "已结束");
    updateSessionInfo();
    return;
  }

  if (nextStatus === "error") {
    setStatus("error", "识别失败");
  }
}

function handleResult(result) {
  resultCount += 1;

  const item = document.createElement("div");
  item.className = "result-item";
  item.innerHTML = `
    <div class="result-meta">
      <span>分段 ${result.segmentId ?? resultCount}</span>
      <span>结束时间 ${formatTimestamp(result.timestampEnd)}</span>
      <span>${result.isFinal ? "final" : "partial"}</span>
    </div>
    <div class="result-text">${escapeHtml(result.text || "(空文本)")}</div>
    ${
      result.translation
        ? `<div class="translation">${escapeHtml(result.translation)}</div>`
        : ""
    }
  `;

  if (resultList.querySelector(".empty")) {
    resultList.innerHTML = "";
  }

  resultList.appendChild(item);
  resultList.scrollTop = resultList.scrollHeight;

  appendLog(
    `result_final: segment=${result.segmentId ?? "?"}, text=${truncate(result.text, 40)}`
  );
}

function handleError(error) {
  setStatus("error", "出错");
  appendLog(`ERROR: ${error.message}`);
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function clearView() {
  resultCount = 0;
  resultList.innerHTML =
    '<div class="empty">点击“开始验证”后，麦克风音频会被转换为 16k 单声道 PCM 并发送到 SenseAudio WebSocket。</div>';
  logBox.textContent = "等待开始验证...";
  sessionInfo.textContent = "";
  setStatus("idle", "未开始");
}

function setStatus(type, text) {
  statusBadge.className = `badge status-${type}`;
  statusText.textContent = text;
}

function updateSessionInfo() {
  if (!client) {
    sessionInfo.textContent = "";
    return;
  }

  const parts = [];
  if (client.sessionId) {
    parts.push(`session_id: ${client.sessionId}`);
  }
  if (client.traceId) {
    parts.push(`trace_id: ${client.traceId}`);
  }
  sessionInfo.textContent = parts.join(" | ");
}

async function safeCleanup(resetSocketState) {
  if (capture) {
    await capture.stop();
    capture = null;
  }

  if (client && resetSocketState) {
    client.close();
    client = null;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

function appendLog(message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  const prefix = logBox.textContent === "等待开始验证..." ? "" : "\n";
  logBox.textContent += `${prefix}[${time}] ${message}`;
  logBox.scrollTop = logBox.scrollHeight;
}

function formatTimestamp(value) {
  if (!value) {
    return "--";
  }

  if (value > 1000000000000) {
    return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
  }

  return `${value} ms`;
}

function truncate(text, limit) {
  if (!text || text.length <= limit) {
    return text || "";
  }

  return `${text.slice(0, limit)}...`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
