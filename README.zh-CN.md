# DSH Matt Pocock Skills

这是一个私有的、可复现的 DeepSeek Harness Profile Bundle，用于加载 [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution) 中定义的 Skills Channel。

**当前状态：核心插件与 Phase 4 制品验证已完成；Phase 5 行为评估已关闭，但未通过。** 三次试验为 2 次通过、1 次硬失败，总体失败。后续维护聚焦薄适配与真实兼容缺口，不继续扩展行为审计器；所有者 Profile 启用与发布仍未授权。

- 已有仓库的升级须知：[MIGRATION.md](MIGRATION.md)
- 权威设计：[docs/DESIGN.md](docs/DESIGN.md)
- 实施计划：[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- Phase 4 校验和绑定制品流程：[docs/PHASE4_ARTIFACT_VERIFICATION.md](docs/PHASE4_ARTIFACT_VERIFICATION.md)
- `implement-spec` 行为评估：已关闭且未通过（2 次通过、1 次硬失败）。其活动定义、器械与原始记录属于评估材料而非本包内容，已归档于本仓库之外。

该包通过 DSH 原生 `ctx.skills` Provider 暴露未经正文重写的上游 Skill。通道集是**数据驱动**的：插件发布的正是钉住的分发版本所声明的通道，目前是**一个 `stable` 通道、27 个 Skills**。未知通道名会失败关闭，而不是加载空集。

这是非官方适配器，不代表 Matt Pocock 的认可、背书或关联。

**升级须知：** 上游 v1.3 把 `CONTEXT.md` 改名为 `GLOSSARY.md`，且**没有旧名回退**；技能在旧名缺失时**不会报错**，只会静默新建一份空的 `GLOSSARY.md`。已有仓库请先读 [MIGRATION.md](MIGRATION.md)。

## 使用顺序与已知限制

1. **安装与启用是 DSH 层的操作。** 本包提供原生 Skill provider，默认使用唯一声明的通道 `stable`。安装不会自动切换 owner Profile，也不会修改项目约定。
2. **项目初始化是另一件事。** 在已启用插件的目标项目会话中，首次使用工程类 Skills 前运行 `/setup-matt-pocock-skills`。它会与用户确认 tracker、标签与领域文档，并写入项目配置；不是插件安装器。GitHub/GitLab 操作需要相应 CLI、认证和授权，也可选 local markdown。
3. **通过原生入口调用。** 用户用 `/skill-name` 调用；Skill 正文中的后续 Skill 调用由 agent 使用 DSH 的 `skill` 工具完成，不是自动递归执行 slash 文本。模型可调用与用户可调用权限分别生效。

当前本地 DSH 实现的兼容提示（不代表所有 Profile 均已启用相关能力）：

- `/compact` 只接受无参数形式，官方文档中的 `/compact 附加说明` 不能直接照用；`/clear` 同名入口尚未验证，不自动清空会话。
- DSH 默认识别 `AGENTS.md` 与 `CLAUDE.md`，无需批量改写为某一种文件名。
- **后台派发不等于 headless 保活。** 当前 headless 等 root idle 后汇总并退出，不能承诺后台子任务继续正常完成及回传。Web 场景不能由此直接推断；完整无人值守工作流需另行解决宿主生命周期。
- Git/worktree、浏览器、网络研究与共享笔记目录依赖目标环境和权限。provider 不安装这些工具、不授予外部写权限，也不绕过文件策略。
- **宿主版本。** 已在 DSH `0.1.2-rc.1`、`0.1.7-alpha.2`、`0.1.7-rc.2`、`0.2.0-rc.1`、`0.2.0-rc.2` 与 `0.2.1-alpha.1` 上验证。始终不需要修改运行时代码，只需放宽 peer 依赖范围，因为 npm semver 无法用单一范围覆盖宿主的预发布版本。DSH `0.2.0-rc.1` 新增了安装期 peer 硬门禁，只声明 `^0.1.7-alpha.2` 的版本会被拒绝；本版本同时声明了 `^0.2.0-rc.1`，门禁把它解析为 `>=0.2.0-rc.1 <0.3.0`，因此可在全部已验证宿主上安装，到 `0.3.0-alpha.1` 为止。详见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。

职责边界见 [薄适配范围](docs/ADAPTER_SCOPE.md)，Skill 语义见 [兼容性清单](docs/COMPATIBILITY.md)，宿主版本见 [宿主兼容性核对](docs/HOST_COMPATIBILITY.md)。这些说明不改写官方 Skill 或历史评估结果，也不解除启用/发布门槛。

## 当前开发验证

```bash
pnpm install --frozen-lockfile
node scripts/verify-package.mjs --prepack
node --test
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 的文件系统加固已在 Linux/Node 24 上验证；不支持安全 no-follow 文件打开的主机会采用失败关闭策略，更广泛的平台兼容性仍需后续门禁验证。

当前不发布到 npmjs。`@lmgatex` npm Scope 的所有权将在未来决定 npm 发布前单独确认。
