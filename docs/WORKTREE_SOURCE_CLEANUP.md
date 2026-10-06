# 工作树绑定源数据清理：V2 materialization 与显式历史删除

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

2026-10-06。对应用户新授权的所有仪器源 GC；本页仅覆盖 [worktree-bindings.ts](<../src/controls/worktree-bindings.ts>)，不实现 runtime/Host/HistStore、Remote 或部署。旧[绑定核心说明](<WORKTREE_BINDINGS.md>)的默认历史保留规则继续适用；本页新增**明确选择后删除旧版本正文**的能力与 V1/V2 兼容规则。

## 1. 小 interface 与稳定类型

```typescript
compact(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: {
  operationId: string,
  expectedRevision: number, // owner DOCUMENT revision，不是 row revision
}, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>

purgeHistory(owner: InstrumentInstance, actualAuthor: InstrumentAuthor, command: {
  operationId: string,
  expectedRevision: number,
  throughRevision: number, // inclusive，不能超过 expectedRevision
  bindingIds: readonly string[], // 明确、非空、无重复；全部属于该 owner
}, signal?: AbortSignal): Promise<WorktreeBindingsCleanupResult>

interface WorktreeBindingsCleanupResult {
  revision: number
  removedVersions: number       // 本次实际删除的旧版本正文数
  checkpointRev: number
  sourceCoverage: {
    kind: 'history-only'
    throughRevision: number
    removedVersions: number     // 累计已删除正文数
    removed: readonly { bindingId: string, revision: number }[]
  }
  replayed: boolean
}
```

导出类型为 WorktreeBindingsCompact、WorktreeBindingsPurgeHistory、WorktreeBindingsCleanupResult、WorktreeBindingsSourceCoverage。WorktreeBindingsDocument 是 V1/V2 union，parseWorktreeBindingsDocument 总返回规范化 WorktreeBindingsMaterializedDocument（schemaVersion=2）。query 增加 checkpointRev/sourceCoverage；原 rows/current 入口保留。

## 2. compact 是 lossless，不是全 owner wipe

**compact 保留全部逐版本 history、旧 notes/task/diagnostic 和业务 command 引用，removedVersions=0。** 它推进显式 materialization checkpoint，将当前 value、稳定创建身份与技术 manifest 作为可独立读取的 V2 结构；去重回执使用正文的 SHA-256 digest，而不是额外保存 operation.fingerprint 原正文。旧 history 仍可查询，不能把 compact 当“默认删所有已结束树历史”。

只有 purgeHistory 的明确 bindingIds＋throughRevision 才能删除选定行的旧版本 body。未选行的历史，以及 cut 之后的版本都保持不变。没有默认 TTL、年龄规则、目录检查、delete-record、tree/branch 删除或生命周期审批。

## 3. history-only 删除的准确范围

删除条件同时满足：指定 bindingId、version.revision ≤ throughRevision、version.revision < row.revision。最新 row.value 与其最新版本完整保留；即使 cut 包含当前版本，也不删当前正文。

- 选定旧版本的 value 正文（含旧 notes/task/diagnostic）及当时 business command/ref 正文从 source history 数组实际移除，不只是 HistStore 副本隐藏。
- 被删除旧 business 操作只剩 digest、actual author、operationId、kind、bindingId、applied revision。重试核对 digest，既不恢复旧 notes，也不重新追加正文。
- 当前 value 的 task/notes/diagnostic 仍完整保留。若旧 task 同时仍是不可变创建 task/当前 task，它不会从所有字节中消失；本能力**不是当前正文或记录删除**。技术身份、路径、parent/child、native acceptance、cleaned 状态与作者元数据不删。
- 操作 digest 不是原正文，也不是“历史正文仍完整可查”的替代。已删正文明确标 coverage hole，不能伪造空 notes、缺省 state 或伪完整历史。
- query.rows 返回全部保留绑定行及其尚保留的版本，query.sourceCoverage 列明已删版本。query.current 仍只是最新简要投影，不包含 history；discarded 未 cleaned 仍提示。

用户默认要求全部 session 工作树历史可查，仍满足直到明确选择删除。删除操作的来源范围是该 owner 的 binding 源账本；聊天正文、原生 session history、其他 instrument 和 Git 目录均在本模块之外。

## 4. V2 checkpoint、技术 manifest 与创建身份独立

V2 文档保存 schemaVersion、document revision、完整 owner、checkpointRev、purgedThroughRevision、rows、manifest 和 operations。

row 保留当前 value/row revision、retained history，另有 creationAuthor、creationDigest 和不带 task 的固定 identity。manifest 对每个历史 source revision 保存技术 identity、actual child/cwd、acceptance、businessState、actual author、source、valueDigest、notesDigest、retained 标志。它**不保存 task/notes/diagnostic 正文**，因此已删正文不能通过 manifest 回流。notesDigest 仅保留 notes 的 hash，供跨已删 predecessor 的 program 更新验证“没有改业务 notes”；它不是保留原 notes 正文。

第一次 registerIntent 的真实 creator 与规范化创建载荷 digest 独立于 history[0]。初始 intent body 被 purge 后，原请求仍 dispatch=false；同 ID 改 task/目录/child/parent/作者冲突。child 与 bindingId 永不按路径重新分配；accepted/confirmed 与 cleaned 不因清理历史重置。晚到 confirm/reconcile 保留 cleaned，不能复活旧关系。

操作回执只有 digest/技术元数据；包括创建、业务、compact/purge 的去重身份。cleanup 回执另保存此次 count/checkpoint/coverage，不保存旧业务正文。重复相同 cleanup 返回原回执并 replayed=true，不进行第二次删除或猜新建已发生。

解析器校验当前 value 与最新 retained body/hash 一致、历史技术修订连续覆盖、所有 retained body 与 manifest 一致、业务 command digest/row/expected revision 引用、创建作者/创建 digest、清理 checkpoint 回执与实际 holes 一致。没有清理回执的缺口拒绝；compact 若新增缺口拒绝；历史 accepted/actual cwd/cleaned 不能在跨 hole 的后继版本重置。不 reset-empty、不以编造 notes 填缺口。

## 5. V1 兼容与普通写入

V1 文档先走原有完整历史校验，再在内存规范化为 V2；**纯读取不写盘、不删除历史**。第一次普通创建/确认/业务更新成功提交 V2，checkpointRev=0，旧版本完整保留。只有显式 compact/purge 推进 checkpoint。

此迁移不会伪造旧来源作者。creationAuthor/creationDigest 从合法原始 intent 派生；business digest 从合法原 command 派生，之后不再依赖原 body 去重。

## 6. 作者、CAS 与部分失败

调用方先验证真实 caller/owner/path 授权，actualAuthor 不是请求体里的声明。source cleanup 只允许 actual agent.sessionId=owner.ownerSessionId 的 root 主代理，或宿主认证的 direct user principal（kind=user/sessionId=null）。受管 child—even 原创建者—不能源清理。该 root 一致性检查不是实际权限认证，主 runtime 必须强绑定真 caller、instance/workspace 与用户访问权；operationId 不赋权。

expectedRevision 使用 document 水位；新写入先核对同 operation 去重，再检查 revision。CAS=false 有界重读，若其他新写改变文档就 revision-conflict；不把 stale 清理偷偷应用到新内容。selector 在 await 前规范化、去引用并校验。

compact/purgeHistory 末尾的第四参数 signal 是可选可信 AbortSignal，不属于 JSON command，也不是新 approval。整个复合 history-only/source 流程必须由 runtime 传递同一个 signal。核心在 entry、每次 storage.read await 后、load await 后及真正 compareAndSwap 调用前 throwIfAborted；存储 Adapter 取出后再次检查，避免读取完成/进入 source 后的取消仍启动写入。取消发生在源 CAS 前时，sourceCAS=0，完整 current、creationAuthor/digest、manifest/coverage/operation fences 与旧正文保持不变，既不持久新取消回执也不改业务状态。

CAS 已开始后收到取消，不能承诺写入撤销。核心等待 CAS：返回 true 时先返回已确认提交的实际回执，不在成功回执之后以迟到取消改报拒绝；已删正文不回补。返回 false 时，在重读或下一次重试前检查 signal，取消可阻止尚未开始的下一次写入。CAS 本身抛出真实 I/O／ACK 丢失错误时，该错误原样保留，不被迟到取消覆盖，也不能假定回滚；没有可靠源回执时 runtime 才报告该源 unknown 并核对真实持久结果。已确认的源提交与后续域／ACK 取消造成的 partial 分别记录。省略 signal 时保持原有行为，不新增全局锁或阻止普通业务写入。早期“成功提交后仍抛取消”的说明已被本段当前契约取代。

持久异常原样抛出，遵守已有 VersionedStorage table-wide storage-uncertain latch；必须 fresh actual domain/backend handle 重开查真实结果。提交已发生但回执失败时，重开后相同操作只读取已提交 digest/coverage；**不恢复已删正文**，不 native redispatch、不 Memory fallback。

主工程的组合动作应先持久 Hist suppression，再执行 source CAS，最后 source ACK。source GC 失败不能重新导出先前被 suppression 的旧正文，或把 HistStore 旧副本补回 source。跨这些域没有原子事务，本模块只提供 source 自身 CAS/回执；组合协议、工具命名 purge-source/compact-source 与故障报告由主工程实现。

## 7. TDD 与真实 native JSON 验证

[新 source cleanup 测试](<../tests/worktree-cleanup.test.mjs>)使用公开 WorktreeBindings seam；[原核心测试](<../tests/worktree-bindings.test.mjs>)十项保持不变、全部通过。

本轮逐片记录：

| Slice | 实際 red | Green |
|---|---|---:|
| lossless compact＋digest 回执 | 0 通过/1 失败，compact 未存在；按主工程纠正明确保全部旧版本 | 1/1 新测试＋10/10 原测试 |
| 显式 selected history purge | 1 通过/1 失败，purge selector 未实现 | 2/2 新测试＋10/10 原测试 |
| source holes 必须有 cleanup 回执 | 2 通过/1 失败，损坏 checkpoint 未拒绝 | 3/3 新测试＋10/10 原测试 |
| 已实现机制的 focused 验证 | root/user/stale CAS/cleaned、V1 普通写迁移、真实 JSON/重开/新进程三项 | 6/6 新测试＋10/10 原测试 |
| 删除 predecessor 后 program 不能改 agent notes | 6 通过/1 失败，跨缺口正文一致性未拒绝 | 7/7 新测试＋10/10 原测试 |
| source 已 invoked，内部第二次 read 挂起后取消 | 7 通过/1 失败，未拒绝且可继续 sourceCAS；验证覆盖 compact/purge 两种调用 | 8/8 source 测试＋10/10 原测试 |
| 历史取消 checkpoint focused 检查 | 当时 entry/final-CAS 不写；旧 postcommit abort 拒绝语义已被第 6 节“已确认 CAS 回执优先”取代，不作为当前契约 | 历史记录 9/9 source 测试＋10/10 原测试 |

最终执行：

```bash
DSH_CONTROLS_HOST_ROOT=/absolute/sdk \
  node --test tests/worktree-cleanup.test.mjs tests/worktree-bindings.test.mjs
pnpm exec tsc -p tsconfig.json --noEmit
```

结果：**19/19 通过、零失败、零跳过、exit 0**；全工程 strict TypeScript noEmit **exit 0**。另独立 entry 的 strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes/verbatimModuleSyntax/isolatedModules 检查 exit 0。

真实部分：安装版 DSH 的 DomainFacility＋JsonStorageBackend 写到新临时目录；实际 source JSON 在删除前含 unique-old-note-marker，删除后字节不含该 marker，而未选旧 note/当前 note 仍在。真实 table.update 持久成功后故意丢回执触发 storage-uncertain；fresh facility/backend handle 重开确认 source holes、完整当前 value、原创建 dispatch=false、原 business 重试不回填。独立新 Node 进程读取相同 source 文件，快照一致、旧 marker 不存在、当前 marker 存在。fixture 目录按已验证绝对临时路径清除。

未设置 DSH_CONTROLS_HOST_ROOT 时 native JSON case 会明确 skip，不能计作通过。本轮没有创建真实 native 子代理或运行 AgentLoop/模型；“不 redispatch”验证的是 binding source 登记回执，不是新模型调用的实测。该阶段证明源域接口，不证明 SDK/Profile/GUI 安装或当前完整集成验收；当前收尾状态见[公开验证说明](<VERIFICATION.md>)。
