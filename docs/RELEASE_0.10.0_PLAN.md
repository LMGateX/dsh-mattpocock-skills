# 0.10.0 发行准备与精确制品门禁

> 状态：**计划，不是验收结果**。本轮只准备版本、包门禁和交接提交；禁止提前执行 prepack/pack、tag、push 或 Release。须收到主代理明确给出的“集成 GREEN + Standards/Spec 双轴审查通过”的候选 SHA 后，发行 lane 才继续后续阶段。

权威范围：[有界模型输出契约](<BOUNDED_TOOL_OUTPUTS.md>)、[设计](<DESIGN.md>)与[实施计划](<IMPLEMENTATION_PLAN.md#bounded-tool-outputs>)；[0.9.0 验收](<VERIFICATION.md>)只作历史基线，不回填本版结果。版本目标 `0.10.0`，继承已发布的 `0.9.0`。

## 1. 分工、隔离与第一轮停止点

- 发行 lane 只改 [package.json](<../package.json>)、必要 [包 verifier](<../scripts/verify-package.mjs>) 与版本/包清单相关的 [scaffold](<../tests/scaffold.test.mjs>)、[package-artifact](<../tests/package-artifact.test.mjs>)、[plugin-manager compatibility](<../tests/plugin-manager-compatibility.test.mjs>) 测试，以及本计划。不改运行时、Host、controls 源码、既有业务测试或 vendor。
- 用户指南、迁移、设计/实施状态与最终公开验证记录由主代理负责。发行 lane 本轮提交版本准备后交回 SHA 与路径并停止。
- 独立工作树从授权基线 `0fe04ce87debba923954e55eebc692993dde9031` 创建；依赖仅装在自己的工作树。所有测试使用新建、私有、非生产的 `DSH_HOME`、`TMPDIR` 和包缓存；不复用其他 lane 的 node_modules、Profile 或测试状态。
- 不改原主检出、生产 DSH_HOME、安装版 SDK、当前 Profile/GUI；不执行 DSH install、不重启服务、不清理旧 spill、不打 DSH 补丁、不派生更多 child、不 npm publish。后续允许的隔离 Profile 验证不等于给本机安装。

## 2. 最终包清单待汇总，不冻结历史数量

主代理已汇总两个新私有 Module：`src/controls/model-output.ts` 与 `src/model-tools.ts`；current lane 确认无新 Module。本准备提交据此在两份 closed allowlist 与包 manifest 加入四个对应 JS/DTS 成员，同步测试预期为 **80 JS/DTS、99 固定、85 vendor、184 总成员**。这些是已确认模块的清单预期，**不是实际构建或准确包通过的证据**；本树未包含实施 lane 源码/生成物，实际构建/成员枚举仍待集成。不得沿用旧 76/180，不得用常数加法代替逐路径及构建核验。

在集成后、冻结候选前，发行 lane 必须：

1. 从实际已集成源码与严格构建输出枚举每个新增/删除的 JS、声明与客户端产物；核对所有相对 import 都在包内闭合。
2. 显式同步 [package.json](<../package.json>) 的 files、verifier 的 `PACKAGE_FILES_ALLOWLIST` / `FIXED_PACKED_FILES` / 固定数量，以及两项包清单测试的模块与总数量断言。不改为 glob、动态放宽或仅核对数量。
3. 私有 Module 不新增 public exports；保留既有 closed exports、private、无 lifecycle scripts、peer/engine 与 vendor 完整性规则。
4. 分开记录实际 JS/DTS 数、固定成员数、vendor 数与总成员数；再次核验两份逐路径 allowlist、实际 lib 与最终 tar 成员一致。
5. 主代理把最终清单与新增源模块列入双轴审查；清单后改动同样需要重新审查和 GREEN。

## 3. 集成候选门禁（全部待执行）

- 收到不可变候选 SHA；验证它包含三条实施 lane、版本/清单、指南迁移与修复提交，并以本 lane 的独立树同步它。候选未明确、仍脏、审查有未解决 finding 或必要测试未跑时，不进入制品阶段。
- 在自己的树安装冻结依赖，严格 Host 编译、CLI 可执行位、客户端 noEmit 与闭合客户端构建；生成物由集成方提交后，重新固定 clean-source SHA `S`。不得把未提交 lib 当可发布源码。
- 对 `S` 执行完整根套件、目标有界输出集成测试及 vendor/provenance 验证；列出 pass/fail/cancelled/skip 与 SDK 版本、环境门禁。缺失的必要 SDK 场景是未验证，不以 skip 或 exit=0 冒充通过。
- 必须有真实插件工具 execute 的 typed value 和 render 证据：读/详情/audit <= 65,536 bytes，写回执/插件错误 <= 8,192 bytes，覆盖默认七工具、条件 audit 与 opt-in delegate、直接/PTC 路径、300 次读取、授权/版本失效、partial/unknown 与通知/捕获故障。私有 formatter 测试不能代替此项。
- 在未打本次补丁的受支持宿主公开契约上核验，无宿主/SDK/Profile 修改作为通过前提。源码 fixture、无监听 headless 与实际 GUI 证据分开；本次不验证当前 GUI 生效。

## 4. 一次 accepted archive 与精确验证（全部待执行）

1. 保持 `S` 清洁，运行 `node scripts/verify-package.mjs --prepack`，保存 source clean/commit、pnpm pin、独立 scratch-build 字节比对、vendor 与最终成员结果。
2. 在仓库之外创建新的 mode-0700 制品目录。只构建一次 accepted archive；沿用已核验工具链的 `npm pack --ignore-scripts --pack-destination <artifact-dir>` 路径，记录 npm 与 GNU tar 版本。不得使用会删除 `packageManager` 等字段的 packer 结果来放宽 verifier。
3. 立即写下列五项资产并核对；全部设为只读：

   | 资产 | 内容 |
   |---|---|
   | `lmgatex-dsh-mattpocock-skills-0.10.0.tgz` | 唯一 accepted archive |
   | `lmgatex-dsh-mattpocock-skills-0.10.0.tgz.sha256` | SHA-256，命名同目录该归档 |
   | `lmgatex-dsh-mattpocock-skills-0.10.0.tgz.size` | 精确字节数 |
   | `lmgatex-dsh-mattpocock-skills-0.10.0.tgz.source-commit` | 完整 clean-source SHA `S` |
   | `lmgatex-dsh-mattpocock-skills-0.10.0.tgz.pnpm-version` | 实际 `11.8.0` |

4. 在仍为 `S` 的清洁源码树调用现有 `--tarball` 模式，提供上述四个 identity-file 参数；验证摘要、字节、所有路径/类型/模式、源与解包字节、导出目标、vendor、禁止成员及独立生成物。只允许打包 manifest 末尾一个 LF 的既有归一化；任何其他差异停下，不改包修补或重建冒充同一制品。
5. 后续全部精确包测试通过 `DSH_CONTROLS_TARBALL` 和 `DSH_CONTROLS_TARBALL_SHA256` 接受该只读原件的校验私有副本，验证前后 identity/hash 不变。不以测试内默认 `pnpm pack` 的源码 fixture 代替 accepted archive。
6. [plugin-manager compatibility 测试](<../tests/plugin-manager-compatibility.test.mjs>) 的 before hook 还会打两个 synthetic upgrade 包；它们不是 accepted archive，须单独记作 fixture。没有 SDK 根的本轮准备测试会全部 skip，不构成 PluginManager 通过。
7. 公开记录只保存脱敏计数、工具链、源 SHA 与精确包 identity；原始日志/会话/机器路径留在隔离目录，不作为公开 Release 资产。主代理追加本版验证，不改历史版本数字。

## 5. 发布与下载回验（全部待执行）

- 仅在主代理明确确认候选和精确包门禁全部 GREEN 后进入远端写入；仓库固定为 `LMGateX/dsh-mattpocock-skills`。
- 写入前读取 origin/main 和全部相关 refs/Release；确认 `S` 的 ancestry 与 main 新鲜度。新远端提交要先交集成方同步/复验，禁止 force push 或改写别人的分支。
- 确认远端和本地均无 `v0.10.0`；新建 annotated tag，指向精确制品的源 SHA `S`。文档验证提交若在 `S` 之后，明确分开其 SHA，不把它写成制品 source。不得覆盖/重打已有 tag，既有 Release/资产不删除、不 clobber。
- push 经确认的 main 与新 tag，逐个比对远端 tag 对象、peeled SHA、main SHA。创建新 GitHub Release，上传上表五项相同只读资产；Release notes 明确 schemaVersion 2 迁移、实际门禁与未安装边界。
- 下载该 Release 的五项资产到新的隔离目录，逐字节比对、校验 SHA/size/source/pnpm 记录并再次验包；不得从源码再打包供上传或下载回验。
- 向主代理回传 Release URL、远端 refs、tag 对象/peeled SHA、资产列表和下载回验结果，分别报告 source/package/release 的完成状态。**不 npm publish、不安装本机、不改 Profile/SDK/GUI、不重启、不清理旧 spill。**

## 6. 第一轮准备检查（不是集成 GREEN）

- 冻结依赖已在本 lane 树安装，忽略 lifecycle scripts；Node `24.17.0`、pnpm `11.8.0`、npm `11.13.0`。没有复用其他树的 node_modules。
- 三项定向测试完整运行：**33 项，18 pass、2 fail、13 skip**。两个失败分别是新源码尚未集成的 root 模块数 `6 != 7`，以及新生成物 `lib/model-tools.js` 尚不存在；没有伪造源码或生成物来转绿。13 skip 是未提供显式 SDK 根，因此没有触发 before hook 打包或安装。
- 用 `--test-skip-pattern="exact package inventory|prebuilt allowlist"` 仅复核准备范围：**31 项，18 pass、0 fail、13 SDK skip**；另两项清单门禁未执行，仍须集成后完整重跑，不能用这个筛选结果宣布通过。
- `git diff --check` 通过。未运行 prepack、pack、精确 tarball、真实 PluginManager、当前 GUI 或远端写入。
