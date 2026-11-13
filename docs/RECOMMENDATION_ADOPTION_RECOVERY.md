# 推荐采纳与待决上下文恢复（0.21.1）

## 状态与授权

2026-11-13 所有者认可只读诊断后的三项修复建议，明确要求先固定文档，在隔离环境与 subagents 完成开发和测试，再 push、发版并为本机 DSH 安装。当前为实施前冻结；源码、测试、制品、发布、磁盘安装和实际加载分别记录，不提前宣称完成。基线为 origin/main 的 0.21.0 后交付文档提交。

授权只覆盖本插件的推荐采纳指导、决策消费投影和必要回归、生成物与发布安装。禁止自动采用/关闭生产事项、批量改 pending/await/included/excluded、迁移或清理业务数据、启用管理/预授权、修改共享 SDK/vendor/channel/provider precedence、npm publish、覆盖旧 tag/资产或自动重启当前服务。安装使用同一经下载回验的归档和官方 PluginManager；没有安全公开热激活入口则报告已安装待重载，不 touch patch 伪造 HMR。

## 问题与证明边界

只读现场观察到持续预授权仍 active、创建真实用户问题成功返回精确 candidate，但没有第二次 adopt 调用；作者任务文档把候选与额外操作许可混为一处并继续等待真人。另有四条旧 awaiting 标记与一条 pending-user 进入同一按 ID 排序的消费集合，1850 字符裁决预算持续只展示旧 awaiting 行，新 pending 正文没有进入自动注入。原始会话内容/标识/日志只保留在本地，不写入公开 fixture。后续真实人工答复解决了选择，不证明推荐采纳路径已恢复。

这里区分三件事：推荐的提出/支持、在有效预授权下显式选择、实际执行与任务落实。推荐支持不是自动裁决器，也不能保证真实模型一定服从指导。改进指导和恢复可见性不能冒称 SDK 环境已经恢复或所有长期会话零积压。

## 冻结的行为契约

### A. 显式采纳指导

- 保留 capability 与当前 active owner-instance/assignment 前提、仅新项创建绑定、推荐严格等于唯一 options.key 的资格。没有候选或资格未知时仍走普通真实用户提问，不追认旧 backlog。
- 合法 candidate 应在 SAME decisionId、使用当前 business CAS 和返回的精确 optionKey/decisionRevision/policyEpochId/policyRevision 显式调用 adopt-decision-recommendation；不重复要求用户确认已由当前预授权覆盖的同一个路径选择。candidate 本身不是 selection；只有成功 adopted 回执才记录选择。
- 路径选择可以成立而其后续操作尚无权限/缺外部输入。例如选“由环境维护方提供只读 runtime，本会话不修改 SDK”后，仍等待实际合格输入，禁止自行安装/下载/修改 SDK；不能因后续输入未就绪而重复索要同一次选择。真正不在现有权限内的操作继续受原限制，不以采用扩大执行权限。更高优先级/任务明确要求本人逐项确认仍优先，不绕过真实限制。
- 冲突/过期/撤权/人工答复先提交时重新读取当前真实状态，不循环重试、不伪造 adopted、不重放旧授权。保留 result/references/await/任务承诺，作者仍是 agent，不冒充用户刚刚答复或任务完成。
- 同步消费协议与固定模型工具说明，不动态改变 schema 或新增自动调用/后台扫描器。

### B. 决策专用的有界恢复投影

- 先分优先级再按稳定复合身份排序：pending-user 且当前 support=candidate；其他 pending-user；其余 pending；仅 awaiting 的兼容记录。不能从自由 status/label/年龄猜优先级或自动判断解决。
- 仍使用现有 decisions 类别、1850 字符预算和完整集合 currentFactsSignature；不能增大总预算、让长正文/完整 epoch/history 重新放大输出。保留真实 shown/total/more、总计数与受权续读入口。高优先级行在通常合法标识下至少能以精简形式展示，不因先遇到长 question/result/options 而整行被旧 awaiting 遮蔽。极长合法身份超预算时诚实省略并保留计数/类别查询，不能截断身份或制造可执行 token。
- 保留 pending/addressee、sourceRevision 与当前 recommendationSupport（candidate/adopted/not-eligible/unknown）及当前读取定位。能容纳的 candidate 字段必须完整精确；不能把截短 key/epoch/id 当可采纳凭证。过长时只给 support 状态与当前受权读取定位，由读取获得当前完整字段及 business CAS，不能靠旧注入猜值。
- 已采用来源可给紧凑 selectedOptionKey/sourceRevision/policy 引用与受权详情；不能因无 result 文本就遗失选择来源，不能回灌完整 policy/历史。旧 awaiting 的答复/约束仍可受权查询，不能为突出 pending 而删除或自动清账。
- 当前问题/支持变化、归零/删除、隐藏/OFF、未知/失效、尾部内容变化、同一 epoch 的 feature 关闭和恢复仍正确反映。保留原 fixed durability frontier、当前权限/FIFO、baseline可见性与取消/迟到结果契约。
- 本批只细化独立 owned snapshot 的表示，不改 model tool DTO/Remote/存储 wire 或核心资格/采纳语义；不是用 UI summary 代替当前消费。

## 预先确认的测试 seams

沿用 [推荐支持契约第4节](<COLLABORATION_RECOMMENDATION_SUPPORT.md#4-预先确认测试-seams-与证明边界>) 和 [消费契约](<CONSUMPTION.md>) 已确认的公开接口，不新增私有调试 seam：

| seam | 必须捕获 | 不证明 |
|---|---|---|
| InstrumentConsumption.readForConsumption + 真实授权当前决策形状 | 4旧await+1晚排序pending的RED→GREEN；pending/候选优先；大背景/选项/结果与长身份；准确预算/计数/定位/来源/尾部signature | 实际模型一定采纳、生产GUI已更新 |
| createRuntime.preStep/postExecute + 实际 policy/record 组合 | active→candidate→恢复；支持关闭/过期/unknown/普通编辑/人工先答；当前权限及快照恢复 | 合成fixture是生产会话或SDK已修好 |
| mounted mattpocock_record execute/typed/rendered/PTC 与固定description | 同项显式采用与路径选择/执行权限分离；candidate≠adopted；回执/后端拒绝边界未改变 | 文案断言等于模型服从度测试 |
| 既有 source/精确归档、RC1类型/装载/原生/浏览器/正式headless | 生成物、公开导出、vendor与安装兼容；回归和相同制品身份 | 当前Host/浏览器已加载 |

每个实现竖切先运行能命中特定问题的 RED，再最小 GREEN；不改编译产物字符串制造假RED，不以私有函数/Map测试代替真实调用者。关键新测试不得 silently skip；旧环境skip须说明并以现有精确RC1fixture补验。无新增真实付费模型试验。

## 切片与交付门禁

1. D：主代理先提交 DESIGN/PLAN/本契约与相关入口，保护原dirty checkout。
2. C：独立单writer工作树子代理改消费优先级/紧凑行/协议及对应公开seam回归，交付RED/GREEN命令与commit。
3. G：独立单writer工作树子代理改固定工具指导与mounted/Runtime回归；不并发改C文件。主代理串行集成和解决冲突后重测。
4. V：独立Standards/Spec复核关闭必改项，RC1完整源码suite/严格类型/构建一致性/vendor与原生/浏览器门禁；只实测DSH0.2.2-rc.1，保留engines >=0.2.2-rc.1与Node >=24.9.0。
5. R：冻结新补丁版0.21.1的clean source和唯一tgz；严格source-bound与精确归档完整门禁；新annotated tag/非force push/五资产Release，下载逐字节及strict回验，不移动旧tag或重pack已发布制品。
6. I：备份并通过官方PluginManager安装相同归档，只允许目标依赖/lock正常改变；核对包字节、配置和业务数据保护、原监听服务、Host/浏览器实际加载状态，不能拿落盘版本代替激活。结果追加VERIFICATION/机器摘要，历史数字保持。
