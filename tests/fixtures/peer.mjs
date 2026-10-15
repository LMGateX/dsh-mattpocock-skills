// One Host-side PeerScope stand-in for tests that call a mounted Remote.
//
// 0.2.1-alpha.2 read nothing but `id` from this object. alpha.4 admits it
// through the Gateway, which refuses a call whose Peer has no live scope
// (`peer.signal`) and branches on `peer.principal.kind`; the real browser Peer
// is created with `{ kind: 'owner' }` (dsh-client-connection). Supplying every
// field keeps one fixture valid on both host lines, because the older Gateway
// ignores the fields it does not read. Test-only: no product code builds a Peer.
/**
 * Build the Peer a Host-side fixture speaks for.
 * @param {object} ctx - Cordis Context the Peer registers through.
 * @param {{ id?: string, signal?: AbortSignal }} [options] - Peer identity and live scope.
 * @returns A frozen PeerScope-shaped object; `dispose` is inert.
 */
export function operatorPeer(ctx, { id = 'operator', signal = new AbortController().signal } = {}) {
  return Object.freeze({ id, ctx, principal: Object.freeze({ kind: 'owner' }), signal, interactions: 'answer', async dispose() {} })
}
