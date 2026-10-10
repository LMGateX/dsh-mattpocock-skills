# 协作控制：工作区配置与 session 仪器

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的 DSH 0.2.1-alpha.1 安装产物，不保留本机路径或旧行号；[宿主固定源码基线](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009ae1756c3afe0ae0cef1faafc290ccc)提供版本来源，不将编译产物路径伪装为公共源码 URL。

> 2026-10-05 owner 补充需求；插件 0.3.0，宿主取证基线 DSH 0.2.1-alpha.1。
> **状态：R1–R7 产品要求与已认可配置页方向已记录；具体机制仍为设计草案，尚未实现。** 本次不修改运行中的 GUI/profile，不注册新工具、不发布。
> 2026-10-06 后续已接受分阶段实施范围：配置/owner-session 归属核心已实现但未挂载；具体接口与机械验收见[第一阶段记录](<CONTROLS_CORE.md>)。第二阶段[业务记录核心](<INSTRUMENT_RECORDS.md>)已实现并验证；R1–R7 的工具、窗口、资源、自动消费与客户端接入仍待实施。
> 本页是这些新增要求的唯一规格入口；[worktree 总研究](<WORKTREE_ISOLATION.md>)与[固定树续用专题](<CONTINUABLE_WORKSPACES.md>)仍负责底层可行性与限制。

## 1. 规格要求与职责变化

| 编号 | 必须具备的能力 | 交付时应能观察到 |
|---|---|---|
| R1 | DSH **插件页面**可开关 worktree 绑定，并指定哪些工作区启用/禁用 | 全局策略、工作区覆盖、生效结果与关闭原因可见 |
| R2 | 工作树生命周期仪器，让 agent 知道使用中、空闲、待处理、待合并与退休情况 | agent 可查询状态、识别可退休资源、申请安全退休，减少遗留目录 |
| R3 | 独立的 tickets / running subagents **滑动窗口**，各自逐项释放、逐项补入；无票阶段不强制 T | T 按模型显式票占位/处置更新，S 按真实程序释放；主代理看到空位，不等待整批完成 |
| R4 | 仪器策略按工作区配置，不同工作区可分别启用/禁用并有不同窗口容量 | 工作区提供策略，session 持有独立实例；配置继承不等于状态共享 |
| R5 | Session 内的 tickets 进度仪器，状态种类/含义由 agent 按任务提供 | 摘要与详情按声明状态动态计数；部分完成等状态原样保留，不套固定分类或预设阶段；业务报告与控制事实区分 |
| R6 | Session 内的待裁决事项仪器 | 新问题不会被对话淹没；待裁决、已裁决待落实及关联阻塞可见 |
| R7 | 所有仪器绑定持久主 session，不同 session 拥有不同实例 | 同工作区/不同 branch 的票进度、事项、T/S 占用与资源视图不串用；受管 child 归属主实例 |

这里的“仪器”是有持久状态、可供 agent 调用的控制/查询工具，不只是提示词或浏览器仪表盘。
新增范围是**可选、按工作区配置、按主 session 实例化的协作管理扩展**：配置解析、实例账本、进度/裁决记录、受控任务准入与状态查询。既有 Skill provider 保持薄分发；不改 vendor，不替换 issue tracker，不自动拆票，也不重建完整票图/Git 调度器。
仪器接收模型结构化业务更新与真实程序事件，并自动注入所属主代理；不能只提供悬空面板。规格进一步明确：双窗口是显式启用/可关闭的强制机制，必须注入必要的 agent 使用/调度引导；worktree 也有轻量生命周期引导。“不做业务裁判”不是“完全无行为引导”，职责和未验证提示词的处理见 [引导设计](<INSTRUMENT_GUIDANCE.md>)。规格明确：何时提出裁决、何时交付/暂停/取消由 Skills、用户约定、文档与模型判断，仪器记录/呈现，不增加业务标准或审批。归属、revision、容量、幂等性和程序释放是机械约束，不是业务正确性判定。

## 2. 配置：全局默认＋工作区覆盖

### 2.1 插件页面

页面至少包含：

- Skills 分发独立于协作管理总开关；区分 DSH 原生插件启停、管理总开关与按工作区功能开关。
- 全局默认的 **worktree 绑定 / 生命周期仪器 / 双窗口仪器**，以及新增 tickets 进度/待裁决仪器的配置入口；新增开关/显示偏好的具体 schema 与默认值待定。
- 工作区列表与选择：稳定 ID、可读名称、规范化目录；每组支持继承、显式开、显式关。
- 双窗口的 ticketWindowSize 与 runningSubagentLimit，允许各工作区不同；这是该工作区各主 session 实例采用的容量，不是跨 session 合计预算。容量是正整数，关闭用布尔开关而不是 0 的隐含语义。
- 显示生效值、覆盖来源、配置 revision，以及 enabled / disabled / draining / unsupported 等实际状态。位置显示默认方向已认可；新仪器功能启用初值、T/S 数值默认与具体 schema 仍待定，不能混称全部默认未确认。
- 同页可选择 session 查看生命周期、窗口、票进度与裁决状态；跨 session 工作区汇总仅为明确标注的只读视图，不作为单实例准入真值。查看事实不要求先开启新资源分配，界面与 agent 查询使用同一后端数据源。
- 以工作区为策略主视图；采用草稿、修改影响预览、显式保存与 revision 冲突检测。显示“已保存配置”和“运行已收敛”的区别；配置意图、生效策略和运行账本分开。
- 规格要求各显示方式有独立开关：顶部紧凑入口、输入区摘要、右侧详情、session 列表提醒与插件附加对话呈现；沿用继承/覆盖，关闭显示不停止仪器记账或 agent 自动消费。默认组合与未支持位置限制见 [显示配置](<SESSION_INSTRUMENT_PLACEMENT.md>)。

扩展总开关是新受管任务的硬门。其开启后，各功能按“工作区显式字段 → 全局默认字段 → 安全初值”逐字段解析；恢复继承是删除该覆盖，不是另写一个相同值。

两级总闸（当前实现）：

- `extensionEnabled` 是全局唯一总闸（「协作管理总闸（全局）」），对所有工作区生效，不受「配置编辑范围」影响。
- 每个工作区另有独立总闸 `workspace.enabled`（「本工作区总闸」），安全初值**关闭**，同样支持继承/显式开/显式关。
- 功能生效条件是 `extensionEnabled && workspaceEnabled && feature.enabled`；总闸未开时原因分别报 `extension-disabled`（全局总闸已关闭）与 `workspace-disabled`（本工作区总闸已关闭）。
- 技能分发是独立叶子 `skills.enabled`（「本工作区技能分发」），安全初值**开启**，按会话 cwd 解析的工作区判定，不经过协作总闸；策略不可读时保持开启（fail-open）。保存策略后宿主使技能目录缓存失效，开关变更无需重启。
- 输入区摘要在任一级总闸未开时显示「协作管理未生效：全局总闸已关闭 / 本工作区总闸已关闭」，不把已保存数字伪装成实时事实。
初始安装默认不启用自动管理；具体默认容量未定。下面**只是配置语义示例，不是当前可用的 cordis 配置**：

~~~yaml
extensionEnabled: true    # 全局总闸；示例假定操作者已显式开启
workspaceDefaults:
  workspace: { enabled: false }   # 本工作区总闸的安全初值：关闭
  skills: { enabled: true }       # 技能分发安全初值：开启
  binding: { enabled: false }
  lifecycle: { enabled: false }
  windows: { enabled: false, ticketWindowSize: 2, runningSubagentLimit: 2 }
workspaceOverrides:
  <workspace-A-id>:
    binding: { enabled: true }
    lifecycle: { enabled: true }
    windows: { enabled: true, ticketWindowSize: 3, runningSubagentLimit: 2 }
  <workspace-B-id>:
    binding: { enabled: false }
    lifecycle: { enabled: true }
    windows: { enabled: true, ticketWindowSize: 1, runningSubagentLimit: 1 }
~~~

关闭绑定可以继续观察已登记的树；窗口也可用于无专属 worktree 的研究/评审。窗口限额本身不提供文件隔离：关闭绑定后，并行 writer 必须已有合法的独立树，否则受管路径明确拒绝或按明确策略串行执行。
agent 可读生效配置，但不能为绕过满窗口而修改容量、关闭策略或伪造 owner 授权。

### 2.2 工作区身份不能随子工作树漂移

策略以 DSH 的稳定 WorkspaceId 为键，名称与路径只用于显示/核验；未知、注销、目录缺失或身份无法核验的工作区不静默套用另一个工作区的开启策略。
每个受管 workflow、ticket assignment、child 与 worktree 关联记录持久绑定 **controlWorkspaceId**、**ownerSessionId / instrumentInstanceId**：前者给策略，后者给状态归属与权限作用域。
子代理移到 linked worktree 后，保持原控制工作区与主 session 实例，不因 cwd 改变取得新窗口容量。
这个关联存在插件账本，不伪造 DSH workspace 成员，也不向冻结的 session header 塞入未定义字段；原生 workspace.attachSession 仍要求目录身份匹配。

同工作区独立主 session 分别拥有仪器实例与 T/S 账本；同一实例内的 workflows/coordinators/受管 descendants 共用其窗口，不因重建 child 或 Agent 取得额外容量。**旧草案的“工作区多个父 session 共用业务账本/配额”被本轮 session 绑定要求替换。**
不同实例操作同一真实 worktree 或 Git common-dir/integration ref 时，仍执行全资源引用/租约核验与 writer/integration 排斥；状态隔离不等于文件隔离。未来 workspace/host 总资源预算若需要，作为独立上层限制另行设计，不默认混入 session 仪器。
稳定实例恢复、workflow 分组、fork/交接与同票引用规则见 [session 作用域](<SESSION_INSTRUMENTS.md>)。

### 2.3 热修改的收敛规则

- 关闭新绑定不移动、删除已有树，不打断已接受的续用任务；禁止把已受管任务改成未登记任务来逃避约束。
- 关闭功能不再对新工作施加对应受管准入和行为要求；不强杀已接受执行、删除账本或资源。旧对象交接/必要技术收尾可短暂 draining，但不能让已关闭的业务窗口引导无限继续；具体迁移待验证，见 [关闭语义](<INSTRUMENT_GUIDANCE.md>)。其他宿主权限/原生限额仍独立。
- 缩小 T/S 立即收紧后续准入；已有占用安全收敛到新上限，不取消原票或强杀执行。增大容量后新空位可立即使用，无需等任何一批完成。
- 配置 revision 可查，工作区策略变化影响继承结果而不合并账本。配置修改使用已授权配置入口，可由用户直接操作或由其明确委托、具有现有宿主权限的 agent 执行；仪器不增加“必须用户亲自操作”的审批层。业务状态工具不能隐式改配置，未授权模型不得为绕过窗口自行提额或停用。
- 进度/裁决的隐藏或已读只改变显示，不消除业务义务；绑定仍启用时必须保留安全记账，不能因仪器显示关闭而丢失资源所有权/租约。

## 3. 仪器一：worktree 生命周期

### 3.1 分开记录三个轴

单个 active/done 布尔值不够：一个树可以“没有 worker 在跑”但仍“待合并”，也可以“已集成”但仍保留补修窗口。

| 轴 | 建议状态 | 事实来源/含义 |
|---|---|---|
| 执行 | reserved / active / idle / unknown | 建立中的执行、真实活跃执行、已确认无活跃租约、观测失效；历史 child 数不算当前执行 |
| 工作流 | agent 按任务声明的业务状态 | 模型提交票/候选/处置/阻塞信息，可带操作来源；仪器不自定集成/验证流程，空闲不自动更新业务状态 |
| 资源 | retained / retire_requested / retired / cleanup_failed / quarantined | 保留、请求关闭续用、退休成功、清理失败、身份/所有权不确定；另记录目录是否存在 |

canRetire 是**计算结果**，带检查时间、ledger revision 和 reasons；不是 agent 能随便设置的状态。
记录需要可靠的实例/资源身份、来源归属、路径、owned/borrowed 和适用的引用/租约；能从宿主取得的技术字段由宿主/插件填充，不要求模型重复填表。workflow/assignment 关联按实际存在记录，ticketRef 可空，childId/jobId 分型。Git common-dir 适用于 Git 资源；角色、branch/base/candidate/integration SHA、验证引用与业务续用说明按任务需要提供，不是所有状态更新的必填证据包。

### 3.2 agent 需要的工具行为

工具名称待定；外部能力收敛为“查询 → 提交有依据的状态变化/待处理标记 → 请求退休 → 经校验执行退休”。
查询首先核验实例归属，再按工作流、票与状态过滤；跨 session 工作区汇总需明确选择与权限，返回谁在使用、闲置多久、待处理原因、等待的合并/验证、可否退休及拒绝原因。
程序观测更新 active/idle；agent 按任务判断更新业务状态、候选与处置，可附合并/验证引用。仪器不否决模型的业务交付判断；但业务标签不改真实执行状态，不构成目录删除授权或技术释放证明。
长时间无 heartbeat 只触发 unknown/reconcile，不自行推导空闲、交付或可删除。恢复后以真实进程/会话/租约与 Git 现场核对，避免猜测释放名额。

### 3.3 退休不是单次返回的回调

安全退休至少同时检查：

1. 本插件拥有该树（owned）；借用的已有树 borrowed 只可关闭绑定，不自动删目录/分支。
2. 模型按任务约定明确请求资源处置及保留/续用安排；仪器记录其声明，不另要求统一的集成/验证/审批流程。实际破坏性操作仍受现有权限与下面的资源保护约束。
3. 无执行者、无已接受未处理消息、无仍可使用该树的租约；所有相关恢复/发送入口已关闭该绑定。
4. 核验路径/Git 身份、实际脏/未跟踪/忽略文件及 writer 现场；文件的业务保留价值与处置方案由模型按约定决定，仪器报告现场并保护尚无明确处置的内容，不建立自己的价值分类器。不因空闲自动丢弃数据；明确的破坏性操作仍走准确目标与现有权限。
5. 在资源锁内再核验，执行受授权、准确限定目标的清理；失败保留现场并标记 cleanup_failed，可幂等重试。

关闭绑定、child 首轮返回、Agent dispose、子代理池 slot 释放、票窗口滑动都不是自动删树信号。
默认遵守现有 implement-spec 全流程收尾清理；提前退休必须显式关闭原树的续用约定并采用已授权策略。票已经交付也不意味着原现场不再需要。
若通用 send_message 仍可绕过退休标记冷恢复，就**保留树**或先补齐宿主关闭检查，不能只写一个本插件自己会看的 tombstone 然后删除 cwd。
初次创建晚期失败可能留下可恢复 header；恢复记录、资源核对与 quarantine 必须先于不确定的回滚删除，详见[续用生命周期](<CONTINUABLE_WORKSPACES.md>)。
仪器应突出可退休、待处理、清理失败与长期保留列表，让 agent 有依据做回收，而不是盲扫目录批量删除。

## 4. 仪器二：两个独立的滑动窗口

> 已接受规格修正旧解释：**不是按批次封存、全部完成才推进。每释放一个 slot，就可使用一个 slot。** 旧 cohort/barrier 方案作废。

### 4.1 票窗口：模型决定业务处置，仪器逐票维护名额

容量 T 约束本 session 实例已准入且仍持有 ticket lease 的票。每票独立占位，名额取得/释放/恢复的机械计数与业务状态词汇分开：

- 模型按 Skill、用户约定和文档判断要处理哪张票，再提交准入；仪器仅核验归属、幂等性和当前容量，不另判依赖是否业务就绪。已准入但尚未执行的票也计数。
- 模型按任务语义判断完成/交付、暂停、取消或恢复，并明确更新该票状态与窗口占位意图。仪器提交更新后立即释放/恢复相应名额，不等整批完成，不另加证明包或用户审批。
- 状态更新可同时携带窗口效果，或引用模型显式定义的状态效果；具体字段待定。仅改自由 label、普通聊天、child 返回或测试通过不让仪器猜测业务处置。
- 是否暂停占位、部分完成是否仍持有名额由模型依据任务约定决定；仪器不把 blocked/awaiting_merge 等词固定映射成持有/释放，也不因困难或超时替模型处置。
- 同票的多个角色/执行不重复取得 T；同实例 workflows/coordinators/受管 children 共用 T，独立主 session 不混用。重复释放无额外收益，旧代次不能释放恢复后的 lease。
- 恢复占位按当前 T 重新准入；满额/热缩容只处理容量约束，不擅自决定修复优先级、废弃旧票或制造业务裁决。

**旧 integrated_verified、cancelled_approved、parked/deferred_approved gate 建议已取消。** Matt Pocock/用户/文档可以要求集成、测试、批准处置等步骤，由模型判断和执行；仪器不是业务正确性分析器，也不是 tracker 的裁判或替代品。可保存模型提供的处置类型/可选理由/引用，GUI 按声明呈现，不把取消、暂停隐式当成交付。T 的可靠性指确定性执行已登记占位意图，不宣称插件证明票真的完成。

### 4.2 subagents 窗口：执行结束就可补入下一项执行

容量 S 约束本 session 实例已准入待运行与正在执行/停止中的 subagent 执行，覆盖受管 continuable、one-shot 及其登记的后台 subagent Jobs；不是累计 childId、保留 worktree 或整个 residency 数量。其他 bash/测试 jobs 可占工作树资源，不能全部冒充 running subagents。
快照区分 reserved/scheduled、running、stopping、idle，slotUsed 包含为防并发超额而保留的执行名额；历史可续聊 child 已真实 idle 且没有已接受的执行不占位，不要求永远等待其会话被销毁。

- 任务取得执行名额后才能 start/wake；一个执行真实结束/安全中止并确认释放后，该名额立即可给另一项执行。
- 向运行 child 发送同任务补充不重复计数；向 idle/cold child 续派任务必须重新经过准入，沿用历史与 cwd，不重建工作树。
- 运行状态、关闭与 S 释放只接受可信程序事件/完成回执，核对具体实例、执行代次与 lease；不解析业务消息或格式化通知的正文，也不让 LLM 给出的状态参与执行状态机。child 消息正常即时消费并附快照，不等待 end；关闭活跃实例也不等于永久退休 continuable 会话。
- 宿主现有 maxActiveSubagents 仍独立约束 continuable resident pool，不用它冒充本项目的 session 实例 running 窗口。

T 与 S 独立：票待合并时可不占执行名额；同票需要 merger/修复时占 S、不新增 T。执行名额可用于新票、当前票收尾或无票研究，具体选择由主代理结合依赖、优先级和当前快照作出。

### 4.3 无 tickets 阶段：不强制票窗口

预先研究、探索、澄清等没有 ticket 的任务使用 ticketRef=null、明确 task/phase 身份：票窗口显示 applicable=false（no-ticket-assignment），不创建假票、不保留 T slot，但仍执行 S、工作区配置和工作树生命周期管理。
适用性按 assignment 判断，不用一个“研究模式”全局清空已有票：另一项任务正在处理的票仍计 T；为某张票开展的研究保留该票关联，不新增票 slot。正式注册票后才对其实施票准入。
快照中始终列出无票 subagent 的 task/role，主代理不会只看 tickets 而漏掉它们。

### 4.4 例子：T=3、S=2

~~~text
处理中 tickets = [A, B, C]，执行 A、B（S 满）
A 的程序执行确认释放：释放 1 个 S；模型尚未更新 A 的 T 占位，T 仍满
主代理可用 S 执行 merger(A)、C 或有正当范围的无票研究
模型按任务约定更新 A 的交付/处置并明确释放 T：tickets 变为 [B, C]
此时可准入 D → tickets 变为 [B, C, D]，不等 B/C 完成
D 若需要 subagent，仍须等待/取得 S；不会只因 T 有空位就超额启动
研究阶段没有票：T 不适用，仍按 S 逐个释放、逐个补入
~~~

### 4.5 稳定安排与死锁保护

仪器自动提供 activeTickets、runningSubagents（读取时向宿主查询的在跑数）与预留执行审计、各自容量/占用/可用、待合并/待处理、角色与下一步候选；主代理不必凭旧对话手算窗口。
主代理依据 Skill/文档和当前快照决定新工作、合并或补修次序；仪器不建立自己的业务优先级/依赖调度。S=1 可以串行安排；空位不要求填满，不恢复整批屏障。
root coordinator＋leaf workers 优先；嵌套父子等待只有在真实停止/挂起父执行并可重获准入时才可释放父 slot，否则明确显示 hold/wait 状态，不能改一个计数骗出空间。
模型明确 reopen/恢复占位后按当前容量处理，是否优先及如何安排由模型决定。实际占用超过缩小后的 T/S 显示 overcommitted，暂停新准入直到有空位，不强杀、不抹账、不因业务判断自动 reopen。

## 5. 响应式接入：状态必须进入主代理的工作链路

新增 tickets 进度与待裁决事项同样自动进入所属 session 的 GUI/主代理快照。自由业务更新、模型处置与程序执行事实的区分、持久裁决状态、用户输入授权及固定指示器见 [session 仪器设计](<SESSION_INSTRUMENTS.md>)。具体显示布局未定；安装版原生席位与缺失位置的静态核验见 [显示位置研究](<SESSION_INSTRUMENT_PLACEMENT.md>)，不代表已实现/验证浏览器效果。

**不能只给 agent 一个可能想不起来查询的工具。** 所有仪器共用所属 session 实例的账本；真实程序/操作事实与 agent 结构化业务报告保留来源区别，所有查询/UI、主代理状态注入投影同一已提交 revision。

~~~text
程序事实 / 有归属的结构化业务报告 → 提交所属实例的票/裁决/执行/资源转换与 revision
        → 原生结果或工具结果 + 插件自己的状态消息
        → 主代理同一步看到处理中的票、执行清单与空位，安排下一项工作
        → 下一次准入原子核验当前配置/账本
~~~

子代理返回时既保留原生业务结果，也自动注入 T/S 的变化、尚未交付的票、待合并/待退休的树与下一步可用名额。没有 ticket 的研究任务明确显示 T 不适用，而不是让 agent猜测。
现有 awaited parent agent/pre-step 可作为**消费 fence**：等待本次相关账本水位后，保留原消息并在新 messages 数组追加 host 归属的最新状态。前台 one-shot/job_output 可用 awaited tools/post-execute/additionalContexts。这些是实际可研究的插件入口，不用先幻想新的原生通知钩子。
但原生 continuable 的 parent 通知先于 end observer，而 context() 又先于 pre-step 采样；不能仅在 end 回调更新缓存就声称本次返回带了新窗口。处理顺序、进度与结束区别、父代理恢复、降级和无重复投递详见 [响应式消费设计](<REACTIVE_WINDOW_INSTRUMENTATION.md>)。

票状态字典/进度报告、事项提出/裁决/落实、票交付/阻塞/暂停/取消/reopen、执行 start/wake/end、工作树待合并/退休、配置变化和恢复都产生所属实例的状态更新；借用已有结果唤醒，普通更新合并到下一可用步骤，必要决策可通知负责 coordinator，避免 heartbeat/读取本身触发模型循环。
消费 fence 不是执行准入 gate。强约束仍要求受管 start、idle/cold wake、新 task assignment 和资源使用前检查；未覆盖的原生/人类/内部服务路径明确标记 cooperative/unsupported，而不是静默宣传全面 enforced。
reserve/release、身份、代次、配置、revision 与待通知状态须序列化和持久恢复；迟到旧事件不能释放新执行，未知不能当空位。fence 超时保留业务结果并显示 stale/unknown，暂停新受管准入，不为了仪器失效丢掉结果。
已有 fixed-cwd 续用可复用，初次 child cwd seam、合法 Git 管理授权与关闭退休资源的恢复入口仍独立解决。插件事实注入不是用户新授权，不改借来的结果/作者/cwd，不绕过正常 sandbox。

## 6. 宿主取证、设计选择与验收

设置/工作区接口见[安装版接口审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)及[原取证快照（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)；已纠正的窗口语义见[滑动审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)，事件顺序与消费入口见[返回注入取证（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)。旧批次审阅已标为 superseded，不再作规范。
本文的全局配置作用域是当前插件所在 host/profile；业务账本/窗口归属主 session 实例。不声称跨 DSH profile 或跨进程自动同步。
当前 [Skill 入口](<../src/index.ts>)保持通道/provider独立，并在宿主服务齐备时惰性挂载可选控制层。设置、账本、原生客户端、受管路由及实际消费已由 TypeScript 实现；完整原生 S/cwd/冷恢复关闭/多根权限缺口仍明确未支持。当前能力与收尾证据见[随包说明](<../CONTROLS.md>)和[验证记录（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)，不能把策略 configured 解释为全面 enforced。
安装版可复用的页面入口是第三方 bundle 的 plugins.bundle.config / plugins.row.config（SDK 包相对定位：`@deepseek-ai/dsh-client-ui-plugin-manager/lib/types/client/slot-contract.d.ts`），不是 Official 分组的 plugins.item。现有 Config/volatile 表单发现（SDK 包相对定位：`@deepseek-ai/dsh-settings/lib/index.js`）可用于持久、带 revision 的配置编辑，不需套用旧文档的 installSection；工作区选择、生效来源和生命周期表格需要本项目的领域视图。
具体 slots、schema、六个专有工具与资源技术接口见实施文档；T/S 数值保持未配置而非猜默认。裁决/交付/暂停/取消的业务标准明确不由仪器制定；工作区策略主视图/显式保存、session 独立实例、进度/待裁决指示、逐项滑动、无票任务不占 T 与自动消费均已澄清。历史批次与工作区共享账本建议不再作为当前规则。

未来无模型验收必须覆盖：

| 覆盖 | 必须通过的断言 |
|---|---|
| R1/R4 配置 | 插件页面读写与持久化；继承/显式关闭/恢复继承；两个工作区不同策略；并发旧 revision 拒写；子树身份不绕过控制工作区 |
| R2 生命周期 | 模型判断业务收尾，仪器不加统一集成 gate；活跃/待运行租约、未关闭续用/跨实例引用仍不得误删；owned/borrowed、脏树/价值文件、晚期失败残留与准确目标的技术保护 |
| R3 票滑动 | 模型显式释放 A 的 T 后即可准入 D；无需统一集成证明或额外审批，无整批屏障；自由 label 不被猜测；T/S 独立、重复/迟到/恢复幂等且容量正确 |
| R3 执行滑动 | 一个执行结束即可补入另一个；T≠S/S=1；idle durable child 不占运行名额；progress 不提前释放；cold wake 准入；one-shot/continuable 都覆盖 |
| 主代理自动消费 | 子代理原生结果与提交后的 T/S/票/树状态进入同一次模型步骤；progress 不提前释放；end/assembly 竞态、PTC、Jobs 消费、timeout/degraded 不丢业务结果 |
| R7 隔离与绕行 | 同工作区独立主 session 状态/窗口互不混用；同实例 descendants 共用窗口；冷恢复保持实例；同资源锁仍有效；通用 start/send_message/人类续聊不能绕过已声明强约束，无法保证时准确降为未支持 |
| R5/R6 业务仪器 | 自由状态与模型业务更新可用；无 blocker/测试失败自动升级裁决、无内建业务审批；记录真实来源，已读≠业务解决；跨 session/旧 revision 隔离，见 [完整矩阵](<SESSION_INSTRUMENTS.md#7-未来无模型验收>) |
| 恢复与安全 | reserve/dispatch/settle/release/retire 的并发、崩溃与幂等重试；热缩容；配置改变不会迁移旧 cwd、丢票、误删现场或偷偷扩大权限 |

本节最初记录需求/取证阶段的未来矩阵。当前插件实现已进行仓库级机械验证和 SDK/存储/Git 探针；详细已测/未支持分类见[收尾验证记录（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)。它们不等于真实模型、部署后的 DOM/viewport、owner profile 或 release 验收；全局 DSH/profile/GUI 修改仍未授权。
