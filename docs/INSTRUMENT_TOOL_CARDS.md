# 仪器工具卡：原生折叠与可读输出

> **Status:** 所有者已认可设计；2026-11-01 源码、测试、客户端构建、clean-source 包验证与 [v0.6.0 GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.6.0) 完成。**未安装到本机 DSH/Profile**，未做真实 GUI 验收。本页固定设计与实施计划；当前机械结果见 [CLIENT_INTEGRATION.md](<CLIENT_INTEGRATION.md>)，制品与发布结果见 [VERIFICATION.md](<VERIFICATION.md>)。

## 1. 目标与范围

当前九个固定工具（另含条件注册的 `mattpocock_audit`，共十个）注册了 `tool.call.toolview`，但 [SourceCard](../src/client.ts#L1519-L1525) 没有使用原生行外壳，也没有折叠：它把 `sourceRecord` 一次性 JSON 序列化到 `<pre>`，一个 `mattpocock_record` read 就能占满时间线。目标是：

- 默认折叠为一行短卡，保留“前面/后面的工具调用”可读性；
- 展开时显示清晰的输入、输出、错误和原始记录；
- 使用 DSH 为插件提供的公开 baseline 组件，不复制私有 `ToolRow` CSS；
- 不改变 Host 的模型可见输出、工具键、source card 公开字段和 timeline/rightPanel 门控语义。

## 2. 现状证据

1. [SourceCard](../src/client.ts#L1519-L1525) 只渲染 `<strong>{toolName}</strong>` + `pretty(sourceRecord(props))`，没有 `useDisclosure`、没有折叠、没有展开体上限。
2. [pretty](../src/client.ts#L399) 对结果做 `JSON.stringify(value, null, 2)`；Host 已在 [src/host.ts](../src/host.ts#L1762) 把工具结果压成一行 `JSON.stringify(value)` 文本块。二次序列化后，内部引号仍是 `\"`，换行仍是 `\n` 字面量，浏览器看到的是整面转义文本。
3. 原生工具行的契约已把 `useDisclosure` 交给每个视图（`@deepseek-ai/dsh-client-ui-tool` 的 `ToolCallViewProps`）。原生 `ToolRow` 只在 `open` 时格式化 `bodyRaw`，输入/输出区有高度上限；当前视图没有使用这些机制。
4. [CLIENT_INTEGRATION.md](<CLIENT_INTEGRATION.md#L54>) 要求 source card 区分 preparing/start/result、保留公开的 `argsRaw/content/error`，并规定 timeline 注释关闭时仍保留实际 Tool 记录；[同页](<CLIENT_INTEGRATION.md#L67>) 要求工具卡只约束自身宽度和换行，不接管原生布局。
5. 现有测试直接调用 [SourceCard](../tests/client.test.mjs#L251-L261) 并断言原始文本存在；[DOM 门禁用例](../tests/client-settings-dom.test.mjs#L717-L744) 也依赖折叠时正文仍在 DOM 中。改造必须同步更新这些测试，不能保留旧断言。

## 3. 已认可方案

采用 **B：DSH 公开 baseline 组合**。

- 行外壳：`@deepseek-ai/dsh-client-ui-primitives` 的 `DisclosureRow`；图标用 `IconSparkleRegular`。
- 展开体：输入/输出用 `CodeBlock`（原生语法高亮、自动换行、复制），原始记录用 `JsonBlock`（原生折叠、pretty print、截断）；动作按钮用 `Button`。
- 不导入私有 `ToolRow`，不复制它的 CSS；业务视图只组合公开 baseline 组件，并用自己的内容布局。
- 不改变 Host `output.render`。模型仍接收紧凑的一行 JSON；UI 只在用户展开时本地解析/排版。

### 为什么不选其他方案

| 方案 | 结论 |
|---|---|
| A：自建轻量行、仿原生 | 只是低依赖临时回退；复制私有视觉规格，宿主升级后易漂移。 |
| C：取消 toolview 注册，走 GenericToolCard | 会丢失 source card 注释、“打开当前实例”和本插件工具卡语义；与已接受文档冲突。 |
| D：上游暴露 `ToolRow`/行装饰槽 | 长期最理想的上游形态，但当前 DSH 没有该公开能力；不阻塞本轮。 |

## 4. 详细 UI 契约

### 4.1 行与状态

- 标题：完整英文 wire 名称，例如 `mattpocock_record`；不做中文标题映射。
- 默认折叠。只有 preparing 不可展开；start/result 可展开。
- `DisclosureRow` 参数：`icon=IconSparkleRegular`、`title=toolName`、`running=preparing|running`、`open`、`expandable`、`expandOnRowClick`、`keepContentWhenOpen`、`onToggle=props.useDisclosure().toggle`。
- `useDisclosure` 是外层 Turn 绑定的 Hook；Turn 折叠时展开状态复位，不复用自定义 state。
- preparing：标题 + 原生 shimmer，无摘要/正文。
- start：标题 + 摘要 + `running`；展开体暂时只有输入和“运行中，尚无输出”。
- result：成功不额外显示“成功”；`isError` 为失败，`error.code === 'interrupted'` 为“已停止”；错误/停止摘要使用原生错误/警告色。

### 4.2 摘要

摘要保留 wire 英文 action/target 值，不造中文动作词。先解包 `argsRaw.request`（没有则取外层）；`record apply` 用 `command.action`，其余用 `request.action`；没有 action 时按工具回退（execute/assign/delegate 等）。

按顺序收集并去重：`nativeTool`、`sessionId`、`workflowId/localTicketId` 或 `workflowId/decisionId`、`resourceId`、`bindingId`、`observationId`、`state`、`domain`、`query.kind`、`recordId`、history 条数、ticket 条数、`description` 首行、`provider`、`rev N`、`gen N`、include/exclude。每项和整条摘要都截断；行内 CSS 再省略。

示例：

| 调用 | 折叠摘要 |
|---|---|
| `mattpocock_record` `{action:"read"}` | `read` |
| `mattpocock_record` apply `put-ticket` | `put-ticket · W/T · rev 7` |
| `mattpocock_window` reserve | `reserve · W/T` |
| `mattpocock_history` query kind=ticket | `query · ticket` |
| `mattpocock_delegate` | `delegate · <description> · spawn` |
| `mattpocock_execute` nativeTool=subagent | `execute · subagent · W/T` |
| 失败 | `read · failed: <reason>`（错误色） |
| interrupted | `read · interrupted`（警告色） |

固定区块标签（输入/输出/错误/原始记录/来源记录）沿用插件现有中文；标题和 action/target 保留英文。

### 4.3 展开体

- 只在 `open && expandable` 时挂载；默认折叠不解析结果、不 stringify 原始记录、不渲染 CodeBlock。
- 外层 `maxHeight: 360px; overflowY: auto`；正文内容不横向溢出。
- 输入：完整 wire 形状的 `argsRaw`（保留外层 `request`），pretty JSON 后交给 `CodeBlock`；解析失败时显示原文并提示参数可能仍在准备中。
- 输出：逐个 content text 块解析一次；对象/数组/数字/布尔/null 交给 `CodeBlock`；字符串/非 JSON 用 `<pre>` 保留真实换行；多块拼接并注明非文本块。
- 错误：在输出之前或之后显示 `error.name/code/reason` 的纯文本块，错误色；完整对象仍在原始记录。
- 原始记录：`JsonBlock` 标签“原始记录（JSON）”，`defaultOpen=false`，payload 为 `sourceRecord(props)`；只有用户点开时才序列化。
- 动作：原生 `Button` 放在展开体尾部；只在 `timeline && rightPanel` 时显示“打开当前实例”。注释只在 `timeline` 时显示。
- **不使用** 0.2.2 才有的 `DisclosureRow.headerAccessory`：本仓库仍支持 0.2.1-alpha.1；动作放展开体可同时兼容两版。等最低宿主版本提升到 0.2.2 后，再迁移到 `headerAccessory`。
- preparing 不显示展开体；start 显示“运行中，尚无输出”。

### 4.4 数据、未知与保真

- 只读公开 `argsRaw/content/error/meta`；不读取惰性 `args` reader。
- 显示用解析不改变会话事实；原始记录保留原始字段。
- `content: []` 是“无输出”；空字符串是“空文本”；`call: null` 是“输入未知（调用头不在当前窗口）”；`isError` 但无 error 对象是“错误详情不可用”。不把未知伪造成空或 0。
- 不修改 Host `output.render`，不改变模型上下文或 token 成本。

### 4.5 性能与无障碍

- 折叠态只解析很小的 `argsRaw` 生成摘要；结果解析和原始记录序列化都只在展开/二次展开时发生。
- 显示解析设 200,000 字符上限；超限回退纯文本 `<pre>`，仍可滚动，不阻塞 UI。原始记录由 `JsonBlock` 自带截断。
- `DisclosureRow` 提供 24px 行、键盘/aria 展开语义和 shimmer；主行不要自建 `div` 伪按钮。
- 错误/停止不能只靠颜色：摘要包含 failed/interrupted 文本。
- 固定中文标签和英文 wire 值混排；不新造权限或审批文案。

## 5. 兼容性

- `@deepseek-ai/dsh-client-ui-primitives` 是 DSH 隐式 baseline，已在 [build-client.mjs](../scripts/build-client.mjs#L6-L10) 的 `BASELINE_EXTERNALS` 中，且 [CLIENT_INTEGRATION.md](<CLIENT_INTEGRATION.md#L28>) 将 ui-primitives 列为 implicit baseline；不要写进 `dsh.client.external`。
- 核对版本：`0.2.1-alpha.1` 与 `0.2.2-alpha.2` 都导出 `DisclosureRow`、`CodeBlock`、`JsonBlock`、`Button`、`IconSparkleRegular`；`headerAccessory` 只在 0.2.2 出现。本设计不使用它。支持的宿主范围仍为 `~0.2.1-alpha.1`（[HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md#L5-L11>)）。
- 客户端 bundle 的 external 将从 `react` 变为 `react + @deepseek-ai/dsh-client-ui-primitives`；测试与文档必须同步，不能继续声称“React 唯一 external”。

## 6. 实施计划

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 固定设计与依赖 | 本页、DESIGN、IMPLEMENTATION_PLAN；在 `package.json` 增加 devDependency `@deepseek-ai/dsh-client-ui-primitives@0.2.1-alpha.1`，避免无关排序改动；更新 lockfile | lockfile/package policy；baseline 列表已含 primitives |
| B SourceCard | 引入 `DisclosureRow/CodeBlock/JsonBlock/Button/IconSparkleRegular`；新增 `sourceView/sourceAction/sourceTarget` 与 payload 格式化纯函数；保留 `sourceRecord`；`SourceBody` 显式接收 `openDetails`（来自 SummaryFace，不塞进 ToolCallViewProps） | `tsc -p tsconfig.client.json --noEmit`；build --check |
| C 测试 | 共享 primitives mock fixture；更新 client.test / client-startup / client-summary-scheduler / client-settings-dom / client-native-activation；补默认折叠、展开、error/stopped、未知/空、timeline/rightPanel 门控、externals | 目标测试 0 失败；无 React warning |
| D 文档与制品 | 实施后更新 CLIENT_INTEGRATION 的运行时依赖、source card、宽度/换行、测试边界；HOST_COMPATIBILITY 补 baseline primitive 与 headerAccessory 边界；VERIFICATION 追加新记录（不改历史“React only”测量）；重建 `lib/client.js` / `lib/types/client.d.ts` | 构建、包清单、source/lib 一致性门禁 |
| E 验证 | 定向测试、完整根套件、客户端构建、手工 GUI 检查 | 不把 Happy DOM/内存 bundle 当作图形验收或安装证明 |

### 实施注意

- `SourceCard` 的 props 是 `ToolCallViewProps & SummaryFace`；`openDetails` 来自 `SummaryFace`。`sourceBody` 的参数显式带 `openDetails`，避免在 `ToolCallViewProps` 上访问不存在的字段。
- `pnpm add` 会重排 `package.json` 的 devDependencies；实施时手动插入单个依赖并只让 pnpm 更新 lockfile，保持无关顺序零 diff。
- 共享 mock 只验证公开 prop 契约和插件集成；原生视觉由 DSH 上游负责，需真实 GUI 手工确认。
- 构建产物的 baseline 模块由宿主 Web frontend 提供；若宿主不提供该 baseline，插件激活失败，因此必须保持已核验的宿主版本范围。

## 7. 验证命令与验收

实施后命令：

```sh
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --check
node --test tests/client.test.mjs tests/client-settings-dom.test.mjs tests/client-startup.test.mjs tests/client-summary-scheduler.test.mjs
node --test tests/*.test.mjs
node scripts/build-client.mjs --out lib/client.js --declaration
```

验收清单：

- [x] 默认折叠为一行；标题为英文 wire 名；摘要为英文 action/target；错误/停止在折叠态可见。
- [x] 点击展开（键盘由原生 `DisclosureRow` 提供）；展开体样式上限 360px；内容不横向溢出。
- [x] 输入/输出 JSON 有真实换行/缩进；非 JSON 保留原文；空/未知/错误分别表达。
- [x] 原始记录可二级展开；timeline 关闭时注释消失但记录仍在；rightPanel 关闭时动作消失。
- [x] 不注册其他工具 key；不修改 Host 输出；bundle external 与文档一致。
- [ ] 包清单与真实 GUI 验收在安装/刷新制品后单独记录（本轮不安装本机 DSH）。

## 8. 非目标与风险

- 非目标：不改 Host `output.render`，不改 source card 公开字段，不增加审批/权限，不把原始记录删掉，不引入私有 `ToolRow` 导入。
- 风险：baseline primitive 在旧宿主缺失会导致加载失败（由已核验宿主范围约束）；`CodeBlock` 的 shiki 成本在超大 payload 上需回退；长英文 wire 标题在窄侧栏可能挤压摘要（由 ellipsis/title 处理）；原生视觉不能在 Happy DOM 中验收。
- 未决/后续：最低宿主版本提升到 0.2.2 后，可将“打开当前实例”迁移到 `DisclosureRow.headerAccessory`；这是兼容性演进，不是本轮前置条件。

## 9. 实施记录（2026-11-01）

- `src/client.ts`：引入 baseline `DisclosureRow/CodeBlock/JsonBlock/Button/IconSparkleRegular`；新增纯函数 `sourceView/sourceAction/sourceTarget` 与 payload 解码；`SourceCard` 默认折叠、展开体 360px、原始记录二级折叠；`sourceRecord` 字段不变；`openDetails` 作为显式回调传入正文。
- 测试：新增 `tests/fixtures/client-primitives.mjs`，更新五个客户端测试宿主；定向套件 **122 项：116 通过、0 失败、6 skip**。skip 是原生 activation/loader 缺少宿主的 `@deepseek-ai/dsh-client-ui-slots` fixture，不是插件加载失败。DOM 测试覆盖折叠/展开、JSON/纯文本/空/未知、原始记录和 timeline/rightPanel 门控。
- 构建：`pnpm exec tsc -p tsconfig.client.json --noEmit` 和 `node scripts/build-client.mjs --check` 通过；内存 bundle **275,623 bytes**、8 个私有模块、external 为 React + ui-primitives；已重建 `lib/client.js` 与 `lib/types/client.d.ts`。
- 边界：未改 Host `output.render`、模型上下文、工具键、原始字段或 timeline/rightPanel 语义；未安装本机 DSH/Profile，未做图形浏览器验收。
- 制品：clean-source `lmgatex-dsh-mattpocock-skills-0.6.0.tgz` **463,605 bytes**、sha256 `96875746fb75584a4005d4604b577b6fc4460b0c53e18718360300a19eafe1ff`、178 成员；prepack 与精确 tarball 验证通过；规范宿主全量 **967 项：764 通过、0 失败、203 skip**。发布结果：[v0.6.0 GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.6.0)（tag `v0.6.0`）。
