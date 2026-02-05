import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import { normalizePostnummer } from './utils/postnummer'
import { gunzipSync } from 'fflate'
import Papa from 'papaparse'
import { saveAs } from 'file-saver'

type PostalGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { postnummer?: string }>

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
}>

const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'
const NORWAY_CENTER: [number, number] = [10.7522, 59.9139]

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

async function loadCoopPrixGeoJSON(): Promise<CoopGeoJSON> {
  const response = await fetch('/coop_prix.geojson')
  if (!response.ok) {
    throw new Error(`Coop Prix data request failed (${response.status})`)
  }
  return (await response.json()) as CoopGeoJSON
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const validPostnummerSetRef = useRef<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [highlightedPostalcodes, setHighlightedPostalcodes] = useState<Set<string>>(new Set())
  const [isLoadingPostal, setIsLoadingPostal] = useState(true)
  const [postalLoadError, setPostalLoadError] = useState<string | null>(null)
  const [isLoadingCoop, setIsLoadingCoop] = useState(true)
  const [coopLoadError, setCoopLoadError] = useState<string | null>(null)

  const [postalInput, setPostalInput] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

  const highlightedCount = useMemo(() => highlightedPostalcodes.size, [highlightedPostalcodes])

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
    const csv = ['postnummer', ...sorted].join('\n')
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
          })
        }

        const data = await loadPostalGeoJSON()

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

        if (!map.getLayer('postal-fill')) {
          map.addLayer({
            id: 'postal-fill',
            type: 'fill',
            source: 'postalCodes',
            paint: {
              'fill-color': '#8897a8',
              'fill-opacity': 0.25,
            },
          })
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
          })
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
          })
        }

        if (!map.getLayer('postal-labels')) {
          map.addLayer({
            id: 'postal-labels',
            type: 'symbol',
            source: 'postalCodes',
            minzoom: 8,
            layout: {
              'text-field': ['get', 'postnummer'],
              'text-size': 11,
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
              'text-allow-overlap': false,
            },
            paint: {
              'text-color': '#111827',
              'text-halo-color': '#f8fafc',
              'text-halo-width': 1,
              'text-halo-blur': 0.6,
            },
          })
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
        const coopData = await loadCoopPrixGeoJSON()
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
              'circle-color': '#2563eb',
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
          const coordinates = (feature?.geometry as GeoJSON.Point | undefined)?.coordinates
          if (!coordinates) return

          const content = `
            <div style="font-family: 'Space Grotesk', sans-serif;">
              <strong>${name}</strong><br />
              ${address}
            </div>
          `
          popup.setLngLat(coordinates as [number, number]).setHTML(content).addTo(map)
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error loading Coop Prix data'
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Norgeskart</h1>
          <p>Interactive postal zone explorer</p>
        </div>

        <div className="sidebar-section">
          <div className="stat">
            <span className="stat-label">Highlighted zones</span>
            <span className="stat-value">{highlightedCount}</span>
          </div>
          <div className="status">
            {isLoadingPostal && <span>Loading postal zones...</span>}
            {!isLoadingPostal && !postalLoadError && (
              <span>{validPostnummerSetRef.current.size} postalcodes loaded</span>
            )}
            {postalLoadError && <span className="status-error">{postalLoadError}</span>}
          </div>
          <div className="status">
            {isLoadingCoop && <span>Loading Coop Prix stores...</span>}
            {!isLoadingCoop && !coopLoadError && <span>Coop Prix stores loaded</span>}
            {coopLoadError && <span className="status-error">{coopLoadError}</span>}
          </div>
        </div>

        <div className="sidebar-section">
          <label className="section-label" htmlFor="postal-input">
            Add postalcodes
          </label>
          <textarea
            id="postal-input"
            className="postal-input"
            rows={4}
            value={postalInput}
            onChange={(event) => setPostalInput(event.target.value)}
            placeholder="Example: 0150, 0151, 0152"
          />
          <div className="helper-text">
            You can paste comma- or line-separated 4-digit postalcodes.
          </div>
          <button className="primary-button" type="button" onClick={handleApplyPostalInput}>
            Apply
          </button>
        </div>

        <div className="sidebar-section">
          <label className="section-label" htmlFor="csv-input">
            Import CSV
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
            We look for columns named postnummer, postal_code, postcode, or zip.
          </div>
        </div>

        {importSummary && (
          <div className="sidebar-section">
            <div className="summary-card">
              <div className="summary-title">
                {importSummary.source === 'text' ? 'Text input summary' : 'CSV import summary'}
              </div>
              <div className="summary-row">
                <span>Added</span>
                <strong>{importSummary.added}</strong>
              </div>
              <div className="summary-row">
                <span>Invalid</span>
                <strong>{importSummary.invalid}</strong>
              </div>
              <div className="summary-row">
                <span>Total rows</span>
                <strong>{importSummary.total}</strong>
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-section actions">
          <button className="secondary-button" type="button" onClick={handleClear}>
            Clear
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleDownload}
            disabled={!highlightedPostalcodes.size}
          >
            Download CSV
          </button>
        </div>

        <div className="sidebar-section">
          <p className="helper-text">
            Click a postal zone on the map to toggle highlighting.
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
