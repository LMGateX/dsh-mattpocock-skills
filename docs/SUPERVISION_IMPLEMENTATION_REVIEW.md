# 侧挂监督：只读实现评审

日期：2026-10-30
状态：最初为只读评审；2026-10-30 后续 Stage B/C/D/E 已修改源码/测试/文档（配置层、内存台账、可选手动工具、持久化 episode、事件驱动自动审计、dry-run、可选 reviewer 路由、每小时/每日/token 预算、alert 注入和只读右栏/设置页历史），真实模型试验未开始。未安装、未发布。
对象：[SUPERVISION_PLAN.md](SUPERVISION_PLAN.md) 与当前仓库实现。

## 结论

设计在技术上可行。2026-10-30 owner 已认可范围例外、配置方案 B 和可选 mattpocock_audit 工具；范围闸门已关闭。

配置层、手动入口和自动审计 backend blocker 已解决：方案 B 的独立 supervision 配置、operator-only remote、工作区设置页、内存台账、可选 mattpocock_audit、按 owner 持久化的审计 episode、事件驱动定期/嫌疑判断、dry-run、可选 inherit/explicit reviewer 路由、alert 门控、固定 agent 注入句和只读历史已实现；未启用不注册、禁用即移除，功能仍默认关闭。

剩余未完成项不是“完全没有运行时”，而是边界和验证：真实模型试验（需单独授权）、以及 reviewer 路由在真实 provider 上的 abort/超时/空正文验证。票级 suspicionMode、研究/评审标记、ticket-level 归因摘要、每小时/每日/token 预算和只读右栏 episode 列表已实现。缺 llm 或路由时自动审计 fail-closed，不静默回退。

## 1. 范围闸门（已于 2026-10-30 关闭）

- [ADAPTER_SCOPE.md](ADAPTER_SCOPE.md#L5) 明确：“停止扩展通用行为审计器”。侧挂监督虽然只观察、不建议审批门，但它仍然是通用行为审计器。
- [DESIGN.md](DESIGN.md#L12) 规定：锁定决策的变更需要 owner 明确批准，并在同一提交更新设计文档。
- 已完成：owner 认可范围例外；[DESIGN.md](DESIGN.md) 第 17 节和 [ADAPTER_SCOPE.md](ADAPTER_SCOPE.md) 例外已更新；功能仍为可选、默认关闭、不改变 Skill provider/T/S 语义。
- 本节保留为历史判断；后续实现仍受 DESIGN/IMPLEMENTATION_PLAN 的独立门禁约束。

## 2. 已经可用的接缝

| 接缝 | 现状 | 评审 |
|---|---|---|
| tools/post-execute | [src/host.ts](../src/host.ts#L1786) 已监听；能收到 PTC 嵌套 dispatch；exec.arguments 可用 | 可做台账主路径；但不要在 hook 内 await 模型 |
| agent/pre-step | [src/host.ts](../src/host.ts#L1779) 已用于注入 messages | 可做安全边界投递；但当前没有捕获 modelSelection |
| agent/status、subagent/start/end | [src/host.ts](../src/host.ts#L1811) 已监听 | 可做 owner/后代归属与停止条件 |
| 工作区策略 | [src/controls/policy.ts](../src/controls/policy.ts#L34) 已有全局默认/工作区覆盖/显式保存 | 语义可复用；schema 不够 |
| 客户端设置页 | [src/client.ts](../src/client.ts#L1208) 已注册 plugins.bundle.config / plugins.row.config | 可加监督面板；字段和远程方法要扩 |
| ctx.llm | DSH 公开 Context.llm 存在；插件当前没有注入 | 可用，但需要显式接入和失败关闭 |
| Agent.model / Agent.inject | DSH 公开 API 存在 | 可做继承路由/投递；当前 HostCaller 不携带 Agent |
| 版本化存储 | src/controls/versioned-storage.ts 已有 CAS/修订模式 | 可复用；要新增审计 episode 文档和保留策略 |

## 3. 阻塞与高风险点

### 3.1 工作区配置 schema（方案 B 配置层已实现）

- [src/controls/policy.ts](../src/controls/policy.ts#L34) 的 FEATURE_NAMES 是封闭布尔列表；parsePatch 只接受 workspace、skills、五个 feature 和 display。
- 侧挂监督需要 reviewer 路由（inherit/explicit、provider/model/effort）、间隔、K、预算、投递档、24h 摘要、research 开关等，远超现有 boolean/number 结构。
- PolicyField 是封闭 union；client 的 setPolicyLeaf/policyDraftImpact/labels、remote 的 parsePolicyIntent、测试 fixture 都依赖它。
- 已选并实现 **B：单独的 supervision 配置文档**；复用全局默认/稀疏工作区覆盖/显式保存语义，使用 operator-only remote 和工作区设置页，不扩展 PolicySnapshot wire schema。
- 不能只加一个 supervision.enabled 就把其余字段塞进 Cordis config；配置页已按工作区/全局范围编辑，功能仍关闭。

### 3.2 LLM 路由与成本口径

- 插件当前没有 ctx.llm 注入；[src/index.ts](../src/index.ts#L51) 的依赖列表也没有 llm。
- DSH 公开的 ctx.llm.stream 需要 provider/model；继承主路由需要活 Agent 的 model.current()，但 HostCaller 只有 principalId/sessionId，[src/host.ts](../src/host.ts#L1095) 不携带 Agent。
- 需要：
  - 可选获取 llm（ctx.get 或单独的 ctx.inject），缺失时监督功能不可用，但不影响现有 controls；
  - 在 pre-step 捕获并缓存 owner 的 modelSelection，或从活 Agent 读取；owner 已 dispose 时 fail closed；
  - explicit 路由用 resolveModelInfo/prepareCall 校验，不静默回退；
  - 记录 token usage（StreamChunk 有 usage），但手建调用不会自动写入 agent 会话；预算不能只依赖会话 token 账本；
  - 不要在 GenerateOptions 里冒用 owner sessionId；replay/purpose 语义没有 audit 分类，需单独验证。
- 已实现：通过 ctx.get('llm') 可选接入；inherit 读取活 owner 的 model.current()，缺失即不产生 episode；explicit 使用校验后的 provider/model/effort；不冒用 owner sessionId。
- 已实现跨 provider 的设置提示；运行时未做额外授权闸门。
- 已实现：读取 StreamChunk.usage（totalTokens 或 input+output），按 owner/日持久化；每日 token 预算与每小时调用预算在触发前检查。单次调用仍可能越过剩余 headroom 一次，之后不再触发。
- 还有一个隐私问题：explicit 到不同 provider 会把代码路径/摘要发给另一个模型提供方；工作区页面需要明确提示，不能静默跨 provider。

### 3.3 手动审计入口（已实现内存版）

- 当前插件只注册 Skill provider 和可选 controls tools；没有 command service，也没有 /audit 入口。
- [src/index.ts](../src/index.ts#L36) 没有 command 注册，host 只注册 tools。
- 已实现：可选的 mattpocock_audit 模型只读工具，配置请求时注册、禁用时移除；不新增 /audit slash 命令；客户端按钮后置。
- 台账是内存版（每 owner 最多 2000 条事件），不写 storage、不持久化、重启即失；工具仅 owner session 可用，会增加模型可见面，已测试未启用时不存在、禁用即移除。审计 episode 另按 owner 持久化，工具返回最近 20 条。

### 3.4 调度、并发、持久化

- 自动审计在 tool boundary 触发，不阻塞原生结果；使用每 owner next-check 门和 AbortSignal，缺 llm/路由时 fail-closed。没有独立 timer，因此“定期”依赖有活动的事件；无新活动不触发。
- episode 按 owner 持久化并执行 30 天/2000 条保留；内存台账仍会在重启后丢失，冷启动以 unknown 为边界，不假装连续。
- episode 每次审计才写一次，不随每个工具事件写；仍保留状态文档的 CAS 冲突丢弃和容量上限。
- 未完成：每 owner 单飞锁的显式测试、真实 provider 的 abort/超时矩阵；token usage 记账已实现但未在真实 provider 上验证。

### 3.5 包与测试爆炸半径

- 固定包清单 [scripts/verify-package.mjs](../scripts/verify-package.mjs#L259) 当前是 93 个固定文件 + 85 个 vendor 文件（74 个 JS/DTS 产物）；新增 lib 文件/类型/客户端面板必须同步 allowlist、精确计数和构建产物。
- 增加 FEATURE_NAMES/PolicyField 会改动 policy 测试、client 测试、remote 契约、host fixture 和快照。
- 需要新增测试：策略解析/迁移、client 设置、LLM stub 的 abort/超时/空正文/错误、假时钟调度、PTC 嵌套写分类、research off、alert 门槛、成本预算、恢复会话、无 session 污染。
- 任何真实模型调用仍按仓库规则单独授权，不能混进机械测试。

## 4. 建议的实施阶段

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A | scope amendment + DESIGN/ADAPTER_SCOPE 更新（已完成） | owner 明确批准；文档已更新；不改运行时 |
| B | 独立 supervision 配置文档 + 工作区设置页（已实现，功能仍关闭） | 解析/继承/保存/修订/客户端测试；不扩 PolicySnapshot |
| C | 内存台账 + 可选 mattpocock_audit 工具（已实现） | PTC 嵌套、路径分类、无写放大、失败隔离、未启用不注册 |
| D | 持久化 episode + 定期审计 dry-run（已实现；固定时间核心测试，非真实 clock 注入） | 到点/无活动/每小时/每日/token 预算/恢复；dry-run 不投递 |
| E | 嫌疑 + alert 门槛 + 固定模板投递（后端已实现；票级/工作区 off；研究/评审标记；ticket-level 归因） | 去重/冷却/agent 注入不打断；未归因写入显式保留 |
| F | 可选真实模型 reviewer（代码已实现） | 单独授权、独立评估记录；真实 provider 未运行 |

## 5. 还需定的实现细节

1. inherit 路由已接活 owner 的 model.current()，缺失/不活跃 fail-closed；仍需真实 provider 验证。
2. 跨 provider 的设置提示已接入；运行时不新增单独授权闸门。
3. 持久化审计 episode 的恢复、清理和容量已实现（30 天/2000 条）；仍缺显式单飞锁和真实重启矩阵。
4. 客户端只读历史已接入设置页和右侧协作面板；票级 suspicionMode、研究/评审标记与 ticket-level 归因摘要已实现；真实模型试验仍未完成。

## 6. 原始评审边界与后续

- 原始评审轮次未改 src、tests、package.json、cordis.patch.yml 或构建产物；后续 Stage B 已实现配置层并更新测试/构建产物。
- 未安装、未调用真实模型、未改当前 Profile/GUI。
- 未把任何私有回放数据写入公开文档。
