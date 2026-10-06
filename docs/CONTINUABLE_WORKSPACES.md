# Continuable 子代理：固定工作树下的多轮协作

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的 DSH 0.2.1-alpha.1 安装产物，不保留本机路径或旧行号；[宿主固定源码基线](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009ae1756c3afe0ae0cef1faafc290ccc)提供版本来源，不将编译产物路径伪装为公共源码 URL。

> 2026-10-05；本插件 0.3.0 / 上游 Skills v1.3.1 / DSH 0.2.1-alpha.1。
> 这是对 [worktree 总研究](<WORKTREE_ISOLATION.md>)的使用场景补充与优先级修正，不是已实现功能或已批准设计。
> 本文区分上游明文、宿主源码事实与适配建议；没有新增真实模型工作流试验，也没有声称首次工作树绑定已经端到端实现。

## 1. 结论与上一轮修正

**应优先适配“首次绑定工作树＋同一 continuable 会话多轮续用”，而不是只支持 one-shot，也不是先实现每轮动态切换 cwd。**

后续相关任务可能继续使用同一工作树，也可能不需要工作树；该使用模型应与首次绑定设计分别考虑。
DSH 已经提供 durable childId、历史持久化和后续消息唤醒；固定 cwd 与这种续用并不冲突。
当前的标准扩展缺口在**首次给不同子代理绑定不同工作树**，不是“续聊必须改变 cwd”。

同时，“任务相关”不是“必定复用同一个 child”，同一路径也不是“代码仍是旧版本”。新票、全局 review 修复、角色变化需单独判断。
“首轮报告完成”“票已集成”“不再需要该工作树”是三个不同状态，不能用一个 done 信号代替。

## 2. 上游实际写了什么

| 一手材料 | 明文 | 不应扩大成的结论 |
|---|---|---|
| [implement-spec:27–40](<../vendor/mattpocock-skills/skills/engineering/implement-spec/SKILL.md#L27-L40>) | 每票各有工作树/分支；实现者同步 integration 后报告；merger 集成；新 frontier 派更多实现者；最后由一个实现者修复 review 问题；最后清理工作树 | 没有要求后续新票、最终修复必须发给同一个 durable child，也没有指定 one-shot 或 send_message |
| [ask-matt:23–36](<../vendor/mattpocock-skills/skills/engineering/ask-matt/SKILL.md#L23-L36>) | 单票 /implement 路径在票之间 clear / starts fresh，票本身自包含；小任务可继续同一上下文 | “所有相关票都应留在同一个 worker”不是上游通用规则；这个明确 fresh 规则不能反向夸大成 implement-spec 必须逐票新 childId |
| [to-tickets:29–40](<../vendor/mattpocock-skills/skills/engineering/to-tickets/SKILL.md#L29-L40>) | 票按可独立验证的竖切划分，大小适合一个 fresh context window | 只是强调票的边界与自包含，不能证明后续补修必须抛弃上下文 |
| [阶段边界:21–38](<../vendor/mattpocock-skills/skills/engineering/ask-matt/PHASE-BOUNDARIES.md#L21-L38>) | 下一阶段需要上一阶段作为一手资料时优先继续；新目录/仓库是 handoff 的典型场景 | 不应把每次继续都建新树，也不应把目录切换当成无条件保留同一个会话的目标 |
| [原型分支:18–21](<../vendor/mattpocock-skills/skills/engineering/ask-matt/SKILL.md#L18-L21>) | 原型位于另一目录，handoff 到新 session，再把发现带回 | 跨目录确实存在，但该流程依赖交接而不是现有 child 动态迁移 cwd |
| [归档冲突说明（本地历史材料，不公开原始记录）](<VERIFICATION.md>) | 用户报告建议由写改动的 session 做 merge-back，保留意图 | 全页已归档，技能在 v1.3.0 删除；它只佐证续用作者上下文的价值，不是当前必调技能或强制同一 worker 的规范 |

因此需要 continuable 的理由主要是**保留同一工作中的因果上下文与返工能力**，不是把所有票串成长寿命 worker。
不能仅从 Markdown 把实际使用频率量化；但安装版 DSH base 配置（SDK 包相对定位：`@deepseek-ai/dsh-base/cordis.patch.yml`）确实给普通 spawn subagent 使用 continuable 后台策略。它值得作为主适配目标。

## 3. 按使用场景判断，而不是按工具名称判断

下表是适配建议；未明确标为上游明文的行是从工作流推导的策略。

| 第二轮在做什么 | 续用原 child？ | 工作树策略 | 必须刷新什么 |
|---|---|---|---|
| 追问研究报告、补一项资料、解释 reviewer 发现 | 通常适合 | 无专属工作树，或保持原只读目录 | 新问题、相关资料；review 若代码已变需重钉 base/head |
| 同一票的遗漏、失败测试、验收补充 | **优先续用**，已有为何这样实现的上下文 | 原票树、原分支，保留现场 | 当前文件/Git 状态与新增验收条件 |
| 报告后发现候选落后 integration，要求同步、解决冲突、重测 | **优先发回原实现者** | 保持原票树/分支，不迁移 cwd | 最新 integration SHA、重测后的 candidate SHA |
| 同一票同步发生冲突，需要作者判断两边意图 | 通常续用作者更有价值 | 原冲突树；每树一个写入者 | 冲突两边的实际提交与决策，不仅依赖旧对话 |
| 固定 integration 目录上的 merger 接着整合下一张票 | 可续用同一个 merger | 同一 integration 树、串行写入 | 每次实际 tip、candidate SHA、新鲜度；不能沿用旧快照判断 |
| 同票已集成，后来出现与它直接相关的回归 | 有价值但不是无条件 | 可保留原目录，先同步最新 integration；可能需要新的修复分支/归属 | 旧候选已集成的事实、当前基线、全局变化、新的修复范围 |
| 所有票完成后的全局 review 修复 | 上游要求一个 fixer，**未要求是旧 child** | 默认选择基于最新 integration 的 fix 工作树；若复用旧 child/树，必须显式重新准备和分配 | 完整 findings、新 integration base、fix candidate；不带着旧票分支基线直接修全局问题 |
| 一张真正的新票，虽和前一票有依赖 | 默认新 child/票树，传 context pointers；必要时显式选择连续 worker | 新票自己的分支/归属；顺序复用同一物理目录是额外策略，不是默认一票一树协议 | 已集成的依赖提交、新票 spec、权限与归属；避免旧票假设污染 |
| 完全不同任务、目录/仓库变化、工作树已清理 | 默认新会话＋handoff；支持时可显式 fork 相关背景 | 新会话首次绑定新目录，不偷偷修改旧 session.cwd | 新的项目指令、工具、权限、base；历史相关不等于旧写授权适用 |

**相同 cwd 只保证路径位置不变，不保证 branch、HEAD、工作区内容、权限或任务归属仍适合下一轮。**
同一目录内有控制地切换分支，不需要迁移 cwd，但仍是新的任务/分支所有权操作；不能在脏树上自动丢弃改动，也不能让同一树的两名 writer 并行。

## 4. DSH 的两阶段语义

### 4.1 初次创建：需要绑定的就是这一次

ContinuationManager.start（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation.js`）调用 provider.prepareContinuable，然后用 childSessionMeta(parent, ...) 创建持久化 header。
childSessionMeta（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/child-agent.js`）复制父 cwd。
ContinuableCreateSpec（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts`）只包含 seed，不能返回 cwd。

所以中央 Lead 在 repo root 下派 A/B 时，标准路径不能首次把 A 设为树 A、B 设为树 B。限制仍然存在，但应准确命名为**首次 workspace 绑定缺口**。

### 4.2 后续消息：恢复同一会话与目录，不重新分配工作树

sendMessage / coldResume（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation.js`）沿 durable childId、lineage 与 descriptor 恢复；cold resume 不重新派发 provider。
Activation 建立（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js`）在初次 create 与后续 agents.resume 之间分支。
AgentLoop 恢复（SDK 包相对定位：`@deepseek-ai/dsh-agent-loop/lib/index.js`）读取历史，再用持久 header 重建 session；没有从父目录重新生成一个 cwd。

~~~text
初次创建：child S → header.cwd = W、保存历史
第一轮结束：释放 Activation / Agent 执行资源
send_message(S, 相关追问)
第二轮：恢复 S 的历史与 W → 继续工作
~~~

**如果首次 header 已合法绑定正确的工作树，现有恢复语义与固定工作树续用天然相容。**
这是源码推导，不是本次已完成“自定义工作树 continuable 插件”的端到端认证。
保留上下文的对象是 durable session，不是永不释放的 JS Agent 实例；压缩等正常上下文管理仍可能改变模型所见的完整细节。

自然结算代码（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation-activation.js`）会释放 resident Activation 与容量；保留树供后续续聊不要求一直占着运行 slot。
DSH 容量说明（SDK 包相对定位：`@deepseek-ai/dsh-subagent/README.md`）也区分 resident 与 cold resume，后者仍需重新通过 admission。
冷恢复沿用子会话原来的权限事件，不自动扩大为父代理后来的更宽权限；相关新任务不能因此获得新的写范围。这不意味着部署默认值、preset/插件配置或 maxTokens 等所有设置也永久冻结。

## 5. 当前能做到什么，不能做到什么

| 当前方案 | 固定目录多轮续用 | 中央 Lead 的 A/B 自动各绑不同树 |
|---|---|---|
| 无 worktree，标准 continuable | 支持；保留父目录 | 不涉及工作树分配 |
| 父 session 本来就在某一 worktree | 子代理首次继承该 cwd，续用同一个目录 | 不支持；多个 sibling 仍继承同一树，不能据此宣传并行隔离 |
| 父 cwd 保持 repo，各 child 显式访问自己的工作树 | **条件性可用**；第一轮 brief/外部记录保留绑定，后续继续显式路径和 Bash workdir | 没有自动 cwd 绑定或逐 child 写权限隔离 |
| one-shot 自定义 provider | 可以为首轮选 cwd | 不提供 send_message 的同会话续用；新开 worker/传摘要不是等价替代 |
| 未来支持首次 child workspace 的原生扩展 | 应把固定树 continuable 作为主目标 | 需增加受验证的初次绑定入口，不能假定现在已有 |

不要用全局 process.chdir 或伪造父 header 来取得初次目录；并发下会污染无关创建。
也不要凭手写持久 session header / continuable descriptor / catalog 就宣称完成标准创建：必须尊重 manager 的发布、权限、lineage、初始消息接收、失败回滚与容量契约。当前标准接口的局限不等于任意底层拼接都是受支持适配。

手工模式的后续消息应再给出当前操作目录、任务归属、branch/base/candidate 变化，而不是依赖旧一轮曾提过路径就永远不会写错。

## 6. 最小目标：choose once, continue in place

建议的语义目标（**非当前可调用 API**）：

~~~text
首次 start:
  parent + task/role + validated workspace W + 固定权限 → durable child S
  记录 S ↔ W 的归属与首次基线

后续 continue:
  S + 新任务消息 → 同一历史、同一 W
  重读实际 Git 状态与所需上下文；不重新建树、不迁移 cwd、不静默扩权

最终 release-workspace:
  模型明确处置/保留安排 → 关闭相关续用引用、核验租约/身份/文件现场与现有权限 → 清理
~~~

一个较小的宿主提案是：为 ContinuableStartSpec（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts`）增加 **host-only、仅首次创建使用的可选 cwd**，省略时保持继承；验证权限与规范化路径后仅覆盖 fresh metadata 的 cwd，保留 manager 管理 lineage/depth/seed/发布的职责。这是提案，当前不存在该字段。
插件的显式委派入口可使用现有 childId 预留能力，先记录归属意图、以受授权操作准备工作树，再调用普通 spawn/fork 的 continuation manager。记录要区分插件创建的 owned 树与用户已有的 borrowed 树，后者不能自动删除。若选择 provider.prepareContinuable 返回 cwd 作为另一种扩展缝，也应单独决策，不同时增加两套选目录来源。

不必先支持“向 send_message 传另一个 cwd”，也不必先实现一个 worker 在任意 worktree 间移动的系统。
工作树分配模块、初次 session binding、continuation manager 和任务级清理可以分别拥有自己的职责；初次数据必须合法进入持久 header，恢复沿用它。

前一研究里的 Git 元数据权限问题仍然成立：窄到 linked worktree 的 workspace-write 会阻止写 common Git dir。固定 cwd 解决路径语义，不免除合法 Git 授权。
集成新鲜度、夹具准备和 --ff-only 的要求也保留，详见[总研究的实测](<WORKTREE_ISOLATION.md>)。

## 7. 生命周期要保留“回来补修”的窗口

下图仅为 implement-spec 场景的历史示例（不是 DSH 内建状态、通用状态枚举或仪器强制转换）：

~~~text
working → reported → needs_sync / needs_fix → working → reported → integrated → releasable → cleaned
~~~

reported 不代表不可续用；integrated 也不代表以后不会发现相关回归。上游 implement-spec 把全部 implementer worktree 清理放在整个流程最后。
这解释了 implement-spec 的保留安排，不构成仪器通用清理 gate。何时结束续用、保留或处置由模型按 Skill/文档/用户约定决定并明确更新，无需插件额外索取 owner 确认。技术上仍须关闭该资源的恢复/发送引用、确认无活跃租约并保护未明确处置的文件；idle/dispose 本身不触发删除。

保留的是目录、Git 状态、资源归属与持久会话，不是让子代理无事可做仍一直运行。
清理后把绑定标记为 closed/cleaned；若以后再收到针对该树的请求，明确交接到新 worker/树或报告资源已关闭，不能悄悄在同一路径重建不同基线来冒充原现场。
这类 closed-workspace 检查是未来适配层/宿主应实现的规则，当前普通 send_message 不自动检查我们未实现的管理记录。只在插件自有入口停止发送，并不能阻止通用 send_message 恢复；若不能在所有相关入口阻止清理后的恢复，就应继续保留工作树。

另一个边界是初次创建失败：AgentLoop 会在发布前存入 setup 事件（SDK 包相对定位：`@deepseek-ai/dsh-agent-loop/lib/index.js`），之后的初始接收/catalog 失败路径（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/continuation.js`）释放活跃 handle，并不证明持久记录已经删除。因此 startContinuable 拒绝后也必须检查残留 child/header，保留恢复记录，不能盲删其 cwd。

## 8. 对本插件的优先级修正与验收

1. **continuable + 固定 worktree 是主要目标，不是可有可无的后续增强。** 旧“先限定 one-shot”的建议收窄为可选技术探针，不能作为完整工作流适配的默认方案。
2. 首选推动 DSH 的初次 child workspace 入口；本插件维持薄分发，另设显式、默认关闭的适配入口，是否独立包另行决定。
3. 现阶段手工协议可使用原生 continuable，并准确声明默认 cwd 仍在父目录、操作位置靠显式路由；不必退化成每次重开 one-shot。
4. 需要新工作树/项目的任务默认新会话＋上下文指针/handoff；“相关”可以成为交接依据，而不是动态迁移旧会话的授权。

下一次隔离、无模型验收至少包含：

- A/B 首次绑定各自目录后，首轮工具相对路径和项目指令正确。
- A 完成并自然释放 Activation，再 send_message 给 A；相同 childId/历史/cwd、原树现场仍在，未重新调用 workspace allocator。
- 让 integration 在 A 报告后前进，再把同步/补修发回 A；同步、重测、冻结新 SHA 后安全集成。
- 无 worktree 的研究者多轮续用，不给只读追问无意义地创建树。
- 父权限改变后子不重新捕获委派权限事件；workspace 不存在/已关闭时明确处理，不隐式扩权或重建。
- 在 provision、setup、初次接收和 catalog 写入处注入失败，检查持久残留；owned/borrowed 归属正确，清理不与冷恢复竞争。
- 新票默认 fresh 路径、同目录新分支的显式重分配、跨目录 handoff 都不会泄漏前票脏状态。

新增的按工作区开关、agent 可见生命周期与 tickets/running subagents 双窗口，见 [工作区协作控制规格](<WORKSPACE_WORKFLOW_CONTROLS.md>)。它扩大可选扩展的产品要求，不改变本页的首次绑定与原地续用语义；机制仍待实现。

## 9. 固化与证据范围

- [源码证据快照（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)保存版本、关键宿主文件 SHA-256 和初次创建/冷恢复/默认配置的逐行片段，防止宿主升级后沿用漂移行号。
- 独立交叉核对记录：[上游场景审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)、[宿主契约审阅（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)原始记录仅本地保留，不随公开仓库分发；其中 API 扩展和回归矩阵都是提案，不是运行结果。
- 本研究复核上游原文与安装版源码；未实施 workspace 插件，未新增 continuation 端到端实验，前次 12 个探针仅证明沙箱/Git 边界，不证明本节的新接口已实现。
- [总研究](<WORKTREE_ISOLATION.md>)负责完整适配约束；本页负责续用场景、固定目录与首次绑定的区别。未来改变这些建议时一起更新入口指针，不把研究建议冒充已批准的设计或包内功能。
