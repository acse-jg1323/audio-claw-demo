# ASR 请求与返回示例

> 适用范围：当前 MVP 第一阶段 ASR 接口验证
> 当前接入方式：浏览器直连 SenseAudio WebSocket，开发期使用 API Key 直接鉴权
> 当前模型：`senseaudio-asr-deepthink-1.5-260319`

## 一、连接示例

当前验证页采用浏览器 WebSocket 直连方式，将 API Key 通过 URL 参数传入：

```text
wss://api.senseaudio.cn/ws/v1/audio/transcriptions?token=YOUR_API_KEY
```

说明：

- 这是开发联调阶段的临时方案，仅用于本机安全环境。
- 正式产品阶段应改为后端生成临时 Token，前端不直接持有长期密钥。

## 二、建立连接后的服务端响应示例

连接建立成功后，服务端会先返回 `connected_success`：

```json
{
  "event": "connected_success",
  "session_id": "trace-id-xxx",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## 三、开启任务请求示例

前端在连接成功后，发送 `task_start` 控制消息。

### 1. 仅转写

```json
{
  "event": "task_start",
  "model": "senseaudio-asr-deepthink-1.5-260319",
  "audio_setting": {
    "sample_rate": 16000,
    "format": "pcm",
    "channel": 1
  },
  "vad_setting": {
    "silence_duration": 500,
    "min_speech_duration": 300
  }
}
```

### 2. 转写 + 翻译

```json
{
  "event": "task_start",
  "model": "senseaudio-asr-deepthink-1.5-260319",
  "audio_setting": {
    "sample_rate": 16000,
    "format": "pcm",
    "channel": 1
  },
  "vad_setting": {
    "silence_duration": 500,
    "min_speech_duration": 300
  },
  "transcription_setting": {
    "target_language": "ja",
    "recognize_mode": "record_only"
  }
}
```

说明：

- `audio_setting` 当前固定为 `16kHz / PCM / 单声道`。
- `vad_setting` 用于控制分段策略。
- 当传入 `transcription_setting.target_language` 时，服务端会在结果中附带翻译字段。

## 四、开启任务后的服务端响应示例

```json
{
  "event": "task_started",
  "session_id": "trace-id-xxx",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## 五、音频流上传说明

`task_started` 之后，前端持续发送二进制音频帧。

当前浏览器侧处理逻辑是：

- 获取麦克风音频
- 转换为单声道
- 重采样到 `16000 Hz`
- 编码为 `PCM s16le`
- 通过 WebSocket 逐帧发送二进制数据

音频帧本身不是 JSON，而是 `ArrayBuffer / Binary Frame`。

## 六、识别结果返回示例

服务端会按照 VAD 自动断句，并在一句结束后返回一次 `result_final`。

### 1. 仅转写结果

```json
{
  "event": "result_final",
  "session_id": "trace-id-xxx",
  "data": {
    "text": "你好，今天天气真不错。",
    "is_final": true,
    "segment_id": 1,
    "timestamp_start": 0,
    "timestamp_end": 2560
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

### 2. 转写 + 翻译结果

```json
{
  "event": "result_final",
  "session_id": "trace-id-xxx",
  "data": {
    "text": "你好，今天天气真不错。",
    "translations": [
      {
        "language": "ja",
        "text": "こんにちは、今日はとても良い天気ですね。"
      }
    ],
    "is_final": true,
    "segment_id": 1,
    "timestamp_start": 0,
    "timestamp_end": 2560
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

说明：

- `text` 为原始语言识别结果。
- `translations` 为目标语言翻译结果数组。
- `segment_id` 为分段编号。
- `timestamp_start` / `timestamp_end` 为当前分段对应的时间信息。
- 当前前端验证页展示的是每个 `result_final` 分段的原文与第一条翻译结果。

## 七、结束任务请求示例

当会议结束或用户主动停止识别时，前端发送：

```json
{
  "event": "task_finish"
}
```

## 八、结束任务后的服务端响应示例

```json
{
  "event": "task_finished",
  "session_id": "trace-id-xxx",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

## 九、异常响应示例

如果请求参数不合法，或模型字段缺失，服务端会返回错误响应：

```json
{
  "event": "task_failed",
  "base_resp": {
    "status_code": 2013,
    "status_msg": "model is required"
  }
}
```

## 十、当前前端验证页实际使用的关键字段

当前验证页会从服务端结果中提取这些字段用于界面展示：

- `event`
- `session_id`
- `trace_id`
- `data.text`
- `data.translations`
- `data.segment_id`
- `data.timestamp_start`
- `data.timestamp_end`
- `data.is_final`

其中，翻译展示逻辑当前只取：

```text
data.translations[0].text
```

## 十一、当前阶段的结论

当前 MVP 第一步已经验证通过以下链路：

- 建立 WebSocket 连接
- 发送 `task_start`
- 上传麦克风音频二进制流
- 按分段接收 `result_final`
- 可选接收翻译结果
- 发送 `task_finish`
- 接收 `task_finished`

这意味着后续 `index.html` 已经可以进入真实接入改造阶段。
