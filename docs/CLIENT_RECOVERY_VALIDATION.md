# 协作摘要恢复稳定性：本地验收摘要

**2026-11-09：隔离开发、测试与独立复核完成；未发布、未安装到当前 DSH／Web Profile，未重启服务。** 本页是执行结果摘要，不是无需本地夹具即可公开复核的原始证明；原始 RED/GREEN、图形采样、测试日志和本机快照仅本地保留，不随公开仓库分发。

## 冻结点与范围

- 原基线：`54b915f5c1024380b63782ea107a1f4b0cdab791`。
- 先行契约提交：`f45729cda2d2d7583a13dcbf91efcec026e5cea9`，先于本轮代码实施。
- 最终代码／生成物／测试／唯一接受验证归档冻结：`80804ff3bfa45d0ccfa20083e6df5b321ba48591`。本页及契约完成记录为该冻结点之后的纯文档提交，不改变运行时代码、归档字节或 sourceCommit。
- 本地集成分支：`client-recovery-local`；实施与独立验证在各自单 writer 工作树，工作树和私有证据保留。未将改动合并进原 dirty 检出。
- 权威范围见 [修复契约](<CLIENT_RECOVERY_STABILITY.md>)；历史发布／安装授权不延续到本批。

## 已完成的修复

1. 既有 Session／instance／caller 的明确字段 tuple 比较代替对象字段顺序敏感的身份序列化。
2. full 与 summary 的逻辑订阅绑定真实 cache／scheduler 域和 Session。同域 slot 新 callback／lazy handle 不再重建有效订阅；summary 首次临时 handle 到 canonical handle 的交接也稳定。未新增强 Session handle 表、永久 retain 或延迟真正释放。
3. Details／设置检查的整个有状态子树同时受真实域与既有阅读／授权身份围栏。新 registry 或真实 caller／grant／scope 变化撤下旧草稿、动作和历史请求；合法旧响应迟到也不进入新投影。普通 business／viewer revision 更新及字段重排不误清草稿、焦点、pending history 或打开时 CAS。
4. 真实错误／deadline／撤权仍撤下旧正文、计数和动作；中性壳与首次未知显示许可规则未放宽。S 标题依旧走已有宿主 API，无新模型字段；模板、通知、wire、schema、vendor 与 S/T 口径未改。

独立复核发现的两个安全围栏缺口均在原基线存在，已作为本轮冻结契约的 partial 要求补齐；不称为本次新引入回归，也不称为已证明生产越权。

## 执行结果

所有下表均针对上述最终冻结点重新运行，不借用已弃选候选的 GREEN。

| 门禁 | 结果 |
|---|---|
| 集成 targeted：30 mounted＋13 native＋16 既有 UI | 59 pass／0 fail／0 skip |
| 唯一归档原字节：30 mounted＋13 native | 43 pass／0 fail／0 skip |
| 严格 Host／Client 类型 × alpha.4、RC1 | 4／4，exit 0 |
| 闭合生成图与包源绑定 | 11 modules，仅 React／primitives 外部依赖；167 regular files／0 symlinks，与冻结源／生成物一致 |
| 独立 SOURCE 图形：light／dark × 1440／390 | 32／32；204 帧，0 页面错误／0 意外网络请求 |
| 独立唯一 ARCHIVE 图形，同一未修改 runner | 32／32；205 帧，0 页面错误／0 意外网络请求 |
| 精确归档旧 native activation 装配夹具 | alpha.4 6／6；RC1 6／6；均 0 skip |

完整回归矩阵：

| 输入 | 宿主 | 总项 | pass | skip | fail／cancelled |
|---|---|---:|---:|---:|---:|
| source | 0.2.1-alpha.4 | 1127 | 1121 | 6 | 0／0 |
| source | 0.2.2-rc.1 | 1127 | 1121 | 6 | 0／0 |
| archive-input | 0.2.1-alpha.4 | 1127 | 1121 | 6 | 0／0 |
| archive-input | 0.2.2-rc.1 | 1127 | 1121 | 6 | 0／0 |

- 6 个 skip 为既有 native activation 测试缺少独立 slots 装配包，**不计为通过**；同一精确归档已在相应原生装配夹具各补跑 6／6。新增 native 13 项和所有新增 mounted 项均未跳过。上游 source-ingestion 的既有 Git fixture 也明确提供了精确 pinned 源，不再有该类 skip。
- archive-input 不是宣称所有旧测试直接加载归档：支持 bundle 的 43 个新增客户端测试执行精确解包字节，PluginManager 接收同一归档及校验值；旧 source-only 测试仍对同一冻结源运行。strict 包门禁另逐项绑定实际交付文件与生成物。
- 图形夹具使用未修改的隔离 RC1 shell／SlotRegistry／renderer、真实宿主 React／primitives／主题，但外部生命周期、RPC 和数据受控。图形输入框仅占位，不是用户当前 GUI、真实账户或原始 composer。重注入的正文／几何尺寸／焦点与两路 RPC 逐帧稳定；真实错误仍切中性壳。

## Standards

新鲜、独立只读 review：**0 必改；1 条非阻断启发式建议**。建议为两个测试夹具重复 DOM/global 安装与恢复，可将来提取小型 per-test helper；本轮明确 defer，避免为一般性去重扩大修复。未发现已记录标准的硬违反。reviewer 另独立执行 unchanged bundle 的 43／43，并检查提交生成图字节一致。

## Spec

另一新鲜、独立只读 review：**0 必改；0 建议；0 scope creep**。两个继承 P2 均未复现；另以公开 port probe 确认健康同域 pending history 不取消且合法完成可显示，草稿／textarea／焦点保留，保存仍用打开时 CAS，不因背景刷新升级。reviewer 独立执行 43／43 及相邻 cache／scheduler／UI 48／48。

**轴内汇总：Standards 1 项（最严重仅非阻断 possible Duplicated Code）；Spec 0 项（无未闭合必改）。不跨轴合并评级。**

## 唯一接受的本地验证归档

- 仅用于本地验证，明确标记 LOCAL-UNRELEASED；包内版本仍为 0.18.0，**不是已发布的 0.18.0 原制品**，未分配新发布版本。
- sourceCommit：`80804ff3bfa45d0ccfa20083e6df5b321ba48591`。
- 大小：535656 bytes。
- SHA256：`e27cfd4ce48741a104cd3f255676927932aa6c81245f4fd2c24708e16a5b12d3`。
- 闭合 client：414368 bytes；SHA256 `f2b4ebcc4f181a207ffa698354226f850874cbd0629d85951447ac8978ecd973`。
- 归档及 SHA／大小／sourceCommit／pnpm-version sidecars 只读保留；独立图形与 native 验证直接读取同一解包 client，未替换源码或另造测试包。
- 中间 4d7025f 与 0ffca73 归档另标 superseded，原字节保留作诊断；不再是交付候选。

## 交付边界与限制

- 未 push 分支／tag、未建 Release／publish；未安装、激活或改写当前运行的 DSH／Web Profile，未重启、刷新或替换 GUI／服务器；未改业务记录、管理开关或共享 SDK。隔离 PluginManager／原生夹具不等于当前 Profile 安装。
- Profile 配置／锁与已安装包、宿主清单／Client 的受保护摘要均未变；原 dirty diff 摘要与 tag／remote refs 摘要未变；原 GUI listener 的进程和 fd 未变。相关后台作业均已收集，浏览器与终端资源已关闭；工作树明确保留供复核，不自动删除旧树。
- 修复消除的是已确定复现的客户端误恢复路径，不证明现场每次短暂提示的唯一根因。真实网络、权限或 deadline 导致的恢复提示仍应存在；本轮没有认证用户 GUI／RPC 共享时间轴，不能承诺现场所有瞬态已消失。
- 私有过程保留原始 RED、探针设置失败及重跑；首轮 prepack 曾因 pnpm 自动依赖检查企图修复而被无 TTY 保护中止，未 purge 或安装共享依赖。后续完整命令明确禁用自动修复并通过；不把过程失败或环境 skip 改写为成功。
- 后续发布／安装或生产观测仍需新的明确授权。重新做源绑定验收须使用上述冻结 SHA 的干净工作树，不能把后续纯文档 HEAD 冒充原 sourceCommit。
