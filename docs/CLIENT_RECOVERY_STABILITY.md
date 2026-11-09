# 协作摘要短暂恢复闪烁修复（未发布，本地隔离）

## 1. 接受范围与交付边界

2026-11-09，所有者认可诊断结果，要求：**先固定到文档；在隔离环境与 subagents 中完成开发和测试；暂时不要 push／发版，不要为本机 DSH 安装。** 本契约是本轮唯一细化入口，优先于上一批已完成发布／安装的历史授权。

- 从已发布 0.18.0 后的干净本地源码基线建立独立 integration 与单 writer 实施工作树，保留原检出的 dirty 和既有工作树。文档先独立本地提交，实施按竖切 RED→GREEN，集成后独立 Standards／Spec 复核。
- 允许本地提交、闭合生成物重建、隔离测试、只用于验证的唯一精确归档与源绑定校验。不推送任何分支／tag，不创建或修改 Release，不 npm publish；本批不分配新发布版本，不覆盖已发布 0.18.0 制品。
- 不安装或激活当前 Web Profile／DSH，不改共享 SDK／宿主实现，不重启、刷新或替换当前 GUI，不启动替代服务器，不改管理策略或生产业务数据，不加生产日志／遥测或真实模型试验。
- 不改 vendor、channel、provider precedence、模型工具／Remote wire／业务 schema、S/T 口径、通知策略或模板行为。工作树保留供后续检查与交付，不自动清理其他轮次资源。

## 2. 已知事实与未确定部分

用户现场：大部分时间正常，恢复提示通常短暂，出现间隔长短不一。此前真实导出 React 链的隔离诊断确认：

1. 相同身份的普通 full／summary 成功更新不必然触发恢复。
2. full 身份对象仅字段顺序变化，也能被整体 JSON 字符串比较误判为不同身份；summary parser 会重建固定字段顺序。
3. 同一 Session 的注入 callback／lazy handle 引用变化，可触发 React effect 释放／重建；最后一个 retain 短暂归零会清空观测并额外读取。实际 InputSummary 与 DecisionNotificationReader 同 commit 重注入也能复现。若另有稳定 holder 保持，控制组不触发。
4. 契约冻结时的内存候选只验证方向，不是正式源码、发版、安装或完整门禁证据；后续实施与复核进展单独记录，不追溯改写早期诊断。

这些是**客户端可确定复现的两条机制**，不是已证明现场每次闪动的唯一根因。模型消费 consumption-timeout 与浏览器读取不是同一请求；没有共享 DOM／RPC 时间轴，不互相归因。当前 GUI 的认证会话未由诊断工具接管，不绕过认证或获取用户凭据。

## 3. 修复原则与表示

### 3.1 语义身份，而非对象序列化偶然性

- summary／full 的共同阅读身份按既有 Session id、instrumentInstanceId、ownerSessionId、controlWorkspaceId，以及 caller.kind／principalId／sessionId 的明确值比较；对象 key 顺序不属于身份。
- 本轮不增加模型参数或持久身份。可使用模块私有、浏览器内的明确字段 tuple／helper；保留现有输入校验，不能靠忽略关键字段或非法值宽容来通过。
- 相同身份的健康更新不更换阅读区域，不清空用户选择／展开状态或抢焦点。真实 Session、实例、workspace、调用者、授权 scope／grant、显示开关或 registry 改变仍立即使用现有围栏，旧正文／计数／可操作链接不得穿越。

### 3.2 逻辑订阅寿命，不跟随偶然 callback／handle 引用

- 同一插件观察器域、同一 Session 的原生 slot 参数重注入与普通父 render，不应仅因新建闭包／lazy handle 而终止仍有效的读订阅、发布 unknown 或增加一次 full RPC。包括多个消费 seat 同 commit 更新。
- 稳定性必须绑定真实观察器域／Session；不能只忽略 React dependencies、把第一个 callback 永久冻结，或让旧 activation／registry 的结果与动作穿透新的域。实现可在插件私有 port／face 层提供最窄的稳定身份，但须保持 lazy cache 和旧 handle 重获当前 entry 的语义。
- 保留共享读、两个 summary flights 上限／batch／deadline、既有 TTL／LRU 与 last-release 行为；不新增永久 retain、无限 Session handle 表、卸载后后台轮询，或以延迟真正释放掩盖闪烁。真实最后卸载仍取消、清空，重挂载重新验证，不显示 stale-current。

### 3.3 真未知仍是真未知

真实失败／deadline、校验错误与身份／权限失效仍撤下旧业务正文、计数和动作；曾获显示许可时仅保留现有中性壳，首次未知不凭空授显示许可。明确关闭 display 不因后续错误而重新出现。**不通过保留旧数据、隐藏真实错误、拉长超时或降低校验解决问题。** 不修改宿主 slot 本身被卸载的行为，也不保证任意宿主卸载后视觉连续。

## 4. 已认可测试 seams

沿用已认可公开边界，不以私有状态、字符串替换或复制实现作为正式回归。

| seam | 必须捕获 | 不证明 |
|---|---|---|
| 真实导出 InputSummary→InputSnapshot→ObservedInputSummary 的 React 挂载／公开 RPC ports | 成功刷新与乱序完成、身份字段重排、跨路一致性、section／正文／动作／选择与焦点 | 用户当前认证 GUI 的真实事件频率 |
| 原生 slot 注册／注入＋真实 SessionObserverCache／SummaryScheduler，多 seat 同 commit 重注入 | 即时成功与受控 pending 成功；无额外 read／unknown；stable-holder 控制；registry 改变 | 宿主所有版本都以相同频率重注入 |
| 已导出观察器的 subscribe／retain／refresh／dispose ports | 最后卸载取消／不再轮询、重挂载冷读取、A→B迟到围栏、idle LRU／TTL与旧handle复用 | 真实网络永不失败 |
| 既有错误／权限／安全输入 mounted seams | full错误／summary错误／deadline、caller／实例／scope／grant变化、显示撤回；旧动作失效 | 模型端或 OS 通知送达 |
| 实际 browser module＋真实 React／宿主主题的隔离图形 fixture | 重注入期间逐帧可见内容／焦点／布局稳定，明暗与窄屏 | 生产页面、真实账户、真实数据已修复 |
| strict 类型、闭合构建／生成物、source与唯一精确归档 | 改动进入实际交付字节，旧SDK降级与发布包闭合 | 已安装／发布／运行当前新版 |

至少逐项覆盖：

- 健康重复刷新、两路不同顺序完成；只改变 instance 或 caller 对象字段顺序，以及两者同时重排；选中的 T／S／裁决阅读和键盘焦点不意外关闭。
- 同一 Session 的实际新 callback／handle 重注入：仅 input、与实际 notification reader／header 并存、多 seat 同 commit、存在／不存在稳定其他 holder；受控 pending 揭示短暂 unknown，不以立即 resolve 的批处理隐藏。
- 不同 registry／activation 同 Session 必须重新读取并围栏旧值；真实最后卸载／重挂载、Session A→B、迟到结果不串会话。
- full／summary真实错误、deadline、明确撤权／display关、instance／caller／grant／scope改变；未知不是0，原输入模板／草稿保护仍通过。
- 保留 RED 原始执行与最小回归，修复后同一命令 GREEN；独立检查生成图，正式回归不能运行内存候选或替换编译字符串。

## 5. 本地完成门槛

1. 文档先提交；一个明确 owner 的实施工作树由 subagent 逐切片开发；独立验证／复核不得并行写相同文件。
2. targeted mounted／native slot／observer、安全与完整 source suite；严格 Client／Host 类型和闭合生成物，环境 skip 单独解释，不把未运行当通过。
3. 冻结本地干净候选，唯一精确归档 source-bound 校验与相关完整回归，隔离浏览器检查；不写生产 Profile。
4. Standards／Spec 双轴复核关闭必须修复项；最后本地文档追加准确结果和剩余限制。
5. 汇报 commit／分支／工作树、测试结果、精确包摘要与未发布／未安装状态；保留后续复核所需工作树与本地证据。

## 6. 中间候选与独立复核记录

- 正式原生 slot 回归进一步确认同一类寿命缺口也存在于 summary 的首次注入：冷 entry 建立前的临时 handle 不等于随后 canonical handle。全量订阅稳定后，若 summary 仍按偶然引用重建，full RPC 虽不增加，summary 会归零、重新读取并清空阅读／焦点。已补同 scheduler／Session 稳定化与 summary RPC 断言；即时成功及受控 pending 都须通过，不能靠批处理藏住瞬态。
- 中间干净候选 `4d7025f45d9345a8e478af6a8d7d5aa4a7a49489` 已通过源侧定向 49 项、原生新增 13 项与精确归档新增 33 项、双宿主严格类型，以及隔离 input 图形检查。其完整 source 两矩阵各 1117 项、1108 pass／9 环境 skip／0 fail；其中 3 项缺少上游 Git fixture 的 skip 已用既有精确 pinned 源独立补跑通过，6 项旧 native activation 已在原生装配 fixture 各 6／6 补跑。此处只记录该候选已执行的门禁，不能代替最终候选重新验收。
- 独立 Standards 第一轮 0 必改；Spec 第一轮发现 1 项 P2：两个真实 registry 都预热 ready、Session／wire 身份完全相同，Details 已开的编辑器草稿／base 仍可能跨到新 remote。内存 public-port probe 对旧基线和中间候选均可复现，因此是本轮既有 3.1／3.2／4 节域隔离要求未闭合，**不是声称新增回归，也不是现场闪烁的另一个已确认根因**。
- 该中间归档已明确标为 superseded，原字节和 sidecars 保留作证；不得发布、安装或称为最终通过。修复必须围栏真正新域的整个 reader／draft／action 子树，并以同域新 handle 与健康刷新保留草稿作控制；设置检查中同类域属子状态也须检查。旧域不可操作，显式在新域重新打开后只使用新域 base。

当前阶段：独立 Spec P2 正由原单 writer 实施子代理按公开 mounted seam 先 RED 后修复；最终源码、生成物、唯一最终归档、双轴复核和交付记录仍待完成。
