import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifySamvirkelag,
  dedupeStoresByUrl,
  extractFromApiPayload,
  normalizeStoreFromApi,
} from '../../scripts/fetch-coop-prix-from-coop.cjs'

test('extractFromApiPayload handles nested payloads', () => {
  const payload = {
    data: {
      nested: [{ id: 1 }, { id: 2 }],
    },
  }
  const extracted = extractFromApiPayload(payload)
  assert.equal(Array.isArray(extracted), true)
  assert.equal(extracted.length, 2)
})

test('normalizeStoreFromApi normalizes chain and url', () => {
  const normalized = normalizeStoreFromApi({
    title: 'Coop Extra Test',
    address: { street: 'Gate 1', zipCode: '0150', city: 'Oslo' },
    chainDisplayName: 'Extra',
    cooperativeName: 'Samvirkelag X',
    url: '/butikker/extra-test',
  })

  assert.equal(normalized.chain, 'extra')
  assert.equal(normalized.url, 'https://www.coop.no/butikker/extra-test')
  assert.equal(normalized.samvirkelag, 'Samvirkelag X')
})

test('dedupeStoresByUrl keeps first store for duplicate URLs', () => {
  const deduped = dedupeStoresByUrl([
    { url: 'https://example/a', chain: 'extra' },
    { url: 'https://example/a', chain: 'prix' },
    { url: 'https://example/b', chain: 'mega' },
  ])

  assert.equal(deduped.length, 2)
  assert.equal(deduped[0].url, 'https://example/a')
  assert.equal(deduped[0].chain, 'extra')
})

test('classifySamvirkelag keeps whitelist values out of NBD group', () => {
  const report = {
    matched_by_chain_zip_name: 0,
    matched_by_chain_zip_address: 0,
    matched_by_name_prefix_fallback: 0,
    matched_by_address_token_fallback: 0,
    ambiguous_unresolved: 0,
    unmatched_total: 0,
    unresolved_samples: [],
  }
  const references = {
    samvirkelagRules: {
      samvirkelagWhitelistMap: new Map([['coop nordvest', 'Coop Nordvest']]),
    },
    nbasReference: {
      byChainZip: new Map(),
    },
  }

  const result = classifySamvirkelag(
    {
      name: 'Coop Extra Test',
      samvirkelag: 'Coop Nordvest',
      chain: 'extra',
      address: '0150 Oslo',
    },
    report,
    references,
  )

  assert.equal(result.samvirkelag, 'Coop Nordvest')
  assert.equal(result.nbd_group, false)
})
