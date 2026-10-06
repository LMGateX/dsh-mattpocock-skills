# 公开安全的源码与开发交付验证摘要

本页记录合成数据、隔离 SDK/存储和公开接口上的机械验证，不公开原始用户/会话或本机环境记录。源码修复不等于部署、发布或绝对无缺陷保证。

## 发布版本与上游来源

插件发布版本为 `0.4.0`；上游来源仍钉住分发版本 `v0.3.0` / Skills `v1.3.1`。插件版本、Skills 分发版本和 DSH 宿主版本相互独立，不移动既有插件 `v0.3.0` 标签。本次发布包含下述协作实现与修复；公开 Release 资产仅包含经过 verifier 检查的发行包、制品身份与脱敏验证摘要，不上传本地原始日志或开发收据。

## 当前复审收尾

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
