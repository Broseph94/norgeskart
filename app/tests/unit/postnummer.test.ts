import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePostnummer } from '../../src/utils/postnummer.ts'

test('normalizePostnummer returns a 4-digit value when valid', () => {
  assert.equal(normalizePostnummer('0150'), '0150')
  assert.equal(normalizePostnummer(' 01 50 '), '0150')
})

test('normalizePostnummer rejects non-4-digit values', () => {
  assert.equal(normalizePostnummer('150'), null)
  assert.equal(normalizePostnummer('00150'), null)
  assert.equal(normalizePostnummer('abcd'), null)
})
