# 第一阶段：TypeScript 配置与 session 归属核心

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

2026-10-06；owner 在认可分阶段实施后要求开始。新增插件源码使用现有严格 TypeScript ESM 工程；JavaScript 与声明文件是编译产物。此阶段只交付未挂载核心，现有 Skill provider、上游内容与当前 GUI/profile 保持不变。

后续第二阶段已加入未挂载业务记录，见[票/事项实施契约](<INSTRUMENT_RECORDS.md>)；本页保留第一阶段当时的范围和验证记录。

## 1. 已实现与尚未接入

已实现：全局管理总开关、逐叶默认/工作区稀疏覆盖、配置来源、修订保存、稳定 owner-session 实例、可信 parent 链、隔离读取、原子持久归属与重开恢复。

独立入口是包的 `./controls` 子路径，对应 [WorkspaceControls](<../src/controls/index.ts>)。现有 [主入口](<../src/index.ts>)不导入或挂载它。调用方显式提供存储与既有宿主授权/身份能力。

尚未实现：插件设置页与 Remote、Cordis 配置桥接、任务/票/裁决账本、T/S lease 与准入、程序事件、自动模型消费、worktree 操作、GUI、运行收敛预览。有效策略中的 `configured` 只表示配置完整，**不是已安装、已执行或已收敛**。此阶段不返回空 T/S 占用来冒充执行事实。

## 2. 一个接口、三个事实来源

| 来源 | 所负责事实 |
|---|---|
| 配置意图 | 全局默认与 WorkspaceId 覆盖；不是业务状态 |
| 宿主 authority | 现有读写权限、持久 owner/managed-child 身份、原控制 WorkspaceId 与工作区核验 |
| 持久文档 | 已提交的实例 ID、owner 归属、parent 关联和配置修订 |

公开操作：

- `readPolicy(principal)`：经宿主读授权返回冻结的已保存策略。
- `savePolicy(principal, intent, expectedRevision)`：显式替换完整稀疏意图；旧策略修订拒写，规范化相同值不推进修订。
- `ensureSession(principal, sessionId)`：从可信 lineage 注册 root 与缺失 descendants；整体一次 CAS，重复调用恢复原实例。
- `readSession(principal, sessionId)`：核验当前调用者访问、可信身份与已存归属，返回带文档/配置修订的同一实例投影；读取不创建实例。

principal/sessionId 是宿主调用携带的身份，不是模型请求体中的授权凭证。authority 是强制依赖，没有默认放行 Adapter；以后 settings/工具/Remote 必须绑定真实调用者。模型自报的 owner/instance/workspace、cwd/分支/浏览器选中项均不能产生归属。host resolver 缺失时返回机械诊断，不把未登记 child 升格为 owner。

业务更新不会取得配置修改权；本阶段根本没有业务状态写入口。authority 只复用已有权限，不创造业务审批。

## 3. 策略语义

[策略模块](<../src/controls/policy.ts>)使用封闭字段与运行时验证：

- 管理总开关默认 false。binding/lifecycle/windows/ticketProgress/pendingDecisions 功能默认 false，Skills 分发不受影响。
- 逐叶解析：workspace 明确值 → global 明确值 → 安全初值。false 被保留；恢复继承删除叶字段，空组/空工作区覆盖被规范化删除。
- windows 容量仅接受正安全整数。缺省投影为 null，表示未配置；不猜例子中的 2/3 或宿主原生 8。窗口请求开启而缺任一容量时显示 unsupported/window-capacity-unset。
- 已认可显示初值：header/rightPanel/timeline=true；inputSummary/sessionList=false。它们彼此独立，也不关闭功能、实例或自动消费。rightPanel=true 仅表示允许入口，不打开面板。
- 工作区失效不按路径/名称找替代策略。已有归属保留，workspaceVerified=false 且被请求的功能为 unsupported；未核验工作区不能创建新 owner 实例。
- 保存配置只保存意图，不表示宿主功能已经执行。实际缩容、draining、保护现有执行在后续窗口/资源模块实现。

这组字段仍是扩展核心数据，**不是已可用的 Cordis 插件配置**。现在没有两个并行配置真值：核心的持久记录是唯一被实现的读写入口；后续宿主 settings 桥接必须确定唯一来源与修订映射，不另存一份会漂移的镜像。

## 4. 持久文档与隔离

[文档模块](<../src/controls/state.ts>)的 schemaVersion=1。实例记录保存 instrumentInstanceId/ownerSessionId/controlWorkspaceId；session 关联保存 sessionId/parentSessionId/instrumentInstanceId。owner/workspace 从实例推导，不重复存储可漂移的索引。

- document revision 管全部原子提交；policy.revision 只管策略变化。登记 child 不无故使用户的配置草稿冲突。
- 一 owner 一实例；同 workspace 的独立 owners/forks 各有实例；受管嵌套 descendants 沿 root 共用实例，不按 child cwd/workflow 新开容量。
- 角色、parent 或原控制工作区冲突拒绝重绑定。坏文档、未知版本、丢 parent、跨实例 parent、循环、重复 owner/ID 均拒绝，不 reset-empty。
- 返回值深冻结并重建数据，调用者不能从种子、保存参数或读结果侧面修改已提交状态。
- 临时断线、Agent 重建及读/ensure 不更换实例。未来 fork 计划复制与跨实例交接另行实现；本阶段没有复制活跃 lease/资源/授权的入口。

文档将本阶段的配置和归属注册表放在一个 aggregate record 内原子提交；这是早期局部实现取舍，不是工作区业务总账或配额。后续 per-instance 业务账本/窗口的持久化与序列化需要单独落地，不能把此注册表当成已恢复的执行事实。

## 5. 存储契约与失败恢复

[存储模块](<../src/controls/storage.ts>)的外部 seam 是 read + atomic compareAndSwap。true 只在持久提交后返回；false 是修订不符，不写入。核心只对 CAS 冲突有界重读；真实 policy.revision 冲突不被吞掉。

两个 Adapter：

1. MemoryControlsStorage：显式非持久测试实现，绝不是存储故障时的自动 fallback。
2. createDomainControlsStorage：接受真实 DSH KvTable 的结构化接口；调用者负责 domain schema/open/close。同一 table handle 共享首次写入序列链，后续比较在 table.update 的宿主序列链内进行。该 table 的 state 行必须由此 Adapter 独占，不能让另一套 put/delete 绕过 CAS。

宿主 schema 可用 Zod transform 调用 parseControlsDocument；安装版 domain 只在 open 校验，核心也在每次读/写前独立验证。没有新增运行时依赖、机器绝对路径或 domain 自动打开行为。

限制：单 host/profile、单 open domain handle；**未提供多进程/跨 domain 事务或 exactly-once**。调用者必须遵守单一存储 ownership。lineage 验证上限 128 层，文档 CAS 争用最多 32 次后返回 concurrent-update，均是机械失败而非业务阻塞/待裁决事项。

I/O 失败可能发生在 rename 后、持久回执前。Adapter 因此锁定为 storage-uncertain，拒绝后续读写，保留原错误；宿主需关闭并用全新 domain/backend handle 重开，读取真实持久结果后再操作。不能用内存旧 revision 盲重试。重开后若策略已保存，旧 expectedRevision 必须冲突；若保存未发生，原 revision 可重试。尚无自动重开/生命周期接入；在当前单次 mount 组合中，被锁定的 domain 因此需要重启插件/宿主才能恢复（不能靠再次 open 同一 handle 清锁）。相关规模与恢复限制、实测数据以及暂缓的修复计划见 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)。

## 6. 第一阶段验证

[核心行为测试](<../tests/controls.test.mjs>)和[真实存储测试](<../tests/controls-persistence.test.mjs>)经公开接口覆盖继承/显式关/恢复继承、容量校验、并发保存、同 owner 幂等、独立 owners、嵌套归属、授权拒绝、失效工作区、坏文档与 indeterminate write。真实存储用安装版 DSH 0.2.1-alpha.1 的 DomainFacility + JsonStorageBackend，在新临时根写入，没有启动 profile/Cordis/plugin/server/model。

执行方式（宿主探针是显式选择；未设置路径时这些 integration 用例会报告 skipped，不算通过）：

```bash
pnpm exec tsc -p tsconfig.json
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/controls.test.mjs tests/controls-persistence.test.mjs
```

兼容桥（alpha.1）用例另需第二个显式根 `DSH_CONTROLS_COMPAT_HOST_ROOT`，缺失时带诊断 skip；双根说明与重建命令见[公开验证摘要](<VERIFICATION.md>)。

首次运行 27 项中 26 通过、1 个损坏索引用例失败：测试误删了合法叶节点；修正为删除被引用的 parent 后 27/27 通过。真实 ENOTDIR 注入证明该 pre-publication 失败点不发布内存/事件/磁盘更新；另有实际持久成功后故意丢回执的探针验证重开核对。不能泛化为所有 I/O 故障均回滚磁盘，亦不是全工作流或模型行为测试。

全量机械回归 68/68 通过（零跳过），包括 30 个新增测试。scratch build 零漂移，开发包精确 112 个成员且独立 controls 入口可导入；[完整验证记录（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)区分开发制品与发布门禁。[双轴独立审查（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)无阻塞项，唯一低优先级建议已整理并复核；整理后全量回归仍为 68/68。历史 release/干净树/owner profile/模型评估门禁保持原样。
