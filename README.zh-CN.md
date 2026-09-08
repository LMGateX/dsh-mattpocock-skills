# DSH Matt Pocock Skills

这是一个私有的、可复现的 DeepSeek Harness Profile Bundle，用于加载 [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution) 中定义的 Stable/Beta Skills Channel。

**当前状态：Phase 0–3 已完成。** 已实现经过验证的 Stable/Beta 源码集合和不可变 DSH Skill Provider，并通过确定性 Provider 门禁。隔离 DSH 安装、行为评估及所有者 Profile 启用仍属于后续独立阶段。

- 权威设计：[docs/DESIGN.md](docs/DESIGN.md)
- 实施计划：[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- `implement-spec` 行为评估：[docs/IMPLEMENT_SPEC_EVAL.md](docs/IMPLEMENT_SPEC_EVAL.md)

该包通过 DSH 原生 `ctx.skills` Provider 暴露未经正文重写的上游 Skill：

- `stable`：默认的 25 个正式 Skills
- `beta`：在 Stable 基础上增加可由用户调用、但对模型隐藏的 `implement-spec`

这是非官方适配器，不代表 Matt Pocock 的认可、背书或关联。

## 当前开发验证

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -p tsconfig.json
node --test
node scripts/verify-vendor.mjs
node scripts/update-source.mjs --source ../mattpocock-skills-fork --check
```

Phase 3 的文件系统加固已在 Linux/Node 24 上验证；不支持安全 no-follow 文件打开的主机会采用失败关闭策略，更广泛的平台兼容性仍需后续门禁验证。

当前不发布到 npmjs。`@lmgatex` npm Scope 的所有权将在未来决定 npm 发布前单独确认。
