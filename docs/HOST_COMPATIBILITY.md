# DSH 宿主版本兼容性核对

## 结论

**从 DSH `0.1.2-rc.1` 到 `0.2.1-alpha.1`（含 `0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2`），本插件始终不需要修改运行时代码。**

`0.2.1-alpha.2` 是第一个需要运行时代码适配的宿主：子代理公开 API 由 `startContinuable` 改为 `startActivation`（并新增 `delivery`／`SubagentStartRequest.cwd`），本插件改用宿主原生 seam 传递显式首次 cwd；技能 provider 契约不变。详见下节。

`0.2.1-alpha.3` **要求一次运行时代码适配**：`connection` 服务不再暴露 `operator`，改为 owner 的 `browserPeer`，可选控制面因此从 alpha.3 起装载中断（Skills 分发不受影响）。`0.2.1-alpha.4` 改变的是**插件兼容性的判定依据**：声明了 `engines.dsh` 的插件只按该范围判定，未声明时才回退到原有 peer 规则。本插件据此显式声明范围、以版本中立方式读取 operator Peer，并补齐宿主侧 fixture 的 Peer 契约。详见后文专门小节（此前记的「alpha.3／alpha.4 无需改动」只覆盖了门禁与包级对拆，漏掉了 alpha.2→alpha.3 的 `connection` 服务变化）。`0.2.1-rc.1` 相对 alpha.4 没有任何面向本插件的接口变化，同样不需要修改运行时代码或包元数据（核对见后文）。`0.2.1-rc.2` 只改模型目录、Web 搜索／抓取与对应设置界面，本插件使用的宿主包源码与安装产物零改动（核对见后文）。

`0.2.2-alpha.2` **要求第二次运行时代码适配**：工具执行拆成 executor 插件，旧的单调用 `ctx.tools.execute` 被删除；本插件改用公开 `ToolExecutionPipeline` 保留受管嵌套调用的 parent token 与既有 policy／guard 语义，并对没有该接缝的旧宿主保留单调用回退。Skills provider 仍不需要改动（核对见后文）。

Skill Provider 契约在所有已核对的宿主版本之间保持不变：`registerProvider`、`list`、`get` 的签名、`BUNDLED_SKILL_RANK`、运行时导出清单都没有变化。用新宿主的类型声明重新编译后，从 `0.1.2-rc.1` 到 `0.2.1-rc.2` 的 `lib/` 产物与最初宿主编译结果**逐字节相同**；`0.2.2-alpha.2` 因上述工具接缝改变了 `lib/host.js`，Client 产物仍逐字节不变。

### 客户端 baseline 与仪器工具卡（2026-11-01）

仪器工具卡使用 DSH 公开 baseline `@deepseek-ai/dsh-client-ui-primitives`，不导入私有 `ToolRow`。`0.2.1-alpha.1` 与 `0.2.2-alpha.2` 的声明都导出 `DisclosureRow`、`CodeBlock`、`JsonBlock`、`Button` 和 `IconSparkleRegular`；`DisclosureRow.headerAccessory` 只在 `0.2.2` 系列出现，因此本轮不使用它，“打开当前实例”放在展开体，保持 `engines.dsh: "~0.2.1-alpha.1"` 不变。客户端 bundle 只把 ui-primitives 视为隐式 baseline external，不写进 `dsh.client.external`。本轮机械验证使用已安装的 0.2.1-alpha.1 声明和 Happy DOM；没有进行 0.2.2 的真实 GUI 挂载，也没有安装到本机 Profile。

早期版本必须修改的多是 **`package.json` 中声明的 peer 依赖范围**；`0.2.1-alpha.2` 与 `0.2.2-alpha.2` 则是真正的运行时接缝适配。peer 范围问题两次具体表现不同：

- **`0.1.7-alpha.2`**：旧声明 `^0.1.2-rc.1` 不满足该预发布版本，安装会出现「peer 不满足」告警，但仍可安装。
- **`0.2.0-rc.1`**：宿主新增了**安装期硬门禁**，直接**拒绝安装** peer 不满足的插件（详见下节）。

## 0.2.0-rc.1 新增的安装期 peer 门禁

`@deepseek-ai/dsh-app-boot/lib/index.js` 在安装与启动时检查插件声明的 peer：

```js
for (const [name, range] of Object.entries(dependencies)) {
  if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
  const requirement = ['workspace:^','workspace:~','workspace:*'].includes(range) ? runtimeVersion : range
  if (requirement.trim() === '' || !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true }))
    peers[name] = range
}
```

要点：

- **只检查**名字为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的 peer。我们的 `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 不被检查，被检查的只有 `@deepseek-ai/dsh-skill`。
- 判定对象是 **DSH 运行时版本**（`0.2.0-rc.1`），不是 `dsh-skill` 包自身的版本；DSH 各包与运行时同版本发布，因此两者一致。
- 使用 **`includePrerelease: true`**，比 pnpm 默认的 peer 判定宽松。这也意味着 `^` 上限在该模式下会接受同一次版本线内的更高预发布版本。
- 不满足时安装被拒绝，并提示可用 `dsh plugin allow-version` 做**按精确版本的风险豁免**。本项目不使用该豁免，而是发布兼容版本。

## 0.2.1-alpha.1 核对

`0.2.1-alpha.1` 是 npm `alpha` dist-tag 指向的新开发线（`latest` / `next` 仍是 `0.2.0-rc.2`）。核对在 `/tmp` 下的两个全新隔离安装里对拆 `0.2.0-rc.2` 与 `0.2.1-alpha.1`，未改动本机 DSH 与任何 Profile。

| 核对项 | 结果 |
|---|---|
| 安装期 peer 门禁（`dsh-app-boot/lib/index.js:277-313`） | 与 `0.2.0-rc.2` **逐字节相同**；仍只检查 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` 前缀 |
| 直接调用两版**真身**判定函数（喂插件真实 `package.json`） | 四种组合全部 `OK (no incompatibility)` |
| `dsh-skill`、`dsh-skill-filesystem`、`dsh-skill-badge`、`dsh-skill-office` 的整个 `lib/`（含类型） | **逐字节相同**，sha256 一致 |
| `BUNDLED_SKILL_RANK` = 600、`RUNTIME_RANK` = 250、`registerProvider` / `list` / `get`、导出面 | 全部相同 |
| provider 冒烟（真实运行时注册表） | 两版均为 25 候选、25/25 加载成功，指纹同为 `cd41342ee6cd67b8164d4a515d7c10d2389895f54e999aba32fad1bffe416119` |
| patch 解析与加载（`bundlePatchFiles`、`loadOverlayPatches`、`prepareProfileEntries` 等） | 逐字节相同；插件 `cordis.patch.yml` 两版解析输出一致 |
| profile bundle 变化 | 仅新增 `dropRetiredBundles()`（只移除 `@deepseek-ai/dsh-experimental-schedule-bundle`）与 `OPTIONAL_BUNDLES` 换入 inspector-profile，均不含本插件 |

**两个边界要记住：**

- 门禁放行**依赖 `includePrerelease: true`**。换成 pnpm 的默认判定，`0.2.1-alpha.1` **不满足**现有范围，只会产生 peer 告警（安装期门禁本身仍会放行）。
- 上界是 `<0.3.0-0`：`0.3.0-alpha.1` 实测为 **false**。0.3 线到来时必须更新 peer 范围，或使用 `allow-version` 豁免。

因为两版 `dsh-skill` 的 `lib/types` 逐字节相同，`devDependencies` 仍钉在 `@deepseek-ai/dsh-skill@0.1.7-alpha.2`：升级它不会改变编译产物，只会让 pnpm 把整条新宿主的 peer 家族重新解析进来。运行时由 profile interception 指向运行时副本，`devDependencies` 只影响编译期类型。

## 0.2.1-alpha.2 核对

在 `/tmp` 下的全新隔离安装中进行（各自独立 `DSH_HOME`，未改动本机 DSH 与任何 Profile，未调用模型）。

| 核对项 | 结果 |
|---|---|
| 安装期 peer 门禁 | 通过；alpha.2 真实 `evaluatePluginCompatibility`（`includePrerelease: true`）对 16 条受检范围零拒绝，pnpm 默认判定对 `0.2.1-alpha.2` 同样零告警 |
| 门禁边界 | `0.2.2-alpha.1` 门禁通过但 pnpm 默认判定告警 16 条；`0.3.0-alpha.1` 被门禁拒绝——与 alpha.1 时结论相同 |
| `@deepseek-ai/dsh-skill` 的 `lib/` | 与 `0.2.1-alpha.1` **逐字节相同**（`dsh-tool-skill`／`dsh-skill-filesystem` 仅有附加差异：agents home 解析、watcher 错误处理） |
| 插件树装载 | 正常；日志无本插件／子代理错误，宿主在模型调用前以 `MISSING_CREDENTIAL` 结束 |
| `stable` 注册表报告 | 27 个 Skills、11 个模型可见；sha256 `a7d694ead579fadeea80bd61f9cb821294ce629a757385529cdaf65aa1b96249`，与 `0.2.1-alpha.1` **逐字节相同** |
| 实际加载的子代理服务 | `startActivation` 存在、`startContinuable` **已删除**、无 `initialCwdSupported` getter；会话工作目录服务存在 |
| 官方 Git Worktrees | 默认**未装载**（`ctx.worktrees`、`create_worktree` 均不存在）；出厂 profile 不启用该项 |
| `agent/pre-step` 载荷 | 与 alpha.1 相同 |

破坏性变化与处理：`startContinuable` 被 `startActivation` 取代，`ContinuableStartSpec`／`ContinuableStart` 等类型一并移除。本插件按实际加载的公开服务选择 seam：有原生 `startActivation` + 会话工作目录 owner 时走原生，否则仍走随包兼容提供者；导入前组合 guard 在 alpha.2 上把原行留给 stock，不会装载陈旧的 alpha.1 服务。

## 0.2.1-alpha.3 / 0.2.1-alpha.4 核对

在隔离的全局布局安装中进行（`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.1-alpha.4`，与 DSH 自身的安装层级一致），与 `0.2.1-alpha.2` 对拆；未改动本机 DSH 与任何 Profile，未调用模型。alpha.3 与 alpha.4 之间，本插件使用的宿主包（`dsh-tools`、`dsh-session`、`dsh-agent`、`dsh-subagent`、`dsh-storage-domain`、`dsh-typert-protocol`、`dsh-api-gateway`、`dsh-skill`、`dsh-experimental-tool-worktree`、`dsh-workspace`，以及 renderer／session／sidebar-right 客户端包）除各自 `package.json` 版本号外**逐字节相同**；不同的只有 `dsh-app-boot`（门禁）与三个纯 UI 客户端包（conversation／plugin-manager／tool）。alpha.3 的门禁与 alpha.2 一样只读 peer（`engines` 被忽略），`unmetRequirements` 与 `engines.dsh` 判定是 alpha.4 引入的。因此 **alpha.4 是这一线里唯一带来面向插件作者的元数据变更的版本**。

| 核对项 | 结果 |
|---|---|
| alpha.3 → alpha.4 包级对拆（本插件使用的 19 个包） | 除 `dsh-app-boot` 与三个纯 UI 客户端包外**逐字节相同**（仅 `package.json` 版本号不同） |
| 安装期门禁（`dsh-app-boot/lib/index.js`） | alpha.4 的 `unmetRequirements`：**声明了 `engines.dsh` 就只按它判定**，未声明才回退到原有 `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer 判定；结果字段由 `peers` 改为 `requirements`，告警文案随之更新 |
| 门禁真身判定（两版函数 × 9 个运行时版本） | 声明 `engines.dsh: "~0.2.1-alpha.1"` 前后**逐版本一致**：`0.2.1-alpha.1`…`0.2.2-alpha.*` 放行，`0.2.0-rc.2` 与 `0.3.0-alpha.1` 拒绝 |
| 本插件使用的 21 个宿主包运行时导出清单 | **零删除**；`dsh-typert-protocol` 仅有附加导出 `principalOf`、`isTypertRemoteMethod`、`createTypertRemoteInfo` |
| `post-execute` 瀑布、`create_worktree` 结果键（`repositoryRoot`／`baseCommit`）、`listChildren`／`listDescendants`／`startActivation`、`tool/call`／`tool/result`／`tool/ptc-dispatch`／`working-directory/change`、技能注册表与 `DomainFacility` | 名称与存在性逐项相同 |
| `PeerScope` | 新增 `principal`、`signal`、`interactions`（真实浏览器 Peer 以 `principal: { kind: 'owner' }` 创建）；Gateway 的 `invoke` 现在要求请求携带 Peer，并拒绝已释放的 Peer。本插件只读取 `peer.id`，产品代码无需改动 |
| 客户端插槽键 | 本插件使用的 6 个键（`plugins.bundle.config`、`plugins.row.config`、`conversation.session.header.utilities`、`conversation.input.dock`、`sidebar.right.pane.tab`、`tool.call.toolview`）在两版都存在 |
| `@deepseek-ai/dsh-client-ui-slots` | **不再作为安装依赖**：alpha.4 把它降为 UI 包的 devDependency，Renderer 仍在运行时 require 该模块 id，由 Web 前端构建产物（`dsh-web-frontend/dist`）以 static module 提供 |
| `connection` 的 operator Peer | alpha.1／alpha.2 为 `connection.operator`（`OperatorPeer`，`id` 为每进程随机值）；**alpha.3 起改为 `connection.browserPeer`**（owner Peer，所有浏览器请求共用，`principal: { kind: 'owner' }`）。本插件原先只读旧属性，实机 alpha.4 装载时在 `createHostAuthority` 抛 `TypeError: Cannot read properties of undefined (reading 'id')` |

三项处理：

- **声明 `engines.dsh`。** `package.json` 现为 `"engines": { "node": ">=22", "dsh": "~0.2.1-alpha.1" }`。该范围与既有 peer 判定实测逐版本等价，所以 alpha.4 起走声明路径、旧宿主继续走 peer 规则，兼容性判定不变。[包策略校验](<../scripts/verify-package.mjs>)与[脚手架用例](<../tests/scaffold.test.mjs>)固定这条声明，防止它悄悄漂移。
- **宿主 fixture 补齐 Peer 契约。** 宿主侧用例经真实 `TypertGatewayService` 调用 Remote，alpha.4 会读取 `peer.signal` 与 `peer.principal`；缺少它们的假 Peer 会在进入本插件代码之前抛 `TypeError`。新增 `tests/fixtures/peer.mjs` 构造两版都合法的 Peer，[host.test.mjs](<../tests/host.test.mjs>)、[host-startup.test.mjs](<../tests/host-startup.test.mjs>)、[host-collaboration.test.mjs](<../tests/host-collaboration.test.mjs>) 与 `tests/fixtures/runtime-host.mjs` 使用它。产品代码不构造 Peer，因此没有行为改动。
- **版本中立地读取 operator Peer（0.4.31）。** [host.ts](<../src/host.ts>) 新增 `connectionOperatorPeer(ctx)`：`connection.operator ?? connection.browserPeer`，两者都不存在（或 `id` 不是非空字符串）时抛 `ControlsError('feature-disabled', …)`，不再先解引用再崩溃。`operatorCaller` 与 `createHostAuthority` 共用它，授权仍以 `invocation.peer.id` 匹配该 Peer。新增两条用例：unit 覆盖 `operator`／`browserPeer`／两者皆无三种连接形态，mount 覆盖 alpha.3+ 拼写下 `mountHost` 的完整装载与 `mattpocock_controls` 执行。该修复随 0.4.31 发布，制品验收（四宿主隔离门禁与真机 `dsh web` 装载）见[制品验收](<VERIFICATION.md>)。

客户端原生激活 fixture 需要从安装包组装 Renderer，而 alpha.4 的安装布局不再提供该模块，[client-native-activation.test.mjs](<../tests/client-native-activation.test.mjs>) 因此在缺少该包时按环境门禁 skip 并给出诊断，而不是把它记成产品失败。本插件的客户端产物不 require 任何 `@deepseek-ai/*` 模块 id（导入全为 type-only 或服务注入），该虚拟模块变化不影响运行时。

## 0.2.1-rc.1 核对

rc.1 的发布说明是相对 `0.2.0-rc.2` 汇总的，其中插件面的变更（`./invariant` 导出移除、子路径插件元信息、`engines.dsh` 优先判定、输入区统计拆分、子代理通知统一）大多在 alpha 线已经落地。把 rc.1 与 alpha.4 直接对拆后，相对本插件的实际差异很小。核对在隔离的全局布局安装中进行（`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.1-rc.1`），未改动本机 DSH 与任何 Profile，未调用模型。

| 核对项 | 结果 |
|---|---|
| 303 个 `@deepseek-ai/*` 包（比较时排除各自 `package.json`） | **285 个逐字节相同**，18 个有差异；包集合无增删 |
| 18 个差异包 | `dsh-tools`、`dsh-tool-subagent`、`dsh-tool-fs`、`dsh-tool-cordis`、`dsh-api-account-controller`、`dsh-api-remotes`、`dsh-api-terminal-controller`、`dsh-client-modules`、`dsh-client-ui-model-selection`、`dsh-client-ui-settings-account`、`dsh-client-ui-settings-general`、`dsh-client-ui-sidebar`、`dsh-client-ui-sidebar-right`、`dsh-client-ui-skill`、`dsh-cordis-client-runner`、`dsh-deepseek-account`、`dsh-deepseek-account-platform`、`dsh-sdk-app` |
| 导出面 | 18 个包的运行时导出清单**零删除、零改名**；`dsh-tools/lib/types/index.d.ts` 未变 |
| `dsh-subagent`、`dsh-session`、`dsh-agent`、`dsh-workspace`、`dsh-storage-domain`、`dsh-skill`、`dsh-app-boot`、`dsh-api-gateway`、`dsh-typert-protocol`／`dsh-typert-registry` | 与 alpha.4 **逐字节相同**；子代理服务、事件词表与安装期门禁实现均未变 |
| `dsh-tools` 实际差异 | 仅 `run_code` 内部：`code` 参数排到 `description` 前、新增 function-body 语法说明、SDK 提示词重排；不涉及工具注册或 `ToolDefinition` 类型 |
| `dsh-tool-subagent` 实际差异 | 仅系统提示删除一句“等待子任务时结束当前轮次”的指引；工具结果形状与子代理服务不变 |
| 客户端 | `dsh-client-ui-conversation` 未变；`sidebar.right.pane.tab` 只伴随 CSS（`overflow: clip`）变化；`dsh-cordis-client-runner` 仅新增槽键 `conversation.input.model.label`（加法）。本插件使用的槽键（`plugins.bundle.config`、`plugins.row.config`、`conversation.session.header.utilities`、`conversation.input.dock`、`sidebar.right.pane.tab`、`sidebar.session.row.leading`、`tool.call.toolview`）全部存在 |
| 安装期门禁 | rc.1 真身 `evaluatePluginCompatibility` 对插件 manifest 返回无问题：`engines.dsh: "~0.2.1-alpha.1"` 在 `includePrerelease: true` 下接受 `0.2.1-rc.1`；声明后只按该范围判定 |
| 规范宿主全量用例（alpha.4） | 856 用例、656 通过、0 失败、200 skip |
| rc.1 同源全量用例 | **856 用例、656 通过、0 失败、200 skip**（含 S.depth 三条新用例；6 条客户端原生激活用例因安装不提供 `@deepseek-ai/dsh-client-ui-slots` 仍按前置条件 skip，与 alpha.4 相同） |
| 隔离 headless 装载（本工作树打包 412309 bytes，sha256 `6e66244b…`） | `stable`／`beta` 两 channel 均安装成功、dump-config 选中、boot 停在 `MISSING_CREDENTIAL`；27 Skills、11 模型可见；`stable` 注册表报告 sha256 `a7d694ead5…`，与 alpha.4 的 0.4.31 制品**逐字节相同**；无 build 脚本请求 |

结论：**rc.1 不需要任何运行时代码或元数据改动。**

## 0.2.1-rc.2 核对

rc.2 是模型目录与 Web 搜索能力的小版本；npm 发布比 GitHub Release 晚约半小时，中途还曾缺一个包的 tarball（见末行）。核对先做源码级对拆，再在完整的 `npm install --global` 安装上跑全量套件与 headless 装载。

| 核对项 | 结果 |
|---|---|
| tag 间 `packages/` 源码差异（排除 README、i18n、测试与 `package.json`） | 新增 16 个文件、修改 10 个、删除 0 个 |
| 发生运行时源码变化的包 | 新增 `dsh-web-deepseek-api`、`dsh-client-ui-deepseek-model-label-1017`；修改 `dsh-web`、`dsh-web-search-deepseek`、`dsh-client-ui-settings-web-search`、`dsh-cordis-client-runner`（仅槽目录）、`dsh-base`／`dsh-web-app`（各一行 bundle 组合） |
| 其余触及包 | `dsh-agent-preset` 只有一份参考文档、`dsh-tool-web` 只有测试、`dsh-web-frontend` 只有测试与 tsconfig |
| 安装树对拆（rc.1 → rc.2） | 303 → 305 个包（新增上述两个）；292 个除 `package.json` 版本号外逐字节相同；11 个有内容差异：`dsh-web`、`dsh-web-search-deepseek`、`dsh-client-ui-settings-web-search`、`dsh-client-ui-settings-account`、`dsh-client-ui-settings-general`、`dsh-client-ui-sidebar`、`dsh-client-modules`（构建提交串）、`dsh-cordis-client-runner`（槽目录）、`dsh-base`／`dsh-web-app`（组合行）、`dsh-agent-preset`（参考文档） |
| 本插件使用的 30 个宿主包 | **源码与安装产物均零改动**；含 `dsh-tools`、`dsh-subagent`、`dsh-session`、`dsh-agent`、`dsh-skill`、`dsh-app-boot`、`dsh-api-gateway`、`dsh-typert-protocol`／`dsh-typert-registry`、`dsh-workspace`、`dsh-storage-domain` 与 7 个客户端包 |
| 槽目录 | 唯一变化是为 `conversation.input.model.label` 记录新占用者并把 `replaceRisk` 标为 `shadows-shipped-ui`；本插件使用的 7 个槽键全部保留 |
| 安装期门禁 | rc.2 真身 `evaluatePluginCompatibility` 对插件 manifest 返回无问题；`engines.dsh: "~0.2.1-alpha.1"` 对 `0.2.1-rc.2` 的 semver 判定为 `true` |
| 全量套件 | **856 用例、656 通过、0 失败、200 skip**，与 alpha.4／rc.1 完全一致 |
| 隔离 headless 装载 | 本工作树打包 412309 bytes（sha256 `6e66244b…`）；`stable`／`beta` 均安装、dump-config 选中、boot 停在 `MISSING_CREDENTIAL`；27 Skills、11 模型可见；`stable` 报告 sha256 `a7d694ead5…`、`beta` 为 `c32b0b89…`，均与 alpha.4／rc.1 逐字节相同 |
| npm 发布时序 | 核对期间发布一度未完成：`dsh-client-ui-settings-account@0.2.1-rc.2` 的元数据先出现、tarball 仍 404，`npm install --global` 失败；约数分钟后 tarball 补齐。最终结果使用完整的 `npm install --global` rc.2 安装树复跑，早期替代构建的结果不计入 |

结论：**rc.2 不需要任何运行时代码或元数据改动**；上游补齐缺失包后，本插件不受影响。

## 0.2.2-alpha.2 核对（2026-10-29）

在隔离的全局布局安装中进行（`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.2-alpha.2`，330 个 `@deepseek-ai` 包，Node 24.17.0）；另以独立 `DSH_HOME` 安装本工作树制品并做无凭据 headless 装载。未改动本机 DSH 与任何 Profile，未调用模型。

这一版是 `0.2.1-rc.2` 之后第一个要求运行时代码适配的宿主：工具执行从注册表单调用拆成可选择的 executor 插件，**移除了旧的单调用 `ctx.tools.execute`**。其余变化主要是服务初始化时序、会话投影与 Web 客户端类型，Skills provider 契约不变。

| 核对项 | 结果 |
|---|---|
| 安装期门禁 | 新宿主真身 `evaluatePluginCompatibility` 对插件 manifest 返回无未满足项；`engines.dsh: "~0.2.1-alpha.1"` 仍放行 `0.2.2-alpha.2`，无需 `allow-version` 豁免或 peer 范围改写 |
| `@deepseek-ai/dsh-skill` | 运行时代码与类型未变；`registerProvider`／`list`／`get`／`BUNDLED_SKILL_RANK` 不变，Skills 分发无需改动 |
| `@deepseek-ai/dsh-tools` | **破坏性变化**：`ToolRuntime.execute(ToolExecutionInput)` 变为 `ToolsService.execute(ToolBatchInput)`；新增 `setExecutor`／`resolve`／`executable` 与 `@deepseek-ai/dsh-tools/pipeline` 子路径 |
| 受管原生调用 | 本插件的 `mattpocock_execute` 不再假设旧单调用入口；0.2.2 上改用公开 `ToolExecutionPipeline` 的 `prepare → dispatch → complete`，保留原调用的 `parent` token、`rootCallId`、policy、guard 与 post-execute。只有实际服务没有 `setExecutor` 的旧宿主仍走原单调用入口 |
| `@deepseek-ai/dsh-subagent` | `startActivation` 签名与 `delivery`／`cwd` 语义未变；服务新增 `[Service.init]` 并注入 `workingDirectory` + `sessionProjections`。插件运行时代码无需改动；旧宿主 `startContinuable` 回退改用结构化类型，不再依赖新版本已删除的声明 |
| `@deepseek-ai/dsh-agent` / `dsh-agent-loop` | `AgentRegistry`、`AgentLoop` 的初始化移到 Cordis `[Service.init]`；插件不自行构造这些服务，真实 Host 组合不受影响。测试夹具改为以公开 `ctx.plugin()` 挂载它们，才能得到真实的 agent factory |
| `@deepseek-ai/dsh-system-prompt` | 装配瀑布拆出 `PromptPresentation`，工具声明改由 provider 拥有；插件只注册文本 context section，接口兼容，行为不变 |
| `@deepseek-ai/dsh-app-boot` | `PROFILE_TEMPLATES` 移到新的 `@deepseek-ai/dsh-official-bundles`；产品代码不使用该表，管理器测试在新宿主上从 official-bundles 读取 |
| 会话／存储／Typert／Gateway | 本插件使用的公开类型与运行时代码通过编译和真实 Host 用例；会话投影的异步句柄变化不影响本插件（不注册 projection unit） |
| 客户端包 | 插件 Client 入口用新宿主类型声明通过独立 `tsconfig.client.json` 检查；客户端产物未变（212,412 bytes、6 个模块、仅 `react` 外部依赖）。未做真实浏览器交互 |
| 全量根测试（新宿主，主检出） | **944 项、744 通过、0 失败、200 skip**；隔离工作树没有 dev `client-ui-slots` 时为 741／203 |
| 全量根测试（`0.2.1-rc.3` 回归） | **944 项、744 通过、0 失败、200 skip**，与适配前一致 |
| `0.2.1-alpha.1` 兼容回归（独立隔离安装） | 兼容矩阵 **154 项、140 通过、0 失败、14 skip**；覆盖旧 `startContinuable` 回退、兼容提供者、打包 Profile、PluginManager 与只读准备 |
| 无凭据 headless 装载 | 独立 `DSH_HOME` 安装 `0.4.39` 制品（428,735 bytes、sha256 `0732000b…`、172 成员）；默认 `stable` 装载 27 个 Skills、11 个模型可见，无插件 warn／error，模型请求前以 `MISSING_CREDENTIAL` 结束。headless 不组合 Web 的 `connection`／`workspaceRegistry`，可选控制面按设计不挂载，所以这次装载只证明 Skills 分发与宿主门禁 |
| 模型调用 | 无 |

适配后的运行时代码改动只有两个接缝：`src/host.ts` 的 `executeNative` 和旧子代理回退的结构化类型。Skill 正文、vendor 字节、通道语义、provider 优先级与 `engines.dsh` 声明均未改变。测试夹具侧新增了公开 pipeline 的单调用适配、真实 `SessionProjectionRegistry`、以 `ctx.plugin()` 挂载异步服务，以及 0.2.2 的 official-bundles 读取；这些不改变产品入口。

## 核对范围与方法

核对过程只做只读与隔离验证：不改动本机正在使用的 Profile，不调用任何模型。

1. 用 `npm pack` 拉取两个版本的发布包，直接对比 `lib/types/*.d.ts`、运行时导出与 `package.json`。
2. 用新宿主的类型声明重新编译 TypeScript，比较 `lib/` 产物。
3. 用新宿主真实的 `Context` 与 `SkillRegistry` 运行既有插件契约测试。
4. 在隔离的 `DSH_HOME` 中把插件分别安装进旧宿主与 `0.1.7-alpha.2`，装载真实插件树，逐字节对比注册表报告。

## 版本对照

| 宿主包 | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 | 0.2.0-rc.2 | 0.2.1-alpha.1 |
|---|---|---|---|---|---|---|
| `@deepseek-ai/dsh-skill` | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 | 0.2.0-rc.2 | 0.2.1-alpha.1 |
| `@deepseek-ai/dsh-tool-skill` | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 | 0.2.0-rc.2 | 0.2.1-alpha.1 |
| `@deepseek-ai/cordis` | 4.0.2 | 4.0.4 | 4.0.4 | 4.0.4 | 4.0.4 | 4.0.4 |
| `@deepseek-ai/schemastery` | 3.18.2 | 3.18.4 | 3.18.4 | 3.18.4 | 3.18.4 | 3.18.4 |

## 实际 API 差异

| 变化 | 影响 | 处理 |
|---|---|---|
| `SkillSummary.path?: string`；`SkillCandidate` / `SkillDefinition` 不再各自声明 `path` | 两者都 `extends SkillSummary`，我们同时设置 candidate 与 definition 的 `path`，仍然类型正确 | 无需改动 |
| `registerProvider(create: (control) => SkillProvider)` | 签名逐字相同 | 无需改动 |
| `list` / `get` 签名与返回类型 | 逐字相同 | 无需改动 |
| `BUNDLED_SKILL_RANK` = 600、`RUNTIME_RANK` = 250 | 数值相同 | 无需改动 |
| `dsh-skill` 运行时导出清单 | 完全相同 | 无需改动 |
| `dsh-tool-skill` 类型声明 | 完全无差异 | 无需改动 |
| `0.1.7-alpha.2` → `0.1.7-rc.2`：`dsh-skill` 类型、导出、`dsh-tool-skill` 类型 | 逐字相同 | 无需改动 |
| `0.1.7-rc.2` → `0.2.0-rc.1`：`dsh-skill` 与 `dsh-tool-skill` 的整个 `lib/` | **逐字节相同**（不只是类型） | 无需改动 |
| cordis 4.0.4、schemastery 3.18.4 | 与 `0.1.7-rc.2` 相同 | 无需改动 |
| cordis 4.0.2 → 4.0.4 | 新增 `Volatile` / `VolatileSnapshot` 类型导出，属附加性变化 | 无需改动 |
| schemastery 3.18.2 → 3.18.4 | `Schema` 增加第三个类型参数、`NoInfer`、`volatile` meta 等类型层调整 | 现有 Config schema 未改仍可编译 |
| `0.2.0-rc.1` → `0.2.0-rc.2`：`dsh-skill` 与 `dsh-tool-skill` 的整个 `lib/` | **逐字节相同** | 无需改动 |
| `0.2.0-rc.2` → `0.2.1-alpha.1`：四个 skill 包的整个 `lib/`（含类型） | **逐字节相同** | 无需改动 |
| `0.2.1-alpha.1` 新增 `dropRetiredBundles()` 与 `OPTIONAL_BUNDLES` 调整 | 退役/可选 bundle 集合均不含本插件 | 无需改动 |

## Peer 依赖范围（本次真正的修复）

npm semver 对预发布版本有额外限制：预发布版本只有在比较符具有**完全相同的 major.minor.patch** 且带预发布标记时才算满足。实测结果：

| 范围写法 | 0.1.2-rc.1 | 0.1.5-rc.2 | 0.1.7-rc.2 | 0.2.0-rc.1 | 0.2.1-alpha.1 |
|---|---|---|---|---|---|
| `^0.1.2-rc.1`（最初声明） | 满足 | 不满足 | 不满足 | 不满足 | 不满足 |
| `*` / `0.1.x` / `>=0.1.2-rc.1 <0.2.0` | 不满足 | 不满足 | 不满足 | 不满足 | 不满足 |
| `… \|\| ^0.1.7-alpha.2`（0.1.0-beta.1） | 满足 | 满足 | 满足 | **不满足（被门禁拒绝）** | 不满足 |
| `… \|\| ^0.2.0-rc.1`（现声明） | 满足 | 满足 | 满足 | **满足** | **满足**（门禁判定）／不满足（pnpm 默认判定，仅告警） |

现声明为 `^0.1.2-rc.1 \|\| ^0.1.5-rc.2 \|\| ^0.1.7-alpha.2 \|\| ^0.2.0-rc.1`，覆盖的版本线：

- `^0.1.2-rc.1`、`^0.1.5-rc.2`、`^0.1.7-alpha.2` 分别覆盖最初的 rc、npm `latest` 的 rc，以及整个 0.1.7 预发布线（alpha 与 rc）。
- `^0.2.0-rc.1` 覆盖整个 0.2.x 线。在门禁使用的 `includePrerelease: true` 下，`0.2.0`、`0.2.0-rc.2`、`0.2.1-alpha.1` 等全部实测满足；上界到 `0.3.0-alpha.1` 为止，实测为 false。

没有既简洁又能覆盖任意预发布版本的单一范围写法（`*`、`0.1.x`、`>=0.1.2-rc.1 <0.3.0` 在 pnpm 默认判定下都不覆盖预发布版本），因此按发布线显式枚举。

`@deepseek-ai/cordis` 的 `^4.0.2` 与 `@deepseek-ai/schemastery` 的 `^3.18.2` 已分别覆盖 4.0.4 与 3.18.4，且不在门禁检查范围内，无需修改。

## 验证结果

> 表中与 `0.1.0-beta.x` 有关的行记录的是**旧的 25/26 Skills 基线**，当时的事实保持原样。当前基线是**两个通道（`stable` + `beta`）、各 27 个 Skills**。

| 检查 | 结果 |
|---|---|
| TypeScript 编译（0.1.7-alpha.2 与 0.1.7-rc.2 类型声明） | 通过；`lib/` 的 JS 与 `.d.ts` 产物逐字节未变 |
| 插件契约测试（新宿主真实 registry） | 95/95 通过 |
| 旧宿主 0.1.2-rc.1 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 新宿主 0.1.7-alpha.2 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 新宿主 0.1.7-rc.2 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 本机 Web Profile 在 0.1.7-rc.2 上的实时装载 | Beta 26 个 Skill、正文全部加载、0 诊断；实时调用 `tdd` 由本包提供 |
| 三宿主（0.1.2-rc.1 / 0.1.7-alpha.2 / 0.1.7-rc.2）注册表报告 | **逐字节一致**（Stable 与 Beta 均一致） |
| `0.1.7-rc.2` → `0.2.0-rc.1` 类型声明编译 | 通过；`lib/` 的 JS 与 `.d.ts` 产物逐字节未变 |
| `0.1.0-beta.1` 在 0.2.0-rc.1 上安装 | **被门禁拒绝**（记录为门禁行为，不是缺陷） |
| `0.1.0-beta.2` 在 0.2.0-rc.1 上安装并装载插件树 | Stable 25 / Beta 26；`implement-spec` 正文哈希与其它宿主一致 |
| `implement-spec` 调用权限 | `userInvocable: true` / `modelInvocable: false` |
| `implement-spec` 正文与资源目录 | 正文 SHA-256 `765b731e95338695c374b32eca8e78c64407fc8c404f046cb9a9b3bf50e435f3`（双通道基线）；资源为 directory |
| **双通道基线（`stable` + `beta`，各 27 个 Skills）** | |
| `0.2.0-rc.2` 与 `0.2.1-alpha.1` 隔离对拆：安装期门禁真身函数判定 | 两版均 `OK (no incompatibility)`，无需 `allow-version` 豁免 |
| 两版 skill 包 `lib/` 递归对拆 | **逐字节相同**，sha256 一致 |
| provider 运行时冒烟（当时插件为 25 个 Skills） | 25 候选 / 25 加载成功；两版指纹一致 `cd41342e…` |
| 制品在 `0.2.0-rc.2` 上的隔离安装与装载 | `stable` 与 `beta` 各 27 个 Skills、11 个模型可见；checkout 与 tarball 的注册表报告**逐字节一致** |
| 制品在 `0.2.1-alpha.1` 上的隔离安装与装载 | 同上；且四份注册表报告与 `0.2.0-rc.2` **跨宿主逐字节一致** |
| 按通道生成 Profile 选择补丁 | 任一 catalog 声明的通道都能被 Profile 选中，不需要提交 fixture |
| `0.2.1-alpha.4` 隔离安装上的全量根测试（本轮） | **851 项中 648 通过、0 失败、203 skip**；多出的 6 项 skip 来自客户端原生激活 fixture 的宿主安装前置条件 |
| `0.2.1-alpha.2` 全量根测试回归（上一轮） | **851 项中 654 通过、0 失败、197 skip**，与本轮改动前逐项一致；peer 契约 fixture 对两版宿主都成立 |
| `0.2.1-alpha.4` 实机 `dsh web` 启动（修复前，隔离 `DSH_HOME` + 私有 Profile 副本） | 控制面装载在 `createHostAuthority` 抛 `TypeError: Cannot read properties of undefined (reading 'id')`；`mattpocock_startup_settings.json` 启动收据已写入，但九个模型工具缺席。cordis 默认日志级别丢弃 `warn`，终端没有输出——实机 02:09 的启动输出同样只有 URL 与模型列表两行 |
| `0.2.1-alpha.4` 实机 `dsh web` 启动（修复后，同一隔离方法，装载本分支构建产物） | 控制面装载成功：全局工具视图出现全部九个 `mattpocock_*` 工具，无 warn；Skills 分发仍由 `dsh-mattpocock-skills` provider 提供 |
| 全量根测试（修复后）：`0.2.1-alpha.4` | **853 项中 653 通过、0 失败、200 skip**；较修复前的 651 通过多出的 2 项即新增的连接形态用例 |
| 全量根测试（修复后）：`0.2.1-alpha.3` 隔离宿主 | **853 项中 659 通过、0 失败、194 skip** |
| 全量根测试（修复后）：`0.2.1-alpha.1` 隔离宿主 | **853 项中 657 通过、2 失败、194 skip**；两项失败位于 `plugin-manager-compatibility` 的 canonical worker，在未修改的 `main` 上以相同的 worker 断言失败复现（alpha.1 组合差异），与本修复无关 |
| 0.4.29／0.4.30 制品源码核对 | 两版 `lib/host.js` 都只读 `ctx.connection.operator`；alpha.2 上该属性存在（当时控制面运行时在写 `mattpocock_windows.json`），alpha.3 起被移除，所以这不是本修复引入的回归，而是同一处从未适配 |
| 模型调用 | 无 |

装载插件树时，`0.1.2-rc.1` 由 app 的 `--help` 触发生效；`0.1.7-alpha.2` 的 `--help` 会在装载前提前退出，因此改用「无凭据环境下的一次运行」触发装载——宿主会在调用模型之前以 `MISSING_CREDENTIAL` 结束，插件注册仍然完成。

## 未验证事项

- `0.1.3`、`0.1.5`、`0.1.6` 等中间预发布版本未逐一验证。
- `0.1.7-rc.1` 未单独验证：其 `dsh-skill` / `dsh-tool-skill` 与 `0.1.7-rc.2` 同一版本线，本次直接验证了更晚的 `0.1.7-rc.2`。
- `0.2.0-rc.1` 的 Web/GUI 行为未验证；`0.1.7-rc.1` 的 `0.2.0` 线未逐一验证，仅验证了 `0.2.0-rc.1`。
- Web 场景下的 GUI 行为未在新宿主验证。
- 新宿主新增的插件相关能力未纳入适配器：顺序加载多个 patch 文件、声明免重载配置字段、`--dump-config-schema`、Profile 插件配置取代 settings.yaml。
- 历史兼容性核对之外的 SDK 升级与 Profile 安装是独立步骤，不属于本核对范围。本公开文档不记录个人当前运行版本或 Profile 安装状态；兼容性结论不等于已部署。
- `0.2.0-rc.2` 与 `0.2.1-alpha.1` 的 Web/GUI 行为未验证。
- `0.2.1-alpha.1` 未做隔离 `DSH_HOME` 端到端装载：本次只做了门禁真身判定、`lib/` 递归对拆与运行时注册表冒烟，没有像 `0.2.0-rc.1` 那样跑完整插件树装载。
- `0.3.0-alpha.1` 被现有 peer 上界排除，未验证，也不在兼容性声明范围内。`0.2.2-alpha.2` 已核对并通过全量套件；同线其余 `0.2.2-alpha.*` 版本没有逐一验证。
- `0.2.1-alpha.3`／`0.2.1-alpha.4` 的浏览器 GUI 交互仍未验证：本轮已在隔离 `DSH_HOME` 的实机 `dsh web` 启动中验证控制面装载与九个工具注册（修复前在同一方法下复现失败），但没有真实浏览器会话，插槽界面、面板交互与建树观测的界面呈现未验证。
- 修复后的 `0.2.1-alpha.2` 未复测（本机 alpha.2 安装已被 alpha.4 覆盖）：`operator` 分支由 alpha.1 实机用例与 unit／mount fixture 覆盖。
- alpha.4 的 Web 前端把 `@deepseek-ai/dsh-client-ui-slots` 作为 static module 提供这一事实，来自其构建产物中的 `staticModules` 种子；本插件不依赖该模块 id，但也没有在真实浏览器会话中验证插件界面。
- `0.2.2-alpha.2` 的 headless 装载只组合 Skills 分发；可选控制面依赖的 `connection`／`workspaceRegistry` 不在 headless 组合中，因此没有在真实 headless 进程里验证九个模型工具。工具注册、guard、parent token 与 policy 路径由真实 SDK Host 用例覆盖；真实 Web 浏览器交互仍未验证。

## 复现方式

```bash
# 拉取两个版本的宿主包并对比类型声明
npm pack @deepseek-ai/dsh-skill@0.1.2-rc.1
npm pack @deepseek-ai/dsh-skill@0.1.7-alpha.2

# 用新宿主依赖安装并重新编译，确认 lib/ 产物未变
pnpm install
node_modules/.bin/tsc --project tsconfig.json
git status --short lib/

# 契约测试（使用 devDependencies 中的宿主版本）
node --test

# 隔离端到端：对指定宿主版本安装插件并校验注册表。
# 制品绑定到某个提交，因此必须在那个提交的全新克隆中运行（工作树保持干净）。
node scripts/verify-isolated-dsh.mjs --source <clean-checkout> --tarball <tgz> \
  --sha256-file <sha256.txt> --size-file <size.txt> \
  --source-commit-file <source-commit.txt> --pnpm-version-file <pnpm-version.txt> \
  --evidence-dir <new-dir> --expected-dsh-version 0.2.0-rc.1
```

`sha256.txt` 记录的是绝对路径，因此校验和文件会拒绝指向别处的 `--tarball`；把制品放回它记录的路径即可。

`--expected-dsh-version` 是可选参数，默认仍为历史 Phase 4 门禁的 `0.1.2-rc.1`，原有语义不变。

## 不变更声明

本次核对不改动官方 Skill 正文、vendor 内容、来源固定信息与历史评估记录；Phase 5 三次活动 2 通过 / 1 硬失败、总体失败的结论保持不变。宿主升级不改变该结论，也不解除启用与发布门槛。
