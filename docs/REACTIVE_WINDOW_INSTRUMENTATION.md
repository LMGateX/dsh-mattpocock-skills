# 响应式滑动窗口：状态监控与主代理信息注入

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的 DSH 0.2.1-alpha.1 安装产物，不保留本机路径或旧行号；[宿主固定源码基线](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009ae1756c3afe0ae0cef1faafc290ccc)提供版本来源，不将编译产物路径伪装为公共源码 URL。

> 2026-10-05 owner 澄清：**两个独立滑动窗口，释放一个名额即可补入一个；无票研究不强制 ticket 窗口；仪器必须自动进入 agent 的工作链路。** 后续作用域修正：工作区给策略，主 session 独立实例给账本；新增票进度与待裁决事项见 [session 仪器](<SESSION_INSTRUMENTS.md>)。
> 本页细化[工作区协作控制规格](<WORKSPACE_WORKFLOW_CONTROLS.md>)的事件/消费机制。安装版取证为 DSH 0.2.1-alpha.1；下述是研究与接口设计，未实现、未执行模型工作流或运行时验收。

## 1. 必须形成的闭环

~~~text
真实任务/会话/Jobs/Git 状态事件
  → 校验 ownerSessionId/instanceId、assignment、执行代次与事实来源
  → 按 session 实例提交账本：转换、独立 T/S slot、revision、待通知记录
  → 原生结果/工具结果 + 插件自己的最新状态信息
  → 同一次主代理模型步骤看到两者，做合并/补修/补入等安排
  → 下一次准入再按当前账本检查，继续产生状态变化
~~~

instrument 查询与 UI 都是所属实例账本的投影，不是另外几套计数器；票业务报告保留 agent 来源，程序执行事实保留可信回执来源，不能混成同一种证明。原生结果仍由 DSH 负责交付，仪器补的是当前状态与安排依据，不再发一份 child 回答。
需要同时显示 activeTickets 与 runningSubagents（在跑数是宿主的实时运行状态——live `Agent.status`，读取时为内存投影；目录 `activity` 是驻留不是执行；预留/停止/未知只是执行审计）、各自 used/available、待合并/补修、配置与账本 revision；显示“信息已收到”“票已交付”“执行已释放”“会话/工作树已退休”四种独立事实。

**硬约束：运行状态只由可信程序信号驱动，消息正文没有执行生命周期写权限。** child 的进度、提问、阻塞报告、候选结果和文字“我完成了”只传业务信息。即使宿主把程序事件渲染成“已结束”的通知，代码也不解析这段文字释放名额；原生 source 只用于关联消息与程序回执，不单独作为关闭证据。
程序事件 → 执行状态机/S → 注入；模型显式业务更新 → 票/裁决记录及 T 占位 → 注入；普通业务消息 → 交付原内容＋附快照。仪器不从业务正文猜执行结束，也不替模型裁定业务正确性。

## 2. 取证发现：不能直接把 end 回调当成返回装饰器

| 路径 | 已安装源码事实 | 对设计的影响 |
|---|---|---|
| 宿主 continuable 自然结算通知（subagent-settled） | dispose → resident 删除 → native slot 释放 → 宿主通知 parent → end observer | 此顺序只描述宿主结算通知，不适用于所有 child 发来的消息；async end handler 不被等待 |
| parent 被通知唤醒 | inbox claim → prompt assemble/context 投影 → awaited pre-step → 写入消息并构造请求 | 单靠 context()＋晚到的 end 更新可能在本次唤醒使用旧快照 |
| child 主动 send_message（agent-message） | 指定实际 child 作者，可在运行中汇报、提问、报告阻塞或候选结果，发送后继续运行 | 正常即时交给 parent 并附当前状态；既不算结束，也不等待结算 |
| 前台 one-shot | 原工具在结果/dispose 后返回；one-shot end 可早于 dispose | 原工具完成后的 awaited post-execute 比 end 更适合确认结果与释放 |
| 后台 one-shot Jobs | 任务终结后通知通常提示读 job_output；该读取消费最终结果 | 监控不能为了看结果自行调用 jobs.read/job_output，避免抢走主代理的消费 |

一手依据：结算顺序（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js`）、结果与 progress 构造（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation-messages.js`）、parent pre-step 顺序（SDK 包相对定位：`@deepseek-ai/dsh-agent-loop/lib/index.js`）。
更多路径与精确接口见[返回注入审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)；[独立滑动设计审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)给出计数、恢复与边界条件。[源码快照与指纹（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)保存关键顺序和公开接口，避免宿主升级后沿用漂移行号。

### 2.1 明确的程序信号及其权限

| 已有程序信号/操作 | 可确认的事实 | 不能扩大成的结论 |
|---|---|---|
| agent/status 的 running/idle 字段 | 已安装 AgentLoop 的 driver 状态 | idle 不等于实例销毁、票交付或会话退休；执行 lease 仍须核对代次与已接受待运行工作 |
| agent/disposed，匹配具体 Agent 实例 | 内置 AgentLoop 在 driver 静止、scoped registration unwind 后移出 registry | 只确认这个活跃实例释放，不删除 durable session 或 worktree；自定义 registry/provider 需各自的驱动契约 |
| 对持有句柄的 dispose() 成功完成 | 对该实现契约确认 quiescence/资源释放 | 不能拿 dispose 请求、拒绝或未完成 Promise 冒充成功 |
| subagent/end 的 runId/id/stopReason | 对应 delegation/activation 的程序结果状态 | one-shot 的 end 可早于 dispose，不能统一当成关闭完成；lastAssistantMessage 不参与状态判定 |
| 登记 subagent Task 的 Jobs 终结信号 | 对应 Task 的程序终结状态 | 仍核对 Task 的释放契约；其他 bash jobs 不等于 subagents，错误不自动证明资源释放 |

依据：driver/disposed 事件契约（SDK 包相对定位：`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`）、句柄释放契约（SDK 包相对定位：`@deepseek-ai/dsh-agent/lib/types/index.d.ts`）、end 结构化字段（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts`）。
管理模块把这些可信信号转换为自己的 execution/lease 状态；适配后的 execution-released 是拟设计的内部回执，不冒充已有 DSH 事件。关闭信号按具体实例/执行代次/lease 匹配，一次释放，迟到信号不能关闭续用后的新执行。订阅放在仍存活的管理 scope，不能把唯一关闭监控绑定在已销毁的 child scope。
缺少关闭/释放回执时保持 unknown/reconcile，核对实际运行事实；不回退到正则、关键词、LLM 判断、沉默时长或模型自报状态。

**S 以正在运行的子代理为准（0.4.21 执行审计规则；当前计数改由宿主实时运行状态提供）**：continuable child 的一次 run 结束会让内置 AgentLoop 移出该 Agent 实例（`agent/disposed`），这个实例确实不在运行，因此受管 execution 按原语义发 `released`、释放槽位（`released → running` 会被状态机按回退拒绝，不能原地复活）。durable session 随后被唤醒、实例重建时，插件用同一 `executionId` 走一次新的 reservation（新 generation、新 leaseId；`windows.ts` 明确支持 `released` 执行的重新准入），补 `running` 回执并更新绑定，唤醒的 lane 重新占用 S 槽位。未匹配已知绑定的唤醒仍如实报未登记原生活动。唤醒与重准入仍按上述机制更新执行审计行；投影的 `S.used`（输入框上方进度行里的数）现在读取宿主实时运行状态：成员资格由原生目录在成员变更节点刷新，running 事实取 live `Agent.status`，因此宿主可枚举时等于**当前正在运行的子代理数**（常驻 idle 不计），不可枚举时是明示下界。被计为 running 的 run 无 end、无 idle 转换却消失时，快照给出 `nativeStops` 并唤醒主代理；基线、热重载与重启只归因为 re-establishment。

## 3. 优先路线：现有插件入口实现同一步消费

这里的“同时”首先保证：**主代理消费原生返回结果的同一次模型步骤中，也收到已对齐的窗口状态**。不要求先改成一个新的网络包/原生 inbox 消息格式。

### 3.1 continuable 返回

1. 在 parent 的 inbox inserted/claimed 观察中同步捕获 native messageId、原生 source、已登记的 child/assignment/执行代次；只排入账本处理，原消息不变。
2. 业务消息更新信息可用/候选线索，不写执行状态。S 释放只来自前述程序信号及匹配代次的已确认释放回执；T 可由模型的显式票占位更新独立释放，不另验证业务交付；结算通知关联这些回执并显示已提交状态，不能反过来从消息正文生成回执。缺失映射、异常停机、持久化失败进入 unknown/reconcile。
3. parent 的 awaited agent/pre-step 捕获本次相关水位并有限等待提交。**普通 relay 只等信息/证据状态更新，不等 child 的 end 或释放回执**；只有已识别的宿主结算通知/真实结束事件才等待对应释放处理。否则 child 等 parent 回答、parent 等 child 结束会形成死锁。也不等整个不断增长的实例队列、别的 session 或无关的 child。
4. 调用并尊重其他 pre-step waterfall 的 next/decision。在允许进入的步骤中，使用新的 messages 数组保留全部原消息，追加**一条独立、host/plugin 归属的 instrument 状态消息**，内容取等待后的已提交快照。
5. 快照注明相关原消息、事件与 ledger/config revision；后面更高 revision 覆盖旧仪器快照，但不改写 child 的结果、作者、消息 ID 或其他上下文。

公共 PreStepDecision（SDK 包相对定位：`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`）允许 enter.messages；主循环（SDK 包相对定位：`@deepseek-ai/dsh-agent-loop/lib/index.js`）在构造请求前提交这些消息。这是实际存在的消费 seam，不是幻想一个已经存在的 pre-notice hook。

**特别注意：** context.text 已在 pre-step 前采样。不能在等待之后只更新缓存，然后把早先组装的 context 当作新快照；本路线必须追加新的状态消息。另一种可研究的路线是 awaited assembly transform，只重建插件自己的上下文贡献，不冒充或修改 core context 投影。
end 处理器只排队/提交账本，不能反过来等待 parent 模型步骤或消费 fence；parent 等待会异步让出执行，原生通知调用栈得以继续触发 end，避免循环等待。

### 3.2 前台 one-shot 与后台结果

在原工具成功返回后的 awaited tools/post-execute，提交对应账本转换，再以新的 additionalContexts/允许的派生结果附带窗口状态，保持原工具输出契约与业务数据不变。
后台 one-shot 在 Jobs settled 事实上更新执行状态，并在其原生通知消费时附状态；最终答案仍由主代理正常读取 job_output。读取的 post-execute 再附带当前快照，不重复消费或转发最终答案。
PTC 会转交 additionalContexts（SDK 包相对定位：`@deepseek-ai/dsh-tools/lib/types/ptc.js`）；不依赖模型在 run_code 中主动打印一个额外仪器查询，状态才能被看到。
one-shot end 仅 result-ready 时，不提前宣称释放；dispose/真实任务终结未确认时显示 releasing/unknown。前台请求即使工具配置是 continuable，仍按其实际 one-shot 返回路径处理。

### 3.3 失败时保留业务结果

消费 fence 超时/账本失效时，原生业务结果仍保留；追加 stale/unknown/pending 与诊断，暂停新的受管准入，进入有界核对。不能仅为仪器同步失败就 reject 已 claim 的 parent 输入而丢掉结果；原生用户取消、权限拒绝等其他生命周期语义仍尊重。
claim 不等于成功消费（SDK 包相对定位：`@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts`）。准备消息也不是送达确认；状态通知的确认应基于真实 user/message 提交，取消/拒绝后的未送达注入保留恢复记录。
未关联的旧 child 通知、已终结 job 在重启后不可查询等情况，显式显示证据缺口，不假装当前占用为 0。

## 4. 状态事件与必要消费点

| 事件/阶段 | 账本转换与计数 | 自动给主代理的信息 |
|---|---|---|
| 根 coordinator 建立、恢复、工作区关联核对或首次安排任务 | 解析控制工作区策略、恢复所属 session 实例、核对当前对象 | 该实例 baseline、策略来源/适用性与工具；不因 cwd 或 Agent 变化创建新实例 |
| 模型显式 ticket 准入/交付/取消/暂停/reopen 与占位更新 | 确定性取得/释放/恢复 T；不额外业务审批，独立于 S | 模型提供的票状态/处置、当前空位；一个 T 释放即可补一个 |
| assignment/start、idle/cold wake、one-shot 建立 | 已准入待运行与实际执行分别登记 | S 的 reservations/running、任务角色与空位；接受前重新核验 |
| progress/早期结果 | 更新信息，不假释 S/T | 与原 relay 一起显示仍 running/等待结束，避免新任务超额 |
| 已确认执行结束、失败/停止且释放 | 只终结匹配执行代次的 S，T 按模型显式业务/占位更新 | 原生返回消费时附新占用/空位、仍待合并的票/树 |
| integration/test/review 结果、冲突 | 记录操作事实给模型；不自动判业务交付/失败或生成裁决 | 原结果＋当前快照；模型自行判断是否更新票/事项及 T |
| worktree 闲置、待退休、退休成功/失败 | 资源状态独立于 T/S | 原执行返回或退休工具返回时标明 canRetire/reasons，避免忽略旧树 |
| 模型业务状态定义/更新、事项提出/解决/落实 | 验证实例/写入归属并提交；显式票窗口意图可改 T，不能改 S | GUI/主代理看到模型提供的业务信息；不新增业务规则/审批，保留来源 |
| 设置变更、缩容、关闭、恢复核对、身份丢失 | revision/draining/overcommitted/unknown | 下一可用步骤看到新策略；关键事件给负责 coordinator 发通知 |

无票研究 assignment 的 T applicable=false，S 仍有完整身份/状态；不生成假票，也不清空同实例其他任务的 T。
默认不因为每次 heartbeat 或快照读取唤醒模型。progress 与普通状态合并到 next-step 快照；释放空位、模型已登记的新事项、关键配置变化等可通知负责 coordinator；仪器不扫描阻塞/冲突替模型创建裁决。
有原生返回时借用其已有唤醒，**不再额外发一份返回结果**。无原生返回而需要主代理处理的事件，发送独立 host 状态通知；parent 不在线则保存待通知记录，在合法恢复时注入。
同一 session 实例的 coordinators/受管 children 使用同一窗口真值，事件投递到所属 owner/subscriber；细节按权限过滤，可见子集不产生额外容量。同工作区独立主 session 的账本、事件与通知隔离，旧实例迟到消息不能进入新选中 session 的面板/上下文。

## 5. 注入示例：窗口不是一串日志计数

~~~text
[host workspace-controls | instance session-A | revision 42 | related return child-A/task-A/generation-1]
Tickets: 3/3, available=0
  A awaiting_merge; B working; C admitted
Subagents: 1/2, available=1
  running: child-B -> B
  released: child-A/task-A/generation-1（已确认结束）
Worktrees: A idle + awaiting_merge, retained, canRetire=false
可安排：利用 1 个执行名额合并 A、执行 C 或合法无票研究。
不能因 A 的执行结束就宣称 A 已交付；T 目前仍满。
~~~

A 真正交付后的 revision 43 应显示 tickets=[B,C]、available=1，主代理可立即准入 D，无需等 B/C；D 的 subagent 仍要取得 S。
这只是可读投影示例，不是新原生消息 source/schema 定义。数字是对应 revision 的历史事实，不是永久令牌；准入工具按最新状态原子判断。
提供业务记录、当前机械窗口快照及已启用机制的最小协议引导（准入、T/S 区分、逐项补入、技术诊断）；下一项工作的业务次序由主代理依据 Skill/任务约定决定，不新增业务裁判或催生裁决。提示词候选/项目调优和关闭处理见 [引导设计](<INSTRUMENT_GUIDANCE.md>)。

## 6. 一份账本、revision 与可靠交付

模块接口收敛为 commitReceipt/evidence、admit/release、snapshot、ackInstrumentNote；UI、工具、prompt、返回消费不自行算另一套窗口。
转换按 instrumentInstanceId 序列化；控制工作区关联、票/执行身份、lease/代次、配置 revision、转换去重键与待通知记录在同一逻辑提交中保存。原子文件/各 domain 写链不等于已有跨 domain/跨进程事务，具体存储实现须验证。
公开缓存只发布已提交 revision；捕获有限水位，parent fence 得到 latest-at-fence，不承诺后续事件永远不再发生。回调重排、重试和旧结果不能释放新 lease；冷续聊的 childId 不够区分代次。
已有库的顺序保障之外，还需维护插件自己的处理水位与关联。未知持久化/执行状态不算空位；恢复从会话事实、真实任务/租约和记录核对，不因重启就清空计数。
待通知队列只保存仪器状态/状态证据，不重放原生 child 回答；准备、inbox 接收、user/message 提交与模型消费是不同阶段。没有跨日志原子确认时不宣称 exactly-once。
同一 parent/step 只注入一条合并后的新快照；保留关键释放/处置证据，普通度量合并。仪器消息消费本身不再产生新状态事件，避免反馈风暴。

## 7. 当前可复用与仍需验证的 seam

- **可复用的公开入口：** inbox 观测、awaited parent pre-step、tools/post-execute、additionalContexts/PTC、动态 prompt context、agent/Jobs 事实与插件存储。
- **插件消费级第一路线：**原生结果不改，有限水位提交后在同一个 parent 模型步骤追加状态；不把“end 比 notice 晚”误判成插件永远不能自动注入。
- **更强的可选宿主 seam：**若必须保证原生 inbox 入队之前就携带 typed release proof、runId 与窗口附注，可增加 awaited host pre-parent-delivery/decorate。当前没有该契约，不是已有 pre-step 路线的前置条件。
- **独立的强准入问题：**parent 消费 fence 不拦截所有 start/wake；受管 wrapper/操作必须在接受前核验，原生/人类/内部服务未覆盖的路径明确说明。true running 的任务释放、初次 child cwd、关闭所有退休资源的恢复入口仍需验证或宿主支持。

Host note 的消息容器由插件生成，但其中业务记录仍是模型/用户提交的信息，保留作者、来源与“已登记”的性质；只有程序观测、提交 revision 和实际计数等才是插件确认的机械事实。容器来源不能把业务判断升级成宿主证明，也不是用户新授权。现有 createUserMessage（SDK 包相对定位：`@deepseek-ai/dsh-llm/lib/types/message.d.ts`）可创建新消息，MessageSourceMap（SDK 包相对定位：`@deepseek-ai/dsh-llm/lib/types/message.d.ts`）允许 producer 自己声明 kind；未来实现必须为本插件声明独立来源（例如 reactive-windows 是提议名称，不是现有原生 kind），使用合法 snapshot/notice 结构。禁止冒充 user/agent-message/core runtime-context，修改借来的结果对象、绕过正常 sandbox/权限或改写 cwd/header。

## 8. 无模型验收：检查真正的模型输入

- 仅注入“完成/已关闭”的业务文字或伪装格式化通知，执行状态与 S 不变；反之，真正的程序关闭/释放信号即使没有 closing message，也正确更新窗口并注入主代理。迟到/重复信号不释放新的 lease。
- A 的确认释放触发 S 空位更新，原生返回与同一步 host 快照进入捕获到的模型请求；不是只断言 dashboard/store 变了。
- A 在运行中汇报、提问、报告阻塞/候选结果时，同步注入当前状态，但不等其结束、不自动释放 S；即使文字写“完成”也不当结束凭据。主代理能及时回答，不产生相互等待。真正执行结束后再更新；T 按模型显式占位/处置更新，不另加业务判定，D 的补入不等 B/C。
- 人为让 parent 在 end commit 前 claim/assemble：fence 等待有限水位后追加新快照，证明不是复用已采样的旧 context。
- 前台 one-shot、后台 Jobs 通知、唯一 job_output 消费与 PTC 额外上下文分别验证；监控不偷读最终结果。
- 同实例两个 coordinator 同时抢空位只有一个成功；同工作区独立主 session 的窗口/业务状态互不混用。验证同 child 多轮、迟到旧代次、重复事件、配置缩容/reopen/无票研究保持真实计数。
- 票状态字典/结构化进度与裁决提交进入所属实例的同一步快照；模型显式票占位更新可释放 T，但不写执行状态/S；agent 可记录对用户答复的理解，保留真实来源；切换 session 不错投迟到状态。
- parent 忙/idle/不在线、窗口无变化、heartbeat 高频、abort/持久化失败、拒绝后未提交、崩溃/恢复都不制造死锁、结果重复或空位假象。
- 未支持的强约束清晰标注；退休安全与 Git 元数据授权依旧成立，不能因自动注入而推断它们已实现。

本次固化的是源码事实、消费机制与待验证契约，不是已运行的插件功能。
