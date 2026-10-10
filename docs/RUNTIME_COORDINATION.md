# Runtime coordination：真实源接线与机械证据

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

## 范围与证据等级

本轮只新增 [runtime 集成测试](<../tests/runtime.test.mjs>)、[受控 Host fixture](<../tests/fixtures/runtime-host.mjs>) 与本文；没有修改 runtime/core/Host 源码或其他文件，没有 emit/rebuild lib、打包、安装、发布或操作 GUI/profile，也没有启动模型、AgentLoop 或新的真实代理。

测试入口是 [createRuntime](<../src/runtime.ts>) / [RuntimeFacade 与 HostPorts](<../src/host.ts>) 的公开边界。Node 24 的 registerHooks 将当前 TypeScript source 在内存转译，不使用可能过期的 lib。策略、owner association、业务 records、T/S 与 consumption 均来自真实 [controls source](<../src/controls/index.ts>)、[SessionInstruments](<../src/controls/instruments.ts>)、[SessionWindows](<../src/controls/windows.ts>)、[InstrumentConsumption](<../src/controls/consumption.ts>)；memory storage 也是这些 source 的真实实现。

fixture 用 JSDoc HostPorts 契约标明端口，使用真实 [createHostAuthority](<../src/host.ts>) 与受控 session headers/owned descriptor suffix。名为 actualAgent 的对象是 FakeHost 持有的精确 metadata 对象：不是 SDK Agent 的实例，也不运行模型。created/observe 接收对象身份，不从 value、message、业务标签或 JSON 字符串提取 S receipts。CAS gates 只包裹真实 storage 的公开端口，放行后仍由真实解析/CAS 实现提交。

另有实际已安装 SDK 的 Context、ToolRuntime、DomainFacility、TypertRegistry、SystemPrompt、SkillRegistry 与 mountHost 组合；这些是无模型/无 GUI 的注册器与协议接缝，不是完整宿主行为验收。

## 协议与权限

managed native 请求：

~~~ts
{ nativeTool: 'subagent' | 'subagent_fork' | 'send_message',
  arguments: HostJson, workflowId: string | null, localTicketId: string | null }
~~~

assignment：

~~~ts
{ sessionId: actualDirectChild, workflowId: string | null, ticketIds: string[] }
~~~

- 不得给普通 fork 或别的 owner 授权，子代理不得超出当前父 assignment。
- null workflow/null ticket 是真正的无票研究，不创造虚构工作流、票或 T 占位。root 与 managed descendants 共用 root S。
- author 由认证调用者产生；agent 和 operator 的业务更新保留其真实 principal/session 归属。业务“已交付/已释放”等字样不是程序释放证据。
- policy save/admission 与权限撤销通过当前 runtime effect ordering 收敛；这里只验证单 Host 的排序，不宣称跨进程事务。

## 机械覆盖矩阵

| 接缝 | 已观察结果 |
|---|---|
| 安全初值、Skills 独立 | extension 默认 off；native 不被默认拦截；实际 SkillRegistry provider/body 仍可读 |
| metadata owner 隔离 | old managed child 保留原控制 W；other root、普通 fork 有独立实例；跨 owner/session 读拒绝 |
| author 与 assignment | operator/agent 作者保留；old/new child 仅看与改授权票；null scope 不变成 coordinator |
| 无票研究 | future-controlled child/grandchild null scope；root S 聚合，T=0，无虚构业务 workflow |
| T/S 独立、逐项 refill | T 释放不释放 S；exact disposed 对象释放 S 不释放 T；立即补入；T-only/S-only unset 不猜默认容量 |
| 安装版活动真值 | 提供 subagents catalog 的宿主上，S 的成员资格来自实际 listDescendants 结果、running 取 live `Agent.status`，读取不再重复走目录；未提供该 seam 的 fixture／组合里 actual mounted ports.nativeActivity 仍返回 known:false 并包含真实 registry 对象，不假装空集合，S 是明示下界；任何情况下 S 都不否决本来有效的派发，T 独立可用 |
| ctx.tools guards | managed nested native 经过原注册器 guards，精确 caller/parent token；direct-parent 进度/问题立即允许，无需 idle/end/disposal，不按正文 JSON 分类 |
| 未初始化 child | pre-descriptor one-shot 的 guard cache 缺口在 windows on 时 fail closed，off 时允许 |
| S receipt 证据 | idle、subagent/end、结果文字、缺 actualAgent 不能释放；精确 old/new 同 sid 不同对象的 token 互不释放；缺 proof/unmanaged 保留 unknown |
| ALS 生命周期 | native 调用完成后的 inherited async context 不可继续用 admission guard capability，也不把 late child 绑定到旧 token |
| 消费 | preStep/postExecute 鲜快照附带实际 source；receipt commit watermark 同步注册，parent 消费等待已经登记的提交；public policy/windows revision 一致；旧 identity 晚返回不重置新 guard cache |
| 表示边界 | 小阈值 FakeHost 与单张合法大 decision 两种情况验证 formatter 拒后短 unknown；实际 >262144 cached context 不进入早期 assembly；业务 records 保留 |
| storage fault/abort | 真实 mounted SDK waterfall 的 policy read storage-uncertain 不抹掉 enter/messages/source/id/startsRequestSeries；另添短 unknown；settled tool value/content/contexts/conclusion 保留；caller abort 仍抛原 reason |
| 关闭/隐藏 | off 与全部 display hidden 仍保留票、待决事项、existing T/S obligation；既有 S 的 exact release 仍收敛 |
| cold read | 已登记 cold owner 仅读保留的 resource metadata，physical proof unavailable 明示；未知 cold root 的 public read 不隐式创建实例 |
| resource 权限 | cold metadata observation 对称释放；无 cold Agent 激活；实际 Host Git factory cold unsupported；mutation 需 coordinator 与宿主现有 root/read-only 权限，拒绝先于 executable lookup/spawn |

普通原生消息身份、pre-step decision 字段、post-result ordinary contexts 的不损伤契约由现有 [host tests](<../tests/host.test.mjs>) 覆盖；runtime tests 不用另造普通业务输入的替代通道。

## future-known 模拟不是安装版强 S 支持

所有名字带 future controlled native activity 的测试都显式采用受控 known:true 活动端口，仅证明可提供完整可信事件的未来 Host 与当前协调算法的机械接线。

默认 fixture 不提供 subagents catalog，因此 known:false、reason=native-subagent-service-unavailable。唯一覆盖 actual ctx.tools managed nesting 的 future test 在创建 runtime 时给它一个显式 activity override，原 mounted.ports.nativeActivity 仍返回 known:false，测试对此有断言。模拟的 native execute 可以调用 facade.created/observe 提交精确程序对象；模拟的 known:true 只证明机械接线，不代替真实宿主目录遍历。

安装版的实际计数路径是宿主公开的 subagents catalog（listDescendants，或仅有直接子级时的 listChildren 递归）加 live `Agent.status`：目录只在成员变更节点读取（created/disposed/`subagent/catalog`/未知 id 的 start-end/基线/读取发现未知 live 后代），状态翻转零遍历更新计数，能力行只在 seam 实际加载时为 supported。观测不等于准入控制：没有覆盖所有 native wake/inbox 路径的 veto，也不承诺强 S gate。initial-child cwd binding、multi-root write scope、所有 cold/native entrances closure 仍未取得证明。resourceLifecycle.verifyInitialBinding=false，closeEntrypoints 返回 closed:false/nativeColdResumeClosed:false；测试不伪造这些事实，不运行裸 spawn，不移改 child cwd。

同 sid 新旧对象测试验证不同执行 leases 的对象 fence；相同 executionId 的 generation-specific tombstone 验证由真实 [window tests](<../tests/windows.test.mjs>) 另行覆盖。这里不将它扩称为安装版真实 continuable wake/disposal 的端到端证明。

## 复现与本轮结果

环境：Node v24.17.0；来源直接从工作区 source 读取。默认可使用本仓已安装的 SDK peers：

~~~sh
node --test tests/runtime.test.mjs
~~~

明确使用既有安装版 SDK，并同时验证普通输入契约：

~~~sh
DSH_CONTROLS_HOST_ROOT=/absolute/sdk \
  node --test tests/runtime.test.mjs tests/host.test.mjs
./node_modules/.bin/tsc --noEmit --project tsconfig.json
~~~

兼容桥（alpha.1）用例另需第二个显式根 `DSH_CONTROLS_COMPAT_HOST_ROOT`，缺失时带诊断 skip；双根说明与重建命令见[公开验证摘要](<VERIFICATION.md>)。

历史第一轮组合验证为 runtime 22 tests + host 18 tests = 40/40 pass；后续 fail-first 阶段曾为 48 tests / 47 pass。该阶段发现的 resident epoch 与 managed wrapper concludesTurn 缺陷已由主代理修复，并在最新定向回归中通过。历史该次 runtime 文件为 **41 项**；通知、startup 与 receipt-window 定向 **9/9 pass**，late identity / managed parent conclusion / storage fault / caller abort 定向 **4/4 pass**。历史该阶段构建与根级验收记录为：Host/Client 严格编译与客户端 JS/DTS 生成均 exit 0，完整根 suite **288/288 pass、0 fail、0 skip**，其中 Runtime **41**、Host **29**、Client **23**。记录见[最终验证（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)，这些旧阶段数量不冒称当前修复版结果；当前最终验收仍以公开验证说明为准。所有数量只代表机械测试，不代表真实模型工作流、原生全路径强 S、初始 cwd 绑定、真实资源退休或 GUI/profile 安装验收。

## 通知持久化短尾：已接线的定向验证

随后测试文件扩展到 41 项。新增 storage-fault/abort 两项已定向 2/2 跑绿；notification integration / legacy parser / early native receipt 原六项，加上 already-live owner constructor retry、真实 Host factory observer readiness 和 accepted-return→blocked-CAS receipt window 三项，已定向 9/9 跑绿。最终根级结果为 288/288；不将定向数量与旧组合计数相加，详见上节。

通知 journal 使用实际 RuntimeDocument notifications rows（旧文档缺该字段解析成空数组）；受控 FakeHost notify规格明确区分 offline 与 accepted，使用同一真实 memory storages reopen，不创建模型或冷 owner Agent。已验证内容包括 GUI/operator 与 assigned child 的 durable business→pending journal→实际 root notify、无 sender-end 等待、viewer-only 不通知、offline pending 保留同 ID 重投、preStep 不 ACK、精确 owner/message program receipt，以及实际 Host 生成 source 的 steering 消息经 owned user/message 与 flush 才消费。普通文本/相同 messageId 的 user provenance 与模型 ACK wire 请求均不得确认消费；业务 pending/awaitingImplementation 不随通知消费清空。

启动恢复无需额外 owner created event：已经 live 的原 root 直接重投其保留 outbox，不创建/激活冷 Agent。真实 Host 构造期 seeded 控制/业务/runtime documents 经实际 DomainFacility hydrate；observer-ready barrier 在 factory 返回、native receipt listener 安装后才允许 steer，立即提交的 own-source user event 能经过 checkpoint 消费。seed backend 必须遵守当前 SDK KV snapshot 的 object-record 结构，不能沿用 fresh-empty fixture 的 Map 形状；早期 0-steer 失败曾由这个 fixture hydration 问题引起，修正后不再将其误报为 runtime 缺陷。

## 发现与 main 协调

本轮新增 fail-first regression 揭示 assignment 授权 TOCTOU：root 撤销 old-child 的 A assignment 的 CAS 被 gate 暂停时，child 在 queue 外读取旧 A 权限，并排队给 actual grandchild 授 A；撤销落地后仍成功。已经及时报主代理为 P2，由主代理修源。本轮仅维护测试：mutation 在 queued effect/CAS 当前 document 中重新核验父 scope 后该 regression 通过。

主代理另修复 guard 未初始化 cache、late inherited ALS、cold read 注册副作用、旧 policy identity 回写 cache 与 oversized snapshot 表示失败；本文对应 regressions 已跑绿。

短尾 future resident message regression 揭示第二个机械反例：known:true simulator 创建 resident child 后 S=1/running；同一对象的 send_message continuation 只产生 running 事件、没有新的 actual created/activation epoch。修复前 runtime 仍 dispatch 并按新的 callId 计第二 S，得到 nativeCalls=2、S=2、states=[running,unknown]。测试要求无法证明 activation epoch 时在 reservation/dispatch 前明确 unsupported，而不是猜新执行。该 fail-first regression 已及时报主代理；主代理已增加 executor-epoch 缺口的 before-reservation 拒绝，原反例与 full-S no-new-lease/no-dispatch/object-history-cwd 保留回归已跑绿。它不是安装版强 S 可用性的证据（当时安装版 nativeActivity 仍为 known:false）。原生 windows-off send_message 行为也已另测保留。

实际 SDK registry 的 managed child→parent 全上下文回归曾揭示 Host adapter 的 concludesTurn 接收者错误：SDK 方法使用 this 将原 execution 加入 concludingExecutions，Host 将 execution spread 成 signal-controlled clone 后未绑定方法，native concludesTurn=true 被 runtime 转递到 clone，wrapper 最终结果 concludesTurn=undefined。该 P2 已报主代理并由主代理绑定原 execution 方法修复；最新真实 registry 定向回归已通过，确认结论与 source/id/content 保留、原 registry permissions 经过、S 不增。SDK 最终结果会合法 canonical-copy messages；测试在 raw waterfall 验证引用不变，在最终 ToolRuntime 结果验证 id/source/content，不把 SDK 的规范复制误报为 Host 丢失。

通知接线阶段另发现 runtime 漏传 notifyOwner 的 signal，使 Host/FakeHost 抛错且通知一直 pending；已及时反馈，由主代理补 runtime lifetime signal。early committed receipt 先于 accepted 持久化可能丢 ACK 的反例由主代理加入私有 early receipt reconciliation 后跑绿；另有已 return accepted、但 accepted CAS 被共享 effect blocker 挡住的窗口回归，确认此时到达的精确 ACK 最终仍成为 consumed，而非丢失或被 later accepted 覆回。实际 Host steering fixture 捕获并复用 runtime 构造时已打开的真实 domain handle，不为读通知重复打开同域；native session/event 触发真实 Host listener，由受控 sessions.flush checkpoint gate 证明 flush 完成前不 consume。

尚未通过的真实接缝仍是 native wake admission 的强制 gate（目录观测不等于 veto）、真实 initial child cwd、多根写授权与 cold closure/retirement，以及真实模型与 GUI/profile 行为。
