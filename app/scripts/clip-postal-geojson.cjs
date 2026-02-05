/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const turf = require('@turf/turf')

const POSTAL_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.geojson')
const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.clipped.geojson')
const OUTPUT_GZ_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.clipped.geojson.gz')

const MASK_PATH = process.env.NORWAY_MASK_PATH
const GAP_AREA_MAX = Number(process.env.GAP_AREA_MAX || Infinity) // square meters

if (!MASK_PATH || !fs.existsSync(MASK_PATH)) {
  console.error('Missing NORWAY_MASK_PATH. Example: NORWAY_MASK_PATH=/path/to/norway-land.geojson npm run clip:postal')
  process.exit(1)
}

function loadGeoJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeMask(mask) {
  if (mask.type === 'FeatureCollection') {
    return turf.featureCollection(mask.features.map((feature) => feature))
  }
  if (mask.type === 'Feature') {
    return turf.featureCollection([mask])
  }
  return turf.featureCollection([{ type: 'Feature', properties: {}, geometry: mask }])
}

function unionMask(features) {
  let merged = null
  for (const feature of features) {
    if (!merged) {
      merged = feature
      continue
    }
    try {
      merged = turf.union(turf.featureCollection([merged, feature]))
    } catch (error) {
      // Skip union errors on invalid geometries
    }
  }
  return merged
}

function clipPostalCodes(postalData, landMask) {
  const clipped = []
  const landBbox = turf.bbox(landMask)
  const total = postalData.features?.length || 0
  let processed = 0
  for (const feature of postalData.features || []) {
    if (!feature.geometry) continue
    processed += 1
    if (processed % 100 === 0) {
      console.log(`Clipping progress: ${processed}/${total}`)
    }
    try {
      const featureBbox = turf.bbox(feature)
      const overlaps =
        featureBbox[0] <= landBbox[2] &&
        featureBbox[2] >= landBbox[0] &&
        featureBbox[1] <= landBbox[3] &&
        featureBbox[3] >= landBbox[1]
      if (!overlaps) continue
      const intersected = turf.intersect(turf.featureCollection([feature, landMask]))
      if (intersected && intersected.geometry) {
        clipped.push({
          type: 'Feature',
          properties: feature.properties || {},
          geometry: intersected.geometry,
        })
      }
    } catch (error) {
      // Skip invalid geometries
    }
  }
  return turf.featureCollection(clipped)
}

function buildGapFeatures(landMask, unionedPostal) {
  if (!unionedPostal) return []
  let diff
  try {
    diff = turf.difference(turf.featureCollection([landMask, unionedPostal]))
  } catch (error) {
    return []
  }
  if (!diff) return []

  const polygons = diff.geometry.type === 'MultiPolygon'
    ? diff.geometry.coordinates.map((coords) => turf.polygon(coords))
    : [diff]

  return polygons
}

function assignGapsToNearest(clipped, gaps) {
  if (!gaps.length) return []
  const additions = []

  const centroidCache = clipped.features.map((feature) => ({
    feature,
    centroid: turf.centroid(feature),
  }))

  gaps.forEach((gapFeature) => {
    const area = turf.area(gapFeature)
    if (area > GAP_AREA_MAX) return

    const gapCenter = turf.centroid(gapFeature)
    let best = null

    for (const entry of centroidCache) {
      const distance = turf.distance(gapCenter, entry.centroid, { units: 'kilometers' })
      if (!best || distance < best.distance) {
        best = { distance, feature: entry.feature }
      }
    }

    if (best?.feature) {
      additions.push({
        type: 'Feature',
        properties: best.feature.properties || {},
        geometry: gapFeature.geometry,
      })
    }
  })

  return additions
}

function run() {
  const postalData = loadGeoJSON(POSTAL_PATH)
  const maskData = loadGeoJSON(MASK_PATH)
  const maskFeatures = normalizeMask(maskData)
  const landMask = unionMask(maskFeatures.features)

  if (!landMask) {
    throw new Error('Failed to build land mask geometry')
  }

  console.log('Clipping postal polygons to land mask...')
  const clipped = clipPostalCodes(postalData, landMask)
  console.log(`Clipped to ${clipped.features.length} features.`)

  console.log('Finding gaps...')
  const unionedPostal = unionMask(clipped.features)
  const gaps = buildGapFeatures(landMask, unionedPostal)
  console.log(`Found ${gaps.length} gap polygons.`)

  const additions = assignGapsToNearest(clipped, gaps)
  console.log(`Filling ${additions.length} gaps (area <= ${Number.isFinite(GAP_AREA_MAX) ? GAP_AREA_MAX : 'Infinity'} m²).`)

  const finalFeatures = [...clipped.features, ...additions]
  const output = turf.featureCollection(finalFeatures)

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output))
  fs.writeFileSync(OUTPUT_GZ_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(output))))

  console.log(`Wrote ${output.features.length} features to ${OUTPUT_PATH}`)
  console.log(`Wrote gzip to ${OUTPUT_GZ_PATH}`)
}

try {
  run()
} catch (error) {
  console.error(error)
  process.exit(1)
}
