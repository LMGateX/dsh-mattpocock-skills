# DSH 0.2.2-rc.1 兼容性核对

## 结论与适用边界

**相对最后核验的 DSH `0.2.2-alpha.3`，官方 `0.2.2-rc.1` 源树没有新增本插件需要迁移的运行时 API。** 两个固定 tag 之间仅有 **387 个 `package.json` 的版本号替换**，每个文件一增一删；没有 TypeScript、配置补丁、测试、文档或 lockfile 变更。不能把 rc.1 的累计发行说明误读成 alpha.3 → rc.1 的新增破坏清单。[完整固定提交比较](<https://github.com/deepseek-ai/deepseek-harness/compare/05b1cae8db6e674c5685101494d4eec24652424a...66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db>)

此结论覆盖本仓 `0.16.0` 交付后的插件接口，以及 `0.16.1` 兼容性候选沿用的同一运行时代码；不是对 DSH 全部功能或任意未来 `0.2.x` 的认证。兼容性包无需借此重写 provider、vendor、工具调度或宿主源码。源码/制品/类型/隔离宿主验收须分别成立，最终发布与精确归档门禁由[验证摘要](<VERIFICATION.md>)记录。**本文不声称当前 GUI、任何已有 Profile 或生产记录已经升级。**

先读的本仓约束包括 [AGENTS.md](<../AGENTS.md>)、[DESIGN.md](<DESIGN.md>)、[IMPLEMENTATION_PLAN.md](<IMPLEMENTATION_PLAN.md>)、[宿主兼容历史](<HOST_COMPATIBILITY.md>)、[工作树研究](<WORKTREE_ISOLATION.md>)、[continuable 研究](<CONTINUABLE_WORKSPACES.md>)、[Host 接入](<HOST_INTEGRATION.md>)、[Runtime 协调](<RUNTIME_COORDINATION.md>)、[实际消费](<CONSUMPTION.md>)、[Client 接入](<CLIENT_INTEGRATION.md>)及[有界输出](<BOUNDED_TOOL_OUTPUTS.md>)。业务记录仍是作者报告；执行事实仍来自宿主，不能由兼容研究变成新的业务 gate。

## 1. 可公开复核的固定身份

| 对象 | 固定版本 / Git 提交 | 一手入口 |
|---|---|---|
| 最后核验宿主 | `0.2.2-alpha.3`；tag `dsh-v0.2.2-alpha.3` → `05b1cae8db6e674c5685101494d4eec24652424a` | [Release](<https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.3>) · [固定源码](<https://github.com/deepseek-ai/deepseek-harness/tree/05b1cae8db6e674c5685101494d4eec24652424a>) · [npm 精确版本元数据](<https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-alpha.3>) |
| 目标宿主 | `0.2.2-rc.1`；tag `dsh-v0.2.2-rc.1` → `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db` | [Release](<https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1>) · [固定源码](<https://github.com/deepseek-ai/deepseek-harness/tree/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db>) · [npm 精确版本元数据](<https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-rc.1>) |
| rc.1 的 DSH 版本提交 | `2f97f60455605e915b8176d9170cae337bfedcc6` | [release(dsh) 提交](<https://github.com/deepseek-ai/deepseek-harness/commit/2f97f60455605e915b8176d9170cae337bfedcc6>) |
| rc.1 的 vendor 版本提交 | `60d811de43a819eb4317966845c9fc677c41b50d` | [release(vendor) 提交](<https://github.com/deepseek-ai/deepseek-harness/commit/60d811de43a819eb4317966845c9fc677c41b50d>) |
| 被审插件基线 | `0.16.0`，运行时来自冻结交付源 `78610ef80c3eef377f19d64b17dcbe1123a98652`；后续公开完成文档基线 `af5018d3c6e692236e106c68e1af2d3832027918` | [插件固定源码](<https://github.com/LMGateX/dsh-mattpocock-skills/tree/78610ef80c3eef377f19d64b17dcbe1123a98652>) · [v0.16.0](<https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.16.0>) |

GitHub tag、release 所选提交、npm 包元数据和 tarball 是不同证据层。这里使用完整提交而非移动分支或 npm dist-tag；不把 `target_commitish` 的分支文本当 commit。原来的 alpha.3 结果及其当时插件版本仍保留在[历史核对](<HOST_COMPATIBILITY.md#022-alpha3-核对2026-11-04源码与隔离安装未安装本机>)，不能以新研究追溯替换。

## 2. 实际增量：版本提升，不是第二次 API 迁移

官方两个树的全量比较可用以下只读命令复核：

```sh
git diff --shortstat 05b1cae8db6e674c5685101494d4eec24652424a 66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db
git diff 05b1cae8db6e674c5685101494d4eec24652424a 66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db
```

前者为 `387 files changed, 387 insertions(+), 387 deletions(-)`；后者的全部差异都是 manifest `version`。其中 9 个 vendor 的版本稳定化如下；**这些包源代码与 alpha.3 tag 相同**，但发布版本与安装器的依赖范围判定并不相同。[vendor 版本提交](<https://github.com/deepseek-ai/deepseek-harness/commit/60d811de43a819eb4317966845c9fc677c41b50d>)

| 包 | alpha.3 源树 | rc.1 源树 | 对本仓的意义 |
|---|---|---|---|
| `@deepseek-ai/cordis` | `4.0.6-alpha.2` | `4.1.0` | 本仓 peer `^4.0.2` 已包含 4.1.0 |
| `@deepseek-ai/cosmokit` | `1.8.7-alpha.2` | `1.9.0` | 间接依赖；不借此导入第二份服务身份 |
| `cordis-plugin-group` | `1.0.6-alpha.2` | `1.1.0` | 宿主组合依赖 |
| `cordis-plugin-hmr` | `1.0.21-alpha.2` | `1.1.0` | 不意味着当前服务会自动重载 |
| `cordis-plugin-include` | `1.0.11-alpha.2` | `1.1.0` | 继续走宿主配置组合 |
| `cordis-plugin-loader` | `1.0.7-alpha.2` | `1.1.0` | 本仓旧 `~1.0.6-alpha.1` peer 不含 1.1.0，见第 4 节 |
| `cordis-plugin-logger-console` | `1.0.6-alpha.2` | `1.1.0` | 宿主日志依赖 |
| `@deepseek-ai/schemastery` | `3.18.6-alpha.2` | `3.19.0` | 本仓 peer `^3.18.2` 已包含 3.19.0 |
| `cordis-plugin-timer` | `1.1.8-alpha.2` | `1.2.0` | 本仓 Host 不使用 Cordis Timer 返回值 |

表内省略的 `cordis-plugin-*` 包均属于 `@deepseek-ai/` scope。源码使用 `workspace:*` / `workspace:~`，npm 发布时会改写内部依赖版本，因此不能要求两版完整 manifest 逐字节相同，也不能只凭相同 TS 就宣布全部 npm 制品相同。[CLI manifest](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/apps/cli/package.json#L22-L27>)

## 3. 本插件消费的接缝

以下判断基于固定两树全量差异，并对 rc.1 的相关公开定义定点读取；不是只做关键词命中。对应插件实现仍以[固定入口](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/78610ef80c3eef377f19d64b17dcbe1123a98652/src/index.ts>)和[Host adapter](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/78610ef80c3eef377f19d64b17dcbe1123a98652/src/host.ts>)为准。

| 接缝 | alpha.3 → rc.1 结论 | rc.1 一手定义 |
|---|---|---|
| Skills provider | `registerProvider`、`list` / `get`、`BUNDLED_SKILL_RANK = 600`、调用策略及目录资源形状无变化；无需修改正文或 precedence | [rank](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/skill/skill/src/index.ts#L22-L28>) · [Provider](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/skill/skill/src/index.ts#L246-L274>) · [注册](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/skill/skill/src/index.ts#L379-L422>) |
| 工具与 PTC 消费 | `register`、`guard`、`tools/post-execute` 与 `additionalContexts` 的 waterfall 不变；当前插件不再提供通用 execute 包装，不应按历史描述把已移除工具重新加回 | [注册](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/index.ts#L128-L151>) · [guard](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/index.ts#L378-L398>) · [结果消费](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/tools/src/pipeline.ts#L476-L524>) |
| 每 step 状态注入与执行观察 | `agent/pre-step`、created/status/disposed 公开词汇不变；原生状态而非作者报告继续决定实时计数 | [Agent 事件](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/agent/src/runtime-types.ts#L282-L350>) |
| 子代理与初始 cwd | `startActivation`、保留 childId 的 overload、`request.cwd?`、`delivery`、`listChildren` / `listDescendants` 不变；普通派发仍走原生工具，delegate 仍 opt-in | [activation](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/subagent/src/index.ts#L249-L274>) · [request](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/subagent/src/types.ts#L30-L50>) · [cwd](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/subagent/src/types.ts#L130-L155>) · [目录](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/subagent/subagent/src/index.ts#L401-L430>) |
| Session / 持久化 | 公开观察、消息推导、owned events、`SessionStore.flush` 与 storage-domain 源码不变；通知 acceptance 仍不等 durable receipt，不能跳过 checkpoint | [flush](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/core/session/src/index.ts#L1329-L1359>) · [领域导出](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/storage/storage-domain/src/index.ts#L15-L24>) |
| operator 身份 | `connection.browserPeer` 仍是 owner Peer；不恢复已淘汰的单一路径 `connection.operator` 假设 | [browserPeer](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/connection/src/rpc-host.ts#L72-L97>) |
| 客户端七个贡献位置 | bundle / row 配置、session header utility、input dock、sidebar tab、session row leading、toolview 的 key / scope 无变化；保留 Session 身份围栏和用户触发打开 | [配置](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-plugin-manager/src/client/slot-contract.ts#L136-L150>) · [header / dock](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-conversation/src/client/contract/slots.ts#L245-L296>) · [tab](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-sidebar-right/src/client/contract/slots.ts#L50-L78>) · [row](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-workspace/src/client/contract/slots.ts#L140-L154>) · [toolview](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/client/ui-tool/src/client/contract/slots.ts#L17-L35>) |

### 累计发行说明中的“破坏变化”如何适用

[rc.1 Release](<https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1>)明确说明汇总起点是 **`v0.2.1-rc.5`**，不是 alpha.3。其列出的工具 executor / 按步骤启用、Session projection 异步注册、模型路由固定、官方 bundles 导出迁移、Timer 返回值等事项都已存在于 alpha.3 源树，不能当作本次新发生。对本插件：

- 已有工具 API 适配与 `browserPeer` 读取继续有效；当前插件没有调用 `tools.resolve/executable` 旧签名、修改 `agent/request` 路由、导入 app-boot 的旧官方 bundles 清单或持有 Session projection 注册句柄的代码。
- 本插件的浏览器定时器使用原生 `setTimeout` / `clearTimeout`，不是 Cordis Timer 返回值；无需借版本提升迁移无关代码。
- Release 仍提醒旧独立 worktree bundle 的用户需迁移 Profile 组合。此问题属于既有宿主 Profile 升级，不是 Skills provider 的增量 ABI 破坏；本研究不改任何 Profile，不自动移除旧 bundle，也不把实验性 worktree GUI 当成新的多根 Git 写授权。

## 4. 运行前提与安装器边界

1. **Node 前提取交集。** 目标 DSH CLI 声明 `node >=24.9.0`；插件自有 `node >=22` 不能把宿主最低版本降到 22。既有 alpha.3 同样要求 24.9.0；这不是 alpha.3 → rc.1 新增。[宿主声明](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/apps/cli/package.json#L178-L180>) · [插件声明](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/78610ef80c3eef377f19d64b17dcbe1123a98652/package.json#L127-L130>)
2. **DSH gate 与 npm/pnpm peer 规则不同。** 本仓 `engines.dsh: "~0.2.1-alpha.2"` 在宿主 `includePrerelease: true` 模式下接受 `0.2.2-rc.1`；声明了该字段时，DSH 不再用 DSH peer 列表作 gate。普通 semver/pnpm 对旧 `~0.2.1-alpha.1` DSH peers 则不接受 `0.2.2-rc.1`。[门禁真身](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/packages/boot/app-boot/src/plugin-compatibility.ts#L51-L80>)
3. **Loader peer 是已识别的元数据欠匹配，不是本轮确认的装载故障。** 插件旧可选 peer `@deepseek-ai/cordis-plugin-loader: ~1.0.6-alpha.1` 不包括 `1.1.0`；Cordis 4.1.0 与 Schemastery 3.19.0 则已被各自 `^` peer 包含。普通包管理器可能警告或按不同配置选择其他 peer，不能把宿主 gate 放行等同整个依赖图身份安全。不要为消除警告在 Profile 内补装第二套宿主服务，也不要默认修改 peer / lockfile。只有实际受支持装载路径失败或明确扩大包管理支持范围时再选最小元数据修正，并重跑旧/新宿主与精确包门禁。[插件 peers](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/78610ef80c3eef377f19d64b17dcbe1123a98652/package.json#L151-L169>) · [Loader 1.1.0](<https://github.com/deepseek-ai/deepseek-harness/blob/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db/vendor/loader/package.json#L1-L20>)
4. **依赖导入身份与 Client baseline 不变。** 以真实宿主布局检查 Host，Client 的 slots / primitives 还须使用公开声明或明确的源 fixture。headless 没有 Web 全部服务；没有 `connection` 时可选控制面未挂载，不能用 Skills 成功代替控制面通过。

## 5. npm 产物与验证层次

本研究核对精确 npm 版本元数据，不运行安装脚本，不全局安装、不读取生产日志。父任务另负责隔离依赖安装、真实公开类型编译、source / 精确归档回归及隔离 Host 装载，结果收敛到[验证摘要](<VERIFICATION.md>)。

| 精确 CLI 包 | 文件数 / 解包大小（registry 声明） | tarball / registry SHA-512 SRI |
|---|---|---|
| `@deepseek-ai/dsh@0.2.2-alpha.3` | 20 / 76,850 B | [原始 tarball](<https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.2-alpha.3.tgz>)；`sha512-ffV06fOgiOeIJOmA3EgPj+U6azJrsLACiscLj9t+AfM7p9p14bMzErWRhgeC8nizBTyQ2ckxkPQtj4Pqon8mGw==` |
| `@deepseek-ai/dsh@0.2.2-rc.1` | 20 / 76,416 B | [原始 tarball](<https://registry.npmjs.org/@deepseek-ai/dsh/-/dsh-0.2.2-rc.1.tgz>)；`sha512-ijR9UEVYkG15Q/Q79JzvzLBzQOQfc63VLr9n6flpwHPhr5IKn2UxthnSoto/P9l7qGd7pPvI1Ra6TW7LH3oKpg==` |

两份精确[alpha.3 元数据](<https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-alpha.3>)和[rc.1 元数据](<https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-rc.1>)均声明 `node >=24.9.0`，且均**未提供 `gitHead`**。因此 GitHub 的完整提交身份来自固定 tag，而不是由 npm `gitHead` 证明；registry SRI 能标识/核对所下载 tarball，但本文不宣称已建立供应链签名或独立可复现构建证明。CLI tarball 只是分发入口，文件数不是完整运行时依赖闭包。

**不作“两个 npm 包逐字节相同”的结论。** 版本、发布改写后的内部依赖和构建 chunk 名称可以合法不同；源码比较只证明代码未变，不能单凭相同 TS 宣称重建 JS / DTS 与所有传递依赖都相同。兼容结论需要与父任务的实际公开类型与隔离装载门禁合看。

## 6. 明确不证明的事项

- 不把 Release 的累计描述、npm 版本号或相同源文件当成真实模型 / PTC / GUI 的端到端验收。没有新增付费模型调用、原生调度压力试验或当前页面验证。
- 不保证完整 npm 传递依赖闭包、任意包管理器 / 操作系统 / 自定义 Profile / SSH helper / 桌面二进制都相同；源码版本-only 不排除构建生成物差异。
- 不改变 multi-root Git write scope、冷恢复入口关闭、S 观察不是硬准入等既有能力边界；未知不能写成 0、当前或已完成。
- 不迁移插件 V1/V2/V3 生产记录，不处置待裁决事项，不自动 enable 管理；插件自己的存储迁移仍受[迁移说明](<../MIGRATION.md>)约束。
- 不改 live SDK、既有 Profile、共享安装、服务或 vendored Skills；不通过升级研究获得安装、push、publish、重启或运行时补丁授权。
- 公共文档仅保留可复核身份、来源、结论与限制；临时下载路径、带日期原始工具输出、个人安装快照与原始日志不作为公共证据发布。
