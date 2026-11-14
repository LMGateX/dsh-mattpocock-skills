# DSH 0.2.2-rc.3 适配与交付契约

## 授权、基线与非目标

所有者在 2026-11-14 明确认可 [RC3 检查](<DSH_022_RC3_COMPATIBILITY.md>)，要求先固定文档，在隔离环境与 subagents 完成开发／适配，push 并发版，**暂时不要为本机 DSH 安装**。本页是本批实施与验收依据；历史批次的本机安装许可不适用于本批。当前仅文档／环境准备，后续状态由 [VERIFICATION](<VERIFICATION.md>) 追加，不提前宣称完成。

基线是公开 main `abc3f13b6c87f16576bd35fd0cc54ead4a2fc84a`，产品源与 0.21.1 冻结源 `0cc34713a2f08be5782a5504904f20f12ef19c7c` 相同；目标插件补丁版 **0.21.2**。上游继续使用一次性取得的 [RC3 固定源](<https://github.com/deepseek-ai/deepseek-harness/tree/38a6a5c965aa99ab525161efb7cc5cf1fe62fced>)，不再拉取或修改它。允许在全新临时前缀安装精确 RC3 SDK／同版公开 Client 补包，核对 provenance／SRI 后作验收。临时环境不等于本机已有 SDK 或 Profile。

不改共享 SDK／已有 Profile／当前 GUI，不自动重启或启动替代服务器；不安装本机插件／DSH、不 npm publish，不 force push／移动旧 tag／覆盖旧 Release 资产。不写生产业务数据、启用管理／推荐支持、迁移／清理记录或扩大 cwd／Git 多根权限；vendor、channel、provider precedence、模型工具请求、Remote／持久 schema 与当前消费前沿保持。

## 1. C：默认目录与计数适配

### C1 目录新字段

合法 continuable／external direct-child catalog 行允许 RC3 可选 `name`；验证已知字段类型，不把合法新字段转成 invalid diagnostic，也不放弃畸形／未知 mode／来源失败的诚实覆盖提示。保留历史无 name 行、one-shot/external 处理、直接目录每节点一次的预算与合并，不改走每次读取整树枚举。UI 主名称仍取 `projectionValues.subagent.label`，不迁成 parent catalog.name。

### C2 冷祖先与实时运行归属

S 必须覆盖 owner 子树里所有真正在跑的本地子代理，不能因创建祖先 cold／退出而漏计后仍报 known。实时执行仍仅取 exact live Agent.status；idle resident、external、其他 owner、普通 Session fork 不计入。root owner 的可信 runtime-tree 成员事实与 durable creator 父链分别解释，不能把同树的 sibling 自动算作某个中间 owner 的后代。

只使用实际加载的公开宿主 Interface，优先无 IO 的 live tree／已验证事实；维护相关 owner freshness、同 id Agent／root／service 替换／卸载、创建退出／冷唤醒与热重挂的即时失效。每次普通 read 保持 O(live agents) 内存工作，不新增长历史扫描、逐后代 SessionQuery 或无界 listDescendants，也不增加 timeout／TTL 掩盖缺口。

证据不全、seam 拒绝或无法证明某 live 子代理归属时，返回可证明运行下界与 explicit unknown，不把未知当 0／完整。S 的程序归属仅用于执行事实／计数，**不**授予任务／business ACL／cwd／worktree binding 权限。depth 的 direct＋deeper＋unknown 恒等于 used；无法测量的冷 creator 边距进入 unknown，不伪造深度。旧服务缺新 seam 的安全降级保留；已有 nativeStops、runId 去重、durability frontier、取消与通知语义不退化。

公开源核对后的 Adapter 固定为：实际服务暴露 `rootOf(exact live Agent)` 时，以其同步返回的 exact registry root 补足 root owner 的 runtime-tree成员；普通fork／非subagent仍排除。rootOf缺失沿旧受证父链路径，rootOf存在却拒绝／服务或root身份不一致时不悄悄回退完整。对于非root owner，rootOf只可排除不同tree，不能把同tree兄弟纳入；同tree而冷creator路径不闭合时返回下界／unknown。该事实不得进入business authorization。Runtime A→B live-cut／freshness必须覆盖这些新增计数依赖，无法可靠复用即保守不复用，不让缓存隐藏root／service／Agent替换或晚到running。不得以版本字符串冒充运行能力。

## 2. A：可选 delegate activation 适配

RC3 消费顶层 parent／prompt／cwd／maxDepth，RC1 消费旧 request 容器。保留最低声明 `engines.dsh >=0.2.2-rc.1`／Node `>=24.9.0`；本批验收 runtime 为精确 RC3，不为此重启旧 SDK。旧参数格式通过明确公开 seam 的 contract fixture 回归，不把它写成旧 SDK 运行实测。安装声明不等于所有未来版本已验证。

创建只调用一次，不做“先错后重试”或 probe child；允许构造一个同时携带顶层 task 和 legacy request 的结构化输入，由两版已核公共实现消费各自字段，使用共享同一 parent／prompt／cwd／signal／reserved childId／delivery 值，不据函数名称或可选方法猜测调用格式。类型必须如实描述实际输入，不能仅用 spec:unknown 绕过编译。若公开实现不能接受该兼容表示，在落码前记录替代依据。

普通派发仍由宿主 native 工具拥有；delegate 仍默认关闭、显式 opt-in。保持前置与 effect 边界的实际 Agent／权限／canonical cwd 复验、durable intent／幂等、inbox acceptance、binding／assignment 独立结果，未确认时不伪造 confirmed，不因迟到／部分成功重建第二 child。

## 3. 预先确认的测试 seams

沿用 [运行读取契约](<PERFORMANCE_ACTIVE_READS.md#6-预先认可的-seams-与范围限制>)、[Host 接入](<HOST_INTEGRATION.md>)与既有原生 cwd／模型工具 seams；本批将目标宿主换为 RC3。下列 seams 随本次“认可检查结论并实施”的授权固定，不以私有类导出／反射 Map 或复制方法作为正式验收：

| Seam | 捕获与限制 |
|---|---|
| mounted Host＋createRuntime.readSession／readModelCurrent／Runtime 消费 | 合法 named／历史／畸形目录、owner／fork／external 隔离、live running／idle、两层 cold creator 的首读与热重挂、depth／source freshness／拒绝／取消；受控来源不证明真实宿主生命周期 |
| 精确 RC3 原生 subagent／AgentRegistry／Session／public catalog＋mounted Host | 无模型 adapter 运行；创建多层 child、creator 退出而后代保留、冷唤醒／重挂与同树其他实例；核真实 S 归属／unknown 与资源卸载，不启动生产 Profile |
| mounted createContinuable／opt-in delegate＋真实 RC3 startActivation／workingDirectory | requested cwd 与实际 directory owner、reserved childId／single create／signal／权限与部分成功；header 单独只证明记录，不冒充有效目录 |
| legacy activation contract fixture | 同一 Adapter 输入兼容旧 request，省略 cwd／maxDepth不现造值；不声称完整 RC1 SDK 实测 |
| RC3 Host／Client strict/noEmit、原生 Renderer／SlotCore／gateway | 真实新版声明无旧SDK fallback、Client外部模块／注入／激活卸载／可选端点保持；离线浏览器或Node fixture不等当前GUI |
| source 与唯一精确 tarball | 完整回归、canonical lib／声明／vendor／manifest／包清单、正式headless双channel、公开消费者；安装到隔离Profile不授权本机安装 |

每个修复竖切先真实 RED 再 GREEN，保存失败／成功命令、输入与限度；不删安全断言、把 hardcoded RC1 断言简单关掉或用新增 skip 算通过。版本断言按本契约精确目标更新，缺同版 public-slots 前提的 skip 与显式补包结果分别报告。

## 4. 本地任务图与发布门禁

本页的工作单元是本批任务权威，不创建外部重复票或管理OFF仪器记录。集成基线／review fixed point 均为 `abc3f13`，每位 implementer 独立分支／worktree，报告前同步集成；同文件由串行 merger 合入，冲突解决后复测。

| 单元 | 依赖 | 工作与完成标准 |
|---|---|---|
| D 文档／隔离 | 无 | 本页、检查记录、DESIGN／PLAN先单独提交；保护旧dirty检出；环境／来源独立准备 |
| C 计数 | D、公开Interface确认 | C1/C2单writer竖切RED→GREEN，原生RC3＋mounted安全／性能／生命周期矩阵 |
| A activation | D、公开Interface确认 | 单writer新旧格式／真实RC3 cwd／单child／取消回归；delegate默认面不变 |
| V 集成／复核 | C、A | 源完整套件、strict、原生／headless／生成物，独立Standards和Spec必改关闭；不沿用历史1313数字 |
| P 冻结／精确包 | V | 冻结clean source／0.21.2、一次accepted pack＋四sidecars，source-bound strict与同包完整/原生/headless门禁；任何变更重钉source，旧候选不发布 |
| R push／Release | P | 非force推进main＋新annotated tag、五资产新Release、下载5/5逐字节及sidecars strict回验；公开完成摘要记录实测范围 |
| I 本机安装 | 本批排除 | 不调用现有Profile安装／active reload，不更新共享SDK或当前GUI |

实现者工树在成功集成／不再需要后按实际状态处置；不删除他人树或未确认dirty内容。保留可复核提交与本地原始证据，最终明确哪些树已清理／保留，不把业务完成当物理清理。
