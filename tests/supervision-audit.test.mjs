import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SUPERVISION_DEFAULTS, INITIAL_SUPERVISION_CONFIG, resolveSupervisionSettings } from '../lib/controls/supervision-config.js'
import { SupervisionLedger } from '../lib/controls/supervision-ledger.js'
import { decideSupervisionTrigger, deterministicReview, initialSupervisionDocument, makeSupervisionEpisode, parseSupervisionDocument, supervisionAgentText, withSupervisionEpisode } from '../lib/controls/supervision-audit.js'

const at = Date.parse('2026-10-30T12:00:00Z')
const settings = { ...SUPERVISION_DEFAULTS, dryRun: false, deliverableRoots: ['src'], supportRoots: ['notes'] }
const summary = (over = {}) => ({ windowHours: 24, events: 1, sessions: 1, dropped: 0, productWrites: 0, supportWrites: 10,
  otherWrites: 0, productFiles: [], supportFiles: Array.from({ length: 10 }, (_, i) => 'notes/' + i + '.md'),
  lastProductAt: null, noProductHours: 5, supportOnly: true, rootsConfigured: true, recent: [], ...over })

test('scheduled episodes wait for the configured interval and one new activity', () => {
  const document = initialSupervisionDocument('owner', 'W', at)
  assert.equal(decideSupervisionTrigger(document, settings, summary({ events: 0, supportOnly: false, supportWrites: 0, supportFiles: [], noProductHours: null }), at + 59 * 60_000), null)
  assert.equal(decideSupervisionTrigger(document, settings, summary({ events: 1, productWrites: 2, supportOnly: false, supportFiles: [], supportWrites: 0, noProductHours: 1 }), at + 60 * 60_000), 'scheduled')
})

test('support-only surge becomes a suspicion episode with fixed advisory text', () => {
  const document = initialSupervisionDocument('owner', 'W', at)
  assert.equal(decideSupervisionTrigger(document, settings, summary(), at + 60_000), 'suspicion')
  assert.equal(decideSupervisionTrigger(document, { ...settings, suspicionMode: 'off' }, summary(), at + 60_000), null)
  assert.equal(decideSupervisionTrigger(document, settings, summary(), at + 60_000, 'off'), null)
  const review = deterministicReview('suspicion', summary())
  assert.equal(review.verdict, 'suspicion')
  const episode = makeSupervisionEpisode({ document, trigger: 'suspicion', review, summary: summary(), now: at + 60_000, delivery: 'card+agent', ticketId: 'T1', research: true })
  assert.equal(episode.ownerSessionId, 'owner')
  assert.equal(episode.ticketId, 'T1')
  assert.equal(episode.research, true)
  assert.match(supervisionAgentText(episode), /监督提示 · 轻量模型，仅供参考/)
  assert.match(supervisionAgentText(episode), /无需中断当前 subagents 的工作/)
  const next = withSupervisionEpisode(document, episode, settings, at + 60_000)
  assert.equal(next.revision, 1)
  assert.equal(next.lastSuspicionAt, at + 60_000)
  assert.equal(next.episodes.length, 1)
  assert.equal(parseSupervisionDocument(next).episodes[0].episodeId, episode.episodeId)
})

test('hourly calls and daily token budget stop further scheduled episodes', () => {
  const document = initialSupervisionDocument('owner', 'W', at)
  const healthy = summary({ events: 1, productWrites: 2, supportOnly: false, supportFiles: [], supportWrites: 0, noProductHours: 1 })
  assert.equal(decideSupervisionTrigger({ ...document, hourKey: '2026-10-30T13', hourCalls: 1 }, settings, healthy, at + 60 * 60_000), null)
  assert.equal(decideSupervisionTrigger({ ...document, dailyTokens: 120_000 }, settings, healthy, at + 60 * 60_000), null)
  const review = deterministicReview('scheduled', healthy)
  const episode = makeSupervisionEpisode({ document, trigger: 'scheduled', review, summary: healthy, now: at, delivery: 'none' })
  const next = withSupervisionEpisode(document, episode, settings, at, 321)
  assert.equal(next.hourCalls, 1)
  assert.equal(next.dailyTokens, 321)
})

test('manual scheduled review is conservative and dry-run has no delivery', () => {
  const document = initialSupervisionDocument('owner', 'W', at)
  const review = deterministicReview('scheduled', summary({ productWrites: 2, supportFiles: [], supportWrites: 0, supportOnly: false, noProductHours: 1 }))
  assert.equal(review.verdict, 'on-track')
  assert.equal(review.severity, 'info')
  const episode = makeSupervisionEpisode({ document, trigger: 'scheduled', review, summary: summary(), now: at, delivery: 'none' })
  assert.equal(episode.delivery, 'none')
  assert.equal(resolveSupervisionSettings(INITIAL_SUPERVISION_CONFIG, null).dryRun, true)
})
