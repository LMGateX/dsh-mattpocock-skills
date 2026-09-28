# DSH 宿主版本兼容性核对

## 结论

**从 DSH `0.1.2-rc.1` 到 `0.2.0-rc.1`（含 `0.1.7-alpha.2`、`0.1.7-rc.1`、`0.1.7-rc.2`），本插件始终不需要修改运行时代码。**

Skill Provider 契约在所有已核对的宿主版本之间保持不变：`registerProvider`、`list`、`get` 的签名、`BUNDLED_SKILL_RANK`、运行时导出清单都没有变化。用新宿主的类型声明重新编译后，`lib/` 产物与最初宿主编译结果**逐字节相同**。

每次必须修改的都是 **`package.json` 中声明的 peer 依赖范围**。这是元数据问题，不是行为问题。两次具体表现不同：

- **`0.1.7-alpha.2`**：旧声明 `^0.1.2-rc.1` 不满足该预发布版本，安装会出现「peer 不满足」告警，但仍可安装。
- **`0.2.0-rc.1`**：宿主新增了**安装期硬门禁**，直接**拒绝安装** peer 不满足的插件（详见下节）。

## 0.2.0-rc.1 新增的安装期 peer 门禁

`@deepseek-ai/dsh-app-boot/lib/index.js` 在安装与启动时检查插件声明的 peer：

```js
for (const [name, range] of Object.entries(dependencies)) {
  if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
  const requirement = ['workspace:^','workspace:~','workspace:*'].includes(range) ? runtimeVersion : range
  if (requirement.trim() === '' || !semver.satisfies(runtimeVersion, requirement, { includePrerelease: true }))
    peers[name] = range
}
```

要点：

- **只检查**名字为 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的 peer。我们的 `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 不被检查，被检查的只有 `@deepseek-ai/dsh-skill`。
- 判定对象是 **DSH 运行时版本**（`0.2.0-rc.1`），不是 `dsh-skill` 包自身的版本；DSH 各包与运行时同版本发布，因此两者一致。
- 使用 **`includePrerelease: true`**，比 pnpm 默认的 peer 判定宽松。这也意味着 `^` 上限在该模式下会接受同一次版本线内的更高预发布版本。
- 不满足时安装被拒绝，并提示可用 `dsh plugin allow-version` 做**按精确版本的风险豁免**。本项目不使用该豁免，而是发布兼容版本。

## 核对范围与方法

核对过程只做只读与隔离验证：不改动本机正在使用的 Profile，不调用任何模型。

1. 用 `npm pack` 拉取两个版本的发布包，直接对比 `lib/types/*.d.ts`、运行时导出与 `package.json`。
2. 用新宿主的类型声明重新编译 TypeScript，比较 `lib/` 产物。
3. 用新宿主真实的 `Context` 与 `SkillRegistry` 运行既有插件契约测试。
4. 在隔离的 `DSH_HOME` 中把插件分别安装进旧宿主与 `0.1.7-alpha.2`，装载真实插件树，逐字节对比注册表报告。

## 版本对照

| 宿主包 | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 |
|---|---|---|---|---|
| `@deepseek-ai/dsh-skill` | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 |
| `@deepseek-ai/dsh-tool-skill` | 0.1.2-rc.1 | 0.1.7-alpha.2 | 0.1.7-rc.2 | 0.2.0-rc.1 |
| `@deepseek-ai/cordis` | 4.0.2 | 4.0.4 | 4.0.4 | 4.0.4 |
| `@deepseek-ai/schemastery` | 3.18.2 | 3.18.4 | 3.18.4 | 3.18.4 |

## 实际 API 差异

| 变化 | 影响 | 处理 |
|---|---|---|
| `SkillSummary.path?: string`；`SkillCandidate` / `SkillDefinition` 不再各自声明 `path` | 两者都 `extends SkillSummary`，我们同时设置 candidate 与 definition 的 `path`，仍然类型正确 | 无需改动 |
| `registerProvider(create: (control) => SkillProvider)` | 签名逐字相同 | 无需改动 |
| `list` / `get` 签名与返回类型 | 逐字相同 | 无需改动 |
| `BUNDLED_SKILL_RANK` = 600、`RUNTIME_RANK` = 250 | 数值相同 | 无需改动 |
| `dsh-skill` 运行时导出清单 | 完全相同 | 无需改动 |
| `dsh-tool-skill` 类型声明 | 完全无差异 | 无需改动 |
| `0.1.7-alpha.2` → `0.1.7-rc.2`：`dsh-skill` 类型、导出、`dsh-tool-skill` 类型 | 逐字相同 | 无需改动 |
| `0.1.7-rc.2` → `0.2.0-rc.1`：`dsh-skill` 与 `dsh-tool-skill` 的整个 `lib/` | **逐字节相同**（不只是类型） | 无需改动 |
| cordis 4.0.4、schemastery 3.18.4 | 与 `0.1.7-rc.2` 相同 | 无需改动 |
| cordis 4.0.2 → 4.0.4 | 新增 `Volatile` / `VolatileSnapshot` 类型导出，属附加性变化 | 无需改动 |
| schemastery 3.18.2 → 3.18.4 | `Schema` 增加第三个类型参数、`NoInfer`、`volatile` meta 等类型层调整 | 现有 Config schema 未改仍可编译 |

## Peer 依赖范围（本次真正的修复）

npm semver 对预发布版本有额外限制：预发布版本只有在比较符具有**完全相同的 major.minor.patch** 且带预发布标记时才算满足。实测结果：

| 范围写法 | 0.1.2-rc.1 | 0.1.5-rc.2 | 0.1.7-rc.2 | 0.2.0-rc.1 |
|---|---|---|---|---|
| `^0.1.2-rc.1`（最初声明） | 满足 | 不满足 | 不满足 | 不满足 |
| `*` / `0.1.x` / `>=0.1.2-rc.1 <0.2.0` | 不满足 | 不满足 | 不满足 | 不满足 |
| `… \|\| ^0.1.7-alpha.2`（0.1.0-beta.1） | 满足 | 满足 | 满足 | **不满足（被门禁拒绝）** |
| `… \|\| ^0.2.0-rc.1`（0.1.0-beta.2 现声明） | 满足 | 满足 | 满足 | **满足** |

现声明为 `^0.1.2-rc.1 \|\| ^0.1.5-rc.2 \|\| ^0.1.7-alpha.2 \|\| ^0.2.0-rc.1`，覆盖的版本线：

- `^0.1.2-rc.1`、`^0.1.5-rc.2`、`^0.1.7-alpha.2` 分别覆盖最初的 rc、npm `latest` 的 rc，以及整个 0.1.7 预发布线（alpha 与 rc）。
- `^0.2.0-rc.1` 覆盖整个 0.2.x 线。在门禁使用的 `includePrerelease: true` 下，`0.2.0`、`0.2.1-rc.1` 等也都满足。

没有既简洁又能覆盖任意预发布版本的单一范围写法（`*`、`0.1.x`、`>=0.1.2-rc.1 <0.3.0` 在 pnpm 默认判定下都不覆盖预发布版本），因此按发布线显式枚举。

`@deepseek-ai/cordis` 的 `^4.0.2` 与 `@deepseek-ai/schemastery` 的 `^3.18.2` 已分别覆盖 4.0.4 与 3.18.4，且不在门禁检查范围内，无需修改。

## 验证结果

| 检查 | 结果 |
|---|---|
| TypeScript 编译（0.1.7-alpha.2 与 0.1.7-rc.2 类型声明） | 通过；`lib/` 的 JS 与 `.d.ts` 产物逐字节未变 |
| 插件契约测试（新宿主真实 registry） | 95/95 通过 |
| 旧宿主 0.1.2-rc.1 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 新宿主 0.1.7-alpha.2 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 新宿主 0.1.7-rc.2 隔离安装并装载插件树 | Stable 25 / Beta 26 |
| 本机 Web Profile 在 0.1.7-rc.2 上的实时装载 | Beta 26 个 Skill、正文全部加载、0 诊断；实时调用 `tdd` 由本包提供 |
| 三宿主（0.1.2-rc.1 / 0.1.7-alpha.2 / 0.1.7-rc.2）注册表报告 | **逐字节一致**（Stable 与 Beta 均一致） |
| `0.1.7-rc.2` → `0.2.0-rc.1` 类型声明编译 | 通过；`lib/` 的 JS 与 `.d.ts` 产物逐字节未变 |
| `0.1.0-beta.1` 在 0.2.0-rc.1 上安装 | **被门禁拒绝**（记录为门禁行为，不是缺陷） |
| `0.1.0-beta.2` 在 0.2.0-rc.1 上安装并装载插件树 | Stable 25 / Beta 26；`implement-spec` 正文哈希与其它宿主一致 |
| `implement-spec` 调用权限 | `userInvocable: true` / `modelInvocable: false` |
| `implement-spec` 正文与资源目录 | 正文 SHA-256 `765b731e95338695c374b32eca8e78c64407fc8c404f046cb9a9b3bf50e435f3`；资源为 directory |
| 模型调用 | 无 |

装载插件树时，`0.1.2-rc.1` 由 app 的 `--help` 触发生效；`0.1.7-alpha.2` 的 `--help` 会在装载前提前退出，因此改用「无凭据环境下的一次运行」触发装载——宿主会在调用模型之前以 `MISSING_CREDENTIAL` 结束，插件注册仍然完成。

## 未验证事项

- `0.1.3`、`0.1.5`、`0.1.6` 等中间预发布版本未逐一验证。
- `0.1.7-rc.1` 未单独验证：其 `dsh-skill` / `dsh-tool-skill` 与 `0.1.7-rc.2` 同一版本线，本次直接验证了更晚的 `0.1.7-rc.2`。
- `0.2.0-rc.1` 的 Web/GUI 行为未验证；`0.1.7-rc.1` 的 `0.2.0` 线未逐一验证，仅验证了 `0.2.0-rc.1`。
- Web 场景下的 GUI 行为未在新宿主验证。
- 新宿主新增的插件相关能力未纳入适配器：顺序加载多个 patch 文件、声明免重载配置字段、`--dump-config-schema`、Profile 插件配置取代 settings.yaml。
- 本机正在运行的 DSH 已随后由 `0.1.7-alpha.2` 升级到 `0.1.7-rc.2`，本机 Profile 中装入的是 `0.1.0-beta.1`；两者都是兼容性核对完成之后的独立步骤，不属于核对本身的范围。

## 复现方式

```bash
# 拉取两个版本的宿主包并对比类型声明
npm pack @deepseek-ai/dsh-skill@0.1.2-rc.1
npm pack @deepseek-ai/dsh-skill@0.1.7-alpha.2

# 用新宿主依赖安装并重新编译，确认 lib/ 产物未变
pnpm install
node_modules/.bin/tsc --project tsconfig.json
git status --short lib/

# 契约测试（使用 devDependencies 中的宿主版本）
node --test

# 隔离端到端：对指定宿主版本安装插件并校验注册表。
# 制品绑定到某个提交，因此必须在那个提交的全新克隆中运行（工作树保持干净）。
node scripts/verify-isolated-dsh.mjs --source <clean-checkout> --tarball <tgz> \
  --sha256-file <sha256.txt> --size-file <size.txt> \
  --source-commit-file <source-commit.txt> --pnpm-version-file <pnpm-version.txt> \
  --evidence-dir <new-dir> --expected-dsh-version 0.2.0-rc.1
```

`sha256.txt` 记录的是绝对路径，因此校验和文件会拒绝指向别处的 `--tarball`；把制品放回它记录的路径即可。

`--expected-dsh-version` 是可选参数，默认仍为历史 Phase 4 门禁的 `0.1.2-rc.1`，原有语义不变。

## 不变更声明

本次核对不改动官方 Skill 正文、vendor 内容、来源固定信息与历史评估记录；Phase 5 三次活动 2 通过 / 1 硬失败、总体失败的结论保持不变。宿主升级不改变该结论，也不解除启用与发布门槛。
