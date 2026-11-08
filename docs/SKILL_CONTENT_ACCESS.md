# Skill 正文获取与 user-only 提示契约

状态：2026-11-09 所有者认可；先固定文档，再由隔离子代理实施、验收、push／Release／安装。目标版本 0.17.0，开发基于现行 0.16.1 之后的 main，而非旧工作区。

## 产品原则

本插件提供可靠、完整的 Skill 正文和来源；模型结合用户任务、上下文和既有约定判断如何采用工作流。上游 user-only 是使用定位提示，不是正文获取禁令。加载不等于必须启动／完成全部步骤，也不扩大任何实际操作权限。

自然语言点名只是用例，不做意图分类器、特批分支、单轮 token、业务白名单、read/execute 模式或新审批仪器。默认开放，不增加旧严格模式开关。依旧只使用宿主标准 skill 工具。

## 上游与适配层分离

- vendor 文件、原始 frontmatter、generated catalog、清单 hash／provenance 保持原字节与原语义。不得将有效暴露策略回写原始 catalog，或宣称上游改变了政策。
- provider 从原始 catalog 派生有效候选：原 model=false、user=true 的条目变为 model=true、user=true；其余三种组合保持原值。明确的 false/false 不自动启用；userInvocable 不改变。
- 原始 CATALOG 是来源 invocation 的唯一权威；候选／definition 使用同一有效 invocation、description 和现有 metadata，候选仍不可变。原始 metadata 完整保留，不以新增字段覆盖来源键。
- 对原 user-only，description 前置短标记，明确 upstream user-only、正文可供 agent 获取；原描述继续保留，不能暗示必须立刻执行。其他描述不增加无关触发规则。
- channel 成员、默认渠道、rank／provider precedence、同名覆盖、workspace 分发开关、作用域和所有真正工具权限保持不变。不引入实验性 chief-of-staff 或升级源集。

## 模型可见的加载结果

provider 完成既有路径、文件身份、hash、frontmatter 边界和 UTF-8 验证之后，返回稳定的插件适配前言加一份完整来源正文。此处明确修订旧的 definition.content 必须等于裸 body 的呈现契约；不修改来源正文中的任何句子。

- 前言与原文清晰分层；保留从 bodyByteOffset 解码的原文为逐字相同的连续内容，且仅出现一份。推荐原文作为结果后缀，避免结束包装改变原文尾部。
- 前言携带来源调用定位（至少 user-only／model-invocable／disabled 的准确区分）和真实源文件定位。对于原 user-only，说明“上游将其定位为用户主导流程；本适配器允许正文获取，按任务和上下文判断如何使用”。不得要求用户逐个点名、重新审批或强制 slash。
- 所有加载结果携带资源说明：相对资源以 resourceBase 解析，主正文已返回，附属文件按需读。普通 render、slash 和 PTC typed content 都能看见，不依赖可选协作仪器或全局 hook。
- 提供 sourceFile 和 sourceBodyStartLine（或等价明确文本），以本次已验证 bytes 的 bodyByteOffset 前的 LF 数量 + 1 计算原正文首行；含空行、CRLF、多行／多字节 frontmatter 不猜行号。它是源文件定位，不是适配前言的行号。
- 前言不含时间、随机值或会话身份；同包同路径结果稳定。路径以 JSON 字符串或等价安全编码表示，防止文件名换行／控制字符伪装为指令。资源根沿用既有 resourceBase，不扫描或预读目录，也不依赖硬编码安装位置。
- 不新增模型工具、工具参数、Remote 方法或存储域，不修改全局 DSH／SDK。当前宿主丢弃 metadata 时也不丢使用定位，因为提示在 description 和 content 中。

## 仍需保留的机械约束

保留 exact-candidate 身份、受信路径／no-follow／inode、源 hash、frontmatter 边界、UTF-8、abort reason 传播、workspace delivery gate 与隔离作用域；失败不输出半份正文，不伪报加载成功。未知名称、provider precedence 与真正被关闭的能力保持原处理。不因放宽 user-only 绕过任何其他宿主限制。

子代理与主代理同样使用 provider 的有效定义；不根据消息来源判定是否可读取。消息 provenance 独立缺陷不在本次修复，也不以它建立新的 Skill 准入。

## 实施与验证 seams

所有者已认可讨论中的验证面，测试以以下真实公开 Interface 为主，不凭内部 helper 单测冒充 loader 验证：

1. provider list/get：四种 invocation 组合、目录标记、定义/候选一致、来源 metadata 不变、exact body 单份、定位/资源、损坏/abort/gate/no-symlink；合成前言覆盖 LF、CRLF、多字节与多行 frontmatter。
2. 实际 SkillRegistry + 原生 skill loader：当前两个 channel 的全部条目可成功返回正文；16 个原 user-only 的原始值仍 false/true；关闭与同名覆盖继续有效。普通 scope 与 child-like scope、完整 printed PTC typed value 与 rendered view 都覆盖。若完整 PTC 或 live child seam 不具备，须用真实 tool.execute + typed/rendered 独立说明覆盖，不将内部结果日志冒称模型可见。
3. 原有 source-ingestion、catalog、source provenance 测试继续断言原始来源的 11/16 划分；仅修改有效暴露／模型正文的旧断言。不通过改 vendor 或原catalog使测试通过。
4. 源／精确归档完整回归、声明严格类型、生成物一致、vendor／渠道不变；受支持 baseline 与实际 rc.1 隔离 headless 都做 stable/beta 装载。承接既有 release 门禁，skip 和验证覆盖如实列出。
5. 行为评估使用隔离／合成任务与可观察行为：为解释获取、任务内复用、讨论/暂不执行、加载不扩张任务、子代理复用和资源读取。它们是评估，不变成程序场景分支。没有真实模型执行就仅报告机械评估/提示审查，不伪称智能行为通过；不擅自启动付费 campaign 或真实有副作用工作流。

实现每个纵切保留实际 RED→GREEN，独立 Standards／Spec 复核必改项关闭后才冻结唯一 clean source 和归档。

## 交付与授权

先提交本契约及 DESIGN／IMPLEMENTATION_PLAN 修订，再派单 writer 隔离树实施。原主检出的既有 dirty 文档保持不动，不整体复制旧文档覆盖新线。用户已明确允许本次 push、新版本 Release 和本机安装；此前各旧版本“暂不安装”仅保留历史含义。

- 非 force push，新 annotated tag、新版本资产，既有 tag／Release 不覆盖，不 npm publish。
- 构建并验证一次 accepted tarball，source/tag、校验和／发布证明／验证摘要和 Release 使用相同字节；发布下载后 strict 回验，再用同一制品安装。
- 使用 DSH 支持的 Profile 包管理／装载入口；备份受影响配置/锁文件，保留其他插件、工作区设置和管理策略，不手工覆盖 node_modules 或修改共享 SDK，不迁移／清理业务数据。
- 安装不自动等于当前服务已激活。优先验证宿主支持的无中断装载/更新；不得擅自终止承载本会话的服务、启动替代 GUI 或重启。若只能下次启动生效，报告“已安装，当前运行时待重载”，不伪称现场已更新；继续完成可做的安装一致性验证。

## 证据与范围

上游调用通则见 [invocation](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/.agents/invocation.md#L3-L22)；解释前读正文见 [PR1194](https://github.com/mattpocock/skills/pull/1194)，实验性 procedure 复用见 [PR1363](https://github.com/mattpocock/skills/pull/1363)。这些支持分层，不能宣称上游已普遍开放自然语言 Skill-tool 豁免。本次是所有者明确认可的下游适配语义。

本契约冻结时尚无本轮实现／测试／发布结果；最终真实状态追加到验证文档，不改写旧版本交付事实。
