# 运行中读取性能：0.21.0 实施契约

## 1. 状态、授权与范围

2026-11-10，所有者认可代码性能审计的推荐顺序，明确要求“先固定到文档；在 subagents、隔离环境中完成开发和测试；push 发版，为本机 DSH 安装”。本页为实施前冻结的最新细化契约；当前状态为 **Implemented / independent review and artifact gates pending**，不是已发布或已部署结果。初轮固定提交审查发现的 freshness／取消边界必须修复并独立复验后才能进入发布。

本批只实施第一批三项：**owner 相关完整投影失效、live descriptor 紧凑事实寿命、已开始读取的协作取消传播**。发布目标 0.21.0，仅以 DSH 0.2.2-rc.1 和 Node >=24.9.0 验收；engines.dsh 仍为 >=0.2.2-rc.1。更高版本是声明范围而非已实测承诺。

允许：先提交本契约，再建独立 implementer 工作树，主代理串行集成；完成源码、生成物、唯一精确制品、独立 Standards/Spec 审查和 RC1 装载/安装门禁后非 force push main＋新 tag、新 GitHub Release、下载逐字节回验、通过官方 CLI 安装同一回验包到本机 Web Profile。安装前备份旧包、Profile manifest/lock/patch，保留明确回退边界。

不包含：自动重启/替换现有 DSH 服务、管理/预授权自动启用、生产业务迁移/清理、真实模型业务 campaign、共享 SDK/其他插件修改、npm publish、vendor/通道/provider precedence 变更。磁盘安装、Host 激活、浏览器装载分别报告，不能相互替代。

## 2. 问题与证据等级

审计已用真实公开调用 seam 与合成来源计数证明：无关 live Agent 数量变化能使目标完整投影重建而输出相同；普通事件代次会使下一次身份读重新物化 owned-events 数组；已开始 full 读取取消后仍会启动额外来源操作。该事实支持消除结构性浪费，不证明某个生产会话 CPU99% 的唯一原因，也不证明 0.19→0.20 新增回归。

原始 CPU/会话元数据/带日期探针路径与日志仅本地保留，不把私有会话、认证信息或业务正文写入公开资料。验收使用合成数据的工作计数/增长与语义断言；毫秒数为辅助记录，不作为偶然硬 timing 契约。不得宣称未经实际运行态复测的生产 CPU 降幅或“已彻底修复”。

## 3. F：owner 相关投影 freshness

### 3.1 Interface 与实现约束

保持 Runtime.readSession/模型当前消费、Remote wire 内容/版本/身份、现有 effect FIFO 与刷新上限。内部 Module 可计算**当前 owner 相关 live cut**，取代无关全局 live Agent 数量对完整投影 cache key 的过度影响；这不是授权缓存，不新增模型/Remote 调试入口、持久拓扑账本、后台调度或 SDK 改造。

- 当前身份、policy/grants/assignment/workspace/lineage、来源健康仍先核验；旧投影不能给新调用者扩大可见范围。
- cut 至少覆盖该 owner 与当前可证明后代的实际 Agent/Session 对象身份、header/parent 身份及运行/idle/消失；同时覆盖投影使用的 worktree creator、binding child、native execution 关联身份及原生计数器当前已知 membership IDs，即使它们没有持久 nativeExecution 行或不在当前可遍历 live 父链中。计数器 membership 与深度计算所依赖的外部 live 祖先（含 ordinary root/fork）也必须覆盖；只同步复制紧凑已存 ID，不刷新 catalog、不携带 Agent 图。旧 Adapter 缺少 membership proof 时保守不复用。
- 未知/断裂/循环父链、实际能力缺失/拒绝、未知身份应保守失效或保持明确 unknown，不得因无法证明“相关”而把可能相关变化排除。普通 fork 与独立 owner 仍按原身份语义区分。
- 新 live child 即使尚无持久记录或 lifecycle 回调，下一次读取仍须看见；不能仅删除全局长度或仅信已存 owner count revision。只复用已证明无关变化的纯投影，不减少必要物理观察或借大 TTL 掩盖变化。
- 每次读取在 body 工作前同步捕获不可变快照 A（复制字段，不跨 await 握可变 Agent 当 cut）。候选缓存保存紧凑依赖 ID 集 D 与 A.token(D)；miss 从实际 registry/facts 收集 D，但 token 必须仍从 A 的字段（含缺席标记）计算。热命中完成 validateProjection 后、miss 完成 body 与最终 validate 后，再取 B 对相同 D/owner代次/能力核对；若不同则在同一 FIFO permit 内至多完整重建一次；再次变化走既有 conflict，不递归排队、不扩大 timeout、不返回或认证旧 body。B 只用于校验，绝不把较新的 token 盖给旧 body。新发现关联 ID 无法在 A 证明时保留保守 fallback；临时 cut 不长期驻留整份 Agent 图。
- 对象身份编码只作有界/弱引用的进程内事实，不持有整份 Session/日志图，不另存巨型序列化字符串。保持现有生命周期/缓存上限义务。

### 3.2 必需 RED→GREEN

通过实际 createRuntime→readSession/current 消费调用，计数实际 SessionInstruments/full 投影工作：相同请求热读复用；仅增删已证明无关 root/其他 owner 后代，不额外重建目标且完整结果等价。相关 child 新出现/对象替换/运行-idle-stop、creator/binding 状态、断裂/循环父链、能力降级与未投递事件均保留及时变化。受控 gate 验证 mid-read 变化不能被旧 body/new token 掩盖。权限/撤权、OFF 保留义务、source fault、history capture/frontier 回归不削弱。

## 4. I：live descriptor 事实寿命

### 4.1 Interface 与实现约束

在 createHostAuthority 私有 Module 中精化紧凑身份事实的有效期，public sessionFacts 完整语义不变。RC1 真实 Session 的日志 append-only、事件不可变、**首个 owned descriptor authoritative**；因此首次验证成功的支持版本 descriptor，不因后续无关事件追加失效。fold 是 first descriptor 查找/解析，不把它误称每次重放整份日志。

- 只在能够证明上述不可变/所有权性质的真实公开 Session 实例上应用更窄 positive fast path；不能凭形状、版本字符串、顶层 frozen、retained association 或任意 Session-like 对象断言可信。
- 实际 Session/Agent/header/parent 指纹、mount、live↔cold、同 id 替换、dispose 等围栏保持。每次当前身份与健康仍验证；事实复用不是授权复用。
- 先仅优化**支持且合法的首个 owned descriptor 已验证**场景。缺失/未知/不支持/无可靠证明时保留现有 seq/观察回退；迟到 descriptor 应被看到，畸形 first 当前版仍拒绝，继承 descriptor 不算 owned，后续重复 descriptor 不能改写 first 的公开语义。
- 不新增 deprecated/prohibited 的 eventAt/snapshotEvents/ownEvents 调用来做范围技巧，不读 SDK 私有 log，不修改共享 SDK。首验/保守 fallback 的既有读取可保持；若要新观察机制，必须使用公开 SessionQuery/typed event Interface 并证明 seed/cold 覆盖。
- 只保存有界紧凑事实与弱身份围栏，不保留大事件数组；冷缓存 source symbol/revision/header/current stat/after-stat 义务不变，本批不调 cold cache 容量/策略。

### 4.2 必需 RED→GREEN

真实公开 RC1 Session＋createHostAuthority→resolveSession/实际 Runtime 调用：在1000/4000级合成事件中，首次验证后5次无关 append/read 不额外物化 owned-events 数组；稳定 seq 同样复用。缺失→出现、畸形 first、仅继承、后续重复、header 冲突、同id Session/Agent替换、live↔cold、来源 denied/异常、无可靠 seq/非真实 Session fallback、并发与 lease 释放矩阵保持。既有 exact-seq 测试先按本节的 immutable first-descriptor proof 调整，不把旧安全断言简单删除。

## 5. C：已开始读取的协作取消

### 5.1 Interface 与实现约束

在插件拥有的内部 HostPorts/ControlsAuthority/InstrumentAuthority 与读取调用链上**兼容地透传可选 AbortSignal**，允许将之前已有外层取消扩展到 stat/observe/lineage 等可中断 seam。现有省略参数调用保持合法；wire 方法/typed模型输入/持久格式不改变。不引入新的通用全局 context 或授权 token。

- pre-abort 与排队后 entry guard 保留；已开始读在昂贵阶段开始与 await 返回处检查 signal，及时阻止新来源/投影工作，传到支持 signal 的公开 stat/observe。
- caller abort 抛同一 reason（包括 workspace／runtime store／grants 等 await 在取消后拒绝的竞态），不吞成 records-unavailable/unknown 或正常结果；未取消的来源拒绝仍按原错误语义。timeout、superseded、stale 各按原语义，lease 总能释放。历史 retained catch-up 与 captureOthers 的准备性读取同样传递 signal、逐阶段检查；尚未接受写入的准备过程不算豁免的 producer，也不能把调用者取消登记成 history 来源失败。
- 保持前后当前权限/来源健康重验、全局 policy/grant effect FIFO、固定每实例已登记 durability frontier。读取取消不取消 producer，不丢弃已开始/已接受持久写或既有义务；trackCommit 与 uncertain/late 回执语义不变。
- 不增加 timeout、不暂停真实状态、不粗暴并发原串行权限链。timer 不能抢占同步 JS；分别记录 queue wait、执行和不可中断阶段，不伪称全链可立即停止。
- 新 signal 参数属于必要内部 Interface 精化，不借此复用跨item/batch授权上下文，也不把9次来源核验直接砍成1次。

### 5.2 必需 RED→GREEN

通过实际 Runtime.readSession/readSummaries/模型当前读取＋真实 createHostAuthority 闭包，用受控来源在第5次stat触发取消，断言不再开始后续可中断来源操作，并检查 stat/observe 实收 signal；正常读取内容/权限仍相同。覆盖预取消、queued取消0来源操作、in-flight await中取消/拒绝、迟到完成不发布、lease释放和原reason。另用实际 InstrumentConsumption/挂载Remote/Runtime durable frontier seam证明读取取消不杀producer、不吞提交、不把旧缓存当current。

## 6. 预先认可的 seams 与范围限制

沿用已接受的 [读取性能 seams](<PERFORMANCE_READ_PATHS.md#预先确认的测试-seams-与验收>)，本批具体为：

1. **createHostAuthority + 真实 RC1 Session + 实际 Runtime 调用者**：证明 owned descriptor 事实/来源围栏与物化增长；受控来源不等真实磁盘/全部GUI。
2. **createRuntime 的 readSession/readSummaries/readModelCurrent 与内部 storage/HostPorts Adapter**：验证 owner切换、失效/工作计数、权限/源竞态及取消；不反射私有 Map/queue，不把 FakeHost metadata 当真实Agent/model。
3. **实际 mounted Remote + InstrumentConsumption + Runtime preStep/postExecute + SessionHistory**：验证 transport取消、current/full、durable frontier、来源/历史/迟到/基线保持；合成调用不等目标生产会话复现。
4. **仅 RC1 的 source/精确包完整回归、Host/Client严格类型、真实装载/官方PluginManager/正式headless**：证明相同制品及兼容；浏览器离线fixture只覆盖相关UI回归，不起替代生产服务器、不调用生产数据。

测试以真实 RED→GREEN tracer bullet 单切片推进；工作计数是公开调用者 seam 的行为契约，不为测试导出私有 Map 或改 SDK。原16/64/256历史扫描、65冷缓存悬崖、full/summary合并及单item授权去重属于后续候选，**不纳入本批实现**。

## 7. 实施、集成与发布门禁

- D：本页＋DESIGN＋IMPLEMENTATION_PLAN先单独提交，未落码前状态保持pending。
- F/I/C：各自独立 worktree/branch 单writer，明确文件所有权；并发更改同文件只在不同树发生，主代理串行集成解决冲突后复测。不得改原dirty checkout或共享依赖；临时存储和SDK fixtures隔离。
- V：定向计数/竞态/安全矩阵，RC1源码完整套件、严格Host/Client、生成物/公开exports/vendor/工具面与wire不变；独立Standards/Spec按固定base/head审查，必改关闭。精确解释skip，不把历史SDK分数当当前门禁。
- P：源码clean冻结0.21.0与唯一tgz及sidecars；同一包完整消费/装载/安装验收，fresh私有Profile包级回退保护；持续策略旧版回滚限制仍以MIGRATION为准。
- R/I：非force发布，不移动旧tag/资产；五资产下载回验，再官方安装同一回验包。本机只改目标依赖/lock节点，备份旧文件，核验非目标配置与受保护checkout保持。安装成功不冒称Host/GUI加载新版本，当前服务不自动重启。

若固定契约无法以现有公开能力证明，先报告并收窄优化，不以弱化断言/来源健康/授权或增加timeout收尾。完成记录另追加公开验证摘要，原始本机诊断仅本地保留。
