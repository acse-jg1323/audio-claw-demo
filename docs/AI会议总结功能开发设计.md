# AI会议总结功能开发设计

## 一、文档目标

本文档用于固定 `M5. 会议总结` 的开发设计，作为后续前端接入、Summary Agent 接口设计、Prompt 编写、状态管理、编辑与导出开发的统一依据。

本功能对应：

- [系统功能与逻辑梳理.md](file:///Users/gejiaqi/Desktop/需求与原型(1)/系统功能与逻辑梳理.md#L144-L159) 中的 `M5. 会议总结`
- [index.html](file:///Users/gejiaqi/Desktop/需求与原型(1)/index.html#L1464-L1543) 中的 `会议总结` Tab 静态原型

当前结论：

- `M5` 比 `M4 AI 助手` 更适合优先开发
- `M5` 与已完成的 `实时转写 segment 流` 强绑定
- `M5` 可以在会议进行中手动触发，也可以在会议结束后自动触发
- `M5` 的页面结构已经在原型中固定，后续重点是接真实数据与状态流

---

## 二、功能定义

会议总结是会议工作区的第二个 Tab，基于当前会议已经产生的转写 segment，由 LLM 生成结构化总结，并允许用户继续编辑与导出。

总结结构固定为 5 个模块：

1. `AI 摘要`
2. `关键决议`
3. `待办与负责人`
4. `遗留问题`
5. `参会人发言占比`

其中：

- `参会人发言占比` 由程序计算
- 其余 4 部分由 Summary Agent 一次结构化生成

---

## 三、总体原则

### 3.1 总体方法

本功能采用如下总体方法：

- 先收集当前会议 `segment`
- 程序计算 `参会人发言占比`
- 调用 `Summary Agent`
- Summary Agent 输出稳定 `JSON`
- 前端渲染总结 Tab
- 用户可手动编辑
- 用户可导出

即：

`segment 收集 -> 发言占比计算 -> Summary LLM -> JSON 输出 -> 前端渲染 -> 手动编辑 -> 导出`

### 3.2 为什么这样设计

这样做的优点是：

- 保持输出结构稳定，方便前端渲染
- 避免让 LLM 计算发言占比这类程序更适合做的内容
- 让会中草稿总结与会后最终总结共用同一套结构
- 为后续存储、导出、再次打开总结页保留清晰数据模型

### 3.3 为什么不一开始拆成多次模型调用

MVP 阶段不建议一开始把：

- AI 摘要
- 关键决议
- 待办与负责人
- 遗留问题

拆成 4 次调用。

当前更推荐：

- `一次结构化总结主调用`
- `一次程序计算发言占比`

原因：

- 延迟更低
- 成本更低
- 输出风格更统一
- 更适合当前静态总结卡片原型的落地

后续若 `待办与负责人` 质量不稳定，再拆为第二次专用调用。

---

## 四、触发模式设计

### 4.1 会中手动触发

会议进行中，用户可随时手动点击生成总结。

定义：

- 名称：`草稿总结`
- 数据基础：截至当前的全部有效 segment
- 页面提示：应明确为“基于当前会议进度生成”

适用场景：

- 用户想快速查看当前讨论已形成的共识
- 会中需要把过去一段内容整理出来
- 销售、项目、双语会议场景下需要快速回顾

### 4.2 会后自动触发

会议结束后可自动触发总结生成。

定义：

- 名称：`最终总结`
- 数据基础：整场会议的全部有效 segment
- 页面提示：作为归档版本

### 4.3 两种模式的差异

- `草稿总结`：可不完整，可多次刷新
- `最终总结`：应作为最终归档版本

建议前端状态上体现：

- `草稿`
- `最终`
- `最后更新时间`

---

## 五、总结页前端状态设计

### 5.1 原型基线

当前总结页静态结构位于：

- [index.html](file:///Users/gejiaqi/Desktop/需求与原型(1)/index.html#L1464-L1543)

固定视觉块为：

- 标题区
- 导出按钮
- AI 摘要渐变块
- 关键决议卡片
- 待办列表
- 遗留问题
- 发言占比卡片

### 5.2 前端需要支持的真实状态

M5-1 阶段建议把当前静态页接成以下几种状态：

#### `empty`

尚未生成总结。

建议展示：

- 一个空态说明
- 一个主按钮：`生成当前总结`

如果会议已结束，可文案改为：

- `生成最终总结`

#### `loading`

总结生成中。

建议展示：

- 摘要区域 skeleton
- 决议、待办、遗留问题的骨架屏
- 顶部状态提示：`正在生成会议总结...`

#### `ready`

总结已生成完成。

展示完整 5 个模块。

#### `editing`

用户点击编辑后进入编辑态。

建议：

- `AI 摘要` 使用 `textarea`
- `关键决议` 使用可增删的行输入
- `待办与负责人` 使用结构化可编辑列表
- `遗留问题` 使用可编辑列表
- `发言占比` 先只读，不建议用户手动改

#### `error`

总结生成失败。

建议展示：

- 错误提示
- 重试按钮

### 5.3 建议按钮

原型当前已有：

- `导出`

后续需要补充的功能按钮建议如下：

- `生成当前总结`
- `重新生成`
- `编辑总结`
- `保存修改`
- `取消编辑`

不建议一开始加入太多按钮，避免破坏原型页面简洁性。

---

## 六、Summary 数据流设计

### 6.1 输入总流程

会议总结生成前，先由前端或后端聚合一个 `Summary Input Package`。

建议输入包结构如下：

```json
{
  "meeting_id": "meeting-001",
  "meeting_title": "AI 会议平台产品介绍",
  "summary_mode": "draft",
  "summary_language": "zh",
  "main_language": "zh",
  "meeting_target_language": "ja",
  "participants": [
    "李明",
    "田中 健太",
    "王芳",
    "佐藤 美咲"
  ],
  "segments": [
    {
      "segment_id": "1",
      "speaker": "李明",
      "speaker_role": "销售总监",
      "timestamp_end": 1716713882,
      "source_language": "zh",
      "text": "欢迎来到神泉科技。",
      "translated_text": "神泉テクノロジーへようこそ。"
    }
  ]
}
```

### 6.2 程序计算部分

Summary Agent 调用之前，程序先计算：

- `speaker_stats`

建议字段：

```json
[
  {
    "speaker": "李明",
    "char_count": 1234,
    "segment_count": 18,
    "ratio": 0.32
  }
]
```

MVP 阶段发言占比计算方法：

- 以每位 speaker 的转写文本总字符数占比为准

当前不建议交给模型计算。

### 6.3 Summary Agent 输入策略

建议把用于总结的正文输入统一整理为 `summary_source_segments`。

---

## 七、总结到底用原文还是译文

这是 M5 设计里的关键问题。

### 7.1 结论

MVP 推荐策略：

- `Summary Agent 输出语言` 由 `summary_language` 决定
- 输入材料以 `主阅读语言统一后的内容` 为主
- 原始 `text` 仍保留，用于追溯和必要时补充

### 7.2 推荐做法

为每个 segment 先准备一条“适合总结”的统一语言文本：

- 如果 `source_language == summary_language`
  - 使用 `text`
- 如果 `source_language != summary_language` 且存在可用 `translated_text`
  - 使用 `translated_text`
- 如果没有可用 `translated_text`
  - 回退使用 `text`

这样可得到一份 `normalized_summary_text`。

### 7.3 为什么不建议只丢原文

会议可能是混合语言：

- 中文
- 日语
- 英语

如果直接把全量原文扔给 Summary Agent：

- 模型可总结，但成本更高
- 风格可能不稳定
- 多语种混合时更难稳定生成统一语言总结

### 7.4 为什么不建议只丢译文

如果只丢译文：

- 可能丢失原始措辞
- 人名、术语、细节可能被翻译链路改写
- 后续核对原文会变难

### 7.5 MVP 推荐输入形态

推荐 Summary Agent 输入两套信息：

- `summary_segments`
  - 统一成 `summary_language` 的总结用正文
- `raw_segments`
  - 原始原文，仅作为参考与追溯

但在 MVP 第一版中，也可以先只传：

- `summary_segments`
- `participants`
- `speaker_stats`

这样已足够工作。

---

## 八、是否做双语 AI 总结

### 8.1 当前建议

MVP 第一版建议：

- **默认只生成单语言总结**
- 该语言默认跟随 `主阅读语言`

也就是：

- 页面主语言为中文时，总结默认用中文输出
- 页面主语言为日语时，总结默认用日语输出

### 8.2 为什么不建议第一版直接做双语总结

如果总结页同时输出双语：

- 版面会更复杂
- 编辑态更复杂
- 导出结构更复杂
- JSON schema 更重

而当前原型中的总结区明显是：

- 一套单语言卡片结构

### 8.3 如果后续要支持双语总结

建议方式不是让 Summary Agent 一次输出双语，而是：

- 先生成 `主阅读语言总结`
- 如有需要，再对总结 JSON 的文本字段做一次二次翻译

注意：

- 人名
- 负责人
- 参会人名

这些跟随界面主语言或参会人原始展示名，不强行翻译。

---

## 九、Summary Agent 输出 JSON Schema

MVP 建议输出如下固定结构：

```json
{
  "summary_version": "v1",
  "summary_mode": "draft",
  "summary_language": "zh",
  "title": "AI 会议平台产品介绍 · 会议总结",
  "ai_summary": "一段完整摘要。",
  "decisions": [
    {
      "text": "客户认可浏览器即用的部署模式。"
    }
  ],
  "action_items": [
    {
      "task": "准备 50 人规模正式报价方案。",
      "owner": "李明",
      "deadline": "2026-06-01",
      "owner_status": "confirmed"
    }
  ],
  "open_questions": [
    {
      "text": "客户尚未最终确定部署方式。"
    }
  ],
  "metadata": {
    "confidence_note": "如信息未明确，则填写未明确。"
  }
}
```

### 9.1 字段说明

- `summary_version`
  - 便于后续 schema 升级
- `summary_mode`
  - `draft` / `final`
- `summary_language`
  - 当前总结输出语言
- `title`
  - 可直接渲染到总结页标题
- `ai_summary`
  - 摘要主文案
- `decisions`
  - 决议数组
- `action_items`
  - 待办数组
- `open_questions`
  - 遗留问题数组

### 9.2 哪些字段允许为空

- `decisions`
- `action_items`
- `open_questions`

可以为空数组。

但：

- `ai_summary` 不应为空

如果信息不足，也应给出草稿型摘要。

---

## 十、Summary Agent Prompt 设计

## 10.1 模型路由建议

建议按模式区分模型：

- `draft`：可优先考虑 `senseaudio-s2-flash` 或 `senseaudio-s2-lite`，强调响应速度
- `final`：优先考虑 `senseaudio-s2`，强调结构化稳定性和总结质量

当前不在本轮文档里锁死最终模型，但建议把 `summary_mode` 作为模型路由参数。

---

## 10.2 System Prompt 初稿

```text
你是一个会议总结生成助手。

你的任务是基于一场会议的转写内容，生成结构化会议总结。

请严格遵守以下要求：

1. 只依据输入内容生成，不要编造会议中未出现的信息。
2. 输出必须是合法 JSON，不要输出任何 JSON 之外的解释文字。
3. 总结必须包含以下部分：
   - ai_summary：一段完整摘要
   - decisions：关键决议列表
   - action_items：待办与负责人列表
   - open_questions：遗留问题列表
4. 关键决议只保留会议中已经明确确认、拍板或形成一致意见的内容，不要把普通讨论点误写成决议。
5. 待办项必须尽量提取：
   - task：任务内容
   - owner：负责人
   - deadline：截止日期
   如果负责人或截止日期不明确，填写“未明确”。
6. owner 必须优先从给定参会人名单中选择；若会议中没有足够依据，则填写“未明确”。
7. 遗留问题只保留会议中已明确提出但尚未解决、尚未形成结论的问题。
8. ai_summary 必须是一段自然、简洁、适合放入会议总结卡片中的摘要，不要使用项目符号。
9. 输出语言必须严格使用 summary_language 指定的语言。
10. 不要翻译或改写参会人姓名，姓名按输入中的展示名保留。
11. 如果 summary_mode 为 draft，需要显式保持谨慎语气，不要把未完成讨论写成最终结论。

返回 JSON schema 如下：
{
  "summary_version": "v1",
  "summary_mode": "draft | final",
  "summary_language": "zh | ja | en",
  "title": "string",
  "ai_summary": "string",
  "decisions": [
    { "text": "string" }
  ],
  "action_items": [
    {
      "task": "string",
      "owner": "string",
      "deadline": "string",
      "owner_status": "confirmed | unclear"
    }
  ],
  "open_questions": [
    { "text": "string" }
  ],
  "metadata": {
    "confidence_note": "string"
  }
}
```

---

## 10.3 User Prompt 输入模板

MVP 建议使用结构化 user prompt，而不是直接把所有文本胡乱拼接。

```text
meeting_title: AI 会议平台产品介绍
summary_mode: draft
summary_language: zh
main_language: zh
meeting_target_language: ja

participants:
- 李明
- 田中 健太
- 王芳
- 佐藤 美咲

speaker_stats:
- 李明 | char_count: 1234 | ratio: 0.32
- 田中 健太 | char_count: 1080 | ratio: 0.28
- 王芳 | char_count: 960 | ratio: 0.25
- 佐藤 美咲 | char_count: 580 | ratio: 0.15

summary_segments:
- [14:18:02] 李明：欢迎来到神泉科技，今天非常感谢两位抽时间来听我们的产品介绍。
- [14:18:29] 田中 健太：希望能详细听一下贵公司 AI 会议平台的介绍。
- [14:20:11] 王芳：我们重点展示多语言实时识别、术语库和数据合规能力。

请根据以上内容输出合法 JSON，不要输出 JSON 以外的任何内容。
```

---

## 10.4 关于多语言 prompt

当前建议：

- `system prompt` 可以统一使用中文版本，便于内部控制
- `summary_language` 作为明确参数传给模型
- 输出语言由 `summary_language` 决定

后续如果发现：

- 日语输出质量明显不稳
- 英文输出风格不统一

再考虑分语言的 system prompt 模板。

MVP 第一版先不建议分成多套 prompt。

---

## 十一、各部分总结要点细化

### 11.1 AI 摘要

目标：

- 一段话概括会议主要讨论内容、客户关注点、当前结论与下一步

要求：

- 不写成项目符号
- 不超过 1 段
- 适配原型中的渐变背景区

### 11.2 关键决议

目标：

- 抽取已确认、已拍板、已形成一致意见的内容

要求：

- 不要把讨论倾向写成决议
- 每条一句话
- 建议 2-6 条

### 11.3 待办与负责人

目标：

- 抽取会后需要落实的任务项

要求：

- 尽量提取 `task / owner / deadline`
- `owner` 不明确时填写 `未明确`
- `deadline` 不明确时填写 `未明确`

这是当前总结模块中最难、最需要后续观察质量的部分。

### 11.4 遗留问题

目标：

- 抽取会议中已经明确提出但尚未解决的问题

要求：

- 不要和“关键决议”重复
- 没有则输出空数组

### 11.5 参会人发言占比

目标：

- 在总结页展示每位参会人的发言占比

要求：

- 程序计算
- 不走 LLM
- 当前按字符数比例展示

---

## 十二、前端编辑设计

### 12.1 编辑范围

以下内容支持手动编辑：

- `ai_summary`
- `decisions`
- `action_items`
- `open_questions`

### 12.2 不建议编辑的部分

- `speaker_stats`

原因：

- 这是程序计算结果
- 手动编辑会降低可信度

### 12.3 编辑态实现建议

- `AI 摘要`
  - `textarea`
- `关键决议`
  - 可增删列表
- `待办与负责人`
  - 可编辑结构化表单项
- `遗留问题`
  - 可增删列表

### 12.4 编辑态按钮

建议：

- `编辑总结`
- `保存修改`
- `取消编辑`

---

## 十三、导出设计

### 13.1 MVP 目标

优先实现：

- `Markdown`
- `PDF`
- `Word`

暂不优先实现：

- `邮件正文`

### 13.2 导出顺序建议

- `M5-6-1`：先做 Markdown
- `M5-6-2`：再做 PDF
- `M5-6-3`：再评估 Word

### 13.3 导出数据源

导出基于当前页面最终结构化数据：

- 如果用户已编辑
  - 导出编辑后的结果
- 如果用户未编辑
  - 导出 AI 原始结果

---

## 十四、接口分层建议

## 14.1 Summary 生成接口

建议定义为：

`POST /api/meeting-summary/generate`

请求体：

```json
{
  "meeting_id": "meeting-001",
  "summary_mode": "draft",
  "summary_language": "zh",
  "segments": [],
  "speaker_stats": []
}
```

响应体：

```json
{
  "status": "success",
  "summary": {
    "summary_version": "v1",
    "summary_mode": "draft",
    "summary_language": "zh",
    "title": "AI 会议平台产品介绍 · 会议总结",
    "ai_summary": "......",
    "decisions": [],
    "action_items": [],
    "open_questions": [],
    "metadata": {
      "confidence_note": "......"
    }
  }
}
```

## 14.2 Summary 保存接口

建议定义为：

`POST /api/meeting-summary/save`

用于保存：

- AI 原始结果
- 用户编辑后的结果

## 14.3 Summary 获取接口

建议定义为：

`GET /api/meeting-summary/:meeting_id`

用于：

- 历史会议再次打开时回填总结 Tab

## 14.4 导出接口

可后续拆为：

- `POST /api/meeting-summary/export/markdown`
- `POST /api/meeting-summary/export/pdf`
- `POST /api/meeting-summary/export/docx`

MVP 阶段也可以先由前端生成 Markdown。

---

## 十五、前后端责任边界

### 前端负责

- Summary Tab 的空态 / 加载态 / 结果态 / 编辑态
- 用户手动触发生成
- 渲染 JSON 结果
- 编辑交互
- 导出入口

### 后端负责

- 收集会议 segment
- 生成 `speaker_stats`
- 路由 Summary Agent 模型
- 调用 LLM
- 返回结构化 JSON
- 保存总结结果
- 导出文件生成

### 当前开发阶段的特殊情况

由于当前项目仍在前端原型逐步接真阶段，M5 第一轮也可以像实时转写那样：

- 前端先直接调用模型接口验证总结效果
- 后续再把生成逻辑移到后端

正式产品仍建议：

- Summary Agent 放到后端

---

## 十六、M5 落地顺序

### M5-1

把当前总结 Tab 从静态内容改造成真实结构，并支持：

- 空态
- 加载态
- 结果态
- 编辑态

### M5-2

增加 `speaker_stats` 程序计算。

### M5-3

打通 Summary Agent，一次输出结构化 JSON。

### M5-4

前端把 JSON 渲染成：

- AI 摘要
- 关键决议
- 待办与负责人
- 遗留问题
- 发言占比

### M5-5

增加手动编辑：

- 编辑
- 保存
- 取消

### M5-6

增加导出：

- Markdown
- PDF
- Word

---

## 十七、当前建议的实施结论

1. `M5` 现在可以优先开发，优先级高于 `M4`
2. `会中手动触发 + 会后自动触发` 的双模式成立
3. `发言占比` 由程序计算
4. 其余 4 个模块由 Summary Agent 一次结构化输出
5. `Summary Agent` 默认输出单语言总结，语言跟随 `summary_language`
6. 输入建议以统一到主阅读语言后的 `summary_segments` 为主，必要时保留原文参考
7. 前端必须支持空态、加载态、结果态、编辑态
8. 导出先做 Markdown，再逐步扩展到 PDF / Word

以上结论可作为 M5 开发的统一基线。
