import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('coop_stores.geojson matches expected schema', () => {
  const filePath = path.resolve(process.cwd(), 'public', 'coop_stores.geojson')
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  assert.equal(payload.type, 'FeatureCollection')
  assert.equal(Array.isArray(payload.features), true)
  assert.equal(payload.features.length > 0, true)

  payload.features.forEach((feature: Record<string, unknown>, index: number) => {
    const props = (feature.properties || {}) as Record<string, unknown>
    const geometry = (feature.geometry || {}) as Record<string, unknown>
    const coordinates = (geometry.coordinates || []) as unknown[]

    assert.equal(feature.type, 'Feature', `feature ${index}: type`)
    assert.equal(geometry.type, 'Point', `feature ${index}: geometry.type`)
    assert.equal(Array.isArray(coordinates), true, `feature ${index}: coordinates array`)
    assert.equal(coordinates.length, 2, `feature ${index}: coordinates length`)
    assert.equal(typeof props.name, 'string', `feature ${index}: name`)
    assert.equal(typeof props.address, 'string', `feature ${index}: address`)
    assert.equal(typeof props.chain, 'string', `feature ${index}: chain`)
    assert.equal(typeof props.samvirkelag, 'string', `feature ${index}: samvirkelag`)
    assert.equal(typeof props.source, 'string', `feature ${index}: source`)
    assert.equal(typeof props.nbd_group, 'boolean', `feature ${index}: nbd_group`)
  })
})
