# 早期 DSH 工作目录兼容桥：识别、成本与退役方案

> **Status:** 2026-11-05 只读研究已完成；所有者已认可方案 C，0.13.0 实施中。本文记录识别、成本与实施契约；尚未把实现/测试/发布结果写回为已完成。
>
> **Decision:** 方案 C——删除兼容桥与 startupCwdEnabled，最低宿主 `~0.2.1-alpha.2`，版本 0.13.0；允许隔离开发、测试、push、tag 与 GitHub Release，**不安装本机**、不改当前 Profile/共享 SDK、不重启服务、不 npm publish。
>
> 公开边界：本文只引用仓库内可公开核对的文档、代码和聚合文件大小；不包含本机会话、原始日志、用户内容或私有路径。

## 1. 结论

本次识别的对象是 **0.4.2／0.4.3 引入的「子代理工作目录兼容桥」**，技术行名 mattpocock-native-subagent，固定的是 **DSH 0.2.1-alpha.1**：

- 该版本使用 startContinuable，未提供原生的首次 child cwd；桥通过随包固定、来源可验证的改造 provider 补上 cwd，并用 host-patches/ 与 initial-cwd.recipe.json 记录对旧 SDK 的补丁。
- 它不是 create_worktree 的实现。工作树的创建仍由宿主或 Git 完成；桥只负责让插件创建的 continuable child 从指定目录开始。[产品名称与边界](<../README.md>) 和 [启动 cwd 说明](<STARTUP_CWD_SUPPORT.md>) 都明确它不创建、合并或清理工作树。
- 从 0.2.1-alpha.2 起，宿主已有 startActivation 与 SubagentStartRequest.cwd；插件在真实服务同时提供 startActivation 和 workingDirectory.ensure 时走 native seam，否则才回退桥。[宿主兼容记录](<HOST_COMPATIBILITY.md>)、[Host seam 选择](<../src/host.ts>) 和 [原生派发优先](<NATIVE_DISPATCH_FIRST.md>) 都记录了这一分界。
- 当前宿主 0.2.2-alpha.3 走 native seam，桥行在组合 guard 下不被选中；但桥、旧 SDK 补丁、启动准备、包导出、bin、locale、测试和文档仍被打包、构建、审查和维护。
- **建议退役桥和 0.2.1-alpha.1 支持，最低宿主提升到 0.2.1-alpha.2。** 这能删除绝大部分兼容面；是否同时删除 startupCwdEnabled 启动开关是第二个产品选择，本文推荐一并删除，保守方案可先保留。

## 2. 它具体由哪些部分组成

| 层 | 位置 | 作用 |
|---|---|---|
| 固定改造 provider | [native-subagent-0.2.1-alpha.1.js](<../compatibility/native-subagent-0.2.1-alpha.1.js>)、[provenance](<../compatibility/native-subagent.provenance.json>) | 136,833 B 的固定产物；加载时校验字节/provenance，再绑定 canonical peer |
| 旧 SDK 补丁 | [initial-cwd.recipe.json](<../compatibility/initial-cwd.recipe.json>)、[host-patches](<../host-patches/README.md>) | 固定 0.2.1-alpha.1 的 5 个文件前后镜像；给旧 manager 加 cwd 和 initialCwdSupported |
| 同进程包装 | [native-subagent.ts](<../src/compatibility/native-subagent.ts>)、[composition.ts](<../src/compatibility/composition.ts>)、[peer-bindings.ts](<../src/compatibility/peer-bindings.ts>) | 通过公开 Loader 组合选择 stock 或兼容 provider；校验 ESM 解析、包身份和内置符号 |
| 准备/诊断 | [managed-sdk.ts](<../src/compatibility/managed-sdk.ts>)、[cli.ts](<../src/compatibility/cli.ts>)、[readiness.ts](<../src/compatibility/readiness.ts>)、[host-startup.ts](<../src/compatibility/host-startup.ts>) | 旧 SDK 检查/准备/恢复、启动前准备观测与兼容诊断 |
| 启动开关 | [startup-support.ts](<../src/controls/startup-support.ts>)、[startup-state.ts](<../src/controls/startup-state.ts>)、[client.ts](<../src/client.ts>) | startupCwdEnabled 的持久请求、boot receipt、设置页；当前仍 gate delegate 的显式 cwd |
| 组合补丁 | [cordis.patch.yml](<../cordis.patch.yml>) | 生成两行：禁用 stock subagent 并插入 mattpocock-native-subagent；表达式决定实际选择 |
| 包面 | [package.json](<../package.json>) | ./compatibility 与 ./native-subagent 导出、dsh-mattpocock-skills-cwd bin、worktree-bridge locale、固定 files 清单 |

旧版的缺口在 0.2.1-alpha.1：startContinuable 没有 cwd，标准 provider 也不暴露首次目录选择。桥因此不是“多传一个参数”，而是要把一个固定版本的子代理 manager 变成可验证的替代实现；这也是它需要 provenance、Loader 组合 guard 和专用测试根的原因。

## 3. 版本演进与当前事实

| 宿主线 | 原生 cwd | 原生 worktree 工具 | 插件路径 |
|---|---|---|---|
| 0.2.1-alpha.1 | 无 | 未装载 | 桥/旧 SDK 补丁 |
| 0.2.1-alpha.2 | startActivation + cwd | 默认未装载；ctx.worktrees／create_worktree 不存在 | 原生 cwd；桥不再装载 |
| 0.2.1-alpha.3/4 | 有 | create_worktree 契约存在 | 原生 cwd；桥不装载 |
| 0.2.2-alpha.3（当前） | 有 | 当前宿主可用 | 原生 cwd；插件只观测树创建 |

依据见 [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>) 的 alpha.2、alpha.3/4、alpha.3 核对，以及 [NATIVE_DISPATCH_FIRST.md](<NATIVE_DISPATCH_FIRST.md>) 的 2026-11-03 契约。0.2.1-alpha.2 的 worktree 工具默认不可用，并不影响桥退役：桥只传 cwd，树仍可由外部 Git 或更高版本宿主的 create_worktree 准备；工作树观测在工具不存在时只是没有可观测项，不是失败。

当前 initialChildCwdSeam 的顺序是：

1. 有 startActivation 且有 workingDirectory.ensure → native；
2. 否则服务有 initialCwdSupported === true → bridge；
3. 否则 unsupported。

当前宿主满足第 1 条。桥只在第 2 条时被组合 guard 选中；当前 cordis.patch.yml 仍保留这两行的生成物，但 guard 当前不选中兼容行。见 [host.ts](<../src/host.ts>) 的 initialChildCwdSeam 与 [cordis.patch.yml](<../cordis.patch.yml>)。

另一个容易混淆的事实：startupCwdEnabled 在当前原生宿主上仍会 gate mattpocock_delegate 的显式 cwd（[host.ts](<../src/host.ts>) 的 requireStartupCwd）。它不是桥本身，但它的“下次启动请求、boot receipt、兼容准备状态”UX 是为旧桥设计的。是否保留它，是退役方案中的独立选择。

## 4. 静态成本

以下是当前工作树的文件大小，不代表全部维护成本，但足以说明为何不应继续默认携带：

| 面 | 规模 |
|---|---:|
| compatibility/ | 147,693 B；其中固定 artifact 136,833 B、provenance 5,941 B、recipe 4,919 B |
| src/compatibility/ | 95,556 B，7 个源文件 |
| host-patches/ | 107,729 B；其中上游源码摘录 69,551 B |
| 兼容测试 | 200,600 B，8 个文件（plugin-readiness、managed-sdk、startup-support、host-cwd、compatibility-composition、compatible-import-inventory、canonical-peer-bindings、host-startup） |
| 包清单 | 21 个 files 条目与兼容/启动相关；17 个纯兼容文件 + 4 个 startup 文件 |
| 其他包面 | 4 个 exports、1 个 bin、2 个 worktree-bridge locale 子路径 |

更重要的成本不是字节数，而是持续维护：

- 固定的是**旧版 stock manager 的改造体**。宿主子代理/安全修复一旦变化，桥不能直接吃新字节；需要重新生成、校验 provenance、重跑 canonical peer 绑定。
- 组合 guard 依赖 Loader ESM 解析、包身份、根 Fiber 生命周期和内置符号；这些是最容易随宿主升级漂移的接缝。
- 需要双 SDK 根、专用 fixture、桥跳过分类和旧 Profile 升级矩阵；每次宿主兼容核对都要重新证明“不装载桥”与“装载桥”两条路径。
- 旧 SDK 准备/恢复、bin、locale 和文档需要独立审查；它们与 Skills 分发、仪器、worktree 观测没有产品耦合。

## 5. 方案比较（决策：C）

| 方案 | 内容 | 收益 | 风险/代价 | 判断 |
|---|---|---|---|---|
| A 保持现状 | 继续支持 0.2.1-alpha.1 | 旧宿主不破 | 全部兼容面继续维护 | 不推荐 |
| B 只退役桥 | 删除 artifact/recipe/host-patches/managed-SDK/composition/readiness；最低 0.2.1-alpha.2；保留 startupCwdEnabled 作为原生 cwd 开关 | 删除最大风险面；保留默认关闭行为 | 仍保留 startup 存储/UI/测试；delegate 仍需保存+重启 | 保守可用 |
| C 退役桥 + 启动开关 | 在 B 基础上删除 startupCwdEnabled、startup 存储/UI/boot receipt；原生 cwd 可用时 delegate 直接可用 | 最小包面与最少特例；不再有“兼容准备”状态 | 改变 delegate 的默认可用性；需重写相关测试/文档 | **推荐** |
| D 再要求原生 worktree 工具 | 把 create_worktree 也作为最低宿主门槛 | 产品叙事更统一 | 当前桥退役并不需要它；会额外丢弃可用宿主；需要先证明各 profile 的真实装载 | 不建议作为本轮条件 |

**所有者已选 C；B 作为历史备选，不再保留旧 provider。** 理由：桥已经只在没有 native seam 时才有意义；当前宿主和 alpha.2 以后都有 native cwd。继续保留桥的收益接近零，而它是最复杂、最容易随宿主演进的兼容面。startupCwdEnabled 的原始目的是为旧桥安排“下次启动”并避免在运行中换 provider；native cwd 不需要这个时序，保留它只会继续携带 boot receipt、准备诊断和设置页。

如果未来确实需要“默认不允许 delegate 请求 cwd”的开关，应作为新的 native 配置单独设计，不能借此恢复旧桥。

## 6. 实施阶段

### 阶段 0：决策与文档

- 已确认 C；最低宿主 `~0.2.1-alpha.2`。
- 新增/更新退役契约，明确：不再支持 0.2.1-alpha.1；不删除历史记录；不重写旧 binding/history；不自动回滚用户手工 SDK 补丁。
- 把 STARTUP_CWD_SUPPORT.md、PLUGIN_MANAGED_COMPATIBILITY.md、NATIVE_DISPATCH_FIRST.md 的旧桥段落标为历史/已退役，而非删除历史证据。

### 阶段 1：删除包面与旧 SDK 补丁

- 删除 compatibility/、host-patches/、src/compatibility/ 以及对应 lib/ 生成物。
- 删除 scripts/build-compatible-subagent.mjs、scripts/build-compatibility-patch.mjs。
- 从 package.json 删除 ./compatibility、./native-subagent、worktree-bridge locale 导出、dsh-mattpocock-skills-cwd bin 和对应 files。
- 若 @deepseek-ai/dsh-scope 仅被 peer-bindings/readiness 使用，删除该 peer；保留其他宿主 peer。
- cordis.patch.yml 只保留插入 Skills provider 的行，不再禁用/替换 stock subagent。

### 阶段 2：Host 只保留 native seam

- initialChildCwdSeam 收窄为 native / unsupported；删除 bridge、initialCwdSupported 检查、LegacyContinuationFacade 和 startContinuable fallback。
- HOST_CAPABILITIES.nativeInitialChildCwd 仅由 native 服务能力决定；没有 native seam 时明确 unsupported，不再装载替代 provider。
- delegate 的 cwd 路径只调用 startActivation；不支持时失败关闭并保留“没有创建 child”的事实。
- 已选 C：删除 HostStartupNode、inspectCompatibilityPreparation、startup_settings domain、startupStatus/saveStartupSettings Remote 方法与客户端启动设置区；不保留方案 B 的启动开关。

### 阶段 3：元数据与版本

- engines.dsh 从 ~0.2.1-alpha.1 提升到至少 ~0.2.1-alpha.2；用真实 evaluatePluginCompatibility 验证 alpha.1 被拒绝、alpha.2/rc/0.2.2-alpha 仍通过。
- 版本 0.13.0（0.x 下的兼容性破坏）；push、tag、GitHub Release 已授权，不安装本机。
- 更新 verify-package 的固定文件数、exports/bin/locale 断言和包清单。

### 阶段 4：回归与迁移门禁

- 当前宿主：native subagent({cwd})/delegate 正常；桥不存在；Skills/仪器/worktree 观测不变。
- 无 native seam 的 fixture：失败关闭，不装载替代 provider，不创建 child，不写 cwd。
- 包：不含 compatibility/host-patches/bin/locale；cordis.patch.yml 只有 Skills 行；旧 0.12.0 升级后没有残留 mattpocock-native-subagent 行。
- 迁移：真实的 0.12 Profile 备份后升级；测试显式 mattpocock-native-subagent 行、禁用/强制覆盖、旧 startup 设置；未知行不得静默改业务状态。
- 记录：source/精确归档、双 SDK headless、strict 下载回验；不把 Happy DOM/headless 当 GUI 验收。

### 阶段 5：发布与迁移说明

- 发布说明必须写清：不再支持 0.2.1-alpha.1；alpha.1 安装会被拒绝，先升级 DSH；旧桥不再装载。
- 已保存的 startupCwdEnabled 设置、旧 startup domain 和旧 binding/history：不要自动删除；说明它们可能不再被读取。
- 手工应用过 host-patches 或旧 CLI 的用户需要恢复原始 SDK；删除 CLI 后要提供一次性迁移说明/备份路径，或在最后一个兼容版本保留只读 restore 指导。
- 不自动 patch 共享 SDK、不重启服务、不改当前 Profile；本机安装不在本次授权内。

## 7. 迁移风险与需要先回答的问题

1. **Profile 残留行。** 兼容行来自 bundle patch，不是 live Profile 的 cordis.patch.yml；但外部用户可能显式覆盖过 mattpocock-native-subagent。必须用真实 0.12 → 0.13 升级测试确认不会留下未知行或阻断启动。若宿主保留旧行，需要一次性清理指引，而不是重新引入 provider。
2. **手工旧 SDK 补丁。** 正常插件路径不自动写共享 SDK，但旧 CLI/host-patches 可被手工使用。删除恢复工具前要给出恢复原 SDK 的方式；这是迁移文档义务，不是保留桥的理由。
3. **alpha.1 用户。** 安装 gate 会拒绝；需要明确升级提示，不能静默失败。若仍有必须支持的用户，方案 C 不成立，应先重新决策。
4. **原生 worktree 工具。** 它不是桥退役的必要条件；若产品要求“必须有原生 create_worktree”，需先测量目标 profile 的实际装载，再单独定最低版本，不能从版本号推断。
5. **删除启动开关后的行为。** C 让 delegate 在 native cwd 可用时无需保存启动请求；这是已接受的行为变化。它不改变普通原生 subagent 的 cwd，也不改变 worktree binding 语义。
6. **测试/文档历史。** 删除桥测试与旧文档会减少覆盖面；必须保留“无 native seam 失败关闭”和“旧数据可读”的回归，不把删除测试当成行为已证明。

## 8. 非目标

- 不删除 mattpocock_delegate、binding-first 创建、mattpocock_worktree 或原生 create_worktree 观测。
- 不改变 T/S、票、裁决、历史、消费、Skills/vendor、通道或 provider precedence。
- 不修改当前共享 SDK/Profile、不重启服务、不 npm publish、不覆盖旧 tag/Release。
- 不把本文的静态大小、文件清单或版本推断当成实现完成或宿主验收。
- 不在没有真实 0.12→0.13 Profile 迁移测试的情况下宣称“删除后不会残留兼容行”。

## 9. 证据索引

- [DESIGN.md](<DESIGN.md>)：2026-10-09 宿主原生 cwd seam、旧宿主兼容说明、native-first 决策。
- [NATIVE_DISPATCH_FIRST.md](<NATIVE_DISPATCH_FIRST.md>)：native-first、旧宿主 capability fallback、delegate 保留。
- [STARTUP_CWD_SUPPORT.md](<STARTUP_CWD_SUPPORT.md>)：旧桥开关、下次启动请求、准备/诊断边界。
- [PLUGIN_MANAGED_COMPATIBILITY.md](<PLUGIN_MANAGED_COMPATIBILITY.md>)：0.4.2/0.4.3 的同进程兼容 provider 与旧 SDK 维护。
- [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>)：alpha.2 的 native cwd、alpha.2 worktree 默认未装载、alpha.3/4 的 create_worktree 契约。
- [host-patches/README.md](<../host-patches/README.md>)：旧 SDK 补丁、固定来源、恢复边界。
- [package.json](<../package.json>)、[cordis.patch.yml](<../cordis.patch.yml>)、[src/host.ts](<../src/host.ts>)：当前包面、组合行与 seam 选择。
