# 协作信息区稳定性、阅读与提醒（0.18.0）

## 接受范围与交付

2026-11-09 所有者认可只读研究后的方案，并要求先固定文档、在隔离工作树与 subagents 中开发测试，完成后非 force push、新版本 Release；**暂不为本机 DSH 安装**。本契约覆盖本批客户端改造，不继承 0.17.0 的本机安装许可。不改当前 Profile/共享 SDK/运行 GUI，不重启或启动替代服务，不改生产业务记录、管理开关、模型工具/仪器字段、vendor、渠道或 provider 优先级。

## 1. 稳定外壳，不保留失效正文

安装产物静态核实有 small summary/full snapshot 两层 ready/display/session 门控；真实错误、deadline、释放后重挂载均可进入 unknown。尚无现场 DOM/RPC 时间轴证明具体闪烁根因；不能宣称已复现用户现场或修复宿主卸载。

客户端在曾获当前会话显示许可后遇到暂时读取 unknown 时保留**不含旧业务正文、旧计数或可操作旧链接的中性外壳**，显示状态暂不可用/正在恢复。full observer 不发布 stale-current。首次读取未知不凭空赋显示许可；明确关闭 display、Session/实例/调用者/授权范围切换或撤权须立即清理旧内容/操作，并按当前已验证许可决定是否显示中性壳。宿主 dock 被卸载不在插件保证范围。

保持健康 unknown 与确切零值区别、原权限/修订/代际屏障与订阅共享/释放。用真实导出 InputSummary→InputSnapshot→ObservedInputSummary 挂载链验证 ready→真实错误/deadline→unknown→ready；核对整个 section 存在性与正文撤除，不只测某行文字。

## 2. 统一导航与 T

详情标题行左侧固定三个可切换按钮 **裁决、T、S**（红、蓝、紫），右侧关闭；当前项有非颜色的选中标志。常驻入口顺序/颜色相同，详情自身滚动，窄屏自然换行。取消记录核对独占行，将其作为裁决面板标题同行的灰色次级入口，保留独立分类/handler和原始计数，不另造第四主分类，不混入 pending-user 数。刷新不自动切换/抢焦点；关闭仅收起，不解决/已读/删记录。

T 首行突出真实外部 source.taskId（若有）或明确本地 handle，并加粗 label/title；次级列 workflow、占位及来源，技术数据折叠。不从 locator 猜票号、不以列表下标冒充任务序号；不新增 priority 业务字段。T.used 是授权窗口值，不以当前明细数量重算。

## 3. S：仅宿主读取，无 agent 负担

从 DSH 公开 Session API/store/projection 获取可读标题，遵循宿主标题表示；无需 agent 在 subagent 派发额外填写标题，不新增任何模型工具参数、仪器字段或持久 title/topology 账本。缺标题可回退宿主已有 label/displayTitle、最后短 ID，完整 ID 留技术详情。

点击标题通过宿主已有 subagentAddress 与 sidebarRight.openResource 打开原生 subagentchat；点击当下复核 mounted session、显示许可、地址和可用能力。地址必须使用真实 direct parent；内部 subagentChatAddress helper 非公开导出，不导入私有深路径。允许最窄有界资源地址适配，能力不足诚实禁用/说明，不打开错误会话、不唤醒模型。preferNewPane 是偏好，不承诺同时可见或后台打开。

父子关系读既有 parentSessionId/宿主 catalog；孙代理按父折叠。父自身未在跑仍可作结构节点，不计入 running；缺父/冲突/循环/未加载关系放未知组，不擅挂 owner、不丢原行。折叠仅为按 Session/实例/授权隔离的本地显示状态。S.used/unknown/depth 原语义不变；最多64行观测不等于完整实时名册，不从行数/历史拼凑实时总数。

## 4. 裁决阅读与纯文本模板

问题标题/正文优先，选项各自一个段落且完整换行；推荐选项在前，其余保原顺序。推荐与普通选项用不同主题色，并有明确“推荐”文字/边框，不靠颜色单独表达、不用成功态暗示批准。recommendation 当前为自由文本：仅能唯一明确匹配 key/完整 label 时置首，有歧义保留原建议说明，不猜；本批不扩 schema。

选项文字使用可键盘操作的文字按钮，不额外堆多组动作。点击仅借 DSH 公开 InputActions.captureInsertion/insertText 向当前会话输入框插入纯文本，不自动 submit/send，不调用 applyInstrument/已读接口，不写批准或清 pending/await。选项模板严格为：

```text
关于待裁决项: ”待裁决项标题”
我认可 “用户选中选项”
```

另有“我有自己的看法……”文字入口：

```text
关于待裁决项: ”待裁决项标题”
我认为：
```

模板动态占位（问题、选项label）中的CRLF/CR/LF/NEL/Unicode行段分隔符以单个空格作单行表示，保证仅模板自身分隔为两行；阅读区原文保留，不改记录/schema。不得 setDraft 拼接全文而删除 chips，不用私有 editor/DOM。现有非空选区不默认覆盖；提示取消选择后重试。revision变更/发送锁导致 insertText=false 时提示未插入，不强行覆盖；一次插入一个 undo。缺公开 API 的旧宿主说明不可用并保留阅读。只在用户实际发送后按既有真实消息和 SAME decisionId 处理裁决；同名标题用阅读元信息辅助，不擅改两行模板或猜归属。

## 5. 本地可选铃声

用户已试听认可，将以下 CC0 作者音频作为设置可选项，默认优先三音上行：

| key | 作者条目 | 特征（作者描述） |
|---|---|---|
| toast | [UI Toast Notification](https://freesound.org/people/Qvantor/sounds/878254/) | 约0.63秒，C/E/G三音上行 |
| modal | [UI Modal Open Chime](https://freesound.org/people/Qvantor/sounds/878249/) | 约0.99秒，五度双音 |
| popup | [UI Pop-up Open](https://freesound.org/people/Qvantor/sounds/878253/) | 约0.48秒，上滑音 |
| bubble | [UI Bubble Pop](https://freesound.org/people/Qvantor/sounds/878245/) | 约0.24秒，八度上滑 |

许可：[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。无强制署名，可商用/修改/打包，仍随包保存作者/源页/许可/字节摘要与修改溯源；不宣称其他权利无风险。固定少量音频随闭合制品本地提供，运行时不 fetch/hotlink 第三方，不用类似合成替代品冒充所选音频。

soundSeconds 为有限提醒总时长预算，不 time-stretch；短音型播放+静音间隔有限重复，不叠音，失效/停止/卸载立即清理。设置增加选择并沿用本浏览器保存/试听/音量/静音/去重语义；老设置未给选择时平滑使用默认。校准音量与淡入淡出，不原样套旧 oscillator 的0.12 gain宣称等响。浏览器 autoplay/OS静音/后台节流仍可能阻止；仅用户显式试听/启用手势解锁，错误可见，不绕过策略、不承诺送达。

## 6. 已认可测试 seams 与发布门禁

沿用已认可的公开边界：导出 React 的实际挂载交互＋原生 slot/input facade（捕获布局/模板/未知/撤权/草稿保护，不代表生产 GUI）；公开 host store/projection/navigation（捕获读取与真父地址，不证明真实窗口已加载）；notification ports/settings/audio（捕获选择/迁移/有限播放/停止，不证明用户听见）；source/lib闭合构建、vendor与唯一精确包（捕获交付字节，不证明本机安装）。按竖切保留 RED→GREEN，明暗/窄屏/键盘、类型和完整回归、能力缺失与旧宿主回退。

独立 Standards/Spec 复核关闭必改；严格生成物与精确包/source-bound验证后冻结唯一归档，新annotated tag/五资产Release、非force push及下载逐字节回验。源码/隔离浏览器/精确归档与3080当前GUI分别报告，不把本次门控改造冒称现场根因已证实。不安装本机、不启用管理、不npm publish、不覆旧资产。
