# Window 源正文压缩与显式历史删除

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

2026-10-06。实现是[窗口 TS 深模块](<../src/controls/windows.ts>)，验证是[新增 source-only 测试](<../tests/window-cleanup.test.mjs>)；此前[窗口机械测试](<../tests/windows.test.mjs>)保持不改。本文件记录当时的窗口源域范围，不将其独立验证等同于 runtime/Host/Client 组合、部署或发布验收。当前集成与收尾状态见[公开验证说明](<VERIFICATION.md>)。

## 1. 小 interface：可信程序 port 的两个维护操作

原业务 interface 仍只有 `SessionWindows.read/apply`。维护操作只通过 constructor 的可信 `bindProgram` object capability 交付，不把程序回执或事实写能力注册成模型工具：

```ts
interface WindowCompactRequest {
  readonly operationId: string
  readonly expectedRevision: number
}
type WindowHistoryTarget = { readonly kind: 'knowledge' }
  | { readonly kind: 'ticket'; readonly workflowId: string; readonly localTicketId: string }
  | { readonly kind: 'execution'; readonly executionId: string }
interface WindowPurgeRequest extends WindowCompactRequest {
  readonly throughRevision: number
  readonly targets: readonly WindowHistoryTarget[]
}
interface WindowHistoryResult {
  readonly appliedRevision: number
  readonly replayed: boolean
  readonly compactedThroughRevision: number
  readonly purgedOperationIds: readonly string[]
}
program.compactHistory(principal, ownerSessionId, request, signal?: AbortSignal): Promise<WindowHistoryResult>
program.purgeHistory(principal, ownerSessionId, request, signal?: AbortSignal): Promise<WindowHistoryResult>
```

- principal/sessionId 来自真实宿主调用，不是命令声明。每次调用及 CAS 重读核验既有读写授权、可信作者与 instance 归属，要求 coordinator 且实际调用 session 是持久 owner；不是新增业务审批。
- 命令字段封闭；targets 必须非空、合法、不同，且规范排序。不能夹带程序 state、author 或 token。容量、未知知识、feature status 不参与维护授权。
- expectedRevision 是窗口统一 CAS 修订。先重验授权，再按相同 operationId 的真实 caller/规范请求幂等返回原结果；换 caller、换请求或借用其他种类 ID 为 operation-conflict。
- 新请求水位不匹配为 revision-conflict；CAS 重读最多 32 次，不按旧水位扩大删除范围。维护成功推进一次统一 revision，不制造票/执行/知识事件。

### 1.1 可信取消信号与不可假定的 rollback

第四实参 `signal?: AbortSignal` 是宿主传递的可信运行控制，不是 JSON 命令字段、不进入 payload digest，也不是新业务审批。省略保持原行为；JSON input 夹带 signal 仍拒绝。组合 history-only 操作应把同一个 signal 贯穿 compact/purge，不另开一个不受原取消影响的信号。

维护入口、授权/readSession/resolveAccess、source storage.read 等 await 完成后，以及真正调用 source compareAndSwap 前，均执行 throwIfAborted。core 已被调用但内部 read 仍等待时取消，完成 read 后停止，source CAS 不发生，原 current/creator/lease/token/origin/body 都不改；不锁定后续正常业务或其他 source 操作。

CAS 已经开始后，取消不能假定 rollback。若 compareAndSwap 返回 true，核心应先返回已确认提交的实际回执，不在成功回执之后用迟到取消改报拒绝或未写入。若 CAS 返回 false，在争用重读或重试前检查 signal，取消可阻止下一次尚未开始的写入。若 CAS 自身因 I/O／ACK 丢失抛错，原 storage error 不被迟到取消覆盖，既有 storage-uncertain latch 与 fresh-handle 核对规则仍适用；没有可靠回执才报告该源结果不确定。Runtime 保留已确认的源结果，并如实区分后续未完成域或 ACK 的 partial/uncertain，不撤掉已持久 suppression 或构造跨域 rollback。早期“成功 CAS 后仍因取消拒绝”的说明已被本契约取代。

## 2. schema 1 与真正的 schema 2 checkpoint

合法 schema 1 继续读取，未压缩普通写入保持 schema 1，没有启动时隐式删除。schema 2 零切点也合法。显式 compact 物化已验证 current，不伪造旧 commands 来重建日志。schema 2 保留原 current `knowledge/tickets/executions`、revision 和以下字段：

| 字段 | 实际意义 |
|---|---|
| checkpoint.throughRevision | 物化状态覆盖的统一修订水位 |
| checkpoint.knowledge/tickets/executions | 切点处 current；包含所有 held/released、执行代次与四部分 token |
| checkpoint.reservationOrigins | 每个 lease 的 `{leaseId, revision}`，首次 reservation 原修订独立保留 |
| checkpoint.stateDigest | 规范物化字段的 SHA-256 checksum，不是作者认证或业务证明 |
| dedup | 已吸收 operations 的摘要 fencing tombstones，无完整 fingerprint JSON |
| retainedOperations | 已吸收且尚未删除的原完整正文，供完整历史读取 |
| operations | checkpoint 后的原 operation tail，普通写入继续追加 |
| historyActions | 维护请求 digest、真实 caller/runtime、水位和原结果，无完整请求正文 |

compact 仅吸收当时 tail，保留未删的全部历史正文，不恢复曾删正文。所有普通事件与维护动作修订组成连续不重复的统一 journal。tail 从真实 checkpoint current 继续投影并匹配顶层 current。

旧 data operation 的 dedup 仅保存 operationId、kind、caller、runtimeId、原 applied revision、generation、leaseId、ignored、必要实体 target 与 digest。digest 是 `SHA256(JSON.stringify([kind, actualCaller, canonicalPayload]))`；canonicalPayload 由既有封闭运行时解析器产生。完整 JSON 正文只在 tail/retainedOperations，不换字段偷偷保留。

每个 compacted dedup 必须恰好对应一份严格匹配的 retained 正文，或恰好一项显式 purge 删除回执；没有回执的历史正文缺口也是损坏，不因 current/checkpoint 仍可读取而接受。删除回执必须引用当时 checkpoint cut 内的 dedup，不能重复声明同一正文的物理删除，也不能删除当时同 target 最新或 checkpoint base 必需正文；即使该 target 后来更新，历史保护条件仍核验。

解析拒绝未知 schema/字段、getter/稀疏数组、坏状态、journal 缺口/重复、跨实例/重标执行、重复 lease、非法 generation、丢失或篡改 origin、checksum/current 漂移、retained 正文与 dedup 不符、无回执正文缺口、不可发生的 purge 回执，以及塞回已 purge 正文。不把损坏数据 reset-empty。清理后 materialized current 是存储事实，已删正文不可重建；checksum 不宣称认证恶意整份存储重写。

## 3. 删除范围与真实 GC

purge 要求 schema 2 且 `throughRevision <= checkpoint.throughRevision`；切点未覆盖则明确 invalid-input，请先显式 compact。仅移除 retainedOperations 中同时满足：

1. revision 不大于明确 throughRevision。
2. 精确命中显式 target。
3. 是 history-only，而非该 target 最新正文或 checkpoint base 必需的最新正文。

实际删除 operation IDs 逐项返回。未选择 target 的完整正文、post-cut tail、最新/current 必需正文留下。运行知识旧 reason 被较新观察覆盖并被 checkpoint 吸收后，可以从真实源 JSON 完全消失。

**checkpoint base：** compact 后若又有新 tail 更新，旧 base 最新正文仍是必要状态；purge 不偷做自动 compact。再显式 compact 后，已覆盖旧正文才成为 history-only。组合层应紧接 compact 水位选择 purge，并如实显示哪些项未实际删除。无默认 TTL 或自动清空。

不删除 ticket identity/generation/held、任何 execution generation/token/released tombstone、runtime knowledge current、reservationOrigins 或 dedup 摘要。原 operationId 重试返回原结果，不追加正文、不改 current；同 ID 新载荷失败。迟到旧 release 仍 ignored、错误 token 仍拒绝；新执行 identity 仍按 T/S advisory 允许，不因 unknown 被阻断。无 Git/native actors/冷续用 closure 处置。

## 4. 历史读取、故障与跨域组合

授权后宿主读取：schema 1 使用 operations；schema 2 将 `retainedOperations + operations` 按 revision 排序。这是仍保留的完整 data operation 正文，不能把 dedup/historyActions 摘要伪称旧正文。GC 缺项是明确删除，不可用 tombstone 还原；首次 reservation fencing 不依赖正文。

历史索引/副本删除与窗口源正文删除不是同一动作，不是原生跨 domain 事务。主组合层应先持久写历史 suppression，再做 source CAS，分别报告结果；source 失败或 ack 丢失必须明确 partial/uncertain，不声称双域原子成功，也不能撤掉 suppression 让旧源内容回流。此模块不打开或改其他仪器 domain。

复用既有 single-table Adapter：一个实际 open table handle 独占存储单位。一次不确定写锁定共享 handle 为 storage-uncertain；真实删除成功后 ack 仍可能丢失。必须关闭并用 fresh handle 核对持久状态，再幂等续用。无跨进程 concurrent writers、跨 domain 原子性或跨宿主副作用 exactly-once 承诺。

## 5. 实际验证与 red→green 记录

```bash
pnpm exec tsc --noEmit -p tsconfig.json
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/window-cleanup.test.mjs tests/windows.test.mjs
```

- 源测试 in-memory transpile 生产 TS，不依赖本仓库 lib，不生成制品。
- 前三片各先 red 后 green：v2 checkpoint 原 unknown-key 拒绝；compactHistory 不存在；purgeHistory 不存在。每片失败 exit 1 后实现并复验。
- 后续每片分别加入并执行：多代次 GC/late receipts，授权/命令/CAS，v2 corruption/origins，竞争 revision，真实提交后丢回执/fresh recovery，native JSON 独立进程。
- native JSON 首次失败因 fixture 重启后重复 leaseId；生产正确拒绝 association-conflict。仅将 fixture 的 opaque lease ID 按 runtime 区分后通过，未放宽生产唯一性。
- 独立 Standards 审查发现 P2：reserve→release→compact 后，只删除旧 reserve 的 retained 正文，原 codec 未拒绝。新增公开 parse/read 反例先 red（Missing expected exception，exit 1）再补恰好一次正文/回执覆盖后 green；随后切点外回执、历史当时 target latest 被删、重复删除回执三片也各自先 red 再 green。没有引入签名或外部恶意整份重写防护。
- Spec 实际取消 probe 修复：在 core 内第二次 source storage.read 完成前取消，先 red（Missing expected rejection，exit 1）再传第四实参并加入取消检查，green 证明 source CAS 增量 0、current/creator/token/fences 完全不变；其中早期成功 CAS 后仍检查取消并拒绝的解释已被第 1.1 节实际回执优先契约取代。再分别执行 compact 授权 await 取消、CAS 已提交后取消不得假 rollback、取消过程中 ACK 丢失仍传播原 storage error/latch 三片回归。
- 最新窗口组合回归 **54/54 pass，0 fail，0 skipped**（旧 37 + 新 17）。严格 TS noEmit 通过；未 build lib。
- 实际 DomainFacility + JsonStorageBackend 使用独立临时 root；关闭后读取真实 JSON，确认 unique-old-reason-marker 不存在而 current marker 存在。独立 Node process 重开后原 op 重试不复活正文，late old token 不释放新 generation；current unknown/held T 不变，新 execution identity 可派发。不修改安装版 SDK，不启动 Profile/Cordis/plugin/server/model。
- 未设 DSH_CONTROLS_HOST_ROOT 时 native 用例明确 skipped，不算通过。上面结果来自显式启用 native 的命令。

SDK 文档先 Context7 resolve/query，再只读本机声明核对；参考 [domain storage](<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.md>)、[storage-domain](<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/storage/storage-domain/README.md>)、[JSON backend](<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/storage/storage-json/README.md>)。源码验证不等于 live 部署/发布授权。
