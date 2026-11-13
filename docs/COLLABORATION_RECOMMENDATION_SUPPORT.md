# 裁决摘要、推荐支持预授权与原生子代理导航

> **2026-11-13 accepted follow-up（0.21.1）：** [推荐采纳与待决恢复](<RECOMMENDATION_ADOPTION_RECOVERY.md>)澄清合法候选的显式采用不需重复人工选择，后续权限/外部输入仍独立；修补有界消费的pending优先与支持恢复。既有创建资格/采用重验/真实来源/存量规则不变。

> 2026-11-09 所有者已认可三项研究与推荐 B，要求先固定文档，隔离工作树/subagents 完成开发测试，push、发版并为本机安装。本文与 [DESIGN](<DESIGN.md>) 是本批实施契约；[研究](<COLLABORATION_FOLLOWUP_RESEARCH.md>)保留发现和方案比较，不再决定当前授权。产品语义已接受；技术附录按第 5 节分片冻结，只有已明确冻结提交的单元才可实施。

> **2026-11-10 兼容范围更正（覆盖原双宿主门禁）：** 仅 DSH v0.2.2-rc.1 实测；安装兼容下限 `>=0.2.2-rc.1`，Node `>=24.9.0`。低版本号负例由当前 rc.1 的真实兼容函数判定，不启动 alpha.4；更高版本号允许不等于已实测。旧低下限未发布候选必须更正并新冻结，旧日志仅留证。不改变存储兼容、权限、缺能力安全降级或不擅重启边界。

> **2026-11-10 期限与呈现调整（所有者认可）：** 限时预选扩为 1/2/4/8/12/24 小时并默认 12 小时；另增“持续生效”模式（`durationMs:null` / `expiresAt:null`），不自动到期，只能由同一 switch 显式启用或关闭。到期字段保持可空，不引入哨兵时间或自动续期。预授权生效时在裁决/T/S 状态行显示一个短标记“推荐支持 启用”；悬停/可访问名称只补充启用说明（持续模式注明“持续生效”，限时精确到期以预授权面板为准），不向状态行塞计数或长句。可导航子代理标题复用 S 的紫色；父链未知/不可导航标题仍为次级灰色。旧 0.19.0 解析器拒绝空到期，写入持续策略或含该 epoch 的 V4 决策后回滚不是换包即可；详见迁移边界。

## 1. 已认可范围与非目标

- 删摘要“裁决 · ”冗余前缀，仅明确受权计数 0 时隐藏待你裁决主提醒；未知不当 0，不删除裁决详情 tab，不清记录。
- 已开阅读 1→0 不突然关闭，保留当前受权正文/已更新提示；普通刷新不抢 composer 焦点。即将隐藏控件正持焦点时，仅作最窄焦点保护。
- 待用户为 0 但需要兼容核对时提供灰色次级直达；非用户 pending/旧 awaiting 与待用户口径不混，不加第四主分类。
- B：用户显式开启有限范围/期限的推荐支持预授权，新真实待用户项获得明确推荐支持；agent 自动显式记录采用同一事项后继续，不需要用户逐条确认，不用临时 receipt 冒充持久采用。
- 范围为当前 owner-session/仪器实例与当前受权后代；独立会话/fork 不复制。换 worktree 不改变控制工作区/归属。
- 只覆盖开启后新创建的事项，不扫旧 backlog，不把旧项编辑当新项；新项资格创建时绑定服务端真实策略，不能相信模型时间/owner 或在第二阶段因已存在而误拒绝。
- 仍调用宿主 title/catalog/subagentAddress/原生右栏 API，不增加模型标题字段/标题账本。真实 Cordis sessions 依赖由独立增强 scope 持有，服务缺失时基础 UI 继续可用。
- 非目标：新调度器/夜间 scheduled task、冷 root 扫描唤醒、宿主 SDK/全局配置补丁、业务风险/关键词/LLM 审批机、额外文件/支出/外发/发布权限、vendor/channel/provider 变更、生产旧账迁移或自动清 await。

## 2. 预授权与显式采用的领域语义

预授权是用户事前作出的范围/期限安排，不是代理自报“批准”，也不代表用户在每项出现时亲自答复。提出候选、支持候选、持久采用、决定落实分别成立。

- 默认关闭。用户控制需要受认证 operator 后端保存，不能用 localStorage/agent policy-write grant 作来源。子代理可消费范围内策略但不能自行开启/延长。
- 开启界面明确显示当前主会话任务组与期限；限时预选 1/2/4/8/12/24 小时，默认 12 小时但必须显式开启；也可选择“持续生效”，此时没有自动到期，只能显式关闭。刷新不续期，限时模式由后台真实时钟检查到期，持续模式不伪造绝对时刻。所有模式都必须显式开启，不因安装、刷新或重启自动启用。
- 只对 recommendation 严格等于唯一 options key 的新项给支持；自由文本/label 仍可显示，不能猜、模糊匹配或解析业务含义。理由可放背景，不强迁旧记录。
- 有效采用后明确 pending=false，显示“按预授权策略选择”，真实采用作者仍是 agent；来源保留真实授权者、策略/源修订与精确选项。保留原 awaiting/result/references/任务约束，不默认新建 await，不推断任务完成。
- 候选不是可永久重用的权限令牌。采用时重验当前策略、源 decision 修订、business CAS、实际 assignment、推荐仍明确且引用范围仍受权。真实人工答复先提交则旧采用冲突，不无声覆盖。
- 关闭/到期阻止尚未采用候选的新采用；已采用不倒退、不删来源，不承诺撤回已执行副作用。显示开关不产生/撤销授权；管理/pending OFF 不隐式启用，保留旧记录合法收尾。
- 旧 operationId 重放返回真实旧效果/当前受权修订，不因策略关闭改载荷指纹，不重复采用；存储 unknown/投影失败不能伪装成功或重执已写业务动作。
- 有效采用结果与必要执行约束沿原任务文档/有效上下文承接；不批量修改 included/excluded，不用 awaiting 常驻缓存替代持久来源。

## 3. 用户入口与生命周期

- 裁决展开区有就地 switch、范围/期限（限时或持续）、保存中/失败/失效状态；0 待答时也能主动配置。
- 预授权生效时，在“待你裁决”/T/S 状态行只显示一个短标记“推荐支持 启用”；悬停/可访问名称仅补充启用说明，持续模式注明“持续生效”，有限期限的精确到期时间以预授权面板为准，不在该行重复计数、授权者或长解释。非生效（关闭/到期/功能关闭/未知）不显示该标记，避免把未知画成关闭。
- 独立设置入口提供同一 owner-instance 控制，不另存全局/浏览器副本；无可核验会话上下文时明确不可配置/需要选择会话，不猜 owner。
- 切换 session/真实实例、caller/grant/scope 变化清理旧草稿/在途结果，保存不跨会话；健康刷新保留合法阅读和 CAS 草稿。
- sessions 增强注入负责有界导航 port 的安装、撤销及重渲染；无 service/method 基础注册继续，旧点击立即失效，不捕获永远 null 的闭包，不靠 ctx.get 绕服务生命周期。
- 点击仍检查 mounted session、当前合法快照/显示、真父链和当前可解析 subagentAddress。区分依赖/调用错误与能力真的不存在，不把所有错误归咎宿主。
- 标题优先宿主持久 title，未取得时可用宿主 displayTitle/label/短 id；技术详情可核对来源，不另持久化副本。初始/改名/回退都需验收。
- 可导航子代理标题使用与 S 相同的 `--dsw-alias-state-done-primary` 强调色并保留粗体/下划线/focus；父链未知或不可导航标题保持次级灰色，折叠控件不抢标题强调。颜色只表达“真实可导航的 S 子代理”，不改变权限、地址或计数。

## 4. 预先确认测试 seams 与证明边界

| 公共 seam | 捕获 | 不证明 |
|---|---|---|
| core/Runtime 公开 policy/record/采用接口 + 实际 store/受控时钟 | auth、owner scope、CAS、epoch 新项资格、关闭/到期、持久 replay、候选≠采用、await/来源保留 | 真实模型一定执行或业务正确 |
| Host 真实 operator Remote + 模型 tool execute/typed/rendered/PTC/消费 | 不自开、严格 wire、8KiB receipt、同项采用回执、授权变化与恢复投影 | 用户现场运行已加载新字节 |
| 导出 React 真实挂载 + native SlotCore/标准 session props | 零/unknown/阅读/焦点、0 可达设置、真实 hook 标题/rename、异步 switch 保护 | 实际用户已看到或模型已消费 |
| 真实 Cordis + 原始宿主 session controller/sidebarRight/resource/codec | 无注入 RED、增强依赖 GREEN、缺服务基础激活、真实 child/direct parent、retain/release 与卸载旧点击 | 合成数据是生产事实 |
| 隔离浏览器明暗/窄宽 + unchanged bundle | 可点击/可读/不抢焦点/无异常网络与错误 | 当前 GUI 自动更新 |
| 仅 rc.1：source + 同一精确归档 + 类型/完整回归 + 官方安装 seam | 交付字节、兼容、source-bound 和安装流程 | 服务已重启/页面已刷新/策略已启用 |

每竖切先在真实调用 seam 看见 RED，再最小 GREEN；不改编译字符串、不测私有 cache、不以普通对象 ctx 代替真实 Cordis 生命周期。缺失真实宿主 fixture 的旧 skips 需额外精确 fixture 验证；新关键测试不得 silently skip。完整回归保留上一轮恢复稳定性防线。

## 5. 技术表示/API 冻结附录

### 5.1 U1 摘要与导航（已冻结，可独立实施）

DSH 0.2.2-rc.1 的真实 `SessionSummary.projectionValues.subagent` 是 `SubagentIdentityProjection | null`；客户端只读目录边界必须接受这个合法空投影，继续按宿主 title/displayTitle/label/短 id 回退，不能用断言抹去 null、修改 SDK 类型或把空投影当成 S=0/失权。对应真实 rc.1 Client 严格类型门禁与空投影标题回归必须通过；这只校正结构类型，不改变运行时导航／权限语义。

U1 不依赖新增后端 wire：按照第 1、3 节在呈现层仅过滤明确 0，灰色核对直达；维持阅读选择、原计数来源和受权围栏。只在被移除的触发按钮真正持焦点时，将焦点无滚动地移至现有裁决切换（阅读仍开）或邻近 T；关闭详情不 focus 已脱离 DOM 的旧触发器。

导航 source 为本 activation 内私有、可订阅的 SubagentNavigationSource：subscribe(listener) 返回 unsubscribe；getSnapshot() 返回稳定的 SubagentNavigationPort 或 null。Port 保持 available(id,parent): boolean 与 open(id,parent,expectedSnapshot): boolean。每次 sessions 增强 scope publication 发布新 port/token，方法首先核验 token 仍当前；teardown 撤销并通知 UI，重新提供服务也不能使旧 port/旧 click 借新授权成功。React 用公开 useSyncExternalStore，getSnapshot 在没有实际 publication 变化时保持同对象；不创建无界 session map 或永久 retain。

基础 apply 仍只依赖原来的服务，独立 ctx.inject(['sessions']) 增强分支持有服务许可，提供/撤回窄 port；不在 outer/整块 inner 加 required sessions，不用 ctx.get/reflect 绕过生命周期。open 从当前视图/session 定位同 activation observer，重验 mounted/session/ready/authority/display/父链与真实 subagentAddress；普通 session read/标题订阅不派发/retain/发送。暂不可用文案中性，不再无证归因“宿主缺少 API”。标题只用宿主标准 useSessions/catalog，优先持久 title，再 displayTitle/label/id；技术详情可核对回退来源。

U1 测试先锁明确 0/unknown/1→0 阅读/焦点与次级核对；使用真实 Cordis/plugin/inject、原始 session controller/原生 SlotCore 标准 hook、sidebarRight 导出的 apply/controller-store/resource/codec 装配，验证迟到/撤回/重加服务、旧点击、标题初次/rename、真 direct-parent 地址和 retain/release。无能力旧宿主必须基础激活，不把普通对象 ctx 的 GREEN 当依赖已覆盖。完整读取与当前 GUI 的证明边界仍依第 4 节。

### 5.2 B 与 U2 策略/采用 wire（已冻结）

browser-pure 新模块 recommendation-contract 定义以下严格类型、parsers 和独立 RECOMMENDATION_REMOTE_CONTRIBUTION，namespace 为 mattpocockRecommendationSupport。真实 Typert 按 package+face 唯一登记，因此该可选 contribution 使用独立协议身份 @lmgatex/dsh-mattpocock-skills/recommendation-support；它不是新 npm 依赖或另一个插件，不改变基础包身份/namespace/method/wire。不能以两份同 package+host-face 注册，也不把新 descriptors 合进旧 contribution 破坏旧端 mount。旧 REMOTE_CONTRIBUTION/mattpocockControls 不增删方法；新增可选 mount/namespace 失败只使本控制 unsupported，不阻止基础 apply/read，不能只对 Remote Proxy 做 typeof 检测而假称能力存在。read 使用既有 transport cancellation，AbortSignal 不进 JSON。

~~~ts
type OperatorAuthor = {
  readonly kind: 'user'; readonly principalId: string; readonly sessionId: null
}
interface OwnerDecisionPolicyEpoch {
  readonly epochId: string
  readonly policyRevision: number // opening save appliedRevision
  readonly scope: 'new-decisions'
  readonly enabledAt: number // server epoch ms
  readonly expiresAt: number | null // immutable server epoch ms; null = persistent, no automatic expiry
  readonly authorizedBy: OperatorAuthor
}
type OwnerDecisionPolicyStatus =
  'active' | 'disabled' | 'expired' | 'feature-disabled' | 'unknown'
type OwnerDecisionPolicySaveRequest = {
  readonly operationId: string
  readonly expectedRevision: number // owner policy, NOT config/business revision
  readonly expectedScope: InstrumentInstance // equality-only ABA fence, NOT authority
} & (
  | {readonly action: 'enable'; readonly durationMs: number | null} // null = persistent
  | {readonly action: 'disable'}
)
interface OwnerDecisionPolicySnapshot {
  readonly schemaVersion: 1
  readonly instance: InstrumentInstance
  readonly revision: number
  readonly saved: {readonly enabled: boolean; readonly epoch: OwnerDecisionPolicyEpoch | null}
  readonly effective: {readonly status: OwnerDecisionPolicyStatus; readonly reason: string | null}
}
interface OwnerDecisionPolicySaveResult {
  readonly appliedRevision: number
  readonly replayed: boolean
  readonly operation: {
    readonly action: 'enable' | 'disable'
    readonly epochId: string | null
    readonly expiresAt: number | null
  } // historical result, not renewed permission
  readonly snapshot: OwnerDecisionPolicySnapshot // current authorized state
}
// 独立可选 namespace mattpocockRecommendationSupport Remote（原 namespace 不变）:
readOwnerDecisionPolicy(sessionId: string, signal?: AbortSignal): Promise<OwnerDecisionPolicySnapshot>
saveOwnerDecisionPolicy(sessionId: string, request: OwnerDecisionPolicySaveRequest): Promise<OwnerDecisionPolicySaveResult>
~~~

~~~ts
// 原 mattpocock_record({action:'apply', command:...})，不增工具名
{
  operationId: string,
  expectedRevision: number, // current businessRevision
  action: 'adopt-decision-recommendation',
  workflowId: string,
  decisionId: string,
  references?: readonly string[],
  value: {
    optionKey: string,
    decisionRevision: number, // source revision, NOT business CAS
    policyEpochId: string,
    policyRevision: number
  }
}
interface DecisionPolicyBinding {
  readonly createdRevision: number
  readonly optionKey: string
  readonly policy: OwnerDecisionPolicyEpoch
}
interface DecisionPolicySelection {
  readonly kind: 'owner-policy'
  readonly selectedOptionKey: string
  readonly decisionSourceRevision: number
  readonly policy: OwnerDecisionPolicyEpoch
  readonly authorizedAt: number // server final gate time; adopter is event.author
}
interface RecommendationCandidate {
  readonly optionKey: string
  readonly decisionRevision: number
  readonly policyEpochId: string
  readonly policyRevision: number
  readonly expiresAt: number | null // null mirrors a persistent epoch
}
type RecommendationReason =
  'policy-disabled' | 'policy-expired' | 'feature-disabled' | 'no-creation-binding' |
  'decision-changed' | 'not-pending-user' | 'no-exact-recommendation' |
  'policy-epoch-changed' | 'different-addressee'
type RecommendationOutcome =
  {readonly status:'candidate'; readonly candidate:RecommendationCandidate} |
  {readonly status:'adopted'; readonly selection:DecisionPolicySelection} |
  {readonly status:'not-eligible'; readonly reason:RecommendationReason} |
  {readonly status:'unknown'; readonly reason:'policy-unavailable'|'projection-unavailable'}
interface OwnerDecisionPolicyPublic {
  readonly revision: number | null
  readonly status: OwnerDecisionPolicyStatus
  readonly epochId: string | null
  readonly expiresAt: number | null
  readonly scope: 'new-decisions'
  readonly reason: string | null
}
~~~

`expiresAt:null` 的唯一含义是“持续生效、无自动到期”，不是未知、0 或哨兵时间；`enabledAt` 仍是服务端授权的下界。持续 epoch 在 feature 配置且未关闭时始终 `active`，不会进入 `expired`；关闭仍保留该 epoch 供历史显示。限时 epoch 继续使用半开区间 `[enabledAt, expiresAt)`，`expiresAt-enabledAt` 为 `1..86400000` 的正安全整数。`durationMs:null` 只允许出现在 enable。disable 不接收 `durationMs`，并保留当时的 epoch：无旧 epoch 时 `epochId`/`expiresAt` 两个 operation 字段均为 null；有旧 epoch 时 `epochId` 保留，有限期限保留数字，持续 epoch 保留 null。`RecommendationCandidate.expiresAt:null` 只是镜像当前持续 epoch，不是新的权限来源。

持续值仍写入既有 policy 文档 schemaVersion 1 和 V4 决策 metadata，不新增 V5、不改 checkpoint 布局；旧 0.19.0 的 epoch parser 会把 null 当作 invalid-state 拒绝（fail closed，不会误当有效或无限期）。因此写入持续策略或含该 epoch 的 V4 binding 后，回滚到 0.19.0 不是只换包；必须按迁移边界保留新版本或停止写入并做受控数据处理。

#### 策略保存与权限

- Route sessionId 是用户明确选定/当前已核验的目标会话，服务端重解析其真实 owner-instance；允许已登记受权 child 解析到同主实例，不要求用户从 label 猜 root。读不 ensure/创建/扫描/唤醒；未知或未归属实例返回明确 unavailable/unknown-session。save 仅操作既有真实实例。expectedScope 三 ID 仅作 ABA equality fence，不能据它授予/构造归属。
- 仅真实 operatorCaller 经 this.run 可读写本控制，Runtime/store 重验 kind=user、principalId=当前 ports.operatorPrincipal、sessionId=null；没有 agent 自开入口，已有 agent policy-write grant 也不赋此权。模型只读受权的精简当前状态，不调用保存 Remote。
- durationMs 为 null（持续）或 1..86400000 的正安全整数（限时），不 clamp；null 只表示不自动到期，不表示未知。UI 限时预选 1/2/4/8/12/24 小时、默认 12，另有“持续生效”；都必须显式确认。后端 enabledAt/expiresAt 为权威；限时读/刷新/重放不续期，持续模式只由 switch 关闭。不同 opId 的 enable（含续期或切换模式）创建新 epoch；disable 保留旧 epoch 供历史显示但失效其未采用候选。
- 新 enable 必须在当前管理/workspace/pending configured 时才允许；OFF 仍可 disable。既存意图在 feature OFF 时 effective=feature-disabled，不隐式开总闸；重新 ON 可恢复未过期且未关闭 epoch。先做 operator/归属/expectedScope 与既存 opId 重放核验，再对新 enable 作 feature gate，不能在 OFF 时把已成功 enable 的历史重放变成新写/错误续期。
- save 结果分原 appliedRevision/operation 历史效果与当前 snapshot；同 opId+作者+规范载荷重放不写，不同载荷冲突，不自动换 expectedRevision。存储 uncertain fail closed，不用内存旧 active 兜底。
- 独立设置页仅明确 selector，默认无选择；不扩 uiSession/current-selection bridge，不从 mounted/首项/cwd 猜 owner。管理/读取未知不能画成已确认 OFF；当前 scope 有效时关闭旧策略不依赖先启用管理。

#### 采用与持久来源

模型仍用 mattpocock_record 的 apply，不增加工具名；command.action=adopt-decision-recommendation，公共字段 operationId、expectedRevision（businessRevision）、workflowId、decisionId、可选 references；value 精确为 optionKey、decisionRevision、policyEpochId、policyRevision。agent-only；真实人工编辑继续 put-decision，不把 operator 伪装 adopter。

首次 put 创建时，只对真实 agent、pending=true、addressee=user（明确 principal 必须等实际授权者）、当前策略/feature 有效、recommendation 严格等于唯一 options key 的新项生成 binding。binding 钉住 createdRevision，之后任何普通 put/reopen/改推荐都不能重获资格，viewer-only 不影响。首写无 exact key 或 policy 读失败仍可保存普通问题，但不追认绑定；工具分别说明 not-eligible/unknown。第二次采用不因为记录已存在就丢资格。

~~~ts
type DecisionPolicyEventEffect =
  {readonly kind:'bound'; readonly binding:DecisionPolicyBinding} |
  {readonly kind:'adopted'; readonly selection:DecisionPolicySelection}
// V4 event: decisionPolicy?: DecisionPolicyEventEffect (OUTSIDE command)
// decision row: policyBinding?:DecisionPolicyBinding; policySelection?:DecisionPolicySelection
// retained decision Change: policySelection?:DecisionPolicySelection (OUTSIDE value)
// V4 InstrumentCommandMetadata: decisionPolicy?:DecisionPolicyEventEffect (OUTSIDE digest)
~~~

采用重验当前 auth/assignment（变更前后全引用/无票 creator）、business CAS、current row revision=创建 binding revision、候选精确 key 和原推荐/选项、当前同一 epoch/revision、pending user/feature/时间。所有 awaited read 后，紧贴 instrument CAS 开始前采样 authorizedAt/recordedAt 重验期限；限时 epoch 为 [enabledAt,expiresAt) 半开区间，等于到期即拒绝；持续 epoch 只要求 authorizedAt/recordedAt>=enabledAt，无上界。CAS 已开始且 ack 晚于限时到期属于在途已授权提交，不承诺 fsync 在期限前完成。

仅一个实际 agent authored event 明确 pending=false，保留原 status/question/result/await/context/options/recommendation/addressee/task references/约束；references 是旧当前与本次的稳定并集。selection 放 command 外可信 metadata，模型不得通过 DecisionValue 写入 policyBinding/policySelection/author；旧 command fingerprint/digest 仍只规范 command+actual author。普通后续 put 产生新业务事实并撤下当前 policySelection，但历史版本与创建 binding 保留；不把旧 policy 选择冒充人工修正后的最新来源。

#### 存储版本、幂等、缓存和消费

- 新 owner policy engine 通过 openUnitStorage、按 instance 派生独占表名 owner_decision_policy_ + sha256(instanceId).slice(0,32)。文档 schemaVersion=1，绑定真实三 ID，含 revision/enabled/epoch/updatedAt/updatedBy 与持久技术幂等 receipts；无副作用虚拟缺省 revision0/disabled。本次只把 epoch.expiresAt 的值域扩为 number|null，不新增字段或版本；持续 epoch 的 opening receipt 也记录 null。坏文档不是空/关闭。所有真实保存保留去重回执，不静默驱逐旧 opId。
- Instrument V4 沿 V3 checkpoint/taskReferences layout 加上上述可信 event/row/version/technical-command metadata；仅首次 qualified bound creation 与 decision 同一 CAS 升 V4。开策略本身不升级，读与普通旧项不批量迁移，V1/2/3 仍严格可读，V4 taskReferences/current/full/changes/compact/purge 不能漏字段。未知版本不 reset。旧 binary 不读 V4，须在迁移说明写明首次 V4 后仅换旧包不足回滚；停止旧 writer/备份边界不通过恢复旧账覆盖真实新写。持续 epoch 仍是 V4 metadata；旧 0.19.0 虽认识 V4，却会把 null 到期判 invalid-state，所以持续 binding/adoption 写入后回滚边界比普通 V4 更明确，迁移文档必须写明。
- records.capabilities 增 decisionRecommendationAdoption=true，storageVersions=[1,2,3,4]；current/detail 授权行带只读 policyBinding/policySelection、临时 recommendationSupport。Runtime/current/消费顶层可选 ownerDecisionPolicy（缺失不是 active）。
- 已存 opId 先经当前身份/范围再查同作者/原载荷重放，只有新操作再核策略/feature/CAS并产生 effect；关闭不能改变旧 fingerprint。创建 replay 要重验当前候选支持，采用 replay 的原 selection 与当前已修正 row 分别呈现，不拿历史回执作新许可。
- policy save/global save/grant/assignment/put/adopt 共用现有 runtime FIFO/track；新 engine 不另嵌 queue，避免重入死锁。两个域无联写事务：binding+创建在一个 instrument CAS；policy 与 instrument 只受单 host/open handle/FIFO 顺序保证，不宣称跨进程事务。
- 独立 owner-policy source revision+effective 状态桶必须进入 projection/readSession/model/消费 read gate/token；限时跨到期桶、持续跨关闭/feature 桶都不能命中旧 active 缓存，不每读注入 now/倒计时抖动前缀。时钟无效或回拨到 enabledAt 前为 unknown，不新采用。持续模式没有到期桶，但仍受 revision/关闭/feature 桶约束。
- history capture 每版保留 selection/refs/source，currentIndex/full changes/技术去重与 checkpoint 同步；实际作者仍 agent。旧无策略 metadata 的历史 capture payload 原形不改；只为新增采用源版本附加其 selection 与该版本 references，不为补格式重写同 source version，也不跳过真实 payload 冲突或 purge suppression。显式 included 的 contextConclusions 可携 policySelection 与 nullable result，不能因没有 result 字符串遗失已采用选项；excluded 保留，不自动 set-context/await 常驻。
- 回执 schemaVersion2 保持既有有界 envelope；recommendation 为 candidate/adopted/not-eligible/unknown 判别联合，关键 key/sourceRevision/policyRef/commit 状态优先于 label。typed/render/PTC 同值，8KiB 写/64KiB 读预算，已提交后 DTO/历史/通知失败不能重执业务写。普通问题在 optional policy 源失败时无 binding+unknown；新采用 fail closed，不伪造成功。

#### B1/B2/U2 单 writer 边界

~~~ts
// recommendation-contract.ts: browser safe; implementation-specific storage imports forbidden
interface OwnerDecisionPolicyState {
  readonly revision:number
  readonly enabled:boolean
  readonly epoch:OwnerDecisionPolicyEpoch|null
}
interface DecisionPolicyReader {
  read(instance:InstrumentInstance):Promise<OwnerDecisionPolicyState>
}
// owner-decision-policy.ts: backend-only, supports the same reader
interface OwnerDecisionPolicyStore extends DecisionPolicyReader {
  save(instance:InstrumentInstance, request:OwnerDecisionPolicySaveRequest,
       author:OperatorAuthor):Promise<{
    readonly appliedRevision:number; readonly replayed:boolean;
    readonly operation:OwnerDecisionPolicySaveResult['operation'];
    readonly state:OwnerDecisionPolicyState
  }>
}
// constructor deps: storageFor(instance) -> VersionedStorage<OwnerDecisionPolicyDocument>,
// now, newEpochId, authorizeOperator(author,instance) callback (mandatory).
// No default allowing author; B2 binds callback to current ports.operatorPrincipal.
// B1 SessionInstruments constructor gets decisionPolicy?:DecisionPolicyReader,
// and existing core now clock. Missing reader: no binding + adoption unsupported.
~~~

补充 store constructor 的 authorizeEnable(instance) mandatory callback：在 operator/expectedScope/dedup/CAS 后，仅对新 enable 调用；B2 在现有 FIFO 内绑定 fresh feature configured 检查，关闭不要求 feature ON，历史 replay 不因当前 OFF 被误拦。authorizeOperator 仍是独立 mandatory 真实 operator 检查，没有默认放行。

B1 独占 recommendation-contract types/parsers/contribution、owner-decision-policy engine、instrument-state/instruments/controls index 与 domain tests。B2 独占 runtime/host/model-tools/consumption 与装配 tests，并通过上述 reader/store 连接 FIFO、源 token、真实 Remote/作者、投影/消费/历史。U2 由 client writer 在 U1 交付后消费 B1 的只读契约，只写 client 图与 UI tests，不并发修改 client.ts。主代理串行生成 lib/声明、包清单与版本。


### 5.3 R/I 安装激活边界（已冻结）

正式 CLI 同包升级可能仅改 dependency 文件，manifest 的 bundle 列表未变时不会自动重组正在运行的 Host/Client 图；不据磁盘版本承诺热激活。先隔离验证官方 PluginManager 同一 tgz 的安装/回滚和受支持 HMR。实际已认证公开管理动作可安全触发正式重组时才另验激活；无安全入口则明确报告已安装待重载，不 touch patch 造热重载、不私接 RPC、不擅自重启。新格式写入前后的 rollback/旧 reader fail-closed 边界必须明示，不恢复旧业务备份覆盖并发新写。

## 6. 发布与本机安装

按 [实施计划](<IMPLEMENTATION_PLAN.md>)的 D→B/U→V→R→I 依赖推进；每位 implementer 独立 branch/worktree，交付前同步 integration，串行 merger 合入，独立 Standards/Spec 必改关闭。

最终只分配新版本；冻结 clean-source 和唯一 tgz，严格 source-bound/闭合图/仅 DSH 0.2.2-rc.1 源与精确包验证，非 force push、新 annotated tag、五资产 Release 和下载逐字节回验。通过后将同一制品经官方 PluginManager 安装到本机 Web Profile，保留备份/回滚和版本/字节核验。安装不自动启用管理或推荐支持，不迁移旧记录，不改共享 SDK，不 npm publish、不覆盖旧 tag/资产、不擅重启当前服务；安装、HMR 激活、页面刷新和现场可用分层报告。
