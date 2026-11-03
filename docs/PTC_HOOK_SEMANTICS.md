# PTC 嵌套调用下的钩子与派发语义

> 2026-11-03 决策，0.7.0 已实施：普通无绑定 lane 的派发使用宿主原生工具；需要 ticket↔worktree 强绑定时用 `mattpocock_delegate` 的绑定式创建；`mattpocock_execute` 已从模型面移除。本文第 3 节中的 execute 包装描述保留为 0.6.0 历史；当前路径是 native `subagent`/`subagent_fork`/`send_message` 直接派发 + 生命周期观察。C（原生观察读取时关联/账本补齐）已于 0.7.1 完成。0.8.0 起 delegate 功能保留但默认不注册，只有 profile 显式 `delegate: true` 才作为可选强绑定入口启用。详见 [NATIVE_DISPATCH_FIRST.md](<NATIVE_DISPATCH_FIRST.md>)。

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
并区分受管（delegate 强绑定）与未托管原生事件：

- execute 包装路径（**0.6.0 历史，0.7.0 已移除**）：旧模型调用 `mattpocock_execute`，插件以 `windowsProgram.reserveExecution` 预留后在 `nativeDispatch.run(dispatch, () => ports.executeNative(...))` 内触发原生派发。0.7.0 不再注册该工具，也不存在 `executeManaged`/`executeNative` 路径。
- 普通当前路径：模型直接调用原生 `subagent` / `subagent_fork` / `send_message`；插件只从生命周期事件观察，不提供模型可见的 dispatch wrapper。
- 强绑定目标路径：需要 ticket↔worktree 绑定时，模型调用 `mattpocock_delegate`；它在 PTC 内同样以原生创建 + 实际 header 核对创建 binding。它不是通用 dispatch wrapper，仍按一个调用粒度对账。
- 未托管路径：任何其它来源创建的子代理一旦进入成员资格就会被宿主实时运行状态计数并进入 S；插件另外把该账本缺口记为
  `unmanaged-native-execution-observed` 审计，不代表「零个执行」。只有宿主没有可用的原生目录 seam 时，
  `execution-admission` 才是 unsupported，并给出机械原因。

这些路径都基于 SDK 生命周期事件，与子代理是在顶层工具还是 `run_code` 程序里创建无关。
PTC 嵌套调用持有各自的 `exec`/callId；delegate 的强绑定路径仍按调用粒度做持久意图与 reservation 对账，普通原生路径没有插件预留/释放账本。

## 4. 需要明确的边界

- **管理功能关闭的工作区（0.6.0 历史 execute 行为）**：旧 `mattpocock_execute` 走非准入路径（当时 `src/runtime.ts:469-473`），插件不做预留与释放对账，子代理按未托管原生活动记入账本审计。0.7.0 移除 execute 后普通原生路径不再有此分支；它们仍由宿主实时运行状态计入 S（原生目录提供成员资格，live `Agent.status` 决定 running，目录 `activity` 不是执行）。delegate 强绑定路径仍按调用粒度 reservation/释放对账。
- **无法归因的嵌套调用**：若某个嵌套 `exec` 没有可用的 agent 归属，插件的 post-execute 直接放行，
  该次调用不附带状态块；下一次 pre-step 仍会注入。

## 5. 实测

- 0.4.11 活进程：每次 `prepare` 1.9–2.2 ms，36/36 与 33/33 次状态未变仍完整重建；4.12/4.13 以来源修订复用后，
  重建与历史观测只随真实状态变化发生。
- 本会话本身即为 PTC 场景：`run_code` 程序内派发的子代理被插件如实记录为未托管原生活动。
