import { gunzipSync } from 'fflate'

export type PostalGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Geometry, { postnummer?: string }>
export type PostalLabelGeoJSON = GeoJSON.FeatureCollection<GeoJSON.Point, { postnummer?: string }>

export type CoopGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  {
    name?: string
    brand?: string
    address?: string
    chain?: string
    samvirkelag?: string
    nbd_group?: boolean
    source?: string
  }
>

export type SamvirkelagRules = {
  norskButikkdriftLabel: string
  nbasStoreNames: string[]
  samvirkelagWhitelist: string[]
}

export const DEFAULT_SAMVIRKELAG_RULES: SamvirkelagRules = {
  norskButikkdriftLabel: 'Norsk Butikkdrift',
  nbasStoreNames: [],
  samvirkelagWhitelist: [],
}

async function loadGeoJsonFromCandidates<T>(candidates: string[]): Promise<T> {
  for (const url of candidates) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue

      if (url.endsWith('.gz')) {
        const buffer = await response.arrayBuffer()
        const decompressed = gunzipSync(new Uint8Array(buffer))
        const text = new TextDecoder().decode(decompressed)
        return JSON.parse(text) as T
      }

      return (await response.json()) as T
    } catch {
      continue
    }
  }

  throw new Error(`Unable to load data from candidates: ${candidates.join(', ')}`)
}

export async function loadPostalGeoJSON(): Promise<PostalGeoJSON> {
  return await loadGeoJsonFromCandidates<PostalGeoJSON>([
    '/postal-codes.dissolved.geojson.gz',
    '/postal-codes.dissolved.geojson',
    '/postal-codes.clipped.geojson.gz',
    '/postal-codes.clipped.geojson',
    '/postal-codes.geojson.gz',
    '/postal-codes.geojson',
  ])
}

export async function loadPostalLabelGeoJSON(): Promise<PostalLabelGeoJSON> {
  return await loadGeoJsonFromCandidates<PostalLabelGeoJSON>([
    '/postal-codes.labels.geojson.gz',
    '/postal-codes.labels.geojson',
  ])
}

export async function loadCoopStoresGeoJSON(): Promise<CoopGeoJSON> {
  const response = await fetch('/coop_stores.geojson')
  if (!response.ok) {
    throw new Error(`Coop stores data request failed (${response.status})`)
  }
  return (await response.json()) as CoopGeoJSON
}

export async function loadSamvirkelagRules(): Promise<SamvirkelagRules> {
  try {
    const response = await fetch('/samvirkelag-rules.json')
    if (!response.ok) return DEFAULT_SAMVIRKELAG_RULES
    const parsed = (await response.json()) as Partial<SamvirkelagRules>
    return {
      norskButikkdriftLabel:
        parsed.norskButikkdriftLabel || DEFAULT_SAMVIRKELAG_RULES.norskButikkdriftLabel,
      nbasStoreNames: Array.isArray(parsed.nbasStoreNames) ? parsed.nbasStoreNames : [],
      samvirkelagWhitelist: Array.isArray(parsed.samvirkelagWhitelist)
        ? parsed.samvirkelagWhitelist
        : [],
    }
  } catch {
    return DEFAULT_SAMVIRKELAG_RULES
  }
}
