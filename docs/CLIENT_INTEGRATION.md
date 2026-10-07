# Native client integration

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的 DSH 0.2.1-alpha.1 安装产物，不保留本机路径或旧行号；[宿主固定源码基线](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009ae1756c3afe0ae0cef1faafc290ccc)提供版本来源，不将编译产物路径伪装为公共源码 URL。

This optional client is plugin-repository engineering, not an installation or live-GUI change. Its authoritative business sources are the existing revisioned policy, owner-instance registry, instrument records, reference windows, durable worktree bindings and session history. Legacy resource data remains a read-only observation. UI drafts and observations are transient projections, never additional persistent ledgers. The unchanged Skill provider is not rewritten.

## Entry and build

- [Client source](<../src/client.ts>) is one TypeScript entry using React createElement, not JSX. Its runtime imports are React and package-local browser-safe policy/validation/Remote contract modules. DSH framework and feature contracts are type-only imports.
- [Shared Remote contract](<../src/controls/remote-contract.ts>) owns endpoint names and strict descriptors. The client explicitly awaits ctx.remote.$mount(REMOTE_CONTRIBUTION) before contributing views; every consumer RPC result has a RemoteResult envelope. Wire requests do not carry principals, authors or owner-instance claims. readSession and historyAction use generated cancellation channels; their AbortSignals are never JSON wire parameters. worktreeAction mutations currently use generation/lifetime fencing without inventing a cancellable endpoint.
- [Closed build](<../scripts/build-client.mjs>) transpiles the runtime TypeScript graph into private static CommonJS module closures, then wraps it in window.__ModuleLoader__.load({id,factory(require){...}}). Relative dependencies remain inside this package after realpath verification. Static cycles follow ordinary CJS partial-export rules. Dynamic imports, import.meta, dynamic require arguments, Node imports and non-baseline value imports fail the build. The browser never requests a sibling relative CJS file.
- [Client type-check project](<../tsconfig.client.json>) uses strict TypeScript and actual DSH public SDK declaration-merging contracts, and emits nothing. Node declarations only resolve type-only references from existing Host-facing domain types; they do not admit Node code into the browser graph. Third-party declaration checking follows the repository's skipLibCheck convention; our client is checked under strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes.

Commands from this repository, without a new server:

~~~sh
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --check
node --test tests/client.test.mjs
# Only when the package/artifact task requests emission:
node scripts/build-client.mjs --out lib/client.js --declaration
~~~

The default command and --check are memory-only. --declaration emits only the independently type-checked client entry declaration at lib/types/client.d.ts (or an explicit destination), with package-local controls imports resolving beside the existing Host declarations. generateClientDeclaration() returns that exact text without writing files; it is available to artifact verifiers. No tsc-produced ESM client output is used as the runtime bundle. Tests execute the generated bundle in a Node fixture, not a browser or a DSH profile. Output paths are explicit; package/artifact ownership belongs to the main integration task.

Package integration must export ./client with the generated bundle and declaration path, include these files in its allowlist, and declare dsh.client.platform: web. Manifest dsh.client.inject names package graph dependencies; exported client inject names Cordis services. They are not interchangeable. The active Host Loader row/package discovers the client half; merely writing this source does not activate a profile. See manifest contract（SDK package-relative locator: `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts`） and discovery（SDK package-relative locator: `@deepseek-ai/dsh-client-modules/lib/index.js`）.

The implicit baseline is React/React JSX runtime, React DOM/React DOM client, Cordis, client-store, ui-slots, ui-primitives and ui-dockkit. Do not repeat these in dsh.client.external. This client requests only React at runtime and does not require muse, esbuild, tsdown or a monorepo-private preset. First-party artifact evidence: lazy factory（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-jobs/lib/client.js`） and factory return（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-jobs/lib/client.js`）. Context7 was supplementary documentation; installed source governs the baseline.

## Native contributions

| Contribution | Key/identity | Scope and limit |
|---|---|---|
| plugins.bundle.config | @lmgatex/dsh-mattpocock-skills | Root keyed; bundle configuration page. |
| plugins.row.config | @lmgatex/dsh-mattpocock-skills#dsh-mattpocock-skills | Root keyed; row id is the patch id, not the module name. |
| conversation.session.header.utilities | Unique collaboration list id | Strict Session; compact reminder in normal header chrome, not a full-width row. |
| conversation.input.dock | Unique input-summary list id | Strict Session; optional bounded summary above the resident composer card. |
| sidebar.right.pane.tab | @lmgatex/dsh-mattpocock-skills:collaboration | Strict Session; keyed by tab definition id, not kind. |
| sidebar.session.row.leading | Unique row-decoration list id | Root with owner-provided row Session id; idle-only 16px seat, not a Session-retaining slot. |
| tool.call.toolview | Only nine package-owned Tool names | Strict Session keyed atomic toolview; no other Tool key is replaced. |

The default compact header entry includes pending-user and awaiting-implementation counts, ticket total plus task-defined workflow/axis/status counts, independent T, unknown-safe S, current worktree binding count/cleanup reminders and legacy authorized resource observations. Status selection follows declared summaryPriority then stable keys, without fixed business categories or percentages. Two status entries plus a more-count, bounded/truncated spans and full accessible title/label keep the inline control bounded. S.countKnown=false (including old snapshots without that field) is labelled 已登记 N plus 总数未知, never a known native total of zero; T remains independently reportable. Reference capacities, overage and signed gap are labelled explicitly. This is one utility entry, not a secondary full-width header.

The right-panel kind is mattpocock-collaboration. Its definition has no address patterns, so it does not claim File/Git resources. The public useTabInfo hook supplies live tab information. Opening occurs only on a user click, after checking the mounted Session still matches the captured Session and the committed rightPanel flag permits it. preferNewPane is a preference, not a promise of simultaneous File/Git visibility. No replaceTab or automatic open on refresh is used.

Inspected SDK artifact contracts (package-relative locators, not public source-file URLs): configuration seats（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts`）, header/input seats（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`）, row limits（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-workspace/lib/types/client/contract/slots.d.ts`）, tab registration（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/tab-registry.d.ts`） and placement（SDK package-relative locator: `@deepseek-ai/dsh-client-ui-sidebar-right/lib/types/client/service.d.ts`）.

### Explicitly unsupported or bounded

- No additive full-width secondary Session header exists. Full header, lineage, leading/corner, root and composer composition are not taken over. No arbitrary DOM insertion or composer chain replacement is used.
- Header entries can be suppressed by blank/sessionless chrome and obscured by fullscreen details. Input dock can disappear during composer takeover/settling. Neither is universally visible.
- Session-list leading decoration disappears under higher-priority native status and for archived rows. Hover decoration is hover-only. A permanent independent badge in every list state is unsupported.
- Native openTab has no background/no-focus mode; it selects and expands. Local sidebar layout persistence is not a business ledger.
- Ordinary chat messages are not rewritten. Only mattpocock_record, mattpocock_window, mattpocock_resource, mattpocock_controls, mattpocock_execute, mattpocock_assign, mattpocock_history, mattpocock_worktree and mattpocock_delegate get source cards. Preparing/start/result are distinguished; public argsRaw/content/error fields are preserved without serializing lazy argument-reader internals. Disabling timeline annotation still preserves the actual Tool record.

## 配置页分区、中文文案与保存语义

配置页按独立职责分区：

1. **创建子代理（subagent）时指定工作树（worktree）**：独立全局启动配置，分“当前运行状态”和“下次启动设置”。同一插件负责兼容实现与身份检查；用户安装／更新插件、保存页面请求、必要时正常重启，不选择 SDK 路径或执行离线准备命令。界面只翻译宿主权威状态；实现 ready 而当前 capability=false 表示待真实重启，ready 不冒称当前启用或共享 SDK 已改写。未知／不兼容／失败仅表示此增强未确认，不把普通原生子代理显示成整体失效。现有官方 true 能力不要求额外准备。
2. **协作管理**：两级总闸（「协作管理总闸（全局）」＋按工作区的「本工作区总闸」）、工作区／全局默认范围，以及“协作功能”“参考上限”“界面显示位置”，另有独立的按工作区「技能分发」开关。功能生效条件为全局总闸且本工作区总闸且该功能开关；因总闸未开而未生效时，「协作功能」「参考上限」在各范围都不生效（只有「界面显示位置」与「技能分发」不受影响），原因分别显示为「全局总闸已关闭」「本工作区总闸已关闭」。所有固定字段、来源、状态与限制说明使用中文，底层协议键、继承删除与 CAS 不改。
3. **保存前预览**：展示中文有效值／来源差异，原始策略与变更放入折叠技术详情。按钮根据总开关更改显示“保存并启用协作管理”“保存并关闭协作管理”或“保存并应用配置”。真实宿主保存回执确认后才显示已保存并应用；不需要另找一个启用草稿的按钮。失败或回执未确认时保留草稿并要求重新读取核对。
4. **会话状态查看**：在配置表之后单独选择已有会话。查看不修改配置，不授予权限，不自动打开侧栏或唤醒模型。

“保存下次启动请求”仅写启动文档，“保存并应用配置”仅写协作策略；两者分别使用各自读取到的修订，不互相借用。启动启用仍需实际 SDK 支持和真正的进程重启；保存不会修改运行中的 SDK。固定界面文本中文化不翻译任务自定义状态、真实标识符、命令参数或原始程序诊断，后者作为技术数据保留。

配置卡片采用可换行的响应式网格与操作条。输入区摘要的盒子通过宿主 composer 宽度／边距变量和回退值居中，内部文本居中、长名称换行，并保留 96px 最大高度与纵向滚动。右侧详情与工具卡只约束自身宽度和换行，不接管原生会话布局；紧凑标题入口保留宽度上限，避免挤占会话标题。原生装饰与 dock 的显示条件保持不变。

## Settings and explicit writes

The page starts with the Host's first listed workspace and offers a separate global-default selection. Boolean leaves have inherit/on/off. Removing a leaf restores inheritance. T/S reference values accept positive safe integers only; unset effective references remain unconfigured, never example numbers or hard dispatch seats. Exceeding a reference or unknown execution coverage does not itself require another UI approval. The management total switch is explicitly global and does not affect Skill delivery.

Settings are a detached draft saved through savePolicy(intent, expectedRevision). The draft's original policy revision is used; background activity does not silently upgrade its fence. Effective values/sources use the same pure resolver as the Host. The preview describes configuration intent, not enforcement or a promise that shrinking capacity kills existing work. Display flags are independent from features and obligations. All entrances can be hidden explicitly, with a non-blocking consequence explanation.

The same page includes a workspace-first Session selector from Host-provided WorkspaceRow.sessionIds navigation. Global-default mode unions known ids; missing fields remain unknown/incomplete, not proof of no sessions or instances. Navigation confers no ACL or owner binding. Only an explicitly selected Session mounts the shared observer and shows tickets/decisions, reference T/S, current worktree bindings, legacy read-only resources, capability/health observations and effective policy in-page. It also mounts the same explicit history query and binding business-registration components used by Session details; these are explicit operations, not additional ledger truths. It does not open the sidebar, resume a model or register an instance. Changing Session/workspace unmounts and cancels/fences the previous inspection. RPC-derived actual caller/owner metadata remain authoritative; selection is never a wire author/principal. Inspection does not upgrade the policy draft opening CAS revision.

The bundle page does not use an additional Settings namespace/configForms mirror. Generic row form props do not create another policy truth. The core revisioned save stays authoritative.

Decision editing preserves task-defined free status text. Pending and awaiting-implementation are independent, explicit user choices initialized from the record; no completion/correctness taxonomy is invented. Actual authors come from the authenticated operator RPC. The draft holds the business revision and original record it read, so concurrent refresh causes a genuine conflict instead of silently upgrading its revision and overwriting newer work. Explicit reload discards the draft. Read/hidden do not resolve decisions.

Policy delegation is a separate user-only UI with default-deny checkbox and explicit save. It uses the Host-provided caller/grant document revision; no caller/principal goes into the wire request. Agent frames cannot self-grant; the Host must independently enforce this. Delegation is not business assignment, resource ownership or a business approval gate.

## 主动历史查询与当前注入分离

Session 详情与设置页所选 Session 使用同一个 HistoryPanel。挂载、自动刷新、标题摘要与输入区均不会自动调用历史接口；用户点“查询历史”才发出 historyAction。类别/记录 ID 留空表示全部，可填写任务扩展的任意合法类别；例如 workflow、ticket、decision、worktree、ticket-window、execution、notification、configuration、assignment、policy-grant。宿主执行真实 session/owner/private-viewer 权限检查，UI 选择不授予权限。

- query 请求为 {action: "query", query: {kind?, recordId?, limit: 20, cursor?}}。UI 展示匹配总数、固定截点、本页摘要数与来源/覆盖标签；摘要不包含 snapshot。nextCursor 是宿主返回的 typed cut/after/owner/filter 对象，下一页 lossless 原样回传，不转成字符串、不重建游标，也不冒称一次返回所有正文。修改类别/记录 ID 会丢弃旧分页与详情并取消旧请求。
- “展开详情”仅发送 {action: "detail", historyIds: [该行 historyId]}，展示 snapshot、source、coverage、missingHistoryIds。摘要混入 snapshot、实例/游标不一致、覆盖信息缺失或不可 lossless 表达的 JSON 均显示未知，不修复成空页或 0。recorded-history 表示已记录历史，snapshot-only 只是快照；purged/notRecorded 明确保留删除/未记录或缺失的边界。
- 非工作树记录提供单条显式“退出当前注入（保留历史）”和“纳入当前注入”，调用 set-context 的 kind/recordId/included。退出注入不等于删除数据。工作树退出当前视图仅由 cleaned 状态决定；discarded 未清理仍提醒待处置，不用普通归档按钮绕过。
- 每行只有显式“永久删除此条历史副本”，purge 指定唯一 historyId、archivedOnly:false；无批量范围默认、无每次额外确认弹窗。文案明确不可恢复的是此条衍生历史副本，不等于删除源事件、原生会话正文、Git 分支或磁盘工作树。这仍是衍生副本操作，不能代替下述源旧历史清理。操作后失效本地页/详情，用户可重新查询核对。

### 单对象源旧历史删除（保留当前）

records/windows/worktrees 源历史已由主 Runtime 接入后，匹配来源的历史行另提供“删除此对象截至本版本的源旧历史（保当前）”。与单条衍生副本 purge 分开，此操作实际调用 historyAction {action:"purge-source",domain,request:{operationId,expectedRevision,throughRevision,targets?或bindingIds?}}，仅指定一个对象：

- instruments 来源的 workflow 用 workflowId；ticket/decision 从宿主 recordId 的二元 JSON 身份取 workflowId/localTicketId 或 decisionId。
- windows 来源的 ticket-window 用票的二元身份；execution 从 [executionId,generation] 中取 executionId（校验 generation，不把代际猜成对象 ID）；runtime-knowledge 校验当前 instrumentInstanceId 后指定 knowledge。
- worktree-bindings 来源的 worktree 仅传本行 bindingId。其他来源/类别不包装为可删源事件，继续保留独立副本操作。

expectedRevision 必须来自 query 返回的 sourceRevisions.records/windows/worktrees 文档修订，不取 Page.revision、businessRevision 或背景仪器刷新修订。throughRevision 取本行源 version，不取 sequence/historyId；界面同时显示源修订与截至版本。缺失/非安全整数源修订、缺失版本、非法对象选择器或版本超过已读源修订时禁用，并明示未知/重新查询，不补零。已删除衍生副本不等于已删除源旧历史，故已脱敏/purged 副本仍可有独立源操作。

每次明确点击生成唯一 UI operationId，只是请求标识，不作为程序事实证明。宿主负责实际 owner Session/调用者权限与 CAS；UI 保持所选 Session，不伪造 owner 身份替换 child。无默认 TTL、自动清理、批量范围或每次额外审批弹窗，也不强制 compact-source。lossless 源压缩由核心支持，不等于这个删除按钮。

成功必须核对 selected-source-history-only scope、domain、sourceRecordsDeleted/derivedHistoryDeleted=true、nativeConversationDeleted=false、replayed 和源结果修订。文案只称删除所选对象截至本版本的源旧载荷和关联副本、保留最新/当前，不称删除原生会话、Git 或磁盘。phase=partial 会区分衍生副本已处理与源旧历史删除未完成/不确定；receiptRecording=failed-or-uncertain 或不完整/冲突回执显示未知而非成功，并保留 operationId 提醒供主流程核对。旧页/详情失效，用户主动重查；迟到的 source 回执同样受真实取消通道及 Session generation fence 约束。

历史请求同时使用真实生成 cancellation channel 与 generation/lifetime fence。切换 Session/实例、改变筛选、后发请求和卸载均隔离旧结果；新 Session 首次 render 不短暂展示旧 Session 页面。跨 Session 的裁决/授权编辑器采用 Session-qualified React identity，避免同名业务记录继承旧草稿。

## 工作树绑定与参考窗口

新 WorktreeBindingsPanel 消费 RuntimeSnapshot.worktreeBindings 的 current compact rows（不含完整 history）。active 显示，discarded 提示待处置，cleaned 不在当前视图显示但可由历史查询检索。缺少 optional 投影、畸形记录或 worktree-bindings 聚合读取失败均是未知，不根据 fallback [] 显示 0。聚合健康与能力仅标观测，不包装为业务裁决或操作许可。

绑定行展示计划/实际子会话、请求/实际目录、acceptance/outcome 程序字段，及当前登记 source/author/recordedAt。用户选择 active/discarded/cleaned 和 notes 后，仅发送 worktreeAction {action:"update",command:{operationId,bindingId,expectedRevision,state,notes}}。expectedRevision 是草稿打开时的行修订，背景刷新不会暗中升级；“重新读取绑定”才明确丢弃旧草稿。回执不完整或状态/说明不匹配不会伪造保存成功，过期异步写结果不串 Session、不刷新其他 Session。cleaned 是业务登记，不是此界面执行 Git 的物理回执。

旧 resourceAction 创建、合并、实际退役没有新的 UI 引导；旧资源仅在折叠只读区保留历史观测。这里不新增生命周期审批/清理准入流程。

T/S 展示 capacity（参考值）、used（登记用量）、available（登记账本余量）、overage、signed gap 与 S.countKnown。未知完整执行统计绝不从已登记 used=0 或 available/free 推导“全机可派发数量”。界面说明超出参考值/统计未知本身不拒绝派发、不要求另行审批；窗口聚合读取失败也不显示零用量。此改动是 browser-only React projection，不改变执行准入、业务策略或实际 Git。

## Selected Session and observation lifetime

Strict Session contributions consume the framework-bound Session id. The Host resolves trusted owner/managed-child association and authorization, then supplies the same RuntimeSnapshot consumed elsewhere. Workspace identity selects policy; it is not the ledger key. There is no cwd/branch/path identity fallback.

One observer per Session deduplicates header/input/details reads. It subscribes through React's external-store hook, reads on mount, polls at five seconds while held, and supports explicit refresh. It neither invents a Host event feed nor wakes/resumes a model. Failed reads become unknown, never zero. JSON, actual caller, owner-instance binding, display flags and unset capacities are checked before presentation. A failure retains only the last display preference so a hidden header does not secretly reopen. Aggregate resource-read health is also respected inside otherwise valid snapshots: health scope resources/status unknown makes the header count unknown and detail/settings resource blocks show the program read reason instead of presenting the fallback empty array as zero. This is distinct from an individual resource whose cold physical inspection has null facts/reason rows: its authorized metadata remains visible and its known ledger count is preserved. A healthy, genuinely empty resource ledger still shows zero. These presentation checks do not alter actual data, cache or observation lifetime.

Generation fencing and true AbortSignal cancellation cover superseded reads, Session changes, last-release and plugin unload. A's late result cannot update B. Tab callbacks retain captured Session identity; global opening additionally checks the mounted Session. Observers stop on unmount/unload. Cold list rows do not activate Session bindings; the committed-policy gate prevents reading every row while list display defaults off.

## Mechanical evidence and verification boundary

[Client tests](<../tests/client.test.mjs>) cover the closed graph, private-module inlining, native keyed/list registration and cleanup against the actual SlotCore, sparse policy inheritance/CAS conflict, late A/B reads, unknown failures, generations/cancellation, default-off list gate, user-only grants, source preservation and owned Tool keys. Descriptor tests require readSession and historyAction cancellation so an AbortSignal cannot accidentally be sent as a JSON parameter. Mounted Remote/renderer fixtures additionally cover history pagination/filter/detail/retention actions, explicit source-row selector/CAS/cut handling, partial or uncertain source acknowledgements, source revision unknown disabling, cleaned/discarded current bindings, business row CAS, advisory windows, aggregate read failures and delayed responses after Session changes.

The original element-tree fixtures are not visual acceptance or actual Web renderer mounting. The additional [real DOM regressions](<../tests/client-settings-dom.test.mjs>) mount the shipped browser-module factory with real React/ReactDOM in Happy DOM and controlled Remote receipts: Chinese groups and controls, actual input/change/click events, independent startup/policy CAS, sparse inheritance, unknown/loading/failure, native-support precedence, Session cancellation and role-qualified keys, plus centered composer-root style contracts. React warnings are checked through mount, update and disposal. Happy DOM is not a graphical browser: these checks do not measure rendered pixels, certify wide/narrow viewport visuals, mount the complete Web Profile or establish live GUI acceptance. Build/artifact identity, installation, SDK preparation and model evaluations remain separate evidence.

### Historical repository-only verification before the current settings changes

The latest independent client type check passed. The closed memory-only build reported 121,314 bytes, five browser-safe private TypeScript modules and React as its only external request. All 36 client mechanical tests passed with zero failures and zero skips, including same-text declaration reproduction. These are measurements of the current sources, not a released/installed artifact identity; the main artifact verifier must recompute and bind the final package bytes. No final bundle/declaration was emitted by this delegated client task.
