# DSH × Matt Pocock：worktree 适配研究

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的 DSH 0.2.1-alpha.1 安装产物，不保留本机路径或旧行号；[宿主固定源码基线](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009ae1756c3afe0ae0cef1faafc290ccc)提供版本来源，不将编译产物路径伪装为公共源码 URL。

> 2026-10-05 历史兼容性研究。对象是本插件 0.3.0 / 上游 Skills v1.3.1，参考宿主版本为 DSH 0.2.1-alpha.1；不记录个人当前安装状态。
> 本文取代前一版同名研究稿；它是研究结论与设计建议，不是功能实现或已批准的设计变更。
> 仅修改本仓研究材料；不改 vendor、运行时代码、全局 DSH、owner profile 或其他插件。

## 结论先行

**worktree 是 implement-spec 并行写代码的核心适配缺口，但不是“只差一个 cwd 参数”。**

- DSH 主 agent + subagents 能承载任务委派、独立上下文、后台结果和技能加载；共享检出上的并行写入不是上游要求的隔离。
- 目前可用的是“主代理创建 worktree，子代理显式路由文件路径与 Bash workdir”的**条件性手工模式**。它不等于自动 worktree 支持，也不提供每个子代理的写权限隔离。
- 自定义 one-shot provider 可在更低层创建不同 cwd 的子代理；现成的 in-process driver 不提供 cwd 扩展。标准 continuable 缺的是**首次选择子 cwd** 的入口，不是固定目录下多轮续用的能力。
- **真正自动适配至少要同时解决：工作目录、Git 元数据权限、集成时的版本新鲜度、工作树生命周期、依赖与测试输入。** 单次源码写入成功不能证明这些成立。
- 建议优先验证 **continuable：首次绑定工作树、同一会话多轮续用、最后显式清理**。one-shot 可作技术探针，不应作为完整工作流适配的默认限制；不要把“建树＋换 cwd”当完整功能。

使用场景与本轮优先级修正在 [continuable 专题](<CONTINUABLE_WORKSPACES.md>)：同票补修通常无需迁移 cwd，新票则不因关联就必定续用旧 child。

## 1. 范围、证据与适配对象

基线版本及已读宿主文件的 SHA-256 在[基线记录（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)。
本次分为两条独立源码审阅（宿主接口、上游流程），再由主代理交叉检查和运行无模型探针。

| 层次 | 当前结论 | 证据性质 |
|---|---|---|
| 本插件的技能分发、调用元数据、正文与资源路径 | 与工作目录隔离是不同契约；本次没有重新认证全部加载行为 | [现有入口](<../src/index.ts>)、[职责文档](<ADAPTER_SCOPE.md>) |
| code-review 的两个只读 reviewer | 在稳定 integration 快照上共享检出不违背独立评审上下文要求；无需每位 reviewer 建可写分支 | [上游 review 正文](<../vendor/mattpocock-skills/skills/engineering/code-review/SKILL.md#L58-L78>)；本次为静态核对 |
| implement-spec 的多个 implementer | 必须各有工作树和分支；现有标准 subagent 不会自动提供 | [上游流程](<../vendor/mattpocock-skills/skills/engineering/implement-spec/SKILL.md#L27-L40>)＋宿主源码 |
| Agent Teams | 当前是共享 checkout，不能代替 worktree 路由；write scopes 不能替代独立 HEAD/index | 安装版团队说明（SDK 包相对定位：`@deepseek-ai/dsh-experimental-agent-team/README.md`） |

人机问答通过主代理、主代理持有调度责任，属于运行规则，不在这里夸大成新的结构性缺陷。

上游[implement-spec 正文](<../vendor/mattpocock-skills/skills/engineering/implement-spec/SKILL.md#L21-L40>)要求：建 integration，implementer 在自己的 worktree/branch 实现，报告前同步 integration，merger 合入，最后 review、修复、清理。
[配套官方文档](<https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/docs/engineering/implement-spec.md>)还把“后台子代理＋每人 worktree”列为 prerequisites，并要求 integration 的落地是 fast-forward。
历史研究曾将来源文档与[固定上游文档](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/docs/engineering/implement-spec.md)逐字节比对，结果为零差异；原始比对记录仅本地保留。上游人类文档不在本插件 vendor 的复制范围内。

## 2. 三种隔离必须分开

| 隔离 | worktree / DSH 提供什么 | 不提供什么 |
|---|---|---|
| 会话上下文隔离 | DSH fresh/fork 子代理有独立会话；review 可据此分工 | 不自动改变文件读写位置 |
| 工作树与 HEAD/index 隔离 | Git linked worktree 有独立工作目录、HEAD、index；每票用不同分支 | refs/heads、对象库、stash、默认仓库配置仍共享；不是独立仓库 |
| 写权限隔离 | DSH workspace-write 可限制文件写入范围 | cwd 本身不是权限；共享 Git 元数据仍需授权；worktree 不是恶意代码或任意 Git ref 操作的安全沙箱 |

依据：Git 官方手册（`git help worktree`，无需本机文件链接） REFS / DETAILS，以及[探针结果（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)中两个 worktree 解析出的同一个 Git common dir 和 integration ref。

**更正旧稿：**“无共享 refs/heads”是错的；正确说法是“不同票拥有不同分支，HEAD/index 分离，但分支引用的存储共享”。正常并发依赖分支所有权，不能跨票 reset、删除或改写他人的 ref。

## 3. DSH 的实际扩展入口

### 3.1 标准路径继承父 cwd

childSessionMeta（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/index.js`）把父 session cwd 写入子 session。
dsh-tool-subagent 配置（SDK 包相对定位：`@deepseek-ai/dsh-tool-subagent/README.md`）没有 cwd 字段。
导出的 resolveChildCwd 只是“静态部署 override 或 parentCwd”的路径解析工具，不是每次 spawn 的目录创建/分配钩子。

### 3.2 one-shot：低层可做，现成 driver 不可直接复用来改 cwd

agents.create 的 meta.cwd（SDK 包相对定位：`@deepseek-ai/dsh-agent/lib/types/index.d.ts`）允许受信任调用者提供子会话的绝对 cwd。
自定义 one-shot provider 可以使用这个入口，但需要正确实现子代理组合、权限继承、描述符、取消、结果、资源释放等契约。

InProcessRunOptions（SDK 包相对定位：`@deepseek-ai/dsh-subagent-in-process-driver/lib/types/index.d.ts`）只有 seed；现成 driver（SDK 包相对定位：`@deepseek-ai/dsh-subagent-in-process-driver/lib/index.js`）仍调用 childSessionMeta。
因此不是“调用 startInProcessRun 再多传个 cwd”就能完成。少量 helper 导出不等于工作树管理契约已经存在，也不能据此承诺约 200 行即可可靠交付。

### 3.3 continuable：标准 provider 没有目录参与权

ContinuableCreateSpec（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts`）只有 seed。
provider 契约（SDK 包相对定位：`@deepseek-ai/dsh-subagent/lib/types/types.d.ts`）明确：continuation manager 拥有创建、恢复、驱动和释放，provider 不看到后续 child handle。

结论范围是“当前标准 provider 扩展不能在初次创建时替 continuable 子代理选择 cwd”，不是“continuable 不适合工作树”。后续 send_message / cold resume 沿用同一持久 header 与历史；首次合法绑定正确目录后，固定树续用无需动态切换 cwd。需要增加初次绑定契约，不能靠覆盖纯路径 helper 或修改全局 process.cwd；详见 [两阶段语义](<CONTINUABLE_WORKSPACES.md>)。

### 3.4 工作目录、文件工具、项目上下文需一致

显式绝对文件路径与 Bash workdir 可以把操作导向工作树；这不是文件工具失效，也不是自动隔离。
如果 session cwd 仍是父检出，默认相对路径、自动读取项目指令、项目 skill 发现仍可能围绕父检出。
若 session cwd 真正换到工作树，新树只包含所选 Git commit 的内容，不包含主检出的未提交变更、未跟踪说明、忽略的依赖或测试夹具。这个缺失同样影响手工路径路由，并非自动 cwd 独有的代价。

## 4. 实测发现：只改变 cwd 会阻断 Git 写入

使用[探针源码（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)调用**已安装的真实 LocalSandboxProvider.confine**，不是模拟 runner。
它选择 Linux bwrap、enforcement=full；外层脚本创建独立测试仓，受测命令始终明确传 workspace-write。
历史探针使用系统临时目录之外的独立 fixture 根，避免临时目录授权或临时挂载改变 Git 元数据边界；实际本机路径不公开。

| 受测命令 | cwd | 允许写的根 | exit code | 结果 |
|---|---|---|---:|---|
| 写工作树源码 | ticket worktree | ticket worktree | 0 | 成功 |
| 写主检出文件 | ticket worktree | ticket worktree | 1 | EROFS，成功拒绝越界 |
| git add | ticket worktree | ticket worktree | 128 | 无法创建主仓 .git/worktrees/a/index.lock |
| git commit | ticket worktree | ticket worktree | 128 | 同样被 Git 元数据权限阻断 |
| git add / commit | ticket worktree | 整个 repo | 0 / 0 | 能提交 |
| 写主检出文件 | ticket worktree | 整个 repo | 0 | 也被允许，不能声称每个子代理被限制在自己的工作树 |

路径结构如下：

~~~text
repo/.git/worktrees/a/index     ← A 的私有 index，物理位置仍在主仓 Git 目录
repo/.git/objects/、refs/       ← 共享元数据
repo/.worktrees/a/.git         ← 指向上述管理目录的文件
repo/.worktrees/a/src/...      ← 工作树源码
~~~

正常工具的policy resolver（SDK 包相对定位：`@deepseek-ai/dsh-sandbox-policy/lib/index.js`）取 session.header.cwd 作为 workspaceRoot；改变 Bash workdir 不会改变授权根。
低层 SandboxExecutionPolicy 可由受信任调用者指定一个 root，但它不是模型可自行扩大权限的接口，也不是一份可授权的多根白名单。

**两条诚实路径：**

- 父 cwd 保持 repo，worktree 放在这个授权根内：Git 可工作，但隔离依赖明确路由与所有权，不是逐子代理的写沙箱。
- 子 cwd 改为 ticket worktree：需要额外解决 Git 管理目录的合法写访问，或让受限子代理只改代码、由拥有权限的 Lead 接管 Git 写操作。后者是角色适配，不能宣传成上游流程完全不变。

不推荐通过默认 danger-full-access 或插件直接在受信任 Node 进程里替模型执行任意 Git 命令来绕过授权。当前全权限会话中 Git 可能正常运行，但这既不证明默认受限配置可用，也不提供写权限隔离。

## 5. 实测发现：报告前同步不保证落地时还能 fast-forward

探针构造两张票 A/B，均基于同一 integration tip I0。两者结束时都已经包含 I0。

~~~text
I0 → A1      A 报告完成
 └ → B1     B 报告完成

先落 A：integration = A1
再落 B：A1 不是 B1 的祖先 → --ff-only 拒绝（exit 128）
~~~

本次确实得到“Not possible to fast-forward”。随后在 B 自己的树中同步最新 integration，再落 B，exit 0。
这是上游“报告前同步 → 每次落地 fast-forward”意图中需要补足的新鲜度条件，**不是 DSH 独有的 Git 错误**。

以下是上游 implement-spec 场景的操作/验证建议，由模型依据该 Skill 和任务约定采用；不是仪器内建的票交付、调度或清理判定器，也不适用于所有任务的业务流程：

1. 只有一个 integration writer；merger 使用 integration checkout，不给每个 merger 自动分配新的 ticket 分支。
2. 读取当前 integration SHA，检查候选 SHA 包含该 tip。候选过期时回到自己的票工作树同步，解决冲突并重新测试。
3. 汇报并冻结实际测试过的候选 commit SHA，而不是仅报可继续移动的分支名。
4. 在写入独占条件下重新确认 tip，再执行 git merge --ff-only <candidate-sha>。条件失效就重试，不能改用 --no-ff 掩盖过期。
5. 成功落地后更新已集成票集合，由此推进 frontier；不要把最终 PR 合并时才关闭的 tracker issue 当唯一实时依赖来源。

票分支内部同步 integration 可以产生 merge commit；之后 ticket → integration 的落地仍可 fast-forward。目标是集成分支落地可验证，不是禁止所有 merge commit。
上游目标结束在 integration 或 PR ready，不要求本流程把 integration 合回 main。

## 6. 子代理结束不是工作树清理时机

one-shot 前台结算（SDK 包相对定位：`@deepseek-ai/dsh-tool-subagent/lib/index.js`）在把结果返回父代理之前调用 run.dispose。
因此把“删除 worktree”放进 run.dispose 会在父代理整合/复查前触发。即使提交还在，也会丢失脏改动、冲突现场与继续工作的目录。
continuable 会话后续还可能冷恢复，删除它的 cwd 也会破坏后续工具操作；不应把恢复构造是否成功与目录可用性混为一谈。

工作树应归任务/运行的管理者持有，而不是归单轮 agent handle 持有：

- 创建之前先记录资源归属；只有确认没有活动或可恢复 child 引用、且没有价值改动的空资源才可回滚。初次消息接收/发布较晚阶段的失败可能已留下持久 header，不能用 start 拒绝推断工作树可直接删除。
- 正常完成只释放 agent 执行资源，保留候选工作树和分支供整合。
- 失败、取消、冲突、脏文件：保留现场，报告状态与路径。
- 模型按任务约定明确处置/保留计划，再关闭相关续用引用、核验真实执行/租约、资源身份和文件现场并在现有权限内执行；防止之后冷恢复到已删除目录。仪器不把已集成/修复完成设为普遍业务前提，不追加 owner 审批；普通 drain 不是永久终止会话。
- 清理仅涉及本轮登记的资源；不用 force 删除其他工作树，不自动丢弃主检出的未提交内容。

## 7. 依赖和测试输入属于可执行性门槛

[上游 worktree 夹具警告](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/docs/engineering/implement-spec.md)是真实前提，不应忽略：node_modules、忽略的测试数据、数据库、凭据、刚生成的本地票据或 setup 文件不会因为创建 worktree 自动出现。

每张票进入实现前应明确依赖准备命令、上下文指针、所需测试输入与权限，避免盲目复制全部未跟踪文件或凭据。可变数据库/输出目录应有各票独立的状态。
必要测试 skipped 或没运行时报告“验证缺失”，不能以退出码 0 代替验证完成。

若只能在主检出进行权威验证，必须串行并测试已集成的实际候选版本；不能把多个并行实现者都放回主检出，也不能用主检出的旧版本测试来证明 worktree 候选正确。

## 8. 要不要补到本插件，怎样补

**建议补，但分开“今天可以说明的条件支持”和“未来实际执行的自动能力”。**

| 方案 | 本插件的收益 | 代价 / 当前状态 |
|---|---|---|
| 兼容说明＋手工协议 | 诚实表达上游前提，给当前用户可执行路径 | 最小投入；依赖代理遵守路由，不构成自动保护 |
| DSH 原生初次 child workspace 接口＋本插件薄适配 | 统一默认路径、项目上下文，并保留 continuable 多轮语义 | 优先方向；宿主目前缺初次绑定入口，Git 授权与持久资源归属仍需解决 |
| 当前宿主的 one-shot worktree 扩展 | 可选的受限技术探针，不是续用场景的默认方案 | 必须自建部分执行与工作树生命周期，不能替代 send_message；未实现、未认证 |
| 完整票图/Git 调度器 | 能确定性管理整合、重试、清理 | 超出当前薄分发定位，不能悄悄塞进 provider |

当前[设计](<DESIGN.md>)要求 vendor 字节不变，任何下游 overlay 都须单独决策；[职责文件](<ADAPTER_SCOPE.md>)也把加载契约与执行效果分开。
所以保持既有技能 provider 不变，先在隔离环境验证 workspace adapter 的小接口，而不是让 skills 注册入口额外承担完整 Git 调度。

若将来决定在本仓提供自动能力，推荐：

1. **单独启用的扩展入口或 bundle 层**，默认关闭；普通技能安装不依赖它，宿主缺能力时明确拒绝，不静默共享 checkout。
2. 工作目录在初次创建时选择并持久化，send_message / resume 原地继续；再明确所需 Git 管理访问与稳定资源身份。不能把 argv.cwd 当授权根，也不能在恢复时改写已冻结的 session cwd。
3. 角色绑定明确：implementer → 分配的票树；merger → 独占 integration 树；reviewer → 稳定只读快照。
4. 管理记录绑定 repo/worktree/branch/base SHA/child 或 job ID/candidate SHA/验证证据/整合状态；agent dispose 与 workspace cleanup 分开。
5. one-shot 后台采用 jobId 和 job_output/job_kill 的契约，不能冒充 continuable childId 的 send_message 续聊能力。

后续扩展规格包含插件页面的工作区配置、生命周期仪器与 tickets/running subagents 双窗口；这些可选管理职责、逐项滑动规则与事件驱动的信息注入在 [工作区协作控制规格](<WORKSPACE_WORKFLOW_CONTROLS.md>)，不再把“完整调度器超范围”解释成不允许这项明确的新需求。现有 Skill provider 仍不承担完整票图/Git 调度。

放成同仓可选入口还是独立 companion 包，是维护与打包选择，不是技术上“只能另建仓库”。当前研究不授权新增依赖、扩大 peer 支持范围或自动安装任何插件。
如仅把指南留在 docs，它不进现有包，也不会自动进入 /implement-spec 的上下文。后续若要随包提供可发现的 DSH 执行说明，需要明确入口与来源，不能暗改 vendor 正文或宣称文档就是已启用功能。

## 9. 下一步验收，而不是先承诺实现

建议先做无模型、隔离 profile 的小型 spike；真实模型试验另行确认：

- 两个真实子 session 的文件工具、Bash、项目说明都指向各自工作树，且拥有正确固定权限。
- worktree 源码写入与 Git add/commit/sync 在目标权限策略下成立；越界写入在承诺保护的方案中确实被拒绝。
- continuable 首轮结束并释放 Activation 后，再发补修任务：相同 childId/历史/cwd、工作树保留、无重复分配；权限事件不因父权限改变而重新捕获。
- one-shot 若作为可选模式，foreground/background 的结果、取消、dispose 均正确，结束后仍能整合现场。
- stale integration 候选拒绝，重新同步/测试后才能 --ff-only 落地；同文件冲突和异常都保留证据。
- 测试依赖/夹具缺失、必要测试 skipped 都不能报成功。
- 资源碰撞、父任务结束、宿主重启/恢复、清理重试不会删错目录或丢脏改动；初次创建晚期失败检查持久残留，清理与冷消息接收不发生竞争。
- 原有两通道、调用权限、vendor 完整性、包清单保持不变；pnpm 与宿主 peer 操作只在隔离环境进行。

**已完成的验证仅限本次 12 个沙箱/Git 场景及源码核对。未运行完整真实模型 implement-spec，没有实现自动 provider，没有测试 macOS/Windows，也没有证明所有旧 DSH 版本兼容。**

## 10. 研究工件与复跑

- [主探针（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)：依赖本机路径的研究脚本，不是安装包的公开命令。
- [原始结果（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)：每场景 cwd、workspaceRoot、runner、enforcement、退出码、诊断及 Git 图。
- [基线与宿主指纹（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)：用于防止宿主升级后把旧读数当新事实。
- [固定工作树续用专题](<CONTINUABLE_WORKSPACES.md>)与[续用源码证据（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)：场景矩阵、首次绑定/冷恢复区别、修正后的优先级。

公开源码测试入口如下（需独立的匹配 SDK，仅验证各测试声明的契约，不等同于重放历史 12 场景探针）：

~~~bash
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/git-worktrees.test.mjs tests/host-cwd.test.mjs
~~~

历史探针仅在本地研究归档中复跑，不是公开仓库命令。该探针每次创建独立测试仓，包含预期拒绝断言；已保存的历史运行 exit=0、assertions=PASS，不代表上述公开测试已在当前修复版重新通过。
初次实验在断言完成后因误用裸 Cordis Context 的 dispose 方法 exit=1；修正测试脚本收尾后，在新仓重跑 exit=0，保存的是后者。本次没有依靠这次脚本修正规避任何权限拒绝。
