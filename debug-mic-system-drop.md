# Debug Session: mic-system-drop

- Status: OPEN
- Started At: 2026-07-02
- Scope: 会议页实时转写中，系统声可识别，但麦克风无效，且仅输出一条后停止

## Symptoms

- 系统声可以被识别
- 用户自己的麦克风不能正常转写
- 页面只输出一条转写后停止，疑似链路中断或状态机被提前降级

## Hypotheses

1. 麦克风 `getUserMedia()` 实际没有拿到可用音轨，系统声链路正常，所以只看起来像“只识别系统声”。
2. 麦克风链路启动成功，但 `mic` 通道在第一条结果后被错误判定为 lost / ended，触发了局部或全局清理。
3. `system` 共享流里的视频轨或音频轨结束事件错误影响了 `mic` 通道，导致第一条后整场进入降级或停采集。
4. VAD 参数过于激进，麦克风输入被持续判定为静音，而系统声因为能量更稳定所以更容易出结果。
5. 通道状态更新顺序有问题，首条结果后 `meetingState`、`channels` 或 stop/cleanup 逻辑把后续采集提前停掉了。

## Evidence Plan

- 记录开始会议时 `mic/system` 两路的设备获取、音轨状态、捕获启动与客户端状态变更
- 记录首条结果前后 `meetingState`、`channels`、`handleChannelLost`、`safeCleanup` 的触发顺序
- 对比 `mic` 与 `system` 两路是否都持续收到 level/result/status

## Constraints

- 在拿到运行时证据前，不修改业务逻辑
- 第一轮只加埋点并复现，不做功能修复
