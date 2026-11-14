# 模型工具 Interface：结构、可发现契约与诚实续读

## 1. 已认可范围与基线

2026-11-14，所有者认可全插件模型工具的只读审查和设计合理性评估，要求先固定文档，在隔离环境／subagents 完成开发测试，push、发版，**暂不为本机 DSH 安装**。本页是本批实现与验收依据；不是已完成声明。基线为公开 main `c4b64e450f8b0ec6cf6bd2be1c67f06e0032cd7e`（0.21.2），目标 **0.22.0**。历史批次的安装权限不继承。

覆盖默认 controls／record／window／resource／assign／history／worktree，以及条件 audit、opt-in delegate。保留 vendor、channel、provider precedence、native-first、真实身份／当前权限／FIFO／CAS／generation／幂等／取消与消费前沿。不新增模型工具、审批规则、自动业务完成／采用／清理、运行时抓取、共享 SDK 补丁、生产数据迁移或服务重启；不 npm publish，不覆盖旧 tag／资产。

## 2. 设计判断与保持项

- 已知业务结构使用有界、明确类型的对象；标题、备注、解释仍使用文本，不把所有文本对象化，也不接收任意 JSON 作为结果。
- controls 保留完整稀疏 intent 替换及 policy CAS；部分 read 明示 completeIntent:false，同修订重建后才可 save。省略继承／false 显式关闭／删除叶恢复继承分别说明，不新增隐式 patch。
- window 的 generation、assign 的真实直接 child／父链权限交集、task-reference 的身份不可变／导航非授权保持。
- history 保留 coordinator-only、冻结 cut、missing／remaining／purged 区分；resource 保留窄只读与持久账本／实时 Git 观察分层；delegate 保留默认关闭和创建／绑定／赋权独立效果回执。
- 旧票自由业务状态／文本与本次声明 references 不变：普通更新不自动并集旧引用，历史来源不丢失；不制造第二份 tracker 生命周期。

## 3. R：结构化决策结果与持久兼容

`DecisionValue.result` 接受原非空 string／null，另接受以下闭合结构：

```ts
interface DecisionResult {
  answer: string
  selectedOptionKey?: string
  source?: { kind: string; sessionId?: string; messageId?: string; text?: string; position?: string }
  included?: string | readonly string[]
  excluded?: string | readonly string[]
}
```

answer 和提供的文本非空、无 NUL；数组最多64项；完整结构的 JSON 表示最多65536 UTF-16字符，字段沿既有文本／ID限制。未知字段拒绝，source只是agent引用用户答复的作者报告，不认证用户事件、不授予执行权限，不替代 policySelection 的真实宿主采用记录。selectedOptionKey只是结果报告，不自动改变 pending／awaitingImplementation／推荐采用。可选字段省略继承既有 result 整体，显式新 result 整体替换；null 清除。

新增 instrument **V5** 标记可含结构化结果，按需在首次结构化结果写入时升级；旧 V1–V4／旧文本／未写入结构结果的操作保持。V5完整支持重放、checkpoint、compact／purge与推荐策略元数据，不丢creator／历史来源／去重／CAS。能力增加 structuredDecisionResults:true 与 storageVersions 1..5。V1–V4文档中遇到结构结果须拒绝，而非静默解释成旧文本。

Remote／当前读／历史／消费保留结果结构，Client以可读文本呈现 answer、来源、适用／排除条件，不出现[object Object]；既有直接用户文本答复仍合法。旧版本不识别V5，写入V5后回滚必须恢复兼容数据备份或使用支持V5的版本；不提供自动降版转换、不触碰生产记录。新增浏览器纯 helper集中解析／显示，避免各调用者自行字符串化。

## 4. O：模型输出与定位

模型 envelope 保留 schemaVersion:2，新增 representationVersion:2 表示本轮字段表示；预算仍为读64KiB、回执／错误8KiB，含转义／身份／续读元数据，不回退全快照。

- 小型结构化字段（如statuses、source、view、coverage）保留原对象／数组，不一律转成JSON文本。字段在预算内提供精确原值；大字段省略原字段，在独立 `previews` 对象给 text／truncated／totalBytes／shownBytes。长字符串不在原字段悄悄截短，也不让同一字段随长度变成预览对象。预览不能当完整编辑值；授权detail仍可取得精确对象。
- record当前查询增加 `target?:{workflowId,localTicketId?,decisionId?,axisKey?}`，按kind约束唯一local选择（workflow只需workflowId；ticket/task-reference/window-ticket/pending-release用localTicketId，decision用decisionId，status-count用axisKey）。与已有workflowId／recordId选择器同时出现拒绝歧义；旧composite recordId精确支持，不改内部身份。模型不必手写JSON组合键。
- 分页／正文返回可执行 `next:{tool,request}` 或null；query保留原filter及原样cursor，正文offset直接用nextOffset。不以不同分页源cursor形状做字符串猜测。body继续为canonical JSON UTF-8字符串片段，补contentType／encoding；仅done且完整重组后解析，保留版本／hash／取消／码点检查。
- audit来源unknown／not-recorded不得变成current或确定0；集合保留结构化coverage／reason，未知total为null，不能凭空给出可完成的续读保证。summary内存事件与持久episodes分别标注来源，不再统称memory-only；不删除持久源、不扩大权限。

## 5. G：固定工具契约与消费引导

按action显式说明字段类型、数组、null／省略／清除和正确示例；在宿主公开工具参数Interface支持范围内复用契约，不修改SDK或伪称generic request:json有嵌套schema强制。重点明确result联合、references:string[]、notes文本／空串、terminal:boolean、窗口代次、配置完整替换及恢复继承。通用输出说明只讲通用事实；resource不宣传query；worktree reconcile提供合法已有operationId示例。audit独立注册同样说明v2／正文／续读。

消费中的续读指针遵循当前调用者权限：workflow／ticket／decision／task-reference／status-count／window当前明细使用mattpocock_record当前查询；不把assigned导向coordinator-only history。无合法当前续读来源时明确缺口，不放开历史ACL。Replies要求保存结果与适用／排除条件，明确其在result结构中的位置，不暗示不支持的顶层字段；旧答复／awaiting义务保持。

## 6. 预先固定的测试 seams 与完成标准

本轮沿用审查获认可的公开工具／解析／输出seams，并加入相同结果的存储／Client兼容；测试不复制私有实现、不写生产数据。每个竖切保留真实RED→GREEN。

| Seam | 捕获 | 不证明 |
|---|---|---|
| parseInstrumentCommand／SessionInstruments公开read/apply及持久重开 | 原对象结果接受、严格拒绝、旧文本、按需V5、旧版本拒绝、重放／checkpoint／来源／幂等／ACL | 用户答复真实性／生产数据迁移 |
| createModelTools／实际mounted typed和rendered工具执行 | 小对象精确、长字段previews、target兼容、预算／next请求、audit unknown、错误说明 | 模型必定服从提示词 |
| InstrumentConsumption／createRuntime公开读与注入 | 子代理合法当前续读、结构结果条件与旧义务、取消／当前授权 | 扩大history权限 |
| Client真实React／Remote codec／原生宿主fixture | 结构结果显示与文本答复、范围保留、read-only／卸载／旧卡片 | 当前GUI激活或视觉已部署 |
| RC3 source／唯一精确tarball／public consumers／官方headless | 完整回归、Host／Client strict、闭合生成物／exports／vendor／包内容与同包双channel | 本机安装／未来Host已实测 |

完整回归显式记录skip和外部前提，不以删断言或加skip达成通过；修复后的独立Standards／Spec必改关闭，生成物与精确包验证通过才发布。

## 7. 工作图与发布

D文档先单独提交；R结果核心、C消费／Client、O模型输出、G工具说明在独立单writer工树/subagents并行，C的集成验证依赖R，G和O按本页契约并行；主代理串行合入、重建与冲突后重测。另V准备精确RC3环境／完整门禁。不得跨工树覆盖其他作者文件。

V关闭后冻结clean source和0.22.0，一次accepted归档／四sidecars，经source-bound strict、同包完整回归及独立评审，非force推进main＋新annotated tag、五资产GitHub Release，下载5/5字节与strict回验。当前SDK／Profile／GUI保持，**本机安装／激活明确不执行**。验证结果独立追加VERIFICATION；版本发布不代表生产session已修复。
