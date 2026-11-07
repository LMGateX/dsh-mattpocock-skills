# 任务权威研究：项目任务源与 Session 协作 Overlay

## 1. 状态、固定范围与证据等级

**职责方向已认可，细化为实施前推荐；本轮文档，不是已交付行为/迁移授权。** 默认业务权威回项目约定 tracker/任务文档；插件保留任务引用与 session 协作 overlay，来源只读投影按需，不转型通用 tracker，不维护第二套完成账。

- 本报告固定检出 `6a3a7b24f003006a83a7dc379532d149729c7726`，插件源码版本 [0.15.0](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/package.json#L1-L6>)；不是对当前安装/GUI 的验收。
- 上游 primary 为仓内 pinned vendor：distribution `v0.3.1` / `1058f7f3601835b49d55ce3f2f5eac4b3e7266e1`，upstream `v1.3.2` / `d1478fcb140db0b93c0c8df17bcfd311844749d0`，见[锁定身份](<../source-lock.json#L1-L10>)、[来源清单](<../PROVENANCE.json#L9-L28>)。本轮未重新执行 vendor 验证，不把 provenance 声明冒充新验证回执。
- 已先读[设计](<DESIGN.md>)、[计划](<IMPLEMENTATION_PLAN.md>)与[仓库规则](<../AGENTS.md>)；加载 research / writing-for-agents，以只读独立子代理补核工具。仅新建本文，不改代码、测试、生成物、vendor、Profile 或 SDK；未建树、提交、push、发布、安装或改生产记录。
- **没有生产记录证据**：未读目标会话完整授权账本、外部 tracker 或逐票执行依据；不声称任何实际票重复、已完成或可迁移，不以研究会话空视图替代目标状态。本文结论是 pinned 条款、静态机制与设计风险，不是生产复现率。
- 既有[职责收窄决定](<DESIGN.md>)已反对任务双账；本次任务引用方向来自用户认可，不追溯重写旧业务记录的合法性。

## 2. 上游实际条款，不等于插件新契约

| Pinned primary | 实际要求 | 可支持的结论 / 推导边界 |
|---|---|---|
| [setup](<../vendor/mattpocock-skills/skills/engineering/setup-matt-pocock-skills/SKILL.md#L38-L51>) | 选择实际跟踪工作的 tracker，写项目配置；GitHub/GitLab/本地 Markdown/其他约定均可 | 不应由插件默认新造第二 tracker；上游没有规定 DSH overlay schema |
| [to-tickets](<../vendor/mattpocock-skills/skills/engineering/to-tickets/SKILL.md#L58-L80>) | 经认可后发到配置 tracker；本地每票一文件，真实 tracker 每票一 issue，blocking edges 与验收/状态随票 | 任务正文与依赖已有载体；不要求再抄成插件业务票；不得擅改/关闭 parent issue |
| [implement-spec](<../vendor/mattpocock-skills/skills/engineering/implement-spec/SKILL.md#L7-L17>)、[收尾](<../vendor/mattpocock-skills/skills/engineering/implement-spec/SKILL.md#L23-L42>) | 票是任务图；按 tracker 的关闭方式解决；稀疏交流以 context pointers 为主，集成/复审/清理另有步骤 | source 的 close 规则不能被本地 terminal 或 child 返回替代；不是“插件认定完成即可” |
| [wayfinder](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L11-L25>)、[身份/claim/frontier](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L55-L71>) | 默认规划；map 是索引，决定正文只在其 ticket；tracker id 为身份，assignee 即 claim，native blocking 优先 | tracker claim 与插件授权 assignment 是两件事；map、决策票、实施票不能无条件合为一种完成状态 |
| [wayfinder 类型](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L73-L80>)、[resolution](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L118-L126>) | HITL 必须真人参与；task 特例是解锁决定的工作；resolution comment + close + map pointer | AFK research 不应伪装用户答复；上游允许多类决策票，不代表裁决仪器应镜像所有票 |
| [handoff](<../vendor/mattpocock-skills/skills/productivity/handoff/SKILL.md#L8-L16>) | 交接文档引用已有 artifacts，不复制；删敏感信息 | 恢复用来源指针与必要 overlay，不复制完整任务账；本文不是执行该 handoff 的指令 |
| [writing-for-agents](<../vendor/mattpocock-skills/skills/productivity/writing-for-agents/SKILL.md#L10-L39>)、[单一权威](<../vendor/mattpocock-skills/skills/productivity/writing-for-agents/SKILL.md#L76-L81>) | 指针含触发条件，按需披露，一种含义一个权威处 | “默认引用、按需投影”是设计推导；不等于上游明文禁止任何缓存 |
| [triage](<../vendor/mattpocock-skills/skills/engineering/triage/SKILL.md#L68-L90>)、[agent brief](<../vendor/mattpocock-skills/skills/engineering/triage/AGENT-BRIEF.md#L1-L37>) | ready-for-agent 发布 brief；brief 是 AFK 执行 contract，原 body/discussion 为 context；验收/范围明确 | 仅引用 issue 标题或旧正文不足以恢复任务契约；brief 本身反对依赖易失路径/行号，本文版本化证据引用不应变成 brief 格式要求 |

这些条款支持唯一业务来源、稀疏引用和按需阅读；**A/B/C 的取舍、source identity 与权限约束是本项目设计，不伪称上游已有插件协议**。未调用 setup/to-tickets/wayfinder 的建票、联网或发布步骤。

## 3. 当前源码如何真实形成第二本账

1. [Workflow/Ticket schema](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instrument-state.ts#L4-L16>)保存本地状态字典、title、statuses、summary/disposition，`externalRef` 只是可空文本；[解析](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instrument-state.ts#L113-L139>)不含结构化 provider/repo/source revision/读取权限证明。有引用不等于已验证外部对象，更不是同步器。
2. [put-ticket 重放](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instrument-state.ts#L378-L400>)将作者输入独立持久为本地版本；[统计](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L520-L537>)只计本地票状态，不从项目 tracker 取真值。若同一任务也在 source 更新，模型就有两处独立完成写入、两条修订/历史；“记得同时更新”不能产生跨系统原子性。
3. [reserve/reacquire 入口](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1190>)调用[缺票检查](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L365-L368>)，[有效指导](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L297-L304>)要求先 put-ticket(title+statuses)，使 T 协作入口实际牵引业务镜像。限定：[登记读取失败返回 null](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L323-L327>)时检查放行，不是任何异常下都强制验证成功；release 不要求登记检查。无票研究允许无 workflow，不该靠假票凑 T。
4. [terminal 提示](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L329-L343>)由本地 status.terminal 与 held 生成 pending-release；[window release](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/windows.ts#L735-L763>)仍是显式独立操作。**T 是在途名额，不是业务完成账；S 是宿主运行事实，不是 source 完成证据。** 只改标签/child 返回不会释放 T，也不应替 source 关票。
5. [自动消费](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L189-L205>)持续携带本地字典、票、计数；不是只有一个闲置 externalRef。已有“业务由 Skills/用户/任务文档决定”的[指导](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L269-L277>)限制证明力，却没有消除双份状态。
6. 决定的 awaiting 还可能再形成第三处收尾标记；当前将它解释为兼容核对而非未完成任务总数，见[现行指导](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L276-L277>)。应保留决定→任务关系与真实承诺，不重复本报告之外的[兼容方案](<DECISION_LEDGER_COMPATIBILITY.md#L44-L50>)全文。

### local-current ≠ source-current

- `local-current` 在本文是分析术语，不是现有工具名。当前恢复读[只读当前本地对象](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L514-L545>)，sourceVersion 是该领域本地 revision/fingerprint；[结果](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L576-L590>)没有对外部 tracker 新鲜度的认证。`coverage=current` 不能读成“外部任务此刻仍如此”。
- [locator 绑定](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/model-output.ts#L5-L22>)与[版本/哈希校验](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/model-output.ts#L249-L276>)防止跨 caller/scope/版本续读，不能把字符串 externalRef 升级成 source 授权或外部实时快照。离线、受限、已删源都需分别呈现未知/不可用，不把旧投影当当前 source。
- [history](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1314-L1328>)是 retained instrument 历史，部分动作先 capture；[set-context/purge](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1418-L1423>)改变派生上下文/历史，不是业务完成或文件清理。不能把“只读研究”误等同任意 history action 都零写副作用；本轮未调用。
- 还须区分三种读：[模型 current 恢复](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L514-L545>)、[自动注入 activeContext](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L748-L760>)、[readSession 完整 snapshot](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1156-L1160>)。注入可筛选历史纳入的票/字典，保留 pending/awaiting 及必要 contextConclusions；三者不因都谈“当前”就具有相同覆盖。
- [本地身份边界](<SESSION_INSTRUMENTS.md#L24-L36>)是 instance + workflow + localTicket；同一 source 可被多个 session 引用，各自 overlay，不天然共享业务写权限/占位。

## 4. 所有插件模型入口矩阵（源码事实 → 方向影响）

范围是本插件最多 [9 个工具名](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/client.ts#L35>)，不枚举宿主所有工具；另列 view 子动作。[注册/路由](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1702-L1755>)与[有界输出规则](<BOUNDED_TOOL_OUTPUTS.md#L78-L116>)共同约束结果；history/worktree/assign 还依 active 方法存在，delegate/audit 另有条件；存在工具不等于当前 feature/调用者有权使用。

| 入口 | 当前事实 / 权限与副作用 | A/B 需要守住的边界（推荐，非实现） |
|---|---|---|
| `mattpocock_controls` | read 配置、save 修订 intent；[已认证 agent 可读，写需显式 delegation](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1203-L1219>)；分页不是完整 save intent | 策略/显示与任务业务权威分开，不借设置选择来源就授予外部读写权 |
| `mattpocock_record` | read current/page、detail 授权正文；apply workflow/ticket/decision/view。[assigned 不改字典且票限域](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L464-L482>)，旧对象 OFF 可收尾但不新建 | 默认任务引用/协作 overlay；禁止把 source 投影写成第二份可独立编辑完成状态；裁决仍有独立真实用户问题职责 |
| `view` / `mattpocock_view` | **没有独立注册的 view 工具**；`set-decision-view` 是 record apply 子动作，改实际 principal 的 read/hidden 与 viewerRevision，[不是任务业务更新](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instrument-state.ts#L369-L405>) | 隐藏/已读/折叠不表示 source 完成、归档或释放 T |
| `mattpocock_window` | reserve/release/reacquire，通常检查本地票（读取未知不 veto），generation 围栏；没有 read action，不自动释放 | 从业务镜像要求解耦的设计需另定；保留明确占位/释放，不按 source 标签自动结算 |
| `mattpocock_assign` | [真实直接 child + 同实例 + 授予时父范围检查](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1546-L1563>)；改授权 assignment，不是 tracker assignee/claim | 明确谁能读写哪份 overlay；不代替 source claim，更不授予外部凭据 |
| `mattpocock_history` | query/detail、set-context、purge/compact、purge-source/compact-source；[coordinator gate、源清理还需实际 owner](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1314-L1330>) | 保留 legacy authored/投影来源与缺口；清理不迁移业务权威，也不自动消账 |
| `mattpocock_worktree` | read 当前分页；update/update-observation 作者处置；reconcile 核绑定；[registry coordinator-only](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1426-L1440>) | 关系/物理事实与任务源不同，cleaned 不证明业务完成，不因 A 而丢失资源义务 |
| `mattpocock_resource` | [仅单资源 read，不创建/借用/退休树](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1744-L1749>)；[resource detail coordinator 限域](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L608-L614>) | 引用源权限不扩大成资源删除权；Git 事实不替 source 验收 |
| `mattpocock_delegate`（条件） | [显式 options.delegate=true 且 active.delegate 才注册](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1750-L1753>)；binding-first 创建，接纳/绑定/assignment 分开，不确定不重派 | 保留 opt-in/native-first；新 reference 身份不能破坏幂等、部分成功恢复或偷授来源权 |
| `mattpocock_audit`（条件） | [配置启用才注册](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1819-L1833>)；[owner-session、总闸/工作区/监督均核验](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1791-L1814>)；本进程 memory ledger + durable episodes，读不调用模型/改票/释放 T/S | 观察/嫌疑不是任务完成裁判；不得用产品/支持文件计数或 reviewer 建议回填 source/overlay 完成状态 |

当前源码没有 `mattpocock_execute` 注册入口，不能把历史工具或本报告分析词当新 API。audit 的即时读与后台可选 reviewer 是不同路径，不应混称“调用 audit 就审判/唤醒”。

## 5. 来源身份、权限与无网络约束

- **事实**：[offline runtime 锁定](<DESIGN.md>)禁止 runtime 网络访问/自动更新；现有[source domain 白名单](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/model-output.ts#L12-L22>)是插件内部域，不是任意 tracker/文件 URL 读取器。项目 Skills 使用既有 CLI 的工作流，不等于插件获准内置联网 connector。
- **推荐**：reference 身份至少区分来源种类、项目/仓库、原生对象 ID 或仓内文档定位；URL/标题仅供显示，localTicketId 不当全局 source ID。文档 rename、同号跨仓、fork/worktree、源移交/删除均需明确身份延续或失效，不能靠标题合并。
- **推荐**：可选投影记录 source locator、源版本/内容摘要、观测时刻、读取覆盖与真实取得方式；分别标注 source 声明、agent 转录与 plugin 观测。没有版本能力就如实 unknown；不假设外部多对象或本地/外部联合原子快照。
- **推荐**：来源读取与插件 scope 是两次授权；locator 不是凭据，撤权后不凭旧缓存/历史复活私有正文。不跟任意 URL、不扩大到其他 repo/session，不公开凭据、私人正文或本机路径；只有已授权本地文档/显式输入时仍可用 A。若 B 依赖外部在线读取，必须先选择符合无网络边界的独立来源机制，不能本轮暗加网络。
- **实施前补验项，不是漏洞结论**：[check](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L311-L321>)调用真实 caller 验证，[host authorizeCaller/authorizeSession](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1203-L1229>)核身份与自 session，[resolveSession](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1187-L1201>)及[controls.readSession 的完整 lineage 重验](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/index.ts#L134-L175>)核父链/owner/instance。业务 [scope 取自身 assignment](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L370-L381>)、[assign 授予时验父票子集](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1546-L1563>)是另一层；已读路径未见父业务票范围收窄的递归交集或级联处置。未来 effective scope/revocation 应明确传递撤权预期再补验；本轮无复现/生产证据，不以局部负证据断言系统漏洞。

## 6. 三方案与概念分层

| 方案 | 职责 / 代价 | 结论 |
|---|---|---|
| **A 默认 ref + session overlay** | 项目 tracker/任务文档保存正文、依赖、验收、完成；插件保存引用、assignment、T、执行/树关系与必要协作事实。无源可读时显示引用与未知，不补第二份完成真值 | **已认可方向，默认推荐**；要解决当前 put-ticket/statuses 前置与旧数据兼容，不能只改文案宣称完成 |
| **B 可选只读 source 投影** | 按需展示来源状态/brief 摘要，明确源版本/时间/权限；不本地编辑、不回写、不自动结算；源不可达继续 unknown | 可选推荐，不能默认常驻同步/抓全量历史；成本是身份、新鲜度、撤权与无网络契约 |
| **C 插件成为唯一 tracker** | 项目不再另记同一业务任务，插件承担依赖/claim/验收/跨 session 权威及迁移责任 | **不选**；与当前通用 tracker 非目标及已有项目工作流不符，不能以“唯一”掩盖替换成本 |

Native todo / goal **只作概念分层**：todo 是执行过程的临时步骤视图，goal 是长程目标/续行意图，tracker/任务文档才是约定业务任务权威，overlay 记录 session 协作事实。它们不互相认证完成；goal complete、todo 勾选、source close、T release、child end 是不同判断/事件。本轮没有扫描本机 SDK，也不声称审计了 native API、存储或生命周期语义。

## 7. 后续唯一建议与停止边界

细化推荐集中见[任务引用实施前契约](<TASK_REFERENCE_CONTRACT.md>)：最小 reference/overlay、source 身份/权限与撤权、新鲜度/无源读取、T/assign/delegate 兼容、旧记录显式承接及验收切片。本文只固定证据、风险与 A/B/C，不复制一份详细实施契约，也不预先规定新 schema 或迁移算法。

实现、测试执行、生产核账/迁移、提交、push、发版与安装均须后续明确授权；本轮到此报告为止，不自动追发补充研究或处置记录。
