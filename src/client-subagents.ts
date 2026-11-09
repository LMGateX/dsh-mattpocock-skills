import { createElement as h, useState } from 'react'
import type { ReactElement } from 'react'
import type { ClientSessionSnapshot, SessionObservation } from './client.js'
import type { NativeExecutionView } from './controls/native-executions.js'

interface CatalogRow {
  readonly title?: string
  readonly displayTitle?: string
  readonly parentId?: string
  readonly projectionValues?: { readonly subagent?: { readonly label?: string } }
}
interface Catalog { readonly byId: Readonly<Record<string, CatalogRow>> }
export interface SubagentHost {
  readonly sessions?: { subagentAddress?(id: string): unknown; readonly list?: { getSnapshot(): Catalog } }
  readonly sidebarRight?: { readonly mounted?: { getSnapshot(): unknown }; openResource?(address: string, options: { preferNewPane: boolean }): void }
}
export interface SubagentNavigation {
  available(id: string, parent: string): boolean
  open(id: string, parent: string, view: ClientSessionSnapshot): boolean
}
export interface SubagentFace { readonly subagentNavigation?: SubagentNavigation }
interface SubagentProps extends SubagentFace {
  readonly view: ClientSessionSnapshot
  readonly rows: readonly NativeExecutionView[]
  readonly describeRow: (row: NativeExecutionView) => string
  readonly useSessions?: <T>(selector: (value: Catalog) => T) => T
}
function identity(view: ClientSessionSnapshot): string {
  return JSON.stringify([view.sessionId, view.instance, view.caller, view.policyGrants.revision, view.records?.scope, view.windows?.scope,
    view.policy.display.inputSummary, view.policy.extensionEnabled, view.policy.workspaceEnabled, view.health])
}
function allowed(view: ClientSessionSnapshot): boolean {
  return view.policy.display.inputSummary && view.caller.kind === 'user' && view.records?.scope.kind !== 'assigned' && view.windows?.scope.kind !== 'assigned'
    && !view.health.some(row => row.scope === 'native-executions' && row.status !== 'current')
}
/** Only serialize a real public subagentAddress result, never synthesize routing from the owner. */
export function createSubagentNavigation(host: SubagentHost, sessionId: string, observe: () => SessionObservation): SubagentNavigation {
  const resource = (id: string, parent: string): string | null => {
    if (typeof host.sessions?.subagentAddress !== 'function' || typeof host.sidebarRight?.openResource !== 'function') return null
    const address = host.sessions.subagentAddress(id) as { childSessionId?: unknown; parentSessionId?: unknown; mode?: unknown } | undefined
    if (!address || address.childSessionId !== id || address.parentSessionId !== parent || !['one-shot', 'continuable', 'unknown'].includes(String(address.mode))) return null
    return 'dsh-resource://subagentchat/session/' + encodeURIComponent(id) + '?' + new URLSearchParams({ parent, mode: String(address.mode) })
  }
  return {
    available: (id, parent) => { try { return resource(id, parent) !== null } catch { return false } },
    open: (id, parent, expected) => {
      const observer = observe(), current = observer.getSnapshot()
      if (host.sidebarRight?.mounted?.getSnapshot() !== sessionId || observer.sessionId !== sessionId || current.status !== 'ready'
        || current.value.sessionId !== sessionId || observer.getDisplay()?.inputSummary === false || !allowed(current.value) || identity(current.value) !== identity(expected)) return false
      try {
        const view = current.value
        const forest = topology(view, (view.nativeExecutions ?? []).filter(row => row.activity === 'running'), host.sessions?.list?.getSnapshot())
        if (forest.nodes.get(id)?.parent !== parent) return false
        const address = resource(id, parent)
        if (address === null) return false
        host.sidebarRight!.openResource!(address, { preferNewPane: true })
        return true
      } catch { return false }
    },
  }
}
function title(id: string, row: CatalogRow | undefined): string {
  for (const value of [row?.title, row?.displayTitle, row?.projectionValues?.subagent?.label]) if (value?.trim() && value !== id) return value
  return id.length > 16 ? id.slice(0, 12) + '…' : id
}
/** Read-only bounded observation. Host catalog subscriptions do not retain sessions or dispatch work. */
export function NativeSubagentTree(props: SubagentProps): ReactElement {
  return props.useSessions ? h(CatalogSubagents, { ...props, useSessions: props.useSessions }) : h(SubagentRows, { ...props, catalog: undefined })
}
function CatalogSubagents(props: SubagentProps & { readonly useSessions: NonNullable<SubagentProps['useSessions']> }): ReactElement {
  const catalog = props.useSessions(value => value)
  return h(SubagentRows, { ...props, catalog })
}
interface SubagentNode { readonly id: string; readonly parent: string; readonly row: NativeExecutionView | undefined }
/** Only running observations seed the tree. Catalog ancestors supply structure, never usage. */
function topology(view: ClientSessionSnapshot, rows: readonly NativeExecutionView[], catalog: Catalog | undefined): { nodes: Map<string, SubagentNode>; unknown: SubagentNode[] } {
  const facts = new Map<string, NativeExecutionView>()
  const conflicts = new Set<string>()
  for (const row of view.nativeExecutions ?? []) {
    if (facts.has(row.sessionId) && facts.get(row.sessionId)!.parentSessionId !== row.parentSessionId) conflicts.add(row.sessionId)
    facts.set(row.sessionId, row)
  }
  const nodes = new Map<string, SubagentNode>(), unknown: SubagentNode[] = []
  for (const row of rows) {
    const path: SubagentNode[] = [], seen = new Set<string>()
    let id = row.sessionId, valid = true
    while (id !== view.instance.ownerSessionId) {
      const fact = facts.get(id), listed = catalog?.byId[id]
      const parent = fact?.parentSessionId ?? listed?.parentId
      if (!parent || seen.has(id) || seen.size >= 128 || conflicts.has(id) || (fact && listed?.parentId && fact.parentSessionId !== listed.parentId)) { valid = false; break }
      seen.add(id); path.push({ id, parent, row: fact }); id = parent
    }
    if (valid) for (const node of path) nodes.set(node.id, node)
    else unknown.push({ id: row.sessionId, parent: row.parentSessionId, row })
  }
  return { nodes, unknown }
}
function SubagentRows(props: SubagentProps & { readonly catalog: Catalog | undefined }): ReactElement {
  const [message, setMessage] = useState<string | null>(null)
  const scope = identity(props.view)
  const [folds, setFolds] = useState<{ scope: string; ids: ReadonlySet<string> }>(() => ({ scope, ids: new Set() }))
  const collapsed = folds.scope === scope ? folds.ids : new Set<string>()
  const forest = topology(props.view, props.rows, props.catalog)
  const childrenByParent = new Map<string, SubagentNode[]>()
  for (const node of forest.nodes.values()) {
    const siblings = childrenByParent.get(node.parent) ?? []
    siblings.push(node); childrenByParent.set(node.parent, siblings)
  }
  const render = (node: SubagentNode, unknown = false): ReactElement => {
    const label = title(node.id, props.catalog?.byId[node.id])
    const enabled = !unknown && props.subagentNavigation?.available(node.id, node.parent) === true
    const children = childrenByParent.get(node.id) ?? []
    const folded = collapsed.has(node.id)
    return h('article', { key: node.id, style: { minWidth: 0, overflowWrap: 'anywhere' } },
      h('button', { type: 'button', disabled: !enabled,
        onClick: () => { if (!props.subagentNavigation?.open(node.id, node.parent, props.view)) setMessage('原生侧栏暂不可用：会话、显示权限或地址已变化。') } }, label),
      children.length === 0 ? null : h('button', { type: 'button', 'aria-expanded': !folded, 'aria-label': (folded ? '展开 ' : '折叠 ') + label + ' 的子代理',
        onClick: () => { const ids = new Set(collapsed); if (folded) ids.delete(node.id); else ids.add(node.id); setFolds({ scope, ids }) } }, folded ? '展开子代理' : '折叠子代理'),
      h('p', null, node.row?.activity === 'running' ? '在跑 · 来源：native-observed · ' + node.row.observed : '结构节点（不计入在跑）'),
      !enabled ? h('p', { role: 'status' }, unknown ? '父链未知、冲突或循环；不猜测归属，不打开错误会话。' : '宿主缺少可用原生子代理导航能力或真实地址；保留 ID 供核对。') : null,
      h('details', null, h('summary', null, '技术详情'), node.row === undefined ? null : h('p', null, props.describeRow(node.row)), h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(node.row ?? { sessionId: node.id, parentSessionId: node.parent, source: 'host-catalog' }, null, 2))),
      folded || children.length === 0 ? null : h('div', { style: { marginInlineStart: '12px', borderInlineStart: '1px solid var(--dsw-alias-border-default, currentColor)', paddingInlineStart: '8px' } }, children.map(child => render(child))))
  }
  return h('div', null,
    [...forest.nodes.values()].filter(node => node.parent === props.view.instance.ownerSessionId).map(node => render(node)),
    forest.unknown.length === 0 ? null : h('section', { 'aria-label': '父链未知的子代理' }, h('h4', null, '父链未知'), forest.unknown.map(node => render(node, true))),
    message === null ? null : h('p', { role: 'status' }, message))
}
