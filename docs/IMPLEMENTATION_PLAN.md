# Implementation Plan and Gates

> 公开资料边界：带日期的原始研究、工具/测试日志和本机快照仅在本地保留，不随公开仓库分发，也不充当可公开复核的原始证明。当前状态及历史证据范围见 [公开验证说明](<VERIFICATION.md>)。SDK 包相对路径仅定位当时核验的安装产物，不保留本机路径或旧行号。

This plan implements the accepted contract in [DESIGN.md](DESIGN.md). It is intentionally phased so provenance and package behavior are testable before the plugin is enabled in the owner's active Web profile.

> **Historical record.** The original numbered phases below describe the **two-channel** (`stable` + `beta`) baseline at source distribution `v0.1.0-beta.1`: 26 Skills, 81 vendored files, and the counts and hashes it quotes. Those values are preserved as the record of what was verified then. Historical private-repository phases below retain their original meaning; the current plugin repository is public with private local evidence excluded, as amended in DESIGN.md. The current baseline is source distribution `v0.3.1`, mirroring upstream release `v1.3.2`: two channels (`stable` and `beta`), 27 Skills each, 85 vendored files. Do not read the numbers below as the current state.

## 裁决摘要、推荐支持 B 与原生子代理导航（2026-11-09，已认可，实施前冻结）

最新范围以 [DESIGN](<DESIGN.md>) 与 [本批契约](<COLLABORATION_RECOMMENDATION_SUPPORT.md>) 为准：先文档，隔离 subagents 单 writer，主代理串行集成，真实公开 seam RED→GREEN，独立双轴复核，源/精确包及兼容门禁后非 force push、新版本 Release、下载回验并安装同一制品到本机。无人值守默认关闭，不迁移业务，不擅重启。采用当前本地恢复修复基线，保护旧 dirty 检出/共享依赖。

2026-11-10 所有者再次明确：本批只验 DSH 0.2.2-rc.1，停止 alpha.4／双宿主门禁，安装兼容下限为 >=0.2.2-rc.1。历史多版本记录保留，但不再启动旧 SDK 或为本批排双版本验证；当前 rc.1 上的旧版本号拒绝断言不算运行旧宿主。旧低版本声明候选不发布，元数据更正后只验新源码及其精确包。

本批以本契约与下表为本地任务权威，不为了管理功能 OFF 制造仪器 task references/decisions，也不另开外部重复票。下列标签仅用于实施依赖，不表示 T 占位或原生运行状态：

| 工作单元 | 依赖 | 交付与关闭依据 |
|---|---|---|
| D 文档/隔离 | 无 | 接收用户认可，冻结术语/表示/API/兼容/seams，文档先提交 |
| B 后端预授权/采用 | D | 真实 operator owner-scope policy、仅新项支持、显式采用/CAS/来源、typed 输出/消费与恢复 |
| U 摘要/开关/导航 | D；开关最终接 B | 零隐藏/阅读/设置、sessions 可撤销增强、宿主标题/地址真实 seams |
| V 集成/验证 | B、U；2026-11-10 兼容更正 | 仅 DSH 0.2.2-rc.1：源与同一归档完整测试／严格类型／原生挂载／浏览器／正式 headless；安装声明 >=0.2.2-rc.1 的真实版本号正负例，必改复核关闭 |
| R 发布 | V | clean-source 唯一版本/制品冻结、非 force refs 推进、五资产 Release 下载逐字节回验 |
| I 本机安装 | R | 官方 PluginManager 同一 tgz 安装、快照/回滚保护、版本/字节/激活边界核验，不自动改业务策略 |

技术表征细化尚在 D 阶段时不得提前写实施代码；实现者各自独立工作树，交付前同步 integration，由串行 merger 合入。

## 0.20.0 期限预设、持续预授权与标题层次（2026-11-10，已认可）

在 0.19.0 已验证基线上小步扩展：限时预选 1/2/4/8/12/24、默认 12；新增 `expiresAt:null` 的持续模式与同一 switch 关闭；状态行只加“推荐支持 启用”短标记；可导航子代理标题用 S 紫。先提交契约/迁移文档，再改 contract/store/runtime/instrument/UI 与测试；不新增 V5、不改 V4 布局、不改共享 SDK。只对 DSH 0.2.2-rc.1 验源、唯一归档、类型、原生、浏览器与包安装；持续模式写入后旧 0.19.0 回滚边界必须在迁移文档和 Release notes 明示。

## 协作摘要短暂恢复闪烁（2026-11-09，本地实施）

以 [修复契约](<CLIENT_RECOVERY_STABILITY.md>) 与 [DESIGN](<DESIGN.md>) 为准；先文档提交、再隔离 subagent 单writer 实施、主代理串行集成与源／精确包／隔离浏览器验证、独立 Standards／Spec 复核、本地结果记录。按真实挂载与原生 slot 竖切保留 RED→GREEN，测试语义身份与同域订阅稳定，同时覆盖真正换域、撤权、失败和最后卸载。

**本轮禁止 push、tag／Release、npm publish、本机安装／激活与服务重启；不改共享 SDK 或生产业务记录。** 本地提交和验证包不代表新版本已发布，不覆盖 0.18.0 原制品。完成时保留本地候选与证据，原 dirty 检出不改。

本地开发与验收已完成：代码／包冻结 `80804ff3bfa45d0ccfa20083e6df5b321ba48591`；独立 Standards／Spec 必改均关闭，原始证据仅本地保留。准确矩阵与限制见 [本地验收摘要](<CLIENT_RECOVERY_VALIDATION.md>)，不将本地完成解释为发布或当前 GUI 更新。

## 0.18.0 协作信息区与可选铃声（2026-11-09，实施中）

以 [DESIGN](<DESIGN.md>) 与 [COLLABORATION_UI_REFRESH](<COLLABORATION_UI_REFRESH.md>) 为准；最新授权为隔离开发/测试、push/新Release，**不安装本机**。

| 阶段 | 交付与门槛 |
|---|---|
| A 文档/隔离 | 最新origin/main独立工作树，保护原树dirty；先提交显示/权限/原生读取/模板/声音契约 |
| B 并行实现 | 单writer子树，实际React/公开host/input/notification seams竖切RED→GREEN；标题仅读、不加agent字段；真实本地CC0声音与设置选择 |
| C 集成/复审 | 串行集成、严格类型/生成物/完整回归、明暗窄屏键盘与独立Standards/Spec必改关闭；不宣称现场闪烁已复现 |
| D 制品/发布 | 冻结唯一clean source/精确归档，source-bound strict/双宿主门禁、新tag/五资产Release和下载逐字节回验 |
| E 本机安装 | 明确不执行；Profile/共享SDK/当前服务与生产记录不变，不启用管理/重启/n​​pm publish |

## 0.17.0 Skill 正文获取实施（2026-11-09，A–E已交付；磁盘已安装，当前宿主待重载）

接受范围见 [DESIGN](<DESIGN.md>) 与唯一细化 [SKILL_CONTENT_ACCESS](<SKILL_CONTENT_ACCESS.md>)。默认正文可获取、user-only 交模型理解，不做自然语言特批或严格兼容模式；既有权限与来源完整性不变。本轮用户明确授权push／发版／安装，旧轮次“不安装”不限制本批。

| 阶段 | 交付／门槛 |
|---|---|
| A 文档／基线 | 从现行origin/main隔离树先提交契约；保留原主工作区dirty；冻结来源/有效策略、提示/定位及验证seams |
| B 实现与纵切测试 | 独立单writer子树，provider有效暴露与稳定前言；public provider/Registry/native loader typed/rendered RED→GREEN；保持源catalog/vendor、scope/gate、完整性与abort |
| C 集成／复审 | 串行集成；独立Standards/Spec关闭必改；完整source、双宿主公开类型/loader、生成物/vendor、行为评估覆盖边界如实记载 |
| D 制品／发布 | clean source、一次accepted tarball、精确包完整suite/双宿主stable+beta headless；同字节五资产，新annotated tag与非force push、Release下载strict回验 |
| E 本机安装 | 支持的Profile包管理安装同一归档；保留其他配置/业务数据/共享SDK；验证已安装字节和实际加载，当前进程未激活则明确待重载；不自动重启或替换GUI |

A–E已交付：先提交契约，三个独立单writer子树实现／验证后串行集成，两轴无必改；双宿主源码与同归档完整门禁、原生loader／公开类型／正式headless通过，六native-UI装配skip由精确RC1 fixture 6/6关闭。唯一clean source／tag为8d914db，473809 B归档只pack一次；新[v0.17.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.17.0)五资产发布、下载严格回验及本机161/161字节安装验证已完成。alpha.4初次并行既有cwd失败与完整串行通过均保留。当前进程仍返回旧Skill正文形式，等待宿主重载；未重启／替换服务，未迁移／清理业务数据。源/tag保持冻结，本状态仅发布后main文档，详见[验证摘要](<VERIFICATION.md>)及[机器摘要](<../dist/verification-0.17.0.json>)。

## 0.16.1 DSH 0.2.2-rc.1 兼容发布（已完成／未为本机安装）

A–D已完成：source/tag **0e7b311683541036ae0bc351536fa4a0721ac1c0**；同归档双宿主完整suite与stable/beta headless、独立Standards/Spec、精确RC1 types和native Client通过；新[v0.16.1](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.16.1)五资产已发布并下载strict回验。运行时代码与生成物无改动，只有元数据／断言／测试装配及兼容资料；本机未安装，最终身份与边界见[验证摘要](<VERIFICATION.md>)及[机器摘要](<../dist/verification-0.16.1.json>)。本状态是发布后main文档，不改变冻结source/tag。

范围以 [DESIGN 的 0.16.1 节](<DESIGN.md>) 为准：隔离环境／subagents 检查与必要适配，验证后 push／Release，不安装本机。

| 阶段 | 门禁 |
|---|---|
| A 版本／接口 | 从最新 origin/main 建隔离树；核对 rc.1 release／npm／公开 source，避免沿用原工作区未提交文档 |
| B 兼容回归 | baseline 与 rc.1／旧宿主完整套件、真实 rc.1 root／Client strict 声明、public tool／prompt／projection／Skills／Client seams；skip 逐项明示 |
| C 制品／复核 | 无必要运行时修改则只同步版本／断言／兼容资料；闭合构建与 vendor 不变、独立 Standards／Spec、clean source prepack／一次 accepted pack／source-bound strict |
| D 发布 | 同一精确归档旧／新 SDK × stable／beta 隔离 headless、非 force push／新 annotated tag／五资产 Release、逐字节下载 strict；本机 Profile／共享 SDK／服务不变 |

当前核对与最终状态统一追加到 [兼容记录](<DSH_022_RC1_COMPATIBILITY.md>) 和 [公开验证](<VERIFICATION.md>)，不将初轮成功当最终制品或现场 GUI 证明。

## 0.16.0 开发、测试与发布（2026-11-07，已发布并下载回验；未安装本机）

最新授权以[DESIGN的0.16.0节](<DESIGN.md>)为准；下方“仅研究／待实现授权”保留其先前轮次含义，不再阻止本批开发／提交／发布。先完成表示和权限冻结，再派隔离实现，不直接把所有候选视为必做。

| 切片 | 当前状态 | 完成门槛 |
|---|---|---|
| A 契约／基线 | 已完成 | 引用wire／V3与严格V1/V2读、父链权限、writer范围先冻结并单独提交 |
| B 引用闭环／兼容 | 已完成 | 无业务假票贯通T／assign／decision／模型与历史／消费／原生UI；旧对象兼容，不迁移生产记录 |
| C 上下文／时间／性能 | 已完成（限定改进） | 单条消息分区、完整语义baseline与同step上限、elapsed TTL与单次排序键复用；不宣称provider／全局性能收益 |
| D 工具指导／减面 | 已完成（指导窄范围） | 原生流程优先，移除固定调度建议；legacy resource／history默认面保持，delegate仍opt-in，未全面退役工具 |
| E 集成／独立复核 | 已完成 | 单writer串行集成；独立Standards／Spec必改关闭；source1014项、实际公开types、build／vendor、原生Client6项与浏览器1340项通过 |
| F 制品／发布 | 已完成／未安装 | 冻结source78610ef与唯一tgz；同归档1014项／双宿主、非force atomic push、新annotated tag／五资产Release、下载逐字节与source-bound strict回验通过 |

冻结制品源为 **78610ef80c3eef377f19d64b17dcbe1123a98652**；后续 main 只补本状态与公开验证资料，不改变 tag／运行时／制品。结果与限制见[验证摘要](<VERIFICATION.md>)及[机器摘要](<../dist/verification-0.16.0.json>)。旧二进制不能读 V3，首次实际引用写入前须按[迁移说明](<../MIGRATION.md>)备份并停止旧写者；读取不自动迁移。

生产记录与之前88项不迁移／清理；当前Profile、共享SDK和服务保持不变。完成后仍未为本机安装／激活，不把隔离headless／browser fixture冒充当前GUI验收。

## 任务权威与引用收窄（2026-11-07，仅补研与文档）

所有者已认可职责方向，当前只授权补充研究和固定文档。范围以 [DESIGN](<DESIGN.md>) 最新“任务权威与仪器职责收窄”节为准；细节与情景验收统一维护在[实施前契约](<TASK_REFERENCE_CONTRACT.md>)，证据见[职责研究](<TASK_AUTHORITY_RESEARCH.md>)。后文 0.15.0 的开发／发布授权仅属已完成的上一批，不得继承到本轮。

| 切片 | 状态 | 顺序与门槛 |
|---|---|---|
| T0 补研／文档 | 已完成（仅文档） | 证据与现状、认可方向、细化推荐分开；权威入口与领域词已固定，相对链接／引用行范围、文档限定 diff 及独立只读复核通过 |
| T1 引用闭环 | 待明确实现授权 | 实施前冻结新 action／字段／最小存储与旧格式协商、引用ACL及父链收窄语义；同批闭合T／assign／decision／消费／UI，不造空壳票，不半切换发版 |
| T2 旧对象兼容 | 待实现；数据处置另行授权 | 旧报告、原handle／历史／来源与有效承诺保留；先真实承接，显式收尾，不自动清账 |
| T3 来源化只读观察 | 按实际需求另选 | 先选一个可信来源与现有授权seam；无能力保持引用，不新建抓取／同步框架 |
| T4 其他工具减面 | 后续独立候选 | 监督调度建议、legacy resource、history管理入口逐项定范围，不捆绑全面退役 |
| T5 集成／交付 | 待后续授权 | 真实seams、独立复核、源／精确包及宿主门禁；提交、push／发布、本机安装分别明确授权 |

本轮不改运行时、测试、生成物、vendor、Profile或SDK，不迁移生产记录、不启用管理、不提交／推送／发布／安装／重启。T0完成不意味着T1–T5已开始或目标会话88项已核账。

## 上下文／性能／时间的预防性复核（2026-11-07）

用户要求先停止残留任务后重新检查，不预设缓存／性能故障。实际证据、可复核命令及后续C0–C4候选统一见[上下文复核](<INSTRUMENT_CONTEXT_CACHE_RESEARCH.md>)：本轮C0已完成源码核对、136/136针对性回归及时间／工具schema探针；不把中止轮回报作为本轮验收。

C1实际seam测量、C2协议／volatile分区、C3被测热成本／elapsed clock、C4真实provider效果均未执行改造或获实现／模型试验授权。先分开queue等待、当前／历史工作、hash字节、写与消息增长；source/auth/latch/frontier/baseline不因优化降低。生产CPU/RSS／实际cache-hit没有取证，不以合成计时宣称收益或缺陷。文档固定不触发任务引用实现、生产迁移、commit/push／发布／安装／重启。

## 0.15.0 交付完成（2026-11-07，已发布并下载回验；未为本机安装）

最终 source/tag：5e24d574bab4f18a59964184a737e8aec3c3b375。A/B/C、两次 C3 缺口修复与独立复审、937 项源码与精确归档、双宿主/772 项浏览器检查及五资产下载 strict 均完成，详见[验证摘要](<VERIFICATION.md>)。本轮不安装/激活现有 Profile，不中断服务；保留隔离检出/私有证据供复验，停止扩展实现并等待下一轮问题讨论。

以 [DESIGN.md](<DESIGN.md>) 的 0.15.0 授权节为当前范围，后文“仅研究/待授权”是前序阶段历史。先固定文档提交，再建隔离 integration 与独立 child 工作树：A 可信时间只读投影与授权/清理回归；B 原生逐项阅读/记录核对入口/设置会话展示与真实 React 回归；C 工具说明与实际消费指导/真实答复兼容回归。每树一名 writer、各自依赖/生成物；主代理串行集成，不共享生成目录并行构建。

集成后独立双轴复核，关闭发现，再执行完整 source/type/client/build/vendor/精确归档与隔离双宿主/浏览器门禁；冻结 clean source 与唯一 0.15.0 tgz，非 force 推送 main、新 annotated tag/GitHub Release、五资产下载回验；最新要求暂不为现有本机 Web Profile 安装或激活，发布后核对现有 Profile/SDK/服务未被改动并交付总结，等待用户补充讨论新问题，不自行扩展实现。不改共享 SDK/生产记录，不重启当前服务，不 npm publish。所有完成证据须来自实际执行，目标 88 未实核不变。

## 仪器 UI 文档固定与领域研究（2026-11-07）

详细 UI 契约与验收见 [INSTRUMENT_UI_HIERARCHY.md](<INSTRUMENT_UI_HIERARCHY.md>)；自裁决/待落实职责研究见 [DECISION_LEDGER_RESEARCH.md](<DECISION_LEDGER_RESEARCH.md>)；具体兼容、记录核对入口、上下文移交与恢复推荐见 [DECISION_LEDGER_COMPATIBILITY.md](<DECISION_LEDGER_COMPATIBILITY.md>)。本轮仅研究与文档，未获实现/提交/发布/安装/重启/存量清理授权。

| 阶段 | 内容 | 状态/门禁 |
|---|---|---|
| A 文档与研究 | 固定已认可裁决阅读层次/原生主题/可信时间，检查所有仪器区域，核对上游记录职责 | 本轮交付；仅文档与只读源码研究，不冒称目标会话逐条核账或当前 GUI 像素验收 |
| B 裁决阅读 | 原生逐项展开、紧凑操作条、长内容/来源/技术分层 | 待实现授权；保持阅读生命周期与只读/授权/CAS |
| C 时间 | 先选首次登记来源与最小公开投影/兼容方案，再展示创建/业务更新时间 | 待契约与实现授权；源清理/assigned 子集不伪造创建时间 |
| D 其他仪器 UI | 根据全域矩阵逐项确认范围与优先级 | 本轮只列审查发现与候选；不自行全面重构 |
| E 裁决领域收窄 | 方案 B：用户裁决为核心、技术选择回文档、落实回任务，保留决定→任务引用 | **方向已认可、未实现**；已形成兼容/核账具体推荐，见兼容草案 C0–C5；先保留 wire/storage、收窄新流程并提供兼容记录核对，再按目标会话实际依据逐项移交，不维护第二套完成状态。目标 88 未实核；实现与数据处置另行授权 |
| F 集成与交付 | 真实导出 React 回归、原生公共 types、真浏览器明暗/窄屏/键盘与精确制品 | 实施后再执行，独立复核；push/发版/安装/重启分别取得授权 |

## 设置页视觉层级增量（2026-11-06）

- 范围：见 [DESIGN.md](<DESIGN.md>) 同名节；仅客户端视觉与布局。初轮不安装/发布；随后所有者明确授权 push/发版，目标新补丁版本 0.14.1，暂不为本机安装。
- 已完成：先提交设计契约 8d65c66；隔离分支 settings-visual-hierarchy 由主代理与子代理实现四级文字层次、主题中性底色/语义色、范围与总闸先行、协作/上限/显示分组、三渠道个人提醒与独立保存重点。原生 Button 明确 primary/outline/ghost，三态继承仍为语义 select；没有新 UI 库、全局 CSS 或业务策略变更。
- 复核：固定基线 153b6fa 至 ab7e59e，Standards 无发现；Spec 两个 P2（暗色 S 标签对比度、个人提醒编辑后仍显示旧已保存反馈）在 d647efa/58b966b 修复，独立增量复审全部关闭。提醒草稿真实 React 回归先 RED 后 GREEN；错误提示不被未保存状态遮蔽。
- 最终代码 58b966b：根/Client 严格类型、闭合构建/生成物同步通过；完整源码 916 项（907 pass / 0 fail / 9 skip：3 项未提供上游源，6 项宿主无可装配 UI-slots）；另以已有原生 Client fixture 运行这 6 项为 6/6 pass。浏览器 fixture 使用实际 DSH 0.2.2-alpha.3 shell React/控件与原主题，真实插件 SettingsPage + 受控 Remote；1440/390 宽度 × 明/暗主题覆盖常态、草稿/总闸关闭、提醒未保存、进阶展开及键盘焦点；无横向溢出、无页面异常、无 Remote 写入。不是当前 GUI 安装或真实声音/OS 投递验收。
- 精确本地候选（**不是已发布的 0.14.0 归档**）：prepack 与严格 tarball 检查通过，161 个普通文件/0 目录/0 symlink，451121 B，SHA-256 `1e782d467a92b10770327ad2d2f1e140582eba56eca57d4301aa0c143473f465`，source 58b966b。pnpm 11.8.0 默认 pack 会移除 packageManager，首个候选被严格检查拒绝；保留失败件，以 `--skip-manifest-obfuscation` 重新打包验证通过，不放宽验证器。原始脚本、截图、测试/制品回执留在忽略的本地研究目录；后续文档提交不改变冻结源码/候选。
- 初轮交付边界：隔离分支与证据保留供审阅；当时没有 merge/push/tag/发版或安装，已有 0.14.0 Release 不变。
- 0.14.1 发布（所有者后续授权，已完成）：授权先在 39f3351 固定；clean source 08fd9b2 同步包版本/验证器/断言与使用说明，source/显式精确归档全套各 916 项（907 pass / 0 fail / 9 已知环境 skip），另 native 6/6、双宿主 headless、strict original/downloaded 均通过。唯一归档 451846 B，SHA-256 `3b6d2aab4a5e2ca3f3d27ca9cffc7c0a5277ddcac9538500c969ae24ab37365d`；非 force atomic push main + 新 annotated v0.14.1/GitHub Release，五资产 API digest 与下载逐字节一致，旧 tags/0.14.0 未变。当前 Profile/SDK 六项摘要及原 Web listener 未变。**未为本机安装、未改当前 Profile/共享 SDK、未重启服务、未 npm publish**。公开证据见[验证摘要](<VERIFICATION.md>)与[机器摘要](<../dist/verification-0.14.1.json>)；tag/source/制品保持冻结，后续 main 仅补文档证据。

## 0.14.0 裁决交互偏好、用户提醒与设置页整理（2026-11-06，所有者认可）

唯一详细契约见 [DECISION_INTERACTION_AND_SETTINGS.md](<DECISION_INTERACTION_AND_SETTINGS.md>)。只在隔离环境实施，不为本机安装。

| 阶段 | 内容 | 状态/门禁 |
|---|---|---|
| A 文档 | 固定同模板两态引导、DSH原生输入/排队不改、浏览器提醒/范围、详情保持、原生设置页与验收 | 已在实施前独立提交 c6480d5，仅含设计/计划文档 |
| B 策略与消费 | 隔离子代理实现interactionMode、来源/继承、公共引导与OFF/CAS/真实消费回归 | 已独立实现并合入；完整源码门禁通过，详见验证摘要 |
| C 用户提醒 | 隔离子代理实现个人设置、可配声长/音量、popup/desktop、去重/能力/生命周期与测试 | 已独立实现并合入；完整源码门禁通过，详见验证摘要 |
| D 客户端 | 隔离子代理实现持久详情、原生风格设置页整理及真实React测试 | 已独立实现并合入；完整源码门禁通过，详见验证摘要 |
| E 集成 | TS、完整suite、精确制品、双宿主headless与独立Standards/Spec复核修复 | 已完成：913/907/0/6、native fixture 6/6、TS、双轴复审关闭、精确包 strict 与双宿主 source/archive headless 通过 |
| F 发布 | 非force push、新annotated tag/Release、五资产下载strict回验；当前Profile/SDK/服务不变更 | 已完成：非 force atomic push、新 annotated v0.14.0、五资产发布/下载逐字节及 strict 回验；未安装本机 |

## 0.12.0 输入区摘要与就地详情（2026-11-04，A–F 已完成，已发布未安装）

唯一详细契约与验收矩阵见 [INPUT_SUMMARY_DISCLOSURES.md](<INPUT_SUMMARY_DISCLOSURES.md>)。

| 阶段 | 内容 | 状态/门禁 |
|---|---|---|
| A 文档 | 固定交互、配色/零值、裁决/T/S 来源和不完整覆盖、授权 | 已固定；实施前单独提交 |
| B 展示实施 | 隔离子代理修改 Client，常驻/进度/详情分区、文本入口和只读详情 | 已完成；不改 Host/Remote 或本机；三方 Session 身份围栏修复并同步生成物 |
| C 回归 | 独立隔离子代理在真实导出渲染路径建立 RED/GREEN 与生命周期/覆盖矩阵 | 已完成；25 项真实 RED→GREEN，三个 Client 文件 96/96；最终候选独立 25/25，未把 DOM 当像素验收 |
| D 整合与复核 | 基于最新 0.11.0 整合，Standards/Spec 双轴复核修复，source 全量/严格构建 | 已完成；固定 012a01d 双轴零未关闭项；source 1151 项、1145 pass / 0 fail / 6 明示环境 skip；真实 alpha.3 类型通过 |
| E 精确制品 | 版本/生成物，冻结 clean-source，唯一 accepted pack，双 SDK/精确归档/Manager/headless | 已完成；012a01d 唯一 511256 B 归档 strict 与全套 1151 项通过，Manager 13/13、packed-native 14/14，双 SDK source/archive × beta/stable headless 通过 |
| F 发布 | 新鲜远端/旧 tag 不变 guards，非 force push/新 tag/Release，五资产下载 strict 回验 | 已完成；非 force atomic main + annotated v0.12.0，新 Release 五资产 5/5 字节/API digest/strict 回验通过；未安装、不 npm publish、不改 Profile/SDK/服务 |

## 0.13.0 侧栏裁决严格分区（2026-11-05，所有者认可；已随 0.13.0 发布，未安装）

唯一详细契约见 [INPUT_SUMMARY_DISCLOSURES.md](<INPUT_SUMMARY_DISCLOSURES.md>) 第 6 节；范围与保持条件见 [DESIGN.md](<DESIGN.md>) 同名节。

| 阶段 | 内容 | 状态/门禁 |
|---|---|---|
| A 文档 | 固定待你裁决/待落实/其他三分区、同 predicate、显式编辑保留与边界 | 已完成（文档提交）；仅文档 |
| B 客户端 | 在既有 `Details` 中按严格投影拆区；其他区默认折叠；不新增 Host/Remote/storage/tool/wire | **已完成**；客户端定向 65/65，构建通过 |
| C 回归 | 混合 fixture 覆盖 pending-user、pending-agent、无 addressee、已结束、仅 awaiting、pending+awaiting；计数/行数一致且无泄漏 | **已完成**；真实导出渲染路径，含刷新/会话切换 |
| D 复核与制品 | 独立 Standards/Spec、严格构建、source/精确包、现有宿主 headless | **进行中**；已授权 push/tag/Release；不安装本机 |

本增量不改变 0.12.0 的已发布制品，也不声称当前 0.10.2 GUI 已修复；安装 0.12.0 仍不会修复侧栏全量列表。

## 0.13.0 早期 DSH cwd 兼容桥退役（方案 C，2026-11-05 所有者认可；已随 0.13.0 发布，未安装）

权威范围见 [DESIGN.md](<DESIGN.md>) 同名节与 [退役研究](<LEGACY_DSH_CWD_BRIDGE_RETIREMENT.md>)。目标是删除 0.2.1-alpha.1 兼容桥、旧 SDK 补丁、组合/准备、包面与 `startupCwdEnabled` 启动开关；最低宿主至少 `~0.2.1-alpha.2`。不要求原生 worktree 工具，不删除 delegate/binding/观测/历史。

| 阶段 | 内容 | 状态/门禁 |
|---|---|---|
| A 文档 | 固定方案 C、方案 B 仅为历史备选、最低宿主、迁移风险与发布边界 | 已完成（文档提交） |
| B 包面 | 删除 compatibility/host-patches/src-compatibility/脚本/测试/包 exports/bin/locale/files；`cordis.patch.yml` 仅保留 Skills 行 | **已完成**；包清单固定 76 files / 62 lib，验证器与 scaffold 同步 |
| C Host | 只保留 native seam；删除 bridge/legacy continuation/startup domain/UI/Remote；无 native seam 失败关闭 | **已完成**；delegate/binding/观测语义未改，无原生 seam 的 host-collaboration 用例失败关闭 |
| D 迁移与回归 | alpha.1 拒绝；alpha.2/0.2.2-alpha.3 native 正常；0.12 Profile 无残留 compat 行；旧数据可读；无 native seam 不创建 child | **已完成隔离矩阵**；0.12→0.13 升级无 compat 行、profile patch 不变；显式 stale 行仅警告 entry not found；alpha.3/alpha.4 headless 通过；实际 alpha.2 二进制不可用 |
| E 制品与发布 | 独立 Standards/Spec、严格构建、唯一精确制品、双 SDK/headless、五资产下载 strict 回验 | **已发布**；Standards 公开边界/文档问题已修复，Spec 仅 LOW 测试缺陷已修复；5 assets 下载 strict 回验通过；未 npm publish/本机安装 |

0.13.0 的两个增量一起发布；迁移说明必须把“最低宿主提升/旧桥退役”作为破坏性变更单独列出，不能混在侧栏 UI 修复中淡化。

**本轮机械结果（2026-11-05）：** 集成分支在完整的 0.2.2-alpha.3 fixture 宿主根（`DSH_CONTROLS_HOST_ROOT=<fixture-dsh-root>`）上，全量 `node --test` 为 **861 项：855 通过、0 失败、6 skip**（含本地上游 vendor 源；不设源时 3 个 vendor 门禁 skip，即 852/9）；根与 Client TypeScript 检查均 0 error，`verify-package --prepack` 通过（76 fixed / 85 vendor / 161 expected）。隔离 0.12→0.13 Profile 升级：安装 0.13.0 后 profile patch 哈希不变、包内 0 个 compat 文件、bundle patch 0 个 compat 行、`--dump-config` 0 个 compat 行且 1 个 Skills 行；显式 stale 行得到 `patch: entry ... not found` 警告但不阻断 Skills。alpha.3 与 alpha.4 的 source/唯一最终 tarball × beta/stable headless 均通过，未启动 Web、未调用模型。新增引擎门禁用例以真实 `evaluatePluginCompatibility` 验证 `0.2.1-alpha.1` 被拒绝、`0.2.1-alpha.2`／`0.2.1-alpha.3`／`0.2.2-alpha.3` 被放行。实际 alpha.2 二进制不可用，未声称 alpha.2 runtime 实测。

## 0.11.0 读取路径性能优化（2026-11-04，A–F 已完成，已发布未安装）

本轮范围、保持条件、已认可测试 seams 与 A/B/C/D/E/F 阶段只在 [PERFORMANCE_READ_PATHS.md](<PERFORMANCE_READ_PATHS.md>) 维护：先单独文档提交，再由隔离 subagents 实施历史算法、身份事实和表示/消费切片，集成后独立双轴复核、双宿主源码/精确制品门禁，最后按所有者授权 push/tag/GitHub Release 与下载回验。目标版本 0.11.0，阶段 0 与 A/B/C/D/E/F 已完成；冻结 source e5d25cf 的唯一制品已发布并通过五资产下载回验，当前 Profile 仍 0.10.2；实际状态/证据随实施更新，禁止由旧测试或合成基准推断交付完成。当前 Profile/共享 SDK、本机安装与服务重启均不在本次授权内；不 npm publish。

## 仪器事实边界与恢复（2026-11-04；0.9.0 已完成并验证）

用户认可的只读复核结论已在 0.9.0 源码实施并验证：源码提交 `708b277a2bb6699de05c822572057b29b842d0ab`（分支 `release-0.9.0-fact-boundaries`），完整测试、闭合构建和精确制品均通过；已 push `main`、tag `v0.9.0` 并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.9.0)，未 npm publish、未安装本机 DSH/Profile/GUI。历史 0.7.0/0.7.1/0.8.0 的测试计数与发布记录不回填。

| 切片与状态 | 内容与既有 seam | 完成门禁 |
|---|---|---|
| A 文档固定（完成） | 权威决策、详细设计、术语及相关契约同步；历史实现与 0.9.0 要求分开 | 无行为已生效的越级声明；链接/空白检查；独立只读一致性复核；改动仅文档 |
| B 目录事实与兼容（已完成） | [native-executions](<../src/controls/native-executions.ts>)、[runtime-state](<../src/controls/runtime-state.ts>)、[runtime](<../src/runtime.ts>)、历史/当前投影：明确 headerCwd，停用无证的实际初始目录关联，保留 creator 事实和旧数据来源 | 详细设计 F1-F3；header=父目录的真实形态；字段冲突不任选/不 reset；无新的 cwd 解释器；不重写旧历史/binding |
| C 生命周期覆盖（已完成） | [Host](<../src/host.ts>) 与 runtime 复用已认证 session/owner/run 归属，迟到 end 不依赖 live registry；缺口入既有 health | L1-L3；dispose/end 两种顺序、重复/跨 run/无 runId；新 run 不受旧 end 影响；不改变 S/nativeStops/通知或有意关闭门控 |
| D 部分成功与恢复（已完成） | delegate 原有 journal/结果/查询分开报告创建、binding、assignment；同 operationId 只回读/回放；已有工具恢复已有 child | P1-P3；有票 confirm 失败、assign 提交不确定、显式补授权与撤权；零重复创建/再发任务/隐式授权；reconcile 不伪报票范围修复 |
| E 来源与最小指导（已完成） | [worktree-observations](<../src/controls/worktree-observations.ts>)、[消费](<../src/controls/consumption.ts>)、[客户端](<../src/client.ts>)：两种 lane inferred、清理 authored；默认工具/只读/管理 OFF 条件指导 | S1/C1；默认 7 + 条件 audit，opt-in delegate 不变；只读无需建树；按字段标来源，不新增工具/Remote/domain |
| F stale 减负（已完成） | 复用现有消费 identity、visibility oracle、刷新 gate 与提交 frontier，合并同事实/同原因重复旧正文 | C2-C3；上下文重建、不可证可见性、撤权、OFF、新待办与恢复 current；对照脚本完整旧正文减少，未知与义务不消失 |
| G 集成验收（已完成） | 完整矩阵、严格类型/闭合构建、全套测试、独立 Standards/Spec 复核；公开 seam 无模型探针与 fixture 分开记证据等级 | native+assign 单 child、send 单消息、PTC、T/S、owner 隔离、历史/源清理/旧 binding 回归；精确制品已验证，不以源码/制品代安装/GUI |

**0.9.0 结果：** 完整根套件 **997 项：794 通过、0 失败、0 cancelled、203 skip**（203 为缺显式 SDK 根/双根等环境门禁，不是加载失败）；闭合构建 **76 个 JS/DTS**，客户端 bundle **278,881 B**、8 个浏览器安全私有模块、externals 仅 `@deepseek-ai/dsh-client-ui-primitives` 与 React；vendor **85 文件、296,048 B**、root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`；beta/stable 各 27 Skills；**95 固定 + 85 vendor = 180** 个打包成员。精确 clean-source 制品 **476,121 bytes**，sha256 `756f9d48f448266e80397a736afddda30301991c483d4695cce6528151a9beac`，源码提交 `708b277`；`--prepack` 与精确 `--tarball` verifier 均通过。已 push `main`、tag `v0.9.0`（指向 `ccaac0d`）并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.9.0)；未安装本机 DSH/Profile/GUI，未 npm publish。完整记录见 [VERIFICATION.md](<VERIFICATION.md>) 的 0.9.0 节与 [dist/verification-0.9.0.json](<../dist/verification-0.9.0.json>)。

文档阶段记录的 13 个 Markdown 文档、205 个本地链接校验与独立复核作为历史保留；0.9.0 已越过仅文档阶段，完成源码、测试与制品验收。

**顺序与停止条件：** B 先固定新旧目录含义，再统一客户端/消费的来源呈现；C、D 保持各自效果与现有权限 seam，不借共享 runtime 把修复扩成重构；E 的条件指导先于 F 的交付去重。0.9.0 已按此顺序完成并通过 G。后续改动如遇到必须新增宿主证明 seam、模型工具、Remote 或 domain 的需要，仍须先返回设计决策，不能实现中默增；源码/制品通过不等于已安装或当前 GUI 已更新。

<a id="bounded-tool-outputs"></a>

## 插件模型工具输出减负（2026-11-04，源码/双轴/精确制品与下载通过；已发布/未安装）

接受范围与唯一详细契约见 [DESIGN](<DESIGN.md>) 和 [BOUNDED_TOOL_OUTPUTS](<BOUNDED_TOOL_OUTPUTS.md>)。先在本插件模型工具 Adapter 处理放大，不以任何 DSH spill/GC/PTC 改动或外部清理补丁为依赖。A/B/C/D 的隔离实现与复审修复已完成；E 的双宿主源码回归与固定 SHA 8ec081d 的双轴复核已通过；F 已完成，初始被拒候选原样封存，插件内两文件窄修复后重新固定源码并签收，从新源码构建的唯一 accepted 归档、独立严格验包及 1086 项精确矩阵（1080 pass、6 个已知 UI skip、0 fail，Manager 13/13）均通过，G 已完成非 force push、新 source tag/Release 与五资产逐字节及 strict tarball 下载回验，仍未安装本机；目标版本 0.10.0。所有者已授权 push/tag/GitHub Release，暂不为本机安装。本段不复用旧版本测试计数作为新方案验收。

| 阶段 | 工作与交付 | 完成门禁 |
|---|---|---|
| A 研究与设计（完成） | 本地原始证据、公开脱敏来源、输出面清单、预算/分页/detail/授权/迁移、本文阶段与文档索引 | 不混淆 tmpfs 与堆泄漏；默认小返回/小回执；无宿主补丁依赖；文档链接/范围/状态校验 |
| B 旧路径反馈与 Module（已实施，真实 RED→GREEN） | 合成多百版本、大 result 与约 42 MB 旧投影；从真实 model execute 返回和 render 建超预算 RED；建立插件 model-output Module/严格 DTO/UTF-8 装箱 | RED 命中原放大模式；64 KiB 当前/正文、8 KiB 回执/错误含全部转义；不先序列化全历史再截短；生产不回退 full |
| C current 与受权正文（源码与修复回归完成） | record 当前仪器恢复读（含 T/S、nativeStops、pendingRelease/树/health）及 current-only 源读取/索引、分类分页；既有 record 增 detail，按允许 domain 解析 source/version/offset；history query/detail 字节装箱/locator | 稳定分页不漏重；码点/字节/hash 重建；current 变化、purge、重挂载和撤权诚实失效；detail 自身无 capture/CAS/通知副作用 |
| D mutation 与同类堵漏（源码与全工具面回归完成） | record/window/assign/worktree 小回执；controls/resource/history/delegate/audit 全工具面有界输出；保留内部完整结果/Remote | 实际成功写不因输出预算伪报失败；window ignored/generation；assign 无其他 owner 状态；policy 部分页不可回填；audit 独立注册也覆盖 |
| E 契约/兼容与机械验收（源码与双轴复审完成） | 工具描述、schemaVersion 2、PTC 示例、旧工具卡、新 DTO 测试；300 次重复读；权限/故障/多语言/长 metadata/双版本回归 | 真实 typed value/render 均受限；内部通知、captureBusiness、FIFO 撤权、preStep/postExecute frontier 不退化；严格构建与完整根套件 0 失败，skip 明示 |
| F 生成物与精确包（完成，S2 唯一精确制品与完整矩阵通过） | 同步 lib/声明/私有 Module allowlist；clean-source prepack、唯一 accepted 归档（被拒候选另记）、精确 tarball 验证；VERIFICATION 追加实际结果 | source/lib/包字节一致；未打本次补丁的受支持宿主公开契约通过；不把内存 fixture 当 GUI/部署，不改旧版本验收数字 |
| G push / tag / GitHub Release（完成，已发布与下载回验/未安装） | 所有者已授权隔离环境中完成实施与发布；新版本目标 0.10.0，不覆盖既有版本；远端 refs/下载摘要核对 | 不 npm publish、不为本机安装，不改当前 Profile/SDK、不清理或重启；真实 GUI 现场安装另行决定 |

必要细则只在详细契约维护，本计划不复制 DTO 和 locator 规则。性能结论须分开记插件结果字节、投影成本、宿主 spill 文件与 Node heap/RSS；不能承诺旧文件自动消失或所有宿主内存问题都被解决。

## 仪器工具卡折叠与可读性（2026-11-01，v0.6.0 已发布）

已认可设计见 [DESIGN.md](<DESIGN.md>) 与详细页面 [INSTRUMENT_TOOL_CARDS.md](<INSTRUMENT_TOOL_CARDS.md>)。A-D 已完成：源码使用 baseline 原生组合，客户端类型检查、闭合构建和 122 项定向套件通过（116 通过、0 失败、6 原生宿主 skip）；CLIENT_INTEGRATION 已更新当前实现；clean-source 0.6.0 tarball 通过 prepack 与精确 tarball 验证，规范宿主全量 967 项中 764 通过、0 失败、203 skip。E 的真实 GUI 不执行，且不安装本机 DSH/Profile。发布：[v0.6.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.6.0)（tag 指向验证提交 `f6271a7`）。

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 依赖与设计 | 新设计页、DESIGN/PLAN 条目；`package.json` 增加 devDependency `@deepseek-ai/dsh-client-ui-primitives@0.2.1-alpha.1`，只更新 lockfile，避免 pnpm 重排无关条目 | package/lockfile policy；baseline 列表已含 primitives |
| B SourceCard | `DisclosureRow` + `CodeBlock` + `JsonBlock` + `Button` + `IconSparkleRegular`；纯函数生成英文 action/target 摘要；默认折叠、展开体 360px；保留 `sourceRecord`；`SourceBody` 显式接收 SummaryFace 的 `openDetails` | Client noEmit；build --check |
| C 测试 | 共享 primitives mock；更新 client.test / client-startup / client-summary-scheduler / client-settings-dom / client-native-activation；折叠/展开/门控/错误/未知/空/externals 用例 | 定向与完整根套件 0 失败；无 React warning |
| D 文档与制品 | 实施后更新 CLIENT_INTEGRATION（运行时依赖、source card、宽度/换行、测试边界）、HOST_COMPATIBILITY（baseline primitive 与 headerAccessory 边界）、VERIFICATION 新记录；重建 lib client/declaration | 构建、source/lib 一致性、包清单 |
| E 验收 | 定向测试、完整根套件、客户端构建；安装/刷新制品后单独做真实 GUI 检查 | Happy DOM 与内存 bundle 不作为图形/安装证明 |

本阶段不修改 Host `output.render`、模型上下文、工具键、timeline/rightPanel 语义或原始记录字段。0.2.2-only 的 `headerAccessory` 暂不使用，以保持 0.2.1-alpha.1 兼容。

## 原生派发优先与 execute 退役（2026-11-03；B/D/E 已完成，v0.7.0 已发布；C 已于 0.7.1 完成并发布）

已接受设计见 [DESIGN.md](<DESIGN.md>) 的同名节与 [NATIVE_DISPATCH_FIRST.md](<NATIVE_DISPATCH_FIRST.md>)。方案 A：普通无绑定 lane 用宿主原生派发；`mattpocock_delegate` 保留为强绑定创建（binding-first creation）；`mattpocock_execute` 已从 0.7.0 源码线移除。当前模型面为七个固定工具 + 条件 `mattpocock_audit`；`mattpocock_delegate` 在 0.8.0 改为 `delegate: true` 显式 opt-in 的可选第八项（客户端仍九个 wire key，供 opt-in/历史卡片）。native `subagent`/`subagent_fork`/`send_message` 与 `create_worktree` 负责普通派发。C（原生观察读取时关联/账本补齐）已于 0.7.1 完成：owner runtime document 增加 `nativeExecutions`，快照给出 coordinator-only 的 activity/worktree/lane 读取投影，工作树观测行派生 `nativeChildren`；不新增模型工具、Remote 方法、存储域或强绑定写入口。0.7.1 制品已构建并精确验证（471,954 bytes，sha256 `326a4343794609baae07b36108b2096e4cc8a6633d11d127f4caded44ee1ed70`，180 成员，源提交 `b8fe19e`），并已发布（[GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.1)，tag `v0.7.1` 指向 docs 验证提交 `770b0e7`）。0.7.0 制品（463,589 bytes，sha256 `cf4b87d8e1089f7a4437559e22646e15c0f045767e7d47eec2186f31bc0a3ea1`，178 成员，源提交 `d2dd86e`）也已发布（tag `v0.7.0` -> `ea08bdd`）。两者均未安装到本机 DSH/Profile。

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 设计与文档（完成） | DESIGN 新节；本计划；NATIVE_DISPATCH_FIRST；CONTROLS、HOST_INTEGRATION、PTC_HOOK_SEMANTICS、ADAPTER_SCOPE、STARTUP_CWD_SUPPORT、WORKTREE_BINDINGS/OBSERVATION、CONTINUABLE_WORKSPACES、CONSUMPTION、INSTRUMENT_TOOL_CARDS、README 的状态说明 | 文档间无“已移除/已生效”的越级声明；delegate 的强 binding 创建入口职责写清 |
| B 移除 execute（完成） | 不再注册 `mattpocock_execute`；删除 `executeManaged` 与 `executeNative` 包装路径及未使用的嵌套派发 helper/types；更新模型契约、consumption 注入句、client `OWN_TOOL_NAMES`/摘要/工具卡与工具计数；原生 `send_message` 的 `additionalContexts`/`concludeTurn` 由宿主处理 | 工具面断言（无 execute，固定 8 + 条件 audit，客户端 9 key）；native `subagent`+`mattpocock_assign` 单 child 回归；native send 不重复；PTC 嵌套；完整根套件 0 失败 |
| C 原生观察补齐（历史实现完成，0.7.1；实际初始目录证明未成立，见 2026-11-04 增量） | 从 `agent/created`、child header、`subagent/start|end`、`agent/disposed` 记 `native-observed` 执行事实；从原生 child 初始 cwd + `create_worktree` 做读取时观察关联（worktree=observed，lane=inferred），工作树观测行派生 `nativeChildren`；保持 S/结局/通知；不写强 binding、不替换 delegate、不新增工具/Remote。详细见 [NATIVE_OBSERVATION_CORRELATION.md](<NATIVE_OBSERVATION_CORRELATION.md>) | 观察事实来源正确；无重复派发；无新模型工具；关联不冒充强 binding；binding 读写/历史回归；完整根套件 0 失败 |
| D delegate 定位与验收（完成） | 默认指导改 native-first；delegate 明确为 binding-first creation（只在需要 ticket↔tree 强绑定或持久意图/幂等时使用）；更新 Host 模型描述、CONTROLS、WORKTREE_BINDINGS/OBSERVATION 与工具卡；方案 A 保留 delegate，不在本轮退役 | 文档/描述一致；普通 lane 不会被引导去用 delegate；强绑定成功/失败/取消/acceptance 语义不变；prepared worktree + workflow/ticket binding/assign 回归 |
| E 验证与发布（源码、制品与发布完成；本机安装未授权） | 严格构建、生成物一致、包清单、根套件、模型契约、PTC、无凭据装载；补 delegate 强绑定与 native 无绑定回归；VERIFICATION 追加记录；已 push `main`、tag `v0.7.0` 并创建 GitHub Release；本机安装另行决定 | 不把源码/内存 fixture 当发行包或当前 GUI；不改历史验证数字；强 binding 可核验；clean-source prepack 与精确 tarball 通过 |
| F delegate 默认禁用（0.8.0） | 插件 Config 增加 `delegate`（默认 false）；`mountHost` 仅在显式 opt-in 时注册 `mattpocock_delegate`；保留实现、历史 binding 与客户端历史卡片；更新 DESIGN/NATIVE/CONTROLS/README/验证说明 | 默认模型面 7 + 条件 audit；opt-in 后 8 + audit；native + assign 单 child 回归不变；无新增工具/Remote/存储域；完整套件 0 失败 |

A/B/D/E 已在 0.7.0 源码与制品准备中完成，并已发布 v0.7.0；C 已在 0.7.1 完成，观察关联与执行事实均为读取/运行事实，不是新派发路径或强绑定。0.8.0 追加 F：delegate 默认不注册，只有 `delegate: true` 才保留可选绑定式创建。`tests/model-contract.test.mjs` 现已断言默认无 `mattpocock_execute`、默认七项 + 条件 audit，以及 opt-in 后的第八项 delegate。旧 execute 测试已改写为 native/assign/delegate 回归，不能把旧测试通过当成新工具面已验收。D 不授权自动启用 delegate；若未来要删除实现，必须先有等价强绑定设计并单独更新 DESIGN。

### 0.8.0 delegate 默认禁用（2026-11-04，隔离工作树内完成；已发布；未安装）

- [index.ts](<../src/index.ts>) 的 Config 增加 `delegate` 布尔项（默认 false），并把显式值传给 [host.ts](<../src/host.ts>)；Host 仅在 `options.delegate === true` 且 runtime 提供 delegate 时注册 `mattpocock_delegate`。实现、runtime、历史 binding 与客户端卡片均保留。
- 默认模型面为 7 固定 + 条件 audit；显式 opt-in 后为 8 固定 + 条件 audit。客户端仍 9 个 `OWN_TOOL_NAMES` wire key，仅用于 opt-in/历史呈现。
- 完整根套件 **978 项：775 通过、0 失败、203 skip**（新增 config/model-contract 覆盖并更新 scaffold/plugin-manager 版本断言）；`model-contract` 6/6、client 39/39、consumption 24/24、native-executions 9/9、native-execution-runtime 8/8。
- 精确 clean-source 制品 **468,578 bytes**，sha256 `d87b0aef6c354d2ddb2653c1122fc338bb13f4c586f4b724236be91b867bd311`，180 成员，源码提交 `dfe0322`；已 push `main`、tag `v0.8.0`（指向 docs 验证提交 `3fa1d04`）并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.8.0)。详见 [VERIFICATION.md](<VERIFICATION.md>) 的 0.8.0 节。未安装本机 DSH/Profile/GUI，未 npm publish。

### 0.7.1 C 实施与验证（2026-11-03，隔离工作树内完成；已发布；未安装）

- 新增 [native-executions.ts](<../src/controls/native-executions.ts>) 的严格事实解析/事件 fold/纯投影；owner [runtime-state.ts](<../src/controls/runtime-state.ts>) 增加 `nativeExecutions`，旧文档缺字段按空数组；[runtime.ts](<../src/runtime.ts>) 在 `created`/`observe` 写入、读取投影、health、history（`kind: native-execution`）与 `nativeChildren`。
- 不新增模型工具或 Remote 方法；仍为八个固定工具 + 条件 audit（客户端九个 wire key）；`mattpocock_worktree` 描述只补充 `nativeChildren` 是读取时 observed、不是强 binding。
- 完整根套件 **977 项：774 通过、0 失败、203 skip**（新增 `native-executions` 9、`native-execution-runtime` 8、consumption 1、client 1）；定向模块/运行时/客户端/消费套件均 0 失败。
- 精确 clean-source 制品、字节/哈希/成员数、prepack 与 tarball 验证、以及 0.7.1 发布边界，统一见 [VERIFICATION.md](<VERIFICATION.md>) 的 0.7.1 节。0.7.1 已 push `main`、tag `v0.7.1` 并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.1)；未安装本机 DSH/Profile/GUI，未 npm publish。

## 仪器读取后续优化（2026-10-21）

按[摘要读取契约](<SUMMARY_READS.md>)继续实施，不把已完成的两个缺陷修复视作整个优化目标完成：先新增直接 current-only 摘要及有界认证 Remote；再接集中批读、显示 gate 与闲置 observer 回收；最后测量跨会话失效／排队、验证多会话大历史与可见性／错误恢复，再统一严格构建、完整回归、开发包字节验证及独立双轴复核。冷源加载和 OOM 归因分别限定证据，不冒称消除；FIFO 权限撤销／CAS／模型消费屏障保持。

## 最新协作功能实施（2026-10-06）

已接受范围包含工作树绑定与全仪器持久化/当前注入/历史查询的源码实施。本阶段以 [DESIGN 最新要求](<DESIGN.md>)为准，取代下方旧硬容量/重资源处置控制的行为规格。

源码已包含参考 T/S、宿主首次 cwd 源码/编译补丁、持久工作树关系、全仪器有界当前投影、摘要分页/按需详情、显式副本与源旧历史整理，以及 Host/Client 工具与操作入口。当前复审修复、严格构建和公开接口机械回归已完成；清洁提交对应的开发制品校验与不可变身份记录独立随交付保存。当前结果及验收边界见[公开验证说明](<VERIFICATION.md>)，不以历史本地记录代替本轮结果。源码交付不自动完成安装或正式发布。

| 已实现源码范围 | 当前契约与操作说明 |
|---|---|
| 参考窗口、真实程序事实与当前消费去重 | [使用指南](<../CONTROLS.md>)、[消费模块](<../src/controls/consumption.ts>) |
| 首次目录能力与可信技术授权 | [宿主补丁交付](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/host-patches/README.md>)、[宿主接口](<HOST_INTEGRATION.md>) |
| 持久意图、实际绑定、discarded/cleaned 与源 checkpoint/旧版本删除 | [工作树绑定](<WORKTREE_BINDINGS.md>) |
| 历史副本、主动查询、三源域整理及非原子部分结果 | [历史核心](<HISTORY_CORE.md>) |
| 默认七项模型工具 + opt-in delegate + 条件 audit（0.7.0 已退役 execute）、客户端历史与源清理操作 | [中文使用指南](<../CONTROLS.md#6-工具与实际权限>) |

源码实施不等于安装到当前 SDK/Profile/GUI；不授权发布、推送或历史模型 campaign。数据清理必须如实区分历史副本与源日志，不把隐藏当删除，也不以默认 TTL 破坏本 session 全工作树历史。最终能力与验证以本轮完成记录为准。

## 原生 create_worktree 事件观测实施（2026-10-13，隔离工作树内完成；未安装、未发布）

接受范围见 [DESIGN.md](<DESIGN.md>) 的 2026-10-13 决策节与 [WORKTREE_OBSERVATION.md](<WORKTREE_OBSERVATION.md>)：只观测经 DSH 工具管线成功执行的原生 `create_worktree`（含 PTC 子调度），登记创建事实、读取时创建者活动性与受权 Git 核验；不记录“目录被谁使用”，不自动清理，不新增模型工具。

本阶段授权为**隔离环境内的源码实施与机械验收**：不安装本机 DSH／Profile、不写 `<DSH_HOME>/artifacts`、不 push／Release、不启动第二个服务；pnpm 只以 `exec tsc` 和临时目录内的 `pack` 参与验证。工作树目录名保持 `dsh-mattpocock-skills`，因为既有宿主/兼容用例按该路径段匹配源码加载器（移动工作树而非改测试）。

| 阶段 | 内容 | 门禁（机械） |
|---|---|---|
| A 记录核心 | 新 `src/controls/worktree-observations.ts`：严格 parse、事件版本 fold、CAS、query；行身份（创建者会话 + 目录）、调用身份（创建者会话 + callId）、已证 Git 身份不可移动、`cleaned` 不可复活 | `tests/worktree-observations.test.mjs` 7／7 |
| B Git 核验 | `probeWorktree`：复用受权 runner 与固定 argv 契约，存在性／精确树根／common 与 git 目录／分支 ref 与 OID／路径身份；缺失即 absent，runner 拒绝即 failed + diagnostic | 同上（存在、缺失、非目录、非树根、runner 拒绝） |
| C 管线 | `postExecute` 成功分支同步 append（经 `track` 进入消费前沿）+ 异步核验；E4 存活子会话回放（source=`replay`）；快照 `worktreeObservations`、健康行、终局 item 附带 `createdWorktrees` | `tests/worktree-observation-runtime.test.mjs` 7／7 |
| D 呈现与文案 | 消费分类 + 协议文案、客户端只读列表与 `update-observation` 作者登记；`mattpocock_delegate`／`mattpocock_worktree` 文案改为 lane 自建树 + 观测登记 | 消费／客户端／模型契约用例通过 |
| E 交付面 | 固定包清单精确 +2（87 + 85 vendor = 172）；宿主与客户端重建 | `scripts/verify-package.mjs --prepack` 通过（清洁提交后） |

已观测结果（Node 24.17.0，规范根 DSH `0.2.1-alpha.2`，`DSH_CONTROLS_HOST_ROOT=<DSH_INSTALL> node --test tests/*.test.mjs`）：**851 项中 654 通过、0 失败、197 个桥用例按环境门禁 skip**。严格构建门禁 `compareCommittedBuild`（scratch tsc 与提交的 `lib/` 逐字节一致）、客户端独立重建、固定包清单（87 固定 + 85 vendor）均通过。本轮没有模型活动，也没有安装、推送或发布；绑定语义、vendor 字节与宿主补丁均未改变。

技术边界（实现中确认，写入设计口径）：快照读路径本身持有单一效果队列，回放与核验写入不得再经 `track` 重入；E4 只覆盖仍存活的受管子会话，冷会话全量补登记需要新的宿主枚举 seam，不在本轮范围。

## DSH 0.2.1-alpha.4 兼容适配（2026-10-15，隔离安装内完成；未安装、未发布）

接受范围：核对 alpha.3／alpha.4 相对 alpha.2 的宿主变化并适配。**唯一面向插件作者的变化是兼容性判定依据**——声明了 `engines.dsh` 就只按它判断，未声明才回退原有 peer 规则；本插件因此显式声明已实测范围，并补齐宿主侧 fixture 的 Peer 契约。产品运行时代码没有改动。

隔离边界：`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.1-alpha.4` 得到与 DSH 自身一致的全局布局；未改动本机 DSH 与任何 Profile，未写 `<DSH_HOME>/artifacts`，未 push／Release，未启动第二个服务，未调用模型。

| 阶段 | 内容 | 门禁（机械） |
|---|---|---|
| A 门禁声明 | `package.json` 的 `engines` 增加 `dsh: "~0.2.1-alpha.1"`；`verify-package.mjs` 导出 `EXPECTED_ENGINES` 并在 `validatePackagePolicy` 中断言；scaffold 用例同步 | 两版真身 `evaluatePluginCompatibility` × 9 个运行时版本：声明前后逐版本一致 |
| B 接缝核对 | 21 个宿主包运行时导出清单、`post-execute`、`create_worktree` 结果键、子代理目录／启动方法、会话事件名、技能注册表、`DomainFacility`、6 个客户端插槽键 | 逐项同名存在；导出清单零删除 |
| C fixture 适配 | 新增 `tests/fixtures/peer.mjs`；[host.test.mjs](<../tests/host.test.mjs>)、[host-startup.test.mjs](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/tests/host-startup.test.mjs>)、[host-collaboration.test.mjs](<../tests/host-collaboration.test.mjs>) 与 `tests/fixtures/runtime-host.mjs` 改用两版都合法的 Peer；客户端原生激活 fixture 在宿主安装不提供 `@deepseek-ai/dsh-client-ui-slots` 时按环境门禁 skip | 四个文件在 alpha.2 与 alpha.4 均 0 失败 |
| D 回归 | 全量根测试在两个宿主分别运行 | alpha.4：851 项 **648 通过／0 失败／203 skip**；alpha.2：851 项 **654 通过／0 失败／197 skip**（与改动前逐项一致） |

技术边界（核对中确认）：本插件的客户端产物不 require 任何 `@deepseek-ai/*` 模块 id（导入全为 type-only 或服务注入），因此 alpha.4 把 slots 从安装依赖改为 Web 前端 static module 不影响运行时；产品代码不构造 `PeerScope`，新契约只需要测试 fixture 满足。详细核对表见 [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>) 的 alpha.3／alpha.4 小节。

## DSH 0.2.2-alpha.2 兼容适配（2026-10-29，隔离安装内完成；未安装、未发布）

接受范围：核对 `0.2.2-alpha.2` 相对上一核对线的宿主变化并做最小适配。**唯一破坏本插件运行时代码的接缝是工具执行拆分**：旧单调用 `ctx.tools.execute(ToolExecutionInput)` 被移除，改为 executor 插件拥有的批处理入口；受管原生 `subagent`／`send_message` 派发必须保留原调用的 parent token 与 policy／guard 语义。

隔离边界：`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.2-alpha.2`，另以独立 `DSH_HOME` 安装本工作树打包制品并做无凭据 headless 装载；未改动本机 DSH 与任何 Profile，未写 `<DSH_HOME>/artifacts`，未 push／Release，未启动第二个服务，未调用模型。

| 阶段 | 内容 | 门禁（机械） |
|---|---|---|
| A 接缝核对 | 对拆 0.2.1-rc.3 → 0.2.2-alpha.2 的 24 个相关宿主包；确认 `dsh-skill` 不变，`dsh-tools` 删除单调用 execute，`dsh-subagent` 新增 `sessionProjections` 初始化，`app-boot` 把 `PROFILE_TEMPLATES` 移到 `dsh-official-bundles` | 类型声明编译与真实导出清单核对 |
| B 受管原生调用（0.6.0 历史；0.7.0 已删除） | 0.6.0 的 `src/host.ts` `executeNative` 在具备 `setExecutor` 的 0.2.2 宿主上使用公开 `@deepseek-ai/dsh-tools/pipeline` 的 `prepare → dispatch → complete`；保留 `parent` token、`rootCallId`、policy／guard／post-execute。没有该接缝的旧宿主保留单调用回退。0.7.0 已删除该工具与 `executeNative` 路径；本行仅保留历史核对记录 | `tests/host.test.mjs` 的 0.6.0 managed nesting、guard 与 parent token 历史用例；0.7.0 不再有对应运行路径 |
| C 旧 seam 类型 | 旧宿主 `startContinuable` 回退改用结构化 `LegacyContinuationFacade`，不依赖 0.2.2 已删除的声明 | 旧宿主类型编译与真实用例 |
| D 测试夹具 | 新增公开 pipeline 的单调用测试适配；0.2.2 stock 子代理／Agent 服务以 `ctx.plugin()` 或真实 `SessionProjectionRegistry` 进入 ACTIVE；管理器测试从 official-bundles 读取模板 | 目标用例全部 0 失败 |
| E 回归与装载 | 新宿主与 `0.2.1-rc.3` 分别跑全量根测试；独立 `DSH_HOME` 安装开发包并做 headless 装载；`0.2.1-alpha.1` 隔离跑兼容矩阵 | 两宿主各 **944 项、744 通过、0 失败、200 skip**（隔离工作树无 client slots 时 741／203）；alpha.1 兼容矩阵 **154 项、140 通过、0 失败、14 skip**；headless 装载 27 Skills、11 模型可见，无凭据停在 `MISSING_CREDENTIAL` |

技术边界：Skills provider、vendor 字节、通道语义、provider 优先级与 `engines.dsh: "~0.2.1-alpha.1"` 未改变；新宿主门禁仍放行该预发布线，无需 `allow-version`。没有真实模型活动、浏览器 GUI 会话或 PTC program 运行；真实 Host 的工具策略／guard／parent token 用例覆盖了受管嵌套路径。详细核对表见 [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>) 的 `0.2.2-alpha.2` 小节。

## DSH 0.2.2-alpha.3 兼容核对（2026-11-04，隔离安装内完成；未安装、未发布）

接受范围：核对 `0.2.2-alpha.3` 相对 `0.2.2-alpha.2` 的宿主变化，判断是否需要适配。**结论是不需要新的源码、包元数据或制品改动。** 已核对的接缝包括 `dsh-tools`、`dsh-session`、`dsh-agent`、`dsh-skill`、`dsh-workspace`、`dsh-storage-domain`、Typert、`dsh-subagent`、Gateway client 与客户端插槽；alpha.3 的 Cordis／Loader／Include 更新和 UI 契约变化没有移除本插件使用的入口。

隔离边界：`npm install --global --prefix <隔离前缀> @deepseek-ai/dsh@0.2.2-alpha.3`；另以独立 `DSH_HOME` 安装已发布的 `0.10.0` 制品并做无凭据 headless 装载。未改动本机 DSH、任何 Profile 或当前 GUI，未 push／Release，未调用模型。

机械证据：alpha.3 声明下根与 Client TypeScript 编译均 **0 error**，非 Client 的 78 个 JS/DTS 产物与提交的 `lib/` 逐字节相同；全量套件 **1086 项：1077 通过、0 失败、9 skip**（6 个 UI-slots 与 3 个可选源树环境门禁）；实际 `dsh plugin add` 成功，启动停在 `MISSING_CREDENTIAL` 时注册表已有 **27 个 Skills、11 个模型可见**。详细核对表见 [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>) 的 `0.2.2-alpha.3` 小节。

## 0.10.1 兼容补发与本机安装（2026-11-04，所有者指示；已发布/下载回验/已安装，未重启）

接受范围：把已完成的 alpha.3 兼容核对作为 `0.10.1` 补发，更新版本与版本断言、构建并验证唯一精确制品，push `main`、新建 annotated `v0.10.1`、创建 GitHub Release，并把同一制品安装进当前 Web Profile。运行时、工具面、DTO、vendor、宿主兼容声明和 `engines.dsh` 不变。

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 源码版本 | `package.json` 升为 0.10.1，同步 verifier／scaffold／package-artifact／plugin-manager 的当前版本断言 | 定向 tests 与 `validatePackagePolicy` |
| B 构建与回归 | 严格 Host 编译、Client noEmit、闭合客户端构建；全量套件与 alpha.3 类型根 | 0 fail，保留全部环境 skip 分类 |
| C 唯一制品 | clean-source `npm pack`，五项资产，strict `--tarball` 与独立验包 | source clean／hash／size／members／vendor／exports |
| D 发布 | 非 force push `main`、annotated `v0.10.1` 指向制品 source、新 Release 五项资产 | 远端 refs、tag object／peeled、下载 5/5 逐字节 |
| E 安装 | 同一 tgz 安装到当前 Web Profile，记录旧/新包、Profile 与配置指纹 | 安装成功、版本/字节匹配；不自动重启 |

实际结果：源码 4feafbe 的 0.10.1 制品（500,871 B，SHA-256 `c678d37d…`，184 成员）通过 strict 验包；alpha.3 精确矩阵 **1086 项、1080 通过、0 失败、6 个 Client UI-slots skip**。`v0.10.1` 已 push/tag 并发布，五资产下载 5/5 逐字节一致；当前 Web Profile 已由 0.6.0 安装为 0.10.1，安装树与归档相同，Profile 配置的 `cordis.patch.yml` 未变。当前 `dsh web` 进程未重启；当前进程是否已热加载未验证，正常重启后的 GUI 生效需另行观察。

边界：不升级本机 DSH、不 npm publish、不覆盖旧 tag／Release、不改共享 SDK 或宿主补丁、不清理旧 spill。

## 0.10.2 模型工具请求描述修正（2026-11-04，所有者指示；已发布/下载回验/已安装，未重启）

接受范围：修正 `mattpocock_controls`、`mattpocock_record`、`mattpocock_history`、`mattpocock_audit` 与 `mattpocock_worktree` 的模型可见请求描述，使其与实际顶层 `{action:...}` 解析一致；增加描述契约回归。版本升为 0.10.2，构建并验证唯一精确制品，push `main`、新建 annotated `v0.10.2`、创建 GitHub Release，并把同一制品安装进当前 Web Profile。运行时代码、工具面、DTO、vendor、宿主兼容声明和 `engines.dsh` 不变。

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A 源码版本 | `package.json` 升为 0.10.2，同步 verifier／scaffold／package-artifact／plugin-manager 的当前版本断言 | 定向 tests 与 `validatePackagePolicy` |
| B 构建与回归 | 严格 Host 编译、Client noEmit；alpha.3 全量源码套件与描述回归 | 0 fail，环境 skip 分类不变 |
| C 唯一制品 | clean-source `npm pack`，五项资产，strict `--tarball` 与独立验包 | source clean／hash／size／members／vendor／exports |
| D 发布 | 非 force push `main`、annotated `v0.10.2` 指向制品 source、新 Release 五项资产 | 远端 refs、tag object／peeled、下载 5/5 逐字节 |
| E 安装 | 同一 tgz 安装到当前 Web Profile，记录旧/新包、Profile 与配置指纹 | 安装成功、版本/字节匹配；不自动重启 |

实际结果：源码 95f7ed8 的 0.10.2 制品（501,481 B，SHA-256 `1cb5f0a4…`，184 成员）通过 strict 验包；双宿主源码与同一精确归档矩阵均为 **1087 项、1081 通过、0 失败、6 个 Client UI-slots skip**。`v0.10.2` 已 push/tag 并发布，五资产下载 5/5 逐字节一致；当前 Web Profile 已由 0.10.1 安装为 0.10.2，安装树与归档相同，Profile 配置的 `cordis.patch.yml` 未变。安装后 `dsh web` 于 2026-11-04 12:21:58 正常重启（新 PID 48436、端口 3080），新进程加载 0.10.2；controls／record／history／worktree 读取与 Skill provider 复核通过，未做浏览器截图、模型或 PTC 运行。

边界：不升级本机 DSH、不 npm publish、不覆盖旧 tag／Release、不改共享 SDK 或宿主补丁、不清理旧 spill。安装不改写当前进程；正常重启后的 GUI 生效需另行观察。

## 0.4.4 既有 Profile 原生依赖接入修复（候选，未发布／安装）

本阶段授权为既有 Profile 旧依赖接入与组件强制开启覆盖的代码修复和真实 SDK／Loader／Plugin Manager 验证。新版本 push／Release／同字节本机安装另行确认；不沿用只针对 0.4.3 的发布安装授权，不自动重启 GUI，也不静默清除当前 Profile 的布尔覆盖。

保持固定原版执行资产字节，通过开发构建器生成完整 17 个静态 import 字面量清单；14 个非 builtin 接入既有公共 Loader 的 canonical native ESM 路径，3 个 builtin 不变。仅重写已核验的字面量，普通 ESM 导入确定性 data URL；不改 SDK、其他插件依赖、全局 resolver 或 native manager 逻辑。包装器真正静态导入、原生入口、peer manifest 所有权、版本和实际模块身份仍严格一致，不以版本相等代替共享身份。

门禁已观测：旧 Profile 协议 tracer RED→GREEN；真实旧协议包只读接入的 canonical binding 与实际 Manager 安装／新启动 A/B／续用通过；Manager 关→开保存 disabled:false，诊断 forced-enabled 与 disabled 区分，已有 Fiber／服务／B child 与冻结 header 不变。源码准备／串行组合 manifest 越界 tracer RED→GREEN。当前全量根测试 761／761，0 skipped；组合 49／49、只读准备 87／87、Manager 11／11。精确候选包装边界为 83 固定文件 + 85 vendor = 168 文件、64 JS／声明；完整 import 清单与 asset／MIT／manager 区域不变。严格构建、开发包及 vendor 已通过；清洁提交的双轴复审、一次准确制品及同字节矩阵须另有完成记录，不能把源码矩阵当发行包或当前 GUI 激活证明。

## 0.4.3 产品形态与发行门禁（历史已授权阶段）

本阶段接受范围为代码修改、push、新 GitHub Release 与同字节本机安装。交付根包／子路径独立 locale metadata、一个插件作用域的功能设置、内部兼容桥来源与高级维护控制说明，以及明确组件关闭覆盖的只读原因和恢复自动选择方向。技术 id／specifier、原版资产和 root 生命周期选择规则保持不变；不声称可以隐藏框架通用开关，也不伪造 SDK reset API。

门禁：真实 Loader 关闭覆盖 tracer RED→GREEN；startup transport 兼容旧无 reason 回执，拒绝未知／矛盾 reason；真实 SDK 的根／子路径 metadata 与禁用行读取不执行 provider；Client 及真实 DOM 验证请求与内部依赖区别。随后严格构建、全量回归、四个精确 locale 归档路径、clean-source 一次 pack、同字节实际安装矩阵、隐私检查、新不可变标签／六项公开资产、全部下载复核和原样本机安装。首次 cwd 实际支持仍依赖运行事实，不由 metadata／安装回执推定。

本机已授权的旧关闭覆盖仅撤销该 override 以恢复自动选择，保留启动请求与其他 Profile 字段；不强制开启、改共享 SDK 或自动重启。旧版本／资产不覆盖，npm 不发布，原始日志／快照不公开。

## 单包兼容接入：0.4.2 发布与安装门禁（历史已授权阶段）

接续[最新单包要求](<DESIGN.md#单包兼容支持的交付要求>)：验证固定版本的插件内部兼容服务，通过公开 bundle／loader 生命周期在真正启动时选择唯一提供者，保持当前热重载服务、原始 native 配置、首次 cwd 及原地续用语义。相同 recipe 的旧管理记录跨版本接续，不把维护转回用户。仅有管理器或文案修复不构成完成。

验收沿用公开配置组合／真实 Loader 与 native 创建／续用接口；要求无模型的首次安装热重载、普通重启、用户停用／覆盖、自定义 Profile 拒绝、A/B 工作目录、原始 spawn/fork、冷恢复、权限与路由、版本与制品校验。单包源码与开发制品已完成验收；当前所有者已授权 0.4.2 的 push、GitHub Release 和本机插件安装。须重新升版、清潔提交并构建一次准确发行包，再复核同字节安装矩阵、远端标签及下载摘要；不覆盖旧资产、不发布到 npm、不自动开管理／启动请求，也不擅自中断当前服务。准确发布与本机安装事实分别记录，公开材料排除本机快照；进度见[接入说明](<PLUGIN_MANAGED_COMPATIBILITY.md>)。

## Current optional controls implementation — 2026-10-06（旧规格历史验收）

**本段为前一阶段旧规格验收，不是本轮新行为完成声明。** Repository-local TypeScript Host/Client/control implementation and mechanical validation were complete for the then-supported seams. The earlier [completion matrix and verification（本地原始记录不公开；参见验证范围）](<VERIFICATION.md#historical-evidence>) distinguishes implemented features from installed-host unsupported guarantees; usage is in [the shipped guide](../CONTROLS.md). This does not satisfy or authorize the historical Phase 5 behavioral campaign, owner activation or private release gates below.

Current shape: immutable Skill provider plus optional lazy runtime, revisioned workspace policy, durable owner-scoped instruments, independent rolling T/S, safe resource retention, actual consumption, durable owner notices and native UI. Current host gaps remain native wake admission gating (2026-10-10 update: the host subagent catalog provides descendant membership and live Agent.status drives S, projected in memory from event-maintained membership; observation is not a gate), initial independent continuable cwd, cold-resume closure and multi-root Git writes. Preserve unknown/fail-closed/retention rather than inventing enforcement.

## Phase 0 — Repository Baseline

**Status:** Complete.

- Keep both GitHub repositories private.
- Confirm the source distribution default branch and immutable tag are reachable.
- Commit this design baseline before runtime implementation.

**Gate:** clean local worktrees, private repository visibility, and matching remote commit IDs.

## Phase 1 — Package Scaffold

**Status:** Complete.

- Create the TypeScript ESM package and exact development lockfile.
- Add the one-row `cordis.patch.yml` and Schemastery channel config.
- Add downstream license and third-party notice structure.
- Define a strict package file allowlist.

**Gate:** package metadata and patch parse successfully; no client entry, install lifecycle script, or runtime network dependency exists.

## Phase 2 — Verified Source Ingestion

**Status:** Complete. The pinned Beta union contains 26 Skills and 81 vendored files (212,143 bytes); offline inventory root SHA-256 is `1e6182fe1e430a5f653be3b33e9340e19ff8a812d0f7bb7bbc44da10fb9c6a50`.

- Implement explicit tag/commit source ingestion.
- Vendor the complete Beta union from the source manifests.
- Generate Stable/Beta membership, frontmatter metadata, body offsets, provenance, and per-file inventory.
- Add check mode and clean-staging replacement.

**Gate:** a second generation produces no diff; extracted vendor files verify without Git metadata; every vendored source-owned byte matches the source distribution.

## Phase 3 — Immutable Provider

**Status:** Complete. The immutable provider passes 13 direct/registry provider tests against `@deepseek-ai/dsh-skill@0.1.2-rc.1`; the complete suite has 27 passing tests, including anchored root/intermediate/final symlink drift and deterministic active-read cancellation regressions.

- Implement the Host provider over the generated catalog.
- Implement static `list()` and exact lazy `get()`.
- Preserve DSH invocation policy and package-directory resource bases.
- Use `source: bundled` and rank 600 through the DSH constant.

**Gate:** provider contract, abort, drift, membership, resource, and precedence tests pass against the actual DSH registry package.

## Phase 4 — Build and Artifact Verification

**Status:** Complete. The checksum-bound 98,347-byte development artifact from commit `7adf8b352153dff8beea42f9f4ba002502d3c504` passed the exact 97-file archive gate and all four isolated DSH 0.1.2-rc.1 probes; details are recorded in [PHASE4_ARTIFACT_VERIFICATION.md](PHASE4_ARTIFACT_VERIFICATION.md).

- Prove a scratch TypeScript build exactly matches committed `lib/` and declarations.
- Build one accepted private development tarball into a fresh mode-0700 external directory, then bind its identity immediately with source commit, pnpm version, size, and SHA-256 records.
- Verify its exact 16 fixed files plus the closed 81-file vendor inventory, extracted provenance, modes, entry points, and absence of source/client payloads.
- Install the exact local checkout and checksum-bound tarball in separate isolated `DSH_HOME` roots using the `headless` profile.
- Inspect identical composed Stable/Beta configs and query both installed providers through an actual booted DSH Skill Registry without invoking a model.

**Gate:** the disposable pnpm-pack regression and sole accepted tarball pass `scripts/verify-package.mjs` under pnpm 11.8.0; `scripts/verify-isolated-dsh.mjs` securely creates and removes fresh homes, normal installs request no package build approval, all four composed configs are asserted, checkout and private-snapshot tarball registry reports match byte-for-byte across per-Skill invocation and lazy-definition hashes under DSH 0.1.2-rc.1, `implement-spec` appears only in Beta and remains model-disabled, and no custom Web module or owner-profile change is needed.

## Phase 5 — Behavioral Evaluation

Run the `implement-spec` campaign from clean fixture repositories. Capture the designated model route, DSH version, complete transcript, Git graph, test output, and cleanup state.

**Gate:** meet the evaluation pass policy without editing the vendored `implement-spec` body.

**Status:** closed and failed. The campaign definition, harness and raw records are evaluation material rather than package content, and are archived outside this repository.

## Phase 6 — Owner Profile Enablement

- Keep existing community Matt Pocock/Superpowers adapters disabled to avoid duplicate providers.
- Install the verified checkout or tarball into the owner’s `web` profile.
- Override this bundle row with `channel: beta`.
- After the agreed activation step, restart the selected DSH Web profile and refresh its configured Web URL.
- Verify slash discovery and one real `/implement-spec` invocation.

**Gate:** active profile resolves this provider, local/project overrides still win, and unrelated profile configuration remains unchanged.

## Phase 7 — Private Release

- Create a versioned private Git tag only after all previous gates pass.
- Build one tarball once and record its SHA-256 and provenance.
- Optionally attach that exact tarball to a private GitHub Release.
- Do not publish to npmjs until npm scope ownership and public-release intent are separately approved.

## Completion Definition

The first implementation is complete only when deterministic tests, isolated DSH installs, the real behavioral evaluation, active-profile verification, clean worktrees, and private remote synchronization all pass. Documentation must describe observed behavior rather than intended but untested behavior.

## Optional workspace controls — phased implementation (2026-10-06)

The accepted extensions are specified in [WORKSPACE_WORKFLOW_CONTROLS.md](WORKSPACE_WORKFLOW_CONTROLS.md): workspace policy editing, session-instance lifecycle/dual-window instruments, task-defined ticket progress and persistent pending decisions. [SESSION_INSTRUMENTS.md](SESSION_INSTRUMENTS.md) records accepted GUI principles, owner-session/descendant identity, per-instance T/S, model-led business updates versus program execution facts, nonjudgmental ticket-slot handling, decision attribution and isolation/recovery tests. Accepted clarification excludes plugin-owned business correctness/approval gates: the model decides when to register or resolve matters and when tickets complete/pause/cancel, then updates instruments; deterministic T accounting is not semantic certification. Enabled dual windows still require deterministic admission plus minimal agent protocol injection, with explicit off behavior; optional user project instruction tuning and unvalidated-prompt handling are described in [INSTRUMENT_GUIDANCE.md](INSTRUMENT_GUIDANCE.md). Mechanism-only tests and separately authorized model-behavior tests are distinct gates. These are not completed phases or changed historical outcomes. Individual refill, ticketless research, program-only execution receipts and automatic state consumption remain required; [REACTIVE_WINDOW_INSTRUMENTATION.md](REACTIVE_WINDOW_INSTRUMENTATION.md) identifies existing same-model-step hooks. Before implementation, settle concrete client seats/schema/defaults, supported binding/admission/retirement seams and instance authorization; then run the isolated no-model matrices including two sessions in one workspace, custom states and offline/stale decision handling. Live GUI/profile changes and real-model trials remain separate decisions.

The accepted phased implementation begins as follows. Phase 1 uses the existing strict TypeScript ESM build for policy inheritance/revisioned saves, owner-session identity, atomic persistence and isolated recovery tests. It does not mount new host tools, admissions or GUI. Concrete first-stage interface, unset-capacity handling, storage ownership and test evidence are recorded in [CONTROLS_CORE.md](CONTROLS_CORE.md); The second phase continues: Phase 2 implements unmounted task-defined ticket progress and pending-decision records, per-instance event persistence, actual-author/assignment checks and independent viewer revisions; see [INSTRUMENT_RECORDS.md](INSTRUMENT_RECORDS.md). Later window/admission, resource and host/client integration stages remain pending. Historical release and evaluation gates are unchanged.

## 可选交付监督（2026-10-30；Stage D/E 后端与可选 reviewer 已实现，真实模型/UI 缺口明确）

设计范围见 [DESIGN.md](DESIGN.md) 第 17 节；完整设计见 [SUPERVISION_PLAN.md](SUPERVISION_PLAN.md)，只读实现评审见 [SUPERVISION_IMPLEMENTATION_REVIEW.md](SUPERVISION_IMPLEMENTATION_REVIEW.md)。当前实现独立配置、operator-only remote、工作区设置页、内存工作台账、可选 mattpocock_audit 读工具、按 owner 持久化的审计 episode、事件驱动的定期/嫌疑判断、dry-run、可选 inherit/explicit reviewer 路由、alert 门槛、固定 agent 注入句和只读 episode 历史；监督仍默认关闭。

| 阶段 | 内容 | 门禁 |
|---|---|---|
| A | 范围与设计文档更新（本节、DESIGN 第 17 节、ADAPTER_SCOPE 例外） | owner 认可；文档同提交；不改运行时 |
| B | 独立 supervision 配置文档 + 工作区设置页（已实现）；功能仍关闭 | 全局默认/稀疏覆盖/显式保存/修订；不扩展 PolicySnapshot wire；operator-only remote、30 天/2000 条 episode 保留配置 |
| C | 内存工作台账 + 可选 mattpocock_audit 工具（已实现） | PTC 嵌套写分类、无写放大、失败隔离、不注册 /audit slash；未启用不注册、禁用即移除 |
| D | 持久化 episode + 事件驱动定期审计 + dry-run（已实现）；固定时间核心测试覆盖到点/预算 | 到点、无新活动不触发、每小时/每日调用与 token 预算、重启后恢复、dry-run 不投递 |
| E | 嫌疑/停滞 + alert 门槛 + 固定模板投递（后端已实现；票级/工作区 suspicionMode；研究/评审标记；ticket-level 归因摘要） | K/阈值校准、agent 注入不打断、去重/冷却；未归因写入显式保留 |
| F | 可选真实模型 reviewer（代码已实现）；真实模型试验未运行 | 单独授权；独立评估记录；不混入机械测试；缺路由时 fail-closed |

D/E 后端和 F 的可选调用路径已实现并通过机械测试；token/每小时预算与只读右栏 episode 列表已补齐。真实模型试验仍未完成。安装、激活、发布、真实模型调用仍按仓库既有独立门禁处理；本轮未为本机安装。

机械验证（2026-10-30，未安装、未调用真实模型）：

- 配置核心 5／5；工作台账 4／4（含 ticket 归因）；审计核心 4／4（含每小时/token 预算）；host 真实 Typert/Remote/工具注册/持久化 episode 测试 39／39，包含 operator-only、独立修订、未启用不注册、禁用即移除、策略不变、scheduled dry-run 和只读 episode remote；Client DOM 30／30 与 client 37／37，包含独立保存、只读监督历史和右栏列表。
- 全量套件 **964 项：764 通过、0 失败、200 个宿主隔离用例按环境门禁 skip**。
- 独立 scratch 构建 **74 个 JS/声明产物**逐字节一致；包清单 **93 固定 + 85 vendor = 178**；开发包精确清单与无依赖 controls smoke 通过。
- 未运行 clean-source prepack（工作树非清洁时被设计拒绝），未安装、激活、发布或调用真实模型。
