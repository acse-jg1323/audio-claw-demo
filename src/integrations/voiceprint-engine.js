// 声纹引擎：浏览器端 CAM++ 声纹提取与比对
// 模型：app/models/campplus_cn_common.onnx  输入 [1,帧数,80] FBank，输出 [1,192]
// onnxruntime-web 通过 CDN ESM 动态加载，无需构建工具。

const ORT_VERSION = "1.20.1";
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.mjs`;
const ORT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = new URL("../../app/models/campplus_cn_common.onnx", import.meta.url).href;

// ---- Kaldi 兼容 FBank 参数（必须与 CAM++ 训练时一致）----
const SAMPLE_RATE = 16000;
const FRAME_LENGTH_MS = 25;
const FRAME_SHIFT_MS = 10;
const NUM_MEL_BINS = 80;
const FRAME_LENGTH = Math.round((SAMPLE_RATE * FRAME_LENGTH_MS) / 1000); // 400
const FRAME_SHIFT = Math.round((SAMPLE_RATE * FRAME_SHIFT_MS) / 1000); // 160
const FFT_SIZE = 512; // >= 400 的最近 2 的幂
const PREEMPH = 0.97;
const LOW_FREQ = 20;
const HIGH_FREQ = SAMPLE_RATE / 2;
const EPSILON = 1.1920929e-7; // Kaldi log 下限保护用的 FLT_EPSILON 量级

let ortModule = null;
let session = null;

async function loadOrt() {
  if (ortModule) return ortModule;
  ortModule = await import(/* @vite-ignore */ ORT_CDN);
  return ortModule;
}

export async function initVoiceprintEngine(options = {}) {
  const ort = await loadOrt();
  ort.env.wasm.wasmPaths = options.wasmPaths ?? ORT_WASM_PATHS;
  const modelUrl = options.modelUrl ?? MODEL_URL;
  session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  return session;
}

// ---- povey 窗（Kaldi 默认）----
const poveyWindow = (() => {
  const w = new Float32Array(FRAME_LENGTH);
  for (let i = 0; i < FRAME_LENGTH; i++) {
    const a = (2 * Math.PI * i) / (FRAME_LENGTH - 1);
    w[i] = Math.pow(0.5 - 0.5 * Math.cos(a), 0.85);
  }
  return w;
})();

// ---- mel 滤波器组（Kaldi 风格：hz<->mel，三角滤波，作用于功率谱 bin）----
function hzToMel(hz) {
  return 1127.0 * Math.log(1.0 + hz / 700.0);
}
function melToHz(mel) {
  return 700.0 * (Math.exp(mel / 1127.0) - 1.0);
}

const melBanks = (() => {
  const numFftBins = FFT_SIZE / 2 + 1;
  const melLow = hzToMel(LOW_FREQ);
  const melHigh = hzToMel(HIGH_FREQ);
  const melStep = (melHigh - melLow) / (NUM_MEL_BINS + 1);
  const binHz = SAMPLE_RATE / FFT_SIZE;
  // 每个 mel bin 存 {startBin, weights[]}
  const banks = [];
  for (let m = 0; m < NUM_MEL_BINS; m++) {
    const leftMel = melLow + m * melStep;
    const centerMel = melLow + (m + 1) * melStep;
    const rightMel = melLow + (m + 2) * melStep;
    const leftHz = melToHz(leftMel);
    const centerHz = melToHz(centerMel);
    const rightHz = melToHz(rightMel);
    let start = -1;
    const weights = [];
    for (let bin = 0; bin < numFftBins; bin++) {
      const hz = bin * binHz;
      let w = 0;
      if (hz > leftHz && hz < rightHz) {
        if (hz <= centerHz) w = (hz - leftHz) / (centerHz - leftHz);
        else w = (rightHz - hz) / (rightHz - centerHz);
      }
      if (w > 0) {
        if (start < 0) start = bin;
        weights.push(w);
      } else if (start >= 0 && hz >= rightHz) {
        break;
      }
    }
    banks.push({ start: start < 0 ? 0 : start, weights });
  }
  return banks;
})();

// ---- 实数 FFT（迭代 Cooley-Tukey，配 FFT_SIZE=512）----
function fftPowerSpectrum(frame) {
  const n = FFT_SIZE;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  re.set(frame); // frame 长度 FRAME_LENGTH，其余补零
  // 位反转
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr; wr = nwr;
      }
    }
  }
  const half = n / 2 + 1;
  const power = new Float32Array(half);
  for (let i = 0; i < half; i++) power[i] = re[i] * re[i] + im[i] * im[i];
  return power;
}

// ---- PCM(Float32, [-1,1], 16k) -> FBank [帧数, 80]，含实例级 CMN ----
export function computeFbank(pcm) {
  if (pcm.length < FRAME_LENGTH) return new Float32Array(0);
  const numFrames = 1 + Math.floor((pcm.length - FRAME_LENGTH) / FRAME_SHIFT);
  const feats = new Float32Array(numFrames * NUM_MEL_BINS);
  const frame = new Float32Array(FRAME_LENGTH);

  for (let t = 0; t < numFrames; t++) {
    const offset = t * FRAME_SHIFT;
    // Kaldi 默认输入按 int16 量级处理，乘 32768 对齐
    for (let i = 0; i < FRAME_LENGTH; i++) frame[i] = pcm[offset + i] * 32768;
    // 去直流
    let mean = 0;
    for (let i = 0; i < FRAME_LENGTH; i++) mean += frame[i];
    mean /= FRAME_LENGTH;
    for (let i = 0; i < FRAME_LENGTH; i++) frame[i] -= mean;
    // 预加重
    for (let i = FRAME_LENGTH - 1; i > 0; i--) frame[i] -= PREEMPH * frame[i - 1];
    frame[0] -= PREEMPH * frame[0];
    // 加窗
    for (let i = 0; i < FRAME_LENGTH; i++) frame[i] *= poveyWindow[i];

    const power = fftPowerSpectrum(frame);
    // mel + log
    for (let m = 0; m < NUM_MEL_BINS; m++) {
      const bank = melBanks[m];
      let acc = 0;
      for (let k = 0; k < bank.weights.length; k++) {
        acc += bank.weights[k] * power[bank.start + k];
      }
      feats[t * NUM_MEL_BINS + m] = Math.log(Math.max(acc, EPSILON));
    }
  }

  // 实例级 CMN（沿时间轴减均值）
  for (let m = 0; m < NUM_MEL_BINS; m++) {
    let mu = 0;
    for (let t = 0; t < numFrames; t++) mu += feats[t * NUM_MEL_BINS + m];
    mu /= numFrames;
    for (let t = 0; t < numFrames; t++) feats[t * NUM_MEL_BINS + m] -= mu;
  }
  return feats; // 长度 numFrames*80
}

// ---- 提取 192 维声纹 embedding（L2 归一化）----
export async function extractEmbedding(pcm) {
  if (!session) throw new Error("声纹引擎未初始化，请先 initVoiceprintEngine()");
  const ort = await loadOrt();
  const feats = computeFbank(pcm);
  const numFrames = feats.length / NUM_MEL_BINS;
  if (numFrames < 10) return null; // 太短，放弃
  const tensor = new ort.Tensor("float32", feats, [1, numFrames, NUM_MEL_BINS]);
  const out = await session.run({ feats: tensor });
  const emb = out.embedding.data; // Float32Array(192)
  return l2normalize(Float32Array.from(emb));
}

// 把一段 PCM 切成多个重叠窗口，各提一个 embedding 再平均归一化。
// 注册与识别共用，保证两侧 embedding 同分布（窗长一致），余弦才可比。
// 不足一个完整窗口时退回整段提取。
export async function extractAveragedEmbedding(pcm, { winSec = 3, hopSec = 1.5 } = {}) {
  const winLen = Math.round(SAMPLE_RATE * winSec);
  const hop = Math.max(1, Math.floor(SAMPLE_RATE * hopSec));
  const embs = [];
  for (let start = 0; start + winLen <= pcm.length; start += hop) {
    const seg = pcm.subarray(start, start + winLen);
    try {
      const e = await extractEmbedding(seg);
      if (e) embs.push(e);
    } catch {}
  }
  if (embs.length === 0) return await extractEmbedding(pcm);
  if (embs.length === 1) return embs[0];
  return averageEmbeddings(embs);
}

export function l2normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const norm = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // a,b 已 L2 归一化
}

// 多段 embedding 取平均后再归一化（注册时用）
export function averageEmbeddings(list) {
  if (!list.length) return null;
  const dim = list[0].length;
  const acc = new Float32Array(dim);
  for (const e of list) for (let i = 0; i < dim; i++) acc[i] += e[i];
  for (let i = 0; i < dim; i++) acc[i] /= list.length;
  return l2normalize(acc);
}

// 在声纹库里找最匹配的人；库项形如 {id,name,embedding:number[]}
export function matchSpeaker(embedding, library, threshold = 0.31) {
  let best = null;
  let bestScore = -Infinity;
  let runnerUp = null;
  let runnerUpScore = -Infinity;
  for (const item of library) {
    const score = cosineSimilarity(embedding, item.embedding);
    if (score > bestScore) {
      runnerUp = best;
      runnerUpScore = bestScore;
      best = item;
      bestScore = score;
    } else if (score > runnerUpScore) {
      runnerUp = item;
      runnerUpScore = score;
    }
  }
  const extra = {
    runnerUpScore: Number.isFinite(runnerUpScore) ? runnerUpScore : null,
    runnerUpName: runnerUp?.name ?? null,
  };
  if (best && bestScore >= threshold) {
    return { matched: true, id: best.id, name: best.name, score: bestScore, ...extra };
  }
  return { matched: false, id: null, name: "未识别", score: bestScore, nearestName: best?.name ?? null, ...extra };
}
