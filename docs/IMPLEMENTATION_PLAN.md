# Implementation Plan and Gates

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

This plan implements the accepted contract in [DESIGN.md](DESIGN.md). It is intentionally phased so provenance and package behavior are testable before the plugin is enabled in the owner's active Web profile.

> **Historical record.** Every phase below describes the **two-channel** (`stable` + `beta`) baseline at source distribution `v0.1.0-beta.1`: 26 Skills, 81 vendored files, and the counts and hashes it quotes. Those values are preserved as the record of what was verified then. Historical private-repository phases below retain their original meaning; the current plugin repository is public with private local evidence excluded, as amended in DESIGN.md. The current baseline is source distribution `v0.3.0`, mirroring upstream release `v1.3.1`: two channels (`stable` and `beta`), 27 Skills each, 85 vendored files. Do not read the numbers below as the current state.

## 最新协作功能实施（2026-10-06）

已接受范围包含工作树绑定与全仪器持久化/当前注入/历史查询的源码实施。本阶段以 [DESIGN 最新要求](<DESIGN.md>)为准，取代下方旧硬容量/重资源处置控制的行为规格。

源码已包含参考 T/S、宿主首次 cwd 源码/编译补丁、持久工作树关系、全仪器有界当前投影、摘要分页/按需详情、显式副本与源旧历史整理，以及 Host/Client 工具与操作入口。当前复审修复、严格构建和公开接口机械回归已完成；清洁提交对应的开发制品校验与不可变身份记录独立随交付保存。当前结果及验收边界见[公开验证说明](<VERIFICATION.md>)，不以历史本地记录代替本轮结果。源码交付不自动完成安装或正式发布。

| 已实现源码范围 | 当前契约与操作说明 |
|---|---|
| 参考窗口、真实程序事实与当前消费去重 | [使用指南](<../CONTROLS.md>)、[消费模块](<../src/controls/consumption.ts>) |
| 首次目录能力与可信技术授权 | [宿主补丁交付](<../host-patches/README.md>)、[宿主接口](<HOST_INTEGRATION.md>) |
| 持久意图、实际绑定、discarded/cleaned 与源 checkpoint/旧版本删除 | [工作树绑定](<WORKTREE_BINDINGS.md>) |
| 历史副本、主动查询、三源域整理及非原子部分结果 | [历史核心](<HISTORY_CORE.md>) |
| 九项模型工具、客户端历史与源清理操作 | [中文使用指南](<../CONTROLS.md#6-工具与实际权限>) |

源码实施不等于安装到当前 SDK/Profile/GUI；不授权发布、推送或历史模型 campaign。数据清理必须如实区分历史副本与源日志，不把隐藏当删除，也不以默认 TTL 破坏本 session 全工作树历史。最终能力与验证以本轮完成记录为准。

## 0.4.4 既有 Profile 原生依赖接入修复（候选，未发布／安装）

本阶段授权为既有 Profile 旧依赖接入与组件强制开启覆盖的代码修复和真实 SDK／Loader／Plugin Manager 验证。新版本 push／Release／同字节本机安装另行确认；不沿用只针对 0.4.3 的发布安装授权，不自动重启 GUI，也不静默清除当前 Profile 的布尔覆盖。

保持固定原版执行资产字节，通过开发构建器生成完整 17 个静态 import 字面量清单；14 个非 builtin 接入既有公共 Loader 的 canonical native ESM 路径，3 个 builtin 不变。仅重写已核验的字面量，普通 ESM 导入确定性 data URL；不改 SDK、其他插件依赖、全局 resolver 或 native manager 逻辑。包装器真正静态导入、原生入口、peer manifest 所有权、版本和实际模块身份仍严格一致，不以版本相等代替共享身份。

门禁已观测：旧 Profile 协议 tracer RED→GREEN；真实旧协议包只读接入的 canonical binding 与实际 Manager 安装／新启动 A/B／续用通过；Manager 关→开保存 disabled:false，诊断 forced-enabled 与 disabled 区分，已有 Fiber／服务／B child 与冻结 header 不变。源码准备／串行组合 manifest 越界 tracer RED→GREEN。当前全量根测试 761／761，0 skipped；组合 49／49、只读准备 87／87、Manager 11／11。精确候选包装边界为 83 固定文件 + 85 vendor = 168 文件、64 JS／声明；完整 import 清单与 asset／MIT／manager 区域不变。严格构建、开发包及 vendor 已通过；清洁提交的双轴复审、一次准确制品及同字节矩阵须另有完成记录，不能把源码矩阵当发行包或当前 GUI 激活证明。

## 0.4.3 产品形态与发行门禁（历史已授权阶段）

本阶段接受范围为代码修改、push、新 GitHub Release 与同字节本机安装。交付根包／子路径独立 locale metadata、一个插件作用域的功能设置、内部兼容桥来源与高级维护控制说明，以及明确组件关闭覆盖的只读原因和恢复自动选择方向。技术 id／specifier、原版资产和 root 生命周期选择规则保持不变；不声称可以隐藏框架通用开关，也不伪造 SDK reset API。

门禁：真实 Loader 关闭覆盖 tracer RED→GREEN；startup transport 兼容旧无 reason 回执，拒绝未知／矛盾 reason；真实 SDK 的根／子路径 metadata 与禁用行读取不执行 provider；Client 及真实 DOM 验证请求与内部依赖区别。随后严格构建、全量回归、四个精确 locale 归档路径、clean-source 一次 pack、同字节实际安装矩阵、隐私检查、新不可变标签／六项公开资产、全部下载复核和原样本机安装。首次 cwd 实际支持仍依赖运行事实，不由 metadata／安装回执推定。

本机已授权的旧关闭覆盖仅撤销该 override 以恢复自动选择，保留启动请求与其他 Profile 字段；不强制开启、改共享 SDK 或自动重启。旧版本／资产不覆盖，npm 不发布，原始日志／快照不公开。

## 单包兼容接入：0.4.2 发布与安装门禁（历史已授权阶段）

接续[最新单包要求](<DESIGN.md#单包兼容支持的交付要求>)：验证固定版本的插件内部兼容服务，通过公开 bundle／loader 生命周期在真正启动时选择唯一提供者，保持当前热重载服务、原始 native 配置、首次 cwd 及原地续用语义。相同 recipe 的旧管理记录跨版本接续，不把维护转回用户。仅有管理器或文案修复不构成完成。

验收沿用公开配置组合／真实 Loader 与 native 创建／续用接口；要求无模型的首次安装热重载、普通重启、用户停用／覆盖、自定义 Profile 拒绝、A/B 工作目录、原始 spawn/fork、冷恢复、权限与路由、版本与制品校验。单包源码与开发制品已完成验收；当前所有者已授权 0.4.2 的 push、GitHub Release 和本机插件安装。须重新升版、清潔提交并构建一次准确发行包，再复核同字节安装矩阵、远端标签及下载摘要；不覆盖旧资产、不发布到 npm、不自动开管理／启动请求，也不擅自中断当前服务。准确发布与本机安装事实分别记录，公开材料排除本机快照；进度见[接入说明](<PLUGIN_MANAGED_COMPATIBILITY.md>)。

## Current optional controls implementation — 2026-10-06（旧规格历史验收）

**本段为前一阶段旧规格验收，不是本轮新行为完成声明。** Repository-local TypeScript Host/Client/control implementation and mechanical validation were complete for the then-supported seams. The earlier [completion matrix and verification（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>) distinguishes implemented features from installed-host unsupported guarantees; usage is in [the shipped guide](../CONTROLS.md). This does not satisfy or authorize the historical Phase 5 behavioral campaign, owner activation or private release gates below.

Current shape: immutable Skill provider plus optional lazy runtime, revisioned workspace policy, durable owner-scoped instruments, independent rolling T/S, safe resource retention, actual consumption, durable owner notices and native UI. Current host gaps remain native wake admission gating (2026-10-10 update: the host subagent catalog provides descendant membership and live Agent.status drives S, projected in memory from event-maintained membership; observation is not a gate), initial independent continuable cwd, cold-resume closure and multi-root Git writes. Preserve unknown/fail-closed/retention rather than inventing enforcement.

## Phase 0 — Repository Baseline

**Status:** Complete.

- Keep both GitHub repositories private.
- Confirm the source distribution default branch and immutable tag are reachable.
- Commit this design baseline before runtime implementation.

**Gate:** clean local worktrees, private repository visibility, and matching remote commit IDs.

## Phase 1 — Package Scaffold

**Status:** Complete.

- Create the TypeScript ESM package and exact development lockfile.
- Add the one-row `cordis.patch.yml` and Schemastery channel config.
- Add downstream license and third-party notice structure.
- Define a strict package file allowlist.

**Gate:** package metadata and patch parse successfully; no client entry, install lifecycle script, or runtime network dependency exists.

## Phase 2 — Verified Source Ingestion

**Status:** Complete. The pinned Beta union contains 26 Skills and 81 vendored files (212,143 bytes); offline inventory root SHA-256 is `1e6182fe1e430a5f653be3b33e9340e19ff8a812d0f7bb7bbc44da10fb9c6a50`.

- Implement explicit tag/commit source ingestion.
- Vendor the complete Beta union from the source manifests.
- Generate Stable/Beta membership, frontmatter metadata, body offsets, provenance, and per-file inventory.
- Add check mode and clean-staging replacement.

**Gate:** a second generation produces no diff; extracted vendor files verify without Git metadata; every vendored source-owned byte matches the source distribution.

## Phase 3 — Immutable Provider

**Status:** Complete. The immutable provider passes 13 direct/registry provider tests against `@deepseek-ai/dsh-skill@0.1.2-rc.1`; the complete suite has 27 passing tests, including anchored root/intermediate/final symlink drift and deterministic active-read cancellation regressions.

- Implement the Host provider over the generated catalog.
- Implement static `list()` and exact lazy `get()`.
- Preserve DSH invocation policy and package-directory resource bases.
- Use `source: bundled` and rank 600 through the DSH constant.

**Gate:** provider contract, abort, drift, membership, resource, and precedence tests pass against the actual DSH registry package.

## Phase 4 — Build and Artifact Verification

**Status:** Complete. The checksum-bound 98,347-byte development artifact from commit `7adf8b352153dff8beea42f9f4ba002502d3c504` passed the exact 97-file archive gate and all four isolated DSH 0.1.2-rc.1 probes; details are recorded in [PHASE4_ARTIFACT_VERIFICATION.md](PHASE4_ARTIFACT_VERIFICATION.md).

- Prove a scratch TypeScript build exactly matches committed `lib/` and declarations.
- Build one accepted private development tarball into a fresh mode-0700 external directory, then bind its identity immediately with source commit, pnpm version, size, and SHA-256 records.
- Verify its exact 16 fixed files plus the closed 81-file vendor inventory, extracted provenance, modes, entry points, and absence of source/client payloads.
- Install the exact local checkout and checksum-bound tarball in separate isolated `DSH_HOME` roots using the `headless` profile.
- Inspect identical composed Stable/Beta configs and query both installed providers through an actual booted DSH Skill Registry without invoking a model.

**Gate:** the disposable pnpm-pack regression and sole accepted tarball pass `scripts/verify-package.mjs` under pnpm 11.8.0; `scripts/verify-isolated-dsh.mjs` securely creates and removes fresh homes, normal installs request no package build approval, all four composed configs are asserted, checkout and private-snapshot tarball registry reports match byte-for-byte across per-Skill invocation and lazy-definition hashes under DSH 0.1.2-rc.1, `implement-spec` appears only in Beta and remains model-disabled, and no custom Web module or owner-profile change is needed.

## Phase 5 — Behavioral Evaluation

Run the `implement-spec` campaign from clean fixture repositories. Capture the designated model route, DSH version, complete transcript, Git graph, test output, and cleanup state.

**Gate:** meet the evaluation pass policy without editing the vendored `implement-spec` body.

**Status:** closed and failed. The campaign definition, harness and raw records are evaluation material rather than package content, and are archived outside this repository.

## Phase 6 — Owner Profile Enablement

- Keep existing community Matt Pocock/Superpowers adapters disabled to avoid duplicate providers.
- Install the verified checkout or tarball into the owner’s `web` profile.
- Override this bundle row with `channel: beta`.
- After the agreed activation step, restart the selected DSH Web profile and refresh its configured Web URL.
- Verify slash discovery and one real `/implement-spec` invocation.

**Gate:** active profile resolves this provider, local/project overrides still win, and unrelated profile configuration remains unchanged.

## Phase 7 — Private Release

- Create a versioned private Git tag only after all previous gates pass.
- Build one tarball once and record its SHA-256 and provenance.
- Optionally attach that exact tarball to a private GitHub Release.
- Do not publish to npmjs until npm scope ownership and public-release intent are separately approved.

## Completion Definition

The first implementation is complete only when deterministic tests, isolated DSH installs, the real behavioral evaluation, active-profile verification, clean worktrees, and private remote synchronization all pass. Documentation must describe observed behavior rather than intended but untested behavior.

## Optional workspace controls — phased implementation (2026-10-06)

The accepted extensions are specified in [WORKSPACE_WORKFLOW_CONTROLS.md](WORKSPACE_WORKFLOW_CONTROLS.md): workspace policy editing, session-instance lifecycle/dual-window instruments, task-defined ticket progress and persistent pending decisions. [SESSION_INSTRUMENTS.md](SESSION_INSTRUMENTS.md) records accepted GUI principles, owner-session/descendant identity, per-instance T/S, model-led business updates versus program execution facts, nonjudgmental ticket-slot handling, decision attribution and isolation/recovery tests. Accepted clarification excludes plugin-owned business correctness/approval gates: the model decides when to register or resolve matters and when tickets complete/pause/cancel, then updates instruments; deterministic T accounting is not semantic certification. Enabled dual windows still require deterministic admission plus minimal agent protocol injection, with explicit off behavior; optional user project instruction tuning and unvalidated-prompt handling are described in [INSTRUMENT_GUIDANCE.md](INSTRUMENT_GUIDANCE.md). Mechanism-only tests and separately authorized model-behavior tests are distinct gates. These are not completed phases or changed historical outcomes. Individual refill, ticketless research, program-only execution receipts and automatic state consumption remain required; [REACTIVE_WINDOW_INSTRUMENTATION.md](REACTIVE_WINDOW_INSTRUMENTATION.md) identifies existing same-model-step hooks. Before implementation, settle concrete client seats/schema/defaults, supported binding/admission/retirement seams and instance authorization; then run the isolated no-model matrices including two sessions in one workspace, custom states and offline/stale decision handling. Live GUI/profile changes and real-model trials remain separate decisions.

The accepted phased implementation begins as follows. Phase 1 uses the existing strict TypeScript ESM build for policy inheritance/revisioned saves, owner-session identity, atomic persistence and isolated recovery tests. It does not mount new host tools, admissions or GUI. Concrete first-stage interface, unset-capacity handling, storage ownership and test evidence are recorded in [CONTROLS_CORE.md](CONTROLS_CORE.md); The second phase continues: Phase 2 implements unmounted task-defined ticket progress and pending-decision records, per-instance event persistence, actual-author/assignment checks and independent viewer revisions; see [INSTRUMENT_RECORDS.md](INSTRUMENT_RECORDS.md). Later window/admission, resource and host/client integration stages remain pending. Historical release and evaluation gates are unchanged.
