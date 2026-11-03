# 仪器事实边界、部分成功与恢复

> **状态：2026-11-04（北京时间）所有者认可；0.9.0 已实施并验证，尚未安装。** 本页契约已由 0.9.0 源码、完整测试与精确制品覆盖，不再是未来要求；源码提交 `708b277a2bb6699de05c822572057b29b842d0ab`（分支 `release-0.9.0-fact-boundaries`），精确计数与制品见 [VERIFICATION](<VERIFICATION.md>)。历史 0.7.0/0.7.1/0.8.0 记录保留，不回填；已 push `main`、tag `v0.9.0` 并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.9.0)，未 npm publish，未安装本机 DSH/Profile/GUI。权威入口为 [DESIGN](<DESIGN.md>)，实施门禁为 [IMPLEMENTATION_PLAN](<IMPLEMENTATION_PLAN.md>)。
> 公开资料边界：只保存代码事实、脱敏场景和聚合结果；原始会话、用户正文、本机路径及 Profile 不进入公开仓库。

## 1. 决策与不变量

1. **宿主执行，插件观测。** 默认仍用原生 `subagent` / `subagent_fork` / `send_message`；Git 工作树与 cwd 仍由宿主工具管理。`mattpocock_execute` 不恢复，delegate 保留实现且默认不注册。
2. **事实声明不超过来源证明力。** 目录头值不是实际初始目录，路径相等不是使用/独占关系；创建意图中的票范围不是任务授权；绑定确认不是授权提交回执。
3. **效果分别报告，恢复不重新创建。** 已接受 child 必须保留身份与接受事实；元数据失败不撤销它。恢复只使用已有 child 和已有工具，不自动重派、自动补授权或自动删除资源。
4. **缺口可见，业务不加门禁。** 无法归属、覆盖或保存的程序事实进入既有 health/diagnostic；unknown 不变成失败、零占用或已完成。S 仍取宿主 live 状态，不从执行账本计数。
5. **不为修复再造平台。** 不新增模型工具、Remote 方法或存储 domain，不造 cwd resolver、调度器、目录占用机制或第二套终局通知。

## 2. 依据、范围与版本边界

- 本地旧版会话的三个 child 均先保留父目录的会话 header，随后通过宿主工作目录事件采用请求的工作树；三次 delegate 均返回原生接受、binding 核对失败。这证明 header 字段不能单独证明实际初始目录，不证明某个事件拼接算法可靠。
- 0.8.0 及更早的 C 实现把首次可读 header cwd 存为 `initialCwd` 并用于读取时工作树关联；delegate 在 confirm 后才 assign，同 operationId 回放不补 assignment，reconcile 只处理 binding。0.9.0 已把字段与读取契约改为 `headerCwd`，取消路径相等派生的 initial-cwd/worktree 关联，并把 creation/binding/assignment 分开报告。相关代码：[runtime](<../src/runtime.ts>)、[native-executions](<../src/controls/native-executions.ts>)。
- 已有 Host 计数器明确允许 dispose 后收到无 live Agent 的 end；0.8.0 及更早的执行事实写入仍要求 live metadata，形成静态覆盖风险。0.9.0 已改为使用 durable owner/row 与已保留 owner view 处理，无 view 时只报覆盖缺口；该路径不冒充已在三个 child 上复现。见 [Host](<../src/host.ts>)。
- 0.7.0 删除 execute、0.7.1 交付 C 账本、0.8.0 关闭 delegate 默认注册均保留历史完成记录；本页修正 C 的事实语义与覆盖，旧版本测试数字不充当本页 0.9.0 的验收结果。0.9.0 的源码、测试与精确制品验收见 [VERIFICATION](<VERIFICATION.md>)；源码、制品、安装和进程加载状态分别核对。
- 一份旧版本地会话抽样包含 132 条仪器状态消息，其中 35 条 stale，UTF-8 正文合计 2,674,215 bytes；这只是持久日志文本量，不是模型 token、当前版本性能结论或超时因果证明。减负须另做受控比较。

## 3. 目录事实：收窄而不补推断

### 3.1 来源与允许的声明

| 来源 | 允许声明 | 不能声明 |
|---|---|---|
| 创建请求的 cwd/worktree | 请求意图与技术授权检查结果 | 子会话已在该目录开始执行 |
| child header cwd | 首次读取到的目录头值及来源 | 实际初始目录、当前目录、正在使用的树 |
| 宿主成功的 create_worktree | 谁创建了哪棵树、程序核验的 Git 身份 | child 以该树启动、其他会话未使用它 |
| 后来的 working-directory/change | 对应事件记录的目录变更 | 仅据此反推最初执行目录或补 confirmed binding |
| assignment / binding 派生的 lane | 读取时关联推断 | 目录占用、物理写入隔离或新的授权 |

规范领域用语见 [GLOSSARY](<../GLOSSARY.md>)。`headerCwd` 是 0.9.0 起的规范字段；旧 `initialCwd` 的真实来源只是 header。当前宿主没有足够证明时，实际初始目录保持 unknown，不新增一个由插件计算的“有效 cwd”。能够传递请求 cwd 的 capability，与能够证明实际初始 cwd 的事实是两件事。

### 3.2 读取契约（0.9.0 实施）

- 执行事实保留首次可读目录头值，明确标 header 来源；live activity 仍在读取时取得。
- 不再由 header 路径相等生成“实际初始 cwd 已关联”的 `worktree` 或 `initial-cwd` 关系。没有有效证据时该语义返回 null/无关联，空值不表示 child 没有工作树或没人使用目录。
- 若保留 header 路径匹配供诊断，必须单列为 **header 路径匹配**，不复用实际初始目录/强绑定名称；不能仅凭通用 `observed` 标签掩盖字段语义。
- `created-tree` 只取可信树创建记录的 creator；不以该 creator 的目录头值存在为前提。它只证明创建，不证明使用。
- 0.9.0 没有新增实际初始目录证明 seam，也不从 ensure、setup、普通 cd 历史、路径前缀/软链或提示词推导绑定。将来如要使用新的宿主事实，必须另更新契约与宿主形态回归。

### 3.3 旧数据与历史兼容

- 旧 `initialCwd` 作为 legacy header 来源读取，不能因为改名就升级成实际初始目录；新旧字段同时出现且冲突时明确报错，不能任选一个或 reset-empty。
- 0.9.0 通过既有严格解析区分新字段与兼容输入：新写入只存 `headerCwd`，旧 `initialCwd` 仅作 legacy header 来源读取；历史正文及来源可追溯，不批量重写原始会话、历史或已确认 binding。无新存储 domain。
- 旧 history 仍可按当时字段显示，但必须说明历史 header 语义；当前模型投影和客户端不得继续按实际初始 cwd 使用旧值。旧 binding 按历史确认契约展示，不自动撤销或假定满足新的实际目录证明要求。
- 没有观测到的历史保持 unknown；不全量扫描冷会话补账，不改变 owner/assignment 过滤、CAS、历史整理或权限。

## 4. delegate：部分成功与已有 child 恢复

### 4.1 效果维度

下表是 0.9.0 已实现的逻辑结果契约；字段在既有结果、journal 和查询投影内编码，并保留旧接受事实与幂等语义。

| 维度 | 必须区分 | 证据 |
|---|---|---|
| 原生创建 | accepted / rejected / unknown；接受后保留 childId/messageId | 原生接受回执；plannedChildId 不能单独证明已接受 |
| binding | confirmed / unconfirmed / unknown，并给具体 diagnostic | 显式 header checkpoint 与 planned child/parent/requested cwd 的匹配；不是实际初始/当前目录证明，无法证明实际 cwd 不强行 confirm |
| assignment | granted / not-attempted / failed / unknown | 真实授权提交回执；请求里的 workflow/ticketIds 不是回执 |
| 记录与持久化 | recording / persistence 分别报告；回执丢失或写入不确定不撤销已接受 child | delegation journal 回执与当前可读结果 |
| 恢复 | recovery 与原始 result 分开；只读已有 child/binding/assignment，不重派、不隐式授权 | 查询既有记录；reconcile 只修 binding |

- 创建、binding、assignment 是独立效果，不代表必须改变现有执行顺序或把三个动作改成跨域事务。0.9.0 保留 confirm 后 assign 的顺序；confirm 失败时明确 assignment 为 not-attempted，assign 已调用但提交不确定时为 unknown。binding 的 confirmed 只是显式 header checkpoint 匹配，不是 child 实际初始/当前目录证明；恢复查询另列 recovery，不改写原始 result。
- 某步调用后因存储不确定不能证明是否提交时，报告 unknown，而不是 failed/not-attempted；遵守已有 storage-uncertain 停止读写与 handle 恢复规则。
- 创建前检查与真正副作用边界的身份/目录授权保持；assignment 仍由现有授权路径提交。无票研究不虚构 workflow/ticket/T，也不把空票范围升级成 coordinator。
- 旧 journal 只有笼统 recording 结果时，不能凭旧请求推断 assignment 成功；只在当前授权下可核验已有授予时报告 granted，否则报告相应未知/未完成事实。

### 4.2 明确的恢复流程

1. 原生已接受时，返回中明确“已有 child，不要重新创建”；保存可恢复的 child 身份和各效果结果。
2. 同 operationId 重放不得再次调用 nativeCreate，也不自动补 assign；0.9.0 将原始 result 与当前可核验的 recovery 分开返回，避免旧失败回放冒充当前状态；accepted child 永不重建。
3. binding 需要重核对时，使用现有 `mattpocock_worktree reconcile`；无法证明实际 cwd 时仍未确认。reconcile 只修 binding，不声称修复 assignment。
4. 确认有补授权需要后，主代理对**同一个真实 child** 显式调用 `mattpocock_assign`；重新校验当前 caller/父子关系/票范围，不能拿原请求或旧 journal 当权限令牌。
5. 后续从已有授权事实确认 assignment；不要求重复创建或发送一遍原始任务。不以元数据失败为由自动 kill、清树、释放 T 或标业务完成。
6. 创建 acceptance 仍 unknown 时只检查持久意图与真实 child，不用“找不到”猜 rejected；不自动重派。

## 5. 生命周期：迟到 end 与覆盖缺口

- 宿主发布的 `subagent/end` 不得因为 live Agent 已 dispose 而静默丢弃。0.9.0 优先使用事件到达前已验证的 session/parent/owner-instance 归属与已有事实行处理；事件载荷或模型自报不能自行授权归属。
- 迟到 end 只有在同一 runtime 仍保留该 owner view 时才写已发布 outcome；没有任何可信 owner view 时按设计只报 native-executions coverage gap，不写结果、不扫冷日志、不重试、不猜结果。这是策略证据缺口，不是“已保存”。
- child session 与 host run 身份分别核验。重复 end 幂等；旧 run 的迟到 end 不能覆盖新 run 的 running/outcome。runId 缺失且无法可靠区分时保留当前状态，并报告关联缺口，不按到达顺序猜。
- 已 disposed、同一可确认 run 的 end 到达后，可以补已发布的 outcome；disposed/idle/gone 本身不产生 outcome。
- 无可信归属、事件身份冲突或持久化失败时，在已有 health/diagnostic 明示覆盖缺口及可用证据指针；权限外信息不泄露给其他 owner/child。管理关闭等按现有门控有意跳过写入，不伪报为观察失败。
- `nativeLifecycleObservation: supported` 只表示公开 seam 存在，不表示覆盖无缺口；health 必须反映本次观测能否可靠关联和持久化。S、nativeStops 与通知沿用各自既有路径，不被本账本失败阻断，也不新增一次终局唤醒。
- 不做全量冷日志扫描、周期补偿或用账本重算 S；同一 child 一行、历史 revision 保留、owner coordinator 才能读完整执行投影的规则不变。

## 6. 来源标签：按字段，不按整行继承

| 字段/关系 | 来源解释 |
|---|---|
| 树创建、creator、受权 Git 核验、宿主生命周期结果 | observed；说明具体事件/程序来源 |
| native execution lane、worktree observation lane | inferred；来自 assignment/binding 的读取时关联，不创建权限或强绑定 |
| active/discarded/cleaned、notes、业务票状态 | authored；保留实际作者，不称物理清理或完成证明 |

两类 lane 都必须包含同等清楚的 inferred 来源，并在模型、客户端和可查询投影中一致表达；不能把 observation 的程序来源传染给其作者声明或关联推断。无需修改历史作者或新增强绑定。

## 7. 默认指导与消费减负

### 7.1 最小条件指导

- 只有需要写隔离且任务约定要求工作树时才给建树指导；只读研究/review 可共享稳定检出，不因 lane 存在就要求新树。
- 默认协议只指导原生派发和需要时的 assignment。delegate 未注册时不宣传它；0.9.0 的 `delegateRegistered` 仅当可信 Host 配置 `delegate: true` 且 facade 实际提供 delegate 时为 true，不能用模型输入或其他 cwd capability 推断。opt-in 时也只描述可选绑定式创建及其限制；管理 OFF 保留既有事实，不追加受管行动。
- 管理功能关闭时，不继续注入要求新增建树、绑定、占位的通用命令；既有待办、清理义务、授权限制和未知状态仍保留。显示隐藏不取消消费或业务义务。

### 7.2 stale 传递与可见性

- 保留当前按 identity/instance/owner 隔离、可信 visibility oracle、单 admitted-step 投递门控、提交 frontier、刷新退避、表示预算与撤权排序；不另加一个无来源的“模型已经知道”缓存。
- 旧快照仍可证明在本次上下文可见，且失败原因/事实版本/授权范围均未改变时，后续使用短 stale 提醒或抑制完全重复正文；不重复附整份旧快照。
- 可见性未知、上下文压缩/重建、实例/权限范围变化时，不能只给短提醒假装旧内容仍可见；按当前权限重新给有界 stale/unknown 及合法查询指针，不回放撤权前的旧正文。
- 新待办、新程序事实、失败原因变化、有效策略切换或恢复 current 都必须使去重失效并传递相应有界更新；旧正文不得盖过管理 OFF 等最新协议。仍遵守单 admitted-step 至多一份快照：同一步后续变化在下一个合法 admitted-step 消费点传递，不借减负改变原有送达时序或另加唤醒。
- 没有已验证快照时明确 unavailable/unknown；不为减负吞新义务、不把 stale 当 current、不把超时推断成执行失败。
- 验收测量消息数、完整/短 stale 正文数、持久文本 bytes、读取/组装耗时及受控模型请求文本量；分清日志文本、请求文本与计费 token。门禁首先是上述语义保持，其次在相同故障/状态脚本下重复完整正文减少，不设无依据的绝对性能承诺。

## 8. 必须覆盖的验收矩阵

以下矩阵保留为 0.9.0 的验收契约；**0.9.0 已由源码与测试覆盖全部编号**，不引用旧版本套件通过数字充当本轮结果。真实宿主形态的 fixture 与无模型公开 seam 探针仍分开标证据等级。

| 编号 | 场景 | 必须观察到 |
|---|---|---|
| F1 | header=父目录，请求/后续目录事件=工作树；含父目录恰为已观测树 | 不报告实际初始目录关联，不强行 confirm；header 来源可查 |
| F2 | 树 creator 是 native child，但 header 不可读 | created-tree 创建事实可见；不冒称使用 |
| F3 | 旧 initialCwd、字段冲突、旧 history/confirmed binding | 兼容读取且不升级事实；冲突显式失败；不改旧历史 |
| P1 | 有票，创建 accepted，confirm 失败 | 同 childId，binding 未确认，assignment not-attempted |
| P2 | assign 已调用但提交不确定；同 operationId 重放 | assignment unknown；零新 child、零隐式再授权/再发消息 |
| P3 | 显式给已有 child assign；其间权限撤销/票范围变化 | 按当前权限检查；成功才标 granted；reconcile 不伪报修复票范围 |
| L1 | end→dispose、dispose→end 且 registry 已无 Agent | 同 run 的公开 outcome 均能保存；无第二次终局通知 |
| L2 | 重复 end、旧 run 的 end 晚于新 start、runId 缺失 | 幂等；新 run 不被覆盖；不可区分时有缺口而不猜 |
| L3 | 无可信 owner、保存失败、管理关闭 | 缺口按权限可见且不阻断原生/S/通知；有意关闭不伪报失败 |
| S1 | 两种 lane 与 authored cleaned 同行展示 | 模型/客户端/查询分别标 inferred/authored，不继承 observed |
| C1 | 默认 delegate off / opt-in；只读/写 lane；管理 off | 指导条件正确；默认工具面仍 7 + 条件 audit；不强迫只读建树 |
| C2 | 重复 timeout、visibility 已知/未知、上下文重建 | 可见时减少整份旧正文；不可见时保持合法有界事实与 unknown |
| C3 | stale 期间新增待办、权限撤销、OFF、恢复 current | 不漏变化、不泄露旧正文、不用旧协议覆盖新策略 |

0.9.0 覆盖：F1-F3、P1-P3、L1-L3、S1、C1-C3 均已由源码与测试覆盖；完整套件与定向套件计数见 [VERIFICATION](<VERIFICATION.md>) 的 0.9.0 节。

0.9.0 已验证：native + assign 单 child、native send 单消息、PTC 嵌套、T/S 独立、owner 隔离、history/source cleanup 与旧 binding 读写无回归；严格类型/闭合构建/完整测试均通过（997 项：794 通过、0 失败、203 skip，203 为环境门禁），精确制品见 [VERIFICATION](<VERIFICATION.md>)。源码/fixture 与制品通过不等于已安装或真实 GUI 已更新。

## 9. 与既有文档的优先关系

本页收窄 [C 阶段文档](<NATIVE_OBSERVATION_CORRELATION.md>) 与 [原生派发方案](<NATIVE_DISPATCH_FIRST.md>) 对 header 初始 cwd 关联的声明，并补足 [绑定契约](<WORKTREE_BINDINGS.md>)、[树观测](<WORKTREE_OBSERVATION.md>)、[Host](<HOST_INTEGRATION.md>)、[客户端](<CLIENT_INTEGRATION.md>) 和 [消费](<CONSUMPTION.md>) 的 0.9.0 落地要求；精确制品、构建与测试计数见 [VERIFICATION](<VERIFICATION.md>)。它不改变旧发布的哈希、测试数字或当时字段形状；当前已知限制与安全操作提示见 [使用指南](<../CONTROLS.md>)。本页不是对所有历史契约的重写，只在上述冲突点以本页及 DESIGN 最新决策为准。
