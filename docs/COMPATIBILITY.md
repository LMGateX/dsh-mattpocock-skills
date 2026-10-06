# DSH Skill 兼容性清单

## 范围与证据级别

这是能力层面的首轮静态盘点，不是全部 Skills 的端到端认证。**本次盘点的逐 Skill 行号引自 v1.2.3 时代的 vendor 基线；当前 vendor 已更新到上游 v1.3（27 个 Skills），行号可能已经漂移，结论本身未重跑。**对全部 Skill Markdown 做宿主关键词检索，并精读 setup、implement-spec、code-review、research、wayfinder、ask-matt 的阶段边界、router Skills、to-tickets 与 diagnosing-bugs。未命中关键词不能证明完全兼容。

基线：adapter 提交 `b27f9add6e29267ebe2303bb50729252ed47e1b5`；固定 vendor；当时核验的 DSH 安装产物。宿主版本层面的 API 核对（0.1.2-rc.1 → 0.1.7-alpha.2、peer 范围修复、跨宿主验证）另见 [宿主兼容性核对](HOST_COMPATIBILITY.md)。当前实现的源码事实不自动等同于历史 Trial 当时的运行时，也不证明 owner profile 已加载相应能力。本次没有读取 owner 配置。

标记：**契约已验证**＝本次确定性测试；**原生能力**＝代码或工具声明支持；**条件支持**＝依赖项目配置、权限或其他工具；**存在差异**＝正文与当前实现具体不一致；**未验证**＝不能作支持/不支持结论。

## 清单

| 能力/约定 | 判断 | 证据与最小处理 |
|---|---|---|
| 通道集、名称、调用权限 | 契约已验证 | `src/index.ts`、provider registry tests；通道集由 vendor 的 channel manifest 数据驱动，当前为单一 `stable`、27 个 Skills；未知通道名失败关闭。implement-spec 用户可调用但不进入模型可调用目录 |
| 正文、资源目录、卸载、覆盖优先级 | 契约已验证 | `src/provider.ts:178–251`；返回 SkillDefinition，正文保持原样；project/user 可覆盖 bundled。无需再造 loader |
| 用户 `/skill` 与上下文注入 | DSH 原生负责 | adapter 不解析消息。与宿主人类命令 `/compact` 分属不同机制，不做通用 slash 文本替换 |
| 正文中的 “Call the Skill tool” | 原生能力，目标可调用性须匹配 | grill-me:7 → grilling；grill-with-docs:7 → grilling/domain-modeling；DSH 工具名 `skill`，使用精确名称。工具通过 run_code 暴露时调用 SDK，不要求与其他宿主具有相同 API 拼写 |
| Skill 正文中的 `/code-review` | 语义调用，不是自动嵌套注入 | implement-spec:31 要求后续 review；应由 agent 使用原生 skill 工具加载可调用的 code-review，而不是把这段正文当作用户新 slash 命令执行 |
| 项目初始化 | 条件支持，不是安装步骤 | setup:9–15、38–49、63–116 会在用户确认后配置 tracker、domain 和标签文档。安装插件不能自动替代 `/setup-matt-pocock-skills` |
| AGENTS.md / CLAUDE.md | 默认原生支持两者 | setup:74–80 优先编辑已存在的 CLAUDE.md。DSH agent-instructions 默认候选含两者并收集同目录所有存在候选；无须一律替换为 AGENTS.md，实际 profile 可覆盖默认候选 |
| Git/worktree/测试与文件读写 | 条件支持 | 由 bash 和文件工具承担；Git 身份、路径权限、工作目录与测试依赖由环境提供，不由 provider 创建 |
| GitHub/GitLab/其他 tracker | 条件支持 | setup:40–47 指定 gh/glab 或自定义流程，to-tickets:58–67 支持 local markdown。插件不附带这些服务凭据，也不自动授权创建远程 issue/PR |
| 项目外共享探索笔记 | 条件支持，路径需检查 | implement-spec:21 明确要求 repo 外且未来子代理可读写；workspace-write 下未必获准。提前确认共享路径权限，不绕过沙箱，不预改官方正文 |
| 网络研究、浏览器和交互 | 条件支持 | research:10–12 需一手资料；diagnosing-bugs:24–35 列举 HTTP/browser/HITL 方案。search/browser/CLI 是宿主或项目的可选依赖，不是本插件承诺的内置能力 |
| `/compact 附加说明` | 存在差异 | ask-matt/PHASE-BOUNDARIES.md:38 建议带说明；当前 dsh-command-compact/lib/index.js:48–52 拒绝所有非空 rawInput。当前只建议人类使用无参数 `/compact`，不要宣称支持附加指令 |
| `/clear` | 未验证 | ask-matt/PHASE-BOUNDARIES.md:12、23 依赖清空/新会话语义；本轮检查的 command 包与 chat/session UI 范围未定位同名实现。不据此断言整个 DSH 不支持；先保留未验证，不自动清空会话 |
| 多轮问答 | 原生交互能力，headless 须另看 | setup:32–70、to-tickets:42–56 要求真实用户回答。GUI 对话/ask_user_question 可承载；无人交互的 headless 不能假定等价 |
| 后台子代理与完成通知 | 原生能力，有生命周期条件 | continuable 返回 subagentId，另一 jobs 分支返回 jobId；仅 live parent 可收到完成通知，不能混用 ID 或把通知当可靠重试邮箱。详见下节 |
| headless root 返回后的子任务保活 | 存在宿主限制 | 当前 headless 等 root whenIdle 后退出，没有显式等待全部后台 descendants 正常完成；不能承诺 root 返回后子任务继续运行。Web 是否同样受影响未实测 |

## 异步生命周期：代码事实与限制

只读子代理核对后，主代理交叉读取了注入、通知和 headless 退出关键分支：

- `dsh-tool-skill/lib/index.js:168–201,373–393`：仅直接 user 消息触发 slash 扫描；按 agent scope/cwd 加载并核验 userInvocable。`138–155,203–217` 的模型调用另核验 modelInvocable。
- `dsh-tool-subagent/lib/index.js:515–554`：continuable 后台分支返回 subagentId，另一后台分支通过 jobs 返回 jobId；前台等待结果。
- `dsh-subagent/lib/index.js:1761–1795`：完成通知要求 child 已 announced 且 parent 仍在 registry。idle parent 用 followup、running 用 steer；teardown 时仅 inject 不唤醒；通知异常只记录警告。
- `dsh-subagent/lib/index.js:1366–1369,1706–1740`：continuable activation 有 ownedChildren 时为 waiting；单独的 Agent.status 不是整个子树完成的证明。
- `dsh-headless/lib/index.js:151–166`：提交 root 用户任务，等待 root whenIdle，flush root session，汇总输出并退出。没有在这里显式等待全部 continuable descendants 正常完成。
- DSH 根下 `lib/profile-boot-BTzzdrGY.js:11,45–55,237–239,264–267` 与 `dsh-subagent/lib/index.js:980–988,1231–1237,1709–1711`：退出连接应用 dispose；manager teardown 清理活跃子树，dispose 会取消子代理。清理不等于正常完成等待。

因此：后台派发、通知、宿主存活是三件事。不能把“有后台 API”宣传成“headless 自动跑完整个依赖图”。这是 runtime/驱动层的责任，不需要 provider 接管。当前时间竞态、实际取消效果、非 continuable jobs 通知、跨进程恢复及 Web 行为均未新增实测。

## 不把评估附加要求误认为官方兼容契约

官方 code-review:58–78 要求两个独立评审和汇总，但没有要求两个评审子代理分别再次调用 code-review Skill；无 spec 时还明确允许跳过 Spec 子代理（:72）。这与特定 fixture 的“必须双轴、每个 reviewer 都加载 Skill”等强约束应分开表述，避免把正常 Skill 流程改成递归 review。

历史 campaign 的固定判定、2/3 通过与总体失败仍原样保留；本说明不重算、不改判、不解除激活/发布门槛。

## 本次验证

`node --test tests/scaffold.test.mjs tests/provider.test.mjs tests/provider-registry.test.mjs`：15/15 通过，无新模型活动。未重跑 Phase 5 全量审计，因为本次不修改运行时代码。

## 最小后续工作

1. 已将确认的 `/compact` 参数差异、项目 setup 前置条件与 headless 生命周期限制同步至双语 README；vendor 保持不变。
2. 只读确认 `/clear` 的实际宿主入口；保留 Web/headless 与用户命令/模型工具的区别。
3. 将上述 headless 生命周期限制作为已识别的宿主问题；如后续决定支持无人值守完整后台工作流，优先在 DSH driver/runtime 层提出小范围正常完成等待契约及无模型回归，而不是给 provider 加调度器。
4. 新真实模型冒烟测试、owner 激活、发布和指令覆盖均需另行授权。暂无证据要求增加通用指令翻译层。

## 源码定位

上述 Skill 行号相对于 v1.2.3 时代基线下的 `vendor/mattpocock-skills/skills/`：当时工程类位于 `engineering/`，implement-spec 位于 `in-progress/`。上游 v1.3 已把 implement-spec 移入 `engineering/`，并把 `in-progress/implement-spec` 从 vendor 中移除。DSH 本次检查根：`<npm 全局前缀>/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`。

- `dsh-command-compact/lib/index.js:47–97`：参数检查、compactNow 调用和人类命令注册。
- `dsh-agent-instructions/lib/index.js:16–31,525–578`：默认候选与所有现存候选收集，不是只取 AGENTS.md 丢弃 CLAUDE.md。
