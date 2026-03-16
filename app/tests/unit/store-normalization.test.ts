import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalizeAddress,
  canonicalizeStoreName,
  inferChainFromName,
  normalizeForCompare,
} from '../../shared/store-normalization.cjs'

test('normalizeForCompare lowercases and normalizes spacing', () => {
  assert.equal(normalizeForCompare('  Norsk   Butikkdrift  '), 'norsk butikkdrift')
})

test('canonicalizeStoreName normalizes coop prefixes', () => {
  assert.equal(canonicalizeStoreName('COOP EXTRA BISLETT, NBDA'), 'extra bislett')
  assert.equal(canonicalizeStoreName('Coop Obs Bygg Forus'), 'obs bygg forus')
})

test('canonicalizeAddress expands common abbreviations', () => {
  assert.equal(canonicalizeAddress('JERNBANEGT. 1'), 'jernbanegt 1')
  assert.equal(canonicalizeAddress('ALGARHEIMSVN. 77'), 'algarheimsvn 77')
})

test('inferChainFromName resolves chain prefix consistently', () => {
  assert.equal(inferChainFromName('Coop Extra Majorstuen'), 'extra')
  assert.equal(inferChainFromName('Coop Mega Nydalen'), 'mega')
  assert.equal(inferChainFromName('Ukjent butikk'), '')
})
