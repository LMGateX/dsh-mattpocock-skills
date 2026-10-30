# 侧挂监督：工作台账 + 交付审计（设计说明，已获认可）

> 2026-10-30。**状态：设计已获所有者认可；独立配置、内存工作台账、可选 mattpocock_audit、持久化审计 episode、事件驱动定期/嫌疑判断、dry-run、可选 reviewer 路由、每小时/每日/token 预算、alert 门槛、固定 agent 注入句和只读右栏/设置页 episode 列表已实现；功能默认关闭。真实模型试验仍未完成。** 安装、启用、发布和真实模型试验仍另行决定。
>
> 公开仓库边界：本文不记录内部项目名、会话原文、私有路径或事故日志；相关离线评估材料应保存在仓库之外的私有位置。若该功能进入实施，仍须按 [DESIGN.md](DESIGN.md) 的变更控制更新已接受设计，并单独处理 [ADAPTER_SCOPE.md](ADAPTER_SCOPE.md) 中“停止扩展通用行为审计器”的范围决定。

## 0. 本版修订

相对上一轮口头方案，本版先固定以下修正：

1. **删除“T 占位 ≥ D 小时”作为一次性触发条件。** 该条件一旦成立会持续成立，边沿触发会漏掉后续恶化，也无法判断 T 的工作量。
2. **改为状态化的“停滞巡检”。** 在 T 占用期间按间隔反复检查“自上次检查以来有没有产品证据增量”，持续状态被反复评估，而不是只报一次。
3. **T 占位只作为“监视前置条件”，不是危险指标。** 不设统一 D；绝对时长只作为用户可选的提醒偏好。
4. **明确“交付口径”替代“任务画像”。** 工作区配置交付路径（可被票级覆盖），用来判断哪些写入算进展；不是模型人格，也不要求每张票填写。
5. **模型路由可配置。** 允许不同 provider/model；轻量快速检查可以使用较小模型。
6. **定期 agent 判定是底线。** 即使程序没有确定嫌疑，也按配置周期做一次轻量 agent 判定；程序嫌疑只负责提前/加深审计，**不作为 agent 审计的前置门**。
7. **配置进入工作区设置页。** 复用现有全局默认 + 工作区覆盖、显式保存与修订机制；不新增独立配置文件。
8. **巡检起点两种可选**：票占用即监视 / 首次支持产物潮后监视；默认后者。定期审计不受这个起点限制。
9. **交付/阻塞复用现有事实**：T 释放 + 显式 blocker；不新增状态字段。进度事实按 §6.4 口径。
10. **模型路由二选一**：工作区设置页选择“指定 provider/model/推理强度”或“继承主路由”；选 explicit 但字段不完整时审计不可用，不静默换模型。
11. **弱模型只提供线索，不指挥执行者。** 给用户的报告可以表达观点；给 agent 的提示只包含客观观察、可能的问题，以及一句固定建议“无需中断当前 subagents，插入临时检查任务（subagents），确认是否仍在对应票的交付方向上”；不包含具体检查项或调整方案，不下指令。

## 1. 已确定的范围

| 项 | 决定 |
|---|---|
| 产品形态 | **本插件的可选功能**，默认关闭，可独立关闭/卸载，不改变 Skill provider 与现有仪器语义 |
| 审计对象 | **定期审计按 owner 汇总活跃 lane + 受管后代；嫌疑审计按票/lane**；不是只看主 agent 的会话 |
| 审计节奏 | **定期 agent 判定为底线**；程序嫌疑可提前/加深。两者共享 reviewer 与证据包 |
| 模型路由 | 工作区二选一：指定 provider/model/推理强度；或继承主路由。轻量快速检查通常选便宜的指定路由 |
| 权限 | 只观察、只建议；不改票、不释放 T、不建/删工作树、不自动问用户、不设审批门 |
| 交付 | 侧栏卡片 + 必要时在安全边界的一条尾部提示；完整报告可展开 |
| 投递边界 | 用户报告可含观点；agent 提示只含事实 + 可能问题 + 固定句“插入临时检查任务”，不列具体检查项，不下指令 |
| 默认 | 关闭；没有配置审计路由时不注册工具/不产生模型调用 |

## 2. 术语

- **工作台账（ledger）**：程序从真实工具/会话事件归纳出的滚动事实，不包含模型判断。
- **产品证据（progress fact）**：按本票交付口径，确实推进交付的事件，例如交付根目录下的不同产品文件写入、测试结果的新变化、提交、明确的验收检查点。
- **支持产物（support fact）**：交付根目录之外的新 md/json/mjs/log、证据包、脚本、见证文件等。支持产物可能是必要的，也可能是自我扩张；由审计 agent 结合票面判断。
- **票/lane**：一个票及其受管子代理、工作树和相关执行。
- **交付口径（delivery profile）**：工作区声明的交付路径（可被票级覆盖），用来判断哪些写入算进展。它替代上一版含糊的“任务画像”，见 §6.4。
- **审计（audit）**：独立 reviewer 对一段工作是否推进交付的结构化判断；它是作者报告，不是程序回执。
- **停滞（stall）**：本设计中不按绝对小时数定义；指**连续多次检查没有产品证据增量**，且支持产物仍在增加。见 §6.3。

## 3. 为什么不是单一“非源码文件占比”

单一比例最多是一个成本/分配线索，不能作为跑偏判据：

1. **分母歧义**：同一窗口按“不同文件数”和“写操作数”可以得出差别很大的占比；按字节又是另一种结论。阈值必须先定义单位。
2. **任务类型不同**：研究、文档、测试审计任务天然以 md/json 为主；代码任务才适合低支持占比。
3. **路径角色比扩展名重要**：证据目录按设计只装 json/md/mjs；同一个 .md 在交付根是交付物，在 .cache 是过程产物。
4. **它测成本，不测方向**：支持产物可能被读过、被用上，问题可能是“被当成交付前置”，而不是“文件类型不对”。
5. **可被博弈**：模型知道阈值后会写源码桩；不能把公式注入模型。
6. **它不回答“离交付还有多远”**：需要票面验收、产品证据、具名阻塞一起看。

因此台账会同时保留：不同文件数、操作数、读回率、重写次数、产品/测试/支持分类、票面修订、T 状态、审计历史。占比只是其中一个特征。

## 4. 总体架构

    工具/会话事件 ──► 工作台账（程序，按 owner + 后代）
                          │
                          ├─ 定期调度（无论有无嫌疑，轻量 agent 判定）
                          ├─ 快信号（支持占比、无产品证据）
                          └─ 停滞巡检（状态化、无 LLM）
                                    │
                          到点 / 嫌疑分 + 去重/冷却
                                    │
                            证据包（有界、可复核）
                                    │
                      交付审计（reviewer 调用 / 可选只读子 agent）
                                    │
                     卡片（侧栏）+ 安全边界尾部提示（可选）
                                    │
                        主 agent / 用户决定；不改票、不放行

程序负责**看见和触发**；模型负责**判断方向与必要性**；用户负责**产品取舍**。三者不互相冒充。

## 5. 程序层：工作台账

### 5.1 数据来源

- **tools/post-execute**：能收到 PTC 嵌套 dispatch；这是主路径。不能只看顶层 tool/call（PTC 下顶层往往只是 run_code）。
- **session/event 的 tool/ptc-dispatch**：作为嵌套调用的兜底/交叉核对。
- 仪器现有状态：票、T 占位、待裁决、assignment、工作树绑定。
- 审计时一次性取 git status / git diff --numstat 作为产品证据补充；**不每步扫盘**。
- 明确盲区：bash/脚本内部写文件无法从工具参数完整得知；只能以工作区变化事件或审计时的 git 状态补充，并标注“未覆盖”。

### 5.2 分类与归属

- 分类：product / test / support / scratch / other。
- 归属：主会话 + 受管子代理；按父链/assignment 归到 owner 票。未受管后代标 unknown，不冒充已覆盖。
- 分类依据：**本票的交付类型与交付根**（§6.4），不是只看扩展名。
- 计数：不同文件数与操作数分开；支持产物记录“写入后是否被再次读取”和“是否重写”。

### 5.3 存储与成本

- 内存环形缓冲即可；按窗口聚合，不逐事件写仪器。
- 只持久化**审计 episode**（触发原因、证据摘要、裁决、投递结果）和少量巡检状态；避免 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) 中的写放大。
- 摘要必须带来源覆盖说明；未知不是 0。

## 6. 触发层 v0.2（按反馈修订）

### 6.1 原则

1. **T 占位不是危险指标。** T 只说明“这张票在飞”，不能说明工作量多少、多久算危险。T 时长只作为审计证据包里的上下文，不单独触发。
2. **持续条件不能用一次性边沿判断。** “T 已占位超过 D 小时”一旦成立会一直成立；必须用**状态化巡检**在后续每次检查中重新评估，而不是只在越过阈值时触发一次。
3. **程序巡检的主信号是增量，不是绝对时间。** 程序巡检每次看“自上次检查以来有没有产品证据增量”，而不是“票开了多久”；定期 agent 审计则按时间到点，两者不冲突。
4. **程序巡检本身是便宜的。** 巡检只跑程序；模型调用只在定期到点，或满足嫌疑、去重、冷却、预算时发生。
5. **不打扰。** 同一证据只投递一次；审计后进入退避；没有新事实不重复审计。
6. **agent 判定不是程序嫌疑的附庸。** 定期审计是底线；即使程序没有确定指征，也按配置周期运行。程序信号只决定“是否提前/加深”，不决定“是否允许 agent 看”。

### 6.2 快信号（窗口 60–90 分钟）

用于“现在值得看一眼”：

- 窗口内**不同产品文件变化 = 0**；
- 支持产物新增 ≥ K；
- 支持产物“只写不读”比例 ≥ R（可选）；
- 票仍由 T 占用，且没有具名阻塞/待裁决。

快信号单独只进入 SUSPECT，不直接审计；需要持续或与慢信号叠加。

### 6.2A 定期 agent 判定（独立于程序嫌疑）

这是本版新增的底线路径，和 §6.2/§6.3 的嫌疑路径并列，不是它的后续步骤。

- **触发**：功能启用且存在活跃工作（主 session 或受管 lane）时，按 scheduledIntervalMinutes（默认 60 分钟）到点触发；不要求快/慢信号成立。
- **范围**：一次 owner 级汇总审计，覆盖当前活跃 lane 与受管后代；不做“每票一次”，避免票多时成本线性增长。票级深度审计仍由嫌疑路径触发。
- **窗口**：自上次定期审计以来的新增事件/摘要，加上**票级 24h 滚动摘要**（product/support/test 的文件与操作、最后 product 时间、support 增长、读回/重写、最长无 product 间隔）；没有新活动则跳过模型调用并记录 skipped-no-new-activity。
- **长窗口优先**：即使最近一小时有 product 写入，也要看 24h 结构；最近一小时的产品写入不能单独证明没有跑偏（Phase 0 回放发现）。24h 摘要按活跃 lane 聚合，owner 级只保留 top lanes + 合计，避免包膨胀。
- **模型**：使用工作区配置的 reviewer 路由（指定或继承主路由）；证据包更小（默认 4k–8k 字符），工具轮数 ≤1。
- **结论处理**：info 只写日志/灰卡；concern 默认只出卡片；alert 才默认卡片 + 固定模板的 agent 提示；与嫌疑审计共享冷却、证据签名和每 6 小时预算。
- **调度**：默认惰性到点（有活动时补跑），不为了空转唤醒模型；若用户要求墙钟心跳，可配置为活跃心跳，但仍只在有新增活动时调用模型。
- **启动**：从功能启用、且该 owner 有活跃工作开始；**不受 §6.3 的“首次支持产物潮”起点限制**。这样“程序没看出来”时仍然有 agent 判断。
- **成本护栏**：scheduledMaxPerHour（默认 1），以及可选的每日预算；超预算只记日志，不静默加钱。
- **票级 off**：suspicionMode=off 只关闭程序嫌疑/停滞巡检，不影响定期审计；证据包带 research/review 标记。
- **防自激**：审计自身产生的会话事件不计入下一次定期审计；排除审计 agent/label。

### 6.3 慢信号：停滞巡检（替代“T ≥ D”一次性判断）

#### 6.3.1 监视生命周期

- **票级开关**：suspicionMode = auto | off，默认 auto。off 表示这张票不启用程序嫌疑/停滞巡检；**定期 agent 审计仍运行**，证据包带 research/review 标记。研究/评审票设 off。
- **开始监视**：两种可选，配置页可选；默认“首次支持产物潮后”：
  - ticket-held：票被 T 占用或有活跃 assignment 即开始（覆盖全，噪声高）；
  - first-support-surge（默认）：首次出现支持产物潮（例如窗口内新增支持产物 ≥ K 或支持操作占比越过阈值）后才开始（噪声低，但可能晚于纯研究型漂移）。
  两种情况都要求票未被 agent 明确释放/标记为已交付/已具名阻塞。此处不设 D。
- **巡检间隔**：默认 20 分钟（可配，带抖动）。
- **巡检方式**：默认**惰性**——记录 nextCheckAt，在下一个 agent/工具/会话活动时若已到期则补跑；进程空闲不主动唤醒。可选“活跃心跳”模式，但巡检仍不调用模型。
- **停止监视**：T 释放、票明确进入已交付/已阻塞、用户关闭功能、实例结束。恢复会话时按最近一次产品证据时间重建，不直接继承旧的“连续无进展”计数。

#### 6.3.2 每次巡检做什么

    onProgress(ticket, fact):
      watch.lastProgressAt = now
      watch.noProgressChecks = 0
      watch.lastAuditedSignature = null
      watch.nextAuditAt = max(watch.nextAuditAt, now + minAuditGap)

    onCheck(ticket, now):
      if watch.stopped: return
      delta = ledger.since(watch.lastCheckAt)
      if delta.progressFacts.length > 0:
          watch.noProgressChecks = 0
          watch.lastProgressAt = now
      else if delta.supportFacts.length > 0:
          watch.noProgressChecks += 1
      // 完全没有活动：不增加计数，避免把“等待用户”误判成停滞
      watch.lastCheckAt = now

      if watch.noProgressChecks < K: return            // K 次连续无进展
      if ticket.hasNamedBlocker(): return
      if now < watch.nextAuditAt: return
      if delta.supportFacts.length == 0: return         // 没有支持工作，不是本功能要抓的形态
      sig = evidenceSignature(delta)
      if sig == watch.lastAuditedSignature: return
      queueAudit(ticket, sig)
      watch.nextAuditAt = now + cooldown

- K 默认 3（约 1 小时的连续无产品证据），可配。它不是“超时”，只是“连续 N 次检查都没有推进”。
- 绝对时长只作为**用户可选软预算**：例如票级配置“连续 8 小时无进展时给我一张提醒卡”。这是用户的提醒偏好，不是程序判定的危险阈值，也不直接触发审计。
- 若票上有具名 blocker/待裁决，巡检暂停，不再视为停滞。
- 若审计返回 on-track/justified：进入退避（例如 1×、2×、4× 巡检间隔，封顶），不重复投递；有新进展或 blocker 变化时重置。
- 若审计返回 support-heavy-not-justified：投递一次，进入冷却；同一证据签名不再重复。
- 若审计返回 uncertain：只记录，不投递；可选升级到更强 reviewer（若配置）。
- 每票每 6 小时最多 2 次模型审计；达到上限后只更新卡片，不再调用模型，直到出现新的产品证据或用户手动触发。
- 定期审计（§6.2A）与嫌疑审计共享 lastAuditAt/证据签名/冷却；定期审计先发生且结论 on-track 时，不阻止后续嫌疑审计，但同一签名不重复。定期审计不因为“程序无嫌疑”而跳过。
- alert 自动注入还要求 noProductGap≥4h、supportFiles≥10；否则只出卡片（§8.2）。

#### 6.3.3 为什么这样解决“持续信号”

- “T 占位超过 D”是**状态**，不是**事件**；用一次性判定会漏掉“之后继续恶化”或“之后恢复又恶化”。
- 巡检每次比较的是**自上次检查以来的增量**，因此持续状态会被反复评估，而不是只报一次。
- 巡检本身不调用模型，所以可以定时；模型只在“连续 K 次无进展 + 支持工作仍在增加 + 无阻塞 + 冷却允许 + 证据签名变化”时出现。
- 不把“票开了多久”当危险值；长时间但持续有产品证据的票不会被误报。

### 6.4 交付口径：工作区配置的交付路径（可选票级覆盖）

“任务画像”这个名字容易误解。实际只需要回答一个度量问题：**这张票/这个工作区里，哪些写入算“推进交付”，哪些算支持工作？**

最简形态（推荐先行）：

- 工作区设置页配置 deliverableRoots（如 src/**, tests/**, docs/**）与可选的 supportRoots（如 .cache/**, docs/research/**）。
- 台账只按路径分类，不按扩展名猜；deliverableRoots 内的写入/测试结果/提交算产品证据，其他算支持或 scratch。
- 票级可覆盖 deliverableRoots；不覆盖则继承工作区。**不需要每张票填“画像”。**
- 没有配置交付路径时：定期 agent 审计仍可运行（看最近工作），但**程序嫌疑/停滞巡检不启用**，因为无法可靠判断支持占比。这样不会让“没配置”变成“永远不监督”。
- code / research / docs 只是设置页的预设模板，用来一键填路径，不是运行时必须的枚举；研究/文档工作区可以把 docs/** 或 docs/research/** 设为交付根，支持产物占比自然不会被当作异常。
- **研究/评审票**：设置票级 suspicionMode=off（默认 auto），并推荐把交付根覆盖为研究路径；否则继承代码根会把报告/证据算成支持，产生误报（Phase 0 研究基线已验证）。off 只关闭程序嫌疑/停滞巡检，定期 agent 审计仍运行，证据包携带 research/review 标记。

### 6.5 证据包

审计不看整段长会话，而看有界、可复核的包：

- 范围：定期审计为 owner 级汇总（活跃 lane + 受管后代）；嫌疑审计为票/lane 级；
- 票/lane：标题、当前状态/验收文字（复用现有记录）、T 占位时长、最近一次票面修订、工作区交付路径；
- 窗口：起止时间、触发类型（定期到点 / 快信号 / 停滞巡检）；
- 票级 24h 滚动摘要：product/support/test 的文件与操作、最后 product 时间、support 增长、读回/重写、最长无 product 间隔；按活跃 lane 聚合，owner 只保留 top N（默认 4）；
- 产品证据：交付根内不同文件、增删行、测试结果变化、提交；
- 支持证据：新支持产物清单、读写回、重写、脚本是否被执行；
- 最近 3 条“进度声明”（主 agent/子 agent 的可见文本，截断）；
- 具名 blocker / 待裁决：有/无；
- 覆盖说明：未受管后代、bash 内部写入等盲区。

### 6.6 防噪与去重

- 证据签名 = 票修订 + 窗口内产品/支持事实的稳定摘要；签名不变不重复审计。
- 冷却：审计后至少 cooldownMinutes；定期与嫌疑共享。每票每 6 小时 ≤2 次嫌疑审计；定期审计另受 scheduledMaxPerHour 限制。
- 定期审计与嫌疑审计使用同一证据签名；同签名不重复调用。
- 退避：on-track/justified 后指数退避，封顶 4× 巡检间隔。
- 投递去重：同一结论只出一次卡片；agent 提示默认只对 alert，concern 可在设置页开启。
- 手动 /audit 不受自动冷却限制，但仍受并发/预算限制。
- 所有触发、跳过、投递都写审计日志（本地/可选），便于评估误报。

## 7. 审计层

### 7.1 默认：独立 reviewer 调用

- 使用 ctx.llm.stream，不建 child、不占 S、不污染 agent 列表。
- 输入是有界证据包，不是整段会话；可给 2 轮只读调查工具（read/grep/glob）。
- 输出固定 JSON：verdict、severity（info / concern / alert）、confidence、observed_facts[]、possible_issue、user_summary、evidence[]。
- 系统提示明确：reviewer 是轻量模型，可能判断错；possible_issue 用“可能/疑似”；不得给出具体检查项、修改方案或命令，不得要求停止、改票、释放 T 或执行破坏性动作。agent 建议句由程序固定。
- agent 提示由程序固定模板组装（§8.2），不直接转发 reviewer 原文。
- 失败隔离：超时、空正文、上下文溢出、provider 错误都不能破坏主 turn；按原因退避/记录。

### 7.2 可选：只读子 agent

只有在需要更深调查或用户想看见一个独立 agent 时启用：

- provider 用 spawn（一次性），outputSchema 强制结构化输出；
- agentOptions 指定 reviewer 路由与 maxTokens；
- ctx.tools.guard 只放行 read/grep/glob（必要时 send_message 仅回父会话）；禁止写、bash、subagent、mcp 写工具；
- 固定 label、30 分钟 watchdog、禁止递归、排除自身出账；
- 计入 S，如实显示；不与 T 窗口混用。

**不默认用 fork**：fork 继承主上下文，省缓存但不独立；审计最需要的是“没被主 agent 结论污染的视角”。fork 更适合 /btw 式的“基于当前上下文回答”。

### 7.3 模型路由

    reviewer:
      routeMode: inherit    # inherit | explicit（工作区二选一）
      # routeMode = explicit 时必填：
      provider: ''
      model: ''
      reasoningEffort: ''   # 可选；留空走该模型默认
      maxTokens: 2048
      timeoutMs: 45000
      toolRounds: 1

- routeMode = inherit：每次调用时读取 owner 当前主路由；路由不可用/未知时跳过审计并记录诊断，**不回退到其他模型**。
- routeMode = explicit：provider + model 必填，reasoningEffort 可选；字段不完整或路由不存在时审计不可用，**不静默换模型**。设置页保存 explicit 时校验 provider/model，缺字段拒绝保存，不写入半配置。
- 定期与嫌疑共用同一路由策略；第一版不提供“定期用便宜模型、嫌疑用强模型”的隐藏升级。若后续需要，必须作为显式配置项加入。
- explicit 的 reasoningEffort 不被路由支持时，本次审计跳过并记录诊断，不静默降级。
- maxTokens / timeoutMs / toolRounds 对两种策略都适用；定期审计可用较小的 maxTokens（如 1024）。

## 8. 投递与权限

### 8.1 用户与 agent 看到的东西不同

- **给用户**：可以描述观点、证据、置信度；明确标注“轻量模型判断，仅供参考”。用户报告可以有“我认为……”，因为用户会自己判断。
- **给 agent**：**不下指令**。只发“观察到的客观事实 + 可能的问题 + 一句固定建议”，并明确“是否采纳、如何修正由你判断”。
- 原因：审计通常用轻量模型，执行 agent 通常用更强模型；弱模型不应指挥强模型。审计的职责是提出可疑点，不是替执行者决策。

### 8.2 Agent 可见文本由程序固定模板组装

审计模型只返回结构化字段，程序用固定模板拼出 agent 提示，避免弱模型写出“立即停止/必须修改”这类指令：

    [监督提示 · 轻量模型，仅供参考]
    观察：过去 90 分钟产品文件 0 个；支持产物新增 23 个；票面无更新；未记录具名阻塞。
    可能的问题：当前正在进行的工作可能偏离原票的交付方向，也可能只是必要的准备。
    建议：无需中断当前 subagents 的工作；插入一个临时检查任务（subagents），确认当前正在进行的工作是否仍在对应票的交付方向上，再决定是否调整如何调整。

- agent 建议句是程序固定的，不采用 reviewer 生成的具体检查项；reviewer 只提供观察和可能的问题。
- 这条建议不会自动创建任务、不会派发新 subagent、不会暂停现有 subagents；是否插入由 agent 决定。
- 避免的 agent 文本：停止、必须、立即、不要继续、执行 X、改票、释放 T、发布、重试某命令。
- 只对 alert 且满足程序门槛时默认注入；concern 默认只出卡片；info 只记日志。
- agent 自动注入门槛：noProductGap >= alertMinNoProductHours（4）且 supportFiles >= alertMinSupportFiles（10）；不满足时即使 severity=alert 也只出卡片。
- 用户可在卡片上点“发给 agent”，此时仍按同一模板组装，不直接转发用户报告全文。

### 8.3 分档

| severity | 用户看到 | agent 看到 | 默认 |
|---|---|---|---|
| info | 日志/灰卡 | 无 | 不打扰 |
| concern | 侧栏卡片（含观点与证据） | 无；用户可手动发 | 默认只出卡片 |
| alert | 侧栏卡片 | 固定模板的“可能问题 + 临时检查建议” | 仅门槛满足时默认注入；否则只出卡片 |

- blocked / unknown：只出卡片或日志，不注入。
- 不自动开新 turn；注入落在下一个安全边界。
- 永不自动改票、释放 T、删除/清理工作树、向用户提问、批准动作。
- 用户可在卡片中展开证据；可一键“忽略本次/本票暂停监督/手动重审”。
- 尾部提示不使用系统提示段；长会话里系统提示新近性不足。

### 8.4 手动审计 v0（已实现）

- 工具：可选 `mattpocock_audit`；只有独立 supervision 配置的 defaults 或任一工作区覆盖请求启用时才注册，禁用时立即移除。
- 请求：`{action:"read"}`；只允许 owner session，子代理调用被拒绝。
- 台账：内存版，每 owner 最多 2000 条观察；不写 storage、不持久化、重启即失；禁用时清空。审计 episode 另按 owner 持久化，受 30 天/2000 条保留限制。
- 输出：owner/workspace、memory-only 覆盖事实、24h product/support/other 写入计数、文件集合、最后 product 时间、无 product 小时数、roots 是否配置、最近事件，以及最近 20 条持久化 episode；不调用模型、不改票/T/S、不投递。
- 策略：每次调用重新检查协作总闸/工作区总闸与当前工作区配置；任一不满足即失败关闭。
- 后续：真实模型试验仍未完成；票级 suspicionMode、研究/评审标记、ticket-level 归因摘要与右栏/设置页只读 episode 列表已实现。

## 9. 配置（已实现）

| 键 | 默认 | 说明 |
|---|---|---|
| enabled | false | 总开关；关闭时不注册工具、不监听台账 |
| reviewer.routeMode | inherit（默认） | inherit / explicit；工作区二选一 |
| reviewer.provider/model/reasoningEffort | '' | routeMode=explicit 时必填 provider/model；effort 可选 |
| reviewer.maxTokens/timeoutMs/toolRounds | 2048 / 45000 / 1 | 两种策略共用 |
| scheduledAuditEnabled | 固定开启（功能开启时，不是配置键） | 定期 agent 判定是底线，不提供关闭项；程序嫌疑只提前/加深 |
| scheduledIntervalMinutes | 60 | 已定；建议范围 15–240 |
| scheduledMaxPerHour | 1 | 定期审计每小时上限；超预算跳过 |
| scheduledMaxPerDay | 24 | 每日定期审计上限；超预算只记日志并跳过 |
| scheduledDailyTokenBudget | 120000 | 每日定期审计 token 预算；记录成功 reviewer 的 usage，dry-run 为 0 |
| rollingSummaryHours | 24 | 24h 滚动摘要窗口；按观测到的 assignment 归因 ticket，未归因写入显式保留 |
| scheduledSummaryTopLanes | 4 | owner 级摘要保留的活跃 lane 数 |
| episodeRetentionDays | 30 | 审计 episode 保留天数；到期由运行时清理 |
| episodeMaxEntries | 2000 | 每 owner 审计 episode 条数上限；超出按最旧清理 |
| scheduledScope | owner | 已定：owner 汇总（不做每 lane） |
| suspicionMode | auto | 工作区兜底 auto / off；off 关闭程序嫌疑/停滞巡检，定期审计仍运行。票可通过 put-ticket 的 suspicionMode 覆盖；任一 assigned 票为 off 即关闭程序嫌疑 |
| suspicionStartMode | first-support-surge | ticket-held / first-support-surge |
| deliverableRoots | [] | 交付路径；空则程序嫌疑关闭，定期审计仍可运行 |
| supportRoots | [] | 辅助路径（可选） |
| checkIntervalMinutes | 20 | 程序巡检间隔；带抖动 |
| noProgressChecks | 3 | 连续多少次无产品证据才进入审计候选 |
| fastWindowMinutes | 90 | 快信号窗口 |
| supportWriteThreshold | 5（初值，待校准） | 窗口内支持产物新增数 |
| supportReadBackThreshold | 0.5 | 只写不读比例（可选） |
| cooldownMinutes | 90 | 审计冷却 |
| maxAuditsPer6h | 2 | 嫌疑审计每票每 6 小时上限；定期审计另受 scheduledMaxPerHour 限制 |
| backoffFactor | 2 | on-track 后退避倍数，封顶 4 |
| lazyCheck | true | 已定：默认惰性；false = 活跃心跳（仍不调用模型） |
| delivery.concern | card | 默认 card；可选 card+agent-check |
| delivery.alert | card+agent-check | 仅门槛满足时默认注入；不满足只出卡片 |
| alertMinNoProductHours | 4 | 自动注入 agent 的最低无 product 时长 |
| alertMinSupportFiles | 10 | 自动注入 agent 的最低支持文件数 |
| delivery.info | log | 只记日志/灰卡 |
| delivery.agentTemplate | fixed | 程序固定模板，不允许弱模型自由发挥 |
| softBudgetHours | null | 已定：默认关闭；仅人类提醒，只出卡片，不调用模型、不注入 agent |
| excludeGlobs | [] | 不计入台账的路径 |
| dryRun | true（初期） | 只记录触发和证据，不投递/不调用模型 |

## 10. 接入与实施阶段

### 10.1 接入点

- 现有 tools/post-execute、agent/pre-step、agent/status、session/event；
- 现有仪器状态读取：票、T、决策、assignment、worktree；
- ctx.llm.stream、subagents、ctx.tools.guard、agent.inject；
- 客户端现有 header/right panel/timeline 槽位；不新建一套 UI 框架。
- 作为**独立可选行/模块**接入，不与核心 Skill provider 和现有仪器门混在一起；关闭时零监听、零注册。

### 10.2 阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| 0 | 私有离线回放：用历史长任务日志算台账、触发时间、误报；审计 prompt 试跑 | 形成可复核的评估记录；不改运行时 |
| 1 | 台账只读展示 + 手动 /audit + 卡片 | 用户能主动审；无自动模型调用 |
| 2 | 定期 agent 审计（dry-run/对照臂，默认关闭） | 即使无嫌疑也有定期判断；成本、打扰率可测 |
| 3 | 停滞巡检 + 快信号自动触发（dry-run/对照臂） | 误报率、提前量可测；不打断主 turn |
| 4 | 可选只读子 agent（深审） | 只在浅审计不足时启用；路由仍按工作区二选一；S/成本可见 |

### 10.3 测试与评估

- 纯函数测试：路径分类、窗口聚合、状态机、去重/退避、证据签名。
- 假时钟测试：定期到点、无新活动跳过、惰性巡检、K 次无进展、冷却、恢复会话。
- 失败注入：reviewer 超时/空正文/上下文溢出/provider 错误不破坏 turn。
- 回放评估：长任务事故 + 健康研究/代码会话；统计触发时间、误报、审计结论、成本。
- 对照实验：dry-run（不投递）vs 投递；观察随后 60 分钟产品证据、用户干预、审计被采纳率。
- 若实测无效或噪声过大，默认保持关闭或删除；不以“已经做了监控”作为价值证明。

### 10.4 Phase 0 回放结论（第一轮，仅保留抽象）

- 已用仓库外的私有材料完成长任务回放；本文不保留 lane 时长、事件数、会话路径、触发时刻或逐点裁决。
- 抽象结论：60 分钟增量不足以发现“长停滞 + 最后时刻产品写入”，定期审计必须携带 24h 票级摘要；support-only 触发需要票级研究模式/交付根覆盖；按既定 alert 门槛可减少自动注入噪声。
- 成本与误报率仍需更多研究/证据型样本和人工 ground truth 校准；现有材料不进入公开仓库。
- 私有回放只用于方法验证，不构成模型正确性、误报率或生产效果证明。

## 11. 已定与待讨论

### 已定（本轮）

1. **巡检节奏**：工作区设置页可配。程序巡检默认 20 分钟、K=3（待校准）。
2. **监视起点**：两种可选，默认 first-support-surge（首次支持产物潮后）；ticket-held 为另一种。定期审计不受这个起点限制。
3. **已交付/已阻塞**：复用 T 释放 + 显式 blocker；不新增票级状态字段。
4. **进度事实**：交付根内不同文件写入、测试结果变化/新通过、提交算进展；重复跑同一测试与自由状态文字不算。
5. **定期 agent 判定**：是底线，不是程序嫌疑的后续；程序嫌疑只能提前/加深。
6. **配置**：进入工作区设置页，复用全局默认 + 工作区覆盖、显式保存与修订。
7. **交付口径**：工作区 deliverableRoots，票级可覆盖；未配置时定期审计仍运行，程序嫌疑关闭。
8. **模型**：工作区二选一，指定 provider/model/推理强度，或继承主路由；explicit 缺字段即不可用，不静默换模型。
9. **定期间隔**：60 分钟。
10. **空转**：没有新活动时跳过模型调用，记录 skipped-no-new-activity。
11. **定期范围**：owner 汇总，不做每 lane。
12. **程序巡检默认惰性**：记录 nextCheckAt，有活动时补跑；不做后台唤醒。
13. **投递分级**：info 只记日志；concern 默认只出卡片；alert 出卡片，满足自动注入门槛时才加 agent 提示。
14. **弱模型边界**：给用户的报告可以表达观点；给 agent 只发客观观察、可能的问题，以及一句固定建议“无需中断当前 subagents，插入临时检查任务（subagents），确认是否仍在对应票的交付方向上”；不列具体检查项，不下指令，是否采纳由 agent 判断。
15. **软预算**：默认关闭；开启时只做人类提醒，每票每 N 小时最多一张卡，不调用模型、不注入 agent。
16. **定期审计长窗口**：必须携带 24h 票级滚动摘要；不能只看最近一小时。
17. **每日预算**：scheduledMaxPerDay 24、scheduledDailyTokenBudget 120000；超预算只记日志，不静默加钱。
18. **研究票开关**：票级 suspicionMode=auto|off，默认 auto；研究/评审票设 off；off 只关闭程序嫌疑/停滞巡检，定期审计仍运行。
19. **alert 自动注入门槛**：模型 severity=alert 且 noProductGap≥4h、supportFiles≥10 才自动注入 agent；否则只出卡片。
20. **agent 模板固定**：使用已确认的固定句，第一版不开放配置。

### 待讨论

1. **误报基线**：已完成仓库外的健康会话/研究评审会话抽象回放，但样本量、support 量和人工 ground truth 都不足；还需更多研究/证据型样本才能最终校准。
2. **公开边界**：评估回放数据不进入公开仓库；文档只保留方法与抽象结论，是否可以？



---

## 12. 与现有已接受设计的关系

- 本功能是**可选监督**，不是新的业务审批 gate；不改变“业务判断由模型/用户、执行事实由程序”的分工。
- 只读实现评审见 [SUPERVISION_IMPLEMENTATION_REVIEW.md](SUPERVISION_IMPLEMENTATION_REVIEW.md)：原评审列出范围闸门、配置 schema、LLM/命令接缝三个 blocker；范围、配置和手动审计已解决，自动 reviewer 代码路径已实现但真实模型试验未运行。
- 不改变 T/S 的 advisory 语义；不因监督结果拒绝派发、释放占位或改票。
- 不改变不可变 Skill provider、channel、优先级和发布边界。
- 2026-10-30 已完成 [DESIGN.md](DESIGN.md) 第 17 节的范围记录和 [ADAPTER_SCOPE.md](ADAPTER_SCOPE.md) 的明确例外；只读实现评审见 [SUPERVISION_IMPLEMENTATION_REVIEW.md](SUPERVISION_IMPLEMENTATION_REVIEW.md)。
- 2026-10-30 已实现独立 supervision 配置、工作区设置页、operator-only remote、内存工作台账、可选 `mattpocock_audit`、持久化 episode、事件驱动定期/嫌疑判断、dry-run、可选 reviewer 路由、每小时/每日/token 预算、alert 门槛、固定 agent 注入句和只读右栏/设置页历史；功能仍关闭。剩余：真实模型试验；安装、打包、启用和发布另行决定。
