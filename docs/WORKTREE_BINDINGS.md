# 工作树绑定登记：独立 owner 核心

2026-10-06。用户认可的工作树绑定登记已实现于[绑定核心](<../src/controls/worktree-bindings.ts>)，并由 runtime / Host 的创建、读取、重核对和状态工具组合。本轮在初始登记协议之上增加源 checkpoint、稳定创建作者/摘要、定向旧版本删除及来源缺口说明，见第 8 节。主代理按任务约定自己创建、合并和清理 Git 工作树；本模块只保存关系和实际作者声明，不设置处置审批。仓库源码与安装部署分别进行。

## 1. 职责与小 interface

登记持久创建意图、程序核验的实际绑定、实际作者的使用/清理声明，提供完整 registry 与最新当前投影。模块不调用 nativeCreate、不创建/合并/删除工作树或分支、不迁移旧 session cwd、不导入旧 resources 模块、不设业务审批、T/S 准入或物理清理门槛。


dependencies/公开 interface：

```typescript
createWorktreeBindings(
  storageForOwner: (ownerSessionId: string) => VersionedStorage<WorktreeBindingsDocument>,
  now?: () => number,
): WorktreeBindings

// owner 是已有 InstrumentInstance：
// { instrumentInstanceId, ownerSessionId, controlWorkspaceId }
registerIntent(owner, actualAuthor, {
  operationId, parentSessionId, plannedChildSessionId, requestedCwd, task?,
}) // => { dispatch, replayed, row }

confirm(owner, operationId, { sessionId, parentSessionId, cwd }, actualAuthor)
recordOutcome(owner, operationId, {
  acceptance: 'unknown' | 'accepted' | 'rejected',
  outcome: 'failed' | 'cancelled' | 'accepted-unknown', diagnostic?,
}, actualAuthor)
reconcile(owner, operationId, actualHeaderOrNull, actualAuthor)

updateBusiness(owner, actualAuthor, {
  operationId, bindingId, expectedRevision,
  state: 'active' | 'discarded' | 'cleaned', notes?,
}) // => 最新 row；expectedRevision 是该 row.revision
query(owner) // => { revision, checkpointRev, sourceCoverage, rows, current }

compact(owner, actualAuthor, { operationId, expectedRevision }, signal?)
purgeHistory(owner, actualAuthor, {
  operationId, expectedRevision, throughRevision, bindingIds,
}, signal?) // => { revision, removedVersions, checkpointRev, sourceCoverage, replayed }
```

实际类型以[源文件](<../src/controls/worktree-bindings.ts>)为准；`parseWorktreeBindingsDocument` 为宿主 schema/存储 Adapter 使用的严格解析函数。

## 2. 授权与实际作者由 runtime 提供

这是**可信程序 seam，不是授权 interface 或可直接暴露的 Remote**。runtime 必须在每次调用（包括重放和读取）前，从真实 caller 求出原 owner/instance/workspace、实际 parent 与已有权限，并检查请求目录的原生授权。模型请求体中的 owner、author、principal、浏览器选择、operationId 均不是权限凭证。

`actualAuthor` 使用已有 InstrumentAuthor：agent 的 principalId/sessionId 或直接用户的 principalId 与 sessionId=null；模型转述用户意见仍是 agent 来源。实际 agent 创建作者的 sessionId 必须等于 parentSessionId。plannedChildSessionId 不能等于 owner 或 parent；这只是内部一致性校验，不证明 lineage/访问授权。主代理必须提供有权访问的 owner 对象，不得把 caller 自报对象当可信身份。

意图与业务 command 不接受载荷中的 author/owner 等额外字段。程序确认端也不能注册成接受模型 header 声明的工具：它需要原生持久 header 的实际 sessionId、parentSessionId、cwd。目录存在、提示词提过路径、Bash workdir、任务备注都不是绑定证明；本模块不执行文件存在检查。

## 3. 首次创建与崩溃窗口

已实现的 runtime / Host 按以下顺序组合；原生创建仍由原 manager 执行：

1. 主代理准备已有工作树。runtime 在写创建意图前调用 Host 的可信初始 cwd 预检查，核验真实 caller、当前文件权限与规范化绝对路径，并再次确认父身份。未授权或公开初始 cwd 能力不支持时直接明确失败；不写伪授权意图。分配稳定 operationId 与 plannedChildSessionId。
2. **先 await registerIntent 成功持久提交**，再调用 nativeCreate。只有首次 CAS 获胜的新操作返回 dispatch=true；相同 operationId 的并发调用、重开或重试全部 dispatch=false，不能把 replay 当成新 created 回执。
3. 原生 create 的 spec.sessionId 使用持久 plannedChildSessionId，cwd 使用 requestedCwd；Host 在真正副作用边界独立重验当前权限/身份，预检查不是权限令牌。保留原生重复 sessionId 检查，不临时生成替代 child。省略 cwd 的普通派发保持继承；宿主能力及目录映射契约见[Host 初始目录授权](<HOST_INTEGRATION.md#source-only-continuable-creation-and-initial-cwd-authorization>)。
4. 读取原生实际持久 header，再 confirm。实际 child/parent/cwd 必须与意图精确相同；成功时填 actualChildSessionId、actualCwd、accepted/confirmed。以后该关系与初始目录不可变化；热续聊/冷恢复不重新指定目录。
5. 拒绝或取消由 recordOutcome 明确记录 acceptance 与 outcome。accepted+cancelled/failed 不等于 rejected；accepted-unknown 也不是 confirmed。

崩溃可能发生在提交意图后、nativeCreate 前；也可能发生在原生接受后、登记成功前。本模块**没有跨域事务、exactly-once 或跨崩溃自动重派**。dispatch=true 只允许本次首次提交的 caller 继续一次 native side effect；跨重启不能恢复这个许可。恢复程序按 plannedChildSessionId 检索真实持久 header：存在则 reconcile(header)，缺失/不可核验则 reconcile(null) 标记 accepted-unknown（acceptance 可以仍为 unknown），报告不确定并保留登记，不按“找不到 header”猜拒绝、更不自动重派。已确认或已明确拒绝的登记不会被 null reconcile 降级。

同 operationId 的意图重放必须具有相同登记载荷和实际创建作者；不同内容/作者冲突。创建与业务操作共享 owner 内的去重标识保护。登记载荷不是整个原生 prompt/spec 的审计副本；runtime 如需核对原生其他参数，应自行保存/核验，不宣称本模块保存了它们。

## 4. 原生接受与保存失败分别报告

若 nativeCreate 已接受，而 confirm/recordOutcome 持久写抛错，runtime 必须保留原生 childId/acceptance，并报告“创建已接受，绑定记录保存失败/待核对”，**不能报告“未创建”诱发重派**。instrument 的写异常不撤销原生 side effect。

模块仅对 CAS=false 有界重读（最多 32 次）；真实存储异常原样抛出，不自动 fallback Memory、不吞错、不重试 nativeCreate。`VersionedStorage` 要求原子、持久 CAS；发生不确定写后须停止读写并关闭/重开实际 domain/backend handle，再查真实结果。[已有版本化存储](<../src/controls/versioned-storage.ts>)的 domain Adapter 提供 table-wide storage-uncertain latch。换一层 wrapper 不能清 latch。

## 5. 业务状态、代次与当前投影

- bindingId 是随机稳定身份，不是路径。相同路径可先后对应不同 child/绑定；新树复用路径不能修改旧绑定或复用其 childId。
- updateBusiness 只改 state/notes；不改变实际 cwd、child、原 parent、原控制工作区、原始 task、native acceptance。notes 省略保留，空字符串可明确清空。
- discarded 但未 cleaned **仍在 current**。只有明确 cleaned 退出 current；执行结束、实现完成、目录不存在都不隐式清理。
- cleaned 在本版本是终态，不提供 reopen。旧 business 重放返回当前值，不重放旧状态；过期 expectedRevision 拒绝，晚到程序 confirm/outcome 保留 cleaned。若路径重新准备且需要新使用关系，应新建 child/新绑定，不自动复活旧记录。
- cleanup 是有实际作者的业务声明；不冒充物理删除回执，不关闭原生 send/resume、审批分支处置或删除历史。
- 未确认/失败/不确定的意图同样保留在未清理的当前列表中，避免恢复事项丢失；调用方必须按 acceptance/outcome/actualCwd 区分意图与已确认绑定，不能把所有行统计成真实已绑定工作树。

query.current 只包含最新 value、bindingId/revision 和最新 source/author/recordedAt，**没有 history**。其最新程序来源不能把已有 business 清理声明变成物理证明；清理报告是实际作者业务来源，实际 child/cwd 是 trusted header 程序来源，二者分别解释。query.rows 包含 cleaned 及所有仍保留版本/实际作者；显式源旧历史删除后，sourceCoverage 与 manifest 明示正文缺口，不把它称为从未缺失的全部旧版本。全仪器摘要分页及按需详情由[历史组合接口](<HISTORY_CORE.md>)提供；本 query 不分页，也不返回原生聊天正文。

## 6. owner 行与持久校验

每个 owner 独立文档。schemaVersion=1 的旧登记可读，本轮写入及源整理使用 schemaVersion=2 的物化文档，保存 document revision、owner、checkpointRev、rows、manifest 与 operations。storageForOwner 独占稳定 owner key；复用 createDomainVersionedStorage(handle, ownerSessionId, parseWorktreeBindingsDocument)，遵守单实际 table handle、独占单表 domain/unit、无跨进程 CAS 的限制。MemoryVersionedStorage 仅为显式测试 Adapter。

每次读/候选提交都解析文档并检查 owner/instance/workspace 一致，错误不 reset-empty。row 保存最新 value 与不可变 history；各版本保存 revision、recordedAt、操作 ID、source(intent/program/agent)、actual author、当时完整 value；业务版本另保存原 command/expectedRevision。document revision 对所有版本连续计数；row.revision 是该行最新版本的全局水位，因此无关行的新提交不使该行业务 CAS 失效。

校验包含：重复 binding/child/创建 operation、历史缺口/重复/乱序、row 最新值与最后版本一致、业务 command 行/修订引用、初始意图格式、来源权限分工、已核验 child/cwd 不消失或改绑、accepted 不降级、cleaned 不复活、old author 必须合法。返回值深冻结、输入先解析分离再 await。不是 Git branch 生命周期或业务正确性判断。

## 7. 初始登记阶段公开接口验证记录

测试入口：[worktree-bindings.test.mjs](<../tests/worktree-bindings.test.mjs>)，直接加载生产 TypeScript 公开接口；本节记录初始登记阶段的 red → green 过程。

逐 slice 的实际 red → green 记录（未先写 imagined bulk tests）：

| Slice | Red | Green |
|---|---:|---:|
| 持久意图/不重派 | 0 通过，1 失败（模块未存在） | 1/1 |
| 实际 header 确认 | 1 通过，1 失败（confirm 未存在） | 2/2 |
| discarded/cleaned/旧更新 | 2 通过，1 失败（updateBusiness 未存在） | 3/3 |
| 接受、拒绝、取消、reconcile | 3 通过，1 失败（recordOutcome 未存在） | 4/4 |
| 同值业务更新保留作者与去重 | 4 通过，1 失败（revision 未推进） | 5/5 |
| 损坏晚到历史拒绝 | 5 通过，1 失败（query 未拒绝） | 6/6 |
| 实际创建 parent/owner-child 一致性 | 6 通过，1 失败（意图未拒绝） | 7/7 |
| 加两项已实现机制的 focused 检查 | 无新增行为；直接验证并发 owner/CAS 与保存回执丢失 | 9/9 |
| current 只带最新版本（增强已有测试） | 8 通过，1 失败（含 history） | 9/9 |
| 创建/业务 operationId 冲突 | 9 通过，1 失败（错误诊断类型） | 10/10 |

初始登记阶段曾记录上述接口测试及严格编译通过。本轮 checkpoint、源旧历史删除、runtime/Host/Client 组合的最终重跑结果由集成完成记录统一登记；上表历史数字不代替本轮全套结果。

初始测试的重开夹具使用同一显式 Memory 底层及全新模块对象，检查文档恢复与不重派；保存回执丢失使用受控 table 驱动真实 CAS Adapter，检查提交已发生但确认失败的恢复语义。真实 durable backend、nativeCreate/header/read、续聊与冷恢复的集成检查由对应工程记录承载，不能将这些不同夹具的结果混算。

本轮 runtime/Host/Client 和历史组合已另行落地；原生源码/编译补丁交付见[宿主补丁说明](<../host-patches/README.md>)。这些仓库变更不自动安装到当前 SDK、启用 Profile 或更新运行 GUI。

## 8. 本轮补充：源 checkpoint 与定向旧版本删除

### 8.1 保留当前关系，明确旧正文缺口

本轮物化 schemaVersion=2 把恢复所需的当前绑定与历史正文分开。每行仍保存最新 value/history，以及稳定 creationAuthor、creationDigest、创建 identity；manifest 保存版本修订、来源/作者、技术绑定元数据、valueDigest / notesDigest 和 retained 标记。operations 保存稳定操作身份、实际作者和 SHA-256 摘要，不将已经删除的旧 notes/task 载荷藏在原 command 或 fingerprint 中。

| 操作 | 保留 | 改变 |
|---|---|---|
| compact | 当前值、实际 child/cwd、清理状态、全部仍保留历史、创建作者与去重摘要 | 推进 checkpointRev，物化可恢复结构；不是正文永久删除 |
| purgeHistory | 每绑定最新版本、稳定创建身份/作者、程序事实、最新业务状态、技术 manifest/digests | 对显式 bindingIds 删除修订不超过 throughRevision 且早于本行最新修订的旧正文；manifest 标 retained=false |
| query | 全部仍保留 rows 和未 cleaned 的 current | 返回 checkpointRev / sourceCoverage 说明已删版本缺口，不制造空白作者报告 |

sourceCoverage.kind=history-only，含 throughRevision、removedVersions 与被处理的 bindingId/revision。旧版本正文可有缺口，但技术 manifest 和重放保护保留。模块不通过删除当前行减少登记数，也不把源 purge 当作 cleaned。discarded 未清理仍在 current；明确 cleaned 始终退出 current，晚到确认、旧业务重放或新 checkpoint 不能复活它。

源删除不能被理解为所有文本全消失：最新 value 中仍需保留的 task/notes、创建作者及技术摘要可能继续存在；相同文本还可能在别的绑定、未选版本、历史副本或原生聊天中。本接口选择完整旧版本，不提供单字段擦除或 allScopes 删除。

### 8.2 明确 selector、实际 owner 与稳定操作

compact 请求为 operationId + expectedRevision；purgeHistory 另要求 throughRevision + 非空唯一 bindingIds。expectedRevision 是源 owner 文档修订，与业务更新所用的 row.revision 不同。选择器指向本 owner 的实际绑定，过期修订、未知绑定、cut 超出修订、复用操作身份但改变请求/作者都拒绝。

源清理接受有实际身份的认证用户或实际 owner root agent；受派 child 不能仅凭已知 bindingId 清理 owner 源旧历史。幂等重试返回原清理结果并标 replayed，不能绕过实际权限核验。创建、业务更新与整理操作的去重身份及摘要一起保留，避免删除旧正文后重复创建或旧更新再次生效。

工具组合请求示例：

~~~json
{"request":{"action":"purge-source","domain":"worktrees","request":{"operationId":"稳定清理操作ID","expectedRevision":12,"throughRevision":9,"bindingIds":["绑定ID"]}}}
~~~

先通过 mattpocock_history query 读取 sourceRevisions.worktrees；未知为 null 时不发源删除，不拿 HistoryPage.revision 或 row.version 代替。派发/登记操作与副本整理分别记来源；作者清理声明不是物理删除证明，也无需旧资源的 cold-resume 闭合审批。

### 8.3 取消、不确定写与跨域部分完成

核心在实际 compareAndSwap 前最后检查 AbortSignal。尚未开始 CAS 时取消可阻止该次源写；CAS 返回 true 时先返回已确认的实际回执，不因迟到取消改报失败。CAS=false 时在重读/重试前检查取消；CAS 本身拒绝保留原存储错误。只有已开始而缺少可靠源回执时，组合方才报告该源 unknown；已确认提交与后续未完成域的 partial 分开，不宣称回滚或源数据“从未改变”。源存储异常没有 Memory fallback，复用旧 wrapper 不解除 storage-uncertain latch；关闭并重开真实 domain/table，再查持久结果。

工作树源域、records 源域、windows 源域与历史副本域相互独立，没有跨域事务。runtime 的源清理计划先处理关联副本 suppression，再执行选中源域，单独报告已完成步骤与失败/不确定阶段。源域暂不可读时，正常历史域里的保留副本仍可查询，sourceRevisions.worktrees=null 与 sourceRefresh 说明缺口；不把读失败当空 registry。

实际 Git 树清理仍由主代理按 Skills/用户约定执行，完成后记录 cleaned；源旧历史整理只管理仪器数据。已 cleaned 退出持续提醒但其未显式删除历史仍可查；废弃未清理仍提醒。没有默认 TTL，不因时间推进、执行释放或目录不可读自动删除登记或旧正文。跨域协调完整合同见[历史核心源清理](<HISTORY_CORE.md#8-本轮补充源旧历史清理与跨域组合>)。
