# PTC 嵌套调用下的钩子与派发语义

DSH 的 PTC（programmatic tool calling）模式允许模型在一次 `run_code` 里串联大量工具调用。
本插件的状态注入与派发观测是否会被这种包装方式影响，结论与依据如下。

## 1. 新鲜度：由 agent/pre-step 保证，不依赖工具调用

`agent/pre-step` 在每个「开启新 step 的模型请求」之前触发，包括每次工具批次之后的那次请求
（`dsh-agent-loop/lib/index.js:951-978`、`:1005-1006`）。
`tools/post-execute` 返回的 `additionalContexts` 也只是进入 next-step 队列，
由下一次 pre-step 认领后在请求组装前落盘（`:570-572`、`:1154`、`:906`、`:1061`）。

因此：无论工具调用是顶层还是 PTC 嵌套，插件注入的状态块都会在该 step 的下一次请求前生效。

## 2. PTC 嵌套调用仍然走同一条工具管线

嵌套调用按顺序执行 pre-execute / post-execute（`dsh-tools/lib/types/ptc.js:343-346`、`:364`），
并且嵌套结果的 `additionalContexts` 会经 `exec.deferContext(context)` 汇总到外层 `run_code` 结果
（`ptc.js:531-534`），再由 agent loop 作为 next-step 上下文受理。
所以嵌套调用返回的插件状态不会被丢弃；即便个别嵌套上下文缺失，pre-step 仍会补齐。

## 3. 派发（subagent）观测来自生命周期事件，而非工具包装

插件观测 `agent/created` / `agent/status` / `agent/disposed`（`src/host.ts:816,832,833`），
并在 `src/runtime.ts:395-437` 中判定托管与未托管：

- 托管路径：模型调用 `mattpocock_execute`，插件以 `windowsProgram.reserveExecution` 预留后，
  在 `nativeDispatch.run(dispatch, () => ports.executeNative(...))`（`src/runtime.ts:488`）内触发原生派发，
  子代理以 `origin==='subagent'` 且 `parentSession` 匹配被识别（`src/runtime.ts:398-409`）。
- 未托管路径：任何其它来源创建的子代理都会被记为 `unmanaged-native-execution-observed`（`src/runtime.ts:434-437`），
  事实里呈现为 `execution-admission: unsupported`，而不是「零个执行」。

这两条都基于 SDK 生命周期事件，与子代理是在顶层工具还是 `run_code` 程序里创建无关。
PTC 嵌套调用持有各自的 `exec`/callId，因此预留、凭据与释放仍按调用粒度对账。

## 4. 需要明确的边界

- **管理功能关闭的工作区**：`mattpocock_execute` 走非准入路径（`src/runtime.ts:469-473`），
  插件不做预留与释放对账，子代理一律按未托管原生活动上报。这不是漏判，是策略状态。
- **无法归因的嵌套调用**：若某个嵌套 `exec` 没有可用的 agent 归属，插件的 post-execute 直接放行，
  该次调用不附带状态块；下一次 pre-step 仍会注入。

## 5. 实测

- 0.4.11 活进程：每次 `prepare` 1.9–2.2 ms，36/36 与 33/33 次状态未变仍完整重建；4.12/4.13 以来源修订复用后，
  重建与历史观测只随真实状态变化发生。
- 本会话本身即为 PTC 场景：`run_code` 程序内派发的子代理被插件如实记录为未托管原生活动。
