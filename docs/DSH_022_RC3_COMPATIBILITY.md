# DSH 0.2.2-rc.3 兼容性检查

> **后续授权：** 所有者已认可本检查并授权隔离实施／测试、push 与新 Release；暂不为本机 DSH 安装。当前实施及验收以 [RC3 适配契约](<DSH_022_RC3_ADAPTATION.md>) 为准，下文保留首次只读检查的证据与限制，不代表后续完成状态。

## 首次检查范围与固定身份

本次按用户要求一次性从 GitHub 获取指定 tag 并检查适配；不执行运行时代码修改、发布、安装、Profile 变更、生产数据操作或服务重启。上游仅用一次 `git clone --depth 1 --single-branch --no-tags --branch dsh-v0.2.2-rc.3` 获取，后续复核离线进行。原始探针和工作副本位于 Git 忽略的 `docs/research/`，不作为公开分发内容。

| 对象 | 固定身份 |
|---|---|
| 目标 DSH | [dsh-v0.2.2-rc.3](<https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3>)，commit `38a6a5c965aa99ab525161efb7cc5cf1fe62fced` |
| 离线对照 DSH | 已有 RC1 源树，commit `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`；未重复下载 |
| 主要插件基线 | [0.21.1 冻结源](<https://github.com/LMGateX/dsh-mattpocock-skills/tree/0cc34713a2f08be5782a5504904f20f12ef19c7c>)，检查工作树文档 HEAD `abc3f13b6c87f16576bd35fd0cc54ead4a2fc84a`；两者 src/lib/manifest/lock 相同 |
| 当前根工作区 | `0.8.0`，HEAD `c7f84fc3dcaa453f74fd333df53108072a293382`，保留原 dirty 状态；不能把它误作最新发行版 |
| 本次工具环境 | Node `24.17.0`；RC3 要求 Node `>=24.9.0` |

本文主要评价插件 0.21.1，不将其结论追溯为 0.8.0 的完整认证，也不把历史 RC1 测试或当前 GUI 当成 RC3 运行验收。

## 已确认：不能直接宣称完整兼容

### 1. direct-catalog 接缝遇到新目录字段会退化

> **后续真实SDK核对更正（2026-11-14）：** RC3原生`SubagentRuntime`实例没有`listChildren`方法；同名函数存在于内部实现但不从包根公开导出。下段“优先调用”描述插件的能力分支，不是stock RC3默认服务实际经过的路径。首次name探针只证明该direct-shaped分支及严格行解析的风险，不能据此声称未适配stock RC3默认已因name降级；它原会fallback到公开`listDescendants`。本批direct发现改从已公开的`sessionQuery.observeSession(parent).projections.values.subagentCatalog`取得同一目录，保持每membership节点后台一次/singleflight预算，并释放observation lease；不导入私有helper，不把整树fallback移到普通读。来源：[根导出](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/index.ts#L71-L110>)、[公开查询的上游调用及using释放](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/list-children.ts#L26-L56>)。

插件 [nativeDirectRows](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/0cc34713a2f08be5782a5504904f20f12ef19c7c/src/host.ts#L123-L141>) 对直接子代理目录行只接受 `id/createdAt/mode/label`。当服务提供 `listChildren` 时，counter 优先选择这一能力分支并使用该解析器；RC3 新增的 `name` 字段会在此分支触发未知键拒绝，变成 `diagnostic: invalid`，继而令 `S.countKnown=false`，reason 为 `native-subagent-diagnostic-invalid`。仍可保留 live Agent 发现的运行数量下界，不能描述成所有子代理计数归零或原生派发被阻断。[读取路径与覆盖标记](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/0cc34713a2f08be5782a5504904f20f12ef19c7c/src/host.ts#L393-L447>)

上游 [目录行类型](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/projection-types.ts#L9-L43>) 明确给 continuable/external 行增加可选 `name`。局部内存探针使用插件原 counter/validation 代码：无 `name` 对照为 `known=true/running=1`；带 `name: agent-1` 的合成 RC3 行变为 `known=false/running=1`，reason 与上述一致。该探针没有启动完整 RC3 SDK。

适配应在插件的宿主目录行解析层接受并验证新字段，保持未知/拒绝语义、实时 `Agent.status` 与权限围栏；不要以改走整树扫描、增加 timeout 或忽略所有错误掩盖问题。

### 2. opt-in delegate 的创建参数不再符合宿主 API

RC3 的 [SubagentActivationSpec](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/types.ts#L28-L46>) 直接继承 `SubagentStartRequest`，`parent/prompt/cwd/maxDepth` 均在顶层；旧 `request` 容器已删除。插件 [createContinuable](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/0cc34713a2f08be5782a5504904f20f12ef19c7c/src/host.ts#L1631-L1670>) 仍传 `request: { parent, prompt, cwd, maxDepth }`。RC3 [startActivation](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/index.ts#L267-L290>) 读取 `spec.parent.id`，旧输入无法提供该字段。宽松 `NativeActivationFacade` 的 `spec: unknown` 不足以证明此调用仍符合宿主类型。

局部探针直接提取 RC3 原 `startActivation` 方法、仅剥离 TypeScript 并提供依赖替身：旧嵌套输入触发 `TypeError: Cannot read properties of undefined (reading id)`、manager dispatch 次数为 0；扁平输入对照 dispatch 为 1。这证明调用格式失配，不证明真实 child 已创建或 cwd/生命周期验收通过。

此项影响显式开启的 `mattpocock_delegate`，不是默认原生 `subagent/subagent_fork/send_message` 工具。适配必须保留 reserved childId、实际 cwd/权限复验、幂等和强绑定确认，不应借机增加第二套派发或伪造 confirmed binding。若继续支持 RC1，不能仅凭函数名称和 workingDirectory 服务存在就判定两版参数格式相同。

### 3. 冷创建者链会漏计深层 running 子代理，并错误声明 known

RC3 可以验证持久创建祖先但不激活这些祖先；结束某个 activation 也不再顺带结束其创建后代。[resolveCreationAncestry](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/manager.ts#L585-L618>) · [finishDisposal](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/subagent/subagent/src/manager.ts#L1038-L1039>)

插件 [live membership](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/0cc34713a2f08be5782a5504904f20f12ef19c7c/src/host.ts#L455-L494>) 仍假定 running 子代理的创建父链可由 live Agent 索引闭合，仅补读 owner 的直接目录。局部原 counter fixture 在 fresh mount 构造合法链 `owner → a(cold) → b(cold) → c(running)`：owner 目录只有历史无 name 的 a 行，完整后代列表虽可提供但不会被调用。首读及目录稳定后均得到 `known=true/running=0`（稳定后 total=1），实际 fixture 有 1 个 running 后代；直接目录读 1 次、完整后代读 0 次。使用历史无 name 行是为排除第 1 项校验错误的干扰。

这是比“明确未知”更严重的覆盖缺口：局部 fixture 已证明原 counter 会对该允许状态漏计，真实 RC3 创建/退出/冷恢复端到端仍待验。适配不能只修新 name 字段；还需重新证明树成员资格、跨冷祖先归属、freshness/撤权与计数完备性，在证据不全时保留下界/unknown，不能未经受权验证把会话创建父链或 runtime root 当作新业务授权。此处不指定实现，也不授权恢复无界整树读取。

## 版本准入与未见迁移要求的接口

实际执行 RC3 原版 `plugin-compatibility.ts`（仅复用本地缓存的 semver 依赖，未启动宿主）：10 项正负例通过，插件 `engines.dsh >=0.2.2-rc.1` 放行 RC3，RC1 下限以前的版本号拒绝。旧根目录 0.8.0 的声明也会放行 RC3；这反而说明版本门禁通过不能代替运行兼容。[目标版本判定实现](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/boot/app-boot/src/plugin-compatibility.ts#L51-L102>)

RC1→RC3 离线逐目录比较确认 `skill/skill/src`、`storage/storage-domain/src`、`typert/protocol/src` 与 `client/connection/src` 相同；未见需要改写 Skills provider、vendor 正文、channel 或 precedence 的依据。工具 guard 新的结构化拒绝仍接受旧字符串返回；post-execute 与 additionalContexts 接缝仍存在。但这些定点复核不是整个 RC3 runtime 的通行证。[工具 guard](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/core/tools/src/index.ts#L388-L402>)

## 客户端定点复核

RC3 原生子代理 tab 仍从 `projectionValues.subagent.label` 取标题，不从新的 parent-catalog `name` 取标题；插件 0.21.1 当前采用同一来源，因此不应为修复 Host 的新字段问题而把 S 显示名改为 `name`。[RC3 原生标题](<https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/client/ui-subagent/src/client/sidebar-chat/index.tsx#L184-L188>) · [插件标题](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/0cc34713a2f08be5782a5504904f20f12ef19c7c/src/client-subagents.ts#L77-L80>)

插件 closed Client 的内存构建为 13 个本地模块、467116 B，实际 externals 仅 `react` 与公共 `ui-primitives`；RC3 baseline 仍提供这些模块。此项是闭包和静态供应检查，不是 RC3 的 TypeScript 声明编译或浏览器挂载。RC3 源树没有单独的 rc.2/rc.3 upgrade-guide，不能把 rc.1 累计迁移列表冒充本次增量变化。

## 验证边界与后续

- 本轮仅检查与局部探针，不改产品代码、不更新开发依赖/lock，不打新发布包。
- 没有安装 RC3 npm 依赖闭包、没有执行完整 RC3 SDK 的 Host/Client 严格类型、原生装配、完整回归、精确归档与 GUI 验收；不能挪用历史 1313/1313 作为 RC3 结果。
- 适配后应先补 direct 目录新字段（stock RC3 从公开 SessionQuery 投影读取）、冷祖先链计数与 delegate 旧/新参数的真实 RED→GREEN，再做目标宿主类型/生命周期/权限、客户端原生插槽、source/lib 与精确包门禁；现有 RC1 固定的测试装配/版本断言不能原封不动用作 RC3 验收。发布、安装、当前 GUI 激活另行授权和核验。
- 本次不以旧研究文档中的发布/安装许可扩大当前用户的“检查适配”请求，不改写既有 dirty 文档或迁移业务记录。
