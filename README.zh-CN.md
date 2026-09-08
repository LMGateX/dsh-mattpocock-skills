# DSH Matt Pocock Skills

这是一个私有的、可复现的 DeepSeek Harness Profile Bundle，用于加载 [LMGateX/mattpocock-skills-distribution](https://github.com/LMGateX/mattpocock-skills-distribution) 中定义的 Stable/Beta Skills Channel。

当前状态：**Phase 1 包结构搭建中，尚未提供可用的 Skill Provider。**

- 权威设计：[docs/DESIGN.md](docs/DESIGN.md)
- 实施计划：[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
- `implement-spec` 行为评估：[docs/IMPLEMENT_SPEC_EVAL.md](docs/IMPLEMENT_SPEC_EVAL.md)

该项目会通过 DSH 原生的 `ctx.skills` Provider 暴露未经正文重写的上游 Skill，并允许配置：

- `stable`：默认的 25 个正式 Skills
- `beta`：Stable 加官方 `implement-spec`

这是非官方适配器，不代表 Matt Pocock 的认可、背书或关联。

## 当前开发验证

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -p tsconfig.json
node --test tests/scaffold.test.mjs
```

当前不发布到 npmjs。`@lmgatex` npm Scope 的所有权将在未来决定 npm 发布前单独确认。
