# 账号-Home-会议闭环开发方案

## 一、文档目标

本文档用于固定当前阶段“账号进入系统 -> Home 主页 -> 发起会议 -> 会中返回 -> 会后归档 -> 历史回看 -> 权限差异”的开发逻辑与实施安排，作为后续页面补全、状态接入、会议存储、权限控制与联调的统一依据。

本方案建立在以下前提上：

- 会议工作区 `index.html` 已具备真实的流式转写与会议总结能力
- `home / admin / terms / voiceprint / settings` 当前仍以原型页面为主，需要补全功能并连接页面
- 当前阶段采用 `Demo 级账号密码校验 + 前端本地存储`，不接入真实账户系统
- 历史会议回看直接复用现有 `index.html` 页面，不新增独立回看页

本功能对应：

- [系统功能与逻辑梳理.md](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/系统功能与逻辑梳理.md#L43-L56) 中的角色与权限边界
- [系统功能与逻辑梳理.md](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/系统功能与逻辑梳理.md#L294-L305) 中的页面清单与页面职责
- [MVP产品POC模块与用户流转.md](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/MVP产品POC模块与用户流转.md#L68-L99) 中的“账号与最小权限”原则
- [MVP开发任务分解看板.md](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/MVP开发任务分解看板.md#L298-L352) 中的阶段六与阶段七目标

***

## 二、当前结论

当前阶段统一采用如下结论：

1. 只实现两种角色：✅
   - `admin`
   - `member`
2. 不做真实注册、组织协同、服务端鉴权✅
3. 登录页使用预设账号密码，错误输入需要给出明确提示，例如“密码不正确”✅
4. 会议数据保存在前端本地存储中
5. `index.html` 同时承担：
   - `live` 实时会议模式
   - `replay` 历史回看模式
6. `home.html` 作为登录后的默认首页，承担：
   - 开始新会议
   - 展示进行中会议
   - 展示历史会议卡片
   - 跳转到资产库、设置、组织管理
7. `admin.html` 仅管理员可见与可进入
8. `terms.html / voiceprint.html / settings.html` 在本阶段先完成最小权限差异与页面联动，不追求复杂数据后端

***

## 三、为什么现在做这一部分

### 3.1 产品层面的原因

当前会议页虽然已经能完成“开会 -> 实时转写 -> 会后总结”，但仍然是单页面体验，不足以形成“一个可登录、可进入、可查看历史、可管理权限”的完整产品闭环。

对外演示时，甲方更容易感知的不是某个单点能力，而是以下整体体验：

- 用户如何进入系统
- 不同身份看到什么
- 如何从首页发起会议
- 会议结束后内容是否能保留
- 历史会议是否可以回看
- 管理员是否具备额外入口

### 3.2 研发层面的原因

当前真实能力已经集中在会议页，说明主链路中最重的部分已经存在。本阶段要补的重点不是新算法，而是：

- 页面与页面之间的连接
- 会议数据结构的定义
- 会议数据的本地持久化
- 角色与页面显示差异

因此，本阶段属于“把已有能力串成产品”的工作，投入产出比高，适合立即推进。

***

## 四、范围定义

### 4.1 本阶段必须完成的范围

- 登录页
- Demo 级账号密码校验
- 登录失败提示
- 登录态保存
- `home.html` 作为真实主页接入
- `home -> index` 的开始会议入口
- `home -> index` 的进行中会议返回入口
- `home -> index` 的历史会议回看入口
- 会议结束后保存转写与总结
- 会议归属到当前登录用户
- 普通用户与管理员的最小权限差异
- `admin.html` 的角色限制
- 术语页与导航层的基础权限差异

### 4.2 本阶段明确不做的范围

- 真注册
- 真找回密码
- 真服务端登录接口
- 真 token / session / cookie 鉴权
- 多人同时在线编辑同一会议
- 多账号共同查看同一会议
- 企业组织真实成员增删改后端同步
- 跨设备同步会议数据
- 管理员查看其他用户个人声纹或个人术语

***

## 五、角色与权限口径

### 5.1 角色定义

当前阶段采用两角色最小实现：

- `member`：普通用户
- `admin`：管理员

未来如需与甲方三角色文档统一，可在数据层预留 `owner`，但当前不进入界面与交互实现。

### 5.2 权限边界

#### `member`

- 可以登录
- 可以进入 `home.html`
- 可以发起会议
- 可以查看自己的会议
- 可以回看自己的历史会议
- 可以查看并编辑自己的会议总结
- 可以进入 `terms.html`
- 可以编辑“我的术语”
- 可以只读查看“企业共享术语”
- 可以进入 `voiceprint.html` 并管理自己的声纹
- 可以进入 `settings.html`
- 不可进入 `admin.html`

#### `admin`

- 具备 `member` 的全部能力
- 可以进入 `admin.html`
- 可以在 `terms.html` 中编辑企业共享术语
- 可以在导航中看到“组织管理”

### 5.3 页面可见性规则

| 页面                | member    | admin   | 说明          |
| ----------------- | --------- | ------- | ----------- |
| `login.html`      | 可见        | 可见      | 登录入口        |
| `home.html`       | 可见        | 可见      | 登录后默认页      |
| `index.html`      | 可见        | 可见      | 会议工作区 / 回看页 |
| `terms.html`      | 可见        | 可见      | 权限差异在编辑能力   |
| `voiceprint.html` | 可见        | 可见      | 仅个人资产       |
| `settings.html`   | 可见        | 可见      | 权限相同        |
| `admin.html`      | 不可见 / 不可进 | 可见 / 可进 | 管理员独占       |

### 5.4 导航规则

- `member` 登录后，侧栏不显示“组织管理”，或显示但为禁用状态且不可点击
- `admin` 登录后，侧栏显示正常的“组织管理”入口
- 页面底部用户身份卡片需要同步显示当前用户昵称与角色文案

***

## 六、账号方案

### 6.1 为什么采用 Demo 级账号

当前目标是验证产品闭环，不是建设正式的用户系统。采用预设账号可以：

- 快速完成演示链路
- 避免引入后端接口与鉴权复杂度
- 让“不同身份显示差异”立即可验证
- 便于后续替换为真实接口

### 6.2 预设账号建议

建议内置两组账号：

```json
[
  {
    "id": "u_admin_001",
    "role": "admin",
    "name": "李明",
    "company": "神泉科技",
    "email": "admin@demo.com",
    "password": "admin123"
  },
  {
    "id": "u_member_001",
    "role": "member",
    "name": "王敏",
    "company": "神泉科技",
    "email": "member@demo.com",
    "password": "member123"
  }
]
```

### 6.3 登录交互要求

登录页至少包含：

- 账号输入框
- 密码输入框
- 登录按钮
- 错误提示区域
- 可选的 Demo 账号提示文案

输入校验逻辑：

- 账号为空：提示“请输入账号”
- 密码为空：提示“请输入密码”
- 账号不存在：提示“账号不存在”
- 账号存在但密码不匹配：提示“密码不正确”
- 账号密码正确：进入 `home.html`

### 6.4 登录态保存要求

登录成功后，需要在本地存储中至少保存：

```json
{
  "userId": "u_admin_001",
  "role": "admin",
  "name": "李明",
  "company": "神泉科技",
  "email": "admin@demo.com",
  "loginAt": "2026-06-21T10:00:00.000Z"
}
```

### 6.5 路由守卫规则

所有登录后页面在初始化时都要检查当前登录态：

- 未登录：跳回 `login.html`
- 已登录但访问 `admin.html` 且角色不是 `admin`：跳回 `home.html` 并提示“当前账号无访问权限”

***

## 七、会议归属与本地存储方案

### 7.1 总体原则

一场会议默认由一个登录用户发起，并默认归属于该用户。这与 MVP 文档中的产品假设保持一致。

即：

- 谁发起会议
- 会议就挂在哪个账号下
- 当前阶段不做多人协同账号归属

### 7.2 为什么用本地存储

当前会议页已经可以生成真实转写内容与总结内容，但并没有把这些内容长期保存。本阶段采用本地存储，目标是以最小成本完成：

- Home 的历史会议列表
- 会议结束后的归档
- 点击卡片回看
- 登录后区分“我的会议”

### 7.3 存储建议

建议优先使用 `localStorage`，并将不同类型数据分开管理：

- `ac_demo_users`
- `ac_current_user`
- `ac_meetings`
- `ac_meeting_drafts`
- `ac_app_preferences`

如后续会议记录体积明显增大，再评估切换到 `IndexedDB`。在当前 MVP 里，可先使用 `localStorage` 完成闭环。

### 7.4 会议数据模型

建议统一采用如下模型：

```json
{
  "id": "mtg_20260621_001",
  "ownerUserId": "u_member_001",
  "ownerName": "王敏",
  "title": "AI 会议平台产品介绍",
  "status": "ongoing",
  "startedAt": "2026-06-21T10:00:00.000Z",
  "endedAt": null,
  "durationSeconds": 0,
  "mainLanguage": "zh",
  "meetingTargetLanguage": "en",
  "participants": [
    "李明",
    "田中",
    "王敏"
  ],
  "tags": [
    "客户",
    "产品演示"
  ],
  "transcriptSegments": [],
  "summary": null,
  "summaryStatus": "empty",
  "coverSnippet": "",
  "isStarred": false,
  "lastVisitedAt": "2026-06-21T10:05:00.000Z"
}
```

### 7.5 transcript segment 建议结构

建议尽量复用当前会议页已经产生的数据结构，历史回看时不做二次转换：

```json
{
  "localSegmentId": "1-5-5",
  "serverSegmentId": 5,
  "speaker": {
    "name": "李明",
    "avatar": "李",
    "color": "var(--speaker-1)"
  },
  "sourceLanguage": "zh",
  "text": "我们先看这次产品演示的关键价值。",
  "translation": "Let's first look at the key value of this product demo.",
  "translationStatus": "success",
  "timestampEnd": 1710000000
}
```

### 7.6 summary 建议结构

建议直接保存当前会议总结页面已经使用的结构化数据：

```json
{
  "abstract": "本次会议主要围绕 AudioClaw 的跨语种会议能力展开。",
  "decisions": [
    { "text": "优先推进医疗与金融场景试点。" }
  ],
  "actionItems": [
    {
      "owner": "李明",
      "deadline": "下周三",
      "text": "补充客户试点报价方案"
    }
  ],
  "openQuestions": [
    { "text": "日语专业术语覆盖率仍需进一步验证。" }
  ],
  "speakerStats": []
}
```

### 7.7 会议生命周期

会议的生命周期建议定义为：

1. `draft`
2. `ongoing`
3. `finished`
4. `archived`

当前 MVP 中可先主要使用：

- `ongoing`
- `finished`

如不需要更细粒度，也可不单独暴露 `draft` 与 `archived` 状态。

***

## 八、页面职责与连接关系

### 8.1 `login.html`

职责：

- 接收账号密码
- 做 Demo 级账号密码匹配
- 显示错误提示
- 写入当前登录态
- 登录成功后跳转 `home.html`

### 8.2 `home.html`

职责：

- 作为登录后默认首页
- 显示当前用户自己的会议
- 显示进行中会议
- 显示历史会议卡片
- 发起新会议
- 跳转资产库、设置、组织管理

与会议页的连接：

- 点击“开始新会议”：
  - 先创建一条会议记录
  - 再跳转 `index.html?meetingId=xxx&mode=live`
- 点击进行中横幅：
  - 跳转 `index.html?meetingId=xxx&mode=live`
- 点击历史会议卡片：
  - 跳转 `index.html?meetingId=xxx&mode=replay`

### 8.3 `index.html`

职责：

- 作为实时会议工作区
- 作为历史回看页
- 根据 `mode` 决定启用哪些能力

建议模式：

- `live`
- `replay`

#### `live` 模式

- 可以开始会议
- 可以结束会议
- 连接 WebSocket
- 启动麦克风采集
- 生成转写流
- 触发总结生成
- 持续保存会议数据

#### `replay` 模式

- 不连接 WebSocket
- 不启用麦克风采集
- 不允许点击开始会议
- 不允许点击结束会议
- 直接从本地存储加载历史 transcript 与 summary
- 页面标题、副标题、状态展示改为“历史回看”

### 8.4 `terms.html`

职责：

- 展示“我的术语”
- 展示“企业共享术语”

当前阶段权限差异：

- `member`：
  - 可编辑“我的术语”
  - 只读“企业共享”
- `admin`：
  - 可编辑“我的术语”
  - 可编辑“企业共享”

### 8.5 `voiceprint.html`

职责：

- 展示与管理当前登录用户自己的声纹资产

当前阶段规则：

- 两种角色都只能看到并管理自己的声纹

### 8.6 `settings.html`

职责：

- 展示当前用户个人设置
- 承接已有会议页中的语言与偏好项

### 8.7 `admin.html`

职责：

- 作为管理员组织后台
- 展示成员管理与企业热词管理

当前阶段规则：

- `member` 不显示入口，不可进入
- `admin` 可正常进入

***

## 九、核心业务流转

### 9.1 登录流

`login.html -> 账号密码校验 -> 写入 currentUser -> 跳转 home.html`

### 9.2 发起会议流

`home.html -> 点击开始新会议 -> 创建 meeting 记录 -> 跳转 index.html?meetingId=xxx&mode=live`

### 9.3 会中保存流

`index.html live -> 接收 segment -> 更新页面 -> 写回本地会议记录`

### 9.4 会后归档流

`点击结束会议 -> 停止采集 -> 自动生成最终总结 -> 将 transcript + summary + endedAt + duration 写入 meeting -> 状态改为 finished`

### 9.5 历史回看流

`home.html 历史会议卡片 -> index.html?meetingId=xxx&mode=replay -> 读取本地存储 -> 直接渲染 transcript 与 summary`

### 9.6 权限流

`页面初始化 -> 检查 currentUser -> 判断角色 -> 控制导航显示与页面访问`

***

## 十、会议页复用设计

### 10.1 为什么复用现有会议页

复用 `index.html` 的原因是：

- 现有页面已经完整承载会议主体验
- 转写区域、总结区域、顶部信息区已经成熟
- 视觉连续性更强
- 避免维护两套类似页面
- 后续从历史会议再次导出或查看总结更方便

### 10.2 需要补的不是新页面，而是模式判断

本阶段不新增独立“会议详情页”或“会议回看页”，只在现有会议页中新增模式逻辑：

- `mode=live`
- `mode=replay`

### 10.3 模式差异建议

| 能力             | live        | replay |
| -------------- | ----------- | ------ |
| 开始会议按钮         | 可用          | 隐藏或禁用  |
| 结束会议按钮         | 可用          | 隐藏或禁用  |
| WebSocket      | 开启          | 不开启    |
| 麦克风采集          | 开启          | 不开启    |
| transcript 数据源 | 实时结果        | 本地历史数据 |
| summary 数据源    | 实时生成结果      | 本地历史数据 |
| 会议状态标签         | 待开始/转写中/已结束 | 历史回看   |
| 页面副标题          | 实时会议说明      | 历史回看说明 |

### 10.4 会中持续保存策略

建议在以下节点写入会议记录：

- 每次收到新的转写 segment 后
- 每次翻译回填后
- 每次总结生成成功后
- 点击结束会议后

为了简化实现，可先采用“重要节点立即保存”的方式，不必一开始就做复杂节流。

***

## 十一、页面与文件改造建议

### 11.1 新增文件

建议新增：

- `login.html`
- `src/app/auth-store.js`
- `src/app/meeting-store.js`
- `src/app/demo-users.js`
- `src/app/page-guard.js`
- `src/app/home-page-app.js`
- `src/app/common-layout.js`

### 11.2 重点改造文件

#### [index.html](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/index.html)

需要补充：

- 支持从 URL 读取 `meetingId` 与 `mode`
- 顶栏文案根据会议数据动态变化
- 历史回看时按钮状态变化
- 与 `home.html`、`settings.html` 的真实页面链接保持一致

#### [meeting-page-app.js](file:///Users/gejiaqi/Desktop/需求与原型\(1\)/src/asr/meeting-page-app.js)

需要补充：

- 读取页面模式
- 在 `live` 模式下创建 / 更新会议记录
- 在 `replay` 模式下直接渲染历史数据
- 结束会议后写入最终归档数据
- 将当前的 `segmentStore / segmentOrder / summaryState` 与本地存储打通

#### `home.html`

建议从 `原型/home.html` 提升为真实页面，并补充：

- 当前登录用户信息
- 进行中会议渲染
- 历史会议渲染
- 卡片跳转参数
- 角色差异导航

#### `admin.html / terms.html / voiceprint.html / settings.html`

建议从 `原型/` 提升为真实页面，并补充：

- 页面守卫
- 当前用户信息
- 左侧导航联动
- 基础权限显示差异

***

## 十二、推荐的前端模块拆分

### 12.1 `auth-store.js`

职责：

- 初始化预设账号
- 登录校验
- 登出
- 读取当前用户
- 判断是否为管理员

建议导出：

- `ensureDemoUsers()`
- `loginWithPassword(email, password)`
- `logout()`
- `getCurrentUser()`
- `requireAuth()`
- `requireAdmin()`

### 12.2 `meeting-store.js`

职责：

- 创建会议
- 读取会议列表
- 根据用户过滤会议
- 更新会议状态
- 保存转写
- 保存总结
- 获取进行中会议

建议导出：

- `createMeeting(user, payload)`
- `getMeetingsByUser(userId)`
- `getMeetingById(meetingId)`
- `saveMeetingSegments(meetingId, segments)`
- `saveMeetingSummary(meetingId, summaryPayload)`
- `finishMeeting(meetingId, payload)`
- `getOngoingMeetingByUser(userId)`

### 12.3 `page-guard.js`

职责：

- 页面级登录校验
- 管理员页面权限校验
- 根据角色调整导航显示

### 12.4 `home-page-app.js`

职责：

- 初始化主页
- 渲染当前用户数据
- 渲染会议统计
- 渲染进行中会议
- 渲染历史会议列表
- 绑定“开始新会议”按钮

***

## 十三、实施阶段安排

### 阶段 A：账号与路由壳层

目标：

- 让系统具备最小进入逻辑

包含工作：

- 新增 `login.html`
- 建立预设 Demo 账号
- 完成登录失败提示
- 完成登录态写入
- 为各页面增加登录校验
- 为 `admin.html` 增加管理员限制

完成标准：

- 使用正确账号密码可以进入主页
- 错误密码会显示“密码不正确”
- 未登录不能直接访问主页面
- 普通用户不能进入 `admin.html`

### 阶段 B：Home 主页真实接入

目标：

- 让主页成为整个产品的真实中枢

包含工作：

- 将 `home.html` 从原型提升为真实页面
- 首页展示当前用户自己的会议
- 增加“开始新会议”逻辑
- 增加进行中会议区域
- 增加历史会议卡片跳转
- 增加导航角色差异

完成标准：

- 登录后默认进入 `home.html`
- 可以从主页新建会议并进入会议页
- 可以从主页继续进入进行中会议
- 可以从主页点击历史会议进入回看

### 阶段 C：会议持久化与回看

目标：

- 让会议结束后能被保存并再次打开

包含工作：

- 设计会议本地存储模型
- 在会中持续保存 transcript
- 在总结生成后保存 summary
- 在结束会议后归档状态
- 增加 `replay` 模式
- 在历史回看中加载已保存数据

完成标准：

- 结束会议后刷新页面，历史会议仍存在
- 点击历史会议卡片可进入只读回看
- 回看页可看到转写与总结

### 阶段 D：资产库与后台权限补全

目标：

- 让其他页面满足最小权限演示

包含工作：

- `terms.html` 增加角色差异
- `voiceprint.html` 绑定当前用户身份
- `settings.html` 与当前用户联动
- `admin.html` 增加管理员页守卫

完成标准：

- 管理员能看到并进入 `admin.html`
- 普通用户不能进入 `admin.html`
- `terms.html` 的企业共享编辑能力体现角色差异

***

## 十四、优先级建议

建议按以下顺序推进：

1. 先完成 `登录 -> 主页 -> 发起会议 -> 会后归档 -> 回看`
2. 再补 `admin / terms / voiceprint / settings`
3. 最后再做筛选、搜索、更多管理操作等增强项

原因：

- 第一条主链路最能体现产品完整度
- 资产库和后台是重要增强，但不应阻塞主闭环
- 首页与会议页打通后，后续扩展会更顺

***

## 十五、风险与注意事项

### 15.1 本地存储容量风险

会议 transcript 较长时，`localStorage` 容量可能成为限制。

当前处理建议：

- MVP 先用 `localStorage`
- 单场会议只保留必要字段
- 如后续数据明显增大，再迁移 `IndexedDB`

### 15.2 原型页与真实页混用风险

当前部分页面只存在于 `原型/` 目录，而 `index.html` 已经在根目录作为真实页面工作。开发时应尽快统一真实页面位置，避免：

- 链接指向错误
- 两套页面并存造成混淆
- 样式修改落错文件

### 15.3 会议页模式切换风险

`index.html` 从单模式切到双模式时，需要特别注意：

- 初始化顺序
- 按钮禁用状态
- 实时会议逻辑不能误在回看模式下启动
- 历史数据渲染不能污染实时会议状态

### 15.4 权限只做前端控制的风险

当前权限控制仅用于 Demo 与 MVP 演示，不能等同于正式安全方案。后续若进入真实交付，必须替换为服务端鉴权。

***

## 十六、验收标准

本阶段验收以“完整闭环跑通”为主，标准如下：

### 16.1 登录

- 输入正确账号密码可进入系统
- 输入错误密码有明确错误提示
- 未登录访问主页面会被拦回登录页

### 16.2 Home

- 登录后进入 `home.html`
- 主页显示当前用户信息
- 主页只显示当前用户自己的会议
- 可从主页发起新会议

### 16.3 会议

- 新会议进入 `index.html` 的 `live` 模式
- 会议中产生的转写可持续保存
- 会议结束后自动归档
- 会议总结可被保存

### 16.4 回看

- Home 中的历史会议卡片可点击
- 点击后进入 `index.html` 的 `replay` 模式
- 回看页可显示已保存的 transcript 与 summary

### 16.5 权限

- `member` 看不到或不能进入 `admin.html`
- `admin` 可以进入 `admin.html`
- `terms.html` 中企业共享能力体现角色差异

***

## 十七、开发顺序建议

推荐实际编码顺序如下：

1. 先做 `demo-users + auth-store + login.html✅`
2. 再做 `page-guard`
3. 再做 `meeting-store`
4. 再把 `home.html` 提升为真实页面并接会议列表
5. 再改 `meeting-page-app.js`，增加 `live / replay` 双模式
6. 再做 `admin / terms / voiceprint / settings` 的权限收口

这样安排的好处是：

- 登录壳层先稳定
- 数据模型先固定
- Home 与 Index 的主链路最早可验证
- 剩余页面可以在统一登录态和权限模型下继续接入

***

## 十八、后续扩展预留

当本阶段完成后，后续可以沿此方案继续扩展：

- 接入真实后端登录
- 将会议数据从本地迁移到服务端
- 支持成员邀请与角色管理
- 支持会议搜索、筛选、收藏
- 支持回看页再次导出
- 支持术语库、声纹库的真实存储与同步
- 支持 `owner` 角色

***

## 十九、最终结论

本阶段最合适的实现方式，不是直接做重型账户体系，而是：

- 用 `Demo 级账号密码校验` 快速补上系统入口
- 用 `前端本地存储` 补上会议归属与历史保留
- 用 `home.html` 接起产品级页面流转
- 用 `index.html` 的 `live / replay` 双模式复用现有会议页
- 用 `admin / member` 两角色完成最小权限演示

这样可以在不显著增加系统复杂度的前提下，把当前“单页会议能力”升级为“可登录、可进入、可归档、可回看、可区分权限”的完整 MVP 产品闭环。
