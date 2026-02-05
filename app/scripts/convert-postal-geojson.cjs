const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const inputPath = path.resolve(__dirname, '..', 'public', 'postal-codes.json')
const outputPath = path.resolve(__dirname, '..', 'public', 'postal-codes.geojson')
const outputGzPath = path.resolve(__dirname, '..', 'public', 'postal-codes.geojson.gz')

const raw = fs.readFileSync(inputPath, 'utf8')
const data = JSON.parse(raw)

const features = []

for (const [postnummer, item] of Object.entries(data)) {
  if (!item || !item.geojson) continue

  let geometry = item.geojson
  if (typeof geometry === 'string') {
    try {
      geometry = JSON.parse(geometry)
    } catch (error) {
      continue
    }
  }

  if (!geometry || typeof geometry !== 'object') continue

  if (geometry.type === 'Feature' && geometry.geometry) {
    geometry = geometry.geometry
  }

  if (!geometry.type || !geometry.coordinates) continue

  const normalized = String(postnummer).padStart(4, '0')

  features.push({
    type: 'Feature',
    properties: {
      postnummer: normalized,
    },
    geometry,
  })
}

const featureCollection = {
  type: 'FeatureCollection',
  features,
}

fs.writeFileSync(outputPath, JSON.stringify(featureCollection))

const gzipped = zlib.gzipSync(Buffer.from(JSON.stringify(featureCollection)))
fs.writeFileSync(outputGzPath, gzipped)

console.log(`Wrote ${features.length} features to ${outputPath}`)
console.log(`Wrote gzip to ${outputGzPath}`)
