import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import { normalizePostnummer } from './utils/postnummer'
import { gunzipSync } from 'fflate'
import Papa from 'papaparse'
import { saveAs } from 'file-saver'

type PostalGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { postnummer?: string }>
type PostalLabelGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, { postnummer?: string }>

type ImportSummary = {
  source: 'text' | 'csv'
  added: number
  invalid: number
  total: number
}

type CoopGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, {
  name?: string
  brand?: string
  address?: string
  chain?: string
  samvirkelag?: string
}>

type SamvirkelagRules = {
  norskButikkdriftLabel: string
  nbasStoreNames: string[]
  samvirkelagWhitelist: string[]
}

const DEFAULT_SAMVIRKELAG_RULES: SamvirkelagRules = {
  norskButikkdriftLabel: 'Norsk Butikkdrift',
  nbasStoreNames: [],
  samvirkelagWhitelist: [],
}

const NORSK_BUTIKKDRIFT_AS = 'NORSK BUTIKKDRIFT AS'
const NBD_ALL_VALUE = '__NBD_ALL__'
const NBD_CHILD_PREFIX = '__NBD_CHILD__::'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const NORWAY_CENTER: [number, number] = [10.7522, 59.9139]
const CHAIN_OPTIONS = [
  { id: 'prix', label: 'Coop Prix', color: '#f9da47' },
  { id: 'extra', label: 'Coop Extra', color: '#eb1907' },
  { id: 'mega', label: 'Coop Mega', color: '#164734' },
  { id: 'obs', label: 'Obs', color: '#004992' },
  { id: 'obsbygg', label: 'Obs Bygg', color: '#002855' },
]

const getChainLabel = (chainId: string) =>
  CHAIN_OPTIONS.find((option) => option.id === chainId)?.label || chainId

const CITY_LABELS: GeoJSON.FeatureCollection<GeoJSON.Point, { name: string }> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Oslo' },
      geometry: { type: 'Point', coordinates: [10.7522, 59.9139] },
    },
    {
      type: 'Feature',
      properties: { name: 'Bergen' },
      geometry: { type: 'Point', coordinates: [5.3221, 60.3913] },
    },
    {
      type: 'Feature',
      properties: { name: 'Stavanger' },
      geometry: { type: 'Point', coordinates: [5.7331, 58.9690] },
    },
    {
      type: 'Feature',
      properties: { name: 'Kristiansand' },
      geometry: { type: 'Point', coordinates: [7.9956, 58.1467] },
    },
    {
      type: 'Feature',
      properties: { name: 'Trondheim' },
      geometry: { type: 'Point', coordinates: [10.3951, 63.4305] },
    },
    {
      type: 'Feature',
      properties: { name: 'Tromsø' },
      geometry: { type: 'Point', coordinates: [18.9553, 69.6492] },
    },
  ],
}


async function loadPostalGeoJSON(): Promise<PostalGeoJSON> {
  const candidates = [
    '/postal-codes.dissolved.geojson.gz',
    '/postal-codes.dissolved.geojson',
    '/postal-codes.clipped.geojson.gz',
    '/postal-codes.clipped.geojson',
    '/postal-codes.geojson.gz',
    '/postal-codes.geojson',
  ]

  for (const url of candidates) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue

      if (url.endsWith('.gz')) {
        const buffer = await response.arrayBuffer()
        const decompressed = gunzipSync(new Uint8Array(buffer))
        const text = new TextDecoder().decode(decompressed)
        return JSON.parse(text) as PostalGeoJSON
      }

      return (await response.json()) as PostalGeoJSON
    } catch (error) {
      continue
    }
  }

  throw new Error('Unable to load postal GeoJSON data')
}

async function loadPostalLabelGeoJSON(): Promise<PostalLabelGeoJSON> {
  const candidates = [
    '/postal-codes.labels.geojson.gz',
    '/postal-codes.labels.geojson',
  ]

  for (const url of candidates) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue

      if (url.endsWith('.gz')) {
        const buffer = await response.arrayBuffer()
        const decompressed = gunzipSync(new Uint8Array(buffer))
        const text = new TextDecoder().decode(decompressed)
        return JSON.parse(text) as PostalLabelGeoJSON
      }

      return (await response.json()) as PostalLabelGeoJSON
    } catch (error) {
      continue
    }
  }

  throw new Error('Unable to load postal label data')
}

async function loadCoopStoresGeoJSON(): Promise<CoopGeoJSON> {
  const response = await fetch('/coop_stores.geojson')
  if (!response.ok) {
    throw new Error(`Coop stores data request failed (${response.status})`)
  }
  return (await response.json()) as CoopGeoJSON
}

async function loadSamvirkelagRules(): Promise<SamvirkelagRules> {
  try {
    const response = await fetch('/samvirkelag-rules.json')
    if (!response.ok) return DEFAULT_SAMVIRKELAG_RULES
    const parsed = (await response.json()) as Partial<SamvirkelagRules>
    return {
      norskButikkdriftLabel: parsed.norskButikkdriftLabel || DEFAULT_SAMVIRKELAG_RULES.norskButikkdriftLabel,
      nbasStoreNames: Array.isArray(parsed.nbasStoreNames) ? parsed.nbasStoreNames : [],
      samvirkelagWhitelist: Array.isArray(parsed.samvirkelagWhitelist) ? parsed.samvirkelagWhitelist : [],
    }
  } catch {
    return DEFAULT_SAMVIRKELAG_RULES
  }
}

function normalizeForCompare(value: string | undefined) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('nb-NO')
}

function stripDiacritics(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

function canonicalizeStoreName(value: string | undefined) {
  let next = normalizeForCompare(value)
  next = next.replace(/,\s*nbd[a-z0-9]*$/i, '')
  next = stripDiacritics(next)
  next = next
    .replace(/\bcoop\s+extra\b/g, 'extra')
    .replace(/\bcoop\s+mega\b/g, 'mega')
    .replace(/\bcoop\s+prix\b/g, 'prix')
    .replace(/\bcoop\s+obs\s+bygg\b/g, 'obs bygg')
    .replace(/\bcoop\s+obs\b/g, 'obs')
  next = next.replace(/[.,/\\-]/g, ' ')
  return next.replace(/\s+/g, ' ').trim()
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const validPostnummerSetRef = useRef<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const samvirkelagMenuRef = useRef<HTMLDivElement | null>(null)

  const [highlightedPostalcodes, setHighlightedPostalcodes] = useState<Set<string>>(new Set())
  const [isLoadingPostal, setIsLoadingPostal] = useState(true)
  const [postalLoadError, setPostalLoadError] = useState<string | null>(null)
  const [isLoadingCoop, setIsLoadingCoop] = useState(true)
  const [coopLoadError, setCoopLoadError] = useState<string | null>(null)

  const [postalInput, setPostalInput] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [activeChains, setActiveChains] = useState<Record<string, boolean>>(() => ({
    prix: true,
    extra: true,
    mega: true,
    obs: true,
    obsbygg: true,
  }))
  const [coopStores, setCoopStores] = useState<CoopGeoJSON | null>(null)
  const [samvirkelagRules, setSamvirkelagRules] = useState<SamvirkelagRules>(DEFAULT_SAMVIRKELAG_RULES)
  const [selectedSamvirkelag, setSelectedSamvirkelag] = useState('Alle')
  const [storeSearch, setStoreSearch] = useState('')
  const [samvirkelagSearch, setSamvirkelagSearch] = useState('')
  const [isSamvirkelagMenuOpen, setIsSamvirkelagMenuOpen] = useState(false)
  const [isNbdExpanded, setIsNbdExpanded] = useState(false)

  const highlightedCount = useMemo(() => highlightedPostalcodes.size, [highlightedPostalcodes])
  const normalizedWhitelistSet = useMemo(
    () => new Set(samvirkelagRules.samvirkelagWhitelist.map((value) => normalizeForCompare(value))),
    [samvirkelagRules.samvirkelagWhitelist],
  )
  const normalizedNbasNameSet = useMemo(
    () => new Set(samvirkelagRules.nbasStoreNames.map((value) => canonicalizeStoreName(value))),
    [samvirkelagRules.nbasStoreNames],
  )
  const normalizedNbdLabel = useMemo(
    () => normalizeForCompare(samvirkelagRules.norskButikkdriftLabel),
    [samvirkelagRules.norskButikkdriftLabel],
  )

  const isNbdStore = (props: CoopGeoJSON['features'][number]['properties']) => {
    const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
    const name = props?.name ? String(props.name) : ''
    const normalizedSamvirkelag = normalizeForCompare(samvirkelag)
    const normalizedName = canonicalizeStoreName(name)

    if (normalizedWhitelistSet.has(normalizedSamvirkelag)) return false
    if (normalizedSamvirkelag === normalizeForCompare(NORSK_BUTIKKDRIFT_AS)) return true
    if (normalizedSamvirkelag === normalizedNbdLabel) return true
    return normalizedNbasNameSet.has(normalizedName)
  }

  const matchesSelectedSamvirkelag = (props: CoopGeoJSON['features'][number]['properties']) => {
    if (selectedSamvirkelag === 'Alle') return true
    if (selectedSamvirkelag === NBD_ALL_VALUE) return isNbdStore(props)
    if (selectedSamvirkelag.startsWith(NBD_CHILD_PREFIX)) {
      const childValue = selectedSamvirkelag.slice(NBD_CHILD_PREFIX.length)
      const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
      return isNbdStore(props) && samvirkelag === childValue
    }
    const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
    return samvirkelag === selectedSamvirkelag
  }

  const samvirkelagMenuData = useMemo(() => {
    const allRegular = new Set<string>()
    const nbdChildren = new Set<string>()

    if (coopStores) {
      coopStores.features.forEach((feature) => {
        const props = feature.properties || {}
        const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''
        if (!samvirkelag) return

        if (isNbdStore(props)) {
          const normalizedSam = normalizeForCompare(samvirkelag)
          if (
            normalizedSam !== normalizeForCompare(NORSK_BUTIKKDRIFT_AS) &&
            normalizedSam !== normalizedNbdLabel
          ) {
            nbdChildren.add(samvirkelag)
          }
          return
        }

        allRegular.add(samvirkelag)
      })
    }

    const query = samvirkelagSearch.trim().toLowerCase()
    const regularOptions = Array.from(allRegular).sort((a, b) => a.localeCompare(b, 'nb'))
    const nbdChildOptions = Array.from(nbdChildren).sort((a, b) => a.localeCompare(b, 'nb'))

    if (!query) {
      return { regularOptions, nbdChildOptions }
    }

    const filteredRegular = regularOptions.filter((value) => value.toLowerCase().includes(query))
    const filteredChildren = nbdChildOptions.filter((value) => value.toLowerCase().includes(query))
    const parentMatches = samvirkelagRules.norskButikkdriftLabel.toLowerCase().includes(query)

    return {
      regularOptions: filteredRegular,
      nbdChildOptions: parentMatches ? nbdChildOptions : filteredChildren,
    }
  }, [coopStores, isNbdStore, normalizedNbdLabel, samvirkelagRules.norskButikkdriftLabel, samvirkelagSearch])

  const selectedSamvirkelagLabel = useMemo(() => {
    if (selectedSamvirkelag === 'Alle') return 'Alle'
    if (selectedSamvirkelag === NBD_ALL_VALUE) return samvirkelagRules.norskButikkdriftLabel
    if (selectedSamvirkelag.startsWith(NBD_CHILD_PREFIX)) {
      return `${samvirkelagRules.norskButikkdriftLabel} / ${selectedSamvirkelag.slice(NBD_CHILD_PREFIX.length)}`
    }
    return selectedSamvirkelag
  }, [samvirkelagRules.norskButikkdriftLabel, selectedSamvirkelag])

  const handleChainToggle = (chainId: string) => {
    setActiveChains((prev) => ({
      ...prev,
      [chainId]: !prev[chainId],
    }))
  }

  const mergePostalCodes = (rawValues: string[], source: ImportSummary['source'], totalRows = 0) => {
    const validSet = validPostnummerSetRef.current
    if (!validSet.size) {
      setImportSummary({ source, added: 0, invalid: rawValues.length, total: totalRows || rawValues.length })
      return
    }

    const uniqueValues = new Set<string>()
    const validCodes: string[] = []
    let invalidCount = 0

    rawValues.forEach((value) => {
      const normalized = normalizePostnummer(value)
      if (!normalized) {
        invalidCount += 1
        return
      }
      if (uniqueValues.has(normalized)) return
      uniqueValues.add(normalized)
      if (validSet.has(normalized)) {
        validCodes.push(normalized)
      } else {
        invalidCount += 1
      }
    })

    let addedCount = 0
    setHighlightedPostalcodes((prev) => {
      const next = new Set(prev)
      validCodes.forEach((code) => {
        if (!next.has(code)) {
          next.add(code)
          addedCount += 1
        }
      })
      return next
    })

    setImportSummary({
      source,
      added: addedCount,
      invalid: invalidCount,
      total: totalRows || rawValues.length,
    })
  }

  const handleApplyPostalInput = () => {
    const rawValues = postalInput
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)

    mergePostalCodes(rawValues, 'text')
  }

  const handleCsvFile = (file: File) => {
    const preferredHeaders = ['postnummer', 'postal_code', 'postcode', 'zip']

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result: Papa.ParseResult<Record<string, string>>) => {
        const originalFields = result.meta.fields || []
        const fields = originalFields.map((field: string) => field?.toLowerCase().trim() || '')
        const headerKey = preferredHeaders.find((candidate) => fields.includes(candidate))

        if (headerKey) {
          const originalKey = originalFields[fields.indexOf(headerKey)] || headerKey
          const values = (result.data as Record<string, string>[])
            .map((row) => row[originalKey])
            .filter(Boolean)
          mergePostalCodes(values, 'csv', result.data.length)
          return
        }

        Papa.parse(file, {
          header: false,
          skipEmptyLines: true,
          complete: (fallbackResult: Papa.ParseResult<unknown[]>) => {
            const values: string[] = []
            ;(fallbackResult.data as unknown[]).forEach((row) => {
              if (Array.isArray(row)) {
                row.forEach((cell) => values.push(String(cell)))
              } else if (row && typeof row === 'object') {
                Object.values(row as Record<string, unknown>).forEach((cell) => values.push(String(cell)))
              } else if (row) {
                values.push(String(row))
              }
            })
            mergePostalCodes(values, 'csv', fallbackResult.data.length)
          },
        })
      },
      error: () => {
        setImportSummary({ source: 'csv', added: 0, invalid: 0, total: 0 })
      },
    })
  }

  const handleCsvChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    handleCsvFile(file)
  }

  const handleClear = () => {
    setHighlightedPostalcodes(new Set())
    setImportSummary(null)
    setPostalInput('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDownload = () => {
    if (!highlightedPostalcodes.size) return
    const sorted = Array.from(highlightedPostalcodes).sort()
    const values = sorted.join(',')
    const csv = `\uFEFFpostnummer\n"${values}"`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    saveAs(blob, 'postnummer.csv')
  }

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: NORWAY_CENTER,
      zoom: 4.6,
      minZoom: 3,
      maxZoom: 14,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const handleResize = () => map.resize()
    window.addEventListener('resize', handleResize)

    map.on('load', async () => {
      setIsLoadingPostal(true)
      setPostalLoadError(null)
      setIsLoadingCoop(true)
      setCoopLoadError(null)

      const getWaterLayerId = () => {
        const layers = map.getStyle().layers ?? []
        const waterLayer = layers.find((layer) => {
          if (layer.type !== 'fill') return false
          const id = layer.id.toLowerCase()
          return id.includes('water') || id.includes('ocean') || id.includes('sea')
        })
        return waterLayer?.id
      }

      const waterLayerId = getWaterLayerId()

      try {
        if (!map.getSource('cityLabels')) {
          map.addSource('cityLabels', {
            type: 'geojson',
            data: CITY_LABELS,
          })
        }

        if (!map.getLayer('city-labels')) {
          map.addLayer({
            id: 'city-labels',
            type: 'symbol',
            source: 'cityLabels',
            minzoom: 4,
            layout: {
              'text-field': ['get', 'name'],
              'text-size': 14,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
              'text-offset': [0, 0.4],
            },
            paint: {
              'text-color': '#1f2a37',
              'text-halo-color': '#f8fafc',
              'text-halo-width': 1,
              'text-halo-blur': 0.6,
            },
          }, waterLayerId)
        }

        const data = await loadPostalGeoJSON()
        let labelData: PostalLabelGeoJSON | null = null
        try {
          labelData = await loadPostalLabelGeoJSON()
        } catch (error) {
          labelData = null
        }

        const validSet = new Set<string>()
        for (const feature of data.features ?? []) {
          const raw = feature.properties?.postnummer ?? ''
          const normalized = normalizePostnummer(String(raw))
          if (normalized) {
            validSet.add(normalized)
          }
        }
        validPostnummerSetRef.current = validSet

        if (!map.getSource('postalCodes')) {
          map.addSource('postalCodes', {
            type: 'geojson',
            data,
          })
        }

        if (!map.getSource('postalLabels') && labelData) {
          map.addSource('postalLabels', {
            type: 'geojson',
            data: labelData,
          })
        }

        if (!map.getLayer('postal-fill')) {
          map.addLayer({
            id: 'postal-fill',
            type: 'fill',
            source: 'postalCodes',
            paint: {
              'fill-color': '#8897a8',
              'fill-opacity': 0.25,
            },
          }, waterLayerId)
        }

        if (!map.getLayer('postal-outline')) {
          map.addLayer({
            id: 'postal-outline',
            type: 'line',
            source: 'postalCodes',
            paint: {
              'line-color': '#3a4451',
              'line-width': 0.6,
              'line-opacity': 0.7,
            },
          }, waterLayerId)
        }

        if (!map.getLayer('postal-highlight')) {
          map.addLayer({
            id: 'postal-highlight',
            type: 'fill',
            source: 'postalCodes',
            paint: {
              'fill-color': '#ffb347',
              'fill-opacity': 0.55,
            },
            filter: ['in', ['get', 'postnummer'], ['literal', []]],
          }, waterLayerId)
        }

        if (!map.getLayer('postal-labels')) {
          map.addLayer({
            id: 'postal-labels',
            type: 'symbol',
            source: labelData ? 'postalLabels' : 'postalCodes',
            minzoom: 6,
            layout: {
              'text-field': ['get', 'postnummer'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 9, 10, 12, 11],
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-optional': true,
              'text-padding': 6,
            },
            paint: {
              'text-color': '#111827',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
              'text-halo-blur': 1,
            },
          })
        }

        if (!map.getLayer('postal-labels-dense')) {
          map.addLayer({
            id: 'postal-labels-dense',
            type: 'symbol',
            source: labelData ? 'postalLabels' : 'postalCodes',
            minzoom: 12,
            layout: {
              'text-field': ['get', 'postnummer'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
              'text-padding': 2,
            },
            paint: {
              'text-color': '#111827',
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
              'text-halo-blur': 1,
            },
          })
        }

        if (map.getLayer('postal-labels')) {
          map.moveLayer('postal-labels')
        }
        if (map.getLayer('postal-labels-dense')) {
          map.moveLayer('postal-labels-dense')
        }

        map.on('mouseenter', 'postal-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'postal-fill', () => {
          map.getCanvas().style.cursor = ''
        })

        map.on('click', 'postal-fill', (event) => {
          const feature = event.features?.[0]
          const raw = feature?.properties?.postnummer
          const normalized = raw ? normalizePostnummer(String(raw)) : null
          if (!normalized) return

          setHighlightedPostalcodes((prev) => {
            const next = new Set(prev)
            if (next.has(normalized)) {
              next.delete(normalized)
            } else {
              next.add(normalized)
            }
            return next
          })
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error loading postal data'
        setPostalLoadError(message)
      } finally {
        setIsLoadingPostal(false)
      }

      try {
        const rules = await loadSamvirkelagRules()
        setSamvirkelagRules(rules)
        const coopData = await loadCoopStoresGeoJSON()
        setCoopStores(coopData)
        if (!map.getSource('coopPrixStores')) {
          map.addSource('coopPrixStores', {
            type: 'geojson',
            data: coopData,
          })
        }

        if (!map.getLayer('coop-pins')) {
          map.addLayer({
            id: 'coop-pins',
            type: 'circle',
            source: 'coopPrixStores',
            paint: {
              'circle-color': [
                'match',
                ['get', 'chain'],
                'prix',
                CHAIN_OPTIONS[0].color,
                'extra',
                CHAIN_OPTIONS[1].color,
                'mega',
                CHAIN_OPTIONS[2].color,
                'obs',
                CHAIN_OPTIONS[3].color,
                'obsbygg',
                CHAIN_OPTIONS[4].color,
                '#2563eb',
              ],
              'circle-radius': 5,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1,
            },
          })
        }

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })

        map.on('mouseenter', 'coop-pins', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'coop-pins', () => {
          map.getCanvas().style.cursor = ''
        })

        map.on('click', 'coop-pins', (event) => {
          const feature = event.features?.[0]
          const props = feature?.properties || {}
          const name = props.name ? String(props.name) : 'Coop Prix'
          const address = props.address ? String(props.address) : ''
          const chain = props.chain ? String(props.chain) : ''
          const chainLabel = chain ? getChainLabel(chain) : ''
          const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''
          const coordinates = (feature?.geometry as GeoJSON.Point | undefined)?.coordinates
          if (!coordinates) return

          const content = `
            <div style="font-family: 'Space Grotesk', sans-serif;">
              <strong>${name}</strong><br />
              ${address ? `<div>Adresse: ${address}</div>` : ''}
              ${chainLabel ? `<div>Kjede: ${chainLabel}</div>` : ''}
              ${samvirkelag ? `<div>Samvirkelag: ${samvirkelag}</div>` : ''}
            </div>
          `
          popup.setLngLat(coordinates as [number, number]).setHTML(content).addTo(map)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ukjent feil ved lasting av butikker'
        setCoopLoadError(message)
      } finally {
        setIsLoadingCoop(false)
      }
    })

    return () => {
      window.removeEventListener('resize', handleResize)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('postal-highlight')) return

    const values = Array.from(highlightedPostalcodes)
    map.setFilter('postal-highlight', ['in', ['get', 'postnummer'], ['literal', values]])
  }, [highlightedPostalcodes])

  useEffect(() => {
    if (!isSamvirkelagMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!samvirkelagMenuRef.current) return
      if (samvirkelagMenuRef.current.contains(event.target as Node)) return
      setIsSamvirkelagMenuOpen(false)
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isSamvirkelagMenuOpen])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('coop-pins')) return

    const baseData = coopStores
    if (!baseData) return

    const enabledChains = CHAIN_OPTIONS.filter((option) => activeChains[option.id]).map(
      (option) => option.id,
    )
    const searchLower = storeSearch.trim().toLowerCase()

    const filtered = baseData.features.filter((feature) => {
      const props = feature.properties || {}
      const chain = props.chain || ''
      const name = props.name || ''
      const address = props.address || ''

      if (enabledChains.length === 0) return false
      if (!enabledChains.includes(chain)) return false
      if (!matchesSelectedSamvirkelag(props)) return false
      if (searchLower) {
        const haystack = `${name} ${address}`.toLowerCase()
        if (!haystack.includes(searchLower)) return false
      }
      return true
    })

    const source = map.getSource('coopPrixStores')
    if (source && 'setData' in source) {
      ;(source as GeoJSONSource).setData({ type: 'FeatureCollection', features: filtered })
    }
  }, [activeChains, coopStores, matchesSelectedSamvirkelag, storeSearch])

  const storeSuggestions = useMemo(() => {
    const baseData = coopStores
    const query = storeSearch.trim().toLowerCase()
    if (!baseData || !query) return []

    const enabledChains = CHAIN_OPTIONS.filter((option) => activeChains[option.id]).map(
      (option) => option.id,
    )

    const matches = baseData.features.filter((feature) => {
      const props = feature.properties || {}
      const chain = props.chain || ''
      const name = props.name || ''
      const address = props.address || ''
      if (enabledChains.length && !enabledChains.includes(chain)) return false
      if (!matchesSelectedSamvirkelag(props)) return false
      const samvirkelag = props.samvirkelag || ''
      const haystack = `${name} ${address} ${samvirkelag}`.toLowerCase()
      return haystack.includes(query)
    })

    return matches.slice(0, 8)
  }, [activeChains, coopStores, matchesSelectedSamvirkelag, storeSearch])

  const handleSelectStore = (feature: CoopGeoJSON['features'][number]) => {
    const map = mapRef.current
    if (!map || feature.geometry.type !== 'Point') return
    const coords = feature.geometry.coordinates as [number, number]
    const props = feature.properties || {}
    const name = props.name ? String(props.name) : 'Butikk'
    const address = props.address ? String(props.address) : ''
    const chain = props.chain ? String(props.chain) : ''
    const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''

    map.flyTo({ center: coords, zoom: 14, speed: 1.2 })
    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords)
      .setHTML(
        `<div><strong>${name}</strong></div>` +
          (address ? `<div>${address}</div>` : '') +
          (chain ? `<div>Kjede: ${getChainLabel(chain)}</div>` : '') +
          (samvirkelag ? `<div>Samvirkelag: ${samvirkelag}</div>` : ''),
      )
      .addTo(map)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Norgeskart</h1>
          <p>Interaktivt postkodekart</p>
        </div>

        <div className="sidebar-section">
          <div className="stat">
            <span className="stat-label">Valgte soner</span>
            <span className="stat-value">{highlightedCount}</span>
          </div>
          <div className="status">
            {isLoadingPostal && <span>Laster postsoner...</span>}
            {postalLoadError && <span className="status-error">{postalLoadError}</span>}
          </div>
          <div className="status">
            {isLoadingCoop && <span>Laster butikker...</span>}
            {coopLoadError && <span className="status-error">{coopLoadError}</span>}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">Butikker</div>
          <div className="toggle-list">
            {CHAIN_OPTIONS.map((option) => (
              <label key={option.id} className="toggle-item">
                <input
                  type="checkbox"
                  checked={activeChains[option.id]}
                  onChange={() => handleChainToggle(option.id)}
                />
                <span className="toggle-swatch" style={{ backgroundColor: option.color }} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <label className="section-label" htmlFor="store-search">
            Søk i butikker
          </label>
          <div className="search-wrapper">
            <input
              id="store-search"
              className="select-input"
              type="text"
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
              placeholder="Søk på butikknavn eller adresse"
            />
            {storeSearch.trim() && (
              <div className="search-suggestions">
                {storeSuggestions.length === 0 && (
                  <div className="search-empty">Ingen treff.</div>
                )}
                {storeSuggestions.map((feature) => {
                  const props = feature.properties || {}
                  const name = props.name ? String(props.name) : 'Butikk'
                  const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''
                  const address = props.address ? String(props.address) : ''
                  const key = `${name}-${address}-${samvirkelag}`
                  return (
                    <button
                      key={key}
                      type="button"
                      className="search-card"
                      onClick={() => handleSelectStore(feature)}
                    >
                      <div className="search-card-title">{name}</div>
                      {samvirkelag && <div className="search-card-sub">Samvirkelag: {samvirkelag}</div>}
                      {address && <div className="search-card-sub">{address}</div>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <label className="section-label" htmlFor="samvirkelag-search">
            Samvirkelag
          </label>
          <div className="search-wrapper samvirkelag-menu" ref={samvirkelagMenuRef}>
            <input
              id="samvirkelag-search"
              className="select-input"
              type="text"
              value={samvirkelagSearch}
              onChange={(event) => setSamvirkelagSearch(event.target.value)}
              placeholder="Søk samvirkelag"
            />
            <button
              type="button"
              className="select-input samvirkelag-trigger"
              onClick={() => setIsSamvirkelagMenuOpen((prev) => !prev)}
            >
              <span>{selectedSamvirkelagLabel}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {isSamvirkelagMenuOpen && (
              <div className="samvirkelag-dropdown">
                <button
                  type="button"
                  className={`samvirkelag-option ${selectedSamvirkelag === 'Alle' ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSamvirkelag('Alle')
                    setIsSamvirkelagMenuOpen(false)
                  }}
                >
                  Alle
                </button>

                {samvirkelagMenuData.regularOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`samvirkelag-option ${selectedSamvirkelag === option ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSamvirkelag(option)
                      setIsSamvirkelagMenuOpen(false)
                    }}
                  >
                    {option}
                  </button>
                ))}

                {(samvirkelagMenuData.nbdChildOptions.length > 0 ||
                  samvirkelagRules.norskButikkdriftLabel.toLowerCase().includes(samvirkelagSearch.trim().toLowerCase())) && (
                  <div className="samvirkelag-group">
                    <button
                      type="button"
                      className={`samvirkelag-option samvirkelag-group-parent ${selectedSamvirkelag === NBD_ALL_VALUE ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedSamvirkelag(NBD_ALL_VALUE)
                        setIsNbdExpanded((prev) => !prev)
                      }}
                    >
                      <span>{samvirkelagRules.norskButikkdriftLabel}</span>
                      <span aria-hidden="true">{isNbdExpanded ? '▾' : '▸'}</span>
                    </button>
                    {isNbdExpanded && (
                      <div className="samvirkelag-group-children">
                        {samvirkelagMenuData.nbdChildOptions.map((option) => {
                          const value = `${NBD_CHILD_PREFIX}${option}`
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`samvirkelag-option samvirkelag-child ${selectedSamvirkelag === value ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedSamvirkelag(value)
                                setIsSamvirkelagMenuOpen(false)
                              }}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-section">
          <label className="section-label" htmlFor="postal-input">
            Legg til postkoder
          </label>
          <textarea
            id="postal-input"
            className="postal-input"
            rows={4}
            value={postalInput}
            onChange={(event) => setPostalInput(event.target.value)}
            placeholder="Eksempel: 0150, 0151, 0152"
          />
          <div className="helper-text">
            Du kan legge til komma eller linjeseparerte postkoder med 4 siffer.
          </div>
          <button className="primary-button" type="button" onClick={handleApplyPostalInput}>
            Legg til
          </button>
        </div>

        <div className="sidebar-section">
          <label className="section-label" htmlFor="csv-input">
            Importer CSV-fil
          </label>
          <input
            id="csv-input"
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvChange}
            className="file-input"
          />
          <div className="helper-text">
            Vi ser etter kolonner som heter postnummer, postal_code, postcode eller zip.
          </div>
        </div>

        {importSummary && (
          <div className="sidebar-section">
            <div className="summary-card">
              <div className="summary-title">
                {importSummary.source === 'text' ? 'Oppsummering (tekst)' : 'Oppsummering (CSV)'}
              </div>
              <div className="summary-row">
                <span>Lagt til</span>
                <strong>{importSummary.added}</strong>
              </div>
              <div className="summary-row">
                <span>Ugyldige</span>
                <strong>{importSummary.invalid}</strong>
              </div>
              <div className="summary-row">
                <span>Totalt</span>
                <strong>{importSummary.total}</strong>
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-section actions">
          <button className="secondary-button" type="button" onClick={handleClear}>
            Reset
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleDownload}
            disabled={!highlightedPostalcodes.size}
          >
            Last ned CSV
          </button>
        </div>

        <div className="sidebar-section">
          <p className="helper-text">
            Klikk på en postsone i kartet for å markere den.
          </p>
        </div>
      </aside>

      <main className="map-panel">
        <div ref={mapContainerRef} className="map-container" />
      </main>
    </div>
  )
}

export default App
