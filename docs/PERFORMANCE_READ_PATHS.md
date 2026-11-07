# 插件读取路径性能优化（0.11.0）

## 状态、授权与范围

2026-11-04 所有者认可三项风险分析，并指示先固定文档，再由 subagents 在隔离环境实施、测试、push 与 GitHub Release。目标版本 0.11.0；本页为当前实施契约，已先单独固定设计，再完成并合入三个隔离切片；统一双轴复核与全量 source、唯一精确制品/双 SDK headless/发布/五资产下载 strict 回验均已完成；冻结 source e5d25cf，对应 0/A/B/C/D/E/F 全部完成，完成证据在 [验证摘要](<VERIFICATION.md>) 与 [机器验证摘要](<../dist/verification-0.11.0.json>)。本机 Profile 未安装此版本。完成证据追加到 VERIFICATION，不改写 0.10.x 历史。

本轮只优化插件自身的身份事实读取、业务历史投影、完整 Remote 表示和模型消费内部读取；不把此前现场 CPU 当归因证明。原生 list_agents descendants、Forge、DSH 日志/GC/spill 属于范围外。当前 Web Profile 继续保持已安装版本；**暂不为本机安装、不改当前 Profile/共享 SDK、不重启服务、不 npm publish**。隔离测试依赖和临时 DSH_HOME 可以创建，不连接生产服务或真实业务日志。

既有 Skills/vendor、通道、provider precedence、模型工具集合/请求/有界 schema-2 DTO、Remote wire Interface、持久存储格式/domain、保留策略、engines.dsh 均不变。新逻辑集中在内部 Module/Adapter；不增加调度器或后台清理。历史内容保持可查。

## 三项问题与目标

| 切片 | 确定的问题 | 目标 | 不作的推断 |
|---|---|---|---|
| A 历史投影 | 单对象版本追加反复展开旧 history，changes 逐事件查历史 revision；完整读取存在二次成本 | 私有 builder、实体/版本索引，可信不可变源的纯投影复用 | 不是 native 聊天日志；并非每次 Runtime 轮询都重建 |
| B 身份事实 | 正常摘要 item 三次 lineage；大 cold child 因事件数上限不缓存，重复 observation/slice/freeze | 在 Host authority 私有实现复用紧凑已验证身份事实，按来源版本失效 | observe 不等于必然再次解码；不能仅凭 retained 允许访问 |
| C 完整表示/消费 | Runtime cache 命中后 Remote 仍验证/重复制；消费先造完整业务历史再取当前值，activeContext 扫历史 | 可信不可变结果的安全表示复用；内部 current-facts 消费、必要捕获与历史上下文索引分离 | 输出字节有界不等于内部开销有界；不承诺治愈宿主 RSS/CPU |

初始隔离基准证明 full read 随单对象 500/1000/2000/4000 版本约 9.69/36.15/128.51/479.08ms；hot current 约 0.15ms。2000 短正文版本的缓存 Runtime read 约 0.28ms，独立 Remote JSON 验证/复制约 54.93ms。这些是合成源码基准，不作为生产 SLA 或硬 timing 断言；本轮须独立重测。

## A：历史投影 Module

### Interface 与实现

继续使用 projectInstrumentDocument、SessionInstruments.read/readCurrent/readSummary/apply 和源解析/CAS Interface。按复合实体键索引 workflow/ticket/decision/view；仅在本地 builder 修改历史，checkpoint history 一次 copy-on-write、尾事件追加，完成后 freeze。建立精确 revision→历史 merged value 索引，替代 changes 的线性历史查找。输出首插顺序与逐事件校验顺序不变。

可对**经验证且不可变的源文档身份**以 WeakMap 复用纯 state/索引，源读取仍检查当前 storage health/uncertain/身份；不能缓存授权后的 snapshot 跨 principal 或 scope。可变外来输入不因顶层 Object.isFrozen 就变成可信内容；候选解析/CAS 失败不发布成当前索引。索引不另行持久化；不只用热缓存掩盖冷算法二次成本。

### 保持语义

- V1/V2、checkpoint+tail、compact/purge/reopen、historyCoverage/holes 与当前值不变。
- optional patch 的省略/false/null/空集合、首版 creator、各版 author/references/time 均保留。
- changes 权限按该 revision 的 merged value 判断，不能用 raw patch 或最新版本替代。
- assigned 全关联票/无票 creator 过滤、viewerRevision、hidden/focus/OFF 保留义务不变。
- operationId 幂等、source/business/viewer CAS、水位、applied/current 修订、uncertain 与失败重试保持。

## B：Host 私有身份事实 Module

### Interface 与实现

在 createHostAuthority 内把身份分类所需的紧凑 descriptor 投影与其他调用者需要的完整 sessionFacts 分开。保留 public sessionFacts 语义、首次 owned-descriptor 验证与 observation lease 释放。缓存经过真实 fold/验证的紧凑结果（包括“无合法 descriptor”的结果）；畸形当前版 descriptor 的拒绝不得变成功。

冷身份 key 包括 mount/persistence identity、sessionId、opaque source revision、header 身份指纹（id/origin/parent/createdAt）；live 身份绑定实际 Session/Agent 对象与可核验事件代次。来源变更、header 冲突、live↔cold、同 id 替换、dispose、挂载变化使旧结果失效。缺少可靠 source token 的宿主保守回退既有观察，不能凭版本字符串或 TTL 宣称有效。紧凑缓存有界；不保留大数组来换取性能。

当前可信 header 的存在/可读性、retained association/instance 冲突仍检查。**事实复用不是授权缓存**：每 item 当前 policy/grants/assignment/workspace/lineage、known-version 的权限与来源健康核验不跳过。retained 不授予新票范围，缺省/未注册 child 不静默 ensure/activate。当前 descriptor 畸形、origin/parent 改变、仅继承 descriptor、unknown 状态必须保持原结果。

若实现发现必须改变 Host seam 或无法在现有公开 token 下证明稳定，先报告并收窄 fast path，不补共享 SDK。跨 item/batch 的授权上下文复用不属于本轮最小方案。

## C：完整 Remote 与当前消费内部路径

### C1 表示复用

保留 Remote.readSession 的完整、lossless、已分离且冻结的 JSON wire 内容。可在可信不可变 snapshot 的生产者/严格验证 seam 复用已验证表示；不能以任意顶层 frozen 输入直接绕过 JSON 验证（getter/symbol/稀疏数组/cycle/非 JSON 值仍拒绝）。保持调用者身份与当前授权检查在缓存之前。缓存必须有明确对象寿命/有界策略，评估额外图驻留；不缓存巨型序列化字符串、不让普通任意 parseHostJson 调用变成不安全全局 fast path。

### C2 当前模型消费

增加/复用内部 current-facts 读取与 provenance Interface，热消费不再为业务 records 构造完整 row.history/changes。**不是以 UI summary 替代消费**：scope、业务义务/计数、T/S 与 unknown、pendingRelease、nativeStops/nativeExecutions、资源物理观察、工作树待处置、context conclusions、capabilities/health 和各来源保持。最新 author/references/time 直接来自当前 provenance。

完整 Remote 编辑/历史详情与内部 apply 返回保留原语义。消费 formatter 可兼容已有 full fixture 输入，但不能伪造历史来凑类型。全局 policy/grant FIFO、固定每实例已登记持久提交 frontier、当前权限、snapshot visibility/baseline、stale/unknown/迟到 superseded 语义保持。

### C3 捕获与上下文

历史首次补捕获、源变化后的补捕获和捕获失败重试仍执行；仅在真实 source/business 修订变化或失败待重试时支付必要的全历史捕获成本，不对每次热 current 读重复。成功后才推进 mark；每实例最多保留 64 个按 session 与 source/business/scope 绑定的紧凑成功 token，交替消费者不遗忘彼此版本，scope 变化仍重新捕获。仅失败的 open promise 可按精确身份驱逐并重试，已打开的 uncertain handle 不自动重开。derived history 缺失/失败的 health/locator 仍如实，不把小输出当已持久提交。

SessionHistory.activeContext 可按可信不可变 history 文档派生 latest/context 索引；set-context/purge/suppression、source revision 变化均正确失效。已清理树退出当前范围、未清理义务保留、历史源禁止复活的 suppression 不变。多域 partial/unknown 不抹除。

不通过增加 timeout、减少新鲜度、跳过物理观察来通过性能门禁。保持现有 effect FIFO，不先做分队列/粗暴 Promise.all；分别测 queue wait 与执行时间。取消继续在可中断 seam 传播，不能声称 timer 能抢占同步 JS。

## 预先确认的测试 seams 与验收

所有测试通过以下既有公开 Interface 或新增的**内部 current-facts Interface 的实际调用者 seam**，不反射私有 Map/queue，不向生产加入模型调试工具：

1. **SessionInstruments / projectInstrumentDocument + Domain storage**：捕捉算法增长和业务语义；不代表真实磁盘/宿主全日志开销。
2. **createHostAuthority + 实际 Runtime.readSummaries**，使用受控 stat/observation：计数真实冷权限链与来源失效；另以支持的宿主公开 Session query 做隔离能力验证；不把调用次数当解码次数。
3. **实际 mounted Remote.readSession + Runtime preStep/postExecute 消费 + SessionHistory**：检验 JSON 表示、来源/权限、完整详情与 current 消费差异、捕获/队列/frontier；合成 fixture 不当 GUI/模型验收。
4. **精确制品的双宿主类型/装载/PluginManager/模型工具回归**：验证生成物与兼容，不代表本机安装。

实现按 tracer bullet 做真实 RED→GREEN（计数/增长/行为断言优先），然后补语义矩阵；保留每个 RED 对应命令与结果。性能记录分开 cold/hot、fixed-current/increasing-history、fixed-total-events/increasing-entities、对象结构/长正文；少量重复给 median/样本，不以偶然单次毫秒数充当契约。

必需矩阵：

- A：500/1000/2000/4000 版本及多对象，V1/V2 checkpoint/tail；current/source 健康、author/creator/patch/各历史版权限、CAS/幂等/清理、write/reopen。
- B：live/cold/仅 live Session；1/4000/4001 events、stat 有/无/异常、source identity/revision 改变、同 sid 替换、深链/cycle、并发/取消与 lease；当前 descriptor 畸形/缺失/继承；缓存热时撤权/来源 denied 仍拒绝。修复已有只替换 ports.sessionFacts 而未覆盖 authority 闭包的测试盲区。
- C：同 frozen snapshot 复用/可变输入不误复用、严格 JSON 拒绝矩阵；full Remote 内容等价；current 热消费无业务全历史构造，首次/变更/失败捕获可恢复；context/purge/收敛；OFF/hidden/focus、T/S/nativeStops/pendingRelease/树/资源/health 不丢；固定 frontier/撤权 FIFO/取消/迟到/baseline。
- 全量 source 回归、严格 Host/Client 类型、闭合 build、source/lib 一致、vendor 字节、工具面/DTO 不变；已知环境 skip 精确说明。

## 实施与发布阶段

| 阶段 | 负责人/范围 | 完成条件 |
|---|---|---|
| 0 文档固定 | 主代理 | DESIGN/IMPLEMENTATION_PLAN 指向本契约，单独 docs commit，实施状态诚实 |
| A 算法 | 隔离 subagent/worktree | 独立测试 RED→GREEN、语义/增长记录；仅本切片源码/测试 commit |
| B 身份 | 隔离 subagent/worktree | 冷权限链计数与来源/授权矩阵；不改生产宿主 |
| C 表示/消费 | 隔离 subagent/worktree | mounted Remote 与 current 消费/捕获/frontier 回归；与 A/B 接口兼容 |
| D 集成/复核 | 主代理+独立 Standards/Spec reviewers | 合并后完整双宿主回归、性能对照；修复未关闭问题 |
| E 唯一制品 | 隔离 release lane | 版本0.11.0、clean source、生成物一致、唯一tgz与四个sidecar（共五项资产）、strict --tarball/PluginManager通过 |
| F 发布 | 授权 subagent/主代理协调 | 非force push main、新annotated tag/GitHub Release、资产下载逐字节/摘要/strict回验，VERIFICATION记录 |

制品与 tag 指向明确的 clean source；docs-only 完成记录可在其后。不得覆盖旧 tag/资产，不 npm publish，不给本机安装。只有通过实际门禁后才把“待验收”改为完成；任何 source/制品/发布成功都不推断当前 GUI 已更新。

## 2026-11-07 预防性复核（没有新增性能实现）

上文0.11.0的历史实施与门禁保持原义；当前0.15.0的工具／上下文／程序时间复核、实际针对性检查及后续候选见[上下文复核](<INSTRUMENT_CONTEXT_CACHE_RESEARCH.md>)。这次区分provider前缀、内部索引、单次预算和累计历史／FIFO成本，不重开已完成的旧优化，也不以136项合成回归证明线上CPU/RSS、硬CPU截止或真实cache-hit。未来先在既有公开seams测工作量，再按证据选择最小候选；保留本页source-token、授权／撤权、取消、固定frontier与历史恢复约束。
