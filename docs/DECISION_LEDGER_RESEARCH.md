# 裁决账本职责研究：用户问题、技术决策与落实任务

> 2026-11-07 后续授权：所有者已认可第一批方案，并要求 subagents/隔离开发测试、push 发布及本机安装；当前实施范围与门禁以 [DESIGN.md](<DESIGN.md>) 的 0.15.0 节为准。下文“仅文档/待实现授权”保留为研究阶段历史，不阻止本批实现；不授权目标 88 项业务处置、全面重造其他 UI 或服务中断。

- 日期：2026-11-07。
- 状态：**所有者于 2026-11-07 认可方案 B 的设计方向：用户裁决为核心、技术选择回文档、落实回任务。具体迁移/兼容细节与执行尚未授权。** 权威决定见 [DESIGN.md](<DESIGN.md>)；UI 层次独立见[仪器 UI 契约](<INSTRUMENT_UI_HIERARCHY.md>)。现有运行语义未修改，认可不证明 88 项已核账。
- 本轮只修改研究/设计/计划文档，不改 vendor、实现、工具 schema、消费、存储、Profile 或会话记录，不清理历史，不提交/发布/安装/重启。

## 1. 问题与证据边界

用户提供的会话截图显示待用户裁决数量很小而待落实为 88，提出两项质疑：可能业务已经落实但没有更新账本；普通代理自决事项是否不应进入面向裁决的仪器。这是领域边界与重复记账风险，不只是列表缺少折叠。

本轮没有取得该会话当前授权完整账本及逐项执行依据，**没有验证 88 项分别是什么、是否已完成、何时创建或是否重复**；也不把当前研究会话的 0 项当目标会话状态。只读源码可证明产生积压的机制，不能证明目标全部为误留。当前工具不提供指定另一会话的授权账本读取入口；不通过底层文件读取绕过仪器范围。后续逐项核账需在有权访问的会话/用户入口读取当前记录和相关任务依据。

上游依据是本仓固定 vendored 内容，不是当前网上最新版：来源元数据标为 upstream v1.3.2 / d1478fcb140db0b93c0c8df17bcfd311844749d0，见[来源](<../vendor/mattpocock-skills/.distribution/upstream.json#L1-L13>)。本仓交付选择为两个通道各 27 Skills，见[实施基线](<IMPLEMENTATION_PLAN.md#L7>)；结论不外推未收录、后续或其他生态版本。

## 2. 上游如何承载决策和执行

| 内容 | 一手材料 | 可得结论 |
|---|---|---|
| 实现与测试决策 | [to-spec](<../vendor/mattpocock-skills/skills/engineering/to-spec/SKILL.md#L43-L65>)的 Implementation Decisions / Testing Decisions | 模块、接口、架构、schema/API/交互与测试选择可写入 spec，不需要为每项创建另一份待裁决记录 |
| 执行拆分与验收 | [to-tickets](<../vendor/mattpocock-skills/skills/engineering/to-tickets/SKILL.md#L25-L65>)与[票模板](<../vendor/mattpocock-skills/skills/engineering/to-tickets/SKILL.md#L69-L105>) | 任务、blocking edges、状态、验收标准有票承载；本地每票文件或配置的真实 tracker，而非第二本待落实清单 |
| 重要、长期的领域/架构取舍 | [domain-modeling](<../vendor/mattpocock-skills/skills/engineering/domain-modeling/SKILL.md#L60-L74>) | 词汇进入 glossary；仅难逆转、缺上下文令人意外、存在真实权衡时记录 ADR，不为每个小决定写 ADR |
| 真正待人决定的问题 | [grilling](<../vendor/mattpocock-skills/skills/productivity/grilling/SKILL.md#L6-L30>) | 事实由代理查证，问题与建议给用户，等用户回答；共享理解确认前不执行，不是代理自问自答 |
| 研究结果 | [research](<../vendor/mattpocock-skills/skills/engineering/research/SKILL.md>) | 以一手材料研究并写带来源文档，研究发现本身不等于等待裁决事项 |
| 决策探索地图与唯一载体 | [wayfinder](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L15-L25>)、[HITL/AFK 分类](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L73-L80>)和[完成记录](<../vendor/mattpocock-skills/skills/engineering/wayfinder/SKILL.md#L118-L126>) | 明确一项决定只在其 ticket 中存正文，地图仅作索引/指针；区分人参与决策与可独立研究/任务，结果写 resolution comment 并关票，不需复制到第二本 DSH 决策账 |

尤其值得注意：[上游 changelog](<../vendor/mattpocock-skills/CHANGELOG.md#L271-L275>)解释 facts vs decisions 的调整正是为了防止代理在 resolve-the-ticket 框架内把问题自己答掉。它限定 grilling 的访谈职责，不代表代理不能自主完成已授权范围内的普通实现选择。

名称/历史边界：[changelog](<../vendor/mattpocock-skills/CHANGELOG.md#L236-L257>)记载 design-an-interface 已并入 codebase-design 的 DESIGN-IT-TWICE，to-prd 改名 to-spec。不能以当前选集中不存在的 write-a-prd/prd-to-plan/prd-to-issues 正文作证，也不能把旧名字当另一套必须额外运行的流程。

**结论：在核验的上游材料中，有成熟的 spec/票/ADR/研究文档承载路径；没有为这些普通选择再向本插件 put-decision 登记并维护 awaitingImplementation 的要求。** 本插件专用工具、通用 decision 账本与其 UI 都是我们的扩展，不应冒称 Matt Pocock 原生工作流要求。

## 3. 本插件实际上允许什么

旧[记录契约](<INSTRUMENT_RECORDS.md#L13-L24>)允许 question + 自由 status，以及可选 pending、awaitingImplementation、addressee（user/agent/unspecified）、背景、结果等；可选字段省略保留旧值。这是一个通用业务记录容器，不是只接受用户问题的队列。现[词表](<../GLOSSARY.md#L29-L32>)也把 decision item 与 user decision 分开。

- [统计](<../src/controls/instruments.ts#L237-L260>)先按授权过滤：待你裁决为 pending=true 且 addressee=user，待落实仅为 awaitingImplementation=true。两者独立、允许重叠，不依据 status/result、票完成、read/hidden 自动关闭。
- [更新](<../src/controls/instrument-state.ts#L395-L400>)浅合并旧值与新值：已有 awaiting=true 时，省略该字段会继续保留；新工作流/文字状态完成都不等于明确清除。这解释了“已做但漏记”为什么可能长期存在，不是目标样本已证结论。
- [当前源码中的模型引导](<../src/controls/consumption.ts#L247-L267>)明确以“需要用户裁决”为条件，OFF 时不新增；本次未在该源码引导中发现每票创建自裁决/每次更新自动置 awaiting 的命令。不能把通用 schema 的能力等同于模型一定会如何使用。本次实际会话注入仍可见较宽泛的“Register pending decisions when you judge them necessary”，它也不是每票强制登记，但有理解空间；该运行时观察不等于当前源码已在目标 GUI 加载，本轮未做安装/激活版本核验。
- [当前上下文消费](<../src/runtime.ts#L748-L759>)持续投影 pending 或 awaiting 事项；已解决且有 result 的记录还可作为 included contextConclusions。通用账本已同时承担用户问题、代理上下文结论和后续任务的角色，职责混合是可确认事实；写入量的实际成因仍须目标会话证据。
- [侧栏编辑器](<../src/client.ts#L812-L846>)以真实用户作者保存，并保留自由状态、pending 与 awaiting 两个显式选择。不能为了清账而自动模拟用户答复；也不能把“由 agent 调用工具登记”一概当自裁决。

### 为什么不仅是模型忘记记账

如果同一个执行动作同时出现在 ticket 与 decision.awaiting，模型必须在两套对象里分别收尾。两者没有共同业务完成条件或可靠关联时，“票已交付而事项仍待落实”是结构性不一致风险。单靠更强的“记得更新两个地方”提示词，可能增加上下文、重复写入与无意义提醒；这是一项设计评估，不是已测得的漏账率。现有机制测试通过只证明投影/保存规则，不证明真实任务每次都会正确收尾。

## 4. 已认可的职责分工（设计方向，尚未实现）

| 场景 | 推荐主承载 | 裁决仪器是否新增事项 |
|---|---|---|
| 用户需要选择产品行为、范围、风险取舍或给予必要授权 | 原生提问/会话答复 + 一个对应用户裁决记录 | 是，确有未决问题才登记；用户沉默不是许可 |
| 已有明确用户答复，agent 记录其理解和来源 | 原事项更新 + 既有 spec/票引用 | 可以更新原记录；agent 作者不冒充用户亲自点击，不再新建“自裁决项” |
| 已授权范围内的普通实现细节、技术选择 | spec 的 implementation/testing decisions，必要时 ADR | 通常不新增；不是把所有内部思考搬进用户关注区 |
| 缺事实、日志、测试结果、诊断 | 研究/诊断报告、测试证据、原生工具记录 | 通常不新增；只有仍需用户作出的具体选择才形成问题 |
| 决定后的实际执行动作、验收、完成/暂停 | 既有 ticket/任务计划及交付记录 | 不应为同一动作维护独立第二份完成状态 |
| 下游 child 请求上游代理技术澄清 | 原生 send_message/任务交接；必要时更新任务文档 | 不默认升级成用户裁决；真正用户问题由主代理转交 |
| 对既有决定的长效背景保留 | spec/ADR/原记录历史 | 不为保留上下文而永久占 pending 或 awaiting |

“不是用户裁决”不等于“不能记录”，也不能把所有非用户记录都宣称为违反旧契约：原先真实未决、后由有权代理处理并收尾的协作事项，与从来无需裁决却先自问再自答的日志不同。问题是应放哪里、谁会消费、为什么要一个长期未清标志。仪器有价值的部分是跨对话可见的真实未决交接，尤其用户问题、明确答复与来源；不是代理选择的通用日记。

合理的待落实反例：用户明确选择“退役旧兼容桥”，跨票迁移/发行仍未完成，一条原 decision 指向这些任务可说明决定尚未兑现。它不等于为每张迁移票再建一个 awaiting decision；也不证明所有 awaiting 设计都无价值。已认可 B 要解决的是重复完成真值与来源，必要的决定→任务关系可以保留，不能为了简化 UI 丢掉真正未完成承诺。

## 5. 方案比较与选择（已选择 B）

| 方案 | 优点 | 代价/限制 |
|---|---|---|
| A 仅保留通用账本，补说明和收尾提示 | 兼容代价小 | 未解决重复记账与语义混杂，只能缓解 |
| **B 用户裁决为核心，落实回到任务（已认可方向）** | 待用户事项清楚；技术选择回 spec/ADR，执行回票；减少第二套状态 | 必须设计旧数据兼容、用户答复到原记录更新、上下文结论替代与存量核账 |
| C 通用决策日志与用户裁决/后续行动拆成独立领域 | 各类记录可各自明确 | 接口/存储/迁移/消费面更大；容易在现有文档/票之外又造一套系统，不建议无真实需求先造 |

已认可 B 的最小方向：新流程不再要求普通代理决策登记；待用户队列仅承载真实待答问题；用户答复仍更新原事项。落实链接既有任务，不再维护同一动作的第二套独立完成状态。必要的决定→任务关联可保留。具体推荐已在[实施前兼容草案](<DECISION_LEDGER_COMPATIBILITY.md>)细化：主关注不再把“待落实”当执行队列，次级记录核对显式承接兼容标记，保留 wire/storage/原始计数与必要旧对象更新；任务只持一份完成真值，来源/上下文移交不丢。该推荐不冒称已获实现批准，**本轮不改变实现或存量**。

不得用“agent 作者”过滤来实现 B：agent 登记用户问题、转述明确用户答复都合法。应按记录用途与待答对象区分；不能靠自由 status 文本或结果关键词猜业务结束。也不引入新的通用审批表/自动业务裁判。

## 6. 存量核账与迁移前提（尚未执行）

1. 在有权访问目标会话的入口读取当前完整记录，固定修订与授权范围，不把摘要分页当全量。只输出必要统计，不传播私密正文。
2. 按用途分组：真正待用户回答；有后续行动且仍未完成；已有依据表明已完成但 awaiting 未清；纯技术决策/日志；被替代/撤回；证据不足。加总与原授权计数对齐，两标志重叠单独报告。
3. “可能已落实”不能直接转成 false；由有任务上下文的模型/用户核对记录、关联票和来源。未知单列，不伪造创建时间、执行或完成证明。
4. 方向已认可，实施前仍须定义兼容策略：旧 agent/unspecified 记录可读并可显式收尾；不因新规则拒绝必要旧对象更新；authored 归属、CAS/幂等、history/清理覆盖、OFF 收尾与跨 Session 隔离保留。
5. 不直接删除 88 项、不按状态关键字批量清零、不把归档/隐藏当已落实；迁移与数据处置须单独授权并留可核对结果。
6. 真正实现前验证所有面：模型说明/消费/工具 DTO、Remote/客户端/通知、上下文结论、轻量与完整摘要以及历史；只改 UI 过滤会掩盖义务，不是领域修复。

## 7. 本轮结论

- 用户的质疑有源码与上游材料支持：通用决策日志、用户问题与实施待办混在同一仪器中，容易形成与 spec/票重复的账本。
- 88 是值得调查的警讯，不是已经证实的 88 条漏账或 88 条真实未完成。
- 推荐用户裁决为核心、技术选择进入既有文档、落实进入既有任务；先确定边界再修领域模型，不以 UI 折叠掩盖问题。
- UI 认可与领域方向认可已分别固定；兼容/迁移已形成具体推荐草案，旧数据处置与实现仍须明确授权、目标 88 未实核。没有为讨论本身登记一条新的“自裁决”去增加同类记账。
