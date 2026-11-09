# 裁决摘要、推荐支持预授权与原生子代理导航

> 2026-11-09 所有者已认可三项研究与推荐 B，要求先固定文档，隔离工作树/subagents 完成开发测试，push、发版并为本机安装。本文与 [DESIGN](<DESIGN.md>) 是本批实施契约；[研究](<COLLABORATION_FOLLOWUP_RESEARCH.md>)保留发现和方案比较，不再决定当前授权。当前为 D 阶段：产品语义已接受，技术表征/API 附录需冻结提交后才可实施。

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
- 开启界面明确显示当前主会话任务组与到期时间；建议 1/4/8 小时预选，默认 8 小时但必须显式开启。刷新不续期，后台使用真实时钟检查到期。正有限期限的机械限制在技术附录冻结，不猜“今夜”绝对时刻。
- 只对 recommendation 严格等于唯一 options key 的新项给支持；自由文本/label 仍可显示，不能猜、模糊匹配或解析业务含义。理由可放背景，不强迁旧记录。
- 有效采用后明确 pending=false，显示“按预授权策略选择”，真实采用作者仍是 agent；来源保留真实授权者、策略/源修订与精确选项。保留原 awaiting/result/references/任务约束，不默认新建 await，不推断任务完成。
- 候选不是可永久重用的权限令牌。采用时重验当前策略、源 decision 修订、business CAS、实际 assignment、推荐仍明确且引用范围仍受权。真实人工答复先提交则旧采用冲突，不无声覆盖。
- 关闭/到期阻止尚未采用候选的新采用；已采用不倒退、不删来源，不承诺撤回已执行副作用。显示开关不产生/撤销授权；管理/pending OFF 不隐式启用，保留旧记录合法收尾。
- 旧 operationId 重放返回真实旧效果/当前受权修订，不因策略关闭改载荷指纹，不重复采用；存储 unknown/投影失败不能伪装成功或重执已写业务动作。
- 有效采用结果与必要执行约束沿原任务文档/有效上下文承接；不批量修改 included/excluded，不用 awaiting 常驻缓存替代持久来源。

## 3. 用户入口与生命周期

- 裁决展开区有就地 switch、范围/到期、保存中/失败/失效状态；0 待答时也能主动配置。
- 独立设置入口提供同一 owner-instance 控制，不另存全局/浏览器副本；无可核验会话上下文时明确不可配置/需要选择会话，不猜 owner。
- 切换 session/真实实例、caller/grant/scope 变化清理旧草稿/在途结果，保存不跨会话；健康刷新保留合法阅读和 CAS 草稿。
- sessions 增强注入负责有界导航 port 的安装、撤销及重渲染；无 service/method 基础注册继续，旧点击立即失效，不捕获永远 null 的闭包，不靠 ctx.get 绕服务生命周期。
- 点击仍检查 mounted session、当前合法快照/显示、真父链和当前可解析 subagentAddress。区分依赖/调用错误与能力真的不存在，不把所有错误归咎宿主。
- 标题优先宿主持久 title，未取得时可用宿主 displayTitle/label/短 id；技术详情可核对来源，不另持久化副本。初始/改名/回退都需验收。

## 4. 预先确认测试 seams 与证明边界

| 公共 seam | 捕获 | 不证明 |
|---|---|---|
| core/Runtime 公开 policy/record/采用接口 + 实际 store/受控时钟 | auth、owner scope、CAS、epoch 新项资格、关闭/到期、持久 replay、候选≠采用、await/来源保留 | 真实模型一定执行或业务正确 |
| Host 真实 operator Remote + 模型 tool execute/typed/rendered/PTC/消费 | 不自开、严格 wire、8KiB receipt、同项采用回执、授权变化与恢复投影 | 用户现场运行已加载新字节 |
| 导出 React 真实挂载 + native SlotCore/标准 session props | 零/unknown/阅读/焦点、0 可达设置、真实 hook 标题/rename、异步 switch 保护 | 实际用户已看到或模型已消费 |
| 真实 Cordis + 原始宿主 session controller/sidebarRight/resource/codec | 无注入 RED、增强依赖 GREEN、缺服务基础激活、真实 child/direct parent、retain/release 与卸载旧点击 | 合成数据是生产事实 |
| 隔离浏览器明暗/窄宽 + unchanged bundle | 可点击/可读/不抢焦点/无异常网络与错误 | 当前 GUI 自动更新 |
| source + 同一精确归档 + 双宿主类型/完整回归 + 官方安装 seam | 交付字节、兼容、source-bound 和安装流程 | 服务已重启/页面已刷新/策略已启用 |

每竖切先在真实调用 seam 看见 RED，再最小 GREEN；不改编译字符串、不测私有 cache、不以普通对象 ctx 代替真实 Cordis 生命周期。缺失真实宿主 fixture 的旧 skips 需额外精确 fixture 验证；新关键测试不得 silently skip。完整回归保留上一轮恢复稳定性防线。

## 5. 技术表示/API 冻结附录

此附录尚待独立后端/客户端设计核对后填写并提交；未冻结前不实施。本附录必须确定受认证 owner 策略 Remote、策略/epoch/候选/采用持久位置与版本、模型严格请求与小回执、公开投影/消费、并发顺序及旧端兼容。

## 6. 发布与本机安装

按 [实施计划](<IMPLEMENTATION_PLAN.md>)的 D→B/U→V→R→I 依赖推进；每位 implementer 独立 branch/worktree，交付前同步 integration，串行 merger 合入，独立 Standards/Spec 必改关闭。

最终只分配新版本；冻结 clean-source 和唯一 tgz，严格 source-bound/闭合图/双宿主/精确包验证，非 force push、新 annotated tag、五资产 Release 和下载逐字节回验。通过后将同一制品经官方 PluginManager 安装到本机 Web Profile，保留备份/回滚和版本/字节核验。安装不自动启用管理或推荐支持，不迁移旧记录，不改共享 SDK，不 npm publish、不覆盖旧 tag/资产、不擅重启当前服务；安装、HMR 激活、页面刷新和现场可用分层报告。
