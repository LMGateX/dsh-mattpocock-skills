# 工作树创建事件观测（设计草案 v1）

> 状态：**源码已实施（2026-10-13），隔离工作树内机械验收通过；未安装到本机 DSH/Profile，也未发布**。本轮实现只覆盖原生 `create_worktree` 事件观测，实施范围、覆盖边界与门禁结果见第 11 节。
> 公开资料边界：本文引用的本机会话存储抽样与 SDK 安装产物仅作本地核对，不随公开仓库分发，也不充当公共原始证明；公开证据范围见[公开验证说明](<VERIFICATION.md>)。

## 0. 目标与非目标

**目标**：把“某会话用宿主原生 `create_worktree` 建出的树”登记为可核验、可去重、可提示处置的记录，防止废弃工作树堆积（Rust 等语言的 target／依赖目录尤其昂贵）。

**用途边界（2026-10-13 决策）**：本能力只让**主 agent 知道“存在这棵树、由谁创建、创建者还在不在、树还在不在”**；**不记录“是否被别人使用”**（见第 5 节），插件不判断该不该清理，也不自动清理。主 agent 依据任务上下文自行决定处置。

**明确不做**：

- 不做文件级写隔离，不改变任何会话的沙箱边界；
- 不自动删除树或分支，不重开已禁用的 resource retire；
- 不监控普通 `cd`（cwd 事件兜底暂缓，见第 6 节）；
- 不把模型文字汇报当作事实证据；
- 不新增模型工具：观测写入走 host-only program port，沿用 [ResourceProgram](<../src/controls/resources.ts#L97-L107>)「MUST NOT be mounted as model tools」的约定。

**覆盖边界（2026-10-13 定稿）**：只观测同一 owner instrument instance 生命周期内、经 DSH 工具管线成功执行的**原生 `create_worktree`**（含 PTC 嵌套子调度）。用 bash `git worktree add`、其他进程或别处创建的树不在覆盖内；曾考虑的 cwd 事件兜底**暂缓不做**（见第 6 节）。

## 1. 事件驱动总纲

事实只来自已发生的事件；记录是对事件追加的只增版本；当前事实（含创建者活动性）在读取时组装。**没有定时轮询、没有周期扫描。**

| 编号 | 事件源 | 载荷 | 反应 | 产出 |
|---|---|---|---|---|
| E1 | `tools/post-execute`（默认，实时） | `exec.name/arguments/callId/agent/parent/rootCallId`；`result.isError/value` | 命中 `create_worktree` 且成功 → 立即追加 `observed` | 观察记录 + 一次异步核验 |
| E2 | 核验结果（受权 Git runner） | repo root／common dir／git dir／branch ref+OID／路径身份／exists | 追加 `verified` 或 `verification-failed` | 记录当前事实 |
| E3 | 生命周期事件（已在消费） | `agent/status`、`agent/disposed`、`subagent/start|end`、native-stop | 读取时给出创建者当前活动性；不唤醒 | 清单里的“创建者活动”列 |
| E4 | 会话日志回放（补登记） | `tool/call` + `tool/result`（按 callId 配对）、`tool/ptc-dispatch` | 幂等补 `observed`（source=`replay`） | 恢复缺失记录 |

规则：

- E1 复用现有 `tools/post-execute` 观察位（[host.ts](<../src/host.ts#L1532-L1550>)）：成功结果先同步落 `observed`（经 `track` 计入消费前沿），**写入失败只记 log 与健康 unknown，绝不替换或阻断工具结果**。
- E2 异步执行，不阻塞工具返回路径；受权 Git runner 以 **owner 会话**为锚点（`inspect` 在 workspace-write 下没有包含性限制），避免创建者子会话建完树即 dispose 导致核验失败。
- E3 只提供读取时的活动性事实，不单独唤醒（终局 item 由既有机制发出）。
- E4 在 owner 协调者读取快照时对**仍存活的受管子会话**执行一次（own events 可读），不做周期扫描，也不替代 E1；宿主当前没有“枚举 owner 全部已存档子会话”的端口，冷会话的全量补登记不在本轮覆盖内（见第 11 节）。
- 事件源只有 E1–E4；cwd 事件兜底暂缓不做（见第 6 节）。

## 2. DSH 侧事件事实（本地核对）

- `tools/post-execute` 签名 `(exec: ToolExecution, result: Readonly<ToolExecutionResult>, next)`；`ToolExecution` 带 `callId/rootCallId/name/arguments/agent/parent`，PTC 子调度带 `parent` token 且共享 turn:step（dsh-tools 类型）。
- `create_worktree` 成功返回规范化 checkout：`{ path, branch, baseCommit, repositoryRoot }`，并把**调用者**会话切进 `path`；树建在 `<repositoryRoot>/.agents/worktrees/<branch>`（宿主 worktree bundle README）。
- 持久事件：`tool/call {turn,step,callId,name,arguments}` 与 `tool/result {turn,step,message,error?,meta?}` 按 `callId` 配对；PTC 子调用另记 `tool/ptc-dispatch`（含 name／isError／content）。
- 本机会话存储抽样（**本地证据**）：子会话 header `origin=subagent`、`cwd=<worktree>`、`parentSession=<root>`；即“初始目录即树”是当前原生的实际行为。

## 3. 记录模型（新记录 kind：worktree-observation）

- 记录身份：`(ownerInstanceId, creatorSessionId, canonicalPath)`；树身份去重用 `(gitCommonDir, pathIdentity)`（dev:ino）。
- 调用去重身份：`(creatorSessionId, callId)`（PTC 用 `rootCallId:callId` 或子调用 id）；幂等重放不建第二行。
- 只增事件版本，每版带 `source: program|agent`、author、recordedAt、revision：
  - `observed`（program，E1／E4）：`{ path, branch, baseCommit, repositoryRoot, callId, turn, step, creatorSessionId }` 原样入库；
  - `verified`（program，E2）：`{ exists, repositoryPath, gitCommonDir, gitDir, branchRef, branchOid, pathIdentity }`；
  - `verification-failed`（program，E2）：`{ diagnostic }`，保留未知而不是冒充成功；
  - `absent`（program，后续复核）：树已不存在；
  - `cleaned`（agent，作者声明，可选）：与绑定业务状态同构，只退持续提醒，不删记录。
- 严格解析拒绝未知字段；历史／摘要／操作账本与 [worktree-bindings](<../src/controls/worktree-bindings.ts>) 同构（manifest + 去重摘要 + 定向旧历史删除）。
- **与绑定的关系**：独立记录；不改 `WorktreeBindingValue` 的字段语义（`requestedCwd/actualCwd` 仍是创建前意图与不可变 header.cwd），不放松绑定行“必须以创建意图开始”的不变量。有关联时用 `creatorSessionId` 指回 bound child，仅作关联展示。

## 4. 两阶段：观测 → 核验

- 阶段 1（同步、廉价、不可失败）：在 post-execute 内把工具返回值原样写成 `observed`；写入异常只 warn。
- 阶段 2（异步）：用受权 Git runner 做身份核验，复用 [git-worktrees.ts](<../src/controls/git-worktrees.ts#L59-L77>) 的 `repoIdentity`／`registered` 逻辑。**默认以 owner 会话为 runner 锚点**：`inspect` 在 workspace-write 下没有包含性限制（[host.ts](<../src/host.ts#L1144-L1155>) 只约束 create／retire），owner 锚点可避免“子会话建完树立刻 dispose 导致核验失败”；创建者仍记录为实际 child。
- 未知即未知：Git 能力缺失、路径不可核验、runner 拒绝 → `verification-failed` + 机械 diagnostic；读取路径报告 unknown，绝不报告成功。
- 幂等：同一调用重放、同一路径重复观测都只追加事件，不产生第二行。

## 5. 归属与创建者活动性（2026-10-13 简化决策）

### 5.1 只提供两个事实，不判断“是否被使用”

观察记录提供两个事实：

1. **树由谁创建**（不可变）：`creatorSessionId` 与创建调用信息；
2. **创建者会话当前是否还在活动**（读取时的 live 事实）。

**不记录、不推测“这棵树现在有没有被别人使用”。** 主 agent 的判断链：

- 创建者还在活动 → 主 agent 可理解为这棵树仍与创建者相关（插件**不声称**“正在被使用”）；
- 创建者已结束，但主 agent 知道有人（例如 B）在用 → 那是主 agent 安排的，它自己知道，插件不需要记录；
- 创建者已结束，且主 agent 也不认为有人用 → 主 agent 自行决定保留还是清理。

### 5.2 为什么不记录“是否被使用”

DSH 没有“目录被谁占用”的机制：

- 会话的当前目录只是一个记录值，两个会话可以同时指向同一目录；
- Bash／终端会话各自保留自己的进程 cwd（README 明说“existing shells keep their own directories”），Bash 的 `workdir` 参数与会话目录变化无关；
- 模型可以完全不 `cd`，用绝对路径或 `git -C` 操作某棵树；
- 反过来，子代理 cd 进 t-A 一次后可能再也不碰它，但它仍然“在线”。

所以任何“在用／无人用”字段都会变成假事实。上一版草案的 holder 登记、`needsDisposition` 派生规则与“用 cwd 判断谁在用”全部**不做**。

### 5.3 记录字段

| 类别 | 字段 | 来源 | 说明 |
|---|---|---|---|
| 事实（不可变） | `creatorSessionId`、`path`、`branch`、`baseCommit`、`repositoryRoot`、`observedAt` | program（E1） | 创建事实 |
| 事实（读取时） | `creatorActivity`: `running`／`idle`／`gone` | program（现有 live agent 索引） | **不写进记录**，避免过期事实；与宿主原生计数同源 |
| 事实（核验） | `exists`、Git 身份 | program（E2） | 树是否还在 |
| 声明（可选） | `cleaned`、`notes` | agent 作者 | 只影响清单筛选与历史保留口径，不删记录、不做业务审批 |

### 5.4 票信息按 creator 关联既有 lane 记录

- 观察记录本身不含票信息；读取时用 `creatorSessionId` 关联两类既有记录取票：运行期分配账本（`assignments`）提供 `workflowId` 与 `ticketIds`，lane 绑定（`plannedChildSessionId`／`actualChildSessionId`）提供 `task` 并在没有分配账本时兜底 `ticketIds`。
- 绑定行本身**不携带 `workflowId`**（`WorktreeBindingIntent` 只有票、任务与目录），所以两者都缺时如实报告 `lane: null`，不猜一个工作流。
- 竞态：子代理可能在父的 `confirm` 落库前就建树；因此关联必须同时查 planned 与 actual 两个 id。
- 原生 subagent／无绑定的会话：票信息如实显示 unknown，可由作者在业务备注里补；本能力不猜测。

### 5.5 呈现与通知

- 清单行：创建者（含当前活动性）、票、branch／path、创建时间、是否存在。
- **创建不唤醒**：观察写入不产生通知，只在下一步上下文里出现。
- **终局顺带列出**：托管子代理到达终局（宿主 stopReason 词表）时，已有的 main-agent item 顺带列出“该子代理创建的树（路径／分支）”；不新增第二套唤醒类型。
- 去重沿用现有 durable notification 行（`native-stop` item 的做法），同一树不重复唤醒。

### 5.6 物理清理

**物理清理仍是模型／用户动作**（`git worktree remove`）；本能力不删除任何目录，清理后记录保留，仅由作者声明标记。

## 6. 暂缓：cwd 事件兜底（本轮不做）

- 原设想：订阅 managed session 的 `working-directory/change`，核验该目录是否为已知 repo 的 linked worktree，用于发现**绕过原生工具**（例如 bash `git worktree add`）创建的树。
- 本轮决定**不做**：目标（防堆积）主要由原生 `create_worktree` 覆盖；cwd 事件噪音大（普通 `cd`、临时目录、多仓工作区），误报成本高，而且它本来就漏掉 Bash `workdir`、绝对路径等常见用法。
- 保留为**未来可评估项**：若将来发现大量非原生建树，再重新评估（载体、噪音规则、核验前提都需重新设计）。
- 它从来不是“判断谁在使用”的手段；使用状态不记录（见第 5 节）。

## 7. 变更点清单（实现时）

| 位置 | 变更 |
|---|---|
| 新文件 `src/controls/worktree-observations.ts` | 严格 parse／事件版本 fold／CAS／query；行身份 =（创建者会话，目录），调用身份 =（创建者会话，callId） |
| `src/controls/git-worktrees.ts` | 新增只读 `probeWorktree`：存在性、精确 Git 树根、common／git 目录、分支 ref 与当前 OID、路径身份（复用同一受权 runner 与固定 argv 契约） |
| runtime 存储 | owner 域存储 `worktree_observations_<hash>`（同 [runtime.ts](<../src/runtime.ts#L89-L91>) 模式）、快照字段 `worktreeObservations`、读取时的 `creatorActivity`／`lane`、E4 回放；v1 **不进** history 观察 kind |
| runtime 源清理 | **v1 不在范围**：观察只做当前状态 + 内部事件日志，不进 `mattpocock_history` 查询与源清理选择器；将来需要时再决定并入 `worktrees` 域还是新开域 |
| runtime 事件入口 | `postExecute` 命中成功的 `create_worktree` → 同步 `observed` + 异步 `probeWorktree` 核验；不新增宿主端口、不挂模型工具 |
| consumption／client | 新分类 `worktreeObservations`（含 `open` 计数）、终局 item 附带 `createdWorktrees`、客户端只读列表 + 作者登记编辑；v1 不扩展源域选择器（[consumption.ts](<../src/controls/consumption.ts>)、[client.ts](<../src/client.ts>)） |
| 文案 | `mattpocock_delegate`／`mattpocock_worktree` 流程说明改为“lane 自建树 + 仪器观测登记；worktree 参数可选”，并新增 `update-observation` action |
| 测试 | `tests/worktree-observations.test.mjs`（模块）、`tests/worktree-observation-runtime.test.mjs`（管线），见第 8 节 |

## 8. 验收条件（无模型、机械）

1. 失败的 `create_worktree` 不产生记录；成功产生一条 `observed`，随后异步落 `verified` 或 `verification-failed`。
2. 同一调用重放、同一路径重复观测不产生第二条记录。
3. Git 能力缺失／核验失败时读取报告 unknown，不报告成功。
4. PTC 嵌套 `create_worktree` 被覆盖（`parent` token），不重复记录。
5. 会话日志回放补登记幂等；回放解析的是渲染内容而非 canonical value，证据等级较低，需在记录上标注来源。
6. 托管子代理终局时，其创建的树随终局 item 一并呈现；同一树不重复唤醒；创建本身不产生唤醒。
7. 本轮不实现 cwd 兜底：配置页与模型工具表都不出现该开关；文档只记录为暂缓项。
8. 不新增模型工具（\(update-observation\) 挂在既有 \(mattpocock_worktree\) 上）；vendor 字节与 vendor 清单不变，固定包清单因新模块精确 +2。

本轮机械结果（2026-10-13，隔离工作树，无模型、无安装）：

| 条件 | 机械证据 | 结果 |
|---|---|---|
| 1 | `worktree-observation-runtime` “a successful native creation…”“a failed call writes nothing…” | 通过 |
| 2 | 模块“one successful creation…”“a second creation at the same path…”；管线重放断言 | 通过 |
| 3 | 管线“an unavailable Git seam records unknown, never success”（fake runner 拒绝 → `failed` + diagnostic，`facts` 保持 null） | 通过 |
| 4 | 管线“a PTC sub-dispatch keeps its own call identity” | 通过 |
| 5 | 管线“durable session events backfill a missing row once and mark it as lower-evidence replay”（含失败调用不登记、已配对 callId、`tool/ptc-dispatch` 子调用、二次读取幂等） | 通过 |
| 6 | 管线“a terminal item names the trees its child created, and creation itself never wakes the owner”（`createdWorktrees` + 单条 durable notice） | 通过 |
| 7 | 无配置项、无模型工具；`docs` 仅记为暂缓 | 通过（机械搜索） |
| 8 | 固定包清单 87 + vendor 85 = 172；`node scripts/verify-package.mjs --prepack` 允许清单／scratch 构建对比 | 通过 |

## 9. 决策记录（2026-10-13 所有者确认）

| # | 决策 |
|---|---|
| 1 | 用途是让主 agent 知道“存在这棵树”，清理判断交给主 agent；v1 不新增历史/源清理域（见第 7 节）。 |
| 2 | 通知：创建不唤醒；托管子代理终局时随已有终局 item 列出它创建的树，其余只更新上下文（见 5.5）。 |
| 3 | cwd 事件兜底**暂缓不做**，仅在文档记录为未来可评估项（见第 6 节）。 |
| 4 | 同时观测 owner 自己创建的树（creator=owner 标注）。 |
| 5 | 记录量小，v1 只注入当前清单；上限、历史分页与容量策略留待出现规模问题时再定。 |
| 6 | 不记录、不推测“是否被使用”：只给创建者活动性 + 存在性；holder 登记、使用状态派生、用 cwd 判断谁在用全部不做（见第 5 节）。 |

实施后仍未定型（不阻塞本轮，也不属于本轮范围）：通知去重键的最终形态（当前沿用 `native-stop:<itemId>` 的既有行）、观察记录与绑定在客户端合并展示的更细呈现、以及出现规模问题后的上限／历史分页策略。持有人登记已按决策 6 取消，不再是待办。

## 11. 实施记录（2026-10-13，隔离工作树内完成，未安装）

**环境与边界**：全部改动发生在独立 Git 工作树（分支 `worktree-observation`，目录名保持 `dsh-mattpocock-skills` 以满足既有测试的路径夹具），**未**执行 `pnpm install`、**未**打包进 `<DSH_HOME>/profiles/*`、**未**写入 `<DSH_HOME>/artifacts`；pnpm 只以 `pnpm exec tsc`／临时目录内的 `pnpm pack` 参与验证，主检出目录未被修改。

**改动清单**：

| 文件 | 内容 |
|---|---|
| `src/controls/worktree-observations.ts`（新） | 记录模型：严格 parse／事件版本 fold／CAS／query；`observe`／`check`／`updateBusiness`；行身份与调用去重；`WorktreeObservationView`（含 `creatorActivity`／`lane`） |
| `src/controls/git-worktrees.ts` | `probeWorktree` 只读核验：存在性、精确树根、common／git 目录、分支 ref 与 OID、路径身份 |
| `src/runtime.ts` | owner 域存储与 `openObservations`；`postExecute` 的 `create_worktree` 分支（同步 append + 异步核验）；E4 回放；快照 `worktreeObservations`、终局 item 的 `createdWorktrees`；`worktreeAction` 的 `update-observation`；健康行 `worktree-observations` |
| `src/controls/remote-contract.ts`／`consumption.ts`／`client.ts` | 快照字段、消费分类与协议文案、客户端只读列表 + 作者登记编辑 |
| `src/host.ts` | 不新增模型工具；更新 `mattpocock_delegate`／`mattpocock_worktree` 文案与 action 词表 |
| `package.json`／`scripts/verify-package.mjs` | 固定包清单精确 +2（`lib/controls/worktree-observations.js`、`lib/types/controls/worktree-observations.d.ts`）；87 + 85 = 172 |
| `tests/worktree-observations.test.mjs`（新） | 模块级：去重、核验状态机、作者登记、严格 parse、`probeWorktree` |
| `tests/worktree-observation-runtime.test.mjs`（新） | 管线级：成功／失败／PTC／回放／终局 item／扩展开关／作者登记 |
| `tests/fixtures/runtime-host.mjs` | 夹具增加 `nativeSubagentStops`／`nativeSubagentCountRevision`（默认空，既有用例行为不变） |

**实现中确认的两个技术事实**（写进设计口径）：

1. `track()` 会在同一 `OrderedEffects` 队列内重入，因此快照读路径（本身已在队列中）内的回放与核验写入必须**不经 `track`** 直接落库；E1 才使用 `track`，从而让下一步消费前沿等待这次写入。
2. E4 回放只能覆盖**仍存活的受管子会话**：owner 会话的 `sessionFacts` 按性能设计不返回事件，宿主也没有“枚举 owner 已存档子会话”的端口；冷会话全量补登记需要一个新宿主 seam，记为后续项。

**门禁结果**（Node 24.17.0，规范根 DSH `0.2.1-alpha.2`）：`DSH_CONTROLS_HOST_ROOT=<DSH_INSTALL> node --test tests/*.test.mjs` → **851 项中 654 通过、0 失败、197 个桥用例按环境门禁 skip**；`scripts/verify-package.mjs --prepack`（清洁提交后）→ scratch tsc 与提交 `lib/` 一致、固定包清单 87 + 85 vendor = 172 通过。

**未做**：安装／热重载本机 Profile、发布／推送／打标签、`mattpocock_history` 观察 kind 与源清理域、cwd 事件兜底、冷会话回放枚举。

## 10. 与既有文档的关系

- [DESIGN.md](<DESIGN.md>)：新增决策节（2026-10-13）；源码已按该决策实施，仍标注为未安装。
- [WORKTREE_BINDINGS.md](<WORKTREE_BINDINGS.md>)：绑定记录语义不变，观察记录为其兄弟记录。
- [WORKTREE_ISOLATION.md](<WORKTREE_ISOLATION.md>)：流程建议由“父先建树”修订为“lane 自建树 + 观测登记”；研究结论（Git 元数据访问、依赖准备等前提）不变。
