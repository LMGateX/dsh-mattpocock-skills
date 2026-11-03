# 原生派发优先与绑定式创建

> **Status:** 所有者 2026-11-03 认可方案 A（普通 lane native-first，强绑定 lane 用 delegate）。B/D/E 已在 0.7.0 源码线实施：模型面不再注册 `mattpocock_execute`，普通派发为原生 `subagent`/`subagent_fork`/`send_message`；C（原生观察的读取时关联/账本补齐）已在 0.7.1 源码线实施：owner runtime 文档保存 native-observed 执行事实，读取时给出 activity、observed worktree 与 inferred lane，并为工作树观测派生 `nativeChildren`；不新增模型工具、Remote 方法或强绑定写入口。0.8.0 起 delegate 功能保留但**默认不注册**，只有 profile 显式 `delegate: true` 才作为可选第八项启用。详细规格见 [NATIVE_OBSERVATION_CORRELATION.md](<NATIVE_OBSERVATION_CORRELATION.md>)，结果见 [VERIFICATION.md](<VERIFICATION.md>)。0.7.0 制品已构建、精确验证并发布（[GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.0)，tag `v0.7.0` 指向 docs 验证提交 `ea08bdd`；制品源提交 `d2dd86e`）；0.7.1 也已完成验证并发布（[GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.1)，tag `v0.7.1` 指向 docs 验证提交 `770b0e7`；制品源提交 `b8fe19e`）；0.8.0 已完成验证并发布（[GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.8.0)，tag `v0.8.0` 指向 docs 验证提交 `3fa1d04`；制品源提交 `dfe0322`）。本机 DSH/Profile 仍未安装。
> 公开资料边界：本页只记录设计与公开代码事实；本地实测以聚合计数出现，不发布原始会话、日志、路径或用户内容。

## 2026-11-04 后续契约（设计固定，未实施）

[事实边界与恢复](<INSTRUMENT_FACT_BOUNDARIES.md>) 收窄本文 C 阶段的目录声明并补足恢复：header cwd 只证明目录头值，不证明实际初始目录，不能仅据相等生成该语义关联；创建、binding、assignment 独立报告；已接受/不确定的 delegate 操作不改走 native 重新创建，需要时只向已有 child 显式补 assign；只读 lane 没有建树义务。下方 0.7.x/0.8.0 实施记录与工具默认值保留，不能解读成此增量已经生效。

## 1. 决策摘要

- **普通无绑定 lane 的派发属于宿主。** 普通 child 由模型直接调用宿主 `subagent` / `subagent_fork` 创建，后续用 `send_message` 续聊；工作树由宿主 `create_worktree` 创建，首次 child cwd 由原生 `subagent` 的 `cwd` 传入。插件不再提供模型可见的通用派发包装。
- **`mattpocock_execute` 退役。** 不再作为派发工具注册或宣传。它记的是 execution fact / lease，不提供 cwd/worktree；S 已按宿主 live `Agent.status` 计数，lease 仅作审计；其“记录执行事实”的模型可见描述与实际原生派发不一致，已在一次本地实测中造成 15 个额外 child（重复或补记派发）与 13 条重复消息。迁移期若保留兼容别名，最多保留一个 minor 版本，且只能拒绝并指向原生替代，绝不再次派发；目标版本删除该工具及 `executeManaged`/`executeNative` 包装路径。
- **`mattpocock_delegate` 保留为可配置的绑定式创建（binding-first creation），默认不注册。** 只有 profile 显式 `delegate: true` 时才启用；它不是默认派发路径，仅当需要可核验的 ticket↔worktree 强绑定，或需要其持久意图/幂等/创建前 scope 时使用：先持久化创建意图，再以准备的工作树为初始 cwd（省略则继承父 cwd）创建 continuable child，核对实际 `child/parent/cwd` header，写入 binding（task/ticketIds），并 assign 票范围。普通无绑定 lane 用原生 `subagent({cwd})` + `mattpocock_assign`，不需要 delegate。
- **强绑定、观察、分配是三件事。** `mattpocock_delegate` 是当前唯一的 binding 创建入口；`mattpocock_worktree` 读取/更新 binding，并用 `update-observation` 处置树观测（观测本身看注入快照）；`mattpocock_assign` 只写 child↔ticket 权限。原生 `create_worktree` 观测只记录“谁建了哪棵树”，不会自动写一条 child↔tree 强绑定；读取时的关联必须标为 observed/inferred，不能冒充 binding。
- **执行事实来自观察（C 已于 0.7.1 实施）。** 原生 `agent/created`、child header、`subagent/start|end`、`agent/disposed` 是程序事实来源；owner runtime 文档按 child session 保存 `nativeExecutions` 事实（`executionId = sessionId`），不要求模型补记，也不把模型文字当回执。S 继续按宿主 live `Agent.status` 计数；普通路径不以 lease 为前提。读取时 worktree 关联只在初始 cwd 精确匹配当前 `create_worktree` 观测时标 `observed`，lane 从 assignment/binding 推导标 `inferred`；它们不是强 binding。0.7.0 只有 S/结局/通知与 worktree observation；0.7.1 补齐持久执行事实与读取时关联。
- **旧宿主按 capability 兼容。** 没有原生 cwd/创建 seam 的宿主仍使用随包兼容提供者或明确拒绝；`host-patches/` 与 startup cwd 设置保留为旧宿主路径，不构成保留 execute 的理由。

本节收窄 2026-10-06 的执行包装、2026-10-09 的插件 cwd 派发默认用法和 2026-10-13 的 `mattpocock_delegate.worktree` 默认派发用法；强绑定 lane 仍由 delegate 写 binding，T/S、票与裁决、工作树绑定/观测、历史与通知语义不变。

## 2. 背景与依据

### 2.1 宿主已经覆盖原先的缺口

- 2026-10-05 的研究把“首次给 child 指定 cwd”写成宿主提案，字段尚不存在（[CONTINUABLE_WORKSPACES.md](<CONTINUABLE_WORKSPACES.md>) 第 6 节）。
- 2026-10-09 的设计记录了 `startActivation(spec)` 与 `SubagentStartRequest.cwd?` 已落地，插件的 `nativeInitialChildCwd` 按实际能力报告（[DESIGN.md](<DESIGN.md>) 的 2026-10-09 节）。
- 当前宿主的 `subagent` 工具本身带 `cwd`；`create_worktree` 建树并返回 checkout；`working_directory` 负责切换目录。
- 插件已经观测原生 `create_worktree`（[WORKTREE_OBSERVATION.md](<WORKTREE_OBSERVATION.md>) 的 runtime 观测路径），并从 `agent/created` / `agent/status` / `agent/disposed` / `subagent/start` / `subagent/end` 取得生命周期事实。
- S 已改为宿主 live `Agent.status` 计数；执行 lease 只保留为派发审计（[DESIGN.md](<DESIGN.md>) 的 2026-10-10 节、[HOST_INTEGRATION.md](<HOST_INTEGRATION.md>) 的 execution-admission 段）。
- 薄适配的原始边界本来就是“不提供子代理调度或等待机制”（[ADAPTER_SCOPE.md](<ADAPTER_SCOPE.md>) 的宿主边界段）。

因此，普通派发不再需要插件包装；但**工作树绑定不是派发的副产物**，它需要单独的写入口和程序确认。

### 2.2 两个工具的原始职责与现状

**`mattpocock_delegate`：opt-in 的 create + bind，不是通用派发器**

原始工具表的描述是“创建 continuable child，可绑定已准备工作树”。它的核心不是“替模型调用 subagent”，而是：

- 在原生创建前持久化 `operationId` / `plannedChildSessionId` 意图，支持重试幂等与崩溃后的意图核对；
- 以准备的工作树为初始 cwd 创建 child，并在原生副作用边界再次核验父身份、当前权限与目录；
- 读取实际 `child/parent/cwd` header，确认后才把 binding 标为 confirmed；
- 在 binding 中保存 `task`、`ticketIds` 与实际 child/cwd，供 `mattpocock_worktree` 读取、历史查询和清理处置；
- 创建后调用 `assign`，把 workflow/ticket 范围登记到真实 child。

因此它是**绑定式创建**：create 是手段，binding + assign 才是目的。普通无绑定 lane 不需要它，也不能因为它“能创建 child”就把它当默认派发入口。

**`mattpocock_execute`（0.7.0 已移除；以下为历史实现）：execution fact / lease，不是 binding**

- 历史实现只是旧 runtime 的 `executeManaged` → `ports.executeNative(...)` 包装（0.7.0 已删除），可以包 `subagent` / `subagent_fork` / `send_message`；没有 `cwd`、`bindingId` 或树字段。
- lease 只用于审计；S 不依赖它。
- 现有 fence 只按 `exec.callId` 去重（[runtime.ts](../src/runtime.ts#L971-L978)），不同 call、相同 args 不拦。
- 模型可见描述是“记录执行事实”（[host.ts](../src/host.ts#L1821)），实际却派发；该契约分叉已在一次本地实测中造成 **15 个额外 child（重复或补记派发）与 13 条重复消息**。原始会话不随仓库发布，计数只作为设计证据。
- 它制造了第二条派发路径和第二个事实来源；这不是“薄适配”，而是把宿主职责搬回插件。

它记录的是“哪次执行属于哪张票”的 execution lease，不是“哪个 child 绑了哪个树”的 binding。后者一直由 delegate 的 binding 行承担。

### 2.3 设计原则

1. **native-first for unbound lanes**：不需要强绑定的普通 lane，能用宿主公开能力完成的，不在插件里重做。
2. **binding-first only when needed**：需要 ticket↔tree 强绑定时，用 delegate 的持久意图 + actual header 核对 + binding 写入；不在所有派发上默认加这一层。
3. **one writer per ledger**：普通派发只有宿主一条路径；强 binding 只有 delegate 一个写入口；assignment 只有 assign/delegate 一个写入口；观测只写 observation。
4. **observe, don't re-dispatch**：执行事实和树创建事实来自生命周期/工具事件；观察不得静默升级成强 binding。
5. **capability-gated fallback**：旧宿主按 `nativeInitialChildCwd` 等实际能力使用兼容提供者或明确拒绝，不用版本字符串冒充能力。
6. **program facts only**：模型文字不是执行/绑定回执；binding 必须来自程序确认的实际 child/parent/cwd，执行事实必须来自宿主事件。
7. **thin adapter**：不把完整的票图、Git 调度器或通用行为证明器塞进 provider。

## 3. 关系账本与工具处置

### 3.1 关系账本：票、分配、绑定、观察与执行

| 关系 | 写入 | 读取 | 关键字段 | 回答的问题 |
|---|---|---|---|---|
| 票/业务记录 | `mattpocock_record` | `record` / `history` | workflowId、ticketId、状态 | 票是什么状态 |
| assignment（child↔ticket 权限） | `mattpocock_assign`；delegate 也调用 | 注入快照 / `record` | sessionId、workflowId、ticketIds | 这个 child 被允许做哪些票 |
| **worktree binding（child↔初始 cwd↔task/tickets）** | **`mattpocock_delegate`** | **`mattpocock_worktree` / `history` / 注入快照** | bindingId、planned/actual child、requested/actual cwd、task、ticketIds、state | **哪个 child 绑了哪个树、为哪张票/任务** |
| worktree observation（树创建事实） | 原生 `create_worktree` 自动观测 | **注入快照**；`update-observation` 处置；v1 不进 history | creatorSessionId、path、branch、base、Git check | 谁建了哪棵树、树是否还在 |
| execution fact | 原生生命周期观察（0.7.1 `nativeExecutions`）；旧 lease 记录只读；`mattpocock_execute` 已在 0.7.0 移除 | `history`（`kind: native-execution`）/ 注入快照 | executionId、sessionId、parent、state、outcome、initialCwd、activity | 这个 native child 最近一次观测到的生命周期事实（不是 ticket↔tree binding） |
| S | 宿主 live `Agent.status` | 注入快照 | running 数 | 当前多少 child 在跑 |

要点：

- binding 行本身**不含 workflowId**；workflowId 在 assignment 行。delegate 一次创建 binding 并写 assignment，因此强绑定 lane 同时具备 child↔tree 和 child↔ticket；原生 lane 只用 assign 时只有后者。
- `mattpocock_execute` 的 lease 有 ticket 字段但没有 cwd/bindingId；它不能回答 ticket↔tree。
- observation 只记录树由谁创建；读取时可用 creator + assignment/binding 关联出 lane，但这是**观测关联**，不是一条强 binding。
- **强绑定记的是 child 的初始 cwd**，不是 child 后来自己 `cd`/建树后的目录。要让 ticket↔tree 指向某棵准备好的树，必须把该树作为 `worktree` 传给 delegate；省略 `worktree` 只会记录继承 cwd 的 binding，不能声称绑定了某棵专用树。

### 3.2 工具处置

| 工具/入口 | 处置 | 理由 | 替代 |
|---|---|---|---|
| `mattpocock_execute` | **已退役（0.7.0 移除）** | 无 cwd/worktree；lease 仅审计；描述与实现不符；重复派发来源 | 原生 `subagent` / `subagent_fork` / `send_message` |
| `mattpocock_delegate` | **保留：opt-in 绑定式创建（默认不注册）** | 唯一创建 worktree binding 的入口；持久意图/幂等/创建前 scope/实际 header 核对仍有价值 | 普通无绑定 lane 用原生 `subagent({cwd})` + `mattpocock_assign`；仅当 profile `delegate: true` 且需要强绑定时用 delegate |
| `mattpocock_assign` | **保留** | 对真实直接 child 登记票范围；不派发、不写树 | — |
| `mattpocock_worktree` | **保留** | 读取/更新 binding、观测处置、程序重核对；不创建 binding | 原生 `create_worktree` 继续负责建树 |
| `mattpocock_record` / `window` / `history` / `controls` / `resource` | **保留** | 业务记录、T 窗口、历史、设置与旧资源只读 | — |
| `mattpocock_audit` | **条件保留** | 可选交付监督；默认关闭 | — |
| 原生 `subagent` / `subagent_fork` / `send_message` | **默认派发/续聊** | 宿主公开能力；插件观察 | — |
| 原生 `create_worktree` / `working_directory` | **默认工作树/cwd** | 宿主公开能力；插件观察建树 | — |

当前 0.8.0 默认工具面是 **七个固定工具 + 条件 `mattpocock_audit`**；`mattpocock_delegate` 是显式 `delegate: true` 的可选第八项，客户端仍共九个 wire key（opt-in/历史卡片）。历史 0.6.0 发行版是九个固定工具，含 execute。delegate 实现保留，默认不注册；未来若要删除实现，必须先有等价强绑定写入口并单独更新 DESIGN。C 不新增工具或 Remote 方法。

## 4. 目标流程

### 4.1 默认：普通无绑定 lane 用 native-first

```text
按任务需要准备工作树（需写隔离时用原生 create_worktree，或已有 Git 工具；只读可省略）
  → subagent({ cwd }) / subagent_fork（原生）
  → mattpocock_assign（有票时；对真实直接 child）
  → send_message（原生，同一 child 续聊）
  → mattpocock_worktree（读取 binding；update-observation 记录树处置；观测看注入快照）
```

- 只有任务需要写隔离时才准备工作树；只读研究/review 可共享稳定检出，不要求每个 lane 建树。目录进入/离开由宿主 `working_directory` 管理；插件不设置这项业务义务。
- 省略 `cwd` 时保持原生目录继承。
- 插件自动观测成功的 `create_worktree` 和 child 生命周期；不要求模型为原生派发补记执行事实。
- 有票时 `mattpocock_assign` 必须在 child 已存在且 parent/child 身份可核验后调用。
- 这条路径**不写强 binding**；它只有 observation + assignment。需要 ticket↔tree 强绑定时走 4.2 或未来的显式 bind。

### 4.2 需要强绑定：delegate 的 binding-first creation

```text
create_worktree（原生；父代理先准备好树）
  → mattpocock_delegate({
       description, prompt, provider,
       worktree: "/已授权绝对路径",
       operationId, workflowId, ticketIds
     })
       → 持久意图 → 原生创建（初始 cwd）
       → 实际 child/parent/cwd header 核对
       → worktree binding（task/ticketIds） + assign
  → send_message（原生，同一 child 续聊）
  → mattpocock_worktree update（binding 的 discarded/cleaned 等）
```

仅在需要以下至少一项时使用：

- ticket↔worktree 必须是一条可核验、可恢复的强绑定；
- `operationId` 重放保护与崩溃后的意图恢复；
- 创建前 assignment scope 检查（普通 native + assign 是创建后检查）；
- 创建后实际 header `child/parent/cwd` 核对；
- 需要在返回中区分 `intent` / `accepted` / `confirmed` / `accepted-unknown`。

使用顺序保持现有契约：授权 → 持久意图 → 原生副作用 → 实际 header 核对。它**不是**普通派发入口；`mattpocock_execute` 已在 0.7.0 移除，不存在并用问题。

**worktree 参数是强绑定的入口。** 传准备好的树，binding 才指向该树；省略它仍会记录继承 cwd 的 binding，但不能声称 child 绑定了某棵专用树。若 lane 之后自己用 `create_worktree` 建树，那棵树只进 observation，不会自动改写/新增这条 binding。

### 4.3 执行事实、binding 与观察

- 执行事实（0.7.1 已实现）：从 `agent/created`、child header、`subagent/start|end`、`agent/disposed` 记录 `native-observed` 事实；失败/取消/结局继续按宿主公开词表。
- 工作树事实：继续观测成功的原生 `create_worktree`（创建者、checkout、分支/基线、创建者活动性）。
- 强绑定：由 delegate 的 `registerIntent → confirm` 写入；binding 带 task/ticketIds/actual child/cwd，是 ticket↔tree 的权威来源。
- 原生路径的关联：0.7.1 的 C 读取时关联（native child 初始 cwd + `create_worktree` 观测、assignment/binding lane）必须标为 `observed`/`inferred`，**不得静默写成 delegate 风格的强 binding**。
- S：继续是宿主 live `Agent.status` 计数；lease 不参与普通路径的容量判断。
- 通知/结局：继续使用现有 `nativeStops` 与 owner 通知路径；不新增第二套生命周期。

## 5. 迁移与验收

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 设计与文档 | 本页；DESIGN 新节；IMPLEMENTATION_PLAN 阶段表；CONTROLS/HOST_INTEGRATION/PTC/ADAPTER/STARTUP/WORKTREE/OBSERVATION/CONTINUABLE/CONSUMPTION/TOOL_CARDS/README 的状态说明 | A 当时文档间无“已移除/已生效”的越级声明，并明示当时仍注册 execute；B/D/E 完成后再按 0.7.0 实际工具面更新当前描述 |
| B 移除 execute（已完成） | 不再注册工具；删除 `executeManaged` 与 `executeNative` 包装路径；更新模型契约、consumption 注入句、client `OWN_TOOL_NAMES`/摘要/工具卡与工具计数；确认原生 `send_message` 的 `additionalContexts`/`concludeTurn` 由宿主处理 | 工具面断言；native `subagent`+`mattpocock_assign` 单 child 回归；native send 不重复；PTC 嵌套；完整根套件 |
| C 原生观察补齐（完成，0.7.1） | `native-observed` 执行事实；原生 child 初始 cwd + `create_worktree` 的**读取时关联**；保持 S/结局/通知；不新增模型工具，不替换 delegate 的强 binding。详细见 [NATIVE_OBSERVATION_CORRELATION.md](<NATIVE_OBSERVATION_CORRELATION.md>) | 观察事实来源正确；无重复派发；无新模型工具；关联标明 observed/inferred；binding 读写/历史回归 |
| D delegate 定位与验收（已完成） | 默认指导改 native-first；delegate 明确为 binding-first creation；更新 Host 模型描述、CONTROLS、WORKTREE_BINDINGS/OBSERVATION 与工具卡；保留 delegate，不在本轮退役 | 文档/描述一致；普通 lane 不会被引导去用 delegate；强绑定成功/失败/取消/acceptance 语义不变 |
| E 验证与发布（发布完成；本机安装未授权） | 严格构建、生成物一致、包清单、根套件、模型契约、PTC、无凭据装载；VERIFICATION 追加记录；已 push `main`、tag `v0.7.0` 并创建 GitHub Release；本机安装另行决定 | 不把源码/内存 fixture 当发行包或当前 GUI；不改历史验证数字 |

最低验收清单：

- 模型工具面不再注册 `mattpocock_execute`；旧会话记录仍可只读显示。
- native `subagent` + `mattpocock_assign` 只产生一个 child；不产生第二个同名 child。
- native `send_message` 不重复投递；PTC 嵌套路径仍注入状态。
- 无 execute 时 S、子代理结局、owner 通知与 `nativeStops` 仍完整。
- delegate 以准备好的 `worktree` 创建时，只产生一个 child，并写出 requested/actual cwd、task、ticketIds 的 binding；`mattpocock_worktree` 能读到它，ticket↔tree 可核验。
- 原生无绑定 lane 不写强 binding；只产生 observation + assignment；读取关联必须标 observed/inferred。
- delegate 省略 `worktree` 时只记录继承 cwd 的 binding，不声称绑定了专用树。
- 旧宿主无原生 cwd 时按 capability 失败关闭或使用兼容提供者，不静默冒充支持。

## 6. 兼容与边界

- **旧宿主**：没有原生 `nativeInitialChildCwd`/创建 seam 的宿主，delegate 的兼容提供者与 `host-patches/` 仍是合法路径；当前宿主优先原生。不能用版本字符串或模型声明替代实际 capability。
- **startup cwd 设置**：保留为旧宿主/兼容提供者路径；正常原生 `subagent({cwd})` 不经过该设置，也不应被它阻断。delegate 在当前宿主使用原生 cwd seam；该设置只作为旧宿主 fallback。
- **send_message**：移除包装前必须验证 `additionalContexts` 与 `concludeTurn` 在原生工具管线中仍被正确处理；若插件有专属 adjacency 逻辑，先移到 `postExecute`。
- **执行事实**：移除包装不等于放弃事实；用 `native-observed` 记录，不以模型文字或空 lease 冒充程序回执。
- **delegate 去留**：方案 A 保留 delegate 实现为可选的强 binding 创建入口，0.8.0 默认不注册；C 的 observation 关联不是替代品。若未来要删除实现，必须先接受一个等价的强绑定写入口（例如显式 post-create bind），并单独更新 DESIGN；不能在没有替代时先删 delegate，丢失创建前 scope 与持久意图。
- **工具计数**：0.8.0 默认是七个固定工具 + 条件 audit；delegate 仅在 `delegate: true` 时作为可选第八项注册。客户端九个 wire key 保留给 opt-in/历史卡片。0.6.0 及更早发行版的九个固定工具记录保留为历史。README/CONTROLS/工具卡按当前实际注册描述。C 只增加 runtime 事实/读取投影，不增加工具。
- **安装/发布**：本页不授权安装、发布、Profile 修改或服务重启；这些仍按 DESIGN/VERIFICATION 的独立门禁。

## 7. 文档索引

| 文档 | 本决策后的职责 |
|---|---|
| [DESIGN.md](<DESIGN.md>) | 权威决策节（native-first + binding-first delegate）与旧节的范围说明 |
| [IMPLEMENTATION_PLAN.md](<IMPLEMENTATION_PLAN.md>) | A–E 阶段、门禁与当前状态 |
| [CONTROLS.md](<../CONTROLS.md>) | 用户指南：native-first 默认流程、强绑定 delegate、execute 退役提示 |
| [HOST_INTEGRATION.md](<HOST_INTEGRATION.md>) | Host 工具面、binding/observation、旧包装退役说明 |
| [PTC_HOOK_SEMANTICS.md](<PTC_HOOK_SEMANTICS.md>) | PTC 嵌套路径与“观察而非包装”的目标语义 |
| [ADAPTER_SCOPE.md](<ADAPTER_SCOPE.md>) | 薄适配边界：不提供通用子代理调度 |
| [STARTUP_CWD_SUPPORT.md](<STARTUP_CWD_SUPPORT.md>) | 旧宿主 cwd 设置/兼容提供者的范围 |
| [WORKTREE_BINDINGS.md](<WORKTREE_BINDINGS.md>) | opt-in delegate 的强绑定协议与 native-first 观察的边界 |
| [WORKTREE_OBSERVATION.md](<WORKTREE_OBSERVATION.md>) | 原生建树观测与 child↔tree 读取时关联的后续 |
| [CONTINUABLE_WORKSPACES.md](<CONTINUABLE_WORKSPACES.md>) | 历史研究；顶部状态说明原生 seam 已交付 |
| [CONSUMPTION.md](<CONSUMPTION.md>) | 注入协议：执行事实来自原生观察；execute 已在 0.7.0 移除 |
| [INSTRUMENT_TOOL_CARDS.md](<INSTRUMENT_TOOL_CARDS.md>) | 0.6.0 九项历史与 0.8.0 默认七项 + opt-in delegate + 条件 audit 的工具卡说明 |
| README（[en](<../README.md>)、[zh-CN](<../README.zh-CN.md>)） | 设计更新提示，不把未实现目标说成当前行为 |
