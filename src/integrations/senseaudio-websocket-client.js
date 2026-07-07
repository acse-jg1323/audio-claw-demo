const WS_URL = "wss://api.senseaudio.cn/ws/v1/audio/transcriptions";
const MODEL_NAME = "senseaudio-asr-deepthink-1.5-260319";

export class SenseAudioWebSocketClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? "";
    this.targetLanguage = options.targetLanguage ?? "";
    this.url = options.url ?? WS_URL;
    this.model = options.model ?? MODEL_NAME;
    this.vadSetting = options.vadSetting ?? {
      silence_duration: 500,
      min_speech_duration: 300,
    };

    this.socket = null;
    this.sessionId = null;
    this.traceId = null;
    this.isClosing = false;

    this.onStatus = options.onStatus ?? (() => {});
    this.onResult = options.onResult ?? (() => {});
    this.onError = options.onError ?? (() => {});
    this.onLog = options.onLog ?? (() => {});
  }

  async connect() {
    if (!this.apiKey) {
      throw new Error("Missing SenseAudio API key.");
    }

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${this.url}?token=${encodeURIComponent(this.apiKey)}`;

    await new Promise((resolve, reject) => {
      let settled = false;
      this.socket = new WebSocket(wsUrl);

      this.socket.addEventListener("open", () => {
        this.onLog("WebSocket open");
      });

      this.socket.addEventListener("message", (event) => {
        const payload = safeJsonParse(event.data);
        if (!payload) {
          return;
        }

        this.sessionId = payload.session_id ?? this.sessionId;
        this.traceId = payload.trace_id ?? this.traceId;
        this.handleMessage(payload);

        if (payload.event === "connected_success" && !settled) {
          settled = true;
          resolve();
        }
      });

      this.socket.addEventListener("error", () => {
        const error = new Error("WebSocket connection failed.");
        this.onError(error);
        if (!settled) {
          settled = true;
          reject(error);
        }
      });

      this.socket.addEventListener("close", () => {
        this.onLog("WebSocket closed");
        if (settled && !this.isClosing) {
          this.onStatus("error");
        }
      });
    });
  }

  async startTask() {
    this.ensureSocketOpen();

    const payload = {
      event: "task_start",
      model: this.model,
      audio_setting: {
        sample_rate: 16000,
        format: "pcm",
        channel: 1,
      },
      vad_setting: this.vadSetting,
    };

    if (this.targetLanguage) {
      payload.transcription_setting = {
        target_language: this.targetLanguage,
        recognize_mode: "record_only",
      };
    }

    this.sendJson(payload);
    await this.waitForEvent("task_started");
  }

  sendAudio(buffer) {
    this.ensureSocketOpen();
    this.socket.send(buffer);
  }

  isConnected() {
    return Boolean(this.socket) && this.socket.readyState === WebSocket.OPEN;
  }

  async finishTask() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.isClosing = true;
    this.sendJson({ event: "task_finish" });
    await this.waitForEvent("task_finished");
  }

  close() {
    if (!this.socket) {
      return;
    }

    this.isClosing = true;
    this.socket.close();
    this.socket = null;
  }

  sendJson(payload) {
    this.ensureSocketOpen();
    this.socket.send(JSON.stringify(payload));
    this.onLog(`send: ${payload.event}`);
  }

  waitForEvent(targetEvent) {
    this.ensureSocketOpen();

    return new Promise((resolve, reject) => {
      const handleMessage = (event) => {
        const payload = safeJsonParse(event.data);
        if (!payload) {
          return;
        }

        if (payload.event === targetEvent) {
          cleanup();
          resolve(payload);
          return;
        }

        if (payload.event === "task_failed") {
          cleanup();
          reject(
            new Error(payload.base_resp?.status_msg || "SenseAudio task failed.")
          );
        }
      };

      const handleClose = () => {
        cleanup();
        reject(new Error(`Socket closed before ${targetEvent}.`));
      };

      const cleanup = () => {
        this.socket?.removeEventListener("message", handleMessage);
        this.socket?.removeEventListener("close", handleClose);
      };

      this.socket.addEventListener("message", handleMessage);
      this.socket.addEventListener("close", handleClose);
    });
  }

  handleMessage(payload) {
    const eventName = payload.event;

    if (eventName === "connected_success") {
      this.onStatus("connected");
      return;
    }

    if (eventName === "task_started") {
      this.onStatus("transcribing");
      return;
    }

    if (eventName === "result_final") {
      this.onResult(normalizeResult(payload));
      return;
    }

    if (eventName === "task_finished") {
      this.onStatus("finished");
      return;
    }

    if (eventName === "task_failed") {
      const error = new Error(payload.base_resp?.status_msg || "Task failed.");
      this.onStatus("error");
      this.onError(error);
    }
  }

  ensureSocketOpen() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected.");
    }
  }
}

function normalizeResult(payload) {
  const translations = Array.isArray(payload.data?.translations)
    ? payload.data.translations
    : [];
  const firstTranslation = translations[0]?.text ?? "";

  return {
    event: payload.event,
    sessionId: payload.session_id ?? "",
    traceId: payload.trace_id ?? "",
    text: payload.data?.text ?? "",
    translation: firstTranslation,
    translations,
    segmentId: payload.data?.segment_id ?? null,
    timestampStart: payload.data?.timestamp_start ?? null,
    timestampEnd: payload.data?.timestamp_end ?? null,
    isFinal: payload.data?.is_final ?? true,
  };
}

function safeJsonParse(value) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
