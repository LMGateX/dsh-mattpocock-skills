# DSH compatibility: step admission and assembled-request diagnostics

**Target:** [DSH 0.2.3-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.3-alpha.2). The accepted [workspace silent-mode contract](WORKSPACE_SILENT_MODE.md) applies OFF to newly admitted steps and rechecks plugin-owned effects immediately. An already assembled or admitted step, including same-step retries, completes normally. Revalidation immediately before adapter handoff is an upstream design option, not a feature of this SDK or a current release requirement.

## Acceptance on the pinned host

From this source checkout, with development dependencies and the Node version declared by the bundle available:

```sh
DSH_CONTROLS_HOST_ROOT=/absolute/path/to/installed/@deepseek-ai/dsh \
  node scripts/verify-silent-request-readiness.mjs
```

Use the directory containing the **installed CLI package manifest**, not the executable, a profile, or its package list. The [admission gate](../scripts/verify-silent-request-readiness.mjs) verifies the exact CLI and resolved SDK versions against `engines.dsh`, requires the CLI entry, and rejects missing tests, skips, todos and cancellations. Its eleven checks use real installed SDK modules, disposable in-memory sessions/controls, and an inert adapter without starting DSH or using credentials, a profile, or network calls.

- Five [Host cases](../tests/workspace-silent-host.test.mjs) include fresh Native and PTC requests and an ON→OFF scenario in each mode: pause an already assembled request in downstream `llm/stream` middleware, save OFF and read back the effective policy, then let the admitted step complete normally. Verify the next newly admitted step has no owned tool declarations, history or snapshot, and ordinary conversation, unrelated tools and raw records survive. A separate fixture checks rejection at dispatch from a previously resolved tool set, plus workspace isolation. The held request’s adapter payload is diagnostic, not an assertion that it must be rewritten.
- Six [compaction cases](../tests/silent-compaction-input.test.mjs) enter the projection with OFF already effective. They cover the mounted Host’s verified-session/purpose check and the real native `compactRegion`→`llm/stream`→adapter path with the same projector. Owned replay and tool changes are excluded; unrelated inputs, old records, downstream middleware, usage, cancellation and native recovery survive. This does not promise a last-moment recheck inside downstream compaction middleware.

## Non-blocking handoff and browser diagnostics

In the historical stricter reproduction on alpha.2, the held Native request reached the adapter with old `tools`, `toolHistory` and snapshot; the held PTC request had old `tools:sdk` declarations and snapshot. The auxiliary compaction handoff also retained old declarations, history and snapshot when OFF was saved during a downstream pause. Fresh OFF requests were silent, and stale execution-effect denial passed. These results describe the adapter boundary for already assembled requests, not a failure of the accepted admission contract; see the [historical verification record](VERIFICATION.md).

The [auxiliary compaction handoff probe](../tests/silent-compaction-final-handoff.test.mjs) uses the mounted Host and a real LlmRuntime dispatch with `purpose: compaction`; it does not repeat native region selection. The [unfiltered compaction baseline](../tests/silent-compaction-known-limitation.test.mjs) demonstrates the original retained tool declarations. Neither is a release gate. Run them separately if investigating upstream handoff:

```sh
DSH_CONTROLS_HOST_ROOT=/absolute/path/to/installed/@deepseek-ai/dsh \
  node --test tests/silent-compaction-final-handoff.test.mjs tests/silent-compaction-known-limitation.test.mjs
```

The stock cold Web Skills menu supplies only a shared preset scope to discovery; the plugin does not guess a session. An already-open menu can retain old entries. Immediate cold/warm menu synchronization is not a release requirement; actual Host discovery/loading in a verified session remains policy-authoritative, including when the browser offers a cached entry.

## Why the public hooks cannot guarantee last-moment revalidation

Pinned DSH source on `dsh-v0.2.3-alpha.2` (paths and symbols also present in the installed packages):

- [AgentLoop admission and retained tool set](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/agent-loop/src/agent.ts#L286-L319): resolves the tool set and assembles the prompt before `agent/pre-step`; keeps that tool set. [Request preparation and streaming](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/agent-loop/src/agent.ts#L430-L482) happen later. [Request building and logging](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/agent-loop/src/agent.ts#L645-L734) append the native request header/updates and freeze the request. [Tool dispatch](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/agent-loop/src/agent.ts#L575-L589) still uses the admitted set. [The deprecated `agent/request` hook](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/agent/src/runtime-types.ts#L352-L374) can return call controls, not a replaceable admission bundle.
- [PTC's `tools:sdk` section](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/core/tool-executor-ptc/src/index.ts#L24-L53) is rendered from the resolved tools but is not itself a transport tool schema. Removing native names alone leaves PTC declarations behind; removing `run_code` would incorrectly disable the unrelated nested tools too.
- [`llm/stream` waterfall](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/llm/llm/src/index.ts#L1156-L1165) takes `next()` with no replacement input; the terminal closure captures `options`. [Actual dispatch](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/llm/llm/src/index.ts#L1050-L1106) later projects the tools for the adapter and invokes its stream. An earlier listener cannot make a fenced final check on the terminal continuation, and cannot replace the frozen AgentLoop object.
- [Pressure compaction](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/compaction/compaction-basic/src/index.ts#L172-L218) can run inside `agent/pre-step` or `agent/request`, before a new conversation request header is committed. [The native summarizer](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.3-alpha.2/packages/compaction/compaction-basic/src/summarizer.ts#L124-L163) supplies historical tools and messages in an independent `purpose: 'compaction'` request with its session ID and cancellation signal. The mutable alpha.2 auxiliary envelope makes narrow local projection possible; it is not a general replace/revalidate API.

## Optional upstream contract for a stronger boundary

To guarantee a stricter policy than the accepted admission rule, DSH would need **host-owned final admission** before model adapter handoff, after any asynchronous preparation and middleware waits. It would have to apply to each ordinary attempt (Native and PTC) and each session-associated compaction attempt, including recovery/retry. A plugin would register a revalidation decision using the trusted session/Agent scope, request purpose and attempt identity, with the existing signal. The callback could await the effective policy, but the host would need to fence the result against policy changes up to handoff (for example by a revision/lease invalidation contract); simply adding an earlier asynchronous notification leaves the same race. A request already handed to the adapter could not be recalled; the probe does not inspect external transport bytes.

On invalidation, either admit a host-rebuilt attempt from the current scope or use a supported replace/project result that is applied at the terminal boundary. The host must keep all views of that attempt consistent: resolved executable set, direct schemas and historical tool updates, PTC nested SDK section, plugin-attributed prompt/context, and native request/attempt records. Keep just enough structural provenance for removal of owned sections and declarations; do not search or redact ordinary chat by text. If a conversation admission is rebuilt, dispose the old resolved set, preserve user input, and avoid duplicate sends, assistant output, tool effects or accounting. Re-check plugin-owned execution effects independently (stale call denial does not fix prior model exposure).

For compaction, use the same saved permission and trusted source identity to project only this plugin's retained material. Preserve protected prompt sections, other tools, ordinary user/assistant content, the original append-only records, route and model controls, the original signal, middleware chain, usage, native summary/recovery and retry semantics. Do not cancel unrelated turns, disable or replace compaction, mutate frozen requests, rewrite historical headers, or forge native request/usage records. This is an upstream option only; the admission gate above and the broader regression and exact-artifact checks remain separate.
