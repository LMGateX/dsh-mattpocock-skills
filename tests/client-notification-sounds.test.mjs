import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import * as React from 'react'
import { Window } from 'happy-dom'
import { buildClient } from '../scripts/build-client.mjs'

const built = await buildClient({ entry: 'src/client-notifications.ts' })
let registration
vm.runInThisContext('(function(window){' + built.code + '\n})')({ __ModuleLoader__: { load: value => { registration = value } } })
const h = React.createElement
const n = registration.factory(name => {
  if (name === 'react') return React
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return { Button: ({ variant, size, ...p }) => h('button', p), Input: p => h('input', p), Checkbox: ({ label, checked, onChange }) => h('label', null, label, h('input', { type: 'checkbox', checked, onChange: e => onChange(e.target.checked) })) }
  throw Error('unexpected runtime import ' + name)
})

function audioBrowser({ deferred = false, suspended = false, rejected = false } = {}) {
  const contexts = []
  let resolveDecode
  const decode = deferred ? new Promise(resolve => { resolveDecode = resolve }) : Promise.resolve({ duration: 0.63 })
  class AudioContext {
    constructor() { this.state = suspended ? 'suspended' : 'running'; this.currentTime = 10; this.destination = {}; this.sources = []; this.gains = []; this.resumes = 0; contexts.push(this) }
    async resume() { this.resumes++; this.state = 'running' }
    async close() { this.state = 'closed' }
    decodeAudioData(bytes) { this.bytes = bytes; return rejected ? Promise.reject(Error('decode rejected')) : decode }
    createBufferSource() { const s = { playbackRate: { value: 1 }, connect() {}, disconnect() { s.disconnected = true }, start: (...args) => { s.startArgs = args }, stop: at => { (s.stops ??= []).push(at) } }; this.sources.push(s); return s }
    createGain() { const g = { connect() {}, disconnect() { g.disconnected = true }, gain: { events: [], setValueAtTime(...args) { this.events.push(['set',...args]) }, linearRampToValueAtTime(...args) { this.events.push(['ramp',...args]) } } }; this.gains.push(g); return g }
  }
  let entry
  vm.runInThisContext('(function(window){' + built.code + '\n})')({ AudioContext, __ModuleLoader__: { load: v => { entry = v } } })
  const api = entry.factory(name => name === 'react' ? React : {})
  return { api, contexts, resolveDecode: () => resolveDecode({duration:0.63}) }
}

test('real browser audio port schedules selected local sample with silence, finite budget and no stretch', async () => {
  const b = audioBrowser(), ports = b.api.createBrowserNotificationPorts()
  const sound = ports.createSound('toast',true)
  await sound.start(3,50)
  const c = b.contexts[0]
  assert(c.bytes instanceof ArrayBuffer)
  assert.equal(c.bytes.byteLength,7080)
  assert.equal(c.sources.length,3)
  assert.deepEqual(c.sources.map(s => s.startArgs.map(t => Number(t.toFixed(2)))), [[10],[11.13],[12.26]])
  for (const s of c.sources) { assert.equal(s.playbackRate.value,1); assert(s.stops[0] <= 13) }
  assert(c.gains.every(g => g.gain.events[0][1] === 0))
  sound.stop()
  assert(c.sources.every(s => s.disconnected && s.stops.length === 2))
  assert(c.gains.every(g => g.disconnected))
})

test('each closed-bundle sound decodes the exact local author preview with license and hash provenance', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../assets/notification-sounds/SOURCE.json',import.meta.url),'utf8'))
  const hashes = {
    toast: '0338e0628b4a672fd00745c8365198dc60c9fba5b882869a9ddd4f9b599d1bce',
    modal: '8364a6990b039bee11e84014f3a9724d98a9a106a1010a11de3f493bdb466493',
    popup: 'c436f861b2cc9746e511da25108619b78869f37a04901883b2a0d9f3a8f35139',
    bubble: '5f68183d41420dbd8c6ebf9ebd9117607c55c7717446c4a512a25205d256a32e',
  }
  assert.match(await fs.readFile(new URL('../assets/notification-sounds/CC0-1.0.txt',import.meta.url),'utf8'),/CC0 1.0 Universal/)
  for (const key of Object.keys(hashes)) {
    const b = audioBrowser(), ports = b.api.createBrowserNotificationPorts()
    const sound = ports.createSound(key,true); await sound.start(60,100)
    const c = b.contexts[0], raw = await fs.readFile(new URL('../assets/notification-sounds/' + key + '.mp3',import.meta.url))
    assert.equal(createHash('sha256').update(new Uint8Array(c.bytes)).digest('hex'), hashes[key])
    assert.deepEqual(Buffer.from(c.bytes),raw)
    const row = manifest.sounds.find(row => row.key === key)
    assert.equal(row.sha256,hashes[key]); assert.equal(row.author,'Qvantor'); assert.equal(row.license,'CC0-1.0')
    assert.equal(row.bytes,raw.byteLength); assert.equal(row.mediaType,'audio/mpeg')
    assert(c.sources.length > 1 && c.sources.length < 128)
    for (let i = 1; i < c.sources.length; i++) assert(c.sources[i].startArgs[0] - c.sources[i-1].stops[0] >= 0.499999)
    assert(c.sources.every(s => s.stops[0] <= 70 && s.playbackRate.value === 1))
    sound.stop()
  }
  assert.deepEqual(built.externals, ['@deepseek-ai/dsh-client-ui-primitives','react'])
})

test('source invalidation during real asynchronous decode cancels automatic playback', async () => {
  const b = audioBrowser({deferred:true}), ports = b.api.createBrowserNotificationPorts()
  const center = new b.api.BrowserNotificationCenter(ports), delivery = new b.api.MountedNotificationDelivery(center)
  // Gesture starts unlock/decode, but never a network/permission request.
  delivery.preview(); delivery.stopSound()
  center.save({...b.api.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES, sound:true, soundChoice:'modal'})
  let current = true
  await delivery.deliver({id:'fresh',pendingCount:1}, () => current, () => assert.fail())
  current = false; delivery.reconcile()
  b.resolveDecode(); await Promise.resolve(); await Promise.resolve()
  assert(b.contexts.every(c => c.sources.length === 0 && c.state === 'closed'))
  delivery.dispose()
})

test('stop during async decode, replacement and disposal cannot resurrect expired audio', async () => {
  for (const invalidate of ['stop','dispose','scope']) {
    const b = audioBrowser({deferred:true}), ports = b.api.createBrowserNotificationPorts()
    const center = new b.api.BrowserNotificationCenter(ports), delivery = new b.api.MountedNotificationDelivery(center)
    delivery.preview()
    assert.equal(b.contexts.length,1)
    if (invalidate === 'stop') delivery.stopSound()
    else if (invalidate === 'dispose') delivery.dispose()
    else delivery.clear()
    b.resolveDecode(); await Promise.resolve(); await Promise.resolve()
    assert.equal(b.contexts[0].sources.length,0)
    assert.equal(b.contexts[0].state,'closed')
    delivery.dispose()
  }
  const b = audioBrowser(), ports = b.api.createBrowserNotificationPorts()
  const one = ports.createSound('toast',true); await one.start(60,100)
  const two = ports.createSound('bubble',false); await two.start(1,0)
  assert.equal(b.contexts[0].state,'closed')
  assert(b.contexts[0].sources.every(s => s.disconnected))
  assert.equal(b.contexts[1].sources.length,0)
})

test('automatic delivery never resumes audio; explicit gesture unlock is required and failures surface', async () => {
  const b = audioBrowser({suspended:true}), ports = b.api.createBrowserNotificationPorts()
  const auto = ports.createSound('toast',false)
  await assert.rejects(auto.start(3,50), /显式试听/)
  assert.equal(b.contexts[0].resumes,0)
  const gesture = ports.createSound('modal',true); await gesture.start(1,50)
  assert.equal(b.contexts[1].resumes,1); gesture.stop()
  const later = ports.createSound('popup',false)
  await assert.rejects(later.start(1,50), /挂起/)
  assert.equal(b.contexts[2].resumes,0)
})

test('decode errors close browser resources and are reported; zero volume is explicitly silent', async () => {
  const b = audioBrowser({rejected:true}), center = new b.api.BrowserNotificationCenter(b.api.createBrowserNotificationPorts())
  const delivery = new b.api.MountedNotificationDelivery(center)
  delivery.preview()
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  assert.equal(b.contexts[0].state,'closed')
  assert.match(center.getSnapshot().delivery,/失败|拒绝/)
  delivery.dispose()
  const muted = audioBrowser({suspended:true}), mutedCenter = new muted.api.BrowserNotificationCenter(muted.api.createBrowserNotificationPorts())
  const preview = new muted.api.MountedNotificationDelivery(mutedCenter)
  preview.preview({...muted.api.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES,volume:0})
  await Promise.resolve(); await Promise.resolve()
  assert.equal(muted.contexts[0].resumes,0)
  assert.equal(muted.contexts[0].sources.length,0)
  assert.match(mutedCenter.getSnapshot().delivery,/音量.*0|静音/)
  preview.dispose()
})

test('settings selector previews the selected author sound without saving or auto enabling', async () => {
  const win = new Window()
  const old = new Map(['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'].map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  for (const [k,v] of Object.entries({ window: win, document: win.document, navigator: win.navigator, HTMLElement: win.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true})
  const { createRoot } = await import('react-dom/client')
  const node = win.document.createElement('div'); win.document.body.append(node)
  const root = createRoot(node), calls = [], data = new Map()
  const center = new n.BrowserNotificationCenter({ storage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }, capabilities: () => ({ audio:true }), now: () => 0, later: () => 1, cancel() {}, createSound: (...args) => { calls.push(args); return { state: () => 'running', start: async () => {}, stop() {} } } })
  try {
    await React.act(async () => root.render(h(n.BrowserNotificationPreferencesPanel,{center})))
    const select = node.querySelector('select[aria-label="铃声选择"]')
    assert(select, 'actual mounted settings must expose a labeled selector')
    assert.deepEqual([...select.options].map(o => o.value), ['toast','modal','popup','bubble'])
    await React.act(async () => { select.value = 'bubble'; select.dispatchEvent(new win.Event('change',{bubbles:true})) })
    await React.act(async () => [...node.querySelectorAll('button')].find(b => b.textContent === '试听').click())
    assert.deepEqual(calls, [['bubble',true]])
    assert.equal(data.size,0)
    assert.equal(center.getSnapshot().preferences.sound,false)
    await React.act(async () => center.report('声音启动失败或自动播放被拒绝'))
    const status = node.querySelector('[role="status"][aria-label="声音状态"]')
    assert(status && !status.closest('details'), 'audio failure must be visible without opening capability details')
    assert.match(status.textContent,/声音启动失败/)
  } finally {
    await React.act(async () => root.unmount()); await win.happyDOM.close()
    for (const [k,d] of old) if (d) Object.defineProperty(globalThis,k,d); else delete globalThis[k]
  }
})

test('legacy six-field browser preferences migrate to toast and selected author sounds persist', () => {
  const legacy = { sound: true, soundSeconds: 5, volume: 50, toast: true, toastSeconds: 8, desktop: false }
  assert.equal(n.parseBrowserNotificationPreferences(legacy).soundChoice, 'toast')
  const data = new Map()
  const center = new n.BrowserNotificationCenter({ storage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }, capabilities: () => ({}), now: () => 0 })
  for (const soundChoice of ['toast', 'modal', 'popup', 'bubble']) {
    assert.equal(center.save({ ...legacy, soundChoice }), true)
    assert.equal(JSON.parse(data.get(n.NOTIFICATION_PREFS_KEY)).soundChoice, soundChoice)
  }
  for (const soundChoice of ['fake', null, 7]) assert.throws(() => center.save({ ...legacy, soundChoice }))
  assert.throws(() => center.save({ ...legacy, extra: true }))
})
