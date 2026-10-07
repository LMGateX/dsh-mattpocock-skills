# Parent 实际消费：InstrumentConsumption

## 范围与状态

[纯 TypeScript 核心](<../src/controls/consumption.ts>)把**最新持久事实用于 parent 本次输入**，不是可选 dashboard。它接收可信宿主身份及快照读取函数，返回独立仪器消息的正文与 freshness；Host adapter 创建真正的 UserMessage 并接入实际 awaited pre-step / 合法工具返回消费路径。

本模块没有 runtime Node、Host SDK、网络或文件系统导入，不 eager import 宿主。既有领域类型均为 type-only import。没有修改 barrel、main、package、lib、全局 DSH、profile 或 GUI，没有安装依赖、启用模型或启动新代理。

[机械测试](<../tests/consumption.test.mjs>)只验证核心边界与模拟 host 消息组合，不证明安装版 SDK 接入、真实模型遵守协议或运行中的 GUI 已生效。既有规则来源：[响应式同一步消费](<REACTIVE_WINDOW_INSTRUMENTATION.md>)、[最小引导](<INSTRUMENT_GUIDANCE.md>)、[session 实例与业务归属](<SESSION_INSTRUMENTS.md>)。

## 确切导出

直接导入该模块，不增加 barrel 导出：

~~~ts
import { InstrumentConsumption } from './controls/consumption.js'
import type {
  ConsumptionIdentity, ConsumptionSnapshot, ConsumptionOptions,
  ConsumptionProgramPort, ConsumptionResult,
} from './controls/consumption.js'
~~~

接口参考（与导入示例分开）：

~~~ts
interface ConsumptionIdentity {
  readonly principalId: string
  readonly sessionId: string
  readonly instrumentInstanceId: string
  readonly ownerSessionId: string
}
interface ConsumptionSnapshot {
  readonly sessionId: string
  readonly instance: InstrumentInstance
  readonly policy: EffectivePolicy
  readonly records: InstrumentSnapshot | null
  readonly windows: WindowSnapshot | null
  readonly resources: readonly ResourceView[]
  readonly capabilities: readonly { readonly key: string; readonly status: string; readonly reason: string | null }[]
  readonly health: readonly { readonly scope: string; readonly status: string; readonly reason: string | null }[]
}
interface ConsumptionProgramPort {
  trackCommit(instrumentInstanceId: string, commit: Promise<unknown>): void
}
interface ConsumptionOptions {
  readonly readSnapshot: (identity: ConsumptionIdentity, signal: AbortSignal) => Promise<ConsumptionSnapshot>
  readonly timeoutMs?: number
  readonly maxPendingCommits?: number
  readonly bindProgram?: (program: ConsumptionProgramPort) => void
}
interface ConsumptionResult {
  readonly text: string | null
  readonly snapshot?: ConsumptionSnapshot
  readonly freshness: 'current' | 'stale' | 'unavailable'
  readonly reason?: string
}
// new InstrumentConsumption(options)
// readForConsumption(identity, signal?): Promise<ConsumptionResult>
// cachedText(identity): string | null
~~~

Identity 全部来自 authenticated host association，**不得来自 model/wire 参数**。既有 RuntimeSnapshot 可以结构化兼容；caller / policyGrants 等额外字段不会进入模型正文。实际授权及 child assignment 过滤仍由可信 readSnapshot 负责。

Timeout 默认 1000ms，必须为 1..10000 的 safe integer；maxPendingCommits 默认 1024，必须为 1..65536 的 safe integer，限制**每个实例**未完成/失败提交集合。非法配置直接抛 RangeError，而不是无限等待。

## Producer → 固定 durability frontier → 最新读取

宿主把已开始的**相关持久提交**立即同步登记，再发出 INVALIDATE/已有原生通知：

~~~ts
let program!: ConsumptionProgramPort
const feed = new InstrumentConsumption({
  readSnapshot: (identity, signal) => runtime.readOwnedSnapshot(identity, signal),
  bindProgram: port => { program = port },
})
const commit = persistTrustedReceipt(receipt)
program.trackCommit(trustedInstanceId, commit) // 同步登记，不 await
// 之后才允许发 INVALIDATE；不等 parent 消费，也不等 child 的 end。
~~~

Port 对象冻结，只由 construction callback 捕获，**只有 trackCommit**，不得挂载为 model tools / remote wire。它不解析聊天、不判执行结束、不读 Jobs/childresult、不生成/释放 T 或 S，只登记实际 ledger/resource/config durability Promise。不能把 child lifetime、sender end、模型回答、job_output 消费或 parent fence Promise 冒充持久提交。

每次消费在第一个 await 前捕获**所属实例已有提交的固定 frontier**，等待这些提交后才调用 readSnapshot。别的实例、之后追加的提交、无关 child 生命周期及不断增长的全局队列不加入此次等待。实例 ledger 是共享真值，属于同一实例的已登记持久提交都可能影响 T/S/义务，Host 只登记这种相关提交。

成功提交自动移除；写入结果未知的失败提交保留至一次消费报告 durability-commit-failed，后续消费重新读最新事实，不把原失败当成业务否决。在真正写入之前就被拒绝的受管命令（invalid-input、invalid-state、access-denied、feature-disabled、revision-conflict、operation-conflict、concurrent-update、association-conflict、unknown-session/unknown-workspace）以及受管路径里的 ResourceError（未知/外部资源、已清理绑定、不支持的旧动作）没有写入任何字节，不登记为失败提交：它们只把该调用自身的错误交回调用者，不能让下一次消费退化成 unknown durability。饱和时新增 Promise rejection 仍被观察，但不伪装完整 frontier；返回 commit-frontier-overflow，直到溢出 durability 都实际结算后再报告一次并允许重新读。overflow 不取消任何 producer。

有界 deadline 覆盖捕获的提交及随后 snapshot 读取。超时 abort **读取专用 signal**，不会取消持久提交、杀 child 或取消原 business message；对忽略 signal 的 reader 也有界返回 unknown，迟到完成不能更新缓存。caller signal abort 则抛出**完全相同的 caller reason**，绝不吞成仪器诊断或消耗原生消息。

## Host 必须在真正输入中追加

~~~ts
const decision = await next()
if (decision.kind === 'reject') return decision
// actual RuntimeFacade 每次先执行带身份校验与 durability frontier 的新消费；
// acceptedMessages 是可信 Host 的本次候选批次，不是 wire/model 的送达声明。
const additions = await runtime.preStep(trustedCaller, stepSignal, decision.messages)
stepSignal.throwIfAborted()
return additions.length === 0 ? decision
  : { ...decision, messages: [...decision.messages, ...additions] }
// 正常返回 enter + messages；所有 native 对象、作者、source、ID、正文原样保留。
~~~

Host.makeSnapshotMessage 必须创建独立且由 host/plugin 归属的真正 UserMessage，不能伪装 child 或用户重新授权。本核心不引用 SDK；Host adapter 负责真实 SDK 类型、事件安装、权限与原生消息提交。

原生输入包括 child **仍运行时**的报告/问题、宿主结算通知、普通业务输入及工具业务结果。仪器只补状态，不重复投递 child 回答；普通 relay 绝不等待 sender end / 最终 Job result。不自行读取、抢占或确认原生结果。

已有 context 在 awaited pre-step **之前**可能已采样。不能只更新 cachedText 并依赖那份旧 context；相关变更/失败须经此处新 appended message 进入同一个真实模型请求。关闭任何 display 座位不会禁用本路径。

**text 为 null 仅表示此次读取成功，运行事实与已准备正文相同**；仍有 snapshot。它不是送达证明。实际 [RuntimeFacade](<../src/runtime.ts>)按完整 principal/session/instance/owner 身份保留最近成功准备的候选消息及确切 Agent、Session 对象；仅在此次消费 current 且正文仍相等后，用 cachedText(identity) 取得有界正文。它不会在读取失败、超时、身份错误或 superseded-read 后把旧缓存当 current 重播；失败只能给出带 stale 标头、cachedText 仍为 null 的正文。成功鲜读却报告 degraded/unknown 时仍发送该次读取的明确诊断，cachedText 的失效语义不变。

[HostPorts](<../src/host.ts>)提供可选、仅可信程序使用的 snapshotVisible(caller, actualAgent, message)。实际 adapter 校验 caller 与当前 registry 的精确 Agent/session 身份，再通过原生公开 Session.deriveMessages() 检查 user role、候选 ID、规范化 source 与 content 相等。对象引用相等、事件日志仍有记录、工具回报正文或 model-authored delivered 标记均不构成证明。compaction 的 replace 或原生 message projection 改变有效正文后，即便日志仍保留原消息，也必须重新安装 baseline。端口缺失、不可用或抛错时保守重装，不伪称已经送达。

工具 additionalContexts 只提供候选消费路径，不等于原生 append。同一确切候选已在 Host 的本次 acceptedMessages 时，Runtime 不再追加第二份，并保留原对象/ID/source/body；这个判断只对当前返回批次有效，不持久化成送达事实。外层 hook 再拒绝或改写、随后取消，或下一次批次已不含该候选时，仍重新查有效 surface 并按新成功消费重装。Session/Agent 替换与冷恢复不继承旧对象的准备证明，child 的候选也不能复用 owner 正文。

同步 dynamic context 仍只放短工具指针，绝不在 pre-step 之前把上次缓存冒称最新状态；真正有界鲜读和缺 baseline 重装集中于 awaited pre-step 与工具结果消费路径。

本模块没有 step reject、原生 admission monkeypatch 或隐藏业务 gate。消费失败照样保留 nativeAcceptedMessages 并追加 unknown diagnostic；继续/暂停新受管工作由 Host 已有机械准入与模型按任务约定处理。其他 waterfall 决定与真正的 caller cancellation 仍由宿主遵守。

## 身份、来源与协议

读取结果校验顶层 sessionId、instanceId、ownerSessionId、controlWorkspaceId 与 policy，以及 records/windows 的完整实例身份。错误归属返回 identity-mismatch，不注入错误实例内容。缓存 key 同时含 principal、session、instance、owner，不按 cwd/workspace 混用。共享物理资源可属于另一实例，但必须有当前实例显式 reference；资源全引用授权核验仍属于 readSnapshot/资源核心。

正文只含有效最小协议和当前运行事实：

1. business records 是作者报告，不是程序 S 回执或物理资源证明；保留当前作者与引用，业务状态名称/定义不折算。
2. Skills、用户约定与任务文档决定交付、完成、暂停、取消、reopen 和提问；模型认为必要时登记待裁决，没有统一审批 gate。
3. windows **显式 configured** 时才注入 T reserve/release/reacquire 引导。T 与程序 S 独立，一槽释放即复用，不等待整批；无票 assignment 不造票/不造 T。
4. 受管执行工具 mattpocock_execute，业务登记 mattpocock_record，显式 T 工具 mattpocock_window。列出真实 capabilities，包括 unsupported 与原因；configured 不伪装所有 native 路径均可强制。
5. binding/lifecycle configured 时提醒退休须依实际身份、引用/租约和授权操作；业务“完成”不能当删除授权。
6. feature OFF 的最新快照明确覆盖旧 window/admission 协议；不停止已接受执行、不清记录/资源义务。display OFF 只改显示，不改仪器消费。

固定协议与诊断不夹带开发版本、“candidate/未验证”、模型试验状态等元数据。真实业务文本、任务定义及真实 capability/health reason 仍作为数据保留；Host 必须保证来源正确，不把开发评估备注塞进事实字段。

## Freshness、去重与故障

- 成功取得/校验的最新快照返回 current；health 有 stale/unknown/unavailable/error/failed 时为 stale，reason 为 snapshot-health-degraded。freshness 描述本次读取，不把内部 null/unknown metrics 猜成 0。
- 失败/timeout 不返回 snapshot，也不把旧快照当 current：已有一份成功取得的正文时，正文明说 Instrument state stale 并附稳定 reason，随后是上次成功取得的正文（可能已过期，不是当前容量、完成或释放证明）；无已验证正文时正文明说 Instrument state unknown。有已验证正文则 freshness 为 stale，否则 unavailable；cachedText 随即失效为 null，重复失败重写同一 stale 正文、不叠加标头。identity/policy 前导读取失败时，若该 session 已有 retained association，仍用其上次成功正文加同一 stale 标头，而不是清空事实。前导失败与 representation-boundary 通知走与快照相同的 baseline/可见性判定：相同正文仍在真实输入中时不重复追加。下次成功重新发送有效正文，哪怕 watermark 与失败前相同。
- 稳定机械 reason：consumption-timeout、durability-commit-failed、commit-frontier-overflow、snapshot-read-failed、identity-mismatch、superseded-read。不把内部 exception 文本或开发 metadata 注入模型。
- 同一步内（包括一次 `run_code` 里的多次嵌套工具结果）插件已经排队的相同正文不重复安装：步内按插件自己的投递记账，不依赖 Host 可见性；下一步仍按 baseline 与 `snapshotVisible` 判定是否重投，同一步内状态改变后的新正文仍会投递。
- 被机械预算截断的正文（超长字符串、数组前 8 行、超 32 字段对象）附整体 digest（signature/tailSignature/fieldsSignature），使省略部分的变化也进入指纹，不只比较可见前缀与长度。
- 去重含 businessRevision、configRevision、windowRev、scope、当前登记状态/来源、实际 resources/capabilities/health。忽略 viewerRevision、set-decision-view、hidden/read、read timestamp、纯资源域 ledgerRevision；**读取始终执行**，不凭 watermark 跳过物理观察。
- Resource factsDigest 与实际 physical facts 一起参与指纹。即使 business/config/window watermark 相同，目录、HEAD、脏文件、canRetire reasons 或 digest 改变也更新正文；甚至 adapter 错误复用 digest 时实际事实变化也不会跳过。指纹为 canonical serialization，不是安全/加密哈希。
- 新序列消费完成后，迟到旧并发读只给自己的 superseded-read diagnostic，不覆盖新 feature-off/cache，也不被 Host 当作本次快照消息安装（新的读取拥有状态与 gate）。Host 应顺序处理自身 pre-step，不靠并发读制造业务流程。
- 只有真正被采集为 history 的类别在注入正文里附 query locator；capabilities/health 等派生事实不再指向空的 notRecorded 页面。

## Source-only 验证

~~~sh
node --test tests/consumption.test.mjs
~~~

Node 24 registerHooks 加 repository TypeScript，仅在内存 transpile 此模块；额外按仓库 strict 配置进行本模块 noEmit semantic 检查。19 个机械探针覆盖：无 runtime imports、原生输入原样＋owned message、仍运行 child 即时消费、同步 commit / 固定 frontier / cross-instance、失败/超时/overflow、caller reason、read 故障缓存失效、session/owner/nested ledger 隔离、viewer-only 去重、低 watermark 物理 facts 变化、display/feature OFF、null/unknown、并发防回退。

核心探针本身不证明 Host 接入。[baseline 公共接口测试](<../tests/snapshot-baseline.test.mjs>)另外使用实际 mounted Host、RuntimeFacade、Cordis waterfall/ToolRuntime 和原生公开 Session.create/append/deriveMessages/message projection，验证准备后外层拒绝/改写/取消、真实 append 去重、工具候选批次去重但不确认送达、compaction 与 projection 失去 baseline、Agent/Session 替换、不可用 visibility、degraded 诊断与 child assignment 隔离。所有业务身份和正文均为合成数据。

这些是 source-only 公共接口验收，不调用原生私有 loop 方法、不反射 internals、不发 provider/model 请求、不修改安装版 SDK。没有完整 AgentLoop 调度或真实模型试验；没有 live GUI/Profile 启用或部署，也没有以模型回答证明实际消费。源码构建、打包和全套集成验证由主审独立完成。
