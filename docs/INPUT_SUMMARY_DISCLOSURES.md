# 输入区协作摘要：常驻提醒、文字展开与覆盖边界（0.12.0）

## 状态与授权

2026-11-04 所有者认可只读研究后的方案，明确指示先固定文档，再由 subagents 在隔离环境完成实施、测试、push 与 GitHub Release；暂不为本机安装。本页是本轮权威详细契约，文档已先单独提交（8fac3fb）；隔离实现、真实渲染 RED/GREEN、独立 Standards/Spec、固定 clean-source 012a01d 的 source/精确归档/双 SDK headless 与五资产下载 strict 回验均已完成，并已发布 [v0.12.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.12.0)。分阶段结果见 [VERIFICATION](<VERIFICATION.md>) 与 [机器摘要](<../dist/verification-0.12.0.json>)；本机仍未安装，当前 GUI 未加载本轮改动，图形/窄屏像素验收未做。
>
> 2026-11-05 增量：第 6 节侧栏严格分区由所有者认可，0.13.0 源码已实施并随 0.13.0 发布；不改变 0.12.0 已发布制品。

从最新远端基线 0.11.0 开始，不覆盖主检出既有未提交内容。保持 Skills/vendor、两通道、provider precedence、工具集合/描述/schema-2 DTO、Remote wire、存储/授权/CAS、T/S 计数来源、history 与消费性能契约。本轮仅插件客户端呈现，不新增宿主 seam、完整实时名册接口或后台任务。不 npm publish，不安装当前 Web Profile，不改共享 SDK/本机配置，不启动替代服务、不重启现有服务、不清理 spill。

## 1. 裁决语义不变

put-decision 是 workflowId + decisionId 的通用新增/更新，不是调用即 pending。待你裁决采用授权快照 summary.pendingUserDecisionCount（pending=true 且 addressee.kind=user）；待落实采用 awaitingImplementationCount。status/result 不推导或清除旗标，read/hidden 不解决事项。计数/详情保持当前授权实例或分配 scope，不能根据聊天文字重算。工作流摘要折叠/筛选不抹掉其他 workflow 的待裁决义务。

## 2. 三个区域

1. **常驻摘要行**：待你裁决、待落实、T、S；可响应式换行，不跟随工作流区滚动。票总数和真实统计范围保留。
2. **工作流进度区**：保留最近活动排序、原任务状态和现有有入口才折叠规则；96px 上限只约束此区，不约束提醒或展开内容。无票显示暂无票；已知零值状态省略，不删除字典/记录。全部状态均零但有票时给可读空态，不臆造业务状态。
3. **按需详情区**：在进度区之外就地展开，有独立高度上限和滚动（建议 max-height:min(320px,35vh)，最终像素待视觉验证）；不接管 transcript、composer 或宿主 slots。常驻提醒不能被进度区/展开体滚动隐藏。

## 3. 文字即入口

T、S、待你裁决、待落实各自直接点击文字；无额外查看按钮、图标或胶囊；不能把整块摘要做单个大按钮。采用无边框/无背景/零额外 padding 的原生文本式 button，继承字体，保留可见焦点，支持 Tab 和原生 Enter/Space。每个入口用 aria-expanded / aria-controls 表达展开关系；关闭右侧详情不禁用就地查看。

仅一个本地展开类别：T | S | pending | awaiting | null。初次折叠；点击同类收起，异类原位切换；后台刷新只更新内容，不自动展开/切换/打开侧栏或抢焦点；Session 或 instrumentInstanceId 改变时即时清除旧选择与内容，不短暂渲染旧数据。卸载、未知/不可读和显示关闭不得留下过期详情。入口因计数变为 0 而消失时收起对应详情，避免无入口可关闭。

稳定可访问名称：入口分别为“查看 T 票窗口”“查看 S 在跑子代理”“查看待你裁决事项”“查看待落实事项”；展开区域分别为“T 票窗口详情”“S 在跑详情”“待你裁决详情”“待落实详情”。视图可采用内部 Module 分离纯投影和 React 渲染，但不得把格式化字符串反解析为结构化字段。

## 4. 配色与零值

- T 主标签/占用数字蓝色；S 青紫色；待你裁决红色系；待落实琥珀色。主题变量优先、有可读 fallback；颜色不是唯一语义，文字/数字/焦点仍可辨。红色表示需要用户关注，不是故障或新审批。
- 差额全部使用正文 color:inherit，无强调背景/字重；它必须在强调色元素之外，不能继承 T/S 的色。负差额也不改变此规则。
- 超出仅在**确定为 0**时隐藏，>0 用提醒色且仍为 advisory；null/未知不隐藏、不换成 0。差额 0、更深 0 不在本轮新增隐藏规则内。
- 工作流摘要统一省略 count===0 的任务状态（涵盖部分交付、被阻塞），按 key/数值而不是中文名称判定；详情保留全部定义/计数。未知/畸形不能套用零值过滤变成空/0。
- 待你裁决/待落实已知 0 时省略常驻入口；账本不可读显示裁决未知/待落实未知，不能静默消失。
- 总闸关闭继续保留明确“已保存记录、非实时更新”说明；不因样式改动伪装实时状态。

## 5. 详情的来源与可读性

### T

使用 windows.tickets 中 held=true 的显式占位记录关联 records 的票标题/状态、workflowId/localTicketId；不把所有实施中票当作占 T。显示实例总占用与当前可见 scope；assigned 明细是子集，不能冒称完整清单或从子集重算总数。generation 等技术字段放二级折叠。账本/窗口未知时显示原因，不制造空列表。

### 裁决与待落实

待你裁决仅列 pending===true && addressee.kind===user，待落实仅列 awaitingImplementation===true；两旗标独立，允许同一事项出现在两个类别。显示 question、workflow/关联票、status，以及现有 context/options/recommendation/impact/result/来源（存在才显示），不虚构信息/来源链接。可以逐项用原生 details/summary 折叠，技术 JSON 二级展开；首屏为可读内容而非整段 JSON。

就地详情只读；不得复用可保存的 DecisionEditor 来暗中引入编辑/已读写入。查看不调用 applyInstrument、set-decision-view 或 historyAction，不唤醒模型。用户可在原聊天自然语言回答；既有侧栏的显式编辑保留，但侧栏队列必须按第 6 节的严格投影分区，不能继续把全部 decisions 放在「待用户裁决」标题下。

### S：总数与明细分开

S.used/countKnown/countReason/depth 继续以宿主实时计数为准，租约 byState/executions 仅审计，绝不作为当前在跑名册/计数来源。现有 nativeExecutions 是 owner coordinator 的最近观测快照，默认最多 64 行，并不保证覆盖所有当前在跑；只把 activity===running 的已返回记录作为“本次可观测在跑明细”。state=running 但 activity=idle/gone 不混入在跑列表。

始终保守标明明细可能不完整；显示宿主在跑数与本次可展示条数，不能凭条数相等宣称完整。countKnown=false 时总数为已知下界/总数未知；无 nativeExecutions、读取失败或 assigned 受限时注明未知/受限，不能显示“没有在跑”来推翻总数。即使总数大于 64，也不重算或降低总数，不从无 run end 推断业务失败。

每条显示 sessionId、实际可观测活动、来源和可用 lane（inferred）/headerCwd（来源值，不是有效目录证明）。缺失关联不补猜，不跨会话暴露 sibling。**完整同口径实时名册另行研究，本轮不新增 Interface，也不把未来能力作为本版本已实现项。**

## 6. 侧栏协作详情：用户队列与全量记录分开（2026-11-05，所有者认可；已随 0.13.0 发布，未安装）

当前侧栏 `Details` 的标题使用 `summary.pendingUserDecisionCount` / `awaitingImplementationCount`，正文却渲染 `records.decisions` 全部行；0.10.2 与 0.12.0 都是该行为。它会让 agent 内部、无 `addressee` 或已结束事项进入「待用户裁决」标题下，形成“agent 自产自销”的观感。新的呈现契约只改客户端投影：

1. **待你裁决**：仅 `pending === true && addressee.kind === 'user'`；标题使用 `summary.pendingUserDecisionCount`。不得显示 agent、`unspecified`、缺省 addressee、已结束或仅 awaiting 的事项。
2. **待落实**：仅 `awaitingImplementation === true`；标题使用 `summary.awaitingImplementationCount`。该类别是业务待落实，不区分 user/agent；每项显示 addressee，并标注“不区分裁决者”。与待你裁决独立，同一事项可同时出现在两区。
3. **其他裁决记录**：所有不属于前两区的当前记录，包括 `addressee.kind=agent|unspecified|缺省`、已结束、以及仅 pending 的 agent 内部事项。默认折叠，标题明确“其他裁决记录（含 agent 内部，不是待你裁决）”；不得把其他区内容渲染在待你裁决标题下。
4. **同一事项**按 `(workflowId, decisionId)` 去重；前两区允许同一 pending-user + awaiting 事项各出现一次，其他区不得重复。排序沿用当前投影；不根据聊天文字重算或改变业务状态。
5. **显式编辑保留**：三区继续使用既有 `DecisionEditor`；其他区默认折叠，避免编辑器被误读为待用户队列。编辑仍走既有显式保存与授权，不新增自动写入。
6. **空态/未知**：账本不可读显示未知/原因，不能把读取失败当 0；`pendingUserDecisionCount` 与列表由同一授权快照产生，若数量与筛选结果不一致显示诊断，不从列表重算计数。
7. **边界**：仅插件客户端呈现；不新增 Host/Remote/storage/tool/wire、不删除记录、不改变 pending/addressee/awaiting 旗标、授权、CAS 或历史；不唤醒模型。
8. **回归**：混合 fixture 至少覆盖 pending-user、pending-agent、无 addressee、已结束 user、已结束 agent、仅 awaiting、pending+awaiting；断言待你裁决计数/行数一致且无 agent 泄漏；其他区默认折叠；待落实保留；Session/实例切换不残留旧行。

## 7. 验收矩阵

| 类别 | 必须覆盖 |
|---|---|
| 历史缺陷反馈 | 在实际导出的 InputSummary/ObservedInputSummary 渲染路径喂 pendingUser=3/awaiting=2：旧版缺失 RED、新版出现 GREEN；不能只测新格式化 helper |
| 点击与可访问性 | 默认折叠、同类收起、异类切换、只有一个详情区域；文本按钮无额外按钮；aria 关联/焦点/原生键盘语义；不自动打开侧栏 |
| 结构与配色 | 常驻/进度/详情三个区域，96px 只约束进度；T/S/pending 不同色、pending 红系、差额实际继承中性色 |
| 零值 | 超出 0 隐藏/>0 显示/null 未知；任意自定义零值状态隐藏，非零/未知不丢；详情保留零值定义 |
| 裁决 | user 与 agent/unspecified 分开，pending/awaiting 独立、两个类别筛选正确；只读无写请求/模型唤醒 |
| 侧栏裁决分区 | 待你裁决只列 pending-user 且无 agent/无 addressee/已结束泄漏；计数与行数一致；待落实独立；其他区默认折叠且保留显式编辑；没有全部 decisions 落在待裁决标题下 |
| T | held 真值，不以业务标签猜；无匹配票仍显示占位身份；assigned scope 和总数不混用 |
| S | >64/截断、activity 与 state 不同、下界/未知/受限；列表条数不改变总数，不宣称全部 |
| 生命周期与门控 | 刷新保持类别和焦点、不自动打开；切 Session/实例/unknown/关闭显示立即清掉旧展开；rightPanel=false 仍可查看；0 值消失收起 |
| 回归与制品 | source 全量、baseline Host/Client strict/闭合构建、独立 alpha.3 类型、双 SDK/精确包/既有 PluginManager 与 headless 门禁；vendor/包清单不变；独立 Standards/Spec 复核 |

Happy DOM/元素树可证明交互/结构契约，不证明渲染像素、窄屏图形/完整 GUI 安装。发布与下载回验必须使用冻结 clean-source 的同一 accepted 归档，不覆盖旧 tag/资产；发布后仍明确未安装本机。
