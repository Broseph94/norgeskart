import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalizeAddress,
  canonicalizeStoreName,
  inferChainFromName,
  normalizeForCompare,
} from '../../src/utils/storeNormalization.ts'

test('frontend wrapper normalizeForCompare matches shared behavior', () => {
  assert.equal(normalizeForCompare('  Norsk   Butikkdrift  '), 'norsk butikkdrift')
})

test('frontend wrapper canonicalizeStoreName keeps chain normalization behavior', () => {
  assert.equal(canonicalizeStoreName('COOP EXTRA BISLETT, NBDA'), 'extra bislett')
  assert.equal(canonicalizeStoreName('Coop Obs Bygg Forus'), 'obs bygg forus')
})

test('frontend wrapper canonicalizeAddress and inferChainFromName stay stable', () => {
  assert.equal(canonicalizeAddress('JERNBANEGT. 1'), 'jernbanegt 1')
  assert.equal(inferChainFromName('Coop Mega Nydalen'), 'mega')
})
