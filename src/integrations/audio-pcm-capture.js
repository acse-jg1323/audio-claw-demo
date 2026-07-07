export class AudioPcmCapture {
  constructor(options = {}) {
    this.targetSampleRate = options.targetSampleRate ?? 16000;
    this.bufferSize = options.bufferSize ?? 4096;
    this.onChunk = options.onChunk ?? (() => {});
    this.onLevel = options.onLevel ?? (() => {});
    this.providedStream = options.stream ?? null;

    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    if (this.providedStream) {
      this.mediaStream = this.providedStream;
    } else {
      // #region debug-point A:mic-getusermedia-request
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "mic-system-drop",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "audio-pcm-capture.js:start:getUserMedia:request",
          msg: "[DEBUG] mic getUserMedia request",
          data: { hasProvidedStream: false, targetSampleRate: this.targetSampleRate, bufferSize: this.bufferSize },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // #region debug-point A:mic-getusermedia-success
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "mic-system-drop",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "audio-pcm-capture.js:start:getUserMedia:success",
          msg: "[DEBUG] mic getUserMedia success",
          data: {
            audioTracks: this.mediaStream?.getAudioTracks?.().length ?? 0,
            trackStates: (this.mediaStream?.getAudioTracks?.() ?? []).map((track) => ({
              kind: track.kind,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState,
              label: track.label || "",
            })),
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    const AudioContextCtor =
      window.AudioContext ||
      window.webkitAudioContext ||
      window.AudioContext;
    this.audioContext = new AudioContextCtor();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.processorNode = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isRunning) {
        return;
      }

      const channelData = event.inputBuffer.getChannelData(0);
      this.onLevel(calculateLevel(channelData));

      const pcmBuffer = convertFloat32ToInt16Buffer(
        channelData,
        this.audioContext.sampleRate,
        this.targetSampleRate
      );

      if (pcmBuffer.byteLength > 0) {
        this.onChunk(pcmBuffer);
      }
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
    this.isRunning = true;
    // #region debug-point A:capture-started
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "mic-system-drop",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "audio-pcm-capture.js:start:ready",
        msg: "[DEBUG] audio capture started",
        data: {
          hasProvidedStream: Boolean(this.providedStream),
          sourceSampleRate: this.audioContext?.sampleRate ?? null,
          audioTracks: this.mediaStream?.getAudioTracks?.().length ?? 0,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

  async stop() {
    this.isRunning = false;

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

function convertFloat32ToInt16Buffer(float32Array, sourceSampleRate, targetSampleRate) {
  const downsampled = downsampleFloat32(float32Array, sourceSampleRate, targetSampleRate);
  const pcmBuffer = new ArrayBuffer(downsampled.length * 2);
  const view = new DataView(pcmBuffer);

  for (let i = 0; i < downsampled.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, downsampled[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return pcmBuffer;
}

function downsampleFloat32(float32Array, sourceSampleRate, targetSampleRate) {
  if (targetSampleRate === sourceSampleRate) {
    return float32Array;
  }

  if (targetSampleRate > sourceSampleRate) {
    throw new Error("Target sample rate must not exceed source sample rate.");
  }

  const sampleRateRatio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.round(float32Array.length / sampleRateRatio);
  const result = new Float32Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i += 1) {
      accum += float32Array[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function calculateLevel(float32Array) {
  if (!float32Array?.length) {
    return 0;
  }

  let sumSquares = 0;
  for (let i = 0; i < float32Array.length; i += 1) {
    sumSquares += float32Array[i] * float32Array[i];
  }

  const rms = Math.sqrt(sumSquares / float32Array.length);
  return Math.max(0, Math.min(1, rms * 3.2));
}
