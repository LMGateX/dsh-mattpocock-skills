# 公开安全的源码与开发交付验证摘要

本页记录合成数据、隔离 SDK/存储和公开接口上的机械验证，不公开原始用户/会话或本机环境记录。源码修复不等于部署、发布或绝对无缺陷保证。

## 发布版本与上游来源

插件发布版本为 `0.4.1`；上游来源仍钉住分发版本 `v0.3.0` / Skills `v1.3.1`。插件版本、Skills 分发版本和 DSH 宿主版本相互独立，不移动既有标签。公开 Release 资产仅包含经过 verifier 检查的发行包、制品身份与脱敏验证摘要，不上传本地原始日志或开发收据。

## 未发布的配置页与输入摘要修复（基于 0.4.1）

此节记录开发工作区结果，不把现有 0.4.1 Release 或本机安装包冒称含有这些改动。版本与安装必须由后续发行流程分别确认。

- 已通过公开 StartupSupport 接口、内存存储与三个不同的夹具启动标识复现保存启用后仍不生效的状态（不是三次实际 DSH 重启）：请求已读取，但 SDK 原生能力为 false、兼容准备未完成。普通重启不能安装能力；此轮不修改运行中的 SDK。
- Client 直接翻译宿主权威启动状态，准备状态独立展示，修复官方原生支持已为 true 却仍被提示必须准备的显示缺陷。未知观测不变成禁用或成功。
- 配置页明确子代理创建时指定工作树的范围，分离当前运行／下次请求／协作管理／会话查看；固定字段、来源和限制中文化，原始诊断折叠保留。协作按钮按更改显示保存并启用／关闭／应用，启动请求另行保存，分别使用各自 CAS。
- 输入区摘要通过已核对的 composer 宽度变量及回退值居中；详情／工具卡增加自身宽度与换行约束，紧凑标题入口限制宽度。没有替换原生 composer、改变生命周期、增加裁决或清理准入门槛。
- 新增 **15 项真实 React/ReactDOM + Happy DOM 回归**，通过实际 DOM 点击／输入／选择验证上述状态和保存边界，并检查挂载／更新／卸载无 React 警告。发现并修复会话查看与详情页的重复兄弟 key，保留会话限定和角色限定身份。Happy DOM 样式契约不是真实浏览器像素或宽／窄屏视觉验收。
- 完整根测试 **534/534** 通过，0 failed、0 cancelled、0 skipped；其中含 15 项 DOM 与 6 项真实原生 Client 激活回归。Host／Client 严格构建通过，Client 159587 bytes、6 个浏览器安全模块、唯一 external 为 React；vendor 锁定内容不变。

原始本机测试日志不进入公开仓库。本节不声称当前 GUI 已更新、SDK 已准备、完整 Web Profile 已验收、已发布或已安装这些新源码。

## 0.4.1 原生 Client 激活修复

`0.4.0` 的 Client 自行 `$mount` 后，在没有声明 `remote.mattpocockControls` 服务依赖的调用 Context 中读取该命名空间。真实 Cordis 插件 Fiber 因 `cannot get property "remote.mattpocockControls" without inject` 失败；浏览器启动审计随后拒绝该 entry。旧普通对象／根 Context 测试绕过了这层检查，模块可导入与原有 510 项机械测试通过不能解释为真实 Web 启动已验收。

修复保持 bootstrap 挂载 RPC，然后等待声明命名空间依赖的子 Context，再在该生命周期内创建观察器、注册界面和安排清理。不能把自己的尚未创建命名空间直接加到 bootstrap 依赖中，否则 bootstrap 不能开始。子 Context 初始化错误仍向上传播，不吞掉失败冒称 active。

新增 6 项测试使用实际参考 SDK 的 Context、TypertRegistry、Client Remote、SlotRegistry、浏览器 lazy module factory、ClientModuleSystem 与 Loader：原生 Fiber 激活、七类界面／九项工具登记、卸载与重挂载、子作用域错误、浏览器 entry 的 ACTIVE/FAILED 显式审计，以及原生 graph 移除／重新加入。测试以单插件 graph 和已经提供的原生 RPC/Slot 服务为聚焦范围，连接、sidebar 状态和 tab 注册由夹具控制；不执行 DOM/React 挂载，不启动服务器或调用模型，不冒称完整 Web Profile、当前 GUI 或模型行为 campaign 通过。

旧发行包在同一原生 Fiber／浏览器 Loader gate 中为 RED，修复 bundle 为 GREEN。原始失败堆栈及执行记录保留在仓库外；公开仓库只保留合成回归。修复版完整根测试为 **516/516**，原生 Client 激活／生命周期为 **6/6**，原生 managed cwd 为 **10/10**，均无失败、取消或跳过；Host/Client 严格构建通过。清洁源码／精确发行包结果随 Release 的脱敏验证摘要记录。

## 0.4.0 源码阶段收尾（历史范围）

四项验收及公开数据边界见[复审契约](<REVIEW_CLOSEOUT.md>)。原有四项缺陷已修复；独立复审发现的窗口/工作树迟到取消覆盖已确认 CAS 回执，以及窗口 checkpoint/purge 分阶段取消的同类缺口也已关闭。已完成下列机械验证，不把历史阶段结果冒称当前验收，也不承诺绝对没有其他缺陷。

| 验证 | 本轮观察结果 |
| --- | --- |
| Host / Client 严格构建与声明 | 通过；预构建 JS/DTS 共 56 个，Client 仅 React 运行时 external |
| 完整根测试（显式提供参考 SDK） | 510/510 passed，0 failed、0 cancelled、0 skipped |
| 真实原生 managed cwd 隔离验证 | 10/10 passed，0 failed、0 skipped、0 model calls |
| Standards 独立复审 | 0 open documented-standard violations、0 meaningful smell findings；独立定向 79/79 passed |
| Spec 独立复审 | 0 open concrete findings；独立定向 53/53 passed |
| Vendor / 通道 / 优先级 | 未改变；85 文件、279662 bytes，stable/beta 各 27 Skills |
| 公开材料筛查 | 只暂存公开安全源码/合成测试/同版构建/脱敏文档；raw research、日志和旧收据不入 Git 或包 |

清洁提交上的正式 prepack/tarball gate、单次构建包的源码 commit/pnpm/size/SHA256 身份及解包后的实际 CLI/manager 隔离检查，随仓库外开发交付记录保存；本页不嵌入操作者本机路径、原始日志或用户记录。正式 verifier 不绕过 clean-source gate，包仍为开发交付，不等于发布授权。

有效输入验收覆盖 13 项场景：准备后拒绝重试、实际原生 append 去重、工具附加上下文同批去重、拒绝工具批次后重试、相同 ID 改写正文、相同 ID/正文改写 source、Agent/Session 替换、成功取得但 degraded 的未知状态重装、缺失/失败可见性保守重装、子任务归属改变与隐私、原生消息投影改变正文、迟到取消、compaction 保留历史事件但移除当前 surface。测试使用真实公共 Session 与 Cordis/Host/ToolRuntime，Agent 元数据可由夹具控制；不宣称跑完整 AgentLoop 调度、模型调用或 live GUI。

## Historical evidence

此前不同阶段的测试数量、宿主版本与失败/通过结论是历史观察，不保证当前代码或其他机器的行为。原始研究脚本、含本机路径的日志/receipt、raw provenance 和历史 tarball 在本地保留，不随公开源码发布；这里不提供原始用户/环境材料，也不声称 Git 含完整历史制品字节。

公开可复查入口为仓库中的合成数据测试、严格 compiler/build 配置、固定官方 SDK 补丁 recipe/manifest、vendor lock/inventory 及精确包 verifier。某些 native fixtures 需要操作者显式提供 SDK 根；没有提供时应明确 skipped，不计为原生集成通过。不要运行旧本地 probe 或把历史临时目录作为公共命令前提。

历史 Phase 5 模型行为 campaign 仍为关闭且未通过，原始评估数据不在本公开仓库。此源码收尾不重开 campaign，也不把机械测试冒称模型已遵守协议。

## 可移植验证命令

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -p tsconfig.json
chmod 755 lib/compatibility/cli.js
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --out lib/client.js --declaration
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/*.test.mjs
DSH_CONTROLS_HOST_ROOT=/absolute/sdk DSH_CWD_IMPLEMENTATION=managed node --test tests/host-cwd.test.mjs
node scripts/verify-vendor.mjs
# Only from clean committed source; does not publish or install:
node scripts/verify-package.mjs --prepack
```

将 `/absolute/sdk` 替换为操作者已核验的实际 SDK 绝对目录。原生 cwd/管理器 probe 只准备隔离副本，不修改所提供的参考安装。最终 tarball 单次构建后保存只读 size/SHA256/source commit/pnpm identity，并用现有 verifier 精确核对；外部制品记录与本页摘要范围不同。
