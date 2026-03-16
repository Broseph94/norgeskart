const fs = require('fs')
const path = require('path')
const cheerio = require('cheerio')
const {
  addressTokens,
  canonicalizeAddress,
  canonicalizeStoreName,
  extractZipFromAddress,
  inferChainFromName,
  normalizeChainId,
  normalizeForCompare,
} = require(path.resolve(__dirname, '..', 'shared', 'store-normalization.cjs'))

const OUTPUT_PATH = path.resolve(__dirname, '..', 'public', 'coop_stores.geojson')
const CACHE_DIR = path.resolve(__dirname, '..', '.cache')
const CACHE_PATH = path.resolve(CACHE_DIR, 'coop_store_cache.json')
const MATCH_REPORT_PATH = path.resolve(CACHE_DIR, 'samvirkelag-match-report.json')
const SAMVIRKELAG_RULES_PATH = path.resolve(__dirname, '..', 'config', 'samvirkelag-rules.json')
const NBAS_REFERENCE_PATH = path.resolve(__dirname, '..', 'config', 'nbas-store-reference.json')
const SAMVIRKELAG_RULES_PUBLIC_PATH = path.resolve(__dirname, '..', 'public', 'samvirkelag-rules.json')

const USER_AGENT = 'Norgeskart Coop store scraper (educational use)'
const DEFAULT_API_URL =
  'https://www.coop.no/api/content/butikker?coop_chain=Mega&coop_chain=Prix&coop_chain=Obs&coop_chain=Extra&coop_chain=ObsBygg&notify=true'
const COOP_API_URL = process.env.COOP_API_URL || DEFAULT_API_URL

function readIntEnv(name, defaultValue, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = process.env[name]
  if (rawValue == null || rawValue === '') return defaultValue
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${rawValue}`)
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}; received ${parsed}`)
  }
  return parsed
}

const MAX_STORES = readIntEnv('COOP_MAX_STORES', 0, { min: 0, max: 50000 })
const CONCURRENCY = readIntEnv('COOP_CONCURRENCY', 6, { min: 1, max: 32 })
const REQUEST_DELAY_MS = readIntEnv('COOP_REQUEST_DELAY_MS', 200, { min: 0, max: 10000 })
const REQUEST_TIMEOUT_MS = readIntEnv('COOP_REQUEST_TIMEOUT_MS', 15000, { min: 1000, max: 120000 })
const FETCH_RETRIES = readIntEnv('COOP_FETCH_RETRIES', 2, { min: 0, max: 10 })
const FETCH_RETRY_BASE_DELAY_MS = readIntEnv('COOP_FETCH_RETRY_BASE_DELAY_MS', 400, {
  min: 100,
  max: 30000,
})
const MIN_EXPECTED_STORES = readIntEnv('COOP_MIN_EXPECTED_STORES', 0, { min: 0, max: 10000 })
const CACHE_SAVE_EVERY = readIntEnv('COOP_CACHE_SAVE_EVERY', 50, { min: 1, max: 5000 })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchWithRetry(url, options = {}, meta = 'request') {
  let lastError = null
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, REQUEST_TIMEOUT_MS)
      if (!response.ok) {
        throw new Error(`${meta} failed with status ${response.status}`)
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= FETCH_RETRIES) break
      const backoff = FETCH_RETRY_BASE_DELAY_MS * 2 ** attempt
      await sleep(backoff)
    }
  }
  throw lastError || new Error(`${meta} failed`)
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function atomicWriteFile(targetPath, content) {
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  )
  fs.writeFileSync(tempPath, content)
  fs.renameSync(tempPath, targetPath)
}

function atomicWriteJson(targetPath, value, spaces = 0) {
  atomicWriteFile(targetPath, JSON.stringify(value, null, spaces))
}

function safeReadJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallbackValue
  }
}

function loadSamvirkelagRules() {
  const fallback = {
    norskButikkdriftLabel: 'Norsk Butikkdrift',
    samvirkelagWhitelistMap: new Map(),
  }
  const parsed = safeReadJson(SAMVIRKELAG_RULES_PATH, null)
  if (!parsed) return fallback

  const norskButikkdriftLabel =
    typeof parsed?.norskButikkdriftLabel === 'string' && parsed.norskButikkdriftLabel.trim()
      ? parsed.norskButikkdriftLabel.trim()
      : fallback.norskButikkdriftLabel

  const samvirkelagWhitelistMap = new Map()
  if (Array.isArray(parsed?.samvirkelagWhitelist)) {
    parsed.samvirkelagWhitelist.forEach((value) => {
      const clean = String(value || '').trim()
      if (!clean) return
      samvirkelagWhitelistMap.set(normalizeForCompare(clean), clean)
    })
  }

  return { norskButikkdriftLabel, samvirkelagWhitelistMap }
}

function loadNbasReference() {
  const parsed = safeReadJson(NBAS_REFERENCE_PATH, null)
  if (!parsed) {
    return {
      records: [],
      byChainZip: new Map(),
    }
  }

  const records = Array.isArray(parsed?.records) ? parsed.records : []
  const normalized = records
    .map((row) => {
      const chainId =
        normalizeChainId(String(row.chain_id || row.chain_raw || '')) ||
        inferChainFromName(String(row.name_raw || ''))
      const zip = String(row.zip || '').trim()
      const nameCanonical = canonicalizeStoreName(String(row.name_canonical || row.name_raw || ''))
      const addressCanonical = canonicalizeAddress(
        String(row.address_canonical || row.address_raw || ''),
      )
      return {
        name_raw: String(row.name_raw || ''),
        address_raw: String(row.address_raw || ''),
        chain_id: chainId,
        zip,
        name_canonical: nameCanonical,
        address_canonical: addressCanonical,
        address_tokens: addressTokens(String(row.address_raw || row.address_canonical || '')),
      }
    })
    .filter((row) => row.chain_id && row.zip)

  const byChainZip = new Map()
  normalized.forEach((row) => {
    const key = `${row.chain_id}|${row.zip}`
    const existing = byChainZip.get(key) || []
    existing.push(row)
    byChainZip.set(key, existing)
  })

  return { records: normalized, byChainZip }
}

function syncSamvirkelagRulesToPublic() {
  if (!fs.existsSync(SAMVIRKELAG_RULES_PATH)) return
  const payload = fs.readFileSync(SAMVIRKELAG_RULES_PATH, 'utf8')
  atomicWriteFile(SAMVIRKELAG_RULES_PUBLIC_PATH, payload)
}

function classifySamvirkelag(details, report, references) {
  const { samvirkelagRules, nbasReference } = references
  const { name, samvirkelag: samvirkelagRaw, chain, address } = details
  const normalizedSamvirkelag = normalizeForCompare(samvirkelagRaw)

  if (
    normalizedSamvirkelag &&
    samvirkelagRules.samvirkelagWhitelistMap.has(normalizedSamvirkelag)
  ) {
    return {
      samvirkelag: samvirkelagRules.samvirkelagWhitelistMap.get(normalizedSamvirkelag),
      nbd_group: false,
    }
  }
  if (normalizedSamvirkelag === normalizeForCompare('NORSK BUTIKKDRIFT AS')) {
    return {
      samvirkelag: 'NORSK BUTIKKDRIFT AS',
      nbd_group: true,
    }
  }

  const normalizedChain = normalizeChainId(String(chain || '')) || inferChainFromName(name)
  const zip = extractZipFromAddress(address)
  if (!normalizedChain || !zip) {
    report.unmatched_total += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: false,
    }
  }

  const chainZipCandidates = nbasReference.byChainZip.get(`${normalizedChain}|${zip}`) || []
  if (!chainZipCandidates.length) {
    report.unmatched_total += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: false,
    }
  }

  const nameCanonical = canonicalizeStoreName(name)
  const addressCanonical = canonicalizeAddress(address)
  const scrapedAddressTokens = new Set(addressTokens(address))

  const exactNameCandidates = chainZipCandidates.filter(
    (candidate) => candidate.name_canonical && candidate.name_canonical === nameCanonical,
  )
  if (exactNameCandidates.length === 1) {
    report.matched_by_chain_zip_name += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: true,
    }
  }

  const exactAddressCandidates = chainZipCandidates.filter(
    (candidate) => candidate.address_canonical && candidate.address_canonical === addressCanonical,
  )
  if (exactAddressCandidates.length === 1) {
    report.matched_by_chain_zip_address += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: true,
    }
  }

  const prefixCandidates = chainZipCandidates.filter((candidate) => {
    if (!candidate.name_canonical || !nameCanonical) return false
    return (
      candidate.name_canonical.startsWith(nameCanonical) ||
      nameCanonical.startsWith(candidate.name_canonical)
    )
  })
  if (prefixCandidates.length === 1) {
    report.matched_by_name_prefix_fallback += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: true,
    }
  }

  let bestCandidate = null
  let bestScore = 0
  let duplicateBest = false
  chainZipCandidates.forEach((candidate) => {
    const score = candidate.address_tokens.reduce(
      (acc, token) => (scrapedAddressTokens.has(token) ? acc + 1 : acc),
      0,
    )
    if (score > bestScore) {
      bestScore = score
      bestCandidate = candidate
      duplicateBest = false
    } else if (score === bestScore && score > 0) {
      duplicateBest = true
    }
  })
  if (bestCandidate && bestScore >= 2 && !duplicateBest) {
    report.matched_by_address_token_fallback += 1
    return {
      samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
      nbd_group: true,
    }
  }

  report.ambiguous_unresolved += 1
  if (report.unresolved_samples.length < 20) {
    report.unresolved_samples.push({
      store: name,
      chain: normalizedChain,
      zip,
      address: address || '',
      candidate_count: chainZipCandidates.length,
      candidates: chainZipCandidates.slice(0, 5).map((candidate) => candidate.name_raw),
    })
  }
  return {
    samvirkelag: String(samvirkelagRaw || '').trim() || 'Ukjent',
    nbd_group: false,
  }
}

async function fetchHtml(url) {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'no,en;q=0.8',
      },
    },
    `store page request (${url})`,
  )
  return await response.text()
}

function parseJsonLd(html) {
  const matches = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
  ]
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
    } catch {
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
  } catch {
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

function extractFromApiPayload(payload) {
  if (payload && Array.isArray(payload.storeList)) return payload.storeList
  const candidates = []
  if (Array.isArray(payload)) return payload

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
  const chain =
    normalizeChainId(String(chainName)) ||
    normalizeChainId(String(theme)) ||
    normalizeChainId(String(name))
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

function dedupeStoresByUrl(stores) {
  const byUrl = new Map()
  stores.forEach((store) => {
    if (!store.url) return
    if (!byUrl.has(store.url)) byUrl.set(store.url, store)
  })
  return Array.from(byUrl.values()).sort((a, b) => a.url.localeCompare(b.url, 'nb'))
}

function toFeature(details, report, references) {
  const classified = classifySamvirkelag(details, report, references)
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
      samvirkelag: classified.samvirkelag,
      nbd_group: classified.nbd_group,
      source: details.url,
    },
  }
}

function extractStoreDetails(html, chainFallback) {
  const $ = cheerio.load(html)
  const name = cleanText($('h1').first().text()) || chainFallback.label
  const selectors = ['address', '[itemprop="address"]', '.store-address', '.address', '.dv.l9.eq']

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
  const latitude = jsonLd?.latitude ?? initialData?.latitude ?? googleCoords?.latitude ?? null
  const longitude = jsonLd?.longitude ?? initialData?.longitude ?? googleCoords?.longitude ?? null
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

function loadCache() {
  return safeReadJson(CACHE_PATH, {})
}

function sortAndDedupeFeatures(features) {
  const bySource = new Map()
  features.forEach((feature) => {
    const source = String(feature?.properties?.source || '')
    if (!source) return
    if (!bySource.has(source)) bySource.set(source, feature)
  })
  return Array.from(bySource.values()).sort((a, b) => {
    const sourceA = String(a?.properties?.source || '')
    const sourceB = String(b?.properties?.source || '')
    if (sourceA !== sourceB) return sourceA.localeCompare(sourceB, 'nb')
    const chainA = String(a?.properties?.chain || '')
    const chainB = String(b?.properties?.chain || '')
    if (chainA !== chainB) return chainA.localeCompare(chainB, 'nb')
    const nameA = String(a?.properties?.name || '')
    const nameB = String(b?.properties?.name || '')
    return nameA.localeCompare(nameB, 'nb')
  })
}

function buildApiUrl(url) {
  return url.includes('count=') ? url : `${url}&count=5000`
}

async function run() {
  syncSamvirkelagRulesToPublic()
  const samvirkelagRules = loadSamvirkelagRules()
  const nbasReference = loadNbasReference()
  const references = { samvirkelagRules, nbasReference }

  console.log('Fetching store list from API...')
  const apiResponse = await fetchWithRetry(
    buildApiUrl(COOP_API_URL),
    {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'no,en;q=0.8',
      },
    },
    'store list API request',
  )
  const payload = await apiResponse.json()
  const candidates = extractFromApiPayload(payload)

  const normalizedStores = dedupeStoresByUrl(
    candidates
      .map((item) => normalizeStoreFromApi(item))
      .filter((item) => item && item.chain && item.url),
  )

  const tasks = []
  let count = 0
  for (const store of normalizedStores) {
    count += 1
    if (MAX_STORES && count > MAX_STORES) break
    tasks.push(store)
  }

  console.log(`Processing ${tasks.length} store pages with concurrency ${CONCURRENCY}...`)

  const cache = loadCache()
  const features = []
  const matchReport = {
    matched_by_chain_zip_name: 0,
    matched_by_chain_zip_address: 0,
    matched_by_name_prefix_fallback: 0,
    matched_by_address_token_fallback: 0,
    ambiguous_unresolved: 0,
    unmatched_total: 0,
    unresolved_samples: [],
  }

  let cacheDirtyCount = 0
  let cacheWriteChain = Promise.resolve()
  const markCacheDirty = () => {
    cacheDirtyCount += 1
  }
  const persistCache = async (force = false) => {
    if (!force && cacheDirtyCount < CACHE_SAVE_EVERY) return
    cacheDirtyCount = 0
    cacheWriteChain = cacheWriteChain.then(() => {
      atomicWriteJson(CACHE_PATH, cache, 2)
    })
    await cacheWriteChain
  }

  let index = 0
  async function processNext() {
    if (index >= tasks.length) return
    const current = tasks[index]
    index += 1

    try {
      if (cache[current.url]) {
        const cachedFeature = cache[current.url]
        const props = cachedFeature?.properties || {}
        const coords = cachedFeature?.geometry?.coordinates || []
        const finalDetails = {
          name: String(props.name || current.name || ''),
          address: String(props.address || current.address || ''),
          chain: String(props.chain || current.chain || ''),
          samvirkelag: String(current.samvirkelag || props.samvirkelag || ''),
          url: String(props.source || current.url || ''),
          latitude: Number(coords[1]),
          longitude: Number(coords[0]),
        }
        const recalcFeature = toFeature(finalDetails, matchReport, references)
        cache[current.url] = recalcFeature
        markCacheDirty()
        features.push(recalcFeature)
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
          const feature = toFeature(finalDetails, matchReport, references)
          cache[current.url] = feature
          markCacheDirty()
          features.push(feature)
        }
        await sleep(REQUEST_DELAY_MS)
      }

      await persistCache(false)
    } catch (error) {
      console.warn(`Failed to process ${current.url}: ${error.message || error}`)
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (index < tasks.length) {
      await processNext()
      console.log(`Progress: ${features.length}/${tasks.length}`)
    }
  })
  await Promise.all(workers)
  await persistCache(true)

  const stableFeatures = sortAndDedupeFeatures(features)
  if (MIN_EXPECTED_STORES > 0 && stableFeatures.length < MIN_EXPECTED_STORES) {
    throw new Error(
      `Refusing to write coop store data. Expected at least ${MIN_EXPECTED_STORES} stores, got ${stableFeatures.length}.`,
    )
  }

  const geojson = {
    type: 'FeatureCollection',
    features: stableFeatures,
  }

  atomicWriteJson(OUTPUT_PATH, geojson)
  atomicWriteJson(MATCH_REPORT_PATH, matchReport, 2)
  console.log(`Wrote ${stableFeatures.length} Coop store features to ${OUTPUT_PATH}`)
  console.log(
    `Samvirkelag match report: chain+zip+name=${matchReport.matched_by_chain_zip_name}, chain+zip+address=${matchReport.matched_by_chain_zip_address}, namePrefix=${matchReport.matched_by_name_prefix_fallback}, addressTokens=${matchReport.matched_by_address_token_fallback}, ambiguous=${matchReport.ambiguous_unresolved}, unmatched=${matchReport.unmatched_total}`,
  )
}

module.exports = {
  classifySamvirkelag,
  extractFromApiPayload,
  dedupeStoresByUrl,
  loadNbasReference,
  loadSamvirkelagRules,
  normalizeStoreFromApi,
  readIntEnv,
  sortAndDedupeFeatures,
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
