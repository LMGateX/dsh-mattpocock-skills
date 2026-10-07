import test from 'node:test'
import assert from 'node:assert/strict'
import { memoized } from '../lib/controls/validation.js'

// Storage adapters already validate, detach and freeze the documents they return.
// Re-parsing that returned value on every read re-walked a whole store per event,
// which dominated CPU while a single agent was working.
test('an unchanged returned document is parsed once', () => {
  let parses = 0
  const parse = value => { parses += 1; return { revision: value.revision } }
  const stored = Object.freeze({ revision: 1 })
  const first = memoized(stored, parse)
  const second = memoized(stored, parse)
  assert.equal(first, second)
  assert.equal(parses, 1)
})

test('a changed document is parsed again', () => {
  let parses = 0
  const parse = value => { parses += 1; return { revision: value.revision } }
  const a = memoized({ revision: 1 }, parse)
  const b = memoized({ revision: 2 }, parse)
  assert.equal(parses, 2)
  assert.notEqual(a, b)
})

test('an already parsed document is never parsed twice', () => {
  let parses = 0
  const parse = () => { parses += 1; return Object.freeze({ revision: 0 }) }
  const first = memoized({ revision: 0 }, parse)
  assert.equal(parses, 1)
  const again = memoized(first, () => { throw new Error('must not re-parse a validated document') })
  assert.equal(again, first)
  assert.equal(parses, 1)
})

test('non-object values still flow through the parser', () => {
  const parse = value => 'parsed:' + String(value)
  assert.equal(memoized(undefined, parse), 'parsed:undefined')
  assert.equal(memoized(7, parse), 'parsed:7')
})
