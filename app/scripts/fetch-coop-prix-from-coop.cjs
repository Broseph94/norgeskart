/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'coop_prix.geojson')

const BASE_URL = 'https://www.coop.no/butikker?coop_chain=Prix'
const USER_AGENT = 'Norgeskart Coop Prix scraper (educational use)'
const MAX_STORES = Number(process.env.COOP_MAX_STORES || 0)
const LIST_HTML_PATH = process.env.COOP_LIST_PATH

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'no,en;q=0.8',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`)
  }
  return await response.text()
}

function extractMaxPage(html) {
  const matches = [...html.matchAll(/[?&](?:p|page)=(\d+)/g)].map((match) => Number(match[1]))
  const max = matches.length ? Math.max(...matches) : 1
  return Number.isFinite(max) && max > 0 ? max : 1
}

function buildPageUrl(page) {
  if (page <= 1) return BASE_URL
  const separator = BASE_URL.includes('?') ? '&' : '?'
  return `${BASE_URL}${separator}p=${page}`
}

function extractStoreLinks(html) {
  const $ = cheerio.load(html)
  const links = new Set()

  $('a[href^="/butikker/"]').each((_, element) => {
    const href = $(element).attr('href') || ''
    if (/coop-prix/i.test(href)) {
      links.add(`https://www.coop.no${href.split('#')[0]}`)
    }
  })

  if (!links.size) {
    const matches = [...html.matchAll(/\/butikker\/coop-prix\/[^"'<\s]+/g)].map((match) => match[0])
    matches.forEach((path) => links.add(`https://www.coop.no${path.split('#')[0]}`))
  }

  return Array.from(links)
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function parseJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  for (const match of matches) {
    const raw = match[1].trim()
    if (!raw) continue
    try {
      const json = JSON.parse(raw)
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        if (item['@type'] === 'Store' || item['@type'] === 'LocalBusiness') {
          const coords = item.location?.geoCoordinates || item.geo || {}
          if (coords.latitude != null && coords.longitude != null) {
            return {
              name: item.name || '',
              address: item.address?.streetAddress
                ? `${item.address.streetAddress}, ${item.address.postalCode || ''} ${item.address.addressLocality || ''}`.trim()
                : '',
              latitude: Number(coords.latitude),
              longitude: Number(coords.longitude),
            }
          }
        }
      }
    } catch (error) {
      continue
    }
  }
  return null
}

function decodeJsString(value) {
  return value.replace(/\\\\'/g, "'").replace(/\\\\/g, '\\')
}

function parseInitialData(html) {
  const match = html.match(/window\\.INITIAL_DATA\\s*=\\s*JSON\\.parse\\('([\\s\\S]*?)'\\);/)
  if (!match) return null
  try {
    const jsonString = decodeJsString(match[1])
    const data = JSON.parse(jsonString)
    const page = data?.page
    const coords = page?.coordinates
    const address = page?.address
    if (coords?.latitude != null && coords?.longitude != null) {
      const addressText = address
        ? `${address.street || ''}${address.street ? ',' : ''} ${address.zipCode || ''} ${address.city || ''}`.trim()
        : ''
      return {
        name: page?.title || '',
        address: addressText,
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
      }
    }
  } catch (error) {
    return null
  }
  return null
}

function parseGoogleMapsLink(html) {
  const pattern = new RegExp('google\\\\.com\\\\/maps\\\\?q=loc:([0-9.]+),([0-9.]+)', 'i')
  const match = html.match(pattern)
  if (!match) return null
  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  }
}

function extractStoreDetails(html) {
  const $ = cheerio.load(html)
  const name = cleanText($('h1').first().text()) || 'Coop Prix'

  const selectors = [
    'address',
    '[itemprop="address"]',
    '.store-address',
    '.address',
    '.dv.l9.eq',
  ]

  let address = ''
  for (const selector of selectors) {
    const text = cleanText($(selector).first().text())
    if (text) {
      address = text
      break
    }
  }

  if (!address) {
    const fallback = cleanText($('main').text())
    const match = fallback.match(/(\d{4}\s+[A-Za-zÆØÅæøå .-]+)$/)
    if (match) {
      address = match[1]
    }
  }

  const jsonLd = parseJsonLd(html)
  const initialData = parseInitialData(html)
  const googleCoords = parseGoogleMapsLink(html)

  const latitude =
    jsonLd?.latitude ?? initialData?.latitude ?? googleCoords?.latitude ?? null
  const longitude =
    jsonLd?.longitude ?? initialData?.longitude ?? googleCoords?.longitude ?? null

  return {
    name: jsonLd?.name || initialData?.name || name,
    address: jsonLd?.address || initialData?.address || address,
    latitude,
    longitude,
  }
}

async function run() {
  console.log('Fetching Coop Prix store list...')
  let allLinks = new Set()

  if (LIST_HTML_PATH && fs.existsSync(LIST_HTML_PATH)) {
    console.log(`Using local list HTML: ${LIST_HTML_PATH}`)
    const html = fs.readFileSync(LIST_HTML_PATH, 'utf8')
    allLinks = new Set(extractStoreLinks(html))
  } else {
    const firstPageHtml = await fetchHtml(BASE_URL)
    const maxPage = extractMaxPage(firstPageHtml)

    allLinks = new Set(extractStoreLinks(firstPageHtml))

    for (let page = 2; page <= maxPage; page += 1) {
      const html = await fetchHtml(buildPageUrl(page))
      extractStoreLinks(html).forEach((link) => allLinks.add(link))
    }
  }

  const storeLinks = Array.from(allLinks)
  console.log(`Found ${storeLinks.length} Coop Prix store pages.`)

  const features = []

  let count = 0
  for (const link of storeLinks) {
    count += 1
    if (MAX_STORES && count > MAX_STORES) break

    console.log(`(${count}/${storeLinks.length}) ${link}`)
    const html = await fetchHtml(link)
    const { name, address, latitude, longitude } = extractStoreDetails(html)

    if (latitude == null || longitude == null) {
      console.warn(`No coordinates found for ${name} (${link})`)
      continue
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      properties: {
        name,
        address,
        source: link,
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
