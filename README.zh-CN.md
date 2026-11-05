# DSH Matt Pocock Skills

这是一个源码公开、可复现的 DeepSeek Harness Profile Bundle，用于加载 [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution) 中定义的 Skills Channel。

**当前状态：核心插件与历史 Phase 4 制品验证已完成；Phase 5 行为评估已关闭，但未通过。** 三次试验为 2 次通过、1 次硬失败，总体失败。当前协作实现与复审修复已通过机械源码／构建／测试验收；结果及单独保存的 clean-source 制品门禁见[公开验证摘要](<docs/VERIFICATION.md>)。源码公开不授权安装、启用、部署或 npm 发布。

- 已有仓库的升级须知：[MIGRATION.md](MIGRATION.md)
- 权威设计：[docs/DESIGN.md](docs/DESIGN.md)
- 实施计划：[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Phase 4 校验和绑定制品流程：[docs/PHASE4_ARTIFACT_VERIFICATION.md](docs/PHASE4_ARTIFACT_VERIFICATION.md)
- `implement-spec` 行为评估：已关闭且未通过（2 次通过、1 次硬失败）。其活动定义、器械与原始记录属于评估材料而非本包内容，已归档于本仓库之外。

该包通过 DSH 原生 `ctx.skills` Provider 暴露未经正文重写的上游 Skill。通道集是**数据驱动**的：插件发布的正是钉住的分发版本所声明的通道；未知通道名会**失败关闭**，而不是加载空集。

钉住的分发版本发布**两个通道，且通道只增不减**：

- `stable`：上游的正式集合，27 个 Skills。
- `beta`：`stable` 加上上游正在 `skills/in-progress/` 里预览的内容。目前没有预览项，所以 `beta` 解析出**同样的 27 个 Skills**；它存在的意义是让已经选了 `beta` 的 Profile 继续可用。

本版对应上游 **v1.3.2**（提交 `d1478fc`）。`PROVENANCE.json` 记录了这个对应关系，因此不必解析 Git 对象就能知道自己在跑上游哪一版；上游自己的 [CHANGELOG](vendor/mattpocock-skills/CHANGELOG.md) 也随包发货。

默认是 `stable`。这是非官方适配器，不代表 Matt Pocock 的认可、背书或关联。

**升级须知：** 上游 v1.3 把 `CONTEXT.md` 改名为 `GLOSSARY.md`，且**没有旧名回退**；技能在旧名缺失时**不会报错**，只会静默新建一份空的 `GLOSSARY.md`。已有仓库请先读 [MIGRATION.md](MIGRATION.md)。

## 0.13.0 只保留原生 cwd（破坏性变更）

0.13.0 删除 0.2.1-alpha.1 兼容桥与 `startupCwdEnabled` 下次启动请求。包内不再有固定的子代理 provider、旧 SDK 补丁、cwd CLI、`./compatibility`、`./native-subagent` 或 worktree-bridge locale 导出；`cordis.patch.yml` 只插入 Skills provider，不再禁用或替换 stock 原生子代理。

最低宿主为 DSH `~0.2.1-alpha.2`（由 `engines.dsh` 声明；alpha.1 会被拒绝）。宿主提供原生 `startActivation` 首次子代理 cwd seam 时，`mattpocock_delegate` 把显式 cwd 交给该 seam，并由会话工作目录 owner 记录；没有该原生 seam 时能力报告 `nativeInitialChildCwd: unsupported`，显式请求 cwd 的委托会在创建 child 之前失败关闭，省略 cwd 则继续继承父目录。

插件不再读取或写入任何启动设置。既有启动设置、binding、history 与 child 会话仍留在磁盘上，并在各自存储支持范围内保持可读；不会被自动删除或重写。若你曾手工应用旧 `host-patches/` 或使用旧 CLI，请先用自有备份恢复原 SDK；本仓库不再提供该工具。升级检查见 [MIGRATION.md](MIGRATION.md#plugin-0130-native-cwd-migration)。

## 0.4.2 单包兼容接入（历史；0.13.0 已删除）

本发布线包含针对 SDK `0.2.1-alpha.1`／canonical 公共包图的插件自有、哈希钉住首次 cwd 兼容实现。不改共享 SDK，不让用户另管补丁或启动器。正常流程只有安装／更新插件、保存独立的下次启动请求、必要时正常重启 DSH，再核对实际加载能力。保留既有 ACTIVE／PENDING 提供者和 continuable child；整个 bundle 移除／恢复不会构造第二个 canonical manager，真正根 shutdown 仍排空原生图。身份未知或不支持的拓扑保留普通原生行为。管理与启动请求仍默认关闭。准确的发行包身份与门禁结果随 GitHub Release 附件提供；安装不冒称当前 GUI 已启用。

## 0.4.1 启动修复（历史）

修复 `0.4.0` 在真实浏览器插件生命周期中漏声明自己的 Remote 命名空间依赖、导致 Web entry 激活失败的问题。新增原生 Client Fiber／Loader 激活、失败审计、卸载和 graph 重加入回归；不是仅检查模块导入。验证范围和此前测试盲区见[公开验证摘要](<docs/VERIFICATION.md>)。升级后需重新启用此前手动禁用的插件并重启 DSH；安装不会擅自清除禁用配置，也不会准备运行中的 SDK。

## 使用顺序与已知限制

1. **安装与启用是 DSH 层的操作。** 本包提供原生 Skill provider，声明 `stable` 与 `beta` 两个通道，默认使用 `stable`。安装不会自动切换 owner Profile，也不会修改项目约定。
2. **项目初始化是另一件事。** 在已启用插件的目标项目会话中，首次使用工程类 Skills 前运行 `/setup-matt-pocock-skills`。它会与用户确认 tracker、标签与领域文档，并写入项目配置；不是插件安装器。GitHub/GitLab 操作需要相应 CLI、认证和授权，也可选 local markdown。
3. **通过原生入口调用。** 用户用 `/skill-name` 调用；Skill 正文中的后续 Skill 调用由 agent 使用 DSH 的 `skill` 工具完成，不是自动递归执行 slash 文本。模型可调用与用户可调用权限分别生效。

当前本地 DSH 实现的兼容提示（不代表所有 Profile 均已启用相关能力）：

- `/compact` 只接受无参数形式，官方文档中的 `/compact 附加说明` 不能直接照用；`/clear` 同名入口尚未验证，不自动清空会话。
- DSH 默认识别 `AGENTS.md` 与 `CLAUDE.md`，无需批量改写为某一种文件名。
- **后台派发不等于 headless 保活。** 当前 headless 等 root idle 后汇总并退出，不能承诺后台子任务继续正常完成及回传。Web 场景不能由此直接推断；完整无人值守工作流需另行解决宿主生命周期。
- Git/worktree、浏览器、网络研究与共享笔记目录依赖目标环境和权限。provider 不安装这些工具、不授予外部写权限，也不绕过文件策略。
- **宿主版本。** Skills provider 已在 DSH `0.1.2-rc.1`、`0.1.7-alpha.2`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2` 与 `0.2.1-alpha.1` 上核对，该部分始终无需修改运行时代码。`0.2.1-alpha.2` 是第一个需要适配的宿主（原生子代理 activation seam）。`0.2.1-alpha.3` 移除了 `connection.operator`，改为 owner 的 `connection.browserPeer`；可选控制面读取的是旧属性，因此从 alpha.3 起它会在注册九个工具之前中断装载，而 Skills 分发不受影响（cordis 默认日志级别会丢弃 `warn`，所以实机终端上看不到任何提示）。现在以版本中立方式读取 operator Peer（`connection.operator ?? connection.browserPeer`，两者都不存在时失败关闭），并由用例覆盖两种拼写。`0.2.1-alpha.4` 改变了安装期门禁的判定依据：声明了 `engines.dsh` 就只按它判断，未声明才回退到 `@deepseek-ai/dsh*` peer 规则。0.13.0 声明 `"engines.dsh": "~0.2.1-alpha.2"`：引擎感知门禁放行 `0.2.1-alpha.2`、`0.2.1-alpha.3` 与 `0.2.2-alpha.*`，拒绝 `0.2.1-alpha.1`、`0.2.0-rc.2` 与 `0.3.0-alpha.1`；旧的兼容桥及其下次启动请求已不存在。`0.2.2-alpha.2` 在 `mattpocock_execute` 尚存时是需要运行时代码适配的宿主：工具执行拆入 executor 插件并移除了旧的单调用 `ctx.tools.execute`，该包装在那一宿主线上改用公开 `ToolExecutionPipeline`。0.7.0 源码线已整体移除该包装及 `executeNative` 路径，普通派发使用宿主原生工具。Skills provider 本身不变。`0.2.2-alpha.3` 已于 2026-11-04 复核，无需新的插件代码、元数据或制品改动：alpha.3 类型集下根与 Client 编译均 0 error，全量套件 **1077 通过、0 失败**（9 个环境门禁 skip）；已发布的 0.10.0 制品在隔离 headless profile 中成功安装并暴露 **27 个 Skills、11 个模型可见**。这是 headless 兼容核对，不代表浏览器 GUI 或模型运行。详见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。

职责边界见 [薄适配范围](docs/ADAPTER_SCOPE.md)，Skill 语义见 [兼容性清单](docs/COMPATIBILITY.md)，宿主版本见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。这些说明不改写官方 Skill 或历史评估结果，也不解除启用/发布门槛。

## 插件读取路径性能优化（0.11.0）

0.11.0 减少插件内部重复工作：业务历史改用线性 builder 与精确历史版本索引；Host 仅在公开 live／来源身份与修订能够证明当前有效时复用紧凑 descriptor 事实；完整 Remote 快照复用经过严格验证的不可变 JSON 表示。模型消费直接读取当前业务事实，同时保留必要的历史补捕获、provenance、上下文选择、物理／原生义务与持久提交 frontier 顺序。复用前仍检查当前权限；缺少可靠来源 token 的宿主保守重新观察。完整编辑／历史响应仍无损，模型有界 schema、存储格式、vendor 字节与宿主范围不变。

已认可的边界与测试 seams 见[性能契约](<docs/PERFORMANCE_READ_PATHS.md>)；源码、精确制品与发布证据另记在[验证摘要](<docs/VERIFICATION.md>)。本次交付**不为本机 DSH Profile 安装、不改共享 SDK、不重启服务、不 npm publish**。合成性能结果不充当宿主 CPU 事件的责任归因或生产延迟保证。

## 模型工具请求描述修正（0.10.2）

0.10.2 是描述补丁：将 `mattpocock_controls`、`mattpocock_record`、`mattpocock_history` 与条件注册的 `mattpocock_audit` 的模型可见描述改为运行时实际接受的顶层 `{action:...}` 请求；`mattpocock_worktree` 不再暗示其 read 形状不接受可选 query。新增回归测试断言这些描述。运行时代码、已注册工具面、schema-2 DTO、vendor 字节与宿主版本声明均不变。[v0.10.2 Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.2) 的同一精确五项资产已安装到当前 Web Profile（0.10.1 → 0.10.2），并已于 2026-11-04 12:21:58（+08:00）正常重启；新进程（PID 48436）已加载 0.10.2，工具与 Skill provider 复核通过。

## DSH 0.2.2-alpha.3 兼容复核（0.10.1）

0.10.1 是兼容性补丁：记录对 DSH `0.2.2-alpha.3` 的复核，不修改运行时代码、工具面、schema-2 DTO、vendor 字节或宿主版本声明。alpha.3 类型集下根与 Client 均可编译，全量套件 1077 通过、0 失败；已发布的 0.10.0 制品也已在隔离 headless profile 中安装并暴露 27 个 Skills、11 个模型可见。详见[宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。[v0.10.1 Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.1) 已安装到当前 Web Profile，并保留了 0.6.0 备份；当前 `dsh web` 进程未重启，不声称新进程已激活该版本。

## 插件内工具输出减负（0.10.0）

隔离实现遵循[有界输出设计](<docs/BOUNDED_TOOL_OUTPUTS.md>) 将插件模型工具的全快照改为当前视图、小写回执及逐次授权、按版本分段的正文；在 typed execute 返回前处理，不给 DSH spill/GC/PTC 打补丁，不删历史、不为本机安装或重启。新 schema 的用法见[迁移说明](<MIGRATION.md>)，实际完成状态见[验证摘要](<docs/VERIFICATION.md>)。

## 可选协作控制

可选 TypeScript 扩展已实现修订化全局/工作区设置、持久 owner-session 仪器、任务自定义票与裁决、参考 T/S、工作树绑定与创建观测、有界当前注入、分页历史与显式源旧历史清理，以及原生惰性客户端。不可变 Skill provider 保持独立；0.9.0 默认挂载七项固定工具 + 条件 `mattpocock_audit`；`mattpocock_delegate` 是仅由插件配置 `delegate: true` 启用的可选第八项（`mattpocock_execute` 已移除）。客户端仍声明九个 wire key，以呈现 opt-in delegate 与历史卡片；第三方设置/常驻摘要/右侧详情在宿主服务存在时提供。管理默认关闭，数值参考值未配置，不猜默认。用法见[协作控制说明](<CONTROLS.md>)。

**设计更新（2026-11-04；0.9.0 事实边界）。** 原生派发仍是普通无绑定 lane 的默认路径；只在任务需要写隔离时准备工作树，只读研究/review 可共享稳定检出。`mattpocock_delegate` 保留绑定式创建，但**默认不注册**，只有 profile 显式 `delegate: true` 才启用；结果分别报告 creation、binding、assignment，已接受或不确定的操作不得再创建第二个 child。原 `initialCwd` 执行事实改为来源明确的 `headerCwd`，不证明实际初始目录；旧 `initialCwd` 行兼容读取。迟到 end 不依赖 live Agent，按 run 身份防跨 run 覆盖；不再生成 header 路径相等的 initial-cwd 关联。`mattpocock_execute` 仍已移除，不新增模型工具、Remote 方法或存储域。安装/激活仍走独立门禁，本轮未安装本机 DSH/Profile/GUI；详见[事实边界设计](docs/INSTRUMENT_FACT_BOUNDARIES.md)与[验证](docs/VERIFICATION.md)。

T/S 超限或观测未知不拒绝合法原生委派，不新增业务审批。Git 工作树由 agent 自行创建、合并和删除；已清理树退出持续注入，废弃未清理仍提示，历史不默认过期。

0.4.2–0.12.x 的桥工作流已成为历史；0.13.0 删除该 provider、页面级下次启动请求与旧 CLI。原生 cwd 是直接的宿主能力：显式 delegate cwd 不再需要保存启动请求、boot receipt 或重启流程；没有原生 seam 的宿主会失败关闭，而不是装载替代 provider。既有 child cwd／历史与权限不变。具体见[控制指南](<CONTROLS.md>)和[验证摘要](<docs/VERIFICATION.md>)。原始研究、日志及收据保留在仓库外；package.private 防止 npm 发布，与仓库公开可见性分开。

## 当前开发验证

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -p tsconfig.json
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --out lib/client.js --declaration
# Optional installed-host storage/API fixtures: set DSH_CONTROLS_HOST_ROOT explicitly.
node --test tests/*.test.mjs
# Release prepack still requires a clean committed tree.
node scripts/verify-package.mjs --prepack
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 的文件系统加固已在 Linux/Node 24 上验证；不支持安全 no-follow 文件打开的主机会采用失败关闭策略，更广泛的平台兼容性仍需后续门禁验证。当前 0.9.0 的测试/构建计数与精确 clean-source 制品身份见[验证摘要](<docs/VERIFICATION.md>)；它们不安装或启用本机插件。

当前不发布到 npmjs。`@lmgatex` npm Scope 的所有权将在未来决定 npm 发布前单独确认。
