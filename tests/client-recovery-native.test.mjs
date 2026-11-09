import assert from 'node:assert/strict'
import { test, after } from 'node:test'
const hostRoot = process.env.DSH_RECOVERY_HOST_ROOT ?? process.env.DSH_CONTROLS_HOST_ROOT
if (!hostRoot && process.env.DSH_RECOVERY_NATIVE_REQUIRED === '1') throw new Error('Native recovery validation requires an explicit isolated DSH host')
const native = { skip: !hostRoot ? 'Set DSH_RECOVERY_HOST_ROOT for actual native seeded SlotCore recovery validation; no substitute ran' : false }
const { mount, React, window, settle, snapshot, ok, closeFixture } = hostRoot ? await import('./fixtures/client-recovery-native.mjs') : {}
const nativeTest = (name, run) => test(name, native, run)
if (closeFixture) after(closeFixture)

const regionSelector = '[role="region"][aria-label="待你裁决详情"]'
const entrySelector = '[aria-label="查看待你裁决事项"]'
async function open(f) {
  const entry = f.container.querySelector(entrySelector)
  assert.ok(entry, f.container.textContent + JSON.stringify(f.props()[0].summary.getSnapshot()))
  await React.act(async () => entry.click())
  const region = f.container.querySelector(regionSelector)
  assert.ok(region, f.container.textContent)
  const focus = region.querySelector('button'); focus.focus()
  return { region, focus }
}
for (const components of [[0], [0, 1, 2, 3]]) {
  nativeTest('native same-session reinjection keeps mounted reading with ' + components.length + ' actual seats and a held full request', async t => {
    const f = await mount(t, { components }); const { region, focus } = await open(f)
    const reads = f.initial.fullCalls.length
    assert.equal(reads, 1, 'actual seats share one full channel')
    f.initial.mode = 'pending'
    await f.render()
    assert.equal(f.initial.fullCalls.length, reads, 'callback/lazy handle reinjection must not cause an extra RPC')
    assert.equal(f.container.querySelector(regionSelector) === region, true, 'same native mounted reading DOM survives')
    assert.equal(window.document.activeElement === focus, true, 'reading focus survives')
    assert.doesNotMatch(f.container.textContent, /暂不可用|正在恢复|当前状态未知/)
  })
}
nativeTest('native stable-holder control does not hide reinjection regression', async t => {
  const f = await mount(t); const { region } = await open(f)
  const release = f.props()[1].observer.retain(); t.after(release)
  f.initial.mode = 'pending'; await f.render()
  assert.equal(f.initial.fullCalls.length, 1)
  assert.equal(f.props()[1].observer.getSnapshot().status, 'ready', 'stable external lease masks the full-channel release, not a valid continuity proof')
})
nativeTest('a genuinely different native registry with the same Session fences old reading and performs a fresh read', async t => {
  const f = await mount(t); const { region } = await open(f)
  const next = snapshot(); next.records.decisions[0].value.question = 'New registry decision'
  const registry = await f.switchRegistry(next)
  assert.equal(registry.fullCalls.length, 1, 'new activation is not mistaken for old callback churn')
  assert.equal(f.container.querySelector(regionSelector) !== region, true)
  assert.doesNotMatch(f.container.textContent, /Native fixture decision/)
  await open(f); assert.match(f.container.textContent, /New registry decision/)
})
nativeTest('native full failure withdraws old content into neutral shell and cannot restore explicitly hidden display', async t => {
  const f = await mount(t); await open(f)
  f.initial.mode = 'error'; await f.refresh()
  assert.equal(f.container.querySelector(regionSelector), null)
  assert.doesNotMatch(f.container.textContent, /Native fixture decision/)
  assert.match(f.container.textContent, /暂不可用|恢复|未知/)
  f.initial.mode = 'success'; const hidden = snapshot(); hidden.policy.display.inputSummary = false; f.initial.view = hidden
  await f.refresh(); await f.refreshSummary()
  assert.equal(f.container.querySelector(entrySelector), null)
  f.initial.mode = 'error'; await f.refresh()
  assert.equal(f.container.querySelector(entrySelector), null, 'failure cannot regrant display')
})
nativeTest('native last unmount immediately aborts pending read and cold remount revalidates', async t => {
  const f = await mount(t); await open(f)
  f.initial.mode = 'pending'
  await React.act(async () => { void f.props()[1].observer.refresh(); await settle() })
  assert.equal(f.initial.pending.length, 1)
  const held = f.initial.pending[0], oldObserver = f.props()[1].observer
  assert.equal(held.signal.aborted, false)
  await f.unmount()
  assert.equal(held.signal.aborted, true, 'last actual seat cancels without delayed release')
  assert.equal(oldObserver.getSnapshot().status, 'unknown')
  const container = window.document.createElement('div'); window.document.body.append(container)
  const { createRoot } = await import('react-dom/client'); const root = createRoot(container)
  t.after(async () => { await React.act(async () => root.unmount()); container.remove() })
  const entry = f.initial.seats[0]
  await React.act(async () => { root.render(React.createElement(entry.component, { sessionId: 'native-session', ...entry.inject('native-session') })); await settle() })
  await React.act(settle)
  assert.equal(f.initial.pending.length, 2, 'cold mounting revalidates rather than resurrecting cached current')
  assert.doesNotMatch(container.textContent, /Native fixture decision/)
  held.resolve(ok(snapshot())); await React.act(settle)
  assert.doesNotMatch(container.textContent, /Native fixture decision/, 'late old flight cannot populate cold lease')
})
