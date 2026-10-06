# 公开安全的源码与开发交付验证摘要

本页记录合成数据、隔离 SDK/存储和公开接口上的机械验证，不公开原始用户/会话或本机环境记录。源码修复不等于部署、发布或绝对无缺陷保证。

## 发布版本与上游来源

插件发布版本为 `0.4.1`；上游来源仍钉住分发版本 `v0.3.0` / Skills `v1.3.1`。插件版本、Skills 分发版本和 DSH 宿主版本相互独立，不移动既有标签。公开 Release 资产仅包含经过 verifier 检查的发行包、制品身份与脱敏验证摘要，不上传本地原始日志或开发收据。

## 本轮源码收尾：Root 边界与精确制品输入

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

失败发生于已加载兼容服务时关闭整个 bundle：真实 SDK 返回 applied，但移除兼容载体并重挂 stock，改变服务身份。Standards 复审另发现 wrapper 与准备观测对完整 provenance 字节的接受不同，尾随空白测试已证实 RED。随后以公开根 Fiber 生命周期和完整 provenance 摘要实施修复；关闭结果以以下真实服务的移除／重挂／消息续用／shutdown、普通安装更新及全量结果为据。合成 `0.4.2`／`0.4.3` 是私有临时测试 manifest，不是源码版本或已发布版本。共享 SDK、当前 GUI 和 Profile 未改变。

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
DSH_CONTROLS_HOST_ROOT=/absolute/sdk node --test tests/*.test.mjs
DSH_CONTROLS_HOST_ROOT=/absolute/sdk DSH_CWD_IMPLEMENTATION=managed node --test tests/host-cwd.test.mjs
DSH_CONTROLS_HOST_ROOT=/absolute/sdk DSH_CWD_IMPLEMENTATION=plugin-owned node --test tests/host-cwd.test.mjs
node scripts/verify-vendor.mjs
# Only from clean committed source; does not publish or install:
node scripts/verify-package.mjs --prepack
```

将 `/absolute/sdk` 替换为操作者已核验的实际 SDK 绝对目录。原生 cwd/管理器 probe 只准备隔离副本，不修改所提供的参考安装。最终 tarball 单次构建后保存只读 size/SHA256/source commit/pnpm identity，并用现有 verifier 精确核对；外部制品记录与本页摘要范围不同。
