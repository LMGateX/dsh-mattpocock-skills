# DSH 首次 continuable cwd：源码补丁与真实无模型验证

状态：**离线可应用的 source-only 补丁交付。** 源码交付不等于部署，不自动修改运行 SDK、Profile 或 GUI；vendor/Skills/provider/channel/precedence 保持不变。当前仓库收尾状态见[公开验证说明](<../docs/VERIFICATION.md>)，历史原始日志仅在本地保留，不公开为当前验收证明。

## 文件与不可变来源

- [正式 TS diff](<initial-cwd.source.patch>)：仅三个官方 TS 源文件；[manager 源实现](<source/packages/subagent/subagent/src/continuation.ts>)、[public service 源实现](<source/packages/subagent/subagent/src/index.ts>)、[spec 类型](<source/packages/subagent/subagent/src/types.ts>)。这是带最小修复的官方源文件摘录，不是完整 monorepo。
- [精准 compiled SDK diff](<initial-cwd.compiled.patch>)：npm 运行 bundle、split JS 与两个公开 declarations，不是生产插件私读 SDK 内部路径。
- [SHA-256 manifest](<manifest.json>)：每文件原始 hash、补后 hash 和唯一 literal contexts；[离线应用脚本](<apply-initial-cwd.ts>)在写任何文件前验证全部 baseline/context/postimage，拒绝 hash 漂移、未标记目标、越出独立目标的 symlink。支持只检查，不做 live 安装。
- [diff 再生成脚本](<generate-patches.ts>)、[源码严格类型验证](<verify-source.ts>)、[严格配置](<tsconfig.json>)。
- [真实 native 测试](<../tests/host-cwd.test.mjs>)与[历史 native 验证摘要与证据边界](<../docs/VERIFICATION.md#historical-evidence>)：历史 compiled／官方 TS 隔离运行各 10/10；baseline red 和类型检查原始日志仅本地保留，摘要不是公开原始回执，也不代表当前最终验收。
- 摘录保留[官方 MIT 许可证](<source/LICENSE>)。

官方不可变来源：仓库 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，release tag [dsh-v0.2.1-alpha.1](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1)，精准 commit **5badb15009ae1756c3afe0ae0cef1faafc290ccc**，安装版 npm **0.2.1-alpha.1**。通过 bounded git ls-remote 定位 tag；仅下载[continuation.ts](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/subagent/subagent/src/continuation.ts)、[index.ts](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/subagent/subagent/src/index.ts)、[types.ts](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/subagent/subagent/src/types.ts)和 LICENSE，没有盲 clone。先 Context7 resolve/query，再以精确 tag 源码及只读安装产物校验。[Context7 指向的 subsystem 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)是 master 文档，不代替精准版事实。

## 最小 public interface 与不变量

~~~ts
interface ContinuableStartSpec {
  // 原 provider、label、childId、request、signal 保持原定义。
  readonly cwd?: string
}
// 新 public read-only getter；native manager 未挂载时 false。
ctx.subagents.initialCwdSupported: boolean
~~~

1. 只在**首次** native manager start 中消费 cwd。first await 前读取 caller cwd 字符串、同步 assertUsableCwd；省略捕获父 header.cwd，保持原继承且不回退 process.cwd。
2. 原 delegation policy capture 顺序不变。provider prepare 与 caller-reserved childId 去重 await 完成后，在 materialize 前重检已捕获的明确 cwd；只覆盖 create.meta.cwd。
3. 原 native manager 继续拥有 childId、AgentHandle、inbox、生命周期、rollback、seed、descriptor 与 parent lineage。不新增第二 manager、prompt cwd、dynamic cwd、T/Sgate 或资源业务审批。
4. sendMessage/cold resume 不接受/消费 cwd 覆盖，不重跑 provider prepare，不重捕获父 permission。原冻结、持久化 header 是唯一 cwd 事实。测试也验证 B 被删除后 cold resume 仍保留原 header，不新增闭合/清洁门禁；之后具体工具可能因目录不存在失败。
5. public service getter只说明这个 native manager 实现支持初始 cwd且当前 manager存在，不授予 cwd 写权限。旧 SDK 无字段时调用者必须明确 unsupported；不能多传 JS 字段就宣称绑定成功。
6. assertUsableCwd 是已有绝对路径、存在目录、可进入检查；不是 Git common-dir grant、realpath/inode 强隔离或 symlink TOCTOU 防御。cwd 改变 workspace-write root，模型面 adapter 必须沿用既有 host 路径权限，不能以存在目录默示扩权。

## pluginHost 最小安全映射（主集成人负责）

精准版服务名是 **SubagentRuntime / ctx.subagents**。start(providerName, request)返回 one-shot SubagentRun；这次必须用 **startContinuable(spec)**，不能以 one-shot 重建代替同 child 历史续用。下面是程序映射示例，不是另一个 manager，也不是绕过 native 工具权限的 handler：

~~~ts
const parent = exec.agent
if (parent === undefined || ctx.agents.get(parent.id) !== parent) {
  throw new Error('exact live parent required')
}
if (request.cwd !== undefined && service.initialCwdSupported !== true) {
  throw new Error('initial continuable cwd unsupported')
}
// providerName来自可信host已配置的spawn/fork provider映射，非LLM route id。
const provider = service.getProvider(providerName)
if (provider?.prepareContinuable === undefined || !provider.capabilities.depthLimit) {
  throw new Error('native continuable/depth capability unavailable')
}
const maxDepth = service.resolveMaxDepth() // 可信配置值，不是模型参数或T/Sgate。
const started = await service.startContinuable({
  provider: providerName,
  label: request.description,
  childId: SessionId(request.plannedChildSessionId), // 字段名childId，不是sessionId。
  ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
  request: {
    parent,
    prompt: [{ type: 'text', text: request.prompt }],
    ...(maxDepth === undefined ? {} : { maxDepth }),
  },
  signal: exec.signal,
})
// 请求路径不是执行事实：必须从实际child header回读。
const child = ctx.agents.get(started.childId)
const actualCwd = child?.session.header.cwd
// child已自然退出时，沿现有授权query/persistence seam读其真实持久header。
~~~

关键集成限制：

- 新 defineTool 仍须经过 native ToolRuntime schema/权限 pipeline；program port接 exact exec.agent 与 exec.signal，并在写 intent/prepare前做 live identity check。原 manager 的最终 authorizeLineage拒绝fake parent并rollback，但最初 assertAdmitting只检查draining，不是入口 identity授权。
- native manager仍执行 assertSubagentMaxDepth/resolveChildDepth与delegation policy capture。maxDepth用 host resolved配置值；显式 native tool配置若存在，应从可信 seam携带，不能丢失既有更小深度限制。
- **不开放任意模型 agentOptions/provider/model/reasoning_effort覆盖。** 精准版的模型路由权限/允许列表、configured child defaults、persona/toolFilter与preflight由 native delegation tool持有，相关helpers不是 public exports。直接调用 program interface不自动获得该工具的全部route checks。最小port省略route overrides，由native resolveChildAgentOptions从父当前 request header继承；如要完全消费已有tool配置，集成人需要可信配置 seam，不能私读handler或猜允许选择。原生模型选择继续走既有工具。
- plannedChildSessionId与spec.childId同值；start返回childId/messageId，绑定事实来自真实metadata，author-report另存。metadata回读失败不能用request.cwd补成成功事实；开始已接受但事实未核对须如实记录。
- public capability getter可安全映射到插件createInstance port；无字段/false就是unsupported，不访问SDK私有manager字段，不加载live内部路径。

## 精确验证命令

以仓库根运行，DSH_CONTROLS_HOST_ROOT只是**只读参考SDK**，不作为应用目标。Node 24.17.0；patch utility可直接执行可擦除TypeScript。

~~~sh
DSH_CONTROLS_HOST_ROOT=/absolute/read-only/dsh node --test tests/host-cwd.test.mjs
DSH_CWD_IMPLEMENTATION=source DSH_CONTROLS_HOST_ROOT=/absolute/read-only/dsh node --test tests/host-cwd.test.mjs
node node_modules/typescript/bin/tsc -p host-patches/tsconfig.json
DSH_CONTROLS_HOST_ROOT=/absolute/read-only/dsh node host-patches/verify-source.ts
~~~

历史隔离验证结果：**compiled 10/10、官方TS 10/10，fail/cancelled/skipped全部0**；两个可审阅diff另在独立pristine副本通过git apply --check及实际apply，补后所有文件hash等于manifest postimage；三个patched官方TS与全部patch utilities通过 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess。缺少SDK环境变量时native测试明确skip，不算集成pass。

默认测试只复制subagent包到mkdtemp，其他匹配SDK依赖为只读symlink；patcher拒绝目标路径越出temp。source模式从交付TS按逆recipe重建精确baseline，验证原hash、应用正式TSpatch，校验补后内容等于交付source，再transpile到temp split artifacts。source类型检查单独进行，transpile不冒称typecheck。

真实实例：Context、AgentRegistry、AgentLoop实际ReactLoopAgent、SessionStore、JSONL persistence、SqliteSessionQueryEngine（openAt never）、LocalFileSystem、ToolRuntime与native read、原spawn/fork providers。native agent/pre-step waterfall受控暂停/拒绝以免进入模型；llm.prepareCall/stream以计数+抛错保护，每fixture最终计数必须0。provider prepare在竞态测试是明确controlled data seam，Agent/factory/session/persistence不是fake。

回执覆盖：实际冻结header与持久header；并发A/B真实children相对read各读自身marker；await前cwd快照；省略继承；invalid目录beforeprepare拒绝；prepare后目录消失拒绝且无native residue；真实fresh/fork历史；原manager自然settle后新JSONLbackend读取disk，再unregister provider、删除B、cold sendMessage恢复同childId/header/B cwd且无第二prepare；capability有/无manager；hash漂移全文件preflight与越界symlink拒绝。

TDD逐片记录：

| 片 | 已观察red | 最小green |
|---|---|---|
| 实际首次cwd | 原SDK真实child header是A，期待B | optional spec + native manager初始meta覆盖 |
| capability | undefined，期待true | public getter，无manager则false |
| prepare竞态 | B被删仍创建，Missing expected rejection | materialize前重checkinitialcwd |
| 相对read | 原SDK读出A native tool，期待B native tool | 同一初始cwd修复使真实工具路由正确 |
| cold/快照/invalid/原providers | 原SDKcopy分别暴露A!=B或缺少reject | 复用原生命周期，无额外manager |

最初fixture语法、fs-local必需默认与read snake_case拼写失败先修fixture，**不冒称feature red**。后续hash/target tests是patch交付安全回归。可重放主要red（预期exit 1）：

~~~sh
DSH_CWD_BASELINE=1 DSH_CONTROLS_HOST_ROOT=/absolute/read-only/dsh \
  node --test --test-name-pattern='first continuable cwd becomes' tests/host-cwd.test.mjs
~~~

## 只向独立副本应用

当前权限只允许源码实施与隔离验证；脚本不做Profile安装/启用、GUI重启、发布或live替换。目标须为显式准备的独立source checkout或SDKcopy；用marker避免误投并先check：

~~~sh
# 先确认目标绝对路径是独立副本，不是参考live SDK。
printf 'isolated-cwd-patch-target\n' > /absolute/independent-source/.dsh-cwd-patch-target
node host-patches/apply-initial-cwd.ts source /absolute/independent-source --check
node host-patches/apply-initial-cwd.ts source /absolute/independent-source
# 独立SDKcopy已有node_modules/@deepseek-ai/dsh-subagent，另标记SDKcopy后：
node host-patches/apply-initial-cwd.ts compiled /absolute/independent-sdk --check
node host-patches/apply-initial-cwd.ts compiled /absolute/independent-sdk
~~~

script不幂等重应用：补后再次应用拒绝原hash不匹配，不能累加patch。写入顺序不是跨进程transaction；目标必须独立且无人并发修改。正式host source集成应使用TSpatch并按宿主既有流程重新生成产物；compiled diff是精准安装版隔离证明/审阅交付，不建议替代正常upstream build。

验证隔离副本后，应确认参考 SDK 的五个目标文件仍与 manifest 原 hash 一致。未准备且未原生支持初始 cwd 的 SDK 必须报告 **unsupported**；补丁验证通过不等于已部署、模型行为验收或多根 Git 沙箱授权。
