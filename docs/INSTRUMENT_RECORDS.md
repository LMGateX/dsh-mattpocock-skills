# 第二阶段：自定义票进度与持久待裁决记录

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

2026-10-06。历史第二阶段接续已完成的第一阶段；新增代码仍为 TypeScript，沿用严格 ESM 编译。第一阶段[配置/归属核心](<CONTROLS_CORE.md>)保持原 interface，第二阶段在独立逐实例存储中加入业务记录。

## 1. 已实现范围

[SessionInstruments](<../src/controls/instruments.ts>)提供 read/apply 两个操作，通过既有包的 controls 子路径导出。没有挂载 Cordis、注册模型工具或 Remote、开启 GUI/profile，没有执行准入、T/S lease、S 程序释放、worktree 操作、模型状态注入或真实模型试验。业务标签不会修改配置或执行状态；没有 blocker/失败/超时自动升级、审批证据包或业务完成裁判。

记录具有工作流分组、任务自定义状态字典、票报告、决策事项、真实作者、声明引用、历史与个人显示元数据。主入口仍只分发未改写的 Skills。后续 tools/GUI/消费路径必须接入此后端，不另建计数或聊天解析真值。

## 2. 业务声明接口

所有 command 包含 operationId、expectedRevision、workflowId、action/value；references 可选。作者、实例、配置、权限与租约不是输入字段，未知字段明确拒绝。

- put-workflow：title 与 axes；每轴自行声明 axisKey/label、exclusive 或 overlapping 统计口径、statusKey/label/可选 meaning/summaryPriority。没有预设阶段、固定摘要桶或强制主状态。空字典可用于票尚未出现的任务。
- put-ticket：workflowId＋localTicketId；title、按轴明确给出的 statuses；可选 externalRef/summary/disposition。状态与处置原文保存；无默认完成分类/百分比。相同外部票号可在不同实例/工作流出现，不合并写权限或计数。
- put-decision：decisionId、question、自由 status；可选 pending/awaitingImplementation、关联票、背景、选项、建议、影响、拟裁决者和结果。简单事项不需填审批表。何时提出、解决、撤回或 reopen 由模型/用户按任务决定，无内置转换流程。
- set-decision-view：实际调用者自己的 read/hidden；不能选别人的 viewer 或直接修改决策业务状态。

workflow 定义完整替换；在用 axis/status 删除或将重叠轴改为无法容纳现有选择的互斥轴，必须先迁移票的结构引用。历史保存旧定义，不以当前字典重新解释过去报告。这是引用完整性检查，不是业务语义判断。

票与决策的必填核心字段明确更新；可选字段省略时保留已有值。初次缺省 attention 是无登记，不猜待裁决。false/null/空数组可明确清除适用字段；只改问题或自由 status 不因省略 pending 就解决旧事项。已有事项的裁决者/关联票/结果也不会被省略意外抹掉。

## 3. 来源与权限

read/apply 先调用 WorkspaceControls.readSession 核验真实 session 与持久实例，再请求必须注入的 InstrumentAuthority。宿主提供实际 agent/user 作者及 coordinator 或 assigned(workflowId,ticketIds) 范围；没有默认放行或模型自报权限。principals 是宿主全局唯一、区分用户与代理身份域的认证 ID，不是显示名称。user 作者没有 agent sessionId；agent 作者必须匹配实际调用 session。

- coordinator 是既有授权角色，可维护整个实例；child 不自动得到它，委托必须由宿主映射。
- assigned 只写指定 workflow 的指定票，不改整任务字典；相关事项的修改前、修改后全部关联票均须在授权集合中，不能用任一命中或改关联洗权限。
- 无票事项可以由受管 child 提出，但 assigned 对 workflow 级无票事项只获其本人创建记录的访问，不自动获得所有全局事项。
- 读取的票、事项、历史和 change feed 同样限域；旧 history 中属于其他 assignment 的内容不因当前关联调整而泄露。
- 持久实际作者由 host access 提供。agent 引述/理解用户答复仍归 agent；真正用户入口才归 user。references 是声明引用，不认证其内容、伪造聊天锚点或把业务记录包装成插件证明。

## 4. 逐实例修订、去重与记录

[事件文档](<../src/controls/instrument-state.ts>)使用独立 schemaVersion=1，绑定 instrumentInstanceId/ownerSessionId/controlWorkspaceId。每实例一个不可变事件序列，一次 CAS 同时提交 command、actual author、recordedAt、operationId 和 revision；没有不同实例的合计业务修订或配额。

三种修订：

1. revision：逐实例持久事件水位/存储 CAS；所有事件都推进。
2. businessRevision：只有 workflow/ticket/decision 明确业务更新推进；它是业务 command 的 expectedRevision。
3. viewerRevision：每实际 principal 的个人显示修改独立推进；它是 set-decision-view 的 expectedRevision。已读/隐藏不使业务草稿无故冲突，也不影响别人的显示修订。

operationId 在实例内绑定真实作者与规范化 command。先重验当前授权，再核对重复提交，最后校验新写入的目标修订。完全相同重试不新写，返回原 appliedRevision＋replayed=true 和当前授权快照；同 ID 异作者/载荷返回 operation-conflict。不能把旧回执冒充当前快照；撤权后也不能借重复 ID 读取旧授权数据。

重放只读取持久事件，自带当时字典与作者，不依赖当前权限、时钟或模型分类。序号缺口、非法引用、重复 ID、未知版本、实例/row 身份冲突均拒绝，不 reset-empty。事件日志目前无压缩/归档/删除入口；扩展高容量存储前需测量 replay 开销和设计保留机制，不以删除旧事件清除义务。

## 5. 投影、关闭与后续消费

- 统计按 workflow＋axis＋statusKey 展示，互斥和重叠口径可见；重叠项不能相加冒充票总数，部分完成保留。无状态报告另计 unreported。
- summary 标明 instance 或 assignment 口径。workflow focus 仅过滤票/字典详情；授权范围内的 pending/awaitingImplementation 事项、总数和状态统计仍完整，防新任务筛选让旧义务消失。
- pendingUserDecisionCount 来自明确 pending 且 addressee.kind=user 的声明；pendingForPrincipalCount 仅匹配明确受理 principal，不把未知对象猜成“待你”。
- hidden/read 不抹 pending，不改业务历史。实际 viewer 的显示元数据不暴露给其他 viewer。
- 新建记录需对应功能配置完整并开启；feature-disabled 是工具能力事实，不阻止业务任务或生成裁决。功能关闭后已存事实仍可读取、按原约定显式更新收尾，不能新增对应仪器对象；显示关闭本身不影响记录。
- changes(afterRevision) 是同次持久事件水位的授权投影，供后续消费实现使用，不是已经投递/确认的 outbox。读取不唤醒模型、自动已读或制造通知循环；无 exactly-once 声明。真正父代理自动消费仍待下一阶段。

## 6. 存储与验证边界

[共享版本化存储](<../src/controls/versioned-storage.ts>)复用第一阶段验证过的 durable CAS，配置 Adapter interface 未改变；[业务存储](<../src/controls/instrument-storage.ts>)按实际实例 ID 分行、检查读写身份。Memory 是显式非持久测试实现，没有失败 fallback。

宿主 Adapter 要求一个实际 table handle，置于独占的单表 domain/unit；新业务域与第一阶段归属/配置域使用不同介质文件。一个写结果不确定会锁整张业务表所有实例，包括排队写入与新 wrapper，须关闭并重开核对。共享文件的其他 table 不能绕过 latch 写旧后端图像；这种布局不受支持。没有跨域或多进程事务保证。

[行为测试](<../tests/instruments.test.mjs>)、[逐实例存储测试](<../tests/instrument-storage.test.mjs>)和[实际 JSON/独立进程测试](<../tests/instruments-persistence.test.mjs>)覆盖自定义状态、来源、权限前后集合、历史限域、独立修订、幂等、关闭、重开、真实写失败和丢回执。开发包新增四个 TypeScript 模块，共 24 个 runtime JS/declaration；精确制品清单为 120 项（35 固定＋85 vendor），源/测试/研究不随包加入。

最终完整机械回归 104/104，通过且零跳过；[验收记录（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)和[双轴审查（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>)保留过程、边缘缺陷与修复结果。局部模块通过不代表完整协作流程、GUI 或真实模型验证。
