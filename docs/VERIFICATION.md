# 公开安全的源码与开发交付验证摘要

本页记录合成数据、隔离 SDK/存储和公开接口上的机械验证，不公开原始用户/会话或本机环境记录。源码修复不等于部署、发布或绝对无缺陷保证。

## 0.13.0 原生 cwd 退役（2026-11-05，源码验证；未发布、未安装）

本 lane 在隔离 worktree 中删除 0.2.1-alpha.1 兼容桥、旧 SDK 补丁、启动设置／UI／Remote、旧 CLI 与相关包面，最低宿主改为 `~0.2.1-alpha.2`，版本 0.13.0。集成分支在完整 fixture root `DSH_CONTROLS_HOST_ROOT=/home/dev/dev/isolated/dsh-alpha3-g.m9uoL7/lib/node_modules/@deepseek-ai/dsh` 上验证：

- 全量 `node --test`：**861 项，852 通过，0 失败，9 skip**。skip 仍为 6 个 native Client UI-slots fixture 与 3 个 vendor source/tree 环境门禁，没有为通过而新增或隐藏 skip。
- 根与 Client TypeScript 检查：0 error；客户端 bundle **276397 B / 7 私有模块**，externals 仍仅 `@deepseek-ai/dsh-client-ui-primitives` 与 `react`；`verify-package --prepack` 通过：**76 fixed / 85 vendor / 161 expected**，构建 **62 JS/DTS**。
- 真实 `evaluatePluginCompatibility`：拒绝 `0.2.1-alpha.1`、`0.2.0-rc.2`、`0.3.0-alpha.1`，放行 `0.2.1-alpha.2`、`0.2.1-alpha.3`、`0.2.2-alpha.3`。
- 真实 PluginManager/完整默认 base+Web 组合：安装后 Skills 挂载、stock 原生 subagent 保留、旧兼容行不存在；whole-bundle disable 后下一进程 Skills-off，live reenable 保留 stock。
- 真实原生 cwd：sibling A/B 读取各自目录；初始 cwd 记录为有效工作目录（child header cwd 保持父来源值）；无原生 seam 的 host-collaboration fixture 失败关闭且不创建 child。
- 隔离 0.12→0.13 Profile 升级：安装后 profile patch 哈希不变，包内 compat 文件 0、bundle patch compat 行 0、`--dump-config` compat 行 0 且 Skills 行 1；显式保留的 `mattpocock-native-subagent` 行得到 `patch: entry ... not found` 警告但不阻断 Skills。未修改 live Profile。
- 候选 tgz 的 source/精确制品 × `0.2.1-alpha.4` 与 `0.2.2-alpha.3` headless、beta/stable 均通过；`checkoutTarballReportsByteIdentical=true`、`modelInvoked=false`、`webStarted=false`，未启动 Web 或调用模型。

**未执行：** 实际 DSH `0.2.1-alpha.2` 二进制不可用，未声称该版本 runtime 实测；push/tag/Release/npm publish/本机安装尚未执行。独立 Standards/Spec 复核仍在进行。

> 2026-11-04（0.10.0 历史状态）：0.10.0 隔离源码、固定 SHA 双轴复审与精确制品/PluginManager 全矩阵均已通过，并已 push、新建 source tag、创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.0) 与下载回验；当时未安装本机。0.9.0 为已发布历史基线，事实边界与恢复已实施，完整测试、闭合构建与精确 clean-source 制品已验证，并已 push `main`、tag `v0.9.0` 与创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.9.0)；未 npm publish、未安装本机 DSH/Profile/GUI。0.9.0 的精确计数与制品见下方 0.9.0 专节。0.8.0 已把 `mattpocock_delegate` 默认关闭、保留实现，只有显式 `delegate: true` 才注册；其 tag `v0.8.0` 指向 docs 验证提交 `3fa1d04`，验收 tarball 的源提交仍是 `dfe0322`。历史 0.7.0（B/D/E）与 0.7.1（C）记录保持原样。

## 0.12.0 输入区常驻提醒与文字展开（2026-11-04，已发布、未为本机安装）

本轮依据[已认可详细契约](<INPUT_SUMMARY_DISCLOSURES.md>)，先单独提交文档 **8fac3fb**，从远端 0.11.0 基线 f2d48a1 建立隔离实施、测试与独立复核检出；未覆盖原主检出已有未提交内容。最终运行时、测试、生成物和包元数据冻结于 clean source **012a01da9b8ab31de6e8137b4616d27c29d7d65c**。本次 main 后续只追加公开安全完成证据，tag/source sidecar/唯一制品保持该 SHA，不把后续文档 HEAD 冒充制品源。

### 行为、RED/GREEN 与独立复核

- [客户端](<../src/client.ts>) 仅呈现增量：常驻待你裁决/待落实/T/S、96px 工作流进度区、单类别有界只读就地详情分开；直接文字按钮、aria/键盘关系、刷新不抢焦点/打开侧栏；rightPanel=false 仍可查。T 蓝、S 青紫、pending 红、awaiting 琥珀，差额在强调色祖先之外继承正文色；只过滤确定零值。裁决旗标、held T、Host live S 和授权 scope 不变，native 在跑明细始终可能不完整，不新增完整名册能力。
- [新增实际渲染回归](<../tests/client-input-summary.test.mjs>) 在导出的 ObservedInputSummary + SessionObserver、真实 React/ReactDOM/Happy DOM 上先建立 **25 项 RED**，不是只测新 formatter；隔离实施后全部 GREEN。初候选还真实暴露 slot 已切 Session 而 observer/snapshot 仍旧时的详情泄漏，三方身份 guard 和 selection identity 修复后通过；Boolean 空值断言调整仅避免失败诊断循环打印 DOM，不弱化断言。交接三个 Client 文件 **96/96**；最终独立评审另跑新增 **25/25**，无失败/skip/cancel。
- Standards / Spec 两名独立评审在固定 **012a01d** 分别完成复审，均 **0 未关闭硬违反**；Standards 的共享 S 可信总数谓词建议已提取，**0 未关闭 heuristic**。未触及 Host/Remote/domain/存储/授权/消费/vendor 或新增宿主 seam。评审意见与测试执行证据分开，不把 native 生命周期/author report 当物理制品证明。

### 冻结 source、真实声明与闭合构建

- **95 文件，1151 tests：1145 pass / 0 fail / 0 cancel / 6 skip**，source **012a01d**；Node 24.17.0，显式 canonical SDK **0.2.2-alpha.3**、独立 compatibility SDK **0.2.1-alpha.1** 和固定 distribution source。六 skip 全部且仅为 native Client activation/browser-loader fixture 无公开 UI-slots 包；未用缺省环境跳过 native storage/Manager 等门禁，也不把这些六项计为 GUI 通过。
- 保留首轮 **1146 tests / 1121 pass / 19 fail / 6 skip** 的失败记录：传入的同版本 hoisted local-prefix CLI 根缺少旧 fixture 直接要求的自身 nested node_modules，真实 storage/Client Remote/packed 原生探针加载失败。换用现有完整独立 npm-global 根，manifest 与 native entry 摘要相同、Cordis 解析身份一致；最小 **5/5** 后重新完整 source 得到上面的 0 fail。没有为过门禁修改源码、测试或任一 SDK，没有抹掉首次失败或新增 skip。
- Baseline Host/Client strict、闭合浏览器 build、strict prepack/source-lib scratch 全通过。独立真实 alpha.3 声明视图按同一 SHA 用 git archive 固定输入，root/client/Host emit 均 **0 diagnostics**；实际声明解析路径已记录，**78/78 非 Client JS/DTS、1076365 B** 与同 SHA 生成物逐字节一致，不以 HOST_ROOT 环境变量代替声明切换。
- Client **297145 B / 8 私有模块**，externals 仍仅 React 与公开 UI primitives；**80 JS/DTS、99 固定文件、19 闭合入口**。vendor **85 文件、296048 B**、root SHA-256 **70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8**；stable/beta 各 27 Skills，不变更两通道或 provider precedence。

### 唯一归档、独立 archive 全套与双 SDK headless

- 同一 clean source **012a01d** 以 npm 11.13.0 pack --ignore-scripts **仅一次**生成唯一 accepted 归档；pnpm **11.8.0**、GNU tar **1.35**。归档 **511256 bytes**，SHA-256 **519320adc5d311f661c8a8c5ed29f2557c7e6e759f587a5ce0c361d56ab99388**。五资产为 tgz 和 .sha256/.size/.source-commit/.pnpm-version，大小 **511256/107/7/41/7 B**；原件均 0444，验证前后 dev/ino/mode/size/mtimeNs/ctimeNs/hash 不变，没有修包或重打。测试中临时 development/synthetic upgrade 包不是 accepted pack。
- 主 lane 与独立 archive 子代理均对该原件和四 sidecars strict 验证通过：**184 regular、0 directory、0 symlink、99 固定 + 85 vendor、80 build、19 入口**。独立新检出、新 HOME/TMPDIR/cache/store 的 archive 模式全套 **95 文件，1151 tests：1145 pass / 0 fail / 0 cancel / 6 skip**；**PluginManager 13/13、packed-native 14/14**，各 0 skip。通过显式 archive/hash 双参数消费同一 accepted 原件的已校验私有快照；仅源码 seams 仍测源码，不能泛称每项都直接读归档。
- 两个独立 SDK **0.2.2-alpha.3 / 0.2.1-alpha.1** 的 source+该 archive × beta/stable headless 均通过；每 channel **27 Skills / 11 model-visible**，source/archive registry 报告逐字节相同。**8/8** 无凭据挂载非零退出并明确停在 MISSING_CREDENTIAL；四个临时 DSH_HOME 与各 mount scrub HOME 随验证工作根清理，私有证据/缓存保留。无真实模型/PTC、无 Web 启动，隔离临时安装不等于当前 Profile 安装。

### 发布、下载回验与未安装边界

- 新鲜 main/ancestry/tag/Release 缺席与旧 refs guards 通过后，非 force **atomic main + 新 annotated v0.12.0** 已完成；main **f2d48a1 → 012a01d**，tag object **ee17611d25576421a7b927213f736920cbce9fbe**，peeled=上述完整 source。旧 tags 均保持原值，前一 v0.11.0 Release 内容及五资产 id/size/digest 不变。安装/重启不随发布授权自动获得。
- [GitHub Release v0.12.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.12.0) 已发布，API id **433617428**，published_at **2026-11-04T07:19:04Z**，draft=false/prerelease=false，target_commitish=完整 source **012a01d**。仅上传同一五原件，API state/size/digest 全匹配；新目录下载 **5/5 逐字节相同**并设 readonly，在冻结 source 检出运行 downloaded strict 再通过。公开资产 id/摘要见[机器验证摘要](<../dist/verification-0.12.0.json>)；原始日志/机器路径/用户环境快照仅私有保留。
- 完成后再核对当前 Profile manifest/lock/patch、已安装插件和共享 SDK manifest，**5/5 SHA-256 不变**，本机插件仍 **0.10.2**、DSH 仍 **0.2.2-alpha.3**；原 Web listener/PID/启动时间不变。**未安装本机、未改 Profile/共享 SDK、未重启当前服务、未 npm publish**，未清理宿主 spill，未宣称当前 GUI 已更新或图形/窄屏像素验收已通过。
- 七个本轮隔离检出有意保留供审计/复验；实际路径/Git 身份/clean 已独立核对，另记录 authored retention，未把“保留”标成物理清理。所有相关 jobs 已收集，子代理均已结束，未触碰其他历史工作树或原主检出的既有未提交修改。

## 0.11.0 插件读取路径性能优化（2026-11-04，已发布、未为本机安装）

本轮先提交 [性能设计/验收契约](<PERFORMANCE_READ_PATHS.md>)（c90af64），再由三个独立 subagent/worktree 实施并提交；集成引用为 A a67dd00、C 29c66a1、B 448f0bb。源码候选 ae23da4 通过全量与独立 Standards/Spec 双轴复核后，仅追加 D 状态文档并冻结 clean source e5d25cf；同一唯一制品的精确包/双宿主 headless/发布/下载回验现已完成。tag 与五资产保持冻结，本次 main 后续仅追加公开安全的完成证据，不改运行时/生成物/测试/打包元数据。当前本机仍保留原安装；本轮不安装当前 Profile、不改共享 SDK、不重启服务、不 npm publish、不连接生产日志或 GUI/模型/PTC。

### 实现与可复核 seams

- A：[历史 builder/源验证](<../src/controls/instrument-state.ts>)、[完整投影/版本索引](<../src/controls/instruments.ts>)；[增长与语义回归](<../tests/instrument-projection-performance.test.mjs>) 从真实 source seam 计数数组遍历/历史查找，不反射私有 Map。500/1000/2000/4000 版本的 cold 投影 array steps 为 6534/13034/26034/52034；500 版本旧值 131284。V2 1000 实体校验旧 505506 个搜索候选，现 3006。精确 historical merged value ACL、checkpoint+tail COW、不可变 pure state 复用、浅 frozen 可变源拒绝/健康/撤权有回归；current Interface 未变。
- B：[Host 私有身份事实](<../src/host.ts>)、[真实 authority/Runtime/公开 SessionQuery 回归](<../tests/performance-host-identity.test.mjs>)；cache 只含紧凑 hasDescriptor/header/token，cold/live 各最多 64，live 对实际 Session/Agent 用 WeakRef+seq，不保留事件数组。两个独立公开宿主 0.2.1-alpha.1 与 0.2.2-alpha.3 的真实 JSONL 4002 事件探针均证明公开 source token 可用：首次 1 observation、热 known-version 新增 0、flush 追加后新增 1，不激活 Session；按能力而非版本开启。缺 stat/identity/observation revision 的四类组合仍保守观察，可能比旧 TTL small-log 路径观察更多，不声称所有组合都提速。当前 stat/lease、畸形 descriptor、缺 parent、显式 stale revision、继承/retained、深链/cycle、source/header/Agent 替换、授权/撤权/OFF 和取消均覆盖。
- C：[Remote 严格表示](<../src/controls/remote-contract.ts>)、[current-facts 消费与捕获](<../src/runtime.ts>)、[formatter](<../src/controls/consumption.ts>)、[上下文索引](<../src/controls/history.ts>)；[mounted Remote](<../tests/performance-remote.test.mjs>)、[真实 Runtime preStep/postExecute](<../tests/performance-runtime.test.mjs>) 与 [context/purge/suppression](<../tests/performance-consumption.test.mjs>) 是回归 seams。严格全图验证同时证明不可变才复用 detached/frozen wire，普通 parseHostJson 保持总验证。热消费读 current/provenance，首次/变更/失败仍补捕获；每实例最多 64 个成功 consumer token，交替 owner/child 场景 full reads 8→2，assignment 撤销后再捕获。failed-open 仅驱逐仍匹配的拒绝 promise；成功后继 handle 保留，已打开 uncertain latch 不自动重开。未拆 FIFO、延长 timeout 或削弱持久 frontier/原生物理义务。

### 独立切片合成基准（不是生产 SLA）

基线代码为 c90af64（运行时等同 0.10.2），Node 24.17.0。A 为真实 SessionInstruments/Domain adapter/短正文、每点 5 样本中位数；测量源内容与 A 集成一致，不含序列化。

| H 个 decision 版本 | full read 前→后 ms | 真正非 memo cold project 前→后 ms |
|---:|---:|---:|
| 500 | 9.194→1.547 | 1.610→1.309 |
| 1000 | 34.419→2.742 | 3.708→1.734 |
| 2000 | 129.031→5.000 | 9.878→3.470 |
| 4000 | 463.316→9.588 | 31.194→6.755 |

固定 H=2000/N=1000 的 full read 为 99.971→7.587ms。4000 版本的结构/多语长正文形状约 15.856–19.965ms（不含 stringify），未声称所有 workflow 重定义/cleanup 证明形状都严格 O(E)。pure state 按源寿命保留 O(H+N) 图；4000 版本单实体相对 normalized source 增加约 8011 对象、6 数组、4000 slots，是结构计数而非 RSS 字节或泄漏结论。candidate 预校验与 normalize parse 仍可分别构建，不声称不同 mutable 对象共享投影。

C 为实际 mounted Typert Remote+Runtime，hot 7 样本，强制 freshness 失效每点也 7 次；该切片基准未合入 A，以下不当作合并后重新测量或与 A 时间相加。

| H / 短正文 | Remote hot 前→后 ms | 每次强制重建 current 消费 前→后 ms |
|---:|---:|---:|
| 100 | 3.362→0.326 | 4.341→2.691 |
| 500 | 13.480→0.283 | 13.386→2.021 |
| 1000 | 28.205→0.233 | 38.932→2.376 |
| 2000 | 58.650→0.264 | 145.269→2.356 |

七次强制热重建的 full-history reads 均 7→0，Remote 同 wire 表示 identity 命中 0/7→7/7；100×32768 chars 形状分别 2.908→0.278ms / 3.457→2.492ms。fresh 完整 Remote 仍支付完整构造/验证成本（2000 版本 201.948→203.271ms），source change 仍全捕获，单次数据不作稳定改善声明。WeakMap 额外驻留一份 wire graph，2000 版本 source DAG 14066 节点→detached 18073 节点，wire 约 1.614MB；长正文约 6.645MB，没有巨型字符串缓存。未将图结构计数、GC 或计时推断成内存泄漏/现场 CPU 归因。

### 切片交接时门禁（D 前记录；最终门禁见下）

- A 最终显式 SDK source seam 定向 75/75，含真实存储 write/reopen、CAS、uncertain/purge；strict tsc 通过。
- B 两个独立宿主各 68/68、0 skip，实际 JSONL probe 包含在回归；baseline 与 alpha.3 声明均 0 diagnostics。
- C 定向 137 项 135 pass/2 skip（未设 HOST_ROOT 的 native history probes）；显式 alpha.3 定向 20/20、零 skip，实际补测这两项。
- 主 lane 已独立重跑 A current/projection 13/13、summary 9/9、A+C Runtime/Remote/consumer 43/43；这些不是全量验收计数。
- 合并后 Host build、Client noEmit、闭合浏览器 build 通过；Client 283100 B / 8 私有模块，仅 React 与公开 UI primitives external。完整 source/lib scratch、vendor 与唯一归档门禁尚待运行。
- 原始日志、机器路径与样本仅在本地保留；此页是公开安全摘要，不把缺少公开原始证明的计时写成独立认证。公开测试可复跑行为/工作量，且 fixture/对照失败与真实产品 RED 已区分。

### 合并候选重测与 D 阶段验收

主 lane 在合并三个切片的 929c5da 以显式 alpha.3 SDK 独立复跑同一 mounted benchmark（7 hot / 3 fresh samples）。H=100/500/1000/2000 的 Remote hot 中位数为 0.557/0.341/0.435/0.434ms，强制 current rebuild 为 3.836/2.987/3.177/2.749ms；每点 full-history reads 0、表示复用 7/7。2000 版本 fresh full 仍 64.537ms，真实 source change 单次 258.547ms，不承诺这两项为零或稳定提速；其余 wire 内容/长度/equality 断言均通过。此为整合候选复测，不与切片时间相加、不作为最终发布源码 SHA 的重复计时证明、RPC 网络序列化、GUI/模型验收或现场 CPU/RSS 归因；其后仅能力 guard/测试迁移与共享 context 私有规则收敛，不变更优化契约。

D 最终代码候选 **ae23da4a3f96cccac787c7abcb3b2ab0c8910e8e**，工作树 clean：

- 主 lane 全量 source：**94 文件，1126 项，1120 pass / 0 fail / 0 cancel / 6 skip**，Node 24.17.0，canonical 0.2.2-alpha.3 + 独立 compatibility 0.2.1-alpha.1，固定 distribution source。六项 skip 均为 Native Client activation/browser-loader fixture 无公开 UI slots 包，不冒称 GUI 通过。性能 source-only seams 不冒称全都直读归档。
- 首次 source gate 的 7 项失败已诊断：三个真实 native inbox/steer/startup 路径暴露 partial Sessions 缺 get 的新适配回归；四项是已被新契约替代的 public full-array TTL/identity/singleflight 断言。隔离 follow-up 88118e4（原 9bf8b7a）加能力 guard，并将八项测试完整迁移到源码 seam 的当前 header/完整 owned suffix/继承隔离/冻结/独立取消/lease 释放语义，未恢复大数组缓存；两个真实宿主定向各 103/103、零 skip。随后本节全量重新通过，不抹除早先失败。
- 初次 Standards 唯一 P3 为 activeContext 复制 inContext 领域规则，隔离 c064ddc（原 ad47360）合一并保留 Map O(1)；Spec 独立复现上述可选能力回归。最终双轴针对 929c5da…ae23da4 窄 diff 均确认关闭、无新增未关闭发现；Spec 同一反例回退成功，完整 facts/context 定向 9/9。
- baseline Host/Client 严格构建与闭合 Client 通过；独立 alpha.3 声明 root/client 均 **0 diagnostics**，78/78 非 Client 生成物逐字节一致；strict --prepack 通过，80 闭合 build / 99 固定 files / 85 vendor / 19 exports，Client 283100 B / 8 私有模块。vendor 296048 B、SHA-256 70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8，beta/stable 各 27 Skills 不变。
- D 结束时 E/F 尚未完成（最终结果见下节）：不把 prepack 当唯一归档签收、不把评审/源码测试当 push 或 Release 收据。安装当前 Profile、修改共享 SDK、服务重启、npm publish 仍不在授权内。

### E/F 唯一制品、双宿主 headless 与发布/下载完成

- 冻结 source **e5d25cf75ed20bcf7d7991065824108fabf375f4**，clean=true。沿用当前发行方案，以 npm 11.13.0 `pack --ignore-scripts` **仅一次**生成唯一 accepted 归档；pnpm 11.8.0、Node 24.17.0、GNU tar 1.35。归档 **506502 bytes**，SHA-256 **c903f2f923fb352cf8ff16da26cba76fe06739540fad3be3cac02ae33c4e0398**。唯一五资产为 tgz 与 .sha256/.size/.source-commit/.pnpm-version，大小依次 506502/107/7/41/7 B；原件均 readonly，门禁前后身份/大小/摘要不变，没有修包或重打。
- strict --prepack 与 --tarball 通过，**184 regular、0 directory、0 symlink、99 固定 + 85 vendor、80 JS/DTS、19 入口**；归档 source/lib/模式/vendor 一致。主 lane 另行独立验同一原件与下载副本，各 strict 通过；没有把源码 fixture 包代替 accepted 归档。
- 精确归档全量：94 文件，**1126 项，1120 pass / 0 fail / 0 cancel / 6 skip**，canonical alpha.3 + 独立 compatibility alpha.1，显式携带 accepted archive/hash 双参数；PluginManager **13/13**。六 skip 仍只限缺少公开 UI slots 的 native Client fixture；source-only 性能 seams 保持源码测试，不宣称每个测试直接加载归档。两个历史 synthetic upgrade fixture 与正式制品分离。
- 两个独立公开 SDK **0.2.2-alpha.3 / 0.2.1-alpha.1** 的 source+同一 archive × beta/stable headless 全通过，source/archive registry 报告逐字节相同，每 channel 27 Skills / 11 model-visible。四个 fresh 临时安装 HOME 与其 DSH_HOME 已清理；**8/8** 无凭据 mount 明确停在 MISSING_CREDENTIAL，无真实模型/PTC、无 Web 启动、无当前 Profile 安装或 SDK 改动。这是隔离 headless，不是本机/GUI 验收。
- 非 force **atomic main + 新 annotated v0.11.0** 推送完成：发布前 main=29e25ce，经新鲜远端/ancestry/缺席 guards 后前进到 source e5d25cf；tag 对象 **93d1d550a1492b309e64a048557e3a3c13701546**，peeled=source e5d25cf。旧 v0.10.2 对象/peeled 未变。首次只读 fetch 的 TLS 握手失败后同命令重试成功，未改安全配置，未导致重打或覆盖。
- [GitHub Release v0.11.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.11.0) 已发布，API id **433564914**，published_at **2026-11-04T06:00:11Z**，draft=false/prerelease=false，target_commitish=完整 source e5d25cf。只上传同一五资产，API size/digest/state 均匹配；新隔离目录下载 **5/5 逐字节相同**，原件与下载均 readonly，下载 strict 再确认完整 source/字节/模式/184 成员。主 lane 独立读取公开 API、远端 tag/main，并复核五份 bytes/hash/API digest 与下载 strict。公开 id/摘要见 [机器验证摘要](<../dist/verification-0.11.0.json>)，不公开私有机器路径/日志/凭据。
- 不安装边界最后复核：从实施前基线比较当前 Profile/lock/patch、已安装插件 manifest 与共享 SDK manifest，**5/5 SHA-256 不变**；当前本机插件仍 **0.10.2**、DSH 仍 **0.2.2-alpha.3**，原 Web 服务 PID 与启动时间不变。未 npm publish、未接触原生列表/Forge/宿主 spill/GC，未宣称现场 CPU/RSS 已修复或 GUI 已更新。
- 三个已完成 feature 检出在核对绝对路径、branch/HEAD/clean 后用 git worktree remove 清理，分支/commit 保留；旧工作树未碰。明确保留集成/最终证据检出与精确 e5 source release 检出供复验，五资产/私有证据保留；处置 author notes 与实际 Git/路径缺失核验分开，不当作执行或物理资源互相证明。

## 0.10.2 模型工具请求描述修正与安装（2026-11-04，已发布/已安装/未重启）

0.10.2 继承 0.10.1，只修正模型工具请求描述，并增加描述契约回归；运行时代码、已注册工具面、schema-2 DTO、vendor 与 `engines.dsh` 不变。详细设计边界见 [DESIGN.md](<DESIGN.md>) 的同名节，实施记录见 [IMPLEMENTATION_PLAN.md](<IMPLEMENTATION_PLAN.md>)。

### 源码、制品与回归

- 源码提交：`95f7ed8665b137c8e82c471758d3e91a21387ace`，清洁工作树。
- 唯一制品 `lmgatex-dsh-mattpocock-skills-0.10.2.tgz`：**501,481 bytes**，SHA-256 `1cb5f0a4bcbd64f235314e354be06e522b88a781eaef3eefdc6635d5f5a7fcfd`，**184** 成员（99 固定 + 85 vendor，0 目录／0 symlink），80 个 JS/DTS 产物，Client 278,881 B，8 个客户端私有模块，19 个闭合导出目标。Node 24.17.0、pnpm 11.8.0、npm 11.13.0、GNU tar 1.35。
- Host 与 Client TypeScript 编译均 **0 error**；`--prepack` 的 scratch 构建比对通过，非 Client 的 78 个 JS/DTS 产物与提交的 `lib/` 逐字节相同。
- 源码套件（alpha.3 规范根 + `0.2.1-alpha.1` 兼容根，提供源树）：**1087 项，1081 通过、0 失败、6 skip**；6 个 skip 均为公共 `@deepseek-ai/dsh-client-ui-slots` fixture 缺失。
- 同一精确制品的归档矩阵（`DSH_CONTROLS_TARBALL`）：**1087 项，1081 通过、0 失败、6 skip**；同一 skip 分类，PluginManager 实测包含在矩阵内并通过。
- 描述契约测试显式断言 `mattpocock_controls`、`mattpocock_record`、`mattpocock_history` 与条件 `mattpocock_audit` 使用顶层 `{action:...}`，并禁止再出现嵌套 `read={...}`／`save={...}`／`apply={...}` 说明。

### 发布

- [GitHub Release v0.10.2](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.2)：ID **433507573**，node ID `RE_kwDOU4vYYs4Z1sz1`，发布时间 **2026-11-04T04:17:34Z（北京时间 12:17:34）**；draft=false、prerelease=false。
- annotated tag **v0.10.2**：对象 **ae533bd6cf3800466dd0b92ac3396fb443cfe56f**，peeled source `95f7ed8665b137c8e82c471758d3e91a21387ace`；Release 的 `target_commitish` 已显式固定为该 source。
- 唯一五项资产：tgz、`.sha256`、`.size`、`.source-commit`、`.pnpm-version`，大小分别为 501,481／107／7／41／7 bytes；下载到新的隔离目录后 **5/5 逐字节相同**，下载副本再次通过 strict `--tarball`（184 成员、source 95f7ed8、pnpm 11.8.0）。
- 公开机器记录见 [verification-0.10.2.json](<../dist/verification-0.10.2.json>)。旧 v0.10.1 tag/Release/资产未移动或覆盖。

### 本机安装

- 已将 Release 的同一 tgz 安装进当前 Web Profile：插件 **0.10.1 → 0.10.2**；安装树与归档解包 **逐字节相同**（184 个文件、0 symlink）。
- 安装前插件 manifest SHA `ad4a0cbd3a4fedb8f870894f61b4620ae4236ab4fff36a887f20d051311efb3e`，安装后 `c7755ca8906a6da8cc36adb6fba87280527a72bf7d210887947b7e8bd40192b7`。
- Profile `package.json` SHA 由 `a954f34aaf8562dd352886dc5cdbe5d662a758b854b2919663f384da6e45778e` 变为 `8ed9f0e454a677646d4c6d1853fda92c26a66f257e1dcfe498d6a75ab77110b0`；lockfile 由 `015533edfa6e543785705cf9c21092b94973396e00eeaba12bccbc7aa644cf5f` 变为 `2a16546cf85f13b5d137b5e6b07b5a9ec023ce51b52c3fb6697d353ad1e52995`。
- `cordis.patch.yml` SHA 保持 `333940b68b81aa63b696e79392553bc24804524189e9f9a12f77c59f7c2f7cd0`；当前 DSH 为 **0.2.2-alpha.3**，SDK manifest SHA 保持 `f50975cd7583415320289561127e38d7d0f3b7e112e99df118ccac5d2cb458af`。
- 旧 0.10.1 Profile／插件已私下备份。安装后 **2026-11-04 12:21:58 已正常重启** `dsh web`（新 PID 48436，端口 3080）；新进程加载 0.10.2，插件 runtime ID 由 `b3acb884…` 变为 `e0326f50…`。重启后 controls／record／history／worktree 读取与 `writing-for-agents` Skill provider 均通过；实际注入的系统提示已包含新的顶层 `{action:...}` 描述。没有真实浏览器截图、模型或 PTC 运行。

### 边界

- 不 npm publish、不升级本机 DSH、不清理旧 spill、不改共享 SDK 或宿主补丁。
- 安装与运行进程分离；安装成功不等于当前进程生效。

## 0.10.1 DSH 0.2.2-alpha.3 兼容补发与安装（2026-11-04，已发布/已安装/未重启）

0.10.1 是**兼容性补丁**，继承 0.10.0 的运行时、工具面、schema-2 DTO、vendor 与 `engines.dsh`；本版只更新版本、当前版本断言、兼容记录与发行／安装文档。alpha.3 的公开接缝核对、类型编译、双宿主回归和隔离 headless 装载见 [HOST_COMPATIBILITY.md](<HOST_COMPATIBILITY.md>) 的 alpha.3 小节。

### 源码、制品与回归

- 源码提交：`4feafbe400c16dbccf215ef48e44313b46f859bc`，清洁工作树。
- 唯一制品 `lmgatex-dsh-mattpocock-skills-0.10.1.tgz`：**500,871 bytes**，SHA-256 `c678d37dcb5b966ba4bf75b15069fdff10b6f883b1a898d2fcaaa39c11219a7a`，**184** 成员（99 固定 + 85 vendor，0 目录／0 symlink），80 个 JS/DTS 产物，Client 278,881 B，19 个闭合导出目标。Node 24.17.0、pnpm 11.8.0、npm 11.13.0、GNU tar 1.35。
- alpha.3 类型声明下根与 Client 编译均 **0 error**；非 Client 的 78 个 JS/DTS 产物与提交的 `lib/` 逐字节相同。
- 源码全量套件（alpha.3 规范根 + `0.2.1-alpha.1` 兼容根）：**1086 项，1077 通过、0 失败、9 skip**；3 个可选 source-ingestion 场景在提供只读本地源克隆后启用。
- 同一精确制品的归档矩阵（`DSH_CONTROLS_TARBALL`）：**1086 项，1080 通过、0 失败、6 skip**；6 个 skip 均为安装包不提供公共 `@deepseek-ai/dsh-client-ui-slots` 的 native Client fixture。PluginManager 实测包含在该矩阵中并通过。
- 精确 `--tarball` 验包、源字节／模式／导出／vendor／成员检查通过；下载回验使用同一归档，不重新打包。

### 发布

- [GitHub Release v0.10.1](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.1)：ID **433485643**，发布时间 **2026-11-04T03:40:31Z（北京时间 11:40:31）**；draft=false、prerelease=false。
- annotated tag **v0.10.1**：对象 **7d3dd74fd6f15108bd02447f825af055a9e60333**，peeled source **4feafbe400c16dbccf215ef48e44313b46f859bc**；`target_commitish` 显式固定为该 source。main 在发布时为同一 source。
- 唯一五项资产：tgz、`.sha256`、`.size`、`.source-commit`、`.pnpm-version`，大小分别为 500,871／107／7／41／7 bytes。全部下载到新的隔离目录后 **5/5 逐字节相同**，下载副本再次通过 strict `--tarball`（184 成员、source 4feafbe、pnpm 11.8.0）。
- 公开机器记录见 [verification-0.10.1.json](<../dist/verification-0.10.1.json>)。旧 v0.10.0 tag/Release/资产未移动或覆盖。

### 本机安装

- 已将 Release 的同一 tgz 安装进当前 Web Profile：插件 **0.6.0 → 0.10.1**；安装树与归档解包 **逐字节相同**。
- Profile `package.json` 与 `pnpm-lock.yaml` 按安装更新；`cordis.patch.yml` **未变**，仍保留 beta channel 与 `disabled: false`。安装前旧 0.6.0 Profile／插件已私下备份。
- 当前 DSH 仍为 **0.2.2-alpha.2**，未升级；SDK manifest 指纹保持 `fcfbff65bc9a7beae1d5bd56af6eb166b61dcd22bd20234653d2b8d56d09aa63`。
- **未重启**当前 `dsh web` 进程（PID 与 3080 端口未变化）；当前运行进程是否已热加载 0.10.1 未验证，不把 GUI 生效作为事实。正常重启后才确认新进程加载该制品。没有真实浏览器交互、模型或 PTC 运行。
- 不 npm publish、不清理旧 spill、不改共享 SDK 或宿主补丁。

## 0.9.0 制品验收（2026-11-04，隔离工作树；已发布/未安装）

本版实施事实边界与恢复：执行事实以 `headerCwd` 表达 header 来源值（旧 `initialCwd` 单键兼容读取；两键同值归一化、冲突拒绝）；不再由 header 路径相等生成 `initial-cwd`/worktree 关联，`nativeChildren` 只保留 `created-tree`（header 为 null 也保留）；迟到 `subagent/end` 使用 owner/session/run 事实与 `runId` 围栏，旧 run 不覆盖新 run、新 start 缺 `runId` 不继承旧 run、旧 Agent 的 disposed 不清掉新 live run；无 owner view 时只报 native-executions 覆盖缺口，不写 outcome、不扫冷日志、不重试。delegate 结果分开报告 `creation`/`binding`/`assignment`，并另列 `recording`/`persistence`/`recovery`；confirm 失败 assignment=not-attempted，assign 提交不确定=unknown，accepted child 不重建；replay 不隐式 assign，recovery 与旧 result 分开。`delegateRegistered` 仅当可信 Host 配置 `delegate: true` 且 facade 实际提供 delegate 时为 true；消费协议只在 `delegateRegistered === true` 时指示 delegate，OFF 保留事实但不追加受管行动。没有新增模型工具、Remote 方法、存储域或强绑定写入口；默认仍是 7 固定 + 条件 audit（delegate opt-in 第八项）、Remote 16、客户端 9 wire key。

源码提交：`708b277a2bb6699de05c822572057b29b842d0ab`（分支 `release-0.9.0-fact-boundaries`）。验证在干净 detached 工作树中重新安装、构建并运行完整套件；未修改主检出、其他工作树或 vendor。

### 构建、测试与包门禁

依次执行并通过：

1. `pnpm install --frozen-lockfile --ignore-scripts`（pnpm 11.8.0）
2. `pnpm exec tsc -p tsconfig.json`
3. `chmod 755 lib/compatibility/cli.js`
4. `pnpm exec tsc -p tsconfig.client.json --noEmit`
5. `node scripts/build-client.mjs --out lib/client.js --declaration`：**278,881 B**，8 个浏览器安全私有模块，外部请求仅 `@deepseek-ai/dsh-client-ui-primitives` 与 React
6. `DSH_CONTROLS_HOST_ROOT=/home/dev/.local/lib/node_modules/@deepseek-ai/dsh node --test tests/*.test.mjs`：**997 项：794 通过、0 失败、0 cancelled、203 skip**。203 是缺少显式 SDK 根/双根等环境门禁，不是加载失败。
7. `node scripts/verify-vendor.mjs`：beta/stable 各 27 Skills；vendor **85 文件、296,048 B**、root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`
8. 清洁源码提交上 `node scripts/verify-package.mjs --prepack`：**95 固定 + 85 vendor = 180** 个打包成员，构建 **76** 个 JS/DTS 产物

定向套件：`model-contract` **7/7**；`client.test.mjs` **39/39**；`consumption.test.mjs` **26/26**；`native-executions` **11/11**；`native-execution-runtime` **16/16**；`collaboration-runtime` **21/21**。

### 精确制品

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.9.0.tgz` 保存在 `/tmp/dsh-0.9.0-artifact/`：**476,121 bytes**，sha256 `756f9d48f448266e80397a736afddda30301991c483d4695cce6528151a9beac`，**180 成员**（95 固定 + 85 vendor），源码提交 `708b277`，pnpm 11.8.0，npm 11.13.0，GNU tar 1.35。打包使用 `npm pack`；`package.json` 按本仓库 verifier 的既有规则仅去掉打包成员末尾一个 LF（源码 10,340 B -> 成员 10,339 B），其余字节不变。

精确验证命令：

```text
node scripts/verify-package.mjs --tarball /tmp/dsh-0.9.0-artifact/lmgatex-dsh-mattpocock-skills-0.9.0.tgz \
  --sha256-file /tmp/dsh-0.9.0-artifact/lmgatex-dsh-mattpocock-skills-0.9.0.tgz.sha256 \
  --size-file /tmp/dsh-0.9.0-artifact/lmgatex-dsh-mattpocock-skills-0.9.0.tgz.size \
  --source-commit-file /tmp/dsh-0.9.0-artifact/lmgatex-dsh-mattpocock-skills-0.9.0.tgz.source-commit \
  --pnpm-version-file /tmp/dsh-0.9.0-artifact/lmgatex-dsh-mattpocock-skills-0.9.0.tgz.pnpm-version
```

结果：source clean=true、commit 匹配、sha256/bytes/180 成员/模式/导出目标与 vendor 全部通过。`--prepack` 另行确认提交的 `lib/` 与同源码构建逐字节一致。

### 边界

- **binding 是声明式 header checkpoint**：`binding: confirmed` 只表示显式 header checkpoint 匹配 planned child/parent/requested cwd，不是实际初始/当前目录证明；reconcile 只修 binding，不补 assignment、不证明目录。0.9.0 没有新增实际 cwd 证明 seam。
- **coverage gap 是证据缺口**：迟到 end 只有在同一 runtime 仍保留 owner view 时才写 outcome；没有任何可信 owner view 时只报 native-executions coverage gap，不扫冷日志、不重试、不猜结果；这不是“已保存”。
- **已发布但未安装**：已 push `main` 与 annotated tag `v0.9.0`（tag 提交 `ccaac0d`，tag 对象 `33558f3`；其后 `main` 仅追加本记录）并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.9.0)，上传 tgz、sha256、size、source-commit 与 pnpm-version；未执行 DSH install、Profile 编辑、服务重启或 GUI 变更，未 npm publish。
- **模型与接口面**：默认 7 固定 + 条件 audit，delegate 仅 opt-in 第八项；Remote 16；客户端 9 wire key；没有新增模型工具、Remote 方法、存储域或强绑定写入口。
- 完整记录见 [dist/verification-0.9.0.json](<../dist/verification-0.9.0.json>)。

## 0.10.0 插件模型工具输出减负（2026-11-04，源码/双轴/精确制品/下载通过；已发布/未安装）

范围与门禁以 [详细设计](<BOUNDED_TOOL_OUTPUTS.md>) 和 [阶段计划](<IMPLEMENTATION_PLAN.md#bounded-tool-outputs>) 为准。已实施插件 output Module、current-only 业务读取及 Host 模型 Adapter；内部完整读取/Remote、历史保留和业务 CAS 不以新 DTO 替换。以下是**已运行的源码证据，不是最终验收**，不沿用 0.9.0 或其他历史版本计数。

### 已观察到的有界结果

- [大历史回归](<../tests/bounded-output-scale.test.mjs>) 在合法、非持久 MemoryInstrumentStorage 中递增 CAS 构造 200 个旧版本：旧 Host 的真实 typed 结果 **44,119,587 B**，超出 65,536 B；当前相同业务状态的新 model 结果 **5,764 B**，小历史版本 **5,756 B**，只相差 8 B。完整内部读取仍为 44,119,587 B，没有删除历史。
- 同一测试实际运行 **300 次直接 typed execute + 300 次 SDK registry/pipeline**（不是合计 300），每通道最大 5,764 B、累计 **1,729,200 B**，合计 **600 次 / 3,458,400 B**；其中 10 次真实外层工具嵌套 record，公开 pre-execute 观察到正确 parent token 与 rootCallId，逐次 typed DTO 与实际 render JSON 相同。
- [历史模型回归](<../tests/bounded-model-history.test.mjs>) 构造 100 个带转义标识/大文本的真实 decision 历史行：第一页 **58 行 / 65,298 B**，两页完整恢复 100 行且无重漏；20 个大详情返回 20 个 stub、**22,779 B**，正文片段重建后与内部保留行的 canonical JSON/hash 相同；purge 后旧 locator 不复活正文，当前 100 项义务保留，assigned child 仍不能读取 coordinator history。
- [仅凭 record 恢复](<../tests/bounded-model-recovery.test.mjs>) **8/8 通过，0 skip**：不运行 preStep、不消费自动上下文，覆盖已知 T/S 与未知正数下界、pendingRelease 续页而不释放、hidden/OFF/focus 不丢义务、程序 native-stop、未物理验证的 worktree 观测，以及全关联票/creator/撤权边界。生产 postExecute hook 仍运行，不冒称没有生命周期代码参与。
- Host 严格构建、Client noEmit 与闭合构建已通过；Client **278,881 B / 8 个私有模块**，仅 React 与公共 UI primitives 外部请求。实际 scratch build 为 **80 个 JS/DTS**；[构建/包清单烟雾](<../tests/controls-package.test.mjs>)、[artifact 清单](<../tests/package-artifact.test.mjs>)、[scaffold](<../tests/scaffold.test.mjs>) 加大历史回归合跑 **23/23 通过，0 skip**。development 包烟雾不是冻结的 accepted archive。

### 完整源码回归与分阶段门禁

含验包器窄修复后的最终集成源码根套件（88 个文件；精确归档管理器文件后置）为 **1073 项：1067 pass、0 fail、6 skip、0 cancelled**；前一运行时修复源码 27fd924 的检查点为 1066/1060 pass/6 skip/0 fail，保留为独立历史。显式使用未修改的规范 SDK **0.2.2-alpha.2** 与兼容 SDK **0.2.1-alpha.1**；旧 SDK 公开 native 入口与仓库 pin 相符，22 个所需公开入口只读导入通过。6 个 skip 均为**缺少公共 UI-slots 的 native Client 激活场景**，不能当作通过或当前 GUI 的验证。先前缺源的 3 个可选 Git 场景已用现存只读源、仅允许本地 file transport 的隔离副本启用并通过；其中 source-ingestion 为 **12/12，0 skip**，验证 upstream v1.3.2 commit **d1478fcb140db0b93c0c8df17bcfd311844749d0** 及 85 份 vendor 文件字节与 Git modes，无网络 fetch、原 source/SDK 写或 vendor 重生成。已修正旧 76 产物断言与四个 Host fixture，并让带 query 的 HMR 源代际使用一致的显式 TypeScript 转译；实际 Loader 定向回归 **49/49，0 skip**，未修改生产兼容选择器。

[全工具集成回归](<../tests/bounded-model-tools.test.mjs>) **19/19，0 skip**，覆盖七固定工具、opt-in delegate 与独立 audit 的直接调用及真实 SDK 嵌套流水线，逐项 typed value 与 compact render 相同、parent/root 保留、64 KiB/8 KiB 限额；policy 36 个 workspace/defaults 完整重建、跨 caller/同标识不同种类的 Unicode 正文、window ignored/generation/replay、已提交/已接受效果的 projection fallback、capture 故障回执和 binding/observation 真实正文 roundtrip 均在实际模型入口验证。不是私有 formatter 自测或真实 LLM/PTC 执行器运行。

首轮固定基线/候选的独立 Standards 与 Spec 复审曾拦下五项缺陷，现已修复并有实际回归：current-only worktree 改走 immutable current index；正文解析/协作编码/最终 DTO 与权限复核位于同一 FIFO，过期 async-local permit 关闭；native 当前集合不继承 64 行展示上限，65 项可全部分页及直接定位；实时 cursor 包含 lane/nativeChildren/绑定依赖；capture outcome 以实际结果身份关联，提交修订不因 capture 失败消失，后续健康恢复不覆盖本次失败回执。worktree current 的合成长尾为 binding **22 旧版本 / full 2,413,414 B → current 848 B**、observation **62 旧版本 / 270,935 B → 795 B**，各 300 次热读复用同一 immutable current 对象；冷解析/验证仍可随历史增长。

固定候选 0fde053 的第二轮复核：**Standards 接受该 SHA 的源码（0 个 blocker、1 个非强制重复选择逻辑 heuristic）；Spec 仍拒绝（2 个新 P2）**。原五项问题已关闭，但绑定集合的 cleanupDue 实时依赖未进入 cursor cut，以及工作树回执将 current row revision 错称原操作 appliedRevision，均被独立实际复现；后续最小修复已完成真实 RED→GREEN 并进入上述完整回归：binding cut 绑定已计算的 key/cleanupDue 投影，双入口旧 cursor 在 child 消失后冲突，而无业务写、稳定续页和 durable body/hash 保持原义；worktree 回执及 projection fallback 的 appliedRevision=null 且原操作水位 coverage 不可得，保留当前 businessRevision/state，不把 update-a→update-b→重放 a 的 current revision 当旧 a 的原提交，也不再次写入。observation fresh/no-op 同样不伪造原提交。修复后的固定 clean-source **27fd924d474628eae30e79a9606976314f53ccf1** 已获得两位独立 reviewer 签收：**Standards：0 blocker、1 个非强制重复选择逻辑 heuristic；Spec：0 未闭合 finding，六项 Spec finding 全部关闭**。Spec 又独立只读重跑模型工具/历史/恢复/规模、model-output、instruments-current、worktree-current 七组 **55/55，0 fail/skip/cancel**，含全部 19 个真实模型工具测试和 600 次规模观测。Standards 不替代 Spec，源码签收也不替代精确包、远端发布或 GUI；正式制品正在发行 lane 独立验收，远端写仍待主代理收到全部制品 GREEN 后明确放行。fresh vendor 验证为 **85 文件 / 296,048 B**、beta/stable 各 **27** Skills、root SHA-256 **70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8**。纯字节压缩通过不替代语义、制品与发布验证。

发行 lane 在 clean-source **27fd924** 独立重跑源码 **1066/1060 pass/6 skip/0 fail**、严格构建、40 源模块与 80 lib 路径逐项清单和 prepack 均通过（80 build、99 fixed + 85 vendor = 184）。但首个正式候选 **500,162 B / SHA-256 53bfd050d64f95f19045bd3ecb94d89057cdfde57e2df29e81a1476469f8d7f2** 被 strict tarball 门禁拒绝，**不是 accepted archive，也未发布**：清单实际 10,481 B，验包器单边删 LF 后期待 10,480 B。只读逐项诊断确认 184 个成员的字节、类型和模式与源码完全一致；npm 11.13.0 保留原清单末尾 LF，没有重排 JSON 或丢 packageManager。旧候选与四个身份文件均封存只读且身份未变，不修补、不换文件冒称原制品通过。最小两文件验包修复已完成真实 RED→GREEN 并集成：真实 source 工厂→成员校验先命中 10480/10481；仅修长度后，公共 runTarball 的 source 保 LF 再命中解包正文 RED；最终两种合法形式均通过、同长度恶意正文仍拒绝。精确反馈 **9/9，0 skip**，包 artifact/scaffold/controls 三组 **29/29，0 skip**；主代理与发行 lane 分别完整重跑上列 **1073/1067 pass/6 skip/0 fail**。只有 root manifest 的两个经源码验证的长度和两种精确正文可接受；其他文件即便伪给 sourceSize 也不允许 +1，额外 LF/CRLF、内部换行、重排/minify、字段或 packageManager 变化仍拒绝。legacy canonical helper、所有路径/类型/模式/身份/清单规则保持，runtime/lib/Host/Remote/package/version/vendor 未改变。包含该修复的 clean-source **8ec081d0375231278e151890aae51434d07bddca** 后获 Standards（0 blocker、1 旧 optional）及 Spec（0 open、原六项均闭合、独立只读验包回归 5/5）重新签收；在新目录从该源码实际打出新候选，不沿用旧 source identity。初始被拒候选检查点未运行精确包矩阵；后续 S2 完整验收如下。这是远端写入前的验收检查点；实际发布与下载结果在下方单列，不把后续成功追记为早先已完成。未为本机安装插件，未修改当前 Profile/SDK、重启服务或清理旧 spill，也未 npm publish。内存 source fixture / 公开 SDK 管线证据不等于真实 LLM/PTC 执行器、GUI、物理资源、磁盘 spill、Node heap 泄漏或 O(1) 冷读取证明。

### S2 正式精确制品验收（制品源提交之后记录；已发布/下载回验通过）

- **唯一 accepted archive 的源码是 8ec081d0375231278e151890aae51434d07bddca**，不是后续文档记录提交；未来 annotated v0.10.0 必须指向该源码。发行 lane 在独立清洁 detached 树、私有 regular-disk HOME/DSH_HOME/TMPDIR/cache 中重建；没有改生产 SDK、Profile 或服务。
- 实际逐路径枚举 **40 源模块、80 JS/DTS**；strict Host、CLI 可执行位、Client noEmit 与闭合 client **278,881 B / 8 私有模块 / 2 externals** 通过。clean prepack 为 **99 fixed + 85 vendor = 184**；vendor **296,048 B / beta、stable 各 27**，root SHA-256 保持上列固定值。
- 从该清洁源码一次真实 npm 11.13.0 pack --ignore-scripts 构建的新归档为 **500,162 B**，SHA-256 **53bfd050d64f95f19045bd3ecb94d89057cdfde57e2df29e81a1476469f8d7f2**。payload 可复现地与旧被拒候选同 hash，但新 pack 及新 source-commit 身份独立，旧五原件仍封存；不是复制旧包、更改旧 sidecar 或追认旧候选。新五资产均只读，整个验收期间身份未变。
- 发行 lane strict --tarball 与主代理在自己清洁 S2/独立依赖、另一私有 regular-disk scratch 中的独立验包均通过：source/commit、SHA/size、**184 files / 0 directories / 0 symlinks**、类型/模式、所有 source/lib 字节、**19 导出/入口目标**与 vendor。清单本次保留原 **10,481 B**，source 完全相同；不是修包。
- 同一只读原件经 DSH_CONTROLS_TARBALL 与 DSH_CONTROLS_TARBALL_SHA256 校验后供完整 **89 文件 / 1086 项：1080 pass、0 fail、0 cancelled、6 skip** 使用。**PluginManager 13/13、0 skip**，含普通安装、跨进程真正启动与 child/header、bundle 开关/移除及合成 0.4.5/0.4.6 升级；两合成包、development 包与 synthetic TAR 仅为 fixture，不是 accepted archive。两 SDK roots 均显式提供且前后 manifest/native bytes 不变；12 个 pinned-source ingestion 全通过且原 source 不变。仅 6 个公共 UI-slots 缺失场景 skip，不能称 GUI 通过。
- 新五资产及旧被拒候选五资产在 prepack/tarball/完整矩阵前后身份均未变。Node **24.17.0**、pnpm **11.8.0**、npm **11.13.0**、GNU tar **1.35**。公开机器记录见 [verification-0.10.0.json](<../dist/verification-0.10.0.json>)。该制品验收检查点形成于远端写入前；主代理收到全部 GREEN 后明确放行，后续实际发布与下载结果如下。

### 已发布与下载回验（不等于安装或当前 GUI 生效）

- [GitHub Release v0.10.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.10.0)，ID **433201727**，实际发布时间 **2026-11-03T20:49:28Z（北京时间 2026-11-04 04:49:28）**；draft=false、prerelease=false。在重新核对旧 main、tag/Release 原先不存在与 ancestry 后，以非 force atomic push 发布。
- 新 annotated tag **v0.10.0**：对象 **e466c12885a7f7bda3333df7f8f161827843cd8d**，准确指向已签收制品源 **8ec081d0375231278e151890aae51434d07bddca**。发布时 main 为仅追加验收文档的 **b2456e97ddcafdd366deaf3243da440aad5dbbf4**；其后本结果仍仅作 docs/verification 补录，不移动 source/tag 或重包。原用户主检出的 local main 与未提交内容未被 reset 或覆盖。
- 上传且仅上传同一 accepted 归档及 SHA-256、size、source-commit、pnpm-version 五资产；GitHub API 的五项 digest、size/name/state 与原件一致。归档 **500,162 B / 53bfd050d64f95f19045bd3ecb94d89057cdfde57e2df29e81a1476469f8d7f2**，完整 source sidecar 为 **8ec081d0375231278e151890aae51434d07bddca**、pnpm **11.8.0**。公开五项资产 ID/摘要在机器记录中，不公开私有日志或机器路径。
- 在另一全新私有 regular-disk 下载目录获取恰好五资产，无 clobber，**5/5 与 accepted 原件逐字节相同**。发行 lane 保持清洁 S2，对下载原件及四 sidecar 再跑 strict tarball：**80 source/lib build、184 files / 0 directories / 0 symlinks、19 targets、vendor 85 / 296,048 B / root70a937…** 及所有 source/bytes/type/mode/exports 通过。accepted 五原件与旧 rejected 五原件身份均保持不变。主代理又独立核对远端 refs 和 GitHub API 的 tag/source、五资产 ID/size/digest、非 draft/prerelease 与实际 URL。
- **未为本机安装**：生产插件清单、Profile patch 与 SDK 清单的三项基线指纹保持不变；没有生产 Profile/SDK/GUI 写入、服务重启、spill 清理或 npm publish。隔离 headless Manager 测试不是本机部署，SDK typed/render/nested 合成验证不是实际 LLM/PTC runner、图形 GUI、RSS 或 heap leak 已治愈证明。隔离工作树与私有证据保留审计，不声称物理删除。

早先设计文档检查为 218 个本地链接目标、0 缺失；那是文档阶段结果，不充作修复验收。原始日志、机器路径与会话/业务标识只留在忽略目录，不作为公开发行资产。

## 0.8.0 制品验收（2026-11-04，隔离工作树；已发布/未安装）

本版把 `mattpocock_delegate` 从默认模型面移出，但保留实现：插件 Config 新增 `delegate`，默认 `false`；只有显式 `delegate: true` 才注册该工具。默认模型面为 **7 个固定工具 + 条件 `mattpocock_audit`**；opt-in 后为 8 个固定工具 + 条件 audit。客户端仍声明 9 个 wire key，用于 opt-in delegate 与历史卡片，不把它冒充默认注册。没有新增模型工具、Remote 方法、存储域或强绑定写入口；native `subagent`/`subagent_fork`/`send_message` + `mattpocock_assign` 路径不变。

源码提交：`dfe03220f70249f983bb5bb957677b35303ab349`（分支 `release-0.8.0-delegate-opt-in`，基于 `2cfa692`）。工作树是 `/home/dev/dev/isolated/0.8.0-delegate-opt-in/dsh-mattpocock-skills`；验证在独立的 detached clean-source 工作树 `/home/dev/dev/isolated/0.8.0-verify/dsh-mattpocock-skills` 中重新构建并运行，未修改主检出、其他工作树或 vendor。

### 构建、测试与包门禁

依次执行并通过：

1. `pnpm install --frozen-lockfile --ignore-scripts`（pnpm 11.8.0）
2. `pnpm exec tsc -p tsconfig.json`
3. `chmod 755 lib/compatibility/cli.js`
4. `pnpm exec tsc -p tsconfig.client.json --noEmit`
5. `node scripts/build-client.mjs --out lib/client.js --declaration`：**278,167 B**，8 个浏览器安全私有模块，外部请求仅 `@deepseek-ai/dsh-client-ui-primitives` 与 React
6. `DSH_CONTROLS_HOST_ROOT=/home/dev/.local/lib/node_modules/@deepseek-ai/dsh node --test tests/*.test.mjs`：**978 项：775 通过、0 失败、203 skip**
7. `node scripts/verify-vendor.mjs`：beta/stable 各 27 Skills；vendor **85 文件、296,048 bytes**、root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`
8. 清洁源码提交上 `node scripts/verify-package.mjs --prepack`：**95 固定 + 85 vendor = 180** 个打包文件，构建 **76** 个 JS/DTS 产物

定向套件：`model-contract` **6/6**（默认 7 项且无 delegate；`delegate: true` 后注册；原 description/拒绝回归）；`client.test.mjs` **39/39**；`consumption.test.mjs` **24/24**；`native-executions` **9/9**；`native-execution-runtime` **8/8**。203 skip 仍是环境门禁/native host fixture，不是插件加载失败。

### 精确制品

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.8.0.tgz` 保存在 `/tmp/dsh-0.8.0-artifact/`：**468,578 bytes**，sha256 `d87b0aef6c354d2ddb2653c1122fc338bb13f4c586f4b724236be91b867bd311`，**180 成员**（95 固定 + 85 vendor），源码提交 `dfe0322`，pnpm 11.8.0，npm 11.13.0，GNU tar 1.35。打包使用 `npm pack`；`package.json` 仍保留 `packageManager`，并按本仓库 verifier 的既有规则仅去掉打包成员末尾一个 LF（源码仍保留恰好一个 LF），未改变其余成员、模式或导出。

精确验证命令：

```text
node scripts/verify-package.mjs --tarball /tmp/dsh-0.8.0-artifact/lmgatex-dsh-mattpocock-skills-0.8.0.tgz \
  --sha256-file /tmp/dsh-0.8.0-artifact/lmgatex-dsh-mattpocock-skills-0.8.0.tgz.sha256 \
  --size-file /tmp/dsh-0.8.0-artifact/lmgatex-dsh-mattpocock-skills-0.8.0.tgz.size \
  --source-commit-file /tmp/dsh-0.8.0-artifact/lmgatex-dsh-mattpocock-skills-0.8.0.tgz.source-commit \
  --pnpm-version-file /tmp/dsh-0.8.0-artifact/lmgatex-dsh-mattpocock-skills-0.8.0.tgz.pnpm-version
```

结果：source clean=true、commit 匹配、sha256/bytes/180 成员/模式/导出目标与 vendor 全部通过。`--prepack` 另行确认提交的 `lib/` 与同源码构建逐字节一致。

### 边界

- **没有安装**：未执行任何 DSH install、Profile 编辑、服务重启、GUI 变更或本机插件激活。
- **未 npm 发布、未本机安装**：已 push `main` 与 tag `v0.8.0`（指向 docs 验证提交 `3fa1d04`），并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.8.0)；未 npm publish，未执行 DSH install、Profile 编辑、服务重启或 GUI 变更。
- **默认模型面**：7 固定 + 条件 audit；delegate 只在显式 `delegate: true` 时注册。客户端 9 个 wire key 仅保留呈现能力；Remote 仍是 16 个方法。
- 完整记录见 `dist/verification-0.8.0.json`。

## 0.7.1 制品验收（2026-11-03，隔离工作树；已发布/未安装）

本版完成方案 A 的 C 阶段：owner runtime document 增加 `nativeExecutions`（一行一个 native child session，严格解析、旧文档缺字段按空数组），从 `agent/created`、`subagent/start|end`、`agent/disposed` 幂等写入；快照仅向 coordinator 返回最近 64 行，附带读取时 `activity`、`observed` worktree 与 `inferred` lane；工作树观测行增加读取时 `nativeChildren`（`created-tree` / `initial-cwd`，均 `observed`）。不新增模型工具、Remote 方法、存储域或强绑定写入口；`mattpocock_delegate` 仍是唯一强绑定创建者，S/nativeStops/owner 通知保持。native execution 事实的写入与工作树观测一样遵循 `extensionEnabled` 门控：管理关闭时不新增/更新，已有行仍可读，重新启用后恢复。

源码提交：`b8fe19ef2c9f46c0a5a1b111243accd3bcfc0971`（分支 `release/0.7.1-native-observation`，基于 `196cbfe`；该提交修正了原生执行事实的 `extensionEnabled` 写入门控，取代此前 `af2cf6f` 的 0.7.1 制品记录）。工作树是 `/home/dev/dev/isolated/0.7.1-native-observation/dsh-mattpocock-skills`；验证未修改主检出、其他工作树或 vendor。发布记录：tag `v0.7.1` 指向 docs 验证提交 `770b0e7`（docs-only 收紧）；验收 tarball 的源提交仍是 `b8fe19e`；[GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.1)。

### 构建、测试与包门禁

依次执行并通过：

1. `pnpm install --frozen-lockfile --ignore-scripts`（pnpm 11.8.0）
2. `pnpm exec tsc -p tsconfig.json`
3. `chmod 755 lib/compatibility/cli.js`
4. `pnpm exec tsc -p tsconfig.client.json --noEmit`
5. `node scripts/build-client.mjs --out lib/client.js --declaration`：**278,167 B**，8 个浏览器安全私有模块，外部请求仅 `@deepseek-ai/dsh-client-ui-primitives` 与 React
6. `DSH_CONTROLS_HOST_ROOT=/home/dev/.local/lib/node_modules/@deepseek-ai/dsh node --test tests/*.test.mjs`：**977 项：774 通过、0 失败、203 skip**
7. `node scripts/verify-vendor.mjs`：beta/stable 各 27 Skills；vendor **85 文件、296,048 bytes**、root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`
8. 清洁源码提交上 `node scripts/verify-package.mjs --prepack`：**95 固定 + 85 vendor = 180** 个打包文件，构建 **76** 个 JS/DTS 产物

新增/定向套件：`native-executions` 模块 **9/9**；`native-execution-runtime` **8/8**（含重复事件/热重载不增行、disposed 无 end、精确 cwd 关联、nativeChildren、delegate inferred lane、coordinator-only、S/nativeStops/通知回归、工具/Remote 数量不变，以及管理关闭时新增写入被抑制、已有行可读、重新启用后恢复；独立探针另行确认关闭期间的更新边也不写入，该边未单独列入这 8 个测试）；`client.test.mjs` **39/39**（含窗口与观测面板展示）；`consumption.test.mjs` **24/24**（含 native-executions 类别、协议行与 locator）；native-execution history capture 由 `native-execution-runtime` 覆盖。203 skip 仍是环境门禁/native host fixture，不是插件加载失败。

### 精确制品

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.7.1.tgz` 保存在 `/tmp/dsh-0.7.1-artifact/`：**471,954 bytes**，sha256 `326a4343794609baae07b36108b2096e4cc8a6633d11d127f4caded44ee1ed70`，**180 成员**（95 固定 + 85 vendor），源码提交 `b8fe19e`，pnpm 11.8.0，GNU tar 1.35。身份记录为只读；制品在验证后未再改动。旧 `af2cf6f` 制品/记录已被本制品取代，不再作为 0.7.1 验收依据。

精确验证命令：

```text
node scripts/verify-package.mjs --tarball /tmp/dsh-0.7.1-artifact/lmgatex-dsh-mattpocock-skills-0.7.1.tgz \
  --sha256-file /tmp/dsh-0.7.1-artifact/lmgatex-dsh-mattpocock-skills-0.7.1.tgz.sha256 \
  --size-file /tmp/dsh-0.7.1-artifact/lmgatex-dsh-mattpocock-skills-0.7.1.tgz.size \
  --source-commit-file /tmp/dsh-0.7.1-artifact/lmgatex-dsh-mattpocock-skills-0.7.1.tgz.source-commit \
  --pnpm-version-file /tmp/dsh-0.7.1-artifact/lmgatex-dsh-mattpocock-skills-0.7.1.tgz.pnpm-version
```

结果：source clean=true、commit 匹配、sha256/bytes/180 成员/模式/导出目标与 vendor 全部通过。`--prepack` 另行确认提交的 `lib/` 与同源码构建逐字节一致。

### 边界

- **没有安装**：未执行任何 DSH install、Profile 编辑、服务重启、GUI 变更或本机插件激活。
- **未 npm 发布、未本机安装**：已 push `main` 与 tag `v0.7.1`，并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.1)；未 npm publish，未执行 DSH install、Profile 编辑、服务重启或 GUI 变更。
- **C 已完成且不改变既有路径**：写入门控遵循 `extensionEnabled`（关闭时不新增/更新、已有行可读）；观察写失败只产生 health/unknown，不影响 native 事件、S、nativeStops、通知或工作树 binding；没有 `registerIntent/confirm` 或 `worktrees_*` 写入，binding 行数/字段不变。
- 工具面仍是 **8 固定 + 条件 `mattpocock_audit`**（客户端 9 个 wire key），Remote 仍是 16 个方法；`mattpocock_worktree` 描述只补充读取时 `nativeChildren` 的 observed 语义。

完整记录见 `dist/verification-0.7.1.json`。

## 0.7.0 制品验收（2026-11-03）

本版从 0.7.0 模型面移除 `mattpocock_execute` 及其 `executeManaged`/`executeNative` 路径，普通无绑定 lane 使用宿主原生 `subagent`/`subagent_fork`/`send_message`；`mattpocock_delegate` 定位为绑定式创建，准备的工作树作为初始 cwd，持久意图、实际 header 核对、binding（task/ticketIds）与 assign 保持。固定模型工具面为 **8 个固定工具 + 条件 `mattpocock_audit`**（客户端 9 个 wire key）。C（原生观察的读取时关联/账本补齐）明确未实施，仍待后续。

源码提交：`d2dd86ee5369b8d8efb4615edd937b27b95a28ab`（分支 `release/0.7.0-native-binding-first`）。验证在隔离工作树内完成，未修改主检出或 DSH Profile。发布记录：tag `v0.7.0` 指向 docs 验证提交 `ea08bdd`；验收 tarball 的源提交仍是 `d2dd86e`。

### 构建、测试与包门禁

依次执行并通过：

1. `pnpm install --frozen-lockfile --ignore-scripts`（pnpm 11.8.0）
2. `pnpm exec tsc -p tsconfig.json`
3. `chmod 755 lib/compatibility/cli.js`
4. `pnpm exec tsc -p tsconfig.client.json --noEmit`
5. `node scripts/build-client.mjs --out lib/client.js --declaration`：**275,486 B**，8 个浏览器安全私有模块，外部请求仅 `@deepseek-ai/dsh-client-ui-primitives` 与 React
6. `DSH_CONTROLS_HOST_ROOT=/home/dev/.local/lib/node_modules/@deepseek-ai/dsh node --test tests/*.test.mjs`：**958 项：755 通过、0 失败、203 skip**
7. `node scripts/verify-vendor.mjs`：beta/stable 各 27 Skills；vendor **85 文件、296,048 bytes**、root SHA-256 `70a9375e80b05d578f0329ff30d97ab7d08fef9c5a6a78a0df5dbfe986e5beb8`
8. 清洁源码提交上 `node scripts/verify-package.mjs --prepack`：**93 固定 + 85 vendor = 178** 个打包文件，构建 74 个 JS/DTS 产物

定向套件：客户端 **122 项：116 通过、0 失败、6 skip**（native activation/loader 环境门禁）；Host **37/37**。203 skip 全部是环境门禁/native host fixture（包括缺少 `@deepseek-ai/dsh-client-ui-slots` 的 activation 用例），不是插件加载失败。测试覆盖 native `subagent` + `mattpocock_assign` 单 child、native send 不重复、PTC 嵌套原生派发与状态注入、delegate prepared worktree 的 requested/actual cwd + ticketIds binding 与实际 assign、原生路径不写强 binding，以及移除 execute 后的 S/nativeStops/owner 通知。

### 精确制品

同一次 clean-source 构建的 `lmgatex-dsh-mattpocock-skills-0.7.0.tgz` 保存在 `/tmp/dsh-0.7.0-artifact/`：**463,589 bytes**，sha256 `cf4b87d8e1089f7a4437559e22646e15c0f045767e7d47eec2186f31bc0a3ea1`，**178 成员**（93 固定 + 85 vendor），源码提交 `d2dd86e`，pnpm 11.8.0，GNU tar 1.35。身份记录按设计为只读；制品在验证后未再改动。

精确验证命令：

```text
node scripts/verify-package.mjs --tarball /tmp/dsh-0.7.0-artifact/lmgatex-dsh-mattpocock-skills-0.7.0.tgz \
  --sha256-file /tmp/dsh-0.7.0-artifact/sha256.txt --size-file /tmp/dsh-0.7.0-artifact/size.txt \
  --source-commit-file /tmp/dsh-0.7.0-artifact/source-commit.txt --pnpm-version-file /tmp/dsh-0.7.0-artifact/pnpm-version.txt
```

结果：source clean=true、commit 匹配、sha256/bytes/178 成员/模式/导出目标与 vendor 全部通过。`runTarball` 本身不导入或执行 controls 入口；独立验证另将验收 tarball 解包后的 `lib/controls/index.js` 作为模块导入，确认 `resolvePolicy`、`WorkspaceControls`、`SessionInstruments` 可加载（解包目录没有 `node_modules`），这是独立 smoke，不是 `runTarball` 的内置步骤。

验收 tarball 的独立 controls smoke 命令（在 `/tmp/dsh-0.7.0-smoke`，不影响制品）：

```text
rm -rf /tmp/dsh-0.7.0-smoke && mkdir -p /tmp/dsh-0.7.0-smoke
tar --extract --gzip --file /tmp/dsh-0.7.0-artifact/lmgatex-dsh-mattpocock-skills-0.7.0.tgz --directory /tmp/dsh-0.7.0-smoke --no-same-owner --no-same-permissions
node --input-type=module -e "const m = await import('/tmp/dsh-0.7.0-smoke/package/lib/controls/index.js'); console.log(typeof m.resolvePolicy, typeof m.WorkspaceControls, typeof m.SessionInstruments)"
```

结果为 `function function function`，解包目录没有 `node_modules`。

过程说明：普通 `pnpm pack --pack-destination /tmp/dsh-0.7.0-artifact` 经 pnpm 11.8.0 manifest obfuscation 会删除 `packageManager`，与提交的 `package.json` 字节不一致，verifier 正确拒绝；随后以 `pnpm pack --skip-manifest-obfuscation --pack-destination /tmp/dsh-0.7.0-artifact` 在同一源码提交重新生成并验证，这也是仓库开发制品测试使用的命令。失败的那次制品未被当作验收制品，验证后的验收制品未再改动。

### 边界

- **没有安装**：未执行任何 DSH install、Profile 编辑、服务重启、GUI 变更或本机插件激活。
- **未 npm 发布、未本机安装**：已 push `main` 与 tag `v0.7.0`，并创建 [GitHub Release](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.0)；未 npm publish，未执行 DSH install、Profile 编辑、服务重启或 GUI 变更。
- **C 未完成**：本轮没有新增 native-observation 存储/账本，也没有声称 C 已完成；现有原生生命周期观测、nativeStops、S、工作树观测与 history 行为保持。

完整记录见 `dist/verification-0.7.0.json`；发布页为 [v0.7.0](https://github.com/LMGateX/dsh-mattpocock-skills/releases/tag/v0.7.0)。

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

在 prefix 中重建 alpha.1 根：`npm install --install-strategy=nested @deepseek-ai/dsh@0.2.1-alpha.1 <prefix>`，根即 `<prefix>/node_modules/@deepseek-ai/dsh`。nested 策略把传递依赖保留在各 owner 包的 `node_modules` 下，所以桥夹具会在临时只读 view 中把这些 owner 内包按 Node 可见名链接成一个根（[compat-host.mjs](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/tests/fixtures/compat-host.mjs>)，只创建 scratch 符号链接，不写任何已安装文件），让整套 alpha.1 闭包从单一根可解析。桥的原生入口字节仍钉住 SHA-256 `75b50b1c9452a6aeb10d1c859e3f45b05e062ea1fad6ed3bcd9577f2bc912541`。

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
- [解包启动矩阵](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/tests/packed-native-subagent.test.mjs>) **10／10**，从实际 development tarball 解包，在普通 Node 进程中以真实 SDK entryListSchema 读取 shipped YAML，公开 Loader／applyEntryPatches 激活真实包装器与不可变 Skills，无 registerHooks、NODE_OPTIONS 为空。覆盖 ACTIVE／PENDING stock 三次 HMR 保留、真正 A/B 原生 read／冻结 header／JSONL、原始 spawn／fork 前缀、热 send／公开 selective drain 后冷 send、第二独立 Node 进程恢复同一 child/B header、真实启动文档跨进程请求且管理 OFF、非法 volatile 配置最后有效值、坏资产不执行并保留实际普通原生 create/send。每个 worker 确认零模型调用与参考 SDK 原字节。
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
- [公开组合回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/tests/compatibility-composition.test.mjs>) **27／27**：实际 Loader／Fiber、导入前选择、热重载保留 ACTIVE／PENDING 原服务、用户覆盖及版本／源字节拒绝。兼容服务在该矩阵是标注的生命周期 fixture，不声称完整 Web 或 cwd。
- 另行以 plugin-owned 模式运行[真实 native cwd 矩阵](<../tests/host-cwd.test.mjs>) **10／10**，使用插件生成的兼容实现与同一宿主 peer，包含 A/B 读取、实际冻结／持久 header、原始 spawn/fork、冷恢复与省略继承；其中两项是既有离线补丁拒绝回归。无模型调用，不修改参考 SDK。
- [旧兼容记录回归](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/tests/managed-sdk.test.mjs>) **28／28**，相同所有者与 recipe 跨版本接续，creator 版本来源不被只读或幂等调用改写；外国所有者、身份／配方漂移、不合法版本和原有事务／备份／权限保护保持拒绝。版本样本由隔离 package fixture 模拟，不声称模拟版本已发布。
- [构建器](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/scripts/build-compatible-subagent.mjs>)两次确定性生成及 --check、语法／共享公开错误类型核对通过；[兼容实现](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/compatibility/native-subagent-0.2.1-alpha.1.js>) 136833 bytes，公开来源／变换摘要保存在[provenance](<https://github.com/LMGateX/dsh-mattpocock-skills/blob/v0.12.0/compatibility/native-subagent.provenance.json>)。原始 MIT 完整声明已保留，来源标识不是能力 getter。
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

> 2026-11-03 方案 A 更新：本段是当轮实施记录；delegate 的 `worktree` 仍作为强绑定入口保留，普通无绑定 lane 才走 lane 自建树 + observation。见[原生派发设计](<NATIVE_DISPATCH_FIRST.md>)。

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

