# 原生执行事实与读取时关联（C 阶段）

> **Status:** 2026-11-03 设计增量；**0.7.1 已实施并完成机械验证**（隔离工作树，未安装本机 DSH/Profile/GUI）。它补齐方案 A 的 C 阶段：从宿主原生生命周期事件记录 `native-observed` 执行事实，并在读取时把 native child 与工作树观察关联。**不新增模型工具、Remote 方法或存储域，不写强 binding，不替换 delegate，不改变 S/结局/通知。**
> 公开资料边界：只记录公开事件、合成测试与聚合结果；不发布原始会话、Profile 或本机路径。

## 0. 目标与非目标

**目标**：

1. 普通原生 `subagent` / `subagent_fork` 创建的子会话有可查询的 `native-observed` 执行事实，不再只有 live S 和原生 outcome item。
2. 读取时可以从 child header 初始 cwd + 已观测的 `create_worktree` 行关联出“这个 native child 可能在哪棵树里”，并明确标成 `observed`；不得写成 delegate 风格的强 binding。
3. 保留现有 S、nativeStops、owner 通知、assignment、worktree binding/observation 与 history 行为；这些事实之间不互相冒充。

**非目标**：

- 不恢复 `mattpocock_execute`，不提供通用派发包装。
- 不新增模型工具或新的派发入口。
- 不把 native child 自动绑定到 ticket/tree；需要强绑定时仍用 `mattpocock_delegate`。
- 不把“初始 cwd 等于某棵树”说成“正在使用”或“独占”；没有目录占用机制。
- 不解析所有冷会话日志重建历史；C 只记录本轮 runtime 实际收到的原生生命周期事件。旧会话/未观察到的原生 child 保持 unknown。
- 不把模型文字或业务完成标签当成执行回执。

## 1. 事实来源与记录位置

原生事件已经在 Host 的 `agent/created`、`agent/status`、`agent/disposed`、`subagent/start`、`subagent/end` 上进入 runtime；C 只消费这些事件，不新增轮询。

执行事实存放在**已有**的 owner runtime document（`RuntimeDocument`）的 `nativeExecutions` 数组中。理由：

- 该 document 已经按 owner 持久化、CAS、版本化并进入 history；不需要另造一个没有清理/历史语义的新 domain；
- 执行事实与 assignment/binding/notification 同属 owner 运行时事实，但保持独立字段，**不改 lease/T/S 语义**；
- 旧 document 没有该字段时按空数组解析，旧数据不需要迁移。

一行对应一个 native child session（`executionId = sessionId`），不是一 turn 一行。子代理被唤醒重跑时更新同一行：保留不可变初始 cwd，刷新 runId/state/timestamps；历史由 document revision 记录。这样既避免每个 turn 产生一条无界记录，又保留“这个 child 最新一次实际运行”的可查询事实。

### 1.1 记录字段

```ts
interface NativeExecutionFact {
  readonly executionId: string          // 当前等于 sessionId
  readonly sessionId: string
  readonly parentSessionId: string
  readonly instrumentInstanceId: string
  readonly provider: string | null      // subagent/start 提供的 provider
  readonly runId: string | null         // 最近一次 host runId
  readonly initialCwd: string | null    // 首次可读 child header.cwd；不推断
  readonly state: 'created' | 'running' | 'ended' | 'disposed'
  readonly outcome: string | null       // host stopReason；unknown 保持 null
  readonly observed: string             // 最近一条事实来源，如 'subagent/end: completed'
  readonly startedAt: number            // 首次/最近一次运行开始
  readonly endedAt: number | null       // 最近一次结束
  readonly recordedAt: number           // 最近一次事实写入
}
```

规则：

- 只接受 `session.header.origin === 'subagent'` 且存在 `parentSession` 的 child。
- `initialCwd` 只在首次能读到 `header.cwd` 时写入；之后不因 cwd 变化而改写。初始 cwd 缺失就是 `null`，不能从 observation 或提示词猜。
- `outcome` 只写宿主发布的 `stopReason`；没有 end 就是 `null`，不能从 disposed/idle 推断失败或完成。
- `activity`（running/idle/gone）**不存**，读取时取 live Agent 状态，避免过期。
- 观察写入失败不阻断原生事件、S 计数、outcome item 或通知；失败作为 health/diagnostic 报告。

### 1.2 事件映射

| 事件 | 动作 | 写入 |
|---|---|---|
| `agent/created` | 若行不存在则创建；若已有 running 行不降级 | `state: 'created'`，`initialCwd`，`parentSessionId`，`observed: 'agent/created'` |
| `subagent/start` | 无行则先建；然后标为运行 | `state: 'running'`，`runId`，`provider`，清空 `outcome/endedAt`，`startedAt`，`observed: 'subagent/start'` |
| `subagent/end` | 标为结束并保留公开原因 | `state: 'ended'`，`outcome: stopReason`，`endedAt`，`observed: 'subagent/end: '+stopReason` |
| `agent/disposed` | 仅当尚未 `ended` 时标为 disposed；不编造 outcome | `state: 'disposed'`，`observed: 'agent/disposed'` |
| `agent/status` | 不持久化；读取时提供 live `activity` | 无 |

同一 child 的重复事件必须幂等：候选行与现有行等价时不产生新的 document revision；不把重复 `subagent/start` 当成第二个 child，也不重复发通知。

## 2. 读取时投影

### 2.1 NativeExecutionView

只对实际 owner coordinator 返回（assigned child 返回受限 health，不暴露 sibling 数据）。按 `recordedAt` 倒序取最近最多 64 行；完整事实仍在 history。

```ts
interface NativeExecutionView extends NativeExecutionFact {
  readonly activity: 'running' | 'idle' | 'gone' // live Agent.status，读取时
  readonly lane: { workflowId: string | null; ticketIds: readonly string[]; task: string | null; source: 'inferred' } | null
  readonly worktree: { path: string; observationId: string; source: 'observed' } | null
}
```

- `lane` 从 assignment 或 worktree binding 读取；这是**推断**关联，标 `source: 'inferred'`，不是强 binding。
- `worktree` 只在 `initialCwd` 精确等于某条当前 `create_worktree` observation 的 `path` 时出现；标 `source: 'observed'`。路径不同或未观测到就是 `null`。
- 若同一路径有多条 observation，取最新一条；路径比较必须是精确字符串，不做前缀/软链推断。

### 2.2 WorktreeObservationView 的 nativeChildren

在现有 `worktreeObservations` 行上增加只读字段：

```ts
readonly nativeChildren: readonly {
  readonly sessionId: string
  readonly initialCwd: string
  readonly relation: 'created-tree' | 'initial-cwd'
  readonly source: 'observed'
}[]
```

- `initial-cwd`：native child 的 `initialCwd` 精确等于 observation path，且 child 不是该树的创建者。
- `created-tree`：observation 的 `creatorSessionId` 是该 native child；这只说明它创建了树，不等于它“正在使用”。
- 只从上面两条事实派生；不读取 cwd 历史、不监听 `cd`、不把 assignment 当成目录使用。
- 空数组表示没有可观测关联，不是“没有人使用”。

### 2.3 不写强 binding

C **不调用** `registerIntent/confirm`，不改 `worktrees_*` 文档，不把 observation 转成 binding。强 binding 仍然只由 `mattpocock_delegate` 写入。任何读取投影都不得改变 binding 的 `bindingId`、`actualChildSessionId`、`actualCwd` 或业务状态。

## 3. 对外表面

- `RuntimeSnapshot.nativeExecutions`：当前 owner 的只读执行事实视图；coordinator 以外受限。
- `ConsumptionSnapshot.nativeExecutions`：有界当前行；协议文本增加一条原生执行事实说明（只展示 observed/inferred 标签，不写成任务完成）。
- 客户端窗口投影：在 T/S/outcome 之后显示原生执行事实摘要与行；工作树观测面板显示 `nativeChildren` 关联及标签。
- `mattpocock_history`：通过现有 runtime capture 记录 `kind: 'native-execution'`、`domain: 'runtime'`、`recordId: executionId`；按 document revision 保留历史。查询走现有 history，不新增模型工具。
- `docs/CONSUMPTION.md`、`CONTROLS.md`、`WORKTREE_OBSERVATION.md`、`VERIFICATION.md` 更新为 C 已实施（0.7.1 源码线与制品验证完成；未发布、未安装）。

## 4. 失败、边界与兼容

- **写入门控**：native execution 事实的写入与工作树观测一样遵循 `view.policy.extensionEnabled`。管理关闭时不新增、不更新任何 `nativeExecutions` 行，也不把“跳过写入”记为观察失败；已有行仍按 coordinator 读取投影返回。重新启用后，后续原生生命周期边继续正常写入。
- 观察写入失败只记录 health/unknown，绝不让 `agent/created`、`subagent/start|end` 失败；S/nativeStops/通知路径不变。
- 没有 native 事件、没有 header、没有 parent 或 child 不属于当前 owner instance：不写行；读取时保持空/unknown。
- 旧 runtime document 无 `nativeExecutions`：按空数组解析；不伪造历史。
- 重复 start/end、热重载、无 end 的 disposed：幂等或显式 unknown；不编造 outcome。
- 记录上限：document 保留每个 child 一行；snapshot 最多 64 行。child 的完整历史由 history 查询，不在当前注入里无限增长。
- 没有新存储 domain、没有新模型工具、没有新 Remote 方法；若后续需要，另立设计。

## 5. 验收

1. `agent/created` + `subagent/start` + `subagent/end` 产生一行 `nativeExecutions`；`activity` 随 live Agent 变化，`outcome` 来自宿主 stopReason。
2. 重复事件/热重载不产生第二行、不重复通知；没有 end 的 disposed 保持 `outcome: null`。
3. child 初始 cwd 精确匹配 observation path 时 `worktree.source === 'observed'`；仅 assignment/binding 的 lane 是 `source: 'inferred'`；不写强 binding，binding 行数不变。
4. `nativeChildren` 区分 `initial-cwd` 与 `created-tree`；路径不同不关联；不声称目录被使用。
5. S、nativeStops、owner 通知、worktree binding/observation、history 回归；模型工具面仍是八个固定 + 条件 audit。
6. 旧 runtime document 可解析；观察失败不改变原生事件结果；coordinator 以外不返回执行事实；管理关闭不新增/更新事实且已有行仍可读，重新启用后恢复写入。
7. clean-source prepack、精确 tarball、完整测试与独立 verifier 通过；本轮不发布、不安装本机。

## 6. 实施记录（0.7.1，2026-11-03，隔离工作树）

- 事实：`RuntimeDocument.nativeExecutions`（一行一个 native child session，`executionId = sessionId`；严格 parse + 唯一性；旧文档缺字段按空数组）；`agent/created`/`subagent/start|end`/`agent/disposed` 幂等 fold，`agent/status` 不写；初始 cwd 不可变；观察失败只进 health，不影响 native 事件、S、nativeStops 或通知。
- 视图：`RuntimeSnapshot.nativeExecutions` 仅 coordinator，最近 64 行最新在前；`activity` 读取时取 live Agent；`lane` 标 `inferred`；`worktree` 仅精确初始 cwd 匹配当前 observation 时标 `observed`。工作树观测行增加读取时 `nativeChildren`（`created-tree` / `initial-cwd`，`observed`）。
- 对外：`ConsumptionSnapshot.nativeExecutions` 与 facts 分类；仅在有行时追加协议说明；`mattpocock_history` 通过既有 runtime capture 记录 `kind: native-execution`、`domain: runtime`、`recordId: executionId`、`version: document.revision`。客户端窗口/观测面板只读展示。
- 边界：写入门控为 `view.policy.extensionEnabled`（关闭时不新增/更新、已有行可读，重新启用后恢复）；没有新模型工具、Remote 方法或存储域；没有 `registerIntent/confirm` 或 `worktrees_*` 写入；binding 字段/行数不变。完整测试计数、客户端/构建产物、clean-source 制品字节与 sha256 见 [VERIFICATION.md](<VERIFICATION.md>) 的 0.7.1 节。
