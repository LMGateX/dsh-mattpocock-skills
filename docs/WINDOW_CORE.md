# 独立 T/S 滚动窗口核心（未挂载）

本次只实现插件仓库中的[窗口模块](<../src/controls/windows.ts>)与[公开 interface 机械测试](<../tests/windows.test.mjs>)。继承[配置/归属核心](<CONTROLS_CORE.md>)、[业务记录契约](<INSTRUMENT_RECORDS.md>)和[当前 session 仪器规格](<SESSION_INSTRUMENTS.md>)；旧 cohort、workspace 合计配额、业务证明/审批及优先级 scheduler 均不恢复。

不挂载工具、Remote、Cordis、GUI、host native gate 或自动状态消费；不改 DSH、profile、运行 GUI，不安装发布，不运行模型。package/barrel/编译制品由集成人维护，本文不声称已发布或宿主全路径强约束。

## 1. 确定的 interface / exports

运行时值：

- `SessionWindows`：构造参数为 `(controls: WorkspaceControls, storage: WindowStorage, authority: InstrumentAuthority, options: WindowOptions)`。
- `MemoryWindowStorage`：显式、非持久测试 Adapter；绝非存储错误 fallback。
- `createDomainWindowStorage(table: VersionedTable<WindowDocument>)`：宿主提供实际 single-table handle、schema、open/close。
- `parseWindowDocument(unknown)`、`initialWindowDocument(InstrumentInstance)`、`parseTicketWindowCommand(unknown)`。

类型：`WindowCapability`、`ExecutionState`、`TicketLease`、`TicketWindowCommand`、`ExecutionRequest`、`ExecutionToken`、`ExecutionReceipt`、`ExecutionLease`、`ExecutionWindowView`、`WindowDocument`、`WindowStorage`、`WindowUsage`、`WindowSnapshot`、`TicketWindowResult`、`ExecutionReservation`、`ReceiptResult`、`WindowProgramPort`、`WindowOptions`、`RuntimeKnowledge`、`RuntimeObservation`。

业务 interface **只有两个操作**：

1. `read(principal, sessionId): Promise<WindowSnapshot>`。
2. `apply(principal, sessionId, command): Promise<TicketWindowResult>`。

principal/sessionId 必须由既有宿主调用上下文携带，不能由模型命令声明。每次调用及 CAS 重试读取当前 `WorkspaceControls.readSession`，取得可信持久 root instance 与原控制工作区策略，再通过 `InstrumentAuthority.resolveAccess` 核验实际作者和 coordinator/assigned scope。受管 descendants 共用 root 的 T/S；不同 workflow 不新开容量；同工作区独立 owner 分开记账。详情按 assignment 过滤，T/S 与 byState 总量始终是整个 instance，不能以可见子集伪造新容量。

Read scope：trusted `assigned.workflowId` 可为 null，表示**无任何业务 workflow 权限**，不是默认继承其他 workflow。此 scope 的票详情全空，T 业务命令全拒绝；既有 SessionInstruments 读 workflows/tickets/decisions 全空、业务写全拒绝。程序执行准入可使用 `workflowId:null, localTicketId:null`，null==null 允许真实无工作流研究；窗口执行详情仅包含所属 instance 的 null-workflow/no-ticket executions，不暴露其他 string-workflow 或 tickets，root 的 S 总量仍包含所有执行。此处 scope 是 workflow 级过滤，不宣称额外 sibling-by-child 隔离：当前 request 没有目标 child identity，若宿主需要更细限制必须提供可信 task/child identity seam，不能用虚构 business workflow 代替。`assigned.workflowId:null` 不得夹带 ticketIds。

### 1.1 模型票意图

~~~ts
// 第一次取得 T；同票已持有时不重复计数。
{ operationId, workflowId, localTicketId, action: 'reserve' }
// 明确模型处置；不核验集成/验收证据，不审批业务正确性。
{ operationId, workflowId, localTicketId, action: 'release', generation }
// 按当前容量恢复原票；产生下一 generation。
{ operationId, workflowId, localTicketId, action: 'reacquire', generation }
~~~

票身份为 instance + workflowId + localTicketId。释放后不能用 reserve 偷换恢复语义，必须 reacquire。release/reacquire 明确引用上次 generation；迟到旧代次记为 ignored，不释放恢复后的名额。重复 operationId 重放原结果与最新快照，不推进 revision；同 operationId 换作者/调用 session/内容/操作种类拒绝。不同操作 ID 的同票重复 reserve 不双计；重复 release 没有额外收益。票窗口结果包含 appliedRevision/replayed/ignored/generation/snapshot。

这里不复制业务标签/票状态字典，也不从自由 label 猜占位效果。业务记录和票窗口是两个已实现模块，**不是同一跨文档事务**；后续工具应分别提交并明确失败，不声称业务记录保存与 T 改动天然原子。

### 1.2 单独 program object capability

构造 options 包含：

~~~ts
{
  runtimeId,                     // 同 host lifetime 共享；host restart 必须换 ID
  capability: 'cooperative',      // 或 unsupported；没有全路径 enforced 选项
  requireKnownRuntime: true,      // 真实 host 应显式开启
  bindProgram(port) { trustedHostProgramPort = port },
  newLeaseId,                     // 可省略，默认 randomUUID
}
~~~

program port 只在 constructor 注入的 trusted callback 中交付。类的公开原型没有 receipt、执行 reserve、知识修改或 port getter；实现使用 JavaScript 私有字段/方法。不要把 port、storage 或构造 callback 暴露给模型工具、Remote 请求体或公共 service lookup。

program port 的三个操作：

~~~ts
reserveExecution(principal, sessionId, {
  operationId, executionId, workflowId: string | null, localTicketId: string | null,
})
// -> { appliedRevision, replayed, dispatchable, token, snapshot }

receipt({
  operationId, instrumentInstanceId, executionId, generation, leaseId,
  state: 'reserved' | 'accepted' | 'scheduled' | 'running'
       | 'stopping' | 'unknown' | 'released',
})
// -> { appliedRevision, replayed, ignored }

reconcileKnowledge(principal, ownerSessionId, {
  operationId, state: 'known' | 'unknown', reason: string | null,
})
// -> { appliedRevision, replayed, ignored }
~~~

executionId 是宿主选择的稳定 task/activation identity，不是消息正文或历史 child 数。`ExecutionRequest` 与 `ExecutionLease.workflowId` 为 string|null；尚未形成业务任务的研究使用显式 null workflow、null ticket，不建立伪 workflow/伪票记录。null workflow 只允许 localTicketId=null；有票必须使用实际非空 string workflow。T 的 TicketWindowCommand.workflowId 仍为 mandatory string，不能 null。宿主的 execution namespace/bookkeeping ID 只作执行身份，不冒充业务 workflow。token 明确绑定 instance/executionId/generation/leaseId。reserve 在持久 CAS 成功后才返回；同 live execution 重复准入不双计，released 后新操作 ID 取得下一 generation 与新 leaseId。相同 executionId 不能改到另一个 workflow/票或改成无票。不同执行角色服务同票可以各占 S，但不重复占 T。

同 operationId 的 reserve 重放返回**原 token**，不是当前新代次；dispatchable=false 表示已释放、旧 runtime、unknown、runtime knowledge 缺口或 capability 不支持，不能 redispatch。即使 dispatchable=true，重放也不是要求再次启动：宿主必须依据自身 dispatch 幂等记录重连/恢复，而非重复 run。此核心不提供跨宿主副作用 exactly-once。

receipt 只确认 token 对应的程序事实。迟到旧代次及已经 released 的 token 保留 fencing tombstone，ignored，不复活、不释放新 slot。状态正常单向推进；重启/unknown 的真实核对可以确认仍运行或已经 released。未知 token、错误 instance/executionId/generation/leaseId 拒绝。单纯 result-ready、业务消息、idle、停止请求、silence、LLM classification 均不能提供 released 回执。

### 1.3 未追踪 native activity / 初始知识核对

RuntimeKnowledge 独立于已登记 execution leases；不虚造一个 execution，也不把 native 缺口当作已确认的零占用。schema 1 文档持久保存 knowledge 和程序观察 journal；快照 runtimeKnowledge 显式给出 runtimeId/known/reason。RuntimeKnowledge 只描述执行账本是否与当前 runtime 对齐；S 的 used/countKnown 来自宿主的实时运行状态（读取时的内存投影），两者不互相推导。

- requireKnownRuntime=true 时，即使新 blank instance 的执行审计为空，snapshot 也为 reconciling（runtimeKnowledge.known=false）；S 的 used/countKnown 仍来自宿主实时运行状态，不因账本知识而被改写成 0。T 模型占位不需要此程序证据。宿主在成员变更节点核对实际后代成员资格，确认无缺口后才通过 program port 提交 known。
- requireKnownRuntime 默认 false，只适用于显式约定「只管理已登记路径」的 embedders/本地 mechanical fixture，不宣称观察全部 native activity。真实 host 集成必须传 true。
- unmanaged native 执行、遗漏回执/映射等由 trusted program observation 提交 unknown + 机械 reason，仅阻止新 managed S 执行准入，不阻止 T 模型占位意图。即使显示关闭、配置关闭或 startup inspection=false，也不能清除已观察的 unknown。
- known 必须 reason=null，unknown 必须非空机械 reason；clear 只有 trusted coordinator scope 的 program capability 可做，模型业务字段、children 的 assignment scope 没有此入口。
- host restart 换 runtimeId，使旧 knowledge 失效；旧 known operationId 的幂等重放不会变成新 runtime 证据，必须重新观察并使用新 operationId。durable knowledge 保留被替换的 runtimeId 作为 `previousRuntimeId`，供 nativeBaseline 把重建归因为 re-establishment，而不是一次静默消失。
- known observation **不会释放/核对任何 execution token**。已有 lease unknown 仍作为审计行保留，必须逐项匹配 receipt 真核对；它不改变读取时的宿主原生 S 计数，也不是派发禁令。

## 2. 计数、配置与恢复

T 计已 held 的票；S 的 used 是宿主报告的实时运行状态——属于该 owner 子树、在成员资格内、且当前运行时的 `Agent.status === 'running'` 的子代理数（`nativeActivity(ownerSessionId)`，读取时为 O(live agents) 内存投影）。capacity 与 used 的比较、注入快照和客户端面板都只用这个数，reserve/receipt/重准入留下的 execution leases 仅作派发审计。目录行的 `activity` 是会话驻留而非执行，因此 idle 常驻子代理不计入；原生启动的子代理进入成员资格后计入。成员资格只在成员变更节点（`agent/created`、`agent/disposed`、`subagent/catalog`、未知 id 的 start/end、首次基线读取、读取发现未知 live 后代）刷新，`agent/status` 翻转零遍历更新计数，普通读取不重复走目录。宿主遍历完整且无 diagnostic 行时 `countKnown=true`、数字精确；服务缺失、根目录读取被拒或任何 `corrupt/unsupported/unavailable` diagnostic 行都使 `countKnown=false`、`countReason` 给出机械原因、`used` 是明示下界（总数未知），绝不把 0 当作已知事实。byState 仍分开显示预留、接受、排队、运行、停止、未知与历史释放，但它不再决定 S.used。无票 request 必须显式 localTicketId=null；执行快照 ticketApplicable=false、ticketReason=no-ticket-assignment，只有 S，不创建假票、不清掉其他 workflows 的 T。

**漂移归因与子代理结局。** 一个被计为 running 的 run 在同一 runtime、成员资格新鲜的情况下，既无 `subagent/end` 也无 `agent/status idle` 却离开 running 集合，是期望差值 suspect：只读该 child 自己的日志，取其最后一个 `turn/end`，按公开词表分类。`subagent/end` 主路径直接采用宿主发布的 `stopReason`，非 `completed` 即产生 item；`error` 附 `LlmFailure` code/message 原文，`interrupted` 表示回合从未正常结束，`max-tokens`/`blocked`/`refusal` 按 kind 报告，`aborted` 仅当取消原因不是本 owner 侧（`parent`/`disposed`）时报告，`completed`/`forked` 为正常返回；读不到日志或无 `turn/end` 时结果是 `unobservable`，带 session id 与最后观测 turn/seq 的证据指针，绝不编造原因。item 进入快照的 `nativeStops`（`itemId=sessionId[:runId]:turn`，带 `outcome`、`turn`、`cancelCause`、`diagnostic`、`evidence` 与该 child 最后已知的 managed dispatch 或持久 binding lane），由既有 notification 通道唤醒 main agent；同一失败 turn 经 durable notification 行去重，后续 turn 再次失败是新 item，重新运行/start 边/迟到 end 到达后经既有路径清除。分类完成的 run 立即退休，后续节点不再重复读日志；普通读取不触发对账。基线读取、插件热重载与 DSH 重启由 durable `knowledge.runtimeId`/前一个 runtimeId 归因，`nativeBaseline` 与 `nativeCount` 明示 re-established，只重建计数，不产生 item、不唤醒。目录不可读时不宣称结局，只保留明示下界。

一个 T 的显式释放即可补一个 T；S 的数量由宿主的实时运行状态给出，一次真实 release 只更新审计行，不再是补名额的动作。

**两个轴的准入与 available 严格独立。** execution/knowledge unknown、旧 S runtime、S 满/overcommitted 或原生 S 缺口（服务缺失、查询被拒、diagnostic 行、成员资格不可读），只影响 S；T 仍仅按已有模型意图、可信业务 scope、当前窗口请求/开关/工作区与 T 容量取得/释放/恢复。T 不索要 native execution 枚举或 program release proof，也不需要造 known。反向 T 满/overcommitted 不阻止无票 S reserve/run/receipt/refill。`capability` 描述实际 S host seam，而不是限制 T deterministic bookkeeping；公共 summary status 可为 reconciling/unsupported，同时 T.available 正常，消费者不能把共同 status 当 T gate。不等待批次，T 与 S 独立且可不同；S=1 可串行安排。票释放不结束仍在跑的 worker，worker 释放不自动完成票。启动票关联执行时，windows configured 要求已有 held T；模块不会自己猜模型的票准入意图。

容量来自当前 controls 的有效策略，没有猜出的数字。缺省容量保持 null，不猜值，公共策略健康可显示 unsupported；每轴独立使用自己的明确容量：T 已配置、S 未配置时 T 可用；S 已配置、T 未配置时无票 S 可用。未配置的那个轴仍为 available=null，并拒绝该轴的有界新准入。capability 始终准确为 S host seam 的 cooperative/unsupported，能力行在原生目录 seam 可用时为 supported。没有 native/human/internal wake veto 覆盖时，不用 prompt 伪装全路径 gate；S 的 used 始终来自宿主实时运行状态，宿主不可枚举时它是明示下界，而不是任何插件侧账本、resident pool 或推测值。

热缩容立即反映 overcommitted，保持已有 leases，不强杀；实际使用超过新 cap 时仅该轴新准入被机械拒绝，不交叉阻挡另一个窗口。display 字段不参与计数。配置 off 不清账：已有 T 可释放，新 T reserve/reacquire disabled；trusted S 继续记账但不执行 cap，available=null 明示未设有效 cap。重新开启按保留占用检查。任何 execution/runtime unknown 在 off 时也继续阻止新受管 S 执行准入，不能借 off 伪造执行释放。

重建 module 不更换 owner instance。旧 runtime 的所有未 released leases 读取时投影为 unknown 并保留为审计行；S 的 used/countKnown 由宿主实时运行状态决定并标注是否 re-established，T.available 与模型占位不受旧 S lease 影响；不靠超时/沉默/业务标签释放。真实 runtime 核对通过 receipt 更新对应 lease；读取本身不写文档，不触发模型，也不把未知自动归零。

**配置排序限制：** controls 文档和 windows 文档分别 CAS，核心每次尝试读当前已保存策略，但没有跨文档原子事务。若 host 要声明 hot-policy-save 与 admission 严格线性化，必须在其 injected coordinator 的同一序列 scope 内排序 policy save 与窗口准入。不能把两次独立读写包装成已实现跨域事务。

## 3. durable storage / strict validation

WindowDocument schemaVersion=1，每个 instance 独立 revision/owner/controlWorkspaceId/knowledge/tickets/executions/operations。每次 parse 验证封闭字段、JSON data、稠密数组、实际身份、正代次、唯一 leaseId、连续执行代次及操作 revision；再重投影 typed operation history 比对保存状态。修改状态数组伪造 release、删 held ticket、清 execution、丢历史、未知版本、未知字段与 getters 均拒绝，不 reset-empty。返回投影深冻结且和输入分离。

WindowStorage seam 是逐 instance read + atomic durable CAS；不存在行的 revision 为 0。createDomainWindowStorage 复用[共享 versioned-storage Adapter](<../src/controls/versioned-storage.ts>)，每实例 ID 一行。相同真实 table handle 返回同 Adapter，共享首次写入序列与 **table-wide indeterminate-write latch**；坏回执可能已持久提交，不回退内存，必须关闭并以 fresh domain/table handle 重开后核对。

存储 ownership：专用 **single-table domain/unit、一个实际 open handle、单 host/process**，所有行由 Adapter 独占，不得外部 put/delete 或 sibling tables 绕过；不是跨进程 CAS。主机负责 schema/open/close，窗口模块不自动开 domain，不读取 GUI/profile。CAS 冲突最多重试 32 次，重新核验策略/授权/容量；持续争用返回 concurrent-update。真实 I/O 错误原样传播且不发布推测成功。

journal、released tombstones 和幂等 ID 不自动过期/GC，以免迟到事件关闭新 lease；当前重投影成本随 history 增长，未实现压缩协议。这是小 interface 的核心实现，不是无限吞吐调度器。

## 4. 最小 host integration 顺序

~~~ts
let program!: WindowProgramPort
const windows = new SessionWindows(controls, durableStorage, instrumentAuthority, {
  runtimeId: hostBootId,
  capability: 'cooperative',
  requireKnownRuntime: true,
  // Reading-time native count; absent/rejected listing degrades to an explicit lower bound.
  nativeActivity: ownerSessionId => nativeSubagentActivity(ownerSessionId),
  bindProgram: port => { program = port },
})
// Host uses its real native observation contract, never message-body classification.
await inspectNativeOwnerExecutionFacts()
await program.reconcileKnowledge(principal, ownerSessionId, {
  operationId: nativeObservationId, state: 'known', reason: null,
})
const reservation = await program.reserveExecution(principal, callerSessionId, {
  operationId: activationOperationId, executionId: taskId,
  workflowId: null, localTicketId: null, // true pre-workflow research; no fake records
})
if (!reservation.dispatchable) return reservation.snapshot
// running/accepted/scheduled receipts are emitted only by actual program callbacks.
await runWithNativeTaskHandle(reservation.token)
// Only after the concrete handle's release/quiescence contract really succeeds:
await program.receipt({ ...reservation.token, operationId: releaseEventId, state: 'released' })
const snapshot = await windows.read(principal, ownerSessionId)
~~~

此代码是对接顺序，不是已安装 DSH 工具或完整失败处理。reserve→run 之间崩溃保留 reservation；run 抛错不表示安全释放，缺 proof 必须 unknown/reconcile。宿主需要把 snapshot 进入已认可的 awaited pre-step/post-execute 消费 seam；本模块不转发子代理业务结果、不抢 job_output、不声称 GUI/自动注入已经接入。

## 5. 已执行机械验证

[测试](<../tests/windows.test.mjs>)经上述公开业务/program/storage interface 覆盖：T≠S、S 只读宿主原生活动（known=true 精确数、diagnostic 下界、被拒 provider 降级为 unknown 而非已知零）、S=1、无票且保留其他 T、accepted/reserved/scheduled/running/stopping/unknown 的审计 byState、同票/同执行幂等、并发/嵌套 root 共享、同工作区 owner 隔离、assignment 授权、迟到旧 release、cold generation、startup/restart/unknown、native 未追踪知识、旧 known replay、热缩容/显示 off/config off、缺省 cap/unsupported、闭合模型输入、strict persisted corruption、single-table 初始化 CAS、indeterminate acknowledgement/fresh-handle recovery、策略冲突重读和 32 次有界争用；续补无 workflow/null-ticket research、null-scope child 无业务权限但能新占 S、真实业务模块空授权投影、nullable 持久化与矛盾 scope 拒绝；独立轴续补 T 在 S unknown/overcommit/unsupported+knowledgefalse 下逐槽 refill/reacquire、T full/overcommit 下 ticketless S run/receipt，以及单轴 capacity unset 的无猜值适用性。

运行：

~~~bash
node --test tests/windows.test.mjs
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --isolatedModules --skipLibCheck --types node src/controls/windows.ts
~~~

本机 Node 24.17.0 执行 source-only fixture：使用已安装 TypeScript 在 memory loader 内 transpile 现有源码，不生成 lib 或临时编译树；依赖 Node registerHooks 可用版本。最终 **35/35 通过、0 skipped**，严格 noEmit 通过。一次早期测试误构造 CAS candidate（只改 revision、漏 journal）先被 invalid-state 拒绝，修正为合法文档的跨行身份探针后通过。

table 用机械 Adapter 验证共享 CAS/失败 latch 和序列化 reopen；**本次没有运行真实 DSH DomainFacility 磁盘探针、宿主运行 gate、GUI、模型试验或整包验收**。既有 versioned storage 的真实 backend 验证不等于本模块已在宿主挂载。集成人维护 package/barrel/制品与后续宿主机械验证。
