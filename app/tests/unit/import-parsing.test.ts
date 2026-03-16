import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractValuesFromObjectRows,
  findPostalHeaderKey,
  flattenMatrix,
  flattenUnknownRows,
} from '../../src/utils/importParsing.ts'

test('findPostalHeaderKey picks the configured postal header', () => {
  assert.equal(findPostalHeaderKey(['Navn', 'Postnummer', 'Adresse']), 'Postnummer')
  assert.equal(findPostalHeaderKey(['foo', 'zip']), 'zip')
  assert.equal(findPostalHeaderKey(['foo', 'bar']), null)
})

test('extractValuesFromObjectRows returns stringified values', () => {
  const rows = [{ postnummer: '0150' }, { postnummer: 151 }, { postnummer: '' }]
  assert.deepEqual(extractValuesFromObjectRows(rows, 'postnummer'), ['0150', '151'])
})

test('flattenUnknownRows handles arrays, objects, and primitives', () => {
  const rows: unknown[] = [['0150', 151], { a: '0152' }, '0153', null]
  assert.deepEqual(flattenUnknownRows(rows), ['0150', '151', '0152', '0153'])
})

test('flattenMatrix converts all cells to strings', () => {
  const matrix = [
    ['0150', 151],
    [null, '0152'],
  ]
  assert.deepEqual(flattenMatrix(matrix), ['0150', '151', '', '0152'])
})
