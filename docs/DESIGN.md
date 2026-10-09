# DSH Matt Pocock Skills — Accepted Design

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

- **Status:** Accepted; core adapter and historical Phase 4 verified; historical Phase 5 remains failed. The owner now authorizes the 0.4.2 push, GitHub Release and local plugin installation after release gates; npm publication, automatic feature enablement and interruption of the current service are not included.
- **Accepted on:** 2026-09-08
- **Owner:** LMGateX
- **Local checkout:** `<working copy of this repository>`
- **Public plugin repository:** `https://github.com/LMGateX/dsh-mattpocock-skills`
- **Private source distribution:** `https://github.com/LMGateX/mattpocock-skills-distribution`

This document is the authoritative implementation contract. A later implementation choice may refine mechanics, but it must not contradict a locked decision below. Changing a locked decision requires explicit owner approval and an update to this document in the same commit.

## 最新认可的协作扩展范围（2026-10-06）

本节是已接受的源码实施设计。参考窗口、创建绑定、当前投影、分页历史、源旧历史清理与 Host/Client 接口已有仓库实现；当前复审修复已通过机械源码／构建／测试验收，clean-source 制品门禁与交付身份另行随制品记录，见[公开验证状态](<VERIFICATION.md>)。历史阶段的本地验证记录不代表当前最终验收。本节优先于旧协作扩展中的硬容量与重资源处置规格；旧验收记录不充当本轮完成结果。

- **T/S 是参考上限**：展示占用、参考值和超出情况，引导 agent 安排工作；超限或统计未知本身不拒绝派发，不另要求批准。执行事实仍如实记录，不以模型自报冒充程序事实。
- **工作树核心是创建绑定工具**：主 agent 自行准备工作树，在创建可续聊子代理时传入 worktree；工具使其成为实际工作目录，随后同 child 身份/历史/目录继续。
- **仪器只记录真实绑定关系与状态**：帮助 agent 看见哪些树与哪些子代理/任务有关。分支/树的创建、合并、删除，以及是否该清理由 agent 按 Skills 和用户约定决定；不再增加资源处置审批系统。
- **已落地的创建接口**：首次 continuable 创建可选 cwd 的原生源码/编译补丁已独立交付，省略保持继承；原 manager 负责生命周期，插件执行可信路径预检查、持久意图、原生调用及实际 header 核对。明确 cwd 在原生副作用边界再次核验现有权限，不新增业务批准；未补丁安装版按公开能力 getter 明确 unsupported。见[宿主补丁交付](<../host-patches/README.md>)与[工作树绑定契约](<WORKTREE_BINDINGS.md>)。
- **持久化、当前注入与历史查询分开**：研究和设计覆盖全部仪器，不只工作树；保存历史不等于持续注入全部历史，退出注入不等于删除数据。主会话通过主动历史接口查询本 session 权限范围内的保留记录；摘要分页与按需详情明示来源覆盖，不冒称已返回全部正文。
- **工作树退出条件**：只有已被清理的树退出持续注入；废弃但未清理的树仍提示待处置。本 session 已清理树的历史仍可主动查，不能因树清理而默认删除记录。模型登记清理与程序物理回执分别标来源，不新增原生续用闭合审批。
- **记录整理已实施，期限仍由用户决定**：主动摘要分页/详情、显式当前范围、历史副本 purge，以及 records/windows/worktrees 三个源域的 checkpoint 和定向源旧历史删除均已有源码接口。副本删除不冒称源删除，源清理保留当前/最新状态、创建作者与技术去重摘要；多域非原子、部分成功和未知修订如实报告。任意字段级删除、全部作用域擦除与自动 TTL 不在本轮接口内；已清理树不默认删除历史。见[历史核心契约](<HISTORY_CORE.md>)。
- **源码与部署分开**：本轮范围是已接受的源码实施，不只是研究建议；仓库原生补丁与插件代码交付不自动改变安装版 SDK、当前 Profile 或现有 GUI。最终集成结果由完成记录统一登记，不提前宣称全套测试/打包通过。安装启用及发布另行决定，原有不可变 Skill、通道和发布授权边界保持不变。

## 工作目录兼容桥产品形态（0.4.3）

本次认可范围包含代码修改、push／GitHub 新版本发布与同字节本机安装，不覆盖旧标签／资产，不授权 npm 发布、共享 SDK 改动或自动服务重启。

- 用户功能入口只有「允许本插件创建子代理时指定工作树」；它决定本插件是否允许显式首次 cwd 派发，不能冒称 DSH 全部底层 API 的总开关。启动时采样和实际能力核对保持不变。
- 随包兼容提供者是实现依赖，用户名称／描述必须明确「子代理工作目录兼容桥（本插件提供）」和非 DSH 官方组件来源；内部模块／行标识可保持 ABI，不把技术词 native 当产品名称。
- 提供者生命周期仍由已验证公共 root 持有。功能关闭不卸载已有 manager，不换掉活跃子图，组件有效 disabled 不直接等于没有实际能力；当前 getter 仍是事实权威。
- 后置组件 disabled:true 覆盖与功能请求冲突时，诊断明确为组件配置禁用，给出撤销关闭覆盖／恢复自动选择的修复方向，而非泛称版本不匹配或建议反复重启。恢复不得写强制 disabled:false，也不覆盖分组／隔离／别名／未知 Profile 选择。
- 非默认 Profile 与真实 SDK 生命周期回归须验证禁用冲突、恢复自动 guard、实际能力与功能请求的区别；公开资料不含本机快照。

## 宿主原生初始 cwd seam（2026-10-09，已获所有者认可）

- 已核对 DSH `0.2.1-alpha.2` 的公开 `@deepseek-ai/dsh-subagent`：`startContinuable` 已删除，改为 `startActivation(spec)`，`SubagentStartRequest.cwd?` 由提供者自行解析并经会话工作目录 owner 记录；省略仍继承父目录。
- 实际加载的服务同时暴露 `startActivation` 与会话工作目录 owner（`workingDirectory.ensure`）时，本插件使用宿主原生 seam 传递显式首次 cwd；否则仍使用随包版本固定兼容提供者。能力判定只来自实际加载的公开服务对象，不来自版本字符串、模型输入或用户声明。
- 随包兼容提供者、recipe 与 `host-patches/` 继续交付，服务没有原生 seam 的宿主；本决策不改变 0.4.3 的用户入口、启动时采样、实际 header 核对，也不增加第二个 cwd 来源。
- 授权、持久意图、原生副作用边界复验与确认序列不变：宿主原生不豁免预检查，省略 cwd 仍不写任何目录值。

## 既有 Profile 原生依赖接入修复

用户认可继续修复原生依赖冲突及强制开启覆盖诊断。修复仍由同一插件包承担，不修改共享 SDK、Profile 的其他插件依赖或全局模块解析，也不自动重启服务。

- 兼容实现依赖必须绑定到已验证的 canonical native importer 实际 ESM 依赖图；旧 Profile 局部依赖保持原样。使用已存在 Loader 的公开 `internal`／`ModuleLoader.resolveSync` 接口获得确切 URL，不直接反射 Node 或 continuation 私有对象、不改 loader cache 或注册解析 hook。
- 对固定原版资产生成完整有限 import literal 清单；运行时在资产与 provenance 摘要验证后，仅把清单中的非 builtin specifier 换为 canonical URL，并以确定性 data URL 按正常 ESM 加载。保留 live bindings、MIT、全部 manager／activation 实现字节；不将本机 URL 写入公开资产。原版完整资产不重写或建立第二套 runtime。
- 同步导入前 guard、只读 readiness 和真实加载必须证明同一实际绑定计划。wrapper 自身直接 Context／Loader／native constructor／utility imports 仍要求 exact canonical identity；未知 resolver、模块格式、路径、包身份或导入清单拒绝增强。不存在安全绑定证明时保留 stock，不仅删除旧 identity 检查。
- `disabled:false` 仍是取代自动 guard 的强制开启覆盖，不因为载体运行就推定兼容；给出独立 forced-enabled 原因及撤销覆盖的恢复方向。`disabled:true` 原关闭原因保持不变。当前真实 capability 优先，不静默迁移 Profile 或虚构 SDK reset。
- 回归使用真实 SDK／Loader／PluginPackages／Plugin Manager 与准确包的旧 Profile shadow 场景，验证实际 A/B 首次 cwd、冻结 header、续聊与冷恢复、原生类型身份、ACTIVE／PENDING 热重载保留及 root shutdown。新旧依赖旁路不影响其他 importer；源测试、制品与当前 GUI 激活分开报告。

## 单包兼容支持的交付要求

相关 SDK 兼容支持由同一个插件包承担，不能让用户另行选择、安装或维护补丁、寻找 SDK 路径或执行手工准备命令。只把 recipe／管理器随包提供不算完成自动接入；目标是普通安装／升级、页面保存请求和必要的正常进程重启。当前实现进度与候选边界见[插件自管兼容支持](<PLUGIN_MANAGED_COMPATIBILITY.md>)；候选和源码进度不是发行包或当前 GUI 已生效的声明。

本次源码实施选择版本固定的插件内部兼容服务提供者作为验证方向，不修改共享 SDK 文件、不建立另一套 Cordis／AgentLoop／Session／沙箱运行时，也不反射或接管已有 native continuation 私有字段。通过公开配置组合保证一个服务提供者及同一原生生命周期图；保留原始配置和明确停用／自定义 Profile 的选择。安装、配置热重载与真正启动必须分开，不能借 bundle 重组突然替换当前服务。若这些边界不能证明，则不把候选覆盖加入发行包。

0.4.2 发布线以公开 Cordis `Context.root`（experimental）、`ctx.plugin()`、`Fiber.dispose()` 和声明的 `internal/plugin` 创建事件验证进程级提供者生命周期：可移除的 bundle 载体不拥有 native manager 的 disposer；同一已验证 Loader tree／共享 isolation 与 intercept 服务域中的唯一提供者由根 Fiber 持有。bundle 移除仍按 SDK 正常机制处理；仅在该进程已有固定提供者时，阻止同一 canonical stock 行的新 Fiber 在原生构造前成为第二个提供者，不拦截其他 tree、分组／隔离／intercept 行、自定义提供者或任意模块解析。鲜启还要求实际应用根身份一致、公开映射可用且 inherited key union 有界（每组 ≤512）；未知输入在导入前保留 stock。对已经固定的服务，保留判定使用同一捕获应用根和准确公开 underlying service token，不把新的鲜启预算反向当成换掉当前 manager 的许可。真实根 shutdown 仍负责原生清理。生命周期替身验证不能代替真实 Plugin Manager、原生消息／持久化／权限与清理回归；候选修复的当前验收范围须独立记录，不能把 carrier 行 UID 与实际服务提供者 Fiber UID 混同。

旧离线管理器保留为诊断／维护接口，不再作为普通用户必经步骤。相同 owner、schema、SDK、recipe 和已核验文件／备份的记录须跨插件版本接续，creator 版本是来源记录而不是要求用户手工解除的升级锁；外部改动、不完整记录、未知版本或所有权不匹配仍保留证据并拒绝写入。不可变 Skill、通道、原有 provider 优先级、公开隐私边界与真实权限保持不变。

## Scope clarification

The owner-approved [thin-adapter scope](ADAPTER_SCOPE.md) governs subsequent engineering scope: keep native Skill delivery small, freeze expansion of the historical behavioral analyzer, and investigate demonstrated compatibility gaps. Historical campaign results and activation/publication authorization boundaries remain unchanged.

## 1. Purpose

Build a small, reproducible DeepSeek Harness Profile Bundle that exposes the selected Matt Pocock Skills channel through DSH's native Skill Registry. The adapter owns DSH packaging, channel selection, invocation metadata mapping, provenance, verification, and evaluation. It does not own or rewrite the upstream Skill instructions.

The plugin source repository is public. The package retains `private: true` to prevent npm publication; public source visibility is not authorization for installation, activation, deployment or a release. Local research, raw logs, conversation/approval records and installation snapshots must remain private and excluded from public commits. The source distribution privacy policy is unchanged.

## 2. Locked Decisions

1. **Package identity:** use `@lmgatex/dsh-mattpocock-skills`. The npm scope is provisional until a matching npmjs account or organization is controlled; GitHub and local installs do not depend on npmjs ownership.
2. **Repository visibility:** the plugin repository is public by accepted policy. Do not commit private research, raw transcripts/logs, local installation metadata or user-specific conversation records to it. The source distribution remains private under its existing policy; this amendment changes neither its visibility nor immutable source provenance. `package.private: true` prevents npm publication, not public GitHub visibility.
3. **One package, manifest-driven channels:** ship one package whose channel set is exactly the channel manifests the pinned distribution declares. Runtime code must not hard-code channel names, channel counts, or the relationship between channels. *(Amended on the `v0.2.1` baseline: the distribution always publishes `stable` and `beta`, where `beta` is `stable` plus whatever upstream paths it previews. While nothing is previewed the two resolve to the same set, so a profile that selected either keeps working. The distribution owns that policy and its verifier rejects a reduced channel set.)*
4. **Default channel:** `stable`, which the distribution always declares.
5. **Web profiles:** any declared channel may be selected, and no selection is required, because `implement-spec` is in the promoted set. *(Amended on the `v0.2.1` baseline. The earlier instruction to configure `beta` in order to get `implement-spec` is obsolete; `beta` remains supported for compatibility.)*
6. **Vendored union:** vendor the union of every declared channel once; each channel is a manifest-driven selection from that union.
7. **Unchanged Skill sources:** preserve selected upstream-owned files byte-for-byte. Do not apply DSH wording substitutions or delete source resources.
8. **Provider shape:** use a custom immutable provider backed by a generated static catalog, not a runtime recursive scanner and not `ctx.skills.register()`.
9. **Precedence:** every packaged candidate uses `source: 'bundled'` and DSH's `BUNDLED_SKILL_RANK` (currently 600), so project and user Skills override the package.
10. **Core Host-only; optional workspace-controls exception:** the immutable Skill provider remains one Host Cordis plugin row, consumed by existing DSH Web Skill UI and slash invocation. *(Accepted scope amendment, 2026-10-05: the separately enabled workspace controls described in [WORKSPACE_WORKFLOW_CONTROLS.md](WORKSPACE_WORKFLOW_CONTROLS.md) must provide plugin-page configuration and session-bound instruments for worktree lifecycle, dual windows, ticket progress and pending decisions. A client settings/configuration module may be needed for that optional extension; this exception does not add a client to the current artifact or change core Skill delivery. The accepted design subsequently included workspace-first policy editing with sparse overrides and explicit saves; concrete client seats, schema and enforcement mechanics remain design proposals.)*
11. **Offline runtime:** no install-time fetch, postinstall updater, runtime network access, mutable source cache, or file watcher.
12. **No legacy manifest initially:** do not ship `dsh.plugin.json`. The authoritative activation mechanism is `package.json#dsh.bundle.patch` plus `cordis.patch.yml`.
13. **Real behavioral evaluation:** the first usable release must run the `implement-spec` evaluation. The campaign definition, harness and raw records are evaluation material kept outside this repository.
14. **Immutable release:** a release version, Git tag, npm artifact if any, and GitHub artifact must identify the same commit and the same once-built tarball bytes.

## 3. Source Baseline

The initial source baseline is:

| Item | Value |
|---|---|
| Distribution repository | `LMGateX/mattpocock-skills-distribution` |
| Distribution tag | `v0.3.0` |
| Annotated tag object | `08a0539bc2aea0087284201969897b82c94cc059` |
| Distribution commit | `b8fe790371e1755aae98dedec512720f1aad2dba` |
| Matt Pocock upstream | `mattpocock/skills` |
| Upstream release | `v1.3.1` |
| Upstream commit | `24fe0ef7737efae15c87225755e9f6f5965e4888` |
| Source verifier SHA-256 | `f62039d108fdbfd0bf56165dd8e35a407cf6c11ab1be361351ea37e8bc401bf7` |
| Declared channels | `stable` and `beta`, both always published |
| Stable selection | 27 promoted Skills |
| Beta selection | `stable` plus the distribution's `previewSkills`, which is empty and so resolves to the same 27 Skills |

The annotated tag is unsigned. Reproducibility therefore relies on the pinned repository, immutable full object IDs, source verification, and the downstream per-file inventory. Signing a later tag is desirable but not required.

The pin is the commit upstream's `v1.3.1` tag points at, so the channel manifests describe a published release rather than a moving `main`. The distribution records that release in `upstreamRelease` and refuses to verify while it names a tag that does not point at the pin; `null` is reserved for deliberately pinning ahead of every release. Upstream publishes through changesets, so a release commit carries the version bump, the regenerated `CHANGELOG.md`, and the removal of the consumed `.changeset/` entries.

## 4. Channel Semantics

The source distribution manifests are authoritative. The plugin must not hard-code channel names or directory buckets: ingestion discovers whatever `.distribution/channels/*.json` the pinned distribution ships, and the runtime catalog records that set.

The distribution owns channel policy and publishes a closed set that only ever grows. Its own verifier rejects a reduced set, so a name a consumer already selected cannot disappear. The plugin must not assume two channels, or any particular relationship between them.

- Each declared channel loads exactly the paths its manifest selects.
- Ingestion vends the union of every declared channel in one pass. A Skill's `channels` membership is derived from the manifests, never from the directory it happens to live in.
- Unknown channel names, unknown manifest schema versions, and a manifest that declares `additionalSkills` without `extends` all fail closed.
- When a channel declares `extends`, ingestion asserts that it contains every Skill of the base channel and that `additionalSkills` equals the difference.
- Each selected Skill path means the complete Skill directory, including references, scripts, assets, and adapter metadata supplied by the source distribution.

`implement-spec` has `disable-model-invocation: true`, so it adds the user command `/implement-spec` without adding a model-visible catalog entry. Upstream v1.3 promoted it into the promoted set, so it is now selected by both channels.

## 5. DSH Integration

### 5.1 Package and Bundle

The package manifest declares an installable Profile Bundle:

```json
{
  "name": "@lmgatex/dsh-mattpocock-skills",
  "private": true,
  "type": "module",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The bundle patch inserts exactly one globally mounted Host row. Its final identifier must be unique and stable. The row loads the package and sets `channel: stable`. A profile-owned later patch may set any declared channel name.

Installation is through DSH's profile package manager, for example a local checkout, Git commit, or prebuilt tarball. Activation occurs on the next Profile boot.

### 5.2 Plugin Contract

The entry exports the conventional Cordis surface:

- `name`
- `inject = ['skills']`
- a Schemastery `Config` whose closed value set is the catalog's channel names, defaulting to `stable` when declared and otherwise to the first channel
- `apply(ctx, config)`

`apply` synchronously registers one `SkillProvider` with `ctx.skills.registerProvider`. The package does not provide a competing Skill Registry service and does not parse user messages itself.

The initial peer seams are `@deepseek-ai/cordis`, `@deepseek-ai/dsh-skill`, and `@deepseek-ai/schemastery`. Development pins the exact tested versions. The publishable peer range is finalized only after compatibility tests against the installed DSH release and the selected newer prerelease.

### 5.3 Provider Contract

The provider is immutable for one plugin mount:

- The generated JSON catalog is loaded, closed-schema validated, and deeply frozen once when the Host module loads.
- `list()` reads no Skill files and performs no directory scan. It returns the immutable configured-channel selection from that catalog.
- `get()` accepts only the exact candidate object created by this provider. It anchors the non-symlink vendored root to `realpath(packageRoot)` while permitting the package root itself to be package-manager symlinked, resolves the cataloged directory and file back to their exact real paths beneath that anchor, rejects root/intermediate/final symlink or identity drift, opens `SKILL.md` with no-follow semantics as a regular file, then repeats containment and bigint device/inode checks before reading.
- Each definition preserves the candidate's name, description, invocation policy, provider, source, metadata, path, and package-directory `resourceBase`; the body starts at the generation-validated frontmatter byte boundary.
- The provider observes `AbortSignal`, passes it into the active file-read operation, and propagates the exact lookup or lifecycle abort reason.
- Node does not expose an `openat2`-style beneath/no-symlink resolver. Concurrent hostile mutation can therefore retain a residual parent-directory race after the repeated checks; installed package artifacts are treated as immutable during a provider read, and unsupported no-follow hosts fail closed.
- Missing files, malformed content, hash drift, or candidate/catalog mismatch return no definition and emit a warning through the plugin's named Cordis logger; they never silently substitute another Skill. Abort reasons propagate instead of being diagnosed as corruption.
- No watcher or invalidation loop is required. Changing plugin config remounts the plugin through the normal Cordis lifecycle.

Candidate fields include:

```ts
{
  source: 'bundled',
  rank: BUNDLED_SKILL_RANK,
  invocation: {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  },
  resourceBase: {
    kind: 'directory',
    path: absoluteVendoredSkillDirectory,
  },
}
```

## 6. Repository Layout

The target implementation layout is:

```text
.
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── cordis.patch.yml
├── AGENTS.md
├── README.md
├── README.zh-CN.md
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── PROVENANCE.json
├── vendor-files.json
├── src/
│   ├── index.ts
│   ├── provider.ts
│   └── catalog.ts
├── generated/
│   └── catalog.json
├── vendor/
│   └── mattpocock-skills/
│       ├── .distribution/
│       ├── skills/
│       ├── DISTRIBUTION.md
│       └── LICENSE
├── scripts/
│   ├── update-source.mjs
│   ├── verify-vendor.mjs
│   ├── verify-package.mjs
│   ├── verify-package-e2e.mjs
│   └── verify-isolated-dsh.mjs
├── tests/
└── lib/
    ├── index.js
    ├── catalog.js
    ├── provider.js
    └── types/
```

The exact source tree may split modules differently, but ownership boundaries and generated/vendor locations remain as above.

## 7. Generated Catalog

Maintenance tooling parses source manifests and frontmatter using a real YAML implementation. Runtime code does not contain a second YAML parser.

Each catalog entry records at least:

- Skill name and description
- optional `whenToUse` and metadata
- unconsumed source frontmatter under deterministic `frontmatterExtensions` audit metadata; at runtime this is exposed as `SkillCandidate.metadata.frontmatterExtensions`, while source `metadata` keeps its original keys; notably, `argument-hint` is preserved there and is never mapped to `whenToUse`
- canonical invocation policy
- relative Skill directory and `SKILL.md` path
- channel membership
- source-file SHA-256
- validated byte offset where the body starts

Generation rejects:

- unknown distribution or channel schema versions
- non-kebab Skill names
- missing or empty descriptions
- duplicate names within a channel
- a frontmatter name that differs from the selected directory
- unsupported legacy invocation keys
- invalid UTF-8 or malformed YAML
- absolute paths, `..`, symlink escapes, or duplicate normalized paths
- generated output that differs from committed output after verification

The committed catalog is sorted deterministically by Skill name and serialized canonically.

## 8. Vendoring and Provenance

`scripts/update-source.mjs` consumes immutable identities from `source-lock.json`; `--source` changes only the Git transport. It verifies the annotated tag object, peeled commit, and pinned verifier SHA-256 before executing the verifier. It performs updates in a same-filesystem clean staging directory and moves results into place only after all checks pass.

Required update sequence:

1. Resolve and verify the exact annotated tag object and peeled commit.
2. Verify the source in a real Git checkout using the source distribution's verifier.
3. Parse the selected distribution manifests and reject unknown schemas.
4. Build the union of every declared channel from manifests, not from directory enumeration.
5. Read each selected complete Skill directory from Git tree entries and blob bytes, preserving Git-compatible modes without relying on checkout bytes.
6. Copy exactly every discovered `.distribution/channels/*.json`, `.distribution/upstream.json`, `DISTRIBUTION.md`, and the upstream `LICENSE`; do not copy maintenance scripts or the rest of `.distribution/`.
7. Generate the catalog, `PROVENANCE.json`, and sorted `vendor-files.json`.
8. Verify every regular file, executable bit, and symlink target; reject path escapes and residue from an older source.
9. Re-run generation in check mode and require zero drift.

`PROVENANCE.json` records both repositories, tag object, distribution commit, upstream commit, manifest hashes, generator version, and inventory root hash.

`vendor-files.json` records normalized paths, file kind, Git-compatible mode, SHA-256, and symlink target where applicable. Its `rootSha256` is SHA-256 over UTF-8 byte-sorted, NUL-delimited records prefixed by the domain string `dsh-mattpocock-vendor-v1\0`. The inventory must be verifiable from an extracted npm or tar archive without Git metadata.

Updates use an exclusive `O_EXCL` lock and backup/rollback renames. The accepted four-output layout provides transactional all-or-rollback replacement, not true reader-level atomic visibility across `vendor/`, `generated/`, `PROVENANCE.json`, and `vendor-files.json`; achieving the latter would require a single generated root or indirection and is outside this design.

## 9. Source-Body Policy

Vendored upstream files are trusted executable instructions and are reviewed as code during every source update.

The adapter must not:

- change “Skill tool” to a DSH-specific spelling
- rewrite slash commands
- replace generic agent or subagent terminology
- inject DSH tool argument syntax
- delete `agents/openai.yaml` or other source-owned resources
- insert provider-specific instructions into `SKILL.md`

DSH-specific evaluation, examples, and compatibility guidance live in this repository outside `vendor/`.

If a repeatable evaluation proves a generic Skill failure, first determine whether DSH or the generic source distribution should own the fix. Any downstream overlay requires a new explicit design decision, must remain separate from vendored bytes, and must be visible in provenance.

## 10. Build and Distribution

Author in TypeScript and commit the prebuilt `lib/` output. GitHub installation must not require `prepare`, `postinstall`, or pnpm build approval.

The package file allowlist includes only runtime code and types, the bundle patch, generated catalog, vendored selected files and provenance, the immutable `source-lock.json`, licenses/notices, and user documentation. Source maintenance scripts may be included only if every advertised package script remains runnable from the packed artifact; otherwise they remain source-only and are not advertised as installed-package commands.

Before any release:

1. Start from a clean Git tree.
2. Verify source provenance, vendor inventory, generated catalog, tests, and a scratch build that byte-matches committed output.
3. Build one accepted tarball once into a fresh out-of-repository directory.
4. Immediately record its source commit and pnpm version, compute its size and SHA-256, and make the artifact plus identity records read-only inside a fresh mode-0700 directory.
5. Verify the recorded build context and exact archive members, bytes, modes, extracted provenance, and runtime entry targets without rebuilding; the only accepted packer normalization is pnpm 11.8.0's deterministic removal of the final LF from packed `package.json`.
6. Under exact DSH 0.1.2-rc.1, smoke-install a checksum-verified private snapshot of those exact tarball bytes in an isolated DSH Profile and compare full per-Skill invocation plus lazy-definition hashes with a separate isolated checkout installation.
7. Attach or publish the same bytes. Do not rebuild independently for GitHub and npm.
8. Create the immutable release tag for the exact source commit represented by the artifact.

Phase 4 produces a private development-verification artifact, not a release. Its scope, accepted command, isolation boundary, and recorded evidence are fixed in [PHASE4_ARTIFACT_VERIFICATION.md](PHASE4_ARTIFACT_VERIFICATION.md).

The public source repository may use Git commits or locally packed tarballs without publishing to npmjs. Raw local evidence is not included merely to satisfy a clean-tree verification gate.

## 11. Compatibility and Precedence

The initial implementation targets the locally installed DSH `0.1.2-rc.1` on Linux with Node `24.17.0` and a filesystem exposing POSIX no-follow opens plus stable device/inode identity. The provider API was also observed unchanged on the researched `0.1.3-alpha.2` source. Unsupported no-follow hosts fail closed, and compatibility claims are limited to releases, operating systems, and filesystems actually tested.

The package must use the host's DSH and Cordis service identities through peer dependencies rather than bundling duplicate runtime copies.

An integration test must prove that a same-name project or user Skill wins over this package. Do not use rank 550 or rank 400 to override another bundled or user provider. Equal-rank ordering is not part of this package's compatibility contract.

## 12. Required Verification

Deterministic gates include:

- manifest and source provenance verification
- exact Vendor inventory verification
- generated catalog drift check
- invocation-policy mapping tests
- complete channel membership tests
- `list()` and `get()` provider contract tests
- relative resource-base tests
- deterministic active-read lookup/lifecycle aborts and malformed/missing-file behavior
- final, vendored-root, and intermediate-ancestor symlink rejection
- project/user precedence integration
- parseable one-row Bundle patch
- packed-file allowlist and packed-script consistency
- local path and tarball `dsh plugin --profile <name> add ...` smoke tests in an isolated `DSH_HOME`
- composed config inspection with `dsh --profile <name> --dump-config`
- Web/Host behavior verification without a custom client bundle

The nondeterministic model-level gate is defined separately in the evaluation campaign material, which is kept outside this repository.

## 13. Non-Goals

The initial implementation does not provide:

- public marketplace discovery
- npmjs publication
- automatic upstream updates
- per-Skill enable/disable UI
- multiple npm packages or npm dist-tags for channels
- runtime source directories supplied by users
- custom slash syntax or alternate invocation forms
- custom Web presentation for the core Skill provider (optional session instruments/configuration are the owner-approved exception in §15)
- modifications to the Matt Pocock source distribution
- compatibility claims for untested future DSH versions

## 14. Change Control

When implementation reveals a conflict with this design:

1. Stop before encoding a contradictory workaround.
2. Record the observed evidence and smallest viable alternatives.
3. Discuss the decision with the owner.
4. Update this document and relevant evaluation or implementation plan in the same approved change.

Test failures may refine mechanics. They do not silently authorize changing locked decisions.

## 15. Accepted extensions — workspace workflow controls (2026-10-05)

The accepted extension specifies plugin-page global/per-workspace policy for worktree binding, lifecycle and dual windows, plus session-visible ticket progress with task-defined business states and persistent pending-decision indicators. Business status vocabulary and summaries are task-defined, without preset workflow stages or forced mapping to fixed progress categories; partial completion is preserved when the task declares it. All instruments belong to durable owner-session instances, not workspace-wide business state; managed descendants contribute to their owner instance. Independent sessions in the same workspace must not mix ticket/decision/window state. The current design adopts per-instance T/S under workspace policy, replacing the earlier workspace-shared quota recommendation; shared real-resource safety remains separate. The accepted design includes Skills/management separation, workspace-first policy editing, sparse inheritance, explicit revisioned saves and impact/convergence display. Rolling refill, ticketless research and automatic parent consumption remain required; execution state uses program receipts, not message text. Accepted clarification (2026-10-06): business judgment about decisions, completion/delivery, pause/cancel/reopen belongs to Skills, user-agent agreements, documents and the model. Instruments accept explicit business updates, persist/display them and mechanically apply ticket-slot intent without independent semantic evidence gates, business-policy evaluation or extra approval prompts; T can change from these updates, while S still requires real program release receipts. A subsequent accepted clarification requires enabled dual windows to be a mandatory cooperation mechanism with necessary agent guidance and an explicit functional off switch; worktree lifecycle may guide resource handling. [INSTRUMENT_GUIDANCE.md](INSTRUMENT_GUIDANCE.md) separates minimal enabled-feature protocol from project-tuned business preferences and documents that no instrument prompt is model-validated yet. Hard enforcement needs supported host entrances, not prose alone. [WORKSPACE_WORKFLOW_CONTROLS.md](WORKSPACE_WORKFLOW_CONTROLS.md) is the requirements entry; [SESSION_INSTRUMENTS.md](SESSION_INSTRUMENTS.md) defines the new business/scope contracts. Concrete UI placement, schema/defaults and enforcement mechanisms remain proposals, not delivered features.

This is an opt-in extension of compatibility scope, not a rewrite of the immutable provider or a general issue-tracker replacement. Historical Host-only build/evaluation records remain records of their original baseline. No implementation, active GUI/profile modification, new model campaign, installation or publication is authorized merely by adding this requirements document.

Subsequent explicit owner authorization (2026-10-06): begin phased implementation, using TypeScript. The first stage is the unmounted policy/session-ownership/persistence core and isolated mechanical tests, documented in [CONTROLS_CORE.md](CONTROLS_CORE.md). This authorizes local plugin engineering, not live GUI/profile modification, model campaigns, installation or release.
