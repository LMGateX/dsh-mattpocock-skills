# 协作仪器：设置、派发、当前状态与历史清理

## 当前提供什么

协作仪器是不可变 Skills 分发之外的可选扩展。当前源码/候选包版本为 0.9.0：参考 T/S、工作树绑定与创建观测、持久关系登记、有界当前投影、主动历史查询、显式历史副本与源旧历史清理、native-observed 执行事实、dispose 后迟到 end 的覆盖处理，以及 Host/Client 接口均已实现。0.9.0 的默认模型面仍是七个固定工具 + 条件 `mattpocock_audit`；`mattpocock_execute` 已移除，`mattpocock_delegate` 默认不注册，只有 profile 显式设置 `delegate: true` 时才作为可选第八项启用。0.9.0 将执行事实的 `initialCwd` 迁移为来源明确的 `headerCwd`，不再由 header 路径相等生成实际初始目录/工作树关联；delegate 的结果分别报告 creation、binding、assignment。没有新增模型工具、Remote 方法或存储域。包内容、安装状态和当前进程实际启用仍是三件事，安装不会自动开启管理或改写启动请求；本轮未安装本机 DSH/Profile/GUI。

> **2026-11-04 事实边界（0.9.0 源码实施）：** `headerCwd` 只是 child header 的来源值，不证明实际初始目录、当前目录或目录使用。已接受/不确定的 delegate 操作必须保留已有 child，不应改用 native 重建；必要时对同一真实 child 显式 `mattpocock_assign`。`recording: failed` 不再单独表示“没有创建”，而要与 `creation`/`binding`/`assignment` 分项读取。迟到 end 使用已保存的 owner/session/run 事实处理，旧 run 不会覆盖新 run；无法归属时在既有 health 明示覆盖缺口。详见[事实边界与恢复设计](<docs/INSTRUMENT_FACT_BOUNDARIES.md>)。

**业务判断由 agent 按 Skills、用户约定和任务文档作出。** 仪器记录进度、待办、真实绑定和执行事实，不另设统一完成标准、容量审批或工作树处置审批。主代理自己用已授权的 Git/Shell 工具准备、合并和清理工作树。

| 能力 | 仓库实现 | 使用时要看什么 |
|---|---|---|
| 设置与会话仪器 | 全局默认、工作区覆盖、owner 归属、受授票范围、原生客户端入口 | 管理默认关闭；保存设置不等于安装启用 |
| T/S | 占用、参考值、超额、统计覆盖程度；T 与 S 独立，S 的在跑数是宿主的实时运行状态（live Agent.status，idle 常驻不计），读取为内存投影，并按 `S.depth` 给出 direct/deeper/unknown 深度结构 | S 枚举不完整或成员资格不可读时是明示下界（总数未知）；超限或未知不拒绝派发，不另要求批准；被计为 running 的 run 无 end 消失时按子代理自身日志的公开词表产生 item（不可读时明示 unobservable）并唤醒主代理 |
| 绑定式创建（delegate，opt-in） | 创建前技术授权、持久意图、原生 continuable 创建、header 来源核对、worktree binding 与票范围 assignment；结果分别报告 creation / binding / assignment。普通无绑定 lane 改由宿主原生 `subagent`/`subagent_fork` 创建 | 默认不注册；只有 profile 显式 `delegate: true` 才启用。只在需要 ticket↔tree 强绑定或持久意图/幂等时使用；header 不证明实际 cwd 时保持 binding unconfirmed/unknown；已接受/不确定的操作不要另建 child，先核对返回的已有 child，必要时对它显式 assign。`mattpocock_worktree reconcile` 只修 binding，不补 assignment。native + assign 是今后普通新 lane 的默认路径 |
| 续聊 | 原生 send_message 继续同一个 child、历史和目录 | 后续消息不是重新创建，不用它改绑旧 child 的 cwd |
| 工作树状态 | active / discarded / cleaned 的实际作者报告，与程序绑定事实分别保存 | discarded 未清理仍提醒；cleaned 退出当前视图，保留历史 |
| 当前注入 | 新鲜读取、按类别有界摘要、待办计数、查询定位、变更去重 | 摘要不是全部正文，unknown 不是 0 |
| 主动历史 | 本会话授权范围的摘要分页、冻结查询截点、按需详情和覆盖说明 | 来源未曾记录或已删除的区间明确标缺口 |
| 数据整理 | 历史副本 purge；records / windows / worktrees 的源 checkpoint 与定向旧历史删除 | 保留当前/最新值及技术去重保护；不删除原生聊天或磁盘工作树 |
| 旧资源账本 | 兼容读取与旧关系检查 | 写入入口关闭；自有树需可信程序成功清理来源才退出，borrowed retired 仅脱离关系，仍保留提示 |

0.4.5 起协作管理采用两级总闸：「协作管理总闸（全局）」全局唯一，「本工作区总闸」按工作区解析且默认关闭；两级都打开后本工作区的「协作功能」才生效，原因分别显示为「全局总闸已关闭」「本工作区总闸已关闭」。技能分发改为按工作区独立的「本工作区技能分发」开关（默认开启），不经过协作总闸；保存策略后技能目录立即刷新，无需重启。原生文件权限、工具权限及其他宿主限制继续适用；T/S 参考值不替代这些权限。0.4.2 将兼容服务、版本／字节检查与启动组合纳入同一插件包，不修改共享 SDK，不依赖安装脚本。增强兼容支持限定已核验的 SDK 公共图：`0.2.1-alpha.1` 走随包兼容提供者，`0.2.1-alpha.2` 走宿主原生 `startActivation` seam（不再需要也不装载兼容桥行）；历史 0.4.1 Release 不含该接入，当前进程是否加载仍须单独观察；完整验收范围见[验证摘要](<docs/VERIFICATION.md>)。

## 创建子代理时指定工作树：同一插件管理，启停在重启后生效

插件设置页中的独立启动设置默认关闭；它只控制本插件显式指定首次工作目录的派发，不是 DSH 全部子代理 API 的总开关。此设置使用自己的修订保存，不改工作区策略或管理总开关。正常流程只有：安装／更新兼容插件 → 在页面保存下次启动请求 → 必要时正常重启 DSH → 重新读取并核对当前生效状态。用户无需另找补丁、选择 SDK 目录或执行准备／启动器命令。

**唯一功能设置与内部依赖：**「允许本插件创建子代理时指定工作树」是业务功能入口。「子代理工作目录兼容桥（本插件提供）」不是 DSH 官方组件，是同一插件包内的实现依赖；框架列表里的组件开关属于高级维护控制，不是第二个业务开关。关闭功能请求不卸载运行中的 manager，保存功能请求也不会撤销组件关闭覆盖。宿主自身暴露原生 activation seam 时（已核对 `0.2.1-alpha.2`），插件直接使用宿主契约，该兼容桥行保持未装载；业务设置与「实际 header 核对」流程不变。

**组件禁用冲突：** 如果运行诊断显示「兼容桥被配置禁用」，应由 Profile 的维护者撤销 `mattpocock-native-subagent` 的明确 `disabled: true` 覆盖，恢复 bundle 自带的自动选择规则，并保留该行的其他配置及其他组件。不要写 `disabled: false` 来冒充恢复默认，也不要删除、重装 bundle 绕过升级门禁。只读检查和普通安装不擅自更改维护者的显式选择；重复重启不能撤销覆盖。未知／分组／隔离拓扑应保留并进一步诊断，不盲目迁移。恢复选择与当前运行能力是不同事实，必要时正常重启再核对。

> 此项为启动时配置。保存启用或禁用只改变下次启动请求；当前运行状态不会立即改变，网页刷新、插件 HMR 或重挂载均不能代替进程重启。

固定版本的插件内兼容实现通过公开 bundle 组合选择唯一原生服务提供者，保留原 subagent 配置与已有 ACTIVE／PENDING 服务；首次安装不会暗中替换当前运行服务。已有可用官方能力优先，版本／字节／解析身份不确定或自定义隔离组合则保留普通原生行为并显示具体诊断，不伪报增强可用。兼容支持“就绪”只表示下次真实启动的实现准备状态，不代表当前已启用或共享 SDK 被打补丁。

关闭请求同样在下一次正常启动生效，不改变已有 child 的 cwd／身份，不删除树、绑定或原生历史；原生 send_message 和只读历史仍可用。插件不负责 Git 工作树的创建、合并和删除，也不扩大原生文件／工具权限。

旧离线管理器仅保留为已有兼容记录的诊断／维护接口，不是正常安装或 GUI 启用流程。相同 owner／schema／SDK／recipe 与已核验文件／备份可跨插件版本接续；creator 版本保留为来源。外部漂移或未知事务不自动接管、回滚或清锁。技术契约见[启动支持说明](<docs/STARTUP_CWD_SUPPORT.md>)与[插件管理兼容说明](<docs/PLUGIN_MANAGED_COMPATIBILITY.md>)。

## 1. 设置与任务归属

安装并启用后，在插件设置页保存全局默认或工作区显式覆盖。“继承”删除该项覆盖，“开/关”为显式值。保存携带读取草稿时的修订；发生冲突先重读，再决定修改，避免覆盖新设置。T/S 默认未配置，不猜参考值。

一个 owner session 管理一个仪器实例。独立主会话即使用同一工作区也有独立记录；受授子代理共享原 owner 仪器，只能读写实际获授的 workflow/ticket 范围。普通 fork 不是自动加入另一主会话账本。工作树 cwd 变化不迁移原控制工作区。

显示开关只管理顶部、输入区、右栏、列表与时间线呈现，不清记录、不释放占位、不消除待办。客户端支持同页选择已有 Session 查看仪器与历史；导航列表不是授权，读取不会恢复冷会话或创建模型。界面入口随安装和原生可见性提供，本指南不承诺当前运行页面已经更新。

## 2. 准备工作树，再创建与续聊

> 2026-11-03 已接受“原生派发优先 + 强绑定 delegate”；2026-11-04 的 0.9.0 进一步收窄目录事实并补齐恢复：普通无绑定 lane 用宿主原生创建，插件只观察/登记；`mattpocock_delegate` 仍默认不注册。原生生命周期事实写入 owner runtime 文档，读取时给出 activity 与 inferred lane，并只对 coordinator 返回；dispose 后到达的已发布 end 使用已有 owner/run 事实处理。`headerCwd` 不证明实际初始 cwd，也不再产生 initial-cwd 工作树关联。详见[设计](<docs/NATIVE_DISPATCH_FIRST.md>)、[事实边界](<docs/INSTRUMENT_FACT_BOUNDARIES.md>)与[验证](<docs/VERIFICATION.md>)。

**默认路径（native-first，普通无绑定 lane）**

1. 主代理按任务约定判断是否需要工作树；需要写隔离时用宿主 `create_worktree`（或已有 Git 工具）建树并核对原生权限。只读研究/review 可共享稳定检出，不要求每个 lane 建树。插件会自动观测成功的 `create_worktree`。
2. 用宿主 `subagent`（或 `subagent_fork`）创建 child，显式传 `cwd`；省略 `cwd` 保持原生继承。配置、模型路由和权限沿用原生父代理规则。
3. 有票时用 `mattpocock_assign` 对真实直接 child 登记 workflow/ticket；没有票的研究 lane 省略。
4. 后续用原生 `send_message` 继续同一 child，不为一次追问另建 child，也不修改它已有的 cwd。
5. 主代理自己决定合并与清理；这条路径只产生 observation + assignment，没有强 binding。观测看注入快照；用 `mattpocock_worktree` 读取 binding，处置树观测时用 `update-observation`。`cleaned` 是作者声明，不是宿主物理删除回执。

**delegate 默认关闭。** 需要试用时，在插件 profile 配置中显式加 `delegate: true` 并重新加载/重启；不启用时模型面没有该工具，native 路径、assignment、binding/observation 读取和历史卡片不受影响。是否安装、是否启用、当前进程是否已加载仍是三件事。

**强绑定路径（可选，默认不注册；只有 profile 设置 `delegate: true` 时才可用）**

1. 先准备/创建树，再调用 `mattpocock_delegate`，传 `worktree`、`workflowId`、`ticketIds`、`operationId`。它在创建前持久化意图，以该树为请求初始 cwd 创建 child，核对实际 `child/parent/cwd` header（只作为来源值），创建 binding（task/ticketIds）并尝试 assignment。creation 被接受不等于 binding 或 assignment 已完成。
2. 读取返回的 acceptance、actualChildSessionId、actualCwd、bindingId 与登记状态。持久意图不是已绑定证明；只有实际 header 核对后才报告 confirmed。
3. 省略 `worktree` 时仍会记录继承 cwd 的 binding，但它不是某棵专用树的强绑定；若 lane 之后自己用 `create_worktree` 建树，那棵树只进 observation，不会自动改写这条 binding。

**当前失败后的安全操作：** 原生接受回执中的 childId 必须保留，不因 header/binding 失败改用 native 再创建同一任务。当前 confirm 失败会跳过 assign，同 operationId 回放不自动补票范围，reconcile 也只核对 binding；核验当前父子关系与权限后，可对已有 child 显式调用 `mattpocock_assign`。不确定是否创建/授权成功时先查原操作与真实 child，不凭请求中的 ticketIds 当授予证明。三种效果的结构化结果是后续待实施项；省略 worktree 也不让 header 变成实际初始目录证明。

delegate 的持久意图/幂等也适用于省略 `worktree` 的托管创建；本指南只展开强绑定场景。

delegate 请求示例（强绑定 lane）：

~~~json
{
  "request": {
    "description": "实现票 A",
    "prompt": "按已认可的任务约定完成实现并报告进度。",
    "provider": "spawn",
    "worktree": "/已授权的绝对工作树目录",
    "operationId": "本次创建的稳定操作标识",
    "workflowId": "flow",
    "ticketIds": ["A"]
  }
}
~~~

上述“可信技术授权 → 持久意图 → 原生副作用 → 持久会话检查与实际绑定核对”只适用于 **delegate 的强绑定路径**。预检查不创建 child，也不是可反复使用的权限令牌；真正创建时再次检查父身份、当前权限与目录。权限不足、目录映射不支持或安装版没有公开初始 cwd 能力时明确返回失败/unsupported；不先写一条仿佛已获授权的创建意图。native-first 路径由宿主自己的 `create_worktree`/`subagent({cwd})` 授权与核对负责；省略 cwd 的普通派发保持原生继承。

**ticket↔worktree 的权威记录是 worktree binding**：delegate 创建，`mattpocock_worktree` 读/更新/重核对，`mattpocock_history` 查历史。`mattpocock_assign` 只写 child↔ticket 权限；已移除的 `mattpocock_execute` 从未包含 cwd/bindingId，不能回答 ticket↔tree（0.7.0 不再注册；旧会话记录只读保留）。


已有绑定读取、状态更新及重核对使用 mattpocock_worktree。更新请求形状：

~~~json
{"request":{"action":"update","command":{"operationId":"清理报告操作标识","bindingId":"已有绑定ID","expectedRevision":7,"state":"cleaned","notes":"按任务约定完成了工作树清理"}}}
~~~

这里的 expectedRevision 是该绑定行的修订，不是整个 owner 文档修订。cleaned 退出持续注入但不默认删历史；复用同一路径的新工作必须建立新 child/新绑定，不能复活或改绑旧关系。创建已经接受而保存失败时保留 child 身份并核对，不把它报成“未创建”诱发重复派发。

## 3. 票、裁决与当前注入

workflow 自定义进度轴、状态键、含义和互斥/重叠计数。仪器不根据 done、closed、中文“完成”等自由标签推断交付或退出当前范围。票的实现报告、集成、补修及交付由任务约定判断。

待裁决 pending 与待落实 awaitingImplementation 分别保存。已读、隐藏、切换 workflow 或通知消费不解除它们。仍 pending/awaiting 的跨 workflow 事项继续提示；两者解除后，旧问题与选项转为主动历史。需要长期适用的有效结论，可明确纳入当前 context，仅显示简短 result 与来源。

| 内容 | 自动当前视图 | 主动读取 |
|---|---|---|
| 当前推进的流程/票 | 明确当前范围、简要进度、计数与来源 | 保留的各版本与变更 |
| 裁决 | 未解除 pending/awaiting；显式保留的有效结论 | 问题、选项、答复与落实历史 |
| T | held 的票占位与参考值 | 占位、释放和重新占位记录 |
| S | 当前实时运行状态、未核对事实、参考值和 countKnown | 历史执行、结束/释放回执与实际来源 |
| 新工作树关系 | 未 cleaned 的绑定/意图；discarded 未清理仍提醒 | 包括已 cleaned 的保留历史 |
| 原生执行事实 | 最近 64 行 native-observed（state/outcome/读取时 activity；worktree=observed，lane=inferred） | `mattpocock_history` 的 `kind: native-execution`，按 owner 文档修订保留版本 |
| 配置、授权与通知 | 当前策略、必要限制、尚待处理的技术计数 | 实际已捕获的历史；旧未记录区间标 snapshot-only/缺口 |
| 个人已读/隐藏 | 不代替业务待办判断 | 使用个人视图读取，不混入共享 owner 历史 |

自动文本每细类别使用固定机械预算，提供 shown / total / more 和查询定位；长字段标 truncated。预算不限制可创建的票、待办或工作树数量。未列明细仍保留待办计数和 unknown 健康计数，不能把“没展开”读成“没有”。

原生执行事实来自 `agent/created`、`subagent/start`、`subagent/end`、`agent/disposed` 的宿主事件，一行对应一个 native child session（`executionId` 即 `sessionId`），不是每回合一行；重复事件与热重载复用同一行。`activity` 是读取时 live Agent 状态，不持久化；`outcome` 只来自宿主公开的 `stopReason`，没有 end 就是 null。worktree 关联只在 child 初始 cwd 与当前 `create_worktree` 观测路径**精确相等**时出现，标 `observed`；lane 从 assignment/binding 读取，标 `inferred`；两者都不是强 binding、不表示目录被使用，也不是任务完成回执。写入与工作树观测一样遵循协作管理总闸：管理关闭时不新增、不更新事实，已有行仍可读取，重新启用后恢复。旧 runtime 文档无该字段时按空数组解析。

实际消费边界读取新鲜状态，只等待相关已登记持久化操作，不等子代理整个运行。pre-step 与 post-execute 只在视图变化时追加新文本，system context 提供短查询指针；不在三条路径反复追加同一全文。历史修订变化不会仅因全局 revision 让无业务变化的当前全文重新注入。退出未来注入不擦除已经写入原生对话历史的旧消息。

## 4. T/S 是参考上限

- **T** 记录显式票占位、释放与按代次重新占位，独立于 S。无票研究无需虚构票。
- **S** 是宿主的实时运行状态：属于该 owner 子树、在成员资格内、且当前 `Agent.status` 为 running 的子代理数；目录行的 `activity` 是会话驻留而非执行，常驻 idle 子代理不计入。本插件自己的执行租约只作为派发审计，不再参与计数。作者的完成报告不是程序结束回执。 S 同时给出结构：`S.depth` 按到 owner 的边距分为 `direct`（直接子代理）、`deeper`（2 级及更深）与 `unknown`（live 父链不可测量），三者恒等于 `used`，`levels` 列出各层精确计数，来源无法测量深度时 `depth` 为 null；宿主的活动名额按 continuable 血缘共池，孙代与直接子代占同一名额，因此各深度同等计入。
- 成员资格只在成员变更节点从原生目录刷新，状态翻转零遍历更新计数；普通读取是 O(live agents) 内存投影，不重复产生目录 IO。基线读取、插件热重载与 DSH 重启由 durable runtimeId 归因为 re-establishment，只重建计数，不产生 item、不唤醒。
- 展示 used、capacity、overage、gap 与统计覆盖程度。宿主枚举完整且无 diagnostic 行时 countKnown=true，数字精确；服务缺失、查询被拒或存在 diagnostic 行时 countKnown=false、countReason 给出机械原因，used 是明示下界、总数未知；unknown 既不是零占用，也不是派发禁令。
- 被计为 running 的 run 既无 `subagent/end` 也无 idle 转换却消失时，只读该 child 自身日志的最后一个 `turn/end`（或 `subagent/end` 的 stopReason），按公开词表在快照的 `nativeStops` 报告真实结局或明示 `unobservable`（附证据指针），并沿用 notification 通道唤醒主代理；同一失败 turn 以 `itemId=sessionId[:runId]:turn` 与既有 durable notification 行去重，后续 turn 再次失败是新 item，重新观测到 running、start 边或迟到 end 后清除。目录不可读时不宣称任何结局。
- 超出参考值、参考值调小或宿主统计不全都不增加容量审批，不拒绝原本有效的派发，也不强制取消已有执行。agent 根据任务安排推进规模。

0.7.0 不再注册 mattpocock_execute：普通 child 直接用原生 `subagent({cwd})`/`subagent_fork`，后续用 `send_message`；执行事实由原生生命周期观察。程序回执仍由宿主事件取得，模型不能自报。

## 5. 主动历史查询与显式清理

使用 mattpocock_history 查询本会话授权范围的保留记录。初次 query 冻结 cut；后续分页保持相同筛选及 nextCursor。摘要页不是正文，detail 按 historyIds 读取；coverage 明示真实来源、snapshot-only、purged 或未记录缺口。

~~~json
{"request":{"action":"query","query":{"kind":"worktree","recordId":"绑定ID","limit":20}}}
~~~

~~~json
{"request":{"action":"detail","historyIds":["上一页返回的历史ID"]}}
~~~

三种整理动作分开使用：

| 动作 | 实际作用 | 保留与边界 |
|---|---|---|
| set-context | 明确普通对象是否持续注入 | 不改业务值、不删除历史；未 cleaned 工作树不能被隐藏 |
| purge | 删除显式选择的历史副本正文/来源/摘要 | 保留墓碑、序号与抑制水位；不声称源记录也已删除 |
| compact-source / purge-source | 在 records、windows 或 worktrees 源域建立 checkpoint／删除指定旧版本正文 | 保留当前/最新值、创建作者、代次/租约与必要去重摘要；源删除同时处理对应历史副本，分域报告结果 |

源清理先查询 sourceRevisions，再用对应源域的 expectedRevision；HistoryPage.revision、businessRevision 和某条 row 的修订都不是可互换的源 CAS 修订。未知 sourceRevision 用 null，清理不可用，不能补零。

例如只清理某绑定截至指定版本的源旧历史：

~~~json
{"request":{"action":"purge-source","domain":"worktrees","request":{"operationId":"本次清理的稳定操作标识","expectedRevision":12,"throughRevision":9,"bindingIds":["绑定ID"]}}}
~~~

records/windows 使用显式 targets，worktrees 使用 bindingIds；均保留最新版本。选择的是对象与旧版本范围，不提供任意字段级擦除、全部作用域一键删除或自动 TTL。删除旧版本正文也不保证所有位置的同一句文本消失：当前/最新值、其他未选对象、必要作者及技术摘要可能仍保留。原生聊天、Git 分支与磁盘树均不属于这些数据操作。

历史副本域与三个源域没有跨域原子事务。操作可能返回 partial、failed-or-uncertain 或回执保存不确定：先核对已处理的副本与实际源修订，使用同一 operationId 追查/重试，不能宣称全部成功或假装回滚已持久副作用。源域发生不确定写时先关闭并重开真实存储 handle；源暂不可用时，已有历史副本仍可查询，sourceRefresh/coverage 如实说明状态。

**没有默认保留期限。** 已清理树退出当前提醒但历史保留；废弃未清理树仍提醒。永久删除必须由实际 owner/用户在已有权限范围显式选择；“清掉提醒”、删除历史副本、删除源旧历史与清理磁盘树不是同一操作。详细契约见[历史核心](<docs/HISTORY_CORE.md>)及[工作树绑定](<docs/WORKTREE_BINDINGS.md>)。

## 6. 工具与实际权限

| 模型工具 | 用途 |
|---|---|
| mattpocock_controls | 读取设置；有显式策略委托时保存 |
| mattpocock_record | 读取本会话仪器，提交作者的流程/票/裁决记录 |
| mattpocock_window | T 占位、释放与重新占位 |
| mattpocock_resource | 旧资源只读检查，写入已关闭 |
| mattpocock_assign | 对真实直接子代理登记受授票范围 |
| mattpocock_history | 分页历史、详情、当前范围及显式副本/源旧历史整理 |
| mattpocock_worktree | **读取/更新绑定**、观测处置、程序重核对；不创建 binding |
| mattpocock_delegate | **opt-in 强绑定创建**：只有 profile `delegate: true` 时注册；创建 child 并写 worktree binding/task/tickets；仅在需要 ticket↔tree 强绑定、持久意图/幂等/创建前范围检查时使用；普通无绑定 lane 用原生 subagent({cwd}) + assign |

工具使用真实调用 Agent/session，不接受正文自报 principal、owner、作者或执行回执。策略委托可撤销，子代理不能自授权。源清理由实际 owner coordinator 或认证用户执行；Session 导航和输入的 operationId 都不是授权。原生/preset 隐藏工具时按不可用处理，不绕过。

**ticket↔worktree 看 binding，不看 assignment/execution**：binding 由 opt-in delegate 写、worktree 读/更新；assignment 只写 child↔ticket 权限；已移除的 execute 从未包含 cwd/bindingId。0.7.1 的 native-observed execution fact 只回答“这个 native child 最近一次观测到的生命周期”，**不是** binding；读取时工作树/lane 关联已明确标 `observed`/`inferred`。

0.8.0 默认工具面是七项（controls、record、window、resource、assign、history、worktree）+ 条件 `mattpocock_audit`；`mattpocock_delegate` 是显式 `delegate: true` 的可选第八项。客户端仍声明九个 wire key，供 opt-in delegate 与历史卡片；历史 0.6.0 发行版的九个固定工具（含 `mattpocock_execute`）记录保留为历史。C 已实施但不新增工具/Remote 方法；强绑定写入口仍只有 delegate。

## 7. 通知与工程部署

用户或获授子代理提交业务更新后，先保存待通知记录，在线主会话接收独立来源通知；不等待发送方结束，不为通知擅自恢复冷主会话。收件箱接收不等于持久消费，确认匹配消息追加及原生 flush 后才记技术消费；重试可能重复。技术消费不清除 pending/awaiting，也不证明模型已落实业务。

仓库中的源码、宿主补丁、包构建与安装部署分别验收。全套测试、严格构建和精确打包结果由本轮集成完成记录统一登记；本指南不预填正在进行的最终结果。实际启用须使用已核验的包与宿主能力，再检查现有运行服务和页面。普通 Skills 的不可变来源、通道及既有发布授权边界保持不变。
