# 公开安全的源码与开发交付验证摘要

本页记录合成数据、隔离 SDK/存储和公开接口上的机械验证，不公开原始用户/会话或本机环境记录。源码修复不等于部署、发布或绝对无缺陷保证。

## 0.6.0 制品验收（2026-11-01）

本版新增仪器工具卡原生呈现：使用 DSH 公开 baseline `ui-primitives` 的 `DisclosureRow`、`CodeBlock`、`JsonBlock` 和 `Button`，默认折叠，展开体上限 360px；标题与 action/target 保留英文 wire 值，原始记录二级折叠。未使用仅 0.2.2 存在的 `headerAccessory`；vendor、Skills provider、Host 运行时、通道语义和 `engines.dsh` 未改。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.6.0.tgz`（**463,605** bytes，sha256 `96875746fb75584a4005d4604b577b6fc4460b0c53e18718360300a19eafe1ff`，**178** 成员，源提交 `7dc3279`）通过 `--prepack` 与精确 tarball 验证；固定清单 **93 + 85 vendor = 178**，构建 **74** 个 JS/DTS 产物，Client **275,623 B**。规范宿主 `0.2.2-alpha.2` 上的全量套件 **967 项：764 通过、0 失败、203 skip**；定向客户端套件 **122 项：116 通过、0 失败、6 skip**。skip 是环境门禁/native host fixture（包括缺少 `@deepseek-ai/dsh-client-ui-slots` 的 activation 用例），不是插件加载失败。

本轮未运行双宿主、无宿主根、隔离 headless 安装/挂载、真实模型试验或图形浏览器验收，也未把制品安装到本机 DSH/Profile。完整记录见 `dist/verification-0.6.0.json`。

## 0.5.1 制品验收（2026-10-31）

本版只更新来源：distribution `v0.3.1` / 上游 Skills `v1.3.2`（commit `d1478fc`）。promoted 集合仍为 27 个 Skills，stable/beta 成员不变；vendor **85 文件、296,048 bytes**，root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`。16 个 promoted Skill 的 19 个文件更新，运行时、通道语义、provider 和 `engines.dsh` 均未改。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.5.1.tgz`（**460,167** bytes，sha256 `47746b28622bdc144fcde4856142a4c2bed63d24fe2b373fbc77b099c8bf1f0e`，**178** 成员，源提交 `681ecb3`）通过 `--prepack` 与精确 tarball 验证；固定清单 **93 + 85 vendor = 178**，构建 **74** 个 JS/DTS 产物，Client **261,016 B**。规范宿主 `0.2.2-alpha.2` 上的全量套件 **964 项：764 通过、0 失败、200 skip**。

本轮未运行双宿主、无宿主根、隔离 headless 安装/挂载或真实模型试验，也未把制品安装到本机 Profile。完整记录见 `dist/verification-0.5.1.json`。

## 0.5.0 制品验收（2026-10-31）

本版新增可选交付监督：独立工作区配置、内存观察台账、可选只读审计工具、持久化 dry-run episode、事件驱动定期/嫌疑检查、可选 reviewer 路由与 fail-closed、每小时/每日/token 预算、票级 attribution、研究/评审标记和右栏/设置页只读历史。默认关闭；没有安装、激活或发布到本机。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.5.0.tgz`（**450,738** bytes，sha256 `202514c0d6ee395ded3050bfe2d87a82c4af540ae5e302eac2a3f5ee4a5ac315`，**178** 成员，源提交 `f3fe67f`）通过 `--prepack` 与精确 tarball 验证；固定清单 **93 + 85 vendor = 178**，构建 **74** 个 JS/DTS 产物，Client **261,016 B**。规范宿主上的全量套件 **964 项：764 通过、0 失败、200 skip**；包策略测试 **21/21**。

本轮未运行双宿主、无宿主根、隔离 headless 安装/挂载或真实模型试验，也未把制品安装到本机 Profile。完整记录见 `dist/verification-0.5.0.json`。

## 0.4.39 制品验收（2026-10-29）

本版适配 DSH `0.2.2-alpha.2` 的工具执行拆分：`mattpocock_execute` 的受管原生嵌套调用在具备 executor selection 的宿主上改走公开 `@deepseek-ai/dsh-tools/pipeline` 的 `prepare → dispatch → complete`，保留原调用的 parent token、policy、guard 与 post-execute；旧宿主仍保留单调用回退。Skill provider、vendor 字节、通道语义与 `engines.dsh` 未改。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.39.tgz`（**428,735** bytes，sha256 `0732000b065824fdd685943dffe0b5674b404fd24adc70ad626de9965cdca1e2`，172 成员，源提交 `bbc0bf3`）经精确 tarball 验证与同一源提交的 disposable e2e pack 通过：规范宿主 `0.2.2-alpha.2` 下 944 用例 **744 通过／0 失败**（200 skip）、双宿主 970 中 **964 通过／0 失败／6 skip**、无宿主根 944 中 **649 通过／295 跳过／0 失败**；`0.2.1-rc.3` 回归同为 944／744／0／200。隔离门禁在 **0.2.2-alpha.2 与 0.2.1-alpha.1** 两个真实宿主上各自从私有源码快照安装、headless 挂载，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。构建模块 68、固定文件 87、vendor 85、Client **212,412 B**。本轮未重跑六宿主隔离与 14 原生＋13 管理器的同归档矩阵，也未把制品安装到本机 Profile。

完整记录见 `dist/verification-0.4.39.json`。

## 0.4.38 制品验收（2026-10-24）

[输入摘要](<../src/client.ts>) 现在按最近活动排序：票总数与 T/S 固定在顶部；工作流行按工作流定义或任一票的最新修订倒序，右侧详情入口开启时最多展开两个工作流，其余显示为一行可点击的「其余 N 个工作流 · 查看详情」。右侧入口关闭时不折叠，避免摘要把行变成不可达。没有票的工作流只显示「暂无票」，不铺开全零状态计数。折叠不删除记录、不改变状态定义、计数、权限或 T/S 语义。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.38.tgz`（**427,749** bytes，sha256 `217749468a4764b17be220749cc52dca32d350d19c6d7d20bcad91f63d5ad3dc`，172 成员，源提交 `5ef9069`）经精确 tarball 验证与同一源提交的 disposable e2e pack 通过：`0.2.1-rc.2` 下 944 用例 **744 通过／0 失败**（200 skip）、双宿主 970 中 **964 通过／0 失败／6 skip**、无宿主根 944 中 **649 通过／295 跳过／0 失败**。rc.2 隔离门禁在 headless profile 上从私有快照安装同一归档，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。构建模块 68、固定文件 87、vendor 85、Client **212,412 B**。InputSummary 真实 React DOM 回归 **29／29**，其中新增两条覆盖活动倒序、两行上限、显式详情点击、无票压缩及详情入口关闭时不折叠。本轮未重跑六宿主隔离与 14 原生＋13 管理器的同归档矩阵。

完整记录见 `dist/verification-0.4.38.json`。

## 0.4.37 后续优化：直接摘要、集中调度与 owner 级失效（2026-10-21）

本节是后续阶段，不替代下节已经完成的第一阶段记录。契约见[摘要读取设计](<SUMMARY_READS.md>)；源码、发行制品、Profile 安装、SDK 修改和服务重启分别核验。

- [instrument summary](<../src/controls/instruments.ts>) 从同一已验证不可变文档派生专用 current-only decision index，只保存计数与授权所需字段；不会先构造 history 再裁剪。保留 all-ticket assignment、ticketless creator、viewer 私有修订、OFF／hidden／read 不消除义务及 source uncertain latch。无新持久格式或异步摘要副表。
- [Remote](<../src/controls/remote-contract.ts>) 新增共享严格 request/result codec 与真实 AbortSignal 通道：每批 1–32 个唯一 session、版本只作传输 hint、结果逐项 current／unchanged／unavailable，总响应 256 KiB 上限。records:null 必须明确 records-unknown；有 records 不允许同时声称 records-unknown。DTO 不包含业务正文、历史、完整授权表、窗口／原生 S 或资源健康。
- [Runtime](<../src/runtime.ts>) 对每项重新鉴权并进入既有 permission FIFO，已知 version 不能绕过撤权。只读 controls association，不 ensure 陌生 cold session，不把列表导航保留为 native runtime handle；摘要不读窗口／资源、运行 Git、扫描工作树日志、捕获 history 或确认通知。每项之间让出 FIFO 给已经入队的写入，不把 32 项批次当作一个长事务。完整详情与模型消费的持久化 frontier 保留。
- [Client](<../src/client.ts>) 每 app 一个 summary 调度器，至多两批真实 pending RPC、一个 summary timer；共享同 session、逐项 generation fence、末个相关 holder 才取消整批、matching unchanged 复用、5／10／20／40／60 秒错误退避、hidden 至少 30 秒与一次 foreground 恢复。另有一个根级 policy 30 秒／hidden 60 秒恢复轮询，以发现另一客户端重新开显示；这些不冒称是跨 browser 的全局共享 timer。
- Badge／SourceCard 只持轻量摘要；Header／Input 为外层轻量显示 gate，仅显示时挂载完整观察子组件，原丰富内容不缩水；显式详情／settings inspection 保留完整读。完整 observer 的 lazy session 路由 handle 避免 render→effect／LRU 后悬空引用；holder 或 subscription 活跃时不可驱逐，零活跃后只回收最多 64 个闲置元数据、60 秒惰性 TTL，不涉及业务历史保留。Mounted row 不等于 viewport-visible；没有宿主 DOM 猜测。
- [owner freshness](<../src/controls/refresh-gate.ts>) 与 Runtime CAS 只失效／捕获实际变化的 instance，包括被移除行的旧 owner；开始排队和效果 settlement 都标记，防止早先仍在读身份的请求把 pre-commit 数据认证成新缓存。全局 policy／grant 仍全局失效；scoped epoch 元数据有界，淘汰时保守全局失效，不因忘记旧水位放过旧读。两个公开回归先 RED，分别锁普通业务写、operator 通知 bookkeeping 不重建另一 owner 热视图。

### 实测：当前条目固定、历史增长

[正式性能回归](<../tests/summary-performance.test.mjs>) 通过真实 Domain InstrumentStorage／VersionedStorage adapter 与稳定内存 table，固定 1 workflow＋1 当前 decision；每档 current／unchanged 各 50 次。以下是一次隔离机械测量，JSON 是 facade payload，不含 RPC envelope、压缩或 browser decode；不是现场网络或整机 retained heap 数据。

| 旧 decision 版本 | 完整 Runtime JSON | current summary | unchanged | current 热 p50／p95 | unchanged 热 p50／p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 5,899 B | 722 B | 129 B | 0.9220／2.0271 ms | 1.1072／1.3044 ms |
| 30 | 41,327 B | 723 B | 129 B | 0.8386／1.0739 ms | 1.1144／1.2937 ms |
| 3,000 | 3,594,073 B | 725 B | 129 B | 0.9143／1.1815 ms | 0.9115／1.3803 ms |

每档 100 次热读取仍发生 100 次 Domain source freshness 检查、0 instrument 写入；已知 version 时源失败也返回 records:null＋unknown，恢复后正确 current。冷成本单列：3,000 旧版本时 Domain hydrate／validate **103.82 ms**，随后首次 Runtime summary（首次 load parse／current index）**73.60 ms**；独立 full fixture 的首次完整 readSession（含 history capture）**845.89 ms**。这些证据不承诺冷读取 O(1)、磁盘 I/O 已优化或 index 每次只运行固定次数；没有默认运行 30k，也不以此宣称现场 OOM 已归因／解决。

公开 storage gate 证明保留 FIFO 仍有 HOL：先入完整读被窗口 source gate 阻塞时，后续摘要 sourceChecks=0；释放后才变为 1。一次样本外层鉴权完成→FIFO 内首次公共鉴权标记等待 **2.1052 ms**，标记→facade 返回 **0.8359 ms**，总 **2.9812 ms**。这是公开可观测区间，含 continuation／微任务，不冒称私有 enqueue 精确计时或纯 CPU；本轮没有擅自改成跨 owner 并行写队列。

### 实测：当前事项数与模型消费路径

同一[性能回归](<../tests/summary-performance.test.mjs>) 另将旧历史固定为 0、当前 decision 行数设为 **1／100／1,000**：current payload 为 **722／726／728 B**，unchanged 均 **129 B**；每档 50＋50 次热读取仍有 100 次 source 检查、0 instrument 写入。一次样本 current 热 p50／p95 为 0.7815／1.0575、0.7992／1.0043、0.7981／1.0447 ms；冷 Domain hydrate 为 0.2184／2.4569／34.2616 ms。CPU 可以随 current rows 增长，不根据噪声级计时差异宣称 O(1)。

消费路径以真实 RuntimeFacade.preStep＋Domain adapter、受控 native 端口衡量，每档 50 个预热样本，无真实模型调用：0 个并发摘要客户端时 step p50／p95 **0.4431／0.5971 ms**；同时两个独立 summary RPC 时 step **0.7735／0.8677 ms**，三请求整轮 **1.9722／2.2736 ms**。每份消费正文约 9 KB，正式断言完整 pending 用户义务与原始 agent 作者保留；热 prepared view 可直接复用，不一定进入 FIFO，基线 sourceChecks=0，双客户端样本实际 summary sourceChecks=100。合成 step key 仅用于交付去重测试，不是实际 turn／S 收据。

另在 source 与完整 snapshot 均预热后，仅 Date 测试时钟前进 2,001 ms 跨既有 freshness 窗口，先让 summary 持有公共 InstrumentStorage.read gate，再提交需要刷新的 preStep。门控期 step 未到公共 source-entry、Domain get=0；放行后 get=2 且完整义务／作者保留。一次样本确定阻塞下界 **11.1710 ms**、step→首次 source-entry **12.3340 ms**、随后→返回 **3.1001 ms**、总 **15.4341 ms**。这些是公开区间与人工门控，不是 live 模型延迟预测，也再次确认 HOL 没有消失。

### 实测：mounted 摘要 holder 与双客户端

[闭合 Client bundle 回归](<../tests/client-summary-scheduler.test.mjs>) 使用最终合法 typed summary／RemoteResult 测试 wire；不是手写极小 DTO 草图。每 app、同一调度轮次的实测如下，双独立 VM／app 各自同值，总 RPC／bytes 翻倍。

| 每 app holders | 启动 RPC | 启动 request／response JSON | 每 5 秒 unchanged RPC | 稳定 request／response JSON |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0 | 0／0 B | 0 | 0／0 B |
| 20 | 1 | 404／13,710 B | 1 | 1,944／2,380 B |
| 150 | 5 | 3,110／103,210 B | 5 | 14,660／17,890 B |
| 300 | 10 | 6,330／206,860 B | 10 | 29,430／35,890 B |

非空时峰值 pending≤2、一个 summary timer，空时无 timer。此表只含 summary，不含根 policy、显式 full detail，也不代表真实 GUI 同时挂载了相同数量。回归另锁不合作的超时 transport 仍计入两并发上限、忽略 abort 的迟到结果、部分 release、重复 foreground、错误恢复与强刷尾部公平性。[真实 React DOM](<../tests/client-settings-dom.test.mjs>) 覆盖隐藏 header/input 零 full entry、同时显示共享一次完整读、再次隐藏释放，以及本 session display=false 停读后根 policy revision 恢复、unknown 不显示为 0。

### 独立复核：Standards

该轴确认的 2 项 P2（刷新期间超时仍保留 stale-ready、部分刷新后最后相关 holder release 未取消）均已在正式 RED→GREEN 后独立关闭，无遗留可行动标准问题或 Fowler 判断型建议。最终源码重新核对 hold-lifetime 字段／捕获／附着关系，独立 **32／32** closed-bundle 测试通过；混合 A/B 回归还证明重新取得 A 的新租约不受旧 error／deadline 影响，而持续持有的 B 仍正确收到自己的失败，物理请求直到 settlement 才离开预算。

### 独立复核：Spec

该轴确认的 2 项 P2（superseded／last-relevant 请求取消、旧租约结果跨 release→reacquire）均已独立复现、补正式 RED→GREEN 并关闭，无遗留 Spec 缺口或范围扩张。最终同样独立 **32／32** 通过；取消使用统一 current-member 判定，错误／deadline 按同一 hold-lifetime 附着关系，成功另受 generation fence 保护，不能以修正超时为由污染新 holder 或提前释放不合作 transport 的物理并发槽。

两轴最终核对同一 production diff SHA-256：

`181af9240b8c24210526678230d8e546aeeafed96672ed76b773d7b10f94127d`

以上是彼此独立的评审轴，不合并成一个优先级排行，也不是 live GUI／模型／S 程序执行认证。Standards 2 项已关闭、Spec 2 项已关闭，两轴最严重历史项均为 P2，最终各 0 个 open。

### 最终统一门禁

Node 24.17.0／pnpm 11.8.0，主检出严格 Host 构建、独立 Client noEmit、最终闭合浏览器 bundle 与 entry declaration 均通过（编译堆显式 8GB）。最终 Client **209,378 B、6 个私有 browser-safe 模块，React 为唯一 external**；生成文件不是安装位置，未依赖 HMR 自动更新承诺。

后续新增 **64 项**正式回归（core summary 9、Client scheduler 32、DOM 2、Runtime summary 7、共享 codec 4、scoped freshness 3、跨 owner cache 2、实际 Remote 1、性能 4）。修正新增开发包 smoke 中的同名局部变量后，最终完整根套件重新运行：**942 项，742 通过、0 失败、200 个环境门禁用例明确跳过**，**81.80 秒**；双宿主（rc.2＋alpha.1）**968 项，962 通过、0 失败、6 跳过**，无宿主根 **942 项，647 通过、0 失败、295 跳过**。中途未完成／失败的运行不计成功，跳过项不冒称实际宿主／GUI／模型认证。

[开发制品验证](<../tests/controls-package.test.mjs>) 另行 **2／2** 通过（11.63 秒），最终根套件也再次通过这两项：独立 scratch build 的 **68 个 JS／声明文件**逐字节匹配当前产物；真实 pnpm pack 的 **87 固定＋85 vendor＝172 文件**精确清单、模式、字节、导出目标及解包后无依赖 controls 行为通过，包含新 readSummary 与 request/result parser 的 smoke。vendor **85 文件／279,662 B**、beta／stable 各 27 skills 与原有摘要未改变，发版包版本为 0.4.37；包／兼容配置与 lockfile 未改。

两个本轮实现工作树在补丁整合、源／测试逐字节比较和子代理退出后已实际删除，并登记 observation cleaned；原有其它工作树不动。安装目录的 client／runtime／host 三个 SHA-256 与本轮前一致。改动纳入清洁提交 `3b542b5`，并完成一次构建的正式 tarball、精确成员／字节和 `0.2.1-rc.2` 隔离门禁；源码审查后的 production diff 哈希未变；开发包验证不替代清洁提交身份的正式发行 prepack／tarball 门禁，也不宣称完成六宿主安装矩阵、实 GUI／真实模型／OOM 因果认证。

## 0.4.37 制品验收（2026-10-21）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.37.tgz`（**426853** bytes，sha256 `a55f036000e08402edcfae71a00c0333ea3a2af3776da8f6561aba13bfc46f6c`，172 成员，源提交 `3b542b5`）经精确 tarball 验证与同一源提交的 disposable e2e pack 通过：`0.2.1-rc.2` 下 942 用例 **742 通过／0 失败**（200 skip）、双宿主 968 中 **962 通过／0 失败／6 skip**、无宿主根 942 中 **647 通过／295 跳过／0 失败**。rc.2 隔离门禁在 headless profile 上从私有快照安装同一归档，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。构建模块 68、固定文件 87、vendor 85、Client **209,378 B**。本轮未重跑六宿主隔离与 14 原生＋13 管理器的同归档矩阵；精确归档、隔离门禁及版本测试已覆盖本次发行差异。

完整记录见 `dist/verification-0.4.37.json`。

## 未发布源码修复：空回放缓存失效与原生目录契约（2026-10-21，基于 0.4.36）

Runtime 的 worktree observation replay 不再在每次 Promise resolve 时无条件使投影失效；只有新补登记事实、异步核验提交或 replay 健康变化才推进失效水位。已开始／已完成／空 replay 不把只读查询变成新变化。后台核验即使晚于首读完成，也必须使下一次读取看见检查结果；replay 失败按 owner instance 呈现 unknown，先核对 child 归属再读取它的日志，不能把另一 owner 的失败带入本实例。既有 2 秒刷新窗口、效果排序、消费持久化 frontier 与业务义务保留不变。

[Host adapter](<../src/host.ts>) 分别使用公开的 SubagentCatalogEntry 与 SubagentDescendantListEntry 类型：listChildren 的普通行没有 kind/activity，在 adapter 直接归一化；unknown mode 表达 unsupported，畸形输入表达 invalid coverage gap，不把可读 running 下界改成已知零。双方法宿主仅调用直接目录，拒绝／超时不改走整树；本次保留既有仅 listDescendants 宿主的兼容分支及其原有成本，不扩大该支持面。

新增 16 项正式回归：[投影缓存](<../tests/runtime-projection-cache.test.mjs>) 3 项、[回放管线](<../tests/worktree-observation-runtime.test.mjs>)新增 3 项、[原生目录形状](<../tests/native-catalog-shape.test.mjs>) 10 项。原缺陷与延迟核验写失败均经过 RED→GREEN；目录覆盖普通 direct、unknown／畸形、external／cold、live status／depth、空目录、诊断／拒绝、预算／冷却／迟到恢复与旧结果不可覆盖新发布。

机械验证（Node 24.17.0、pnpm 11.8.0，规范宿主根，测试并发 2）：全根套件 **878 项，678 通过、0 失败、200 个环境门禁用例明确跳过**，75.85 秒；新增回归全部运行。原两项失败探针现均通过：相邻未变投影额外 business storage read 为 0、复用同一冻结快照；合法直接目录 known=true、running=1、reason=null。独立 Standards 定向复跑 24／24；Spec 复核发现的核验写失败缺口已补正式 RED→GREEN 并复核关闭，最终两轴无遗留阻塞项。

Host 严格构建与 Client noEmit／闭合浏览器图检查通过；68 个 JS／声明产物与独立 scratch build 字节一致。另行复跑[开发制品回归](<../tests/controls-package.test.mjs>) **2／2**：真实 pnpm pack 精确 **87 固定 + 85 vendor = 172** 个文件、逐文件字节／模式／导出目标与解包后 controls 行为通过。不可变 vendor 85 文件／279662 bytes、原有摘要和兼容选择器均未改变。构建使用显式 8GB 编译堆；隔离 lane 的默认约 4GB noEmit 曾 OOM，不计为通过，最终 strict 构建以主检出的成功结果为准。

本节只记录未提交源码与开发制品验证，不代替要求清洁提交身份的正式发行 prepack／tarball 门禁，也不声称完成六宿主安装矩阵或 GUI／真实模型验收；当前安装包、版本、共享 SDK 和 Profile 未更新，未安装、发布或重启服务。临时实现工作树已在 patch 完整集成后清理。轻量 summary、集中轮询、observer 回收、owner 级队列及 OOM 归因实验不在这次修复范围，不把本次结果扩张为已解决 4GB OOM。

## 源码改动：worktree 动作拒绝回显（2026-10-18，0.4.36）

`mattpocock_worktree` 的工具说明改成显式 JSON 联合形状，并明确 `action` 必须在 `request` 顶层。未知 action 的拒绝现在回显收到的 action（缺失时为 `no action`）和 `request` 的实际 keys，再列出 `read`／`update`／`update-observation`／`reconcile` 四种期望形状；不再只给一句没有输入上下文的 `action required`。新增 [model-contract](<../tests/model-contract.test.mjs>) 回归：错误 action 必须回显 `action` 与 keys，`{"update-observation": {...}}` 这种嵌套形状必须报告 `no action` 与实际 key。全根套件 862 项 **662 通过／0 失败／200 跳过**（`0.2.1-rc.2`，Node 24.17.0）、双宿主 888 中 **882 通过／0 失败／6 跳过**、无宿主根 862 中 **568 通过／294 跳过／0 失败**；本改动不改变 action 词表、业务语义、存储或权限。

## 源码改动：捕获水位与多行域惰性打开（2026-10-18，0.4.35）

本轮只降低投影副作用与启动成本，不改 S/T、执行准入、窗口操作或业务记录语义。`src/runtime.ts` 为每个 instrument instance 记录来源水位（businessRevision、window revision、worktree revision、runtime document revision、saved policy revision、resource revision）并只在捕获成功后推进：来源未移动的重建不再重建 observation 列表、去重索引或读取 history 存储；只有投影自身的 context 读取仍会发生。`src/controls/instruments.ts`、history 捕获读取、window revision 读取与 history query 的来源 revision 改为复用既有的 memoized 解析；worktree bindings 原本已 memoized。`src/host.ts` 把 instruments、windows、resources 三个多行域的打开推迟到首次授权使用，启动只打开 startup settings、controls、policy grants 与 runtime bindings；dispose 期间迟到的打开会关闭 handle 并失败，不泄漏。没有 live Agent 的挂载从打开 7 个域降为 4 个，首次会话读取再按需打开。

新增挂载级回归 `tests/capture-watermarks.test.mjs`：首次捕获后等待 2.1 s 强制重建，验证没有来源变化的投影只产生一次 context 读取、不再进入 history 捕获；随后写 ticket 仍能正常捕获。移除水位判断时该用例红（读到 2 次），恢复后绿。`tests/host.test.mjs` 相应断言挂载只创建 3 个单元（startup/controls/grants），在读取 ports 后补齐 instruments/windows/resources。全根套件 861 项 **661 通过／0 失败／200 跳过**（`0.2.1-alpha.4` 与 `0.2.1-rc.2` 读数相同）、双根 887 中 **881 通过／0 失败／6 跳过**、无宿主根 861 中 **567 通过／294 跳过**；精确 tarball verifier、可弃 e2e pack 与六宿主隔离门禁通过。

## 源码改动：工作树工具门禁接受 update-observation（2026-10-18，0.4.34）

`mattpocock_worktree` 的工具说明与 runtime 自 0.4.30 起支持 `update-observation`，但宿主注册工具时的动作门禁只放行 `read`／`update`／`reconcile`，拒绝时仍把 `update-observation` 列在可接受动作里；模型因此重复尝试不同请求形状，观测清理无法落地。0.4.34 在 `src/host.ts` 补上该分支，并新增挂载级回归：把四个已公布动作逐一从真实工具注册表送进门禁，修复前红、修复后绿。全根套件 860 项 **660 通过／0 失败／200 跳过**（规范 `0.2.1-alpha.4` 与 `0.2.1-rc.2` 读数相同）、双根 886 中 **880 通过／0 失败／6 跳过**、无宿主根 860 中 **566 通过／294 跳过**。该改动不改变 S/T、执行准入、存储或业务记录语义。

## 源码改动：事件写放大与注入时延优化（2026-10-17，0.4.33）

本轮只改事件/读取成本，不改 S/T 语义、执行准入或业务记录。src/runtime.ts 对同一 runtime instance、同一 reason 的未知 knowledge 观察在登记持久提交前去重（known 观察或新 runtimeId 重新武装）；受管 lease 在保持 running 期间只写一次 running receipt；丢失归因对账按微任务合并并保留 skip 集合；worktree cold replay 从首读移到后台，完成后使投影失效；history 行查找改为一次索引，只对上次捕获后的 window operation 建 history，空 capture 不再读文档，cached Session 在 disposed 时回收，客户端隐藏标签页的轮询退避到至少 30 s。src/host.ts 的 catalog 走查按 owner 合并（在飞 + 至多一次补走），超时只限制本次等待而不中止宿主投影构建，迟到成功结果在未被更新走查覆盖时发布成员资格，超时后 30 s 内不再重复付构建成本；超时/拒绝仍按既定设计把计数标为明示下界（known=false + 机械 reason），不把目录富化失败改写成已知零。

开发工作树验收（Node 24.17.0，DSH_CONTROLS_HOST_ROOT=<DSH_INSTALL> node --test tests/*.test.mjs）：**859** 项、**659** 通过、**0** 失败、**200** 个桥/兼容环境门禁用例带诊断 skip（上一基线 856／656／0／200，本轮新增 3 条回归）。pnpm exec tsc -p tsconfig.json、pnpm exec tsc -p tsconfig.client.json --noEmit、node scripts/build-client.mjs --out lib/client.js --declaration 均通过；lib/ 已重建，套件内的 src/lib 一致性门禁通过。新增 [runtime-write-coalescing](<../tests/runtime-write-coalescing.test.mjs>)（150 个同一 unknown 事实的状态边最多 3 次持久写，下一次注入 <300 ms）、[native-running-count](<../tests/native-running-count.test.mjs>) 的 20 个 catalog 事件至多 2 次走查、[worktree-observation-runtime](<../tests/worktree-observation-runtime.test.mjs>) 的首读不等待后台 replay 且 replay 最终可见。

同一 2000 个 live 后代内存 fixture 的前后测量（下界）：热读取仍约 **0.6 ms**；首读 **1690 ms → 13.4 ms**；200 个状态事件后的下一次注入 **917.7 ms → 24 ms**；20 个 catalog 事件 **20 → 2** 次走查；400 个状态事件同步处理 **111.8 → 8.6 ms**。该源码随后作为 0.4.33 发布，六宿主隔离、同归档矩阵与规范/rc.2/双根/无根套件见下方制品验收；目录投影超时的真实归因仍由 live 宿主的会话查询成本决定，本轮只保证不再重复中止/排队同一构建，并让迟到的成功结果恢复计数。

## 未发布源码改动：宿主原生初始 cwd seam（2026-10-09）

`src/host.ts` 按实际加载的公开服务选择首次 cwd seam：宿主原生 `startActivation` 加会话工作目录 owner，或随包兼容提供者的 `initialCwdSupported`；能力判定不看版本字符串。原生 seam 的 `result` 承诺有人挂接失败处理，不把捕获失败变成宿主进程的未处理拒绝。

完整根回归 **824／824**，0 failed、0 cancelled、0 skipped，含新增两条真实 Host 装载用例（原生 seam 传递显式 cwd 且省略不伪造目录；缺工作目录 owner 时能力保持 unsupported 且不派发）。

隔离双宿主验证（同一工作树、各自全新 `DSH_HOME`、无模型调用）：`0.2.1-alpha.1` 与 `0.2.1-alpha.2` 的 `stable` 注册表报告 sha256 同为 `a7d694ead579fadeea80bd61f9cb821294ce629a757385529cdaf65aa1b96249`（27 Skills／11 模型可见）；alpha.2 探针确认 `startActivation: true`、`startContinuable: false`、`workingDirectory: true`、`worktrees: false`。

本条只记录未发布的工作树源码与隔离验证，**未**发布、**未**安装到本机 Profile、**未**重启任何服务。

## 未发布源码改动：宿主原生实时运行状态计数与子代理结局上报（2026-10-10，同日修订）

`src/host.ts` 新增事件驱动的 `NativeRunningCounter`：成员资格来自 `ctx.subagents.listDescendants`（仅暴露直接子级时用 `listChildren` 递归回退），只在成员变更节点（`agent/created`、`agent/disposed`、`subagent/catalog`、未知 id 的 start/end、首次基线读取、读取发现未知 live 后代）刷新；S.used 是「属于该 owner 子树、在成员资格内、且当前运行时 `Agent.status === 'running'` 的子代理数」——目录 `activity` 的 idle 常驻不计、原生启动子代理计入、external 子代理排除。`src/controls/windows.ts` 的读取路径因此是 O(live agents) 内存投影，不再每次读取遍历目录；快照新鲜度键纳入计数 revision 与 live agent 数，缓存不会掩盖新 child、item 或计数变化；`agent/status` 翻转零遍历更新计数。执行租约只保留为派发审计，不再进入 used、容量比较或注入快照。遍历完整且无 diagnostic 行时 known=true、数字精确；服务缺失、根目录读取被拒或任何 corrupt/unsupported/unavailable diagnostic 行返回 known=false、机械 reason 与可读 running 下界。

子代理终局只报宿主公开词表，不做推断：`subagent/end` 主路径直接采用 `stopReason`（非 `completed` 即产生 item，可读时附 `LlmFailure` code/message 原文）；被计为 running 的 run 在同一 runtime、成员资格新鲜时，既无 `subagent/end` 也无 idle 转换却消失时，只读该 suspect child 自身日志的最后一个 `turn/end`——`error` 附发布事实、`interrupted` 表示从未正常结束、`max-tokens`/`blocked`/`refusal` 按 kind、`aborted` 仅当取消原因不是本 owner 侧（`parent`/`disposed`）时报告、`completed`/`forked` 为正常返回、读不到日志或无 `turn/end` 时报告 `unobservable` 并给证据指针（session id、最后观测 turn/seq）。item 以 `sessionId[:runId]:turn` 去重（每失败 turn 一条），含 outcome/turn/cancelCause/diagnostic/evidence/最近已知 lane，经既有 `notifyOwner` 通道唤醒主代理一次，并以既有 durable notification 行（`native-stop:<itemId>`）作为跨热重载/重启的去重账本；重新观测到 running、start 边或迟到 end 后经既有清空路径清除；分类完成的 run 立即退休，后续节点不重复读日志，普通读取不触发对账。基线读取、插件热重载与 DSH 重启由 durable `knowledge.runtimeId`（`previousRuntimeId`）归因为 re-establishment，只重建计数，不产生 item、不唤醒；目录不可读时不宣称任何结局，只保留明示下界。只使用公开类型/方法/事件，不导入或调用未导出的私有符号（如 `epochStopReason`）。该归因路径取代先前按 TTL 近似目录结果的方案与更早的 silent-stop 推断：TTL 无法区分常驻 idle 与真正在跑，而 silent-stop 推断无法附带已发布失败事实与取消原因，并把不可读日志伪造成原因。

开发工作树三组验收（Node 24.17.0，`node --test tests/*.test.mjs`）：

- 规范 alpha.2 根：**832** 项、638 通过、0 失败、194 个桥用例带诊断 skip。
- 双根（alpha.2 + alpha.1 兼容根 `DSH_CONTROLS_COMPAT_HOST_ROOT`）：**858** 项、858 通过、0 失败、0 skip。
- 无宿主根：**832** 项、540 通过、0 失败、292 个环境门禁 skip。

生成物已重建并复核：`node_modules/.bin/tsc --project tsconfig.json`、`node scripts/build-client.mjs --out lib/client.js --declaration`、`node scripts/build-compatibility-patch.mjs --check`；`controls-package` 的 src 与 lib 一致性门禁在重建后通过。[native-running-count](<../tests/native-running-count.test.mjs>) 覆盖：读取零遍历（N 次读取 walk 计数不变、状态翻转零遍历、新未知 id 恰好一次）、idle 常驻不计而 turn-running 与原生启动计、期望差值 item 与唤醒恰好一次并在重新 running 后清除、基线/重启 re-establishment 无 item 无唤醒、目录不可读只给下界不宣称结局、服务缺失下界，以及用已安装 cordis/dsh-scope 动态复现 `scopeTarget(agent, agent)` 载体经 `emit` 到达未加 scope 的 root listener、child-scoped listener 只收自己 child 的 `agent/status`。新增 [native-child-outcome](<../tests/native-child-outcome.test.mjs>) 覆盖：error/interrupted/max-tokens/blocked/refusal 各自产生 item（error 附 code/message 原文）、本 owner 侧 aborted 无 item、外来 aborted 有 item、completed 无 item、同一失败 turn 跨节点/重启经 durable notification 行去重、后续 turn 失败是新 item、重新运行与迟到 end 清除、不可读日志或无 `turn/end` 时 `unobservable` 加证据指针且无编造原因、以及对账只读 suspect child 一次且普通读取不再读日志；其中分类由真实 `Session.append` 产生的 `turn/end` 事件驱动。原有 runtime 用例同步改写了目录精确计数、diagnostic 下界、被拒 listing、`listChildren` 递归回退与服务缺失断言。该源码与生成物均未发布、未安装、未重启任何服务。

## 双宿主测试根：规范 alpha.2 与兼容桥 alpha.1（2026-10-10）

宿主升级到 `0.2.1-alpha.2` 后，插件走宿主原生 per-child cwd seam，不再在 alpha.2 上加载版本钉住的兼容桥（0.4.25 的既有行为）。测试套件因此显式区分两个宿主根，不再让一个根同时承担两类断言：

- `DSH_CONTROLS_HOST_ROOT`：规范宿主（本地 `<DSH_INSTALL>`，`0.2.1-alpha.2`；具体主机路径不进入公开文档）。Host／Client 通用用例、宿主原生 seam 用例在这里运行。
- `DSH_CONTROLS_COMPAT_HOST_ROOT`：兼容桥证据根（本地 `<DSH_HOME>/hosts/dsh-0.2.1-alpha.1/node_modules/@deepseek-ai/dsh`，`0.2.1-alpha.1`）。初始 cwd recipe 应用、兼容 subagent 字节与 peer 绑定、公开 Loader 组合 guard、打包插件桥场景、真实 Plugin Manager 桥场景必须使用它；缺失时这些用例带 `set DSH_CONTROLS_COMPAT_HOST_ROOT ...` 诊断 skip，不改写断言、不计成通过。

在 prefix 中重建 alpha.1 根：`npm install --install-strategy=nested @deepseek-ai/dsh@0.2.1-alpha.1 <prefix>`，根即 `<prefix>/node_modules/@deepseek-ai/dsh`。nested 策略把传递依赖保留在各 owner 包的 `node_modules` 下，所以桥夹具会在临时只读 view 中把这些 owner 内包按 Node 可见名链接成一个根（[compat-host.mjs](<../tests/fixtures/compat-host.mjs>)，只创建 scratch 符号链接，不写任何已安装文件），让整套 alpha.1 闭包从单一根可解析。桥的原生入口字节仍钉住 SHA-256 `75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541`。

`packed-native-subagent` 与 `plugin-manager-compatibility` 只把 alpha.1 桥场景切到兼容根；alpha.2 的 HMR、安装与卸载等通用场景继续在规范根运行，因此不会用“全文件跳过”掩盖宿主通用行为。

本轮开发工作树观察（Node 24.17.0，`node --test tests/*.test.mjs`）：规范根 **804** 项中 609 通过、194 个桥用例带诊断 skip、1 失败；双根 **830** 项中 829 通过、0 skip、1 失败；无任何宿主根 **804** 项中 511 通过、292 个环境门禁 skip、1 失败。桥相关用例在双根下全部运行且通过。唯一失败项是工作树自带的 scratch TypeScript 构建门禁：`src/host.ts` 已更新的两条工具描述尚未反映到生成物 `lib/host.js`，需由源码所有者重建 `lib/` 后复跑；本轮为 tests+docs 修复，不修改 `src/`、`lib/`。

## 发布版本与上游来源

本次发布线为 `0.4.3`，历史 `0.4.2`／`0.4.1` 标签及资产保持不变；上游来源仍钉住分发版本 `v0.3.0` / Skills `v1.3.1`。插件版本、Skills 分发版本和 DSH 宿主版本相互独立，不移动既有标签。公开 Release 资产仅包含经过 verifier 检查的发行包、制品身份与脱敏验证摘要，不上传本地原始日志或开发收据。

## 0.4.3 兼容桥产品形态与发行门禁

实现根／子路径独立 en／zh locale metadata，保留原技术 id 与 module ABI。实际 SDK `readPluginMeta`、公共 Loader inventory 三项源码测试通过；禁用行仍有来源说明，读取不执行 provider。真实 Plugin Manager 的 `listBundles`／`listPlugins` 验证根／载体元数据，开发矩阵 9／9 通过；它不是当前 GUI 已更新的证明。

真实 Loader 组件 bool 关闭覆盖、Startup observation codec 和 Client 可见冲突 tracer 逐项 RED→GREEN；恢复仅撤销后置覆盖并重新组合 exact 自动 guards，在隔离 Loader 上仍保留原 stock 服务。真实 React DOM 校验唯一功能 checkbox、内部依赖身份、非版本不匹配恢复方向；另一个 DOM RED→GREEN 确保已支持的当前能力不会被下一启动准备诊断冒称当前阻断。只读诊断不写 Profile、不产生能力授权；旧无 reason transport 仍有效，未知／矛盾 reason 拒绝。

完整根回归已通过 **720／720**，0 failed、0 cancelled、0 skipped；严格 Host／Client、冻结离线 lock、62 项独立重建字节对比、原版兼容资产／provenance、30583-byte 自动 guard YAML 与不可变 vendor 均通过。Client 重建为 160758 bytes、6 个安全浏览器模块，external 仍只有 React。先前一次根回归的唯一失败是旧 scaffold 总数断言（77／162）；已按四个新增 locale 的精确清单更新为 81／166，并重新运行全部测试，不跳过或放松清单。

闭合发行清单仅增加四个精确 locale JSON：固定 81 + vendor 85 = 166 文件，JS／DTS 仍 62；locale 结构与文案由 source 与 extracted archive verifier 精确验证。已获得代码修改、push、新 Release 与同字节安装授权；最终完整根测试、clean-source 单次正式 pack、同归档 22 项矩阵及六项下载复核在提交后按门禁逐项记录于脱敏 Release 附件，尚未由开发 fixture 提前证明。共有 SDK／原版兼容资产／vendor／公开自动组合 guard 未变，不 npm 发布或自动重启。

本机配置恢复是明确授权的单独操作，不是插件静默迁移其他维护者选择；实际生效仍依赖正常运行观测。隔离验收不宣称完整 authenticated GUI／任意自定义 Profile 被证明。

## 0.4.2 正式发布门禁（历史）

已获得本次 push、GitHub Release 和本机插件安装的明确授权，不包含 npm 发布、自动开关管理／启动请求或中断当前服务。0.4.2 必须从升版后的清洁提交单次构建，使用保留 manifest 的 pack；prepack、精确 tarball 字节／身份及同一归档的 13 项解包与 9 项真实管理器矩阵通过后，才推送 immutable tag 和 Release。源码提交、归档大小与 SHA、同字节结果及下载复核写入脱敏 Release 附件，原始日志／Profile 快照不公开。

此前 clean-source 开发包已通过完整门禁与同字节 22／22，但它仍是 0.4.1 manifest 的开发制品，不能重命名成 0.4.2；下面的 709 根测试等证据属于该阶段，不代替本次升版后重新验证结果。公开兼容支持仍限 SDK 0.2.1-alpha.1／canonical 公共解析图，完整 GUI 运行或任意拓扑不由隔离矩阵保证。

升版后的完整根回归已重新通过 **709／709**，0 failed、0 cancelled、0 skipped；严格 Host／Client、source／lib 字节、公开选择器 YAML、所有生成器 --check 与 vendor 通过。兼容 native 仍为 136833 bytes／`f6197aa3eb84c4f803e2b6517e70b1b62a804bb4e763abec94ebe961dabd77ba`，source recipe／SDK 未改；provenance status 改为跨发布中性的 `plugin-integrated`，完整摘要 `59fa929e71ae38d04dc4730a441b88fe5a97db7ed26fc817eea77883a2dc9b04` 在实际 wrapper／只读观测中继续严格钉住。当前升级矩阵使用合成 0.4.3／0.4.4，不是已发行版本。最终 prepack、tarball 与同字节 22 项结果在清潔提交后随 Release 独立附上，不提前冒称正式资产已上传。

## 前轮源码收尾：Root 边界与精确制品输入（历史）

最新完整根测试 **709／709**，0 failed、0 cancelled、0 skipped；严格 Host／Client 构建、冻结离线 lock、source／lib scratch 字节一致、精确 development 包清单、shipped YAML（30583 bytes）、兼容资产生成器 --check、不可变 vendor 和 whitespace 通过。公开 Loader 组合 **44／44**、准备 **81／81**、实际 native 包装器 **16／16**、普通 Node 解包 **13／13**、真实 Plugin Manager／pnpm 安装启动更新卸载 **9／9** 均通过。独立冻结复核：定向 **141／141**，另加新进程编译入口／YAML 一致性及暖态实际包装检查，复核 Root 身份／映射 shape／512 项边界、普通回退、已运行服务优先与真实 shutdown。固定包文件 77 加不可变 vendor 85，共 162，JS／DTS 62；Client 158187 bytes、6 个浏览器安全模块、唯一 external React。

两个自定义程序元数据反例已经逐项 RED→GREEN；暖态拥有者不重新套用鲜启预算，真实 native 在 513 个新增只读 Root 标签后仍保持同一服务／提供者 Fiber、B child 热 send 与冻结 header，并在根 shutdown 排空。构造器激活观察使用公开 runtime.callback；SDK 构造没有被字段名称错误而遗漏。未知 Root／缺失或数组映射／不同根／超限在兼容导入前保留 stock，exactly-512 正控制保持可用，不宣称任意自定义 resolver 或恶意程序改写都受支持。

为验收同一单次构建制品，解包与真实 Plugin Manager 测试支持工程操作者的成对 `DSH_CONTROLS_TARBALL`／`DSH_CONTROLS_TARBALL_SHA256` 输入：只读普通文件、完整摘要、no-follow 打开、0700 临时根内校验副本、拷贝前后和最终 hash／身份复核。错摘要或缺一项直接失败，不回到自 pack。两个 driver 已对同一探索包通过 13／13 与 9／9；解包 driver 在没有 pnpm 的 PATH 中成功，证实不重建 primary 包。探索包不是最终接受包；最终 clean-source 的单次构建与只读身份／精确 tarball 验证及同字节隔离矩阵随后单独记录，不用这些探索结果提前冒称通过。

以上为未发布的本地开发源码。现有 0.4.1 Release 与当前 GUI 不含此能力；本轮没有推送、发布、改共享 SDK、安装当前 Profile 或重启服务。

## 单包兼容入口与用户流程的前轮证据（历史范围）

上轮完整根测试 **678／678**，0 failed、0 cancelled、0 skipped；frozen-lockfile 离线安装、Host／Client 严格构建、source／lib 字节一致性、精确 development pack 清单、生成器 --check 与 vendor 完整性通过。所有 relevant 测试进程已完成；仍不把根绿项等同实际默认 Web／正常 Plugin Manager 安装及发行包部署。

本轮在开发包中接入正式 `./native-subagent` export、真实包装器、同包资产／完整 MIT 归属、只读准备观测与 Host wiring。闭合开发包清单扩为固定 77 加不可变 vendor 85，共 162 文件；严格构建／scratch 字节核对／development pack 清单 8 项已通过，非 clean-source Release 门禁。Client 重建为 158187 bytes，6 个浏览器安全模块，唯一 external 为 React。

- 实际 Loader／native 包装器与 Host／只读准备组合定向 **103／103**，0 skipped；覆盖来源／能力区分、原 schema 及 volatile 配置、资产失败的实际原生回退和本机原始 SDK 哈希保留。
- 实际原生 Client 激活加全部 client 测试 **73／73**，0 failed／cancelled／skipped。真实 DOM 新增三条逐一 RED→GREEN 轨迹：所有状态及折叠详情不含 SDK 路径／手工维护命令；独立 StartupSupport→Remote→页面保存，fixture 同 epoch 重挂载／重建不启用，新 epoch 加真实 capability 观测才显示生效，关闭同理；未知／失败不变成已关闭或承诺重启可修复。管理保持 OFF，零 React 警告／错误。fixture epoch 变化不是实际 DSH 重启。
- [解包启动矩阵](<../tests/packed-native-subagent.test.mjs>) **10／10**，从实际 development tarball 解包，在普通 Node 进程中以真实 SDK entryListSchema 读取 shipped YAML，公开 Loader／applyEntryPatches 激活真实包装器与不可变 Skills，无 registerHooks、NODE_OPTIONS 为空。覆盖 ACTIVE／PENDING stock 三次 HMR 保留、真正 A/B 原生 read／冻结 header／JSONL、原始 spawn／fork 前缀、热 send／公开 selective drain 后冷 send、第二独立 Node 进程恢复同一 child/B header、真实启动文档跨进程请求且管理 OFF、非法 volatile 配置最后有效值、坏资产不执行并保留实际普通原生 create/send。每个 worker 确认零模型调用与参考 SDK 原字节。
- 已逐一复现 pristine 同版本 native copy、scope copy 与 import/require wrapper export 分歧的 RED，再通过 before-import 公共解析／包身份 gate 修成 GREEN。此 gate 35／35 公开 Loader 回归通过；同时核对 wrapper 与 asset 两个实际 import 位置的 14 个固定直接 peer、公共 Context／Loader，并先保留现有 ACTIVE／PENDING Fiber。普通 Node、固定公开包图之外的任意自定义 resolver／恶意 package.json 重定向不在证明范围。准备观测对应 gate **74／74**，包含两位置全部 14 peer 的副本／包身份及 native-local 解析回归，已纳入上述完整根测试。旧 source fixture 已按真实公开 export／Node 解析补齐，13／13；缺资产改为准确的导入前 stock 保留，未放松 gate 或伪造 wrapper 回退。完整默认 Web／普通 Plugin Manager 流程仍未验收。

本轮源码尚未完成真实默认 Profile／正常安装重启全链路验收；没有发布、推送、当前 Profile 安装或 GUI／共享 SDK 改写。以下为上轮核心矩阵的历史证据，不冒充最新全量结果。

## 本轮真实插件管理器验收与生命周期修复

新增[普通插件管理器矩阵](<../tests/plugin-manager-compatibility.test.mjs>)实际调用公共 `initProfile`、默认 base／Web bundle 层、`PluginManager.installBundle` 的 pnpm 操作、`PluginPackages` 公共运行时解析、`app.boot`／Include 及真实 Timer／Hmr。临时 Profile 没有手工链接 peer，也不使用自制解析 hook；启动末层禁用不相关服务／模型／监听端口，不冒称完整 Web GUI 激活。首次安装、新进程选择、A/B 原生读取、持久冻结 header／第二进程冷恢复、独立 Skills 行开关及连续合成升级的初始结果为 **6 passed／1 failed／0 skipped**，失败已在根测试命令外独立重现，未隐藏或跳过。

失败发生于已加载兼容服务时关闭整个 bundle：真实 SDK 返回 applied，但移除兼容载体并重挂 stock，改变服务身份。Standards 复审另发现 wrapper 与准备观测对完整 provenance 字节的接受不同，尾随空白测试已证实 RED。随后以公开根 Fiber 生命周期和完整 provenance 摘要实施修复；关闭结果以以下真实服务的移除／重挂／消息续用／shutdown、普通安装更新及全量结果为据。当时合成 `0.4.2`／`0.4.3` 是私有临时测试 manifest，并非当时源码版本或发行版本；后续真实 0.4.2 发版不改变该历史证据范围。共享 SDK、当前 GUI 和 Profile 未改变。

上述 RED 已通过逐项真实回归关闭：同一 native manager 改由公开根 Fiber 持有，移除载体不移除进程提供者；公开创建事件仅抑制同 tree／同服务域 canonical stock 的新构造，不更改 SDK 或全局 HMR。实际 SDK Plugin Manager／pnpm 矩阵 **9／9**、包装器实际 native **15／15**、普通 Node development 包 **11／11** 全部通过，0 skipped。三次整个 bundle 关闭／重启用和真实包卸载均保持提供者 token／公开 Impl Fiber 身份、已有 B child 热 send 与冻结 header；根 shutdown 在 child 尚存活时排空原生图。关闭或卸载后的下一真实进程只加载 stock，已有依赖升级的真实结果为 restart-required。manifest 合成升级不改仓库或 Release 版本。

完整 provenance SHA 对尾随空白也拒绝：实际普通 native fallback，生成资产不导入。新 Root 服务域检查与 selector 导入前保留 stock／只读准备 uncertain 对齐，公开 Loader 组合 **39／39**、准备 **81／81** 通过；范围仍限固定 SDK／公开 canonical graph，不宣称任意自定义 resolver 或未知拓扑可用。

最终完整根测试 **701／701**，0 failed、0 cancelled、0 skipped；严格 Host／Client 构建、冻结离线 lock、source／lib scratch 字节核对、精确 development package、shipped YAML（29765 bytes）与同包资产生成器 --check、不可变 vendor 及 whitespace 均通过。构建包保持固定 77 加 vendor 85，共 162 文件。公开新源码／合成测试／provenance 的针对性隐私筛查无本机路径、当前 GUI 地址或秘密标记。上述结果不等于完整 Web／当前 GUI 激活；clean-source 最终制品身份门禁仍需独立完成，未发布、推送、安装当前 Profile、改共享 SDK 或重启服务。

### 自定义程序元数据边界：补充反例与关闭

前轮独立探针确认两个有界差异：刻意构造不同真实 Context 根却令公开映射相同，会在 wrapper 拒绝前关闭 stock；同根映射超过 512 项时，selector／wrapper 接受但准备观测返回 uncertain。二者均不是普通 SDK 默认 Profile 失败，也没有观察到同根大映射的权限扩大。

本轮分别通过公共 Loader 的两条 RED→GREEN 轨迹关闭：鲜启选择器和 wrapper 显式要求同一应用根、有效非数组映射，在枚举时即限制 inherited key union ≤512，并逐项比较映射值身份；缺失／错形状／不同根／超预算保留 stock，先于兼容导入。exactly-512 正控制仍可接受。选择器组合 44／44 回归通过，既有 ACTIVE／PENDING 优先。已运行 manager 的保留判定与新的鲜启预算分开：仅凭捕获的同根、同 tree／canonical plain stock／原构造器身份及实际公开 underlying service token 保留其唯一原生服务，不因无关服务标签增长而允许第二个构造器。实际 native 的大映射 unpatch／恢复／B child 热续用／根 shutdown 回归补齐；其最终结果随本轮全量和精确制品矩阵记录。

## 单包接入的上轮核心矩阵（历史范围）

当前开发实现基于 0.4.1，正式入口尚未接通，不能把本节视作现有 Release、本机安装包或当前 GUI 已含新能力。实施要求与边界见[单包兼容说明](<PLUGIN_MANAGED_COMPATIBILITY.md>)。

- 根测试 **564／564** 通过，0 failed、0 cancelled、0 skipped；严格 Host 构建／scratch 字节一致性通过，JS／DTS 共 58 个。新增启动组合模块进入精确构建允许清单，固定文件 71 加不可变 vendor 85，当前开发包测试精确核对 156 文件；这不是新 Release 制品身份。
- [公开组合回归](<../tests/compatibility-composition.test.mjs>) **27／27**：实际 Loader／Fiber、导入前选择、热重载保留 ACTIVE／PENDING 原服务、用户覆盖及版本／源字节拒绝。兼容服务在该矩阵是标注的生命周期 fixture，不声称完整 Web 或 cwd。
- 另行以 plugin-owned 模式运行[真实 native cwd 矩阵](<../tests/host-cwd.test.mjs>) **10／10**，使用插件生成的兼容实现与同一宿主 peer，包含 A/B 读取、实际冻结／持久 header、原始 spawn/fork、冷恢复与省略继承；其中两项是既有离线补丁拒绝回归。无模型调用，不修改参考 SDK。
- [旧兼容记录回归](<../tests/managed-sdk.test.mjs>) **28／28**，相同所有者与 recipe 跨版本接续，creator 版本来源不被只读或幂等调用改写；外国所有者、身份／配方漂移、不合法版本和原有事务／备份／权限保护保持拒绝。版本样本由隔离 package fixture 模拟，不声称模拟版本已发布。
- [构建器](<../scripts/build-compatible-subagent.mjs>)两次确定性生成及 --check、语法／共享公开错误类型核对通过；[兼容实现](<../compatibility/native-subagent-0.2.1-alpha.1.js>) 136833 bytes，公开来源／变换摘要保存在[provenance](<../compatibility/native-subagent.provenance.json>)。原始 MIT 完整声明已保留，来源标识不是能力 getter。
- frozen-lockfile 离线安装与 vendor 校验通过；85 文件／279662 bytes、stable／beta 各 27 Skills、既有 vendor root hash 未变。

兼容实现与正式包装／bundle 入口仍未接入，原配置桥接、启动观测、真实默认 Profile 与安装／重启矩阵还待完成。未创建新发布包、推送、安装、改 SDK 或重启当前 GUI。测试中的临时 development pack 随 fixture 清理，不代替 clean-source 正式制品门禁。

## 未发布的配置页与输入摘要修复（基于 0.4.1）

此节记录开发工作区结果，不把现有 0.4.1 Release 或本机安装包冒称含有这些改动。版本与安装必须由后续发行流程分别确认。

- 已通过公开 StartupSupport 接口、内存存储与三个不同的夹具启动标识复现保存启用后仍不生效的状态（不是三次实际 DSH 重启）：请求已读取，但 SDK 原生能力为 false、兼容准备未完成。普通重启不能安装能力；此轮不修改运行中的 SDK。
- Client 直接翻译宿主权威启动状态，准备状态独立展示，修复官方原生支持已为 true 却仍被提示必须准备的显示缺陷。未知观测不变成禁用或成功。
- 配置页明确子代理创建时指定工作树的范围，分离当前运行／下次请求／协作管理／会话查看；固定字段、来源和限制中文化，原始诊断折叠保留。协作按钮按更改显示保存并启用／关闭／应用，启动请求另行保存，分别使用各自 CAS。
- 输入区摘要通过已核对的 composer 宽度变量及回退值居中；详情／工具卡增加自身宽度与换行约束，紧凑标题入口限制宽度。没有替换原生 composer、改变生命周期、增加裁决或清理准入门槛。
- 新增 **15 项真实 React/ReactDOM + Happy DOM 回归**，通过实际 DOM 点击／输入／选择验证上述状态和保存边界，并检查挂载／更新／卸载无 React 警告。发现并修复会话查看与详情页的重复兄弟 key，保留会话限定和角色限定身份。Happy DOM 样式契约不是真实浏览器像素或宽／窄屏视觉验收。
- 完整根测试 **534/534** 通过，0 failed、0 cancelled、0 skipped；其中含 15 项 DOM 与 6 项真实原生 Client 激活回归。Host／Client 严格构建通过，Client 159587 bytes、6 个浏览器安全模块、唯一 external 为 React；vendor 锁定内容不变。

原始本机测试日志不进入公开仓库。本节不声称当前 GUI 已更新、SDK 已准备、完整 Web Profile 已验收、已发布或已安装这些新源码。

## 0.4.1 原生 Client 激活修复

`0.4.0` 的 Client 自行 `$mount` 后，在没有声明 `remote.mattpocockControls` 服务依赖的调用 Context 中读取该命名空间。真实 Cordis 插件 Fiber 因 `cannot get property "remote.mattpocockControls" without inject` 失败；浏览器启动审计随后拒绝该 entry。旧普通对象／根 Context 测试绕过了这层检查，模块可导入与原有 510 项机械测试通过不能解释为真实 Web 启动已验收。

修复保持 bootstrap 挂载 RPC，然后等待声明命名空间依赖的子 Context，再在该生命周期内创建观察器、注册界面和安排清理。不能把自己的尚未创建命名空间直接加到 bootstrap 依赖中，否则 bootstrap 不能开始。子 Context 初始化错误仍向上传播，不吞掉失败冒称 active。

新增 6 项测试使用实际参考 SDK 的 Context、TypertRegistry、Client Remote、SlotRegistry、浏览器 lazy module factory、ClientModuleSystem 与 Loader：原生 Fiber 激活、七类界面／九项工具登记、卸载与重挂载、子作用域错误、浏览器 entry 的 ACTIVE/FAILED 显式审计，以及原生 graph 移除／重新加入。测试以单插件 graph 和已经提供的原生 RPC/Slot 服务为聚焦范围，连接、sidebar 状态和 tab 注册由夹具控制；不执行 DOM/React 挂载，不启动服务器或调用模型，不冒称完整 Web Profile、当前 GUI 或模型行为 campaign 通过。

旧发行包在同一原生 Fiber／浏览器 Loader gate 中为 RED，修复 bundle 为 GREEN。原始失败堆栈及执行记录保留在仓库外；公开仓库只保留合成回归。修复版完整根测试为 **516/516**，原生 Client 激活／生命周期为 **6/6**，原生 managed cwd 为 **10/10**，均无失败、取消或跳过；Host/Client 严格构建通过。清洁源码／精确发行包结果随 Release 的脱敏验证摘要记录。

## 0.4.0 源码阶段收尾（历史范围）

四项验收及公开数据边界见[复审契约](<REVIEW_CLOSEOUT.md>)。原有四项缺陷已修复；独立复审发现的窗口/工作树迟到取消覆盖已确认 CAS 回执，以及窗口 checkpoint/purge 分阶段取消的同类缺口也已关闭。已完成下列机械验证，不把历史阶段结果冒称当前验收，也不承诺绝对没有其他缺陷。

| 验证 | 本轮观察结果 |
| --- | --- |
| Host / Client 严格构建与声明 | 通过；预构建 JS/DTS 共 56 个，Client 仅 React 运行时 external |
| 完整根测试（显式提供参考 SDK） | 510/510 passed，0 failed、0 cancelled、0 skipped |
| 真实原生 managed cwd 隔离验证 | 10/10 passed，0 failed、0 skipped、0 model calls |
| Standards 独立复审 | 0 open documented-standard violations、0 meaningful smell findings；独立定向 79/79 passed |
| Spec 独立复审 | 0 open concrete findings；独立定向 53/53 passed |
| Vendor / 通道 / 优先级 | 未改变；85 文件、279662 bytes，stable/beta 各 27 Skills |
| 公开材料筛查 | 只暂存公开安全源码/合成测试/同版构建/脱敏文档；raw research、日志和旧收据不入 Git 或包 |

清洁提交上的正式 prepack/tarball gate、单次构建包的源码 commit/pnpm/size/SHA256 身份及解包后的实际 CLI/manager 隔离检查，随仓库外开发交付记录保存；本页不嵌入操作者本机路径、原始日志或用户记录。正式 verifier 不绕过 clean-source gate，包仍为开发交付，不等于发布授权。

有效输入验收覆盖 13 项场景：准备后拒绝重试、实际原生 append 去重、工具附加上下文同批去重、拒绝工具批次后重试、相同 ID 改写正文、相同 ID/正文改写 source、Agent/Session 替换、成功取得但 degraded 的未知状态重装、缺失/失败可见性保守重装、子任务归属改变与隐私、原生消息投影改变正文、迟到取消、compaction 保留历史事件但移除当前 surface。测试使用真实公共 Session 与 Cordis/Host/ToolRuntime，Agent 元数据可由夹具控制；不宣称跑完整 AgentLoop 调度、模型调用或 live GUI。

## Historical evidence

此前不同阶段的测试数量、宿主版本与失败/通过结论是历史观察，不保证当前代码或其他机器的行为。原始研究脚本、含本机路径的日志/receipt、raw provenance 和历史 tarball 在本地保留，不随公开源码发布；这里不提供原始用户/环境材料，也不声称 Git 含完整历史制品字节。

公开可复查入口为仓库中的合成数据测试、严格 compiler/build 配置、固定官方 SDK 补丁 recipe/manifest、vendor lock/inventory 及精确包 verifier。某些 native fixtures 需要操作者显式提供 SDK 根；没有提供时应明确 skipped，不计为原生集成通过。不要运行旧本地 probe 或把历史临时目录作为公共命令前提。

历史 Phase 5 模型行为 campaign 仍为关闭且未通过，原始评估数据不在本公开仓库。此源码收尾不重开 campaign，也不把机械测试冒称模型已遵守协议。

## 可移植验证命令

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec tsc -p tsconfig.json
chmod 755 lib/compatibility/cli.js
pnpm exec tsc -p tsconfig.client.json --noEmit
node scripts/build-client.mjs --out lib/client.js --declaration
# 规范宿主（alpha.2）：桥专用用例带诊断 skip
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/*.test.mjs
# 双根全矩阵：桥用例不再跳过，通用用例仍读规范根
DSH_CONTROLS_HOST_ROOT=/absolute/sdk DSH_CONTROLS_COMPAT_HOST_ROOT=/absolute/alpha.1/sdk node --test tests/*.test.mjs
# 无宿主根：全部环境门禁用例带诊断 skip，仍须 0 failed
node --test tests/*.test.mjs
DSH_CONTROLS_COMPAT_HOST_ROOT=/absolute/alpha.1/sdk DSH_CWD_IMPLEMENTATION=managed node --test tests/host-cwd.test.mjs
DSH_CONTROLS_COMPAT_HOST_ROOT=/absolute/alpha.1/sdk DSH_CWD_IMPLEMENTATION=plugin-owned node --test tests/host-cwd.test.mjs
node scripts/verify-vendor.mjs
# Only from clean committed source; does not publish or install:
node scripts/verify-package.mjs --prepack
```

将 `/absolute/sdk` 替换为操作者已核验的实际规范 SDK 绝对目录，`/absolute/alpha.1/sdk` 替换为按上文重建的 `0.2.1-alpha.1` prefix 根。原生 cwd/管理器 probe 只准备隔离副本，不修改所提供的参考安装。最终 tarball 单次构建后保存只读 size/SHA256/source commit/pnpm identity，并用现有 verifier 精确核对；外部制品记录与本页摘要范围不同。

## 0.4.25 制品验收（2026-10-09）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.25.tgz`（**382871** bytes，sha256 `01c3b5ae28fdec3894c284b12ab3932e9d1661601612a0631e17ce2008123243`，170 成员，源提交 `35969a5`）经精确 tarball 验证与同字节矩阵通过：根测试 **824／824**（0 failed／0 cancelled／0 skipped）、无宿主根 798 中 508 通过／290 环境门禁跳过／0 failed、同归档矩阵 **25／25**（普通 Node 原生 14＋真实 Plugin Manager 11）。隔离双宿主（`0.2.1-alpha.1` 与 `0.2.1-alpha.2`）各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 [`dist/verification-0.4.25.json`](<../dist/verification-0.4.25.json>)。

本版携带宿主原生初始子代理 cwd seam（`SubagentStartRequest.cwd`）与改写后的模型可见文本。原生调用形状已对**真实** alpha.2 `@deepseek-ai/dsh-subagent` 类型编译通过：spec 携带 `provider`、`label`、预留 `childId`、`request {parent, prompt, maxDepth?, cwd?}`、`signal` 与 `delivery:'parent'`，句柄暴露 `childId`、`messageId`、`result`。

## 0.4.26 制品验收（2026-10-10）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.26.tgz`（**383511** bytes，sha256 `4009268e2b452fe64c8e300bfec530ea830577f2ed293e51acfdfcb77541630a`，170 成员，源提交 `f7a61b5`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.2` 下 804 用例 **610 通过／0 失败**（194 个 beta 期桥用例按诊断跳过）、双宿主 **830／830 全通过且零跳过**、无宿主根 804 中 512 通过／292 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.2 与 0.2.1-alpha.1 两个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 `dist/verification-0.4.26.json`。

本版修复面向模型的契约不一致：mattpocock_execute／mattpocock_assign 现在与 mattpocock_delegate 一样把省略等同于 null（ticketIds 等同于空数组），非法值的拒绝信息明确给出 null 这一出路，工具描述补齐了此前只隐含的形状（execute 的无票规则与 nativeTool 取值、assign 的请求键、controls 的 intent 与 patch 键、resource 的只读范围）；provider、worktree、history 的拒绝信息现在列出可接受取值。回归由 tests/model-contract.test.mjs 钉住。

## 0.4.27 制品验收（2026-10-10）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.27.tgz`（**397733** bytes，sha256 `b6633ec745c0b47e2c33ffa7586efd918578654a97d005fbfb30ce819db128ee`，170 成员，源提交 `0ff2c33`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.2` 下 832 用例 **638 通过／0 失败**（194 个 beta 期桥用例按诊断跳过）、双宿主 **858／858 全通过且零跳过**、无宿主根 832 中 540 通过／292 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.2 与 0.2.1-alpha.1 两个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 `dist/verification-0.4.27.json`。

本版把在跑子代理数与异常结局都改为宿主原生事实：S 是本会话后裔中 Agent `status==='running'` 的数量（目录的 activity 表示常驻，空闲待唤不计入），成员集合只在成员变化节点刷新，read 为进程内求交、零目录遍历；异常结局不再推断，按宿主公开词汇分类——`error`（附 LlmFailure 原文）、`interrupted`（回合从未正常结束）、`max-tokens`、`blocked`、`refusal`、他人 `aborted`——每一失败回合生成一条去重待处置项并唤醒主 agent 一次，自己取消的不报，日志不可读时报“结局不可观测”并附证据指针。

本版同时记录一项**已实测否决**的优化：窗口 operations 日志的自动上限已实现、实测为净亏（整文档写入 + 无损折叠对每条操作同时保留 dedup 摘要与 retained 正文，60 条操作的探针由 20.9 KB 变成 43.6 KB），遂撤销；可选方案与代价已写入仓库文档，暂时接受文档随寿命增长。

## 0.4.28 制品验收（2026-10-10）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.28.tgz`（**397862** bytes，sha256 `da6278761e77a77346f6f6978f18e3298048e44564c8a60c9cfaa1ebee11be33`，170 成员，源提交 `677f223`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.2` 下 834 用例 **640 通过／0 失败**（194 个 beta 期桥用例按诊断跳过）、双宿主 **860／860 全通过且零跳过**、无宿主根 834 中 542 通过／292 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.2 与 0.2.1-alpha.1 两个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 `dist/verification-0.4.28.json`。

本版修复 0.4.27 引入的**向后兼容回归**：窗口文档的 `knowledge.previousRuntimeId` 是可选字段，但 journal 重放会为每次运行时替换推导出该字段，校验器却拿它和从未携带该字段的旧文档做全量比较，于是把旧文档判为「状态与操作历史不一致」。实测同一份线上存储：0.4.25 与 0.4.26 均 17/17 通过，0.4.27 为 5/17，修复后恢复 17/17。比较现在跟随文档自身携带的形状——记录了基线的文档仍全量严格比较（记录错误基线依旧非法），缺失该字段的文档按三个旧字段比较；两个方向都有回归用例。

## 0.4.29 制品验收（2026-10-10）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.29.tgz`（**398722** bytes，sha256 `46c5f3a27672f7a1f15c07b0401547213c7953741bb2ce606d0958ade1fddc69`，170 成员，源提交 `778d336`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.2` 下 837 用例 **643 通过／0 失败**（194 个 beta 期桥用例按诊断跳过）、双宿主 **863／863 全通过且零跳过**、无宿主根 837 中 545 通过／292 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.2 与 0.2.1-alpha.1 两个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 `dist/verification-0.4.29.json`。

本版修掉两处**把发送卡死的读取成本**：其一，0.4.27 起的成员资格走查调用 SDK 的 `listDescendants`，其实现对**每个后代各读一次该会话自己的日志**；报告方的 owner 子树实测 2048 个日志、2.1 GB（单条 owner 日志压缩 25.9 MB、解压 106 MB），这条走查永不完成，而它位于准入与快照读取路径上，于是消息永久停在排队中、面板显示未知、宿主无任何报错。其二，即便把走查限时，读取仍要等一次目录、并等待队列静默，新出现的子代理还要等一次目录往返才被计数。现在成员资格**完全来自 live Agent 索引**（每次读取同步吸收，零会话日志、零目录 IO），目录只作后台富化（带 1500 ms 预算并与调用竞速，超时即给明示下界），读取不再等待任何排队工作，且每次读取只构建一次 live 索引。实测（2000 个常驻后代、目录永不回答）：首次读取 2 ms、50 次平均 **0.62 ms**、最差 4 ms，读取期间**零目录调用**。语义收窄如实记录：S.used 的完备性由 live 索引保证，`total` 是已知常驻子树的下界。

## 0.4.30 制品验收（2026-10-16）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.30.tgz`（**409239** bytes，sha256 `d1aa9b799f1c6ff788f96eb66a6bc684dbab6c55f929cc8cf6603fac25a5c548`，172 成员，源提交 `901a7ab`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.2` 下 851 用例 **657 通过／0 失败**（194 个 beta 期桥用例按诊断跳过）、`0.2.1-alpha.4` 下 851 用例 **651 通过／0 失败**（其中 6 条客户端原生激活用例因该安装不再提供 `@deepseek-ai/dsh-client-ui-slots` 而按前置条件跳过）、双宿主 **877／877 全通过且零跳过**、无宿主根 851 中 559 通过／292 跳过／0 失败；同归档矩阵 **28／28**（普通 Node 原生 15＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.2、0.2.1-alpha.4 与 0.2.1-alpha.1 三个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。完整记录见 `dist/verification-0.4.30.json`。

本版新增**原生建树观测**：经 DSH 工具管线（含 PTC 子调度）成功的原生 `create_worktree` 调用被登记为只追加的事件版本，记录创建者、目录、分支与基线提交，以及读取时的创建者活动性；Git 身份由受权 runner 在 owner 锚点异步核验（存在性、精确树根、common/git 目录、分支 ref 与 OID），缺失记 absent、拒绝记 failed 并附诊断，未知永不冒充成功。受管子代理的终局项列出它创建的树，创建本身不唤醒 owner；`mattpocock_worktree` 新增作者登记 action `update-observation`，`mattpocock_delegate.worktree` 退为可选（lane 自建树并在其中工作）。边界如实记录：只观测经工具管线的 `create_worktree`，`bash git worktree add` 等外部建树不在范围内；日志回放只覆盖仍常驻的受管子会话；插件不自动删除树、分支或记录。

本版同时按上游 `dsh-v0.2.1-alpha.4` 的兼容性变更声明 `engines.dsh: "~0.2.1-alpha.1"`：alpha.4 起第三方插件的兼容性**优先按声明判定**，未声明才回退 `@deepseek-ai/dsh*` peer 规则。该范围与既有 peer 判定在两版门禁实现上逐版本实测等价（`0.2.1-alpha.1` 到 `0.2.2-alpha.*` 放行，`0.2.0-rc.2` 与 `0.3.0-alpha.1` 拒绝），因此 alpha.4 上无需任何运行时代码改动；宿主 `PeerScope` 新增的 `principal`／`signal`／`interactions` 只影响宿主侧测试 fixture，产品代码只读取 `peer.id`。范围声明由 `scripts/verify-package.mjs` 与 `tests/scaffold.test.mjs` 固定，语义收窄如实记录：`0.2.2-alpha.*` 虽被预发布语义放进门禁，但没有实际验证，不构成兼容承诺。

## 0.4.31 制品验收（2026-10-16）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.31.tgz`（**410151** bytes，sha256 `ebea9c37676ffa7b50cbcec242186fc42ae1eb046a98b9c7e4c84520a41cce87`，172 成员，源提交 `27d57de`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.4` 下 853 用例 **653 通过／0 失败**（200 skip）、隔离 `0.2.1-alpha.2` 下 853 用例 **659 通过／0 失败**（194 skip）、双宿主 **879／879 全通过且零跳过**、无宿主根 853 中 559 通过／294 跳过／0 失败；同归档矩阵 **28／28**（普通 Node 原生 15＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.1、0.2.1-alpha.2、0.2.1-alpha.3、0.2.1-alpha.4** 四个真实宿主上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 均为 true，未调用模型、未起 Web、未用自定义客户端。

本版修复 alpha.3 起的控制面装载中断：`0.2.1-alpha.3` 把 `connection.operator` 换成 owner 的 `connection.browserPeer`，而插件只读旧属性，因此 `createHostAuthority` 在 `mountHost` 内抛 `TypeError: Cannot read properties of undefined (reading 'id')`，九个模型工具缺席、Skills 分发不受影响；cordis 默认日志级别丢弃 `warn`，实机终端没有任何提示，只能从「工具缺席 + 启动收据已写」看出。修复方式为版本中立地读取 operator Peer（`connection.operator ?? connection.browserPeer`，两者皆无时以 `feature-disabled` 失败关闭），单元与 mount 用例覆盖两种拼写。真机证据：私有 `DSH_HOME` 的 `dsh web` 启动在修复前复现上述失败，修复后源码构建与打包产物都把全局工具视图从 13 提升到 22、注册全部九个 `mattpocock_*` 工具且无警告。

完整记录见 `dist/verification-0.4.31.json`。

## 0.4.32 制品验收（2026-10-17）

本版发布 S 运行计数的深度结构：`S.depth` 把 `S.used` 拆成 `direct`／`deeper`／`unknown` 与逐层 `levels`，解析器强制 `direct+deeper+unknown===used`、`levels` 分类每个已测量 run，来源不可测时给 `null` 而不是伪造零；同时记录 `0.2.1-rc.1`、`0.2.1-rc.2` 的宿主兼容核对（两者都不需要运行时代码改动）。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.32.tgz`（**412329** bytes，sha256 `d28a1fb9e9f89f05abfe1b68364108e09c4f3db83ef2e60e8a4698cf8a7832c8`，172 成员，源提交 `1e7a38f`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.4` 下 856 用例 **656 通过／0 失败**（200 skip）、`0.2.1-rc.2` 下 856 用例 **656 通过／0 失败**（200 skip）、双宿主 **882 中 876 通过／0 失败／6 skip**、无宿主根 856 中 562 通过／294 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.1、alpha.2、alpha.3、alpha.4、rc.1、rc.2 六个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 均为 true，未调用模型、未起 Web、未用自定义客户端。

完整记录见 `dist/verification-0.4.32.json`。

## 0.4.33 制品验收（2026-10-17）

本版只优化事件路径与读取成本：同一 unknown knowledge 事实与重复 running receipt 不再各写一次、归因对账与 catalog 走查按 owner 合并、超时不再中止宿主投影构建并允许迟到成功恢复成员资格、worktree cold replay 移出首读、history 捕获按水位增量、disposed Session 视图回收、隐藏标签页轮询退避。S/T 计数、执行准入与业务记录语义不变；目录超时/拒绝/diagnostic 仍按既定设计给出明示下界，不改成“已知零”。

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.33.tgz`（**414851** bytes，sha256 `fa92dc6a6d831ad48954a89fbb54e00a26aef3bd12ef3844e8b859289f10ef9c`，172 成员，源提交 `ea32073`）经精确 tarball 验证与同字节矩阵通过：规范宿主 `0.2.1-alpha.4` 下 859 用例 **659 通过／0 失败**（200 skip）、`0.2.1-rc.2` 下 859 用例 **659 通过／0 失败**（200 skip）、双宿主 **885 中 879 通过／0 失败／6 skip**、无宿主根 859 中 565 通过／294 跳过／0 失败；同归档矩阵 **27／27**（普通 Node 原生 14＋真实 Plugin Manager 13）。隔离门禁在 **0.2.1-alpha.1、alpha.2、alpha.3、alpha.4、rc.1、rc.2 六个真实宿主**上各自从私有源码快照安装、headless 挂载，`checkoutTarballReportsByteIdentical` 均为 true，未调用模型、未起 Web、未用自定义客户端。2000 个 live 后代的内存 fixture 前后测量（下界）：下一次注入 917.7 ms → 24 ms、首读 1690 ms → 13.4 ms、20 个 catalog 事件 20 → 2 次走查、400 个状态事件同步处理 111.8 ms → 8.6 ms，热读取保持约 0.6 ms。

完整记录见 `dist/verification-0.4.33.json`。

## 0.4.34 制品验收（2026-10-18）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.34.tgz`（**414867** bytes，sha256 `e27bc1057ead04142412e77d8db682cd7874be8455a8f5014d04efaa9d2dfe69`，172 成员，源提交 `91c4fe4`）经精确 tarball 验证与同一构建的 disposable e2e pack 通过：规范宿主 `0.2.1-alpha.4` 下 860 用例 **660 通过／0 失败**（200 skip）、`0.2.1-rc.2` 同读数、双宿主 886 中 **880 通过／0 失败／6 skip**、无宿主根 860 中 **566 通过／294 跳过／0 失败**。隔离门禁在 **0.2.1-alpha.1、alpha.2、alpha.3、alpha.4、rc.1、rc.2 六个真实宿主**上各自从私有源码快照安装、headless 挂载，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 均为 true，未调用模型、未起 Web、未用自定义客户端。本轮未单独重跑 14 原生＋13 管理器的同归档矩阵；精确 verifier、e2e 与六宿主隔离门禁读的是同一归档。安装使用同一 tarball：Profile 解析为 `file:` 制品，安装后树与解包逐文件 `diff -r` 为 0。

完整记录见 `dist/verification-0.4.34.json`。

## 0.4.35 制品验收（2026-10-18）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.35.tgz`（**415674** bytes，sha256 `c86155943097ba2cb1eaa995a163746dd66769c2648f46275352e86ea2ef7c1b`，172 成员，源提交 `2b99bba`）经精确 tarball 验证与同一构建的 disposable e2e pack 通过：规范宿主 `0.2.1-alpha.4` 下 861 用例 **661 通过／0 失败**（200 skip）、`0.2.1-rc.2` 同读数、双宿主 887 中 **881 通过／0 失败／6 skip**、无宿主根 861 中 **567 通过／294 跳过／0 失败**。隔离门禁在 **0.2.1-alpha.1、alpha.2、alpha.3、alpha.4、rc.1、rc.2 六个真实宿主**上各自从私有源码快照安装、headless 挂载，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 均为 true，未调用模型、未起 Web、未用自定义客户端。本轮未单独重跑 14 原生＋13 管理器的同归档矩阵；精确 verifier、e2e 与六宿主隔离门禁读的是同一归档。安装使用同一 tarball：Profile 解析为 `file:` 制品，安装后树与解包逐文件 `diff -r` 为 0。

完整记录见 `dist/verification-0.4.35.json`。

## 0.4.36 制品验收（2026-10-18）

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.4.36.tgz`（**415876** bytes，sha256 `274b4a9a4794238569e0ff8dbe500a261a72c7cf1f1dd4a46ea6c39a004eede1`，172 成员，源提交 `a7a98ca`）经精确 tarball 验证与同一源提交的 disposable e2e pack 通过：`0.2.1-rc.2` 下 862 用例 **662 通过／0 失败**（200 skip）、双宿主 888 中 **882 通过／0 失败／6 skip**、无宿主根 862 中 **568 通过／294 跳过／0 失败**。rc.2 隔离门禁在 headless profile 上从私有快照安装同一归档，两频道各 **27** 个 Skill，`checkoutTarballReportsByteIdentical` 为 true，未调用模型、未起 Web、未用自定义客户端。本轮未重跑六宿主隔离与 14 原生＋13 管理器的同归档矩阵；该补丁只改模型可见文案与宿主门禁拒绝消息，action 词表、业务语义、存储和权限不变。安装使用同一 tarball：Profile 解析为 `file:` 制品，安装后树与解包逐文件 `diff -r` 为 0。

完整记录见 `dist/verification-0.4.36.json`。

