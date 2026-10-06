# 来源域清理第一片：业务仪器 checkpoint、压缩与显式历史正文删除

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

2026-10-06。源码实施范围仅为[仪器文档 codec](<../src/controls/instrument-state.ts>)、[SessionInstruments](<../src/controls/instruments.ts>)与[新增 source-only 测试](<../tests/instrument-cleanup.test.mjs>)。它补足[History 副本清理](<HISTORY_CORE.md>)之外的真实业务来源域清理，**不是所有来源域、原生聊天、Git、文件系统或当前业务对象删除已完成**。没有默认 TTL，也不从 ticket 自由状态猜 done。

## 1. 新的小 interface

~~~ts
await instruments.compact(principal, sessionId, {
  operationId, expectedRevision,
})
await instruments.purgeHistory(principal, sessionId, {
  operationId, expectedRevision, throughRevision,
  targets: [
    { kind: 'workflow', workflowId },
    { kind: 'ticket', workflowId, localTicketId },
    { kind: 'decision', workflowId, decisionId },
  ],
})
~~~

- author **不在请求体**；每次包括重试均由现有 InstrumentAuthority 解析真实 principal / session / author / scope，再经 WorkspaceControls 核验 owner 归属。
- 只允许 coordinator 且 sessionId 是该 instance 的 ownerSessionId；受管 child 即使取得 coordinator scope，也不能调用 source cleanup。直接 user 可以通过已授权 owner-session 上下文调用。此处复用来源域访问权限，不判断业务正确性、不新增批准事项。
- expectedRevision 是来源 **document revision**，不是 businessRevision / viewerRevision；新请求旧修订返回 revision-conflict。source mutation 并发时不会用新修订偷偷放大请求的删除范围。
- targets 必须为 1..100 个唯一明确对象；throughRevision 必须是已保存修订以内的非负安全整数。未知对象、未知字段与伪造 author 拒绝；targets 在 await 前分离与规范化。workflow target **只选 workflow 本身**，不隐式删除该流程的票或事项。
- 本片仅 history-only：调用者给出的明确 targets 是已选择的历史整理对象；是否按任务约定把对象归档由 runtime / agent 明确选择，不由这里新增 done classifier。永久 delete-record 并未实现。

返回 InstrumentCleanupResult：

~~~ts
{
  appliedRevision, replayed, removedVersions,
  checkpointRevision, coverage, snapshot,
}
~~~

coverage 是持久整理回执数组：operationId / action / appliedRevision / actual author / recordedAt / throughRevision / targets / removedVersions / removedRevisions（准确的原 source revision 列表）。返回 current snapshot，不把原旧回执冒充当前快照。与普通业务 operationId 共享命名空间，同 ID 异作者、异 action 或异载荷均 operation-conflict。

## 2. V1 兼容与 V2 物化文档

V1 journal 继续完整读取和校验；没有更新旧文件、没有静默 reset-empty。一次普通业务写入升级为 V2，但最初 checkpoint.cut=0、events 保持原全量命令序列，source / business / viewer 修订与历史序号原样延续。

V2 文档保持相同 owner/instance/workspace：

| 字段 | 职责 |
|---|---|
| revision | 原 source 高水位；整理操作也推进一次 CAS 修订，不重编号旧业务记录 |
| checkpoint.throughRevision | 已物化前缀 cut，包含整理操作的持久修订 |
| checkpoint.state | 当前值、每个对象的 retained history、原 businessRevision、viewerRevisions、个人 view 元数据 |
| events | checkpoint cut 之后的新业务命令 tail；tail 第一个 revision=cut+1 |
| dedup | 已物化前缀每次 operation 的 technical receipt：operationId、actual author、SHA256 digest、原 appliedRevision、kind；command-kind 另存 bodyless action / target keys / expectedRevision / recordedAt，没有旧 value/refs 正文 |
| coverage | 压缩/清理的明确选择范围、实际操作者、时间与实际移除版本数 |

- compact 先用真实已验证的 source document 投影当前状态，checkpoint 保存**全部逐版本 history**；events 中已经吸收的原始命令真正移除。不是把旧事件删除后从空根重放、伪造 put 来改变票进度或只隐藏读接口。
- purgeHistory 在同一次 source CAS 中完成 checkpoint 物化，并删除 selected target 中 revision<=throughRevision 的**非最新**历史版本及其 refs；原始 commands 已一起移除，故旧文本不在另一份 journal 中继续保留。
- 每个对象的最新 history/version/current value 都保留，latest author / source time 与 row revision 不变；未选择对象的完整历史与当前义务保留。throughRevision 即使包含最新版本也不能删除它。当前值含有仍被明确保留的相同文本时，不承诺消除该文本——这是 history-only 的边界。
- source cleanup 增加 document revision；businessRevision 与各 viewerRevision 不增长、不重编号。后续 put 和 set-decision-view 仍按原业务/个人修订正常更新，source tail 从新 cut 继续。
- DecisionRecord 的可选 creator:InstrumentAuthor 是首次作者的独立技术元数据；checkpoint 制作时从原 source creator / 原最早 history 取得。删除最早正文后，读写 ACL 优先用 creator，**不得把剩余 history[0] 的最新作者当作创建者**。

## 3. 无正文去重、读取覆盖与不确定回执

[Node-only mutation 模块](<../src/controls/instruments.ts>)使用 node:crypto SHA-256 对规范化实际 payload 与 actual author 计算 digest。通用 [codec](<../src/controls/instrument-state.ts>)校验十六进制 digest，并将 checkpoint 的 revision / action / target / author / time / counters / 删除洞准确链接到 bodyless receipts 与 coverage；不计算 Node hash、不 import Node，Client 类型路径仍 browser-pure。

- 对原业务 operationId 的重试，先重验当前权限、再比 digest，返回原 appliedRevision 与当前已授权 snapshot；不把请求的旧正文写回 source。原业务修订已经陈旧也不影响真正的同请求重试。
- 同 cleanup operationId 重试返回原删除回执与当前 snapshot，不再删除新版本；请求原 expectedRevision 也不需要被更新。同 ID 改范围、载荷、作者或拿来作普通业务命令均冲突。
- 当前 read 的 changes 只来自 checkpoint 后的 raw tail。可选 historyCoverage:{checkpointRevision,purged} 明示已物化 cut 与显式删除洞；不能把缺 raw feed 解释成「从未发生更新」。对象 history 在 compact 后完整保留、purge 后仅删除明确旧版本。
- 仍使用原独占 single-table domain 与 VersionedStorage CAS，有界争用 32 次。写入可能已持久而回执丢失；storage-uncertain 锁住同实际 handle 的全部读写。须 fresh domain/table 重开核对 durable result，无内存 fallback、无旧根 reset 或盲覆盖。
- SHA256 receipt 用于内容比较，不是业务真实性证明或防篡改签名。文档 parser 的结构/引用验证不能冒称认证外部恶意修改。

## 4. main 的组合责任与其它来源域边界

本片不修改 runtime、Host、remote、client、窗口或 worktree worker。main 负责模型工具到这里的 caller 授权映射、package/barrel 导出，以及 History 副本与各 source 的协调。

History suppression 应先持久，再执行 source CAS；ack 失败或 storage-uncertain 必须回报 partial，并关闭重开核对来源真实结果，不把旧 source 内存正文重新捕获回来。History 与 source domains **不是一个事务**，main 应以同 cleanup request identity 和逐域 durable ack 恢复。

窗口 operations、worktree row.history 以及其它来源域清理，由各自独立切片负责，本页不声称完成它们。source cleanup 不删除 native chat、Git 分支、磁盘树或其它 owner 的历史。已清理 worktree 全 session 历史也不因时间或普通 compact 默认过期。

## 5. 逐片 red/green 与验证

验证沿用公开 core / 原生持久历史 seam；以下不是一批预想状态测试：

| 实测片 | red | green |
|---|---|---|
| V1 更新到 V2 | schemaVersion 仍为 1 | V1 parser 保留，普通写入升级 cut0 的 V2 |
| lossless compact | compact 不存在 | checkpoint 真吸收 raw commands，逐版本历史不丢，后续 tail 正常 |
| 显式清旧票正文 | purgeHistory 不存在 | source JSON 中旧 body/refs 真移除，最新与未选择版本保留 |
| 旧 operation 重试 | purge 后旧业务 expectedRevision 被拒 | digest receipt 在旧业务修订检查前识别，不复活正文；当前授权仍重验 |
| creator ACL | 删最早 history 后 child 看不到其 own 无票事项 | 持久 creator 独立于剩余 history，读写与 viewerRevision 继续正确 |

真实 native probes 验证已有 seam 的持久与回执边界，不虚称它们也曾 red：

1. 临时根内实际 DomainFacility + JsonStorageBackend 写入唯一 old-secret-marker / old-reference-marker；显式 purge 后直接检查当前 JSON 文件两者不存在，而未选择文本仍在。
2. 独立 Node 进程 fresh-open，再次检查 raw 文件 marker 不存在、current snapshot 等于清理后结果，并重试原 operation 得到原 appliedRevision=2、不恢复正文。
3. 实际 native source CAS 已提交之后故意丢回执，旧 handle 被 uncertainty latch 拒读；fresh-open 验证正文已删，再同 cleanup ID 恢复原回执。

~~~bash
DSH_CONTROLS_HOST_ROOT=/absolute/sdk \
  node --test tests/instrument-cleanup.test.mjs
pnpm exec tsc -p tsconfig.json --noEmit
~~~

最后一次新测试 **16/16 通过，零失败、零跳过**；严格全项目 TypeScript noEmit 通过（strict / exactOptionalPropertyTypes / noUncheckedIndexedAccess）。不设置宿主路径时两项 native tests 明确 skipped，不算通过。

常规来源回归已用 source routing（不生成 lib）跑过：业务与 storage **61/61**，其中包含新测试 16 case 在两个 workers 各执行一次的 32 项重复统计；原真实 instruments-persistence **7/7**，其 child process 通过 NODE_OPTIONS data-URL 的纯 source-loader 同样使用当前 TypeScript。独立 loader 没有注册测试，因此原 child JSON 输出未被 TAP 污染。V2 已认可后旧「schemaVersion=2 必须损坏」断言需由 main 改成真正未知版本；V1 的正常输入仍兼容。

本片证明业务来源域的 history-only 清理，不证明全部协作流程、部署版接口或所有来源域永久清理已完成。源码验证不授权 SDK/Profile/GUI 安装、重启或发布；当前集成收尾状态见[公开验证说明](<VERIFICATION.md>)。

## 6. P2 独立审阅后的 fail-closed 不变量修复

独立审阅确认旧 V2 codec 可接受四类独立单字段损坏：保留 history 作者改成 forged user；只 compact、removedVersions=0 却删除首条 history；businessRevision 改为 0；ticket 的旧 source revision 借用 workflow 的 source revision。上述都按公开 parse seam 分别先运行 red（Missing expected exception），再最小 green 修复；另独立复现并修复 creator 换成最新作者、personal-view 借用 workflow revision。

新增持久数据仍是技术 metadata，不保留被清正文：

- command-kind dedup 必须有 action、精确 target keys、原 expectedRevision、原 recordedAt。每个 retained history revision 必须链接同 source appliedRevision 的同 action / 同对象 / 同 actual author / 同时间；不能借别的对象、清理操作或 viewer 操作的修订。
- checkpoint businessRevision 由全部前缀 business command receipts 精确推导；每个人 viewerRevision 从其真实 set-decision-view receipts 精确推导，同时核验每次原 expectedRevision 链。cleanup receipt 不计业务/个人修订，故合法跨 cleanup 的 counter 保持，不用 events.length 冒充验证。
- decision creator 链接同对象最早 put-decision receipt 作者；即使首版正文已删，不能把 latest 作者当 creator。当前 decisionView inventory / revision 则链接同 target 与 actual principal 的最近 viewer receipt。
- coverage 增加 required removedRevisions。removedVersions 必须等于该准确列表长度；每个删除 revision 必须来自该 cleanup 当时已存在、明确 targets、throughRevision 范围以内、非当时最新、且未在此前 purge 删除的来源版本。
- parser 按实际 cleanup 顺序推导每次应删除的准确 source revision 集合，逐条比较列表，再要求整个 checkpoint record inventory 与所有 command targets 相等，每个 retained history revision 集合等于原来源版本减上述明确删除集合。这样只 compact 无法掩盖漏历史，删 count / 改 target / 错 removed revision / 偷删 current inventory / 重新插回已删版本均拒绝。
- 某版本在第一次 purge 当时是 latest，所以保留；后面出现新版本不会让第一次 purge 追溯删除它。只有之后另一个明确 purge 才能删除现在已成为旧版本的正文；测试包含后续 put + compact 的合法链。

V1 与尚无 checkpoint 前缀的 cut0 V2 正常兼容。早期**未部署** V2 checkpoint 若已经移除了 raw commands、却缺少新增 target metadata / removedRevisions，不能可靠重建或校验；本轮 codec 明确拒绝，不从当前值、hash 或剩余 history 猜来源、不 reset-empty。此前无授权安装这批源码，此处不冒称支持旧已部署 V2 的无损自动迁移。

这是可检验的结构一致性和来源链接，不是 signed journal / HMAC 或业务 approval gate。Node mutation 继续以真实 command+author 的 SHA256 做 operation 重试内容比较；pure parser 不认证 coordinated rewrite 的外部恶意篡改，也不声称能从 digest 重建被清 payload。必要技术 ID / actual-author metadata 继续保存，不等于保留正文。

## 7. 可信 AbortSignal 与 source CAS 的取消边界

cleanup 方法增加可选第四参数；JSON input 不变，signal 不是请求字段、授权凭证或新 approval：

~~~ts
compact(principal, sessionId, input, signal?: AbortSignal)
purgeHistory(principal, sessionId, input, signal?: AbortSignal)
~~~

- 入口、每次有界重试，以及 controls.readSession / authority.resolveAccess / source storage.read 的每个 await 成功返回后，都检查 throwIfAborted。真实 source read 返回之后先检查取消，再 parse / 物化 candidate；不依赖外层 Runtime 在调用前检查一次来替代。
- 在实际 storage.compareAndSwap 调用紧前再检查。只要取消在这个调用之前被观察到，就直接传播原 signal.reason，**不调用 source CAS**，当前值、creator、旧正文、source revision 和 dedup/coverage 完全不动。
- compareAndSwap 一旦已经调用，不用晚到的 abort 假装源提交回滚：true ACK 返回真实提交结果；reject 保留原存储错误（真实域的不确定回执仍按 storage-uncertain/fresh-reopen 处理）。false ACK 没有本次提交，检查取消后决定是否继续 retry。
- 不向现有 VersionedStorage CAS 注入可中断写入、不新增 source mutation gate。signal 只控制这次明确 cleanup；省略参数时既有业务与 cleanup 语义不变。
- Runtime 的复合 history-only 操作应整体贯穿同一个可信 signal；History suppression 已提交后取消，不等于整个动作无副作用。已经 sourceRequested / CAS 已开始 / ack 不确定时，Runtime 应保 honest partial/unknown，并 fresh-read 核对，不能回灌正文或标已回滚。此跨域 phase 分类仍由 main 负责。

本片新增公开 seam 的 controlled-read red：外层已读来源后，暂停 source core 自己的第二次 storage.read，在 sourceCAS=0 时取消；旧实现继续删正文、返回成功，实测 Missing expected rejection: purgeHistory。修复后同一 probe 对 purgeHistory 和 compact 都传播原取消原因、sourceCAS=0，raw source/current/creator/旧正文完整不变。

另加 post-CAS probe：真实 source CAS 先完成，再暂停 ACK；此时 abort，确认已提交回执仍成功，故意丢 ACK 则保原存储错误而不是取消回滚。此 probe 是已实现边界的回归，不虚称它先 red。原无 signal 的全部测试与 native source 文件/独立进程证明继续通过。
