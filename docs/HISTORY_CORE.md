# 全仪器会话历史核心：持久、当前投影与主动查询分层

2026-10-06。按用户认可实施的持久历史模块；实现为[历史核心](<../src/controls/history.ts>)，组合入口为[运行协调](<../src/runtime.ts>)，测试覆盖[历史公开接口](<../tests/history.test.mjs>)。本轮已从第一阶段「只整理历史副本」扩展到三个源域的显式 checkpoint 与定向旧历史删除，见第 8 节。SessionHistory 自身仍只管理历史副本；源清理由各自源码模块及 runtime 组合完成，不把副本 purge 冒称源删除。本契约优先于[旧事件记录契约](<INSTRUMENT_RECORDS.md>)中尚无整理入口的阶段描述；业务判断与磁盘树处置仍由 agent/用户决定。

## 1. 小 interface 与可信组合

~~~ts
const history = new SessionHistory(instance, storage, now?)
await history.capture(observations)
await history.query({ kind?, recordId?, limit?, cursor? })
await history.detail(historyIds)
await history.activeContext()
await history.apply(action, trustedSource, signal?)
await history.compact()
~~~

- instance 是调用者已授权的 InstrumentInstance 三元组：instrumentInstanceId / ownerSessionId / controlWorkspaceId。核心固定作用域，不接受 query 的 owner 参数，也不能用过滤器跨 owner。
- HistoryStorage 就是 VersionedStorage<HistoryDocument>。MemoryHistoryStorage(instance, seed?) 是显式非持久测试 Adapter，不是故障 fallback。createDomainHistoryStorage(table, instance) 用 ownerSessionId 分行；组合方也可自行提供 suffix-keyed VersionedStorage。读写都核验文档三元组，不能把另一 owner 的文档送入 scoped instance。
- 授权在 runtime 外层完成：每次调用先核验真实 caller、owner / assignment 与操作权限，再取得该 scoped instance。core 不把模型请求的 source/author 当作可信凭证。source 在本 interface 是**可信宿主调用参数**，不应直接映射模型请求字段。
- types 与实现均 browser-pure：没有 Node 运行时 import。导出 HistoryJSON / HistorySource / HistoryObservation / HistoryRow / HistoryDocument / HistoryStorage / HistoryCursor / HistoryQuery / HistorySummary / HistoryCoverage / HistoryPage / HistoryDetail / HistoryAction / HistoryApplyResult 等，Client 可直接 import type。

## 2. 捕获的是已存在的事实，不制造旧历史

HistoryObservation 字段：kind、recordId（对象身份）、recordKey（来源记录键）、version（来源版本）、snapshot（有限无环 JSON）、source，以及可选 summary / flags。

source 保存：

| 字段 | 含义 |
|---|---|
| kind | authored / program / snapshot，分别为作者报告、程序观察、现有状态快照 |
| domain | 真实来源域，不由工具请求伪造 |
| author | 原真实作者 JSON；没有可追溯作者的当前快照用 null |
| recordedAt | 来源自己的原记录时间，未知用 null |
| coverage | recorded-history 或 snapshot-only，不冒称拥有部署前未记录的变更 |

HistoryRow 另存 capturedAt（本历史核心观察时间）、sequence、historyId、sourceDomain、purged。初次 capture 既有仪器 history 时，保留每条旧记录的 author / recordedAt / value；不能把本次观察时刻写成旧作者创作时刻。配置、资源等只有当前状态的来源，只登记 latest snapshot-only，不从它反推旧配置或旧资源事件。

- 身份去重按 kind + recordId + sourceDomain + version。recordKey 与对象 ID 独立；同版本从不同 observer key 重复捕获同内容不增长，原 recordKey 保留。同来源版本内容或 provenance 冲突返回 operation-conflict，宿主必须提供真正的新 source version，不能静默覆盖旧版本。
- snapshot 的 JSON object keys 规范化排序；值原样保存，不重新解释自由业务状态。capture 在 await 前重建输入；返回值与存储结果均冻结。
- 同一来源的迟到低版本可写入历史，但不会使 activeContext 倒退；相同对象各历史版本仍独立可分页。
- capture 的一批观察一次有界 CAS，最多 32 次争用；重复整批不会写新修订。真实来源 mutation 与 history capture **不是跨域事务**；组合方应报告 partial failure，后续从真实持久来源重读补捕获，不读内存 fallback、不伪称原子成功。

## 3. 有界分页、冻结 cut 与按需详情

HistoryQuery 仅有 kind? / recordId? / limit? / cursor?。limit 默认 50，范围 1..100。HistoryPage 返回 instance、revision、cut、total、rows、nextCursor、coverage、notRecorded。

- rows 是 HistorySummary，即去掉 snapshot 的 HistoryRow；带对象 ID、历史 ID、来源/作者/时间、version、flags、可选 summary。摘要分页不是全部正文。
- 初次查询冻结 cut = 当时最大 sequence，顺序为持久 capture 序号递增，不声称按原来源时间排序。cursor 固定 owner/instance/workspace、kind/recordId 筛选、cut 与 after；后续调用必须重复相同筛选。返回 cursor 冻结，宿主运输层可序列化该 JSON object。
- 新对象与既有对象的新版本只出现在新一次查询中。旧 cursor 保留 cut 内所有旧版本，不能按「当前对象最新版本」重算导致漏旧或重复。
- detail 一次至多 20 个唯一 historyIds，返回有正文的 rows 与 missingHistoryIds / coverage / notRecorded；missing 不是空正文、删除回执或完整历史。
- coverage.sources 明示本次选中集合的真实 source domain 与 recorded-history / snapshot-only。notRecorded 在无任何匹配记录或详情有缺失 ID 时为 true；它不表示其他来源从未发生事件。
- purge 后仍保留 sequence 槽位，旧 cursor 能看见 source=null、purged=true 的 tombstone；coverage.purged=true 明示正文缺口。到达 nextCursor=null 只意味着走完该 cut 的记录/墓碑，不意味着全部源域历史、全部正文或无删除洞。

## 4. 当前投影、归档与显式删除分开

activeContext 返回每对象最新版本的摘要，不是全部历史。普通对象默认纳入；明确 flags.done 默认退出（票的完成必须由任务按约定明确登记，不能从自由标签猜）。set-context 的 included=true/false 可显式纳入/排除普通对象，操作同时持久记录可信实际作者与时间，不改事实来源域的业务状态。

**工作树强制提醒显示规则**：kind=worktree 或 worktrees 的对象，只有 flags.cleanedWorktree=true 才退出持续投影。废弃但未清理、done 字样、set-context excluded 都不能隐藏它。这不是禁止 agent 操作或清理的业务 gate。显式 purge 了未清理工作树的历史正文，仍返回 source 已脱敏的技术提醒；组合方应从真实 binding/resource source 读取当前树状态，而不是用历史删除抹掉当前义务。已清理树仍可主动查询，时钟推进不默认删除它。

HistoryAction：

~~~ts
{ action: 'set-context', kind, recordId, included: boolean }
{ action: 'purge', historyIds?: string[],
  range?: { fromSequence, toSequence }, archivedOnly?: boolean }
~~~

- apply(action, trustedSource) 要求有实际 author 的 authored/program 来源；不接受 source.kind=snapshot 或 author=null。持久 document.actions 是整理操作的来源记录；返回 { revision, operation }，相同 context 或已 purged 的重复操作不增长，operation=null。
- purge 必须明确非空唯一 IDs（最多 100 个）或闭区间序号；缺选择器、未知 ID、超出已记录区间拒绝。不按日期猜删除范围，不设置默认 TTL。
- 仅明确 IDs 时 archivedOnly 默认 false；带 range 时默认 true，可由调用者在已授权的显式请求中明确改变。archivedOnly 按实体当前 retirement/context 元数据筛选，不因先 purge 某条正文就把整个实体偷偷归档。
- 正文 snapshot 变 null，source 整体变 null，summary 删除；技术 identity、sequence、sourceDomain、version 与 retirement flags 保留。purge 只删本 HistoryDocument 的正文，**不声称删除原 instrument log、原生聊天、Git、文件系统或其他 owner**。
- durable suppression 按对象 + sourceDomain 保留 throughVersion 高水位；低于/等于它的 recapture 即使换 recordKey 也不能复活正文。新真实版本高于水位可正常捕获。删正文不能 root-reset、移除 replay/notification 技术去重身份。
- suppression 必须由实际 purged tombstone 支持，损坏或超出对应已删除版本拒绝，不以伪造 metadata 静默丢未来捕获。

snapshot 是 opaque JSON。runtime 逐旧版本捕获 value/refs/provenance，当前捕获只含当前值，不把整份旧 history 数组嵌入后续更高版本 snapshot。否则新真实版本的正文可能重新携带旧文本；历史核心不递归猜测业务结构。SessionHistory.apply(purge) 的范围仍是历史副本，源旧历史删除走第 8 节专用入口；全作用域擦除及自动保留期限不在本轮接口内。

## 5. 存储与 lossless compaction

本历史副本文档 schemaVersion=1；rows 是已经物化的版本记录，不靠破坏性 append-only replay 恢复当前状态。每次域 CAS 原子重写 aggregate，contexts、actions、suppression 一起提交。SessionHistory.compact 仅重读、完整验证并返回 revision，**是保留全部副本数据的 no-op，不声称回收空间**；有明确 purge 才脱敏选定副本正文。第 8 节 compact-source 属于另一接口，由源模块物化 checkpoint 与去重摘要，不将两种 compact 的回执混算。

复用[共享版本化存储](<../src/controls/versioned-storage.ts>)，本轮不修改它。宿主负责真实 storageDomain 的 schema / open / close，用单表独占 domain/unit 与实际 handle；不支持绕过 Adapter 直接 put/delete、共享 backend image 的未协调兄弟表、多进程 CAS 或跨域事务。坏文档、未知 schema、行与 scope 冲突均拒绝，不 reset-empty。

写入可能已持久但回执丢失。共享 table-wide storage-uncertain latch 阻止全部 owner 继续读写；重新包装旧 handle 不会清 latch。必须关闭、重开 fresh domain/table，读取真实持久结果再恢复。没有自动 Memory fallback。

Context7 已先 resolve / query [官方 storage-domain 文档](<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/storage/storage-domain/README.md>)与[storage 语义](<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.zh.md>)；安装版类型与 bundled source 只读核验。实际 probe 使用临时根的 DomainFacility / JsonStorageBackend，没有打开当前 Profile、Cordis、GUI、模型或发布流程。

## 6. 第一阶段公开接口验证记录

以下保留第一阶段历史核心的逐片记录，验证入口是公开接口。当前工程已另实现 runtime 的来源捕获、当前投影、授权、工具与 Client 历史操作；第一阶段结果不代替本轮完整集成验收。

| 片 | 实测 red | green 修复 |
|---|---|---|
| capture/provenance | [history.ts](<../src/controls/history.ts>) 不存在，ERR_MODULE_NOT_FOUND | 最小 scoped capture/read，原作者时间与 capturedAt 分开 |
| full-history pagination | total 未定义；实现后 cursor 意外带 schemaVersion 再失败 | summaries、有界 detail、identity-only 冻结 cursor |
| retirement/context | activeContext 不存在 | 独立 context 元数据、真实作者操作记录、未清理树不可隐藏 |
| purge/suppression | purge historyIds 未支持；第一版把 purge 当归档误删 live 旧版本 | 脱敏 tombstone、高水位、显式 archived 筛选 |
| replay alias | 同版本换 recordKey 导致 total=2 | entity/source/version 幂等，冲突正文拒绝 |
| corruption | 伪造 suppression、author=null 的持久整理操作被 parser 接受 | 只接受对应 purged 行支持的精确高水位；context 须有记录；持久操作须有实际作者 |
| worktree purge reminder | purge 后 uncleaned activeContext.length=0 | 技术提醒保留，正文/source 不复活 |

其他 probe 验证已有 seam 的 owner/cursor 隔离、真实域 close/reopen、巨大时钟推进不 TTL、purged notification 新 replaykey 去重、compaction 不丢旧版本，以及真实持久后故意丢回执再 fresh-handle 恢复；不伪造它们也曾先 red。

~~~bash
DSH_CONTROLS_HOST_ROOT=/absolute/sdk \
  node --test tests/history.test.mjs
pnpm exec tsc -p tsconfig.json --noEmit
~~~

**第一阶段结果：** 历史核心当时为 10/10 通过；未设置 DSH_CONTROLS_HOST_ROOT 时原生存储探针明确 skipped，不计成集成通过。测试直接验证生产 TypeScript 的公开接口；本轮源清理与 Host/Client 集成的最终测试、严格构建和打包结果由主集成者统一重跑登记。

仓库源码实施不自动安装宿主补丁、启用 Profile 或更新正在运行的 GUI；部署与发布沿用独立授权和完成记录。

## 7. 运行组合与客户端入口

[运行协调](<../src/runtime.ts>)负责真实 caller/owner 授权、逐版本来源捕获和工具组合；[Host](<HOST_INTEGRATION.md>)注册 mattpocock_history，Client 在已有 Session 范围提供摘要查询、按行详情、当前范围与显式删除操作。个人 viewer 历史使用原有个人视图接口，不混入共享 owner 查询。当前模型投影的排序、计数、机械预算及短定位见[使用指南](<../CONTROLS.md#3-票裁决与当前注入>)。

## 8. 本轮补充：源旧历史清理与跨域组合

### 8.1 副本删除、源整理与磁盘清理的区别

| 入口 | 操作对象 | 删除或保留什么 |
|---|---|---|
| SessionHistory.apply(purge)／工具 purge | HistoryDocument 历史副本 | 指定副本的 snapshot、source、summary 脱敏；保留墓碑、序号、来源域、版本与 suppression |
| 工具 compact-source | records、windows 或 worktrees 源域 | 建立/推进可继续写入的 checkpoint，保留历史值/来源与必要去重信息；不是永久正文删除 |
| 工具 purge-source | 显式选择对象的源旧版本及其已捕获副本 | 删除截至 cut 的旧正文；保留对象当前/最新值、稳定创建作者、执行代次/租约、技术摘要及来源缺口 |
| 主代理 Git/Shell 清理 | 已获原生权限的实际目录/分支 | 按任务约定处置物理工作树；完成后独立登记 cleaned |

源旧历史清理范围是 selected-source-history-only，不是删除实体，也不是删除所有来源域。当前/最新版本即使落在 throughRevision 内也保留。业务旧版本的 value 和 references 随选中版本处理；没有任意字段选择器，也不保证必要作者、摘要、当前值或其他对象中的同文内容消失。allScopes、原生聊天擦除和自动 TTL 均未提供。

三个源域各自有独立存储和修订：

- records：[业务核心](<../src/controls/instruments.ts>)的 compact / purgeHistory。schemaVersion=2 checkpoint 保存当前实体与仍保留的版本；decision 的稳定 creator 保留，用于原有授权，不能因删掉首版 history 改变事项的可访问范围。命令去重保留 digest、作者及必要目标/修订元数据，不把已删业务正文藏在旧 raw command 中。
- windows：[窗口核心](<../src/controls/windows.ts>)的程序 compactHistory / purgeHistory。保留当前票占位、执行/代次/租约、runtime knowledge 和恢复所需的最新操作保护；旧 fingerprint 正文删除后仍有 digest/目标元数据防止旧回执或重放扰动新状态。runtime 对 purge-source 先建立源 checkpoint，再按所选对象清理旧操作。
- worktrees：[绑定核心](<WORKTREE_BINDINGS.md#8-本轮补充源-checkpoint-与定向旧版本删除>)的 compact / purgeHistory。保留当前/最新绑定、创建身份与作者、实际 header 事实及 manifest/digests；清理报告不因此复活，未 cleaned 的提醒也不因此消失。

### 8.2 请求、修订与明确选择范围

模型工具统一使用 request 包装：

~~~json
{"request":{"action":"compact-source","domain":"records","request":{"operationId":"稳定操作ID","expectedRevision":12}}}
~~~

~~~json
{"request":{"action":"purge-source","domain":"records","request":{"operationId":"稳定操作ID","expectedRevision":12,"throughRevision":9,"targets":[{"kind":"ticket","workflowId":"flow","localTicketId":"A"}]}}}
~~~

domain 只接受 records / windows / worktrees。records 的 targets 为 workflow / ticket / decision；windows 为 ticket / execution / knowledge；worktrees 改用显式 bindingIds。工具每次要求 1..100 个唯一对象，拒绝缺选择器、无权对象、未知目标及超出源修订的 cut。

先 query 得到 sourceRevisions.records / windows / worktrees，再将对应源文档修订填 expectedRevision。HistoryPage.revision 是副本修订，row.version 是来源版本，businessRevision 是业务更新坐标，三者不能代替源文档 CAS 修订。throughRevision 指定删除截止范围；最新版本另行保护。

若源域读失败或 storage-uncertain latch 未解除，仍可从正常历史域查询已保存副本，query 返回 sourceRefresh.status=unknown 与失败原因，不伪造新捕获。不可读取的源修订为 null；Client 据此禁用该源删除，不补 0。来源覆盖和 purged 墓碑继续说明正文缺口；查询走完一个 cut 不是无损全域证明。

### 8.3 多域部分结果、取消与恢复

runtime 持久保存操作计划，将稳定 operationId、实际 caller 的请求摘要与选中历史 ID 绑定。计划重放不重新猜对象或扩选范围；同 ID 不同请求/作者冲突。

处理先对选中副本正文做 suppression，再执行该源域的 checkpoint/删除，最后保存回执。History 域、源域与协调计划不是跨域原子事务：副本已处理而源写失败、窗口 checkpoint 已完成但后续 purge 未确认、写入已持久但回执保存失败，都可能留下部分结果。返回 phase=partial、derivedOutcome / sourceOutcome 或 receiptRecording 的不确定说明，不把这些情况报成完整成功。

SessionHistory.apply 的可选 signal 由 runtime 同时传给源清理 suppression 与普通 set-context / purge；每次读取后、争用重试及每个真正 CAS 前检查取消，已经开始并返回成功的 CAS 不因迟到取消改报未写入。取消信号在授权、读取、计划及每个真正 CAS 前检查。尚未进入某次 CAS 的取消可阻止该次写入；一旦 CAS 已开始，取消或回执失败不能证明它未持久，更不能回滚其他已完成域。runtime 在实际删除接口尚未调用时可报告 sourceRecordsDeleted=false；实际删除调用已开始而没有确认回执时报告 sourceRecordsDeleted=null / sourceOutcome=failed-or-uncertain，即使异常发生在读取或实际提交之前，也不猜测未删除。lossless compact-source 不删除旧正文，删除标记保持 false，但源调用未获确认时仍报告其结果未知。窗口组合已收到 checkpoint 回执而尚未调用 purge 时，返回 sourceOutcome=checkpoint-committed-purge-not-started，并只附已确认的 checkpointAppliedRevision，不复制源正文；新信号可用同一操作身份恢复后续 purge。组合方记录部分结果，重新查询各域实际修订/coverage，以同一 operationId 重试或恢复。源域不确定写须关闭并重开真实 domain/table handle，读取真实持久状态后恢复；重新包旧 handle 不解除 latch，不能切换 Memory 或把源状态重置为空。

源清理不是源实体删除：当前值、创建作者、最新版本及技术去重摘要仍是业务来源。未清理工作树继续从真实 binding current 提醒；明确 cleaned 则退出当前视图，仍保留未被显式删除的历史。保留期限由用户决定，本轮不设置默认 TTL。
