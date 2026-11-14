/** Fixed model guidance: no caller, policy state or authorization is captured here.
 * RC3's public ValueSchemaSpec supports object, array and oneOf. We deliberately
 * retain request:json for the existing >=RC1 surface and domain-parser correction
 * semantics; the following action types/examples are not nested schema enforcement.
 */
interface ActionContract {
  readonly shape: string
  readonly rules?: string
  readonly example?: Readonly<Record<string, unknown>>
}
interface ToolContract {
  readonly actions: readonly ActionContract[]
  readonly rules?: readonly string[]
}

const query = 'query?: {kind?: string, recordId?: string, limit?: number, cursor?: string}'
const queryLimit = 'limit is 1..100 (default 20).'
const command = 'operationId: string, expectedRevision: number, workflowId: string, references?: string[]'
const result = 'DecisionResult = {answer: string, selectedOptionKey?: string, source?: {kind: string, sessionId?: string, messageId?: string, text?: string, position?: string}, included?: string | string[], excluded?: string | string[]}'
const contracts: Readonly<Record<string, ToolContract>> = {
  mattpocock_controls: {
    actions: [
      { shape: '{action:"read", ' + query + '}', rules: queryLimit + ' query.kind is defaults or workspace; workspace recordId is a workspace ID.', example: { action: 'read' } },
      { shape: '{action:"save", expectedRevision: number, intent: {extensionEnabled: boolean, defaults: PolicyPatch, workspaceOverrides: {[workspaceId: string]: PolicyPatch}}}',
        rules: 'Save is complete sparse intent replacement, not a patch. Always include all three intent keys. A read marked completeIntent:false cannot be saved directly: read all defaults/workspace pages and exact bodies at the same policy revision, restarting on a change, before constructing the full intent.' },
    ],
    rules: [
      'PolicyPatch groups contain optional leaves: workspace/skills/binding/lifecycle/ticketProgress {enabled?: boolean}; display {header?: boolean, inputSummary?: boolean, rightPanel?: boolean, sessionList?: boolean, timeline?: boolean}; pendingDecisions {enabled?: boolean, interactionMode?: "native-question" | "async-decision"}; windows {enabled?: boolean, ticketWindowSize?: number, runningSubagentLimit?: number}. Capacities are positive safe integers.',
      'Omitted sparse leaves inherit defaults then safe-initial values; false explicitly disables instead of inheriting. To restore inheritance remove that override leaf from the full replacement intent; null is not an inheritance marker and is rejected. Empty groups/defaults/overrides are valid; removing other leaves is also a real change, not an implicit merge. Never save a partial view or self-grant policy access.',
    ],
  },
  mattpocock_record: {
    actions: [
      { shape: '{action:"read", query?: {kind: string, workflowId?: string, recordId?: string, target?: {workflowId: string, localTicketId?: string, decisionId?: string, axisKey?: string}, limit?: number, cursor?: string}}',
        rules: 'Use the returned current-query entry for available kinds. target selects workflow by workflowId; ticket/task-reference/window-ticket/pending-release add localTicketId; decision adds decisionId; status-count adds axisKey. Do not combine target with legacy workflowId/recordId selectors. Legacy composite recordId remains accepted. Current cursors are opaque strings; pass them unchanged with the same filters.', example: { action: 'read' } },
      { shape: '{action:"detail", locator: string, offset?: number}', rules: 'Use only the returned authorized locator; offset defaults to 0. It is not an arbitrary file/key/JSONPath selector.' },
      { shape: '{action:"apply", command: {' + command + ', action:"put-workflow", value:{title: string, axes: {axisKey: string, label: string, counting:"exclusive"|"overlapping", statuses: {statusKey: string, label: string, meaning?: string|null, summaryPriority?: number, terminal?: boolean}[]}[]}}}',
        rules: 'terminal is a boolean, not a status name or completion receipt. A workflow value replaces its title and axes; [] is allowed for a workflow used only as a reference group.' },
      { shape: '{action:"apply", command: {' + command + ', action:"put-task-reference", localTicketId: string, value:{source: object, locator: string, label?: string}}}',
        rules: 'source is exactly {kind:"external",instance:string,project:string,taskId:string}, {kind:"repository",repositoryAnchor:string,relativePath:string,anchor?:string}, or {kind:"unverified"}. Source identity is immutable; locator and label are nonempty navigation/report text, not authority. No business statuses/summary/body/disposition are accepted.' },
      { shape: '{action:"apply", command: {' + command + ', action:"put-ticket", localTicketId: string, value:{title: string, statuses:{[axisKey:string]:string[]}, externalRef?:string|null, summary?:string|null, disposition?:string|null, suspicionMode?:"auto"|"off"}}}',
        rules: 'Legacy ticket title/statuses are required, optional fields preserve existing values when omitted; nullable text clears with null. Do not create a duplicate business ticket to work around missing task-reference capability.' },
      { shape: '{action:"apply", command: {' + command + ', action:"put-decision", decisionId: string, value:{question: string, status: string, pending?: boolean, awaitingImplementation?: boolean, ticketIds?: string[], context?: string|null, options?: {key:string,label:string}[], recommendation?: string|null, impact?: string|null, addressee?:{kind:"user"|"agent"|"unspecified",principalId?:string|null,label?:string|null}, result?: string|DecisionResult|null}}}',
        rules: 'put-decision value.result: string | DecisionResult | null. Check capabilities.structuredDecisionResults=true before sending an object; absent or unknown capability means use supported nonempty string text, not arbitrary JSON. ' + result + '. Text is nonempty and NUL-free, arrays have at most 64 entries, the whole JSON result at most 65536 UTF-16 characters (including JSON escapes); unknown keys are rejected. Optional result/source members, when supplied, cannot be null. selectedOptionKey and source sessionId/messageId use opaque IDs (1..256 characters, no leading/trailing whitespace or control characters); source.kind is nonempty free text, not an enum.',
        example: { action: 'apply', command: { operationId: 'record-real-reply', expectedRevision: 3, workflowId: 'flow', action: 'put-decision', decisionId: 'question-1', references: ['user-message:reply-1'], value: { question: 'Which path?', status: 'resolved', pending: false, result: { answer: 'Use read-only input', source: { kind: 'user-message', messageId: 'reply-1' }, included: ['read-only runtime'], excluded: ['installation'] } } } } },
      { shape: '{action:"apply", command: {' + command + ', action:"set-decision-view", decisionId: string, value:{read: boolean, hidden: boolean}}}', rules: 'Both booleans are required. This changes only the authenticated principal view; it does not resolve a question or clear obligations.' },
      { shape: '{action:"apply", command: {' + command + ', action:"adopt-decision-recommendation", decisionId: string, value:{optionKey: string, decisionRevision: number, policyEpochId: string, policyRevision: number}}}', rules: 'Use exact returned candidate fields and current businessRevision as expectedRevision; never send caller/author/time or policySelection.' },
    ],
    rules: [
      'All record commands require operationId: string, expectedRevision: number, workflowId: string; references: string[] is optional (default []). Ordinary put-* updates use references as this operation\'s declarations, not an automatic union with older references; supply all intended current declarations while retained historical sources remain unchanged. In contrast, adopt-decision-recommendation retains the original references and adds the supplied declarations.',
      'For decision updates, omitting result preserves the existing result; a supplied result replaces it as a whole; null clears it. Other optional decision fields preserve their existing value when omitted; supplied arrays replace, [] clears an optional array. included and excluded belong inside result, not at decision top level. Preserve prior answer, source pointers and applicable/excluded conditions when composing a replacement.',
      'Result source is an authored report, not an authenticated user event or operation permission; selectedOptionKey does not adopt a recommendation or change pending/awaitingImplementation. policySelection is host-authenticated adoption metadata, never a field to author. An example resolved result is legitimate only for a real explicit resolution; it does not manufacture approval.',
    ],
  },
  mattpocock_window: {
    actions: [
      { shape: '{action:"reserve", operationId: string, workflowId: string, localTicketId: string}', example: { action: 'reserve', operationId: 'reserve-task-1', workflowId: 'flow', localTicketId: 'task-1' } },
      { shape: '{action:"release"|"reacquire", operationId: string, workflowId: string, localTicketId: string, generation: number}', rules: 'generation is the existing positive safe-integer generation returned for this handle, not guessed. Reserve omits it; a stale generation is ignored rather than applying to a newer occupancy.' },
    ],
    rules: ['No read action. Use mattpocock_record current window-ticket/window-execution/pending-release queries when permitted, not coordinator-only history for an assigned child. Reuse operationId only for the same request; release is separate from source completion and never implicitly reacquires.'],
  },
  mattpocock_resource: {
    actions: [{ shape: '{action:"read", resourceId: string}', example: { action: 'read', resourceId: 'existing-resource-id' } }],
    rules: ['Single-target read only; no collection query, create, borrow or retire action. Durable ledger/references and live Git observation have distinct coverage. Unknown physical facts do not establish retirement permission.'],
  },
  mattpocock_assign: {
    actions: [{ shape: '{sessionId: string, workflowId?: string|null, ticketIds?: string[]}', example: { sessionId: 'actual-direct-child' } }],
    rules: ['ticketIds: string[] defaults to []; workflowId omitted or null means a native ticketless lane with no instrument task access. A workflow-scoped empty ticket list is not unrestricted task access. Grants are bounded by the current authenticated ancestor chain; identifiers/URLs do not grant external tracker or policy access.'],
  },
  mattpocock_history: {
    actions: [
      { shape: '{action:"query", query:{kind?: string, recordId?: string, limit?: number, cursor?: HistoryCursor}}', rules: 'HistoryCursor is the returned structured object; use the returned cursor unchanged, not JSON-stringified or decoded as a current cursor. Keep original filters and frozen cut.', example: { action: 'query', query: { kind: 'decision', limit: 20 } } },
      { shape: '{action:"detail", historyIds: string[]}', rules: 'Follow returned remainingHistoryIds; missing, purged and retained-but-not-returned are distinct.' },
      { shape: '{action:"set-context", kind: string, recordId: string, included: boolean}' },
      { shape: '{action:"purge", historyIds?: string[], range?: {fromSequence:number,toSequence:number}, archivedOnly?: boolean}' },
      { shape: '{action:"compact"}' },
      { shape: '{action:"compact-source", domain:"records"|"windows"|"worktrees", request:{operationId:string,expectedRevision:number}}' },
      { shape: '{action:"purge-source", domain:"records"|"windows"|"worktrees", request:{operationId:string,expectedRevision:number,throughRevision:number,targets?:SourceTarget[],bindingIds?:string[]}}', rules: 'worktrees requires bindingIds (not targets); records/windows require targets (not bindingIds), with 1..100 unique selections. Records SourceTarget is {kind:"workflow",workflowId:string}, {kind:"ticket"|"task-reference",workflowId:string,localTicketId:string}, or {kind:"decision",workflowId:string,decisionId:string}. Windows SourceTarget is {kind:"ticket",workflowId:string,localTicketId:string}, {kind:"execution",executionId:string}, or {kind:"knowledge"}. Use the domain-specific returned sourceRevisions, never history revision as source CAS. These are explicit source cleanup operations, not Git deletion or business completion.' },
    ],
    rules: ['History is coordinator-only; source cleanup additionally requires the actual owner. Assigned children use authorized mattpocock_record current queries instead; no history fallback or ACL widening. Reads may capture retained instrument history, not native conversation logs.'],
  },
  mattpocock_worktree: {
    actions: [
      { shape: '{action:"read", ' + query + '}', rules: queryLimit + ' query.kind is binding or observation; cleaned rows remain readable.', example: { action: 'read' } },
      { shape: '{action:"update", command:{operationId: string, bindingId: string, expectedRevision: number, state:"active"|"discarded"|"cleaned", notes?: string}}', rules: 'Binding notes: string, at most 65536 UTF-16 characters, no NUL.' },
      { shape: '{action:"update-observation", command:{operationId: string, observationId: string, expectedRevision: number, state:"open"|"cleaned", notes?: string}}', rules: 'Observation notes: string, at most 4096 UTF-16 characters, no NUL.' },
      { shape: '{action:"reconcile", operationId: string}', rules: 'operationId identifies an existing delegation intent, not a fresh business update or observed create_worktree call.', example: { action: 'reconcile', operationId: 'existing-delegation-operation-id' } },
    ],
    rules: ['For both notes fields, omission preserves the previous notes; a supplied string replaces them; empty string clears them; null is rejected. States and cleaned marks are authored reports, not physical cleanup evidence. Read/update/reconcile are coordinator registry operations, not permission to create, delete or switch trees.'],
  },
  mattpocock_delegate: {
    actions: [{ shape: '{description: string, prompt: string, provider?: "spawn"|"fork", worktree?: string, operationId?: string, workflowId?: string, ticketIds?: string[]}',
      rules: 'worktree is a prepared normalized absolute path; omit it to inherit intent (null is rejected). provider defaults to spawn; operationId may be omitted and the host uses the tool-call identity. workflowId requires nonempty existing local ticketIds. No workflowId means a ticketless lane.',
      example: { description: 'Focused child', prompt: 'Read the agreed contract', operationId: 'create-one-child' } }],
    rules: ['This tool is opt-in binding-first creation, never required for ordinary native dispatch. Native acceptance, binding verification and assignment are independent outcomes; accepted/unknown creation reuses that same child and never creates another on retry.'],
  },
  mattpocock_audit: {
    actions: [{ shape: '{action:"read", ' + query + '}', rules: queryLimit + ' query.kind is session or episode; read only the current authenticated owner. Unknown/not-recorded sources cannot promise an exhaustive continuation.', example: { action: 'read' } }],
    rules: ['Summary/event observations are memory-only for this host process; retained episodes come from a separate durable source. unknown and not-recorded are not current or known-empty; total:null means unknown, never zero.'],
  },
}

const outputGuidance = [
  'Model output schemaVersion 2, representationVersion:2: bounded current/page/detail/content or receipt, never result.snapshot. Read results have a 64KiB UTF-8 JSON budget; receipts/errors 8KiB.',
  'Use receipt appliedRevision/businessRevision/viewerRevision for their respective domains; appliedRevision is the original operation watermark, not current CAS. Exact small structures remain objects/arrays; omitted large fields have separate previews, never use previews as complete edit values.',
  'Follow next:{tool,request} exactly when present; null is not a guarantee that unknown coverage is complete. Queries and cursor types are action-specific, not supported by every tool.',
  'Long bodies use mattpocock_record {action:"detail",locator,offset?}. Body content is canonical JSON in UTF-8 string chunks (contentType/encoding identify it): preserve exact order, use nextOffset/next, and parse only after done and complete reassembly. Reopen after source/scope changes; do not stitch different versions or bypass authorization.',
].join(' ')

export function modelToolDescription(name: string, purpose: string): string {
  const contract = contracts[name]
  if (!contract) throw new Error('Unknown model tool contract: ' + name)
  const actions = contract.actions.map(action => [action.shape, action.rules, action.example === undefined ? undefined : 'Example request: ' + JSON.stringify(action.example)].filter(Boolean).join(' '))
  return [purpose, 'Action contract:', ...actions, ...contract.rules ?? [], outputGuidance].join(' ')
}
