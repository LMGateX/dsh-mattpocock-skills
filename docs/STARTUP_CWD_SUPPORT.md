# Startup cwd support: next-process settings

This feature controls only whether the plugin may request an **explicit initial cwd for a newly created continuable child**. It is not the plugin master switch, worktree binding policy, permission approval, or a switch for ordinary native subagents, continuations, sends, history, or T/S instruments.

The initial desired value is `{ startupCwdEnabled: false }`. A settings save is an operator action, not a model tool.

## 中文界面与生效前提

界面名称为“创建子代理（subagent）时指定工作树（worktree）”：只让新建、可继续交互的子代理从明确指定的工作树目录开始，不改变 DSH 自身启动目录、已有子代理目录，也不负责创建／合并／清理 Git 工作树。

页面把“当前运行状态”与“下次启动设置”分开。勾选后仍需点“保存下次启动请求”；成功回执只确认下次请求已保存，不承诺当前或下次一定生效。协作策略的“保存并应用配置”不保存此启动请求，也不替代它的 SDK 能力前提。

0.4.2 由同一个插件包为已核验的 SDK 0.2.1-alpha.1 公共图提供兼容服务与只读启动准备观测；正常使用不要求寻找 SDK 目录、管理补丁或执行离线命令。已有运行服务在首次安装／HMR 时保持不变，准备就绪且当前公共能力为 false 时显示待真正重启；当前能力未确认、版本不匹配、资产或解析身份漂移时显示实际失败／不确定，普通重启不能修复这些问题。保存只是下次请求，准备就绪不是下次一定启动成功；加载的真实能力 getter 才决定当前启用。历史 0.4.1 Release 不含此接入；安装 0.4.2 不自动开启功能，也不证明当前 GUI 已加载新版。

固定状态与来源使用中文；启动标识、修订、SDK 版本、原始枚举／诊断和命令示例作为技术信息折叠保留，未确认观测始终显示未知，不降成禁用或成功。

## Public seam

[StartupSupport](<../src/controls/startup-support.ts>) has one trusted constructor and two operations:

```ts
new StartupSupport(storage: VersionedStorage<StartupDocument>,
  boot: { epoch: string }, observe: (signal?: AbortSignal) => Promise<StartupObservation>)
readStatus(signal?: AbortSignal): Promise<StartupStatus>
save(desired: { startupCwdEnabled: boolean }, expectedRevision: number,
  signal?: AbortSignal): Promise<StartupStatus>
```

[Startup state](<../src/controls/startup-state.ts>) contains browser-pure readonly types and strict JSON codecs: `parseStartupDesired`, `parseStartupDocument`, `parseStartupObservation`, and `parseStartupStatus`. The status codec validates transport facts and does not duplicate the status projection in the UI. The core imports no Node filesystem or SDK implementation.

Host must authorize reads and saves using its existing operator settings authority. Neither the settings request nor a model request supplies an epoch, SDK root, preparation receipt, or claimed native capability. The constructor is a trusted program seam, not user self-attestation.

## Process identity and storage

The independent schema-version-1 startup document contains its own `revision`, `desired`, and readonly technical `bootReceipts` list. Settings CAS uses that startup revision, never CorePolicy revision. Each receipt records `{ epoch, requested }`. Multiple epochs remain present: a new process must not overwrite the only receipt and thereby cause an older process to consume changed desired settings on its next read.

Host lifecycle code owns a stable real-process identity, retained across HMR, runtime reconstruction, remount, and storage-handle reopening. A process-global Symbol with an opaque random epoch is suitable; `Date.now()` on every runtime construction is not. A real process restart supplies a different epoch.

At startup, Host must await the initial `readStatus()` **before exposing operator saves or allowing explicit-cwd dispatch**. The first read captures desired and durably appends that epoch receipt. Receipt capture advances the startup-document revision. Later reads use the same receipt and may refresh getter/preparation observations, but never load newly saved desired into the effective boot latch. Reopening with the same trusted epoch preserves that latch. Calling `save` before the first read captures old desired and saves new desired in the same CAS, not a fake reboot.

An unchanged save does not advance revision once a receipt exists. Stale revisions fail with `revision-conflict`; boot-receipt capture retries technical CAS contention up to 32 times. Corrupt documents and unknown versions fail closed rather than resetting to an empty default. Returned records are detached and deeply frozen.

Storage must satisfy atomic durable `VersionedStorage` CAS. The existing native single-table JSON-domain adapter supports one active storage owner, sequential reopen, and sequential new processes—not concurrent cross-process JSON writes. A deployment sharing settings concurrently across processes must supply an adapter with actual cross-process CAS. The receipts representation itself preserves every process latch.

## Saving does not prepare or patch the loaded SDK

`save` writes only desired configuration (plus an initially missing technical boot receipt). It never runs a preparer, patches SDK source/compiled files, reverse-patches a foreign SDK, or claims that changing disk can change modules already loaded in a process.

The same-package compatible provider is composed at genuine startup; it does not write the shared SDK. Host supplies read-only same-plugin asset, canonical Loader topology and pinned native identity inspection to the core. Legacy offline SDK maintenance is not the normal user path. This observer returns:

- `nativeInitialCwdSupported: boolean | null`: the currently loaded public native-manager capability getter (official or the verified plugin-owned provider); unknown is not false.
- `preparation.status`: `ready | not-prepared | incompatible | failed | uncertain`.
- `preparation.sdkVersion` and `preparation.diagnostic`: nullable technical display data.

## Current facts and restart information

`enabledNow` is the boot request intersected with actual loaded native capability. Boot off always means false; boot on plus unknown capability means null. Disk readiness alone never means enabled.

`restartNeeded` is true when desired differs from the boot request, or desired is on and source preparation is ready while loaded native capability is still false. It is independent of error state: failed preparation and a requested configuration change can produce `restartNeeded: true` with `state: failed`; the UI must explain that restart alone does not repair preparation.

Projection precedence:

1. Both boot and desired off: `disabled`, even if old preparation information is stale or failed.
2. An official loaded native seam — the compatible provider's getter exactly true, or a host activation service carrying startActivation with the session working-directory owner — does not require managed disk preparation; current enablement and configuration restart status remain authoritative.
3. With native capability unavailable, preparation `failed`, `incompatible`, or `uncertain` take precedence over a pending-restart label.
4. `not-prepared` with a known SDK version means `needs-preparation`. An unavailable SDK root (null SDK version) means `unsupported`, not merely pending reboot.
5. Ready source with an old loaded unsupported module means `pending-restart`; unknown loaded capability means `uncertain`.

Older client facades lacking startup methods must show unavailable/unknown and disable editing, not manufacture an off status. Turning this feature off does not disable or reverse-patch globally available native capability.

## Cancellation and acknowledgement

Cancellation is checked before and after preparatory read/inspection awaits and immediately before CAS. Both public operations forward the exact caller signal to the trusted observer, which must pass it to the actual SDK inspection and cancel its ongoing work; checking only after an uncancellable await is insufficient. Before CAS, abort leaves desired untouched. Once a desired CAS starts, its actual acknowledgement wins over late cancellation; rejected writes preserve their original error because the durable write may already have committed. Recover uncertain storage by reopening the actual domain and inspecting its durable result, not by blind retries or an in-memory fallback.

## Verification

[Public-seam tests](<../tests/startup-support.test.mjs>) cover default off, save-before-read, no-op/stale/concurrent saves, durable multiple-epoch latches, capability/preparation states and strict status transport, same-process inspection changes, abort timing, corrupt documents, and actual native DomainFacility/JsonStorageBackend reopen plus a second Node process. The native probe is opt-in and reports skipped unless its Host root is explicitly supplied.

```bash
pnpm exec tsc -p tsconfig.json
DSH_CONTROLS_HOST_ROOT=/path/to/dsh node --test tests/startup-support.test.mjs
```

`startup-support` 的原生存储探针读规范根；兼容桥（alpha.1）用例另需第二个显式根 `DSH_CONTROLS_COMPAT_HOST_ROOT`，缺失时带诊断 skip；双根说明与重建命令见[公开验证摘要](<VERIFICATION.md>)。

For isolated compiled output the tests accept `STARTUP_TEST_BUILD_ROOT=file:///absolute/compiled-output/`. This changes only test imports, not shipped runtime resolution. This module verification does not claim installation or activation of the owner profile/GUI, SDK preparation, publication, or concurrent multi-process storage safety.
