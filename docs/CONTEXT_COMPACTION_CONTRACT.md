# 模型上下文精简：调用契约、当前摘要与按需审计

## 1. 授权与基线

2026-11-14，所有者认可只读检查的第一、第二批，明确要求先固定文档，在隔离环境／subagents 开发测试，push／发版，暂不为本机 DSH 安装。基线公开 main `8ff0d7e8f4bc1fe72ff3a7327e907677c0fba8c9`（0.22.0 后审计文档）；目标 **0.23.0**。本页为本批实现和验收契约，不是完成声明。

不继承任何旧批次本机安装许可。不得改现有 Profile、全局／共享 SDK、运行 GUI 或生产业务数据；不得自动激活／重启、启用管理／预授权、迁移／清理业务或旧 spill、npm publish、覆盖旧 tag／资产。原 dirty 主检出与此前审计工树不修改。本批开发工树结算时记录保留／清理处置。

## 2. 已接受的设计

三个职责分开：**工具描述是调用契约，自动注入是当前行动摘要，显式受权读取承担详情与审计**。优先在现有投影／正文 seam 深化 Module，不增加模型工具名、存储域、Remote 方法或通用工作流审批 gate。

### G：第一批工具描述减重

- 按工具／action 能力生成必要输出指导；不再对每个只写工具重复整个正文拼接协议。实际 record detail 入口保留 canonical JSON／UTF-8、按 next 原样续读、拼齐 done 后解析、来源／scope 改变重开等完整契约；其他返回 locator 的读工具保留明确指向及非凭证语义。audit 独立注册仍纳入检查。
- record 的公共 command 字段在同一描述中定义一次，各 action 列类型明确的差异；purpose 与 action rules 的同义提醒合并。不得只抽源码常量而仍向模型重复发送同文。
- 保留每个工具的关键权限与效果：完整稀疏 policy intent／同修订重建，result 旧文本／结构／null 与能力检查、整体替换／省略保留、references 声明语义，真实答复／pending／awaiting 和推荐候选≠采用，window generation／显式 release，真实直接 child 与父链交集，history coordinator-only／source CAS，resource 只读及 live／durable 区分，worktree authored／observed／inferred／strong binding 区分，delegate accepted／unknown 不重派。
- 保持固定注册、generic request:json 与严格领域 parser；不假称嵌套 schema 已强制，不按普通运行状态重注册工具，不修改 vendor Skill 正文或 provider/channel 语义。

### C：第一、第二批紧凑当前注入

- 同一 owned snapshot 内保留短共同底线、当前开关／限制、未结义务／异常、精确摘要与合法恢复入口。OFF 使用短协议，仍明确覆盖旧协议、禁止新登记／自启用且保留合法 closeout；有旧义务仍可见，不以 OFF／hidden／count 推断完成或清除。
- notices 只表达需要处置的变化／动作，不再次逐行转述 facts。普通正常结束 native execution 默认只给数量与受权读取入口；live、异常、nativeStops、未知结局、关联未结义务仍突出。仅是模型投影，不删除／更写任何执行或业务源。ended/completed 不是业务完成或资源释放证明。
- 已知空类别可统一紧凑表示，并明确其含义；不得与缺能力、restricted、unknown、not-recorded 或 null 合并。集合计数与覆盖语义保持诚实；查询模板可集中一次，但每个非空／省略明细必须能通过当前真实权限下的精确请求恢复。不得将 assigned child 引导到 coordinator-only history。
- 默认下沉配置继承／display 来源、冗长 Git 核对材料和普通执行诊断到现有受权工具读取；保留有效开关及其实际 unavailable／unsupported 原因、配置修订、身份／scope、T/S 的 capacity／used／下界与 depth、能力／健康、待决／awaiting／结果条件／pending-release／待处置树的计数与关键行。大字段和长身份不得伪装成完整值或换成另一可执行 ID。
- 下沉仅针对现有权限下确有恢复路径的材料：effective policy 经 record read 概览／policy.detail，worktree-observation Git check 经当前 query／返回 detail。native-execution 当前来源为 live-current-only、并非 durable detail；普通短行可由当前 query 恢复，长诊断若仅有协调者历史覆盖，不向 assigned 宣称可取。resource 物理文件列表在现有模型工具也仅计数，故保留原有有界物理 facts 投影，不把它删去后伪称有完整恢复。本批不新增恢复 action 或扩大权限。
- 所有被省略尾部、普通结束记录、细节下沉及实际物理事实的变化仍须进入去重／当前事实指纹；不能只比较可见前缀／数量。不为缩字删除真实 provenance 或 unknown 标记。只对已知空且无行动意义的重复元数据精简；内部完整检测不能依赖精简正文丢失的字段。
- 消费本体仍保持 preStep／postExecute 的固定 durability frontier、每次当前权限与来源新鲜度、取消、同 admitted step 至多一份、实际可见 baseline 判断、compaction／冷恢复重装、stale／timeout 明确覆盖。**不做 delta-only、不永久仅注入一次、不自造历史消息替换／删除器，不以缓存命中当送达。**

### O：输出保持与边界

本批不更改既有模型工具 envelope `schemaVersion:2`／`representationVersion:2`、64KiB 读／8KiB 回执错误预算、精确小结构／独立 previews、next 与旧 cursor／locator 字段、正文 hash／版本／授权绑定。工具 descriptions 与 owned consumption 文本是本批主要减重面；工具返回 typed value 与 rendered text 必须一起验收。紧凑注入表示如改变字段，文档／测试明确，不把历史字段变更冒称工具 envelope 版本升级。

后续候选（本批不实现）：cursor／locator 兼容退场、小 policy 值内联、全新 recovery action、嵌套 schema 改造、持久数据格式迁移。V5 结果及写入后旧版回滚边界继续沿用 0.22.0。

## 3. 预先固定的测试 seams

| Seam | 必须捕获 | 不证明 |
|---|---|---|
| 实际 mounted defineTool descriptions／typed execute／render | 默认七工具、条件 audit／delegate 的类型及关键规则可发现；合法例子可执行，反例仍拒绝；注册稳定；实际描述字节减少 | 模型必定服从、生产 provider cache |
| InstrumentConsumption 公开 readForConsumption／cachedText | OFF 空／旧义务、ON 各功能、live／正常结束／异常与长身份、已知空对 unknown、完整尾部变化、精确条件与受权恢复 | 源数据被删除、业务完成 |
| createRuntime／Host preStep 与真实 Session baseline | 同步 frontier／撤权／取消、同 step、归零删除、stale／timeout、compaction／projection／冷恢复重装；保持原生输入 | 线上 GUI 已部署、实际模型延迟 |
| 现有模型 current／detail／history 与 Client 公开 seams | 下沉信息仍可按相同权限读到；next 原样执行与跨 scope/version 拒绝；UI／Remote 不退化 | 新增权限或独立 standalone UI 能力 |
| RC3 source／唯一精确归档／public consumers／官方隔离 headless | strict、完整回归、生成物／公开 exports／vendor／包内容／同包双channel闭合 | 本机安装、未来宿主全版本实测 |

每 lane 竖切一个测试→真实 RED→最小 GREEN，记录私有原始证据；已有说明字符串断言可迁移为本契约语义断言，不能删 ACL／生命周期／CAS 检查或加 skip 换通过。最终独立 Standards／Spec 复核关闭必改后发布。

## 4. 计量与完成门槛

- 冻结基线和候选的相同合成 fixture，分别记录工具完整描述、协议、notices、facts、实际完整消息的 UTF-8 字节／UTF-16 字符；至少 OFF 空、OFF 旧义务、ON 满负载、八条正常结束、live／异常、长正文／身份与 child scope。
- 默认七工具实际完整描述合计以 **减少至少20%** 为目标；OFF 空／正常结束样本应有明确实测下降，非空义务不以挤出关键行为换数值。任何目标与必要语义冲突先保语义并记录原因，不编造达标。
- 检查摘要＋必要补读的总输出及调用数，不能只靠隐藏字段／增加许多调用制造名义缩小。字节／字符不等于 token；未采生产请求及 usage 不报 provider 命中率、费用或延迟收益。
- Source 与同一 accepted 包完整回归、严格 Host／Client 与公开类型、原生／headless、生成物／vendor／闭合清单通过；显式记录外部前提／skip。
- 冻结 clean source、新 annotated tag 与唯一包＋四 sidecars，非force push，五资产 Release 与下载逐字节回验，不覆盖旧资产。验证结果另记，源／tag／归档身份与发布后 docs commit 区分。

## 5. 工作图

D 文档／保护基线 → G（说明，独立单writer树）∥ C（消费，独立单writer树）∥ V（隔离验证环境准备）→ 串行集成 → 独立 Standards／Spec → 完整源码及唯一包门禁 → push／Release／下载回验。

主代理负责版本、生成物、全局集成及发布；G、C 各自负责所属源码和对应测试，避免同时改 host/consumer 公共行。共享测试迁移在串行集成期协调。T/S 管理 OFF 不制造仪器任务／裁决记录；本页与 native goal/todos 承担本批推进。
