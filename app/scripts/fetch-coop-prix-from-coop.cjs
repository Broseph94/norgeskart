/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')

const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'coop_stores.geojson')
const CACHE_DIR = path.resolve(__dirname, '..', '.cache')
const CACHE_PATH = path.resolve(CACHE_DIR, 'coop_store_cache.json')

const USER_AGENT = 'Norgeskart Coop store scraper (educational use)'
const MAX_STORES = Number(process.env.COOP_MAX_STORES || 0)
const LIST_HTML_PATH = process.env.COOP_LIST_PATH
const DEFAULT_API_URL = 'https://www.coop.no/api/content/butikker?coop_chain=Mega&coop_chain=Prix&coop_chain=Obs&coop_chain=Extra&coop_chain=ObsBygg&notify=true'
const COOP_API_URL = process.env.COOP_API_URL || DEFAULT_API_URL
const CONCURRENCY = Number(process.env.COOP_CONCURRENCY || 6)
const REQUEST_DELAY_MS = Number(process.env.COOP_REQUEST_DELAY_MS || 200)

const CHAINS = [
  { id: 'prix', query: 'Prix', label: 'Coop Prix' },
  { id: 'extra', query: 'Extra', label: 'Coop Extra' },
  { id: 'mega', query: 'Mega', label: 'Coop Mega' },
  { id: 'obs', query: 'Obs', label: 'Obs' },
  { id: 'obsbygg', query: 'ObsBygg', label: 'Obs Bygg' },
]

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

function buildBaseUrl(query) {
  return `https://www.coop.no/butikker?coop_chain=${encodeURIComponent(query)}`
}

function extractMaxPage(html) {
  const matches = [...html.matchAll(/[?&](?:p|page)=(\d+)/g)].map((match) => Number(match[1]))
  const max = matches.length ? Math.max(...matches) : 1
  return Number.isFinite(max) && max > 0 ? max : 1
}

function buildPageUrl(baseUrl, page) {
  if (page <= 1) return baseUrl
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}p=${page}`
}

function extractStoreLinks(html) {
  const $ = cheerio.load(html)
  const links = new Set()

  $('a[href^="/butikker/"]').each((_, element) => {
    const href = $(element).attr('href') || ''
    if (/\/butikker\//i.test(href)) {
      links.add(`https://www.coop.no${href.split('#')[0]}`)
    }
  })

  if (!links.size) {
    const matches = [...html.matchAll(/\/butikker\/[^"'<\s]+/g)].map((match) => match[0])
    matches.forEach((path) => links.add(`https://www.coop.no${path.split('#')[0]}`))
  }

  return Array.from(links)
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {}
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
  } catch (error) {
    return {}
  }
}

function saveCache(cache) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
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
              chainName: item.brand?.name || '',
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
  return value.replace(/\\'/g, "'").replace(/\\/g, '\\')
}

function parseInitialData(html) {
  const match = html.match(/window\.INITIAL_DATA\s*=\s*JSON\.parse\('([\s\S]*?)'\);/)
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
        chainName: page?.chainDisplayName || '',
        cooperativeName: page?.cooperativeName || '',
      }
    }
  } catch (error) {
    return null
  }
  return null
}

function parseGoogleMapsLink(html) {
  const pattern = new RegExp('google\\.com\\/maps\\?q=loc:([0-9.]+),([0-9.]+)', 'i')
  const match = html.match(pattern)
  if (!match) return null
  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  }
}

function normalizeChainId(raw) {
  const value = raw.toLowerCase()
  if (value.includes('prix')) return 'prix'
  if (value.includes('extra')) return 'extra'
  if (value.includes('mega')) return 'mega'
  if (value.includes('obs bygg') || value.includes('bygg')) return 'obsbygg'
  if (value.includes('obs')) return 'obs'
  return ''
}

function extractFromApiPayload(payload) {
  if (payload && Array.isArray(payload.storeList)) return payload.storeList
  const candidates = []
  const maybeArray = Array.isArray(payload) ? payload : null
  if (maybeArray) return maybeArray

  const stack = [payload]
  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      candidates.push(...current)
      continue
    }
    Object.values(current).forEach((value) => {
      if (Array.isArray(value)) candidates.push(...value)
      else if (value && typeof value === 'object') stack.push(value)
    })
  }
  return candidates
}

function normalizeStoreFromApi(item) {
  const name = item.title || item.name || item.displayName || ''
  const addressObj = item.address || {}
  const address = addressObj.street
    ? `${addressObj.street}${addressObj.street ? ',' : ''} ${addressObj.zipCode || ''} ${addressObj.city || ''}`.trim()
    : item.addressLine || item.address || ''

  const chainName = item.chainDisplayName || item.chainName || item.chain || ''
  const theme = item.theme || ''
  const chain = normalizeChainId(String(chainName)) || normalizeChainId(String(theme)) || normalizeChainId(String(name))
  const samvirkelag = item.cooperativeName || item.cooperative || ''
  const url = item.url ? `https://www.coop.no${item.url}` : ''

  return {
    name: String(name || '').trim(),
    address: String(address || '').trim(),
    chain,
    samvirkelag: String(samvirkelag || '').trim(),
    url,
  }
}

function toFeature(details) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [details.longitude, details.latitude],
    },
    properties: {
      name: details.name,
      address: details.address,
      chain: details.chain,
      samvirkelag: details.samvirkelag,
      source: details.url,
    },
  }
}

function extractStoreDetails(html, chainFallback) {
  const $ = cheerio.load(html)
  const name = cleanText($('h1').first().text()) || chainFallback.label

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

  const jsonLd = parseJsonLd(html)
  const initialData = parseInitialData(html)
  const googleCoords = parseGoogleMapsLink(html)

  const latitude =
    jsonLd?.latitude ?? initialData?.latitude ?? googleCoords?.latitude ?? null
  const longitude =
    jsonLd?.longitude ?? initialData?.longitude ?? googleCoords?.longitude ?? null

  const chainName = initialData?.chainName || jsonLd?.chainName || chainFallback.label
  const chainId = normalizeChainId(chainName) || chainFallback.id

  return {
    name: jsonLd?.name || initialData?.name || name,
    address: jsonLd?.address || initialData?.address || address,
    latitude,
    longitude,
    chain: chainId,
    samvirkelag: initialData?.cooperativeName || '',
  }
}

async function getStoreLinksForChain(chain) {
  console.log(`Fetching store list for ${chain.label}...`)
  let allLinks = new Set()

  if (LIST_HTML_PATH && fs.existsSync(LIST_HTML_PATH) && chain.id === 'prix') {
    console.log(`Using local list HTML: ${LIST_HTML_PATH}`)
    const html = fs.readFileSync(LIST_HTML_PATH, 'utf8')
    allLinks = new Set(extractStoreLinks(html))
  } else {
    const baseUrl = buildBaseUrl(chain.query)
    const firstPageHtml = await fetchHtml(baseUrl)
    const maxPage = extractMaxPage(firstPageHtml)

    allLinks = new Set(extractStoreLinks(firstPageHtml))

    for (let page = 2; page <= maxPage; page += 1) {
      const html = await fetchHtml(buildPageUrl(baseUrl, page))
      extractStoreLinks(html).forEach((link) => allLinks.add(link))
    }
  }

  return Array.from(allLinks)
}

async function run() {
  console.log('Fetching store list from API...')
  const apiUrl = COOP_API_URL.includes('count=')
    ? COOP_API_URL
    : `${COOP_API_URL}&count=5000`
  const apiResponse = await fetch(apiUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'no,en;q=0.8',
    },
  })
  if (!apiResponse.ok) {
    throw new Error(`API request failed (${apiResponse.status})`)
  }
  const payload = await apiResponse.json()
  const candidates = extractFromApiPayload(payload)

  const normalizedStores = candidates
    .map((item) => normalizeStoreFromApi(item))
    .filter((item) => item && item.chain && item.url)

  const cache = loadCache()
  const features = []
  const tasks = []

  let count = 0
  for (const store of normalizedStores) {
    count += 1
    if (MAX_STORES && count > MAX_STORES) break
    tasks.push(store)
  }

  console.log(`Processing ${tasks.length} store pages with concurrency ${CONCURRENCY}...`)

  let inFlight = 0
  let index = 0

  async function processNext() {
    if (index >= tasks.length) return
    const current = tasks[index]
    index += 1
    inFlight += 1

    try {
      if (cache[current.url]) {
        features.push(cache[current.url])
      } else {
        const html = await fetchHtml(current.url)
        const details = extractStoreDetails(html, { id: current.chain, label: current.chain })
        const latitude = details.latitude ?? null
        const longitude = details.longitude ?? null
        const samvirkelag = details.samvirkelag || current.samvirkelag

        if (latitude == null || longitude == null) {
          console.warn(`No coordinates found for ${current.name} (${current.url})`)
        } else {
          const finalDetails = {
            name: details.name || current.name,
            address: details.address || current.address,
            chain: current.chain,
            samvirkelag,
            url: current.url,
            latitude,
            longitude,
          }
          const feature = toFeature(finalDetails)
          cache[current.url] = feature
          features.push(feature)
        }
        saveCache(cache)
        await sleep(REQUEST_DELAY_MS)
      }
    } catch (error) {
      console.warn(`Failed to process ${current.url}: ${error.message || error}`)
    } finally {
      inFlight -= 1
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (index < tasks.length) {
      await processNext()
      console.log(`Progress: ${features.length}/${tasks.length}`)
    }
  })

  await Promise.all(workers)

  const geojson = {
    type: 'FeatureCollection',
    features,
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson))
  console.log(`Wrote ${features.length} Coop store features to ${OUTPUT_PATH}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
