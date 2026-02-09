/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const turf = require('@turf/turf')

const POSTAL_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.geojson')
const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.clipped.geojson')
const OUTPUT_GZ_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.clipped.geojson.gz')
const DISSOLVED_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.dissolved.geojson')
const DISSOLVED_GZ_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.dissolved.geojson.gz')
const LABELS_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.labels.geojson')
const LABELS_GZ_PATH = path.resolve(__dirname, '..', 'public', 'postal-codes.labels.geojson.gz')

const MASK_PATH = process.env.NORWAY_MASK_PATH
const BORDER_MASK_PATH = process.env.BORDER_MASK_PATH
const CLIP_MODE = process.env.CLIP_MODE || 'coast' // coast | border | gapfill-border | none
const GAP_AREA_MAX = Number(process.env.GAP_AREA_MAX || Infinity) // square meters

if (CLIP_MODE !== 'none' && !MASK_PATH && !BORDER_MASK_PATH) {
  console.error('Missing mask path. Provide NORWAY_MASK_PATH (coast) or BORDER_MASK_PATH (border) or set CLIP_MODE=none.')
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

function dissolveByPostnummer(features) {
  const grouped = new Map()
  for (const feature of features) {
    const postnummer = feature?.properties?.postnummer
    if (!postnummer) continue
    if (!grouped.has(postnummer)) grouped.set(postnummer, [])
    grouped.get(postnummer).push(feature)
  }

  const dissolved = []
  for (const [postnummer, group] of grouped.entries()) {
    let merged = null
    for (const feature of group) {
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
    if (merged && merged.geometry) {
      dissolved.push({
        type: 'Feature',
        properties: { postnummer },
        geometry: merged.geometry,
      })
    }
  }
  return turf.featureCollection(dissolved)
}

function buildLabelPoints(dissolved) {
  const labels = []
  for (const feature of dissolved.features || []) {
    try {
      const centroid = turf.centroid(feature)
      labels.push({
        type: 'Feature',
        properties: { postnummer: feature?.properties?.postnummer },
        geometry: centroid.geometry,
      })
    } catch (error) {
      // skip invalid geometries
    }
  }
  return turf.featureCollection(labels)
}

function run() {
  const postalData = loadGeoJSON(POSTAL_PATH)
  let output

  if (CLIP_MODE === 'none') {
    console.log('Skipping clipping (CLIP_MODE=none). Using original postal polygons.')
    output = postalData
  } else if (CLIP_MODE === 'gapfill-border') {
    const maskPath = BORDER_MASK_PATH || MASK_PATH
    if (!maskPath) {
      throw new Error('Missing BORDER_MASK_PATH for CLIP_MODE=gapfill-border')
    }
    const maskData = loadGeoJSON(maskPath)
    const maskFeatures = normalizeMask(maskData)
    const borderMask = unionMask(maskFeatures.features)

    if (!borderMask) {
      throw new Error('Failed to build border mask geometry')
    }

    console.log('Filling gaps using border mask (no coastline clipping)...')
    const unionedPostal = unionMask(postalData.features || [])
    const gaps = buildGapFeatures(borderMask, unionedPostal)
    console.log(`Found ${gaps.length} gap polygons.`)

    const additions = assignGapsToNearest(postalData, gaps)
    console.log(`Filling ${additions.length} gaps (area <= ${Number.isFinite(GAP_AREA_MAX) ? GAP_AREA_MAX : 'Infinity'} m²).`)

    output = turf.featureCollection([...(postalData.features || []), ...additions])
  } else {
    const maskPath = CLIP_MODE === 'border'
      ? (BORDER_MASK_PATH || MASK_PATH)
      : MASK_PATH
    const maskData = loadGeoJSON(maskPath)
    const maskFeatures = normalizeMask(maskData)
    const landMask = unionMask(maskFeatures.features)

    if (!landMask) {
      throw new Error('Failed to build mask geometry')
    }

    console.log(`Clipping postal polygons (${CLIP_MODE})...`)
    const clipped = clipPostalCodes(postalData, landMask)
    console.log(`Clipped to ${clipped.features.length} features.`)

    if (CLIP_MODE === 'coast') {
      console.log('Finding gaps...')
      const unionedPostal = unionMask(clipped.features)
      const gaps = buildGapFeatures(landMask, unionedPostal)
      console.log(`Found ${gaps.length} gap polygons.`)

      const additions = assignGapsToNearest(clipped, gaps)
      console.log(`Filling ${additions.length} gaps (area <= ${Number.isFinite(GAP_AREA_MAX) ? GAP_AREA_MAX : 'Infinity'} m²).`)

      output = turf.featureCollection([...clipped.features, ...additions])
    } else {
      output = clipped
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output))
  fs.writeFileSync(OUTPUT_GZ_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(output))))

  console.log(`Wrote ${output.features.length} features to ${OUTPUT_PATH}`)
  console.log(`Wrote gzip to ${OUTPUT_GZ_PATH}`)

  console.log('Dissolving polygons by postnummer...')
  const dissolved = dissolveByPostnummer(output.features)
  fs.writeFileSync(DISSOLVED_PATH, JSON.stringify(dissolved))
  fs.writeFileSync(DISSOLVED_GZ_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(dissolved))))
  console.log(`Wrote ${dissolved.features.length} features to ${DISSOLVED_PATH}`)
  console.log(`Wrote gzip to ${DISSOLVED_GZ_PATH}`)

  console.log('Building label points...')
  const labels = buildLabelPoints(dissolved)
  fs.writeFileSync(LABELS_PATH, JSON.stringify(labels))
  fs.writeFileSync(LABELS_GZ_PATH, zlib.gzipSync(Buffer.from(JSON.stringify(labels))))
  console.log(`Wrote ${labels.features.length} features to ${LABELS_PATH}`)
  console.log(`Wrote gzip to ${LABELS_GZ_PATH}`)
}

try {
  run()
} catch (error) {
  console.error(error)
  process.exit(1)
}
