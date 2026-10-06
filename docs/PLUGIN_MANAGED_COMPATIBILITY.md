# 插件自管兼容支持：交付约束与接入核对

状态：单包入口和用户流程已实现并通过真实 SDK 的隔离安装／更新／移除及启动回归；最终 clean-source 开发制品验收在收尾中。本文不声称现有 Release 或当前安装包／GUI 已生效。

## 当前源码进度与验收边界

当前未发布开发源码已将版本固定的[兼容实现](<../compatibility/native-subagent-0.2.1-alpha.1.js>)、[公开来源与变换记录](<../compatibility/native-subagent.provenance.json>)、[真实包装入口](<../src/compatibility/native-subagent.ts>)与[只读启动准备观测](<../src/compatibility/readiness.ts>)纳入精确文件／exports 清单，并通过[编译后启动选择器](<../src/compatibility/composition.ts>)生成公开 bundle 覆盖。这不是现有 Release 或当前安装能力。

- 兼容实现保持完整原始 manager／activation 语义，只应用已审阅的首次 cwd 变换、共享公开错误类型及只读来源标识；来源标识不是能力 getter。开发构建器不修改 SDK，普通用户不需要运行它。
- 独立运行既有[真实 native 目录与续用测试](<../tests/host-cwd.test.mjs>)的 plugin-owned 分支：10／10 通过，包括实际 A/B 文件读取、持久冻结 header、原始 spawn/fork 与冷恢复；其中两项仍是旧离线补丁拒绝测试，不把它们算成插件目录行为证明。无模型调用。
- 上轮[公开 Loader 组合测试](<../tests/compatibility-composition.test.mjs>)：35／35 通过。覆盖真正启动的唯一选择、首次安装与反复热重载保留已有 ACTIVE／PENDING 服务、用户覆盖、源版本／字节检查及导入前决策。兼容服务在这组测试中是明确标注的生命周期 fixture，不冒充目录行为或完整 Web。
- [旧管理器升级回归](<../tests/managed-sdk.test.mjs>)：28／28 通过，跨版本相同 recipe 维护保留 creator 来源，错误 owner／schema／recipe／SDK／目录与不合法版本不授予写权限。版本模拟使用独立 package fixture，不声称实际发布过模拟版本。

前轮正式包装与原配置桥接完成：当时实际 Loader／native 13／13 回归，maxDepth／maxActiveSubagents 数值及 !!js 通过原生公开 schema，在原 disabled 行的同作用域／身份下解析；非法更新保留最后有效整组限制，不重挂载服务。资产／metadata 错误在导入前拒绝兼容实现并使用实际原生构造器，不伪造来源或能力。

前轮只读准备观测 74／74 与 Host 启动 14／14 回归通过：公开 Loader／Entry、launch/base/profile/plugin-own native realpath、固定版本／原字节、包内 export／wrapper／资产／provenance 身份吻合才称下次实现准备就绪；从不求值 Entry.disabled 或读取私有选择缓存，不导入／构造／写 SDK。已接到真实 Host mount；当前能力 true／unknown 优先，下次准备与当前启用不混同。未来操作配置未验证，ready 不是下次成功启动保证。

最新真实 Plugin Manager／pnpm 安装、连续合成升级、整个 bundle 关闭／重启用及实际卸载矩阵 9／9 通过。采用真实默认 base／Web bundle 组合与 app.boot／Include／SDK 公共 PluginPackages 解析，末层只禁用不相关监听／模型插件，不是完整 Web／GUI 激活。根 Fiber 持有真实 native manager，载体移除不更换已有服务；公开创建事件仅阻止同一已核验 tree／服务域的 canonical stock 新构造。实际原生包装回归 15／15、解包矩阵 11／11 覆盖三次 unpatch／恢复、冻结 B child 热续用、包实际移除、次进程 stock 选择及根 shutdown 排空；新增 provenance 完整字节摘要拒绝语义不变的尾随空白。导入前组合 39／39、只读准备 81／81 验证 Root 服务域差异不会关掉普通 stock 或伪报 ready。本轮 Root 身份／映射可用性及每组 inherited key union ≤512 的导入前 gate 与准备观测已对齐，并保持已运行提供者 token 和根清理。最新组合 44／44、实际 native 16／16、普通解包 13／13、准备 81／81 和真实插件管理器 9／9 通过，最新完整根测试 709／709，0 skipped；Host／Client、同版 lib／精确 development 包、所有生成器及 vendor 通过。公开材料和冻结编译边界已独立复核，仍待完成 clean-source 最终制品门禁；完整 Web GUI 部署／激活另行决定。没有修改本机 SDK、安装当前 Profile 或 GUI，没有发布新版本；上述局部结果不能替代完整用户流程完成证据。

## 用户流程是交付目标

相关兼容补丁不是用户需另行下载、安装、升级或维护的第二个项目。补丁内容、SDK 身份／版本检测、准备、备份与恢复边界、升级维护以及错误解释都归同一个插件包负责。普通用户不应被要求寻找 SDK 目录、选择补丁版本或执行手工准备命令。

仅把 recipe 与 CLI 放进插件发行包，并在界面展示离线命令，不满足完整接入。界面名称和禁用原因变清楚，也不等于启用过程已完成。

目标体验是安装／升级插件后在插件页面启用所需功能；若需要进程重启，明确告知并由用户确认必要的中断，而不是要求用户管理 SDK 补丁。究竟通过已存在的宿主安装／启动接入，还是插件内部兼容适配完成，必须由实际接口和回归证据决定，不能虚构 hook 或保证普通重启已经具备准备能力。

## 现有实现事实

- [随包 recipe](<../compatibility/initial-cwd.recipe.json>)限定实际 SDK 身份、版本和五个文件的前／后镜像。
- [兼容管理器](<../src/compatibility/managed-sdk.ts>)具有校验、锁、备份、事务记录、准备与显式恢复；不能冒领外部补丁或覆盖漂移文件。
- [CLI](<../src/compatibility/cli.ts>)提供离线检查／准备／恢复／启动，但当前要求使用者传入明确 SDK 目录并声明 DSH 已停止，属于内部诊断／维护工具，不应作为正常 GUI 用户必经流程。
- [当前 Host 启动观测](<../src/compatibility/host-startup.ts>)先观察实际公共能力，再通过只读插件准备 callback 验证下一次实现；[启动设置](<../src/controls/startup-support.ts>)仍只保存下次请求。常规启动不调用旧 SDK 写入准备，兼容服务由同包公开组合接入。
- 旧事务记录已支持相同 owner／schema／SDK／recipe 与已核验文件／备份跨插件版本接续；ownerVersion 是有效 SemVer 的 creator 来源，不是当前版本锁。foreign／漂移／未知仍拒绝，不自动接管。

## 接入方案的验证要求

1. 自动识别真实宿主／插件身份，不用 cwd、PATH 猜测或模型输入代替可信目标。
2. 优先使用真实官方原生支持；已原生支持时无须额外补丁。旧宿主兼容实现必须证明子代理的首次会话头、初始消息及激活前已经使用指定 cwd，而非事后改路径。
3. 兼容支持的用户入口与插件设置一致；保存请求、准备结果和实际加载能力分别确认，不用伪造能力 getter、吞掉指定 cwd 或乐观成功掩盖缺口。
4. 不在运行中的共享 SDK 上贸然写文件。不默默停止服务；同 SDK 的其他进程、宿主管理器与启动参数属于实际部署事实，不能靠一个布尔声明假定已停或可重启。
5. 不反射私有 continuation／activation 字段来冒充公开接入；不无证据地复制替换完整子代理、消息路由或沙箱语义。
6. 插件升级须验证同一所有者、准确 recipe、原始／补丁字节、备份与事务状态；遇到不兼容、外部改动或未完成事务，应解释具体原因并保留证据，不自动回滚别人的文件。
7. 关闭功能不改变已有子代理 cwd、不删除历史，也不自动恢复共享 SDK。界面仍区分当前进程与下次请求；配置保存不增加协作业务裁决或 T/S 强制准入门槛。
8. 必须在隔离环境验证安装／启用／重启／首次 cwd／续用／升级／失败路径。源码测试、发行包、安装状态与当前 GUI 验收分开报告；未经实际集成验证，不称交付完成。

## 接入路径与历史候选

已核对实际宿主安装／启动接口，并选择同进程、插件自有兼容服务的公开接入方案。下列私有运行时／supervisor 接替是历史候选，不是当前实现或用户流程；未知宿主接口不虚构支持，也不将维护责任重新转给用户。

## 固定 SDK 的公开接入结论

以下结论限定于 `0.2.1-alpha.1`，公开源码引用固定为 recipe 记录的 `dsh-v0.2.1-alpha.1`；不是对其他版本的承诺，也不是实际 Web 启动验收记录。

| 公开契约／逻辑包位置 | 已核对的边界 |
| --- | --- |
| [package-manifest](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/util/package-manifest)／`DshManifest` | 声明包括 manifestVersion、bundle、profile、client；没有 `dsh.prestart` 或自动准备命令。client.immediately 是客户端注册屏障，不是宿主预启动。 |
| [plugin-manager](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/boot/plugin-manager)／`installBundle`、`runProfilePnpm` | 安装转发包管理器参数，并支持明确批准依赖构建脚本；不能假定所有安装都执行脚本，也不能把特定 `--ignore-scripts` 流程推广为默认 UI 的硬编码行为。批准脚本不证明共享 SDK 已停止。 |
| [app-boot](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/boot/app-boot)／`boot` | 有真实的宿主 prepare 回调：Loader 安装后、配置树挂载前执行。普通插件没有通过 manifest 注册此回调的入口；它也不早于所有应用／库模块导入。 |
| [cmdline](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/boot/cmdline)／`provideCmdline`、`AppExit`、`AppReady` | appExit 在配置树挂载前提供，可以早于 appReady 调用；它只请求有界退出，不承诺重启或返回退出完成证明。appReady 是成功启动后的通知。 |
| [CLI](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/apps/cli)／`runProfile`、`createProcessShutdown` | CLI 提供的退出控制器负责整树清理与退出，不是接替进程的 supervisor。插件／fiber 重载与真实进程重启必须区分；普通重启本身不执行插件准备。 |
| [app-boot](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/boot/app-boot)／`ProfileContext`、`ResolutionRouter` | profile 数据和配置写锁不证明所有共享 SDK 消费者已排除，也没有公开的 standalone／supervisor 所有权证明。真实 CLI 入口、无 IPC 或环境标记缺失不能单独证明安全接替权限。 |

### 插件内部私有兼容运行时：待验证候选，不是已实现能力

可继续研究由同一插件准备并管理私有兼容运行时缓存，在用户确认必要中断后的下一次真实启动中，由插件内部 bootstrap 接替到该运行时。准备、身份验证、维护与错误解释仍归插件；用户继续使用原有安装／设置／重启流程，不承担额外 launcher、目录选择或 CLI 准备工作。用户约束并不禁止插件内部私有运行时；这条候选也不能被描述成已经接通的公开重启 hook。

复制完整 CLI 与完整目标包、其余依赖只读共享，可以避免修改全局 SDK；但既有隔离 native fixture 仅覆盖独立服务装配，不证明完整复制 CLI／Web 接替。共享依赖保留原始真实路径的原生解析，可能同时载入原始与私有目标包；需验证实际模块身份、原生能力、完整 Web 组合及源依赖升级边界。缓存必须采用不会改写正在使用镜像的代际管理，而不是把共享 SDK 的离线要求换成未经证明的缓存布尔声明。

尚缺的验收包括：可信启动／supervisor 所有权、同 profile 接替排他性、首次加载与 HMR 区分、原始启动参数和环境来源保留、帮助／失败／首次初始化参数处理、stdio／信号／退出状态、旧进程实际退出后的接替成功确认，以及缓存失败、升级、并发和循环接替防护。未知宿主管理方式不能靠进程／环境启发式宣布受支持；源码可行性不等于当前 GUI 已成功接替。

### 同进程兼容服务提供者：已实现的接入方案

当前实现不复制或接替整个 CLI，而由插件包提供版本固定、来源可验证的兼容服务，通过公开 bundle 组合在真实启动时选择唯一服务提供者。它避免 SDK 磁盘改写及 supervisor 接替；真实 native manager 由公开根 Fiber 持有，移除 bundle 载体不替换该进程的 manager，真正 shutdown 仍排空原生图。当前能力来自真实 manager getter，来源标识仅用于诊断，不能冒称官方共享 SDK 已被修改。已通过默认 base／Web 层、实际 Plugin Manager／pnpm 与公共 app.boot 的有界无监听启动矩阵；这不等于完整 Web GUI 部署／激活。

公开组合边界必须准确：[include 的 patch 算法](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/vendor/include)中非 insert patch 的 name 是目标一致性断言，不是模块重命名字段。针对[基础组合](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-alpha.1/packages/bundle/base/cordis.patch.yml)中 id 为 `subagent`、模块为 `@deepseek-ai/dsh-subagent` 的行，直接填写插件模块名会因不匹配而跳过。可研究的公开形状是断言并禁用原行，再 insert 独立服务／启动选择器行；不能把重复 id 的内部折叠行为当作已保证的替换／重排契约。仅在最终启动组合确实禁用原行时，才能说原服务未挂载；其他消费者仍可能导入原模块的公开辅助函数，故这不证明单一模块身份。

禁用整个 bundle 后，下一次完整组合可移除其覆盖并恢复基础行；仅禁用插件的一个 Host 行不会移除整个 bundle 覆盖。后续 bundle、profile、home 与命令行 overlay 也可改变最终选择。[Plugin Manager 的 bundle 启停](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-alpha.1/packages/boot/plugin-manager)在 HMR 可用时会立即重组运行树，故“设置仅下次启动生效”不能自动防止首次安装／启用／停用替换正在运行的核心服务。必须先证明当前提供者保持不变、真正启动时唯一选择、可信 Host 启动快照与消费者激活顺序，以及 schema／错误类型／辅助函数身份、续用／清理／消息路由／权限与沙箱语义。未证明这些边界前，不发布覆盖补丁，也不宣称此候选已实现单一图或完整用户流程。
