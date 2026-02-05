/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'coop_prix.geojson')

const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]

const query = `
[out:json][timeout:120];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  nwr["shop"="supermarket"]["brand"~"Coop Prix", i](area.no);
  nwr["shop"="supermarket"]["name"~"Coop Prix", i](area.no);
);
out center tags;
`

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

async function requestOverpass() {
  const payload = new URLSearchParams({ data: query }).toString()
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: payload,
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        console.log(`Querying ${endpoint} (attempt ${attempt})...`)
        const response = await fetchWithTimeout(endpoint, options, 120000)
        if (!response.ok) {
          throw new Error(`Overpass request failed (${response.status})`)
        }
        return await response.json()
      } catch (error) {
        console.warn(`Overpass error from ${endpoint}: ${error.message || error}`)
      }
    }
  }

  throw new Error('All Overpass endpoints failed')
}

async function run() {
  const data = await requestOverpass()
  const features = []

  for (const element of data.elements || []) {
    const lat = element.lat ?? element.center?.lat
    const lon = element.lon ?? element.center?.lon
    if (lat == null || lon == null) continue

    const tags = element.tags || {}
    const addressParts = [
      tags['addr:street'],
      tags['addr:housenumber'],
      tags['addr:postcode'],
      tags['addr:city'],
    ].filter(Boolean)

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [lon, lat],
      },
      properties: {
        name: tags.name || 'Coop Prix',
        brand: tags.brand,
        address: addressParts.join(' '),
      },
    })
  }

  const geojson = {
    type: 'FeatureCollection',
    features,
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson))
  console.log(`Wrote ${features.length} Coop Prix features to ${OUTPUT_PATH}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
