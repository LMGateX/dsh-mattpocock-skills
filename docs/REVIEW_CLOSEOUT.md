# 协作扩展复审修复与公开交付契约

本轮修复已认可的四项机械缺陷，补公开接口回归测试并完成本地源码/预构建/开发制品收尾。不改变不可变 Skill、通道和优先级；T/S 仍为参考值；业务裁决及 Git 生命周期由 agent 与用户决定。源码提交不是安装、发布或模型行为认证。

## 产品验收

| 修复项 | 可观察结果 | 公开测试 seam |
| --- | --- | --- |
| 清理取消 | 真正删除 CAS 开始前收到取消，不再删除所选正文；CAS 已开始后保留实际回执，不制造回滚 | RuntimeFacade.historyAction、SessionHistory.apply 与公开存储 Adapter |
| 源写丢回执 | 实际删除调用已开始却没有可靠回执时返回 unknown/null；明确未调用删除时报告 false，并区分已确认的 lossless checkpoint 与尚未开始的 purge，不能把抛错当未删除 | RuntimeFacade.historyAction 与实际核心 CAS 的提交后 ACK-loss |
| 有效输入 baseline | 未送达、拒绝/改写、取消、有效 surface 移除后，从本次成功读取重装有界状态；同一真实 Agent/Session 当前输入已有同一 baseline 时去重 | 真实 Host waterfall、RuntimeFacade.preStep/postExecute、原生 Session.append/deriveMessages/surface replacement |
| 旧资源权限 | 已知 resource ID 不授予访问权；assigned child 不能读 coordinator-only 元数据，主会话合法读取保留 | RuntimeFacade.resourceAction 与真实作者/任务归属校验 |

测试仅用合成身份、任务和业务文本，不调用私有方法或模型；存储 Adapter 只控制公开读写时序，不伪造核心结果。先观察失败，再做最小修复。清理只涉及明确选择的仪器历史，不擦除原生聊天、Git 或文件系统。system context 保持短查询指针，不把 pre-step 之前采样的旧缓存当当前状态。原生工具附加上下文进入本次 accepted batch 可作同批去重，但不能作为下一轮已送达证明。

## 公开仓库的数据边界

此插件仓库公开。`package.private: true` 是 npm 防误发布配置，不是 GitHub 可见性开关。提交只包含公开安全的源码、合成测试、同版构建、必要用户/开发文档和脱敏验证摘要。真实用户数据、原始对话/会话记录、内部环境路径、原始研究探针/日志/收据等本地材料不进入公开 Git 或包。已有供应链 lock/provenance 和官方 SDK 补丁来源不改写。

原始本地研究和部署日志通过精确目录/文件类型规则留在本地；没有删除、改写或伪造历史结果。公开摘要不声称包含完整原始记录，旧 probe 不作为公开可移植测试入口。安全筛查不等于绝对无敏感信息证明，暂存区还需独立复核。

## 交付顺序

修复及公开回归 → 独立复审 → 全量/原生/严格构建及 byte/mode 校验 → 公开安全文件暂存检查与本地提交 → 清洁提交上的一次构建 tarball 与精确校验。包在仓库外独立目录保存，与源码 commit、pnpm version、size 和 SHA256 绑定；正式 verifier 不绕过 clean-tree gate。最终结果见[验证摘要](<VERIFICATION.md>)。

本轮不 push、发布、安装、改动现有 SDK/Profile/GUI 或重启 DSH。首次 cwd 功能的启停仍需重启；首次离线准备另遵循[操作指南](<../CONTROLS.md>)。
