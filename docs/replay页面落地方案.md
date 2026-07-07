# Replay 页面落地方案✅

## 一、文档目标

本文档用于固定 `index.html` 的 `replay` 模式落地方案，明确：

- `replay` 是什么
- 它与 `live` 的区别是什么
- 用户从 `home` 点击历史会议卡片后，进入页面应该看到什么
- 本次开发需要实现哪些功能
- 哪些内容暂时不做

本方案只聚焦：

- `home` 历史会议卡片点击后的回看体验
- `index.html` 在 `mode=replay` 下的页面状态与只读逻辑
- 已归档会议的 transcript / summary 重建展示

不扩展到：

- 新建回放页面
- 云端回放
- 音频播放器
- transcript 编辑
- AI 总结编辑

***

## 二、Replay 的产品定义

### 2.1 核心定义

`replay` 不是一场新的会议，也不是重新进入实时会议。

`replay` 的本质是：

- 复用现有 `index.html`
- 根据 `meetingId` 读取一场已经归档完成的会议
- 以只读方式展示这场会议的完整记录

一句话定义：

`live = 开会`

`replay = 回看`

### 2.2 进入方式

用户路径固定为：

1. 登录系统
2. 进入 `home.html`
3. 在历史会议区点击某张已归档卡片
4. 跳转到：

```text
index.html?meetingId=xxx&mode=replay
```

***

## 三、Replay 与 Live 的区别

### 3.1 `live` 模式

`live` 模式继续承担真实会议工作区职责：

- 可开始会议
- 可结束会议
- 可连接 WebSocket
- 可启动麦克风采集
- 可持续接收转写流
- 可持续保存 transcript / summary
- 可在会后归档

### 3.2 `replay` 模式

`replay` 模式是只读回看：

- 不允许开始会议
- 不允许结束会议
- 不允许连接 WebSocket
- 不允许启动麦克风
- 不允许产生新的实时转写
- 不允许重新走会中链路
- 只负责加载并展示已归档会议内容

### 3.3 本次开发的明确边界

本次 `replay` 开发先只做到：

- 读取历史会议
- 渲染 transcript
- 渲染 summary
- 页面进入后状态正确
- 所有会中交互被禁用或失效

本次暂不做：

- AI 总结编辑
- transcript 修改
- 重新生成总结
- 回放音频
- 逐句播放高亮

***

## 四、Replay 进入后的页面形态

### 4.1 整体原则

`replay` 不新开页面模板，而是继续复用当前 `index.html` 的整体结构。

原因：

- 当前会议页已经成熟
- 用户对该页面结构已熟悉
- 复用可以降低开发成本
- `live / replay` 共享同一页面更利于维护

### 4.2 顶栏应呈现的状态

进入 `replay` 后，顶栏应表现为“历史回看页”，而不是“待开始会议页”。

建议呈现如下信息：

- 会议真实标题
- 语言对
- 参会人数
- 当前状态文案：`历史回看` 或 `已归档`
- 返回主页入口保留

右上角按钮处理原则：

- `开始` 按钮禁用或隐藏
- `结束` 按钮禁用或隐藏
- 不允许用户误以为还能启动实时会议

### 4.3 Transcript 页签

进入 `replay` 后：

- 页签结构保留
- 原“实时转写流”区域改为展示已保存 transcript
- 页面初始化时直接渲染历史 segment
- 不再接收新的 segment
- 不再触发流式更新

每条 transcript 仍保持现有气泡结构，展示：

- 说话人
- 角色
- 时间
- 原文
- 译文

### 4.4 Summary 页签

进入 `replay` 后：

- 直接展示归档时保存的 summary
- 不再走“生成中”逻辑
- 不再自动重新生成
- 不显示 `归档并返回首页`

总结页目标是：

- 把这场会议的已归档总结稳定展示出来

***

## 五、Replay 模式下的行为规则

### 5.1 必须禁止的行为

在 `mode=replay` 下，必须禁止以下行为：

- 请求麦克风权限
- 创建音频采集实例
- 建立 ASR WebSocket 连接
- 启动实时计时会中流程
- 持续写入新的会议片段
- 重新触发会中流式链路

### 5.2 允许的行为

在 `mode=replay` 下，允许的行为仅包括：

- 查看 transcript
- 查看 summary
- 切换标签页
- 返回主页

### 5.3 页面应为只读

本次方案中，`replay` 页面整体按只读处理：

- transcript 不可编辑
- summary 不可编辑
- 配置区不参与实时会议控制

后续如需只开放“编辑 AI 总结”，再单独扩展。

***

## 六、Replay 的数据读取规则

### 6.1 读取入口

`index.html` 初始化时，根据 URL 读取：

- `meetingId`
- `mode`

当：

- `mode === replay`

则进入 `replay` 初始化逻辑。

### 6.2 数据来源

当前阶段统一从本地 `meeting-store` 读取：

- `getMeetingById(meetingId)`

读取后用于恢复：

- `title`
- `mainLanguage`
- `meetingTargetLanguage`
- `participants`
- `transcriptSegments`
- `summary`
- `startedAt`
- `endedAt`
- `durationSeconds`

### 6.3 权限校验

进入 `replay` 前必须校验：

- 该会议存在
- 该会议属于当前登录用户
- 该会议状态为 `finished`

如果不满足上述条件：

- 不允许进入回看
- 给出提示后返回 `home.html`

***

## 七、Replay 页面应展示的内容

### 7.1 顶部信息

最少展示：

- 会议标题
- 语言对
- 参会人数
- 已归档状态
- 时长

### 7.2 Transcript 内容

由 `transcriptSegments` 逐条恢复。

每条 segment 至少展示：

- `speaker.name`
- `speaker.role`
- `timestampEnd`
- `text`
- `translation`

### 7.3 Summary 内容

由已归档的 `summary` 直接恢复。

继续沿用当前总结渲染结构，包括：

- 摘要
- 关键决策
- 待办事项
- 风险 / 开放问题
- 参会人与发言占比

***

## 八、开发实现方案

### 8.1 总体方案

建议在 `meeting-page-app.js` 中增加两类初始化入口：

- `initLiveMode()`
- `initReplayMode()`

当前初始化逻辑根据 `mode` 分流：

- `mode=live`：继续走现有实时会议链路
- `mode=replay`：走历史回看链路

### 8.2 `replay` 初始化建议顺序

建议按以下步骤实现：

1. 读取 URL 参数
2. 判断当前是否为 `mode=replay`
3. 读取会议记录
4. 校验会议存在、归属正确、状态为 `finished`
5. 把页面切换为只读回看状态
6. 渲染顶部信息
7. 渲染 transcript
8. 渲染 summary

### 8.3 页面切只读时需要处理的控件

建议至少处理以下区域：

- `开始` 按钮
- `结束` 按钮
- 配置输入区
- 会后归档按钮

目标是让用户一眼知道：

- 这是一场已结束的会议
- 当前页面不可再发起会中动作

***

## 九、文件落点

### 9.1 主要改动文件

本次 `replay` 开发，主要改动集中在：

- `src/meeting/meeting-page-app.js`
- `app/index.html`

### 9.2 改动职责

#### `src/meeting/meeting-page-app.js`

承担：

- 区分 `live / replay`
- 在 `replay` 下读取会议记录
- 在 `replay` 下恢复 transcript
- 在 `replay` 下恢复 summary
- 在 `replay` 下关闭实时链路

#### `app/index.html`

承担：

- 根据 `replay` 状态显示正确的按钮和状态文案
- 为只读展示预留必要状态样式

***

## 十、本次开发的功能清单

本次 `replay` 模式实现，必须完成以下结果：

### 10.1 入口正确

- 从 `home` 历史卡片点击进入 `mode=replay`

### 10.2 数据正确

- 能读取对应 `meetingId` 的已归档会议

### 10.3 页面正确

- 顶栏状态为回看态
- transcript 被真实恢复
- summary 被真实恢复

### 10.4 行为正确

- 不启动麦克风
- 不连接 WebSocket
- 不允许开始/结束会议

### 10.5 权限正确

- 只能看自己的已归档会议

***

## 十一、本次明确不做

为了控制范围，本次 `replay` 开发明确不做：

- 编辑 transcript
- 编辑 summary
- 再生成总结
- 导出文件
- 音频回放
- 段落高亮播放
- 历史会议搜索筛选联动

这些内容如后续需要，再新增独立开发项。

***

## 十二、验收口径

本次 `replay` 开发按以下标准验收：

### 12.1 正常进入

- 点击历史会议卡片后，不再进入一场新的空白会议页
- 而是进入对应历史会议的回看页

### 12.2 Transcript 正确恢复

- 历史会议中的转写内容能完整展示

### 12.3 Summary 正确恢复

- 归档后的会议总结能直接展示

### 12.4 页面只读

- 在 `replay` 页不能开始、结束或重新进入实时链路

### 12.5 权限与异常处理正确

- 非本人会议不可查看
- 不存在的会议不可查看
- 未归档会议不可按 `replay` 方式查看

***

## 十三、最终结论

`replay` 的正确落地方式已经明确为：

- 不新做页面
- 复用 `index.html`
- 用 `mode=replay` 切成只读回看模式
- 从本地会议归档中恢复 transcript 与 summary
- 与 `live` 模式严格分离

后续代码实现应严格以本方案为准推进，避免把 `replay` 做成“又像 live、又不像回看”的混合状态。
