# 仪器工具、上下文与时间：预防性复核

> 后续状态：所有者已授权0.16.0隔离开发／测试与push／发布，具体最小范围见[实施冻结第11节](<TASK_REFERENCE_CONTRACT.md>)和[最新设计](<DESIGN.md>)。本文保留前一轮136项预防性检查，不充当新实现的验收；生产数据与本机安装仍不包含。

## 1. 本轮范围与结论等级

- 日期：2026-11-07。用户说明“问题不一定存在”，要求先停止残留 subagents，再重新检查缓存／积压、性能和时间。已停止残留任务并确认当时无运行代理／后台命令；随后仅新开一个禁止再委派的只读交叉核对任务，现已结束。上一轮回报只作线索，本文以重新阅读源码和本轮实际执行为准，替代中止轮的草稿状态。
- 源码基线为 `6a3a7b24f003006a83a7dc379532d149729c7726`（0.15.0 源码＋交付文档）；已有任务引用文档改动保留。未改运行时、测试、生成物、vendor、Profile或SDK，未读取生产业务／日志、启动模型／Web Profile或测实际provider请求；未提交、发布、安装、重启或启用管理。
- **已确认**：decision 时间由程序生成而非模型填写；普通状态／读时钟不动态改写工具 schema；存在当前消费、投递去重、固定提交 frontier、授权先于缓存及历史捕获去重。见第3–5节。
- **结构成本／待测边界**：共享FIFO等待、大正文编码／哈希、冷验证和累计消息增长；wall clock回拨会影响无epoch变化的TTL。不能把这些直接称为生产事故、内存泄漏或provider缓存损坏。
- **没有证据的结论不作**：实际cache-hit率、真实请求的token前缀、线上CPU/RSS／p95、全会话零积压。下文优化均为候选，不是已批准或已实现的改造。

## 2. 四种不同的“缓存／积压”

| 层面 | 本轮能核验什么 | 不能推出什么 |
|---|---|---|
| 模型请求前缀／provider缓存 | 插件注册与消息装配是否稳定、变化可能出现在哪里 | 未取得实际渲染请求与usage，不能宣称命中／miss及比例 |
| 插件内部缓存 | 可信源身份索引、prepared／RefreshGate、授权与失效、实际baseline可见性 | 内部命中不等于provider命中，hash／TTL不是授权 |
| 单次输出预算 | 模型DTO和当前注入有界、长正文可续读、尾部变化有signature | 单条有界不等于整个会话累计token／内部CPU／峰值内存有界 |
| 持久历史／提交与调度队列 | 捕获去重、固定frontier、overflow／timeout、共享FIFO及取消 | 保留历史不等于未处理工作；显式队列等待不等于死锁或无界积压 |

若最终请求只是向末尾追加token，新内容并不自动否定它之前的共同前缀；若tools/system或早期有效历史变化，共同前缀可能更早终止。这里只是条件性分析，不假定特定provider算法、阈值、缓存保留期或路由策略。

## 3. 时间来源：用户担心的创建时间路径符合预期

1. **模型不填写记录时间。** [command／decision白名单](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instrument-state.ts#L141-L175>)不含createdAt／recordedAt／updatedAt／registration；额外键由[解析器](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/validation.ts#L27-L35>)拒绝。时间也不是需要模型每回合计算的参数。
2. [写入程序](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L278-L350>)默认用Date.now，在apply调用中取得recordedAt；它是登记写入的程序采样，不是用户问题真实发生时间、文件mtime或精确磁盘提交时刻。重试回执保持首次已应用事件，不重新给旧事件盖时间。
3. [完整／current读取](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L282-L312>)从已存来源取时间，不读取当前clock生成createdAt。registration按最早可证明源revision取时间，updatedAt来自最新业务版本；已读／隐藏和幂等重放不更新业务时间。[首版索引](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L119-L161>)是可信不可变源上的WeakMap索引，不是每条decision每次扫描全历史。
4. V1连续事件、V2完整技术回执和tail提供不同证明；assigned还须证明首版授权，否则null。purge后的history第一行不是创建时间，clock回退也不改“最早revision”身份。[现有回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/instruments-current.test.mjs#L161-L274>)已覆盖更新／重放／压缩／清理／冷重开。程序wall时间本身不保证单调或绝对准确，业务排序不能以最小timestamp代替revision。
5. 新增registration／updatedAt不进入[模型轻量preview](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L519-L523>)；授权detail可带元数据。[消费](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L189-L232>)选择真实业务provenance.recordedAt，而非每读新造“当前时间”。稳定事件时间可以保留，不能为缓存抹掉来源。

### 时间字段逐项区别

| 时间 | 位置／行为 | 推荐处理 |
|---|---|---|
| 业务recordedAt、首次登记／业务更新 | 程序写入一次或真实业务更新后变化 | 保留证据；不让模型提供、不按读取刷新 |
| 资源轮询checkedAt／ledgerRevision | 当前注入facts不选择这些每读元数据；[去重回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/consumption.test.mjs#L390-L419>)验证无语义变化不重发 | 不扩大成“所有工具都不返回时间”的承诺 |
| resource工具checkedAt、audit generatedAt | [工具投影](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/model-tools.ts#L205-L219>)实际返回；[audit读取](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1791-L1813>)即时采样 | 是工具结果变化，不是schema变化；采样时刻与业务事件分开，是否减量另测 |
| worktree检查／native事件时间 | [消费选择](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L214-L228>)保留；[native重复等价事件](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/native-executions.ts#L129-L195>)不改recordedAt | 不把有意义的核验／结局时间统称噪声，不据字段存在推断每次轮询都在写 |
| RefreshGate TTL／catalog退避 | [gate](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/refresh-gate.ts#L15-L45>)及[退避](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L361>)使用程序clock，属内部调度 | 需区分wall事件时刻和elapsed时长；monotonic elapsed为候选，不能给每轮正文塞now |

本会话的“Time sampled while preparing turn”文字未在所检插件src定位；未调查宿主内部请求链，不归因本插件，也不假称知道它在provider token序列中的位置。

## 4. 工具注册与上下文投递

| 证据 | 本轮确认 | 限定 |
|---|---|---|
| [统一注册](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1685-L1700>)、[工具面回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/model-contract.test.mjs#L26-L41>) | 描述为固定字面量、参数为固定JSON request；常态七项，delegate显式opt-in | facade能力和配置可能改变可用集合；不是承诺所有配置同一工具面 |
| [audit注册](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1817-L1841>) | 任一配置启用监督时注册，全部关闭时移除；已注册不重复注册 | 这是配置引起的例外，不是普通状态每次重注册；不可为缓存擅改权限／注册策略 |
| [dynamic context](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1308-L1313>)、[装配](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1987-L1988>) | 已关联会话注入固定短工具指针，否则空串 | 首次关联会从无到有，不是把全量快照每轮覆盖system |
| [preStep／postExecute](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/host.ts#L1942-L1967>) | 保留原消息／结果后追加owned snapshot候选 | 最终SDK投影／compaction仍可改变有效历史；插件append不证明provider序列append-only |
| [baseline与step去重](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1049-L1127>) | 实际Agent／Session／正文及可见性相符才省略；同admitted step至多一份，缺baseline需重装 | 候选未入模型不算送达；嵌套工具更新可在下一admitted step进入新快照，其自身工具结果仍有效 |

重复刷新／viewer-only／资源读时间已有去重覆盖；[快照回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/snapshot-baseline.test.mjs#L23-L257>)验证拒绝、取消、projection／替换及compaction后恢复。不要为减少输入永久省略“上次hash相同”的快照。

**累计增长仍需诚实说明。** 真正变化会追加新快照；同一步至多一次和单条预算没有将整个长期会话历史设为固定大小。重复协议也会随变化快照再次出现。protocol中还含native outcomes／pendingRelease等易变分支，不能只优化facts JSON而忽略[协议部分](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L248-L310>)。现有compaction／消息投影机制仍由宿主负责，不自造删历史、delta-only或持久消息替换器。

## 5. 性能与队列复核

保持[0.11.0既有性能契约](<PERFORMANCE_READ_PATHS.md>)，不是重新宣告旧问题未修复。当前确认：

- [currentIndex](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/instruments.ts#L225-L273>)只保当前merged value和provenance；历史线性builder与精确版本索引仍在。同可信不可变源复用首版时间证明。冷源验证／索引首建仍可能扫描保留事件，WeakMap不是零CPU或峰值内存保证。
- [实际消费回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/performance-runtime.test.mjs#L28-L61>)验证首次／源变更／失败才full补捕获，已成功且无变化的热路径不再构造全部业务history。不要把MemoryStorage每读clone的测试行为外推成Domain生产对象复用行为。
- [指纹／预算](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L133-L187>)仍遍历选定当前数据、排序和signature；输出截断也要检测尾部变化。当前实体／正文越多仍有成本，不是每轮扫描全部历史。
- [正文编码](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/model-output.ts#L161-L179>)可每64KiB协作yield，但每片仍编码／hash整个选中正文；[locator](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/model-output.ts#L261-L276>)也有同步整正文hash。需量化hash字节与页数，不以单片输出小宣称内部工作小。
- [固定durability frontier](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L344-L363>)和[本次捕获](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/consumption.ts#L381-L447>)仅等待当时本实例已登记提交，不追随后来提交、别实例或child寿命；跟踪溢出明确unknown，timeout／迟到与取消有既有处理。这不等于全系统inflight绝不增长，也不承诺timer能抢占同步格式化CPU。
- 共享权限FIFO仍有真实head-of-line等待。[summary阻塞回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/summary-performance.test.mjs#L145-L211>)和[preStep竞争回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/tests/summary-performance.test.mjs#L340-L379>)故意通过受控端口证明等待存在；不是新的死锁或线上延迟事故证据。不能为性能擅拆FIFO、跳授权／freshness／物理事实或放宽storage latch。
- 内层投影key包含native revision／live数量，[外层prepared](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/runtime.ts#L1079-L1127>)另有epoch／TTL。纯状态无写、同数量成员替换等组合应在真实preStep seam补覆盖；未做该组合复现，不能据两层key不同宣称缓存已漏失效。

**clock边界有一个可复现特性**：[RefreshGate](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/6a3a7b24f003006a83a7dc379532d149729c7726/src/controls/refresh-gate.ts#L33-L45>)用wall差值。相同epoch下clock回拨会延长TTL；epoch变化仍立即要求刷新。一次性注入clock探针已确认该算术行为，不代表生产clock发生回拨或义务实际被延迟。推荐未来以monotonic elapsed测TTL／退避，业务recordedAt继续epoch wall；目前未修改。

## 6. 本轮实际执行与结果

源码直载、内存fixtures和现有公开SDK装配；不重建lib、不连接生产服务、不调用provider。下列12个已有测试文件本轮重新运行：

```sh
DSH_CONTROLS_HOST_ROOT="${DSH_HOST_ROOT:?set an existing SDK root}" \
node --test --test-concurrency=2 \
  tests/instruments-current.test.mjs tests/instrument-cleanup.test.mjs \
  tests/consumption.test.mjs tests/performance-consumption.test.mjs \
  tests/performance-runtime.test.mjs tests/performance-remote.test.mjs \
  tests/performance-host-identity.test.mjs tests/instrument-projection-performance.test.mjs \
  tests/snapshot-baseline.test.mjs tests/model-contract.test.mjs \
  tests/summary-performance.test.mjs tests/bounded-model-tools.test.mjs
```

- **136 tests，136 pass，0 fail／cancelled／skip**，退出码0。不是完整发布suite，也不是所有provider缓存或线上负载验收。
- 历史500／1000／2000／4000版本的线性迭代计数仍通过；42MB旧full与300次小current／同源registration复用回归通过；冷热捕获、撤权／locator、source检查／uncertain、baseline恢复、frontier／overflow／取消及队列等待情景均在所选文件内。
- **额外内存探针A，退出码0**：createdAt／recordedAt／updatedAt／registration分别放command顶层和decision value，8种伪造均被拒绝；20次full／current读取对注入写clock调用数为0，首次时间不变；同operationId重放不改首次时间。没有新增测试文件或写生产对象。
- **额外mounted探针B，退出码0**：普通workflow／decision创建／答复及模拟读clock前进60000ms后，整份工具schema逐字对照改变数0，dynamic短指针保持相同；未切audit／delegate配置，因此不外推那些工具面例外。另以注入clock确认无epoch变化的回拨TTL行为。
- 合成计时只作本机fixture观察：不作生产SLA、不报优化收益率；本轮没有前后实现对照。provider的真实请求／token／usage与线上CPU/RSS证据均未取得。

## 7. 完善后的推荐与停止条件

| 顺序 | 最小候选 | 开工／验收门槛 |
|---|---|---|
| C0 现状检查 | 本文、时间来源与工具稳定探针、已有回归 | 本轮已执行；不预设问题存在，不冒称provider缓存已测 |
| C1 先测实际工作量 | preStep／postExecute／readCurrent／mounted Remote分别统计queue等待、源读、full/capture次数、编码hash字节、写次数、分配峰值、消息安装与累计字节 | 在隔离现有seam观测，不新增生产调试工具；固定当前N变历史H、固定总事件变N、长正文／多读者／突发写分别测 |
| C2 稳定协议与易变尾区 | 先在现有owned message中减少重复、稳定指导靠前、outcome明细靠后；按语义审计采样时间 | 缺baseline／compaction／撤权／OFF恢复、新义务、归零／删除仍正确；不直接改成delta-only或静态消息只注入一次 |
| C3 仅优化被测热成本 | 可信源身份上的行signature／纯索引复用，或monotonic elapsed；按数据再选 | 不缓存巨型编码体来换CPU，不改业务时间、不弱化source／授权／latch；比较样本median/p95与工作计数 |
| C4 provider效果验证 | 未来单独授权的隔离公开请求seam，脱敏结构与provider已公开usage（若有） | 区分工具面、system、消息投影、路由／保留策略；未获数据就只报潜在抖动，不报命中率 |

C1–C4仍为候选，未获实现或真实模型试验授权。没有发现“模型必须提供创建时间”的错误，也没有发现普通状态会动态改schema的回归，**不为焦虑先重构**。后续任务引用改造应继承以上检查，不借其引入后台抓取、静默历史清理或本地current冒充来源current。
