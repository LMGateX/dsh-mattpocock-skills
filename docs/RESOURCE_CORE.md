# 资源生命周期深模块：接口、授权与保守恢复

2026-10-06。实现位于[资源核心](<../src/controls/resources.ts>)与[授权 Git adapter](<../src/controls/git-worktrees.ts>)。本轮仅实现插件仓库中的资源深模块和机械测试；不改全局 DSH、profile、运行 GUI、vendor，不安装/发布、不调用模型、不创建代理，不生成编译制品。工具、设置、窗口与 GUI 挂载由宿主组合方另行负责；模块通过不等于原生首次 child cwd seam 已存在。

契约来源：[工作区控制](<WORKSPACE_WORKFLOW_CONTROLS.md>)、[worktree 研究](<WORKTREE_ISOLATION.md>)、[固定树续用研究](<CONTINUABLE_WORKSPACES.md>)与[共享存储](<INSTRUMENT_RECORDS.md>)。执行、模型业务处置、物理资源状态保持三个不同事实来源。

## 1. 一个小 interface，两个 port

组合入口：

~~~ts
const { resources, program } = createResourceModule({
  storage, authority, git, lifecycle,
  // optional newId / now; production defaults randomUUID / Date.now
})
~~~

业务 port 不暴露程序事实写入口：

| 操作 | 行为 |
|---|---|
| list(principal, signal?) | 从真实 host caller 解析当前实例，仅列本实例 owned/borrowed 记录；所有项使用同一 ledgerRevision，并逐项重验授权；共享引用参与 mutex，但不泄露另一 owner 的业务文本 |
| read(principal, resourceId, signal?) | 授权读取资源、原始业务标签、持久引用，以及带 checkedAt / ledgerRevision / reasons / facts 的 actualCanRetire 计算结果 |
| create(principal, spec, signal?) | plan 读取验证 → durable 创建预留 → 授权 Git 创建 → 核验并发布实体；迟到失败保留预留并 quarantine，不回滚删树 |
| borrow(principal, path, signal?) | 验证已有 Git checkout，登记 borrowed claim，绝不获得树或分支所有权 |
| retain(principal, resourceId) | 明确保留现有树；不另建 cwd，不迁移已有 session；已经关闭 native 入口时拒绝隐式重开 |
| updateBusiness(principal, resourceId, business) | 保存自由 status / disposition / followup 文本与实际作者；无固定交付状态、无“已集成”前提，不释放执行/引用 |
| requestRetire(principal, resourceId, disposition) | 保存明确内容/分支处置请求和实际作者；不是删除，也不是新增 owner approval |
| actualRetire(principal, resourceId, signal?) | 先持久预留关闭阶段，再核验入口、全引用、全租约、Git/FS 身份与内容处置，满足机械条件才执行 |

principal 来自宿主已认证调用，不是模型凭证。ResourceAuthority.authorize(principal, access, resource?) 必须返回可信的 controlWorkspaceId / instrumentInstanceId / authorId。每次业务操作重新授权；资源 owner/workspace 必须匹配实际归属。借用其他实例的物理树要获得宿主已有 borrow 权限，并登记本实例自己的 borrowed 记录；不能直接读取或修改另一实例的记录。不同实例的物理 claims 仍参与全资源安全检查。

程序 port 仅供可信宿主：

- setReference(resourceId, reference)：核验真实首次/后续绑定，登记 bindingId / sessionId / instrumentInstanceId、active / queued / accepted-message / idle / cold / closed / unknown，以及 reusable / entryOpen。native session 和 binding 都永久绑定原资源；改个 bindingId 不能把同一 native session 迁到另一棵树。
- releaseReference(resourceId, bindingId)：只有宿主已经证明终止该持久引用后调用；closed 引用保留其身份，不能重新激活。Activation dispose、首轮结果、票业务完成都不等于这个证明。
- acquireLease({leaseId, instrumentInstanceId, kind, resourceIds})：writer 或 integration；多资源集合一次 CAS 全部获得或全部失败。未 release 的租约始终算 busy，恢复后也保留，不按过期时间猜测 idle。
- releaseLease(leaseId, instrumentInstanceId)：真实程序释放，核验原实例，幂等处理已释放 ID；不是模型业务完成。
- quarantine(resourceId, diagnostic)：宿主报告 late setup / 初始消息 / catalog 发布结果不确定，保留真实引用、树与 lease，禁止后续自动删除；初次 seam 缺失且未发生创建副作用仍报告 unsupported，不伪造成功。
- recover()：只在先前宿主执行已停止、使用 fresh domain handle 进行启动恢复时调用。保留 references / leases；把 interrupted creating / retiring 变成 quarantined。不是自动清理器，也不能与尚在执行的旧 host 并行使用。

宿主必须在 native 工作被接受/发布前登记引用，在执行写入前获取租约，并在真实退出后释放。不要把 program port 注册为模型工具；模型业务请求体不能携带 references、leases、entrance proof 或 authorId 来洗成可信事实。校验只涉及身份、归属、JSON 结构与技术安全，不做交付 correctness 审批。

## 2. durable identity 与原地续用

每资源保存 resourceId / controlWorkspaceId / ownerInstanceId。物理 identity 保存：

- repositoryPath / root / path、Git common dir 与 private Git dir、branchRef、初始 baseOid；
- rootIdentity / pathIdentity / gitCommonDirIdentity / gitDirIdentity，来自授权 runner 的 lstat 物理 token（fixture 是 dev:ino，不是路径文本）；
- ownership = owned / borrowed，独立 branchOwned；borrowed 永不拥有分支。

plan 创建时 private Git dir / private token / path token 为空；成功创建后必须完整。实体发布不能改变预留的仓库、根、路径、common-dir token、branch、base 或所有权。借用记录持有已有实体的完整身份。

同一 child 的相关补修通过原 durable binding 续用同一树；retain 不调用 allocator。业务“相关”或“完成”标签不会改变 cwd、原权限或 binding。已 closed binding 不在同一路径重建新基线冒充旧现场。

ResourceLifecycle.verifyInitialBinding(record, reference) 只验证真实宿主绑定，不创建或改写 header。宿主缺首次 child cwd seam 时返回 false，program 明确抛 unsupported；不能伪造父 metadata、session header、descriptor 或全局 process.chdir 来假装绑定成功。

## 3. 退休顺序与 actualCanRetire

actualCanRetire 不是可写字段。read 的计算只代表其标明的 ledgerRevision 与检查时间；实际删除会重新检查，不把早先的绿灯当锁。

冷 session 的已授权 durable metadata 与 live 物理检查权限是两个事实。read/list 不 resume session 来取得 runner；某项 inspector unsupported / access-denied / missing / identity-unverified 时，仍显示本实例已授权业务与 refs，但 actualCanRetire.allowed=false、facts=null，并给出 physical-inspection-* 机械原因。不把检查不到解释成 clean/不存在，也不把 checkedAt 标签当 fresh permission proof。单项检查失败不使整张只读列表消失。metadata authority 的拒绝/损坏、storage corruption / uncertainty 在此降级 catch 之外硬失败，不修复/reset-empty。create/actualRetire 的物理操作也不降级放行。宿主 runner 每请求必须来自真实 caller/session 的既有 native policy（可用绑定上下文），不 expanded-root。

1. 显式 requestRetire。内容 remove-clean 或 discard；分支 keep 或 delete-owned。实际 authorId 由 authority 写入。
2. 同一 CAS aggregate 持久进入 retiring。所有新 writer/integration、相同物理资源的新引用及非单调续用被拒绝；既有 accepted/active 工作仍可按程序事实 drain，不强杀，也不抹消息。
3. ResourceLifecycle.closeEntrypoints(record, references) 必须关闭全部相关 native send / resume / admission 入口，并明确返回 closed 与 nativeColdResumeClosed。宿主需对 native inventory 和登记-before-accept 契约负责；仅关闭插件工具不是证明。关闭证明必须 durable、幂等，不得丢弃仍已接受的工作。
4. 重读所有物理 alias 的 active / queued / accepted-message / unknown / cold / reusable 引用及入口标记；writer/integration 租约以全 aggregate 判断，不是“本实例 idle”。owned 树还要求所有其他实例物理 borrowed claims 已解除。要删除 owned 分支时，同 common-dir/ref 的其他 checkout claims 与 writers 也必须解除，即使它们的目录不同。
5. 授权读取并核验原目录、根及 Git 元数据物理身份、真实 worktree registration 与 HEAD/ref；目录缺失、重建、symlink、身份漂移或不可观测都是不允许，而不是空/clean。
6. 检查 tracked dirty、untracked、ignored（含空 ignored 目录）和内容处置。remove-clean 不容许任何这类内容。discard 要有明确 explanation 与 expectedFactsDigest，且必须匹配最新观察；这是约束明确 discard 的实际范围，不是业务证据审批。digest 包含 staged/working binary diff、HEAD/ref 与逐文件/目录内容，含 ignored 与 nested repository；symlink 只观察链接，不读取其目标。
7. Git adapter 在实际 effect seam 再核验内容和身份。owned 才可物理删除；borrowed 只退出本实例 claim，保留实体和分支。branch keep 是缺省处置示例；delete-owned 必须明确提供当前 expectedBranchOid。Git 再检查没有其他 registered checkout 借用该 ref，以 update-ref compare-delete 删除精确 OID，绝不 branch -D。
8. 物理动作成功后才提交 retired / closed；不会先 tombstone，再删除仍可续用 session 的 cwd。

若不能证明 native 冷恢复关闭，返回 reasons 中的 native-cold-resume-unsupported 并保留 retire-requested / 树，不伪称退休成功。活跃引用、脏内容、其他 claim 同样保持请求、返回机械原因，不制造业务 blocker、delivery approval 或要求模型补交付证据。

## 4. cross-instance 原子排斥与存储 ownership

ResourceDocument schemaVersion=1。所有资源、aliases、references、leases 在资源域的一条 resources 行，而不是各实例各自看 idle。createDomainResourceStorage(table) 复用[versionedStorage](<../src/controls/versioned-storage.ts>)的共享 per-domain CAS 与 table-wide uncertainty latch；MemoryResourceStorage 是显式非持久测试 adapter，没有 fallback。

- 同实际 path/private Git dir 的 writers 排斥；同 common-dir/branch 的 writers 也排斥。
- integration lease 排斥同 common-dir 的所有 writer/integration；多资源锁原子提交，不先锁 A 再等待 B。
- creating / retiring / quarantined / cleanup-failed 的仓库操作 barrier 阻止相关新写入。不同实例持久归属仍隔离，但不能因隔离而绕过物理互锁。
- 一 host、一个 actual open table handle、独占单表 domain/unit、一个 backend image。实例之间必须共用资源 aggregate；不能各开一份本地资源 storage，也不能另表绕过共享 latch。
- 不承诺跨进程、多 domain 事务或 exactly-once。CAS 争用有界 32 次。返回快照冻结、重新解析，坏文档/未知 schema/重复绑定/非法引用/冲突 writer 不 reset-empty。

write 回执可能在持久成功后丢失；原 handle 与任何新 wrapper 都被 storage-uncertain 拒绝。宿主关闭并重开新 handle，读取真实记录，再 recover；不能用旧内存 revision 盲重试。durable 创建预留存在而 side effect 是否发生不确定时保持 quarantine；不会凭创建函数 reject 推断 native header 未发布。

## 5. 授权 Git/FS seam 与失败

concreteGitAdapter(host: AuthorizedGitRunner) 需要以下无默认放行依赖：

~~~ts
interface AuthorizedGitRunner {
  authorize(request: { operation: 'inspect' | 'create' | 'borrow' | 'retire'
    paths: readonly string[]; disposition?: AuthoredRetireDisposition }, signal?: AbortSignal): Promise<void>
  run(argv: readonly string[], cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }>
  lstat(path: string, signal?: AbortSignal): Promise<{ kind: 'directory' | 'file' | 'symlink' | 'other'; identity: string }>
  realpath(path: string, signal?: AbortSignal): Promise<string>
  readFile(path: string, signal?: AbortSignal): Promise<Uint8Array>
  readlink(path: string, signal?: AbortSignal): Promise<string>
  readDirectory(path: string, signal?: AbortSignal): Promise<readonly string[]>
}
~~~

宿主后来把这些操作绑定到既有正常许可/sandbox 路径；插件没有 child_process/native FS runner，也不会把 cwd 当授权根。argv 是 git + 参数数组，关闭 hooks、pager、optional Git read locks，禁用 diff 外部 driver/textconv；无 shell 插值、任意命令拼接或自动扩大权限。host runner 必须清除 inherited GIT_* 重定向、正确传取消和错误、保护给定路径，并配合全资源 locks。argv/path 验证本身不是恶意外部进程的 FS sandbox；不同 runner 与外部未受管写入要由宿主排斥。

创建只允许已存在、canonical 且非 symlink 的授权 root 下一个新 direct child；path 不存在、branch 不存在、startPoint 固化为 commit OID后才 add。实际操作之前重新核验 root token、path、branch/ref 和 common-dir。不会移动、覆盖或强制 checkout 用户已有树。依赖/setup 文件并不随树自动复制。

失败策略：

- late 创建/绑定/closure/identity 不确定：quarantined，保留现场和记录；recover 不自动删除。
- retirement effect 失败但原物理树仍可证明：cleanup-failed；显式重试重新核验所有条件。
- remove 已发生而 branch 删除失败、原 cwd 缺失/替换或效果不能证明：quarantined，保留原身份与分支，不对替换路径续删，也不宣称完整成功。此模块没有自动 reconciliation/清除 quarantine 的隐藏入口；需要宿主另行明确处理。
- borrowed 永不物理删除、discard 或删除分支。清理不涉及未登记的用户 worktree；branch 处置是明确模型/用户业务选择，没有“必须已合并”gate。

## 6. 机械验证与限制

[资源核心测试](<../tests/resources.test.mjs>)与[Git fixture 测试](<../tests/git-worktrees.test.mjs>)共 **35/35 通过，零跳过**。测试使用 Node 当前运行时的受控 TypeScript transpile hook，无生成 lib；类型另以严格 noEmit 检查。本轮覆盖：

- owned / borrowed claims、跨实例 busy、全资源 writer/integration 竞争、多资源 all-or-none CAS；
- durable binding 和 native session 禁止迁移、原树 followup retain、queued / accepted-message / cold / reusable / unknown 保护；
- missing 初次 cwd seam、native cold 关闭 unsupported、退休预留与 late ref/writer race、idle→unknown race；
- dirty / untracked / ignored 字节与空 ignored 目录、nested repository、staged 内容同状态码漂移、明确 discard 范围；
- root/path/ref/common/private-dir 身份、symlink/路径穿越/已有分支碰撞、borrowed/foreign checkout 的 branch 安全；
- late 创建失败、partial retire quarantine、pre-effect retire failure/retry、dedicated 临时 JSON fresh reopen、durable receipt loss 与全 wrapper latch；
- 资源核心和实际 Git adapter 的临时仓库组合，不触碰用户 checkout。

仅测试中的 explicit test runner 使用 native execFile('git', argv)，固定 executable、无 shell、清洁环境、所有 cwd/绝对 argv 在新临时 fixture root；fixture FS 操作同样限定临时根。没有测试用户 checkout 或真正控制工作区 common-dir。

~~~bash
node --test tests/resources.test.mjs tests/git-worktrees.test.mjs
pnpm exec tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes \
  --verbatimModuleSyntax --isolatedModules --skipLibCheck --types node \
  --target ES2022 --module NodeNext --moduleResolution NodeNext \
  src/controls/resources.ts src/controls/git-worktrees.ts
~~~

上述两项最终 exit=0。全仓 noEmit 曾通过，但组合方并行新增 client 源码后，全仓检查报告该 client 的尚未接齐 React/DSH client 依赖与 Remote export；本模块不越权修复其它文件，不把 scoped 检查冒充整包/GUI/模型认证。编译产物、barrel、制品清单与完整宿主回归由组合方维护。JSON fixture 验证本模块的存储 seam，不冒充再次认证实际 DSH DomainFacility；现有[共享 CAS 验证](<CONTROLS_CORE.md>)的单 handle 限制原样适用。
