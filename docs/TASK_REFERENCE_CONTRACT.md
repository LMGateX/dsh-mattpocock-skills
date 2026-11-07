# 任务权威与协作引用：实施前契约

- 日期：2026-11-07。
- **状态：所有者随后已授权0.16.0隔离开发、测试与push／发布；第11节为本批实施冻结，第1–10节保留前序研究推荐及当时边界，不冒称已实现；生产数据迁移与本机安装仍不包含。**
- 上位决定：[DESIGN](<DESIGN.md>)；证据与全工具风险矩阵：[职责研究](<TASK_AUTHORITY_RESEARCH.md>)；切片状态：[实施计划](<IMPLEMENTATION_PLAN.md>)；领域词汇：[词表](<../GLOSSARY.md>)。
- 本轮仅文档。没有改实现、测试、生成物、vendor、Profile、SDK，没有提交、推送、发版、安装、重启、启用管理或处理生产记录。既有 0.15.0 发布事实和本机未安装该版本的边界不变。

## 1. 已认可方向与事实归属

采用 **A：任务引用＋本会话协作状态** 为默认方向；B：来源化只读投影按真实需求另行选择；C：插件成为唯一 tracker 不选为当前路线。没有配置 tracker 时遵循既有任务约定，不自行 setup、创造插件业务账或强迫每次临时工作建票。

| 事实 | 权威载体 | 插件定位 |
|---|---|---|
| 正文、有效 spec／Agent Brief、验收、blocking graph、领取、业务关闭／重开／取消 | 项目约定的 tracker 或任务文档 | 引用；必要时展示带来源的观察，不另维护这些状态 |
| 技术选择、研究结果 | 既有 spec／研究文档；有真实难逆转取舍时按约定记 ADR | 指向它们，不为存记忆新建 decision |
| 用户真实未决问题、明确答复及来源 | 原生提问／消息；确需持久呈现时使用裁决仪器 | 保留真实作者、原事项和未决义务；落实回任务 |
| 本会话选择推进哪些任务，即 T | 会话协作记录 | 显式维护占位，不证明 tracker 的进行中或完成 |
| child 可访问哪些仪器对象 | assignment | 认证访问范围，不代替 tracker assignee／claim 或外部权限 |
| 运行／结局、树创建／Git 身份 | 宿主事件及有范围的程序核验 | observed 与 inferred 分开；不能推导业务交付或物理清理 |
| 已读／隐藏、历史留存／上下文选择 | 各自个人或留存记录 | 不是业务完成状态，不删除义务 |

一项业务事实只有一个正式修改位置。多个展示、带时间的报告和审计副本可以存在，但不要求模型逐一维护相同 done。原生 todo 是执行清单、goal 是持续目标，也不与业务票逐项同步完成。上游实际规范及例外见[研究第 2 节](<TASK_AUTHORITY_RESEARCH.md>)。

## 2. 新流程：只增加必要的引用，不增加任务登记仪式

1. 从用户约定／项目配置取得真实任务来源；按所用 Skill 读取必要正文、有效 brief／评论、spec 和依赖，不以仪器摘要替代。无需每轮重读所有文档。
2. 普通 lane 继续原生 subagent／subagent_fork／send_message。只有需要 T、仪器访问授权或任务关联时才保存引用；只读研究可以无票、无树，不为展示先建 workflow、票和字典。
3. 业务更新走既有 tracker／任务流程。插件只更新确有变化的占位、授权、关联等不同事实，不再接收另一份新业务生命周期。
4. 需要业务进度时展示已取得观察的来源、时间、覆盖和限制；不能取得时显示未核验，不要求人为补一份本地 statuses 来维持漂亮计数。
5. 结束 lane、释放 T、业务关闭、用户答复、树处置分别按其真实效果报告；不通过单一 completed 同时推导全部结论。

首批不新增通用调度器、业务审批表、自动建票器或新聊天输入框；沿用 DSH 原生交互与公共 UI。

## 3. 引用身份：handle、来源身份、导航地址分开

以下是语义要求，**不是当前可调用 JSON schema**。首批只承诺实例内稳定 handle，不建设全局仓库／来源注册中心。

| 信息 | 最小推荐 | 不可误用 |
|---|---|---|
| 本地引用 handle | 在 instance／workflow 内稳定，兼容既有 localTicketId／ticketIds 定位与权限语义 | handle 不包含业务状态，不是 URL 或访问凭证 |
| 远端来源身份 | 已知的来源实例／命名空间、项目标识、来源稳定任务 ID；不能证明时保留未核验定位 | 两个项目的 #42 不能合并；标题、URL 或更新时间不独自证明同一任务 |
| 本地任务定位 | 已验证的仓库锚点、工作树根相对路径，必要时条目锚点 | 当前 common-dir、HEAD、同 remote URL 不能冒充跨 clone 的永久仓库 UUID |
| 导航地址及别名 | 当前可读 URL／路径；仅有明确来源依据时记录别名或搬迁关系 | 不按同名、路径相似或 URL 字符串自动合并／重授权限 |
| 展示标题／来源报告 | 可选的最后已知名称、作者与时间，不要求复制正文或声明状态轴 | 改标题不改身份；作者转录不认证源内容 |

现有 Git probe 只证明其可观测身份范围，见[实现](<../src/controls/git-worktrees.ts#L39-L85>)。文件改名、搬迁、换 clone 或 tracker 转移后，证据不足就保留原 handle 和未知关联；有依据的关联变更需当前授权、修订与可追溯来源，不批量重键旧历史。

同一 workflow 内已证同源别名复用原 handle；不因 alias 共享其他 workflow／instance 的 ACL。来源版本不进入任务身份键，否则每次更新都会制造新任务。未核验引用可以导航和承载受权的本地安排，但不能声称已验证唯一源、源状态或去重完毕。

真正用户问题可不关联票：在实际目标 workflow 中使用空 axes、无 ticketIds 的既有路径；child 若获该 workflow 空票范围，仅按现有 creator 规则访问自己提出的无票事项。没有 workflow 的 child 把问题交主代理／原生提问，不伪造票绕过 ACL；OFF 不为新问题自动开功能或创建对象。现有[workflow／票存在检查](<../src/controls/instrument-state.ts#L385-L398>)及[无票事项权限](<../src/controls/instruments.ts#L112-L116>)仍是当前事实。

## 4. T：保留局部推进单元与显式释放

**首批推荐保持既有 (instance, workflow, handle) 命名空间及 generation。** 同 workflow 的同一 handle 只有一个占位，多 child 共用它不增加 T；跨 workflow 指向同一来源任务可以计两个显式推进单元，必须注明 T 不是外部唯一任务数，更不是第二份业务状态。全实例 canonical 去重会改变谁可释放和权限关系，不在首批静默引入。

- 新 reserve／reacquire 只需最小受权引用，不再要求 title＋statuses 业务票或新状态字典。workflow 仅作真实协作分组；空 axes 不是额外业务阶段。
- reserve/release/reacquire、代次与 operationId 绑定、过期代次忽略和并发保护保持。[现行窗口](<../src/controls/windows.ts#L735-L763>)与[幂等绑定](<../src/controls/windows.ts#L928-L931>)是回归基线，不是已经支持 ref-only。
- release 仅表示退出当前推进集合。暂停、移交或转向其他工作也可按任务约定退出；不要求先写 delivered／blocked 才能释放或继续下一票。推进纪律由 Skill／用户约定决定。
- 不因某个 child end、tracker closed、源不可读或 UI 隐藏自动 release；也不因释放 T 自动改业务 done、清 decision 标记或释放 S。多 child 的整体安排由有权操作者处理，不加隐式 child 引用计数器。
- 源 404、离线、版本冲突或源读权丢失不应卡住已有本地占位释放；仍核当前插件身份、scope 与 generation。插件 assignment 已撤的 child 不能继续释放，交 owner／有权 coordinator 收尾。OFF 禁新占位但保留合法旧 release，不能顺手 reacquire。[现行 release 跳过票存在检查](<../src/runtime.ts#L1190>)不能回归。
- 旧 terminal 计算的 pendingRelease 只作旧报告提示，不认证外部完成；新引用若无源状态，不伪造 terminal。T 选择数、受权子集、来源任务去重数、tracker 总票数分别标注，未知不显示为 0。

## 5. 读取与来源时效：先做诚实报告，不默认增加抓取

### 5.1 两个独立维度

当前 [model current](<../src/runtime.ts#L519-L545>)只证明插件本地记录读到了当前版本。推荐读取／UI／模型消费均区分：

1. **本地读取健康**：当前本地版本是否成功取得、是否有持久提交未知或历史缺口。
2. **来源观察**：读的是哪个真实来源、取得时间、可证明的源版本／截点、覆盖正文／评论／brief 的范围，是否已知变化或无法复核。

源版本未知就报告“最后一次作者报告／未核验”；最近取得也只是 as-of，不承诺之后未变。TTL 只能决定何时提示刷新，不能证明授权或实时一致。内容 hash 可检测内容差异，不能认证来源、作者或权限。

同一个业务统计不能把不同来源版本／取样时刻拼成联合 current。原始票字段可保持源状态、多轴或部分完成，不强行映射固定完成分类；覆盖不全时只报已观察范围和缺口，不宣称完整票数、frontier 或完成率。正文读取不能自动已读、答复、释放、归档或建任务。

### 5.2 A 的最小落地与 B 的独立条件

A 允许代理经已有授权工具按需读取，再以真实 agent 作者报告取得的观察及指针；这是 authored 报告，不包装成插件已验证源。引用导航不触发插件访问网络，不凭链接读取新文件或扩大 sandbox。

B 如有明确需求，先选择一个真实来源和可信读取／授权 seam，复用实际宿主能力；无该能力时保持 ref-only，不增加无人维护的通用 Adapter 框架。现行[离线约束](<DESIGN.md>)仍有效：不新增后台轮询、runtime fetching、跨 tracker 写入或双向同步。若确需改变离线约束，必须另获明确批准并更新设计；本方案不包含这一批准。

B 的缓存／分页至少绑定来源限定身份、可信源版本或 snapshot cut、caller／owner／instance／scope、可核验授权代次。版本或权限变化使旧页／locator 失效，必要时从第一页重开；没有可靠 source token 只能降级 as-of／unknown，不沿用本地两秒刷新假设冒称源 current。不以派生 history、旧授权正文或最近一次成功请求作为权限恢复 fallback。

来源身份必须进入记录／历史定位：当前 [history latest](<../src/controls/history.ts#L123-L125>)按 kind＋recordId 聚合，仅换 sourceDomain 不足以区分两个来源同号条目。保持既有 suppression 与源清理覆盖，不以换 ID／domain 重捕获已删除正文。

## 6. 授权、委派与 decision 引用兼容

- 引用不是权限；插件 coordinator 不是外部 tracker 管理员。源正文／标题等的自动读取与合并，需插件授权与每个来源当前授权同时允许；多引用不得“命中任一”便放行整个对象。无法证明的源授权 seam 不以自制 rights facade 补齐，退回 ref-only。已存在的 authored 报告依其自身保存／可见性契约处理，不能重新认证为源当前事实。
- 保留 owner／instance 身份、真实直接 child、父当前授权子集、变更前后全部关联票检查、历史逐版本过滤、撤权／缓存／locator 围栏；授予仪器范围不等于 tracker assignee、claim 或源端写权。
- **补验项**：父范围收窄后旧孙辈授权的即时有效性不能只凭 grant 时子集校验宣称成立。推荐委派来源的有效权限不超出仍有效的祖先委派链；独立 owner 授权须按真实来源区分。实现前核验当前调用链，冻结失效语义和回归，不将静态局部阅读冒称已证实漏洞或已具备级联撤权。
- 当前 decision.ticketIds 是工作流本地票引用，参与授权且被 fold／checkpoint 校验。**不能把它直接换成 URL，或只删 put-ticket 指导便宣称完成解耦。** [引用约束](<../src/controls/instrument-state.ts#L395-L400>)、[前后授权](<../src/controls/instruments.ts#L464-L475>)均需配套处理。
- 推荐新引用仍保留窄本地 handle；在明确的新引用登记能力上接入 T／assign／decision，旧票仍以原 handle 读取。优先复用现有 record/window/assign 的工具座位，不新增并行工具族；具体 action、字段、存储版本与旧宿主协商在实施前冻结，不能声称当前 schema 已支持。
- 新引用登记不存新 statuses／summary／disposition 业务生命周期，不用空壳 put-ticket 或通用 decision 日记绕过缺口。旧 put-ticket 完整解析／重放／受权旧对象收尾保留；新流程与旧对象的技术区分不能靠日期、作者种类或标题猜测。

## 7. 旧记录、移交和故障恢复

既有票可能是外部镜像、唯一存有有效任务的本地记录、混合报告或来源缺失。逐项有依据才处理，不把全部旧票视为垃圾，也不为消数字制造空任务。与[决定兼容契约](<DECISION_LEDGER_COMPATIBILITY.md>)共同遵循：

1. 在有权入口固定原 ID、修订、作者／来源、有效任务约束、T 与关联范围及可见上下文覆盖；没有授权入口就报告缺口，不扫底层生产存储。
2. 有承诺需要移交时，先确认实际任务／任务集合完整承接，必要答复、适用／排除条件和指针在有效任务上下文仍可发现；只有 URL 不证明承接。插件是唯一载体时，先经既有任务约定保存真实内容，不自动改成 C。
3. 新关联或旧对象收尾逐步显式提交，保持原作者和历史；不覆盖旧 result／context，不自动设置 included、不抹 excluded。pending／awaiting／contextConclusions 依现有规则保留，移交不等完成；未决和未知不能被减账吞掉。
4. 本地 CAS 不保证源端并发，多个存储域没有联合事务。分别报告引用、assignment、T、来源观察、历史捕获、通知的已成功／失败／未知；不得把引用成功当成其余全部完成。
5. 同 operationId 重试先重验当前权限，恢复未完成效果；源端业务修改继续使用真实来源并发规则。提交不确定时先复核持久状态；storage-uncertain latch 按现行关闭／重开与核对恢复，不以新 ID／wrapper 绕过。已接受 child 不重建。
6. OFF 不开启 ticketProgress／windows／pendingDecisions，也不新增引用／票／事项来补迁移；旧对象的合法查询与显式收尾继续可用。回退引导／UI 不回滚已经发生的源修改或历史；修正用有来源的新变更，不恢复整份旧文档覆盖并发。

这是后续获授权时的一次性兼容过程，不增永久迁移分类账、常驻核账审批或定时清零器；本轮没有执行，包括此前目标会话的 88 项。

## 8. 其他工具的收窄范围

| 区域 | 推荐保留／收窄 | 不包含的自动效果 |
|---|---|---|
| workflow／ticket | 分组与引用；旧自定义报告只读兼容和必要收尾 | 不再另设新业务状态字典或同步完成账 |
| decision／个人 view | 真实用户问题／答复、来源；个人 read/hidden 独立 | 不凭已读／隐藏／任务链接清 pending 或 await |
| assign／controls | 真实访问范围、配置读取与显式受托写、各自 CAS | 不自授、不开管理、不以业务票变更隐式改策略 |
| worktree | observed／inferred／authored 分层，沿用原生建树／目录／Git 操作 | cleaned 是处置报告，不证明物理删除；header 不证明实际 cwd |
| legacy resource | 按需兼容查询；退出默认模型工具面作为后续减面候选 | 不恢复资源退休业务 gate，不删除旧引用或物理保护 |
| history | 受权追溯和有界读取；破坏性管理与日常查询分开暴露作为候选 | purge／退出注入不是任务完成，也不删除外部任务或磁盘树 |
| opt-in delegate | 继续默认不注册，仅必要持久意图／绑定／幂等及部分成功恢复 | native＋assign 未具等价语义前不硬删 journal，也不恢复通用派发包装 |
| optional audit／supervision | 保留可选观察及不确定观点；优先去掉固定“插入检查子任务”的调度建议，再单独讨论主动注入策略 | audit 读本身不调模型；监督旁路不是已自动派发或业务审批 gate |

研究矩阵给出各项实际入口与反例。上述后续候选不是本批全面退役授权；source freshness 与票引用优先，其他表面可分批独立决策。

## 9. 实施切片与冻结点（均未获执行授权）

| 切片 | 推荐内容 | 完成条件 |
|---|---|---|
| T0 文档 | 本契约、证据、领域词与权威入口 | 方向／建议／现状分开，引用及独立复核完成；仅本轮交付 |
| T1 最小引用闭环 | 窄引用登记＋workflow空字典＋T／assign／decision引用完整性、授权、读取／消费／UI一致 | 无业务票也能合法走完整相关路径，不造空壳票；旧格式与OFF收尾回归 |
| T2 旧对象兼容 | 旧票报告呈现、显式来源关联与旧标记／上下文保留 | 无自动清账；迁移执行另获目标数据授权，原始计数与新引用数量分开 |
| T3 可选来源观察 | 明确单一来源、现有受权读取 seam、版本／时效／历史 namespace | 不需要时不做；能力不足保持 A，不靠新 fetching 解围 |
| T4 默认工具减面 | 监督建议与资源／历史候选逐项实施 | 独立范围／兼容与用户入口，不捆绑到 T1 |
| T5 交付 | 真实 seams、独立复核、源／精确制品／宿主验证 | 实现、提交、push／发版、本机安装各自有明确授权，不借旧0.15.0授权续做 |

**T1 不得半切换发版。** 仅改提示要求“不建票”而 reserve／decision 仍拒绝引用，或只改 UI 名称，是未完成；需要同一交付中闭合实际写入、读取、ACL、旧格式／新 action 能力探测和消费路径。不支持新能力的旧宿主只能保持旧兼容读／收尾并明确限制，不能静默回退造业务票。

T1 开工前固定：新 action／字段和最小存储表示、旧 checkpoint 引用升级与回放、业务／技术／viewer 修订用途、父链收窄语义、兼容版本／能力协商。优先比较复用既有 records 领域与窄映射，避免新增平行账本；未确定表示前不许声称 wire／storage 零变更。若需要超出本推荐的领域变化，先更新设计并明确批准。

## 10. 验收情景

下列是未来实现门槛，不是本轮已通过的测试：

| 情景 | 必须观察到的结果 |
|---|---|
| tracker已改、插件本地未改；只有标题摘要 | 本地 current 不冒称源 current，执行前仍读必要真实契约 |
| 不同项目／来源均为 #42，或来源版本改变 | 不碰撞；新版本不生成新任务身份 |
| URL改名、本地文件移动／换clone | 有依据才接别名；未知不自动合并／扩权，不要求全局repo注册 |
| 同workflow别名、多child；跨workflow同源 | 前者复用一占位；后者按显式局部推进单元计数并说明口径 |
| 无票研究、无票用户问题、无workflow child | 不建假票；问题按现有creator／主代理路径，不借关联洗权限 |
| 源404／失源读权／OFF，仍有本地T | 有插件权限者能release；撤插件权限者不行，owner可收尾；不自动done |
| reacquire后迟到release、重复operationId、并发CAS | 代次围栏／幂等有效，不误释放新占位 |
| 真实父范围收窄、旧孙grant、独立owner grant | 按冻结的有效授权语义测试；旧alias／缓存不成为扩权路径 |
| 多ref只有一个可读、缓存热时撤权、旧locator | 不泄露合并正文／标题／计数；重新授权先于内容返回 |
| 源版本／scope在分页中改变，无可靠token | 拒绝拼页，重开或降级unknown；TTL／hash不代替来源证明 |
| 同号跨源history、purge后再capture、重启 | 来源限定键与suppression正确，不复活已清理内容 |
| 源端成功、本地关联失败／通知失败／提交未知 | 分步结果和恢复清晰，不重建child、不盲重做源修改 |
| legacy票唯一承载承诺、await混合事项、excluded结论 | 先承接必要上下文再显式处置；不以计数下降验收完成 |
| 真实导出UI／mounted工具／模型注入与精确归档 | 共同口径、原生控件、授权与预算不回归；fixture不冒充生产／当前GUI验收 |

本轮文档完成的验收仅为：有证据的推荐、明确未决冻结点、可发现的入口、有效相对链接与文档限定 diff；不运行模型试验或宣称运行时新行为已经生效。

后续引用闭环还须继承[上下文／性能／时间预防性复核](<INSTRUMENT_CONTEXT_CACHE_RESEARCH.md>)的既有保护：时间由程序记录、本地当前不认证来源／provider缓存、实际可见baseline去重及授权／frontier不弱化；其中C1–C4仍为独立候选，不自动加入T1改造范围。

## 11. 0.16.0 实施冻结（2026-11-07，最新授权）

本节把第1–10节的实施前推荐落实为本批Interface；其“未授权／仅文档”描述保留为上轮研究历史。所有者已授权隔离subagents开发、测试、push／发布，不为本机安装；全局边界以[DESIGN的0.16.0节](<DESIGN.md>)为准。

### 11.1 窄引用、来源与本地handle

- 复用record apply，新增action `put-task-reference`，沿用operationId／expectedRevision／workflowId／references，加localTicketId和value；不另注册模型工具。value仅含 `source`、必需非空导航 `locator`、可选非空展示 `label`。不接受业务statuses／summary／disposition／claim／正文、作者或时间。
- source三种互斥形状：`{kind:"external",instance,project,taskId}`；`{kind:"repository",repositoryAnchor,relativePath,anchor?}`；`{kind:"unverified"}`。身份字符串使用已有bounded id／text验证，仓内relativePath不得绝对／逃逸；locator仅导航，插件不读取网络或任意路径。repositoryAnchor是作者声明的锚点，不自动认证为永久Git身份。
- 来源及导航均是实际作者报告；source identity创建后不静默替换，label／locator可用原业务CAS更新。首批不增加alias图、unverified→known隐式转换或来源迁移器。source版本不入身份；旧externalRef字符串不作认证／合并依据。
- 新记录独立进入 `taskReferences` 集合，绝不制造TicketValue或空壳业务票。既有 `(instance,workflow,localTicketId)` 作为窄handle namespace；同workflow不能与legacy ticket碰撞。相同已声明非unverified来源tuple复用同一handle，重复新handle拒绝；这是本地声明一致性，不证明源端唯一任务／状态。无权child的冲突消息不暴露其他handle／标题。
- Workflow可沿用title＋空axes，不为引用创建业务状态字典。无票研究／原生提问仍可无引用；既有无票事项creator-only语义保留。

### 11.2 存储、回放、读能力与统计

- InstrumentDocument新增V3，沿用V2 checkpoint／tail／dedup／coverage机制并保留独立taskReferences；V1/V2继续严格解析／回放，派生无引用集合，不为读取写迁移。首次新引用在原业务CAS中升级为V3并追加真实事件；新action仅允许V3，后续compact／purge／reopen覆盖引用target与完整证明。旧binary遇V3明确不支持，不降级回写。
- TicketValue、legacy ticket历史ID及业务报告完整保留。新增history／record query kind `task-reference`，recordId仍为 `[workflowId,localTicketId]`；不得改kind或换ID绕过suppression。
- 完整／current读取提供显式固定能力标记 `capabilities:{taskReferences:true,storageVersions:[1,2,3]}` 及taskReferences集合；摘要统计将task reference数与legacy totalTickets／statusCounts分开，不声称外部总任务数或完成率。轻量用户裁决summary不塞新正文。旧端缺标记按不支持，不能fallback建业务票。
- 当前模型coverage仅认证local-current，引用来源标注 authored／未核验或未观察；没有source读取就不造source current／status。实际history捕获、context选择、归档／purge、查询／detail、消费和原生UI同一口径。

### 11.3 T、assignment、decision的同批闭环

- window.localTicketId／assign.ticketIds／decision.ticketIds保留wire名称，统一可指受权legacy ticket或task reference handle；存在性检查查两个集合。T同handle一占位、多child不多计；跨workflow同源仍是局部推进单元。WindowDocument与RuntimeDocument保持原版本／generation契约。
- reserve／reacquire／assign／opt-in delegate在本地引用读取unknown时失败关闭，不沿用legacy“登记读取失败即放行”的缺口；不因此限制无引用原生工作。release继续不依赖源／本地票读取成功，只核当前身份／effective scope与generation，OFF可合法旧release。
- 新引用／空字典协作分组可在windows／ticketProgress／pendingDecisions任一configured时登记；全部OFF不新建，旧对象受权读取／必要显式收尾继续可用，不顺手开功能。
- 所有TaskAssignment均为实际直接parent→child链式授权，现有parentSessionId足够，无独立跨链owner override／新授权图。owner root对其真实direct child可直授；operator若经某parent管理上下文赋权，也不绕过该parent当前effective上界；不改变operator协调者读取／设置权。
- 读时同instance真实父链求交，赋权／dispatch写入在同一runtime CAS old内重算有效父范围；缺链／循环／跨instance／宿主parent冲突失败关闭。scope、snapshot.assignment、模型assignment detail、历史逐版本、locator／cursor及缓存失效均使用effective权限。上层收窄即时遮蔽；重新扩大可使原raw grant重新有效，这是当前上界求交，不宣称永久撤销／级联删除。
- decision变更前后所有关联都须受权，旧ticket与新reference都校验；无票creator规则、原作者、个人view、通知、业务／viewer修订、CAS／幂等和提交未知latch不弱化。

### 11.4 上下文、时间与工具最小改进

- 既有单一owned快照内：稳定指导先于volatile native outcome／pending-release通知，最后仍为原facts marker＋完整JSON。保留同admitted step上限与真实baseline恢复，不拆静态仅一次消息、不改delta-only、不删原生历史。变化检测覆盖完整渲染语义，单独pendingRelease新增／清空也能被消费Interface提供；viewer-only／资源读采样时间仍不构成变化。
- RefreshGate构造位置保留，注入clock明确elapsed，默认monotonic performance.now；epoch／scope容量与in-flight失效不变。业务recordedAt／registration／updatedAt、持久监督episode／预算仍用wall。此批不改Host catalog／监督的其他wall退避，也不宣称全宿主时间问题已修复。
- 纯排序key复用仅限一次投影内decorate／sort／undecorate，经公开消费seam工作计数证明后选择；不缓存任意snapshot／巨型正文，不改model-output权限或locator完整性。测量区分队列等待、冷历史、当前N、正文B、hash估算、写／捕获及消息安装／累计字节，合成计时不作线上SLA。
- 移除监督固定“插入临时subagents检查任务”的安排，改为主代理按现有任务约定判断；不改监督触发／持久记录／自动模型调用策略。resource／history注册与管理动作本批保持兼容，不借本授权打包全面减面；delegate仍opt-in。真实provider效果测量不在本批，不报告未取得的hit率。

### 11.5 writer与验收seams

- A core：instrument-state／instruments／history／controls导出及专属领域回归；B runtime/model：runtime／model-tools／host及专属装配／权限回归；C client：真实导出client／必要Remote类型及原生只读呈现；D context/time：consumption／RefreshGate／监督文案及专属计数／时钟／消费回归。每writer一个独立工作树，主代理串行集成；D中的新引用facts接线待A/B类型后补齐，禁止并发共享生成物。
- 领域公开Interface测新引用→decision→compact／purge／reopen与授权证明；真实Runtime／mounted工具／Remote测T／assign／父链收窄／旧locator／OFF释放／partial success；导出React测来源／未知／两类计数／身份与只读无写；现有baseline／frontier／通知／历史／监督回归全部保留。按竖切RED→GREEN，不以只测新formatter替代真实装配。
- 集成后独立Standards／Spec复核，source完整suite／strict types／build／vendor、精确归档与隔离双宿主／原生UI门禁，再冻结唯一source／新tag／五资产Release及下载回验。生产88项和其他存量不实迁移；引用成功、T释放、来源关闭、child结局、树处置分别报告。

