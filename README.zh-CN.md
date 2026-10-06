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

本版对应上游 **v1.3.1**（提交 `24fe0ef`）。`PROVENANCE.json` 记录了这个对应关系，因此不必解析 Git 对象就能知道自己在跑上游哪一版；上游自己的 [CHANGELOG](vendor/mattpocock-skills/CHANGELOG.md) 也随包发货。

默认是 `stable`。这是非官方适配器，不代表 Matt Pocock 的认可、背书或关联。

**升级须知：** 上游 v1.3 把 `CONTEXT.md` 改名为 `GLOSSARY.md`，且**没有旧名回退**；技能在旧名缺失时**不会报错**，只会静默新建一份空的 `GLOSSARY.md`。已有仓库请先读 [MIGRATION.md](MIGRATION.md)。

## 0.4.1 启动修复

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
- **宿主版本。** 已在 DSH `0.1.2-rc.1`、`0.1.7-alpha.2`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2` 与 `0.2.1-alpha.1` 上验证。不可变 Skills provider 的兼容始终无需修改运行时代码，只需放宽 peer 依赖范围；可选首次 cwd 派发兼容支持属于下述独立能力，因为 npm semver 无法用单一范围覆盖宿主的预发布版本。DSH `0.2.0-rc.1` 新增了安装期 peer 硬门禁，只声明 `^0.1.7-alpha.2` 的版本会被拒绝；本版本同时声明了 `^0.2.0-rc.1`，门禁把它解析为 `>=0.2.0-rc.1 <0.3.0`，因此可在全部已验证宿主上安装，到 `0.3.0-alpha.1` 为止。详见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。

职责边界见 [薄适配范围](docs/ADAPTER_SCOPE.md)，Skill 语义见 [兼容性清单](docs/COMPATIBILITY.md)，宿主版本见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。这些说明不改写官方 Skill 或历史评估结果，也不解除启用/发布门槛。

## 可选协作控制

可选 TypeScript 扩展已实现修订化全局/工作区设置、持久 owner-session 仪器、任务自定义票与裁决、参考 T/S、创建时工作树绑定、有界当前注入、分页历史与显式源旧历史清理，以及原生惰性客户端。不可变 Skill provider 保持独立；宿主服务齐备时，独立挂载九项工具及第三方设置/常驻摘要/右侧详情。管理默认关闭，数值参考值未配置，不猜默认。用法见[协作控制说明](<CONTROLS.md>)。

T/S 超限或观测未知不拒绝合法原生委派，不新增业务审批。Git 工作树由 agent 自行创建、合并和删除；已清理树退出持续注入，废弃未清理仍提示，历史不默认过期。

当前未发布的开发实现由同一个插件包管理首次 cwd 兼容支持：固定版本兼容服务、公开启动组合与只读身份／完整性检查，不改共享 SDK，也不另管启动器。正常流程是安装／更新插件、页面保存下次启动请求、必要时正常重启 DSH；用户无需选择 SDK 目录或执行离线准备命令。当前能力、下次请求与实现就绪分别展示，刷新／HMR 不算重启。保留已有 ACTIVE／PENDING 服务及明确原生覆盖；未知或自定义隔离组合保留普通原生行为，关闭不改变既有 child／历史／cwd 或权限。旧 CLI 仅为维护诊断保留，不是必经步骤。这些源码不冒称现有 0.4.1 Release 或当前 GUI 已更新。具体见[控制指南](<CONTROLS.md>)和[验证摘要](<docs/VERIFICATION.md>)。原始研究、日志及收据保留在仓库外；package.private 防止 npm 发布，与仓库公开可见性分开。

## 当前开发验证

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -p tsconfig.json
chmod 755 lib/compatibility/cli.js
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --out lib/client.js --declaration
# Optional installed-host storage/API fixtures: set DSH_CONTROLS_HOST_ROOT explicitly.
node --test tests/*.test.mjs
# Release prepack still requires a clean committed tree.
node scripts/verify-package.mjs --prepack
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 的文件系统加固已在 Linux/Node 24 上验证；不支持安全 no-follow 文件打开的主机会采用失败关闭策略，更广泛的平台兼容性仍需后续门禁验证。

当前不发布到 npmjs。`@lmgatex` npm Scope 的所有权将在未来决定 npm 发布前单独确认。
