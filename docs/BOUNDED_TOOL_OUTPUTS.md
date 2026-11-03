# 插件模型工具输出减负：有界当前视图、小回执与按需正文

> **状态：设计固定，待实施。** 2026-11-04 所有者认可研究，并明确以本插件造成的问题及插件内处理为范围。本轮交付为研究、方案、设计与实施门禁文档；不是源码修复、性能测试、发布或当前 GUI 生效声明。权威决策见 [DESIGN](<DESIGN.md>)，执行阶段见 [实施计划](<IMPLEMENTATION_PLAN.md#bounded-tool-outputs>)。

## 1. 结论与责任范围

本插件反复把完整 RuntimeSnapshot / InstrumentSnapshot / WindowSnapshot、带全历史的工作树行，或底层共享 RuntimeDocument 作为模型工具结果返回；宿主正常执行日志/spill 后产生累积占用。本机使用 tmpfs 时，它表现为内存持续增长。首要修复是本插件的模型工具 Interface，不以修改 DSH 为前提。

研究核对了已安装 0.6.0 与 0.8.0 源码线。大型样本约 42 MB，主要是 decision 历史和 changes 双视图；同一大 result 在多次完整合并版本中重复出现。多百次 record 输出足以形成十余 GiB 文件。读取不新增业务版本，但会重复导出旧版本。PTC 内部 dispatch 也可独立保存完整文本，所以只裁剪 run_code 外层或工具卡显示不能根治。原始会话、路径、采样数值与安装产物行号仅留在被忽略的本地研究目录；公开文档只保存脱敏结论与本仓库来源。

源码依据：

- [模型工具注册与返回](<../src/host.ts>)：通用 tool helper 和单独注册的 audit 都序列化实际结果；只改 render 不会缩小 typed value。
- [运行协调](<../src/runtime.ts>)：readSession → snapshot；applyInstrument 保留完整内部结果用于历史捕获和通知；assign 的底层 update 返回共享状态文档。
- [仪器投影](<../src/controls/instruments.ts>)：snapshot 同时含 row.history 和 changes；afterRevision 只过滤 changes，不消除 row.history。
- [历史版本](<../src/controls/instrument-state.ts>)：票/决策先合并 previous.value，再把完整 value 追加到 history。
- [工作树投影](<../src/controls/worktree-bindings.ts>)：query 同时含带历史 rows 与 current。

### 硬范围

**本轮方案包含**：本插件模型工具 Adapter、它调用的插件内 current-only/正文读取 Module、严格 DTO/字节预算、模型描述及必要客户端兼容、合成回归与精确制品门禁。

**不包含**：DSH spill/GC/PTC 的补丁或钩子替换、SDK 文件改写、宿主配置/存储根迁移、额外清理守护进程、扫描/搬移/删除旧 spill、自动缩短历史、关闭仪器义务、源存储格式迁移。宿主年龄清扫只有激活时一次，不是周期容量治理；这一事实用于解释问题，不成为本插件新增清理器的理由。现有历史兼容桥不因此扩展。

宿主 RSS/heap、既有 spill 回收和非插件输出属于另题；本方案不承诺回收存量内存或消除所有宿主 OOM。原生工具/其他插件不受本插件全局包装或拦截。

## 2. 选择与 Module 放置

选择 **插件模型输出 Module + 显式领域 Adapter**，而非修改核心返回或接管宿主 spill。

| 备选 | 结论 |
|---|---|
| UI 折叠、render 截短、run_code 少打印 | 已发生的 typed value/内部日志仍大，不是修复 |
| 给核心 read/apply 原地换返回类型 | 会波及 Remote、通知和历史捕获，首阶段不选 |
| 关闭或删除历史、自动 compact/purge | 改变保留语义且不能清除旧 spill，不选 |
| 修改宿主清理、存储根、日志去重 | 与本插件交付脱节，排除 |
| 插件模型输出 Module | 在实际 execute 返回前形成小 DTO，直接和 PTC 共用；选定 |

内部 Seam 是 Host 的模型工具 action → model-facing DTO；Remote 和核心模块继续使用原完整类型。共用 Module 承担 envelope、UTF-8 计量、按行装箱、正文 locator/分段及插件诊断限幅；领域 Adapter 承担授权、当前事实/修订提取、commit 语义与来源读取。不得用“任意 JSON 截断器”代替领域 Adapter。

只新增插件内部 interface/类型，不新增模型工具名、Remote 方法、存储域或后台任务。工具默认注册数量及 delegate opt-in 不变。新增内部读方法在生产组合中为必要能力；缺失时明确拒绝，不能回退到全快照。audit 的独立注册点必须进入相同输出检查。

## 3. 固定输出预算

以下均为**目标契约，尚未实现**：

| 类型 | 最终预算 |
|---|---:|
| 当前概览/分页、query/detail、正文片段、audit | 65,536 bytes（64 KiB） |
| 写操作回执与插件自产机械错误 | 8,192 bytes（8 KiB） |

预算针对实际 compact `JSON.stringify(modelValue)` 的 UTF-8 字节，含 envelope、标识、locator、转义和诊断；不是字符数、记录数、正文原始长度或 token 数。Host render 使用这一已形成 DTO 的同一 JSON 文本，不能再把原内部结果塞入 value/content/meta/additionalContexts。原生消费 hook 的独立仪器消息保持原契约，不计作此 DTO，也不得被偷偷加上全历史。

返回统一 `schemaVersion: 2`、`kind`（current/page/receipt/detail/content）、真实实例及 scope 描述、适用的 source revisions、coverage/health；各 action 的必需字段见下节。scope 的票集合可以分页，必须有计数及 fingerprint，不为满足预算伪造 coordinator 或截短身份。长正文有预览和受权 locator；多行集合有 `shown/total/more` 与续读入口。unknown/null、未记录、已删除与预算省略分别表示。

装箱先保留身份、修订、真实状态、coverage 和续读信息，再填展示正文。对当前授权 value 做投影；默认读不得先构建/深复制/序列化全历史，再在末尾裁掉。热 current index 可复用不可变文档缓存，但只保留当前事实/权限所需字段，不缓存巨型序列化结果。冷加载和源文档验证仍可能随历史增长，不声称 O(1)。

写操作完成后不因投影太大抛出“写失败”；最小回执必须在任何合法标识下适配 8 KiB。可选诊断/列表外置，原始 commit、partial/unknown 和 replayed 事实保持。储存写结果不确定时保留 storage-uncertain，不从预构造 receipt 推断成功。插件错误限幅不回显整份 command/result；不处理或改写宿主及其他插件的错误。

## 4. 模型 Interface 与兼容迁移

### 4.1 record 当前读取

保留 `{action:"read"}`，改为有界当前仪器概览，不返回 histories/changes。它仍是自动注入 missing/stale 时的恢复入口，**不是 records-only 或 UI summary**：在原 RuntimeSnapshot 允许的 scope 内，保留有效配置/实例与适用修订、业务统计/义务计数、T/S 及 unknown/覆盖程度、pending/awaitingImplementation、pendingRelease、nativeStops、待处置树和关键 capabilities/health 的有界摘要与续读入口。没有权限或来源未知时明确 unavailable/restricted，不用空集合或 0 代替；显示关闭、focus 或预算不能把未展示义务当成不存在。

增加可选 `query`：`{kind, workflowId?, recordId?, limit?, cursor?}`。业务 kind 为 workflow/ticket/decision/status-count；恢复当前仪器的 kind 为 window-ticket/window-execution/native-stop/pending-release/native-execution/worktree-binding/worktree-observation/resource/capability/health。有效配置在概览给出；其长字段可按受权 effective-policy locator 读取，不开放完整 policy 配置权限。limit 默认 20，范围 1..100，并再受字节预算限制。默认概览提供各类的实际合法查询形状、计数及 coverage；没有源/权限时不给假 locator。resource/worktree 等 kind 只提供现有 RuntimeSnapshot 授权视图，不能取代原 registry 的 coordinator gate；native-execution 保持 coordinator-only。

查询只缩小明细，不改变概览义务与授权口径。cursor 固定真实实例、调用者/scope fingerprint、所选领域源修订或实时投影 fingerprint、kind/filter、稳定排序末键及表示版本；pending-release 同时绑定 records/window 水位。所选源/实时 fingerprint 或 scope 变化返回 revision-conflict（reason=current-view-changed），重开读取；不保留整页数据，也不跨新旧版拼接。未变视图中分页必须不重不漏且有进展；不承诺实时类别在新事件期间有跨页快照隔离。实时长字段按 recordId 重读有界观察，不冒称 4.4 的持久分段正文。

每行给来源修订/实时 fingerprint、当前精简字段与可用的详情定位；只有可确定性重建的合法正文才给分段 locator，实时观察给 recordId 查询及覆盖说明。locator 指向该行当前合法表示，不含 history。旧的完整导出需求以分页 + 正文片段组成，不提供 `full:true` 或其他无界逃逸。

### 4.2 写操作回执

record apply 保留输入 command 和 operationId/CAS 规则。模型结果以小 receipt 取代 snapshot，包含真实 instance、操作/目标标识、`appliedRevision`、`replayed` 和可确认的当前 `revision/businessRevision/viewerRevision`，必要的历史捕获/通知诊断及详情定位。appliedRevision 是原提交水位，不是当前 expectedRevision；只用对应 business/viewer 水位构造后续 command。

先沿现有内部路径完成真实写、captureBusiness、通知 journal/调度和 durable consumption 跟踪，再输出 receipt；发生 capture/notification 问题如实给 unknown/failed，不能补发业务操作或把 partial 变成功。重试仍先复核当前授权；相同 operationId 不因新 DTO 重新执行。内部 InstrumentApplyResult/Remote 不变。

### 4.3 同类输出逐项固定

| 工具 | 模型返回要求 | 保留的关键语义 |
|---|---|---|
| record | current/page；apply receipt；增加只读 detail | scope、三种修订、义务、幂等、通知/捕获诊断 |
| window | receipt，不返回 WindowSnapshot | appliedRevision/replayed/**ignored/generation**、本次目标；当前 T/S 若展示仍含 unknown/计数覆盖 |
| assign | 本次目标 assignment 的小 receipt，不返回共享 RuntimeDocument | 实际 child/parent/instance、workflow、票数及受权详情；不泄露其他 owner assignments/bindings/notifications |
| worktree | read 为 current-only 分页；update/update-observation/reconcile 为目标回执 | cleaned 查询入口、source coverage、business revision、observed/inferred/strong binding 来源；不同时回传 rows.history/current |
| controls | read 为有界 policy 视图/分页；save 为 revision receipt | authorizePolicy、未知/继承；**部分 policy 不可当完整 intent 回填 save** |
| resource | 单资源有界视图，持久 references/账本正文按需读取；实时 physical 列表只给有覆盖说明的有界观察 | ledgerRevision、checkedAt/digest、actualCanRetire 与 unknown，不把明细缺省解释为空 |
| history | query 摘要与 detail 都受字节预算；写/清理动作为小回执 | cut、来源/修订、missing 与 purged、partial/source outcome，见 4.5 |
| delegate（opt-in） | 保留小回执，诊断有界 | accepted true/null、childId/messageId/replayed/recording；未知不重派 |
| audit（条件） | summary/current episodes 有界、可续读 | memory-only、丢弃/覆盖计数、observed 与 possible issue 区分；不制造 durable 历史 |

worktree/controls/audit 的 read 只增加 `query?: {kind?, recordId?, limit?, cursor?}`，允许 kind 分别限为 binding/observation、defaults/workspace、session/episode；controls 的 recordId 为 workspace ID，其余为该类对象 ID。默认读取提供完整支持的 query 形状，limit/cursor 规则同 4.1，实际 source domain 的修订/表示摘要固定切点。只处理现有来源已具备的事实；observation 明细需要连接现有 observations 来源，不能把 binding query 冒充 observation 查询。瞬态 audit 在新事件/驱逐后允许 cursor 失效，不提供冻结内存历史承诺。

controls 视图必须标注 `completeIntent: false`（包括分页），并给明确完整重建入口：按同一 policy revision 读完 defaults 与 workspace 全部分页/正文后才允许组成现有完整 save intent，期间变更则重读。模型工具不新增隐式 patch、默认补空或“把本页当全部”的保存语义。Remote 设置页的完整 policy 编辑维持原实现。

### 4.4 单一正文分段入口

在既有 **mattpocock_record** 增加 `{action:"detail", locator, offset?}`；offset 默认 0。不增加 history content 工具/action。各模型视图的长正文/来源 metadata 及 history detail 统一给出此入口；这是插件内读 Interface，不是任意文件或存储读取。

locator 仅能选择允许的领域：当前 records、windows、worktree bindings/observations、合法 policy 视图、单资源、当前受权 assignment、memory-only audit，或 coordinator 已获准的 history row。每类有专用 resolver 和原授权检查；不支持任意 table/key/JSONPath、共享 RuntimeDocument、别的 session/owner、私有 Agent/FS、原生日志或旧 spill。

| locator domain | 可分段对象 | 每次读取的权限/来源规则 |
|---|---|---|
| records | 选定当前 workflow/ticket/decision 的合法 value/provenance | 原 records scope；decision 的全部关联票/creator 规则 |
| windows / assignment | 选定持久票/执行事实、当前受权目标 assignment | 原窗口限域或父子赋权范围；不读共享文档其他对象 |
| worktree-binding / observation | 指定行当前 value/provenance | 原 coordinator-only gate；两种来源分别解析 |
| policy | 已保存 defaults/指定 workspace override；或合法 effective policy 表示 | 完整配置仍要求 authorizePolicy；effective view 不扩大为完整配置读取 |
| resource | 单资源已持久化账本字段 | 原 coordinator/资源权限；不冻结或重放 Git 检查结果 |
| audit | 当前仍保留的单条有版本内存观察 | 原 owner/启用 gate；被驱逐则 unavailable |
| history | 指定 historyId/sourceVersion 的合法 summary/body | 原 coordinator-only gate；purge/tombstone/coverage 不变 |

现场 Git/physical 结果的 checkedAt、live S、audit generatedAt 等保留在有界当前摘要，**不把每次重新计算的实时组合 view 当作稳定分段对象**。这些事实不具备跨请求快照隔离。durable 字段按来源版本重建；内存观察无稳定版本时仅给有界预览及 coverage，不能发永远无法续读的 locator。

detail 走插件专用只读 resolver，不调用现 historyAction 的 captureBusiness/captureOthers 路径，不 ensure/register、CAS、已读、通知 ACK 或唤醒。宿主既有 postExecute 消费 hook 独立维持，读取片段本身不冒充消费提交。

locator 是有界的不透明 selector，绑定 schemaVersion、mount epoch、representationVersion、实际 instance/workspace/caller session/principal、scope fingerprint、domain/对象身份、sourceVersion 和正文 SHA-256；非授权凭证。重挂载/重启后旧 locator 可以失效，必须重取；不以 mount epoch 代替授权检查。每次解码严格校验并在现有权限 FIFO 内用真实 caller 重新取源、复核访问与版本。禁止信任请求中的 owner/principal/scope/hash 来授予访问。跨 caller/fork、instance、权限撤销或 scope 改变均不能续读；policy 仍复核 authorizePolicy，worktree/resource/history 仍 coordinator-only，audit 仍要求启用且有当前覆盖。assigned 只读原有权限允许的当前 records/window/assignment，决策仍按全部关联票、creator 规则判断；不借正文入口扩权到 owner 全历史。

正文是一个**选定授权对象**的确定性 canonical JSON UTF-8 文本（键排序、稳定表示，含来源和精确 value），不是整个工具原始大返回。各片是 JSON envelope 中的 `data` 字符串，不要求每片本身是可解析 JSON。字段为 locator、sourceVersion、contentHash、totalBytes、offset、nextOffset、done、data 及必要 coverage。offset/nextOffset 都是该文本的 UTF-8 字节位置，必须在码点边界；服务端选能装进最终 64 KiB envelope 的非空前缀。非末页 nextOffset 严格增加；offset==totalBytes 返回空末页；越界或切中码点拒绝。连接全部 data 后应验证 bytes/hash 再解析 JSON，不能把多个版本的片段拼起来。

current 对象版本/表示变化返回 revision-conflict，并带 reason=content-version-changed，明确它是只读续读冲突而不是业务 CAS 失败；history 被 purge、来源未记录、audit 驱逐分别给诚实 unavailable/coverage，不读取新正文来替换旧片段、不缓存复活被删正文。每页重新授权；没有新持久化、临时文件、整结果缓存或无限旧版本可读承诺。locator 大小与 UTF-8/转义预算纳入装箱测试。选定长正文可有随正文大小的编码/摘要成本，但须取消可响应，不引入全 owner history 扫描作为普通 current 读取的前提。

### 4.5 history 列表与详情不作为放大旁路

保留现有 query/filter/cut/nextCursor 和最多 20 个 detail IDs 的输入；模型 DTO 去掉大正文，给 inline 小对象或 4.4 的 locator。query 摘要自身的大文本也精简并可按需取原值。字节装箱必须按最后实际返回的 sequence 生成下一 cursor，不能使用预先取出但未交付行的末键。

detail 如不能在一页装下全部请求，区分 `remainingHistoryIds`（未返回，重请求这些 ID）与 `missingHistoryIds`（源确实缺失）；不把省略变缺失，至少返回一项或明确机械错误。单个过大正文以 locator 替代，不迫使无限请求同一不可容纳行。query 的 cut 冻结行集合，不保证正文不会被显式 purge。现有 coordinator-only 权限、coverage 和 sourceRevisions 语义不变。

### 4.6 迁移与旧工具卡

这是有意的**模型结果契约变更**，不是兼容旧 PTC `result.snapshot` 的隐式修补。发布时必须同步工具描述、示例/契约测试和使用指南，标记 schemaVersion 2；旧字段使用者改读 receipt/current 的明确修订。不得保留默认全快照兼容开关。旧会话和工具卡仍能读旧 JSON；新卡片展示新的合法 content，不改宿主 argsRaw/content/error/meta 字段或 wire 名。

本契约仅替代旧“工具卡改造不改变模型输出”的限制在**本次独立工具输出工作**中的适用性，旧 UI 设计及历史交付记录不改写。内部/Remote 的全快照与现有 readSummaries 继续独立；readSummaries 不包含完整模型义务，不能拿它冒充 record current。

## 5. 正确性不变量与次序

- 授权及 scope 在每次 read/page/detail/replay 前重验；旧历史访问仍按原授权规则，非“当前看得见就能看所有旧版”。FIFO 撤权屏障、真实身份与源健康不被 version/缓存命中绕过。
- current value 保留原业务语义，hidden/OFF/focus 不抹义务；待处置树、失败结局和 partial/unknown 不因预算消失，有计数和续读定位。
- preStep/postExecute 的 durable frontier、additionalContexts/concludeTurn 与历史捕获/通知来源维持原实现，不靠少输出减少必要持久化或补造已消费回执。
- 业务、viewer、源 CAS 修订分别使用；工作树/窗口自己的 generation/revision 不替换为 record businessRevision。
- 不删除、重新解释或压缩源/derived/native 历史；不改变 retention、自动产生 archive/purge 或写历史的新业务事件。长 result 写作可建议使用简明结论和证据引用，但不强制更改已有正文。
- 任何写操作的回执来自实际结果，不额外重新调用 mutation 取详情。projection 失败的最小诊断仍说明真实 committed/unknown 状态，不能诱发重复派发/赋权。

## 6. 实施与验收门禁

按 [实施计划](<IMPLEMENTATION_PLAN.md#bounded-tool-outputs>) 的顺序执行，跨真实模型工具 execute/typed value/render Seam 验证，不能只测试私有 formatter。

| 验收项 | 必须通过的判据 |
|---|---|
| 放大反馈 | 合成同一 current、历史版本从小到多百条，包含约 42 MB 旧完整投影；先证明旧路径超预算，再证明新默认 read/receipt 字节在固定上限内，不随旧历史等比增长 |
| 重复读取 | 300 次未变修订的模型调用，累计插件结果受 300 × 对应预算约束；current-only 热路径不重建/深克隆完整 row histories；源码和计量共同证明 |
| 全工具面 | 七固定 + audit + opt-in delegate，直接调用和 PTC 内部调用都检验 typed value/实际 rendered content；audit 独立注册不可漏掉 |
| 来源正确性 | assign 只含当前目标及授权范围，无其他 owner 元数据；window ignored/generation；worktree 来源/cleaned；policy 不完整不可回填；resource unknown；delegate acceptance；audit memory-only |
| 恢复读取 | 禁用/缺失/陈旧自动注入时，仅用 record read/query 即可发现当前 T/S/unknown、nativeStops、pendingRelease、待处置树和关键 health；超预算集合能继续分页；实时变化只明确失效、不退回全快照 |
| 分页与片段 | 多语言/emoji/反斜杠/控制字符/长 ID；边界字节、空/末页、稳定排序、至少一项进展；总字节/hash 重建一致；scope/version变化不混页 |
| 历史长尾 | 大 query summary、20 个大 detail、缺失/墓碑/预算递延正确；实际可用 locator，不承诺未捕获来源；显式 purge 后不复活正文 |
| 权限与次序 | coordinator/assigned/creator/全关联票、撤权、policy grant、跨 owner/fork、OFF/hidden/focus、FIFO 与 cancellation；每页/幂等命中都重验 |
| 写操作 | CAS 冲突、相同 ID 重试、旧 appliedRevision 对新 current、viewer 更新、存储不确定、通知/捕获失败；投影不引发第二次写或重复派发 |
| 不触碰宿主 | 精确包在未打本次补丁的既有受支持宿主上使用公开契约；无 SDK/Profile 差异、全局 hook、原生工具改写或新常驻任务 |

先做合成/隔离 SDK 工具集成，再严格构建、根测试、生成物一致、clean-source prepack 与精确 tarball 验证。新私有 Module 如产生打包文件，同步固定 allowlist/数量/声明，不能把源码通过当包通过。若要观察真实 spill，只能在隔离 DSH_HOME 和临时非生产根中运行原版公开宿主；不使用真实业务快照或用户现有 tmpfs 做压力测试，也不要求宿主“完全零 spill”（阈值独立可配置）。

本轮文档完成的判据仅是来源可追溯、接口/预算/不变量/阶段一致且无宿主补丁依赖。实现测试、制品与真实 GUI 结果在实施后另记 [VERIFICATION](<VERIFICATION.md>)；安装、发布、现存 spill 回收与服务重启另行授权。
